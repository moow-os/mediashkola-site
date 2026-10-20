/* Compile Katya's approved programme into a readable page, including without JS. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/mediaautumn-2026.json'), 'utf8'));
const consent = JSON.parse(fs.readFileSync(path.join(root, 'data/camp-consent-2026.json'), 'utf8'));
const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const dates = ['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-11-02','2026-11-03','2026-11-04'];
if (JSON.stringify(data.days.map(day => day.date)) !== JSON.stringify(dates)) throw new Error('Camp dates differ from the approved programme');
if (data.days.reduce((count, day) => count + day.events.length, 0) !== 85) throw new Error('Expected all 85 programme entries');
const formatDate = date => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
const days = data.days.map((day, index) => `<article class="camp-day" id="day-${day.date}" aria-labelledby="title-${day.date}">
  <header class="camp-day-heading"><p class="camp-date"><time datetime="${day.date}">${escape(formatDate(day.date))}</time><span>День ${index + 1}</span></p><h3 id="title-${day.date}">${escape(day.title)}</h3></header>
  <ol class="camp-events">${day.events.map(event => `<li${event.text === 'Обед' ? ' class="camp-lunch"' : ''}><time datetime="${day.date}T${event.time}:00+03:00">${escape(event.time)}</time><span>${escape(event.text)}</span></li>`).join('\n')}</ol>
</article>`).join('\n');
const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>МЕДИАОСЕНЬ 2026 — осенний лагерь Медиашколы</title>
<meta name="description" content="Восемь дней съёмок, фото, кино и эфиров. МЕДИАОСЕНЬ 2026 для детей 6–17 лет: программа 26–30 октября и 2–4 ноября. Оставьте телефон для записи.">
<meta name="theme-color" content="#FDFDFD">
<link rel="icon" href="../assets/brand/logo.svg" type="image/svg+xml">
<link rel="stylesheet" href="../assets/site.css?v=20261003-teachers1">
<link rel="stylesheet" href="../assets/camp.css?v=20261016-1">
<script src="../assets/camp.js?v=20261020-1" defer></script>
</head>
<body class="camp-page">
<a class="skip-link" href="#programme">К программе лагеря</a>
<header class="camp-header">
  <a class="wordmark" href="../" aria-label="На основной сайт Медиашколы"><img src="../assets/brand/logo.svg" alt="Медиашкола" width="225" height="165"></a>
  <nav aria-label="По странице"><a href="#programme">Программа</a><a href="#signup" class="camp-button camp-button-small">Записаться</a></nav>
</header>
<main>
  <section class="camp-hero" aria-labelledby="camp-title">
    <div><h1 id="camp-title">МЕДИА<wbr>ОСЕНЬ <span>2026</span></h1><p class="camp-intro">Снимаем кино, пробуем себя в кадре,<br class="camp-desktop-break"> собираем свою команду.</p><a href="#programme" class="camp-programme-link">Смотреть программу <span aria-hidden="true">↓</span></a></div>
    <aside class="camp-shift" aria-label="О смене"><p class="camp-shift-date">26 октября<br>— 4 ноября</p><p>Восемь дней<br>Для детей ${escape(data.age)}</p><a class="camp-button" href="#signup">Записаться в лагерь</a><a class="camp-phone" href="tel:${escape(data.phone)}">${escape(data.phone_display)}</a></aside>
  </section>
  <section class="camp-programme" id="programme" aria-labelledby="programme-title">
    <div class="camp-section-heading"><h2 id="programme-title">МЕДИАОСЕНЬ 2026</h2><p>Всё расписание — перед вами.<br>26–30 октября и 2–4 ноября.</p></div>
    <div class="camp-days">${days}</div>
  </section>
  <section class="camp-signup" id="signup" aria-labelledby="signup-title">
    <div><h2 id="signup-title">Увидимся<br>в лагере?</h2><p>Оставьте телефон — свяжемся с вами,<br class="camp-desktop-break"> расскажем о смене и поможем записаться.</p><a class="camp-phone" href="tel:${escape(data.phone)}">${escape(data.phone_display)}</a></div>
    <div>
      <form id="camp-lead" data-consent-version="${escape(consent.version)}" novalidate>
        <label for="camp-phone">Ваш телефон</label><input id="camp-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="25" placeholder="+7 ___ ___-__-__" required aria-describedby="camp-phone-error"><p class="camp-error" id="camp-phone-error" hidden>Укажите телефон: 11 цифр, начиная с 7 или 8.</p>
        <label for="camp-name">Как к вам обращаться <span>(необязательно)</span></label><input id="camp-name" name="parent_name" autocomplete="name" maxlength="120">
        <label class="camp-consent" for="camp-agree"><input id="camp-agree" name="agree" type="checkbox" required aria-describedby="camp-agree-error"><span>${escape(consent.text)}</span></label><p class="camp-error" id="camp-agree-error" hidden>Нужно согласие, чтобы мы могли принять заявку.</p>
        <p><a href="./data.html">Как мы используем данные заявки</a></p>
        <div class="camp-trap" aria-hidden="true"><label for="camp-company">Организация</label><input id="camp-company" name="company" tabindex="-1" autocomplete="off"></div>
        <button class="camp-button" type="submit" disabled>Оставить телефон</button><p class="camp-form-status" id="camp-form-status" role="status" aria-live="polite"></p>
        <noscript><p>Для отправки формы нужен JavaScript. Можно позвонить: <a href="tel:${escape(data.phone)}">${escape(data.phone_display)}</a>.</p></noscript>
      </form>
      <div class="camp-success" id="camp-success" hidden tabindex="-1"><h3>Заявка получена</h3><p>Спасибо! Медиашкола свяжется с вами по указанному телефону.</p><a class="camp-phone" href="tel:${escape(data.phone)}">${escape(data.phone_display)}</a></div>
    </div>
  </section>
</main>
<footer class="camp-footer"><a href="../">АНО ДПО «Медиашкола»</a><p>МЕДИАОСЕНЬ 2026</p><a href="tel:${escape(data.phone)}">${escape(data.phone_display)}</a></footer>
</body></html>
`;
const target = path.join(root, 'mediaosen-2026/index.html');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, html);
console.log('Compiled 8 days / 85 events → mediaosen-2026/index.html');
