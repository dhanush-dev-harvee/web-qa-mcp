import { test, expect, devices } from '@playwright/test';
import { finding, SITE, SCREENS, RESPONSIVE_PAGES, CONTACT_PATH } from './helpers.js';
import path from 'node:path';

/**
 * LESSON 5 — Driving the page like a human. `page.mouse` moves a REAL pointer: hover menus fire,
 * the wheel scrolls and lazy-loaded images load. Run with HEADED=1 SLOWMO=400 to watch it.
 *
 * Locator tips (preferred order): getByRole > getByLabel > getByText > CSS. Locators auto-wait
 * and retry, so you almost never need sleep().
 */
test.describe('User journeys (mouse + keyboard)', () => {
  test('mouse scrolls the whole homepage and lazy images load', async ({ page, isMobile }) => {
    await page.goto('/');
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.mouse.move(400, 400);
    for (let y = 0; y < height; y += 600) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(isMobile ? 80 : 120);
    }
    const broken = await page.$$eval('img', (imgs) => imgs.filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:')).map((i) => i.src));
    broken.forEach((b) => finding('high', `Broken image after scrolling: ${b}`));
    expect.soft(broken, 'images that failed to render').toEqual([]);
    await page.screenshot({ path: path.join(SCREENS, 'home-bottom.png') });
  });

  test('desktop nav: hover + click through to a service page', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop-only (hover menus)');
    await page.goto('/');
    // Harvee's navbar class first; any other site falls back to the first <nav> in the header/page.
    const nav = (await page.locator('nav.harvee-navbar').count()) ? page.locator('nav.harvee-navbar') : page.locator('header nav, nav').first();
    await expect(nav).toBeVisible();

    const links = nav.getByRole('link');
    const n = await links.count();
    for (let i = 0; i < Math.min(n, 8); i++) {
      const box = await links.nth(i).boundingBox();
      if (box && box.width > 0) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 }); // smooth, human-like
    }
    await page.getByRole('link', { name: /about/i }).first().click();
    await expect(page).toHaveURL(/about-us/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(new URL(SITE).host.replace(/\./g, '\\.') + '/?$'));
  });

  test('mobile menu opens and shows links', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile-only');
    await page.goto('/');
    const toggler = page.getByRole('button', { name: /toggle navigation/i });
    if (!(await toggler.count())) { finding('info', 'No Bootstrap-style "toggle navigation" button; mobile menu not verified'); test.skip(true, 'no standard mobile toggler'); }
    await expect(toggler).toBeVisible();
    await toggler.tap();
    await expect(page.locator('#navbarNav')).toBeVisible();
  });

  test('contact form: validation blocks empty + bad input (no submission is made)', async ({ page }) => {
    await page.goto(CONTACT_PATH);
    // Harvee's form first; any other site: first form that has an email field.
    const form = (await page.locator('#bookanappointment').count()) ? page.locator('#bookanappointment')
      : page.locator('form').filter({ has: page.locator('input[type=email], input[name*=mail i]') }).first();
    if (!(await form.count())) { finding('info', `No form with an email field on ${CONTACT_PATH}`); test.skip(true, 'no form on this page'); }
    await form.scrollIntoViewIfNeeded();

    // Make sure we NEVER actually post anything to the target site.
    let posted = false;
    await page.route('**/*', (route) => {
      const r = route.request();
      if (r.method() === 'POST' && r.url().startsWith(SITE)) { posted = true; return route.abort(); }
      return route.continue();
    });

    const submit = form.locator('#bookappbtn, [type=submit], button').first();
    const email = form.locator('#email, input[type=email], input[name*=mail i]').first();
    const name = form.locator('#name, input[name*=name i]').first();
    const phone = form.locator('#phone, input[type=tel], input[name*=phone i]').first();

    await submit.click();                                            // empty submit
    const invalidEmpty = await form.evaluate((f) => f.querySelectorAll(':invalid').length);
    expect(invalidEmpty, 'required fields flagged').toBeGreaterThan(0);

    if (await name.count()) await name.fill('Playwright Test');
    await email.fill('not-an-email');
    if (await phone.count()) await phone.fill('abc');
    await submit.click();
    const emailInvalid = await email.evaluate((e) => !e.validity.valid);
    expect(emailInvalid, 'bad email rejected by the browser').toBe(true);
    if ((await phone.count()) && !(await phone.evaluate((e) => !e.validity.valid))) finding('low', 'Phone field accepts letters (no pattern validation)');

    expect(posted, 'invalid form must not be sent').toBe(false);
    const hasCaptcha = await page.locator('iframe[src*="recaptcha"], .g-recaptcha, [data-sitekey], .cf-turnstile').count();
    if (!hasCaptcha) finding('low', 'Contact form has no CAPTCHA/honeypot visible — spam risk');
  });

  test('contact CTAs: tel, mailto and WhatsApp links are well-formed', async ({ page }) => {
    await page.goto('/');
    const href = async (sel) => ((await page.locator(sel).count()) ? page.locator(sel).first().getAttribute('href') : null);
    const tel = await href('a[href^="tel:"]'), mail = await href('a[href^="mailto:"]'), wa = await href('a[href*="whatsapp"], a[href*="wa.me"]');
    // A missing CTA is reported as a finding; a malformed one fails the test.
    if (!tel) finding('low', 'No tel: link on the homepage'); else expect(tel).toMatch(/^tel:\+?[\d\s-]{10,}/);
    if (!mail) finding('info', 'No mailto: link on the homepage'); else expect(mail).toMatch(/^mailto:.+@.+\..+/);
    if (!wa) finding('info', 'No WhatsApp link on the homepage'); else expect(wa).toMatch(/phone=|wa\.me\//);
  });

  test('keyboard-only: Tab through the first 15 stops, focus is always visible-ish', async ({ page, isMobile }) => {
    test.skip(isMobile, 'keyboard N/A on touch');
    await page.goto('/');
    const stops = [];
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      stops.push(await page.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return `${a.tagName}:${(a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 25)}|outline=${cs.outlineStyle}`; }));
    }
    finding('info', `Tab order: ${stops.join(' → ')}`);
    const noOutline = stops.filter((s) => s.endsWith('outline=none')).length;
    if (noOutline > 5) finding('low', `${noOutline}/15 focusable elements have outline:none (check a visible focus style exists)`);
  });
});

/** Responsive layout: same page, three viewports. */
const VIEWPORTS = { mobile: { width: 375, height: 812 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1440, height: 900 } };
test.describe('Responsive layout', () => {
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    for (const pagePath of RESPONSIVE_PAGES) {
      test(`${name} ${pagePath}: no horizontal scroll`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: vp });   // new isolated "incognito" profile per viewport
        const page = await ctx.newPage();
        await page.goto(pagePath);
        await page.waitForTimeout(800);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (overflow > 1) finding('medium', `${name} ${pagePath}: page overflows horizontally by ${overflow}px`);
        const tiny = await page.evaluate(() => [...document.querySelectorAll('a,button')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24) && getComputedStyle(e).visibility !== 'hidden'; }).length);
        if (name === 'mobile' && tiny > 5) finding('low', `mobile ${pagePath}: ${tiny} tap targets smaller than 24px`);
        await page.screenshot({ path: path.join(SCREENS, `${name}${pagePath.replace(/\W+/g, '_')}.png`), fullPage: true });
        await ctx.close();
        expect.soft(overflow, 'horizontal overflow px').toBeLessThanOrEqual(1);
      });
    }
  }
});
