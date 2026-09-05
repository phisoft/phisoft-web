/**
 * sync-multilang-seo.mjs — idempotent multilingual-SEO normalizer.
 *
 * Runs over the root site, /ms (Bahasa Melayu) and /zh (中文) mirrors. For each
 * HTML page it sets <html lang>, its own-language canonical, og:url + og:locale,
 * and hreflang alternates (en / ms / zh + x-default) that point only at language
 * siblings which actually exist on disk (never hreflang a missing page).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const BASE = 'https://phisoft.my';
const LANGS = ['en', 'ms', 'zh'];
const LOCALE = { en: 'en_MY', ms: 'ms_MY', zh: 'zh_CN' };
const SLUG = { en: '', ms: 'ms/', zh: 'zh/' };

function collect() {
  const out = [];
  for (const lang of LANGS) {
    const base = lang === 'en' ? ROOT : join(ROOT, SLUG[lang]);
    if (!existsSync(base)) continue;
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name.startsWith('.')) continue;
        if (lang === 'en' && ['components', 'node_modules', 'ms', 'zh'].includes(e.name)) continue;
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.html')) out.push(p);
      }
    };
    walk(base);
  }
  return out;
}
const FILES = collect();                       // absolute
const ABS_SET = new Set(FILES.map((p) => p));

function relName(abs) { return abs.replace(ROOT, '').split(sep).join('/'); }
// EN-relative page key: strips the /ms- or /zh- prefix. 'index.html' stays for home.
function enRel(abs) { return relName(abs).replace(/^(ms|zh)\//, ''); }
function langOf(abs) {
  const r = relName(abs);
  if (r.startsWith('ms/')) return 'ms';
  if (r.startsWith('zh/')) return 'zh';
  return 'en';
}
// self (absolute) canonical URL for a page
function canonical(abs) {
  const r = relName(abs);
  const isIndex = /index\.html$/.test(r);
  if (isIndex) { const dir = r.slice(0, -'index.html'.length); return BASE + '/' + dir; }
  return BASE + '/' + r;
}
function siblingUrl(lang, enRel) {
  if (enRel.endsWith('index.html')) { const dir = enRel.slice(0, -'index.html'.length); return BASE + '/' + SLUG[lang] + dir; }
  return BASE + '/' + SLUG[lang] + enRel;
}
function siblingAbs(lang, enRel) {
  return lang === 'en' ? join(ROOT, enRel) : join(ROOT, SLUG[lang] + enRel);
}
function siblingExists(lang, enRel) { return ABS_SET.has(siblingAbs(lang, enRel)); }

async function main() {
  let changed = 0; let total = 0;
  for (const abs of FILES) {
    const r = relName(abs);
    const me = langOf(abs);
    const enRelPage = enRel(abs);
    const canonicalUrl = canonical(abs);
    const altLangs = LANGS.filter((l) => siblingExists(l, enRelPage));
    const hasAlt = altLangs.length > 1; // at least one other language present
    let html = await readFile(abs, 'utf8');
    // <html lang>
    html = /<html\b[^>]*lang=/.test(html)
      ? html.replace(/(<html\b[^>]*)lang="[^"]*"/, `$1lang="${me}"`)
      : html.replace('<html', `<html lang="${me}"`);
    // canonical
    html = /rel="canonical"/.test(html)
      ? html.replace(/<link rel="canonical" href="[^"]*"[^>]*>/, `<link rel="canonical" href="${canonicalUrl}">`)
      : html.replace('</head>', `  <link rel="canonical" href="${canonicalUrl}">\n</head>`);
    // og:url
    html = html.replace(/<meta[^>]*property="og:url"[^>]*>/, `<meta property="og:url" content="${canonicalUrl}">`);
    // og:locale — ensure exactly one, placed right after the canonical link
    const localeTag = `<meta property="og:locale" content="${LOCALE[me]}">`;
    if (!html.includes('property="og:locale"')) {
      html = html.replace(/<link rel="canonical" href="[^"]*"[^>]*>/, `$& ${localeTag}`);
    } else {
      html = html.replace(/<meta[^>]*property="og:locale"[^>]*>/, localeTag);
    }
    // hreflang alternates (only when a second language exists)
    if (hasAlt) {
      // drop any previously injected hreflang lines (idempotency)
      html = html.replace(/\s*<link rel="alternate" hreflang="[^"]*"[^>]*>\n?/g, '');
      const links = altLangs.map((l) => `<link rel="alternate" hreflang="${l}" href="${siblingUrl(l, enRelPage)}">`);
      const xd = altLangs.includes('en') ? `<link rel="alternate" hreflang="x-default" href="${siblingUrl('en', enRelPage)}">` : '';
      html = html.replace(/\s*<\/head>/, '\n  ' + links.join('\n  ') + (xd ? '\n  ' + xd : '') + '\n</head>');
    }
    if (html !== (await readFile(abs, 'utf8'))) { await writeFile(abs, html); changed++; }
    total++;
  }
  console.log(`Multilingual SEO synced: ${changed} changed of ${total} pages.`);
}
await main();
