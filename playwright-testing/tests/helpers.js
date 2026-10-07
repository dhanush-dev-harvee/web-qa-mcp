// Shared data + helpers for every spec file.
import { test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// ---- Target selection (Web QA Studio / MCP sets these; defaults keep the original Harvee behaviour) ----
//   PW_BASE_URL    site to test            PW_PAGES_FILE  JSON array of paths to test
//   PW_OUT_DIR     where reports/screens go (default ./reports)
export const SITE = (process.env.PW_BASE_URL || 'https://www.harveedesigns.com').replace(/\/$/, '');
export const OUT = process.env.PW_OUT_DIR || 'reports';
export const SCREENS = path.join(OUT, 'screens');
fs.mkdirSync(SCREENS, { recursive: true });
const CUSTOM = !!process.env.PW_PAGES_FILE;

// Pages discovered from the homepage navigation/footer + sitemap.
const DEFAULT_PAGES = [
  '/',
  '/about-us.html',
  '/our-team.html',
  '/portfolio.html',
  '/contact-us.html',
  '/seo-company-in-coimbatore.html',
  '/web-development-company.html',
  '/social-media-marketing.html',
  '/social-media-ads.html',
  '/software-development.html',
  '/android-app-development.html',
  '/ios-app-development.html',
  '/cloud-service.html',
  '/reputation-management.html',
  '/advertising-agency.html',
  '/chatgpt-ads-agency-in-coimbatore.html',
  '/best-digital-marketing-company-in-bangalore.html',
  '/best-digital-marketing-company-in-chennai.html',
  '/best-digital-marketing-company-in-delhi.html',
  '/best-digital-marketing-company-in-hyderabad.html',
  '/best-digital-marketing-company-in-mumbai.html',
  '/privacy-policy.html',
  '/terms-and-conditions.html',
  '/blog/',
];
export const PAGES = CUSTOM ? JSON.parse(fs.readFileSync(process.env.PW_PAGES_FILE, 'utf8')) : DEFAULT_PAGES;
// Subsets used by the performance / a11y / responsive specs.
export const KEY_PAGES = CUSTOM ? PAGES.slice(0, 5) : ['/', '/about-us.html', '/seo-company-in-coimbatore.html', '/contact-us.html', '/portfolio.html'];
export const RESPONSIVE_PAGES = CUSTOM ? PAGES.slice(0, 4) : ['/', '/about-us.html', '/contact-us.html', '/portfolio.html'];
export const CONTACT_PATH = process.env.PW_CONTACT_PATH || '/contact-us.html';

// Hosts that should 301 to SITE (skipped for localhost, where redirects don't apply).
const _u = new URL(SITE), _bare = _u.hostname.replace(/^www\./, '');
export const REDIRECT_FROM = /^(localhost|127\.|\[)/.test(_u.hostname) ? []
  : [`http://${_u.hostname}/`, `http://${_bare}/`, `https://${_bare}/`].filter((x, i, a) => a.indexOf(x) === i && x !== SITE + '/');

/**
 * Record a finding. It shows up in the final Markdown report.
 * severity: 'high' | 'medium' | 'low' | 'info'
 * Annotations are Playwright's built-in way to attach metadata to a test.
 */
export function finding(severity, message) {
  test.info().annotations.push({ type: `finding:${severity}`, description: message });
}

// Third-party noise we don't want to blame the site for.
export const THIRD_PARTY = /googletagmanager|google-analytics|doubleclick|facebook|fbcdn|clarity\.ms|hotjar|youtube|gstatic|googleapis|openai\.com|google\.com|analytics\.google|bing\.com/i;
