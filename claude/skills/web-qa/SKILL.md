---
name: web-qa
description: Audit any website or local web project end to end (Playwright tests, SEO checklist, tech-stack analysis, security scan) using the web-qa MCP tools or the Web QA Studio UI, then produce a prioritised report. Use when the user asks to test, audit, QA, check SEO of, or analyse the stack of a site, a live URL, or a project folder.
---

# Web QA (orchestrator)

Entry point for all website testing. Pick the right sub-skill, run the checks through the `web-qa` MCP tools (`mcp__web-qa__*`), and deliver a report the user can act on.

## 1. Establish the target (ask only if missing)
- **Live site**: a full URL. Confirm the user owns it or has permission (security checks probe common sensitive paths).
- **Local project**: a folder under your local web root (for example xampp htdocs) or any path. It needs a URL to test:
  - Apache running -> `http://localhost/<folder>/`.
  - Plain HTML folder -> Web QA Studio serves it statically.
  - PHP project with Apache stopped -> tell the user to start XAMPP Apache. Do NOT test the static copy: PHP in `.html` files will not run and results will be wrong.
- Pass `folder` context when the target is local so the source scan (stale files, huge logs, credentials in code) runs.

## 2. Choose the scope
| User intent | Skill to follow | Checks (ids) |
|---|---|---|
| "quick check" | this file | pageLoad, seoMeta, consoleErrors |
| SEO / ranking / checklist | `web-seo-audit` | seoSite, seoMeta, seoPage, images, brokenLinks |
| "what is it built with" | `web-stack-analysis` | stack |
| security / exposed files | `web-security-scan` | security |
| does it work / regression | `web-functional-qa` | pageLoad, consoleErrors, navigation, forms, responsive, accessibility |
| Playwright spec suite (multi-browser, traces) | `web-functional-qa` | `run_playwright_suite` (ids `pw:01-smoke` ... `pw:05-interaction-and-responsive`) |
| "full audit" | all of the above | every id except the `pw:*` specs; add them for "everything" |

Whole site: use `run_site_audit` (pages from profile, sitemap, or crawl; default max 15). Single page: `run_full_suite` with `only`.

## 3. How to run
1. For a site the user will test repeatedly, `save_profile` (baseUrl, pages, ignoreConsole regexes for third-party noise, loadBudgetMs).
2. Run the tools. Use `headed: true` if the user wants to watch.
3. Every run writes `results/<host>/<timestamp>-<kind>/report.html|md|json` + screenshots. Always give the user the report path.
4. Alternative with a UI: run `npm run ui` in the web-qa-mcp folder (or `npx -y --package=github:<owner>/web-qa-mcp web-qa-ui`), then open http://localhost:4010 (downloads Word/HTML/MD/JSON).

## 4. Safety rules
- `test_form` never submits unless `submit: true`. Only submit on a staging/test environment or when the user explicitly confirms; a submit sends a real enquiry/email.
- Never enter real credentials. Logins use env vars named in the profile (`auth.userEnv/passEnv`).
- Do not run security probes against sites the user does not own.
- Never print secret values; the tool masks them, keep them masked in summaries.

## 5. Reading results
- `FAIL` = broken or exploitable now. `WARN` = should fix. `INFO` = context only (not scored).
- Score = (pass + 0.5*warn) / (pass + warn + fail). Do not quote a score without the fail/warn counts.
- Distinguish **site problems** from **test noise**: third-party console errors (analytics, chat widgets), `ERR_BLOCKED_BY_ORB`, `goo.gl` timeouts, and 403/429 from social sites are usually noise. Re-run or verify manually before reporting them as bugs.

## 6. Deliverable (follow `web-qa-report`)
Verdict + score, top fixes in priority order, the evidence (report path), what was NOT tested, and the next step.
