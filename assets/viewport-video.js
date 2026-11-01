/* Only the video in view plays. Browser autoplay policy is left intact. */
(() => {
  const videos = [...document.querySelectorAll('video[data-viewport-play]')];
  if (!videos.length) return;
  const manualPauses = new WeakSet();
  const automaticPauses = new WeakSet();
  let current = null;
  let scheduled = false;

  const pause = video => {
    if (!video.paused) {
      automaticPauses.add(video);
      video.pause();
    }
  };

  function update() {
    scheduled = false;
    const height = window.innerHeight;
    const visible = videos.map(video => {
      const box = video.getBoundingClientRect();
      const pixels = Math.max(0, Math.min(box.bottom, height) - Math.max(box.top, 64));
      if (!pixels) manualPauses.delete(video);
      return { video, ratio: pixels / Math.min(box.height || 1, height - 64), distance: Math.abs((box.top + box.bottom) / 2 - height / 2) };
    }).filter(item => item.ratio >= .5).sort((a, b) => a.distance - b.distance);
    const next = document.hidden ? null : visible[0]?.video ?? null;
    videos.forEach(video => { if (video !== next) pause(video); });
    if (next === current) return;
    current = next;
    if (!current || manualPauses.has(current) || current.ended) return;
    const playing = current;
    playing.play().catch(() => {
      // Native controls remain usable when a browser declines autoplay.
    });
  }

  function schedule() {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(update);
    }
  }

  videos.forEach(video => {
    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
    video.addEventListener('pause', () => {
      if (automaticPauses.delete(video) || video.ended) return;
      manualPauses.add(video);
    });
    video.addEventListener('play', () => {
      manualPauses.delete(video);
      current = video;
      videos.forEach(other => { if (other !== video) pause(other); });
    });
    video.addEventListener('loadedmetadata', schedule);
  });
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      current = null;
      videos.forEach(pause);
    } else schedule();
  });
  schedule();
})();
