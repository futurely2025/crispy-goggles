/* PdfShapes — the shape engine of the PDF studio.
 *  · object model  { t:'shape', k:<id in PdfShapeLib>, x,y,w,h,rot,fx,fy, adj[], fill{}, line{}, shadow{}, text{} }  (box shapes)
 *                  { t:'shape', k:'arrow'…, x1,y1,x2,y2 | pts[], adj[], a0,a1, line{} }                            (lines & connectors)
 *  · rendering to SVG (preview and PDF export share it): fills (solid, linear/radial gradient, hatch), outline (dash, caps,
 *    joins), arrow heads, shadow, rotation/flip, text inside the shape
 *  · tools: gallery with categories + search, draw by dragging (Shift = proportional, Alt = from the centre), multi-click
 *    polylines/polygons/revision clouds, selection handles (8 sizes, rotation, yellow adjust handles, line end points)
 *  · inspector: fill, line, effects, size/position/rotation, text, arrange, quick styles, default style. */
(function () {
  'use strict';
  var P = window.__pdf, S = P.S, Lib = window.PdfShapeLib, $ = function (id) { return document.getElementById(id); };
  var SVGNS = 'http://www.w3.org/2000/svg';
  function f2(n) { return Math.round(n * 100) / 100; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function rad(d) { return d * Math.PI / 180; }

  // ------------------------------------------------------------ defaults
  var DEF = {
    fill: { m: 'solid', c: '#9cc9d2', c2: '#ffffff', ang: 90, op: 1, hatch: 'diag' },
    line: { c: '#12525c', w: 1.5, dash: 'solid', cap: 'round', join: 'round', op: 1 },
    shadow: { on: false, c: '#000000', op: 0.35, dx: 3, dy: 3, blur: 3 },
    text: { size: 14, color: '#1b2a30', bold: false, italic: false, align: 'center', valign: 'middle', font: 'Amiri', lh: 1.3 },
    sz: 1
  };
  var KEY = 'armath.pdf.shapeStyle';
  var style = clone(DEF);
  try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) { ['fill', 'line', 'shadow', 'text'].forEach(function (k) { style[k] = Object.assign({}, DEF[k], sv[k] || {}); }); } } catch (e) { /* ignore */ }
  function saveStyle() { try { localStorage.setItem(KEY, JSON.stringify(style)); } catch (e) { /* ignore */ } }
  function F(o) { return Object.assign({}, DEF.fill, o.fill || {}); }
  function Ln(o) { return Object.assign({}, DEF.line, o.line || {}); }
  function Sh(o) { return Object.assign({}, DEF.shadow, o.shadow || {}); }
  function Tx(o) { return Object.assign({}, DEF.text, o.text || {}, { s: (o.text && o.text.s) || '' }); }
  var DASH = { solid: null, dash: [4, 3], dot: [0.2, 2.2], dashdot: [4, 2.5, 0.2, 2.5], longdash: [8, 3.5], dashdotdot: [4, 2.5, 0.2, 2.5, 0.2, 2.5], sysdash: [3, 1], sysdot: [1, 1] };
  var DASH_NAMES = [['solid', 'متصل'], ['dash', 'شرطات'], ['longdash', 'شرطات طويلة'], ['dot', 'نقاط'], ['dashdot', 'شرطة ونقطة'], ['dashdotdot', 'شرطة ونقطتان'], ['sysdash', 'شرطات قصيرة'], ['sysdot', 'نقاط متقاربة']];
  var HEADS = [['none', 'بلا'], ['arrow', 'سهم ممتلئ'], ['open', 'سهم مفتوح'], ['stealth', 'سهم حاد'], ['diamond', 'معيّن'], ['oval', 'دائرة'], ['square', 'مربع'], ['bar', 'خط عمودي'], ['double', 'سهم مزدوج']];
  var HATCH = [['diag', 'مائل ╱'], ['diag2', 'مائل ╲'], ['hor', 'أفقي'], ['ver', 'عمودي'], ['cross', 'شبكة +'], ['xcross', 'شبكة ×'], ['dots', 'نقاط'], ['dense', 'مائل كثيف']];

  function def(o) { return Lib.get(o.k); }
  function adjOf(o, s) { return s.adj.map(function (a, i) { return o.adj && o.adj[i] !== undefined && o.adj[i] !== null ? o.adj[i] : a.def; }); }
  function normParts(d) { return (Array.isArray(d) ? d : [d]).map(function (p) { return typeof p === 'string' ? { d: p, f: 'main' } : { d: p.d, f: p.f || 'main' }; }); }

  // ------------------------------------------------------------ geometry helpers
  function boxCenter(o) { return [o.x + o.w / 2, o.y + o.h / 2]; }
  function rot2(x, y, a) { var c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }
  /** local (shape box coordinates, unflipped) → page */
  function toPage(o, lx, ly) { var c = boxCenter(o), r = rot2(lx - o.w / 2, ly - o.h / 2, rad(o.rot || 0)); return [c[0] + r[0], c[1] + r[1]]; }
  function toLocal(o, px, py) { var c = boxCenter(o), r = rot2(px - c[0], py - c[1], -rad(o.rot || 0)); return [r[0] + o.w / 2, r[1] + o.h / 2]; }
  function boxTf(o, noFlip) {
    var c = boxCenter(o), t = 'translate(' + f2(c[0]) + ' ' + f2(c[1]) + ')';
    if (o.rot) t += ' rotate(' + f2(o.rot) + ')';
    if (!noFlip && (o.fx || o.fy)) t += ' scale(' + (o.fx ? -1 : 1) + ' ' + (o.fy ? -1 : 1) + ')';
    return t + ' translate(' + f2(-o.w / 2) + ' ' + f2(-o.h / 2) + ')';
  }

  // ------------------------------------------------------------ paint
  function dashAttr(ln) {
    var d = DASH[ln.dash]; if (!d) return '';
    var w = Math.max(ln.w, 1);
    return ' stroke-dasharray="' + d.map(function (v) { return f2(v * w); }).join(' ') + '"' + (/dot/.test(ln.dash) ? ' stroke-linecap="round"' : '');
  }
  function strokeAttr(ln, extra) {
    if (!ln.w || ln.w <= 0 || ln.c === 'none') return ' stroke="none"';
    var d = dashAttr(ln);
    return ' stroke="' + ln.c + '" stroke-width="' + f2(ln.w) + '"' + (/stroke-linecap/.test(d) ? '' : ' stroke-linecap="' + ln.cap + '"') + ' stroke-linejoin="' + ln.join + '"' + (ln.op < 1 ? ' stroke-opacity="' + f2(ln.op) + '"' : '') + d;
  }
  /** returns {attr, defs, extra}: the fill attribute for the main path (+ gradient defs / hatch group builder) */
  function fillOf(o, id, w, h) {
    var fl = F(o);
    if (fl.m === 'none') return { attr: ' fill="none"', defs: '' };
    if (fl.m === 'lin' || fl.m === 'rad') {
      var gid = id + 'g', defs;
      if (fl.m === 'lin') {
        var a = rad(fl.ang), dx = Math.cos(a), dy = Math.sin(a), half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2, cx = w / 2, cy = h / 2;
        defs = '<linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="' + f2(cx - dx * half) + '" y1="' + f2(cy - dy * half) + '" x2="' + f2(cx + dx * half) + '" y2="' + f2(cy + dy * half) + '"><stop offset="0" stop-color="' + fl.c + '"/><stop offset="1" stop-color="' + fl.c2 + '"/></linearGradient>';
      } else {
        defs = '<radialGradient id="' + gid + '" gradientUnits="userSpaceOnUse" cx="' + f2(w / 2) + '" cy="' + f2(h / 2) + '" r="' + f2(Math.max(w, h) / 2 * 1.05) + '" fx="' + f2(w / 2) + '" fy="' + f2(h / 2) + '"><stop offset="0" stop-color="' + fl.c + '"/><stop offset="1" stop-color="' + fl.c2 + '"/></radialGradient>';
      }
      return { attr: ' fill="url(#' + gid + ')"' + (fl.op < 1 ? ' fill-opacity="' + f2(fl.op) + '"' : ''), defs: '<defs>' + defs + '</defs>' };
    }
    if (fl.m === 'hatch') return { attr: fl.c2 && fl.c2 !== 'none' ? ' fill="' + fl.c2 + '"' + (fl.op < 1 ? ' fill-opacity="' + f2(fl.op) + '"' : '') : ' fill="none"', defs: '', hatch: true };
    return { attr: ' fill="' + fl.c + '"' + (fl.op < 1 ? ' fill-opacity="' + f2(fl.op) + '"' : ''), defs: '' };
  }
  function hatchMarkup(o, id, partD, w, h, evenodd) {
    var fl = F(o), gap = fl.hatch === 'dense' ? 4 : 7, lw = fl.hatch === 'dots' ? 0 : 0.9, out = '', cid = id + 'c', k;
    var L = Math.hypot(w, h);
    out += '<clipPath id="' + cid + '"><path d="' + partD + '"' + (evenodd ? ' clip-rule="evenodd"' : '') + '/></clipPath><g clip-path="url(#' + cid + ')" stroke="' + fl.c + '" stroke-width="' + lw + '" fill="none"' + (fl.op < 1 ? ' stroke-opacity="' + f2(fl.op) + '"' : '') + '>';
    var line = function (x1, y1, x2, y2) { out += '<line x1="' + f2(x1) + '" y1="' + f2(y1) + '" x2="' + f2(x2) + '" y2="' + f2(y2) + '"/>'; };
    var hs = fl.hatch;
    if (hs === 'diag' || hs === 'dense' || hs === 'xcross') for (k = -h; k < w + h; k += gap) line(k, h, k + h, 0);
    if (hs === 'diag2' || hs === 'xcross') for (k = -h; k < w + h; k += gap) line(k, 0, k + h, h);
    if (hs === 'hor' || hs === 'cross') for (k = gap; k < h; k += gap) line(0, k, w, k);
    if (hs === 'ver' || hs === 'cross') for (k = gap; k < w; k += gap) line(k, 0, k, h);
    if (hs === 'dots') { out += '</g><g clip-path="url(#' + cid + ')" fill="' + fl.c + '"' + (fl.op < 1 ? ' fill-opacity="' + f2(fl.op) + '"' : '') + '>'; for (var yy = gap / 2; yy < h; yy += gap) for (var xx = gap / 2 + ((yy / gap | 0) % 2) * gap / 2; xx < w; xx += gap) out += '<circle cx="' + f2(xx) + '" cy="' + f2(yy) + '" r="1.1"/>'; }
    return out + '</g>';
  }

  // ------------------------------------------------------------ box shapes
  function boxMarkup(o, s, id, flat) {
    var w = Math.max(1, o.w), h = Math.max(1, o.h), a = adjOf(o, s), parts = normParts(s.d(w, h, a)), ln = Ln(o), fl = fillOf(o, id, w, h), body = '', defs = flat ? '' : fl.defs;
    var eo = s.evenodd ? ' fill-rule="evenodd"' : '';
    parts.forEach(function (p, i) {
      var fillA, strokeA = strokeAttr(ln);
      if (flat) { fillA = s.open || p.f === 'none' ? ' fill="none"' : ' fill="' + flat.c + '"'; strokeA = ' stroke="' + flat.c + '" stroke-width="' + f2(ln.w + flat.grow) + '" stroke-linejoin="round"'; }
      else if (p.f === 'dark') fillA = ' fill="#000" fill-opacity="0.22"';
      else if (p.f === 'light') fillA = ' fill="#fff" fill-opacity="0.35"';
      else if (p.f === 'none' || s.open) fillA = ' fill="none"';
      else fillA = fl.attr;
      body += '<path d="' + p.d + '"' + fillA + eo + strokeA + '/>';
      if (!flat && fl.hatch && p.f === 'main' && !s.open) body += hatchMarkup(o, id + 'h' + i, p.d, w, h, s.evenodd);
    });
    // preview only: clicking inside an unfilled shape selects it
    return { defs: defs, body: body };
  }

  // ------------------------------------------------------------ lines
  function linePts(o) {
    if (o.pts && o.pts.length) return o.pts;
    return [[o.x1, o.y1], [o.x2, o.y2]];
  }
  function lineGeom(o, s) {
    var pts = linePts(o), p1 = pts[0], p2 = pts[pts.length - 1], a0 = (o.adj && o.adj[0] !== undefined) ? o.adj[0] : 0.5, d = '', t0, t1, ctrl = null;
    var dx = p2[0] - p1[0], dy = p2[1] - p1[1], horiz = Math.abs(dx) >= Math.abs(dy);
    if (s.lt === 'straight') { d = 'M' + f2(p1[0]) + ' ' + f2(p1[1]) + 'L' + f2(p2[0]) + ' ' + f2(p2[1]); t0 = Math.atan2(p1[1] - p2[1], p1[0] - p2[0]); t1 = Math.atan2(dy, dx); }
    else if (s.lt === 'elbow') {
      if (horiz) { var xm = p1[0] + dx * a0; d = 'M' + f2(p1[0]) + ' ' + f2(p1[1]) + 'H' + f2(xm) + 'V' + f2(p2[1]) + 'H' + f2(p2[0]); t0 = dx >= 0 ? Math.PI : 0; t1 = dx >= 0 ? 0 : Math.PI; ctrl = [xm, (p1[1] + p2[1]) / 2]; }
      else { var ym = p1[1] + dy * a0; d = 'M' + f2(p1[0]) + ' ' + f2(p1[1]) + 'V' + f2(ym) + 'H' + f2(p2[0]) + 'V' + f2(p2[1]); t0 = dy >= 0 ? -Math.PI / 2 : Math.PI / 2; t1 = dy >= 0 ? Math.PI / 2 : -Math.PI / 2; ctrl = [(p1[0] + p2[0]) / 2, ym]; }
    } else if (s.lt === 'curve') {
      if (horiz) { var xc = p1[0] + dx * a0; d = 'M' + f2(p1[0]) + ' ' + f2(p1[1]) + 'C' + f2(xc) + ' ' + f2(p1[1]) + ' ' + f2(xc) + ' ' + f2(p2[1]) + ' ' + f2(p2[0]) + ' ' + f2(p2[1]); t0 = dx >= 0 ? Math.PI : 0; t1 = dx >= 0 ? 0 : Math.PI; ctrl = [xc, (p1[1] + p2[1]) / 2]; }
      else { var yc = p1[1] + dy * a0; d = 'M' + f2(p1[0]) + ' ' + f2(p1[1]) + 'C' + f2(p1[0]) + ' ' + f2(yc) + ' ' + f2(p2[0]) + ' ' + f2(yc) + ' ' + f2(p2[0]) + ' ' + f2(p2[1]); t0 = dy >= 0 ? -Math.PI / 2 : Math.PI / 2; t1 = dy >= 0 ? Math.PI / 2 : -Math.PI / 2; ctrl = [(p1[0] + p2[0]) / 2, yc]; }
    } else if (s.lt === 'arc') {
      var bend = (o.adj && o.adj[0] !== undefined) ? o.adj[0] : 0.25, L = Math.hypot(dx, dy) || 1, mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2, cx = mx - dy / L * L * bend * 2, cy = my + dx / L * L * bend * 2;
      d = 'M' + f2(p1[0]) + ' ' + f2(p1[1]) + 'Q' + f2(cx) + ' ' + f2(cy) + ' ' + f2(p2[0]) + ' ' + f2(p2[1]); t0 = Math.atan2(p1[1] - cy, p1[0] - cx); t1 = Math.atan2(p2[1] - cy, p2[0] - cx); ctrl = [(mx + cx) / 2, (my + cy) / 2];
    } else if (s.lt === 'poly' || s.lt === 'cloud') {
      var q = pts.slice(); if (o.cur) q = q.concat([o.cur]);
      if (s.lt === 'poly') { d = 'M' + f2(q[0][0]) + ' ' + f2(q[0][1]); for (var i = 1; i < q.length; i++) d += 'L' + f2(q[i][0]) + ' ' + f2(q[i][1]); if (s.closed && q.length > 2) d += 'Z'; }
      else d = cloudPath(q);
      var n = q.length; t0 = Math.atan2(q[0][1] - q[1][1], q[0][0] - q[1][0]); t1 = n > 1 ? Math.atan2(q[n - 1][1] - q[n - 2][1], q[n - 1][0] - q[n - 2][0]) : 0;
      p2 = q[n - 1];
    }
    return { d: d, p1: p1, p2: p2, t0: t0, t1: t1, ctrl: ctrl };
  }
  function cloudPath(q) {
    if (q.length < 3) return q.length > 1 ? 'M' + f2(q[0][0]) + ' ' + f2(q[0][1]) + 'L' + f2(q[1][0]) + ' ' + f2(q[1][1]) : '';
    var area = 0; for (var i = 0; i < q.length; i++) { var a = q[i], b = q[(i + 1) % q.length]; area += a[0] * b[1] - b[0] * a[1]; }
    var sweep = area > 0 ? 1 : 0, d = 'M' + f2(q[0][0]) + ' ' + f2(q[0][1]);
    for (var j = 0; j < q.length; j++) {
      var p = q[j], r = q[(j + 1) % q.length], L = Math.hypot(r[0] - p[0], r[1] - p[1]), n = Math.max(1, Math.round(L / 14)), seg = L / n;
      for (var k = 1; k <= n; k++) { var t = k / n; d += 'A' + f2(seg * 0.62) + ' ' + f2(seg * 0.62) + ' 0 0 ' + sweep + ' ' + f2(p[0] + (r[0] - p[0]) * t) + ' ' + f2(p[1] + (r[1] - p[1]) * t); }
    }
    return d + 'Z';
  }
  function headMarkup(type, x, y, ang, size, color, lw, strokeA) {
    if (!type || type === 'none') return '';
    var c = Math.cos(ang), sn = Math.sin(ang), px = -sn, py = c;           // direction the line leaves the tip (ang points away from the tip along the line)
    function pt(a, b) { return f2(x + c * a + px * b) + ' ' + f2(y + sn * a + py * b); }
    var s = size, fillA = ' fill="' + color + '" stroke="' + color + '" stroke-width="' + f2(Math.min(lw, 1)) + '" stroke-linejoin="round"';
    switch (type) {
      case 'arrow': return '<path d="M' + pt(0, 0) + 'L' + pt(s, s * 0.42) + 'L' + pt(s, -s * 0.42) + 'Z"' + fillA + '/>';
      case 'stealth': return '<path d="M' + pt(0, 0) + 'L' + pt(s, s * 0.4) + 'L' + pt(s * 0.7, 0) + 'L' + pt(s, -s * 0.4) + 'Z"' + fillA + '/>';
      case 'open': return '<path d="M' + pt(s, s * 0.45) + 'L' + pt(0, 0) + 'L' + pt(s, -s * 0.45) + '" fill="none"' + strokeA + '/>';
      case 'diamond': return '<path d="M' + pt(0, 0) + 'L' + pt(s * 0.5, s * 0.35) + 'L' + pt(s, 0) + 'L' + pt(s * 0.5, -s * 0.35) + 'Z"' + fillA + '/>';
      case 'oval': return '<ellipse cx="' + f2(x + c * s * 0.4) + '" cy="' + f2(y + sn * s * 0.4) + '" rx="' + f2(s * 0.4) + '" ry="' + f2(s * 0.4) + '"' + fillA + '/>';
      case 'square': return '<path d="M' + pt(0, s * 0.35) + 'L' + pt(s * 0.7, s * 0.35) + 'L' + pt(s * 0.7, -s * 0.35) + 'L' + pt(0, -s * 0.35) + 'Z"' + fillA + '/>';
      case 'bar': return '<path d="M' + pt(0, s * 0.55) + 'L' + pt(0, -s * 0.55) + '" fill="none"' + strokeA + '/>';
      case 'double': return '<path d="M' + pt(0, 0) + 'L' + pt(s * 0.8, s * 0.38) + 'L' + pt(s * 0.8, -s * 0.38) + 'Z M' + pt(s * 0.8, 0) + 'L' + pt(s * 1.6, s * 0.38) + 'L' + pt(s * 1.6, -s * 0.38) + 'Z"' + fillA + '/>';
    }
    return '';
  }
  function headSize(o, ln, k) { var base = Math.max(8, ln.w * 3.6); return base * (o.sz === undefined ? 1 : o.sz) * (k || 1); }
  function lineMarkup(o, s, id, flat, preview) {
    var ln = Ln(o), g = lineGeom(o, s), strokeA = strokeAttr(ln), out = '', defs = '';
    var closed = s.closed, fillA = ' fill="none"', fl = F(o);
    if (closed && (o.pts && o.pts.length > 2)) { var fo = fillOf(o, id, 1000, 1000); fillA = fo.attr; if (fl.m === 'lin' || fl.m === 'rad') { var bb = bbox(o); var f2o = fillOf(Object.assign({}, o, { x: bb.x, y: bb.y }), id, bb.w, bb.h); defs = f2o.defs.replace(/<defs>|<\/defs>/g, ''); fillA = f2o.attr; } }
    var path = g.d, a0 = o.a0 !== undefined ? o.a0 : s.a0, a1 = o.a1 !== undefined ? o.a1 : s.a1;
    // shorten the line under filled heads so the stroke does not poke through the tip
    var sz0 = headSize(o, ln), sz1 = headSize(o, ln);
    if (flat) { strokeA = ' stroke="' + flat.c + '" stroke-width="' + f2(ln.w + flat.grow) + '" stroke-linejoin="round" stroke-linecap="round"'; fillA = closed ? ' fill="' + flat.c + '"' : ' fill="none"'; }
    var d = path;
    if (!closed && s.lt === 'straight' && !flat) {
      var p1 = g.p1, p2 = g.p2, L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1, ux = (p2[0] - p1[0]) / L, uy = (p2[1] - p1[1]) / L, c0 = /^(arrow|stealth|diamond|oval|square|double)$/.test(a0) ? sz0 * 0.7 : 0, c1 = /^(arrow|stealth|diamond|oval|square|double)$/.test(a1) ? sz1 * 0.7 : 0;
      d = 'M' + f2(p1[0] + ux * c0) + ' ' + f2(p1[1] + uy * c0) + 'L' + f2(p2[0] - ux * c1) + ' ' + f2(p2[1] - uy * c1);
    }
    out += '<path d="' + d + '"' + fillA + strokeA + '/>';
    if (!closed && !flat) {
      var hs = strokeAttr(Object.assign({}, ln, { dash: 'solid', cap: 'round' }));
      out += headMarkup(a0, g.p1[0], g.p1[1], g.t0, sz0, ln.c, ln.w, hs) + headMarkup(a1, g.p2[0], g.p2[1], g.t1 + Math.PI, sz1, ln.c, ln.w, hs);
    }
    if (preview) out += '<path d="' + path + '" fill="none" stroke="transparent" stroke-width="' + f2(Math.max(10 / S.zoom, ln.w + 6)) + '" stroke-linecap="round" stroke-linejoin="round"/>';
    if (preview && closed && o.pts && o.pts.length > 2) out += '<path d="' + path + '" fill="transparent"/>';
    return { defs: defs, body: out };
  }

  // ------------------------------------------------------------ text inside a shape
  function textMarkup(o, s) {
    var t = Tx(o); if (!t.s || !t.s.trim()) return '';
    var r = s.text ? s.text(o.w, o.h, adjOf(o, s)) : [0, 0, o.w, o.h], pad = 4;
    var obj = { text: t.s, size: t.size, color: t.color, bold: t.bold, italic: t.italic, font: t.font, align: t.align, lh: t.lh, x: r[0] + pad, y: r[1], w: Math.max(10, r[2] - pad * 2), h: r[3], bg: 'none' };
    var th = P.textHeight(obj) - 4, y = r[1] + (t.valign === 'top' ? 2 : t.valign === 'bottom' ? r[3] - th - 2 : (r[3] - th) / 2);
    obj.y = y;
    return '<g transform="' + boxTf(o, true) + '">' + P.textSvgInner(obj) + '</g>';
  }

  // ------------------------------------------------------------ the object → markup
  function inner(o, data, exporting) {
    var s = def(o); if (!s) return '';
    var id = 'sh' + String(o.id).replace(/[^\w]/g, ''), preview = !data && !exporting, sh = Sh(o), out = '';
    if (s.line) {
      if (sh.on) out += shadowFor(o, sh, function (flat) { return lineMarkup(o, s, id + 's', flat, false); }, null);
      var lm = lineMarkup(o, s, id, null, preview);
      return out + (lm.defs ? '<defs>' + lm.defs + '</defs>' : '') + lm.body;
    }
    if (sh.on) out += shadowFor(o, sh, function (flat) { return boxMarkup(o, s, id + 's', flat); }, boxTf(o));
    var bm = boxMarkup(o, s, id, null);
    out += bm.defs + '<g transform="' + boxTf(o) + '">' + bm.body + '</g>';
    if (preview) {
      var parts = normParts(s.d(Math.max(1, o.w), Math.max(1, o.h), adjOf(o, s)));
      if (s.open) out += '<g transform="' + boxTf(o) + '"><path d="' + parts[0].d + '" fill="none" stroke="transparent" stroke-width="' + f2(Math.max(10 / S.zoom, Ln(o).w + 6)) + '"/></g>';
      else if (F(o).m === 'none') out += '<g transform="' + boxTf(o) + '"><path d="' + parts[0].d + '" fill="transparent"/></g>';
    }
    return out + textMarkup(o, s);
  }
  function shadowFor(o, sh, mk, tf) {
    var layers = sh.blur > 0 ? Math.min(7, Math.max(2, Math.round(sh.blur * 1.2))) : 1, out = '';
    for (var i = 0; i < layers; i++) {
      var grow = sh.blur > 0 ? (layers - i) * sh.blur * 0.55 : 0, op = sh.op / (sh.blur > 0 ? layers * 0.62 : 1);
      var m = mk({ c: sh.c, grow: grow });
      out += '<g opacity="' + f2(Math.min(1, op)) + '" transform="translate(' + f2(sh.dx) + ' ' + f2(sh.dy) + ')">' + (tf ? '<g transform="' + tf + '">' + m.body + '</g>' : m.body) + '</g>';
    }
    return out;
  }

  // ------------------------------------------------------------ bbox / move
  function bbox(o) {
    var s = def(o), lw = Ln(o).w / 2;
    if (s && s.line) {
      var pts = linePts(o).slice(), g = lineGeom(o, s); if (g.ctrl) pts.push(g.ctrl); if (o.cur) pts.push(o.cur);
      var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      return { x: x0 - lw, y: y0 - lw, w: x1 - x0 + 2 * lw, h: y1 - y0 + 2 * lw };
    }
    var cs = [[0, 0], [o.w, 0], [o.w, o.h], [0, o.h]].map(function (c) { return toPage(o, c[0], c[1]); });
    var ax = cs.map(function (p) { return p[0]; }), ay = cs.map(function (p) { return p[1]; });
    return { x: Math.min.apply(null, ax) - lw, y: Math.min.apply(null, ay) - lw, w: Math.max.apply(null, ax) - Math.min.apply(null, ax) + 2 * lw, h: Math.max.apply(null, ay) - Math.min.apply(null, ay) + 2 * lw };
  }
  function move(o, g, dx, dy) {
    var s = def(o);
    if (s && s.line) {
      if (g.pts) o.pts = g.pts.map(function (p) { return [p[0] + dx, p[1] + dy]; });
      else { o.x1 = g.x1 + dx; o.y1 = g.y1 + dy; o.x2 = g.x2 + dx; o.y2 = g.y2 + dy; }
      return;
    }
    o.x = g.x + dx; o.y = g.y + dy;
  }

  // ------------------------------------------------------------ selection overlay (handles)
  function overlay(o, zoom) {
    var s = def(o), hs = 5 / zoom, out = '';
    if (!s) return '';
    if (o.lock) {
      var b0 = bbox(o); return '<rect class="selbox lk" x="' + f2(b0.x - 2) + '" y="' + f2(b0.y - 2) + '" width="' + f2(b0.w + 4) + '" height="' + f2(b0.h + 4) + '"/>';
    }
    var circle = function (h, p, cls) { return '<circle class="hd ' + (cls || '') + '" data-h="' + h + '" cx="' + f2(p[0]) + '" cy="' + f2(p[1]) + '" r="' + f2(hs * 1.15) + '"/>'; };
    var diamond = function (h, p) { var r = hs * 1.35; return '<path class="hd adj" data-h="' + h + '" d="M' + f2(p[0]) + ' ' + f2(p[1] - r) + 'L' + f2(p[0] + r) + ' ' + f2(p[1]) + 'L' + f2(p[0]) + ' ' + f2(p[1] + r) + 'L' + f2(p[0] - r) + ' ' + f2(p[1]) + 'Z"/>'; };
    if (s.line) {
      var g = lineGeom(o, s), pts = linePts(o);
      if (s.lt === 'poly' || s.lt === 'cloud') {
        out += '<path class="selbox" d="' + g.d.replace(/A[^A-Z]*/g, 'L').replace(/L(?=[A-Z]|$)/g, '') + '" fill="none"/>';
        pts.forEach(function (p, i) { out += circle('v' + i, p); });
      } else {
        out += '<path class="selbox" d="' + g.d + '" fill="none"/>' + circle('p1', g.p1) + circle('p2', g.p2);
        if (g.ctrl) out += diamond('a0', g.ctrl);
      }
      return out;
    }
    var cs = [[0, 0], [o.w / 2, 0], [o.w, 0], [o.w, o.h / 2], [o.w, o.h], [o.w / 2, o.h], [0, o.h], [0, o.h / 2]].map(function (c) { return toPage(o, c[0], c[1]); });
    out += '<polygon class="selbox" points="' + cs.filter(function (c, i) { return i % 2 === 0; }).map(function (p) { return f2(p[0]) + ',' + f2(p[1]); }).join(' ') + '"/>';
    var names = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    cs.forEach(function (p, i) { out += '<rect class="hd' + (/ne|sw/.test(names[i]) ? ' h2' : '') + ' c-' + names[i] + '" data-h="' + names[i] + '" x="' + f2(p[0] - hs) + '" y="' + f2(p[1] - hs) + '" width="' + f2(hs * 2) + '" height="' + f2(hs * 2) + '" transform="rotate(' + f2(o.rot || 0) + ' ' + f2(p[0]) + ' ' + f2(p[1]) + ')"/>'; });
    var top = toPage(o, o.w / 2, 0), rp = toPage(o, o.w / 2, -26 / zoom);
    out += '<line class="stem" x1="' + f2(top[0]) + '" y1="' + f2(top[1]) + '" x2="' + f2(rp[0]) + '" y2="' + f2(rp[1]) + '"/>' + circle('rot', rp, 'rot');
    s.adj.forEach(function (a, i) {
      var v = adjOf(o, s)[i], q = a.pos(o.w, o.h, v), qx = o.fx ? o.w - q[0] : q[0], qy = o.fy ? o.h - q[1] : q[1];
      out += diamond('a' + i, toPage(o, qx, qy));
    });
    return out;
  }

  // ------------------------------------------------------------ dragging a handle
  function snapAng(a, step) { return Math.round(a / step) * step; }
  function dragHandle(d, o, pt, e) {
    var g = d.orig, h = d.h, s = def(o);
    if (s.line) {
      if (h === 'p1' || h === 'p2' || /^v\d+$/.test(h)) {
        var idx = h === 'p1' ? 0 : h === 'p2' ? 1 : +h.slice(1), q = [pt[0], pt[1]], pts = linePts(g), other = pts[idx === 0 ? 1 : idx - 1];
        if (e.shiftKey && other) { var ang = Math.atan2(q[1] - other[1], q[0] - other[0]), L = Math.hypot(q[0] - other[0], q[1] - other[1]); ang = snapAng(ang, Math.PI / 12); q = [other[0] + L * Math.cos(ang), other[1] + L * Math.sin(ang)]; }
        if (o.pts) { o.pts = clone(g.pts); o.pts[idx] = q; }
        else if (h === 'p1') { o.x1 = q[0]; o.y1 = q[1]; } else { o.x2 = q[0]; o.y2 = q[1]; }
      } else if (h === 'a0') {
        var p1 = linePts(g)[0], p2 = linePts(g).slice(-1)[0], dx = p2[0] - p1[0], dy = p2[1] - p1[1];
        o.adj = (o.adj || []).slice();
        if (s.lt === 'arc') { var L2 = Math.hypot(dx, dy) || 1, mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2; o.adj[0] = ((pt[0] - mx) * (-dy / L2) + (pt[1] - my) * (dx / L2)) / L2 / 1; }
        else if (Math.abs(dx) >= Math.abs(dy)) o.adj[0] = Math.max(0, Math.min(1, dx ? (pt[0] - p1[0]) / dx : 0.5));
        else o.adj[0] = Math.max(0, Math.min(1, dy ? (pt[1] - p1[1]) / dy : 0.5));
      }
      return;
    }
    if (h === 'rot') {
      var c = boxCenter(g), a = Math.atan2(pt[1] - c[1], pt[0] - c[0]) * 180 / Math.PI + 90;
      a = ((a % 360) + 360) % 360; if (e.shiftKey) a = snapAng(a, 15); else { [0, 45, 90, 135, 180, 225, 270, 315, 360].forEach(function (k) { if (Math.abs(a - k) < 3) a = k % 360; }); }
      o.rot = Math.round(a * 10) / 10; return;
    }
    if (/^a\d+$/.test(h)) {
      var i2 = +h.slice(1), ad = s.adj[i2], lp = toLocal(g, pt[0], pt[1]), lx = g.fx ? g.w - lp[0] : lp[0], ly = g.fy ? g.h - lp[1] : lp[1];
      var v = ad.inv(lx, ly, g.w, g.h);
      o.adj = (o.adj || []).slice();
      if (ad.pt) o.adj[i2] = [Math.round(v[0] * 1000) / 1000, Math.round(v[1] * 1000) / 1000];
      else o.adj[i2] = Math.round(Math.max(ad.min, Math.min(ad.max, v)) * 1000) / 1000;
      return;
    }
    // resize in the shape's own rotated frame
    var cc = boxCenter(g), u = rot2(1, 0, rad(g.rot || 0)), v2 = rot2(0, 1, rad(g.rot || 0));
    var rx = pt[0] - cc[0], ry = pt[1] - cc[1], dxl = rx * u[0] + ry * u[1], dyl = rx * v2[0] + ry * v2[1];
    var L0 = -g.w / 2, R0 = g.w / 2, T0 = -g.h / 2, B0 = g.h / 2, L = L0, R = R0, T = T0, B = B0, min = 6;
    if (/e/.test(h)) R = Math.max(dxl, L0 + min); if (/w/.test(h)) L = Math.min(dxl, R0 - min);
    if (/s/.test(h)) B = Math.max(dyl, T0 + min); if (/n/.test(h)) T = Math.min(dyl, B0 - min);
    if (e.altKey) { if (/e|w/.test(h)) { var ex = Math.max(min / 2, Math.abs(dxl)); L = -ex; R = ex; } if (/n|s/.test(h)) { var ey = Math.max(min / 2, Math.abs(dyl)); T = -ey; B = ey; } }
    if ((e.shiftKey || d.keep) && h.length === 2) {
      var k = Math.max((R - L) / g.w, (B - T) / g.h);
      var nw = g.w * k, nh = g.h * k;
      if (e.altKey) { L = -nw / 2; R = nw / 2; T = -nh / 2; B = nh / 2; }
      else { if (/e/.test(h)) R = L0 + nw; else L = R0 - nw; if (/s/.test(h)) B = T0 + nh; else T = B0 - nh; }
    }
    var w = R - L, hh = B - T, offx = (L + R) / 2, offy = (T + B) / 2;
    var ncx = cc[0] + u[0] * offx + v2[0] * offy, ncy = cc[1] + u[1] * offx + v2[1] * offy;
    o.w = w; o.h = hh; o.x = ncx - w / 2; o.y = ncy - hh / 2;
  }

  // ------------------------------------------------------------ creating shapes
  var recent = [];
  try { recent = JSON.parse(localStorage.getItem('armath.pdf.shapeRecent') || '[]') || []; } catch (e) { recent = []; }
  function remember(id) { recent = [id].concat(recent.filter(function (x) { return x !== id; })).slice(0, 12); try { localStorage.setItem('armath.pdf.shapeRecent', JSON.stringify(recent)); } catch (e) { /* ignore */ } }
  function newObj(kind, pt) {
    var s = Lib.get(kind), o = { id: P.uid(), t: 'shape', k: kind, fill: clone(style.fill), line: clone(style.line), shadow: clone(style.shadow), text: clone(style.text), sz: 1 };
    if (s.line) { o.x1 = pt[0]; o.y1 = pt[1]; o.x2 = pt[0]; o.y2 = pt[1]; delete o.fill; if (s.multi) { o.pts = [[pt[0], pt[1]]]; delete o.x1; delete o.y1; delete o.x2; delete o.y2; } if (!s.closed) o.fill = clone(style.fill); }
    else { o.x = pt[0]; o.y = pt[1]; o.w = 0; o.h = 0; o.rot = 0; }
    if (s.line && !s.closed && !s.multi) { /* connectors take the line colour only */ }
    return P.born(o);
  }
  var shapeDrag = null;
  function onToolDown(i, sv, pt, e) {
    var kind = S.shapeKind || 'rect', s = Lib.get(kind), p = S.pages[i];
    if (!s) return null;
    if (s.multi) { polyClick(i, sv, pt, e, s); return 'poly'; }
    var o = newObj(kind, pt);
    P.push(); p.objs.push(o);
    return { kind: 'shapedraw', i: i, sv: sv, o: o, start: pt, s: s };
  }
  function dragDraw(d, pt, e) {
    var o = d.o, s = d.s, st = d.start;
    if (s.line) {
      var x2 = pt[0], y2 = pt[1];
      if (e.shiftKey) { var a = Math.atan2(y2 - st[1], x2 - st[0]), L = Math.hypot(x2 - st[0], y2 - st[1]); a = snapAng(a, Math.PI / 12); x2 = st[0] + L * Math.cos(a); y2 = st[1] + L * Math.sin(a); }
      o.x2 = x2; o.y2 = y2; return;
    }
    var x0 = st[0], y0 = st[1], dx = pt[0] - x0, dy = pt[1] - y0;
    if (e.shiftKey) { var m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; }
    if (e.altKey) { o.x = x0 - Math.abs(dx); o.y = y0 - Math.abs(dy); o.w = Math.abs(dx) * 2; o.h = Math.abs(dy) * 2; }
    else { o.x = Math.min(x0, x0 + dx); o.y = Math.min(y0, y0 + dy); o.w = Math.abs(dx); o.h = Math.abs(dy); }
  }
  function defaultSize(s) { return /^(ellipse|fConnector|star|burst|sun|smiley|donut|noSmoking|heart|cross|mPlus|mMultiply|mCheck|mCross|gear|flower|pin)/.test(s.id) ? [90, 90] : /Bracket|Brace|Paren/.test(s.id) ? [30, 110] : /^(eThermometer|eTestTube|eMagnet)$/.test(s.id) ? [50, 110] : /Arrow|arrow/.test(s.id) && /^(up|down)/.test(s.id) ? [70, 110] : [130, 80]; }
  function endDraw(d) {
    var o = d.o, s = d.s, p = S.pages[d.i];
    var tiny = s.line ? Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 4 : (o.w < 4 && o.h < 4);
    if (tiny) {                                          // a click: drop a default-sized shape centred on the point
      if (s.line) { o.x2 = o.x1 + 140; o.y2 = o.y1; o.x1 -= 0; }
      else { var z = defaultSize(s); o.x = d.start[0] - z[0] / 2; o.y = d.start[1] - z[1] / 2; o.w = z[0]; o.h = z[1]; }
    } else if (!s.line && (o.w < 4 || o.h < 4)) { if (o.w < 4) o.w = 4; if (o.h < 4) o.h = 4; }
    if (!s.line) {
      var tcol = style.text.color;
      if (F(o).m !== 'none' && /^#/.test(F(o).c) && lum(F(o).c) < 0.35 && tcol === DEF.text.color) o.text = Object.assign({}, o.text, { color: '#ffffff' });
    }
    remember(o.k);
    P.setTool('select'); P.select(d.i, o.id); P.changed(); P.markThumb(d.i); P.drawOverlay(d.i);
  }
  function lum(hex) { var h = hex.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255; return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

  // multi-click shapes (polyline, polygon, revision cloud): click = add a point; double-click / Enter / click on the first point = finish
  var poly = null;
  function polyClick(i, sv, pt, e, s) {
    var p = S.pages[i];
    if (!poly || poly.i !== i) {
      if (poly) polyFinish(true);
      var o = newObj(S.shapeKind, pt); P.push(); p.objs.push(o); poly = { i: i, o: o, sv: sv, s: s, last: Date.now() };
      document.addEventListener('pointermove', polyMove); document.addEventListener('keydown', polyKey, true);
      return;
    }
    var o2 = poly.o, first = o2.pts[0], now = Date.now();
    var closing = s.closed && o2.pts.length > 2 && Math.hypot(pt[0] - first[0], pt[1] - first[1]) < 8 / S.zoom;
    if (closing || (now - poly.last < 350 && Math.hypot(pt[0] - o2.pts[o2.pts.length - 1][0], pt[1] - o2.pts[o2.pts.length - 1][1]) < 5 / S.zoom)) { polyFinish(false); return; }
    var q = [pt[0], pt[1]];
    if (e.shiftKey) { var l = o2.pts[o2.pts.length - 1], a = Math.atan2(q[1] - l[1], q[0] - l[0]), L = Math.hypot(q[0] - l[0], q[1] - l[1]); a = snapAng(a, Math.PI / 12); q = [l[0] + L * Math.cos(a), l[1] + L * Math.sin(a)]; }
    o2.pts.push(q); poly.last = now; delete o2.cur; P.drawOverlay(i);
  }
  function polyMove(e) {
    if (!poly) return;
    var sv = poly.sv, m = sv.getScreenCTM(); if (!m) return;
    var pt = sv.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; var r = pt.matrixTransform(m.inverse());
    poly.o.cur = [r.x, r.y]; P.drawOverlay(poly.i);
  }
  function polyKey(e) {
    if (!poly) return;
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); polyFinish(false); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); polyFinish(true); }
    else if (e.key === 'Backspace' && poly.o.pts.length > 1) { e.preventDefault(); e.stopPropagation(); poly.o.pts.pop(); P.drawOverlay(poly.i); }
  }
  function polyFinish(cancel) {
    if (!poly) return;
    var d = poly, o = d.o, p = S.pages[d.i], s = d.s; poly = null;
    document.removeEventListener('pointermove', polyMove); document.removeEventListener('keydown', polyKey, true);
    delete o.cur;
    var minPts = s.closed ? 3 : 2;
    if (cancel || o.pts.length < minPts) { p.objs = p.objs.filter(function (x) { return x !== o; }); S.undo.pop(); P.drawOverlay(d.i); return; }
    remember(o.k); P.setTool('select'); P.select(d.i, o.id); P.changed(); P.markThumb(d.i); P.drawOverlay(d.i);
  }
  function inProgress() { return !!poly; }

  // ------------------------------------------------------------ double click: edit text / add a vertex
  function dbl(i, o, pt) {
    var s = def(o); if (!s) return false;
    if (s.line) {
      if (o.pts) {                                     // insert a vertex on the segment under the pointer
        var best = -1, bd = 1e9, q = o.pts.concat(s.closed ? [o.pts[0]] : []);
        for (var k = 0; k < q.length - 1; k++) { var d = distSeg(pt, q[k], q[k + 1]); if (d < bd) { bd = d; best = k; } }
        if (best >= 0 && bd < 8 / S.zoom) { P.push(); o.pts.splice(best + 1, 0, [pt[0], pt[1]]); P.changed(); P.drawOverlay(i); }
      }
      return true;
    }
    editText(i, o); return true;
  }
  function distSeg(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
  function editText(i, o) {
    P.select(i, o.id);
    var s = def(o), el = P.pinOf(i), sc = S.zoom * 96 / 72, t = Tx(o), r = s.text ? s.text(o.w, o.h, adjOf(o, s)) : [0, 0, o.w, o.h];
    var c = boxCenter(o);
    var ta = document.createElement('textarea');
    ta.className = 'tedit shape-edit'; ta.dir = 'auto'; ta.value = t.s; ta.placeholder = 'اكتب النص…';
    var w = r[2] * sc, h = r[3] * sc;
    ta.style.left = ((c[0] - o.w / 2 + r[0]) * sc) + 'px'; ta.style.top = ((c[1] - o.h / 2 + r[1]) * sc) + 'px'; ta.style.width = w + 'px'; ta.style.height = h + 'px';
    ta.style.transform = 'rotate(' + (o.rot || 0) + 'deg)'; ta.style.transformOrigin = (o.w / 2 - r[0]) * sc + 'px ' + (o.h / 2 - r[1]) * sc + 'px';
    ta.style.fontSize = (t.size * sc) + 'px'; ta.style.fontWeight = t.bold ? '700' : '400'; ta.style.fontStyle = t.italic ? 'italic' : 'normal'; ta.style.color = t.color;
    ta.style.fontFamily = '"' + t.font + '", Amiri, serif'; ta.style.textAlign = t.align; ta.style.lineHeight = String(t.lh); ta.style.background = 'transparent'; ta.style.border = '1px dashed #0e9f9a'; ta.style.resize = 'none'; ta.style.overflow = 'hidden'; ta.style.padding = '0 ' + (4 * sc) + 'px';
    ta.style.display = 'block'; ta.style.boxSizing = 'border-box'; ta.style.paddingTop = t.valign === 'top' ? '2px' : t.valign === 'bottom' ? Math.max(0, h - t.size * sc * t.lh - 2) + 'px' : Math.max(0, (h - t.size * sc * t.lh) / 2) + 'px';
    el.appendChild(ta);
    var hidden = t.s; o.text = Object.assign({}, o.text, { s: '' }); P.drawOverlay(i); o.text.s = hidden;
    P.push();
    var done = false;
    function commit() { if (done) return; done = true; o.text = Object.assign({}, o.text, { s: ta.value }); ta.remove(); P.changed(); P.drawOverlay(i); P.markThumb(i); sync(); }
    ta.onkeydown = function (e) { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); ta.blur(); } e.stopPropagation(); };
    // focus after the mouse gesture that opened the editor has finished (otherwise its mouseup steals the focus and closes it at once)
    setTimeout(function () { if (done) return; ta.focus(); ta.select(); ta.onblur = commit; }, 80);
  }

  // ================================================================ gallery
  var galTarget = null;                   // null = pick a shape to draw; 'replace' = change the selected shapes' type
  var galCat = 'recent';
  function thumbSvg(s, size) {
    var w = 100, h = 70, a = s.adj ? s.adj.map(function (x) { return x.def; }) : [], out = '<svg viewBox="-6 -6 112 82" width="' + size[0] + '" height="' + size[1] + '" aria-hidden="true">';
    if (s.line) {
      var d = s.lt === 'elbow' ? 'M4 62H50V8H96' : s.lt === 'curve' ? 'M4 62C50 62 50 8 96 8' : s.lt === 'arc' ? 'M4 62Q50 -10 96 62' : s.lt === 'poly' ? (s.closed ? (s.id === 'cloudMarkup' ? cloudPath([[8, 56], [20, 12], [78, 6], [94, 50]]) : 'M8 56L20 12L78 6L94 50Z') : 'M6 60L34 14L60 50L94 8') : s.dim ? 'M4 35H96' : 'M4 58L96 12';
      var st = ' fill="none" stroke="#3d5560" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"';
      var tipA = s.lt === 'straight' ? Math.atan2(-46, 92) : s.lt === 'elbow' || s.lt === 'curve' ? 0 : s.lt === 'arc' ? Math.atan2(72, 46) : s.lt === 'poly' ? Math.atan2(-42, 34) : 0;
      var endPt = s.lt === 'straight' ? [96, 12] : s.lt === 'elbow' || s.lt === 'curve' ? [96, 8] : s.lt === 'arc' ? [96, 62] : s.lt === 'poly' && !s.closed ? [94, 8] : [96, 35];
      if (s.dim) endPt = [96, 35];
      out += '<path d="' + d + '"' + st + (s.closed ? ' fill="#cfe3e8"' : '') + '/>';
      if (s.a1 && s.a1 !== 'none') out += headMarkup(s.a1, endPt[0], endPt[1], (s.dim ? 0 : tipA) + Math.PI, 15, '#3d5560', 3, st);
      if (s.a0 && s.a0 !== 'none') out += headMarkup(s.a0, s.lt === 'straight' ? 4 : 4, s.lt === 'straight' ? 58 : s.lt === 'poly' ? 60 : s.dim ? 35 : s.lt === 'arc' ? 62 : 62, s.lt === 'straight' ? Math.atan2(46, -92) + Math.PI : s.dim ? Math.PI : Math.PI, 15, '#3d5560', 3, st);
      return out + '</svg>';
    }
    var parts = normParts(s.d(w, h, a));
    parts.forEach(function (p) { var fill = s.open || p.f === 'none' ? 'none' : p.f === 'dark' ? '#4a6f7a' : p.f === 'light' ? '#e6f3f5' : '#bcd9df'; out += '<path d="' + p.d + '" fill="' + fill + '"' + (s.evenodd ? ' fill-rule="evenodd"' : '') + ' stroke="#3d5560" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>'; });
    return out + '</svg>';
  }
  var gal = null;
  function buildGallery() {
    gal = document.createElement('div'); gal.className = 'shgal'; gal.hidden = true; gal.setAttribute('role', 'dialog'); gal.setAttribute('aria-label', 'معرض الأشكال');
    gal.innerHTML = '<div class="shg-top"><input type="search" id="shgSearch" placeholder="ابحث عن شكل: سهم، نجمة، قلب، flowchart…" aria-label="بحث"><b class="shg-count"></b><button type="button" class="shg-x" aria-label="إغلاق">✕</button></div>' +
      '<div class="shg-body"><nav class="shg-cats" id="shgCats"></nav><div class="shg-grid" id="shgGrid"></div></div><div class="shg-foot" id="shgFoot">اضغط على شكل ثم اسحب على الصفحة لرسمه (Shift: نسب ثابتة · Alt: من المركز). نقرة واحدة تضع شكلاً بالحجم الافتراضي.</div>';
    document.body.appendChild(gal);
    gal.querySelector('.shg-x').onclick = closeGallery;
    $('shgSearch').oninput = function () { drawGrid(); };
    document.addEventListener('pointerdown', function (e) { if (!gal.hidden && !gal.contains(e.target) && e.target.id !== 'shapeBtn' && !(e.target.closest && e.target.closest('#shapeBtn')) && !(e.target.closest && e.target.closest('#inspChange'))) closeGallery(); });
    document.addEventListener('keydown', function (e) { if (!gal.hidden && e.key === 'Escape') closeGallery(); });
  }
  function drawCats() {
    var nav = $('shgCats'), html = '<button type="button" data-c="recent" aria-pressed="' + (galCat === 'recent') + '">★ الأخيرة</button><button type="button" data-c="all" aria-pressed="' + (galCat === 'all') + '">الكل <span>' + Lib.count() + '</span></button>';
    Lib.cats.forEach(function (c) { html += '<button type="button" data-c="' + c.id + '" aria-pressed="' + (galCat === c.id) + '">' + c.ar + ' <span>' + c.shapes.length + '</span></button>'; });
    nav.innerHTML = html;
    [].forEach.call(nav.children, function (b) { b.onclick = function () { galCat = b.dataset.c; $('shgSearch').value = ''; drawCats(); drawGrid(); }; });
  }
  function drawGrid() {
    var q = ($('shgSearch').value || '').trim().toLowerCase(), list = [];
    if (q) list = Lib.all().filter(function (s) { return (s.ar + ' ' + s.en + ' ' + s.id).toLowerCase().indexOf(q) >= 0; });
    else if (galCat === 'recent') list = recent.map(function (id) { return Lib.get(id); }).filter(Boolean);
    else if (galCat === 'all') list = Lib.all();
    else list = (Lib.cats.filter(function (c) { return c.id === galCat; })[0] || { shapes: [] }).shapes;
    var grid = $('shgGrid'); grid.innerHTML = '';
    if (!list.length) { grid.innerHTML = '<div class="shg-empty">' + (q ? 'لا يوجد شكل بهذا الاسم' : 'لم تستخدم أشكالاً بعد — اختر من الفئات') + '</div>'; }
    var cur = galTarget ? null : S.shapeKind;
    list.forEach(function (s) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'shg-item' + (cur === s.id ? ' on' : ''); b.title = s.ar + ' — ' + s.en; b.setAttribute('aria-label', s.ar);
      b.innerHTML = thumbSvg(s, [58, 42]) + '<span>' + s.ar + '</span>';
      b.onclick = function () { pick(s.id); };
      grid.appendChild(b);
    });
    gal.querySelector('.shg-count').textContent = list.length + ' شكل';
  }
  function pick(id) {
    var target = galTarget;
    closeGallery();
    if (target === 'replace') { replaceKind(id); return; }
    S.shapeKind = id; remember(id); P.setTool('shape'); updateBtn();
    P.toast('اختر مكان الشكل على الصفحة: اسحب لرسمه' + (Lib.get(id).multi ? ' — انقر لإضافة نقاط، نقرتان للإنهاء' : ''));
  }
  function openGallery(anchor, target) {
    if (!gal) buildGallery();
    galTarget = target || null; if (!recent.length && galCat === 'recent') galCat = 'basic';
    drawCats(); drawGrid();
    gal.hidden = false;
    var r = anchor.getBoundingClientRect(), w = Math.min(780, window.innerWidth - 16);
    gal.style.width = w + 'px';
    var left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)); gal.style.left = left + 'px'; gal.style.top = Math.min(r.bottom + 6, window.innerHeight - 200) + 'px';
    gal.style.maxHeight = Math.max(260, window.innerHeight - r.bottom - 18) + 'px';
    setTimeout(function () { $('shgSearch').focus(); }, 30);
  }
  function closeGallery() { if (gal) gal.hidden = true; }

  function replaceKind(id) {
    var list = sel().filter(function (o) { return !o.lock; }); if (!list.length) return;
    var s = Lib.get(id); P.push();
    list.forEach(function (o) {
      var os = def(o);
      if (!!os.line !== !!s.line) { P.toast('لا يمكن التبديل بين خط وشكل مغلق — ارسم الشكل الجديد'); return; }
      o.k = id; o.adj = undefined;
      if (s.line && s.lt === 'poly' && !o.pts) { o.pts = linePts(o).map(function (p) { return p.slice(); }); }
    });
    P.changed(); P.drawOverlay(S.sel.page); P.markThumb(S.sel.page); sync();
  }
  function updateBtn() {
    var b = $('shapeBtn'); if (!b) return;
    var s = Lib.get(S.shapeKind);
    b.querySelector('i').innerHTML = s ? thumbSvg(s, [26, 20]) : '◇';
    b.setAttribute('aria-pressed', String(S.tool === 'shape'));
  }

  // ================================================================ inspector
  var insp = null, inspOn = false, lastKey = '', lastT = 0, enabled = true;
  try { var sv2 = localStorage.getItem('armath.pdf.insp'); enabled = sv2 === null ? window.innerWidth >= 1100 : sv2 === '1'; } catch (e) { /* ignore */ }
  function setEnabled(v) { enabled = !!v; try { localStorage.setItem('armath.pdf.insp', enabled ? '1' : '0'); } catch (e) { /* ignore */ } var b = $('inspBtn'); if (b) b.setAttribute('aria-pressed', String(enabled)); sync(); }
  function sel() { return P.selObjs().filter(function (o) { return o.t === 'shape'; }); }
  function targets() { var l = sel(); return l.length ? l : null; }
  function row(label, html) { return '<div class="ir"><label>' + label + '</label><div class="ic">' + html + '</div></div>'; }
  function opts(list, val) { return list.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); }
  function seg(name, list, val) { return '<div class="iseg" data-seg="' + name + '">' + list.map(function (o) { return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + (o[0] === val) + '" title="' + (o[2] || o[1]) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
  function sect(id, title, body, open) { return '<details class="isec" data-sec="' + id + '"' + (open === false ? '' : ' open') + '><summary>' + title + '</summary><div class="ib">' + body + '</div></details>'; }
  var PRESETS = [
    { n: 'أزرق', f: { m: 'solid', c: '#cfe3ff' }, l: { c: '#1f5fbf', w: 1.5 } }, { n: 'أخضر', f: { m: 'solid', c: '#d3f1d8' }, l: { c: '#2e8b3a', w: 1.5 } }, { n: 'أصفر', f: { m: 'solid', c: '#fff2b3' }, l: { c: '#c79a00', w: 1.5 } },
    { n: 'أحمر', f: { m: 'solid', c: '#ffd5d2' }, l: { c: '#c2352b', w: 1.5 } }, { n: 'بنفسجي', f: { m: 'solid', c: '#e6d8f5' }, l: { c: '#7b3fb5', w: 1.5 } }, { n: 'فيروزي', f: { m: 'solid', c: '#c9ece6' }, l: { c: '#0a7c78', w: 1.5 } },
    { n: 'داكن', f: { m: 'solid', c: '#1b2a30' }, l: { c: '#1b2a30', w: 1 }, t: '#ffffff' }, { n: 'أزرق ممتلئ', f: { m: 'solid', c: '#1f5fbf' }, l: { c: '#16438a', w: 1 }, t: '#ffffff' }, { n: 'برتقالي ممتلئ', f: { m: 'solid', c: '#e07a00' }, l: { c: '#a85a00', w: 1 }, t: '#ffffff' },
    { n: 'إطار فقط', f: { m: 'none' }, l: { c: '#1b2a30', w: 2 } }, { n: 'إطار متقطع', f: { m: 'none' }, l: { c: '#c2352b', w: 2, dash: 'dash' } }, { n: 'تظليل شفاف', f: { m: 'solid', c: '#ffe066', op: 0.5 }, l: { c: '#ffe066', w: 0 } },
    { n: 'تدرج أزرق', f: { m: 'lin', c: '#74c0fc', c2: '#1f5fbf', ang: 90 }, l: { c: '#16438a', w: 1 }, t: '#ffffff' }, { n: 'تدرج غروب', f: { m: 'lin', c: '#ffd43b', c2: '#e03131', ang: 90 }, l: { c: '#a61e1e', w: 1 } }, { n: 'تدرج دائري', f: { m: 'rad', c: '#ffffff', c2: '#74c0fc', ang: 0 }, l: { c: '#1f5fbf', w: 1 } },
    { n: 'نقش مائل', f: { m: 'hatch', c: '#1f5fbf', c2: '#ffffff', hatch: 'diag' }, l: { c: '#1f5fbf', w: 1.5 } }, { n: 'ظل ناعم', f: { m: 'solid', c: '#ffffff' }, l: { c: '#9aa9ae', w: 1 }, s: { on: true, c: '#000000', op: 0.3, dx: 3, dy: 4, blur: 6 } }
  ];
  function buildInsp() {
    insp = document.createElement('aside'); insp.className = 'insp'; insp.id = 'insp'; insp.hidden = true; insp.setAttribute('aria-label', 'خصائص الشكل');
    document.querySelector('.pmain').appendChild(insp);
    insp.addEventListener('input', onInput); insp.addEventListener('change', onInput); insp.addEventListener('click', onClick);
  }
  function show(on) {
    if (!insp) buildInsp();
    if (inspOn === on) return;
    inspOn = on; insp.hidden = !on; document.querySelector('.pmain').classList.toggle('insp-on', on);
  }
  function sync() {
    var l = targets(), isTool = S.tool === 'shape' && !l;
    if (!enabled || !S.pdf) { show(false); return; }
    if (!insp) buildInsp();
    if (!l && !isTool) { insp.innerHTML = '<div class="ih"><b>الخصائص</b><button type="button" class="ix" data-a="hide" title="إخفاء اللوحة" aria-label="إخفاء">✕</button></div><div class="iempty"><div class="big">◇</div><p>حدّد شكلاً لتعديل تعبئته وخطه وظله وحجمه ودورانه ونصه، أو اختر شكلاً جديداً من المعرض.</p><button type="button" class="ibtn" data-a="gallery">فتح معرض الأشكال</button><p class="tl-muted">أكثر من ' + Lib.count() + ' شكلاً: خطوط وموصلات، أسهم، مخططات انسيابية، نجوم، فقاعات، رموز رياضية وعلمية…</p></div>'; show(true); return; }
    var o = l ? l[0] : null, s = o ? def(o) : Lib.get(S.shapeKind || 'rect'), isLine = !!(s && s.line), tgt = o || { fill: style.fill, line: style.line, shadow: style.shadow, text: style.text };
    var fl = F(tgt), ln = Ln(tgt), sh = Sh(tgt), tx = Tx(tgt);
    var scroll = insp.scrollTop;
    var html = '<div class="ih"><b>' + (o ? (l.length > 1 ? l.length + ' أشكال' : s.ar) : 'النمط الافتراضي للأشكال الجديدة') + '</b>' + (o ? '' : '<small>' + (s ? s.ar : '') + '</small>') + '<button type="button" class="ix" data-a="hide" title="إخفاء اللوحة" aria-label="إخفاء">✕</button></div>';
    if (o) html += '<div class="ibtns"><button type="button" id="inspChange" data-a="change">⇄ تغيير الشكل</button>' + (isLine ? '' : '<button type="button" data-a="fx" title="قلب أفقي">⇋</button><button type="button" data-a="fy" title="قلب عمودي">⇅</button><button type="button" data-a="rl" title="تدوير 90° يسار">↺</button><button type="button" data-a="rr" title="تدوير 90° يمين">↻</button>') + '</div>';
    // quick styles
    html += sect('presets', 'أنماط سريعة', '<div class="ipre">' + PRESETS.map(function (p, i) {
      var bg = p.f.m === 'none' ? 'transparent' : p.f.m === 'lin' ? 'linear-gradient(135deg,' + p.f.c + ',' + p.f.c2 + ')' : p.f.m === 'rad' ? 'radial-gradient(' + p.f.c + ',' + p.f.c2 + ')' : p.f.m === 'hatch' ? 'repeating-linear-gradient(45deg,' + p.f.c + ' 0 1px,#fff 1px 5px)' : p.f.c;
      return '<button type="button" data-a="preset" data-i="' + i + '" title="' + p.n + '" style="background:' + bg + ';border:2px ' + (p.l.dash ? 'dashed' : 'solid') + ' ' + (p.l.c || '#000') + '"></button>'; }).join('') + '</div>', true);
    // fill
    if (!isLine || s.closed || !s.lt === 'poly' || tgt.fill) {
      if (!isLine || s.closed) html += sect('fill', 'التعبئة', row('النوع', seg('fill.m', [['none', 'بدون'], ['solid', 'لون'], ['lin', 'تدرج'], ['rad', 'دائري'], ['hatch', 'نقش']], fl.m)) +
        row(fl.m === 'hatch' ? 'لون النقش' : 'اللون', '<input type="color" data-k="fill.c" value="' + fl.c + '">' + (fl.m === 'lin' || fl.m === 'rad' ? '<input type="color" data-k="fill.c2" value="' + fl.c2 + '" title="اللون الثاني">' : fl.m === 'hatch' ? '<input type="color" data-k="fill.c2" value="' + (fl.c2 === 'none' ? '#ffffff' : fl.c2) + '" title="لون الخلفية">' : '')) +
        (fl.m === 'lin' ? row('الزاوية', '<input type="range" min="0" max="360" step="5" data-k="fill.ang" value="' + fl.ang + '"><output>' + fl.ang + '°</output>') : '') +
        (fl.m === 'hatch' ? row('النقش', '<select data-k="fill.hatch">' + opts(HATCH, fl.hatch) + '</select>') : '') +
        (fl.m !== 'none' ? row('الشفافية', '<input type="range" min="5" max="100" step="5" data-k="fill.op" data-pct="1" value="' + Math.round(fl.op * 100) + '"><output>' + Math.round(fl.op * 100) + '%</output>') : ''));
    }
    // line
    html += sect('line', isLine ? 'الخط' : 'الإطار', row('اللون', '<input type="color" data-k="line.c" value="' + ln.c + '">') +
      row('السُّمك', '<input type="number" min="0" max="40" step="0.5" data-k="line.w" value="' + ln.w + '"><span class="u">pt</span>') +
      row('النمط', '<select data-k="line.dash">' + opts(DASH_NAMES, ln.dash) + '</select>') +
      row('الأطراف', seg('line.cap', [['butt', 'مسطحة'], ['round', 'مستديرة'], ['square', 'مربعة']], ln.cap)) +
      row('الزوايا', seg('line.join', [['miter', 'حادة'], ['round', 'مستديرة'], ['bevel', 'مشطوفة']], ln.join)) +
      row('الشفافية', '<input type="range" min="5" max="100" step="5" data-k="line.op" data-pct="1" value="' + Math.round(ln.op * 100) + '"><output>' + Math.round(ln.op * 100) + '%</output>') +
      (isLine && !s.closed ? row('بداية السهم', '<select data-k="a0">' + opts(HEADS, (o && o.a0 !== undefined) ? o.a0 : s.a0) + '</select>') + row('نهاية السهم', '<select data-k="a1">' + opts(HEADS, (o && o.a1 !== undefined) ? o.a1 : s.a1) + '</select>') + row('حجم السهم', '<input type="range" min="0.5" max="3" step="0.1" data-k="sz" value="' + ((o && o.sz) || 1) + '"><output>' + (((o && o.sz) || 1) * 100 | 0) + '%</output>') : ''));
    // effects
    html += sect('fx', 'التأثيرات (الظل)', row('ظل', '<label class="itg"><input type="checkbox" data-k="shadow.on"' + (sh.on ? ' checked' : '') + '><span>تفعيل</span></label>') +
      (sh.on ? row('اللون', '<input type="color" data-k="shadow.c" value="' + sh.c + '">') + row('الشفافية', '<input type="range" min="5" max="100" step="5" data-k="shadow.op" data-pct="1" value="' + Math.round(sh.op * 100) + '"><output>' + Math.round(sh.op * 100) + '%</output>') +
        row('الإزاحة', '<input type="number" step="1" data-k="shadow.dx" value="' + sh.dx + '" title="أفقي"><input type="number" step="1" data-k="shadow.dy" value="' + sh.dy + '" title="عمودي">') +
        row('التمويه', '<input type="range" min="0" max="14" step="1" data-k="shadow.blur" value="' + sh.blur + '"><output>' + sh.blur + '</output>') : ''), false);
    // size & position
    if (o) {
      var b = bbox(o);
      html += sect('geo', 'الحجم والموضع', isLine ? row('من', '<input type="number" step="0.5" data-k="geo.x1" value="' + f2(linePts(o)[0][0]) + '"><input type="number" step="0.5" data-k="geo.y1" value="' + f2(linePts(o)[0][1]) + '">') + row('إلى', '<input type="number" step="0.5" data-k="geo.x2" value="' + f2(linePts(o).slice(-1)[0][0]) + '"><input type="number" step="0.5" data-k="geo.y2" value="' + f2(linePts(o).slice(-1)[0][1]) + '">') :
        row('الموضع', '<input type="number" step="0.5" data-k="geo.x" value="' + f2(o.x) + '" title="X"><input type="number" step="0.5" data-k="geo.y" value="' + f2(o.y) + '" title="Y">') +
        row('الحجم', '<input type="number" min="2" step="0.5" data-k="geo.w" value="' + f2(o.w) + '" title="العرض"><input type="number" min="2" step="0.5" data-k="geo.h" value="' + f2(o.h) + '" title="الارتفاع">') +
        row('التدوير', '<input type="number" min="0" max="359" step="1" data-k="geo.rot" value="' + (o.rot || 0) + '"><span class="u">°</span>') +
        row('', '<label class="itg"><input type="checkbox" id="inspKeep"' + (insp.dataset.keep === '1' ? ' checked' : '') + '><span>الحفاظ على النسبة</span></label>'), true);
    }
    // text
    if (!isLine) {
      html += sect('text', 'النص داخل الشكل', (o ? '<textarea data-k="text.s" dir="auto" rows="3" placeholder="اكتب نصاً داخل الشكل (أو انقر مرتين عليه)">' + esc(tx.s) + '</textarea>' : '') +
        row('الخط', '<select data-k="text.font">' + opts([['Amiri', 'أميري'], ['Noto Naskh Arabic', 'نسخ'], ['Scheherazade New', 'شهرزاد'], ['Cairo', 'القاهرة'], ['Noto Kufi Arabic', 'كوفي'], ['Times New Roman', 'Times'], ['Arial', 'Arial']], tx.font) + '</select>') +
        row('الحجم', '<input type="number" min="6" max="120" step="1" data-k="text.size" value="' + tx.size + '"><button type="button" class="ib2" data-k="text.bold" aria-pressed="' + !!tx.bold + '"><b>B</b></button><button type="button" class="ib2" data-k="text.italic" aria-pressed="' + !!tx.italic + '"><i>I</i></button><input type="color" data-k="text.color" value="' + tx.color + '">') +
        row('المحاذاة', seg('text.align', [['right', '⇥', 'يمين'], ['center', '↔', 'وسط'], ['left', '⇤', 'يسار']], tx.align) + seg('text.valign', [['top', '⤒', 'أعلى'], ['middle', '↕', 'منتصف'], ['bottom', '⤓', 'أسفل']], tx.valign)) +
        row('تباعد الأسطر', '<input type="range" min="1" max="2.4" step="0.1" data-k="text.lh" value="' + tx.lh + '"><output>' + tx.lh + '</output>'), !!(o && tx.s));
    }
    if (o) html += sect('arr', 'ترتيب وإجراءات', '<div class="ibtns wrap"><button type="button" data-a="front">⬆ للأمام</button><button type="button" data-a="fwd1">↑ خطوة</button><button type="button" data-a="back1">↓ خطوة</button><button type="button" data-a="back">⬇ للخلف</button>' +
      '<button type="button" data-a="hcenter">↔ توسيط أفقي</button><button type="button" data-a="vcenter">↕ توسيط عمودي</button><button type="button" data-a="dup">⧉ تكرار</button><button type="button" data-a="lock">🔒 قفل</button><button type="button" data-a="del" class="danger">🗑 حذف</button></div>', false);
    html += '<div class="ibtns"><button type="button" data-a="setdef" title="يُستخدم لكل شكل جديد">★ تعيين كنمط افتراضي</button><button type="button" data-a="copystyle" title="نسخ المظهر">نسخ المظهر</button><button type="button" data-a="pastestyle" title="لصق المظهر على المحدد">لصق المظهر</button></div>';
    var openState = {}; [].forEach.call(insp.querySelectorAll('details.isec'), function (d) { openState[d.dataset.sec] = d.open; });
    insp.innerHTML = html;
    [].forEach.call(insp.querySelectorAll('details.isec'), function (d) { if (openState[d.dataset.sec] !== undefined) d.open = openState[d.dataset.sec]; });
    insp.scrollTop = scroll;
    show(true);
  }

  var styleClip = null;
  function setPath(obj, path, v) {
    var parts = path.split('.'), t = obj;
    for (var i = 0; i < parts.length - 1; i++) { t[parts[i]] = Object.assign({}, t[parts[i]]); t = t[parts[i]]; }
    t[parts[parts.length - 1]] = v;
  }
  function commit(key, fn) {
    var l = targets();
    if (!l) { fn(null); saveStyle(); sync(); return; }
    var now = Date.now(); if (key !== lastKey || now - lastT > 1200) P.push(); lastKey = key; lastT = now;
    l.forEach(function (o) { if (!o.lock) fn(o); });
    P.changed(); P.drawOverlay(S.sel.page); P.markThumb(S.sel.page);
  }
  function applyKey(k, v) {
    commit(k, function (o) {
      if (!o) {                                  // defaults for new shapes
        if (/^(fill|line|shadow|text)\./.test(k)) setPath(style, k, v); return;
      }
      if (k === 'a0' || k === 'a1') o[k] = v;
      else if (k === 'sz') o.sz = v;
      else if (/^geo\./.test(k)) geo(o, k.slice(4), v);
      else setPath(o, k, v);
    });
  }
  function geo(o, key, v) {
    var s = def(o), keep = insp.dataset.keep === '1';
    if (s.line) {
      var pts = linePts(o);
      if (key === 'x1') { if (o.pts) o.pts[0][0] = v; else o.x1 = v; } else if (key === 'y1') { if (o.pts) o.pts[0][1] = v; else o.y1 = v; }
      else if (key === 'x2') { if (o.pts) o.pts[o.pts.length - 1][0] = v; else o.x2 = v; } else if (key === 'y2') { if (o.pts) o.pts[o.pts.length - 1][1] = v; else o.y2 = v; }
      return;
    }
    if (key === 'w') { if (keep && o.w) o.h = o.h * v / o.w; o.w = Math.max(2, v); } else if (key === 'h') { if (keep && o.h) o.w = o.w * v / o.h; o.h = Math.max(2, v); }
    else if (key === 'rot') o.rot = ((v % 360) + 360) % 360; else o[key] = v;
  }
  function onInput(e) {
    var t = e.target;
    if (t.id === 'inspKeep') { insp.dataset.keep = t.checked ? '1' : '0'; return; }
    var k = t.dataset && t.dataset.k; if (!k) return;
    var v = t.type === 'checkbox' ? t.checked : t.type === 'range' || t.type === 'number' ? parseFloat(t.value) : t.value;
    if (t.dataset.pct) v = v / 100;
    if (t.type === 'number' && isNaN(v)) return;
    if (t.tagName === 'OUTPUT') return;
    var out = t.parentNode && t.parentNode.querySelector('output'); if (out) out.textContent = t.dataset.pct ? Math.round(v * 100) + '%' : (/ang/.test(k) ? v + '°' : String(v));
    applyKey(k, v);
    // controls that change which other controls exist
    if (e.type === 'change' && (k === 'shadow.on' || k === 'a0' || k === 'a1' || k === 'line.dash' || k === 'text.s')) sync();
  }
  function onClick(e) {
    var t = e.target.closest('[data-a],[data-v],[data-k]'); if (!t) return;
    if (t.dataset.v !== undefined && t.parentNode.dataset.seg) {                  // segmented control
      var key = t.parentNode.dataset.seg, v = t.dataset.v;
      applyKey(key, v);
      if (key === 'fill.m' || key === 'text.align' || key === 'text.valign' || /^line\./.test(key)) sync();
      return;
    }
    if (t.dataset.k && t.classList.contains('ib2')) { applyKey(t.dataset.k, t.getAttribute('aria-pressed') !== 'true'); sync(); return; }
    var a = t.dataset.a; if (!a) return;
    var l = targets();
    switch (a) {
      case 'hide': setEnabled(false); break;
      case 'gallery': openGallery($('shapeBtn'), null); break;
      case 'change': openGallery(t, 'replace'); break;
      case 'fx': case 'fy': commit('flip' + a, function (o) { if (o) o[a] = !o[a]; }); sync(); break;
      case 'rl': case 'rr': commit('rot' + a, function (o) { if (o) o.rot = (((o.rot || 0) + (a === 'rr' ? 90 : -90)) % 360 + 360) % 360; }); sync(); break;
      case 'preset': applyPreset(PRESETS[+t.dataset.i]); break;
      case 'front': P.pageOrder && P.pageOrder(true); orderCmd(a); break;
      case 'back': case 'fwd1': case 'back1': orderCmd(a); break;
      case 'hcenter': case 'vcenter': if (l) { P.push(); l.forEach(function (o) { var pg = S.pages[S.sel.page], c = P.cropOf(pg), b = bbox(o), d = a === 'hcenter' ? (c.x + c.w / 2) - (b.x + b.w / 2) : (c.y + c.h / 2) - (b.y + b.h / 2); move(o, clone(o), a === 'hcenter' ? d : 0, a === 'vcenter' ? d : 0); }); P.changed(); P.drawOverlay(S.sel.page); sync(); } break;
      case 'dup': if (l) { P.alignSel && 0; document.getElementById('dupBtn').click(); } break;
      case 'lock': document.getElementById('lockBtn').click(); break;
      case 'del': document.getElementById('delBtn').click(); break;
      case 'setdef': if (l) { var o0 = l[0]; style.fill = Object.assign({}, DEF.fill, o0.fill); style.line = Object.assign({}, DEF.line, o0.line); style.shadow = Object.assign({}, DEF.shadow, o0.shadow); style.text = Object.assign({}, DEF.text, o0.text); delete style.text.s; saveStyle(); P.toast('صار هذا النمط افتراضياً للأشكال الجديدة'); } else P.toast('حدّد شكلاً أولاً'); break;
      case 'copystyle': if (l) { styleClip = clone({ fill: l[0].fill, line: l[0].line, shadow: l[0].shadow, text: l[0].text && Object.assign({}, l[0].text, { s: undefined }) }); P.toast('نُسخ المظهر'); } break;
      case 'pastestyle': if (l && styleClip) { P.push(); l.forEach(function (o) { if (o.lock) return; ['fill', 'line', 'shadow'].forEach(function (k) { if (styleClip[k]) o[k] = clone(styleClip[k]); }); if (styleClip.text) { var tt = Object.assign({}, o.text, clone(styleClip.text)); tt.s = (o.text && o.text.s) || ''; o.text = tt; } }); P.changed(); P.drawOverlay(S.sel.page); sync(); } else P.toast('انسخ مظهر شكل أولاً'); break;
    }
  }
  function applyPreset(p) {
    commit('preset', function (o) {
      var tgt = o || style;
      tgt.fill = Object.assign({}, DEF.fill, tgt.fill, p.f); tgt.line = Object.assign({}, DEF.line, tgt.line, p.l);
      if (p.s) tgt.shadow = Object.assign({}, DEF.shadow, tgt.shadow, p.s); else if (o) tgt.shadow = Object.assign({}, DEF.shadow, tgt.shadow, { on: false });
      if (p.t) tgt.text = Object.assign({}, DEF.text, tgt.text, { color: p.t }); else if (o && tgt.text && tgt.text.color === '#ffffff') tgt.text = Object.assign({}, tgt.text, { color: DEF.text.color });
    });
    sync();
  }
  function orderCmd(a) {
    var l = sel(); if (!l.length) return;
    var pg = S.pages[S.sel.page], objs = pg.objs; P.push();
    if (a === 'front') { pg.objs = objs.filter(function (x) { return l.indexOf(x) < 0; }).concat(l); }
    else if (a === 'back') { pg.objs = l.concat(objs.filter(function (x) { return l.indexOf(x) < 0; })); }
    else {
      var idx = l.map(function (x) { return objs.indexOf(x); }).sort(function (x, y) { return x - y; });
      if (a === 'fwd1') { for (var i = idx.length - 1; i >= 0; i--) { var k = idx[i]; if (k < objs.length - 1 && idx.indexOf(k + 1) < 0) { var t = objs[k]; objs[k] = objs[k + 1]; objs[k + 1] = t; idx[i] = k + 1; } } }
      else { for (var j = 0; j < idx.length; j++) { var m = idx[j]; if (m > 0 && idx.indexOf(m - 1) < 0) { var u = objs[m]; objs[m] = objs[m - 1]; objs[m - 1] = u; idx[j] = m - 1; } } }
    }
    P.changed(); P.drawOverlay(S.sel.page);
  }

  // ------------------------------------------------------------ wire-up
  function init() {
    var btn = $('shapeBtn');
    if (btn) btn.onclick = function () { if (!S.pdf) return P.toast('افتح ملف PDF أولاً'); openGallery(btn, null); };
    document.addEventListener('pdf-tool', function () { updateBtn(); sync(); });
    var ib = $('inspBtn'); if (ib) { ib.setAttribute('aria-pressed', String(enabled)); ib.onclick = function () { setEnabled(!enabled); }; }
    document.addEventListener('pdf-opened', sync);
    S.shapeKind = S.shapeKind || recent[0] || 'rect';
    updateBtn(); setTimeout(sync, 0);
  }

  window.PdfShapes = {
    inner: inner, bbox: bbox, move: move, overlay: overlay, dragHandle: dragHandle, onToolDown: onToolDown, dragDraw: dragDraw, endDraw: endDraw,
    dbl: dbl, sync: sync, editText: editText, openGallery: openGallery, inProgress: inProgress, polyFinish: polyFinish, thumb: thumbSvg, style: style, lineGeom: lineGeom,
    boxPath: function (o) { var s = def(o); return s && !s.line ? normParts(s.d(o.w, o.h, adjOf(o, s))) : null; }, init: init, newObj: newObj, def: def
  };
  init();
})();
