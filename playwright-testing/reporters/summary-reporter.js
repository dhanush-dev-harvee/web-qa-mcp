// Custom Playwright reporter → reports/TEST-REPORT.md
// LESSON 6: a reporter is just a class with lifecycle hooks (onTestEnd, onEnd...).
const fs = require('fs');
const path = require('path');

const TARGET = (process.env.PW_BASE_URL || 'https://www.harveedesigns.com').replace(/\/$/, '');
const HOST = new URL(TARGET).host;
const OUT = process.env.PW_OUT_DIR || 'reports';
const SEV = ['high', 'medium', 'low', 'info'];
const ICON = { high: '🔴 High', medium: '🟠 Medium', low: '🟡 Low', info: 'ℹ️ Info' };

class SummaryReporter {
  constructor() { this.results = []; this.start = Date.now(); }

  onTestEnd(test, result) {
    const project = test.parent.project()?.name || '';
    const prev = this.results.findIndex((r) => r.id === test.id);
    const entry = {
      id: test.id, project, file: path.basename(test.location.file), title: test.title,
      status: result.status, duration: result.duration, retry: result.retry,
      errors: result.errors.map((e) => (e.message || '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 6).join('\n')),
      findings: test.annotations.concat(result.annotations || []).filter((a) => a.type.startsWith('finding:'))
        .map((a) => ({ sev: a.type.split(':')[1], msg: a.description })),
    };
    if (prev >= 0) this.results[prev] = entry; else this.results.push(entry); // keep final retry only
  }

  onEnd(result) {
    const r = this.results;
    const count = (s) => r.filter((x) => x.status === s).length;
    const dur = ((Date.now() - this.start) / 1000).toFixed(0);

    // Deduplicate findings across browsers/retries.
    const seen = new Map();
    for (const t of r) for (const f of t.findings) {
      const key = f.sev + '|' + f.msg;
      if (!seen.has(key)) seen.set(key, { ...f, file: t.file });
    }
    const findings = [...seen.values()];
    const bySev = (s) => findings.filter((f) => f.sev === s);

    const byFile = {};
    for (const t of r) (byFile[t.file] ||= []).push(t);

    let md = `# Playwright Test & SEO Report — ${HOST}\n\n`;
    md += `- **Run date:** ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC\n- **Target:** ${TARGET}\n- **Duration:** ${dur}s\n- **Playwright projects:** ${[...new Set(r.map((x) => x.project))].join(', ')}\n\n`;
    md += `## 1. Executive summary\n\n| Metric | Count |\n|---|---|\n| Tests run | ${r.length} |\n| ✅ Passed | ${count('passed')} |\n| ❌ Failed | ${count('failed') + count('timedOut')} |\n| ⚠️ Flaky (passed on retry) | ${r.filter((x) => x.status === 'passed' && x.retry > 0).length} |\n| ⏭ Skipped | ${count('skipped')} |\n| 🔴 High findings | ${bySev('high').length} |\n| 🟠 Medium findings | ${bySev('medium').length} |\n| 🟡 Low findings | ${bySev('low').length} |\n\n`;

    md += `## 2. Findings by severity\n\n`;
    for (const s of SEV) {
      const list = bySev(s);
      if (!list.length) continue;
      md += `### ${ICON[s]} (${list.length})\n\n`;
      list.forEach((f) => (md += `- ${f.msg}  _(${f.file})_\n`));
      md += '\n';
    }

    md += `## 3. Results by test file\n\n`;
    for (const [file, ts] of Object.entries(byFile)) {
      const p = ts.filter((t) => t.status === 'passed').length;
      md += `### ${file} — ${p}/${ts.length} passed\n\n| Status | Project | Test | Time |\n|---|---|---|---|\n`;
      ts.forEach((t) => (md += `| ${t.status === 'passed' ? '✅' : t.status === 'skipped' ? '⏭' : '❌'} | ${t.project} | ${t.title} | ${(t.duration / 1000).toFixed(1)}s |\n`));
      md += '\n';
    }

    const failed = r.filter((t) => ['failed', 'timedOut'].includes(t.status));
    if (failed.length) {
      md += `## 4. Failure details\n\n`;
      failed.forEach((t) => (md += `**[${t.project}] ${t.file} › ${t.title}**\n\n\`\`\`\n${t.errors.join('\n---\n')}\n\`\`\`\n\n`));
    }

    md += `## 5. Evidence\n\n- Interactive report: \`npx playwright show-report\`\n- Screenshots: \`reports/screens/\`\n- Raw data: \`reports/results.json\`\n- Traces/videos for failures: \`test-results/\`\n`;

    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'TEST-REPORT.md'), md);
    console.log(`\nMarkdown report → ${OUT}/TEST-REPORT.md (${findings.length} unique findings)`);
  }
}
module.exports = SummaryReporter;
