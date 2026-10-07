// CLI: node smoke.js <profile-or-url> [suite,suite] [--watch] [--audit] [--no-open]
//   --watch   visible browser (slowed down, with an on-screen banner) so you can see every action
//   --audit   run core checks across all pages (profile.pages, sitemap or crawl) instead of one URL
//   --no-open don't auto-open the HTML report
import { exec } from 'node:child_process';
import * as T from './tests.js';
import './audit.js';
import { writeReport } from './report.js';

const args = process.argv.slice(2), flags = args.filter((a) => a.startsWith('--')), pos = args.filter((a) => !a.startsWith('--'));
const target = pos[0];
if (!target) { console.log('Usage: node smoke.js <profile-or-url> [suites] [--watch] [--audit] [--no-open]'); process.exit(1); }
const only = pos[1]?.split(',');
const c = T.resolve({ ...(target.startsWith('http') ? { url: target } : { profile: target }), ...(flags.includes('--watch') ? { headed: true } : {}) });
const audit = flags.includes('--audit');
const runDir = T.newRun(c.url, audit ? 'site-audit' : 'run');

const sections = [];
if (audit) {
  const urls = (c.pages?.map((p) => T.abs(c.url, p))) || (await T.discoverPages(c));
  const suites = only || c.auditSuites || ['pageLoad', 'seoMeta', 'consoleErrors', 'images', 'accessibility', 'responsive'];
  for (const [i, u] of urls.entries()) {
    console.log(`[${i + 1}/${urls.length}] ${u}`);
    sections.push({ title: new URL(u).pathname, url: u, report: await T.runSuite({ ...c, url: u, runDir }, suites) });
  }
} else {
  sections.push({ title: c.url, url: c.url, report: await T.runSuite({ ...c, runDir }, only) });
}
sections.forEach((s) => console.log(T.formatReport(s.url, s.report) + '\n'));
const r = writeReport(runDir, c.url, sections, { kind: audit ? 'site audit' : 'full suite', browser: c.browser });
console.log(`\nVERDICT: ${r.verdict}  (${r.totals.pass} pass / ${r.totals.fail} fail / ${r.totals.warn} warn)\nReport: ${r.html}`);
if (!flags.includes('--no-open')) exec(process.platform === 'win32' ? `start "" "${r.html}"` : process.platform === 'darwin' ? `open "${r.html}"` : `xdg-open "${r.html}"`);
