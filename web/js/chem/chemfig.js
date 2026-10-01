/*
 * ChemFig — draws structural formulas written in chemfig syntax (a practical subset), no LaTeX needed.
 *   \chemfig{H_3C-CH_2-OH}   \chemfig{*6(=-=-=-)}   \chemfig{**6(------)}   \chemfig{CH_3-C(=[1]O)-[7]OH}
 *   \chemfig[name=حمض الإيثانويك]{C(-[2]H)(-[6]H)(-[4]H)-C(=[1]O)-[7]O-H}
 * supports: atoms with _ and ^ (H_2O, SO_4^{2-}), bonds - = ~ > < >: <:, bond options [angle,length] with
 * n (×45°), :abs, ::rel, branches ( ), rings *n( ) and aromatic **n( ), ring closures ?, \chemname-like caption via [name=…].
 * data = { v:1, code, name }
 */
(function (global) {
  'use strict';
  var D2R = Math.PI / 180, INK = '#1b2a30';

  // ------------------------------------------------------------ parser -> graph {atoms:[{x,y,label}], bonds:[{a,b,type,inRing}] , rings}
  function build(src) {
    var s = String(src || '').replace(/\s+/g, ' ').trim();
    var atoms = [], bonds = [], rings = [], hooks = {};
    var i = 0;
    function peek() { return s[i]; }
    function addAtom(label, x, y) { atoms.push({ label: label, x: x, y: y }); return atoms.length - 1; }
    function readAtom() {
      var out = '';
      while (i < s.length) {
        var c = s[i];
        if (/[-=~()<>*?,]/.test(c) && !(c === '-' && out && /[\^]$/.test(out))) break;
        if (c === '{') { var d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (!d) break; } } out += s.slice(i, j + 1); i = j + 1; continue; }
        if (c === '^') { out += c; i++; if (s[i] === '{') continue; out += s[i] || ''; i++; if (s[i] === '-' || s[i] === '+') { out += s[i]; i++; } continue; }
        if (c === ' ') { i++; continue; }
        out += c; i++;
      }
      return out.replace(/^\{\}$/, '');
    }
    function readBond() {
      var c = s[i], type = null;
      if (c === '-') type = 1; else if (c === '=') type = 2; else if (c === '~') type = 3;
      else if (c === '>' || c === '<') { type = c; if (s[i + 1] === ':' || s[i + 1] === '|') { type += s[i + 1]; i++; } }
      else return null;
      i++;
      var opt = null;
      if (s[i] === '[') { var j = s.indexOf(']', i); opt = s.slice(i + 1, j); i = j + 1; }
      return { type: type, opt: opt };
    }
    function angleFrom(opt, prev) {
      if (!opt) return { a: prev, len: 1 };
      var parts = opt.split(','), a = prev, p0 = (parts[0] || '').trim(), len = parts[1] ? parseFloat(parts[1]) : 1;
      if (/^::/.test(p0)) a = prev + parseFloat(p0.slice(2));
      else if (/^:/.test(p0)) a = parseFloat(p0.slice(1));
      else if (p0 !== '') a = parseFloat(p0) * 45;
      return { a: isFinite(a) ? a : prev, len: isFinite(len) && len > 0 ? len : 1 };
    }
    function hook(idx) {
      while (s[i] === '?') {
        i++;
        var name = 'a';
        if (s[i] === '[') { var j = s.indexOf(']', i); name = s.slice(i + 1, j).split(',')[0]; i = j + 1; }
        if (hooks[name] !== undefined) { bonds.push({ a: hooks[name], b: idx, type: 1 }); delete hooks[name]; }
        else hooks[name] = idx;
      }
    }
    // chain: starts at atom index `from` with current angle; returns nothing
    function chain(from, ang, depth) {
      var cur = from;
      for (;;) {
        if (i >= s.length) return;
        var c = s[i];
        if (c === ')') return;
        if (c === '(') { i++; branch(cur, ang); continue; }
        if (c === '*') { ring(cur, ang); continue; }
        var b = readBond();
        if (!b) { i++; continue; }
        var af = angleFrom(b.opt, ang);
        ang = af.a;
        var p = atoms[cur], nx = p.x + Math.cos(ang * D2R) * af.len, ny = p.y + Math.sin(ang * D2R) * af.len;
        if (s[i] === '*') {                     // bond into a ring: the ring starts at a new (empty) vertex
          var v = addAtom('', nx, ny); bonds.push({ a: cur, b: v, type: b.type }); cur = v; ring(cur, ang); continue;
        }
        var lab = readAtom();
        var nid = addAtom(lab, nx, ny);
        bonds.push({ a: cur, b: nid, type: b.type });
        cur = nid;
        hook(cur);
      }
    }
    function branch(from, ang) {
      chain(from, ang, 1);
      if (s[i] === ')') i++;
    }
    function ring(start, ang) {
      var arom = false;
      i++; if (s[i] === '*') { arom = true; i++; }
      var m = /^(\d+)/.exec(s.slice(i)); if (!m) return;
      var n = +m[1]; i += m[1].length;
      if (s[i] !== '(') return;
      i++;
      var step = 360 / n, a = ang - 90 + step / 2, cur = start, verts = [start];
      var k = 0;
      while (i < s.length && s[i] !== ')') {
        if (s[i] === '(') {                       // branch at the current ring vertex: points outward
          i++;
          var center = ringCenterGuess(verts, n, start, ang);
          var out = Math.atan2(atoms[cur].y - center[1], atoms[cur].x - center[0]) / D2R;
          branch(cur, out);
          continue;
        }
        var b = readAtomOrBond();
        if (!b) { i++; continue; }
        if (b.kind === 'atom') { atoms[cur].label = b.label; hook(cur); continue; }
        var ang2 = b.opt ? angleFrom(b.opt, a).a : a;
        var p = atoms[cur], nid;
        if (k === n - 1) nid = start;
        else { nid = addAtom('', p.x + Math.cos(ang2 * D2R), p.y + Math.sin(ang2 * D2R)); verts.push(nid); }
        bonds.push({ a: cur, b: nid, type: b.type, ring: rings.length });
        cur = nid; k++; a += step;
        var lab = readAtom(); if (lab && nid !== start) atoms[nid].label = lab; else if (lab && nid === start && !atoms[start].label) atoms[start].label = lab;
        hook(cur);
      }
      if (s[i] === ')') i++;
      // complete a ring given with fewer bonds? chemfig leaves it open — keep that behaviour
      var cx = 0, cy = 0; verts.forEach(function (v) { cx += atoms[v].x; cy += atoms[v].y; });
      rings.push({ verts: verts, n: n, arom: arom, c: [cx / verts.length, cy / verts.length] });
    }
    function ringCenterGuess(verts, n, start, ang) {
      var R = 1 / (2 * Math.sin(Math.PI / n));
      return [atoms[start].x + Math.cos(ang * D2R) * R, atoms[start].y + Math.sin(ang * D2R) * R];
    }
    function readAtomOrBond() {
      var b = readBond(); if (b) return { kind: 'bond', type: b.type, opt: b.opt };
      var l = readAtom(); if (l) return { kind: 'atom', label: l };
      return null;
    }
    var first = s[0] === '*' ? '' : readAtom();
    var root = addAtom(first, 0, 0);
    hook(root);
    chain(root, 0, 0);
    // ring bonds: mark which side is inside
    bonds.forEach(function (b) { if (b.ring !== undefined) b.center = rings[b.ring].c; });
    return { atoms: atoms, bonds: bonds, rings: rings };
  }

  // ------------------------------------------------------------ label -> svg text (subscripts/superscripts)
  function labelSvg(lab, x, y, fs, color) {
    var t = String(lab).replace(/\\,|\\ /g, ' '), out = '', i = 0;
    while (i < t.length) {
      var c = t[i];
      if (c === '_' || c === '^') {
        var arg = '';
        if (t[i + 1] === '{') { var j = t.indexOf('}', i + 2); arg = t.slice(i + 2, j < 0 ? t.length : j); i = (j < 0 ? t.length : j + 1); }
        else { arg = t[i + 1] || ''; i += 2; if (c === '^' && /[+-]/.test(t[i] || '')) { arg += t[i]; i++; } }
        arg = arg.replace(/-/g, '−');
        out += '<tspan baseline-shift="' + (c === '_' ? 'sub' : 'super') + '" font-size="' + (fs * 0.68).toFixed(1) + 'px">' + esc(arg) + '</tspan>';
        continue;
      }
      if (c === '{' || c === '}') { i++; continue; }
      if (c === '\\') { var m = /^\\([a-zA-Z]+)/.exec(t.slice(i)); i += m ? m[0].length : 1; continue; }
      out += '<tspan>' + esc(c) + '</tspan>'; i++;
    }
    return '<text x="' + x.toFixed(2) + '" y="' + (y + fs * 0.36).toFixed(2) + '" text-anchor="middle" direction="ltr" font-size="' + fs.toFixed(1) + 'px" fill="' + color + '">' + out + '</text>';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function plainLen(lab) { return String(lab).replace(/_\{[^}]*\}|\^\{[^}]*\}/g, 'x').replace(/[_^{}\\]/g, '').length; }
  // label metrics: widths of the glyph runs and the "anchor" atom (first heavy atom, else first letter)
  function metrics(lab, fs) {
    var t = String(lab), runs = [], i = 0;
    while (i < t.length) {
      var c = t[i];
      if (c === '_' || c === '^') {
        var arg = '';
        if (t[i + 1] === '{') { var j = t.indexOf('}', i + 2); arg = t.slice(i + 2, j < 0 ? t.length : j); i = (j < 0 ? t.length : j + 1); }
        else { arg = t[i + 1] || ''; i += 2; if (c === '^' && /[+-]/.test(t[i] || '')) { arg += t[i]; i++; } }
        runs.push({ w: arg.length * fs * 0.4, sub: true }); continue;
      }
      if (/[{}\\]/.test(c)) { i++; continue; }
      runs.push({ w: (/[A-Z]/.test(c) ? 0.68 : /[a-z]/.test(c) ? 0.46 : 0.5) * fs, ch: c }); i++;
    }
    var total = runs.reduce(function (a, r) { return a + r.w; }, 0);
    var k = -1;
    for (var q = 0; q < runs.length; q++) { if (runs[q].ch && /[A-Z]/.test(runs[q].ch) && runs[q].ch !== 'H') { k = q; break; } }
    if (k < 0) for (var q2 = 0; q2 < runs.length; q2++) if (runs[q2].ch) { k = q2; break; }
    var before = 0; for (var q3 = 0; q3 < k; q3++) before += runs[q3].w;
    var aw = k >= 0 ? runs[k].w : fs * 0.5;
    return { total: total, left: before + aw / 2, right: total - before - aw / 2 };
  }

  var ELEM_COLORS = { O: '#c2352b', N: '#1f5fbf', S: '#b8860b', Cl: '#0e9f9a', Br: '#a0522d', F: '#2e8b3a', P: '#e07a00', I: '#7b3fb3' };

  function render(data) {
    var code = typeof data === 'string' ? data : data.code;
    var m = String(code).match(/\\chemfig\s*(?:\[([^\]]*)\])?\s*\{([\s\S]*)\}\s*$/);
    var body = m ? m[2] : String(code), o = Mk.options(m && m[1] ? m[1] : '');
    var name = (data && data.name) || o.name || '';
    var g = build(body);
    var BL = 40 * Mk.evalNum(o.scale || (data && data.scale), 1), fs = 16 * Mk.evalNum(o.fontscale, 1);
    var colorful = !/mono|black|أسود/.test(String(o.color || (data && data.theme) || ''));
    var P = function (a) { return [a.x * BL, -a.y * BL]; };
    var out = [];
    var bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    var grow = function (x, y) { bb.x0 = Math.min(bb.x0, x); bb.y0 = Math.min(bb.y0, y); bb.x1 = Math.max(bb.x1, x); bb.y1 = Math.max(bb.y1, y); };
    g.atoms.forEach(function (a) { if (a.label) a.m = metrics(a.label, fs); });
    var half = function (a) { if (!a.label) return 0; return Math.max(a.m.left, a.m.right); };
    g.bonds.forEach(function (b) {
      var A = g.atoms[b.a], B = g.atoms[b.b], pa = P(A), pb = P(B);
      var dx = pb[0] - pa[0], dy = pb[1] - pa[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      // shorten at labelled atoms (ellipse-ish: wider horizontally)
      // distance from an atom centre to the edge of its label along direction (dx,dy)
      var cut = function (a, dx2, dy2) {
        if (!a.label) return 0;
        var ex = dx2 < 0 ? a.m.left : a.m.right, ey = fs * 0.52;
        ex = Math.max(ex, fs * 0.36);
        return Math.min(L * 0.46, 1 / Math.sqrt((dx2 * dx2) / (ex * ex) + (dy2 * dy2) / (ey * ey)) + 2);
      };
      var s0 = [pa[0] + ux * cut(A, ux, uy), pa[1] + uy * cut(A, ux, uy)], s1 = [pb[0] - ux * cut(B, -ux, -uy), pb[1] - uy * cut(B, -ux, -uy)];
      var nx = -uy, ny = ux, line = function (p, q, w) { return '<path d="M' + p[0].toFixed(2) + ' ' + p[1].toFixed(2) + 'L' + q[0].toFixed(2) + ' ' + q[1].toFixed(2) + '" stroke="' + INK + '" stroke-width="' + (w || 1.6) + '" stroke-linecap="round"/>'; };
      var off = function (p, k) { return [p[0] + nx * k, p[1] + ny * k]; };
      grow(pa[0], pa[1]); grow(pb[0], pb[1]);
      var t = b.type;
      if (t === 1) out.push(line(s0, s1));
      else if (t === 2) {
        if (b.center) {                                          // ring double bond: second line inside the ring
          var cx = b.center[0] * BL, cy = -b.center[1] * BL, mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2;
          var sgn = ((cx - mx) * nx + (cy - my) * ny) > 0 ? 1 : -1, sh = 0.16 * L;
          out.push(line(s0, s1));
          out.push(line(off([s0[0] + ux * sh, s0[1] + uy * sh], 4.2 * sgn), off([s1[0] - ux * sh, s1[1] - uy * sh], 4.2 * sgn)));
        } else if (!A.label || !B.label) {
          out.push(line(off(s0, 2.3), off(s1, 2.3))); out.push(line(off(s0, -2.3), off(s1, -2.3)));
        } else { out.push(line(off(s0, 2.3), off(s1, 2.3))); out.push(line(off(s0, -2.3), off(s1, -2.3))); }
      } else if (t === 3) { out.push(line(s0, s1)); out.push(line(off(s0, 3.6), off(s1, 3.6))); out.push(line(off(s0, -3.6), off(s1, -3.6))); }
      else if (/^[<>]/.test(t)) {
        var wideAtEnd = t[0] === '>', p = wideAtEnd ? s0 : s1, q = wideAtEnd ? s1 : s0, w = 3.4;
        if (/:/.test(t)) {
          var dd = []; for (var k = 1; k <= 7; k++) { var f = k / 7, c0 = [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]; dd.push(line(off(c0, w * f), off(c0, -w * f), 1.2)); }
          out.push(dd.join(''));
        } else out.push('<path d="M' + p[0].toFixed(2) + ' ' + p[1].toFixed(2) + 'L' + off(q, w)[0].toFixed(2) + ' ' + off(q, w)[1].toFixed(2) + 'L' + off(q, -w)[0].toFixed(2) + ' ' + off(q, -w)[1].toFixed(2) + 'Z" fill="' + INK + '"/>');
      }
    });
    g.rings.forEach(function (r) {
      if (!r.arom) return;
      var cx = r.c[0] * BL, cy = -r.c[1] * BL, rr = BL / (2 * Math.tan(Math.PI / r.n)) * 0.62;
      out.push('<circle cx="' + cx.toFixed(2) + '" cy="' + cy.toFixed(2) + '" r="' + rr.toFixed(2) + '" fill="none" stroke="' + INK + '" stroke-width="1.5"/>');
    });
    g.atoms.forEach(function (a) {
      if (!a.label) return;
      var p = P(a), el = (String(a.label).match(/^(Cl|Br|[A-Z])/) || [''])[0];
      var col = colorful && ELEM_COLORS[el] ? ELEM_COLORS[el] : INK;
      if (colorful && !ELEM_COLORS[el]) { var el2 = (String(a.label).replace(/^H_?\d*/, '').match(/^(Cl|Br|[A-Z])/) || [''])[0]; if (ELEM_COLORS[el2]) col = ELEM_COLORS[el2]; }
      var x0 = p[0] - a.m.left;                           // anchor atom centred on the node
      out.push(labelSvg(a.label, x0 + a.m.total / 2, p[1], fs, col));
      grow(x0, p[1] - fs * 0.7); grow(x0 + a.m.total, p[1] + fs * 0.7);
    });
    if (!isFinite(bb.x0)) bb = { x0: -20, y0: -20, x1: 20, y1: 20 };
    var M = 12, W = bb.x1 - bb.x0 + 2 * M, H = bb.y1 - bb.y0 + 2 * M, capH = name ? fs * 2 : 0;
    var CW = Math.max(W, name ? name.length * fs * 0.5 + 20 : 0), ox = (CW - W) / 2;
    return Raster.fontCss(['Amiri'], true).then(function (css) {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + CW.toFixed(2) + '" height="' + (H + capH).toFixed(2) + '" viewBox="0 0 ' + CW.toFixed(2) + ' ' + (H + capH).toFixed(2) + '">' +
        '<defs><style>' + css + ' text{font-family:"Times New Roman",serif} .cap{font-family:"Amiri",serif;font-size:' + (fs * 1.05).toFixed(1) + 'px;font-weight:700;fill:' + INK + '}</style></defs>' +
        '<rect width="100%" height="100%" fill="#fff"/><g transform="translate(' + (ox + M - bb.x0).toFixed(2) + ',' + (M - bb.y0).toFixed(2) + ')">' + out.join('') + '</g>' +
        (name ? Raster.words(CW / 2, H + fs * 1.2, name, ' class="cap"', fs * 1.05, /[؀-ۿ]/.test(name)) : '') + '</svg>';
      return { svg: svg, w: CW, h: H + capH };
    });
  }
  function parse(opts, body) {
    var o = Mk.options(opts || '');
    build(body);                                  // throws on nothing useful
    return { v: 1, code: '\\chemfig' + (opts ? '[' + opts + ']' : '') + '{' + body + '}', name: o.name || '' };
  }
  function serialize(d) { return String(d.code || '').trim(); }
  global.ChemFig = { build: build, render: render, parse: parse, serialize: serialize };
})(window);
