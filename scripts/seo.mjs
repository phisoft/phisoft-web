import { readFileSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/**
 * Apply per-page SEO metadata to every language.
 *
 * Titles and descriptions previously drifted: the English pages were
 * repositioned while the ms/ and zh/ pages kept English <meta description> and
 * English og:title next to a translated <title>, and page metadata contradicted
 * the site's own positioning. scripts/seo-data.json is the single source of
 * truth; this script projects it onto all three languages and adds a WebPage
 * JSON-LD node to pages that have no structured data.
 *
 * Idempotent.
 */

const rootPath = new URL('../', import.meta.url).pathname;
const LANGS = ['ms', 'zh'];
const data = JSON.parse(readFileSync(join(rootPath, 'scripts/seo-data.json'), 'utf8'));

const textEscape = (s) => s.replaceAll('&', '&amp;');
const attrEscape = (s) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

function collect(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'components') return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? collect(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

let applied = 0;
let structured = 0;
const missing = [];

for (const path of collect(rootPath)) {
  const route = relative(rootPath, path).split(sep).join('/');
  const segments = route.split('/');
  const lang = LANGS.includes(segments[0]) ? segments[0] : 'en';
  const key = lang === 'en' ? route : segments.slice(1).join('/');
  const entry = data[key]?.[lang];
  if (!entry) { missing.push(route); continue; }

  const is404 = key === '404.html';
  const before = await readFile(path, 'utf8');
  let html = before;

  // <title>
  html = /<title>[\s\S]*?<\/title>/.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/, `<title>${textEscape(entry.t)}</title>`)
    : html.replace('</head>', `  <title>${textEscape(entry.t)}</title>\n</head>`);

  const setMeta = (matcher, tag) => {
    if (matcher.test(html)) html = html.replace(matcher, tag);
    else if (!is404) html = html.replace('</head>', `  ${tag}\n</head>`);
  };
  setMeta(/<meta[^>]*name="description"[^>]*>/, `<meta name="description" content="${attrEscape(entry.d)}">`);
  setMeta(/<meta[^>]*property="og:title"[^>]*>/, `<meta property="og:title" content="${attrEscape(entry.t)}">`);
  setMeta(/<meta[^>]*property="og:description"[^>]*>/, `<meta property="og:description" content="${attrEscape(entry.d)}">`);
  setMeta(/<meta[^>]*name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${attrEscape(entry.t)}">`);
  setMeta(/<meta[^>]*name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${attrEscape(entry.d)}">`);

  if (!html.includes('application/ld+json')) {
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    const node = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: entry.t,
      description: entry.d,
      inLanguage: lang === 'en' ? 'en-MY' : lang === 'ms' ? 'ms-MY' : 'zh-CN',
      ...(canonical ? { url: canonical } : {}),
      isPartOf: { '@type': 'WebSite', name: 'Phisoft', url: 'https://www.phisoft.my/' },
    };
    html = html.replace('</head>', `  <script type="application/ld+json">\n${JSON.stringify(node, null, 2)}\n  </script>\n</head>`);
    structured += 1;
  }

  if (html !== before) {
    await writeFile(path, html);
    applied += 1;
  }
}

console.log(`SEO metadata applied to ${applied} page(s); WebPage JSON-LD added to ${structured}.`);
if (missing.length) {
  console.log(`No metadata entry for ${missing.length} page(s): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}`);
}
