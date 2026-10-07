# Learn Playwright by testing harveedesigns.com

## Run it

| Goal | Command |
|---|---|
| Run everything (4 browsers/devices) | `npm test` |
| Chromium only (fastest) | `npx playwright test --project=chromium` |
| **Watch the mouse/keyboard drive the browser** | `$env:SLOWMO=400; npm run test:headed` |
| One file | `npx playwright test 02-seo --project=chromium` |
| One test by name | `npx playwright test -g "contact form"` |
| Visual debugger (step through, pick locators) | `npx playwright test 05 --debug` |
| Interactive UI mode (time-travel) | `npm run test:ui` |
| Open HTML report | `npm run report` |
| Record clicks → generates code | `npx playwright codegen https://www.harveedesigns.com` |
| Replay a failure trace | `npx playwright show-trace test-results/<folder>/trace.zip` |

Outputs: `reports/TEST-REPORT.md` (our custom report), `playwright-report/` (built-in HTML), `reports/screens/` (screenshots), `reports/results.json`.

## The lessons (read the spec files in this order)

| # | File | Concept you learn |
|---|---|---|
| 0 | `playwright.config.js` | projects (browsers/devices), baseURL, retries, reporters, headed/slowMo |
| 1 | `tests/01-smoke.spec.js` | `test()`, `expect()`, data-driven loops, **event listeners** (`page.on('console')`), **soft assertions** |
| 2 | `tests/02-seo.spec.js` | `page.evaluate()` (run JS inside the browser), reading DOM data, cross-page comparison |
| 3 | `tests/03-links-and-crawl.spec.js` | the **`request` fixture** (fast HTTP checks: robots, sitemap, redirects, headers, broken links) |
| 4 | `tests/04-performance-a11y.spec.js` | `addInitScript`, PerformanceObserver (LCP/CLS), accessibility checks, keyboard `Tab` |
| 5 | `tests/05-interaction-and-responsive.spec.js` | **`page.mouse`** (move/wheel), locators (`getByRole`), forms, `page.route()` to block a real POST, new browser contexts per viewport, `test.skip` for mobile/desktop |
| 6 | `reporters/summary-reporter.js` | writing your own reporter (lifecycle hooks) |

## Ten ideas worth memorising

1. **Locators auto-wait.** `page.getByRole('button', {name:'Send'}).click()` waits until it's clickable — avoid `waitForTimeout` except for measuring.
2. **Prefer user-facing locators**: `getByRole` → `getByLabel` → `getByText` → CSS/`#id` last.
3. **Web-first assertions retry**: `await expect(locator).toBeVisible()` polls until timeout; `expect(await x)` does not.
4. **`expect.soft`** records the failure and keeps going — perfect for audits that should list *every* problem.
5. **Fixtures** (`page`, `request`, `browser`, `isMobile`) are injected by name; each test gets a fresh isolated context.
6. **`page.route()`** intercepts network calls — we used it so the contact-form test can never submit to the live site.
7. **Annotations** (`test.info().annotations`) carry custom data to reporters — our `finding()` helper uses this.
8. **Projects** = same tests × many browsers/devices. `testMatch` limits heavy specs to one project.
9. **Traces** (`trace: 'retain-on-failure'`) give a DOM snapshot + network + console timeline for each failure — the best debugging tool.
10. **A test "failing" in an audit means "the site has an issue"**, not that the test is broken. Check the failure message to tell which.

## Exercises
1. Add `/our-team.html` check that every team member image has non-empty alt text.
2. Change `SLOWMO=800` and run test `desktop nav` to watch the hover path.
3. Add an `expect(page).toHaveScreenshot()` visual-regression test for the homepage hero.
4. Run `codegen`, record "fill contact form", and paste the output into a new spec.
5. Add `@axe-core/playwright` for a full WCAG scan (`npm i -D @axe-core/playwright`).

## Run these same tests against ANY site (Web QA Studio / MCP)
The specs read their target from environment variables; with none set nothing changes (harveedesigns.com, output in `reports/`).

| Variable | Meaning |
|---|---|
| `PW_BASE_URL` | site to test, e.g. `https://example.com` |
| `PW_PAGES_FILE` | JSON file listing the paths to test, e.g. `["/","/about"]` |
| `PW_OUT_DIR` | where results.json, TEST-REPORT.md, screens, HTML report and traces are written |
| `PW_RETRIES`, `PW_WORKERS`, `PW_CONTACT_PATH` | retries, parallel workers, path of the page with the contact form |

PowerShell: `$env:PW_BASE_URL="https://example.com"; $env:PW_OUT_DIR="out"; npx playwright test --project=chromium`
Or use the UI: `D:\tools\web-qa-mcp\start-ui.bat` -> tick "Playwright suite". Original copies of the changed files: `.webqa-backup/`.
