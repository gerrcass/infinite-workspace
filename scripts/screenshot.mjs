import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const port = Number(process.env.SCREENSHOT_PORT ?? 4174);
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${port}`;
const chromePath = process.env.CHROME_157_PATH;

async function waitForServer(url, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Preview server did not start at ${url}`);
}

async function capture() {
  mkdirSync('assets', { recursive: true });

  try {
    execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
  } catch {
    throw new Error('Build failed; screenshot was not captured.');
  }

  const server = spawn(
    'npm',
    ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { stdio: 'ignore' },
  );

  try {
    await waitForServer(baseURL);

    const browser = await chromium.launch({
      executablePath: chromePath,
      headless: true,
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
      deviceScaleFactor: 2,
      reducedMotion: 'no-preference',
      colorScheme: 'light',
    });

    await page.goto(`${baseURL}/?render=canvas`);
    await page.waitForFunction(() => document.querySelectorAll('.card').length === 216);
    const badge = page.locator('[data-testid="renderer-badge"]');
    await badge.waitFor();
    if ((await badge.textContent())?.trim() !== 'Canvas') {
      throw new Error(
        'The canvas renderer is not active. Set CHROME_157_PATH to Chrome 157+ before taking screenshots.',
      );
    }

    // Dismiss the first-run tip so the board reads cleanly, then clear selection.
    const hint = page.locator('[data-testid="find-hint"]');
    await hint.waitFor({ state: 'visible', timeout: 2500 }).catch(() => undefined);
    if (await hint.isVisible().catch(() => false)) {
      await hint.getByRole('button', { name: 'Dismiss find tip' }).click();
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'assets/screenshot.png', scale: 'css' });

    // A second image proves the headline: native find selects live card text
    // and the camera reveals the match.
    await page.evaluate(() => {
      window.find('The needle in the interviews');
    });
    await page.waitForTimeout(650);
    await page.screenshot({ path: 'assets/selection-reveal.png', scale: 'css' });

    await browser.close();
    console.log('Wrote assets/screenshot.png and assets/selection-reveal.png');
  } finally {
    server.kill('SIGTERM');
  }
}

capture().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
