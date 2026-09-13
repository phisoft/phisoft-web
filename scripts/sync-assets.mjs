import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/**
 * Normalise third-party asset loading and version local assets.
 *
 * Every page currently pulls Bootstrap, Phosphor, DM Sans and (on four pages)
 * AOS from public CDNs, even though self-hosted copies live under assets/vendor.
 * The mix differs per page, so caching fragments and the site breaks whenever a
 * CDN is slow or blocked. This script:
 *
 *   1. removes CDN <link>/<script> tags (and their preconnect hints),
 *   2. re-adds the equivalent self-hosted asset wherever one was removed,
 *   3. appends a content-hash ?v= to every local css/js reference, which
 *      replaces the ad-hoc ?v=contact-hero-v3 cache-buster on contact.html.
 *
 * Idempotent: re-running produces identical output.
 */

const rootPath = new URL('../', import.meta.url).pathname;
const CDN_HOSTS = /(?:cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)/;

function collect(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'components') return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? collect(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

const hashes = new Map();
function hashOf(relFromRoot) {
  if (!hashes.has(relFromRoot)) {
    const abs = join(rootPath, relFromRoot);
    hashes.set(relFromRoot, existsSync(abs) ? createHash('sha1').update(readFileSync(abs)).digest('hex').slice(0, 8) : 'missing');
  }
  return hashes.get(relFromRoot);
}

const pages = collect(rootPath);
let touched = 0;

for (const path of pages) {
  const route = relative(rootPath, path).split(sep).join('/');
  const depth = route.split('/').length - 1;
  const p = '../'.repeat(depth);
  let html = await readFile(path, 'utf8');
  const before = html;

  const hadCdnBootstrapCss = /cdn\.jsdelivr\.net\/npm\/bootstrap[^"]*\.min\.css/.test(html);
  const hadCdnBootstrapJs = /cdn\.jsdelivr\.net\/npm\/bootstrap[^"]*bundle\.min\.js/.test(html);
  const hadCdnPhosphor = /unpkg\.com\/@phosphor/.test(html);
  const hadGoogleFonts = /fonts\.googleapis\.com\/css2/.test(html);

  // 1. drop CDN stylesheets, scripts and their preconnect/prefetch hints
  html = html.replace(/[ \t]*<link\b[^>]*href="https?:\/\/[^"]*"[^>]*>\s*\n?/g, (tag) => (CDN_HOSTS.test(tag) ? '' : tag));
  html = html.replace(/[ \t]*<script\b[^>]*src="https?:\/\/[^"]*"[^>]*>\s*<\/script>\s*\n?/g, (tag) => (CDN_HOSTS.test(tag) ? '' : tag));

  // 2. re-add whatever we just removed, from assets/vendor
  const vendor = [];
  if (hadCdnBootstrapCss) vendor.push(`<link href="${p}assets/vendor/bootstrap/bootstrap.min.css" rel="stylesheet">`);
  if (hadCdnPhosphor) {
    vendor.push(`<link rel="stylesheet" href="${p}assets/vendor/phosphor/bold/style.css">`);
    vendor.push(`<link rel="stylesheet" href="${p}assets/vendor/phosphor/regular/style.css">`);
  }
  if (hadGoogleFonts) vendor.push(`<link href="${p}assets/vendor/dm-sans.css" rel="stylesheet">`);
  if (vendor.length) {
    const customCss = new RegExp(`[ \\t]*<link[^>]*href="${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}assets/css/custom\\.css[^"]*"[^>]*>`);
    if (!customCss.test(html)) throw new Error(`custom.css link not found in ${route}`);
    html = html.replace(customCss, (m) => `${vendor.join('\n    ')}\n    ${m.trimStart()}`);
  }

  if (hadCdnBootstrapJs) {
    html = html.replace(/<\/body>/, (m) => `<script src="${p}assets/vendor/bootstrap/bootstrap.bundle.min.js" defer></script>\n</body>`);
  }

  // 3. content-hash versioning for every local css/js reference
  html = html.replace(/((?:\.\.\/)*assets\/[\w./-]+\.(?:css|js))(\?v=[\w]+)?/g, (_m, ref) => {
    const relFromRoot = ref.replace(/^(?:\.\.\/)+/, '');
    return `${ref}?v=${hashOf(relFromRoot)}`;
  });

  // 4. the inline "contact hero safety layer" only existed to defeat stale CSS
  //    caching; real versioning above makes it redundant.
  html = html.replace(/\s*<style>\s*\/\* Contact hero safety layer[\s\S]*?<\/style>\s*/g, '\n    ');

  if (html !== before) {
    await writeFile(path, html);
    touched += 1;
  }
}

console.log(`Self-hosted assets normalised on ${touched} of ${pages.length} pages.`);
