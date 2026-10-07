import { test, expect } from '@playwright/test';
import { PAGES, finding, THIRD_PARTY } from './helpers.js';

/**
 * LESSON 1 — The smallest useful test: "does the page load cleanly?"
 *   - test.describe groups tests.
 *   - We generate one test per page with a plain JS loop (data-driven testing).
 *   - page.on('console'|'requestfailed') are EVENT LISTENERS: they let us observe what the
 *     browser does while the page loads, not just what ends up on screen.
 *   - expect.soft() records a failure but keeps running, so one run reports ALL problems.
 */
test.describe('Smoke: every page loads cleanly', () => {
  for (const path of PAGES) {
    test(`loads ${path}`, async ({ page }) => {
      const consoleErrors = [];
      const failedRequests = [];

      page.on('console', (msg) => {
        if (msg.type() === 'error' && !THIRD_PARTY.test(msg.location().url || '') && !/requestStorageAccess/.test(msg.text())) {
          consoleErrors.push(msg.text());
        }
      });
      page.on('pageerror', (err) => consoleErrors.push(`Uncaught: ${err.message}`));
      page.on('requestfailed', (req) => {
        // ERR_ABORTED = the browser cancelled it (analytics beacons on navigation) — not a site bug.
        if (!THIRD_PARTY.test(req.url()) && req.failure()?.errorText !== 'net::ERR_ABORTED') failedRequests.push(`${req.url()} (${req.failure()?.errorText})`);
      });
      page.on('response', (res) => {
        if (res.status() >= 400 && !THIRD_PARTY.test(res.url())) failedRequests.push(`${res.status()} ${res.url()}`);
      });

      const response = await page.goto(path, { waitUntil: 'load' });

      expect(response?.status(), 'HTTP status of the document').toBeLessThan(400);
      await expect(page).toHaveTitle(/.+/);
      await expect(page.locator('body')).toBeVisible();

      expect.soft(consoleErrors, 'console errors').toEqual([]);
      expect.soft(failedRequests, 'failed/4xx/5xx sub-requests').toEqual([]);

      consoleErrors.forEach((e) => finding('medium', `Console error on ${path}: ${e.slice(0, 160)}`));
      failedRequests.forEach((r) => finding('medium', `Broken resource on ${path}: ${r}`));
    });
  }
});
