import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { resolve } from 'path';

const SAMPLE_DIR = resolve(import.meta.dirname, '..');
const SCREENSHOTS_DIR = resolve(SAMPLE_DIR, 'screenshots');
const PORT_BASE = 7750;

async function captureDemo(name: string, script: string, args: string[], port: number): Promise<void> {
  const ttyd = spawn('ttyd', [
    '--port', String(port), '--writable',
    'npx', 'tsx', script, ...args,
  ], { cwd: SAMPLE_DIR, stdio: 'ignore' });

  await new Promise((r) => setTimeout(r, 3000));

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({
    viewport: { width: 540, height: 360 },
    deviceScaleFactor: 2,
  });
  await page.goto(`http://localhost:${port}`);
  await page.waitForTimeout(8000);

  const outPath = resolve(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`  saved ${name}.png`);

  await browser.close();
  ttyd.kill();
  await new Promise((r) => setTimeout(r, 1000));
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

  console.log('\nDone! 6 screenshots generated.');
}

main();
