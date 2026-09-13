import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';

/**
 * Repoint translated in-page links at the translated tree.
 *
 * The ms/ and zh/ pages were mirrored from English sources and their internal
 * page links still carry the English-relative prefix, so from e.g. ms/index.html
 * a link of "../software.html" resolves to /software.html (English) instead of
 * /ms/software.html. Assets are fine — those genuinely live at the site root and
 * are left alone.
 *
 * Only .html links that resolve outside the current language folder are rewritten,
 * and only when the translated page actually exists. Idempotent: refs already
 * pointing inside the language folder are untouched, so re-running is a no-op.
 *
 * Usage: node scripts/fix-translation-links.mjs
 */

const projectRoot = new URL('../', import.meta.url);
const rootPath = projectRoot.pathname;
const LANGS = ['ms', 'zh'];

function collectHtml(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? collectHtml(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

function splitSuffix(ref) {
  const at = ref.search(/[?#]/);
  return at === -1 ? [ref, ''] : [ref.slice(0, at), ref.slice(at)];
}

let filesChanged = 0;
let linksChanged = 0;
const examples = [];

for (const lang of LANGS) {
  const other = LANGS.find((l) => l !== lang);
  for (const path of collectHtml(join(rootPath, lang))) {
    const route = relative(rootPath, path).split(sep).join('/');
    const pageDir = posix.dirname(route);
    const html = await readFile(path, 'utf8');
    let touched = 0;

    const next = html.replace(/href="([^"]+)"/g, (match, ref) => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(ref)) return match;
      const [target, suffix] = splitSuffix(ref);
      if (!target.toLowerCase().endsWith('.html')) return match;

      const resolved = posix.normalize(posix.join(pageDir, target));
      if (resolved.startsWith(`${lang}/`) || resolved.startsWith(`${other}/`) || resolved.startsWith('..')) return match;

      const translated = `${lang}/${resolved}`;
      if (!existsSync(join(rootPath, translated))) return match;

      const newRef = posix.relative(pageDir, translated) + suffix;
      if (newRef === ref) return match;
      touched += 1;
      if (examples.length < 8) examples.push(`${route}: ${ref} -> ${newRef}`);
      return `href="${newRef}"`;
    });

    if (touched) {
      await writeFile(path, next);
      filesChanged += 1;
      linksChanged += touched;
    }
  }
}

console.log(`Repointed ${linksChanged} link(s) across ${filesChanged} translated page(s).`);
for (const e of examples) console.log(`  ${e}`);
