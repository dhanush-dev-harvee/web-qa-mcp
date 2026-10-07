---
name: web-functional-qa
description: Functional and regression testing of a website or web app with Playwright through the web-qa MCP tools - page load, console errors, navigation, form validation, responsive layout, accessibility (axe-core), plus custom user-journey flows (login, booking, checkout). Use when asked whether a site works, to test a release, or to build repeatable test flows for an app.
---

# Web functional QA

## Standard pass
Run `run_full_suite` with `only: ["pageLoad","consoleErrors","navigation","forms","responsive","accessibility"]`, or `run_site_audit` for many pages. Add `headed: true` when the user wants to watch (a "QA TEST RUNNING" banner shows in the browser). Test at least chromium; add firefox/webkit for release testing.

| Check | Passes when |
|---|---|
| pageLoad | status < 400 and load under budget (profile `loadBudgetMs`, default 3000 ms) |
| consoleErrors | no JS errors; failed requests are listed as warnings (set `ignoreConsole` regexes for third-party noise) |
| navigation | header/nav links exist and the first 15 internal links resolve |
| forms | empty submit is blocked, invalid email rejected, valid email accepted. **Does not submit.** |
| responsive | no horizontal scroll at 375 / 768 / 1440 px |
| accessibility | no serious/critical axe-core violations (contrast, button/label names, list structure) |

## The Playwright Test project (spec files)
For the full 5-spec suite (smoke, SEO, links/crawl, performance + a11y, mouse/keyboard journeys + responsive) use `run_playwright_suite`, or tick "Playwright suite" in the UI. It runs the real `@playwright/test` project at `the bundled `playwright-testing` folder` against any URL or profile, in chromium by default. Add `projects: ["firefox","webkit","mobile-chrome"]` for cross-browser (those only run specs 01 and 05). `headed: true` plus `slowMo` lets the user watch the mouse move.

Results come back as PASS/FAIL rows plus the project's own findings: severity high = FAIL, medium and low = WARN, info = INFO. Open `pw/playwright-report/index.html` in the run folder for traces and videos of failures. `list_playwright_specs` shows what exists. Do not edit the spec files to suit one site; site-specific settings belong in the `PW_*` environment variables or a new spec.

## Custom flows (app-specific journeys)
Use `run_flow` with `steps`, or save under `profile.flows` and call by name. Actions: `goto, click, fill, select, press, wait, expect_text, expect_visible, expect_url, screenshot`. Rules for good flows:
1. One flow = one user goal (e.g. "book appointment"), 5-12 steps.
2. Prefer stable selectors (`#id`, `[name=]`, `[data-testid]`) over text/position.
3. End every flow with an `expect_text`/`expect_url` that proves success.
4. Set `continueOnFail` only for optional steps.
5. Use test data (`QA Tester`, `qa.test@example.com`, `9876543210`, "Automated test - please ignore").

Healthcare/lead-gen examples worth saving per site: enquiry form validation, appointment booking, WhatsApp/click-to-call links present, thank-you page reached, mobile menu opens.

## Login-protected apps
Put selectors in `profile.auth` and credentials in environment variables of the MCP server (`userEnv`, `passEnv`). Never type or store real passwords in chat, profiles or flows. Use a dedicated test account.

## Submitting forms
Only with `submit: true`, only on staging/test environments or after explicit user confirmation, and say that a real email/lead will be created. Prefer staging; otherwise warn the user the client will receive the enquiry.

## Reading failures
- Reproduce before reporting: re-run the failing check once. Flaky = timing; consistent = real.
- Take `take_screenshots` or look at the report's screenshot evidence for layout bugs.
- Report the page, the check, expected vs actual, and the screenshot path.

Output via `web-qa-report`.
