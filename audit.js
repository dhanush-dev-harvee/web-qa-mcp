// Analysis suites: technology stack, SEO checklist (site + page), security scan, local source scan.
// Registered into SUITES so they work from the MCP, the CLI and the UI.
import fs from 'node:fs';
import path from 'node:path';
import { withPage, res, go, registerSuites } from './tests.js';

const UA = 'WebQA-Studio/2.0';
const originOf = (u) => new URL(u).origin;
const isLocal = (u) => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(u).hostname);
const digits = (s) => String(s).replace(/\D/g, '').slice(-10);
const verLt = (v, min) => { const a = String(v).split('.').map(Number), b = min.split('.').map(Number); for (let i = 0; i < b.length; i++) { if ((a[i] || 0) < b[i]) return true; if ((a[i] || 0) > b[i]) return false; } return false; };

async function get(url, o = {}) {
  try {
    return await fetch(url, { method: o.method || 'GET', redirect: o.redirect || 'follow', headers: { 'user-agent': UA, ...(o.headers || {}) }, signal: AbortSignal.timeout(o.timeout || 12000) });
  } catch { return null; }
}
// Read at most `max` bytes (so a 500 MB log file is never downloaded). Returns {status, headers, text, total}
async function peek(url, max = 4096) {
  const r = await get(url, { headers: { Range: `bytes=0-${max - 1}` }, redirect: 'manual' });
  if (!r) return null;
  let text = '';
  try {
    const reader = r.body.getReader(), dec = new TextDecoder(); let n = 0;
    while (n < max) { const { done, value } = await reader.read(); if (done) break; n += value.length; text += dec.decode(value, { stream: true }); }
    reader.cancel().catch(() => {});
  } catch { /* ignore */ }
  const cr = r.headers.get('content-range'), total = cr ? Number(cr.split('/')[1]) : Number(r.headers.get('content-length') || 0);
  return { status: r.status, headers: r.headers, text: text.slice(0, max), total };
}

// =====================================================================  TECH STACK
const THIRD_PARTY = [
  [/googletagmanager\.com/i, 'Google Tag Manager', 'Analytics & tracking'], [/google-analytics\.com|\/gtag\/js/i, 'Google Analytics', 'Analytics & tracking'],
  [/connect\.facebook\.net|facebook\.com\/tr/i, 'Meta (Facebook) Pixel', 'Advertising'], [/googleadservices|doubleclick\.net|googlesyndication/i, 'Google Ads', 'Advertising'],
  [/hotjar\.com/i, 'Hotjar', 'Analytics & tracking'], [/clarity\.ms/i, 'Microsoft Clarity', 'Analytics & tracking'], [/snap\.licdn\.com|px\.ads\.linkedin/i, 'LinkedIn Insight', 'Advertising'],
  [/onesignal/i, 'OneSignal', 'Push notifications'], [/razorpay/i, 'Razorpay', 'Payments'], [/js\.stripe\.com/i, 'Stripe', 'Payments'], [/paypal\.com/i, 'PayPal', 'Payments'],
  [/recaptcha/i, 'Google reCAPTCHA', 'Security'], [/fonts\.googleapis|fonts\.gstatic/i, 'Google Fonts', 'Fonts & icons'], [/fontawesome|font-awesome/i, 'Font Awesome', 'Fonts & icons'],
  [/maps\.googleapis|google\.com\/maps/i, 'Google Maps', 'Maps'], [/youtube\.com|youtu\.be/i, 'YouTube embed', 'Media'], [/vimeo\.com/i, 'Vimeo embed', 'Media'],
  [/b-cdn\.net/i, 'Bunny CDN', 'CDN'], [/cloudfront\.net/i, 'Amazon CloudFront', 'CDN'], [/cdn\.jsdelivr\.net/i, 'jsDelivr', 'CDN'], [/cdnjs\.cloudflare\.com/i, 'cdnjs', 'CDN'], [/unpkg\.com/i, 'unpkg', 'CDN'],
  [/tawk\.to/i, 'Tawk.to chat', 'Live chat'], [/tidio/i, 'Tidio chat', 'Live chat'], [/intercom/i, 'Intercom', 'Live chat'], [/crisp\.chat/i, 'Crisp chat', 'Live chat'],
  [/hubspot/i, 'HubSpot', 'Marketing'], [/zoho/i, 'Zoho', 'Marketing'], [/mailchimp|list-manage/i, 'Mailchimp', 'Marketing'], [/calendly/i, 'Calendly', 'Scheduling'],
  [/wa\.me|api\.whatsapp|whatsapp/i, 'WhatsApp link/widget', 'Messaging'], [/sentry\.io/i, 'Sentry', 'Monitoring'], [/cloudflareinsights|cdn-cgi/i, 'Cloudflare', 'CDN'],
];
const LIBS = [
  [/owl\.carousel(?:[@/\-]v?([\d.]+))?/i, 'Owl Carousel'], [/slick(?:\.min)?\.js|slick-carousel/i, 'Slick slider'], [/swiper(?:[@/\-]v?([\d.]+))?/i, 'Swiper'],
  [/aos(?:\.min)?\.(?:js|css)|aos@([\d.]+)/i, 'AOS (animate on scroll)'], [/wow(?:\.min)?\.js/i, 'WOW.js'], [/magnific/i, 'Magnific Popup'], [/fancybox/i, 'Fancybox'],
  [/select2/i, 'Select2'], [/datatables/i, 'DataTables'], [/chart(?:\.umd)?(?:\.min)?\.js|chart\.js/i, 'Chart.js'], [/d3(?:\.v\d)?(?:\.min)?\.js/i, 'D3.js'], [/three(?:\.min)?\.js/i, 'Three.js'],
  [/gsap|TweenMax/i, 'GSAP'], [/animate\.css|animate(?:\.min)?\.css/i, 'Animate.css'], [/lodash/i, 'Lodash'], [/moment(?:\.min)?\.js/i, 'Moment.js'], [/axios/i, 'Axios'],
  [/alpine(?:\.min)?\.js|alpinejs/i, 'Alpine.js'], [/htmx/i, 'htmx'], [/cdn\.tailwindcss\.com/i, 'Tailwind CSS (CDN)'], [/popper(?:\.min)?\.js|@popperjs/i, 'Popper.js'],
  [/jquery-migrate(?:[@/\-.]v?([\d.]+))?/i, 'jQuery Migrate'], [/jquery-ui|jqueryui/i, 'jQuery UI'], [/lazysizes|lazyload/i, 'Lazy loading library'], [/webfont/i, 'WebFont Loader'],
];

export async function stack(cfg) {
  const out = [], seen = new Set();
  const add = (cat, name, ver, ev, status = 'info') => { const k = cat + name; if (seen.has(k)) return; seen.add(k); out.push(res(name + (ver ? ' ' + ver : ''), status, ev || '', cat)); };
  const warn = (cat, name, why) => out.push(res(name, 'warn', why, cat));

  const reqs = new Set();
  let headers = {}, html = '', g = {}, cookies = [];
  await withPage(cfg, async (page, ctx) => {
    page.on('request', (r) => reqs.add(r.url()));
    let r = await page.goto(cfg.url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null);
    if (!r) r = await go(page, cfg.url, 'load').catch(() => null);
    headers = r ? await r.allHeaders() : {};
    html = await page.content();
    g = await page.evaluate(() => ({
      jquery: window.jQuery?.fn?.jquery || '', react: !!(window.React || document.querySelector('[data-reactroot]') || [...document.querySelectorAll('body *')].slice(0, 200).some((e) => Object.keys(e).some((k) => k.startsWith('__reactContainer')))),
      reactV: window.React?.version || '', vue: !!(window.Vue || document.querySelector('[data-v-app]')), vueV: window.Vue?.version || '',
      angular: document.querySelector('[ng-version]')?.getAttribute('ng-version') || '', angularJS: window.angular?.version?.full || '',
      next: !!window.__NEXT_DATA__, nuxt: !!window.__NUXT__, svelte: !!document.querySelector('[class*="svelte-"]'),
      bootstrap: window.bootstrap?.Tooltip?.VERSION || '', generator: document.querySelector('meta[name=generator]')?.content || '',
      proto: performance.getEntriesByType('navigation')[0]?.nextHopProtocol || '',
    }));
    cookies = await ctx.cookies();
  });
  const urls = [...reqs], blob = urls.join('\n') + '\n' + html;
  const H = (k) => headers[k] || '';

  // --- web server, language, hosting
  const server = H('server');
  if (server) { const m = server.match(/^([A-Za-z\-_ ]+)\/?([\d.]+)?/); add('Web server', m?.[1]?.trim() || server, m?.[2], 'Server header: ' + server); }
  const xpb = H('x-powered-by');
  if (xpb) add('Language / runtime', xpb.split('/')[0], xpb.split('/')[1], 'X-Powered-By: ' + xpb);
  const php = (xpb.match(/PHP\/([\d.]+)/i) || [])[1];
  if (php || cookies.some((c) => c.name === 'PHPSESSID') || /\.php[?"']/i.test(html)) add('Language / runtime', 'PHP', php, php ? 'X-Powered-By header' : 'PHPSESSID cookie or .php URLs');
  if (php && verLt(php, '8.2')) warn('Language / runtime', `PHP ${php} is out of security support`, 'Upgrade to a supported PHP version (see php.net/supported-versions).');
  if (H('x-aspnet-version') || cookies.some((c) => /ASP\.NET_SessionId/i.test(c.name))) add('Language / runtime', 'ASP.NET', H('x-aspnet-version'), 'header/cookie');
  if (cookies.some((c) => c.name === 'csrftoken') || /gunicorn|Werkzeug|uvicorn/i.test(server)) add('Language / runtime', 'Python', '', 'csrftoken cookie / server header');
  if (/Express/i.test(xpb)) add('Language / runtime', 'Node.js (Express)', '', 'X-Powered-By');
  if (cookies.some((c) => c.name === 'laravel_session')) add('Framework', 'Laravel', '', 'laravel_session cookie');
  if (H('x-runtime') || cookies.some((c) => /_session$/.test(c.name) && /rack|rails/i.test(H('server')))) add('Language / runtime', 'Ruby on Rails', '', 'x-runtime header');

  // --- CDN / proxy
  if (H('cf-ray') || /cloudflare/i.test(server)) add('CDN / proxy', 'Cloudflare', '', 'cf-ray / server header');
  if (H('x-amz-cf-id') || /cloudfront/i.test(H('via'))) add('CDN / proxy', 'Amazon CloudFront', '', 'x-amz-cf-id / via');
  if (/BunnyCDN/i.test(server) || /b-cdn\.net/i.test(blob)) add('CDN / proxy', 'Bunny CDN', '', 'server header / asset URLs');
  if (H('x-vercel-id')) add('Hosting', 'Vercel', '', 'x-vercel-id'); if (H('x-nf-request-id')) add('Hosting', 'Netlify', '', 'x-nf-request-id');
  if (/fastly/i.test(H('x-served-by') + H('via'))) add('CDN / proxy', 'Fastly', '', 'x-served-by');
  if (/litespeed/i.test(server + H('x-litespeed-cache') + H('x-turbo-charged-by'))) add('Web server', 'LiteSpeed', '', 'server/x-litespeed headers');

  // --- CMS & platforms
  const gen = g.generator;
  if (/wp-content|wp-includes|\/wp-json\//i.test(blob) || /WordPress/i.test(gen)) {
    const v = (gen.match(/WordPress ([\d.]+)/i) || [])[1];
    add('CMS / platform', 'WordPress', v, gen ? 'generator meta tag' : 'wp-content paths');
    if (v) warn('CMS / platform', `WordPress version ${v} is publicly visible`, 'Remove the generator tag so attackers cannot target the exact version.');
    const theme = (blob.match(/wp-content\/themes\/([^/'"?]+)/i) || [])[1]; if (theme) add('CMS / platform', 'WordPress theme: ' + theme, '', 'asset paths');
    const plugins = [...new Set([...blob.matchAll(/wp-content\/plugins\/([^/'"?]+)/gi)].map((m) => m[1]))];
    if (plugins.length) add('CMS / platform', `WordPress plugins (${plugins.length})`, '', plugins.slice(0, 15).join(', '));
    if (/Yoast SEO/i.test(html)) add('SEO tooling', 'Yoast SEO', '', 'HTML comment'); if (/Rank Math/i.test(html)) add('SEO tooling', 'Rank Math', '', 'HTML comment');
    if (/WP Rocket|wp-rocket/i.test(blob)) add('Performance tooling', 'WP Rocket', '', 'asset paths'); if (/elementor/i.test(blob)) add('CMS / platform', 'Elementor page builder', '', 'asset paths');
    if (/woocommerce/i.test(blob)) add('CMS / platform', 'WooCommerce', '', 'asset paths');
  }
  const cms = [[/Joomla!|\/media\/jui\//i, 'Joomla'], [/Drupal\.settings|sites\/default\/files/i, 'Drupal'], [/cdn\.shopify\.com|Shopify\.theme/i, 'Shopify'], [/wixstatic\.com|X-Wix/i, 'Wix'],
    [/squarespace/i, 'Squarespace'], [/webflow/i, 'Webflow'], [/Mage\.Cookies|\/static\/version\d+/i, 'Magento'], [/prestashop/i, 'PrestaShop'], [/ghost\/api|content="Ghost/i, 'Ghost']];
  for (const [re, n] of cms) if (re.test(blob)) add('CMS / platform', n, '', 'page markup / asset URLs');

  // --- front-end frameworks & libraries
  if (g.next) add('Front-end framework', 'Next.js', '', '__NEXT_DATA__'); else if (g.react) add('Front-end framework', 'React', g.reactV, 'React root / globals');
  if (g.nuxt) add('Front-end framework', 'Nuxt', '', '__NUXT__'); else if (g.vue) add('Front-end framework', 'Vue.js', g.vueV, 'Vue globals');
  if (g.angular) add('Front-end framework', 'Angular', g.angular, 'ng-version attribute');
  if (g.angularJS) { add('Front-end framework', 'AngularJS', g.angularJS, 'window.angular'); warn('Front-end framework', `AngularJS ${g.angularJS} is end-of-life`, 'Migrate to a supported framework.'); }
  if (g.svelte) add('Front-end framework', 'Svelte', '', 'svelte-* classes');
  if (g.jquery) { add('JavaScript libraries', 'jQuery', g.jquery, 'window.jQuery'); if (verLt(g.jquery, '3.5.0')) warn('JavaScript libraries', `jQuery ${g.jquery} has known XSS vulnerabilities`, 'Upgrade to jQuery 3.5.0 or newer (CVE-2020-11022/11023).'); }
  const bs = g.bootstrap || (blob.match(/bootstrap[@/\-]v?(\d+\.\d+\.\d+)/i) || [])[1] || (html.match(/Bootstrap v(\d+\.\d+\.\d+)/i) || [])[1];
  if (bs || /bootstrap(\.min)?\.(css|js)/i.test(blob)) { add('CSS framework', 'Bootstrap', bs, 'asset URL / global'); if (bs && verLt(bs, '4.0.0')) warn('CSS framework', `Bootstrap ${bs} is end-of-life`, 'Upgrade to Bootstrap 5.'); }
  if (/tailwind/i.test(blob) && !seen.has('CSS frameworkTailwind CSS (CDN)')) add('CSS framework', 'Tailwind CSS', '', 'asset URL');
  for (const [re, n] of LIBS) { const m = blob.match(re); if (m) add('JavaScript libraries', n, m[1], 'asset URL'); }

  // --- third-party services
  for (const [re, n, cat] of THIRD_PARTY) if (re.test(blob)) add(cat === 'CDN' ? 'CDN / proxy' : 'Third-party services: ' + cat, n, '', 'requests / markup');

  // --- delivery
  const enc = H('content-encoding');
  out.push(res('HTTP protocol', 'info', { h2: 'HTTP/2', h3: 'HTTP/3', 'http/1.1': 'HTTP/1.1' }[g.proto] || g.proto || 'unknown', 'Delivery'));
  out.push(res('Compression', enc ? 'pass' : 'warn', enc ? 'Content-Encoding: ' + enc : 'HTML is not compressed (enable gzip or brotli)', 'Delivery'));
  out.push(res('HSTS', H('strict-transport-security') ? 'pass' : (cfg.url.startsWith('https') ? 'warn' : 'info'), H('strict-transport-security') || 'not set', 'Delivery'));

  // --- source folder (local projects)
  if (cfg.folder && fs.existsSync(cfg.folder)) out.push(...sourceStack(cfg.folder));
  if (!out.some((r) => r.status === 'info' && !/HTTP protocol/.test(r.name))) out.unshift(res('No known technologies fingerprinted', 'info', 'Likely hand-written HTML/CSS/JS with no detectable framework.', 'Summary'));
  return out;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', 'wp-admin', 'wp-includes', '.idea', '.vscode', 'dist', 'build', '__pycache__']);
function walk(root, max = 6000) {
  const files = []; const stack = [root];
  while (stack.length && files.length < max) {
    const d = stack.pop(); let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) stack.push(p); } else files.push(p); }
  }
  return files;
}
function sourceStack(folder) {
  const out = [], C = 'Source code (local folder)', has = (f) => fs.existsSync(path.join(folder, f));
  const files = walk(folder), ext = {};
  for (const f of files) { const e = path.extname(f).toLowerCase(); ext[e] = (ext[e] || 0) + 1; }
  const L = { '.php': 'PHP', '.html': 'HTML', '.js': 'JavaScript', '.css': 'CSS', '.py': 'Python', '.ts': 'TypeScript', '.tsx': 'TSX/React', '.jsx': 'JSX/React', '.vue': 'Vue', '.rb': 'Ruby', '.java': 'Java', '.cs': 'C#', '.go': 'Go', '.sql': 'SQL', '.scss': 'Sass' };
  const langs = Object.entries(L).filter(([e]) => ext[e]).map(([e, n]) => `${n} (${ext[e]} files)`);
  out.push(res('Languages by file count', 'info', langs.join(', ') || 'none detected', C));
  if (has('wp-config.php') || has('wp-content')) out.push(res('WordPress installation', 'info', 'wp-config.php / wp-content found', C));
  if (has('artisan')) out.push(res('Laravel project', 'info', 'artisan found', C));
  if (has('manage.py')) out.push(res('Django project', 'info', 'manage.py found', C));
  if (has('Gemfile')) out.push(res('Ruby project', 'info', 'Gemfile found', C));
  if (has('pom.xml') || has('build.gradle')) out.push(res('Java project', 'info', 'Maven/Gradle build file found', C));
  for (const pj of ['package.json', 'composer.json']) if (has(pj)) {
    try { const j = JSON.parse(fs.readFileSync(path.join(folder, pj), 'utf8')); const deps = Object.entries({ ...j.require, ...j.dependencies }).map(([k, v]) => `${k}@${v}`);
      out.push(res(`${pj}: ${j.name || 'unnamed'}`, 'info', deps.slice(0, 20).join(', ') + (deps.length > 20 ? ` … +${deps.length - 20} more` : ''), C)); } catch { /* bad json */ }
  }
  if (has('.htaccess')) out.push(res('Apache .htaccess present', 'info', 'URL rewriting / server rules in use', C));
  return out;
}

// =====================================================================  SEO – SITE LEVEL
export async function seoSite(cfg) {
  const o = originOf(cfg.url), out = [], T = 'Technical SEO', host = new URL(cfg.url).hostname;
  // robots.txt
  const rr = await get(o + '/robots.txt'); let sitemapUrls = [];
  if (!rr || rr.status !== 200) out.push(res('robots.txt', 'warn', 'missing — add one that points to your sitemap', T));
  else {
    const t = await rr.text(); let ua = '', blocksAll = false;
    for (const line of t.split(/\r?\n/)) { const l = line.split('#')[0].trim(); const m = l.match(/^(user-agent|disallow|sitemap):\s*(.*)$/i); if (!m) continue;
      const k = m[1].toLowerCase(); if (k === 'user-agent') ua = m[2].trim(); else if (k === 'disallow' && ua === '*' && m[2].trim() === '/') blocksAll = true; else if (k === 'sitemap') sitemapUrls.push(m[2].trim()); }
    out.push(res('robots.txt', blocksAll ? 'fail' : 'pass', blocksAll ? 'Disallow: / blocks ALL crawlers' : `found (${t.split('\n').length} lines)`, T));
    out.push(res('Sitemap declared in robots.txt', sitemapUrls.length ? 'pass' : 'warn', sitemapUrls[0] || 'no Sitemap: line', T));
  }
  // sitemap.xml
  const smUrl = sitemapUrls[0] || o + '/sitemap.xml'; const sm = await get(smUrl);
  if (!sm || sm.status !== 200) out.push(res('XML sitemap', 'warn', `${smUrl} not reachable (${sm?.status || 'no response'})`, T));
  else {
    let xml = await sm.text(); const subs = [...xml.matchAll(/<loc>\s*([^<]+\.xml)\s*<\/loc>/g)].map((m) => m[1].trim());
    for (const s of subs.slice(0, 6)) xml += await get(s).then((x) => x?.text()).catch(() => '') || '';
    const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]).filter((u) => !u.endsWith('.xml'));
    out.push(res('XML sitemap', locs.length ? 'pass' : 'fail', `${locs.length} URL(s) listed${subs.length ? ` across ${subs.length} sitemap file(s)` : ''}`, T));
    const hosts = [...new Set(locs.map((u) => { try { return new URL(u).hostname; } catch { return 'invalid'; } }))];
    out.push(res('Sitemap URLs use one consistent domain', hosts.length <= 1 || (hosts.length === 2 && hosts.every((h) => h.replace(/^www\./, '') === host.replace(/^www\./, ''))) ? 'pass' : 'warn', hosts.join(', '), T));
    if (!/<lastmod>/i.test(xml)) out.push(res('Sitemap <lastmod> dates', 'warn', 'no lastmod values', T));
    const sample = locs.filter((_, i) => i % Math.max(1, Math.floor(locs.length / 8)) === 0).slice(0, 8), bad = [];
    for (const u of sample) { const r = await get(u, { method: 'HEAD', redirect: 'manual' }); if (!r || r.status >= 300) bad.push(`${r?.status || 'ERR'} ${u}`); }
    if (sample.length) out.push(res(`Sitemap URLs resolve (${sample.length} sampled)`, bad.length ? 'fail' : 'pass', bad.join('; '), T));
  }
  // redirects
  if (!isLocal(cfg.url) && cfg.url.startsWith('https')) {
    const h = await get('http://' + host + '/', { redirect: 'manual', timeout: 8000 });
    out.push(res('HTTP redirects to HTTPS', h && [301, 308].includes(h.status) && /^https:/i.test(h.headers.get('location') || '') ? 'pass' : 'warn', h ? `${h.status} → ${h.headers.get('location') || '—'}` : 'http:// not reachable', T));
    const alt = host.startsWith('www.') ? host.slice(4) : 'www.' + host, a = await get('https://' + alt + '/', { redirect: 'manual', timeout: 8000 });
    out.push(res('www / non-www consolidated', a && [301, 308].includes(a.status) ? 'pass' : a ? 'warn' : 'info', a ? `${alt} → ${a.status} ${a.headers.get('location') || ''}` : `${alt} does not resolve`, T));
  }
  // 404 behaviour + favicon
  const nf = await get(o + '/qa-missing-' + Math.random().toString(36).slice(2, 8), { redirect: 'manual' });
  out.push(res('Missing pages return a real 404', nf?.status === 404 ? 'pass' : 'fail', nf ? `status ${nf.status}${nf.status === 200 ? ' (soft 404 — search engines may index junk URLs)' : ''}` : 'no response', T));
  const fav = await get(o + '/favicon.ico', { method: 'HEAD' });
  out.push(res('favicon.ico', fav?.status === 200 ? 'pass' : 'warn', fav ? String(fav.status) : 'not reachable', T));
  return out;
}

// =====================================================================  SEO – PAGE LEVEL
export async function seoPage(cfg) {
  return withPage(cfg, async (page) => {
    const out = [], resp = []; let mainH = {};
    page.on('response', (r) => resp.push({ url: r.url(), h: r.headers(), s: r.status() }));
    const r = await page.goto(cfg.url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(800);
    mainH = r ? await r.allHeaders() : {};
    const d = await page.evaluate(() => {
      const t = (s) => document.querySelector(s)?.content || '';
      const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => +h.tagName[1]);
      const imgs = [...document.images];
      const as = [...document.querySelectorAll('a[href]')];
      const origin = location.origin;
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent);
      return {
        headings: hs, words: (document.body.innerText || '').trim().split(/\s+/).filter(Boolean).length, nodes: document.querySelectorAll('*').length,
        canonical: document.querySelector('link[rel=canonical]')?.href || '', lang: document.documentElement.lang, hreflang: document.querySelectorAll('link[hreflang]').length,
        og: ['title', 'description', 'image', 'url'].filter((k) => !t(`meta[property="og:${k}"]`)), tw: t('meta[name="twitter:card"]'),
        icon: !!document.querySelector('link[rel~=icon]'), apple: !!document.querySelector('link[rel=apple-touch-icon]'),
        img: { total: imgs.length, lazy: imgs.filter((i) => i.loading === 'lazy').length, modern: imgs.filter((i) => /\.(webp|avif)(\?|$)/i.test(i.currentSrc || i.src)).length, noDim: imgs.filter((i) => !i.getAttribute('width') && !i.getAttribute('height') && !i.style.width).length },
        links: { internal: as.filter((a) => a.href.startsWith(origin)).length, external: as.filter((a) => /^https?:/.test(a.href) && !a.href.startsWith(origin)).length,
          empty: as.filter((a) => !(a.textContent || '').trim() && !a.getAttribute('aria-label') && !a.querySelector('img[alt]:not([alt=""])')).length,
          generic: as.filter((a) => /^(click here|read more|more|here|learn more)$/i.test((a.textContent || '').trim())).length,
          blank: as.filter((a) => a.target === '_blank' && !/noopener|noreferrer/i.test(a.rel) && !a.href.startsWith(origin)).length, hash: as.filter((a) => a.getAttribute('href') === '#').length },
        tel: [...document.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute('href').slice(4)),
        crumb: !!document.querySelector('[aria-label*="readcrumb" i], .breadcrumb, .breadcrumbs, [itemtype*="BreadcrumbList"]'),
        ld, ttfb: Math.round(performance.getEntriesByType('navigation')[0]?.responseStart || 0),
      };
    });
    // headings
    const skips = []; d.headings.forEach((h, i) => { if (i && h - d.headings[i - 1] > 1) skips.push(`h${d.headings[i - 1]}→h${h}`); });
    out.push(res('Heading hierarchy', skips.length ? 'warn' : 'pass', skips.length ? 'skipped levels: ' + [...new Set(skips)].join(', ') : `${d.headings.length} headings in order`, 'On-page SEO'));
    out.push(res('Page content length', d.words >= 300 ? 'pass' : 'warn', `${d.words} words${d.words < 300 ? ' — thin content (aim for 300+ on landing pages)' : ''}`, 'Content'));
    const cu = d.canonical.replace(/\/$/, ''), pu = page.url().replace(/\/$/, '').split('#')[0];
    out.push(res('Canonical points to this page', !d.canonical ? 'warn' : cu === pu ? 'pass' : 'warn', d.canonical || 'missing' + (cu && cu !== pu ? ` (page is ${pu})` : ''), 'On-page SEO'));
    out.push(res('Open Graph tags complete', d.og.length ? 'warn' : 'pass', d.og.length ? 'missing og:' + d.og.join(', og:') : 'title, description, image, url', 'Social'));
    out.push(res('Twitter/X card', d.tw ? 'pass' : 'warn', d.tw || 'missing twitter:card', 'Social'));
    out.push(res('Favicon & touch icon', d.icon ? (d.apple ? 'pass' : 'warn') : 'warn', `${d.icon ? 'icon ✓' : 'icon ✗'}, ${d.apple ? 'apple-touch-icon ✓' : 'apple-touch-icon ✗'}`, 'Social'));
    if (d.hreflang) out.push(res('hreflang tags', 'info', `${d.hreflang} alternate language link(s)`, 'On-page SEO'));
    // images
    out.push(res('Modern image formats (WebP/AVIF)', d.img.total && d.img.modern / d.img.total < 0.5 ? 'warn' : 'pass', `${d.img.modern}/${d.img.total} images`, 'Images'));
    out.push(res('Images declare width/height (prevents layout shift)', d.img.noDim > d.img.total * 0.3 ? 'warn' : 'pass', `${d.img.noDim}/${d.img.total} without dimensions`, 'Images'));
    out.push(res('Below-the-fold images lazy-loaded', d.img.total > 6 && d.img.lazy < d.img.total * 0.3 ? 'warn' : 'pass', `${d.img.lazy}/${d.img.total} use loading="lazy"`, 'Images'));
    // links
    out.push(res('Links', 'info', `${d.links.internal} internal, ${d.links.external} external`, 'Links'));
    out.push(res('Links have descriptive text', d.links.empty || d.links.generic > 3 ? 'warn' : 'pass', `${d.links.empty} empty links, ${d.links.generic} generic ("read more"/"click here")`, 'Links'));
    out.push(res('External links opened safely (rel=noopener)', d.links.blank ? 'warn' : 'pass', d.links.blank ? `${d.links.blank} target=_blank link(s) without rel="noopener"` : 'all safe', 'Links'));
    if (d.links.hash > 2) out.push(res('Placeholder links (href="#")', 'warn', `${d.links.hash} links go nowhere`, 'Links'));
    // schema
    const types = [], errs = [], pageHost = new URL(page.url()).hostname.replace(/^www\./, ''), foreign = new Set(); let schemaTel = [];
    const visit = (n) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(visit);
      if (n['@type']) [].concat(n['@type']).forEach((t) => types.push(t)); if (n.telephone) schemaTel.push(digits(n.telephone));
      for (const [k, v] of Object.entries(n)) { if (['url', '@id'].includes(k) && typeof v === 'string' && /^https?:/.test(v)) { try { const h = new URL(v).hostname.replace(/^www\./, ''); if (h !== pageHost && !isLocal(page.url())) foreign.add(h); } catch { /* */ } } visit(v); } };
    d.ld.forEach((txt, i) => { try { visit(JSON.parse(txt)); } catch (e) { errs.push(`block ${i + 1}: ${e.message.slice(0, 50)}`); } });
    out.push(res('Structured data (JSON-LD) is valid JSON', errs.length ? 'fail' : d.ld.length ? 'pass' : 'warn', errs.length ? errs.join('; ') : d.ld.length ? `${d.ld.length} block(s)` : 'none found', 'Structured data'));
    if (types.length) out.push(res('Schema types present', 'info', [...new Set(types)].join(', '), 'Structured data'));
    if (foreign.size) out.push(res('Schema URLs match this domain', 'warn', 'points to: ' + [...foreign].slice(0, 4).join(', '), 'Structured data'));
    const depth = new URL(page.url()).pathname.split('/').filter(Boolean).length;
    if (depth >= 1) out.push(res('BreadcrumbList schema', types.includes('BreadcrumbList') ? 'pass' : d.crumb ? 'warn' : 'info', types.includes('BreadcrumbList') ? 'present' : d.crumb ? 'breadcrumbs shown on page but no BreadcrumbList schema' : 'no breadcrumbs on this inner page', 'Structured data'));
    if (types.some((t) => /Organization|LocalBusiness|ProfessionalService/i.test(t)) === false && depth === 0) out.push(res('Organization / LocalBusiness schema on home page', 'warn', 'missing', 'Structured data'));
    // contact consistency
    const tels = [...new Set(d.tel.map(digits))].filter(Boolean);
    out.push(res('Phone numbers consistent', tels.length > 2 ? 'warn' : 'pass', tels.length ? `${tels.length} distinct number(s) in tel: links: ${tels.join(', ')}` : 'no tel: links', 'Contact details'));
    if (schemaTel.length && tels.length && !schemaTel.some((t) => tels.includes(t))) out.push(res('Schema telephone matches visible phone', 'warn', `schema ${schemaTel[0]} vs page ${tels.join(', ')}`, 'Contact details'));
    // performance
    const bytes = resp.reduce((n, x) => n + Number(x.h['content-length'] || 0), 0), stat = resp.filter((x) => /\.(css|js|png|jpe?g|webp|svg|woff2?|gif)(\?|$)/i.test(x.url) && x.url.startsWith(originOf(page.url())));
    const noCache = stat.filter((x) => !x.h['cache-control'] && !x.h.expires).length;
    out.push(res('Server response time (TTFB)', d.ttfb < 800 ? 'pass' : d.ttfb < 1800 ? 'warn' : 'fail', `${d.ttfb} ms`, 'Performance'));
    out.push(res('Page weight (reported sizes)', bytes > 4e6 ? 'warn' : 'pass', `${(bytes / 1e6).toFixed(2)} MB across ${resp.length} requests`, 'Performance'));
    out.push(res('DOM size', d.nodes > 1800 ? 'warn' : 'pass', `${d.nodes} elements${d.nodes > 1800 ? ' (heavy — slows rendering)' : ''}`, 'Performance'));
    out.push(res('HTML compressed', mainH['content-encoding'] ? 'pass' : 'warn', mainH['content-encoding'] || 'no gzip/brotli', 'Performance'));
    out.push(res('Static assets have cache headers', stat.length && noCache > stat.length * 0.5 ? 'warn' : 'pass', `${noCache}/${stat.length} same-origin assets without Cache-Control/Expires`, 'Performance'));
    return out;
  });
}

// =====================================================================  SECURITY
const HEADERS = [['strict-transport-security', 'HSTS (Strict-Transport-Security)', true], ['content-security-policy', 'Content-Security-Policy', false], ['x-frame-options', 'X-Frame-Options / frame-ancestors', false],
  ['x-content-type-options', 'X-Content-Type-Options', false], ['referrer-policy', 'Referrer-Policy', false], ['permissions-policy', 'Permissions-Policy', false]];
const PROBES = [
  ['/.env', (t) => /^[A-Z][A-Z0-9_]+\s*=/m.test(t), 'fail', 'Environment file with secrets is downloadable'], ['/.git/config', (t) => /\[core\]/.test(t), 'fail', 'Git repository is downloadable'],
  ['/phpinfo.php', (t) => /phpinfo\(\)|PHP Version/i.test(t), 'fail', 'phpinfo() page is public'], ['/info.php', (t) => /phpinfo\(\)|PHP Version/i.test(t), 'fail', 'phpinfo() page is public'],
  ['/error_log', () => true, 'fail', 'PHP error log is public'], ['/php_errorlog', () => true, 'fail', 'PHP error log is public'], ['/debug.log', () => true, 'fail', 'Debug log is public'],
  ['/wp-content/debug.log', () => true, 'fail', 'WordPress debug log is public'], ['/storage/logs/laravel.log', () => true, 'fail', 'Laravel log is public'],
  ['/wp-config.php.bak', () => true, 'fail', 'Config backup is public'], ['/wp-config.php~', () => true, 'fail', 'Config backup is public'], ['/wp-config.old', () => true, 'fail', 'Config backup is public'],
  ['/backup.zip', () => true, 'fail', 'Site backup is public'], ['/backup.sql', () => true, 'fail', 'Database dump is public'], ['/db.sql', () => true, 'fail', 'Database dump is public'], ['/dump.sql', () => true, 'fail', 'Database dump is public'],
  ['/.htpasswd', () => true, 'fail', 'Password file is public'], ['/.DS_Store', () => true, 'warn', 'Directory metadata file is public'], ['/composer.lock', (t) => /"packages"/.test(t), 'warn', 'Dependency list is public'],
  ['/package.json', (t) => /"(name|dependencies)"/.test(t), 'warn', 'package.json is public'], ['/test.php', () => true, 'warn', 'Leftover test script is public'], ['/server-status', (t) => /Apache Server Status/i.test(t), 'warn', 'Apache status page is public'],
  ['/xmlrpc.php', (t) => /XML-RPC server accepts POST/i.test(t), 'warn', 'WordPress XML-RPC is enabled (brute-force target)'], ['/readme.html', (t) => /WordPress/i.test(t), 'warn', 'WordPress readme reveals the version'],
  ['/wp-json/wp/v2/users', (t) => /"slug"/.test(t), 'warn', 'WordPress usernames are listed publicly'], ['/phpmyadmin/', (t) => /phpMyAdmin/i.test(t), 'warn', 'phpMyAdmin is reachable from the internet'], ['/adminer.php', () => true, 'warn', 'Adminer DB tool is public'],
];
const SECRET_RE = /(AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|sk_live_[0-9a-zA-Z]{20,}|(?:password|passwd|pwd|secret|api[_-]?key|token)['"]?\s*[:=>]+\s*['"][^'"\s]{8,}['"])/i;

export async function security(cfg) {
  const out = [], o = originOf(cfg.url), C = 'Security';
  const mixed = [], cookiesSeen = [];
  let headers = {}, html = '', pwHttp = false;
  await withPage(cfg, async (page, ctx) => {
    page.on('request', (r) => { if (cfg.url.startsWith('https') && r.url().startsWith('http://') && !isLocal(r.url())) mixed.push(r.url().slice(0, 90)); });
    const r = await page.goto(cfg.url, { waitUntil: 'load', timeout: 60000 }).catch(() => null);
    headers = r ? await r.allHeaders() : {}; html = await page.content();
    pwHttp = !cfg.url.startsWith('https') && !isLocal(cfg.url) && (await page.locator('input[type=password]').count()) > 0;
    cookiesSeen.push(...(await ctx.cookies()));
  });
  out.push(res('HTTPS in use', cfg.url.startsWith('https') ? 'pass' : isLocal(cfg.url) ? 'info' : 'fail', cfg.url.startsWith('https') ? 'yes' : isLocal(cfg.url) ? 'local development (http is fine)' : 'site served over http', C));
  for (const [h, label, httpsOnly] of HEADERS) {
    const has = headers[h] || (h === 'x-frame-options' && /frame-ancestors/i.test(headers['content-security-policy'] || ''));
    if (httpsOnly && !cfg.url.startsWith('https')) continue;
    out.push(res(label, has ? 'pass' : 'warn', has ? String(headers[h] || 'via CSP').slice(0, 80) : 'header not set', C));
  }
  const leak = [headers.server, headers['x-powered-by']].filter((v) => v && /\d+\.\d+/.test(v));
  out.push(res('Server version hidden', leak.length ? 'warn' : 'pass', leak.length ? 'discloses: ' + leak.join(' | ') : 'no version numbers in headers', C));
  out.push(res('No mixed content', mixed.length ? 'fail' : 'pass', mixed.slice(0, 4).join('; '), C));
  if (pwHttp) out.push(res('Password field on insecure page', 'fail', 'login form served over http', C));
  const bad = cookiesSeen.filter((c) => !c.httpOnly || (cfg.url.startsWith('https') && !c.secure) || c.sameSite === 'None' && !c.secure);
  if (cookiesSeen.length) out.push(res(`Cookie flags (${cookiesSeen.length} cookies)`, bad.length ? 'warn' : 'pass', bad.length ? bad.slice(0, 5).map((c) => `${c.name}: ${[!c.httpOnly && 'no HttpOnly', cfg.url.startsWith('https') && !c.secure && 'no Secure'].filter(Boolean).join('/')}`).join('; ') : 'HttpOnly/Secure set', C));
  const sec = html.match(SECRET_RE);
  out.push(res('No secrets in page source', sec ? 'fail' : 'pass', sec ? 'possible credential/key in HTML: ' + sec[0].slice(0, 12) + '… (masked)' : 'none matched', C));

  // exposed files — reads at most 4 KB per path
  const base = await peek(o + '/qa-missing-' + Math.random().toString(36).slice(2, 8)), found = [];
  const results = await Promise.all(PROBES.map(async ([p, valid, sev, msg]) => {
    const r = await peek(o + p); if (!r || ![200, 206].includes(r.status)) return null;
    const ct = r.headers.get('content-type') || '';
    if (base && base.status === 200 && r.text.slice(0, 300) === base.text.slice(0, 300)) return null;           // soft-404 page
    if (/html/i.test(ct) && !/php|info|test|status|adminer|readme|users|xmlrpc|phpmyadmin/.test(p) && !/\.html?$/.test(p)) return null; // generic html = not the file
    if (!valid(r.text, r.headers)) return null;
    return [sev, `${p} — ${msg}${r.total > 5e6 ? ` (${(r.total / 1e6).toFixed(0)} MB!)` : ''}`];
  }));
  for (const f of results) if (f) found.push(f);
  for (const [sev, msg] of found) out.push(res(msg.split(' — ')[0], sev, msg.split(' — ').slice(1).join(' — '), 'Exposed files'));
  out.push(res(`Sensitive-path probe (${PROBES.length} paths)`, found.length ? (found.some((f) => f[0] === 'fail') ? 'fail' : 'warn') : 'pass', found.length ? `${found.length} exposed` : 'nothing exposed', 'Exposed files'));
  const sx = await get(o + '/.well-known/security.txt', { method: 'HEAD' });
  out.push(res('security.txt', sx?.status === 200 ? 'pass' : 'info', sx?.status === 200 ? 'present' : 'optional: lets researchers report issues', C));
  if (cfg.folder && fs.existsSync(cfg.folder)) out.push(...sourceSecurity(cfg.folder));
  return out;
}

// Local-folder only: stale files, oversized logs, secrets stored in the web root (mirrors the manual security review)
function sourceSecurity(folder) {
  const out = [], C = 'Source code (local folder)', files = walk(folder, 8000), rel = (f) => path.relative(folder, f).replace(/\\/g, '/');
  const logs = files.filter((f) => /(^|[\\/])(error_log|php_errorlog|debug\.log|.*\.log)$/i.test(f)).map((f) => ({ f, s: fs.statSync(f).size })).sort((a, b) => b.s - a.s);
  const big = logs.filter((l) => l.s > 5e6);
  out.push(res('Large log files in web root', big.length ? 'fail' : 'pass', big.length ? big.slice(0, 4).map((l) => `${rel(l.f)} (${(l.s / 1e6).toFixed(0)} MB)`).join('; ') : 'none over 5 MB', C));
  const risky = files.filter((f) => /(^|[\\/])(\.env|phpinfo\.php|info\.php|test\.php|adminer\.php|\.htpasswd)$|\.(sql|bak|old|orig|swp|zip|tar|gz)$/i.test(f) && !/[\\/](uploads|images|fonts)[\\/]/i.test(f));
  out.push(res('Stale / sensitive files in web root', risky.length ? 'warn' : 'pass', risky.slice(0, 12).map(rel).join('; ') + (risky.length > 12 ? ` … +${risky.length - 12}` : ''), C));
  const hits = [];
  for (const f of files) {
    if (!/\.(php|js|html?|json|ya?ml|ini|config|txt)$/i.test(f) || /[\\/](uploads|images|fonts|wp-content[\\/]plugins|js[\\/].*\.min\.js)/i.test(f) || /\.min\./i.test(f)) continue;
    let st; try { st = fs.statSync(f); } catch { continue; } if (st.size > 400000) continue;
    const m = fs.readFileSync(f, 'utf8').match(SECRET_RE); if (m) hits.push(`${rel(f)} (${m[0].slice(0, 14).replace(/['"]/g, '')}… masked)`);
    if (hits.length >= 15) break;
  }
  out.push(res('Credentials / keys in source files', hits.length ? 'fail' : 'pass', hits.length ? hits.join('; ') + ' — move to environment variables outside the web root' : 'none found in scanned files', C));
  out.push(res('Files scanned', 'info', `${files.length} files (node_modules, vendor, .git skipped)`, C));
  return out;
}

registerSuites({ stack, seoSite, seoPage, security });
