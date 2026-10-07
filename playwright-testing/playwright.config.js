// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * LEARNING NOTES
 * - testDir      : where Playwright looks for *.spec.js files
 * - projects     : one "project" = one browser/device profile. Every test runs once per project.
 * - reporter     : list = live console output, html = clickable report, json = raw data,
 *                  ./reporters/summary-reporter.js = OUR custom Markdown report generator.
 * - use.baseURL  : lets tests call page.goto('/about-us.html') instead of the full URL.
 * - HEADED=1     : run `set HEADED=1` (cmd) / `$env:HEADED=1` (PowerShell) to WATCH the mouse move.
 * - SLOWMO=300   : slow every action by 300 ms so you can follow along.
 */
const headed = !!process.env.HEADED;
const slowMo = Number(process.env.SLOWMO || 0);

// Target + output folder can be overridden (Web QA Studio / MCP do this). Defaults = original behaviour.
//   PW_BASE_URL, PW_OUT_DIR, PW_RETRIES, PW_WORKERS  (see tests/helpers.js for PW_PAGES_FILE)
const BASE_URL = (process.env.PW_BASE_URL || 'https://www.harveedesigns.com').replace(/\/$/, '');
const OUT = process.env.PW_OUT_DIR || 'reports';
const custom = !!process.env.PW_OUT_DIR;
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(BASE_URL);

// Heavy "audit" specs only need ONE browser. Cross-browser projects run just smoke + interaction.
const lightOnly = /0[15]-.*\.spec\.js/;

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.PW_RETRIES !== undefined ? Number(process.env.PW_RETRIES) : process.env.CI ? 2 : 1, // 1 retry smooths over network flakiness on a live site
  workers: Number(process.env.PW_WORKERS) || (process.env.CI ? 1 : 4),
  outputDir: custom ? `${OUT}/test-results` : './test-results',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: custom ? `${OUT}/playwright-report` : 'playwright-report' }],
    ['json', { outputFile: `${OUT}/results.json` }],
    ['./reporters/summary-reporter.js'],
  ],
  use: {
    baseURL: BASE_URL,
    headless: !headed,
    launchOptions: { slowMo },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: isLocal,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: lightOnly },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: lightOnly },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] }, testMatch: lightOnly },
  ],
});
