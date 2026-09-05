import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const projectRoot = new URL('../', import.meta.url);
const rootPath = projectRoot.pathname;
const headerTemplate = await readFile(new URL('../components/header.html', import.meta.url), 'utf8');
const footerTemplate = await readFile(new URL('../components/footer.html', import.meta.url), 'utf8');

function collectHtml(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'components' || entry.name === 'ms' || entry.name === 'zh') return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? collectHtml(path) : entry.name.endsWith('.html') ? [path] : [];
  });
}

function sectionFor(path) {
  const route = relative(rootPath, path).split(sep).join('/');
  // Capabilities (8)
  if (['software.html', 'mobile-app-development.html', 'services/connect.html', 'data-engineering.html', 'automation.html', 'ai-engineering.html', 'cloud-devops.html', 'iot-engineering.html'].includes(route)) return 'CAP';
  // How We Partner (5)
  if (['engineering-partnership.html', 'project-engineering.html', 'specialist-engineering.html', 'application-maintenance.html', 'innovation-rd.html'].includes(route)) return 'PARTNER';
  // Solutions
  if (route === 'case-studies.html' || route === 'solutions.html' || route.startsWith('solutions/')) return 'SOLUTIONS';
  // Company
  if (['about.html', 'engineering-team.html', 'careers.html', 'insights.html', 'ai-lab.html'].includes(route) || route.startsWith('insights/')) return 'COMPANY';
  // Legacy capability sub-pages keep the Capabilities active state
  if (['custom-software.html', 'legacy-modernisation.html', 'product-development.html', 'ai-agents.html', 'ai-analytics.html', 'ai-automation.html', 'ai-document-intelligence.html', 'ai-evaluation.html', 'ai-infrastructure.html', 'ai-knowledge.html', 'ai-operations.html', 'ai-systems-assessment.html', 'private-ai.html', 'edge-ai.html'].includes(route)) return 'CAP';
  return '';
}

for (const path of collectHtml(rootPath)) {
  let html = await readFile(path, 'utf8');
  const depth = relative(rootPath, path).split(sep).length - 1;
  const root = depth ? '../'.repeat(depth) : '';
  const active = sectionFor(path);
  let header = headerTemplate.replaceAll('{{ROOT}}', root);
  for (const section of ['CAP', 'PARTNER', 'SOLUTIONS', 'COMPANY']) {
    header = header.replaceAll(`{{${section}_ACTIVE}}`, active === section ? ' active' : '');
    header = header.replaceAll(`{{${section}_CURRENT}}`, active === section ? ' aria-current="page"' : '');
  }
  const footer = footerTemplate.replaceAll('{{ROOT}}', root);
  if (!/<header class="ai-site-header[\s\S]*?<\/header>/.test(html)) throw new Error(`Shared header missing in ${path}`);
  if (!/<footer class="footer-area-wrapper[\s\S]*?<\/footer>/.test(html)) throw new Error(`Shared footer missing in ${path}`);
  html = html.replace(/<header class="ai-site-header[\s\S]*?<\/header>/, header.trim());

  // Rebuild the page tail deterministically. Anything from the shared footer
  // onwards is owned by this script; pages may carry their own trailing inline
  // <script> blocks and a shared bootstrap bundle that we must preserve.
  //
  // Older bad builds could leave duplicated <footer> blocks and repeated chrome
  // (WhatsApp FAB, mobile contact bar, site.js <script>). Drop every footer
  // element and every chrome duplicate, then append exactly one canonical tail.
  const FOOTER_RE = /<footer class="footer-area-wrapper">[\s\S]*?<\/footer>/g;
  // Everything before the first footer is real, page-authored content.
  const firstFooter = html.search(FOOTER_RE);
  if (firstFooter === -1) throw new Error(`Shared footer missing in ${path}`);
  const head = html.slice(0, firstFooter);
  // Everything from the first footer token onwards loses its footers but keeps
  // any genuine inline/page scripts and the bootstrap bundle.
  let tail = html
    .slice(firstFooter)
    .replace(FOOTER_RE, '')
    .replace(/<a\b(?=[^>]*class="whatsapp-container")[\s\S]*?<\/a>/g, '')
    .replace(/<nav\s+class="mobile-contact-bar"[\s\S]*?<\/nav>/g, '')
    .replace(/<script\s+src="(?:\.\.\/)*assets\/js\/site\.js"[^>]*>\s*<\/script>/g, '')
    .replace(/\n[ \t]*\n/g, '\n')
    .trim();

  html = `${head}\n${footer.trim()}\n${tail}`;
  await writeFile(path, html);
}

console.log(`Synchronized shared layout across ${collectHtml(rootPath).length} pages.`);
