// Runs the bundled Playwright Test project (./playwright-testing; override with WEBQA_PW_DIR) against ANY target,
// then converts its results.json (+ finding annotations) into the Web QA report format.
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { res, PW_SPECS } from './tests.js';
export { PW_SPECS };

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PW_DIR = path.resolve(process.env.WEBQA_PW_DIR || path.join(HERE, 'playwright-testing'));
export const PW_PROJECTS = ['chromium', 'firefox', 'webkit', 'mobile-chrome'];
export const pwAvailable = () => fs.existsSync(path.join(PW_DIR, 'playwright.config.js')) && fs.existsSync(path.join(PW_DIR, 'node_modules', '@playwright', 'test', 'cli.js'));

// Root-relative test paths (e.g. goto('/about.html')) break when the app lives under a sub-path such as
// http://localhost/my-app/. This tiny reverse proxy maps http://127.0.0.1:PORT/x -> <target>/x.
export function startProxy(target) {
  const t = new URL(target), prefix = t.pathname.replace(/\/$/, '');
  const srv = http.createServer(async (req, rs) => {
    try {
      const chunks = []; for await (const c of req) chunks.push(c);
      const headers = { ...req.headers }; delete headers.host; delete headers['accept-encoding']; delete headers.connection;
      const r = await fetch(t.origin + prefix + req.url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks), redirect: 'manual' });
      const out = {}; r.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie'].includes(k)) out[k] = v; });
      if (out.location?.startsWith(t.origin + prefix)) out.location = out.location.slice((t.origin + prefix).length) || '/';
      const sc = r.headers.getSetCookie?.() || []; if (sc.length) out['set-cookie'] = sc;
      rs.writeHead(r.status, out); rs.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) { rs.writeHead(502); rs.end('proxy error: ' + e.message); }
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() })));
}

// child.kill() on Windows leaves Playwright's worker processes and browsers running; kill the whole tree.
export function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGKILL');
}

const stripAnsi = (s = '') => String(s).replace(/\u001b\[[0-9;]*m/g, '');

function walk(suite, trail, out) {
  const t = suite.title && !/\.spec\.[jt]s$/.test(suite.title) ? [...trail, suite.title] : trail;
  for (const sp of suite.specs || []) for (const test of sp.tests || []) out.push({ file: path.basename(sp.file), title: sp.title, describe: t.join(' › '), test });
  for (const s of suite.suites || []) walk(s, t, out);
}

// results.json -> { sections, totals, findings, shots }
export function convertResults(outDir, runDir, baseUrl) {
  const f = path.join(outDir, 'results.json');
  if (!fs.existsSync(f)) return null;
  const j = JSON.parse(fs.readFileSync(f, 'utf8')), flat = [];
  for (const s of j.suites || []) walk(s, [], flat);
  const byFile = new Map(), seen = new Set();
  const SEV = { high: 'fail', medium: 'warn', low: 'warn', info: 'info' };
  for (const x of flat) {
    const key = 'pw:' + x.file.replace(/\.spec\.[jt]s$/, '');
    if (!byFile.has(key)) byFile.set(key, { suite: key, results: [], shots: [] });
    const entry = byFile.get(key), last = x.test.results[x.test.results.length - 1] || {};
    const status = x.test.status === 'expected' ? 'pass' : x.test.status === 'skipped' ? 'info' : x.test.status === 'flaky' ? 'warn' : 'fail';
    const err = stripAnsi(last.error?.message || last.errors?.[0]?.message || '').split('\n').filter(Boolean).slice(0, 3).join(' · ').slice(0, 300);
    const detail = status === 'info' ? 'skipped' + (x.test.annotations?.find((a) => a.type === 'skip')?.description ? ': ' + x.test.annotations.find((a) => a.type === 'skip').description : '') : status === 'warn' ? 'flaky: passed only on retry' : err;
    entry.results.push(res(`[${x.test.projectName}] ${x.title}`, status, detail, x.describe));
    for (const a of x.test.annotations || []) if (a.type?.startsWith('finding:')) {
      const sev = a.type.split(':')[1], k = sev + '|' + a.description;
      if (seen.has(k)) continue; seen.add(k);
      entry.results.push(res(a.description, SEV[sev] || 'info', '', `Finding · ${sev.toUpperCase()}`));
    }
    for (const at of last.attachments || []) if (at.contentType === 'image/png' && at.path && status === 'fail' && entry.shots.length < 6)
      entry.shots.push({ file: path.relative(runDir, at.path).replace(/\\/g, '/'), viewport: x.test.projectName, url: baseUrl });
  }
  const screens = path.join(outDir, 'screens');
  if (fs.existsSync(screens)) {
    const e5 = byFile.get('pw:05-interaction-and-responsive') || [...byFile.values()][0];
    if (e5) for (const p of fs.readdirSync(screens).filter((n) => n.endsWith('.png')).slice(0, 14))
      e5.shots.push({ file: `pw/screens/${p}`, viewport: p.replace(/\.png$/, '').replace(/_/g, '/'), url: baseUrl });
  }
  const st = j.stats || {};
  return { report: [...byFile.values()], stats: { expected: st.expected, unexpected: st.unexpected, flaky: st.flaky, skipped: st.skipped, seconds: Math.round((st.duration || 0) / 1000) } };
}

export async function runPlaywright(o) {
  if (!pwAvailable()) throw new Error(`Playwright Test project is not installed at ${PW_DIR}. Run "node setup.js" in the web-qa-mcp folder (or set WEBQA_PW_DIR to a playwright-testing project that has node_modules).`);
  const specs = (o.specs?.length ? o.specs : PW_SPECS.map((s) => s.file)).map((s) => s.replace(/^pw:/, ''));
  const projects = (o.projects?.length ? o.projects : ['chromium']).filter((p) => PW_PROJECTS.includes(p));
  const outDir = path.join(o.runDir, 'pw'); fs.mkdirSync(outDir, { recursive: true });

  const env = { ...process.env, PW_BASE_URL: o.url, PW_OUT_DIR: outDir, PW_RETRIES: String(o.retries ?? 1), FORCE_COLOR: '0' };
  if (o.pages?.length) { const pf = path.join(outDir, 'pages.json'); fs.writeFileSync(pf, JSON.stringify(o.pages)); env.PW_PAGES_FILE = pf; }
  if (o.contactPath) env.PW_CONTACT_PATH = o.contactPath;
  if (o.headed) { env.HEADED = '1'; env.SLOWMO = String(o.slowMo || 300); env.PW_WORKERS = '1'; } else if (o.workers) env.PW_WORKERS = String(o.workers);

  const cli = path.join(PW_DIR, 'node_modules', '@playwright', 'test', 'cli.js');
  const args = [cli, 'test', ...specs, ...projects.flatMap((p) => ['--project', p])];
  const tail = [];

  // How many tests will run? (fast: lists them without running) -> lets the UI show "23 / 118 tests"
  let total = 0;
  try {
    const l = spawnSync(process.execPath, [cli, 'test', '--list', '--reporter=list', ...args.slice(2)], { cwd: PW_DIR, env, encoding: 'utf8', timeout: 60000 });
    total = Number((stripAnsi(l.stdout || '').match(/Total:\s*(\d+)\s+test/) || [])[1]) || 0;
  } catch { /* progress just won't have a total */ }
  o.onProgress?.({ done: 0, total, line: `Playwright will run ${total || 'an unknown number of'} tests` });

  const timeoutMs = o.timeoutMs ?? 20 * 60 * 1000;     // hard cap so a run can never hang forever
  const seen = new Set();
  await new Promise((ok, fail) => {
    const child = spawn(process.execPath, args, { cwd: PW_DIR, env, windowsHide: !o.headed });
    o.onSpawn?.(child);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
    const onData = (d) => {
      for (const line of stripAnsi(d.toString()).split(/\r?\n/)) if (line.trim()) {
        tail.push(line); if (tail.length > 60) tail.shift(); o.onLine?.(line);
        const m = line.match(/^\s*(?:ok|x|-|✓|✗|✘)\s+(\d+)\s+\[/);     // "ok 12 [chromium] > ..." (retries reuse the number)
        if (m) { seen.add(m[1]); o.onProgress?.({ done: total ? Math.min(seen.size, total) : seen.size, total, line: line.trim().replace(/\s+\(\d+(\.\d+)?m?s\)$/, '').slice(0, 140) }); }
      }
    };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.on('error', (e) => { clearTimeout(timer); fail(e); });
    child.on('close', (code) => { clearTimeout(timer); if (timedOut) fail(new Error(`Playwright suite was stopped after ${Math.round(timeoutMs / 60000)} minutes (${seen.size}/${total} tests done). Run fewer pages or spec files.`)); else if (code === null) fail(new Error('Playwright run was cancelled')); else ok(code); });
  });
  const conv = convertResults(outDir, o.runDir, o.url);
  if (!conv) throw new Error('Playwright produced no results. ' + (projects.some((p) => p !== 'chromium') ? 'Note: firefox, webkit and mobile-chrome only run specs 01 and 05. ' : '') + 'Last output: ' + tail.slice(-4).join(' | '));
  return { ...conv, projects, specs, outDir, htmlReport: 'pw/playwright-report/index.html', markdown: 'pw/TEST-REPORT.md' };
}
