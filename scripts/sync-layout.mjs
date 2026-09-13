import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const projectRoot = new URL('../', import.meta.url);
const rootPath = projectRoot.pathname;

// English lives at the site root; translations live in one folder per language.
// Each language owns its own header/footer component (header.<lang>.html).
const LANGS = ['ms', 'zh'];

const templates = {};
for (const lang of ['en', ...LANGS]) {
  const suffix = lang === 'en' ? '' : `.${lang}`;
  templates[lang] = {
    header: await readFile(new URL(`../components/header${suffix}.html`, import.meta.url), 'utf8'),
    footer: await readFile(new URL(`../components/footer${suffix}.html`, import.meta.url), 'utf8'),
  };
}

function collectHtml(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'components') return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? collectHtml(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

function splitRoute(route) {
  const segments = route.split('/');
  const lang = LANGS.includes(segments[0]) ? segments[0] : 'en';
  return { lang, local: lang === 'en' ? route : segments.slice(1).join('/'), depth: segments.length - 1 };
}

function sectionFor(route) {
  const { local } = splitRoute(route);
  // Capabilities (8)
  if (['software.html', 'mobile-app-development.html', 'services/connect.html', 'data-engineering.html', 'automation.html', 'ai-engineering.html', 'cloud-devops.html', 'iot-engineering.html'].includes(local)) return 'CAP';
  // How We Partner (5)
  if (['engineering-partnership.html', 'project-engineering.html', 'specialist-engineering.html', 'application-maintenance.html', 'innovation-rd.html'].includes(local)) return 'PARTNER';
  // Solutions
  if (local === 'case-studies.html' || local === 'solutions.html' || local.startsWith('solutions/')) return 'SOLUTIONS';
  // Company
  if (['about.html', 'engineering-team.html', 'careers.html', 'insights.html', 'ai-lab.html'].includes(local) || local.startsWith('insights/')) return 'COMPANY';
  // Legacy capability sub-pages keep the Capabilities active state
  if (['custom-software.html', 'legacy-modernisation.html', 'product-development.html', 'ai-agents.html', 'ai-analytics.html', 'ai-automation.html', 'ai-document-intelligence.html', 'ai-evaluation.html', 'ai-infrastructure.html', 'ai-knowledge.html', 'ai-operations.html', 'ai-systems-assessment.html', 'private-ai.html', 'edge-ai.html'].includes(local)) return 'CAP';
  return '';
}

// Current shared chrome.
const SHARED_HEADER_RE = /<header class="ai-site-header[\s\S]*?<\/header>/;
// Pre-revamp chrome still carried by a few older pages awaiting migration.
const LEGACY_HEADER_RE = /<header class="header-area[\s\S]*?<\/header>/;
const SHARED_FOOTER_RE = /<footer class="footer-area-wrapper">[\s\S]*?<\/footer>/g;
// The legacy footer is a div, not a <footer>, so it is delimited by the chrome
// element that always follows it.
const LEGACY_FOOTER_RE = /[ \t]*<div class="footer-area-wrapper">[\s\S]*?(?=<a\b[^>]*class="whatsapp-container"|<nav\s+class="mobile-contact-bar"|<script)/;

function stripChrome(html) {
  return html
    .replace(/<a\b(?=[^>]*class="whatsapp-container")[\s\S]*?<\/a>/g, '')
    .replace(/<nav\s+class="mobile-contact-bar"[\s\S]*?<\/nav>/g, '')
    .replace(/<script\s+src="(?:\.\.\/)*assets\/js\/site\.js(?:\?[^"]*)?"[^>]*>\s*<\/script>/g, '')
    .replace(/\n[ \t]*\n/g, '\n')
    .trim();
}

const pages = collectHtml(rootPath);
const migrated = [];

for (const path of pages) {
  let html = await readFile(path, 'utf8');
  const route = relative(rootPath, path).split(sep).join('/');
  const { lang, depth } = splitRoute(route);
  // {{ROOT}} points at the site root (assets always live there). {{PAGE}} points at
  // the current language root, so translated pages link within their own tree
  // instead of falling back to the English pages.
  const assetRoot = '../'.repeat(depth);
  const pageRoot = lang === 'en' ? assetRoot : '../'.repeat(Math.max(depth - 1, 0));
  const active = sectionFor(route);
  const { header: headerTemplate, footer: footerTemplate } = templates[lang];

  let header = headerTemplate.replaceAll('{{ROOT}}', assetRoot).replaceAll('{{PAGE}}', pageRoot);
  for (const section of ['CAP', 'PARTNER', 'SOLUTIONS', 'COMPANY']) {
    header = header.replaceAll(`{{${section}_ACTIVE}}`, active === section ? ' active' : '');
    header = header.replaceAll(`{{${section}_CURRENT}}`, active === section ? ' aria-current="page"' : '');
  }
  const footer = footerTemplate.replaceAll('{{ROOT}}', assetRoot).replaceAll('{{PAGE}}', pageRoot);
  if (header.includes('{{') || footer.includes('{{')) throw new Error(`Unresolved placeholder in layout for ${route}`);

  if (SHARED_HEADER_RE.test(html)) {
    html = html.replace(SHARED_HEADER_RE, header.trim());
  } else if (LEGACY_HEADER_RE.test(html)) {
    html = html.replace(LEGACY_HEADER_RE, header.trim());
    migrated.push(route);
  } else {
    throw new Error(`No known header markup in ${path}`);
  }

  // Rebuild the page tail deterministically. Anything from the shared footer
  // onwards is owned by this script; pages may carry their own trailing inline
  // <script> blocks and a shared bootstrap bundle that we must preserve.
  //
  // Older bad builds could leave duplicated <footer> blocks and repeated chrome
  // (WhatsApp FAB, mobile contact bar, site.js <script>). Drop every footer
  // element and every chrome duplicate, then append exactly one canonical tail.
  if (SHARED_FOOTER_RE.test(html)) {
    // Everything before the first footer is real, page-authored content.
    const firstFooter = html.search(SHARED_FOOTER_RE);
    const head = html.slice(0, firstFooter);
    // Everything from the first footer token onwards loses its footers but keeps
    // any genuine inline/page scripts and the bootstrap bundle.
    const tail = stripChrome(html.slice(firstFooter).replace(SHARED_FOOTER_RE, ''));
    html = `${head}${footer.trim()}\n${tail}`;
  } else {
    const legacy = html.match(LEGACY_FOOTER_RE);
    if (!legacy) throw new Error(`No known footer markup in ${path}`);
    const head = html.slice(0, legacy.index);
    const tail = stripChrome(html.slice(legacy.index + legacy[0].length));
    html = `${head}${footer.trim()}\n${tail}`;
    if (!migrated.includes(route)) migrated.push(route);
  }

  await writeFile(path, html);
}

console.log(`Synchronized shared layout across ${pages.length} pages.`);
if (migrated.length) console.log(`Migrated legacy chrome on ${migrated.length}: ${migrated.join(', ')}`);
