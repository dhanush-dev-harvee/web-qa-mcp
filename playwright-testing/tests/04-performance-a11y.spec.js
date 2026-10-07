import { test, expect } from '@playwright/test';
import { finding, KEY_PAGES } from './helpers.js';

/**
 * LESSON 4 — Browser performance APIs + accessibility checks.
 * We read Core Web Vitals via PerformanceObserver / Navigation Timing inside the page.
 * (Numbers vary with your network; treat them as a lab indication, not as Lighthouse.)
 */

test.describe('Performance (lab metrics)', () => {
  for (const path of KEY_PAGES) {
    test(`web vitals ${path}`, async ({ page }) => {
      let bytes = 0, requests = 0;
      page.on('response', async (r) => { requests++; bytes += Number(r.headers()['content-length'] || 0); });

      // Inject observers BEFORE any page script runs.
      await page.addInitScript(() => {
        window.__vitals = { lcp: 0, cls: 0 };
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__vitals.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__vitals.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      });

      await page.goto(path, { waitUntil: 'load' });
      await page.waitForTimeout(2500); // let LCP/CLS settle
      const m = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        const imgs = [...document.images];
        return {
          ttfb: nav.responseStart, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd,
          lcp: window.__vitals.lcp, cls: window.__vitals.cls,
          domNodes: document.getElementsByTagName('*').length,
          lazyImgs: imgs.filter((i) => i.loading === 'lazy').length, totalImgs: imgs.length,
          renderBlockingCss: [...document.querySelectorAll('link[rel=stylesheet]')].length,
        };
      });

      const r = (n) => Math.round(n);
      finding('info', `${path}: TTFB ${r(m.ttfb)}ms · LCP ${r(m.lcp)}ms · CLS ${m.cls.toFixed(3)} · load ${r(m.load)}ms · ${requests} requests · DOM ${m.domNodes} nodes`);
      if (m.lcp > 2500) finding(m.lcp > 4000 ? 'high' : 'medium', `${path}: LCP ${r(m.lcp)}ms (good ≤ 2500ms)`);
      if (m.cls > 0.1) finding(m.cls > 0.25 ? 'high' : 'medium', `${path}: CLS ${m.cls.toFixed(3)} (good ≤ 0.1)`);
      if (m.ttfb > 800) finding('medium', `${path}: TTFB ${r(m.ttfb)}ms (good ≤ 800ms)`);
      if (m.domNodes > 1500) finding('low', `${path}: large DOM (${m.domNodes} nodes)`);
      if (m.totalImgs > 5 && m.lazyImgs === 0) finding('low', `${path}: ${m.totalImgs} images, none lazy-loaded`);

      expect.soft(m.lcp, 'LCP').toBeLessThan(4000);
      expect.soft(m.cls, 'CLS').toBeLessThan(0.25);
    });
  }
});

test.describe('Accessibility basics', () => {
  for (const path of KEY_PAGES) {
    test(`a11y ${path}`, async ({ page }) => {
      await page.goto(path);
      const r = await page.evaluate(() => {
        const unlabeledInputs = [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter((el) => !(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.placeholder)).length;
        const noNameButtons = [...document.querySelectorAll('button')].filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label')).length;
        const vagueLinks = [...document.querySelectorAll('a')].filter((a) => /^(click here|read more|learn more|more)$/i.test(a.textContent.trim())).length;
        return { unlabeledInputs, noNameButtons, vagueLinks, hasMain: !!document.querySelector('main,[role=main]'), hasSkip: !!document.querySelector('a[href^="#"][class*=skip]'), zoomBlocked: /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(document.querySelector('meta[name=viewport]')?.content || '') };
      });
      if (r.unlabeledInputs) finding('medium', `${path}: ${r.unlabeledInputs} form fields without label/aria-label`);
      if (r.noNameButtons) finding('medium', `${path}: ${r.noNameButtons} buttons with no accessible name`);
      if (r.vagueLinks) finding('low', `${path}: ${r.vagueLinks} links with vague text ("Learn more"/"Read more") — bad for SEO anchor text and a11y`);
      if (!r.hasMain) finding('low', `${path}: no <main> landmark`);
      if (r.zoomBlocked) finding('medium', `${path}: viewport blocks pinch-zoom`);

      // Keyboard test: Tab should move focus to a real element.
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.tagName);
      expect.soft(focused, 'first Tab lands on an interactive element').not.toBe('BODY');
      expect.soft(r.unlabeledInputs + r.noNameButtons, 'unnamed controls').toBe(0);
    });
  }
});
