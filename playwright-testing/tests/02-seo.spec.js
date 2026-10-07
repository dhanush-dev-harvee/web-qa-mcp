import { test, expect } from '@playwright/test';
import { PAGES, SITE, finding } from './helpers.js';

/**
 * LESSON 2 — Reading the DOM. page.evaluate() runs JS INSIDE the browser and returns plain data
 * to Node. We pull everything SEO-relevant in one round trip, then assert in Node.
 */
async function collectSeo(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const attr = (s, a) => q(s)?.getAttribute(a)?.trim() || '';
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({
      level: Number(h.tagName[1]),
      text: h.textContent.trim().replace(/\s+/g, ' '),
    }));
    const imgs = [...document.querySelectorAll('img')];
    const jsonld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => {
      try { return { ok: true, type: JSON.parse(s.textContent)['@type'] ?? JSON.parse(s.textContent)['@graph']?.map((g) => g['@type']) }; }
      catch { return { ok: false }; }
    });
    const words = document.body.innerText.split(/\s+/).filter(Boolean).length;
    return {
      title: document.title.trim(),
      description: attr('meta[name="description"]', 'content'),
      canonical: attr('link[rel="canonical"]', 'href'),
      robots: attr('meta[name="robots"]', 'content'),
      lang: document.documentElement.lang,
      viewport: attr('meta[name="viewport"]', 'content'),
      og: { title: attr('meta[property="og:title"]', 'content'), image: attr('meta[property="og:image"]', 'content'), url: attr('meta[property="og:url"]', 'content') },
      twitterCard: attr('meta[name="twitter:card"]', 'content'),
      headings,
      imagesTotal: imgs.length,
      imagesNoAlt: imgs.filter((i) => !i.hasAttribute('alt')).map((i) => i.currentSrc || i.src),
      imagesEmptyAlt: imgs.filter((i) => i.getAttribute('alt') === '').length,
      imagesNoDims: imgs.filter((i) => !(i.getAttribute('width') && i.getAttribute('height'))).length,
      jsonld,
      words,
      linksNoText: [...document.querySelectorAll('a[href]')].filter((a) => !a.textContent.trim() && !a.getAttribute('aria-label') && !a.querySelector('img[alt]')).length,
    };
  });
}


test.describe('SEO on-page audit', () => {
  for (const path of PAGES) {
    test(`on-page SEO ${path}`, async ({ page }) => {
      await page.goto(path);
      const s = await collectSeo(page);
      const h1s = s.headings.filter((h) => h.level === 1);

      // ---- Title
      expect.soft(s.title.length, `title present`).toBeGreaterThan(0);
      if (s.title.length > 60) finding('low', `${path}: title is ${s.title.length} chars (>60, may truncate in Google): "${s.title}"`);
      if (s.title.length < 30) finding('low', `${path}: title only ${s.title.length} chars`);
      expect.soft(s.title.length, 'title <= 60 chars').toBeLessThanOrEqual(60);

      // ---- Meta description
      if (!s.description) finding('high', `${path}: missing meta description`);
      else if (s.description.length > 160) finding('low', `${path}: meta description ${s.description.length} chars (>160)`);
      else if (s.description.length < 70) finding('low', `${path}: meta description short (${s.description.length})`);
      expect.soft(s.description, 'meta description').not.toBe('');

      // ---- H1
      if (h1s.length === 0) finding('high', `${path}: no <h1>`);
      if (h1s.length > 1) finding('medium', `${path}: ${h1s.length} <h1> tags (${h1s.map((h) => `"${h.text.slice(0, 40)}"`).join(', ')})`);
      expect.soft(h1s.length, 'exactly one h1').toBe(1);

      // ---- Heading order (no skipped levels)
      for (let i = 1; i < s.headings.length; i++) {
        if (s.headings[i].level - s.headings[i - 1].level > 1) {
          finding('low', `${path}: heading jumps h${s.headings[i - 1].level} → h${s.headings[i].level} ("${s.headings[i].text.slice(0, 40)}")`);
          break;
        }
      }

      // ---- Canonical
      if (!s.canonical) finding('high', `${path}: missing canonical`);
      else if (!s.canonical.startsWith(SITE)) finding('medium', `${path}: canonical points elsewhere → ${s.canonical}`);
      expect.soft(s.canonical, 'canonical').not.toBe('');

      // ---- Indexing / basics
      if (/noindex/i.test(s.robots)) finding('high', `${path}: meta robots = "${s.robots}" (page blocked from index)`);
      if (!s.lang) finding('medium', `${path}: <html lang> missing`);
      if (!s.viewport) finding('high', `${path}: no viewport meta (not mobile friendly)`);

      // ---- Social
      if (!s.og.title || !s.og.image) finding('low', `${path}: incomplete Open Graph tags`);
      if (!s.twitterCard) finding('low', `${path}: no twitter:card meta`);

      // ---- Images
      if (s.imagesNoAlt.length) finding('medium', `${path}: ${s.imagesNoAlt.length}/${s.imagesTotal} images missing alt attribute`);
      if (s.imagesNoDims > 0) finding('low', `${path}: ${s.imagesNoDims} images without width/height (layout shift risk)`);
      expect.soft(s.imagesNoAlt, 'images without alt').toEqual([]);

      // ---- Structured data
      if (!s.jsonld.length) finding('medium', `${path}: no JSON-LD structured data`);
      if (s.jsonld.some((j) => !j.ok)) finding('high', `${path}: invalid JSON-LD`);

      // ---- Content depth / links
      if (s.words < 300) finding('medium', `${path}: thin content (${s.words} words)`);
      if (s.linksNoText) finding('low', `${path}: ${s.linksNoText} links with no accessible text`);
      finding('info', `${path}: ${s.words} words, ${s.imagesTotal} images, schema: ${JSON.stringify(s.jsonld.map((j) => j.type))}`);
    });
  }

  // Independent test (no shared state): fetch every page's HTML over HTTP and compare.
  test('cross-page: duplicate titles / descriptions / h1', async ({ request }) => {
    const seoByPage = {};
    await Promise.all(PAGES.map(async (p) => {
      const html = await (await request.get(p)).text();
      const pick = (re) => (html.match(re)?.[1] || '').replace(/\s+/g, ' ').trim();
      seoByPage[p] = {
        title: pick(/<title[^>]*>([\s\S]*?)<\/title>/i),
        description: pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i),
        headings: [{ level: 1, text: pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, '') }],
      };
    }));
    const dupes = (key) => {
      const seen = {};
      for (const [p, s] of Object.entries(seoByPage)) {
        const v = (typeof key === 'function' ? key(s) : s[key]).toLowerCase();
        if (v) (seen[v] ||= []).push(p);
      }
      return Object.entries(seen).filter(([, ps]) => ps.length > 1);
    };
    for (const [label, key] of [['title', 'title'], ['meta description', 'description'], ['h1', (s) => s.headings.find((h) => h.level === 1)?.text || '']]) {
      const d = dupes(key);
      d.forEach(([v, ps]) => finding('high', `Duplicate ${label} on ${ps.join(', ')}: "${v.slice(0, 70)}"`));
      expect.soft(d, `duplicate ${label}`).toEqual([]);
    }
  });
});
