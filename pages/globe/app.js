// moved to module path
(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  let DPR = Math.max(1, Math.min(2, devicePixelRatio || 1));

  function resize() {
    const { innerWidth: w, innerHeight: h } = window;
    canvas.width = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }
  addEventListener('resize', resize, { passive: true });
  resize();

  // Scene params
  const params = {
    radius: 240,             // Earth radius in screen space
    camDist: 800,            // Camera distance
    fov: 700,                // Focal length
    rotY: 0,
    rotX: 0.25,              // slight tilt
    autoSpin: 0.0035,        // radians per frame
    atmosphere: 1.35,        // atmosphere scale
    stars: 800,
    pts: 3200,               // particle points on sphere
  };

  // Utility
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Create starfield (fixed in world space)
  const stars = Array.from({ length: params.stars }, () => {
    const r = 2000 + Math.random() * 1800;
    const t = Math.random() * TAU;
    const p = Math.acos(Math.random() * 2 - 1);
    const x = r * Math.sin(p) * Math.cos(t);
    const y = r * Math.cos(p);
    const z = r * Math.sin(p) * Math.sin(t);
    const s = 0.6 + Math.random() * 1.4;
    return { x, y, z, s, tw: Math.random() * TAU };
  });

  // Fibonacci sphere for globe points
  const points = (() => {
    const N = params.pts;
    const phi = Math.PI * (3 - Math.sqrt(5));
    const arr = new Array(N);
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2; // from 1 to -1
      const r = Math.sqrt(1 - y * y);
      const theta = phi * i;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      // color by latitude bands to mimic land/ocean glints
      const lat = Math.acos(y) / Math.PI; // 0..1
      // palette: deep ocean -> teal -> jade -> ice
      const ocean = [32, 120, 255];
      const tropic = [0, 190, 170];
      const polar = [180, 220, 255];
      const mix = (a, b, t) => a + (b - a) * t;
      const t1 = clamp(Math.abs(0.5 - lat) * 2, 0, 1);
      const rC = Math.floor(mix(ocean[0], tropic[0], 1 - t1));
      const gC = Math.floor(mix(ocean[1], tropic[1], 1 - t1));
      const bC = Math.floor(mix(ocean[2], tropic[2], 1 - t1));
      const iceT = clamp(Math.max(0, Math.abs(lat - 1) - 0.65) * 4, 0, 1);
      const R = Math.floor(mix(rC, polar[0], iceT));
      const G = Math.floor(mix(gC, polar[1], iceT));
      const B = Math.floor(mix(bC, polar[2], iceT));
      arr[i] = { x, y, z, R, G, B };
    }
    return arr;
  })();

  // Atmosphere radial gradient (screen-space)
  function drawAtmosphere(cx, cy, r, alpha) {
    const g = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * params.atmosphere);
    g.addColorStop(0, `rgba(80,140,255,${alpha * 0.18})`);
    g.addColorStop(0.6, `rgba(50,120,255,${alpha * 0.10})`);
    g.addColorStop(1, 'rgba(10,20,60,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * params.atmosphere, 0, TAU);
    ctx.fill();
  }

  // Project 3D to 2D screen
  function project(x, y, z) {
    const d = params.camDist;
    const f = params.fov;
    const scale = f / (d - z);
    return { x: x * scale, y: y * scale, scale };
  }

  // Rotation helpers
  function rotY(x, z, a) {
    const ca = Math.cos(a), sa = Math.sin(a);
    return { x: x * ca - z * sa, z: x * sa + z * ca };
  }
  function rotX(y, z, a) {
    const ca = Math.cos(a), sa = Math.sin(a);
    return { y: y * ca - z * sa, z: y * sa + z * ca };
  }

  // Interaction
  let dragging = false;
  let lastX = 0, lastY = 0;
  canvas.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
  addEventListener('mouseup', () => dragging = false);
  addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    params.rotY += dx * 0.005;
    params.rotX = clamp(params.rotX + dy * 0.005, -1.2, 1.2);
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    params.camDist = clamp(params.camDist + (e.deltaY > 0 ? 40 : -40), 420, 1400);
  }, { passive: false });

  // Touch
  canvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; dragging = true; lastX = t.clientX; lastY = t.clientY; }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    const t = e.touches[0]; if (!t) return;
    const dx = t.clientX - lastX; const dy = t.clientY - lastY;
    params.rotY += dx * 0.005; params.rotX = clamp(params.rotX + dy * 0.005, -1.2, 1.2);
    lastX = t.clientX; lastY = t.clientY;
  }, { passive: true });
  addEventListener('touchend', () => dragging = false, { passive: true });

  // Light direction
  const light = { x: 1, y: 0.2, z: 0.6 };
  const norm = (v) => {
    const m = Math.hypot(v.x, v.y, v.z) || 1; v.x/=m; v.y/=m; v.z/=m; return v;
  };
  norm(light);

  // Main loop
  let tPrev = 0;
  function frame(t) {
    const dt = Math.min(32, t - tPrev) || 16; tPrev = t;
    if (!dragging) params.rotY += params.autoSpin * dt;

    const W = canvas.width, H = canvas.height; // device pixels
    const cx = W * 0.5, cy = H * 0.5;
    ctx.clearRect(0, 0, W, H);

    // Stars (parallax by small rotation only)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      // rotate in Y to match camera spin
      const ry = rotY(s.x, s.z, params.rotY * 0.2);
      const rz = rotX(s.y, ry.z, params.rotX * 0.2);
      const p = project(ry.x, rz.y, rz.z);
      const x = p.x + 0; const y = p.y + 0;
      const tw = (Math.sin((t * 0.002) + s.tw) * 0.5 + 0.5) * 0.6 + 0.4;
      const size = (s.s * p.scale * 1.1);
      if (size <= 0) continue;
      ctx.globalAlpha = clamp(tw, 0.35, 1);
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();

    // Earth core
    ctx.save();
    ctx.translate(cx, cy);
    const R = params.radius * DPR;

    // Atmosphere glow behind
    drawAtmosphere(cx, cy, R, 1);

    // Draw sphere body with glossy shading using many particles
    const list = [];
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      // rotate
      const y1 = rotX(pt.y * R, pt.z * R, params.rotX);
      const x1 = rotY(pt.x * R, y1.z, params.rotY);
      const X = x1.x, Y = y1.y, Z = x1.z;
      // lighting - dot with light vector
      const nx = pt.x, ny = pt.y, nz = pt.z; // normal on unit sphere
      const L = clamp(nx * light.x + ny * light.y + nz * light.z, -1, 1);
      const shade = Math.max(0.0, L);
      const spec = Math.pow(Math.max(0, L), 32) * 0.9;
      const p = project(X, Y, Z);
      if (p.scale <= 0) continue;
      list.push({
        x: p.x, y: p.y, z: Z, s: Math.max(0.6, p.scale) * 1.1,
        r: pt.R, g: pt.G, b: pt.B, shade, spec
      });
    }
    // painter's algo: back to front
    list.sort((a, b) => a.z - b.z);

    // Core darkening for night side
    ctx.save();
    const grd = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 1.2);
    grd.addColorStop(0, 'rgba(10,20,40,0.0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Draw particles
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const a = clamp(0.25 + p.shade * 0.9, 0.15, 1);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${a})`;
      const sz = 1.2 + p.s * 0.8;
      ctx.fillRect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
      if (p.spec > 0.01) {
        ctx.fillStyle = `rgba(255,255,255,${p.spec * 0.6})`;
        const s2 = sz * 1.8;
        ctx.fillRect(p.x - s2 * 0.5, p.y - s2 * 0.5, s2, s2);
      }
    }

    // Soft rim light
    ctx.globalCompositeOperation = 'screen';
    const rim = ctx.createRadialGradient(-R * 0.2, -R * 0.1, R * 0.8, 0, 0, R * 1.2);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(1, 'rgba(140,180,255,0.15)');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.18, 0, TAU);
    ctx.fill();

    ctx.restore();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
