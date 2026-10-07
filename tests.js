// Generic web-app checks. Nothing here is site-specific: per-site settings live in profiles/<name>.json
import { chromium, firefox, webkit } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import os from 'node:os';
import { spawn } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
// When run straight from GitHub (npx), the package lives in a temporary npm cache folder. Reports and saved
// profiles must go somewhere permanent instead: ~/web-qa-results and ~/.web-qa/profiles.
const INSTALLED = /[\\/]node_modules[\\/]|[\\/]_npx[\\/]/.test(HERE);
const BUNDLED_PROFILES = path.join(HERE, 'profiles');
export const PROFILE_DIR = path.resolve(process.env.WEBQA_PROFILE_DIR || (INSTALLED ? path.join(os.homedir(), '.web-qa', 'profiles') : BUNDLED_PROFILES));
export const OUT_DIR = path.resolve(process.env.WEBQA_OUT_DIR || (INSTALLED ? path.join(os.homedir(), 'web-qa-results') : path.join(HERE, 'results')));
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(PROFILE_DIR, { recursive: true });

export const VIEWPORTS = {
  mobile: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};
const engines = { chromium, firefox, webkit };
export const res = (name, status, details = '', cat = '') => ({ name, status, details, cat });

// ---------- profiles ----------
const profileDirs = () => [...new Set([PROFILE_DIR, BUNDLED_PROFILES])];   // your saved profiles first, then the ones shipped with the package
export function listProfiles() {
  const names = new Set();
  for (const d of profileDirs()) if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (f.endsWith('.json') && !f.startsWith('_')) names.add(f.slice(0, -5));
  return [...names].sort();
}
export function loadProfile(name) {
  if (!name) return {};
  const f = profileDirs().map((d) => path.join(d, `${name}.json`)).find((p) => fs.existsSync(p));
  if (!f) throw new Error(`Profile "${name}" not found. Available: ${listProfiles().join(', ') || '(none)'}`);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
export function saveProfile(name, data) {
  fs.writeFileSync(path.join(PROFILE_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}
// Merge profile + explicit args -> one config. Explicit args win.
export function resolve(args = {}) {
  const p = loadProfile(args.profile);
  const url = args.url || p.baseUrl;
  if (!url) throw new Error('Provide `url` or a `profile` that has baseUrl.');
  return { ...p, ...Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined)), url };
}
export const abs = (base, p) => new URL(p, base).toString();

// ---------- browser ----------
async function login(page, a) {
  const u = process.env[a.userEnv], pw = process.env[a.passEnv];
  if (!u || !pw) throw new Error(`Login needs env vars ${a.userEnv} and ${a.passEnv} set in the MCP server env.`);
  await page.goto(abs(a.baseUrl, a.loginUrl), { waitUntil: 'domcontentloaded' });
  await page.fill(a.userSelector, u);
  await page.fill(a.passSelector, pw);
  await page.click(a.submitSelector);
  await page.waitForLoadState('networkidle').catch(() => {});
}

// First run on a new machine: download the browser automatically (progress goes to stderr, never stdout, so MCP stays valid).
const installing = {};
export function ensureBrowser(name = 'chromium') {
  try { if (fs.existsSync(engines[name].executablePath())) return Promise.resolve(); } catch { /* not installed */ }
  installing[name] ||= new Promise((ok) => {
    process.stderr.write(`[web-qa] installing the ${name} browser (first run only, about 1-2 minutes)...\n`);
    const cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
    const p = spawn(process.execPath, [cli, 'install', name], { stdio: ['ignore', 2, 2] });
    p.on('close', ok); p.on('error', ok);
  });
  return installing[name];
}

export async function withPage(cfg, fn) {
  await ensureBrowser(cfg.browser || 'chromium');
  const b = await engines[cfg.browser || 'chromium'].launch({ headless: !cfg.headed, slowMo: cfg.headed ? 150 : 0 });
  cfg.tracker?.push(b);   // lets runSuite close this browser if the check times out or the user cancels
  const ctxOpts = { viewport: VIEWPORTS[cfg.viewport] || VIEWPORTS.desktop, ignoreHTTPSErrors: true };
  if (cfg.storageState && fs.existsSync(cfg.storageState)) ctxOpts.storageState = cfg.storageState;
  const ctx = await b.newContext(ctxOpts);
  if (cfg.headed) { // on-screen narration so you can watch what is being tested
    await ctx.addInitScript((label) => {
      const add = () => {
        if (document.getElementById('__qa_banner') || !document.body) return;
        const d = document.createElement('div');
        d.id = '__qa_banner';
        d.textContent = 'QA TEST RUNNING: ' + label;
        d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#111;color:#4ade80;font:bold 13px monospace;padding:6px 12px;text-align:center;pointer-events:none';
        document.body.appendChild(d);
      };
      document.addEventListener('DOMContentLoaded', add);
      setInterval(add, 500);
    }, cfg.suiteName || 'checks');
  }
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  try {
    if (cfg.auth && !cfg.storageState) await login(page, { baseUrl: cfg.url, ...cfg.auth });
    return await fn(page, ctx);
  } finally {
    if (cfg.runDir && cfg.evidence) { // screenshot evidence for the report
      try {
        const f = `${slug(cfg.url)}-${cfg.suiteName || 'page'}-${cfg.viewport || 'desktop'}.png`;
        await page.screenshot({ path: path.join(cfg.runDir, 'shots', f), fullPage: false });
        cfg.evidence.push({ file: `shots/${f}`, viewport: cfg.viewport || 'desktop', url: page.url() });
      } catch { /* page may be closed */ }
    }
    await b.close();
  }
}
const slug = (u) => u.replace(/^https?:\/\//, '').replace(/\W+/g, '_').slice(0, 60);

// Every run gets its own folder: results/<host>/<timestamp>-<kind>/ (report.html, report.md, report.json, shots/)
export function newRun(url, kind = 'run') {
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const dir = path.join(OUT_DIR, new URL(url).hostname.replace(/\W+/g, '_'), `${ts}-${kind}`);
  fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });
  return dir;
}
export const go = (page, url, wait = 'domcontentloaded') => page.goto(url, { waitUntil: wait, timeout: 60000 });
export const matches = (s, pats = []) => pats.some((p) => new RegExp(p, 'i').test(s));

// ---------- checks (all take a resolved cfg) ----------
export async function pageLoad(cfg) {
  return withPage(cfg, async (page) => {
    const t0 = Date.now();
    const r = await go(page, cfg.url, 'load').catch((e) => ({ err: e.message }));
    if (!r || r.err) return [res('Page loads', 'fail', r?.err || 'no response')];
    const ms = Date.now() - t0, budget = cfg.loadBudgetMs || 3000;
    return [
      res('HTTP status', r.status() < 400 ? 'pass' : 'fail', `${r.status()} ${cfg.url}`),
      res('Load time', ms < budget ? 'pass' : ms < budget * 2 ? 'warn' : 'fail', `${ms} ms (budget ${budget})`),
      res('HTTPS', cfg.url.startsWith('https') || /localhost|127\.0\.0\.1/.test(cfg.url) ? 'pass' : 'warn'),
    ];
  });
}

export async function seoMeta(cfg) {
  return withPage(cfg, async (page) => {
    await go(page, cfg.url);
    const d = await page.evaluate(() => ({
      title: document.title,
      desc: document.querySelector('meta[name=description]')?.content || '',
      canonical: document.querySelector('link[rel=canonical]')?.href || '',
      viewport: !!document.querySelector('meta[name=viewport]'),
      lang: document.documentElement.lang,
      h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
      og: !!document.querySelector('meta[property="og:title"]'),
      ld: document.querySelectorAll('script[type="application/ld+json"]').length,
      noindex: /noindex/i.test(document.querySelector('meta[name=robots]')?.content || ''),
    }));
    const L = (s, min, max) => (!s ? 'fail' : s.length < min || s.length > max ? 'warn' : 'pass');
    return [
      res('Title', L(d.title, 20, 70), `"${d.title}" (${d.title.length})`),
      res('Meta description', L(d.desc, 70, 160), `${d.desc.length} chars`),
      res('Canonical', d.canonical ? 'pass' : 'warn', d.canonical || 'missing'),
      res('Exactly one H1', d.h1.length === 1 ? 'pass' : 'fail', `${d.h1.length}: ${d.h1.join(' | ').slice(0, 100)}`),
      res('Viewport meta', d.viewport ? 'pass' : 'fail'),
      res('html lang', d.lang ? 'pass' : 'warn', d.lang),
      res('Open Graph', d.og ? 'pass' : 'warn'),
      res('JSON-LD', d.ld ? 'pass' : 'warn', `${d.ld} block(s)`),
      res('Not noindex', d.noindex ? (cfg.allowNoindex ? 'warn' : 'fail') : 'pass'),
    ];
  });
}

export async function consoleErrors(cfg) {
  return withPage(cfg, async (page) => {
    const errs = [], failed = [], ign = cfg.ignoreConsole;
    page.on('console', (m) => m.type() === 'error' && !matches(m.text(), ign) && errs.push(m.text().slice(0, 160)));
    page.on('pageerror', (e) => !matches(e.message, ign) && errs.push('pageerror: ' + e.message.slice(0, 160)));
    page.on('requestfailed', (r) => !matches(r.url(), ign) && failed.push(`${r.url().slice(0, 100)} (${r.failure()?.errorText})`));
    page.on('response', (r) => r.status() >= 400 && !matches(r.url(), ign) && failed.push(`${r.status()} ${r.url().slice(0, 100)}`));
    await go(page, cfg.url, 'networkidle').catch(() => {});
    return [
      res('No JS console errors', errs.length ? 'fail' : 'pass', errs.slice(0, 8).join('\n')),
      res('No failed requests', failed.length ? 'warn' : 'pass', failed.slice(0, 8).join('\n')),
    ];
  });
}

export async function images(cfg) {
  return withPage(cfg, async (page) => {
    await go(page, cfg.url, 'load');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);
    const d = await page.evaluate(() => {
      const i = [...document.images];
      return {
        total: i.length,
        noAlt: i.filter((x) => !x.hasAttribute('alt')).map((x) => x.src.slice(-60)),
        broken: i.filter((x) => x.complete && x.naturalWidth === 0 && x.src).map((x) => x.src.slice(-60)),
      };
    });
    return [
      res('Images have alt', d.noAlt.length ? 'warn' : 'pass', `${d.noAlt.length}/${d.total} missing ${d.noAlt.slice(0, 4).join(', ')}`),
      res('No broken images', d.broken.length ? 'fail' : 'pass', d.broken.slice(0, 5).join(', ')),
    ];
  });
}

export async function accessibility(cfg) {
  return withPage(cfg, async (page) => {
    await go(page, cfg.url, 'load');
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const r = await page.evaluate(() => axe.run(document, { resultTypes: ['violations'] }));
    const serious = r.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    return [
      res('No serious/critical a11y violations', serious.length ? 'fail' : 'pass',
        serious.slice(0, 6).map((v) => `${v.id} (${v.nodes.length}): ${v.help}`).join('\n')),
      res('Minor/moderate a11y issues', r.violations.length > serious.length ? 'warn' : 'pass',
        `${r.violations.length - serious.length} rule(s)`),
    ];
  });
}

export async function navigation(cfg) {
  return withPage(cfg, async (page) => {
    await go(page, cfg.url);
    const nav = page.locator(cfg.navSelector || 'nav a[href], header a[href]');
    const n = await nav.count();
    const out = [res('Nav links present', n > 0 ? 'pass' : 'warn', `${n} links`)];
    const origin = new URL(cfg.url).origin;
    const hrefs = await nav.evaluateAll((els) => [...new Set(els.map((e) => e.href))]);
    const targets = hrefs.filter((h) => h.startsWith(origin) && !h.includes('#') && !matches(h, cfg.skipLinks)).slice(0, cfg.maxNav || 15);
    const bad = [];
    for (const h of targets) {
      const r = await go(page, h).catch(() => null);
      if (!r || r.status() >= 400) bad.push(`${r?.status() ?? 'ERR'} ${h}`);
    }
    out.push(res(`Nav pages reachable (${targets.length})`, bad.length ? 'fail' : 'pass', bad.join('\n')));
    return out;
  });
}

export async function brokenLinks(cfg) {
  return withPage(cfg, async (page, ctx) => {
    await go(page, cfg.url);
    const links = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => /^https?:/.test(h)))]);
    const todo = links.filter((l) => !matches(l, cfg.skipLinks)).slice(0, cfg.maxLinks || 60);
    const bad = [], cache = cfg.linkCache || new Map();   // cache: header/footer links repeat on every page, check each URL once per run
    const check = async (l) => {
      if (!cache.has(l)) cache.set(l, (async () => {
        try {
          let r = await ctx.request.head(l, { timeout: 8000, failOnStatusCode: false });
          if (r.status() >= 400) r = await ctx.request.get(l, { timeout: 8000, failOnStatusCode: false });
          return r.status() >= 400 && ![401, 403, 429, 999].includes(r.status()) ? `${r.status()} ${l}` : null;
        } catch (e) { return `ERR ${l} (${e.message.slice(0, 40)})`; }
      })());
      const out = await cache.get(l); if (out) bad.push(out);
    };
    const queue = [...todo];                                // 8 requests in parallel instead of one at a time
    await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) await check(queue.shift()); }));
    return [res(`Links OK (${todo.length}/${links.length} checked)`, bad.length ? 'fail' : 'pass', bad.join('\n'))];
  });
}

// Detects the first form (or cfg.form.selector). Validation only unless submit=true.
export async function forms(cfg) {
  return withPage(cfg, async (page) => {
    await go(page, cfg.url);
    const sel = cfg.form?.selector || 'form:has(input:not([type=hidden]):not([type=search]), textarea)';
    const form = page.locator(sel).first();
    if (!(await form.count())) return [res('Form found', 'warn', 'no form on this page')];
    const out = [res('Form found', 'pass')];
    const submit = form.locator('[type=submit], button:not([type=button])').first();
    await submit.scrollIntoViewIfNeeded().catch(() => {});
    await submit.click().catch(() => {});
    await page.waitForTimeout(500);
    const invalid = await form.evaluate((f) => f.querySelectorAll(':invalid').length);
    out.push(res('Empty submit blocked', invalid > 0 ? 'pass' : 'warn', `${invalid} invalid field(s)`));
    const email = form.locator('input[type=email]').first();
    if (await email.count()) {
      await email.fill('not-an-email');
      out.push(res('Invalid email rejected', (await email.evaluate((e) => !e.validity.valid)) ? 'pass' : 'fail'));
      await email.fill(cfg.form?.testEmail || 'qa.test@example.com');
    }
    if (cfg.submit) {
      const data = { text: 'QA Tester', tel: '9876543210', textarea: 'Automated test - please ignore', ...cfg.form?.data };
      for (const el of await form.locator('input:not([type=hidden]):not([type=submit]):not([type=checkbox]):not([type=radio]), textarea').all()) {
        const t = (await el.getAttribute('type')) || 'text';
        if (t === 'email' || (await el.inputValue())) continue;
        const tag = await el.evaluate((e) => e.tagName.toLowerCase());
        await el.fill(tag === 'textarea' ? data.textarea : t === 'tel' ? data.tel : t === 'number' ? '1' : data.text).catch(() => {});
      }
      for (const s of await form.locator('select').all()) await s.selectOption({ index: 1 }).catch(() => {});
      for (const c of await form.locator('input[type=checkbox][required]').all()) await c.check().catch(() => {});
      await submit.click();
      await page.waitForTimeout(3500);
      const ok = cfg.form?.successText ? await page.getByText(new RegExp(cfg.form.successText, 'i')).count() : 1;
      out.push(res('Form submitted', ok ? 'pass' : 'fail', `now at ${page.url()}`));
    }
    return out;
  });
}

export async function responsive(cfg) {
  const out = [];
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    await withPage({ ...cfg, viewport: name }, async (page) => {
      await go(page, cfg.url, 'load');
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      out.push(res(`No horizontal scroll @ ${name} ${vp.width}px`, o > 2 ? 'fail' : 'pass', o > 2 ? `overflow ${o}px` : ''));
    });
  }
  return out;
}

export async function screenshot(cfg) {
  const files = [];
  for (const name of cfg.viewports || Object.keys(VIEWPORTS)) {
    await withPage({ ...cfg, viewport: name }, async (page) => {
      await go(page, cfg.url, 'networkidle').catch(() => {});
      const f = path.join(OUT_DIR, `${new URL(cfg.url).hostname}${new URL(cfg.url).pathname.replace(/\W+/g, '_')}-${name}-${Date.now()}.png`);
      await page.screenshot({ path: f, fullPage: true });
      files.push(f);
    });
  }
  return files;
}

// ---------- page discovery ----------
export async function discoverPages(cfg, limit = 50) {
  const origin = new URL(cfg.url).origin, found = new Set([cfg.url]);
  try {
    const r = await fetch(abs(cfg.url, '/sitemap.xml'));
    if (r.ok) {
      let xml = await r.text();
      const subs = [...xml.matchAll(/<loc>([^<]+\.xml)<\/loc>/g)].map((m) => m[1]);
      for (const s of subs.slice(0, 5)) xml += await fetch(s).then((x) => x.text()).catch(() => '');
      for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) if (!m[1].endsWith('.xml')) found.add(m[1]);
    }
  } catch { /* no sitemap */ }
  if (found.size < 5) { // fall back to crawling nav links on the home page
    await withPage(cfg, async (page) => {
      await go(page, cfg.url);
      const l = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href));
      l.filter((h) => h.startsWith(origin) && !h.includes('#')).forEach((h) => found.add(h.split('?')[0]));
    });
  }
  return [...found].filter((u) => !matches(u, cfg.skipLinks)).slice(0, limit);
}

// ---------- custom flows (app-specific journeys as data) ----------
export async function runFlow(cfg, steps) {
  return withPage(cfg, async (page) => {
    const out = [];
    for (const [i, s] of steps.entries()) {
      const label = `${i + 1}. ${s.action}${s.selector ? ' ' + s.selector : ''}${s.url ? ' ' + s.url : ''}`;
      try {
        if (s.action === 'goto') await go(page, abs(cfg.url, s.url || '/'), 'load');
        else if (s.action === 'click') await page.locator(s.selector).first().click();
        else if (s.action === 'fill') await page.locator(s.selector).first().fill(s.value ?? '');
        else if (s.action === 'select') await page.locator(s.selector).first().selectOption(s.value);
        else if (s.action === 'press') await page.keyboard.press(s.value);
        else if (s.action === 'wait') await page.waitForTimeout(s.ms || 1000);
        else if (s.action === 'expect_text') { if (!(await page.getByText(new RegExp(s.value, 'i')).first().isVisible({ timeout: 8000 }).catch(() => false))) throw new Error(`text "${s.value}" not visible`); }
        else if (s.action === 'expect_visible') { if (!(await page.locator(s.selector).first().isVisible({ timeout: 8000 }).catch(() => false))) throw new Error('not visible'); }
        else if (s.action === 'expect_url') { if (!new RegExp(s.value).test(page.url())) throw new Error(`url is ${page.url()}`); }
        else if (s.action === 'screenshot') await page.screenshot({ path: path.join(OUT_DIR, `flow-${Date.now()}.png`), fullPage: true });
        else throw new Error('unknown action');
        out.push(res(label, 'pass'));
      } catch (e) {
        out.push(res(label, 'fail', e.message.split('\n')[0]));
        if (!s.continueOnFail) break;
      }
    }
    return out;
  });
}

export const SUITES = {  // extra suites are added by audit.js via registerSuites()
  pageLoad, seoMeta, consoleErrors, images, accessibility, responsive, navigation, forms, brokenLinks };

// The Playwright Test project (see playwright-suite.js). Each id = one spec file in the project's tests/ folder.
export const PW_SPECS = [
  { id: 'pw:01-smoke', file: '01-smoke', label: 'Playwright 01 - Smoke: every page loads cleanly', desc: 'Status, title, console errors, failed requests per page' },
  { id: 'pw:02-seo', file: '02-seo', label: 'Playwright 02 - On-page SEO audit', desc: 'Title/description/H1/canonical/OG/schema per page + duplicate detection' },
  { id: 'pw:03-links-and-crawl', file: '03-links-and-crawl', label: 'Playwright 03 - Links, robots, sitemap, redirects', desc: 'robots.txt, sitemap URLs, redirects, 404, headers, broken links' },
  { id: 'pw:04-performance-a11y', file: '04-performance-a11y', label: 'Playwright 04 - Web vitals and accessibility', desc: 'LCP/CLS/load timing, labels, button names, keyboard' },
  { id: 'pw:05-interaction-and-responsive', file: '05-interaction-and-responsive', label: 'Playwright 05 - Mouse/keyboard journeys and responsive', desc: 'Scroll, hover nav, mobile menu, form validation (never submits), 3 viewports' },
];

// Catalog drives the UI: scope 'site' = run once on the base URL, 'page' = run on every selected page
export const CATALOG = [
  { id: 'stack', label: 'Technology stack', group: 'Analysis', scope: 'site', desc: 'Server, language, CMS, frameworks, libraries, CDN, analytics, outdated versions' },
  { id: 'seoSite', label: 'SEO: robots, sitemap, redirects, 404', group: 'SEO', scope: 'site', desc: 'robots.txt, XML sitemap health, HTTPS/www redirects, soft-404s, favicon' },
  { id: 'seoMeta', label: 'SEO: title, description, H1, canonical', group: 'SEO', scope: 'page', desc: 'Core on-page tags' },
  { id: 'seoPage', label: 'SEO: headings, schema, social, content, speed', group: 'SEO', scope: 'page', desc: 'Heading order, JSON-LD validity, breadcrumbs, Open Graph, phone consistency, TTFB, caching' },
  { id: 'images', label: 'Images: alt text and broken images', group: 'SEO', scope: 'page', desc: 'Missing alt, broken files' },
  { id: 'brokenLinks', label: 'Broken links', group: 'SEO', scope: 'page', desc: 'Checks every link on the page for 4xx/5xx' },
  { id: 'security', label: 'Security scan', group: 'Security', scope: 'site', desc: 'Security headers, cookies, mixed content, exposed files (.env, logs, backups), secrets' },
  { id: 'pageLoad', label: 'Page load and status', group: 'Functional QA', scope: 'page', desc: 'HTTP status, load time vs budget' },
  { id: 'consoleErrors', label: 'Console errors and failed requests', group: 'Functional QA', scope: 'page', desc: 'JavaScript errors, 4xx/5xx assets' },
  { id: 'navigation', label: 'Navigation links work', group: 'Functional QA', scope: 'site', desc: 'Menu links present and reachable' },
  { id: 'forms', label: 'Form validation', group: 'Functional QA', scope: 'page', desc: 'Empty/invalid input blocked (never submits)' },
  { id: 'responsive', label: 'Responsive layout', group: 'Functional QA', scope: 'page', desc: 'No horizontal overflow on mobile/tablet/desktop' },
  { id: 'accessibility', label: 'Accessibility (axe-core)', group: 'Functional QA', scope: 'page', desc: 'Contrast, labels, button names, ARIA' },
  ...PW_SPECS.map((p) => ({ id: p.id, label: p.label, group: 'Playwright suite', scope: 'pw', desc: p.desc })),
];
export const PRESETS = {
  'Quick check': ['pageLoad', 'seoMeta', 'consoleErrors'],
  'Full audit': CATALOG.filter((c) => !c.hidden && c.scope !== 'pw').map((c) => c.id),
  'Playwright suite': PW_SPECS.map((p) => p.id),
  'Everything': CATALOG.filter((c) => !c.hidden).map((c) => c.id),
  'SEO checklist': ['seoSite', 'seoMeta', 'seoPage', 'images', 'brokenLinks'],
  'Stack & security': ['stack', 'security'],
  'Functional QA': ['pageLoad', 'consoleErrors', 'navigation', 'forms', 'responsive', 'accessibility'],
};

export const registerSuites = (o) => Object.assign(SUITES, o);

export async function runSuite(cfg, only) {
  const names = only?.length ? only : cfg.suites || Object.keys(SUITES);
  const report = [];
  const limit = cfg.suiteTimeoutMs || 150000;   // no single check may run longer than this (default 2.5 min)
  for (const n of names) {
    if (cfg.signal?.aborted) break;
    const evidence = [], tracker = [];
    const c = { ...cfg, suiteName: n, evidence, tracker };
    let timer, onAbort;
    const guard = new Promise((resolve) => {
      timer = setTimeout(() => resolve('timeout'), limit);
      onAbort = () => resolve('cancel'); cfg.signal?.addEventListener('abort', onAbort);
    });
    try {
      const work = SUITES[n](c).then((results) => ({ results }));
      work.catch(() => {});   // if we time out and kill the browser, the abandoned check will reject - that must not crash the server
      const out = await Promise.race([work, guard]);
      if (out === 'timeout' || out === 'cancel') {
        await Promise.all(tracker.map((b) => b.close().catch(() => {})));   // kill the stuck browser(s)
        if (out === 'cancel') break;
        report.push({ suite: n, results: [res(`${n} timed out`, 'fail', `no result after ${Math.round(limit / 1000)}s - the page or network is too slow, or the page blocks automation. Re-run this check on its own or test fewer pages.`, 'Run')], shots: evidence });
      } else report.push({ suite: n, results: out.results, shots: evidence });
    } catch (e) { report.push({ suite: n, results: [res(n, 'fail', 'suite crashed: ' + e.message.split('\n')[0])], shots: evidence }); }
    finally { clearTimeout(timer); cfg.signal?.removeEventListener('abort', onAbort); }
  }
  return report;
}

export function formatReport(title, report) {
  const tag = { pass: 'PASS', fail: 'FAIL', warn: 'WARN', info: 'INFO' };
  let p = 0, f = 0, w = 0, s = `# Test report: ${title}\n`;
  for (const { suite, results } of report) {
    s += `\n## ${suite}\n`;
    for (const r of results) {
      if (r.status === 'pass') p++; else if (r.status === 'fail') f++; else if (r.status === 'warn') w++;
      s += `- [${tag[r.status]}] ${r.cat ? '(' + r.cat + ') ' : ''}${r.name}${r.details ? ' — ' + r.details.replace(/\n/g, '; ') : ''}\n`;
    }
  }
  return `${s}\n**Summary: ${p} passed, ${f} failed, ${w} warnings**`;
}
