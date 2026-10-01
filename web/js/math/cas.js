/*
 * ArabicCAS — computer algebra for the add-in (built on nerdamer, MIT).
 *  - parse():  LaTeX in Arabic notation  ->  nerdamer expression string
 *  - toTex():  nerdamer expression        ->  LaTeX in Arabic notation
 *  - steps():  step-by-step solutions in Arabic (simplify, solve, systems, derivative, integral, limit …)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('nerdamer/all.min.js'));
  else root.ArabicCAS = factory(root.nerdamer);
})(this, function (nerdamer) {
  'use strict';

  // ---------------------------------------------------------------- Arabic <-> Latin symbols
  var FUNCS = [                       // longest first
    ['لوهـ', 'ln'], ['جتا', 'cos'], ['طتا', 'cot'], ['ظتا', 'cot'], ['قتا', 'csc'],
    ['جا', 'sin'], ['طا', 'tan'], ['ظا', 'tan'], ['قا', 'sec'], ['لط', 'ln'], ['لو', 'log']
  ];
  var VARS = [['جـ', 'c'], ['س', 'x'], ['ص', 'y'], ['ع', 'z'], ['ن', 'n'], ['م', 'm'], ['ك', 'k'], ['ر', 'r'], ['ت', 't'],
    ['ل', 'l'], ['أ', 'a'], ['ا', 'a'], ['إ', 'a'], ['ب', 'b'], ['ج', 'c'], ['د', 'd'], ['ف', 'f'], ['ق', 'q'], ['و', 'w'],
    ['ي', 'v'], ['ى', 'v'], ['ح', 'h'], ['ط', 'u'], ['ز', 's'], ['ث', 'p'], ['ش', 'o'], ['غ', 'j']];
  var LATIN_TO_AR = { x: 'س', y: 'ص', z: 'ع', n: 'ن', m: 'م', k: 'ك', r: 'ر', t: 'ت', l: 'ل', a: 'أ', b: 'ب', c: 'جـ',
    d: 'د', f: 'ف', q: 'ق', w: 'و', v: 'ي', h: 'ح', u: 'ط', s: 'ز', p: 'ث', o: 'ش', j: 'غ' };
  var AR_RUN = /[ء-يٱ-ۓـ]+/g;

  // ---------------------------------------------------------------- LaTeX -> tokens
  function normalise(tex, ctx) {
    var s = String(tex || '');
    s = s.replace(/⁣/g, '')
      .replace(/\\(operatorname\*?|mathrm|text|textrm|mathit|mathbf|boldsymbol|mbox)\s*\{([^{}]*)\}/g, ' $2 ')
      .replace(/\\textcolor\s*\{[^{}]*\}\s*\{([^{}]*)\}/g, '{$1}').replace(/\\color\s*\{[^{}]*\}/g, '')
      .replace(/\\placeholder(\[[^\]]*\])?\{([^{}]*)\}/g, '{$2}')
      .replace(/\\(displaystyle|textstyle|limits|nolimits|left|right|big|Big|bigg|Bigg)\b/g, ' ')
      .replace(/\\[,;:!]|\\quad|\\qquad|~/g, ' ')
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/٫/g, '.').replace(/،/g, ',').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
      .replace(/\\(times|cdot|ast)\b/g, '*').replace(/\\div\b/g, '/');
    // Arabic words: functions, e (هـ), variables; multi-letter words become one symbol
    s = s.replace(AR_RUN, function (run) {
      var out = '', i = 0;
      while (i < run.length) {
        var rest = run.slice(i), hit = null;
        if (rest[0] === 'ـ') { i++; continue; }
        if (/^هـ|^ه(?![ء-ي])/.test(rest)) { out += ' e '; i += rest[1] === 'ـ' ? 2 : 1; continue; }
        for (var f = 0; f < FUNCS.length; f++) if (rest.indexOf(FUNCS[f][0]) === 0) { hit = FUNCS[f]; break; }
        if (hit && (i === 0 || true)) {
          // a function name at the start of a word (جاس = جا س); inside a longer word treat letters as a symbol
          if (i === 0 || out.slice(-1) === ' ') { out += ' \\' + hit[1] + ' '; i += hit[0].length; continue; }
        }
        if (i === 0 && run.replace(/ـ/g, '').length > 1 && !/^(جا|جتا|طا|ظا|طتا|ظتا|قا|قتا|لو|لط)/.test(run)) {
          // multi-letter word such as نق (radius) -> single symbol
          var w = run.replace(/ـ/g, '');
          if (!ctx.words[w]) { ctx.words[w] = String.fromCharCode(65 + (ctx.nextWord++)); ctx.back[ctx.words[w]] = w; }
          out += ' ' + ctx.words[w] + ' ';
          break;
        }
        var v = null;
        for (var k = 0; k < VARS.length; k++) if (rest.indexOf(VARS[k][0]) === 0) { v = VARS[k]; break; }
        if (v) { out += ' ' + v[1] + ' '; i += v[0].length; } else { i++; }
      }
      return out;
    });
    return s;
  }

  function tokenize(s) {
    var toks = [], i = 0, m;
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if ((m = /^\d+(\.\d+)?|^\.\d+/.exec(s.slice(i)))) { toks.push({ t: 'num', v: m[0] }); i += m[0].length; continue; }
      if (c === '\\') {
        m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i));
        toks.push({ t: 'cmd', v: m[1] }); i += m[0].length; continue;
      }
      if (/[a-zA-Z]/.test(c)) { toks.push({ t: 'var', v: c }); i++; continue; }
      if (/[+\-*/^_(){}\[\]|=!,<>'.]/.test(c)) { toks.push({ t: 'sym', v: c }); i++; continue; }
      i++;
    }
    return toks;
  }

  // ---------------------------------------------------------------- tokens -> nerdamer string
  var FN = { sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc', ln: 'log', log: 'log10', exp: 'exp',
    arcsin: 'asin', arccos: 'acos', arctan: 'atan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh' };

  function Parser(toks) { this.toks = toks; this.i = 0; }
  Parser.prototype.peek = function (o) { return this.toks[this.i + (o || 0)]; };
  Parser.prototype.next = function () { return this.toks[this.i++]; };
  Parser.prototype.is = function (t, v) { var k = this.peek(); return k && k.t === t && (v === undefined || k.v === v); };
  Parser.prototype.expect = function (t, v) {
    if (!this.is(t, v)) throw new Error('expected ' + v);
    return this.next();
  };
  Parser.prototype.group = function () {                 // { … } or single token
    if (this.is('sym', '{')) { this.next(); var e = this.expr(); this.expect('sym', '}'); return e; }
    var k = this.next();
    if (!k) throw new Error('missing argument');
    if (k.t === 'num') return k.v.length > 1 && k.t === 'num' && /^\d+$/.test(k.v) ? k.v[0] : k.v;   // x^23 -> x^2 3 (TeX)
    if (k.t === 'var') return k.v;
    if (k.t === 'cmd') { this.i--; return this.primary(); }
    throw new Error('bad argument');
  };
  Parser.prototype.expr = function (stopAtFunc) {
    var out = this.term(stopAtFunc);
    while (this.is('sym', '+') || this.is('sym', '-')) {
      if (stopAtFunc) break;
      var op = this.next().v;
      out += op + this.term();
    }
    return out;
  };
  Parser.prototype.startsFactor = function () {
    var k = this.peek();
    if (!k) return false;
    if (k.t === 'num' || k.t === 'var') return true;
    if (k.t === 'sym') return k.v === '(' || k.v === '{' || k.v === '[' || (k.v === '|' && this.absDepth === 0);
    if (k.t === 'cmd') return k.v !== 'pm' && k.v !== 'mp';
    return false;
  };
  Parser.prototype.term = function (stopAtFunc) {
    var out = this.factor();
    for (;;) {
      if (stopAtFunc && (this.is('sym', '*') || this.is('sym', '/'))) break;   // جا س × جتا س = (جا س)(جتا س)
      if (this.is('sym', '*')) { this.next(); out += '*' + this.factor(); continue; }
      if (this.is('sym', '/')) { this.next(); out += '/' + this.factor(); continue; }
      if (this.startsFactor()) {
        if (stopAtFunc && this.is('cmd') && FN[this.peek().v]) break;
        out += '*' + this.factor();
        continue;
      }
      break;
    }
    return out;
  };
  Parser.prototype.factor = function () {
    if (this.is('sym', '-')) { this.next(); return '(-' + this.factor() + ')'; }
    if (this.is('sym', '+')) { this.next(); return this.factor(); }
    var base = this.primary();
    for (;;) {
      if (this.is('sym', '^')) { this.next(); base = '(' + base + ')^(' + this.group() + ')'; continue; }
      if (this.is('sym', "'")) { this.next(); continue; }
      if (this.is('sym', '!')) { this.next(); base = 'factorial(' + base + ')'; continue; }
      break;
    }
    return base;
  };
  Parser.prototype.primary = function () {
    var k = this.next();
    if (!k) throw new Error('unexpected end');
    if (k.t === 'num') return k.v;
    if (k.t === 'var') {
      var name = k.v;
      if (this.is('sym', '_')) { this.next(); name += String(this.group()).replace(/[^a-zA-Z0-9]/g, ''); }
      return name;
    }
    if (k.t === 'sym') {
      if (k.v === '(' || k.v === '[') { var e = this.expr(); if (this.is('sym', ')') || this.is('sym', ']')) this.next(); return '(' + e + ')'; }
      if (k.v === '{') { var g = this.expr(); this.expect('sym', '}'); return '(' + g + ')'; }
      if (k.v === '|') { this.absDepth++; var a = this.expr(); this.absDepth--; this.expect('sym', '|'); return 'abs(' + a + ')'; }
      throw new Error('unexpected ' + k.v);
    }
    // commands
    var c = k.v;
    if (c === 'frac' || c === 'dfrac' || c === 'tfrac' || c === 'cfrac') { var n = this.group(), d = this.group(); return '((' + n + ')/(' + d + '))'; }
    if (c === 'sqrt') {
      var idx = null;
      if (this.is('sym', '[')) { this.next(); idx = this.expr(); this.expect('sym', ']'); }
      var r = this.group();
      return idx ? '((' + r + ')^(1/(' + idx + ')))' : 'sqrt(' + r + ')';
    }
    if (c === 'pi') return 'pi';
    if (c === 'infty') return 'Infinity';
    if (c === 'e') return 'e';
    if (c === 'binom') { var bn = this.group(), bk = this.group(); return '(factorial(' + bn + ')/(factorial(' + bk + ')*factorial((' + bn + ')-(' + bk + '))))'; }
    if (c === '{' || c === '}') return '';
    if (FN[c] || c === 'log') {
      var power = null, base = null;
      for (var z = 0; z < 2; z++) {
        if (this.is('sym', '^')) { this.next(); power = this.group(); }
        else if (this.is('sym', '_')) { this.next(); base = this.group(); }
      }
      var arg;
      if (this.is('sym', '(') || this.is('sym', '{')) arg = this.primary();
      else arg = '(' + this.term(true) + ')';
      var call;
      if (c === 'log') call = '(log(' + arg + ')/log(' + (base || '10') + '))';
      else call = FN[c] + '(' + arg + ')';
      return power ? '(' + call + ')^(' + power + ')' : call;
    }
    if (/^[a-zA-Z]$/.test(c)) return c;
    throw new Error('unsupported \\' + c);
  };

  function makeCtx() { return { words: {}, back: {}, nextWord: 0 }; }

  /** LaTeX (Arabic notation) -> nerdamer string ; returns {cas, ctx} */
  function parse(tex, ctx) {
    ctx = ctx || makeCtx();
    var p = new Parser(tokenize(normalise(tex, ctx)));
    p.absDepth = 0;
    var s = p.expr();
    if (p.i < p.toks.length) throw new Error('unexpected ' + p.toks[p.i].v);
    return { cas: s, ctx: ctx };
  }

  // ---------------------------------------------------------------- nerdamer -> Arabic LaTeX
  function toTex(expr, ctx) {
    var t;
    try { t = nerdamer(String(expr)).toTeX(); } catch (e) { t = String(expr); }
    t = t.replace(/\\mathrm\{([a-zA-Z]+)\}/g, '\\$1')
      .replace(/(\d)\s*\\cdot\s*(?=[a-zA-Z\\(])/g, '$1')           // 3 \cdot x -> 3x
      .replace(/\\left\(/g, '(').replace(/\\right\)/g, ')')
      .replace(/\\log\b/g, '\\ln').replace(/\\operatorname\{log10\}/g, '\\log');
    // variables back to Arabic letters (not inside command names)
    t = t.replace(/(\\[a-zA-Z]+)|([a-zA-Z])/g, function (m0, cmd, v) {
      if (cmd) return cmd;
      if (v === 'e') return 'هـ';
      if (ctx && ctx.back[v]) return ctx.back[v];
      return LATIN_TO_AR[v] || v;
    });
    return t.replace(/\\cdot/g, '\\times').replace(/\)\s*\\times\s*\(/g, ')(').replace(/\s+/g, ' ').trim();
  }

  // ---------------------------------------------------------------- helpers
  function N(x) { return nerdamer(String(x)); }
  function simp(x) {
    var plain; try { plain = N(x).toString(); } catch (e) { plain = String(x); }
    var r; try { r = nerdamer('simplify(' + x + ')').toString(); } catch (e) { return plain; }
    // nerdamer sometimes turns log(10), sqrt(…) into huge rational approximations — keep the exact form
    if (/\d{8,}/.test(r) && !/\d{8,}/.test(String(x))) return plain;
    // prefer the expanded polynomial when simplify only produced a nested form such as (x+1)*x+1
    try {
      var ex = nerdamer('expand(' + r + ')').toString();
      if (!/\//.test(ex) && ex.length < r.length && !/\)\^/.test(r)) return ex;
    } catch (e) { /* keep r */ }
    return r;
  }
  function num(x) {
    try { var v = N(x).evaluate().text('decimals'); return isFinite(+v) ? +v : NaN; } catch (e) { return NaN; }
  }
  function sub(expr, v, val) {
    try { return N(expr).sub(v, '(' + val + ')').toString(); } catch (e) { return String(expr); }
  }
  function nice(x) { var n = +(+x).toFixed(6); return String(n); }
  function vars(cas) {
    try { return nerdamer(cas).variables().filter(function (v) { return v !== 'e' && v !== 'pi'; }); } catch (e) { return []; }
  }
  function splitTopLevel(expr) {                // "a+b-c" -> ['a','+b','-c'] at depth 0
    var out = [], depth = 0, cur = '';
    for (var i = 0; i < expr.length; i++) {
      var ch = expr[i];
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if ((ch === '+' || ch === '-') && depth === 0 && cur.trim() && !/[*/^(]$/.test(cur.trim())) { out.push(cur); cur = ch === '-' ? '-' : ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
  }
  function polyCoeffs(expr, v, maxDeg) {
    var e = nerdamer('expand(' + expr + ')').toString();
    var cs = [];
    for (var k = 0; k <= maxDeg; k++) {
      var d = e;
      for (var j = 0; j < k; j++) d = nerdamer.diff(d, v).toString();
      var ck = simp(sub(d, v, 0) + '/' + fact(k));
      cs.push(ck);
    }
    return cs;
  }
  function fact(k) { var f = 1; for (var i = 2; i <= k; i++) f *= i; return f; }
  function degree(expr, v) {
    try {
      var e = nerdamer('expand(' + expr + ')');
      var d = nerdamer('deg(' + e.toString() + ',' + v + ')').toString();
      return /^\d+$/.test(d) ? +d : -1;
    } catch (e2) { return -1; }
  }
  function isPoly(expr, v) {
    return !/sin|cos|tan|cot|sec|csc|log|exp|sqrt|abs|asin|acos|atan|\^\(\s*[^)]*[a-z]/.test(expr) && degree(expr, v) >= 0;
  }

  // ---------------------------------------------------------------- step builders
  var AR = { V: 'س' };
  function S(t, tex) { return { t: t, tex: tex || null }; }
  function T(x, ctx) { return toTex(x, ctx); }

  function opSimplify(p) {
    var st = [S('المقدار:', T(p.cas, p.ctx))];
    var ex = nerdamer('expand(' + p.cas + ')').toString();
    if (!/\//.test(p.cas) && ex !== p.cas && T(ex, p.ctx) !== T(p.cas, p.ctx)) st.push(S('نفك الأقواس ونجمع الحدود المتشابهة:', T(ex, p.ctx)));
    var sm = simp(p.cas);
    var fc; try { fc = nerdamer('factor(' + sm + ')').toString(); } catch (e) { fc = sm; }
    if (T(sm, p.ctx) !== T(ex, p.ctx)) st.push(S('بالاختصار والتبسيط:', T(sm, p.ctx)));
    if (fc !== sm && fc.length < sm.length + 6 && /\)\*\(|\)\^/.test(fc)) st.push(S('وبالتحليل:', T(fc, p.ctx)));
    st.push(S('الناتج النهائي:', T(sm, p.ctx)));
    return st;
  }

  function opEvaluate(p) {
    var st = [S('المقدار:', T(p.cas, p.ctx))];
    var exact = simp(p.cas);
    if (T(exact, p.ctx) !== T(p.cas, p.ctx)) st.push(S('بالتبسيط:', T(exact, p.ctx)));
    var v = num(exact);
    if (isNaN(v)) throw new Error('المقدار يحتوي على متغيرات — استخدم «بسّط» أو «حل»');
    st.push(S('القيمة العددية:', T(exact, p.ctx) + ' \\approx ' + nice(v)));
    return st;
  }

  function opFactor(p) {
    var f = nerdamer('factor(' + p.cas + ')').toString();
    return [S('المقدار:', T(p.cas, p.ctx)), S('بالتحليل إلى العوامل:', T(f, p.ctx))];
  }
  function opExpand(p) {
    var f = nerdamer('expand(' + p.cas + ')').toString();
    return [S('المقدار:', T(p.cas, p.ctx)), S('بفك الأقواس وجمع الحدود المتشابهة:', T(f, p.ctx))];
  }

  function opSolve(p, v, lhsTex, rhsTex) {
    var st = [];
    var e = simp('(' + p.lhs + ')-(' + p.rhs + ')');
    var eqTex = T(p.lhs, p.ctx) + ' = ' + T(p.rhs, p.ctx);
    var V = LATIN_TO_AR[v] || v;
    st.push(S('المعادلة:', eqTex));
    var deg = isPoly(e, v) ? degree(e, v) : -1;
    if (deg === 1) {
      var c = polyCoeffs(e, v, 1);           // c0 + c1 v = 0
      st.push(S('ننقل الحدود التي تحتوي على ' + V + ' إلى طرف والثوابت إلى الطرف الآخر:', T(c[1] + '*' + v, p.ctx) + ' = ' + T(simp('-(' + c[0] + ')'), p.ctx)));
      var sol = simp('-(' + c[0] + ')/(' + c[1] + ')');
      st.push(S('نقسم الطرفين على ' + T(c[1], p.ctx) + ':', V + ' = ' + T(sol, p.ctx)));
      st.push(S('مجموعة الحل:', '\\{' + T(sol, p.ctx) + '\\}'));
      return st;
    }
    if (deg === 2) {
      var q = polyCoeffs(e, v, 2), a = q[2], b = q[1], cc = q[0];
      st.push(S('نكتب المعادلة على الصورة العامة أ' + V + '² + ب' + V + ' + جـ = 0:', T(nerdamer('expand(' + e + ')').toString(), p.ctx) + ' = 0'));
      st.push(S('المعاملات:', 'أ = ' + T(a, p.ctx) + ' ،\\; ب = ' + T(b, p.ctx) + ' ،\\; جـ = ' + T(cc, p.ctx)));
      var D = simp('(' + b + ')^2-4*(' + a + ')*(' + cc + ')');
      st.push(S('نحسب المميز:', '\\Delta = ب^2 - 4\\,أ\\,جـ = (' + T(b, p.ctx) + ')^2 - 4(' + T(a, p.ctx) + ')(' + T(cc, p.ctx) + ') = ' + T(D, p.ctx)));
      var Dn = num(D);
      if (!isNaN(Dn) && Dn < 0) {
        st.push(S('بما أن المميز سالب فلا توجد للمعادلة جذور حقيقية.', null));
        st.push(S('مجموعة الحل في الأعداد الحقيقية:', '\\emptyset'));
        return st;
      }
      st.push(S('نعوّض في القانون العام:', V + ' = \\frac{-ب \\pm \\sqrt{\\Delta}}{2أ} = \\frac{' + T(simp('-(' + b + ')'), p.ctx) + ' \\pm \\sqrt{' + T(D, p.ctx) + '}}{' + T(simp('2*(' + a + ')'), p.ctx) + '}'));
      var r1 = simp('(-(' + b + ')+sqrt(' + D + '))/(2*(' + a + '))');
      var r2 = simp('(-(' + b + ')-sqrt(' + D + '))/(2*(' + a + '))');
      if (Dn === 0 || r1 === r2) {
        st.push(S('المميز يساوي صفراً، فللمعادلة جذر مكرر:', V + ' = ' + T(r1, p.ctx)));
        st.push(S('مجموعة الحل:', '\\{' + T(r1, p.ctx) + '\\}'));
      } else {
        st.push(S('إذن:', V + '_1 = ' + T(r1, p.ctx) + ' ،\\quad ' + V + '_2 = ' + T(r2, p.ctx)));
        var fct; try { fct = nerdamer('factor(' + e + ')').toString(); } catch (x) { fct = ''; }
        if (fct && /\)\*\(|\)\^2/.test(fct) && !/sqrt/.test(fct)) st.push(S('للتحقق — بالتحليل:', T(fct, p.ctx) + ' = 0'));
        st.push(S('مجموعة الحل:', '\\{' + T(r1, p.ctx) + ' ،\\; ' + T(r2, p.ctx) + '\\}'));
      }
      return st;
    }
    var e0; try { e0 = nerdamer('(' + p.lhs + ')-(' + p.rhs + ')').toString(); } catch (x) { e0 = e; }
    var trig = trigSolve(e0, v, p.ctx, V) || trigSolve(e, v, p.ctx, V);
    if (trig) return st.concat(trig);
    var sols;
    try { sols = nerdamer.solve(e, v).toString().replace(/^\[|\]$/g, ''); } catch (x) { sols = ''; }
    var list = sols ? sols.split(',').filter(Boolean) : [];
    var exp0; try { exp0 = nerdamer('expand(' + e + ')').toString(); } catch (x) { exp0 = e; }
    if (T(exp0, p.ctx) + ' = 0' !== eqTex) st.push(S('ننقل جميع الحدود إلى طرف واحد:', T(exp0, p.ctx) + ' = 0'));
    // keep real solutions; show approximations instead of giant fractions
    var seen = {};
    list = list.map(function (s) {
      if (/\bi\b/.test(s)) return null;
      var n = num(s);
      if (isNaN(n)) return null;
      var key = n.toFixed(8); if (seen[key]) return null; seen[key] = 1;
      return /\d{7,}/.test(s) ? { tex: '\\approx ' + nice(n), n: n } : { tex: '= ' + T(s, p.ctx), n: n };
    }).filter(Boolean).sort(function (a, b) { return a.n - b.n; });
    if (!list.length) { st.push(S('لا توجد حلول حقيقية لهذه المعادلة (أو تعذّر إيجادها جبرياً).', null)); return st; }
    var fct2; try { fct2 = nerdamer('factor(' + e + ')').toString(); } catch (x) { fct2 = ''; }
    if (fct2 && /\)\*\(|\)\^/.test(fct2) && T(fct2, p.ctx) !== T(exp0, p.ctx)) {
      st.push(S('بالتحليل:', T(fct2, p.ctx) + ' = 0'));
      st.push(S('نساوي كل عامل بالصفر:', null));
    }
    if (list.length > 8) list = list.slice(0, 8);
    st.push(S('الحلول:', list.map(function (s, i) { return V + '_' + (i + 1) + ' ' + s.tex; }).join(' ،\\quad ')));
    st.push(S('مجموعة الحل:', '\\{' + list.map(function (s) { return s.tex.replace(/^= /, '').replace(/^\\approx /, ''); }).join(' ،\\; ') + '\\}'));
    return st;
  }

  // ---------------------------------------------------------------- trigonometric equations  (جا س = ½ …)
  var PI_TEX = function (k) {                    // k·π with k a multiple of 1/12  ->  TeX
    var n = Math.round(k * 12), d = 12, g = function (a, b) { return b ? g(b, a % b) : Math.abs(a); };
    if (n === 0) return '0';
    var q = g(n, d); n /= q; d /= q;
    var sign = n < 0 ? '-' : ''; n = Math.abs(n);
    var numr = (n === 1 ? '' : n) + '\\pi';
    return sign + (d === 1 ? numr : '\\frac{' + numr + '}{' + d + '}');
  };
  function specialAngle(fn, c) {                // principal value as multiple of π if it is a "nice" angle
    var th = fn === 'sin' ? Math.asin(c) : fn === 'cos' ? Math.acos(c) : Math.atan(c);
    var k = th / Math.PI, r = Math.round(k * 12) / 12;
    return Math.abs(k - r) < 1e-9 ? r : null;
  }
  function trigSolve(e, v, ctx, V) {
    var re = /\b(sin|cos|tan)\(([^()]*)\)/g, m, fns = {}, args = {};
    while ((m = re.exec(e))) { fns[m[1]] = 1; args[m[2]] = 1; }
    var fnl = Object.keys(fns), argl = Object.keys(args);
    if (fnl.length !== 1 || argl.length !== 1 || argl[0] !== v) return null;
    var fn = fnl[0], U = 't';
    if (vars(e).indexOf(U) >= 0) U = 'w';
    var pe = e.split(fn + '(' + v + ')').join(U);
    if (vars(pe).indexOf(v) >= 0) return null;
    var AR = { sin: '\\sin', cos: '\\cos', tan: '\\tan' }[fn], FT = AR + ' ' + V;
    var st = [];
    var UA = LATIN_TO_AR[U] || U;
    var polyT = T(pe, ctx);
    if (new RegExp('\\b' + U + '\\)?\\^').test(pe)) {
      st.push(S('نفرض ' + UA + ' = ' + FT.replace(/\\/g, '\\') + ' فتصبح المعادلة:', polyT + ' = 0'));
    }
    var sols; try { sols = nerdamer.solve(pe, U).toString().replace(/^\[|\]$/g, '').split(',').filter(Boolean); } catch (x) { sols = []; }
    var vals = [];
    sols.forEach(function (s) {
      var n = num(s); if (isNaN(n) || /\bi\b/.test(s)) return;
      if (vals.some(function (o) { return Math.abs(o.n - n) < 1e-9; })) return;
      var tx = T(s, ctx);
      if (/\d{7,}/.test(s)) {
        tx = nice(n);
        var NICE = [['1/2', '\\frac{1}{2}'], ['sqrt(2)/2', '\\frac{\\sqrt{2}}{2}'], ['sqrt(3)/2', '\\frac{\\sqrt{3}}{2}'], ['sqrt(3)', '\\sqrt{3}'], ['1/sqrt(3)', '\\frac{1}{\\sqrt{3}}'], ['sqrt(2)', '\\sqrt{2}']];
        NICE.forEach(function (q) { var qv = num(q[0]); if (Math.abs(Math.abs(n) - qv) < 1e-9) tx = (n < 0 ? '-' : '') + q[1]; });
      }
      vals.push({ n: n, tex: tx });
    });
    if (!vals.length) { st.push(S('لا توجد حلول حقيقية.', null)); return st; }
    var general = [], inRange = [];
    vals.forEach(function (o) {
      st.push(S('إذن:', FT + ' = ' + o.tex));
      if (fn !== 'tan' && Math.abs(o.n) > 1 + 1e-12) { st.push(S('مرفوض لأن قيمة ' + (fn === 'sin' ? 'الجيب' : 'جيب التمام') + ' بين −1 و 1.', null)); return; }
      var c = Math.max(-1, Math.min(1, o.n)); if (fn === 'tan') c = o.n;
      var k = specialAngle(fn, c);
      var inv = { sin: '\\sin^{-1}', cos: '\\cos^{-1}', tan: '\\tan^{-1}' }[fn] + '(' + o.tex + ')';
      var th = k !== null ? PI_TEX(k) : inv;
      var thNum = fn === 'sin' ? Math.asin(c) : fn === 'cos' ? Math.acos(c) : Math.atan(c);
      if (k === null) st.push(S('الزاوية الأساسية:', '\\theta = ' + inv + ' \\approx ' + nice(thNum)));
      var add = function (a) { return a === '0' ? '' : a + ' + '; };
      var cand = [];
      if (fn === 'sin') {
        if (Math.abs(Math.abs(c) - 1) < 1e-12) { general.push(V + ' = ' + add(th) + '2\\pi ن'); cand.push(thNum); }
        else if (Math.abs(c) < 1e-12) { general.push(V + ' = \\pi ن'); cand.push(0, Math.PI); }
        else {
          general.push(V + ' = ' + add(th) + '2\\pi ن');
          general.push(V + ' = ' + (k !== null ? PI_TEX(1 - k) : '\\pi - ' + th) + ' + 2\\pi ن');
          cand.push(thNum, Math.PI - thNum);
        }
      } else if (fn === 'cos') {
        if (Math.abs(c - 1) < 1e-12) { general.push(V + ' = 2\\pi ن'); cand.push(0); }
        else if (Math.abs(c + 1) < 1e-12) { general.push(V + ' = \\pi + 2\\pi ن'); cand.push(Math.PI); }
        else { general.push(V + ' = \\pm ' + th + ' + 2\\pi ن'); cand.push(thNum, -thNum); }
      } else { general.push(V + ' = ' + add(th) + '\\pi ن'); cand.push(thNum, thNum + Math.PI); }
      cand.forEach(function (x) {
        x = ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        if (!inRange.some(function (y) { return Math.abs(y - x) < 1e-9; })) inRange.push(x);
      });
    });
    if (!general.length) { st.push(S('لا توجد حلول حقيقية.', null)); return st; }
    st.push(S('الحل العام (حيث ن عدد صحيح):', general.join(' ،\\quad ')));
    inRange.sort(function (a, b) { return a - b; });
    st.push(S('الحلول في الفترة [0 ، 2\u03c0):', '\\{' + inRange.map(function (x) {
      var k = x / Math.PI, r = Math.round(k * 12) / 12;
      return Math.abs(k - r) < 1e-9 ? PI_TEX(r) : '\\approx ' + nice(x);
    }).join(' ،\\; ') + '\\}'));
    st.push(S('بالدرجات:', '\\{' + inRange.map(function (x) { return String(+(x * 180 / Math.PI).toFixed(2)) + '^{\\circ}'; }).join(' ،\\; ') + '\\}'));
    return st;
  }

  function opSystem(eqs, ctx) {
    // two linear equations in two unknowns -> Cramer's rule
    var parsed = eqs.map(function (q) {
      var parts = q.split('=');
      var L = parse(parts[0], ctx).cas, R = parts.length > 1 ? parse(parts[1], ctx).cas : '0';
      try { return nerdamer('expand((' + L + ')-(' + R + '))').toString(); } catch (e) { return simp('(' + L + ')-(' + R + ')'); }
    });
    var vs = [];
    parsed.forEach(function (e) { vars(e).forEach(function (v) { if (vs.indexOf(v) < 0) vs.push(v); }); });
    vs.sort(function (a, b) { var o = 'xyzabc'; return (o.indexOf(a) + 1 || 9) - (o.indexOf(b) + 1 || 9); });
    if (parsed.length !== 2 || vs.length !== 2) throw new Error('يدعم الحل خطوة بخطوة نظاماً من معادلتين بمجهولين');
    var X = vs[0], Y = vs[1], XA = LATIN_TO_AR[X] || X, YA = LATIN_TO_AR[Y] || Y;
    var co = parsed.map(function (e) {
      var a = simp(nerdamer.diff(e, X).toString()), b = simp(nerdamer.diff(e, Y).toString());
      var c = simp('-(' + sub(sub(e, X, 0), Y, 0) + ')');
      return [a, b, c];
    });
    co.forEach(function (r) { r.forEach(function (x) { if (vars(x).length) throw new Error('النظام ليس خطياً'); }); });
    var st = [];
    st.push(S('النظام:', '\\begin{cases} ' + eqs.join(' \\\\ ') + ' \\end{cases}'));
    st.push(S('نكتب المعاملات (قاعدة كرامر):', '\\begin{cases} ' + co.map(function (r) {
      var lin = function (c, name, first) {
        var n = num(c), tx = T(c, ctx), A = LATIN_TO_AR[name] || name;
        if (n === 0) return '';
        var body = n === 1 ? A : n === -1 ? '-' + A : (/[+\-]/.test(tx.slice(1)) ? '(' + tx + ')' : tx) + A;
        if (first) return body;
        return body[0] === '-' ? ' - ' + body.slice(1) : ' + ' + body;
      };
      var lhs = (lin(r[0], X, true) + lin(r[1], Y, !num(r[0]))).trim() || '0';
      return lhs + ' = ' + T(r[2], ctx);
    }).join(' \\\\ ') + ' \\end{cases}'));
    var D = simp('(' + co[0][0] + ')*(' + co[1][1] + ')-(' + co[0][1] + ')*(' + co[1][0] + ')');
    var Dx = simp('(' + co[0][2] + ')*(' + co[1][1] + ')-(' + co[0][1] + ')*(' + co[1][2] + ')');
    var Dy = simp('(' + co[0][0] + ')*(' + co[1][2] + ')-(' + co[0][2] + ')*(' + co[1][0] + ')');
    var m = function (a, b, c, d) { return '\\begin{vmatrix} ' + T(a, ctx) + ' & ' + T(b, ctx) + ' \\\\ ' + T(c, ctx) + ' & ' + T(d, ctx) + ' \\end{vmatrix}'; };
    st.push(S('محدد المعاملات:', '\\Delta = ' + m(co[0][0], co[0][1], co[1][0], co[1][1]) + ' = ' + T(D, ctx)));
    if (num(D) === 0) { st.push(S('المحدد يساوي صفراً، فالنظام ليس له حل وحيد.', null)); return st; }
    st.push(S('محدد ' + XA + ':', '\\Delta_{' + XA + '} = ' + m(co[0][2], co[0][1], co[1][2], co[1][1]) + ' = ' + T(Dx, ctx)));
    st.push(S('محدد ' + YA + ':', '\\Delta_{' + YA + '} = ' + m(co[0][0], co[0][2], co[1][0], co[1][2]) + ' = ' + T(Dy, ctx)));
    var xs = simp('(' + Dx + ')/(' + D + ')'), ys = simp('(' + Dy + ')/(' + D + ')');
    st.push(S('إذن:', XA + ' = \\frac{\\Delta_{' + XA + '}}{\\Delta} = ' + T(xs, ctx) + ' ،\\quad ' + YA + ' = \\frac{\\Delta_{' + YA + '}}{\\Delta} = ' + T(ys, ctx)));
    st.push(S('مجموعة الحل:', '\\{(' + T(xs, ctx) + ' ،\\; ' + T(ys, ctx) + ')\\}'));
    return st;
  }

  function ruleName(term, v) {
    var hasV = term.indexOf(v) >= 0;
    if (!hasV) return 'مشتقة الثابت = 0';
    if (/^\(?-?[\d./]*\)?\*?\(?\s*\(?x\)?\s*\)?(\^\(.*\))?$/.test(term.replace(new RegExp(v, 'g'), 'x')) && !/sin|cos|tan|log|exp|sqrt/.test(term)) return 'قاعدة القوة';
    if (/\/\(?[^)]*x/.test(term.replace(new RegExp(v, 'g'), 'x'))) return 'قاعدة القسمة';
    if (/sin|cos|tan|cot|sec|csc/.test(term)) return /\*/.test(term) ? 'قاعدة الضرب مع مشتقات الدوال المثلثية' : 'مشتقة الدوال المثلثية (مع السلسلة إن لزم)';
    if (/log/.test(term)) return 'مشتقة اللوغاريتم';
    if (/exp|e\^/.test(term)) return 'مشتقة الدالة الأسية';
    if (/\)\*\(/.test(term)) return 'قاعدة الضرب';
    return 'قاعدة السلسلة';
  }

  function opDerive(p, v) {
    var V = LATIN_TO_AR[v] || v;
    var st = [S('الدالة:', 'د(' + V + ') = ' + T(p.cas, p.ctx))];
    var terms = splitTopLevel(p.cas);
    if (terms.length > 1) {
      st.push(S('نشتق كل حد على حدة:', null));
      terms.forEach(function (tm) {
        var d = simp(nerdamer.diff(tm, v).toString());
        st.push(S('• ' + ruleName(tm, v) + ':', '\\frac{ء}{ء' + V + '}\\left(' + T(tm.replace(/^\+/, ''), p.ctx) + '\\right) = ' + T(d, p.ctx)));
      });
    } else {
      st.push(S('نستخدم ' + ruleName(p.cas, v) + ':', null));
    }
    var res = simp(nerdamer.diff(p.cas, v).toString());
    st.push(S('إذن المشتقة:', 'د\'(' + V + ') = ' + T(res, p.ctx)));
    return st;
  }

  function opIntegrate(p, v, lower, upper) {
    var V = LATIN_TO_AR[v] || v;
    var st = [], F;
    var terms = splitTopLevel(p.cas);
    var intTex = function (inner) { return '\\int ' + inner + ' \\, ء' + V; };
    if (lower !== undefined && lower !== null && lower !== '') {
      st.push(S('التكامل:', '\\int_{' + T(lower, p.ctx) + '}^{' + T(upper, p.ctx) + '} ' + T(p.cas, p.ctx) + ' \\, ء' + V));
    } else {
      st.push(S('التكامل:', intTex(T(p.cas, p.ctx))));
    }
    if (terms.length > 1) {
      st.push(S('نكامل كل حد على حدة:', null));
      terms.forEach(function (tm) {
        var it = simp(nerdamer.integrate(tm, v).toString());
        st.push(S('•', intTex(T(tm.replace(/^\+/, ''), p.ctx)) + ' = ' + T(it, p.ctx)));
      });
    }
    F = simp(nerdamer.integrate(p.cas, v).toString());
    if (/integrate/.test(F)) throw new Error('تعذّر إيجاد تكامل بصيغة مغلقة لهذه الدالة');
    if (lower === undefined || lower === null || lower === '') {
      st.push(S('الناتج (ث ثابت التكامل):', intTex(T(p.cas, p.ctx)) + ' = ' + T(F, p.ctx) + ' + ث'));
      return st;
    }
    st.push(S('الدالة الأصلية:', 'ق(' + V + ') = ' + T(F, p.ctx)));
    var Fb = simp(sub(F, v, upper)), Fa = simp(sub(F, v, lower));
    var val = simp('(' + Fb + ')-(' + Fa + ')');
    st.push(S('نعوّض بالحدين: ق(ب) − ق(أ):', '\\left[' + T(F, p.ctx) + '\\right]_{' + T(lower, p.ctx) + '}^{' + T(upper, p.ctx) + '} = (' + T(Fb, p.ctx) + ') - (' + T(Fa, p.ctx) + ')'));
    var vn = num(val);
    st.push(S('قيمة التكامل:', T(val, p.ctx) + (isNaN(vn) || String(vn) === val ? '' : ' \\approx ' + nice(vn))));
    return st;
  }

  // "((N)/(D))" -> [N, D]  (only when the whole expression is one fraction)
  function splitFrac(cas) {
    var s = String(cas).replace(/\s/g, '');
    var m = s.match(/^\(\((.*)\)\/\((.*)\)\)$/);
    if (!m) return null;
    var bal = function (x) { var d = 0; for (var i = 0; i < x.length; i++) { if (x[i] === '(') d++; else if (x[i] === ')') { d--; if (d < 0) return false; } } return d === 0; };
    return bal(m[1]) && bal(m[2]) ? [m[1], m[2]] : null;
  }
  function opLimit(p, v, to) {
    var V = LATIN_TO_AR[v] || v;
    var toCas = to === 'inf' || to === '∞' ? 'Infinity' : to === '-inf' ? '-Infinity' : parse(String(to), p.ctx).cas;
    var toTexA = toCas === 'Infinity' ? '\\infty' : toCas === '-Infinity' ? '-\\infty' : T(toCas, p.ctx);
    var st = [S('النهاية:', 'نها_{' + V + ' \\to ' + toTexA + '} ' + T(p.cas, p.ctx))];
    if (!/Infinity/.test(toCas)) {
      var direct = num(sub(p.cas, v, toCas));
      if (isFinite(direct) && !isNaN(direct)) {
        var exact = simp(sub(p.cas, v, toCas));
        st.push(S('بالتعويض المباشر عن ' + V + ' = ' + toTexA + ':', T(exact, p.ctx)));
        st.push(S('إذن:', 'نها_{' + V + ' \\to ' + toTexA + '} ' + T(p.cas, p.ctx) + ' = ' + T(exact, p.ctx)));
        return st;
      }
      st.push(S('بالتعويض المباشر نحصل على صيغة غير معيّنة (مثل ⁠0/0)، فنبسّط أولاً:', null));
      var sm = simp(p.cas);
      var fc; try { fc = nerdamer('factor(' + p.cas + ')').toString(); } catch (e) { fc = sm; }
      var fr = splitFrac(p.cas);
      if (fr) {
        var fn2, fd2;
        try { fn2 = nerdamer('factor(' + fr[0] + ')').toString(); fd2 = nerdamer('factor(' + fr[1] + ')').toString(); } catch (x) { fn2 = null; }
        if (fn2 && /\)\*\(|\)\^|\*\(/.test(fn2 + fd2)) {
          fc = '((' + fn2 + ')/(' + fd2 + '))';
          st.push(S('نحلّل البسط والمقام:', '\\frac{' + T(fn2, p.ctx) + '}{' + T(fd2, p.ctx) + '}'));
          fc = sm;
        }
      }
      var t0 = T(p.cas, p.ctx), tf = T(fc, p.ctx), ts = T(sm, p.ctx);
      if (tf !== t0 && tf !== ts) st.push(S('بالتحليل:', tf));
      if (ts !== t0) {
        st.push(S('بالاختصار:', T(sm, p.ctx)));
        var d2 = num(sub(sm, v, toCas));
        if (isFinite(d2) && !isNaN(d2)) {
          var ex2 = simp(sub(sm, v, toCas));
          st.push(S('ثم نعوّض:', 'نها_{' + V + ' \\to ' + toTexA + '} ' + T(p.cas, p.ctx) + ' = ' + T(ex2, p.ctx)));
          return st;
        }
      }
    }
    var L;
    try { L = nerdamer.limit(p.cas, v, toCas).toString(); } catch (e) { L = null; }
    if (L === null) throw new Error('تعذّر حساب النهاية');
    st.push(S(/Infinity/.test(toCas) ? 'بقسمة البسط والمقام على أعلى قوة (أو بقاعدة لوبيتال):' : 'باستخدام قاعدة لوبيتال أو النهايات الشهيرة:', null));
    st.push(S('إذن:', 'نها_{' + V + ' \\to ' + toTexA + '} ' + T(p.cas, p.ctx) + ' = ' + (/Infinity/.test(L) ? (L[0] === '-' ? '-\\infty' : '\\infty') : T(L, p.ctx))));
    return st;
  }

  // ---------------------------------------------------------------- public: steps(op, latex, options)
  function stripIntegral(tex) {
    // "\int_{a}^{b} f \, ءس" -> {f, a, b, var}
    var m = String(tex).match(/^\s*\\int(?:\s*_\s*(\{[^{}]*\}|\S)\s*\^\s*(\{[^{}]*\}|\S))?\s*([\s\S]*?)\s*(?:\\,\s*)?(?:ء|d|د)\s*([ء-يa-zA-Z])\s*$/);
    if (!m) return null;
    var un = function (x) { return x ? x.replace(/^\{|\}$/g, '') : null; };
    return { lower: un(m[1]), upper: un(m[2]), body: m[3], v: m[4] };
  }
  function stripLimit(tex) {
    var m = String(tex).match(/^\s*(?:\\lim|\\operatorname\*?\{(?:\\mathrm\{)?نها\}?\}|نها)\s*(?:\\limits)?\s*_\s*\{([^{}]*)\}\s*([\s\S]+)$/);
    if (!m) return null;
    var parts = m[1].split(/\\to|\\rightarrow|→|←/);
    if (parts.length < 2) return null;
    return { v: parts[0].trim(), to: parts[1].trim().replace(/\\infty/, 'inf').replace(/^\+?inf$/, 'inf').replace(/^-\s*inf$/, '-inf'), body: m[2] };
  }
  function mainVar(cas) {
    var vs = vars(cas);
    if (vs.indexOf('x') >= 0) return 'x';
    return vs[0] || 'x';
  }
  function latinOf(arOrLatin) {
    var s = String(arOrLatin || '').replace(/ـ/g, '').trim();
    for (var k = 0; k < VARS.length; k++) if (VARS[k][0] === s) return VARS[k][1];
    return /^[a-zA-Z]$/.test(s) ? s : 'x';
  }

  /**
   * op: simplify | evaluate | factor | expand | solve | derive | integrate | limit | auto
   * opt: { v: 'س', to: '0', lower, upper }
   * returns { steps: [{t, tex}], op }
   */
  function steps(op, tex, opt) {
    opt = opt || {};
    tex = String(tex || '').trim();
    if (!tex) throw new Error('اكتب معادلة أولاً');
    var ctx = makeCtx();
    // systems
    var cases = tex.match(/\\begin\{cases\}([\s\S]*)\\end\{cases\}/);
    if (cases) {
      var eqs = cases[1].split(/\\\\/).map(function (x) { return x.replace(/&/g, '').trim(); }).filter(Boolean);
      return { op: 'system', steps: opSystem(eqs, ctx) };
    }
    if (op === 'auto') {
      if (stripIntegral(tex)) op = 'integrate';
      else if (stripLimit(tex)) op = 'limit';
      else if (/=/.test(tex) && !/^\s*[ء-يa-zA-Z]\s*\(?[ء-يa-zA-Z]?\)?\s*'?\s*=/.test(tex)) op = 'solve';
      else op = 'simplify';
    }
    // "ص = …" / "د(س) = …" definitions: use the right-hand side
    var def = tex.match(/^\s*([ء-يa-zA-Z](?:\s*\(\s*[ء-يa-zA-Z]\s*\))?)\s*=\s*([\s\S]+)$/);
    if (op === 'integrate') {
      var I = stripIntegral(tex);
      var body = I ? I.body : (def ? def[2] : tex);
      var pi = parse(body, ctx);
      var v = I ? latinOf(I.v) : (opt.v ? latinOf(opt.v) : mainVar(pi.cas));
      var lo = I && I.lower !== null ? parse(I.lower, ctx).cas : (opt.lower !== undefined && opt.lower !== '' ? parse(String(opt.lower), ctx).cas : null);
      var hi = I && I.upper !== null ? parse(I.upper, ctx).cas : (opt.upper !== undefined && opt.upper !== '' ? parse(String(opt.upper), ctx).cas : null);
      return { op: op, steps: opIntegrate(pi, v, lo, hi) };
    }
    if (op === 'limit') {
      var Lm = stripLimit(tex);
      var lb = Lm ? Lm.body : (def ? def[2] : tex);
      var pl = parse(lb, ctx);
      return { op: op, steps: opLimit(pl, Lm ? latinOf(Lm.v) : (opt.v ? latinOf(opt.v) : mainVar(pl.cas)), Lm ? Lm.to : (opt.to || '0')) };
    }
    if (op === 'solve') {
      var sides = tex.split('=');
      if (sides.length > 2) sides = [sides.slice(0, -1).join('='), sides[sides.length - 1]];
      var L = parse(sides[0], ctx), R = parse(sides.length > 1 ? sides[1] : '0', ctx);
      var both = simp('(' + L.cas + ')-(' + R.cas + ')');
      var sv = opt.v ? latinOf(opt.v) : mainVar(both);
      return { op: op, steps: opSolve({ lhs: L.cas, rhs: R.cas, ctx: ctx }, sv) };
    }
    var p = parse(def && (op === 'derive') ? def[2] : (def && !/=/.test(def[2]) && op !== 'solve' ? def[2] : tex), ctx);
    if (op === 'derive') return { op: op, steps: opDerive(p, opt.v ? latinOf(opt.v) : mainVar(p.cas)) };
    if (op === 'evaluate') return { op: op, steps: opEvaluate(p) };
    if (op === 'factor') return { op: op, steps: opFactor(p) };
    if (op === 'expand') return { op: op, steps: opExpand(p) };
    return { op: 'simplify', steps: opSimplify(p) };
  }

  /** compile an Arabic-notation expression for plotting: returns f(x) */
  function compile(exprText) {
    var tex = String(exprText || '').trim();
    var def = tex.match(/^\s*(?:ص|د\s*\(\s*س\s*\)|y|f\s*\(\s*x\s*\)|[ء-ي](?:\s*\(\s*س\s*\))?)\s*=\s*([\s\S]+)$/);
    if (def) tex = def[1];
    var ctx = makeCtx();
    var p = parse(tex, ctx);
    var vs = vars(p.cas).filter(function (v) { return v !== 'x'; });
    if (vs.length) throw new Error('الدالة تحتوي على متغير غير س: ' + vs.map(function (v) { return LATIN_TO_AR[v] || v; }).join('، '));
    var f = nerdamer(p.cas).buildFunction(['x']);
    return { f: f, cas: p.cas, tex: toTex(p.cas, ctx), ctx: ctx };
  }

  return { parse: parse, toTex: toTex, steps: steps, compile: compile, simplify: simp, _split: splitTopLevel, LATIN_TO_AR: LATIN_TO_AR };
});
