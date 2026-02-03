// moved to module path
(() => {
  // Basic WebGL helpers and game state
  const canvas = document.getElementById('gl');
  const gameEl = document.getElementById('game');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overEl = document.getElementById('over');
  const finalScoreEl = document.getElementById('finalScore');
  const skinsEl = document.getElementById('skins');

  const DPR = Math.max(1, Math.min(2, devicePixelRatio || 1));
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) {
    alert('WebGL 不可用');
    return;
  }

  // Resize to container
  function resize() {
    const r = gameEl.getBoundingClientRect();
    const w = Math.max(300, r.width);
    const h = Math.max(240, r.height);
    canvas.width = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
    updateProj();
  }
  addEventListener('resize', resize, { passive: true });

  // Simple mat4 helpers
  function mat4Identity(){ return [1,0,0,0,  0,1,0,0,  0,0,1,0,  0,0,0,1]; }
  function mat4Mul(a,b){
    const o = new Array(16);
    for (let i=0;i<4;i++) for (let j=0;j<4;j++) o[i*4+j] = a[i*4+0]*b[0*4+j] + a[i*4+1]*b[1*4+j] + a[i*4+2]*b[2*4+j] + a[i*4+3]*b[3*4+j];
    return o;
  }
  function mat4Translate(m, x,y,z){ const o = m.slice(); o[12]+=x; o[13]+=y; o[14]+=z; return o; }
  function mat4Scale(m, x,y,z){ const o=m.slice(); o[0]*=x; o[5]*=y; o[10]*=z; return o; }
  function mat4RotateY(m, a){ const c=Math.cos(a), s=Math.sin(a); const r=[c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; return mat4Mul(m,r); }
  function perspective(fovy, aspect, near, far){
    const f = 1/Math.tan(fovy/2); const nf = 1/(near - far);
    return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,(2*far*near)*nf,0];
  }
  function lookAt(eye, target, up){
    const zx = eye[0]-target[0], zy = eye[1]-target[1], zz = eye[2]-target[2];
    const zl = Math.hypot(zx,zy,zz) || 1; const zxN=zx/zl, zyN=zy/zl, zzN=zz/zz?zz/zl:zz/zl;
    let xx = up[1]*zzN - up[2]*zyN, xy = up[2]*zxN - up[0]*zzN, xz = up[0]*zyN - up[1]*zxN;
    const xl = Math.hypot(xx,xy,xz)||1; xx/=xl; xy/=xl; xz/=xl;
    const yx = zyN*xz - zzN*xy, yy = zzN*xx - zxN*xz, yz = zxN*xy - zyN*xx;
    return [xx,yx,zxN,0,  xy,yy,zyN,0,  xz,yz,zzN,0,  -(xx*eye[0]+xy*eye[1]+xz*eye[2]), -(yx*eye[0]+yy*eye[1]+yz*eye[2]), -(zxN*eye[0]+zyN*eye[1]+zzN*eye[2]), 1];
  }

  // Shaders
  const VS = `
  attribute vec3 aPos; attribute vec3 aNormal;
  uniform mat4 uProj, uView, uModel;
  varying vec3 vN; varying vec3 vPos;
  void main(){ vN = normalize(mat3(uModel) * aNormal); vPos = (uModel * vec4(aPos,1.0)).xyz; gl_Position = uProj * uView * vec4(vPos,1.0); }
  `;
  const FS = `
  precision mediump float;
  varying vec3 vN; varying vec3 vPos;
  uniform vec3 uColor; uniform vec3 uLightDir; uniform vec3 uAmbient; uniform vec3 uEmissive; uniform vec3 uEye;
  void main(){
    vec3 N = normalize(vN);
    vec3 L = normalize(-uLightDir);
    vec3 V = normalize(uEye - vPos);
    float d = max(dot(N, L), 0.0);
    float s = pow(max(dot(reflect(-L, N), V), 0.0), 24.0) * 0.45;
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.2);
    vec3 col = uAmbient + (d + s) * uColor + rim * uEmissive;
    gl_FragColor = vec4(col, 1.0);
  }
  `;
  function compile(type, src){ const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(sh); return sh; }
  const prog = gl.createProgram(); gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog);
  gl.useProgram(prog);

  const loc = {
    aPos: gl.getAttribLocation(prog, 'aPos'),
    aNormal: gl.getAttribLocation(prog, 'aNormal'),
    uProj: gl.getUniformLocation(prog, 'uProj'),
    uView: gl.getUniformLocation(prog, 'uView'),
    uModel: gl.getUniformLocation(prog, 'uModel'),
    uColor: gl.getUniformLocation(prog, 'uColor'),
    uLightDir: gl.getUniformLocation(prog, 'uLightDir'),
    uAmbient: gl.getUniformLocation(prog, 'uAmbient'),
    uEmissive: gl.getUniformLocation(prog, 'uEmissive'),
    uEye: gl.getUniformLocation(prog, 'uEye'),
  };

  // Geometry: unit cube with normals
  function cube(){
    const p = [
      // x,y,z,    nx,ny,nz
      // Front
      -0.5,-0.5, 0.5, 0,0,1,   0.5,-0.5,0.5,0,0,1,  0.5,0.5,0.5,0,0,1,
      -0.5,-0.5, 0.5, 0,0,1,   0.5,0.5,0.5,0,0,1,  -0.5,0.5,0.5,0,0,1,
      // Back
      0.5,-0.5,-0.5,0,0,-1,   -0.5,-0.5,-0.5,0,0,-1,  -0.5,0.5,-0.5,0,0,-1,
      0.5,-0.5,-0.5,0,0,-1,   -0.5,0.5,-0.5,0,0,-1,   0.5,0.5,-0.5,0,0,-1,
      // Left
      -0.5,-0.5,-0.5,-1,0,0,  -0.5,-0.5,0.5,-1,0,0,  -0.5,0.5,0.5,-1,0,0,
      -0.5,-0.5,-0.5,-1,0,0,  -0.5,0.5,0.5,-1,0,0,   -0.5,0.5,-0.5,-1,0,0,
      // Right
      0.5,-0.5,0.5,1,0,0,     0.5,-0.5,-0.5,1,0,0,  0.5,0.5,-0.5,1,0,0,
      0.5,-0.5,0.5,1,0,0,     0.5,0.5,-0.5,1,0,0,   0.5,0.5,0.5,1,0,0,
      // Top
      -0.5,0.5,0.5,0,1,0,     0.5,0.5,0.5,0,1,0,   0.5,0.5,-0.5,0,1,0,
      -0.5,0.5,0.5,0,1,0,     0.5,0.5,-0.5,0,1,0,  -0.5,0.5,-0.5,0,1,0,
      // Bottom
      -0.5,-0.5,-0.5,0,-1,0,  0.5,-0.5,-0.5,0,-1,0,  0.5,-0.5,0.5,0,-1,0,
      -0.5,-0.5,-0.5,0,-1,0,  0.5,-0.5,0.5,0,-1,0,  -0.5,-0.5,0.5,0,-1,0,
    ];
    return new Float32Array(p);
  }
  const cubeBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf); gl.bufferData(gl.ARRAY_BUFFER, cube(), gl.STATIC_DRAW);
  const STRIDE = 6*4; // bytes per vertex
  gl.enableVertexAttribArray(loc.aPos); gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, STRIDE, 0);
  gl.enableVertexAttribArray(loc.aNormal); gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, STRIDE, 3*4);

  // Grid lines geometry (unit grid to be scaled)
  function gridLines(cols, rows){
    const v = [];
    for(let x=0; x<=cols; x++){ v.push(x,0,0, x,0,rows); }
    for(let y=0; y<=rows; y++){ v.push(0,0,y, cols,0,y); }
    return new Float32Array(v);
  }
  const COLS = 22, ROWS = 16;
  const gridBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
  gl.bufferData(gl.ARRAY_BUFFER, gridLines(COLS, ROWS), gl.STATIC_DRAW);

  // Sphere geometry for rounded segments
  function sphere(lat=14, lon=16){
    const out=[];
    for(let i=0;i<lat;i++){
      const v1=i/lat, v2=(i+1)/lat;
      const phi1=v1*Math.PI, phi2=v2*Math.PI;
      for(let j=0;j<lon;j++){
        const u1=j/lon, u2=(j+1)/lon;
        const th1=u1*2*Math.PI, th2=u2*2*Math.PI;
        const p = (ph,th)=>[ Math.sin(ph)*Math.cos(th), Math.cos(ph), Math.sin(ph)*Math.sin(th) ];
        const a=p(phi1,th1), b=p(phi1,th2), c=p(phi2,th2), d=p(phi2,th1);
        out.push(a[0],a[1],a[2], a[0],a[1],a[2]);
        out.push(b[0],b[1],b[2], b[0],b[1],b[2]);
        out.push(c[0],c[1],c[2], c[0],c[1],c[2]);
        out.push(a[0],a[1],a[2], a[0],a[1],a[2]);
        out.push(c[0],c[1],c[2], c[0],c[1],c[2]);
        out.push(d[0],d[1],d[2], d[0],d[1],d[2]);
      }
    }
    return new Float32Array(out);
  }
  const sphereBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, sphereBuf);
  gl.bufferData(gl.ARRAY_BUFFER, sphere(), gl.STATIC_DRAW);

  // Camera & uniforms
  let proj = mat4Identity();
  let view = mat4Identity();
  let camAngle = 0.9; // y rotation
  function updateProj(){ proj = perspective(Math.PI/4, canvas.width/canvas.height, 0.1, 100.0); }
  let eye=[0,16,22];
  function updateView(){
    const dist = 22.0; eye = [Math.cos(camAngle)*dist, 16, Math.sin(camAngle)*dist];
    view = lookAt(eye, [COLS/2, 0, ROWS/2], [0,1,0]);
    gl.uniform3f(loc.uLightDir, -0.4, 1.0, -0.3);
    gl.uniform3f(loc.uAmbient, 0.03, 0.05, 0.08);
    gl.uniform3f(loc.uEye, eye[0], eye[1], eye[2]);
  }

  // Skins
  const SKINS = [
    { id:'neon', name:'霓虹', snake:[0.75,0.95,1.0], apple:[1.0,0.55,0.7], grid:[0.65,0.85,1.0] },
    { id:'jade', name:'翡翠', snake:[0.55,1.0,0.9],  apple:[1.0,0.9,0.55], grid:[0.45,0.98,0.85] },
    { id:'ember', name:'余烬', snake:[1.0,0.75,0.5], apple:[0.75,0.98,1.0], grid:[1.0,0.7,0.5] },
    { id:'classic', name:'经典', snake:[0.85,0.92,1.0], apple:[1.0,0.65,0.8], grid:[0.85,0.9,1.0] },
  ];
  const save = (k,v)=>localStorage.setItem('snake3d:'+k, JSON.stringify(v));
  const load = (k,d)=>{ try{return JSON.parse(localStorage.getItem('snake3d:'+k)) ?? d;}catch{return d;} };
  let skinId = load('skin', SKINS[0].id);
  function getSkin(){ return SKINS.find(s=>s.id===skinId)||SKINS[0]; }
  function renderSkins(){ skinsEl.innerHTML=''; SKINS.forEach(s=>{ const b=document.createElement('button'); b.className='skin'+(s.id===skinId?' active':''); b.textContent=s.name; b.onclick=()=>{ skinId=s.id; save('skin', skinId); renderSkins(); }; skinsEl.appendChild(b); }); }
  renderSkins();

  // Game state
  const SPEED_BASE = 140, SPEED_ACCEL = 0.985;
  let gridSize=1; // 1 unit per cell
  let snake, dir, q, food, score, best, alive, tAccum, speed;
  function reset(){
    best = load('best', 0);
    score=0; alive=true; speed=SPEED_BASE; tAccum=0; dir={x:1,y:0}; q=[];
    const cx=Math.floor(COLS/2), cy=Math.floor(ROWS/2);
    snake=[{x:cx-2,y:cy},{x:cx-1,y:cy},{x:cx,y:cy}];
    spawnFood();
    overEl.style.display='none';
    updateUI();
  }
  function updateUI(){ scoreEl.textContent=score; bestEl.textContent=best; }
  function spawnFood(){ while(true){ const x=Math.floor(Math.random()*COLS), y=Math.floor(Math.random()*ROWS); if(!snake.some(p=>p.x===x&&p.y===y)){ food={x,y}; return; }} }
  function enqueue(nx,ny){ const last = q.length?q[q.length-1]:dir; if(last.x===-nx && last.y===-ny) return; q.push({x:nx,y:ny}); }

  // Controls
  addEventListener('keydown', e=>{
    const k=e.key.toLowerCase();
    if(k==='arrowup'||k==='w') enqueue(0,-1);
    else if(k==='arrowdown'||k==='s') enqueue(0,1);
    else if(k==='arrowleft'||k==='a') enqueue(-1,0);
    else if(k==='arrowright'||k==='d') enqueue(1,0);
    else if(k===' ') paused=!paused;
    else if(k==='enter'&& !alive) reset();
  });
  document.getElementById('btnPause').onclick=()=>paused=!paused;
  document.getElementById('btnRestart').onclick=()=>reset();
  document.getElementById('btnAgain').onclick=()=>reset();
  document.getElementById('btnClose').onclick=()=>{ overEl.style.display='none'; };
  const btnAuto3d = document.getElementById('btnAuto3d');
  let autoPlay = false; if (btnAuto3d) btnAuto3d.onclick = ()=>{ autoPlay=!autoPlay; btnAuto3d.textContent = '自动运行：' + (autoPlay?'开':'关'); };

  // Step
  let paused=false;
  function step(){ const s=q.shift(); if(s) dir=s; const h=snake[snake.length-1]; const nx=h.x+dir.x, ny=h.y+dir.y; if(nx<0||ny<0||nx>=COLS||ny>=ROWS) return gameOver(); if(snake.some(p=>p.x===nx&&p.y===ny)) return gameOver(); const eat=(nx===food.x&&ny===food.y); snake.push({x:nx,y:ny}); if(!eat) snake.shift(); if(eat){ score+=10; if(score>best){best=score; save('best',best);} speed=Math.max(60, speed*SPEED_ACCEL); spawnFood(); updateUI(); } }
  function gameOver(){ alive=false; overEl.style.display='flex'; finalScoreEl.textContent=score; }

  // Drawing helpers
  function setModel(m){ gl.uniformMatrix4fv(loc.uModel, false, new Float32Array(m)); }
  function useCube(){ gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf); gl.enableVertexAttribArray(loc.aPos); gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, STRIDE, 0); gl.enableVertexAttribArray(loc.aNormal); gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, STRIDE, 12); }
  function useSphere(){ gl.bindBuffer(gl.ARRAY_BUFFER, sphereBuf); gl.enableVertexAttribArray(loc.aPos); gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 6*4, 0); gl.enableVertexAttribArray(loc.aNormal); gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, 6*4, 12); }
  function drawCube(x,y,z, sx,sy,sz, color, emissive){
    useCube();
    let m = mat4Identity(); m = mat4Translate(m, x, y, z); m = mat4Scale(m, sx, sy, sz); setModel(m); gl.uniform3fv(loc.uColor, color); gl.uniform3fv(loc.uEmissive, emissive||[0,0,0]); gl.drawArrays(gl.TRIANGLES, 0, 36);
  }
  function drawSphere(x,y,z, sx,sy,sz, color, emissive){
    useSphere();
    let m = mat4Identity(); m = mat4Translate(m, x, y, z); m = mat4Scale(m, sx, sy, sz); setModel(m); gl.uniform3fv(loc.uColor, color); gl.uniform3fv(loc.uEmissive, emissive||[0,0,0]); gl.drawArrays(gl.TRIANGLES, 0, (14*16)*6);
  }
  function drawGridLines(color){
    gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(loc.aNormal);
    gl.vertexAttrib3f(loc.aNormal, 0,1,0);
    gl.uniform3fv(loc.uColor, color);
    gl.uniform3fv(loc.uEmissive, [0,0,0]);
    // scale to unit grid
    let m = mat4Identity(); setModel(m);
    gl.drawArrays(gl.LINES, 0, (COLS+1)*2 + (ROWS+1)*2);
    // restore cube buffer
    useCube();
  }

  function drawScene(t){
    const skin = getSkin();
    gl.clearColor(0.01,0.015,0.05,1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    // camera slight motion
    camAngle += 0.0005 * (paused?0:1);
    updateView();
    gl.uniformMatrix4fv(loc.uProj, false, new Float32Array(proj));
    gl.uniformMatrix4fv(loc.uView, false, new Float32Array(view));

    // grid plate
    const gridCol = [Math.min(1.0, skin.grid[0]*1.05+0.05), Math.min(1.0, skin.grid[1]*1.05+0.05), Math.min(1.0, skin.grid[2]*1.0+0.04)];
    drawGridLines(gridCol);

    // plate base
    drawCube(COLS/2, -0.55, ROWS/2, COLS+0.1, 0.1, ROWS+0.1, [0.02,0.025,0.07]);

    // bright edge frame for clearer boundary
    const e = 0.06, h = 0.06, oy = 0.03;
    const edgeCol = [Math.min(1.0, gridCol[0]*1.2+0.1), Math.min(1.0, gridCol[1]*1.2+0.1), Math.min(1.0, gridCol[2]*1.2+0.1)];
    const edgeEmit = [edgeCol[0]*0.8, edgeCol[1]*0.8, edgeCol[2]*0.8];
    // top/bottom
    drawCube(COLS/2, oy, 0.0, COLS, h, e, edgeCol, edgeEmit);
    drawCube(COLS/2, oy, ROWS, COLS, h, e, edgeCol, edgeEmit);
    // left/right
    drawCube(0.0, oy, ROWS/2, e, h, ROWS, edgeCol, edgeEmit);
    drawCube(COLS, oy, ROWS/2, e, h, ROWS, edgeCol, edgeEmit);

    // snake cubes
    for(let i=0;i<snake.length;i++){
      const s = snake[i]; const tfade = (i+1)/snake.length; const base = [skin.snake[0], skin.snake[1], skin.snake[2]];
      const col = [Math.min(1.0, base[0]*(0.85+0.35*tfade)+0.05), Math.min(1.0, base[1]*(0.85+0.35*tfade)+0.05), Math.min(1.0, base[2]*(0.85+0.35*tfade)+0.05)];
      const em = [Math.min(1.0, base[0]*1.0), Math.min(1.0, base[1]*1.0), Math.min(1.0, base[2]*1.0)];
      drawSphere(s.x+0.5, 0.55, s.y+0.5, 0.86, 0.86, 0.86, col, em);
    }
    // head brighter and slightly larger
    const head = snake[snake.length-1]; drawSphere(head.x+0.5, 0.62, head.y+0.5, 1.10,1.10,1.10, [Math.min(1.0, skin.snake[0]*1.2+0.1), Math.min(1.0, skin.snake[1]*1.2+0.1), Math.min(1.0, skin.snake[2]*1.2+0.1)], [skin.snake[0]*1.1, skin.snake[1]*1.1, skin.snake[2]*1.1]);

    // food
    drawSphere(food.x+0.5, 0.5, food.y+0.5, 0.72,0.72,0.72, [Math.min(1.0, skin.apple[0]*1.1+0.05), Math.min(1.0, skin.apple[1]*1.1+0.05), Math.min(1.0, skin.apple[2]*1.1+0.05)], [skin.apple[0]*0.9, skin.apple[1]*0.9, skin.apple[2]*0.9]);
  }

  // Frame loop
  // --- Auto play helpers ---
  function inBounds(x,y){ return x>=0 && y>=0 && x<COLS && y<ROWS; }
  function bfsNextDir(){
    const head = snake[snake.length-1];
    const target = food;
    const prev = Array.from({length:ROWS},()=>Array(COLS).fill(null));
    const blocked = Array.from({length:ROWS},()=>Array(COLS).fill(false));
    for(let i=0;i<snake.length-1;i++){ const p=snake[i]; blocked[p.y][p.x]=true; }
    const q2 = [{x:head.x,y:head.y}]; prev[head.y][head.x]={x:-1,y:-1};
    const dirs=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
    while(q2.length){
      const c=q2.shift(); if (c.x===target.x && c.y===target.y) break;
      for(const d of dirs){ const nx=c.x+d.x, ny=c.y+d.y; if(!inBounds(nx,ny)||blocked[ny][nx]||prev[ny][nx]) continue; prev[ny][nx]={x:c.x,y:c.y,dir:d}; q2.push({x:nx,y:ny}); }
    }
    if(!prev[target.y][target.x]) return null;
    let cx=target.x, cy=target.y, step=null; while(true){ const p=prev[cy][cx]; if(p.x===-1) break; step={x:cx-p.x,y:cy-p.y}; cx=p.x; cy=p.y; }
    return step;
  }
  function autoEnqueue(){
    if(!autoPlay || !alive || paused) return; if(q.length>0) return;
    const vec = bfsNextDir();
    if(vec){ const lastDir = dir; if(!(lastDir.x===-vec.x && lastDir.y===-vec.y)) q.push(vec); }
    else{
      const h=snake[snake.length-1];
      const candidates=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}].sort((a,b)=>{
        const da=Math.abs((h.x+a.x)-food.x)+Math.abs((h.y+a.y)-food.y);
        const db=Math.abs((h.x+b.x)-food.x)+Math.abs((h.y+b.y)-food.y); return da-db; });
      for(const d of candidates){ if(d.x===-dir.x&&d.y===-dir.y) continue; const nx=h.x+d.x, ny=h.y+d.y; if(inBounds(nx,ny) && !snake.some(p=>p.x===nx&&p.y===ny)){ q.push(d); break; } }
    }
  }

  let last=0; function frame(t){ const dt= last? (t-last):16; last=t; if(alive && !paused){ autoEnqueue(); tAccum+=dt; while(tAccum>=speed){ tAccum-=speed; step(); } } drawScene(t); requestAnimationFrame(frame); }

  // Init after everything ready
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
  gl.enableVertexAttribArray(loc.aPos); gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, STRIDE, 0);
  gl.enableVertexAttribArray(loc.aNormal); gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, STRIDE, 12);
  resize();
  reset();
  requestAnimationFrame(frame);
})();
