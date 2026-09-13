/*
 * Shared page hook script, loaded on every page via the shared footer.
 *
 * No analytics backend / Tag Manager / GA4 ID is configured in this project,
 * so previously-attempted click-tracking was a silent no-op and has been
 * removed. Re-introduce real tracking here (or via a loader in the footer)
 * only once a measurement ID / container exists.
 */

/* ---- footer language switcher (EN / BM / 中文) ---- */
(function () {
  var group = document.getElementById('footer-lang');
  if (!group) return;
  var path = (window.location.pathname || '/').replace(/\/+/g, '/');
  // current language: path contains /ms/ or /zh/ else en; strip the prefix
  var current = path.indexOf('/ms/') === 0 ? 'ms' : (path.indexOf('/zh/') === 0 ? 'zh' : 'en');
  var rest = path.replace(/^\/(ms|zh)\//, '/');
  var opts = group.querySelectorAll('.footer-lang__opt');

  // highlight the current language
  for (var i = 0; i < opts.length; i++) {
    if (opts[i].getAttribute('data-lang') === current) opts[i].classList.add('is-active');
  }
  // When JS is on, keep the reader on the same page across languages (sibling
  // file). The plain href="/ms/" etc. remains the no-JS fallback (homepage).
  function siblingPath(lang) {
    if (lang === current) return null;
    var prefix = lang === 'en' ? '' : '/' + lang;   // '' | '/ms' | '/zh'
    // strip a trailing "/index.html" so the result uses the directory form when present
    var r = rest !== '/' && /\/index\.html$/.test(rest) ? rest.replace(/\/index\.html$/, '/') : rest;
    return prefix + r;
  }
  for (var j = 0; j < opts.length; j++) {
    opts[j].addEventListener('click', function (e) {
      var lang = this.getAttribute('data-lang');
      var t = siblingPath(lang);
      if (t) { e.preventDefault(); window.location.href = t; }
    });
  }
})();

/* ---- service-page hero panels ----
 * A single visual language is shared across service pages, but the panel copy
 * must describe the specific outcome rather than repeat a generic capability list.
 */
(function () {
  var fullPath = window.location.pathname || '';
  if (/^\/(ms|zh)\//.test(fullPath)) return;
  var path = fullPath.replace(/^.*\//, '');
  var panels = {
    'product-development.html': {
      className: 'hero-panel--product',
      lines: ['Product opportunity', 'Validate · Build · Launch', 'Real users · Real feedback', 'Improve what works']
    },
    'mobile-app-development.html': {
      className: 'hero-panel--mobile',
      lines: ['Customers & staff', 'Mobile experience', 'Secure APIs · Notifications', 'Connected operations']
    },
    'custom-software.html': {
      className: 'hero-panel--custom',
      lines: ['Your workflow', 'Custom business system', 'Data · Integration · Automation', 'One reliable way of working']
    },
    'legacy-modernisation.html': {
      className: 'hero-panel--legacy',
      lines: ['Existing software', 'Stabilise · Connect · Improve', 'Keep the knowledge that matters', 'Modernise in stages']
    },
    'software.html': {
      className: 'hero-panel--software',
      lines: ['Business outcome', 'Design · Build · Integrate', 'People · Process · Data', 'A dependable foundation']
    }
  };
  var copy = panels[path];
  var panel = document.querySelector('.ai-page-hero-panel');
  if (!copy || !panel || panel.textContent.indexOf('Phisoft engineering') === -1) return;
  panel.classList.add(copy.className);
  panel.innerHTML = '<span>' + copy.lines[0] + '</span><strong>' + copy.lines[1] + '</strong><span>' + copy.lines[2] + '</span><b>' + copy.lines[3] + '</b>';
})();

/* ---- forms with progressive enhancement ----
 * Any form carrying data-sending/data-success/data-error gets a submitting state
 * and localized status messages. The strings travel with the markup, so the
 * translated pages no longer fall back to English. Used by the contact form and
 * the careers application form; both post to the same endpoint with Turnstile.
 */
(function () {
  document.querySelectorAll('form[data-sending]').forEach(function (form) {
    var status = form.querySelector('[data-form-status]');
    var submit = form.querySelector('button[type="submit"]');
    var setStatus = function (state, text) {
      if (!status) return;
      status.classList.remove('text-muted', 'text-success', 'text-danger');
      if (state) status.classList.add(state);
      status.textContent = text || '';
    };
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      setStatus('text-muted', form.dataset.sending);
      if (submit) submit.disabled = true;
      try {
        var response = await fetch(form.action, { method: 'POST', body: new FormData(form) });
        if (!response.ok) throw new Error('Request failed');
        form.reset();
        if (typeof turnstile !== 'undefined') turnstile.reset();
        setStatus('text-success', form.dataset.success);
      } catch (error) {
        setStatus('text-danger', form.dataset.error);
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  });
})();
