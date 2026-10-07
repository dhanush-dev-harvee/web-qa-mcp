---
name: web-stack-analysis
description: Identify the technology stack of a website or local project (server, language, CMS, frameworks, JS/CSS libraries, CDN, analytics, payment and chat services, hosting, protocol) and flag outdated or end-of-life components. Use when the user asks what a site is built with, wants a tech/architecture summary, or a stack section for a technical report.
---

# Web stack analysis

Run the `stack` check (`run_full_suite` with `only: ["stack"]`). For a local folder also pass `folder` so source files are scanned: languages by file count, `package.json` / `composer.json` dependencies, WordPress/Laravel/Django markers, `.htaccess`.

For a deeper source-level read of a local project (page structure, shared includes, how forms are processed, database use) delegate to the `web-stack-analyst` agent.

## What the tool fingerprints
Server header, `X-Powered-By`, cookies (PHPSESSID, laravel_session, csrftoken, ASP.NET_SessionId), HTML/asset paths (wp-content, /_next/, cdn.shopify.com), JS globals (jQuery version, React, Vue, Angular, Next, Nuxt), CSS/JS library file names, third-party request hosts (GTM, GA, Meta Pixel, Razorpay, reCAPTCHA, Bunny/Cloudflare/CloudFront), HTTP/2 or 3, compression, HSTS.

## Report layout (matches the Harvee technical report)
1. **Parts of the system** - which pieces exist (main site, blog/CMS, APIs) and what each is built with.
2. **Languages** (HTML, PHP version, CSS, JS, SQL, JSON/JSON-LD, XML, server config).
3. **Libraries and frameworks** with versions.
4. **CMS/platform** (WordPress theme + plugin list; builders such as Elementor).
5. **Fonts, images, CDN**.
6. **External services** grouped: analytics/ads, payments, chat/messaging, security, maps/media.
7. **Environment**: web server, PHP/runtime version, hosting, protocol.

## Version warnings the tool raises
- jQuery < 3.5.0 (known XSS), Bootstrap < 4, AngularJS (end-of-life).
- PHP < 8.2 (no security support; verify against php.net/supported-versions because dates move).
- Visible WordPress version in the generator tag (remove it).
Treat versions as "reported by the site", not proof: a CDN or proxy can hide or fake headers. Say "detected" not "confirmed" when the evidence is only a file name.

## Do not
- Claim the database, hosting provider or backend language unless a header, cookie or source file shows it. Mark unknowns as "not detectable from outside".
- Recommend rebuilding the stack from a fingerprint alone; recommend upgrades for flagged components only.

Output via `web-qa-report`, using the Technology section.
