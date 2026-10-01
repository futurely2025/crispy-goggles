/* LatexSense (5.5) — understands LaTeX written in a Word document even WITHOUT $…$, and decides what each formula is.
 *
 * How it works («الآلية»):
 *  1) DocScan finds the delimited formulas as before: $…$  $$…$$  \(…\)  \[…\]  \begin{…}  figure / table blocks.
 *  2) The rest of every paragraph is read token by token:
 *       · LaTeX commands with their {…}[…] arguments (\frac{أ}{ب}, \sqrt{2}, \int, \dots, \ce{…}, \qty{…}{…} …)
 *       · math characters: digits, + − × ÷ = < > ≤ ≥ ^ _ ( ) [ ] | ! and single Latin letters
 *       · Arabic variables and function names (س ص أ ب جـ د هـ … جا جتا لو لط نها)
 *     Words of the sentence (Arabic words of 3+ letters, «في، من، أو، و …», Latin words like «LaTeX», «:» «،» «؟») end a
 *     formula. A piece becomes a formula only if it really contains LaTeX (a command with content, or ^ / _ with an
 *     operand), its brackets are balanced («أ)» option labels stay text), and it is not an empty example like \frac{}{}.
 *  3) Big spaces written in LaTeX between answer choices — \hspace{…} \quad \qquad \hfill — become real spaces / a tab.
 *  4) A bare piece that touches a $…$ formula (only spaces between) is joined to it: «ع_{ر,د} = $\begin{bmatrix}…$».
 *  5) Every formula is classified: chemistry (\ce{…}, or H_2O, CO_2, Fe^{3+}, 2H2 + O2 -> 2H2O … written without \ce)
 *     is drawn with the chemistry engine (upright, left-to-right); units \qty \SI \si, physics and electricity stay
 *     equations (the engine understands them); \begin{circuit|physics|graph…} blocks are figures (step 1).
 * Nothing here talks to Word: it only returns more matches for the converter and tells it how to draw them. */
(function (global) {
  'use strict';
  var DS = global.DocScan;
  if (!DS || DS.__sense) return;

  var BIG_SPACE = /^\\(hspace\*?|vspace\*?|hfill|quad|qquad|medskip|bigskip|smallskip|noindent)\b/;
  var SMALL_SPACE = /^\\([,;:!> ]|enspace|thinspace)/;
  var AR_FUNCS = { 'جا': 1, 'جتا': 1, 'طا': 1, 'ظا': 1, 'طتا': 1, 'ظتا': 1, 'قا': 1, 'قتا': 1, 'لو': 1, 'لط': 1, 'لوه': 1, 'لوهـ': 1, 'نها': 1, 'مجـ': 1, 'مج': 1 };
  var STOP_AR = { 'في': 1, 'من': 1, 'إلى': 1, 'الى': 1, 'على': 1, 'أو': 1, 'او': 1, 'و': 1, 'لا': 1, 'ما': 1, 'هو': 1, 'هي': 1, 'إن': 1, 'أن': 1, 'ان': 1, 'ثم': 1, 'عن': 1, 'مع': 1, 'قد': 1, 'لم': 1, 'لن': 1, 'كل': 1, 'إذا': 1, 'اذا': 1, 'حيث': 1, 'بين': 1, 'كان': 1, 'فإن': 1, 'فان': 1, 'ان': 1, 'ب': 0 };
  var AR = /[ء-يٱ-ۓـ]/;
  var MATH_CH = /[0-9٠-٩۰-۹+\-*\/=<>^_()[\]|!'.,×÷±−≤≥≠≈∞π√∑∫→←↔⇒⇔∈∉∩∪⊂⊆∠°′٠-٬{}~&]/;

  function escaped(t, i) { var n = 0; for (var k = i - 1; k >= 0 && t[k] === '\\'; k--) n++; return n % 2 === 1; }
  // \name followed by any number of [..] / {..} groups → end index
  function cmdEnd(t, i) {
    var m = /^\\([A-Za-z]+\*?|.)/.exec(t.slice(i));
    if (!m) return i + 1;
    var j = i + m[0].length;
    if (/^[A-Za-z]/.test(m[1])) {
      while (j < t.length) {
        var k = j; while (t[k] === ' ') k++;
        if (t[k] === '{' || (t[k] === '[' && /^\\[A-Za-z]/.test(t.slice(i)))) {
          var open = t[k], close = open === '{' ? '}' : ']', d = 0, q = k;
          for (; q < t.length; q++) { if (t[q] === open && !escaped(t, q)) d++; else if (t[q] === close && !escaped(t, q) && !--d) break; }
          if (q >= t.length) return t.length;
          j = q + 1;
        } else break;
      }
    }
    return j;
  }
  // tokens of one paragraph text (outside ranges already matched)
  var LABEL = /^([\u0621-\u064A]\u0640?|[a-dA-D]|[0-9]{1,2})\)/;
  function tokens(t, from, to) {
    var out = [], i = from, depth = 0;
    while (i < to) {
      var c = t[i];
      // inside a bare { … } group everything belongs to the formula (ع_{ر، د})
      if (depth > 0 && c !== '\\') {
        if (c === '{') depth++; else if (c === '}') depth--;
        out.push({ k: /\s/.test(c) ? 'sp' : 'sym', s: i, e: i + 1 }); i++; continue;
      }
      if (c === '{') { depth++; out.push({ k: 'sym', s: i, e: i + 1 }); i++; continue; }
      // answer labels «أ)» «ب)» «1)» «a)» at the start of a choice are text
      if ((i === from || /\s/.test(t[i - 1])) && LABEL.test(t.slice(i, i + 4))) {
        var lm = LABEL.exec(t.slice(i, i + 4));
        out.push({ k: 'word', s: i, e: i + lm[0].length }); i += lm[0].length; continue;
      }
      if (c === '\\') {
        var rest = t.slice(i), e = Math.min(cmdEnd(t, i), to);
        if (BIG_SPACE.test(rest)) out.push({ k: 'big', s: i, e: e, v: t.slice(i, e) });
        else if (SMALL_SPACE.test(rest)) out.push({ k: 'sp', s: i, e: e });
        else out.push({ k: 'cmd', s: i, e: e, v: t.slice(i, e) });
        i = e; continue;
      }
      if (/\s/.test(c)) { var s = i; while (i < to && /\s/.test(t[i])) i++; out.push({ k: 'sp', s: s, e: i }); continue; }
      if (AR.test(c)) {
        var a = i; while (i < to && AR.test(t[i])) i++;
        var w = t.slice(a, i), letters = w.replace(/ـ/g, '');
        var ok = AR_FUNCS[w] || AR_FUNCS[letters] || (letters.length <= 2 && !STOP_AR[w] && !STOP_AR[letters]);
        out.push({ k: ok ? 'var' : 'word', s: a, e: i });
        continue;
      }
      if (/[A-Za-z]/.test(c)) {
        var b = i; while (i < to && /[A-Za-z]/.test(t[i])) i++;
        out.push({ k: i - b >= 3 ? 'word' : 'var', s: b, e: i });
        continue;
      }
      if (/[:،؛؟?"«»]/.test(c)) { out.push({ k: 'word', s: i, e: i + 1 }); i++; continue; }
      out.push({ k: MATH_CH.test(c) ? 'sym' : 'word', s: i, e: i + 1 });
      i++;
    }
    return out;
  }
  // a run of tokens is a formula only if it really is LaTeX
  function isFormula(src) {
    var hasCmd = /\\[A-Za-z]+/.test(src) && !/^\s*(\\(hspace|vspace|quad|qquad|hfill)\b[^\\]*)+\s*$/.test(src);
    var hasScript = /[\^_]\s*(\{[^}]*\S[^}]*\}|[0-9A-Za-zء-ي٠-٩(\\])/.test(src);
    if (!hasCmd && !hasScript) return false;
    // empty examples («مثل \frac{}{} و \sqrt{}»): nothing but command names and empty braces
    var content = src.replace(/\\(frac|dfrac|tfrac|sqrt|left|right|text|mathrm|operatorname|hspace|quad|qquad|begin|end)\b/g, '')
      .replace(/[{}[\]\s^_]/g, '');
    if (!content) return false;
    return true;
  }
  function balanceTrim(t, s, e) {
    // cut unmatched closers at the start («أ) 3» → keep only what follows) and unmatched openers at the end
    var pairs = { ')': '(', ']': '[', '}': '{' }, stack = [], cut = s;
    for (var i = s; i < e; i++) {
      var c = t[i];
      if (c === '\\') { i++; continue; }
      if (c === '(' || c === '[' || c === '{') stack.push(i);
      else if (pairs[c]) { if (stack.length) stack.pop(); else cut = i + 1; }
    }
    s = Math.max(s, cut);
    if (stack.length) { var firstOpen = stack.filter(function (k) { return k >= s; })[0]; if (firstOpen !== undefined) e = firstOpen; }
    while (s < e && /[\s.,،:;!-]/.test(t[s]) && !(t[s] === '-' && /[0-9\\(]/.test(t[s + 1] || ''))) s++;
    while (e > s && /[\s.,،:;]/.test(t[e - 1])) e--;
    return [s, e];
  }
  function spaceText(v) {
    if (/^\\(hspace|hfill)/.test(v)) return '\t';
    if (/^\\qquad/.test(v)) return '  ';
    if (/^\\quad/.test(v)) return ' ';
    return ' ';
  }

  function bare(paras, taken) {
    var out = [];
    paras.forEach(function (t0, p) {
      var t = String(t0 || '').replace(/\u000b/g, ' ');
      if (!/[\\^_]/.test(t) || /^\s*%/.test(t)) return;
      // free stretches of this paragraph (outside the delimited matches)
      var busy = taken.filter(function (m) { return m.a <= p && m.b >= p; }).map(function (m) { return [m.a === p ? m.s : 0, m.b === p ? m.e : t.length]; })
        .sort(function (x, y) { return x[0] - y[0]; });
      var free = [], cur = 0;
      busy.forEach(function (b) { if (b[0] > cur) free.push([cur, b[0]]); cur = Math.max(cur, b[1]); });
      if (cur < t.length) free.push([cur, t.length]);
      free.forEach(function (fr) {
        var toks = tokens(t, fr[0], fr[1]), run = [];
        function loose(tk) {                          // a LaTeX space command left outside a formula → a real space
          if (t[tk.s] === '\\') out.push({ a: p, s: tk.s, b: p, e: tk.e, type: 'space', code: t.slice(tk.s, tk.e), text: ' ' });
        }
        function flush() {
          while (run.length && run[run.length - 1].k === 'sp') loose(run.pop());
          while (run.length && run[0].k === 'sp') loose(run.shift());
          if (run.length) {
            var se = balanceTrim(t, run[0].s, run[run.length - 1].e), src = t.slice(se[0], se[1]);
            if (src.trim() && isFormula(src)) out.push({ a: p, s: se[0], b: p, e: se[1], type: 'inline', bare: true, code: src, tex: src.trim() });
            // «س =» just before a $…$ formula: joined to it below, dropped otherwise
            else if (/[=<>\u2264\u2265\u2260\u2248]\s*$|^\s*[=<>\u2264\u2265\u2260\u2248]/.test(src) && /[0-9A-Za-z\u0621-\u064A]/.test(src)) out.push({ a: p, s: se[0], b: p, e: se[1], type: 'inline', bare: true, weak: true, code: src, tex: src.trim() });
          }
          run = [];
        }
        toks.forEach(function (tk) {
          if (tk.k === 'word') { flush(); return; }
          if (tk.k === 'sp' && !run.length) { loose(tk); return; }
          if (tk.k === 'big') { flush(); out.push({ a: p, s: tk.s, b: p, e: tk.e, type: 'space', code: tk.v, text: spaceText(tk.v) }); return; }
          run.push(tk);
        });
        flush();
      });
    });
    return out;
  }
  // join a bare piece and a $…$ formula that touch (only spaces between) into one formula
  function joinTouching(list, paras) {
    list.sort(function (x, y) { return x.a - y.a || x.s - y.s; });
    var out = [];
    list.forEach(function (m) {
      var prev = out[out.length - 1];
      if (prev && prev.a === prev.b && m.a === m.b && prev.a === m.a && prev.type !== 'space' && m.type !== 'space' && prev.type !== 'block' && m.type !== 'block' &&
          (prev.bare || m.bare) && prev.type !== 'display' && m.type !== 'display' && !paras[m.a].slice(prev.e, m.s).trim() && !(prev.weak && m.weak)) {
        var t = paras[m.a];
        prev.e = m.e; prev.code = t.slice(prev.s, prev.e); prev.tex = prev.tex + ' ' + m.tex; prev.bare = true; prev.inner = null; prev.weak = false;
        return;
      }
      out.push(m);
    });
    out = out.filter(function (m) { return !m.weak; });
    out.forEach(function (m) {
      if (m.type === 'space') return;
      var t = paras[m.a];
      m.whole = !t.slice(0, m.s).trim() && !paras[m.b].slice(m.e).trim();
      if (m.bare && m.whole) m.type = 'display';
    });
    return out;
  }

  // ------------------------------------------------------------ what is it?  → {mode, tex}
  var EL = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba ' +
    'La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' ');
  var ELS = {}; EL.forEach(function (e) { ELS[e] = 1; });
  var ARROWS = /\\(longrightarrow|rightarrow|to|xrightarrow(\[[^\]]*\])?(\{[^}]*\})?)|<=>|<->|->|→|⟶/g;
  var EQUIL = /\\(rightleftharpoons|leftrightharpoons|rightleftarrows|leftrightarrows|longleftrightarrow)|⇌|<=>/g;
  function chemOf(tex) {
    var t = String(tex).trim();
    var ce = /^\\ce\s*\{([\s\S]*)\}$/.exec(t);
    if (ce) return ce[1];
    if (AR.test(t) || /\\(frac|sqrt|int|sum|lim|begin)\b/.test(t)) return null;
    var body = t.replace(EQUIL, ' <=> ').replace(ARROWS, ' -> ');
    if (/=(?!>)/.test(body.replace(/<=>/g, ''))) return null;                        // an "=" means an equation, not a reaction
    var skel = body.replace(/<=>|->/g, ' ').replace(/\^\s*\{[^}]*\}|\^[0-9]*[+-]/g, '').replace(/_\s*\{?\s*[0-9]+\s*\}?/g, '')
      .replace(/\((s|l|g|aq)\)/g, '').replace(/\\(mathrm|text)\s*\{([^}]*)\}/g, '$2').replace(/[0-9\s+().[\]·•*\\cdot]/g, '');
    if (!skel || !/^([A-Z][a-z]?)+$/.test(skel)) return null;
    var syms = skel.match(/[A-Z][a-z]?/g);
    if (!syms.every(function (s) { return ELS[s]; })) return null;
    var hasArrow = /->|<=>/.test(body), hasSub = /_\s*\{?\s*[0-9]|[A-Za-z][0-9]/.test(body), hasCharge = /\^\s*\{?\s*[0-9]*[+-]/.test(body);
    if (!(hasArrow || hasSub || hasCharge || syms.length >= 2)) return null;
    return body.replace(/\\(mathrm|text)\s*\{([^}]*)\}/g, '$2').replace(/_\s*\{\s*([0-9]+)\s*\}/g, '$1').replace(/_\s*([0-9])/g, '$1')
      .replace(/\\cdot/g, '*').replace(/\s+/g, ' ').trim();
  }
  function classify(tex) {
    var c = chemOf(tex);
    if (c !== null) return { mode: 'chem', tex: c };
    return { mode: 'math', tex: String(tex).trim() };
  }

  var orig = DS.find;
  DS.find = function (paras) {
    var base = orig(paras);
    var clean = paras.map(function (t) { return String(t || '').replace(/\u000b/g, ' '); });
    return joinTouching(base.concat(bare(clean, base)), clean);
  };
  DS.__sense = true;
  global.LatexSense = { classify: classify, chemOf: chemOf, bare: bare, tokens: tokens, isFormula: isFormula };
})(typeof window !== 'undefined' ? window : this);
