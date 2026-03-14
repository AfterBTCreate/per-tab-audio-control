'use strict';

// Per-Tab Audio Control - Options Page Star Field
// Animated canvas background: stars + shooting stars (dark), clouds + sun (light)
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
  let rayFade = currentThemeIsDay ? 1 : 0;
  let rayDelay = 0;

  // ── Night mode: Stars ──

  let stars = [];
  let shootingStars = [];

  function createStars() {
    const count = Math.min(Math.floor((w * h) / 3000), 300);
    stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: 0.5 + Math.random() * 2,
        alpha: 0.3 + Math.random() * 0.7,
        twinkleSpeed: 0.005 + Math.random() * 0.015,
        twinkleOffset: Math.random() * Math.PI * 2,
        layer: Math.floor(Math.random() * 3),
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

      // Soft glow
      const glowRadius = star.size * 3;
      const glow = _sfCtx.createRadialGradient(px, py, 0, px, py, glowRadius);
      glow.addColorStop(0, `rgba(200, 210, 230, ${twinkle * 0.6})`);
      glow.addColorStop(0.4, `rgba(200, 210, 230, ${twinkle * 0.15})`);
      glow.addColorStop(1, 'rgba(200, 210, 230, 0)');
      _sfCtx.beginPath();
      _sfCtx.arc(px, py, glowRadius, 0, Math.PI * 2);
      _sfCtx.fillStyle = glow;
      _sfCtx.fill();

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

  // ── Day mode: Clouds + sun glow ──

  let clouds = [];

  function createClouds() {
    clouds = [];
    const count = Math.min(Math.floor((w * h) / 80000), 20);
    for (let i = 0; i < count; i++) {
      const cw = 350 + Math.random() * 500;
      const ch = 60 + Math.random() * 100;
      const blobCount = 6 + Math.floor(Math.random() * 6);
      const blobs = [];
      for (let b = 0; b < blobCount; b++) {
        blobs.push({
          ox: (Math.random() - 0.5) * cw * 0.8,
          oy: (Math.random() - 0.5) * ch * 0.4,
          rx: cw * (0.2 + Math.random() * 0.25),
          ry: ch * (0.5 + Math.random() * 0.5),
        });
      }
      clouds.push({
        x: Math.random() * w,
        y: Math.random() * h,
        width: cw,
        height: ch,
        alpha: 0.35 + Math.random() * 0.3,
        speed: 0.04 + Math.random() * 0.1,
        blobs,
        layer: Math.floor(Math.random() * 3),
      });
    }
  }

  function drawDay() {
    mouseX += (targetMouseX - mouseX) * 0.03;
    mouseY += (targetMouseY - mouseY) * 0.03;

    // Sun glow from top-right corner
    const sunX = w - 40;
    const sunY = -20;
    const pulseAlpha = prefersReduced ? 1 : 0.9 + 0.1 * Math.sin(frame * 0.008);
    const rayAlpha = pulseAlpha * rayFade;

    // Large warm ambient glow
    const ambientR = Math.max(w, h) * 0.9;
    const ambient = _sfCtx.createRadialGradient(sunX, sunY, 0, sunX, sunY, ambientR);
    ambient.addColorStop(0, `rgba(255, 220, 140, ${0.30 * pulseAlpha})`);
    ambient.addColorStop(0.3, `rgba(255, 200, 120, ${0.14 * pulseAlpha})`);
    ambient.addColorStop(1, 'rgba(255, 200, 120, 0)');
    _sfCtx.fillStyle = ambient;
    _sfCtx.fillRect(0, 0, w, h);

    // Bright sun core
    const coreR = Math.min(w, h) * 0.35;
    const core = _sfCtx.createRadialGradient(sunX, sunY, 0, sunX, sunY, coreR);
    core.addColorStop(0, `rgba(255, 240, 200, ${0.50 * pulseAlpha})`);
    core.addColorStop(0.4, `rgba(255, 225, 160, ${0.25 * pulseAlpha})`);
    core.addColorStop(1, 'rgba(255, 220, 140, 0)');
    _sfCtx.fillStyle = core;
    _sfCtx.fillRect(0, 0, w, h);

    // Sun rays
    if (rayFade > 0) {
      _sfCtx.save();
      const rayCount = 14;
      const baseRotation = prefersReduced ? 0 : frame * 0.0002;
      for (let r = 0; r < rayCount; r++) {
        const angle = (r / rayCount) * Math.PI * 0.75 + Math.PI * 0.6 + baseRotation;
        const rayLen = Math.max(w, h) * 1.1;
        const spread = 0.035;

        const rx1 = sunX + Math.cos(angle - spread) * rayLen;
        const ry1 = sunY + Math.sin(angle - spread) * rayLen;
        const rx2 = sunX + Math.cos(angle + spread) * rayLen;
        const ry2 = sunY + Math.sin(angle + spread) * rayLen;
        const midX = (rx1 + rx2) / 2;
        const midY = (ry1 + ry2) / 2;

        const rayGrad = _sfCtx.createLinearGradient(sunX, sunY, midX, midY);
        rayGrad.addColorStop(0, `rgba(255, 210, 100, ${0.22 * rayAlpha})`);
        rayGrad.addColorStop(0.3, `rgba(255, 220, 130, ${0.10 * rayAlpha})`);
        rayGrad.addColorStop(1, 'rgba(255, 230, 160, 0)');

        _sfCtx.beginPath();
        _sfCtx.moveTo(sunX, sunY);
        _sfCtx.lineTo(rx1, ry1);
        _sfCtx.lineTo(rx2, ry2);
        _sfCtx.closePath();
        _sfCtx.fillStyle = rayGrad;
        _sfCtx.fill();
      }
      _sfCtx.restore();
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

      const parallaxScale = [0.005, 0.012, 0.02][cloud.layer];
      const cx = cloud.x + mouseX * parallaxScale;
      const cy = cloud.y + mouseY * parallaxScale;

      _sfCtx.save();
      _sfCtx.globalAlpha = cloud.alpha;

      for (const blob of cloud.blobs) {
        const bx = cx + blob.ox;
        const by = cy + blob.oy;
        const grad = _sfCtx.createRadialGradient(bx, by, blob.ry * 0.15, bx, by, blob.ry);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.6)');
        grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.25)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        _sfCtx.beginPath();
        _sfCtx.ellipse(bx, by, blob.rx, blob.ry, 0, 0, Math.PI * 2);
        _sfCtx.fillStyle = grad;
        _sfCtx.fill();
      }

      _sfCtx.restore();
    }
  }

  // ── Resize ──
  function sfResize() {
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
  }

  // ── Main draw loop ──
  function sfDraw() {
    _sfCtx.clearRect(0, 0, w, h);
    frame++;

    // Check for theme change (options page uses body.light-mode)
    const isDay = isDayTheme();
    if (isDay !== currentThemeIsDay) {
      currentThemeIsDay = isDay;
      if (isDay) {
        rayFade = 0;
        rayDelay = 0;
      } else {
        rayFade = 0;
        rayDelay = 0;
      }
    }

    // Sun rays: delay then fade in on theme toggle
    if (currentThemeIsDay && rayFade < 1) {
      rayDelay++;
      if (rayDelay > 60) {
        rayFade = Math.min(rayFade + 0.002, 1);
      }
    }

    if (currentThemeIsDay) {
      drawDay();
    } else {
      drawNight();
    }

    if (!prefersReduced) {
      requestAnimationFrame(sfDraw);
    }
  }

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
  sfResize();

  if (prefersReduced) {
    sfDraw();
  } else {
    requestAnimationFrame(sfDraw);
  }
}
