#!/usr/bin/env node
// Web QA Studio — local web UI for the web-qa engine. Binds to 127.0.0.1 only.
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as T from '../tests.js';
import '../audit.js';
import { writeReport } from '../report.js';
import * as PW from '../playwright-suite.js';
import { buildDocx } from './export-docx.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4010);
// Folder listed under "Local project". Override with WEBQA_LOCAL_ROOT; otherwise the first common web root that exists.
const LOCAL_ROOT = path.resolve(process.env.WEBQA_LOCAL_ROOT || ['C:/xampp/htdocs', 'D:/xampp/htdocs', '/opt/lampp/htdocs', '/Applications/XAMPP/htdocs', '/var/www/html', path.join(process.env.HOME || process.env.USERPROFILE || '.', 'Sites')].find((p) => fs.existsSync(p)) || process.cwd());
const openUrl = (u) => exec(process.platform === 'win32' ? `start "" "${u}"` : process.platform === 'darwin' ? `open "${u}"` : `xdg-open "${u}"`);
const OUT = T.OUT_DIR;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(HERE, 'public')));
app.use('/results', express.static(OUT));

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(500).json({ error: e.message }));
const probe = async (url, ms = 2500) => { try { const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(ms) }); return r.status; } catch { return 0; } };

// ---------- config + local projects ----------
app.get('/api/config', wrap(async (req, res) => {
  res.json({ catalog: T.CATALOG.filter((c) => !c.hidden), presets: T.PRESETS, localRoot: LOCAL_ROOT, apacheUp: (await probe('http://localhost/')) > 0,
    playwright: { available: PW.pwAvailable(), dir: PW.PW_DIR, projects: PW.PW_PROJECTS } });
}));

app.get('/api/local/folders', wrap(async (req, res) => {
  const dirs = fs.existsSync(LOCAL_ROOT) ? fs.readdirSync(LOCAL_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')) : [];
  const list = dirs.map((d) => {
    const p = path.join(LOCAL_ROOT, d.name), has = (f) => fs.existsSync(path.join(p, f));
    const hints = [has('wp-config.php') || has('wp-content') ? 'WordPress' : '', has('artisan') ? 'Laravel' : '', has('package.json') ? 'Node' : '', has('composer.json') ? 'Composer' : '', has('index.php') ? 'PHP' : '', has('index.html') ? 'HTML' : ''].filter(Boolean);
    return { name: d.name, path: p, hints };
  }).filter((d) => d.hints.length || true);
  res.json({ root: LOCAL_ROOT, folders: list });
}));

const statics = new Map();
function serveFolder(abs) {
  if (statics.has(abs)) return statics.get(abs);
  const a = express();
  a.use(express.static(abs, { extensions: ['html'], index: ['index.html', 'index.htm'] }));
  a.use((req, res) => res.status(404).send('Not found'));
  const srv = http.createServer(a);
  const p = new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(`http://127.0.0.1:${srv.address().port}/`)));
  statics.set(abs, p);
  return p;
}
app.post('/api/local/resolve', wrap(async (req, res) => {
  let f = String(req.body.folder || '').trim().replace(/^"|"$/g, '');
  if (!f) return res.status(400).json({ error: 'Choose or paste a folder' });
  const abs = path.resolve(/^[a-zA-Z]:|^[\\/]/.test(f) ? f : path.join(LOCAL_ROOT, f));
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return res.status(404).json({ error: `Folder not found: ${abs}` });
  const rel = path.relative(LOCAL_ROOT, abs).replace(/\\/g, '/');
  const idx = ['index.html', 'index.htm'].map((f) => path.join(abs, f)).find((f) => fs.existsSync(f));
  const htaccess = fs.existsSync(path.join(abs, '.htaccess')) ? fs.readFileSync(path.join(abs, '.htaccess'), 'utf8') : '';
  const phpInHtml = (idx && /<\?php/i.test(fs.readFileSync(idx, 'utf8').slice(0, 20000))) || /(AddHandler|AddType)[^\r\n]*php[^\r\n]*\.html?/i.test(htaccess);
  const usesPhp = phpInHtml || fs.existsSync(path.join(abs, 'index.php')) || fs.existsSync(path.join(abs, 'wp-config.php'));
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    const url = `http://localhost/${rel ? rel + '/' : ''}`;
    const st = await probe(url);
    if (st && st < 500) return res.json({ mode: 'apache', url, folder: abs, note: 'Served by your local Apache (PHP works).' });
    if (usesPhp) return res.json({ mode: 'down', url, folder: abs, note: (phpInHtml ? 'This project runs its .html pages through PHP. ' : 'This project uses PHP. ') + 'Apache is not answering — start XAMPP Apache, then press "Use this folder" again.' });
  }
  const url = await serveFolder(abs);
  res.json({ mode: 'static', url, folder: abs, note: 'Served as static files by Web QA Studio (PHP is not executed).' });
}));

// ---------- jobs ----------
const jobs = new Map();
let busy = null;
const emit = (job, ev) => { job.log.push(ev); for (const r of job.listeners) r.write(`data: ${JSON.stringify(ev)}\n\n`); };

async function runJob(job, body) {
  const t0 = Date.now();
  let sections = [], runDir = null, playwright = null, checksSel = [], baseCfg = null;
  // Writes whatever has been collected so far, so a cancel / timeout / crash never loses finished work.
  const finishReport = (partialReason) => {
    const r = writeReport(runDir, body.url, sections, { kind: body.scope === 'site' ? 'Site audit' : 'Single page', browser: baseCfg?.browser, checks: checksSel, scope: body.scope, folder: baseCfg?.folder || null, playwright, partial: partialReason || null, seconds: Math.round((Date.now() - t0) / 1000) });
    job.status = 'done'; emit(job, { type: 'done', id: job.id, verdict: r.verdict, score: r.score, totals: r.totals, partial: partialReason || null });
  };
  try {
    job.abort = new AbortController();
    const base = baseCfg = { url: body.url, folder: body.folder, browser: body.browser || 'chromium', headed: !!body.headed, loadBudgetMs: 4000, signal: job.abort.signal, linkCache: new Map() };
    const known = new Set(T.CATALOG.map((c) => c.id));
    const checks = (body.checks || []).filter((c) => known.has(c));
    if (!checks.length) throw new Error('Select at least one check.');
    checksSel = checks;
    const scopeOf = (id) => T.CATALOG.find((c) => c.id === id).scope;
    const siteChecks = checks.filter((c) => scopeOf(c) === 'site'), pageChecks = checks.filter((c) => scopeOf(c) === 'page'), pwChecks = checks.filter((c) => scopeOf(c) === 'pw');

    let urls = [base.url];
    if (body.scope === 'site' && (pageChecks.length || pwChecks.length)) {
      emit(job, { type: 'log', msg: 'Discovering pages (sitemap.xml, then link crawl)…' });
      urls = await T.discoverPages(base, Math.min(Number(body.maxPages) || 10, 50));
      if (!urls.includes(base.url)) urls.unshift(base.url);
      urls = urls.slice(0, Math.min(Number(body.maxPages) || 10, 50));
      emit(job, { type: 'log', msg: `Found ${urls.length} page(s) to test.` });
    }
    const plan = urls.map((u, i) => ({ url: u, suites: [...(i === 0 ? siteChecks : []), ...pageChecks] }));
    const total = plan.reduce((n, p) => n + p.suites.length, 0) + (pwChecks.length ? 1 : 0);
    runDir = T.newRun(base.url, body.scope === 'site' ? 'site-audit' : 'run');
    job.id = `${path.basename(path.dirname(runDir))}~${path.basename(runDir)}`;
    let done = 0;
    for (const p of plan) {
      const section = { title: new URL(p.url).pathname === '/' ? new URL(p.url).host : new URL(p.url).pathname, url: p.url, report: [] };
      sections.push(section);      // added up-front so a cancel/timeout keeps this page's finished checks
      for (const s of p.suites) {
        if (job.cancel) throw new Error('Cancelled by user');
        emit(job, { type: 'progress', done, total, msg: `${T.CATALOG.find((c) => c.id === s).label} — ${section.title}` });
        section.report.push(...(await T.runSuite({ ...base, url: p.url, runDir }, [s])));
        done++;
      }
      if (!section.report.length) sections.splice(sections.indexOf(section), 1);
    }
    // ---- Playwright Test project (real @playwright/test run: specs x browsers, traces, native HTML report)
    if (pwChecks.length) {
      if (job.cancel) throw new Error('Cancelled by user');
      if (!PW.pwAvailable()) throw new Error(`Playwright Test project is not installed at ${PW.PW_DIR}. Run "node setup.js" in the web-qa-mcp folder.`);
      emit(job, { type: 'progress', done, total, msg: `Playwright Test: ${pwChecks.length} spec file(s) × ${(body.pwProjects?.length ? body.pwProjects : ['chromium']).join(', ')} …` });
      const bu = new URL(base.url), prefix = bu.pathname.replace(/\/$/, '');
      const proxy = prefix ? await PW.startProxy(base.url) : null;      // app lives under a sub-path: map "/" to it
      try {
        const pages = urls.map((u) => { const x = new URL(u); const p = x.pathname.startsWith(prefix) ? x.pathname.slice(prefix.length) || '/' : x.pathname; return p + x.search; });
        const pwPages = [...new Set(pages)].slice(0, Math.max(1, Number(body.pwMaxPages) || 5));   // the Playwright suite is slow: cap its pages
        if (pwPages.length < new Set(pages).size) emit(job, { type: 'log', msg: `Playwright suite will test the first ${pwPages.length} pages (limit shown in Options).` });
        const pw = await PW.runPlaywright({
          url: proxy ? proxy.url : bu.origin, runDir, specs: pwChecks, projects: body.pwProjects, pages: pwPages, headed: base.headed, slowMo: body.slowMo, retries: 1,
          onSpawn: (c) => (job.child = c),
          onProgress: (p) => emit(job, { type: 'progress', done: done + (p.total ? Math.min(p.done / p.total, 0.99) : 0), total, msg: p.total ? `Playwright tests ${p.done}/${p.total} · ${p.line}` : p.line }),
        });
        sections.push({ title: 'Playwright suite', url: base.url, report: pw.report });
        playwright = { projects: pw.projects, specs: pw.specs, stats: pw.stats, htmlReport: pw.htmlReport, markdown: pw.markdown };
        done++;
      } finally { proxy?.close(); }
    }
    emit(job, { type: 'progress', done, total, msg: 'Writing report…' });
    finishReport(job.cancel ? 'Cancelled by user' : undefined);
  } catch (e) {
    sections = sections.filter((s) => s.report.length);
    if (runDir && sections.length) {   // keep the work that already finished
      try { emit(job, { type: 'log', msg: `Stopped: ${e.message} - saving the results collected so far.` }); finishReport(e.message); }
      catch (e2) { job.status = 'error'; emit(job, { type: 'error', msg: e.message }); }
    } else { job.status = 'error'; emit(job, { type: 'error', msg: e.message }); }
  } finally { busy = null; for (const r of job.listeners) r.end(); job.listeners.clear(); }
}

app.post('/api/runs', wrap(async (req, res) => {
  const b = req.body;
  try { const u = new URL(b.url); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { return res.status(400).json({ error: 'Enter a valid http(s) URL.' }); }
  if (busy) return res.status(409).json({ error: 'A run is already in progress. Wait for it to finish or cancel it.' });
  const job = { id: null, status: 'running', log: [], listeners: new Set(), cancel: false };
  const key = Math.random().toString(36).slice(2, 10); jobs.set(key, job); busy = key;
  runJob(job, b);
  res.json({ job: key });
}));
app.post('/api/jobs/:k/cancel', (req, res) => { const j = jobs.get(req.params.k); if (j) { j.cancel = true; j.abort?.abort(); PW.killTree(j.child); } res.json({ ok: true }); });
app.get('/api/jobs/:k/events', (req, res) => {
  const job = jobs.get(req.params.k); if (!job) return res.status(404).end();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); res.flushHeaders();
  for (const ev of job.log) res.write(`data: ${JSON.stringify(ev)}\n\n`);
  if (job.status !== 'running') return res.end();
  job.listeners.add(res); req.on('close', () => job.listeners.delete(res));
});

// ---------- reports ----------
const runPath = (id) => { const [h, d] = String(id).split('~'); if (!h || !d || /[\\/]|\.\./.test(h + d)) return null; return path.join(OUT, h, d); };
app.get('/api/runs', wrap(async (req, res) => {
  const out = [];
  if (fs.existsSync(OUT)) for (const h of fs.readdirSync(OUT, { withFileTypes: true })) if (h.isDirectory()) for (const d of fs.readdirSync(path.join(OUT, h.name))) {
    const f = path.join(OUT, h.name, d, 'report.json'); if (!fs.existsSync(f)) continue;
    try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); out.push({ id: `${h.name}~${d}`, title: j.title, when: j.when, verdict: j.verdict, score: j.score ?? Math.round(((j.totals.pass + 0.5 * j.totals.warn) / Math.max(1, j.totals.pass + j.totals.warn + j.totals.fail)) * 100), totals: j.totals, kind: j.meta?.kind || d.split('-').slice(2).join('-'), checks: j.meta?.checks?.length ?? j.sections.reduce((n, s) => n + s.report.length, 0), pages: j.sections.length, partial: !!j.meta?.partial, t: fs.statSync(f).mtimeMs }); } catch { /* skip */ }
  }
  res.json(out.sort((a, b) => b.t - a.t).slice(0, 40));
}));
app.get('/api/runs/:id', wrap(async (req, res) => {
  const p = runPath(req.params.id); const f = p && path.join(p, 'report.json');
  if (!f || !fs.existsSync(f)) return res.status(404).json({ error: 'Report not found' });
  res.json(JSON.parse(fs.readFileSync(f, 'utf8')));
}));
app.get('/api/runs/:id/download/:fmt', wrap(async (req, res) => {
  const p = runPath(req.params.id); if (!p || !fs.existsSync(p)) return res.status(404).send('Not found');
  const { fmt } = req.params, name = `qa-report-${req.params.id.replace('~', '-')}`;
  if (fmt === 'docx') {
    const buf = await buildDocx(JSON.parse(fs.readFileSync(path.join(p, 'report.json'), 'utf8')));
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="${name}.docx"` });
    return res.send(buf);
  }
  if (!['html', 'md', 'json'].includes(fmt)) return res.status(400).send('Unknown format');
  if (fmt === 'html') { // self-contained: inline screenshots so the downloaded file works anywhere
    let h = fs.readFileSync(path.join(p, 'report.html'), 'utf8');
    h = h.replace(/src="(shots\/[^"]+)"/g, (m, f) => { try { return `src="data:image/png;base64,${fs.readFileSync(path.join(p, f)).toString('base64')}"`; } catch { return m; } });
    res.set({ 'Content-Type': 'text/html', 'Content-Disposition': `attachment; filename="${name}.html"` }); return res.send(h);
  }
  res.download(path.join(p, `report.${fmt}`), `${name}.${fmt}`);
}));

app.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Web QA Studio running at ${url}   (local projects root: ${LOCAL_ROOT})`);
  if (!process.argv.includes('--no-open')) openUrl(url);
}).on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is busy — Web QA Studio may already be running at http://localhost:${PORT}` : e.message); process.exit(1); });
