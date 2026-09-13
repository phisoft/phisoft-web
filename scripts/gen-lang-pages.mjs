import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Regenerate translated pages from the current English source.
 *
 * The ms/ and zh/ pages are translations of an *older* English revision: their
 * homepage still led with "Your IT team knows the business" while English had
 * been repositioned, and their section structure no longer matched. Patching
 * drift block by block is fragile, so instead we rebuild each translated page
 * from the English page plus a curated string map. Structure, classes, ids and
 * anchors are therefore always identical to English.
 *
 * scripts/lang-copy.json holds { page: { lang: { "English": "translation" } } }.
 * Only text nodes and a few human-facing attributes are translated — never
 * class/id/href/src, so markup cannot be corrupted by a stray match.
 *
 * After this runs, `npm run build` normalises chrome, assets, metadata and
 * hreflang, which is what makes the generated pages first-class.
 *
 * Usage: node scripts/gen-lang-pages.mjs
 */

const rootPath = new URL('../', import.meta.url).pathname;
const copy = JSON.parse(readFileSync(join(rootPath, 'scripts/lang-copy.json'), 'utf8'));
const BRANDS = new Set(['Phisoft', 'FeeCollec', 'QueueBos', '8planner', 'Assetsware', 'Dentallink', 'ComplainBos']);
const LANGS = ['ms', 'zh'];
const ATTRS = /(\s(?:alt|aria-label|title|placeholder)=")([^"]*)(")/g;

function makeTranslator(map) {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Whitespace runs in a key match any run of whitespace in the document, so a
  // string that wraps across lines still matches.
  const rules = Object.keys(map)
    .sort((a, b) => b.length - a.length)
    .map((key) => [new RegExp(escape(key).replace(/\s+/g, '\\s+'), 'g'), map[key]]);
  return (text) => {
    let out = text;
    for (const [re, value] of rules) out = out.replace(re, () => value);
    return out;
  };
}

let pages = 0;
let untranslated = 0;

for (const [page, perLang] of Object.entries(copy)) {
  if (page.startsWith('_')) continue;
  const enPath = join(rootPath, page);
  if (!existsSync(enPath)) throw new Error(`English source missing: ${page}`);
  const source = readFileSync(enPath, 'utf8');
  const depth = page.split('/').length; // +1 for the language folder
  const assetPrefix = '../'.repeat(depth);

  for (const lang of LANGS) {
    const map = perLang[lang];
    if (!map) continue;
    const translate = makeTranslator(map);

    let out = source;
    // Human-facing attributes only.
    out = out.replace(ATTRS, (_m, a, v, b) => `${a}${translate(v)}${b}`);
    // Text nodes only (between tags), so class/id/href are untouchable.
    out = out.replace(/(>)([^<]+)(<)/g, (_m, a, text, b) => `${a}${translate(text)}${b}`);
    // Assets live at the repo root, not inside each language folder, so every
    // local asset ref is re-prefixed from the target page's depth (the English
    // source may already carry its own ../ prefix).
    out = out.replace(/((?:src|href)=")((?:\.\.\/)*)(assets\/)/g, (_m, attr, _dots, rest) => `${attr}${assetPrefix}${rest}`);
    // Drop structured data: scripts/seo.mjs regenerates it per language.
    out = out.replace(/[ \t]*<script type="application\/ld\+json">[\s\S]*?<\/script>\s*\n?/g, '');

    const target = join(rootPath, lang, page);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, out);
    pages += 1;

    // Coverage: any English text node that survived inside <main> is either a
    // brand name or a string missing from the map. (Header/footer chrome is
    // English here by design - sync-layout swaps in the translated components.)
    const body = (html) => {
      const from = html.indexOf('<main');
      const to = html.indexOf('</main>');
      return from === -1 || to === -1 ? '' : html.slice(from, to);
    };
    const sourceText = new Set([...body(source).matchAll(/(>)([^<]+)(<)/g)].map((m) => m[2].trim()).filter((s) => s.length > 3));
    const leftovers = [...new Set([...body(out).matchAll(/(>)([^<]+)(<)/g)].map((m) => m[2].trim()))]
      .filter((s) => sourceText.has(s) && !BRANDS.has(s) && !/^[\d+·.,%\- ]+$/.test(s));
    if (leftovers.length) {
      untranslated += leftovers.length;
      console.log(`${lang}/${page}: ${leftovers.length} untranslated string(s) -> ${leftovers.slice(0, 4).join(' | ').slice(0, 160)}`);
    }
  }
}

console.log(`Generated ${pages} translated page(s); ${untranslated} untranslated string(s) remaining.`);
