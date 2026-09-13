import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Refresh sitemap.xml <lastmod> from git history.
 *
 * The dates were frozen at 2026-09-05 while pages kept changing, so search
 * engines were told nothing had moved. URL set, order and priority are left
 * exactly as they are — validate-site.mjs requires that set to match the pages
 * that exist on disk.
 *
 * Idempotent: it only rewrites a date when the page's last commit differs.
 */

const rootPath = new URL('../', import.meta.url).pathname;
const sitemapPath = join(rootPath, 'sitemap.xml');
const BASE = 'https://www.phisoft.my/';

const dates = new Map();
function lastCommitDate(file) {
  if (!dates.has(file)) {
    let date = '';
    try {
      date = execSync(`git log -1 --format=%cs -- "${file}"`, { cwd: rootPath, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      date = '';
    }
    dates.set(file, date || new Date().toISOString().slice(0, 10));
  }
  return dates.get(file);
}

const xml = readFileSync(sitemapPath, 'utf8');
let updated = 0;
const next = xml.replace(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]*)<\/lastmod>/g, (match, loc, previous) => {
  const rel = loc.replace(BASE, '');
  const file = rel === '' ? 'index.html' : rel.endsWith('/') ? `${rel}index.html` : rel;
  const date = lastCommitDate(file);
  if (date !== previous) updated += 1;
  return `<loc>${loc}</loc>\n    <lastmod>${date}</lastmod>`;
});

if (next !== xml) writeFileSync(sitemapPath, next);
console.log(`Sitemap lastmod refreshed: ${updated} of ${(xml.match(/<loc>/g) || []).length} URLs.`);
