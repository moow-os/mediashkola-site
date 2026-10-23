/* Camp callback form; the programme itself is server-independent static HTML. */
(function () {
  'use strict';
  var form = document.getElementById('camp-lead');
  if (!form) return;
  var phone = document.getElementById('camp-phone');
  var agree = document.getElementById('camp-agree');
  var button = form.querySelector('button[type="submit"]');
  var status = document.getElementById('camp-form-status');
  var success = document.getElementById('camp-success');
  var pending = false;
  var storage;
  try { storage = window.localStorage; } catch (ignore) { /* Restricted browser storage. */ }
  var requestIdentity = window.CampTransport.identity(storage, window.crypto);
  button.disabled = false;
  document.querySelectorAll('a[href="#signup"]').forEach(function (link) {
    link.addEventListener('click', function () { window.setTimeout(function () { phone.focus({ preventScroll: true }); }, 0); });
  });
  function error(input, id, invalid) {
    document.getElementById(id).hidden = !invalid;
    input.setAttribute('aria-invalid', String(invalid));
  }
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (pending) return;
    var digits = phone.value.replace(/\D/g, '');
    if (digits.length === 11 && digits[0] === '8') digits = '7' + digits.slice(1);
    var badPhone = !/^7\d{10}$/.test(digits);
    error(phone, 'camp-phone-error', badPhone);
    error(agree, 'camp-agree-error', !agree.checked);
    status.textContent = '';
    if (badPhone || !agree.checked) { (badPhone ? phone : agree).focus(); return; }
    pending = true;
    button.disabled = true;
    status.textContent = 'Отправляем заявку…';
    try {
      var name = document.getElementById('camp-name').value.replace(/\s+/g, ' ').trim().slice(0, 120);
      var version = form.getAttribute('data-consent-version');
      var application = { kind: 'camp', camp: 'mediaautumn-2026', phone: '+' + digits,
          parent_name: name, agree: agree.checked, consent_version: version,
          page: window.location.origin + window.location.pathname,
          company: document.getElementById('camp-company').value };
      application.request_id = await requestIdentity(application);
      await window.CampTransport.send(application, {
        primary: 'https://desktop-sgneejc.tail1ef3a6.ts.net/lead',
        // Release must supply only the qualified exact endpoint and data notice.
        // The exact camp route is paired with the versioned data notice.
        fallback: form.getAttribute('data-buffer-endpoint') || ''
      });
      form.hidden = true;
      success.hidden = false;
      success.focus();
    } catch (failure) {
      status.textContent = 'Не получили подтверждение отправки. Можно попробовать ещё раз или позвонить: +7 918 699-73-07.';
    } finally {
      pending = false;
      button.disabled = false;
    }
  });
}());
