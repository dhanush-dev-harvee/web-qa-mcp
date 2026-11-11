// Checks the honest-results rules without a browser: network failures are "Not tested" (not failed checks), two in a row stop the site,
// a site that never opened gets no score, social links are not "broken", and the report time carries its zone.
//   node test-not-tested.js            (add a live address to also test reach():  node test-not-tested.js https://example.com)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
process.env.WEBQA_OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'webqa-test-'));
const T = await import('./tests.js');
const { writeReport } = await import('./report.js');
const { res } = T;

T.registerSuites({
  fine: async () => [res('Heading', 'pass', 'one H1')],
  real: async () => [res('Title length', 'fail', 'title is 120 characters')],
  netdown: async () => [res('Page loads', 'fail', 'page.goto: Timeout 60000ms exceeded.')],
  crash: async () => { throw new Error('page.content: Unable to retrieve content because the page is navigating'); },
});

// 1. one network failure is dropped, two in a row stop the site, real failures are kept
let r = await T.runSuite({ url: 'https://x.test' }, ['fine', 'netdown', 'real', 'netdown', 'crash', 'fine']);
const flat = r.map((s) => `${s.suite}:${s.results.map((x) => x.status).join('+')}`);
assert.deepEqual(flat, ['fine:pass', 'netdown:info', 'real:fail', 'netdown:info', 'crash:info', 'fine:info'], flat.join(' '));
assert.match(r[5].results[0].details, /^Skipped: the site stopped answering/);
assert.ok(!r.some((s) => s.results.some((x) => x.status === 'fail' && /Timeout|navigating/.test(x.details))), 'a network failure was still counted as a failed check');

// 2. reports: nothing tested -> NOT TESTED, no score; some tested -> PARTLY TESTED; all tested -> normal verdict
const dir = (n) => { const d = path.join(process.env.WEBQA_OUT_DIR, n); fs.mkdirSync(path.join(d, 'shots'), { recursive: true }); return d; };
const none = await T.runSuite({ url: 'https://x.test' }, ['netdown', 'netdown']);
let w = writeReport(dir('a'), 'https://x.test', [{ title: '/', url: 'https://x.test', report: none }]);
assert.equal(w.verdict, 'NOT TESTED'); assert.equal(w.score, null);
assert.match(fs.readFileSync(w.html, 'utf8'), /NOT TESTED · no score/);
w = writeReport(dir('b'), 'https://x.test', [{ title: '/', url: 'https://x.test', report: r }]);
assert.match(w.verdict, /^PARTLY TESTED \(failed on what ran\)$/); assert.equal(w.score, 50);   // 1 pass + 1 fail
assert.match(fs.readFileSync(w.html, 'utf8'), /score 50\/100 on the checks that ran/);
const ok = await T.runSuite({ url: 'https://x.test' }, ['fine']);
w = writeReport(dir('c'), 'https://x.test', [{ title: '/', url: 'https://x.test', report: ok }]);
assert.equal(w.verdict, 'PASSED'); assert.equal(w.score, 100);
assert.match(JSON.parse(fs.readFileSync(w.json, 'utf8')).when, / IST$/, 'the report time must say IST');

// 3. social media links are not checked
assert.ok(T.isSocial('https://www.facebook.com/x') && T.isSocial('https://youtu.be/abc') && !T.isSocial('https://www.harveedesigns.com'));

// 4. reach(): an unknown name fails on DNS with a reason; a live address (optional argument) is reachable
const bad = await T.reach('https://this-name-does-not-exist-9f3k2.invalid');
assert.equal(bad.ok, false); assert.match(bad.reason, /did not resolve/);
if (process.argv[2]) { const live = await T.reach(process.argv[2]); assert.equal(live.ok, true, JSON.stringify(live)); console.log('reach ok:', T.reachLines(live).map((x) => x.join(': ')).join(' | ')); }
console.log('all honest-results checks passed');
process.exit(0);
