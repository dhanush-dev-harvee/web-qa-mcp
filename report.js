// Writes report.html / report.md / report.json into a run folder.
import fs from 'node:fs';
import path from 'node:path';
import { formatReport } from './tests.js';

const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const count = (sections) => {
  const t = { pass: 0, fail: 0, warn: 0, info: 0 };
  for (const s of sections) for (const r of s.report) for (const x of r.results) t[x.status] = (t[x.status] || 0) + 1;
  return t;
};

export function writeReport(runDir, title, sections, meta = {}) {
  const t = count(sections), when = new Date().toLocaleString();
  const score = t.pass + t.warn + t.fail ? Math.round(((t.pass + 0.5 * t.warn) / (t.pass + t.warn + t.fail)) * 100) : 100;
  const verdict = t.fail ? 'FAILED' : t.warn ? 'PASSED WITH WARNINGS' : 'PASSED';
  const vcol = t.fail ? '#dc2626' : t.warn ? '#d97706' : '#16a34a';

  let body = '';
  for (const s of sections) {
    const st = count([s]);
    body += `<section><h2>${esc(s.title || s.url)} <small>${st.pass} pass · ${st.fail} fail · ${st.warn} warn</small></h2><p class="url">${esc(s.url)}</p>`;
    for (const r of s.report) {
      body += `<h3>${esc(r.suite)}</h3><table><tr><th>Status</th><th>Check</th><th>Details</th></tr>`;
      for (const x of r.results)
        body += `<tr><td><span class="b ${x.status}">${x.status.toUpperCase()}</span></td><td>${x.cat ? `<span class="cat">${esc(x.cat)}</span>` : ''}${esc(x.name)}</td><td>${esc(x.details).replace(/\n/g, '<br>')}</td></tr>`;
      body += '</table>';
      if (r.shots?.length) body += '<div class="shots">' + r.shots.map((p) => `<figure><a href="${p.file}" target="_blank"><img src="${p.file}"></a><figcaption>${esc(p.viewport)}</figcaption></figure>`).join('') + '</div>';
    }
    body += '</section>';
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>QA Report - ${esc(title)}</title><style>
body{font:14px/1.5 system-ui,sans-serif;margin:0;background:#f4f5f7;color:#111}
header{background:#111;color:#fff;padding:24px 32px}header h1{margin:0 0 4px;font-size:22px}header p{margin:0;color:#aaa}
.v{display:inline-block;margin-top:12px;padding:6px 14px;border-radius:6px;font-weight:700;background:${vcol}}
main{max-width:1100px;margin:24px auto;padding:0 16px}
.sum{display:flex;gap:12px;margin-bottom:24px}.sum div{flex:1;background:#fff;border-radius:8px;padding:14px;text-align:center;box-shadow:0 1px 2px #0002}.sum b{display:block;font-size:26px}
section{background:#fff;border-radius:8px;padding:18px 22px;margin-bottom:20px;box-shadow:0 1px 2px #0002}
h2{margin:0}h2 small{font-weight:400;color:#666;font-size:13px;margin-left:8px}.url{color:#2563eb;margin:2px 0 8px;word-break:break-all}
h3{margin:18px 0 6px;font-size:15px;text-transform:capitalize}
table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}th{color:#666;font-size:12px}
.b{padding:2px 8px;border-radius:4px;color:#fff;font-size:11px;font-weight:700}.pass{background:#16a34a}.info{background:#2563eb}.cat{color:#6b7280;font-size:11px;display:block}.fail{background:#dc2626}.warn{background:#d97706}
.shots{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}figure{margin:0}img{height:130px;border:1px solid #ddd;border-radius:4px}figcaption{font-size:11px;color:#666}
</style></head><body><header><h1>QA Test Report — ${esc(title)}</h1><p>${esc(when)} · ${esc(meta.kind || 'run')} · browser: ${esc(meta.browser || 'chromium')}</p><span class="v">${verdict} · score ${score}/100</span></header>
<main><div class="sum"><div><b style="color:#16a34a">${t.pass}</b>Passed</div><div><b style="color:#dc2626">${t.fail}</b>Failed</div><div><b style="color:#d97706">${t.warn}</b>Warnings</div><div><b>${sections.length}</b>Page(s) tested</div></div>${body}</main></body></html>`;

  const md = sections.map((s) => formatReport(s.url, s.report)).join('\n\n---\n\n');
  fs.writeFileSync(path.join(runDir, 'report.html'), html);
  fs.writeFileSync(path.join(runDir, 'report.md'), `# QA Report — ${title}\n_${when}_ — **${verdict}** (${t.pass} pass, ${t.fail} fail, ${t.warn} warn)\n\n${md}\n`);
  fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify({ title, when, verdict, score, totals: t, meta, sections }, null, 2));
  return { dir: runDir, html: path.join(runDir, 'report.html'), md: path.join(runDir, 'report.md'), json: path.join(runDir, 'report.json'), totals: t, verdict, score };
}
