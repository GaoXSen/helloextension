(() => {
  const canvas = document.getElementById('gl');
  const wrap = document.getElementById('game');
  const scoreEl = document.getElementById('score');
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) { alert('WebGL 不可用'); return; }

  const DPR = Math.max(1, Math.min(2, devicePixelRatio||1));
  function resize(){
    const r = wrap.getBoundingClientRect();
    const w = Math.max(300, r.width), h = Math.max(300, r.height);
    canvas.width = Math.floor(w * DPR); canvas.height = Math.floor(h * DPR);
    canvas.style.width = w+'px'; canvas.style.height = h+'px';
    gl.viewport(0,0,canvas.width, canvas.height);
    updateProj();
  }
  addEventListener('resize', resize, {passive:true});

  // Matrices
  function ortho(l,r,b,t,n,f){
    return [
      2/(r-l),0,0,0,
      0,2/(t-b),0,0,
      0,0,-2/(f-n),0,
      -(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1
    ];
  }
  function mul(a,b){ const o=new Array(16); for(let i=0;i<4;i++)for(let j=0;j<4;j++)o[i*4+j]=a[i*4+0]*b[0*4+j]+a[i*4+1]*b[1*4+j]+a[i*4+2]*b[2*4+j]+a[i*4+3]*b[3*4+j]; return o; }
  function ident(){ return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
  function translate(m,x,y,z){ const o=m.slice(); o[12]+=x; o[13]+=y; o[14]+=z; return o; }
  function scale(m,x,y,z){ const o=m.slice(); o[0]*=x; o[5]*=y; o[10]*=z; return o; }

  // Shaders
  const VS=`
  attribute vec3 aPos; attribute vec3 aNormal;
  uniform mat4 uProj, uModel;
  varying vec3 vN; varying vec3 vPos;
  void main(){ vN=aNormal; vPos=(uModel*vec4(aPos,1.0)).xyz; gl_Position=uProj*vec4(vPos,1.0);} 
 `;
  const FS=`
  precision mediump float; varying vec3 vN; varying vec3 vPos; 
  uniform vec3 uColor; uniform vec3 uLight; uniform vec3 uAmbient; uniform vec3 uEmissive;
  void main(){ vec3 N=normalize(vN); vec3 L=normalize(-uLight); float d=max(dot(N,L),0.0); float s=pow(max(dot(reflect(-L,N), normalize(vec3(0,0,1))),0.0),20.0)*0.35; vec3 col=uAmbient+(d+s)*uColor+uEmissive*0.6; gl_FragColor=vec4(col,1.0);} 
 `;
  function compile(type,src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s); return s; }
  const prog=gl.createProgram(); gl.attachShader(prog,compile(gl.VERTEX_SHADER,VS)); gl.attachShader(prog,compile(gl.FRAGMENT_SHADER,FS)); gl.linkProgram(prog); if(!gl.getProgramParameter(prog,gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog); gl.useProgram(prog);
  const loc={ aPos:gl.getAttribLocation(prog,'aPos'), aNormal:gl.getAttribLocation(prog,'aNormal'), uProj:gl.getUniformLocation(prog,'uProj'), uModel:gl.getUniformLocation(prog,'uModel'), uColor:gl.getUniformLocation(prog,'uColor'), uLight:gl.getUniformLocation(prog,'uLight'), uAmbient:gl.getUniformLocation(prog,'uAmbient'), uEmissive:gl.getUniformLocation(prog,'uEmissive') };

  // Geometry: cube
  function cube(){ const p=[-0.5,-0.5,0.5, 0,0,1,  0.5,-0.5,0.5, 0,0,1,  0.5,0.5,0.5, 0,0,1, -0.5,-0.5,0.5,0,0,1, 0.5,0.5,0.5,0,0,1, -0.5,0.5,0.5,0,0,1,  0.5,-0.5,-0.5,0,0,-1, -0.5,-0.5,-0.5,0,0,-1, -0.5,0.5,-0.5,0,0,-1,  0.5,-0.5,-0.5,0,0,-1, -0.5,0.5,-0.5,0,0,-1, 0.5,0.5,-0.5,0,0,-1, -0.5,-0.5,-0.5,-1,0,0, -0.5,-0.5,0.5,-1,0,0, -0.5,0.5,0.5,-1,0,0, -0.5,-0.5,-0.5,-1,0,0, -0.5,0.5,0.5,-1,0,0, -0.5,0.5,-0.5,-1,0,0, 0.5,-0.5,0.5,1,0,0, 0.5,-0.5,-0.5,1,0,0, 0.5,0.5,-0.5,1,0,0, 0.5,-0.5,0.5,1,0,0, 0.5,0.5,-0.5,1,0,0, 0.5,0.5,0.5,1,0,0, -0.5,0.5,0.5,0,1,0, 0.5,0.5,0.5,0,1,0, 0.5,0.5,-0.5,0,1,0, -0.5,0.5,0.5,0,1,0, 0.5,0.5,-0.5,0,1,0, -0.5,0.5,-0.5,0,1,0, -0.5,-0.5,-0.5,0,-1,0, 0.5,-0.5,-0.5,0,-1,0, 0.5,-0.5,0.5,0,-1,0, -0.5,-0.5,-0.5,0,-1,0, 0.5,-0.5,0.5,0,-1,0, -0.5,-0.5,0.5,0,-1,0]; return new Float32Array(p); }
  const cubeBuf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,cubeBuf); gl.bufferData(gl.ARRAY_BUFFER,cube(),gl.STATIC_DRAW); const STRIDE=6*4; gl.enableVertexAttribArray(loc.aPos); gl.vertexAttribPointer(loc.aPos,3,gl.FLOAT,false,STRIDE,0); gl.enableVertexAttribArray(loc.aNormal); gl.vertexAttribPointer(loc.aNormal,3,gl.FLOAT,false,STRIDE,12);

  // Board
  const COLS=8, ROWS=8, TYPES=5;
  const palette=[[0.80,0.45,0.6],[0.55,0.85,1.0],[0.4,0.95,0.8],[0.95,0.75,0.4],[0.85,0.8,1.0]];
  let board = new Array(ROWS).fill(0).map(()=> new Array(COLS).fill(0));
  let score=0; function updateScore(){ scoreEl.textContent=score; }

  function randType(){ return Math.floor(Math.random()*TYPES); }
  function initBoard(){
    for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){
      do{ board[y][x]=randType(); } while(isMatchAt(x,y));
    }
  }
  function isMatchAt(x,y){
    const t=board[y][x];
    const c1=x>=2 && board[y][x-1]===t && board[y][x-2]===t;
    const c2=y>=2 && board[y-1][x]===t && board[y-2][x]===t;
    return c1||c2;
  }
  function findMatches(){
    const del = Array.from({length:ROWS},()=>Array(COLS).fill(false));
    // horiz
    for(let y=0;y<ROWS;y++){
      let run=1; for(let x=1;x<=COLS;x++){ if(x<COLS && board[y][x]===board[y][x-1]) run++; else { if(run>=3){ for(let k=0;k<run;k++) del[y][x-1-k]=true; } run=1; } }
    }
    // vert
    for(let x=0;x<COLS;x++){
      let run=1; for(let y=1;y<=ROWS;y++){ if(y<ROWS && board[y][x]===board[y-1][x]) run++; else { if(run>=3){ for(let k=0;k<run;k++) del[y-1-k][x]=true; } run=1; } }
    }
    return del;
  }
  function anyTrue(mask){ for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) if(mask[y][x]) return true; return false; }
  function applyDeletes(mask){
    let removed=0;
    for(let x=0;x<COLS;x++){
      let write=ROWS-1;
      for(let y=ROWS-1;y>=0;y--){ if(!mask[y][x]){ board[write][x]=board[y][x]; write--; } else removed++; }
      for(let y=write;y>=0;y--) board[y][x]=randType();
    }
    if(removed>0){ score += removed*10; updateScore(); }
  }

  let proj=ident();
  function updateProj(){ proj = ortho(0,COLS, ROWS,0, -10,10); gl.uniformMatrix4fv(loc.uProj,false,new Float32Array(proj)); }

  // Input mapping
  let selA=null, selB=null;
  function posToCell(clientX, clientY){
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width * COLS;
    const y = (clientY - rect.top) / rect.height * ROWS;
    const cx = Math.floor(x), cy = Math.floor(y);
    if(cx<0||cy<0||cx>=COLS||cy>=ROWS) return null; return {x:cx,y:cy};
  }
  function isAdj(a,b){ return a && b && ((Math.abs(a.x-b.x)+Math.abs(a.y-b.y))===1); }
  canvas.addEventListener('pointerdown', (e)=>{
    const c = posToCell(e.clientX, e.clientY); if(!c) return;
    if(!selA) { selA=c; } else if(!selB) { selB=c; trySwap(); } else { selA=c; selB=null; }
  });

  function trySwap(){ if(!selA||!selB) return; if(!isAdj(selA,selB)){ selA=selB; selB=null; return; }
    const a=selA,b=selB; const t=board[a.y][a.x]; board[a.y][a.x]=board[b.y][b.x]; board[b.y][b.x]=t;
    const m=findMatches(); if(anyTrue(m)){ applyDeletes(m); chain(); } else { // swap back
      const t2=board[a.y][a.x]; board[a.y][a.x]=board[b.y][b.x]; board[b.y][b.x]=t2;
    }
    selA=null; selB=null; draw();
  }
  function chain(){
    // keep resolving cascades
    for(let i=0;i<8;i++){
      const m=findMatches(); if(!anyTrue(m)) break; applyDeletes(m);
    }
    draw();
  }

  // Draw helpers
  function setModel(m){ gl.uniformMatrix4fv(loc.uModel,false,new Float32Array(m)); }
  function drawCube(x,y, s, color, selected){
    // Render tiles on X-Y plane (Y 向下增加)，Z 仅用于厚度
    let m=ident(); m=translate(m, x+0.5, y+0.5, 0.0); m=scale(m, 0.9, 0.9, 0.9);
    setModel(m); gl.uniform3fv(loc.uColor, color); gl.uniform3f(loc.uLight, -0.3, 0.8, -0.4); gl.uniform3f(loc.uAmbient, 0.06,0.07,0.10);
    const e = selected? [color[0]*0.8, color[1]*0.8, color[2]*0.8] : [0,0,0]; gl.uniform3fv(loc.uEmissive, e);
    gl.drawArrays(gl.TRIANGLES, 0, 36);
  }
  function drawBoard(){
    gl.clearColor(0.02,0.03,0.08,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
    // base plate and border (都放在 X-Y 平面上)
    gl.uniform3f(loc.uLight, -0.3, 0.8, -0.4); gl.uniform3f(loc.uAmbient, 0.05,0.06,0.10);
    const edge=[0.7,0.85,1.0], emit=[0.5,0.7,1.0];
    // 背板
    let m=ident(); setModel(scale(translate(m, COLS/2, ROWS/2, -0.2), COLS, ROWS, 0.1)); gl.uniform3fv(loc.uColor, [0.05,0.08,0.16]); gl.uniform3fv(loc.uEmissive,[0,0,0]); gl.drawArrays(gl.TRIANGLES, 0, 36);
    // 上下边框
    m=ident(); setModel(scale(translate(m, COLS/2, 0, 0), COLS, 0.1, 0.12)); gl.uniform3fv(loc.uColor, edge); gl.uniform3fv(loc.uEmissive, emit); gl.drawArrays(gl.TRIANGLES, 0, 36);
    m=ident(); setModel(scale(translate(m, COLS/2, ROWS, 0), COLS, 0.1, 0.12)); gl.uniform3fv(loc.uColor, edge); gl.uniform3fv(loc.uEmissive, emit); gl.drawArrays(gl.TRIANGLES, 0, 36);
    // 左右边框
    m=ident(); setModel(scale(translate(m, 0, ROWS/2, 0), 0.1, ROWS, 0.12)); gl.uniform3fv(loc.uColor, edge); gl.uniform3fv(loc.uEmissive, emit); gl.drawArrays(gl.TRIANGLES, 0, 36);
    m=ident(); setModel(scale(translate(m, COLS, ROWS/2, 0), 0.1, ROWS, 0.12)); gl.uniform3fv(loc.uColor, edge); gl.uniform3fv(loc.uEmissive, emit); gl.drawArrays(gl.TRIANGLES, 0, 36);

    // tiles
    for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){
      const t=board[y][x]; const col=palette[t]; const selected = (selA&&selA.x===x&&selA.y===y) || (selB&&selB.x===x&&selB.y===y);
      drawCube(x,y, 0.9, col, selected);
    }
  }

  function draw(){ drawBoard(); }

  function restart(){ score=0; updateScore(); initBoard(); chain(); }
  document.getElementById('btnRestart').onclick = restart;

  // init
  resize(); updateScore(); initBoard(); chain();
})();
