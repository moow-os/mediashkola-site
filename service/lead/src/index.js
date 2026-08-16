/* МЕДИАШКОЛА — приёмник заявок с формы записи.
   Cloudflare Worker. Родитель нажимает «Запись на консультацию» — заявка уходит сюда,
   отсюда в телеграм-бот (и, если задан, в таблицу через Apps Script).
   Никакого ручного касания родителя: требование Кати от 16.08.

   Секреты (wrangler secret put): TG_BOT_TOKEN, TG_CHAT_IDS, SHEET_WEBHOOK_URL (необязательно).
   Публичной части токена нет — статический сайт токена не видит. */

const ALLOWED_ORIGINS = new Set([
  'https://mediashkola.pro',
  'http://mediashkola.pro',
  'https://www.mediashkola.pro',
  'http://www.mediashkola.pro',
  'https://moow-os.github.io'
]);

const COURSES = new Set(['МЕДИА', 'УСПЕШНЫЙ ОРАТОР', 'ВЫБИРАЕМ']);
const MESSENGERS = new Set(['Телеграм', 'MAX', 'WhatsApp']);

function cors(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin) }
  });
}

function digits(s) { return String(s || '').replace(/\D/g, ''); }

function normPhone(raw) {
  let d = digits(raw);
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
  if (d.length !== 11 || d[0] !== '7') return null;
  return '+' + d;
}

function clean(s, max) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
}

/* Валидация повторяет форму: сервер не доверяет клиенту. */
function validate(raw) {
  const parent_name = clean(raw.parent_name, 120);
  const phone = normPhone(raw.phone);
  const course = clean(raw.course, 40);
  const messenger = clean(raw.messenger, 20);

  if (raw.company) return { error: 'spam' };            // honeypot: людям это поле не видно
  if (parent_name.length < 2) return { error: 'parent_name' };
  if (!phone) return { error: 'phone' };
  if (!COURSES.has(course)) return { error: 'course' };
  if (!MESSENGERS.has(messenger)) return { error: 'messenger' };
  if (raw.agree !== true) return { error: 'agree' };

  return { lead: { parent_name, phone, course, messenger, page: clean(raw.page, 200) } };
}

function leadText(lead, when) {
  return [
    '🎬 ЗАЯВКА С САЙТА · МЕДИАШКОЛА',
    '',
    'Родитель: ' + lead.parent_name,
    'Телефон: ' + lead.phone,
    'Курс: ' + lead.course,
    'Написать в: ' + lead.messenger,
    '',
    'Принята: ' + when
  ].join('\n');
}

/* Москва/Краснодар — один пояс, UTC+3. Показываем время так, как его видит школа. */
function moscowStamp(d) {
  const t = new Date(d.getTime() + 3 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return p(t.getUTCDate()) + '.' + p(t.getUTCMonth() + 1) + '.' + t.getUTCFullYear()
    + ', ' + p(t.getUTCHours()) + ':' + p(t.getUTCMinutes()) + ' МСК';
}

async function sendTelegram(env, text) {
  const ids = String(env.TG_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!env.TG_BOT_TOKEN || !ids.length) return { ok: false, reason: 'not_configured' };

  const url = 'https://api.telegram.org/bot' + env.TG_BOT_TOKEN + '/sendMessage';
  const results = await Promise.all(ids.map(async (chat_id) => {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id, text, disable_web_page_preview: true })
      });
      const body = await r.json().catch(() => ({}));
      return { chat_id, ok: r.ok && body.ok === true, description: body.description };
    } catch (e) {
      return { chat_id, ok: false, description: String(e) };
    }
  }));

  /* Доставка считается состоявшейся, если её принял хотя бы один адрес:
     один заблокировавший бота получатель не должен терять заявку остальным. */
  return { ok: results.some((r) => r.ok), results };
}

async function sendSheet(env, lead, when) {
  if (!env.SHEET_WEBHOOK_URL) return { ok: false, reason: 'not_configured' };
  try {
    const r = await fetch(env.SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'mediashkola.pro', when, ...lead })
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, description: String(e) };
  }
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    if (url.pathname === '/health') {
      return json({
        ok: true,
        telegram: Boolean(env.TG_BOT_TOKEN && env.TG_CHAT_IDS),
        sheet: Boolean(env.SHEET_WEBHOOK_URL)
      }, 200, origin);
    }

    if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405, origin);
    if (url.pathname !== '/lead') return json({ ok: false, error: 'not_found' }, 404, origin);
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ ok: false, error: 'origin' }, 403, origin);

    let raw;
    try {
      raw = await request.json();
    } catch (e) {
      return json({ ok: false, error: 'body' }, 400, origin);
    }

    const { lead, error } = validate(raw);
    /* Спам-ловушку не показываем ботописателю: отвечаем как на удачную отправку. */
    if (error === 'spam') return json({ ok: true }, 200, origin);
    if (error) return json({ ok: false, error }, 422, origin);

    const now = new Date();
    const when = moscowStamp(now);
    const tg = await sendTelegram(env, leadText(lead, when));

    if (env.SHEET_WEBHOOK_URL) ctx.waitUntil(sendSheet(env, lead, now.toISOString()));

    if (!tg.ok) {
      console.error('lead delivery failed', JSON.stringify({ lead, tg }));
      return json({ ok: false, error: 'delivery' }, 502, origin);
    }

    return json({ ok: true, at: now.toISOString() }, 200, origin);
  }
};
