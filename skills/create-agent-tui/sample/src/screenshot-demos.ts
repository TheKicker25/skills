import { chromium } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import { resolve } from 'path';

const SAMPLE_DIR = resolve(import.meta.dirname, '..');
const SCREENSHOTS_DIR = resolve(SAMPLE_DIR, 'screenshots');
const PORT_BASE = 7690;

function startTtyd(script: string, args: string[], port: number): ChildProcess {
  return spawn('ttyd', [
    '--port', String(port), '--writable',
    'npx', 'tsx', script, ...args,
  ], { cwd: SAMPLE_DIR, stdio: 'ignore' });
}

async function screenshot(name: string, port: number): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  await page.goto(`http://localhost:${port}`);
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    document.body.style.background = '#1a1b26';
    const term = document.querySelector('.xterm') as HTMLElement;
    if (term) term.style.padding = '16px';
  });
  await page.waitForTimeout(500);

  const outPath = resolve(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`  saved ${name}.png`);
  await browser.close();
}

async function captureDemo(name: string, script: string, args: string[], port: number): Promise<void> {
  const ttyd = startTtyd(script, args, port);
  await new Promise((r) => setTimeout(r, 1500));

  try {
    await screenshot(name, port);
  } finally {
    ttyd.kill();
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function main() {
  const TOOL_STYLES = ['emoji', 'grouped', 'minimal'] as const;
  const INPUT_STYLES = ['block', 'bordered', 'plain'] as const;

  console.log('Tool display styles:');
  for (let i = 0; i < TOOL_STYLES.length; i++) {
    const style = TOOL_STYLES[i];
    process.stdout.write(`  capturing ${style}...`);
    await captureDemo(`tool-display-${style}`, 'src/demo-tools.ts', [style], PORT_BASE + i);
  }

  console.log('\nInput styles:');
  for (let i = 0; i < INPUT_STYLES.length; i++) {
    const style = INPUT_STYLES[i];
    process.stdout.write(`  capturing ${style}...`);
    await captureDemo(`input-style-${style}`, 'src/demo-input.ts', [style], PORT_BASE + 10 + i);
  }

  const LOADER_STYLES = ['gradient', 'spinner', 'minimal'] as const;

  console.log('\nLoader styles:');
  for (let i = 0; i < LOADER_STYLES.length; i++) {
    const style = LOADER_STYLES[i];
    process.stdout.write(`  capturing ${style}...`);
    await captureDemo(`loader-${style}`, 'src/demo-loader.ts', [style], PORT_BASE + 20 + i);
  }

  console.log('\nDone! 9 screenshots generated.');
}

main();
