// ---------- page-enter transition ----------
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('transition-overlay');
  const video = overlay ? overlay.querySelector('video') : null;
  const unmuteBtn = overlay ? overlay.querySelector('.unmute-btn') : null;

  const revealPage = () => {
    if (overlay) overlay.classList.add('hidden');
    if (unmuteBtn) unmuteBtn.classList.remove('show');
  };

  const showUnmuteButton = () => {
    if (unmuteBtn) unmuteBtn.classList.add('show');
  };

  // Try to autoplay WITH sound first. Browsers block autoplay-with-sound
  // on a fresh page load unless the user already interacted with this
  // page, so if that gets rejected we fall back to muted playback and
  // show a small tap-to-unmute button instead of failing silently.
  const playEntryVideo = () => {
    if (!video) { revealPage(); return; }
    video.currentTime = 0;
    video.muted = false;
    const p = video.play();
    if (p && p.catch) {
      p.catch(() => {
        video.muted = true;
        showUnmuteButton();
        video.play().catch(() => revealPage());
      });
    }
    video.addEventListener('ended', revealPage, { once: true });
    setTimeout(revealPage, 4500); // safety net
  };

  playEntryVideo();

  if (unmuteBtn) {
    unmuteBtn.addEventListener('click', () => {
      video.muted = false;
      unmuteBtn.classList.remove('show');
    });
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
        // This play() call happens inside the click handler itself, so
        // it still counts as user-gesture-initiated and browsers will
        // allow sound here even though the load-time autoplay above
        // often can't have sound.
        video.muted = false;
        const p = video.play();
        if (p && p.catch) p.catch(() => {});
      }
      setTimeout(() => { window.location.href = href; }, 650);
    });
  });

  // ---------- press/release feel for touch (mirrors :active for tap devices) ----------
  document.querySelectorAll('.link-row').forEach(btn => {
    btn.addEventListener('touchstart', () => btn.classList.add('is-pressed'), { passive: true });
    btn.addEventListener('touchend', () => btn.classList.remove('is-pressed'), { passive: true });
    btn.addEventListener('touchcancel', () => btn.classList.remove('is-pressed'), { passive: true });
  });

  // ---------- YouTube channel card (only present on index.html) ----------
  const ytCard = document.getElementById('yt-card');
  if (ytCard) {
    fetch('/api/youtube')
      .then(r => {
        if (!r.ok) throw new Error('yt api not ok');
        return r.json();
      })
      .then(data => {
        const fmt = (n) => {
          n = Number(n);
          if (isNaN(n)) return null;
          if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + 'M';
          if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
          return String(n);
        };

        const subEl = ytCard.querySelector('.stats-subs');
        if (subEl) {
          subEl.textContent = data.subscriberCount != null
            ? (fmt(data.subscriberCount) + ' subscribers')
            : 'Subscriber count hidden';
        }

        const avatarEl = ytCard.querySelector('.stats-avatar');
        if (avatarEl && data.channelThumbnail) {
          avatarEl.src = data.channelThumbnail;
        }

        if (data.videoId) {
          const thumbEl = ytCard.querySelector('.stats-video-thumb');
          const titleEl = ytCard.querySelector('.stats-video-title');
          const linkEl = ytCard.querySelector('.stats-video');
          if (thumbEl) thumbEl.src = data.videoThumbnail;
          if (titleEl) titleEl.textContent = data.videoTitle;
          if (linkEl) linkEl.href = 'https://www.youtube.com/watch?v=' + data.videoId;
        }

        ytCard.classList.add('loaded');
      })
      .catch(() => {
        ytCard.classList.add('failed'); // CSS hides it quietly
      });
  }
});
