import { chromium } from 'playwright';
import { execSync, spawn } from 'child_process';
import { resolve } from 'path';

const STYLES = ['emoji', 'grouped', 'minimal'] as const;
const PORT_BASE = 7690;
const SAMPLE_DIR = resolve(import.meta.dirname, '..');

async function screenshotStyle(style: string, port: number): Promise<void> {
  const ttyd = spawn('ttyd', [
    '--port', String(port),
    'npx', 'tsx', 'src/demo-tools.ts', style,
  ], { cwd: SAMPLE_DIR, stdio: 'ignore' });

  await new Promise((r) => setTimeout(r, 1500));

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

  const outPath = resolve(SAMPLE_DIR, 'screenshots', `tool-display-${style}.png`);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`Saved: ${outPath}`);

  await browser.close();
  ttyd.kill();
  await new Promise((r) => setTimeout(r, 300));
}

async function main() {
  for (let i = 0; i < STYLES.length; i++) {
    const style = STYLES[i];
    console.log(`Screenshotting ${style}...`);
    await screenshotStyle(style, PORT_BASE + i);
  }
  console.log('Done!');
}

main();
