import { test, expect } from '@playwright/test';
import { SITE, REDIRECT_FROM, finding } from './helpers.js';

/**
 * LESSON 3 — The `request` fixture is an HTTP client that shares config with the browser.
 * It is MUCH faster than opening pages when you only care about status codes / headers.
 */
test.describe('Crawlability & technical SEO', () => {
  test('robots.txt exists and references the sitemap', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    if (!/sitemap:/i.test(body)) finding('medium', 'robots.txt has no Sitemap: directive');
    // Only the `User-agent: *` group matters for "is the whole site blocked?" (a BadBot group is fine).
    const starGroup = body.split(/^\s*User-agent:/im).find((g) => /^\s*\*/.test(g)) || '';
    if (/^\s*Disallow:\s*\/\s*$/m.test(starGroup)) finding('high', 'robots.txt disallows the whole site for all crawlers');
    const staleRules = (body.match(/Disallow:\s*\/20\d\d\//g) || []).length;
    if (staleRules) finding('low', `robots.txt carries ${staleRules} legacy /20xx/ Disallow rules (clean-up candidate)`);
    finding('info', `robots.txt has ${body.split('\n').length} lines`);
    expect.soft(body).toMatch(/sitemap:/i);
  });

  test('sitemap.xml is valid and every URL returns 200', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].trim());
    expect(urls.length).toBeGreaterThan(0);
    finding('info', `sitemap lists ${urls.length} URLs`);

    const lastmods = [...xml.matchAll(/<lastmod>(.*?)<\/lastmod>/g)].map((m) => m[1]);
    const newest = lastmods.sort().pop();
    if (newest && Date.now() - new Date(newest).getTime() > 365 * 864e5) finding('medium', `sitemap <lastmod> is stale (newest ${newest})`);

    const bad = [];
    await Promise.all(urls.map(async (u) => {
      const r = await request.get(u, { maxRedirects: 0 }).catch(() => null);
      if (!r || r.status() !== 200) bad.push(`${r?.status() ?? 'ERR'} ${u}`);
    }));
    bad.forEach((b) => finding('high', `Sitemap URL not 200: ${b}`));
    expect.soft(bad, 'sitemap URLs not returning 200').toEqual([]);
  });

  test('http → https and non-www → www redirect correctly', async ({ request }) => {
    test.skip(!REDIRECT_FROM.length, 'redirect test not applicable (local site)');
    for (const from of REDIRECT_FROM) {
      const r = await request.get(from, { maxRedirects: 0 });
      const loc = r.headers()['location'] || '';
      const ok = [301, 308].includes(r.status()) && loc.startsWith(SITE);
      if (!ok) finding('medium', `${from} → ${r.status()} ${loc || '(no redirect)'} (expected 301 to ${SITE})`);
      else finding('info', `${from} → ${r.status()} ${loc}`);
      expect.soft(ok, `${from} should 301 to canonical host`).toBe(true);
    }
  });

  test('unknown URL returns a real 404 (not soft-404)', async ({ request }) => {
    const r = await request.get('/this-page-does-not-exist-xyz.html');
    if (r.status() !== 404) finding('high', `Missing page returned ${r.status()} instead of 404`);
    expect(r.status()).toBe(404);
  });

  test('security & performance headers', async ({ request }) => {
    const h = (await request.get('/')).headers();
    const want = ['strict-transport-security', 'x-content-type-options', 'x-frame-options', 'content-security-policy', 'referrer-policy'];
    want.filter((k) => !h[k]).forEach((k) => finding('low', `Missing response header: ${k}`));
    if (!/gzip|br/.test(h['content-encoding'] || '')) finding('medium', 'HTML not compressed (no gzip/br content-encoding)');
    if (!h['cache-control']) finding('low', 'HTML has no Cache-Control header');
    finding('info', `server=${h['server']}, encoding=${h['content-encoding']}, cache=${h['cache-control']}`);
  });

  test('internal + external links on homepage are not broken', async ({ page, request }) => {
    await page.goto('/');
    const hrefs = await page.$$eval('a[href]', (as) => [...new Set(as.map((a) => a.href))]);
    const links = hrefs.filter((h) => /^https?:/.test(h)).map((h) => h.split('#')[0]);
    const unique = [...new Set(links)];
    const broken = [];
    // Chunks of 8 so we don't hammer the server.
    for (let i = 0; i < unique.length; i += 8) {
      await Promise.all(unique.slice(i, i + 8).map(async (url) => {
        try {
          const r = await request.get(url, { timeout: 20000, headers: { 'user-agent': 'Mozilla/5.0 SEO-Audit' } });
          const internal = url.startsWith(SITE);
          // External sites often block bots (403/429/999) — only flag clear 404/410/5xx.
          if (r.status() === 404 || r.status() === 410 || r.status() >= 500 || (internal && r.status() >= 400)) broken.push(`${r.status()} ${url}`);
        } catch (e) { broken.push(`ERR ${url} (${e.message.split('\n')[0]})`); }
      }));
    }
    broken.forEach((b) => finding('high', `Broken link on homepage: ${b}`));
    finding('info', `checked ${unique.length} unique links on homepage`);
    expect.soft(broken).toEqual([]);

    const tracked = hrefs.filter((h) => h.includes('utm_') && h.startsWith(SITE));
    if (tracked.length) finding('low', `Internal links carry utm_ params (can create duplicate URLs / pollute analytics): ${tracked.join(', ')}`);
    const nofollowless = (await page.$$eval('a[target="_blank"]', (as) => as.filter((a) => !/noopener/.test(a.rel)).length));
    if (nofollowless) finding('low', `${nofollowless} target=_blank links missing rel="noopener"`);
  });
});
