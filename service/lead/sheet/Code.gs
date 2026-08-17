/* МЕДИАШКОЛА — вторая нога транспорта: заявка с сайта в таблицу «ЗАЯВКИ ЛАГЕРЬ 2026».
   Требование Кати 16.08: заявка падает И в телеграм-бот, И в тот же лист, где лагерь
   («всё в тот же лист, где лагерь, я все различаю!»).

   Это standalone-скрипт: он открывает чужую таблицу по ID, а не живёт внутри неё.
   Владелец таблицы — dyukovzapas@gmail.com; структуру её мы не трогаем.

   Свойства скрипта (Project Settings → Script Properties):
     TOKEN     — общий секрет, тот же, что в секрете воркера SHEET_TOKEN
     SHEET_ID  — ID таблицы (по умолчанию зашит ниже)

   Разворачивается как веб-приложение: Deploy → New deployment → Web app,
   «Execute as: Me», «Who has access: Anyone». Полученный /exec кладётся
   в секрет воркера SHEET_WEBHOOK_URL. */

var DEFAULT_SHEET_ID = '1AAQxYUh5ZmdFg0vpa26IFqnD-XOlCPIoOMQ-JkTA8SM';

/* Тот же секрет, что выставлен воркеру (SHEET_TOKEN, 17.08.2026). Зашит константой, чтобы
   разворачивание было одним действием: вставил код — задеплоил. Script Property TOKEN, если
   его задать, перебивает эту константу. Секретность здесь условная: скрипт приватный, а сам
   токен защищает не данные, а от посторонних записей в таблицу. Меняется в двух местах сразу:
   здесь и `wrangler secret put SHEET_TOKEN`. */
var DEFAULT_TOKEN = '287yb-RPCTHHH9qk0BEN_iy_0WnqU0NDAAYKknc2A7E';

function props_() { return PropertiesService.getScriptProperties(); }

function sheetId_() { return props_().getProperty('SHEET_ID') || DEFAULT_SHEET_ID; }

function token_() { return props_().getProperty('TOKEN') || DEFAULT_TOKEN; }

/* Разовая самопроверка ПЕРЕД боевым включением: запусти в редакторе Apps Script функцию
   selftest() и посмотри лог. Она скажет, есть ли право записи, не трогая таблицу лишний раз:
   пишет одну строку-пробу и тут же её удаляет. */
function selftest() {
  var ss = SpreadsheetApp.openById(sheetId_());
  var sh = targetSheet_(ss);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  Logger.log('Таблица: ' + ss.getName() + ' / лист: ' + sh.getName());
  Logger.log('Колонки: ' + head.join(' · '));
  Logger.log('Строк сейчас: ' + (sh.getLastRow() - 1));
  var row = head.map(function (h) { return h === 'Name' ? 'ПРОБА ЗАПИСИ — удалить' : ''; });
  sh.appendRow(row);
  SpreadsheetApp.flush();
  var n = sh.getLastRow();
  sh.deleteRow(n);
  Logger.log('ЗАПИСЬ РАБОТАЕТ: строка ' + n + ' добавлена и удалена. Можно деплоить.');
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Телефон кладём в том же виде, в каком его пишет тильдовская интеграция лагеря:
   +7 (918) 634-29-54 — иначе колонка станет разношёрстной. */
function prettyPhone_(raw) {
  var d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && d.charAt(0) === '8') d = '7' + d.slice(1);
  if (d.length !== 11) return String(raw || '');
  return '+7 (' + d.substr(1, 3) + ') ' + d.substr(4, 3) + '-' + d.substr(7, 2) + '-' + d.substr(9, 2);
}

function moscowStamp_(iso) {
  var d = iso ? new Date(iso) : new Date();
  return Utilities.formatDate(d, 'Europe/Moscow', 'yyyy-MM-dd HH:mm:ss');
}

function targetSheet_(ss) {
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    var head = all[i].getRange(1, 1, 1, all[i].getLastColumn() || 1).getValues()[0];
    if (head.indexOf('Phone') !== -1) return all[i];
  }
  return all[0];
}

function doGet() {
  try {
    var ss = SpreadsheetApp.openById(sheetId_());
    var sh = targetSheet_(ss);
    return out_({
      ok: true,
      sheet: ss.getName(),
      tab: sh.getName(),
      columns: sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0],
      rows: sh.getLastRow() - 1
    });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    var expected = token_();
    if (!expected || body.token !== expected) return out_({ ok: false, error: 'token' });
    if (!body.parent_name || !body.phone) return out_({ ok: false, error: 'fields' });

    /* Тильда пишет в этот же лист свои лагерные заявки — ждём её очереди, а не пишем поверх. */
    lock.waitLock(20000);

    var ss = SpreadsheetApp.openById(sheetId_());
    var sh = targetSheet_(ss);
    var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

    /* Пишем ПО ИМЕНАМ колонок, а не по их номерам: таблица чужая, порядок может поменяться,
       а если рядом появятся «Курс» и «Мессенджер» — заполнятся сами. */
    var hasCourseCol = header.indexOf('Курс') !== -1;
    var hasMessengerCol = header.indexOf('Мессенджер') !== -1;

    var value = {
      'Name': body.parent_name,
      'Email': body.email || '',
      'Phone': prettyPhone_(body.phone),
      'referer': 'https://mediashkola.pro' + (body.page && body.page !== '/index.html' ? body.page : '/'),
      'formid': hasCourseCol
        ? 'сайт-МШ'
        : ('сайт-МШ · ' + (body.course || '') + ' · ' + (body.messenger || '')),
      'sent': moscowStamp_(body.at),
      'requestid': 'msh:' + new Date().getTime(),
      'Курс': body.course || '',
      'Мессенджер': body.messenger || ''
    };

    var row = [];
    for (var i = 0; i < header.length; i++) {
      var name = String(header[i]);
      row.push(Object.prototype.hasOwnProperty.call(value, name) ? value[name] : '');
    }

    sh.appendRow(row);
    SpreadsheetApp.flush();

    return out_({ ok: true, row: sh.getLastRow(), course_column: hasCourseCol, messenger_column: hasMessengerCol });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}
