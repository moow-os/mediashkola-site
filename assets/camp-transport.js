/* Camp-only transport. A blank fallback keeps the existing Windows-only route.
   No phone/name or queued application is written to browser storage. */
(function (root) {
  'use strict';
  function identity(storage, cryptoApi) {
    var memory = null;
    return async function (application) {
      var fingerprint = JSON.stringify([application.kind, application.camp, application.phone,
        application.parent_name, application.consent_version, application.page]);
      if (memory && memory.fingerprint === fingerprint) return memory.id;
      var hash = null, saved = null;
      if (cryptoApi.subtle) {
        try {
          var digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
          hash = Array.from(new Uint8Array(digest), function (v) { return v.toString(16).padStart(2, '0'); }).join('');
        } catch (ignore) { /* Without a digest, keep retry identity in memory. */ }
        try { saved = JSON.parse(storage && storage.getItem('msh-camp-request-v1')); } catch (ignore) { /* Storage may be blocked. */ }
      }
      var id;
      if (hash && saved && saved.hash === hash && saved.expires > Date.now() && /^[a-f0-9]{32}$/.test(saved.id)) id = saved.id;
      else {
        var random = new Uint8Array(16); cryptoApi.getRandomValues(random);
        id = Array.from(random, function (v) { return v.toString(16).padStart(2, '0'); }).join('');
      }
      memory = { fingerprint: fingerprint, id: id };
      if (hash) {
        try { storage && storage.setItem('msh-camp-request-v1', JSON.stringify({ id: id, hash: hash, expires: Date.now() + 86400000 })); }
        catch (ignore) { /* Retry identity remains available in memory. */ }
      }
      return id;
    };
  }
  async function send(application, options) {
    var fetcher = options.fetcher || root.fetch.bind(root);
    async function post(endpoint, fallback) {
      var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, options.timeoutMs || (options.fallback ? 6000 : 20000));
      try {
        var response = await fetcher(endpoint, { method: 'POST', credentials: 'omit', redirect: 'error',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(application), signal: controller.signal });
        var body = await response.json().catch(function () { return {}; });
        if (response.ok && body.ok === true && (!fallback || (body.queued === true
          && body.request_id === application.request_id && /^[a-f0-9]{64}$/.test(body.buffer_payload_hash || '')
          && Number.isFinite(Date.parse(body.at)) && new Date(body.at).toISOString() === body.at))) return body;
        var error = new Error('intake_unconfirmed');
        // During the rolling update the old Windows process cannot interpret
        // the newly published checkbox. The buffer validates this exact v2
        // independently; phone/auth/origin/conflict failures still stop here.
        var oldConsentRuntime = response.status === 422 && body.error === 'consent_version'
          && application.kind === 'camp' && application.consent_version === 'camp-callback-20261023-2';
        error.noFallback = response.status >= 400 && response.status < 500
          && ![408, 425, 429].includes(response.status) && body.error !== 'delivery_unconfirmed'
          && !oldConsentRuntime;
        throw error;
      } finally { clearTimeout(timer); }
    }
    try { return { route: 'windows', receipt: await post(options.primary, false) }; }
    catch (error) {
      if (!options.fallback || error.noFallback) throw error;
      var url = new URL(options.fallback);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('qualified_https_fallback_required');
      return { route: 'buffer', receipt: await post(url.href, true) };
    }
  }
  var api = { identity: identity, send: send };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CampTransport = api;
}(typeof window === 'object' ? window : globalThis));
