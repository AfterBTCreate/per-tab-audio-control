'use strict';

// Per-Tab Audio Control - Options Page Star Field
// Animated canvas background: stars + shooting stars (dark), clouds + overcast (light)
// Ported from the afterbedtimecreations.com website StarField component.

const _sfCanvas = document.getElementById('starField');
const _sfCtx = _sfCanvas ? _sfCanvas.getContext('2d') : null;

if (_sfCanvas && _sfCtx) {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function isDayTheme() {
    return document.body.classList.contains('light-mode');
  }

  let mouseX = 0;
  let mouseY = 0;
  let targetMouseX = 0;
  let targetMouseY = 0;
  let w = 0;
  let h = 0;
  let frame = 0;
  let currentThemeIsDay = isDayTheme();

  // ── Night mode: Stars (pre-rendered glows) ──

  let stars = [];
  let shootingStars = [];

  function createStarGlow(size) {
    const glowRadius = size * 3;
    const dim = Math.ceil(glowRadius * 2) + 2;
    const offscreen = document.createElement('canvas');
    offscreen.width = dim;
    offscreen.height = dim;
    const offCtx = offscreen.getContext('2d');
    const cx = dim / 2;
    const cy = dim / 2;
    const glow = offCtx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
    glow.addColorStop(0, 'rgba(200, 210, 230, 0.6)');
    glow.addColorStop(0.4, 'rgba(200, 210, 230, 0.15)');
    glow.addColorStop(1, 'rgba(200, 210, 230, 0)');
    offCtx.beginPath();
    offCtx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    offCtx.fillStyle = glow;
    offCtx.fill();
    return offscreen;
  }

  function createStars() {
    const count = Math.min(Math.floor((w * h) / 3000), 300);
    stars = [];
    for (let i = 0; i < count; i++) {
      const size = 0.5 + Math.random() * 2;
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: size,
        alpha: 0.3 + Math.random() * 0.7,
        twinkleSpeed: 0.005 + Math.random() * 0.015,
        twinkleOffset: Math.random() * Math.PI * 2,
        layer: Math.floor(Math.random() * 3),
        glowCanvas: createStarGlow(size),
      });
    }
  }

  function spawnShootingStar() {
    if (shootingStars.length > 2) return;
    const angle = (Math.PI / 6) + Math.random() * (Math.PI / 4);
    const speed = 4 + Math.random() * 6;
    shootingStars.push({
      x: Math.random() * w * 0.8,
      y: Math.random() * h * 0.4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife: 40 + Math.random() * 30,
      size: 1 + Math.random() * 1.5,
    });
  }

  function drawNight() {
    mouseX += (targetMouseX - mouseX) * 0.05;
    mouseY += (targetMouseY - mouseY) * 0.05;

    for (const star of stars) {
      const parallaxScale = [0.005, 0.015, 0.03][star.layer];
      const px = star.x + mouseX * parallaxScale;
      const py = star.y + mouseY * parallaxScale;

      const twinkle = prefersReduced
        ? star.alpha
        : star.alpha * (0.5 + 0.5 * Math.sin(frame * star.twinkleSpeed + star.twinkleOffset));

      // Soft glow (pre-rendered offscreen canvas)
      _sfCtx.globalAlpha = twinkle;
      _sfCtx.drawImage(star.glowCanvas, px - star.glowCanvas.width / 2, py - star.glowCanvas.height / 2);
      _sfCtx.globalAlpha = 1;

      // Bright core
      _sfCtx.beginPath();
      _sfCtx.arc(px, py, star.size * 0.6, 0, Math.PI * 2);
      _sfCtx.fillStyle = `rgba(230, 235, 245, ${twinkle})`;
      _sfCtx.fill();

      // Cross spikes on brighter/larger stars
      if (star.size > 1.2 && twinkle > 0.4) {
        const spikeLen = star.size * 3.5 * twinkle;
        const spikeAlpha = twinkle * 0.3;
        _sfCtx.strokeStyle = `rgba(200, 210, 230, ${spikeAlpha})`;
        _sfCtx.lineWidth = 0.5;
        _sfCtx.beginPath();
        _sfCtx.moveTo(px - spikeLen, py);
        _sfCtx.lineTo(px + spikeLen, py);
        _sfCtx.moveTo(px, py - spikeLen);
        _sfCtx.lineTo(px, py + spikeLen);
        _sfCtx.stroke();
      }
    }

    // Shooting stars
    if (!prefersReduced) {
      if (frame % 300 === 0 && Math.random() > 0.4) {
        spawnShootingStar();
      }

      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const s = shootingStars[i];
        s.x += s.vx;
        s.y += s.vy;
        s.life++;

        const progress = s.life / s.maxLife;
        const alpha = progress < 0.1 ? progress * 10 : progress > 0.7 ? (1 - progress) / 0.3 : 1;

        const tailLen = 25;
        _sfCtx.beginPath();
        _sfCtx.moveTo(s.x, s.y);
        _sfCtx.lineTo(s.x - s.vx * tailLen * alpha, s.y - s.vy * tailLen * alpha);
        const grad = _sfCtx.createLinearGradient(
          s.x, s.y,
          s.x - s.vx * tailLen * alpha,
          s.y - s.vy * tailLen * alpha
        );
        grad.addColorStop(0, `rgba(212, 199, 138, ${alpha * 0.8})`);
        grad.addColorStop(1, 'rgba(212, 199, 138, 0)');
        _sfCtx.strokeStyle = grad;
        _sfCtx.lineWidth = s.size;
        _sfCtx.lineCap = 'round';
        _sfCtx.stroke();

        if (s.life >= s.maxLife) {
          shootingStars.splice(i, 1);
        }
      }
    }
  }

  // ── Day mode: Clouds + cool overcast (pre-rendered blobs) ──

  let clouds = [];

  function createBlobGlow(rx, ry) {
    const pad = 2;
    const cw = Math.ceil(rx * 2) + pad;
    const ch = Math.ceil(ry * 2) + pad;
    const offscreen = document.createElement('canvas');
    offscreen.width = cw;
    offscreen.height = ch;
    const offCtx = offscreen.getContext('2d');
    const cx = cw / 2;
    const cy = ch / 2;
    const grad = offCtx.createRadialGradient(cx, cy, ry * 0.15, cx, cy, ry);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.6)');
    grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.25)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    offCtx.beginPath();
    offCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    offCtx.fillStyle = grad;
    offCtx.fill();
    return offscreen;
  }

  function createClouds() {
    clouds = [];
    const count = Math.min(Math.floor((w * h) / 80000), 20);
    for (let i = 0; i < count; i++) {
      const cw = 350 + Math.random() * 500;
      const ch = 60 + Math.random() * 100;
      const blobCount = 6 + Math.floor(Math.random() * 6);
      const blobs = [];
      for (let b = 0; b < blobCount; b++) {
        const rx = cw * (0.2 + Math.random() * 0.25);
        const ry = ch * (0.5 + Math.random() * 0.5);
        const glowCanvas = createBlobGlow(rx, ry);
        blobs.push({
          ox: (Math.random() - 0.5) * cw * 0.8,
          oy: (Math.random() - 0.5) * ch * 0.4,
          rx: rx,
          ry: ry,
          glowCanvas: glowCanvas,
          glowW: glowCanvas.width,
          glowH: glowCanvas.height,
        });
      }
      clouds.push({
        x: Math.random() * w,
        y: Math.random() * h,
        width: cw,
        height: ch,
        alpha: 0.35 + Math.random() * 0.3,
        speed: 0.04 + Math.random() * 0.1,
        blobs: blobs,
        layer: Math.floor(Math.random() * 3),
      });
    }
  }

  // Cached overcast gradient (recreated on resize)
  let overcastGrad = null;

  function createOvercastGradient() {
    overcastGrad = _sfCtx.createLinearGradient(0, 0, 0, h);
    overcastGrad.addColorStop(0, 'rgba(180, 200, 220, 0.08)');
    overcastGrad.addColorStop(0.5, 'rgba(160, 185, 210, 0.04)');
    overcastGrad.addColorStop(1, 'rgba(140, 170, 200, 0)');
  }

  function drawDay() {
    mouseX += (targetMouseX - mouseX) * 0.03;
    mouseY += (targetMouseY - mouseY) * 0.03;

    // Cool overcast ambient light (cached gradient)
    if (overcastGrad) {
      _sfCtx.fillStyle = overcastGrad;
      _sfCtx.fillRect(0, 0, w, h);
    }

    // Drifting clouds
    for (const cloud of clouds) {
      if (!prefersReduced) {
        cloud.x += cloud.speed;
        if (cloud.x > w + cloud.width) {
          cloud.x = -cloud.width * 2;
          cloud.y = Math.random() * h;
        }
      }

      const parallaxScale = [0.005, 0.015, 0.03][cloud.layer];
      const cx = cloud.x + mouseX * parallaxScale;
      const cy = cloud.y + mouseY * parallaxScale;

      _sfCtx.save();
      _sfCtx.globalAlpha = cloud.alpha;

      for (const blob of cloud.blobs) {
        const bx = cx + blob.ox;
        const by = cy + blob.oy;
        _sfCtx.drawImage(blob.glowCanvas, bx - blob.glowW / 2, by - blob.glowH / 2);
      }

      _sfCtx.restore();
    }
  }

  // ── Resize (debounced) ──
  let sfResizeTimer = null;

  function sfResizeNow() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    _sfCanvas.width = w * dpr;
    _sfCanvas.height = h * dpr;
    _sfCanvas.style.width = w + 'px';
    _sfCanvas.style.height = h + 'px';
    _sfCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    createStars();
    createClouds();
    createOvercastGradient();
  }

  function sfResize() {
    if (sfResizeTimer) clearTimeout(sfResizeTimer);
    sfResizeTimer = setTimeout(sfResizeNow, 200);
  }

  // ── Main draw loop ──
  let sfTransitioning = false;
  let isPageVisible = true;
  let sfRafId = null;

  function sfDraw() {
    _sfCtx.clearRect(0, 0, w, h);
    frame++;

    // Check for theme change with canvas fade transition
    const isDay = isDayTheme();
    if (isDay !== currentThemeIsDay && !sfTransitioning) {
      sfTransitioning = true;
      _sfCanvas.style.opacity = '0';
      setTimeout(function() {
        currentThemeIsDay = isDay;
        _sfCanvas.style.opacity = '1';
        sfTransitioning = false;
      }, 500);
    }

    if (currentThemeIsDay) {
      drawDay();
    } else {
      drawNight();
    }

    if (!prefersReduced && isPageVisible) {
      sfRafId = requestAnimationFrame(sfDraw);
    }
  }

  // ── Visibility guard ──
  document.addEventListener('visibilitychange', function() {
    isPageVisible = !document.hidden;
    if (isPageVisible && !prefersReduced) {
      sfRafId = requestAnimationFrame(sfDraw);
    }
  });

  // ── Event listeners ──
  let sfMouseQueued = false;
  document.addEventListener('mousemove', function(e) {
    if (sfMouseQueued) return;
    sfMouseQueued = true;
    requestAnimationFrame(function() {
      targetMouseX = (e.clientX - w / 2);
      targetMouseY = (e.clientY - h / 2);
      sfMouseQueued = false;
    });
  });

  window.addEventListener('resize', sfResize);
  sfResizeNow();

  if (prefersReduced) {
    sfDraw();
  } else {
    requestAnimationFrame(sfDraw);
  }
}
