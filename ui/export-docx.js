// Builds a Word report (same style as the manual technical report) from a report.json object.
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, ShadingType, AlignmentType } from 'docx';

const COL = { pass: '16A34A', fail: 'DC2626', warn: 'D97706', info: '2563EB' };
const cut = (s, n = 260) => (String(s || '').length > n ? String(s).slice(0, n) + '…' : String(s || ''));
const cell = (text, o = {}) => new TableCell({
  width: o.w ? { size: o.w, type: WidthType.PERCENTAGE } : undefined,
  shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: 'auto' } : undefined,
  children: [new Paragraph({ children: [new TextRun({ text: String(text), bold: !!o.bold, color: o.color, size: o.size || 18 })] })],
});
const table = (head, rows, widths) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, { bold: true, fill: 'E5E7EB', w: widths[i] })) }),
    ...rows.map((r) => new TableRow({ children: r.map((c, i) => (c && c.status ? cell(c.status.toUpperCase(), { bold: true, color: 'FFFFFF', fill: COL[c.status], w: widths[i] }) : cell(c, { w: widths[i] }))) }))],
});
const H = (t, l = HeadingLevel.HEADING_1) => new Paragraph({ text: t, heading: l, spacing: { before: 240, after: 100 } });
const P = (t, o = {}) => new Paragraph({ children: [new TextRun({ text: t, ...o })], spacing: { after: 80 } });

export async function buildDocx(j) {
  const kids = [];
  kids.push(new Paragraph({ children: [new TextRun({ text: 'Website QA, SEO and Technology Report', bold: true, size: 40 })], spacing: { after: 120 } }));
  kids.push(P(j.title, { size: 26, color: '2563EB' }));
  kids.push(P(`Generated: ${j.when}   |   Tool: Web QA Studio (Playwright)`, { color: '6B7280', size: 18 }));
  kids.push(H('1. Summary'));
  kids.push(table(['Item', 'Result'], [
    ['Overall verdict', j.verdict], ['Quality score', `${j.score} / 100`],
    ['Checks passed', j.totals.pass], ['Failures (fix first)', j.totals.fail], ['Warnings', j.totals.warn], ['Pages tested', j.sections.length],
    ['Checks run', (j.meta?.checks || []).join(', ')],
  ], [30, 70]));

  const findings = [];
  for (const s of j.sections) for (const r of s.report) for (const x of r.results) if (x.status === 'fail' || x.status === 'warn') findings.push({ ...x, page: s.title, suite: r.suite });
  findings.sort((a, b) => (a.status === 'fail' ? 0 : 1) - (b.status === 'fail' ? 0 : 1));
  kids.push(H('2. Findings to fix'));
  if (!findings.length) kids.push(P('No failures or warnings.'));
  else {
    kids.push(P(`${findings.filter((f) => f.status === 'fail').length} failures and ${findings.filter((f) => f.status === 'warn').length} warnings. Failures are listed first.`));
    kids.push(table(['Priority', 'Page', 'Check', 'Details'], findings.slice(0, 120).map((f) => [{ status: f.status }, cut(f.page, 40), cut(f.name, 80), cut(f.details)]), [10, 16, 28, 46]));
    if (findings.length > 120) kids.push(P(`… and ${findings.length - 120} more in the HTML report.`, { italics: true }));
  }

  const stack = j.sections.flatMap((s) => s.report.filter((r) => r.suite === 'stack').flatMap((r) => r.results)).filter((x) => x.status !== 'pass' || x.cat);
  if (stack.length) {
    kids.push(H('3. Technology stack'));
    kids.push(table(['Category', 'Technology', 'Evidence / note'], stack.map((x) => [x.cat, x.name, cut(x.details, 160)]), [28, 32, 40]));
  }

  kids.push(H('4. Detailed results'));
  for (const s of j.sections) {
    kids.push(H(s.title === s.url ? s.url : `${s.title}  (${s.url})`, HeadingLevel.HEADING_2));
    for (const r of s.report) {
      kids.push(H(r.suite, HeadingLevel.HEADING_3));
      kids.push(table(['Status', 'Check', 'Details'], r.results.map((x) => [{ status: x.status }, cut((x.cat ? x.cat + ': ' : '') + x.name, 90), cut(x.details, 300)]), [10, 34, 56]));
    }
  }
  kids.push(P(''));
  kids.push(P('Scope note: automated checks only. Findings marked as exposed files or credentials should be verified manually before action.', { italics: true, color: '6B7280', size: 16 }));
  const doc = new Document({ creator: 'Web QA Studio', title: `QA Report - ${j.title}`, sections: [{ children: kids }] });
  return Packer.toBuffer(doc);
}
