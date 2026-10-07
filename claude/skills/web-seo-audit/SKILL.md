---
name: web-seo-audit
description: Run and interpret an SEO checklist audit of a website using the web-qa MCP tools - robots.txt, sitemap health, redirects, canonical, titles/meta, headings, schema (JSON-LD), breadcrumbs, Open Graph, phone/NAP consistency, image/link quality, speed hints. Use for any SEO audit, "why is my site not ranking" technical check, or pre-launch SEO review.
---

# Web SEO audit

Run: `check_seo_meta`, `check_images`, `check_broken_links` per page, plus `run_full_suite` with `only: ["seoSite","seoPage"]` (site-level checks run once on the base URL; page-level on each page). For many pages use `run_site_audit` with `suites: ["seoMeta","seoPage","images"]`.

## What each check covers
| Area | Check | Pass criteria |
|---|---|---|
| Crawlability | robots.txt | exists, does not `Disallow: /` for `*`, lists the sitemap |
| Crawlability | XML sitemap | reachable, has URLs and `<lastmod>`, one consistent domain, sampled URLs return 200 |
| Indexing | noindex / canonical | not noindex; canonical self-references (or intentionally points elsewhere) |
| Indexing | 404 behaviour | missing URLs return a real 404 (a 200 = soft 404) |
| Consolidation | http->https, www/non-www | one 301/308 hop to the canonical host |
| On-page | title 20-70 chars, meta description 70-160 | exactly one H1; heading levels do not skip |
| Content | word count | 300+ on landing/service pages |
| Structured data | JSON-LD valid JSON | types match the page (LocalBusiness/Organization, FAQPage, BreadcrumbList); URLs use the live domain |
| Social | og:title/description/image/url, twitter:card | all present |
| Contact | tel: links vs schema telephone | consistent numbers |
| Images | alt text, WebP/AVIF, width/height, lazy loading | alt on every content image |
| Links | descriptive anchors, `rel=noopener` on `_blank`, no `href="#"` | clean |
| Speed hints | TTFB < 800 ms, compression, cache headers, DOM < 1800 nodes | |

## Interpretation notes
- Sitemap URL returning 404 = **fail**: removes crawl budget and signals a stale sitemap; either restore the page or remove it from the sitemap.
- Schema URLs pointing at another domain/staging = fail for rich results.
- BreadcrumbList warning on inner pages: breadcrumbs shown but no schema, or the middle step has no link.
- Missing `twitter:card` and `apple-touch-icon` are low priority; missing canonical, noindex, wrong H1 count and soft 404s are high.
- This is a technical on-page audit. It does not measure rankings, backlinks, keyword targeting, or Core Web Vitals field data: say so in the report and suggest Search Console / PageSpeed Insights for those.

## Priority order for fixes
1. Anything blocking indexing (robots, noindex, soft 404, redirect loops, sitemap errors).
2. Duplicate/missing title, description, H1, canonical.
3. Invalid or mismatched structured data; inconsistent contact details.
4. Images, internal linking, social tags, speed hints.

Output via `web-qa-report`.
