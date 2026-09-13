import { readFileSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/**
 * Apply per-page SEO metadata to every language, and localise structured data.
 *
 * Titles and descriptions previously drifted: the English pages were
 * repositioned while the ms/ and zh/ pages kept English <meta description> and
 * English og:title next to a translated <title>. scripts/seo-data.json is the
 * single source of truth for those.
 *
 * Structured data is *localised in place* rather than replaced: a translated page
 * keeps its own ContactPage / BreadcrumbList / Service / LocalBusiness nodes, with
 * human-readable labels taken from scripts/schema-labels.json, page-level
 * name/description from seo-data.json, and absolute page URLs re-pointed at the
 * page's own language. A generic WebPage node is only added when a page has no
 * page-level node at all.
 *
 * Idempotent.
 */

const rootPath = new URL('../', import.meta.url).pathname;
const LANGS = ['ms', 'zh'];
const SITE = 'https://www.phisoft.my/';
const IN_LANGUAGE = { en: 'en-MY', ms: 'ms-MY', zh: 'zh-CN' };
const LABELS = JSON.parse(readFileSync(join(rootPath, 'scripts/schema-labels.json'), 'utf8'));
const data = JSON.parse(readFileSync(join(rootPath, 'scripts/seo-data.json'), 'utf8'));

// Types that describe the page itself (as opposed to an organisation, a
// breadcrumb trail or a product).
const PAGE_TYPES = new Set(['WebPage', 'ContactPage', 'AboutPage', 'CollectionPage', 'ItemPage', 'FAQPage', 'Article', 'BlogPosting', 'ProfilePage', 'Service']);
// Types that describe a thing rather than a page. Their URLs are language-neutral
// (the organisation is the same organisation), so they are never re-pointed.
const ENTITY_TYPES = new Set(['Organization', 'LocalBusiness', 'WebSite', 'Person', 'Brand']);

const textEscape = (s) => s.replaceAll('&', '&amp;');
const attrEscape = (s) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;');

function collect(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'components') return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? collect(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

/** Rewrite a phisoft.my *page* URL into the given language. Assets are left alone. */
function localiseUrl(value, lang) {
  if (lang === 'en' || !value.startsWith(SITE)) return value;
  const rest = value.slice(SITE.length);
  if (rest.startsWith('assets/')) return value;
  if (rest.startsWith(`${lang}/`) || rest === `${lang}/`) return value; // already localised
  return `${SITE}${lang}/${rest}`;
}

function localiseNode(node, ctx) {
  if (Array.isArray(node)) {
    node.forEach((child) => localiseNode(child, ctx));
    return;
  }
  if (!node || typeof node !== 'object') return;
  const isEntity = ENTITY_TYPES.has(node['@type']);
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string') {
      let out = value;
      if (key === 'name' || key === 'headline') {
        if (ctx.lang !== 'en' && LABELS[value]?.[ctx.lang]) out = LABELS[value][ctx.lang];
        if (ctx.lang !== 'en' && value === ctx.enTitle) out = ctx.title;
      }
      if (key === 'description' && ctx.lang !== 'en' && value === ctx.enDescription) out = ctx.description;
      if ((key === 'url' || key === '@id' || key === 'item') && !isEntity) out = localiseUrl(out, ctx.lang);
      node[key] = out;
    } else {
      localiseNode(value, ctx);
    }
  }
  // Correct an existing declaration rather than adding one: the pages copied from
  // English inherit inLanguage "en-MY", which is wrong for a translated page.
  if (typeof node.inLanguage === 'string') node.inLanguage = IN_LANGUAGE[ctx.lang];
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
  const ctx = { lang, title: entry.t, description: entry.d, enTitle: data[key].en.t, enDescription: data[key].en.d };

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

  // Localise the structured data the page already carries.
  let hasPageNode = false;
  html = html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (whole, open, body, close) => {
    let node;
    try { node = JSON.parse(body); } catch { return whole; }
    if (PAGE_TYPES.has(node['@type'])) hasPageNode = true;
    const localised = JSON.parse(JSON.stringify(node));
    localiseNode(localised, ctx);
    // Leave untouched blocks byte-for-byte: re-serialising every node would churn
    // the whole site's formatting for no reason.
    if (JSON.stringify(localised) === JSON.stringify(node)) return whole;
    return `${open}\n${JSON.stringify(localised, null, 2)}\n  ${close}`;
  });

  // Only fall back to a generic node when the page has nothing page-level. The
  // 404 page is noindex, so it gets none.
  if (!hasPageNode && !is404) {
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    const node = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: entry.t,
      description: entry.d,
      inLanguage: IN_LANGUAGE[lang],
      ...(canonical ? { url: canonical } : {}),
      isPartOf: { '@type': 'WebSite', name: 'Phisoft', url: SITE },
    };
    html = html.replace('</head>', `\n  <script type="application/ld+json">\n${JSON.stringify(node, null, 2)}\n  </script>\n</head>`);
    structured += 1;
  }

  if (html !== before) {
    await writeFile(path, html);
    applied += 1;
  }
}

console.log(`SEO metadata applied to ${applied} page(s); ${structured} page(s) gained a page-level node.`);
if (missing.length) {
  console.log(`No metadata entry for ${missing.length} page(s): ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}`);
}
