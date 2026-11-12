/* Release candidate: preserve the reviewed phone-booking experience on every host.
   The excursion receiver has not been verified for production. No POST is enabled here. */
(() => {
  const programs = Object.freeze({presenter: 'Я телеведущий!', blogger: 'Я блогер!'});
  document.querySelectorAll('.exc-player').forEach(player => {
    const video = player.querySelector('video');
    const button = player.querySelector('.exc-play');
    player.dataset.enhanced = '';
    const reveal = () => { if (!video.paused && video.readyState >= 2) player.dataset.frame = ''; };
    video.addEventListener('playing', () => {
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(reveal);
      else requestAnimationFrame(() => requestAnimationFrame(reveal));
    });
    video.addEventListener('play', () => {
      document.querySelectorAll('.exc-player video').forEach(other => { if (other !== video) other.pause(); });
    });
    video.addEventListener('ended', () => { delete player.dataset.frame; });
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await video.play(); }
      catch { button.querySelector('span:last-child').textContent = 'Открыть видео'; }
      finally { button.disabled = false; }
    });
  });
  const dialog = document.querySelector('#exc-booking');
  const form = document.querySelector('#exc-form');
  if (!dialog || !form) return;
  const status = document.querySelector('#exc-form-status');
  form.hidden = true;
  document.querySelector('#exc-phone-booking').hidden = false;
  document.querySelectorAll('[data-book]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.book;
    if (!Object.hasOwn(programs, key)) return;
    form.elements.program.value = key;
    document.querySelector('#exc-booking-summary').textContent = `${programs[key]} · 1,5 часа · группа от 8 человек · 1 000 ₽ с человека`;
    status.textContent = '';
    dialog.showModal();
  }));
  dialog.querySelector('.exc-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  // Keep even programmatic form submission local until the existing receiver is qualified.
  form.addEventListener('submit', event => { event.preventDefault(); });
})();
