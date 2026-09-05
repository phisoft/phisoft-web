import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
function collect(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || ['components', 'node_modules'].includes(entry.name)) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? collect(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}
function escapeAttribute(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

for (const path of collect(root)) {
  let html = await readFile(path, 'utf8');
  // 404.html is a dedicated noindex error page: it has no canonical by design,
  // and Open Graph / social metadata would only be seen by anyone sharing the
  // error URL. Normalize theme-color only, then move on.
  if (path.endsWith('404.html')) {
    html = html.replace(/<meta name="theme-color" content="[^"]*"\s*\/?\s*>/, '<meta name="theme-color" content="#f5f7fa">');
    html = html.replace(/\s*<meta property="og:image:(?:width|height)"[^>]*>/g, '');
    await writeFile(path, html);
    continue;
  }
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1]?.replace(/<[^>]+>/g, '').trim();
  const description = html.match(/<meta name="description" content="([^"]*)"\s*\/?\s*>/)?.[1];
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"\s*\/?\s*>/)?.[1];
  if (!title || !description || !canonical) throw new Error(`Required SEO metadata missing in ${path}`);
  html = html.replace(/<meta name="theme-color" content="[^"]*"\s*\/?\s*>/, '<meta name="theme-color" content="#f5f7fa">');
  const fields = [
    ['property="og:type"', `<meta property="og:type" content="${path.includes('/insights/') ? 'article' : 'website'}">`],
    ['property="og:title"', `<meta property="og:title" content="${escapeAttribute(title)}">`],
    ['property="og:description"', `<meta property="og:description" content="${description}">`],
    ['property="og:url"', `<meta property="og:url" content="${canonical}">`],
    ['property="og:image"', '<meta property="og:image" content="https://phisoft.my/assets/images/logo/phisoft-logo.png">'],
    ['name="twitter:card"', '<meta name="twitter:card" content="summary">'],
    ['name="twitter:title"', `<meta name="twitter:title" content="${escapeAttribute(title)}">`],
    ['name="twitter:description"', `<meta name="twitter:description" content="${description}">`],
    ['name="twitter:image"', '<meta name="twitter:image" content="https://phisoft.my/assets/images/logo/phisoft-logo.png">']
  ];
  for (const [needle, tag] of fields) {
    const escapedNeedle = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`<meta[^>]*${escapedNeedle}[^>]*>`), tag);
  }
  const additions = fields.filter(([needle]) => !html.includes(needle)).map(([, tag]) => `  ${tag}`).join('\n');
  if (additions) html = html.replace('</head>', `${additions}\n</head>`);
  html = html.replace(/\s*<meta property="og:image:(?:width|height)"[^>]*>/g, '');
  await writeFile(path, html);
}

console.log(`Synchronized social metadata across ${collect(root).length} pages.`);
