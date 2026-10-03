/* Photograph viewer shared by the three website compositions. */
(function () {
  'use strict';
  /* A numeric end width lets the existing stepped type animation interpolate.
     Measure the text itself so the final dot survives font loading and resize. */
  var typed = document.querySelector('.hero h1 .type');
  if (typed) {
    function measureType() {
      var range = document.createRange();
      range.selectNodeContents(typed);
      typed.style.setProperty('--type-width', Math.ceil(range.getBoundingClientRect().width) + 'px');
    }
    measureType();
    document.fonts.ready.then(measureType);
    window.addEventListener('resize', measureType, { passive: true });
    /* The site's initial motion choice must also follow a later preference
       change. Otherwise a page opened with reduced motion loses its second
       line when motion is enabled without reloading. */
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    function syncMotion() { typed.closest('h1').classList.toggle('play', !motion.matches); }
    if (motion.addEventListener) motion.addEventListener('change', syncMotion);
    else motion.addListener(syncMotion);
  }
  /* The existing navigation closes on click; keep its accessible state in sync. */
  var menuButton = document.querySelector('.menu-btn');
  var anchors = document.querySelector('nav.anchors');
  if (menuButton && anchors) {
    anchors.addEventListener('click', function () { menuButton.setAttribute('aria-expanded', 'false'); });
  }
  var grid = Array.prototype.slice.call(document.querySelectorAll('.gallery-grid .portrait'));
  var dialog = document.getElementById('photo-dialog');
  var image = document.getElementById('photo-full');
  var count = document.getElementById('photo-count');
  var current = 0, opener = null;

  function show(index) {
    current = (index + grid.length) % grid.length;
    var source = grid[current].querySelector('img');
    image.src = source.getAttribute('src');
    image.alt = source.alt;
    count.textContent = String(current + 1).padStart(2, '0') + ' / ' + grid.length;
  }

  document.querySelectorAll('[data-photo]').forEach(function (button) {
    button.addEventListener('click', function () {
      opener = button;
      show(+button.dataset.photo);
      dialog.showModal();
    });
  });
  document.getElementById('photo-prev').addEventListener('click', function () { show(current - 1); });
  document.getElementById('photo-next').addEventListener('click', function () { show(current + 1); });
  dialog.querySelector('.photo-close').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(current + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  dialog.addEventListener('close', function () {
    if (!opener || !opener.isConnected) return;
    // Moving photos can leave the viewport; return to the stable gallery link.
    var hero = opener.closest('.hero-portraits');
    var target = hero ? hero.querySelector('figcaption a[href="#gallery"]') : opener;
    if (target) target.focus({ preventScroll: true });
  });

})();
