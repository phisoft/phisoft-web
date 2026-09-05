import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const root = resolve(new URL('../', import.meta.url).pathname);
const errors = [];

function collect(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || ['components', 'node_modules', 'ms', 'zh'].includes(entry.name)) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? collect(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

const pages = collect(root);
const publicPages = pages.filter((path) => !path.endsWith(`${sep}404.html`));
for (const path of pages) {
  const name = relative(root, path).split(sep).join('/');
  const html = readFileSync(path, 'utf8');
  const count = (pattern) => (html.match(pattern) || []).length;
  if (count(/<main\b/g) !== 1) errors.push(`${name}: expected one main element`);
  if (count(/<h1\b/g) !== 1 && name !== '404.html') errors.push(`${name}: expected one h1`);
  if (count(/<header class="ai-site-header/g) !== 1) errors.push(`${name}: shared header missing`);
  if (count(/<footer class="footer-area-wrapper/g) !== 1) errors.push(`${name}: shared footer missing`);
  if (count(/assets\/js\/site\.js/g) !== 1) errors.push(`${name}: expected one shared site script`);
  // 404.html is noindex and is not shareable-optimized: it still needs a title +
  // meta description, but not a canonical / Open Graph / Twitter block.
  const requiredMeta = ['<title>', 'name="description"'];
  if (name !== '404.html') {
    requiredMeta.push('rel="canonical"', 'property="og:title"', 'property="og:description"', 'property="og:url"', 'property="og:image"', 'name="twitter:card"');
  }
  for (const required of requiredMeta) {
    if (!html.includes(required)) errors.push(`${name}: missing metadata ${required}`);
  }
  const documentMarkup = html.replace(/<script\b[\s\S]*?<\/script>/g, '');
  const ids = [...documentMarkup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  for (const id of new Set(ids)) if (ids.filter((value) => value === id).length > 1) errors.push(`${name}: duplicate id #${id}`);
  for (const match of html.matchAll(/<(?:a|link)[^>]+href="([^"]+)"/g)) {
    const href = match[1];
    if (/^(?:https?:|mailto:|tel:|#)/.test(href)) continue;
    const [pathWithQuery, fragment] = href.split('#');
    const pathname = pathWithQuery.split('?')[0];
    const target = resolve(dirname(path), pathname || name);
    if (!existsSync(target)) errors.push(`${name}: missing ${href}`);
    else if (fragment && !readFileSync(target, 'utf8').includes(`id="${fragment}"`)) errors.push(`${name}: missing anchor ${href}`);
  }
  for (const match of html.matchAll(/<img\b([^>]*)>/g)) {
    if (!/\balt="[^"]*"/.test(match[1])) errors.push(`${name}: image missing alt text`);
  }
  for (const match of html.matchAll(/<a\b([^>]*target="_blank"[^>]*)>/g)) {
    if (!/\brel="[^"]*noopener/.test(match[1])) errors.push(`${name}: external target missing noopener`);
  }
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(match[1]); } catch (error) { errors.push(`${name}: invalid JSON-LD (${error.message})`); }
  }
}

const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>https:\/\/phisoft\.my\/(.*?)<\/loc>/g)].map((match) => match[1] || 'index.html');
const expectedUrls = publicPages.map((path) => relative(root, path).split(sep).join('/'));
for (const page of expectedUrls) if (!sitemapUrls.includes(page === 'index.html' ? 'index.html' : page)) errors.push(`sitemap: missing ${page}`);
for (const url of sitemapUrls) if (!expectedUrls.includes(url)) errors.push(`sitemap: unknown ${url}`);
if (new Set(sitemapUrls).size !== sitemapUrls.length) errors.push('sitemap: duplicate URLs');

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Validated ${pages.length} HTML pages and ${sitemapUrls.length} sitemap URLs.`);
