/*
 * DiagramRender — number lines (inequalities / intervals), Venn diagrams and probability trees.
 * data = { v:1, env:'numberline'|'venn'|'tree', code }
 *
 * \begin{numberline}[min=-5, max=5, step=1, digits=eastern]
 *   \interval{[-2, 3)}   \interval[color=red]{(-\infty, 1]}   \solution{س ≥ 2}   \solution{-1 < س ≤ 4}
 *   \point{4}   \point[open, label=أ]{-1}
 * \end{numberline}
 * \begin{venn}[sets={أ,ب}, universe=ش, shade={أ∩ب}]      % 2 or 3 sets; shade: set expression with ∩ ∪ − ' ( )
 *   \region[أ]{1, 2, 3}  \region[أ∩ب]{4}  \region[ب]{5, 6}  \region[out]{7}   % elements written in a region (only-A, A∩B, …)
 * \end{venn}
 * \begin{tree}[products]
 *   - أحمر [0.3]
 *     - أحمر [0.2]
 *     - أزرق [0.8]
 *   - أزرق [0.7]
 * \end{tree}
 */
(function (global) {
  'use strict';
  var INK = '#1b2a30', TQ = '#0e9f9a';
  function f2(v) { return (+v).toFixed(2); }

  function envParts(code) {
    var m = String(code || '').match(/\\begin\s*\{(numberline|venn|tree)\}\s*(\[[^\]]*\])?([\s\S]*?)\\end\s*\{\1\}/);
    if (!m) throw new Error('صيغة المخطط غير صحيحة');
    return { env: m[1], opts: m[2] ? Mk.options(m[2].slice(1, -1)) : {}, body: m[3] };
  }
  function parse(env, opts, body) {
    var code = '\\begin{' + env + '}' + (opts ? '[' + opts + ']' : '') + '\n' + String(body || '').replace(/^\n+|\s+$/g, '') + '\n\\end{' + env + '}';
    var d = { v: 1, env: env, code: code };
    build(d);                                   // validate
    return d;
  }
  function serialize(d) { return String(d.code || '').trim(); }
  function build(d) {
    var p = envParts(d.code);
    if (p.env === 'numberline') return numberline(p);
    if (p.env === 'venn') return venn(p);
    return tree(p);
  }
  function render(d) {
    var r = build(d);
    return Raster.fontCss([r.font || 'Amiri'], true).then(function (css) {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + f2(r.w) + '" height="' + f2(r.h) + '" viewBox="0 0 ' + f2(r.w) + ' ' + f2(r.h) + '">' +
        '<defs><style>' + css + ' text{font-family:"' + (r.font || 'Amiri') + '","Times New Roman",serif;fill:' + INK + '} .dl{font-size:' + f2(r.fs) + 'px} .db{font-size:' + f2(r.fs * 1.15) + 'px;font-weight:700} .ds{font-size:' + f2(r.fs * 0.9) + 'px;fill:#3d5560}</style></defs>' +
        '<rect width="100%" height="100%" fill="#fff"/>' + r.body + '</svg>';
      return { svg: svg, w: r.w, h: r.h };
    });
  }

  // ------------------------------------------------------------ number line
  var INF = /^[+]?\s*(\\infty|∞|inf)$/i, NINF = /^-\s*(\\infty|∞|inf)$/i;
  function bound(v) { v = String(v).trim(); if (INF.test(v)) return Infinity; if (NINF.test(v)) return -Infinity; return Mk.evalNum(v, NaN); }
  function parseInterval(s) {
    s = Mk.digits(String(s).trim()).replace(/\\left|\\right/g, '').replace(/\\\{|\\\}/g, '');
    var m = s.match(/^([\[\(\]])\s*([^,،;]+)\s*[,،;]\s*([^\]\)\[]+)\s*([\]\)\[])$/);
    if (!m) throw new Error('فترة غير صحيحة: ' + s + ' (مثل [-2, 3) )');
    var a = bound(m[2]), b = bound(m[3]);
    return { a: a, b: b, ca: m[1] === '[' && isFinite(a), cb: m[4] === ']' && isFinite(b) };
  }
  function parseInequality(s) {
    s = Mk.digits(String(s)).replace(/\\le(q)?\b|≤|<=/g, '≤').replace(/\\ge(q)?\b|≥|>=/g, '≥').replace(/\\lt\b/g, '<').replace(/\\gt\b/g, '>').replace(/\s+/g, '');
    var v = '(?:س|x)', num = '([-+]?[\\d.]+(?:/[\\d.]+)?|[-+]?\\\\frac\\{[^}]*\\}\\{[^}]*\\})';
    var m;
    if ((m = s.match(new RegExp('^' + num + '([<≤])' + v + '([<≤])' + num + '$')))) return { a: Mk.evalNum(m[1], NaN), ca: m[2] === '≤', b: Mk.evalNum(m[4], NaN), cb: m[3] === '≤' };
    if ((m = s.match(new RegExp('^' + v + '([<≤>≥])' + num + '$')))) { var k = Mk.evalNum(m[2], NaN); return /[<≤]/.test(m[1]) ? { a: -Infinity, b: k, cb: m[1] === '≤' } : { a: k, b: Infinity, ca: m[1] === '≥' }; }
    if ((m = s.match(new RegExp('^' + num + '([<≤>≥])' + v + '$')))) { var k2 = Mk.evalNum(m[1], NaN); return /[<≤]/.test(m[2]) ? { a: k2, b: Infinity, ca: m[2] === '≤' } : { a: -Infinity, b: k2, cb: m[2] === '≥' }; }
    throw new Error('متباينة غير مفهومة: ' + s);
  }
  function numberline(p) {
    var o = p.opts, fs = Mk.evalNum(o.fontsize, 12) * 96 / 72, eastern = /east|هند/.test(String(o.digits || ''));
    var items = [];
    Mk.commands(p.body).forEach(function (c) {
      var col = Mk.color(c.opt.color, TQ);
      if (c.name === 'interval') items.push(Object.assign(parseInterval(c.args[0]), { t: 'iv', color: col, label: c.opt.label || '' }));
      else if (c.name === 'solution' || c.name === 'inequality') items.push(Object.assign(parseInequality(c.args[0]), { t: 'iv', color: col, label: c.opt.label || '' }));
      else if (c.name === 'point') items.push({ t: 'pt', x: Mk.evalNum(c.args[0], NaN), open: !!c.opt.open, color: col, label: c.opt.label || '' });
    });
    var fin = [];
    items.forEach(function (it) { if (it.t === 'pt') fin.push(it.x); else { if (isFinite(it.a)) fin.push(it.a); if (isFinite(it.b)) fin.push(it.b); } });
    var lo = o.min !== undefined ? Mk.evalNum(o.min, -5) : Math.floor(Math.min.apply(null, fin.concat([0])) - 2);
    var hi = o.max !== undefined ? Mk.evalNum(o.max, 5) : Math.ceil(Math.max.apply(null, fin.concat([0])) + 2);
    var step = Mk.evalNum(o.step, (hi - lo) > 24 ? Math.ceil((hi - lo) / 12) : 1);
    var W = Math.max(360, Math.min(720, (hi - lo) / step * 46 + 80)), pad = 34;
    var rowH = fs * 2.4, H = 40 + items.filter(function (i) { return i.t === 'iv'; }).length * 0 + rowH + fs * 2.5;
    var X = function (v) { return pad + (Math.max(lo - step * 0.6, Math.min(hi + step * 0.6, v)) - lo) / (hi - lo) * (W - 2 * pad); };
    var y = 30 + (items.some(function (i) { return i.label; }) ? fs : 0), out = '';
    H = y + fs * 3;
    // axis
    out += '<path d="M' + f2(pad - 20) + ' ' + f2(y) + 'H' + f2(W - pad + 20) + '" stroke="' + INK + '" stroke-width="1.6"/>';
    out += '<path d="M' + f2(W - pad + 24) + ' ' + f2(y) + 'l-10 -4.5v9z M' + f2(pad - 24) + ' ' + f2(y) + 'l10 -4.5v9z" fill="' + INK + '"/>';
    for (var t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) {
      var x = X(t);
      out += '<path d="M' + f2(x) + ' ' + f2(y - 5) + 'v10" stroke="' + INK + '" stroke-width="1.3"/>';
      out += '<text class="dl" x="' + f2(x) + '" y="' + f2(y + fs * 1.5) + '" text-anchor="middle" direction="ltr">' + Raster.digits(String(+t.toFixed(6)), eastern) + '</text>';
    }
    var k = 0;
    items.forEach(function (it) {
      if (it.t !== 'iv') return;
      var yy = y - 10 - k * 7; k++;
      var xa = isFinite(it.a) ? X(it.a) : pad - 16, xb = isFinite(it.b) ? X(it.b) : W - pad + 16;
      out += '<path d="M' + f2(xa) + ' ' + f2(yy) + 'H' + f2(xb) + '" stroke="' + it.color + '" stroke-width="5" stroke-opacity="0.85" stroke-linecap="butt"/>';
      if (!isFinite(it.a)) out += '<path d="M' + f2(xa - 8) + ' ' + f2(yy) + 'l10 -6v12z" fill="' + it.color + '"/>';
      if (!isFinite(it.b)) out += '<path d="M' + f2(xb + 8) + ' ' + f2(yy) + 'l-10 -6v12z" fill="' + it.color + '"/>';
      [[it.a, it.ca], [it.b, it.cb]].forEach(function (e) {
        if (!isFinite(e[0])) return;
        out += '<circle cx="' + f2(X(e[0])) + '" cy="' + f2(yy) + '" r="5.2" fill="' + (e[1] ? it.color : '#fff') + '" stroke="' + it.color + '" stroke-width="2.2"/>';
      });
      if (it.label) out += Raster.words((xa + xb) / 2, yy - 10, it.label, ' class="ds"', fs * 0.9, true);
    });
    items.forEach(function (it) {
      if (it.t !== 'pt' || !isFinite(it.x)) return;
      out += '<circle cx="' + f2(X(it.x)) + '" cy="' + f2(y) + '" r="5.2" fill="' + (it.open ? '#fff' : it.color) + '" stroke="' + it.color + '" stroke-width="2.2"/>';
      if (it.label) out += Raster.words(X(it.x), y - 12, it.label, ' class="db"', fs * 1.15, true);
    });
    return { w: W, h: H, body: out, fs: fs, font: o.font };
  }

  // ------------------------------------------------------------ Venn
  var REG2 = { a: [1, 0], b: [0, 1], ab: [1, 1], out: [0, 0] };
  var REG3 = { a: [1, 0, 0], b: [0, 1, 0], c: [0, 0, 1], ab: [1, 1, 0], ac: [1, 0, 1], bc: [0, 1, 1], abc: [1, 1, 1], out: [0, 0, 0] };
  function setExpr(expr, names) {
    // returns a function(membership array) -> boolean ; letters A/B/C or the set names
    var s = String(expr).replace(/\s+/g, '').replace(/\\cap|∩|and/g, '∩').replace(/\\cup|∪|or/g, '∪').replace(/\\setminus|\\backslash|−|-/g, '−').replace(/\^\{?c\}?|\^\{?\\prime\}?|′|’/g, "'");
    var i = 0;
    function atom() {
      var c = s[i];
      if (c === '(') { i++; var e = union(); if (s[i] === ')') i++; return post(e); }
      for (var k = 0; k < names.length; k++) {
        var nm = names[k];
        if (s.substr(i, nm.length) === nm) { i += nm.length; var idx = k; return post(function (m) { return !!m[idx]; }); }
      }
      var L = 'ABC'.indexOf(String(c).toUpperCase());
      if (L >= 0 && L < names.length) { i++; return post(function (m) { return !!m[L]; }); }
      if (c === 'U' || c === 'ش' || c === 'S') { i++; return post(function () { return true; }); }
      throw new Error('رمز غير مفهوم في «' + expr + '»');
    }
    function NOT(a) { return function (m) { return !a(m); }; }
    function AND(a, b) { return function (m) { return a(m) && b(m); }; }
    function OR(a, b) { return function (m) { return a(m) || b(m); }; }
    function MINUS(a, b) { return function (m) { return a(m) && !b(m); }; }
    function post(f) { while (s[i] === "'") { i++; f = NOT(f); } return f; }
    function inter() { var f = atom(); while (s[i] === '∩') { i++; f = AND(f, atom()); } return f; }
    function union() {
      var f = inter();
      while (s[i] === '∪' || s[i] === '−') { var op = s[i++]; f = op === '∪' ? OR(f, inter()) : MINUS(f, inter()); }
      return f;
    }
    var fn = union();
    if (i < s.length) throw new Error('تعبير غير مفهوم: ' + expr);
    return fn;
  }
  function regionKey(label, names, n) {
    var L = String(label).trim();
    if (/^(out|خارج|U|ش)$/i.test(L)) return 'out';
    var REG = n === 3 ? REG3 : REG2;
    if (REG[L.toLowerCase()]) return L.toLowerCase();
    // an expression: pick the single region it denotes (e.g. أ∩ب, أ فقط = أ−ب)
    var f = setExpr(L.replace(/فقط/g, '').trim(), names), hits = Object.keys(REG).filter(function (k) { return f(REG[k]); });
    if (hits.length > 1 && /^[^∩∪−'()]+$/.test(L.replace(/فقط/g, '').trim())) hits = hits.filter(function (k) { return k.length === 1; });   // "أ" alone = only-أ region
    if (hits.length !== 1) throw new Error('حدّد منطقة واحدة: ' + L);
    return hits[0];
  }
  function venn(p) {
    var o = p.opts, fs = Mk.evalNum(o.fontsize, 12) * 96 / 72, eastern = /east|هند/.test(String(o.digits || ''));
    var names = o.sets ? Mk.list(o.sets) : ['أ', 'ب'];
    var n = Math.max(2, Math.min(3, names.length));
    var W = 460, H = n === 3 ? 400 : 300, R = n === 3 ? 92 : 98;
    var cx = W / 2, cy = n === 3 ? 210 : H / 2 + 6;
    var C = n === 3 ? [[cx - 56, cy - 36], [cx + 56, cy - 36], [cx, cy + 56]] : [[cx - 58, cy], [cx + 58, cy]];
    var cols = [Mk.color(o.color1, TQ), Mk.color(o.color2, '#e07a00'), Mk.color(o.color3, '#1f5fbf')];
    var out = '<rect x="12" y="12" width="' + (W - 24) + '" height="' + (H - 24) + '" rx="10" fill="#fff" stroke="' + INK + '" stroke-width="1.8"/>';
    out += Raster.words(W - 34, 38, o.universe || o.u || 'ش', ' class="db"', fs * 1.15, true);
    // shading via pixel-free approach: clip paths per region
    var uid = 'v' + Math.random().toString(36).slice(2, 7), defs = '';
    C.forEach(function (c, i) { defs += '<clipPath id="' + uid + i + '"><circle cx="' + f2(c[0]) + '" cy="' + f2(c[1]) + '" r="' + R + '"/></clipPath>'; });
    var shadeExpr = o.shade ? setExpr(Mk.unbrace(o.shade), names) : null;
    var REG = n === 3 ? REG3 : REG2;
    if (shadeExpr) {
      var sc = Mk.color(o.shadecolor, '#0e9f9a');
      Object.keys(REG).forEach(function (k) {
        if (!shadeExpr(REG[k])) return;
        // region = inside the sets marked 1, outside those marked 0: nested clips + white-out of excluded circles
        var inside = REG[k].map(function (v, i) { return v ? i : -1; }).filter(function (i) { return i >= 0; });
        var outside = REG[k].map(function (v, i) { return v ? -1 : i; }).filter(function (i) { return i >= 0; });
        var g = '<rect x="12" y="12" width="' + (W - 24) + '" height="' + (H - 24) + '" rx="10" fill="' + sc + '" fill-opacity="0.32"/>';
        inside.forEach(function (i) { g = '<g clip-path="url(#' + uid + i + ')">' + g + '</g>'; });
        // outside a circle = clip by "whole box minus that circle" (even-odd); nested clips intersect — no masks,
        // so Word and PDF export draw the shading exactly
        outside.forEach(function (i) {
          var cid = uid + 'o' + k + i, cx0 = C[i][0], cy0 = C[i][1];
          defs += '<clipPath id="' + cid + '"><path clip-rule="evenodd" fill-rule="evenodd" d="M0 0H' + W + 'V' + H + 'H0Z' +
            'M' + f2(cx0 - R) + ' ' + f2(cy0) + 'A' + R + ' ' + R + ' 0 1 0 ' + f2(cx0 + R) + ' ' + f2(cy0) + 'A' + R + ' ' + R + ' 0 1 0 ' + f2(cx0 - R) + ' ' + f2(cy0) + 'Z"/></clipPath>';
          g = '<g clip-path="url(#' + cid + ')">' + g + '</g>';
        });
        out += g;
      });
    }
    C.slice(0, n).forEach(function (c, i) {
      out += '<circle cx="' + f2(c[0]) + '" cy="' + f2(c[1]) + '" r="' + R + '" fill="' + cols[i] + '" fill-opacity="0.06" stroke="' + cols[i] + '" stroke-width="2.4"/>';
      var lx = n === 3 ? (i === 2 ? c[0] : c[0] + (i === 0 ? -R * 0.72 : R * 0.72)) : c[0] + (i === 0 ? -R * 0.62 : R * 0.62);
      var ly = n === 3 ? (i === 2 ? c[1] + R + fs * 1.3 : c[1] - R - 6) : c[1] - R - 8;
      out += Raster.words(lx, ly, names[i] || '', ' class="db" fill="' + cols[i] + '"', fs * 1.15, true);
    });
    // region label positions
    var POS = n === 3 ? { a: [C[0][0] - 40, C[0][1] - 24], b: [C[1][0] + 40, C[1][1] - 24], c: [C[2][0], C[2][1] + 44], ab: [cx, C[0][1] - 40], ac: [cx - 52, cy + 26], bc: [cx + 52, cy + 26], abc: [cx, cy - 4], out: [40, H - 32] }
      : { a: [C[0][0] - 44, cy], b: [C[1][0] + 44, cy], ab: [cx, cy], out: [44, H - 30] };
    Mk.commands(p.body).forEach(function (c) {
      if (c.name !== 'region' && c.name !== 'elements') return;
      var key = regionKey(c.rawOpt || c.opt.of || 'out', names, n), pos = POS[key];
      var els = Mk.list(c.args[0] || '').map(function (e) { return Raster.digits(e, eastern); });
      var perLine = key === 'out' ? 8 : 3, lines = [];
      for (var i = 0; i < els.length; i += perLine) lines.push(els.slice(i, i + perLine).join('، '));
      if (key === 'out') { pos = [pos[0] + 10, pos[1]]; }
      lines.forEach(function (ln, j) { out += Raster.words(pos[0], pos[1] + (j - (lines.length - 1) / 2) * fs * 1.3 + fs * 0.35, ln, ' class="dl"', fs, true); });
    });
    return { w: W, h: H, body: '<defs>' + defs + '</defs>' + out, fs: fs, font: o.font };
  }

  // ------------------------------------------------------------ probability tree
  function tree(p) {
    var o = p.opts, fs = Mk.evalNum(o.fontsize, 12) * 96 / 72, eastern = /east|هند/.test(String(o.digits || ''));
    var rtl = !/ltr|right|يمين/.test(String(o.direction || '')), products = !!o.products;
    var root = { children: [], label: o.root || '', depth: 0 }, stack = [{ node: root, indent: -1 }];
    String(p.body).replace(/\r/g, '').split('\n').forEach(function (line) {
      var m = line.match(/^(\s*)[-*•–]\s*(.+?)\s*(?:\[([^\]]*)\])?\s*$/);
      if (!m) return;
      var ind = m[1].replace(/\t/g, '  ').length;
      while (stack.length > 1 && stack[stack.length - 1].indent >= ind) stack.pop();
      var parent = stack[stack.length - 1].node;
      var node = { label: m[2], prob: m[3] !== undefined ? m[3].trim() : '', children: [], depth: parent.depth + 1, parent: parent };
      parent.children.push(node);
      stack.push({ node: node, indent: ind });
    });
    if (!root.children.length) throw new Error('اكتب فروع الشجرة: - اسم [الاحتمال]');
    var leaves = [], maxDepth = 0;
    (function walk(nd) { if (!nd.children.length && nd !== root) leaves.push(nd); maxDepth = Math.max(maxDepth, nd.depth); nd.children.forEach(walk); })(root);
    var colW = 150, rowH = fs * 2.6, extra = products ? 150 : 0;
    var W = 40 + maxDepth * colW + extra + 60, H = Math.max(120, leaves.length * rowH + 40);
    leaves.forEach(function (lf, i) { lf.y = 20 + (i + 0.5) * rowH; });
    (function setY(nd) { if (nd.children.length) { nd.children.forEach(setY); nd.y = (nd.children[0].y + nd.children[nd.children.length - 1].y) / 2; } })(root);
    var X = function (depth) { var x = 30 + depth * colW; return rtl ? W - x : x; };
    var out = '';
    var D = function (s) { return Raster.digits(String(s), eastern); };
    (function draw(nd) {
      nd.children.forEach(function (ch) {
        var x0 = X(nd.depth) + (rtl ? -1 : 1) * (nd === root ? 6 : 34), x1 = X(ch.depth) - (rtl ? -1 : 1) * 34;
        out += '<path d="M' + f2(x0) + ' ' + f2(nd.y) + 'L' + f2(x1) + ' ' + f2(ch.y) + '" stroke="#3d5560" stroke-width="1.6"/>';
        if (ch.prob) {
          var mx = (x0 + x1) / 2, my = (nd.y + ch.y) / 2 - 6;
          out += '<text class="ds" x="' + f2(mx) + '" y="' + f2(my) + '" text-anchor="middle" direction="ltr" style="paint-order:stroke;stroke:#fff;stroke-width:4px">' + Raster.esc(D(ch.prob)) + '</text>';
        }
        out += Raster.words(X(ch.depth), ch.y + fs * 0.4, ch.label, ' class="db"', fs * 1.15, true);
        draw(ch);
      });
    })(root);
    if (root.label) out += Raster.words(X(0), root.y + fs * 0.4, root.label, ' class="db"', fs * 1.15, true);
    else out += '<circle cx="' + f2(X(0)) + '" cy="' + f2(root.y) + '" r="4" fill="' + INK + '"/>';
    if (products) {
      leaves.forEach(function (lf) {
        var probs = [], names = [], nd = lf;
        while (nd && nd !== root) { probs.unshift(nd.prob); names.unshift(nd.label); nd = nd.parent; }
        var val = probs.reduce(function (a, pr) { var v = Mk.evalNum(pr, NaN); return a * v; }, 1);
        var txt = isFinite(val) ? D(+val.toFixed(4)) : '';
        var xp = X(maxDepth) + (rtl ? -1 : 1) * 110;
        out += '<text class="ds" x="' + f2(xp) + '" y="' + f2(lf.y + fs * 0.35) + '" text-anchor="middle" direction="ltr">' + Raster.esc(txt) + '</text>';
      });
    }
    return { w: W, h: H, body: out, fs: fs, font: o.font };
  }

  global.DiagramRender = { parse: parse, serialize: serialize, render: render, setExpr: setExpr, parseInequality: parseInequality };
})(window);
