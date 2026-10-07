---
name: web-security-scan
description: Passive security review of a website you own or are authorised to test, via the web-qa MCP tools - security headers, cookie flags, mixed content, exposed sensitive files (.env, logs, backups, phpinfo), leaked secrets, and for local folders stale files, oversized logs and credentials in source. Use for security checks, pre-launch hardening, or a security section in a technical report.
---

# Web security scan (passive)

Run `run_full_suite` with `only: ["security"]` (add `folder` for local projects). It sends ordinary GET/HEAD requests only and reads at most 4 KB per probed path: no exploitation, no brute force, no fuzzing, no authentication attempts.

## Authorisation first
Only scan sites the user owns or has written permission to test. If ownership is unclear, ask before running. Do not scan third-party sites "for comparison".

## What it checks
| Group | Checks |
|---|---|
| Transport | HTTPS in use, HSTS, mixed content, password fields over http |
| Headers | Content-Security-Policy, X-Frame-Options/frame-ancestors, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| Disclosure | version numbers in `Server` / `X-Powered-By`, WordPress version, user enumeration (`/wp-json/wp/v2/users`), XML-RPC |
| Exposed files (27 paths) | `.env`, `.git/config`, `phpinfo.php`, `error_log`, `debug.log`, `*.sql`, `backup.zip`, `wp-config` backups, `.htpasswd`, `test.php`, `composer.lock`, phpMyAdmin, Adminer |
| Cookies | HttpOnly, Secure, SameSite |
| Secrets | API keys, private keys, `password=...` literals in page source |
| Local folder only | logs > 5 MB in web root, stale/sensitive files (.sql/.bak/.zip/.env/test.php), credentials in `.php/.js/.json` files |

## Severity and ordering
1. **Fail, fix now**: exposed `.env`/`.git`/backups/DB dumps, public `phpinfo`, public error logs (they leak paths, queries, sometimes data), credentials in web-root files. Treat any credential found as compromised: **rotate it**, then move it outside the web root / into environment variables.
2. **Warn, fix soon**: missing CSP/HSTS/X-Frame-Options, cookie flags, version disclosure, leftover test scripts, public composer/package files.
3. **Info**: security.txt, optional headers.

## Handling findings
- Never repeat a secret value in chat or the report. The tool masks values; keep them masked and cite file + key name only.
- A huge `error_log` (hundreds of MB) is both a disclosure and a disk/performance problem: fix the cause of the errors, rotate, and block direct access.
- Soft-404 sites: the tool compares against a baseline missing page to avoid false positives; if every probe fails identically, mention that results may be less reliable.
- Headers set at a CDN/WAF may differ from origin. Note which layer was tested.
- Scope statement for the report: automated passive checks only; not a penetration test; no authenticated areas unless a login profile was configured.

Output via `web-qa-report`, Security section, failures first.
