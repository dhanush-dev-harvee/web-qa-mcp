---
name: web-qa-report
description: Turn web-qa audit results (SEO, stack, security, functional) into a clear prioritised report for a team lead or client - verdict, score, ordered fix list, evidence, scope limits. Use after running web-qa checks, or when the user asks to write up, summarise or export audit findings.
---

# Web QA report writing

## Inputs
Each run saves a folder `results/<host>/<timestamp>-<kind>/` inside the web-qa-mcp checkout (the tool prints its path). It contains `report.json` (source of truth), `report.html`, `report.md`, `shots/`. Read `report.json`; do not retype numbers from memory. The UI at http://localhost:4010 also exports a Word report (`.docx`) from the same data.

## Structure (keep this order)
1. **Verdict line**: target, date, scope (pages, checks, browser), result: `FAILED / PASSED WITH WARNINGS / PASSED`, score `/100`, counts of fail and warn.
2. **Decisions needed** (max 5 bullets): who must act, what, and why it matters. Plain language; no jargon without a gloss.
3. **Findings to fix**, failures first, grouped by priority:
   - **P1 - fix now**: security exposures (credentials, public logs, backups, phpinfo), indexing blockers, broken core flows.
   - **P2 - fix soon**: missing security headers, schema/sitemap errors, accessibility failures, slow load.
   - **P3 - improve**: social tags, image formats, minor accessibility, nice-to-haves.
   Each finding: **what** (one line) / **where** (page or file path) / **why it matters** / **how to fix** (one concrete step) / evidence (check name or screenshot).
4. **Technology section** (if `stack` ran): parts, languages, libraries with versions, services, environment, flagged outdated components.
5. **What passed** (short) so the reader knows what is healthy.
6. **Not tested / limits**: no authenticated areas, no real form submission, no ranking or Core Web Vitals field data, automated checks only; items to verify manually.
7. **Next steps**: ordered, with an owner role (developer, DevOps, content/SEO).

## Writing rules
- Lead with impact. "Credentials are downloadable by anyone" beats "secrets detected".
- Never include secret values; cite file and key name only, and say the credential must be rotated.
- Separate test noise from real defects; list noise under limits.
- One fact per sentence, short paragraphs, tables for lists of 3+ items. No exaggeration: report counts and severities exactly as measured.
- Compare runs when a previous report exists (new / fixed / unchanged) - the history list in the UI shows earlier runs for the same host.
- Date in absolute form (e.g. 7 October 2026).

## Formats
- Quick summary in chat: verdict + top 5 fixes + report path.
- Shareable document: point to the downloadable Word/HTML from the UI, or use the `docx` skill / a doc if the user wants it edited and shared.
