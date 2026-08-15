/* Геном-аудит сайта МШ. Меряет по вычисленным стилям живого DOM, а не по исходникам.
   Запуск: browse eval tools/style-audit.js (на любом брейкпоинте).
   Проверяет: riso-правило (фуксия только на интерактиве), контраст AA с учётом кегля,
   радиусы (должны быть 0), тени (только плоский офсет), посторонние цвета вне палитры. */
(function () {
  var TOK = { bg: [253, 253, 253], ink: [37, 37, 37], accent: [225, 63, 138], white: [255, 255, 255] };
  function parse(c) {
    var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c || '');
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  }
  function near(px, t, tol) { return px && Math.abs(px.r - t[0]) <= tol && Math.abs(px.g - t[1]) <= tol && Math.abs(px.b - t[2]) <= tol; }
  function isAccent(c) { return near(parse(c), TOK.accent, 6); }
  function lum(p) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(p.r) + 0.7152 * f(p.g) + 0.0722 * f(p.b);
  }
  function ratio(a, b) { var l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
  function effBg(el) {
    var n = el;
    while (n && n !== document.documentElement) {
      var p = parse(getComputedStyle(n).backgroundColor);
      if (p && p.a > 0.95) return p;
      n = n.parentElement;
    }
    return { r: 253, g: 253, b: 253, a: 1 };
  }
  function interactive(el) {
    if (el.closest('a,button,input,select,textarea,summary,label,[role="button"],[tabindex]:not([tabindex="-1"])')) return true;
    return getComputedStyle(el).cursor === 'pointer';
  }
  function path(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
    return s;
  }
  var out = { url: location.pathname, w: window.innerWidth, riso_violations: [], contrast_fails: [], radius_violations: [], shadow_nonflat: [], palette_strays: {}, fonts: {}, clipped: [] };
  document.querySelectorAll('body *:not(script):not(style)').forEach(function (el) {
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    var hasText = el.childNodes && Array.prototype.some.call(el.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); });
    ['color', 'backgroundColor', 'borderTopColor', 'borderLeftColor', 'outlineColor'].forEach(function (prop) {
      if (!isAccent(cs[prop])) return;
      if (prop === 'borderTopColor' && cs.borderTopWidth === '0px') return;
      if (prop === 'borderLeftColor' && cs.borderLeftWidth === '0px') return;
      if (prop === 'outlineColor' && (cs.outlineStyle === 'none' || cs.outlineWidth === '0px')) return;
      if (!interactive(el)) out.riso_violations.push({ el: path(el), prop: prop });
    });
    if (hasText) {
      var fg = parse(cs.color), bg = effBg(el);
      if (fg && fg.a > 0.5) {
        var size = parseFloat(cs.fontSize), bold = (+cs.fontWeight >= 700);
        var need = (size >= 24 || (bold && size >= 18.66)) ? 3.0 : 4.5, r = ratio(fg, bg);
        if (r < need) out.contrast_fails.push({ el: path(el), ratio: +r.toFixed(2), need: need, size: size, text: (el.textContent || '').trim().slice(0, 32) });
      }
    }
    ['borderTopLeftRadius', 'borderBottomRightRadius'].forEach(function (p) {
      var v = cs[p];
      if (v && v !== '0px' && v !== '0%') out.radius_violations.push({ el: path(el), val: v });
    });
    var sh = cs.boxShadow;
    if (sh && sh !== 'none') {
      var nums = sh.match(/-?[\d.]+px/g) || [];
      if (nums[2] && parseFloat(nums[2]) > 0) out.shadow_nonflat.push({ el: path(el), shadow: sh.slice(0, 60) });
    }
    ['color', 'backgroundColor'].forEach(function (prop) {
      var p = parse(cs[prop]);
      if (!p || p.a < 0.05) return;
      var known = near(p, TOK.bg, 3) || near(p, TOK.ink, 3) || near(p, TOK.accent, 6) || near(p, TOK.white, 3);
      var grayish = Math.abs(p.r - p.g) <= 4 && Math.abs(p.g - p.b) <= 4;
      if (!known && !grayish) {
        var k = 'rgb(' + p.r + ',' + p.g + ',' + p.b + ')';
        out.palette_strays[k] = (out.palette_strays[k] || 0) + 1;
      }
    });
    var fam = cs.fontFamily.split(',')[0].replace(/['"]/g, '');
    out.fonts[fam] = (out.fonts[fam] || 0) + 1;
    /* ОБРЕЗКА — с контролем внутри инструмента.
       Голое scrollWidth > clientWidth врёт: у крупного дисплейного набора с
       line-height < 1 глиф законно выходит за строчный бокс, и ничего не
       теряется, пока никто из предков не режет. За сессию эта проба четырежды
       подняла ложную тревогу (цена 8 000 ₽ была последней). Поэтому здесь
       спрашиваем не «выходит ли», а «РЕЖЕТ ли кто-то» — то есть то же, что
       увидит человек. Схема аудита раньше про обрезку не спрашивала вовсе,
       а молчание инструмента не значит, что дефекта нет. */
    var overW = el.scrollWidth - el.clientWidth > 1;
    var overH = el.scrollHeight - el.clientHeight > 1;
    if ((overW || overH) && el.clientWidth > 0) {
      var n = el, clipper = null;
      while (n && n !== document.documentElement) {
        var nc = getComputedStyle(n);
        var ox = nc.overflowX, oy = nc.overflowY;
        /* Режет только hidden/clip. auto и scroll — это ПРОКРУТКА: содержимое
           человеку доступно, значит потери нет (иначе детектор ругался бы на
           ленту педагогов, которая листается пальцем). */
        var hides = function (v) { return v === 'hidden' || v === 'clip'; };
        if ((overW && hides(ox)) || (overH && hides(oy))) { clipper = n; break; }
        n = n.parentElement;
      }
      if (clipper) {
        out.clipped.push({
          el: path(el), by: path(clipper),
          w: el.scrollWidth + '>' + el.clientWidth,
          h: el.scrollHeight + '>' + el.clientHeight,
          text: (el.textContent || '').trim().slice(0, 30)
        });
      }
    }
  });
  return JSON.stringify(out);
})();
