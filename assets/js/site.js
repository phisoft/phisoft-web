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
  var sel = document.getElementById('footer-lang');
  if (!sel) return;
  // current language: path contains /ms/ or /zh/ else en
  var path = (window.location.pathname || '/').replace(/\/+/g, '/');
  var current = path.indexOf('/ms/') === 0 ? 'ms' : (path.indexOf('/zh/') === 0 ? 'zh' : 'en');
  var file = path.split('/').pop() || 'index.html';
  sel.value = current;
  sel.addEventListener('change', function () {
    var target;
    if (sel.value === current) return;
    if (sel.value === 'ms') target = '/ms/' + file;
    else if (sel.value === 'zh') target = '/zh/' + file;
    else target = '/' + file;  // English at site root
    window.location.href = target;
  });
})();
