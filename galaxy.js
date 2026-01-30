(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  let DPR = Math.max(1, Math.min(2, devicePixelRatio || 1));

  function resize() {
    const w = innerWidth, h = innerHeight;
    canvas.width = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }
  addEventListener('resize', resize, { passive: true });
  resize();

  // Parameters
  const P = {
    arms: 4,
    stars: 12000,
    coreRadius: 40,
    galaxyRadius: 520,
    twist: 1.9,         // spiral twist factor
    thickness: 0.22,    // disk thickness
    rotation: 0,
    autoSpin: 0.0007,
    camZoom: 1,
  };

  // Random helper
  function randn() {
    // Box-Muller transform for normal distribution
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // Build galaxy star particles
  const TAU = Math.PI * 2;
  const stars = new Array(P.stars);
  for (let i = 0; i < P.stars; i++) {
    const arm = i % P.arms;
    const armAngle = (arm / P.arms) * TAU;
    // radial distance biased toward outer disk but with core density
    let r = Math.pow(Math.random(), 0.5) * P.galaxyRadius; // bias outward
    const angle = armAngle + r * (P.twist / P.galaxyRadius) * TAU + (randn() * 0.12);
    const x = Math.cos(angle) * r + randn() * 6;
    const y = (randn() * P.thickness) * (0.3 + r / P.galaxyRadius) * 90; // vertical thickness
    const z = Math.sin(angle) * r + randn() * 6;

    // color: hotter/bluer in core, cooler/redder in outer rim
    const t = r / P.galaxyRadius;
    const coreMix = Math.exp(-r * 0.01);
    const R = Math.floor(180 + (80 * t));
    const G = Math.floor(190 + (40 * (1 - Math.abs(0.5 - t) * 2)));
    const B = Math.floor(255 - (120 * t) + coreMix * 30);
    const a = 0.35 + (1 - t) * 0.35 + Math.random() * 0.1;

    stars[i] = { x, y, z, r: R, g: G, b: B, a, tw: Math.random() * TAU };
  }

  // Background field
  const bg = Array.from({ length: 1600 }, () => {
    const rr = 2000 + Math.random() * 2400;
    const th = Math.random() * TAU;
    const ph = Math.acos(Math.random() * 2 - 1);
    const x = rr * Math.sin(ph) * Math.cos(th);
    const y = rr * Math.cos(ph);
    const z = rr * Math.sin(ph) * Math.sin(th);
    return { x, y, z, s: 0.6 + Math.random() * 1.6, tw: Math.random() * TAU };
  });

  // Camera/project
  function project(x, y, z) {
    const rot = P.rotation;
    // rotate around Y and X for a tilted disc
    const cosy = Math.cos(rot), siny = Math.sin(rot);
    const xz = { x: x * cosy - z * siny, z: x * siny + z * cosy };
    const tilt = 0.55; // constant tilt on X
    const cosx = Math.cos(tilt), sinx = Math.sin(tilt);
    const yz = { y: y * cosx - xz.z * sinx, z: y * sinx + xz.z * cosx };
    const fov = 800 * P.camZoom, dist = 1400;
    const s = fov / (dist - yz.z);
    return { x: xz.x * s, y: yz.y * s, s };
  }

  // Interactions
  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
  addEventListener('mouseup', () => dragging = false);
  addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX; const dy = e.clientY - lastY;
    P.rotation += dx * 0.0035;
    P.camZoom = Math.max(0.5, Math.min(2.0, P.camZoom + dy * -0.001));
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.08 : 0.92;
    P.camZoom = Math.max(0.5, Math.min(2.2, P.camZoom * delta));
  }, { passive: false });

  // Touch
  canvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; dragging = true; lastX = t.clientX; lastY = t.clientY; }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    const t = e.touches[0]; if (!t) return;
    const dx = t.clientX - lastX, dy = t.clientY - lastY;
    P.rotation += dx * 0.0035; P.camZoom = Math.max(0.5, Math.min(2.2, P.camZoom + dy * -0.001));
    lastX = t.clientX; lastY = t.clientY;
  }, { passive: true });
  addEventListener('touchend', () => dragging = false, { passive: true });

  function drawCoreGlow(cx, cy, r) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,240,220,0.45)');
    g.addColorStop(0.3, 'rgba(255,220,200,0.28)');
    g.addColorStop(0.7, 'rgba(180,150,255,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
  }

  let tPrev = 0;
  function frame(t) {
    const dt = Math.min(32, t - tPrev) || 16; tPrev = t;
    if (!dragging) P.rotation += P.autoSpin * dt;

    const W = canvas.width, H = canvas.height; const cx = W * 0.5, cy = H * 0.52;
    ctx.clearRect(0, 0, W, H);

    // Background stars
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < bg.length; i++) {
      const s = bg[i];
      const p = project(s.x, s.y, s.z);
      const tw = (Math.sin((t * 0.002) + s.tw) * 0.5 + 0.5) * 0.6 + 0.3;
      const size = s.s * p.s;
      if (size <= 0) continue;
      ctx.globalAlpha = Math.max(0.2, Math.min(1, tw));
      ctx.fillRect(p.x, p.y, size, size);
    }
    ctx.restore();

    // Galaxy core glow
    drawCoreGlow(cx, cy, 340 * DPR);

    // Draw stars (painter’s algorithm based on radius)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const p = project(s.x, s.y, s.z);
      if (p.s <= 0) continue;
      const alpha = Math.min(1, Math.max(0.12, s.a * p.s));
      ctx.fillStyle = `rgba(${s.r},${s.g},${s.b},${alpha})`;
      const size = 0.9 + p.s * 1.4;
      const tw = (Math.sin(t * 0.003 + s.tw) * 0.5 + 0.5) * 0.4 + 0.6;
      const ss = size * tw;
      ctx.fillRect(p.x - ss * 0.5, p.y - ss * 0.5, ss, ss);
    }
    ctx.restore();

    // Nebula wisps using large translucent strokes
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
      const ang = P.rotation * 0.6 + i * (TAU / 3);
      const x = cx + Math.cos(ang) * 120 * DPR;
      const y = cy + Math.sin(ang) * 60 * DPR;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, 380 * DPR);
      grd.addColorStop(0, 'rgba(120,160,255,0.06)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(x, y, 380 * DPR, 0, TAU); ctx.fill();
    }
    ctx.restore();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

