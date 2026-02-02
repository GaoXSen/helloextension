// moved to module path
(() => {
  const canvas = document.getElementById('c');
  const gameEl = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overEl = document.getElementById('over');
  const finalScoreEl = document.getElementById('finalScore');
  const skinsEl = document.getElementById('skins');

  let DPR = Math.max(1, Math.min(2, devicePixelRatio || 1));
  function resize() {
    const r = gameEl.getBoundingClientRect();
    const w = Math.max(200, r.width);
    const h = Math.max(200, r.height);
    canvas.width = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    layout();
  }
  addEventListener('resize', resize, { passive: true });
  // Ensure sizing after layout/fonts load
  addEventListener('load', () => {
    resize();
    // extra tick for safety in some WebView/extension contexts
    setTimeout(resize, 0);
  }, { once: true });

  // Skins definition
  const SKINS = [
    {
      id: 'neon', name: '霓虹',
      bg: (ctx, W, H) => {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#0a0f2a'); g.addColorStop(1, '#101b45');
        return g;
      },
      snake: { head: '#7df3ff', body: ['#6aa2ff', '#c788ff'], glow: 'rgba(120,200,255,0.45)' },
      apple: { fill: '#ff6b7b', glow: 'rgba(255,80,110,0.5)' },
      particle: ['#7df3ff', '#a6ffea', '#c788ff'],
      gridGlow: 'rgba(120,150,255,0.08)'
    },
    {
      id: 'jade', name: '翡翠',
      bg: (ctx, W, H) => {
        const g = ctx.createRadialGradient(W*0.7, H*0.3, 0, W*0.7, H*0.3, Math.hypot(W,H)*0.8);
        g.addColorStop(0, '#05231f'); g.addColorStop(1, '#071112');
        return g;
      },
      snake: { head: '#68e0a1', body: ['#24c3a9', '#8affc9'], glow: 'rgba(120,240,190,0.5)' },
      apple: { fill: '#ffd166', glow: 'rgba(255,209,102,0.45)' },
      particle: ['#68e0a1', '#b2ffe2', '#2fe0cc'],
      gridGlow: 'rgba(120,240,190,0.06)'
    },
    {
      id: 'ember', name: '余烬',
      bg: (ctx, W, H) => {
        const g = ctx.createLinearGradient(0, H, W, 0);
        g.addColorStop(0, '#1a0b12'); g.addColorStop(1, '#2a1016');
        return g;
      },
      snake: { head: '#ff9a62', body: ['#ff6b3d', '#ffd166'], glow: 'rgba(255,140,90,0.5)' },
      apple: { fill: '#7df3ff', glow: 'rgba(120,200,255,0.45)' },
      particle: ['#ffd166', '#ff9a62', '#ff6b3d'],
      gridGlow: 'rgba(255,160,120,0.06)'
    },
    {
      id: 'classic', name: '经典',
      bg: (ctx, W, H) => {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#0b1024'); g.addColorStop(1, '#040816');
        return g;
      },
      snake: { head: '#9ec3ff', body: ['#6aa2ff', '#9ec3ff'], glow: 'rgba(110,150,255,0.45)' },
      apple: { fill: '#ff6b7b', glow: 'rgba(255,80,110,0.5)' },
      particle: ['#9ec3ff', '#6aa2ff', '#dfe8ff'],
      gridGlow: 'rgba(170,190,255,0.06)'
    }
  ];

  // Load/save
  const save = (k, v) => localStorage.setItem('snake:' + k, JSON.stringify(v));
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem('snake:' + k)); return v ?? d; } catch { return d; } };

  let skinId = load('skin', SKINS[0].id);
  function getSkin() { return SKINS.find(s => s.id === skinId) || SKINS[0]; }

  // UI skins list
  function renderSkins() {
    skinsEl.innerHTML = '';
    SKINS.forEach(s => {
      const b = document.createElement('button');
      b.className = 'skin' + (s.id === skinId ? ' active' : '');
      b.textContent = s.name;
      b.onclick = () => { skinId = s.id; save('skin', skinId); renderSkins(); };
      skinsEl.appendChild(b);
    });
  }
  renderSkins();

  // Game settings
  const COLS = 26, ROWS = 18; // will scale to canvas
  const SPEED_BASE = 140; // ms per step at start
  const SPEED_ACCEL = 0.98; // per food

  // State
  let gridSize, originX, originY, cell;
  let snake, dir, dirQueue, food, score, best, alive, tAccum, speed;
  let particles = [];
  let paused = false; let shakeT = 0;

  function reset() {
    best = load('best', 0);
    score = 0; alive = true; paused = false; shakeT = 0;
    speed = SPEED_BASE; tAccum = 0;
    dir = { x: 1, y: 0 }; dirQueue = [];
    const cx = Math.floor(COLS/2), cy = Math.floor(ROWS/2);
    snake = [ {x: cx-2, y: cy}, {x: cx-1, y: cy}, {x: cx, y: cy} ];
    spawnFood();
    updateUI();
    overEl.style.display = 'none';
  }

  function spawnFood() {
    while (true) {
      const x = Math.floor(Math.random() * COLS);
      const y = Math.floor(Math.random() * ROWS);
      if (!snake.some(s => s.x === x && s.y === y)) { food = { x, y }; break; }
    }
  }

  function updateUI() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
  }

  function layout() {
    const W = canvas.width, H = canvas.height;
    const cellW = Math.floor(W / (COLS + 4));
    const cellH = Math.floor(H / (ROWS + 4));
    cell = Math.max(18 * DPR, Math.min(cellW, cellH));
    gridSize = { w: COLS * cell, h: ROWS * cell };
    originX = Math.floor((W - gridSize.w) * 0.5);
    originY = Math.floor((H - gridSize.h) * 0.5);
  }
  // layout called inside resize
  // trigger initial sizing after constants are defined
  resize();

  function enqueueDir(nx, ny) {
    const last = dirQueue.length ? dirQueue[dirQueue.length-1] : dir;
    if (last.x === -nx && last.y === -ny) return; // no reverse
    dirQueue.push({ x: nx, y: ny });
  }

  // Controls
  addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') enqueueDir(0,-1);
    else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') enqueueDir(0,1);
    else if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') enqueueDir(-1,0);
    else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') enqueueDir(1,0);
    else if (e.key === ' ') paused = !paused;
    else if (e.key === 'Enter' && !alive) reset();
  });

  document.getElementById('btnPause').onclick = () => paused = !paused;
  document.getElementById('btnRestart').onclick = () => reset();
  document.getElementById('btnAgain').onclick = () => { reset(); };
  document.getElementById('btnClose').onclick = () => {
    // Dismiss overlay and keep final board visible; game remains stopped
    overEl.style.display = 'none';
    paused = true;
  };

  // Touch arrows
  document.querySelectorAll('.pad [data-dir]')
    .forEach(b => b.addEventListener('click', () => {
      const d = b.getAttribute('data-dir');
      if (d === 'up') enqueueDir(0,-1);
      if (d === 'down') enqueueDir(0,1);
      if (d === 'left') enqueueDir(-1,0);
      if (d === 'right') enqueueDir(1,0);
    }));

  // Swipe
  let sx=0, sy=0;
  addEventListener('touchstart', (e) => { const t=e.touches[0]; sx=t.clientX; sy=t.clientY; }, { passive: true });
  addEventListener('touchend', (e) => {
    const t = e.changedTouches[0]; const dx=t.clientX-sx, dy=t.clientY-sy;
    if (Math.hypot(dx,dy) < 20) return;
    if (Math.abs(dx) > Math.abs(dy)) enqueueDir(dx>0?1:-1,0); else enqueueDir(0, dy>0?1:-1);
  }, { passive: true });

  // Particles
  function burst(x, y, skin) {
    for (let i=0;i<20;i++) {
      const a = Math.random()*Math.PI*2; const s = 0.8+Math.random()*2.5;
      particles.push({ x:(x+0.5)*cell, y:(y+0.5)*cell, vx:Math.cos(a)*s, vy:Math.sin(a)*s, life: 700, t:0, color: skin.particle[i%skin.particle.length] });
    }
    shakeT = 120;
  }

  // Game step
  function step() {
    const s = dirQueue.shift(); if (s) dir = s;
    const head = snake[snake.length-1];
    const nx = head.x + dir.x; const ny = head.y + dir.y;
    // collide wall
    if (nx<0||ny<0||nx>=COLS||ny>=ROWS) { gameOver(); return; }
    // collide self
    if (snake.some(p => p.x===nx && p.y===ny)) { gameOver(); return; }
    const eat = (nx===food.x && ny===food.y);
    snake.push({ x:nx, y:ny });
    if (!eat) snake.shift();
    if (eat) {
      score += 10; if (score>best) { best=score; save('best', best); }
      speed = Math.max(60, speed * SPEED_ACCEL);
      spawnFood();
      burst(nx, ny, getSkin());
      updateUI();
    }
  }

  function gameOver() {
    alive = false; overEl.style.display = 'flex'; finalScoreEl.textContent = score;
  }

  // Rendering helpers
  function drawGrid(skin, t) {
    const W = canvas.width, H = canvas.height;
    // background base
    ctx.fillStyle = skin.bg(ctx, W, H);
    ctx.fillRect(0,0,W,H);
    // animated soft blobs for depth
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const t1 = t * 0.00015, t2 = t * 0.00021;
    const cx1 = W*0.3 + Math.cos(t1)*W*0.15;
    const cy1 = H*0.4 + Math.sin(t1*1.2)*H*0.12;
    const cx2 = W*0.7 + Math.cos(t2)*W*0.18;
    const cy2 = H*0.6 + Math.sin(t2*1.1)*H*0.10;
    const g1 = ctx.createRadialGradient(cx1, cy1, 0, cx1, cy1, Math.hypot(W,H)*0.28);
    g1.addColorStop(0, 'rgba(120,160,255,0.08)'); g1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g1; ctx.beginPath(); ctx.arc(cx1, cy1, Math.hypot(W,H)*0.30, 0, Math.PI*2); ctx.fill();
    const g2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, Math.hypot(W,H)*0.28);
    g2.addColorStop(0, 'rgba(120,240,190,0.07)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(cx2, cy2, Math.hypot(W,H)*0.30, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    // vignette
    const vg = ctx.createRadialGradient(W*0.5, H*0.5, Math.min(W,H)*0.3, W*0.5, H*0.5, Math.hypot(W,H)*0.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg; ctx.fillRect(0,0,W,H);
    // subtle grid glow
    ctx.save();
    ctx.translate(originX, originY);
    ctx.strokeStyle = skin.gridGlow; ctx.lineWidth = Math.max(1, 1*DPR);
    ctx.beginPath();
    for (let x=0;x<=COLS;x++) { ctx.moveTo(x*cell, 0); ctx.lineTo(x*cell, ROWS*cell); }
    for (let y=0;y<=ROWS;y++) { ctx.moveTo(0, y*cell); ctx.lineTo(COLS*cell, y*cell); }
    ctx.stroke();
    ctx.restore();
  }

  function roundedRect(x,y,w,h,r) {
    const rr = Math.min(r, w*0.5, h*0.5);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,x+w,y+h,rr);
    ctx.arcTo(x+w,y+h,x,y+h,rr);
    ctx.arcTo(x,y+h,x,y,rr);
    ctx.arcTo(x,y,x+w,y,rr);
    ctx.closePath();
  }

  function drawSnake(skin) {
    ctx.save();
    ctx.translate(originX, originY);
    // glow pass
    ctx.shadowColor = skin.snake.glow; ctx.shadowBlur = 18 * DPR; ctx.globalCompositeOperation = 'lighter';
    for (let i=0;i<snake.length;i++) {
      const s = snake[i]; const t = i/snake.length;
      const col = skin.snake.body[i % skin.snake.body.length];
      const x = s.x*cell, y = s.y*cell;
      roundedRect(x+cell*0.12, y+cell*0.12, cell*0.76, cell*0.76, cell*0.26);
      ctx.fillStyle = col; ctx.fill();
    }
    // head overlay
    const head = snake[snake.length-1];
    const hx = head.x*cell, hy = head.y*cell;
    roundedRect(hx+cell*0.08, hy+cell*0.08, cell*0.84, cell*0.84, cell*0.28);
    ctx.fillStyle = skin.snake.head; ctx.fill();
    ctx.restore();
  }

  function drawFood(skin, t) {
    ctx.save(); ctx.translate(originX, originY);
    const x = food.x*cell, y = food.y*cell;
    const pul = (Math.sin(t*0.006)+1)*0.5; // 0..1
    const r = cell*0.32 + pul*cell*0.06;
    // glow
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(x+cell*0.5, y+cell*0.5, r*0.4, x+cell*0.5, y+cell*0.5, r*1.8);
    g.addColorStop(0, skin.apple.glow); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x+cell*0.5, y+cell*0.5, r*1.6, 0, Math.PI*2); ctx.fill();
    // core
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = skin.apple.fill; ctx.beginPath(); ctx.arc(x+cell*0.5, y+cell*0.5, r, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawParticles(dt) {
    ctx.save(); ctx.translate(originX, originY); ctx.globalCompositeOperation = 'lighter';
    for (let i=particles.length-1;i>=0;i--) {
      const p = particles[i]; p.t += dt; if (p.t>=p.life) { particles.splice(i,1); continue; }
      const a = 1 - p.t/p.life; p.x += p.vx*DPR; p.y += p.vy*DPR;
      ctx.fillStyle = `rgba(${hexToRgb(p.color)},${(a*0.9).toFixed(3)})`;
      ctx.fillRect(p.x-2, p.y-2, 4, 4);
    }
    ctx.restore();
  }

  function hexToRgb(hex){
    const x = hex.replace('#','');
    const bigint = parseInt(x.length===3 ? x.split('').map(c=>c+c).join('') : x, 16);
    const r = (bigint>>16)&255, g=(bigint>>8)&255, b=bigint&255; return `${r},${g},${b}`;
  }

  let last = 0;
  function frame(t) {
    const dt = last ? (t-last) : 16; last = t;
    const skin = getSkin();
    // shake
    if (shakeT>0) shakeT = Math.max(0, shakeT - dt);
    const sx = (Math.random()-0.5)*(shakeT/120)*8*DPR; const sy = (Math.random()-0.5)*(shakeT/120)*8*DPR;

    drawGrid(skin, t);
    ctx.save(); ctx.translate(sx, sy);
    drawFood(skin, t);
    drawSnake(skin);
    drawParticles(dt);
    ctx.restore();

    if (alive && !paused) {
      tAccum += dt;
      while (tAccum >= speed) { tAccum -= speed; step(); }
    }

    requestAnimationFrame(frame);
  }

  reset();
  requestAnimationFrame(frame);
})();
