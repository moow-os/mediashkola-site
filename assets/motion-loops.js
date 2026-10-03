/* Continuous, equal-width film strips. A user choice overrides reduced motion
   only for this site in the current tab session; no global preference changes. */
(function () {
  'use strict';
  if (!Element.prototype.animate) return;
  var preference = matchMedia('(prefers-reduced-motion: reduce)');

  function loop(viewport, track, cards, controls, key, label, speed, sizeCards) {
    var group = document.createElement('div');
    group.className = 'motion-group';
    cards.forEach(function (card) { group.appendChild(card); });
    track.replaceChildren(group);
    var copy = group.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    copy.querySelectorAll('button,a,[tabindex]').forEach(function (node) { node.tabIndex = -1; });
    track.appendChild(copy);
    viewport.classList.add('motion-loop');
    viewport.dataset.loop = key;
    track.classList.add('motion-track');
    var button = document.createElement('button');
    button.type = 'button'; button.className = 'motion-toggle';
    controls.appendChild(button);
    var choice = null, animation = null, distance = 0;
    try {
      var saved = sessionStorage.getItem('msh-motion-' + key);
      if (saved === 'play' || saved === 'pause') choice = saved === 'play';
    } catch (_) { /* Storage is optional. */ }
    function playing() { return choice === null ? !preference.matches : choice; }
    function sync() {
      var run = playing();
      viewport.dataset.playing = String(run);
      button.textContent = run ? 'Ⅱ Пауза' : '▶ Запустить';
      button.setAttribute('aria-label', (run ? 'Приостановить ' : 'Запустить ') + label);
      if (animation) { if (run) animation.play(); else animation.pause(); }
    }
    function measure() {
      if (sizeCards) sizeCards(viewport);
      var width = group.getBoundingClientRect().width;
      if (!width || Math.abs(width - distance) < 0.1) return;
      var fraction = animation ? (animation.currentTime % animation.effect.getTiming().duration) / animation.effect.getTiming().duration : 0;
      if (animation) animation.cancel();
      distance = width;
      animation = track.animate([
        { transform: 'translate3d(0,0,0)' },
        { transform: 'translate3d(' + (-width) + 'px,0,0)' }
      ], { duration: width / speed * 1000, iterations: Infinity, easing: 'linear' });
      animation.currentTime = fraction * width / speed * 1000;
      sync();
    }
    button.addEventListener('click', function () {
      choice = !playing();
      try { sessionStorage.setItem('msh-motion-' + key, choice ? 'play' : 'pause'); } catch (_) {}
      sync();
    });
    if (preference.addEventListener) preference.addEventListener('change', sync);
    else preference.addListener(sync);
    measure();
    if (window.ResizeObserver) new ResizeObserver(measure).observe(viewport);
    else window.addEventListener('resize', measure, { passive: true });
    document.fonts.ready.then(measure);
  }

  var hero = document.querySelector('.option-b .hero-portraits');
  var photos = Array.prototype.slice.call(document.querySelectorAll('.gallery-grid .portrait'));
  if (hero && photos.length) {
    var caption = hero.querySelector('figcaption');
    var initial = Array.prototype.slice.call(hero.querySelectorAll('.portrait'));
    var order = initial.map(function (p) { return Number(p.dataset.photo); });
    photos.forEach(function (_, i) { if (order.indexOf(i) < 0) order.push(i); });
    var cards = order.map(function (i) {
      var card = photos[i].cloneNode(true);
      /* Keyboard access to every photo is provided by the full gallery link.
         Offscreen moving copies must not steal focus or scroll the strip. */
      card.tabIndex = -1;
      card.querySelector('img').loading = 'eager';
      return card;
    });
    initial.forEach(function (card) { card.remove(); });
    var viewport = document.createElement('div'), track = document.createElement('div');
    viewport.className = 'photo-strip'; track.className = 'photo-track';
    viewport.appendChild(track); hero.insertBefore(viewport, caption);
    hero.classList.add('has-motion');
    loop(viewport, track, cards, caption, 'photos', 'фотоленту', 30, function (view) {
      view.style.setProperty('--photo-width', ((view.clientWidth - 24) / 4) + 'px');
    });
  }
  var reviews = document.querySelector('.rev-marquee');
  if (reviews) {
    var reviewTrack = reviews.querySelector('.rev-track');
    var reviewCards = Array.prototype.slice.call(reviewTrack.querySelectorAll(':scope > .review'));
    var controls = document.createElement('div'); controls.className = 'motion-tools';
    reviews.before(controls);
    loop(reviews, reviewTrack, reviewCards, controls, 'reviews', 'ленту отзывов', 27);
  }
})();
