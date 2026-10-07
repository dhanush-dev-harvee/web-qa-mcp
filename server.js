#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import path from 'node:path';
import * as T from './tests.js';
import './audit.js';
import { writeReport } from './report.js';
import * as PW from './playwright-suite.js';

const server = new McpServer({ name: 'web-qa', version: '2.0.0' });

const common = {
  url: z.string().url().optional().describe('Page/app URL. Optional if `profile` has baseUrl.'),
  profile: z.string().optional().describe('Saved site profile name (see list_profiles), e.g. harvee-designs'),
  browser: z.enum(['chromium', 'firefox', 'webkit']).optional(),
  headed: z.boolean().optional().describe('Show the browser window'),
  folder: z.string().optional().describe('Local project folder path. Enables the source scan (stale files, big logs, credentials in code) and source-level stack detection.'),
};
const text = (t) => ({ content: [{ type: 'text', text: t }] });
const safe = (fn) => async (a) => { try { return await fn(a); } catch (e) { return { isError: true, content: [{ type: 'text', text: e.message }] }; } };
const reg = (name, description, extra, fn) =>
  server.registerTool(name, { description, inputSchema: { ...common, ...extra } }, safe(fn));

// Every run writes report.html/.md/.json + screenshots to results/<host>/<timestamp>-<kind>/
const finish = (title, kind, c, sections, runDir, extra = {}) => {
  const r = writeReport(runDir, title, sections, { kind, browser: c.browser, ...extra });
  const body = sections.map((s) => T.formatReport(s.url, s.report)).join('\n\n---\n\n');
  return text(`${body}\n\nReport (open in browser): ${r.html}\nAlso saved: ${r.md}, ${r.json}`);
};
const single = (suite) => async (a) => {
  const c = T.resolve(a), runDir = T.newRun(c.url, suite);
  return finish(c.url, suite, c, [{ title: suite, url: c.url, report: await T.runSuite({ ...c, runDir }, [suite]) }], runDir);
};

reg('check_page_load', 'HTTP status, load time vs budget, HTTPS', {}, single('pageLoad'));
reg('check_seo_meta', 'Title, description, canonical, H1, OG, JSON-LD, lang, viewport, noindex', {}, single('seoMeta'));
reg('check_console_errors', 'JS console errors and failed requests (profile.ignoreConsole filters noise)', {}, single('consoleErrors'));
reg('check_images', 'Missing alt text and broken images', {}, single('images'));
reg('check_accessibility', 'axe-core accessibility scan', {}, single('accessibility'));
reg('check_navigation', 'Nav links present and reachable', {}, single('navigation'));
reg('check_responsive', 'No horizontal overflow on mobile/tablet/desktop', {}, single('responsive'));
reg('check_broken_links', 'Check links on a page for 4xx/5xx', { maxLinks: z.number().int().min(1).max(300).optional() }, single('brokenLinks'));
reg('test_form', 'Validate the main form (empty/invalid/valid email). Only submits with submit=true (sends real data!)',
  { submit: z.boolean().optional() }, single('forms'));

reg('take_screenshots', 'Full-page screenshots at mobile/tablet/desktop; returns file paths', {},
  async (a) => text((await T.screenshot(T.resolve(a))).join('\n')));

reg('run_full_suite', 'Run all common checks on one URL/profile and write an HTML report with screenshots', {
  only: z.array(z.enum(Object.keys(T.SUITES))).optional(),
}, async (a) => {
  const c = T.resolve(a), runDir = T.newRun(c.url, 'full-suite');
  return finish(c.url, 'full-suite', c, [{ title: c.url, url: c.url, report: await T.runSuite({ ...c, runDir }, a.only) }], runDir);
});

reg('discover_pages', 'List pages of a site from sitemap.xml (falls back to crawling nav links)', {
  limit: z.number().int().min(1).max(500).optional(),
}, async (a) => text((await T.discoverPages(T.resolve(a), a.limit)).join('\n')));

reg('run_site_audit', 'Run the core checks across many pages. Pages come from `pages` arg, profile.pages, or auto-discovery.', {
  pages: z.array(z.string()).optional().describe('Paths or full URLs'),
  maxPages: z.number().int().min(1).max(100).optional(),
  suites: z.array(z.enum(Object.keys(T.SUITES))).optional(),
}, async (a) => {
  const c = T.resolve(a), runDir = T.newRun(c.url, 'site-audit');
  let urls = (a.pages || c.pages)?.map((p) => T.abs(c.url, p)) || (await T.discoverPages(c));
  urls = urls.slice(0, a.maxPages || 15);
  const suites = a.suites || c.auditSuites || ['pageLoad', 'seoMeta', 'consoleErrors', 'images', 'responsive'];
  const sections = [];
  for (const u of urls) sections.push({ title: new URL(u).pathname, url: u, report: await T.runSuite({ ...c, url: u, runDir }, suites) });
  return finish(c.url, 'site-audit', c, sections, runDir);
});

reg('run_flow', 'Run a custom user journey. steps: [{action: goto|click|fill|select|press|wait|expect_text|expect_visible|expect_url|screenshot, selector?, value?, url?}]', {
  steps: z.array(z.object({
    action: z.enum(['goto', 'click', 'fill', 'select', 'press', 'wait', 'expect_text', 'expect_visible', 'expect_url', 'screenshot']),
    selector: z.string().optional(), value: z.string().optional(), url: z.string().optional(),
    ms: z.number().optional(), continueOnFail: z.boolean().optional(),
  })).optional().describe('Omit to run profile.flows[flow]'),
  flow: z.string().optional().describe('Name of a flow saved in the profile'),
}, async (a) => {
  const c = T.resolve(a);
  const steps = a.steps || c.flows?.[a.flow];
  if (!steps) throw new Error('Provide `steps` or a `flow` name defined in the profile.');
  const runDir = T.newRun(c.url, 'flow'), shots = [];
  const results = await T.runFlow({ ...c, runDir, evidence: shots, suiteName: a.flow || 'flow' }, steps);
  return finish(c.url, 'flow', c, [{ title: a.flow || 'custom flow', url: c.url, report: [{ suite: a.flow || 'custom flow', results, shots }] }], runDir);
});

server.registerTool('list_profiles', { description: 'List saved site profiles', inputSchema: {} },
  safe(async () => text(T.listProfiles().map((n) => `${n}: ${T.loadProfile(n).baseUrl}`).join('\n') || 'No profiles yet.')));

server.registerTool('save_profile', {
  description: 'Create/update a site profile so any app can be tested by name. Fields: baseUrl, pages[], ignoreConsole[] (regex), skipLinks[] (regex), loadBudgetMs, form{selector,data,successText}, auth{loginUrl,userSelector,passSelector,submitSelector,userEnv,passEnv}, flows{name:[steps]}, suites[], auditSuites[]',
  inputSchema: { name: z.string().regex(/^[a-z0-9-_]+$/i), profile: z.record(z.any()) },
}, safe(async (a) => { T.saveProfile(a.name, a.profile); return text(`Saved profile "${a.name}"`); }));

// ---- The real Playwright Test project (specs x browsers, traces, native HTML report) ----
server.registerTool('list_playwright_specs', { description: 'List the spec files of the Playwright Test project (default C:\\Users\\User\\Desktop\\playwright-testing), the browsers/projects, and whether it is installed.', inputSchema: {} },
  safe(async () => text(`Project: ${PW.PW_DIR}\nAvailable: ${PW.pwAvailable()}\nBrowsers: ${PW.PW_PROJECTS.join(', ')} (firefox/webkit/mobile-chrome only run specs 01 and 05)\n\n` + T.PW_SPECS.map((s) => `${s.file} - ${s.desc}`).join('\n'))));

reg('run_playwright_suite', 'Run the Playwright Test project (spec files from playwright-testing: smoke, SEO, links/crawl, performance+a11y, mouse/keyboard journeys + responsive) against ANY url or profile. Produces the standard report plus the native Playwright HTML report with traces. Never submits forms.', {
  specs: z.array(z.enum(T.PW_SPECS.map((s) => s.file))).optional().describe('Spec files to run; default all five'),
  projects: z.array(z.enum(PW.PW_PROJECTS)).optional().describe('Browsers/devices; default chromium'),
  pages: z.array(z.string()).optional().describe('Paths to test, e.g. ["/","/about.html"]; default profile.pages, sitemap/crawl (max 8), or "/"'),
  maxPages: z.number().int().min(1).max(30).optional(),
  slowMo: z.number().int().min(0).max(2000).optional().describe('ms delay per action when headed=true (default 300)'),
  retries: z.number().int().min(0).max(3).optional(),
}, async (a) => {
  const c = T.resolve(a), runDir = T.newRun(c.url, 'playwright');
  const bu = new URL(c.url), prefix = bu.pathname.replace(/\/$/, '');
  let paths = a.pages || c.pages;
  if (!paths) { const found = await T.discoverPages(c, a.maxPages || 8).catch(() => [c.url]); paths = found.map((u) => { const x = new URL(u); return ((x.pathname.startsWith(prefix) ? x.pathname.slice(prefix.length) : x.pathname) || '/') + x.search; }); }
  paths = [...new Set(paths.map((p) => (p.startsWith('/') ? p : '/' + p)).slice(0, a.maxPages || 12))];
  const proxy = prefix ? await PW.startProxy(c.url) : null;
  try {
    const pw = await PW.runPlaywright({ url: proxy ? proxy.url : bu.origin, runDir, specs: a.specs, projects: a.projects, pages: paths, headed: c.headed, slowMo: a.slowMo, retries: a.retries ?? 1 });
    const sections = [{ title: 'Playwright suite', url: c.url, report: pw.report }];
    const meta = { playwright: { projects: pw.projects, specs: pw.specs, stats: pw.stats, htmlReport: pw.htmlReport, markdown: pw.markdown } };
    const out = finish(c.url, 'playwright', c, sections, runDir, meta);
    out.content[0].text += `\nNative Playwright report (traces/videos): ${path.join(runDir, pw.htmlReport)}\nTest stats: ${pw.stats.expected ?? 0} passed, ${pw.stats.unexpected ?? 0} failed, ${pw.stats.flaky ?? 0} flaky, ${pw.stats.skipped ?? 0} skipped (${pw.projects.join(', ')})`;
    return out;
  } finally { proxy?.close(); }
});

T.ensureBrowser('chromium');   // first run on a new machine: start downloading the browser in the background right away
await server.connect(new StdioServerTransport());
