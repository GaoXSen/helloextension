(() => {
  const exprEl = document.getElementById('expr');
  const resultEl = document.getElementById('result');
  const modeEl = document.getElementById('mode');
  const memEl = document.getElementById('mem');
  const keys = document.getElementById('keys');

  let expr = '';
  let lastAns = 0;
  let memory = 0;
  let deg = false; // rad by default

  function updateUI() {
    exprEl.textContent = expr || '';
    resultEl.textContent = preview();
    modeEl.textContent = '角度: ' + (deg ? '度' : '弧度');
    memEl.textContent = '内存: ' + (Math.abs(memory) < 1e-12 ? '0' : memory);
  }

  function insert(txt) {
    expr += txt;
    updateUI();
  }

  function del() {
    expr = expr.slice(0, -1);
    updateUI();
  }

  function clearAll() {
    expr = '';
    updateUI();
  }

  function neg() {
    // Wrap last number or whole expr with (-1)*(...)
    if (!expr) { insert('-'); return; }
    // Try to find the last contiguous number/parenthesis block
    let i = expr.length - 1, depth = 0;
    while (i >= 0) {
      const c = expr[i];
      if (c === ')') depth++;
      else if (c === '(') { if (depth === 0) break; depth--; }
      else if (/[^\w\.\)\!]/.test(c) && depth === 0) break;
      i--;
    }
    const start = i + 1;
    const target = expr.slice(start) || '0';
    expr = expr.slice(0, start) + '(-1)*(' + target + ')';
    updateUI();
  }

  function toggleDeg() { deg = !deg; updateUI(); }

  function eq() {
    try {
      const v = evaluate(expr);
      if (!Number.isFinite(v)) throw new Error('NaN');
      lastAns = v;
      resultEl.textContent = String(v);
    } catch (e) {
      resultEl.textContent = '错误';
    }
  }

  function preview() {
    if (!expr) return String(lastAns || 0);
    try {
      const v = evaluate(expr);
      return Number.isFinite(v) ? String(v) : '…';
    } catch { return '…'; }
  }

  // Tokenizer + Shunting-yard parser
  function evaluate(s) {
    const tokens = tokenize(s);
    const rpn = toRPN(tokens);
    return evalRPN(rpn);
  }

  const isDigit = (c) => c >= '0' && c <= '9';
  function tokenize(s) {
    const t = [];
    let i = 0;
    function pushImplicitMul() {
      if (t.length === 0) return;
      const prev = t[t.length - 1];
      const prevType = prev.type;
      if (prevType === 'num' || prevType === 'const' || (prevType === 'op' && prev.val === '!') || prevType === 'rparen') {
        t.push({ type: 'op', val: '*' });
      }
    }
    while (i < s.length) {
      const c = s[i];
      if (c === ' ') { i++; continue; }
      if (isDigit(c) || c === '.') {
        let j = i, hasDot = c === '.';
        while (j + 1 < s.length) {
          const d = s[j + 1];
          if (isDigit(d)) j++;
          else if (d === '.' && !hasDot) { hasDot = true; j++; }
          else break;
        }
        const num = s.slice(i, j + 1);
        t.push({ type: 'num', val: parseFloat(num) });
        i = j + 1; continue;
      }
      if (c === '(') { pushImplicitMul(); t.push({ type: 'lparen', val: '(' }); i++; continue; }
      if (c === ')') { t.push({ type: 'rparen', val: ')' }); i++; continue; }
      if ('+-*/^!,'.includes(c)) { t.push({ type: 'op', val: c }); i++; continue; }
      // functions/constants/Ans
      const rest = s.slice(i);
      const m = /^(sin|cos|tan|asin|acos|atan|sqrt|ln|log|exp|pi|π|e|Ans)/.exec(rest);
      if (m) {
        const w = m[1];
        if (w === 'pi' || w === 'π' || w === 'e' || w === 'Ans') {
          pushImplicitMul();
          t.push({ type: 'const', val: w });
        } else {
          pushImplicitMul();
          t.push({ type: 'func', val: w });
        }
        i += w.length; continue;
      }
      // unknown char -> error
      throw new Error('Bad char ' + c);
    }
    // Handle unary +/-
    const out = [];
    for (let k = 0; k < t.length; k++) {
      const tok = t[k];
      if (tok.type === 'op' && (tok.val === '+' || tok.val === '-')) {
        const prev = out[out.length - 1];
        const isUnary = !prev || (prev.type === 'op' && prev.val !== '!') || prev.type === 'lparen';
        if (isUnary) {
          out.push({ type: 'op', val: tok.val === '-' ? 'u-' : 'u+' });
          continue;
        }
      }
      out.push(tok);
    }
    return out;
  }

  const precedence = {
    '!': { p: 5, assoc: 'right', ar: 1, postfix: true },
    '^': { p: 4, assoc: 'right', ar: 2 },
    'u+': { p: 3, assoc: 'right', ar: 1 },
    'u-': { p: 3, assoc: 'right', ar: 1 },
    '*': { p: 2, assoc: 'left', ar: 2 },
    '/': { p: 2, assoc: 'left', ar: 2 },
    '+': { p: 1, assoc: 'left', ar: 2 },
    '-': { p: 1, assoc: 'left', ar: 2 }
  };

  function toRPN(tokens) {
    const out = [];
    const stack = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'num' || t.type === 'const') out.push(t);
      else if (t.type === 'func') stack.push(t);
      else if (t.type === 'op') {
        const info = precedence[t.val];
        if (!info) throw new Error('op?');
        // Handle postfix factorial specially: it pops later due to being postfix
        while (stack.length) {
          const top = stack[stack.length - 1];
          if (top.type === 'op') {
            const ti = precedence[top.val];
            if (!ti) break;
            if ((info.assoc === 'left' && info.p <= ti.p) || (info.assoc === 'right' && info.p < ti.p)) {
              out.push(stack.pop());
              continue;
            }
          } else if (top.type === 'func') {
            out.push(stack.pop()); continue;
          }
          break;
        }
        stack.push(t);
      } else if (t.type === 'lparen') stack.push(t);
      else if (t.type === 'rparen') {
        while (stack.length && stack[stack.length - 1].type !== 'lparen') out.push(stack.pop());
        if (!stack.length) throw new Error('mismatch');
        stack.pop(); // pop '('
        // if function at top, pop it too
        if (stack.length && stack[stack.length - 1].type === 'func') out.push(stack.pop());
      }
    }
    while (stack.length) {
      const x = stack.pop();
      if (x.type === 'lparen' || x.type === 'rparen') throw new Error('mismatch');
      out.push(x);
    }
    return out;
  }

  function fact(n) {
    if (n < 0 || !Number.isFinite(n)) return NaN;
    if (Math.abs(n - Math.round(n)) > 1e-12) return NaN; // integers only
    let r = 1;
    for (let i = 2; i <= Math.round(n); i++) r *= i;
    return r;
  }

  function trig(f, x) { return f(deg ? (x * Math.PI / 180) : x); }
  function invtrig(f, x) { const v = f(x); return deg ? (v * 180 / Math.PI) : v; }

  function evalRPN(rpn) {
    const st = [];
    for (let i = 0; i < rpn.length; i++) {
      const t = rpn[i];
      if (t.type === 'num') st.push(t.val);
      else if (t.type === 'const') {
        if (t.val === 'pi' || t.val === 'π') st.push(Math.PI);
        else if (t.val === 'e') st.push(Math.E);
        else if (t.val === 'Ans') st.push(lastAns);
      } else if (t.type === 'func') {
        const a = st.pop();
        let v = NaN;
        switch (t.val) {
          case 'sin': v = trig(Math.sin, a); break;
          case 'cos': v = trig(Math.cos, a); break;
          case 'tan': v = trig(Math.tan, a); break;
          case 'asin': v = invtrig(Math.asin, a); break;
          case 'acos': v = invtrig(Math.acos, a); break;
          case 'atan': v = invtrig(Math.atan, a); break;
          case 'sqrt': v = Math.sqrt(a); break;
          case 'ln': v = Math.log(a); break;
          case 'log': v = Math.log10 ? Math.log10(a) : Math.log(a) / Math.LN10; break;
          case 'exp': v = Math.exp(a); break;
          default: throw new Error('func?');
        }
        st.push(v);
      } else if (t.type === 'op') {
        const v = t.val;
        if (v === '!') { const a = st.pop(); st.push(fact(a)); continue; }
        if (v === 'u+') { const a = st.pop(); st.push(+a); continue; }
        if (v === 'u-') { const a = st.pop(); st.push(-a); continue; }
        const b = st.pop();
        const a = st.pop();
        let r = NaN;
        switch (v) {
          case '+': r = a + b; break;
          case '-': r = a - b; break;
          case '*': r = a * b; break;
          case '/': r = a / b; break;
          case '^': r = Math.pow(a, b); break;
          default: throw new Error('op??');
        }
        st.push(r);
      }
    }
    if (st.length !== 1) throw new Error('eval');
    const out = st[0];
    // Avoid -0
    return Object.is(out, -0) ? 0 : out;
  }

  // Keyboard support (basic)
  addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { eq(); return; }
    if (e.key === 'Backspace') { del(); return; }
    if (e.key === 'Escape') { clearAll(); return; }
    const map = {
      '*': '*', '/': '/', '+': '+', '-': '-', '^': '^', '(': '(', ')': ')', '.': '.', '!': '!',
      '0':'0','1':'1','2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8','9':'9'
    };
    if (map[e.key]) { insert(map[e.key]); }
  });

  // Button events
  keys.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const func = btn.dataset.act;
    if (func === 'toggleDeg') { toggleDeg(); return; }
    if (func === 'del') { del(); return; }
    if (func === 'eq') { eq(); return; }
    if (func === 'neg') { neg(); return; }

    const k = btn.dataset.key;
    if (!k) return;
    switch (k) {
      case 'AC': clearAll(); break;
      case 'MC': memory = 0; updateUI(); break;
      case 'MR': insert(String(memory)); break;
      case 'M+':
        try { memory += evaluate(expr || String(lastAns || 0)); } catch {}
        updateUI();
        break;
      case 'M-':
        try { memory -= evaluate(expr || String(lastAns || 0)); } catch {}
        updateUI();
        break;
      case 'sin': case 'cos': case 'tan': case 'asin': case 'acos': case 'atan':
      case 'sqrt': case 'ln': case 'log': case 'exp':
        // insert f(
        insert(k + '(');
        break;
      case '^2':
        insert('^2');
        break;
      case 'pi': insert('pi'); break;
      case 'e': insert('e'); break;
      case 'Ans': insert('Ans'); break;
      case '>': insert('.'); break; // dot button
      default:
        insert(k);
    }
  });

  updateUI();
})();

