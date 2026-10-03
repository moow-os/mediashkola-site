/* Continuous, equal-width film strips. Both start automatically on every visit;
   no controls, saved pause, hover or system preference can stop these timelines. */
(function () {
  'use strict';
  if (!Element.prototype.animate) return;

  function loop(viewport, track, cards, key, speed, sizeCards) {
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
    viewport.dataset.playing = 'true';
    var animation = null, distance = 0;
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
    }
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
    loop(viewport, track, cards, 'photos', 30, function (view) {
      view.style.setProperty('--photo-width', ((view.clientWidth - 24) / 4) + 'px');
    });
  }
  var reviews = document.querySelector('.rev-marquee');
  if (reviews) {
    var reviewTrack = reviews.querySelector('.rev-track');
    var reviewCards = Array.prototype.slice.call(reviewTrack.querySelectorAll(':scope > .review'));
    loop(reviews, reviewTrack, reviewCards, 'reviews', 27);
  }
})();
