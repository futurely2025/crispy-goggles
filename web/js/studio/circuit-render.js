/*
 * CircuitRender — electric circuit diagrams (Arabic labels) from a LaTeX-like description.
 * data = { v:1, code } ; accepts the add-in's own syntax and a circuitikz subset.
 *
 * \begin{circuit}[style=european|american, scale=1.3, digits=eastern]
 *   \battery[label=ق.د.ك, value=12 V]{(0,0)}{(0,3)}      % long plate (+) towards the second point; [flip] reverses
 *   \resistor[label=م₁, value=4 Ω]{(0,3)}{(4,3)}          \lamp{(4,3)}{(4,0)}        \switch[open]{(4,0)}{(0,0)}
 *   \ammeter  \voltmeter  \galvanometer  \ohmmeter  \capacitor  \inductor  \diode  \led  \fuse  \rheostat  \cell  \cells
 *   \ac  \source  \current  \motor  \bell  \wire  \junction{(4,3)}  \terminal{(6,3)}  \ground{(0,0)}  \text{(2,4)}{نص}
 *   \current[label=ت]{(1,3)}{(2,3)}                         % current arrow on a wire
 * \end{circuit}
 * circuitikz:  \draw (0,0) to[battery1, l=$V$] (0,3) to[R, l=$R_1$] (4,3) to[lamp] (4,0) -- (0,0);  node[circ]{}
 */
(function (global) {
  'use strict';
  var S0 = 37.7953, INK = '#1b2a30';
  var V = {
    sub: function (a, b) { return [a[0] - b[0], a[1] - b[1]]; }, add: function (a, b) { return [a[0] + b[0], a[1] + b[1]]; },
    mul: function (a, k) { return [a[0] * k, a[1] * k]; }, len: function (a) { return Math.hypot(a[0], a[1]); },
    norm: function (a) { var l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; }, perp: function (a) { return [-a[1], a[0]]; }
  };
  var ALIAS = {
    r: 'resistor', resistor: 'resistor', 'european resistor': 'resistor', 'american resistor': 'resistor', generic: 'resistor', 'مقاومة': 'resistor',
    vr: 'rheostat', pr: 'rheostat', rheostat: 'rheostat', 'variable resistor': 'rheostat', 'american potentiometer': 'rheostat', potentiometer: 'rheostat',
    battery: 'battery', battery1: 'cell', battery2: 'battery', cell: 'cell', cells: 'battery', 'بطارية': 'battery', 'عمود': 'cell',
    v: 'source', vsource: 'source', 'dc source': 'source', source: 'source', sv: 'ac', ac: 'ac', vsourcesin: 'ac', sinusoidal: 'ac',
    i: 'isource', isource: 'isource', c: 'capacitor', capacitor: 'capacitor', 'مكثف': 'capacitor', l: 'inductor', inductor: 'inductor', cute_inductor: 'inductor', 'ملف': 'inductor',
    d: 'diode', diode: 'diode', 'empty diode': 'diode', full_diode: 'diode', led: 'led', leD: 'led', lamp: 'lamp', bulb: 'lamp', 'مصباح': 'lamp',
    ammeter: 'ammeter', rmeter: 'ammeter', voltmeter: 'voltmeter', galvanometer: 'galvanometer', ohmmeter: 'ohmmeter', 'أميتر': 'ammeter', 'فولتميتر': 'voltmeter',
    switch: 'switch', spst: 'switch', nos: 'switch', ncs: 'switchc', closing_switch: 'switch', opening_switch: 'switchc', 'مفتاح': 'switch',
    fuse: 'fuse', afuse: 'fuse', 'منصهر': 'fuse', short: 'wire', wire: 'wire', motor: 'motor', m: 'motor', bell: 'bell', buzzer: 'bell', current: 'current'
  };
  function f2(v) { return (+v).toFixed(2); }
  function pt(v) { var p = Mk.point(v); if (!isFinite(p[0]) || !isFinite(p[1])) throw new Error('إحداثيات غير صحيحة: ' + v); return p; }
  function labelText(s) {
    return String(s || '').replace(/^\$|\$$/g, '').replace(/\\Omega/g, 'Ω').replace(/\\mathrm\{([^}]*)\}|\\text\{([^}]*)\}/g, '$1$2')
      .replace(/_\{?(\d)\}?/g, function (m0, d) { return String.fromCharCode(0x2080 + +d); }).replace(/\\,|\\ /g, ' ').replace(/[{}]/g, '').trim();
  }

  // ------------------------------------------------------------ parse
  function scene(code) {
    var src = String(code || '');
    var env = src.match(/\\begin\s*\{(circuit|circuitikz)\}\s*(\[[^\]]*\])?([\s\S]*?)\\end\s*\{\1\}/);
    var opts = env && env[2] ? Mk.options(env[2].slice(1, -1)) : {}, body = env ? env[3] : src;
    var sc = { opt: opts, parts: [], dots: [], terms: [], grounds: [], texts: [] };
    // own syntax
    Mk.commands(body.replace(/\\draw[\s\S]*?;/g, '')).forEach(function (c) {
      var n = c.name.toLowerCase(), a = c.args, o = c.opt;
      if (n === 'junction' || n === 'node' || n === 'dot') { sc.dots.push(pt(a[0] || c.coords[0])); return; }
      if (n === 'terminal') { sc.terms.push({ p: pt(a[0] || c.coords[0]), label: labelText(o.label || a[1] || '') }); return; }
      if (n === 'ground' || n === 'earth') { sc.grounds.push(pt(a[0] || c.coords[0])); return; }
      if (n === 'text' || n === 'label') { sc.texts.push({ p: pt(a[0]), t: labelText(a[1] || '') }); return; }
      var kind = ALIAS[n];
      if (!kind) return;
      if (a.length < 2) throw new Error('\\' + c.name + ' يحتاج نقطتين: \\' + c.name + '{(0,0)}{(2,0)} — السطر ' + c.line);
      sc.parts.push({ kind: kind, a: pt(a[0]), b: pt(a[1]), label: labelText(o.label || o.l || ''), value: labelText(o.value || o.v || ''),
        flip: !!(o.flip || o.invert), open: kind === 'switch' ? !o.closed : false, closed: kind === 'switchc' || !!o.closed, current: labelText(o.current || o.i || ''),
        color: o.color ? Mk.color(o.color) : null, cells: Mk.evalNum(o.cells, 2) | 0 });
    });
    // circuitikz \draw paths
    var dre = /\\draw\s*(\[[^\]]*\])?([\s\S]*?);/g, m;
    while ((m = dre.exec(body))) {
      var path = m[2], toks = path.match(/\(\s*[^()]*\s*\)|--|\bto\s*\[[^\]]*(?:\[[^\]]*\][^\]]*)*\]|\bnode\s*\[[^\]]*\]\s*\{[^}]*\}|\bnode\s*\{[^}]*\}|-\|\s*|\|-\s*/g) || [];
      var cur = null, pending = null;
      toks.forEach(function (t) {
        t = t.trim();
        if (t === '--') { pending = { kind: 'wire' }; return; }
        if (/^-\|/.test(t)) { pending = { kind: 'wire', elbow: 'hv' }; return; }
        if (/^\|-/.test(t)) { pending = { kind: 'wire', elbow: 'vh' }; return; }
        if (/^to/.test(t)) {
          var inner = t.replace(/^to\s*\[/, '').replace(/\]$/, ''), parts = Mk.split(inner, ','), first = parts[0].split('=');
          var nm = first[0].trim().replace(/^\*|\*$/g, ''), kind2 = ALIAS[nm.toLowerCase()] || ALIAS[nm] || 'wire';
          var po = Mk.options(parts.slice(1).join(','));
          pending = { kind: kind2, label: labelText(first[1] || po.l || po['l_'] || po['l^'] || ''), value: labelText(po.v || po.a || ''), current: labelText(po.i || po['i>'] || po['i<'] || ''),
            open: kind2 === 'switch', closed: kind2 === 'switchc', flip: !!po.invert };
          if (/-\*|\*-|\*$/.test(parts.join(','))) pending.dotEnd = true;
          return;
        }
        if (/^node/.test(t)) { if (cur && /circ/.test(t)) sc.dots.push(cur); else if (cur) { var tx = t.match(/\{([^}]*)\}/); if (tx && tx[1].trim()) sc.texts.push({ p: cur, t: labelText(tx[1]) }); } return; }
        var p = pt(t.slice(1, -1));
        if (cur && pending) {
          if (pending.elbow) {
            var mid = pending.elbow === 'hv' ? [p[0], cur[1]] : [cur[0], p[1]];
            sc.parts.push({ kind: 'wire', a: cur, b: mid }); sc.parts.push({ kind: 'wire', a: mid, b: p });
          } else sc.parts.push(Object.assign({ a: cur, b: p }, pending));
          if (pending.dotEnd) sc.dots.push(p);
        }
        cur = p; pending = null;
      });
    }
    if (!sc.parts.length) throw new Error('الدائرة فارغة: أضف \\battery و\\resistor …');
    return sc;
  }

  // ------------------------------------------------------------ render
  function render(data) {
    var code = typeof data === 'string' ? data : (data && data.code) || '';
    var sc = scene(code), o = sc.opt;
    var S = S0 * Mk.evalNum(o.scale, 1.3), american = /american|أمريك/.test(String(o.style || ''));
    var eastern = /east|هند/.test(String(o.digits || '')), ar = !/en|lat/.test(String(o.notation || 'ar'));
    var fs = Mk.evalNum(o.fontsize, 12) * 96 / 72;
    var P = function (p) { return [p[0] * S, -p[1] * S]; };
    var out = [], texts = [];
    var bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    var grow = function (q, pad) { pad = pad || 0; bb.x0 = Math.min(bb.x0, q[0] - pad); bb.y0 = Math.min(bb.y0, q[1] - pad); bb.x1 = Math.max(bb.x1, q[0] + pad); bb.y1 = Math.max(bb.y1, q[1] + pad); };
    // centroid of all parts: labels go on the outer side
    var cen = [0, 0], cnt = 0;
    sc.parts.forEach(function (p) { var a = P(p.a), b = P(p.b); cen = V.add(cen, V.add(a, b)); cnt += 2; });
    cen = V.mul(cen, 1 / Math.max(1, cnt));
    var sw = 2.1, CL = 46;                                  // component length in px

    sc.parts.forEach(function (p) {
      var A = P(p.a), B = P(p.b), d = V.sub(B, A), L = V.len(d); if (L < 1) return;
      var u = V.norm(d), n = V.perp(u);
      grow(A); grow(B);
      var col = p.color || INK;
      var mid = V.mul(V.add(A, B), 0.5);
      // outer side for labels
      var toC = V.sub(cen, mid), outN = (n[0] * toC[0] + n[1] * toC[1]) > 0 ? V.mul(n, -1) : n;
      if (p.kind === 'wire' || p.kind === 'current') {
        out.push(line(A, B, col));
        if (p.kind === 'current' || p.current) currentArrow(p.kind === 'current' ? mid : V.add(A, V.mul(u, Math.min(L * 0.2, 24))), u, p.label || p.current, outN);
        return;
      }
      var len = p.kind === 'battery' ? Math.max(CL, (p.cells || 2) * 19 + 14) : CL;
      len = Math.min(len, L * 0.8);
      var c0 = V.add(mid, V.mul(u, -len / 2)), c1 = V.add(mid, V.mul(u, len / 2));
      var T = function (x, y) { return V.add(V.add(mid, V.mul(u, x)), V.mul(n, y)); };    // local -> screen
      var pts = function (arr) { return arr.map(function (q) { var r = T(q[0], q[1]); return f2(r[0]) + ',' + f2(r[1]); }).join(' '); };
      var h = len / 2;
      var wireIn = function (x0, x1) { out.push(line(A, T(x0, 0), col) + line(T(x1, 0), B, col)); };
      var g = '';
      switch (p.kind) {
        case 'resistor': case 'rheostat':
          if (american) {
            wireIn(-h, h);
            var zz = [[-h, 0]]; for (var k = 0; k < 6; k++) zz.push([-h + (k + 0.5) * len / 6, (k % 2 ? -1 : 1) * 7]); zz.push([h, 0]);
            g += '<polyline points="' + pts(zz) + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '" stroke-linejoin="round"/>';
          } else {
            wireIn(-h + 4, h - 4);
            g += '<polygon points="' + pts([[-h + 4, -7], [h - 4, -7], [h - 4, 7], [-h + 4, 7]]) + '" fill="#fff" stroke="' + col + '" stroke-width="' + sw + '"/>';
          }
          if (p.kind === 'rheostat') { var r1 = T(-h + 2, -13), r2 = T(h - 2, 13); g += line(r1, r2, col, 1.6) + head(r2, V.norm(V.sub(r2, r1)), col, 8); }
          break;
        case 'cell': case 'battery':
          var ncell = p.kind === 'cell' ? 1 : Math.max(2, p.cells || 2), gap = 9, pair = 19, tot = ncell * pair - (pair - gap) + 4;
          var sgn = p.flip ? -1 : 1, x = -tot / 2;
          wireIn(-tot / 2, tot / 2);
          for (var c = 0; c < ncell; c++) {
            var xs = sgn > 0 ? x : -x - 3;
            // short thick (−) then long thin (+) towards B
            var neg = sgn > 0 ? x + 2 : -(x + 2), pos = sgn > 0 ? x + 2 + gap : -(x + 2 + gap);
            g += line(T(neg, -7), T(neg, 7), col, 4.2) + line(T(pos, -15), T(pos, 15), col, 2);
            if (c < ncell - 1) g += line(T(pos, 0), T(sgn > 0 ? pos + (pair - gap) : pos - (pair - gap), 0), col, 1.4, true);
            x += pair;
          }
          var plus = T(sgn * (tot / 2 + 3), -17), minus = T(-sgn * (tot / 2 + 3), -17);
          texts.push({ p: plus, t: '+', cls: 'sm' }); texts.push({ p: minus, t: '−', cls: 'sm' });
          break;
        case 'capacitor':
          wireIn(-5, 5); g += line(T(-5, -14), T(-5, 14), col, 2.6) + line(T(5, -14), T(5, 14), col, 2.6); break;
        case 'inductor':
          wireIn(-h, h);
          var arcs = '', loops = 4, lw = len / loops;
          for (var k2 = 0; k2 < loops; k2++) { var s = T(-h + k2 * lw, 0), e = T(-h + (k2 + 1) * lw, 0); arcs += (k2 ? '' : 'M' + f2(s[0]) + ' ' + f2(s[1])) + 'A' + f2(lw / 2) + ' ' + f2(lw / 2) + ' 0 0 ' + (n[1] > 0 || n[0] < 0 ? 1 : 0) + ' ' + f2(e[0]) + ' ' + f2(e[1]); }
          g += '<path d="' + arcs + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '"/>';
          break;
        case 'diode': case 'led':
          wireIn(-10, 10);
          var sd = p.flip ? -1 : 1;
          g += '<polygon points="' + pts([[-10 * sd, -10], [-10 * sd, 10], [9 * sd, 0]]) + '" fill="' + (p.kind === 'led' ? '#fff' : col) + '" stroke="' + col + '" stroke-width="1.8" stroke-linejoin="round"/>' + line(T(10 * sd, -10), T(10 * sd, 10), col, 2.4);
          if (p.kind === 'led') { var l1 = T(0, -14), l2 = T(8, -24), l3 = T(6, -12), l4 = T(14, -22); g += line(l1, l2, '#e07a00', 1.4) + head(l2, V.norm(V.sub(l2, l1)), '#e07a00', 6) + line(l3, l4, '#e07a00', 1.4) + head(l4, V.norm(V.sub(l4, l3)), '#e07a00', 6); }
          break;
        case 'lamp':
          wireIn(-13, 13);
          var lc = mid; g += '<circle cx="' + f2(lc[0]) + '" cy="' + f2(lc[1]) + '" r="13" fill="#fffbe6" stroke="' + col + '" stroke-width="' + sw + '"/>';
          var dg = 9.2; g += line(T(-dg, -dg), T(dg, dg), col, 1.6) + line(T(-dg, dg), T(dg, -dg), col, 1.6);
          break;
        case 'ammeter': case 'voltmeter': case 'galvanometer': case 'ohmmeter': case 'motor': case 'source': case 'ac': case 'isource': case 'bell':
          wireIn(-13, 13);
          g += '<circle cx="' + f2(mid[0]) + '" cy="' + f2(mid[1]) + '" r="13" fill="#fff" stroke="' + col + '" stroke-width="' + sw + '"/>';
          var letter = { ammeter: 'A', voltmeter: 'V', galvanometer: 'G', ohmmeter: 'Ω', motor: 'M', bell: '♪' }[p.kind];
          if (letter) texts.push({ p: [mid[0], mid[1] + fs * 0.36], t: letter, cls: 'mt', raw: true });
          if (p.kind === 'ac') { var w1 = T(-8, 0), w2 = T(8, 0); g += '<path d="M' + f2(w1[0]) + ' ' + f2(w1[1]) + 'Q' + f2(T(-4, -9)[0]) + ' ' + f2(T(-4, -9)[1]) + ' ' + f2(mid[0]) + ' ' + f2(mid[1]) + 'T' + f2(w2[0]) + ' ' + f2(w2[1]) + '" fill="none" stroke="' + col + '" stroke-width="1.6"/>'; }
          if (p.kind === 'source') { texts.push({ p: T(p.flip ? -6 : 6, 3.5), t: '+', cls: 'sm' }); texts.push({ p: T(p.flip ? 6 : -6, 3.5), t: '−', cls: 'sm' }); }
          if (p.kind === 'isource') { var i1 = T(-8, 0), i2 = T(8, 0); g += line(i1, V.sub(i2, V.mul(u, 5)), col, 1.6) + head(i2, u, col, 7); }
          break;
        case 'switch': case 'switchc':
          var sa = T(-h + 6, 0), sb = T(h - 6, 0);
          out.push(line(A, sa, col) + line(sb, B, col));
          var closed = p.closed && !p.open;
          var lever = closed ? sb : T(h - 8, -16);
          g += line(sa, lever, col, 2.2) + '<circle cx="' + f2(sa[0]) + '" cy="' + f2(sa[1]) + '" r="3.2" fill="#fff" stroke="' + col + '" stroke-width="1.6"/><circle cx="' + f2(sb[0]) + '" cy="' + f2(sb[1]) + '" r="3.2" fill="#fff" stroke="' + col + '" stroke-width="1.6"/>';
          break;
        case 'fuse':
          wireIn(-h + 6, h - 6);
          g += '<polygon points="' + pts([[-h + 6, -6], [h - 6, -6], [h - 6, 6], [-h + 6, 6]]) + '" fill="#fff" stroke="' + col + '" stroke-width="1.8"/>' + line(T(-h + 6, 0), T(h - 6, 0), col, 1.3);
          break;
        default: out.push(line(A, B, col));
      }
      out.push(g);
      grow(T(0, 18)); grow(T(0, -18));
      var offFor = function (t, dirN) { var w = String(t).length * fs * 0.52; return 22 + Math.abs(dirN[0]) * w / 2 + Math.abs(dirN[1]) * fs * 0.3; };
      if (p.label) { var lp = V.add(mid, V.mul(outN, offFor(p.label, outN))); texts.push({ p: [lp[0], lp[1] + fs * 0.36], t: p.label }); grow(lp, fs + String(p.label).length * fs * 0.3); }
      if (p.value) { var inN = V.mul(outN, -1), vp = V.add(mid, V.mul(inN, offFor(p.value, inN))); texts.push({ p: [vp[0], vp[1] + fs * 0.36], t: p.value, cls: 'val' }); grow(vp, fs + String(p.value).length * fs * 0.3); }
      if (p.current) currentArrow(V.add(c1, V.mul(u, Math.min(22, (L - len) / 4))), u, p.current, outN);
    });
    sc.dots.forEach(function (d) { var q = P(d); grow(q, 4); out.push('<circle cx="' + f2(q[0]) + '" cy="' + f2(q[1]) + '" r="3.8" fill="' + INK + '"/>'); });
    sc.terms.forEach(function (t) { var q = P(t.p); grow(q, 6); out.push('<circle cx="' + f2(q[0]) + '" cy="' + f2(q[1]) + '" r="4" fill="#fff" stroke="' + INK + '" stroke-width="1.8"/>'); if (t.label) texts.push({ p: [q[0], q[1] - 10], t: t.label }); });
    sc.grounds.forEach(function (gp) {
      var q = P(gp); grow([q[0] - 12, q[1] + 22]); grow([q[0] + 12, q[1]]);
      out.push(line(q, [q[0], q[1] + 10], INK) + line([q[0] - 12, q[1] + 10], [q[0] + 12, q[1] + 10], INK, 2) + line([q[0] - 8, q[1] + 15], [q[0] + 8, q[1] + 15], INK, 2) + line([q[0] - 4, q[1] + 20], [q[0] + 4, q[1] + 20], INK, 2));
    });
    sc.texts.forEach(function (t) { var q = P(t.p); grow(q, fs * 2); texts.push({ p: [q[0], q[1] + fs * 0.36], t: t.t }); });

    function line(a, b, col, w, dash) { return '<path d="M' + f2(a[0]) + ' ' + f2(a[1]) + 'L' + f2(b[0]) + ' ' + f2(b[1]) + '" stroke="' + (col || INK) + '" stroke-width="' + (w || sw) + '"' + (dash ? ' stroke-dasharray="2 3"' : '') + ' stroke-linecap="round" fill="none"/>'; }
    function head(tip, dir, col, size) {
      var base = V.sub(tip, V.mul(dir, size)), pp = V.mul(V.perp(dir), size * 0.45);
      return '<path d="M' + f2(tip[0]) + ' ' + f2(tip[1]) + 'L' + f2(base[0] + pp[0]) + ' ' + f2(base[1] + pp[1]) + 'L' + f2(base[0] - pp[0]) + ' ' + f2(base[1] - pp[1]) + 'Z" fill="' + col + '"/>';
    }
    function currentArrow(at, u, lab, outN) {
      out.push(head(V.add(at, V.mul(u, 6)), u, '#c2352b', 10));
      if (lab) { var q = V.add(at, V.mul(outN, 15)); texts.push({ p: [q[0], q[1] + fs * 0.36], t: lab, color: '#c2352b', cls: 'sm' }); }
    }

    if (!isFinite(bb.x0)) bb = { x0: -50, y0: -50, x1: 50, y1: 50 };
    var M = 16, box = [bb.x0 - M, bb.y0 - M, bb.x1 - bb.x0 + 2 * M, bb.y1 - bb.y0 + 2 * M];
    var font = String(o.font || 'Amiri');
    return Raster.fontCss([font], true).then(function (css) {
      var tx = texts.map(function (t) {
        var s = t.raw ? t.t : Raster.digits(t.t, eastern);
        return Raster.words(t.p[0], t.p[1], s, ' class="' + (t.cls || 'cl') + '"' + (t.color ? ' fill="' + t.color + '"' : ''), fs * (t.cls === 'sm' ? 0.95 : 1.1), ar);
      }).join('');
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + f2(box[2]) + '" height="' + f2(box[3]) + '" viewBox="' + box.map(f2).join(' ') + '">' +
        '<defs><style>' + css + ' .cl,.val,.sm,.mt{font-family:"' + font + '","Times New Roman",serif;fill:' + INK + ';paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}' +
        ' .cl{font-size:' + f2(fs * 1.1) + 'px;font-weight:700} .val{font-size:' + f2(fs) + 'px;fill:#3d5560} .sm{font-size:' + f2(fs * 0.95) + 'px;font-weight:700} .mt{font-family:"Times New Roman",serif;font-size:' + f2(fs * 1.05) + 'px;font-weight:700;stroke:none}</style></defs>' +
        '<rect x="' + f2(box[0]) + '" y="' + f2(box[1]) + '" width="' + f2(box[2]) + '" height="' + f2(box[3]) + '" fill="#fff"/>' + out.join('') + tx + '</svg>';
      return { svg: svg, w: box[2], h: box[3] };
    });
  }

  function parse(opts, body) {
    var code = '\\begin{circuit}' + (opts ? '[' + opts + ']' : '') + '\n' + String(body || '').replace(/^\n+|\s+$/g, '') + '\n\\end{circuit}';
    scene(code);
    return { v: 1, code: code };
  }
  function serialize(d) { return String(d && d.code || '').trim(); }

  // ready-made circuits for the studio
  function n(v) { return String(+(+v).toFixed(2)); }
  var TEMPLATES = {
    series: { t: 'مقاومتان على التوالي|Two resistors in series', code: function () { return ['\\begin{circuit}', '  \\battery[label=ق.د.ك]{(0,0)}{(0,3)}', '  \\resistor[label=م₁]{(0,3)}{(3,3)}', '  \\resistor[label=م₂]{(3,3)}{(6,3)}', '  \\ammeter{(6,3)}{(6,0)}', '  \\switch{(6,0)}{(0,0)}', '  \\current[label=ت]{(0.6,3)}{(1,3)}', '\\end{circuit}'].join('\n'); } },
    parallel: { t: 'مقاومتان على التوازي|Two resistors in parallel', code: function () { return ['\\begin{circuit}', '  \\battery[label=ق.د.ك]{(0,0)}{(0,3)}', '  \\wire{(0,3)}{(2,3)}', '  \\resistor[label=م₁]{(2,3)}{(5,3)}', '  \\wire{(5,3)}{(7,3)}', '  \\wire{(2,3)}{(2,1.5)}', '  \\resistor[label=م₂]{(2,1.5)}{(5,1.5)}', '  \\wire{(5,1.5)}{(5,3)}', '  \\ammeter{(7,3)}{(7,0)}', '  \\wire{(7,0)}{(0,0)}', '  \\junction{(2,3)}', '  \\junction{(5,3)}', '\\end{circuit}'].join('\n'); } },
    meters: { t: 'قياس الجهد والتيار|Voltmeter and ammeter', code: function () { return ['\\begin{circuit}', '  \\battery{(0,0)}{(0,3)}', '  \\ammeter{(0,3)}{(3,3)}', '  \\resistor[label=م]{(3,3)}{(6,3)}', '  \\wire{(6,3)}{(6,0)}', '  \\switch{(6,0)}{(0,0)}', '  \\wire{(3,3)}{(3,4.6)}', '  \\voltmeter{(3,4.6)}{(6,4.6)}', '  \\wire{(6,4.6)}{(6,3)}', '  \\junction{(3,3)}', '  \\junction{(6,3)}', '\\end{circuit}'].join('\n'); } },
    lamps: { t: 'مصابيح ومفتاح|Lamps and a switch', code: function () { return ['\\begin{circuit}', '  \\cell{(0,0)}{(0,3)}', '  \\lamp[label=م₁]{(0,3)}{(3,3)}', '  \\lamp[label=م₂]{(3,3)}{(6,3)}', '  \\wire{(6,3)}{(6,0)}', '  \\switch[open]{(6,0)}{(0,0)}', '\\end{circuit}'].join('\n'); } },
    rc: { t: 'شحن مكثف|Charging a capacitor', code: function () { return ['\\begin{circuit}', '  \\battery{(0,0)}{(0,3)}', '  \\switch{(0,3)}{(2,3)}', '  \\resistor[label=م]{(2,3)}{(5,3)}', '  \\capacitor[label=س]{(5,3)}{(5,0)}', '  \\wire{(5,0)}{(0,0)}', '\\end{circuit}'].join('\n'); } },
    rheostat: { t: 'مقاومة متغيرة ومنصهر|Rheostat and fuse', code: function () { return ['\\begin{circuit}', '  \\battery{(0,0)}{(0,3)}', '  \\fuse{(0,3)}{(3,3)}', '  \\rheostat[label=ريوستات]{(3,3)}{(6,3)}', '  \\lamp{(6,3)}{(6,0)}', '  \\wire{(6,0)}{(0,0)}', '\\end{circuit}'].join('\n'); } },
    diode: { t: 'دايود ومصباح LED|Diode and LED', code: function () { return ['\\begin{circuit}', '  \\battery{(0,0)}{(0,3)}', '  \\resistor[label=م]{(0,3)}{(3,3)}', '  \\led{(3,3)}{(6,3)}', '  \\diode{(6,3)}{(6,0)}', '  \\wire{(6,0)}{(0,0)}', '\\end{circuit}'].join('\n'); } },
    ac: { t: 'دائرة تيار متردد RLC|AC RLC circuit', code: function () { return ['\\begin{circuit}', '  \\ac[label=م.ت]{(0,0)}{(0,3)}', '  \\resistor[label=م]{(0,3)}{(3,3)}', '  \\inductor[label=ل]{(3,3)}{(6,3)}', '  \\capacitor[label=س]{(6,3)}{(6,0)}', '  \\wire{(6,0)}{(0,0)}', '\\end{circuit}'].join('\n'); } }
  };
  global.CircuitRender = { render: render, parse: parse, serialize: serialize, scene: scene, TEMPLATES: TEMPLATES };
})(window);
