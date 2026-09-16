// ---------- page-enter transition ----------
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('transition-overlay');
  const video = overlay ? overlay.querySelector('video') : null;

  const revealPage = () => {
    if (overlay) overlay.classList.add('hidden');
  };

  if (video) {
    video.currentTime = 0;
    const playPromise = video.play();
    if (playPromise && playPromise.catch) playPromise.catch(() => revealPage());
    video.addEventListener('ended', revealPage, { once: true });
    // safety net in case 'ended' never fires (autoplay blocked, etc.)
    setTimeout(revealPage, 4000);
  } else {
    revealPage();
  }

  // ---------- internal navigation with exit transition ----------
  let navigating = false;
  document.querySelectorAll('a[data-transition="true"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (!href || navigating) return;
      e.preventDefault();
      navigating = true;

      if (overlay) overlay.classList.remove('hidden');
      if (video) {
        video.currentTime = 0;
        const p = video.play();
        if (p && p.catch) p.catch(() => {});
      }
      setTimeout(() => { window.location.href = href; }, 650);
    });
  });

  // ---------- press/release feel for touch (mirrors :active for tap devices) ----------
  document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('touchstart', () => btn.classList.add('is-pressed'), { passive: true });
    btn.addEventListener('touchend', () => btn.classList.remove('is-pressed'), { passive: true });
    btn.addEventListener('touchcancel', () => btn.classList.remove('is-pressed'), { passive: true });
  });
});
