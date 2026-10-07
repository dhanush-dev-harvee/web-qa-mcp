# Web QA MCP

Audit **any website or local project** from Claude (MCP), a web UI, or the command line:

- **Playwright tests** - page load, console errors, navigation, forms (never submitted), responsive layout, accessibility (axe-core), plus a bundled **Playwright Test suite** (smoke, SEO, links/crawl, performance + a11y, mouse/keyboard journeys) with traces and videos.
- **SEO checklist** - robots.txt, sitemap health, redirects, canonical, titles/meta, headings, JSON-LD schema, Open Graph, phone consistency, image/link quality, speed hints.
- **Technology stack** - server, language, CMS, frameworks, libraries, CDN, analytics/payment/chat services, outdated versions.
- **Security scan** (passive) - security headers, cookies, mixed content, exposed files (`.env`, logs, backups, phpinfo), leaked secrets; for local folders also stale files, huge logs and credentials in code.
- **Reports** - score, prioritised fixes, screenshots; download as **Word, HTML, Markdown or JSON**.

> Only test sites you own or have permission to test. Security checks send ordinary requests to common sensitive paths.

## Quick start

Requires **Node 18+** (and Git).

```bash
git clone <this-repo-url> web-qa-mcp
cd web-qa-mcp
node setup.js                 # npm install (root + playwright-testing), installs Chromium, writes mcp-config.generated.json
```

Optional flags: `--all-browsers` (Firefox + WebKit), `--claude-assets` (install the skills + agents into `~/.claude`), `--register` (run `claude mcp add` for you).

## Connect it to Claude

`setup.js` prints the exact JSON for your machine and saves it as `mcp-config.generated.json`. It looks like this (use the absolute path to `server.js`):

```json
{
  "mcpServers": {
    "web-qa": { "command": "node", "args": ["/absolute/path/to/web-qa-mcp/server.js"] }
  }
}
```

| Client | Where it goes |
|---|---|
| **Claude Code** (all projects) | `claude mcp add --scope user web-qa -- node /absolute/path/to/web-qa-mcp/server.js` |
| **Claude Code** (this folder only) | open Claude Code inside the cloned folder - the bundled `.mcp.json` is picked up automatically |
| **Claude Desktop** | merge the JSON into `claude_desktop_config.json`, restart the app |
| **Cursor / other MCP clients** | paste into their `mcp.json` |

Then ask, for example: *"Use web-qa to run a full audit on https://example.com"*, *"Run the Playwright suite on http://localhost/my-app/"*, *"What is https://example.com built with?"*

### Skills and agents (recommended)
`node setup.js --claude-assets` copies `claude/skills/*` and `claude/agents/*` into `~/.claude`:
`web-qa`, `web-seo-audit`, `web-stack-analysis`, `web-security-scan`, `web-functional-qa`, `web-qa-report` skills and the `web-qa-auditor` and `web-stack-analyst` agents.

## Web UI

```bash
npm run ui          # http://localhost:4010
```

Choose a **live URL** or a **local project** (folder list from your web root, or paste any path), tick tests or pick a preset (Quick check, Full audit, SEO checklist, Stack & security, Functional QA, Playwright suite, Everything), choose single page or whole site, optionally **watch the browser**, then download the report. Past reports are listed and re-openable. The server only listens on `127.0.0.1`.

Local projects: pick the folder; Apache (XAMPP etc.) is used when running, plain HTML folders are served statically. PHP projects need Apache running.

## CLI

```bash
node smoke.js https://example.com                       # one page, all checks, opens the HTML report
node smoke.js https://example.com --audit --watch       # whole site, visible browser
node smoke.js my-profile seoMeta,images                 # a saved profile, chosen checks
```

## MCP tools

`check_page_load`, `check_seo_meta`, `check_console_errors`, `check_images`, `check_accessibility`, `check_navigation`, `check_responsive`, `check_broken_links`, `test_form`, `take_screenshots`, `run_full_suite` (also `stack`, `seoSite`, `seoPage`, `security`), `run_site_audit`, `discover_pages`, `run_flow` (custom journeys), `run_playwright_suite`, `list_playwright_specs`, `list_profiles`, `save_profile`.

All tools accept `url` or `profile`, `browser` (chromium/firefox/webkit), `headed` (watch it run) and `folder` (local project for source scans).

## Site profiles
Save per-site settings in `profiles/<name>.json` (copy `profiles/_template.json`) or with the `save_profile` tool: base URL, pages, third-party console noise to ignore, load budget, login selectors, saved flows. **Credentials are never stored** - login uses environment variables named in the profile.

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `WEBQA_LOCAL_ROOT` | first of `C:/xampp/htdocs`, `D:/xampp/htdocs`, `/opt/lampp/htdocs`, `/var/www/html`, `~/Sites` | folders listed under "Local project" |
| `WEBQA_PW_DIR` | `./playwright-testing` | Playwright Test project to run |
| `WEBQA_OUT_DIR` | `./results` | where reports are written |
| `PORT` | `4010` | UI port |

Set them in the MCP config `env` block, e.g. `"env": { "WEBQA_LOCAL_ROOT": "C:/projects" }`.

## Reports
Every run writes `results/<host>/<timestamp>-<kind>/` with `report.html`, `report.md`, `report.json`, `shots/` and, for Playwright runs, `pw/` (native Playwright HTML report with traces and videos). The UI adds the Word export.

## Safety
- Forms are validated but **never submitted** unless you explicitly pass `submit: true` (use a staging site).
- No exploitation, brute force or authenticated scanning. Exposed-file probes read at most 4 KB per path.
- The UI binds to localhost only. Do not expose it or the MCP server to a network without adding authentication.

## Updating
```bash
git pull && node setup.js
```
