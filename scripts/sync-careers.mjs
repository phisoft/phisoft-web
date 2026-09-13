import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Project scripts/roles.json onto the careers page in every language.
 *
 * Before this, the careers page hand-counted its own state: a literal "0" stat,
 * a "we are not actively hiring" sentence, and five role cards whose only action
 * was a disabled "Application closed" label. Those could drift apart the moment
 * a role opened. Now the data file decides:
 *
 *   - the open-roles counter and the hiring sentence,
 *   - each role card's action (a prefilled mailto — "Apply" when the role is
 *     open, "register interest" when it is not),
 *   - the online application form, with CV upload via the same endpoint and
 *     Turnstile key the contact page already uses,
 *   - JobPosting structured data, emitted only for roles that are actually open
 *     AND carry complete metadata, so an incomplete posting can never ship.
 *
 * Idempotent: re-running produces identical output.
 */

const rootPath = new URL('../', import.meta.url).pathname;
const roles = JSON.parse(readFileSync(join(rootPath, 'scripts/roles.json'), 'utf8'));
const PAGES = { en: 'careers.html', ms: 'ms/careers.html', zh: 'zh/careers.html' };
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const SITEKEY = '0x4AAAAAAARepDlzRUeiygyt';

const openSet = new Set(roles.open || []);
const bare = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const encode = (s) => encodeURIComponent(s).replace(/%20/g, '%20');

let totalChanges = 0;
const warnings = [];

for (const [lang, rel] of Object.entries(PAGES)) {
  const copy = roles.copy[lang];
  const path = join(rootPath, rel);
  const before = await readFile(path, 'utf8');
  let html = before;

  // 1. hiring sentence + counter
  html = html.replace(/(<p[^>]*data-careers-note[^>]*>)[\s\S]*?(<\/p>)/, (_m, a, b) => `${a}${openSet.size ? copy.openNote : copy.closedNote}${b}`);
  html = html.replace(/(<p[^>]*data-careers-count[^>]*>)[\s\S]*?(<\/p>)/, (_m, a, b) => `${a}${openSet.size}${b}`);

  // 2. per-card action
  const titles = {};
  html = html.replace(/<article\b[^>]*data-role="([^"]+)"[\s\S]*?<\/article>/g, (card, slug) => {
    const title = bare(card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? '');
    titles[slug] = title;
    const isOpen = openSet.has(slug);
    const subject = `${isOpen ? copy.applySubject : copy.interestSubject}: ${title}`;
    const href = `mailto:${roles.email}?subject=${encode(subject)}`;
    const cls = isOpen ? 'btn w-100 career-apply-btn mt-auto' : 'btn w-100 career-apply-btn mt-auto btn-outline-secondary';
    const label = isOpen ? copy.applyLabel : copy.closedApplyLabel;
    const button = `<a class="${cls}" href="${href}">${label}</a>`;
    const next = card.replace(/<(a|span)\b[^>]*career-apply-btn[^>]*>[\s\S]*?<\/\1>/, button);
    if (!isOpen) return next;
    // open roles also get a visible badge, injected once
    if (/career-badge/.test(next)) return next;
    return next.replace(/<article\b[^>]*>/, (t) => `${t}\n                            <p class="career-badge">${copy.hiringBadge}</p>`);
  });

  // 3. online application form
  const options = (roles.profiles || [])
    .map((slug) => `<option value="${titles[slug] ?? slug}">${titles[slug] ?? slug}</option>`)
    .join('')
    .concat(`<option value="${copy.fieldRoleOther}">${copy.fieldRoleOther}</option>`);
  const form = `<form class="career-form row g-3" id="career-application" action="${roles.formEndpoint}" method="POST" enctype="multipart/form-data" novalidate
              data-application-form
              data-sending="${copy.sendingNote}" data-success="${copy.successNote}" data-error="${copy.errorNote}">
                <input type="hidden" name="form" value="careers-application">
                <input type="hidden" name="locale" value="${lang}">
                <div class="col-12">
                    <p class="ai-eyebrow mb-2">${copy.formTitle}</p>
                    <p class="mb-0">${copy.formLead}</p>
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="career-name">${copy.fieldName}</label>
                    <input class="form-control" id="career-name" name="name" type="text" autocomplete="name" required>
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="career-email">${copy.fieldEmail}</label>
                    <input class="form-control" id="career-email" name="email" type="email" autocomplete="email" required>
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="career-phone">${copy.fieldPhone}</label>
                    <input class="form-control" id="career-phone" name="phone" type="tel" autocomplete="tel">
                </div>
                <div class="col-md-6">
                    <label class="form-label" for="career-role">${copy.fieldRole}</label>
                    <select class="form-select" id="career-role" name="role" required>${options}</select>
                </div>
                <div class="col-12">
                    <label class="form-label" for="career-cv">${copy.fieldCv}</label>
                    <input class="form-control" id="career-cv" name="cv" type="file" accept=".pdf,.doc,.docx" required>
                </div>
                <div class="col-12">
                    <label class="form-label" for="career-message">${copy.fieldMessage}</label>
                    <textarea class="form-control" id="career-message" name="message" rows="4"></textarea>
                </div>
                <div class="col-12"><div class="cf-turnstile" data-sitekey="${SITEKEY}" data-theme="light"></div></div>
                <div class="col-12 d-flex flex-wrap align-items-center gap-3">
                    <button class="btn btn-primary btn-lg" type="submit">${copy.submitLabel}</button>
                    <p class="small text-muted mb-0">${copy.mailtoFallback.replace(roles.email, `<a href="mailto:${roles.email}">${roles.email}</a>`)}</p>
                </div>
                <div class="col-12"><p class="small mb-0" id="career-form-status" data-form-status role="status" aria-live="polite"></p></div>
            </form>`;
  // Marker-delimited so re-running cannot stack a second form into the page.
  const FORM_START = '<!--careers-form-->';
  const FORM_END = '<!--/careers-form-->';
  const block = `${FORM_START}\n            ${form}\n            ${FORM_END}`;
  const filled = new RegExp(`${FORM_START}[\\s\\S]*?${FORM_END}`);
  if (filled.test(html)) {
    html = html.replace(filled, block);
  } else {
    html = html.replace(/<div([^>]*data-careers-application[^>]*)><\/div>/, (_m, attrs) => `<div${attrs}>\n            ${block}\n        </div>`);
  }

  // 4. Turnstile loader (only needed because of the form)
  if (!html.includes(TURNSTILE_SRC)) {
    html = html.replace('</head>', `  <script src="${TURNSTILE_SRC}" async defer></script>\n</head>`);
  }

  // 5. JobPosting structured data for open roles with complete metadata
  html = html.replace(/\s*<!--careers-jobposting-->[\s\S]*?<\/script>/, '');
  const postings = [];
  for (const slug of openSet) {
    const meta = roles.roleMeta?.[slug];
    const missing = ['employmentType', 'description', 'datePosted', 'validThrough'].filter((k) => !meta?.[k]);
    if (missing.length) { warnings.push(`${slug}: JobPosting skipped, missing ${missing.join(', ')}`); continue; }
    postings.push({
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: titles[slug] ?? slug,
      description: meta.description,
      datePosted: meta.datePosted,
      validThrough: meta.validThrough,
      employmentType: meta.employmentType,
      hiringOrganization: { '@type': 'Organization', name: 'Phisoft', sameAs: 'https://www.phisoft.my/' },
      jobLocation: {
        '@type': 'Place',
        address: { '@type': 'PostalAddress', streetAddress: 'H-08-10, Aeropod Commercial Square, Jalan Aeropod Off Jalan Kepayan', addressLocality: 'Kota Kinabalu', addressRegion: 'Sabah', postalCode: '88200', addressCountry: 'MY' },
      },
      inLanguage: lang,
    });
  }
  if (postings.length) {
    const block = `  <!--careers-jobposting-->\n${postings.map((p) => `  <script type="application/ld+json">\n${JSON.stringify(p, null, 2)}\n  </script>`).join('\n')}`;
    html = html.replace('</head>', `${block}\n</head>`);
  }

  if (html !== before) {
    await writeFile(path, html);
    totalChanges += 1;
  }
}

console.log(`Careers synced: ${openSet.size} open role(s), ${totalChanges} page(s) updated.`);
for (const w of warnings) console.log(`  ! ${w}`);
