import { defineConfig, devices, type Project } from '@playwright/test';

const chrome157Path = process.env.CHROME_157_PATH;
const baseURL = 'http://127.0.0.1:4173';

const projects: Project[] = [
  {
    name: 'dom',
    testMatch: /dom\.spec\.ts/,
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    },
  },
];

if (chrome157Path) {
  projects.push({
    name: 'canvas',
    testMatch: /canvas\.spec\.ts/,
    use: {
      ...devices['Desktop Chrome'],
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      launchOptions: {
        executablePath: chrome157Path,
      },
    },
  });
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  use: {
    baseURL,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects,
});
