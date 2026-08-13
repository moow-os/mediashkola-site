/* МШ · сезон 26/27 — vanilla JS, zero deps.
   Блоки: эфирная сетка (scroll-spy + прогресс), hero-анимация,
   календарь (сетка/agenda, фильтры, месяцы, поповер). */
(function () {
  'use strict';
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ===== Эфирная сетка: scroll-spy (ревизия 3: секция активна в центре вьюпорта) ===== */
  var spyLinks = Array.prototype.slice.call(document.querySelectorAll('.efir a[href^="#"]'));
  var sections = spyLinks.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); }).filter(Boolean);
  function activate(id) {
    spyLinks.forEach(function (a) {
      var on = a.getAttribute('href') === '#' + id;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }
  if (sections.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) activate(e.target.id); });
    }, { rootMargin: '-45% 0px -45% 0px' }); /* полоса-центр вьюпорта */
    sections.forEach(function (s) { io.observe(s); });
  }

  /* ===== Мобильный прогресс-бар ===== */
  var bar = document.querySelector('.scroll-progress');
  if (bar) {
    var onScroll = function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ===== Мобильное меню ===== */
  var menuBtn = document.querySelector('.menu-btn');
  var anchors = document.querySelector('nav.anchors');
  if (menuBtn && anchors) {
    menuBtn.addEventListener('click', function () {
      var open = anchors.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    anchors.addEventListener('click', function () { anchors.classList.remove('open'); });
  }

  /* ===== Hero: зачёркивание + допечатка (один раз, ≤2с) ===== */
  var h1 = document.querySelector('.hero h1[data-animate]');
  if (h1 && !REDUCED) requestAnimationFrame(function () { h1.classList.add('play'); });

  /* ===== Календарь ===== */
  var calRoot = document.getElementById('grid-body');
  if (!calRoot || !window.CAL) return;

  var CAL = window.CAL;
  var MONTH_NAMES = { 9: 'Сентябрь', 10: 'Октябрь', 11: 'Ноябрь', 12: 'Декабрь' };
  var WD = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
  var NB = '‑'; /* неразрывный дефис — «13‑16» не рвётся (ревизия 1) */
  var lessons = {}; CAL.weekly_lessons.dates.forEach(function (d) { lessons[d] = true; });
  var events = {}; CAL.saturday_events.forEach(function (e) { events[e.date] = e; });
  var finals = {}; CAL.month_finals.forEach(function (f) { finals[f.date] = f; });
  var curMonth = 9, showEv = true, showLs = true;

  function dstr(y, m, d) { return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); }
  var n = new Date();
  var todayStr = dstr(n.getFullYear(), n.getMonth() + 1, n.getDate());

  function slotShort(s) {
    return '<span class="ls-row"><span class="t">' + s.time.split('–')[0] + '</span>' +
      s.course.replace('УСПЕШНЫЙ ОРАТОР', 'ОРАТОР') + ' · ' + s.age.replace('–', NB) + '</span>';
  }
  function cellContent(ds) {
    var p = [], ev = events[ds], fin = finals[ds];
    if (ev && showEv) p.push('<span class="ev-tile">' + ev.title + '</span>');
    if (fin) p.push('<span class="fin">ФИНАЛ: ' + fin.media + '</span>');
    if (lessons[ds] && showLs) CAL.weekly_lessons.slots.forEach(function (s) { p.push(slotShort(s)); });
    return p.join('');
  }
  function hasContent(ds) { return (events[ds] && showEv) || finals[ds] || (lessons[ds] && showLs); }

  function render() {
    document.getElementById('cal-title').textContent = MONTH_NAMES[curMonth] + ' 2026';
    document.querySelectorAll('.months button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(+b.dataset.m === curMonth));
    });
    var y = 2026, first = new Date(y, curMonth - 1, 1), days = new Date(y, curMonth, 0).getDate();
    var lead = (first.getDay() + 6) % 7;
    var tb = calRoot; tb.innerHTML = '';
    var ag = document.getElementById('agenda'); ag.innerHTML = '';
    var row = document.createElement('tr'), i, d, ds, td;
    for (i = 0; i < lead; i++) { td = document.createElement('td'); td.className = 'out'; row.appendChild(td); }
    for (d = 1; d <= days; d++) {
      ds = dstr(y, curMonth, d);
      td = document.createElement('td');
      var startTag = (ds === CAL.season_start) ? '<span class="start-tag">СТАРТ</span>' : '';
      var today = (ds === todayStr) ? '<span class="today-mark"><span class="dot"></span>СЕГОДНЯ</span>' : '';
      var inner = '<span class="daynum">' + d + '</span>' + cellContent(ds) + startTag + today;
      if (hasContent(ds)) {
        td.innerHTML = '<button class="cellbtn" data-d="' + ds + '" aria-haspopup="dialog">' + inner + '</button>';
      } else { td.innerHTML = inner; }
      row.appendChild(td);
      if (row.children.length === 7) { tb.appendChild(row); row = document.createElement('tr'); }
      if (hasContent(ds)) {
        var day = document.createElement('div'); day.className = 'day';
        day.innerHTML = '<button class="head cellbtn" data-d="' + ds + '" aria-haspopup="dialog">' +
          '<span class="daynum">' + d + '</span><span class="wd">' + WD[new Date(y, curMonth - 1, d).getDay()] + '</span></button>' +
          '<div class="body">' + cellContent(ds) + '</div>';
        ag.appendChild(day);
      }
    }
    if (row.children.length) {
      while (row.children.length < 7) { td = document.createElement('td'); td.className = 'out'; row.appendChild(td); }
      tb.appendChild(row);
    }
    document.querySelectorAll('.cellbtn[data-d]').forEach(function (b) {
      b.addEventListener('click', function () { openCard(b.dataset.d, b); });
    });
  }

  /* ===== Поповер ===== */
  var ovl = document.getElementById('ovl'), lastFocus = null;
  function openCard(ds, origin) {
    lastFocus = origin || document.activeElement;
    var ev = events[ds], fin = finals[ds], ls = lessons[ds];
    var d = new Date(ds + 'T12:00:00');
    document.getElementById('card-title').textContent = ev ? ev.title : (fin ? 'ФИНАЛ: ' + fin.media : 'ЗАНЯТИЯ');
    var meta = [d.getDate() + '.' + String(d.getMonth() + 1).padStart(2, '0') + ' · ' + WD[d.getDay()]];
    if (ev) meta.push(ev.time || 'время уточняется');
    document.getElementById('card-meta').innerHTML = meta.map(function (m) { return '<span>' + m + '</span>'; }).join('');
    var body = '';
    if (ev) body += '<p class="desc">' + ev.desc + '</p>';
    if (fin) body += '<p class="desc">★ МЕДИА: ' + fin.media + ' · ОРАТОР: ' + fin.orator + '</p>';
    if (ls) body += '<ul class="slots">' + CAL.weekly_lessons.slots.map(function (s) {
      return '<li><span class="t">' + s.time + '</span><span>' + s.course + ' · ' + s.group + ' · ' + s.age.replace('–', NB) + '</span></li>';
    }).join('') + '</ul>';
    document.getElementById('card-body').innerHTML = body;
    ovl.classList.add('open');
    document.getElementById('card-close').focus();
  }
  function closeCard() { ovl.classList.remove('open'); if (lastFocus) lastFocus.focus(); }
  if (ovl) {
    document.getElementById('card-close').addEventListener('click', closeCard);
    ovl.addEventListener('click', function (e) { if (e.target === ovl) closeCard(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ovl.classList.contains('open')) closeCard(); });
    var cta = document.getElementById('card-cta');
    if (cta) cta.addEventListener('click', closeCard);
  }

  /* ===== Управление ===== */
  document.querySelectorAll('.months button').forEach(function (b) {
    b.addEventListener('click', function () { curMonth = +b.dataset.m; render(); });
  });
  var fEv = document.getElementById('f-ev'), fLs = document.getElementById('f-ls');
  if (fEv) fEv.addEventListener('click', function () { showEv = !showEv; fEv.setAttribute('aria-pressed', String(showEv)); render(); });
  if (fLs) fLs.addEventListener('click', function () { showLs = !showLs; fLs.setAttribute('aria-pressed', String(showLs)); render(); });
  render();

  /* ===== ФОРМА ЗАПИСИ =====
     Поля утверждены Катей 13.08 (team.json → lead_form), других полей нет.
     Транспорт заявок не выбран (U1) → форма ничего не отправляет молча:
     собирает заявку, кладёт в localStorage и отдаёт родителю одним касанием.
     Подключение транспорта = замена ОДНОЙ функции sendLead(). */
  var form = document.getElementById('lead');
  if (form) {
    var done = document.getElementById('lead-done');
    var TG = 'mediashkola_krd';

    function err(id, on, msg) {
      var p = document.getElementById('e-' + id);
      if (!p) return;
      if (msg) p.textContent = msg;
      p.hidden = !on;
      var f = form.elements[id === 'parent' ? 'parent_name' : id];
      if (f && f.setAttribute && f.type !== 'radio') f.setAttribute('aria-invalid', String(on));
    }
    function digits(s) { return (s || '').replace(/\D/g, ''); }
    function val(name) {
      var f = form.elements[name];
      if (!f) return '';
      if (f.length && !f.value && f[0] && f[0].type === 'radio') {
        for (var i = 0; i < f.length; i++) if (f[i].checked) return f[i].value;
        return '';
      }
      return (f.value || '').trim();
    }
    function check() {
      var ok = true;
      var name = val('parent_name');
      if (name.length < 2) { err('parent', true); ok = false; } else err('parent', false);
      var ph = digits(val('phone'));
      var phOk = ph.length === 11 && (ph[0] === '7' || ph[0] === '8');
      if (!phOk) { err('phone', true); ok = false; } else err('phone', false);
      if (!val('course')) { err('course', true); ok = false; } else err('course', false);
      if (!val('messenger')) { err('messenger', true); ok = false; } else err('messenger', false);
      var agree = document.getElementById('f-agree');
      if (!agree.checked) { err('agree', true); ok = false; } else err('agree', false);
      return ok;
    }
    function leadText(lead) {
      return 'ЗАЯВКА НА КОНСУЛЬТАЦИЮ · МЕДИАШКОЛА\n'
        + 'Родитель: ' + lead.parent_name + '\n'
        + 'Телефон: ' + lead.phone + '\n'
        + 'Курс: ' + lead.course + '\n'
        + 'Мессенджер: ' + lead.messenger;
    }
    /* ЕДИНСТВЕННАЯ точка подключения транспорта.
       Сейчас: сохранить локально + отдать текст родителю (ручная отправка).
       Потом: fetch('<endpoint>', {method:'POST', body: JSON.stringify(lead)}). */
    function sendLead(lead) {
      try {
        var box = JSON.parse(localStorage.getItem('msh_leads') || '[]');
        box.push(lead);
        localStorage.setItem('msh_leads', JSON.stringify(box));
      } catch (e) { /* приватный режим — заявка всё равно на экране */ }
      if (window.console) console.info('[МШ] заявка собрана', lead);
      return { mode: 'manual' };
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!check()) {
        var bad = form.querySelector('[aria-invalid="true"]');
        if (!bad) {
          var open = form.querySelector('.err:not([hidden])');
          if (open) bad = open.closest('fieldset') ? open.closest('fieldset').querySelector('input') : document.getElementById('f-agree');
        }
        if (bad && bad.focus) bad.focus();
        return;
      }
      var lead = {
        parent_name: val('parent_name'),
        phone: val('phone'),
        course: val('course'),
        messenger: val('messenger'),
        at: new Date().toISOString()
      };
      sendLead(lead);
      var text = leadText(lead);
      document.getElementById('done-sum').textContent = text;
      document.getElementById('done-tg').href = 'https://t.me/' + TG + '?text=' + encodeURIComponent(text);
      form.hidden = true;
      done.hidden = false;
      done.focus();
    });

    /* чипы: снимаем ошибку сразу после выбора */
    form.addEventListener('change', function (e) {
      var n = e.target.name;
      if (n === 'course' || n === 'messenger') err(n, false);
      if (e.target.id === 'f-agree' && e.target.checked) err('agree', false);
    });

    var back = document.getElementById('done-back');
    if (back) back.addEventListener('click', function () {
      done.hidden = true; form.hidden = false;
      var first = document.getElementById('f-parent');
      if (first) first.focus();
    });
  }
})();
