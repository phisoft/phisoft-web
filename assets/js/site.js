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
