/* PdfShapeLib — the shape catalogue of the PDF studio (≈190 shapes in 11 families).
 *
 * Every box shape is a function (w, h, a) → path data in the shape's own w×h box, where `a` is the array of adjust values
 * (the yellow handles). A function may return one path string or a list of parts {d, f}:
 *   f: 'main' (default, the user's fill) · 'dark' / 'light' (a shaded overlay for 3-D look) · 'none' (stroke only)
 * Line shapes (lines, arrows, connectors, polylines) are described by {line:true, lt, a0, a1} and drawn from points.
 * Adjust handles: {def, min, max, pos(w,h,v) → [x,y], inv(px,py,w,h) → v}. */
(function (global) {
  'use strict';
  var PI = Math.PI;
  function n(x) { return Math.round(x * 100) / 100; }
  function pt(x, y) { return n(x) + ' ' + n(y); }
  function poly(p) { var d = 'M' + pt(p[0][0], p[0][1]); for (var i = 1; i < p.length; i++) d += 'L' + pt(p[i][0], p[i][1]); return d + 'Z'; }
  function polyOpen(p) { var d = 'M' + pt(p[0][0], p[0][1]); for (var i = 1; i < p.length; i++) d += 'L' + pt(p[i][0], p[i][1]); return d; }
  function ell(cx, cy, rx, ry) { return 'M' + pt(cx - rx, cy) + 'A' + n(rx) + ' ' + n(ry) + ' 0 1 0 ' + pt(cx + rx, cy) + 'A' + n(rx) + ' ' + n(ry) + ' 0 1 0 ' + pt(cx - rx, cy) + 'Z'; }
  function rad(d) { return d * PI / 180; }
  function ep(cx, cy, rx, ry, deg) { return [cx + rx * Math.cos(rad(deg)), cy + ry * Math.sin(rad(deg))]; }
  // arc from deg a0 to a1 (clockwise on screen); returns 'A…' to the end point (the caller has moved to the start)
  function arcTo(cx, cy, rx, ry, a0, a1) {
    var sweep = a1 - a0; while (sweep < 0) sweep += 360; while (sweep > 360) sweep -= 360;
    var e = ep(cx, cy, rx, ry, a1);
    return 'A' + n(rx) + ' ' + n(ry) + ' 0 ' + (sweep > 180 ? 1 : 0) + ' 1 ' + pt(e[0], e[1]);
  }
  function rrect(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    if (!r) return 'M' + pt(x, y) + 'H' + n(x + w) + 'V' + n(y + h) + 'H' + n(x) + 'Z';
    return 'M' + pt(x + r, y) + 'H' + n(x + w - r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + pt(x + w, y + r) + 'V' + n(y + h - r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + pt(x + w - r, y + h) +
      'H' + n(x + r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + pt(x, y + h - r) + 'V' + n(y + r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + pt(x + r, y) + 'Z';
  }
  function regular(w, h, k, rot) {
    var p = [], r0 = rot === undefined ? -90 : rot;
    for (var i = 0; i < k; i++) { var e = ep(w / 2, h / 2, w / 2, h / 2, r0 + i * 360 / k); p.push(e); }
    // scale to fill the box exactly
    var x0 = Math.min.apply(null, p.map(function (q) { return q[0]; })), x1 = Math.max.apply(null, p.map(function (q) { return q[0]; }));
    var y0 = Math.min.apply(null, p.map(function (q) { return q[1]; })), y1 = Math.max.apply(null, p.map(function (q) { return q[1]; }));
    return poly(p.map(function (q) { return [(q[0] - x0) / (x1 - x0 || 1) * w, (q[1] - y0) / (y1 - y0 || 1) * h]; }));
  }
  function star(w, h, k, ratio) {
    var p = [];
    for (var i = 0; i < k * 2; i++) p.push(ep(w / 2, h / 2, w / 2 * (i % 2 ? ratio : 1), h / 2 * (i % 2 ? ratio : 1), -90 + i * 180 / k));
    var x0 = Math.min.apply(null, p.map(function (q) { return q[0]; })), x1 = Math.max.apply(null, p.map(function (q) { return q[0]; }));
    var y0 = Math.min.apply(null, p.map(function (q) { return q[1]; })), y1 = Math.max.apply(null, p.map(function (q) { return q[1]; }));
    return poly(p.map(function (q) { return [(q[0] - x0) / (x1 - x0 || 1) * w, (q[1] - y0) / (y1 - y0 || 1) * h]; }));
  }
  function ss(w, h) { return Math.min(w, h); }
  // adjust handle factories
  function hx(def, min, max, yf) { return { def: def, min: min, max: max, pos: function (w, h, v) { return [v * w, (yf === undefined ? 0 : yf) * h]; }, inv: function (px, py, w) { return px / w; } }; }
  function hy(def, min, max, xf) { return { def: def, min: min, max: max, pos: function (w, h, v) { return [(xf === undefined ? 0 : xf) * w, v * h]; }, inv: function (px, py, w, h) { return py / h; } }; }
  function hs(def, min, max, yf) { return { def: def, min: min, max: max, pos: function (w, h, v) { return [v * ss(w, h), (yf === undefined ? 0 : yf) * h]; }, inv: function (px, py, w, h) { return px / ss(w, h); } }; }
  function hsy(def, min, max, xf) { return { def: def, min: min, max: max, pos: function (w, h, v) { return [(xf === undefined ? 0 : xf) * w, v * ss(w, h)]; }, inv: function (px, py, w, h) { return py / ss(w, h); } }; }
  function hxr(def, min, max, yf) { return { def: def, min: min, max: max, pos: function (w, h, v) { return [w - v * ss(w, h), (yf === undefined ? 0 : yf) * h]; }, inv: function (px, py, w, h) { return (w - px) / ss(w, h); } }; }
  // free handle (callout tails): value is a point in [0,1]² relative to the box (can leave it)
  function hp(dx, dy) { return { pt: true, def: [dx, dy], min: -1.5, max: 2.5, pos: function (w, h, v) { return [v[0] * w, v[1] * h]; }, inv: function (px, py, w, h) { return [px / w, py / h]; } }; }

  var CATS = [], BY = {};
  function cat(id, ar, en) { var c = { id: id, ar: ar, en: en, shapes: [] }; CATS.push(c); return c; }
  var cur = null;
  function S(id, ar, en, d, opt) {
    var s = Object.assign({ id: id, ar: ar, en: en, d: d, adj: [], cat: cur.id }, opt || {});
    cur.shapes.push(s); BY[id] = s; return s;
  }
  function L(id, ar, en, opt) {
    var s = Object.assign({ id: id, ar: ar, en: en, line: true, lt: 'straight', a0: 'none', a1: 'none', cat: cur.id }, opt || {});
    cur.shapes.push(s); BY[id] = s; return s;
  }

  // ================================================================ lines & connectors
  cur = cat('lines', 'خطوط وموصلات', 'Lines & connectors');
  L('line', 'خط مستقيم', 'Line');
  L('arrow', 'سهم', 'Arrow', { a1: 'arrow' });
  L('darrow', 'سهم مزدوج', 'Double arrow', { a0: 'arrow', a1: 'arrow' });
  L('openArrow', 'سهم مفتوح', 'Open arrow', { a1: 'open' });
  L('stealth', 'سهم حاد', 'Stealth arrow', { a1: 'stealth' });
  L('dotArrow', 'سهم بنقطة', 'Dot to arrow', { a0: 'oval', a1: 'arrow' });
  L('diamondArrow', 'سهم بمعيّن', 'Diamond arrow', { a0: 'diamond', a1: 'arrow' });
  L('dimension', 'خط قياس', 'Dimension line', { a0: 'bar', a1: 'bar', dim: true });
  L('dimArrow', 'قياس بسهمين', 'Dimension arrows', { a0: 'arrow', a1: 'arrow', dim: true });
  L('elbow', 'موصل منكسر', 'Elbow connector', { lt: 'elbow' });
  L('elbowArrow', 'موصل منكسر بسهم', 'Elbow arrow', { lt: 'elbow', a1: 'arrow' });
  L('elbowDArrow', 'منكسر بسهمين', 'Elbow double arrow', { lt: 'elbow', a0: 'arrow', a1: 'arrow' });
  L('curve', 'موصل منحني', 'Curved connector', { lt: 'curve' });
  L('curveArrow', 'منحني بسهم', 'Curved arrow', { lt: 'curve', a1: 'arrow' });
  L('curveDArrow', 'منحني بسهمين', 'Curved double arrow', { lt: 'curve', a0: 'arrow', a1: 'arrow' });
  L('arcLine', 'قوس', 'Arc line', { lt: 'arc' });
  L('arcArrow', 'قوس بسهم', 'Arc arrow', { lt: 'arc', a1: 'arrow' });
  L('polyline', 'خط متعدد النقاط', 'Polyline', { lt: 'poly', multi: true });
  L('polyArrow', 'متعدد النقاط بسهم', 'Polyline arrow', { lt: 'poly', multi: true, a1: 'arrow' });
  L('polygon', 'مضلع حر', 'Polygon', { lt: 'poly', multi: true, closed: true });
  L('cloudMarkup', 'سحابة مراجعة', 'Revision cloud', { lt: 'cloud', multi: true, closed: true });

  cur = cat('measure', 'أدوات القياس', 'Measure');
  L('measureDist', 'قياس مسافة', 'Measure distance', { a0: 'bar', a1: 'bar', dim: true, meas: 'dist' });
  L('measurePoly', 'قياس محيط', 'Measure perimeter', { lt: 'poly', multi: true, meas: 'perim' });
  L('measureArea', 'قياس مساحة', 'Measure area', { lt: 'poly', multi: true, closed: true, meas: 'area' });

  // ================================================================ basic shapes
  cur = cat('basic', 'أشكال أساسية', 'Basic shapes');
  S('rect', 'مستطيل', 'Rectangle', function (w, h) { return rrect(0, 0, w, h, 0); });
  S('roundRect', 'مستطيل بزوايا دائرية', 'Rounded rectangle', function (w, h, a) { return rrect(0, 0, w, h, a[0] * ss(w, h)); }, { adj: [hs(0.18, 0, 0.5)] });
  S('snip1', 'مستطيل بزاوية مقصوصة', 'Snip single corner', function (w, h, a) { var r = a[0] * ss(w, h); return poly([[0, 0], [w - r, 0], [w, r], [w, h], [0, h]]); }, { adj: [hxr(0.2, 0, 0.5)] });
  S('snip2same', 'مقصوص من الأعلى', 'Snip same-side corners', function (w, h, a) { var r = a[0] * ss(w, h); return poly([[r, 0], [w - r, 0], [w, r], [w, h], [0, h], [0, r]]); }, { adj: [hs(0.2, 0, 0.5)] });
  S('snip2diag', 'مقصوص قطرياً', 'Snip diagonal corners', function (w, h, a) { var r = a[0] * ss(w, h); return poly([[r, 0], [w, 0], [w, h - r], [w - r, h], [0, h], [0, r]]); }, { adj: [hs(0.2, 0, 0.5)] });
  S('snipRound', 'مقصوص ومستدير', 'Snip & round corner', function (w, h, a) { var r = a[0] * ss(w, h), q = a[1] * ss(w, h); return 'M' + pt(q, 0) + 'H' + n(w - r) + 'L' + pt(w, r) + 'V' + n(h) + 'H0V' + n(q) + 'A' + n(q) + ' ' + n(q) + ' 0 0 1 ' + pt(q, 0) + 'Z'; }, { adj: [hxr(0.2, 0, 0.5), hs(0.2, 0, 0.5)] });
  S('round1', 'زاوية مستديرة واحدة', 'Round single corner', function (w, h, a) { var r = a[0] * ss(w, h); return 'M0 0H' + n(w - r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + pt(w, r) + 'V' + n(h) + 'H0Z'; }, { adj: [hxr(0.25, 0, 1)] });
  S('round2same', 'مستدير من الأعلى', 'Round same-side corners', function (w, h, a) { var r = a[0] * ss(w, h); return 'M' + pt(r, 0) + 'H' + n(w - r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + pt(w, r) + 'V' + n(h) + 'H0V' + n(r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + pt(r, 0) + 'Z'; }, { adj: [hs(0.25, 0, 0.5)] });
  S('round2diag', 'مستدير قطرياً', 'Round diagonal corners', function (w, h, a) { var r = a[0] * ss(w, h); return 'M' + pt(r, 0) + 'H' + n(w) + 'V' + n(h - r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + pt(w - r, h) + 'H0V' + n(r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + pt(r, 0) + 'Z'; }, { adj: [hs(0.25, 0, 0.5)] });
  S('ellipse', 'بيضاوي / دائرة', 'Ellipse / circle', function (w, h) { return ell(w / 2, h / 2, w / 2, h / 2); }, { text: function (w, h) { return [w * 0.146, h * 0.146, w * 0.708, h * 0.708]; } });
  S('triangle', 'مثلث', 'Isosceles triangle', function (w, h, a) { return poly([[a[0] * w, 0], [w, h], [0, h]]); }, { adj: [hx(0.5, 0, 1, 0)], text: function (w, h) { return [w * 0.25, h * 0.5, w * 0.5, h * 0.5]; } });
  S('rtTriangle', 'مثلث قائم', 'Right triangle', function (w, h) { return poly([[0, 0], [w, h], [0, h]]); }, { text: function (w, h) { return [0, h * 0.5, w * 0.5, h * 0.5]; } });
  S('diamond', 'معيّن', 'Diamond', function (w, h) { return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]); }, { text: function (w, h) { return [w * 0.25, h * 0.25, w * 0.5, h * 0.5]; } });
  S('parallelogram', 'متوازي أضلاع', 'Parallelogram', function (w, h, a) { var r = a[0] * ss(w, h); return poly([[r, 0], [w, 0], [w - r, h], [0, h]]); }, { adj: [hs(0.25, 0, 1)] });
  S('trapezoid', 'شبه منحرف', 'Trapezoid', function (w, h, a) { var r = a[0] * ss(w, h); return poly([[r, 0], [w - r, 0], [w, h], [0, h]]); }, { adj: [hs(0.25, 0, 0.5)] });
  S('pentagon', 'خماسي', 'Regular pentagon', function (w, h) { return regular(w, h, 5); });
  S('hexagon', 'سداسي', 'Hexagon', function (w, h, a) { var r = a[0] * ss(w, h); return poly([[r, 0], [w - r, 0], [w, h / 2], [w - r, h], [r, h], [0, h / 2]]); }, { adj: [hs(0.25, 0, 0.5)] });
  S('heptagon', 'سباعي', 'Heptagon', function (w, h) { return regular(w, h, 7); });
  S('octagon', 'ثماني', 'Octagon', function (w, h, a) { var r = a[0] * ss(w, h); return poly([[r, 0], [w - r, 0], [w, r], [w, h - r], [w - r, h], [r, h], [0, h - r], [0, r]]); }, { adj: [hs(0.29, 0, 0.5)] });
  S('decagon', 'عشاري', 'Decagon', function (w, h) { return regular(w, h, 10, -90 + 18); });
  S('dodecagon', 'اثنا عشري', 'Dodecagon', function (w, h) { return regular(w, h, 12, -90 + 15); });
  S('pie', 'قطاع دائري', 'Pie', function (w, h, a) { var a0 = a[0] * 360, a1 = a[1] * 360, s = ep(w / 2, h / 2, w / 2, h / 2, a0); return 'M' + pt(w / 2, h / 2) + 'L' + pt(s[0], s[1]) + arcTo(w / 2, h / 2, w / 2, h / 2, a0, a1) + 'Z'; },
    { adj: [{ def: 0, min: 0, max: 1, pos: function (w, h, v) { return ep(w / 2, h / 2, w / 2, h / 2, v * 360); }, inv: function (px, py, w, h) { var a = Math.atan2((py - h / 2) / h, (px - w / 2) / w) * 180 / PI; return ((a + 360) % 360) / 360; } },
      { def: 0.75, min: 0, max: 1, pos: function (w, h, v) { return ep(w / 2, h / 2, w / 2, h / 2, v * 360); }, inv: function (px, py, w, h) { var a = Math.atan2((py - h / 2) / h, (px - w / 2) / w) * 180 / PI; return ((a + 360) % 360) / 360; } }] });
  S('chord', 'وتر', 'Chord', function (w, h, a) { var a0 = a[0] * 360, a1 = a[1] * 360, s = ep(w / 2, h / 2, w / 2, h / 2, a0); return 'M' + pt(s[0], s[1]) + arcTo(w / 2, h / 2, w / 2, h / 2, a0, a1) + 'Z'; },
    { adj: [{ def: 0.08, min: 0, max: 1, pos: function (w, h, v) { return ep(w / 2, h / 2, w / 2, h / 2, v * 360); }, inv: function (px, py, w, h) { var a = Math.atan2((py - h / 2) / h, (px - w / 2) / w) * 180 / PI; return ((a + 360) % 360) / 360; } },
      { def: 0.75, min: 0, max: 1, pos: function (w, h, v) { return ep(w / 2, h / 2, w / 2, h / 2, v * 360); }, inv: function (px, py, w, h) { var a = Math.atan2((py - h / 2) / h, (px - w / 2) / w) * 180 / PI; return ((a + 360) % 360) / 360; } }] });
  S('arc', 'قوس', 'Arc', function (w, h, a) { var a0 = a[0] * 360, a1 = a[1] * 360, s = ep(w / 2, h / 2, w / 2, h / 2, a0); return 'M' + pt(s[0], s[1]) + arcTo(w / 2, h / 2, w / 2, h / 2, a0, a1); },
    { open: true, adj: [{ def: 0.75, min: 0, max: 1, pos: function (w, h, v) { return ep(w / 2, h / 2, w / 2, h / 2, v * 360); }, inv: function (px, py, w, h) { var a = Math.atan2((py - h / 2) / h, (px - w / 2) / w) * 180 / PI; return ((a + 360) % 360) / 360; } },
      { def: 0, min: 0, max: 1, pos: function (w, h, v) { return ep(w / 2, h / 2, w / 2, h / 2, v * 360); }, inv: function (px, py, w, h) { var a = Math.atan2((py - h / 2) / h, (px - w / 2) / w) * 180 / PI; return ((a + 360) % 360) / 360; } }] });
  S('blockArc', 'قوس سميك', 'Block arc', function (w, h, a) {
    var t = a[0] * ss(w, h), a0 = 180, a1 = 360, o0 = ep(w / 2, h / 2, w / 2, h / 2, a0), i1 = ep(w / 2, h / 2, w / 2 - t, h / 2 - t, a1);
    return 'M' + pt(o0[0], o0[1]) + arcTo(w / 2, h / 2, w / 2, h / 2, a0, a1) + 'L' + pt(i1[0], i1[1]) + 'A' + n(w / 2 - t) + ' ' + n(h / 2 - t) + ' 0 0 0 ' + pt(w / 2 - (w / 2 - t), h / 2) + 'Z';
  }, { adj: [{ def: 0.25, min: 0.02, max: 0.48, pos: function (w, h, v) { return [v * ss(w, h), h / 2]; }, inv: function (px, py, w, h) { return px / ss(w, h); } }] });
  S('donut', 'حلقة', 'Donut', function (w, h, a) { var t = a[0] * ss(w, h); return ell(w / 2, h / 2, w / 2, h / 2) + ell(w / 2, h / 2, Math.max(1, w / 2 - t), Math.max(1, h / 2 - t)); }, { evenodd: true, adj: [hs(0.25, 0.02, 0.48, 0.5)] });
  S('noSmoking', 'ممنوع', 'No symbol', function (w, h, a) {
    var t = a[0] * ss(w, h), rx = w / 2 - t, ry = h / 2 - t, ang = Math.atan2(ry, rx), k = rad(45);
    var x1 = w / 2 + rx * Math.cos(Math.PI * 1.25) , y1 = h / 2 + ry * Math.sin(Math.PI * 1.25), x2 = w / 2 + rx * Math.cos(Math.PI * 0.25), y2 = h / 2 + ry * Math.sin(Math.PI * 0.25);
    var bar = poly([[x1 - t * 0.35, y1 - t * 0.35 + t * 0.7], [x1 + t * 0.35, y1 - t * 0.35 - t * 0.0], [x2 + t * 0.35, y2 + t * 0.35 - t * 0.7], [x2 - t * 0.35, y2 + t * 0.35]]);
    return [ell(w / 2, h / 2, w / 2, h / 2) + ell(w / 2, h / 2, rx, ry), { d: poly([[w / 2 - rx * 0.7071 - t * 0.35, h / 2 - ry * 0.7071 + t * 0.35], [w / 2 - rx * 0.7071 + t * 0.35, h / 2 - ry * 0.7071 - t * 0.35], [w / 2 + rx * 0.7071 + t * 0.35, h / 2 + ry * 0.7071 - t * 0.35], [w / 2 + rx * 0.7071 - t * 0.35, h / 2 + ry * 0.7071 + t * 0.35]]) }];
  }, { evenodd: true, adj: [hs(0.18, 0.05, 0.4, 0.5)] });
  S('teardrop', 'قطرة', 'Teardrop', function (w, h, a) { var k = a[0], rx = w / 2, ry = h / 2, tx = w / 2 + rx * k * 1.0, ty = h / 2 - ry * k * 1.0;
    return 'M' + pt(w / 2, h) + 'A' + n(rx) + ' ' + n(ry) + ' 0 0 1 ' + pt(0, h / 2) + 'A' + n(rx) + ' ' + n(ry) + ' 0 0 1 ' + pt(w / 2, 0) + 'A' + n(rx) + ' ' + n(ry) + ' 0 0 1 ' + pt(w, h / 2 - ry * 0.0) + 'L' + pt(w, 0) + 'L' + pt(w, 0) + 'L' + pt(w, h / 2) + 'A' + n(rx) + ' ' + n(ry) + ' 0 0 1 ' + pt(w / 2, h) + 'Z'; }, { adj: [hx(0.5, 0, 1, 0)] });
  S('heart', 'قلب', 'Heart', function (w, h) { return 'M' + pt(w / 2, h) + 'C' + pt(w * 0.05, h * 0.62) + ' ' + pt(-w * 0.1, h * 0.25) + ' ' + pt(w * 0.25, h * 0.08) + 'C' + pt(w * 0.4, 0.0) + ' ' + pt(w / 2, h * 0.12) + ' ' + pt(w / 2, h * 0.3) + 'C' + pt(w / 2, h * 0.12) + ' ' + pt(w * 0.6, 0) + ' ' + pt(w * 0.75, h * 0.08) + 'C' + pt(w * 1.1, h * 0.25) + ' ' + pt(w * 0.95, h * 0.62) + ' ' + pt(w / 2, h) + 'Z'; });
  S('cross', 'علامة زائد', 'Plus / cross', function (w, h, a) { var t = a[0] * ss(w, h); return poly([[t, 0], [w - t, 0], [w - t, t], [w, t], [w, h - t], [w - t, h - t], [w - t, h], [t, h], [t, h - t], [0, h - t], [0, t], [t, t]]); }, { adj: [hs(0.33, 0.05, 0.5)] });
  S('frame', 'إطار', 'Frame', function (w, h, a) { var t = a[0] * ss(w, h); return rrect(0, 0, w, h, 0) + rrect(t, t, Math.max(1, w - 2 * t), Math.max(1, h - 2 * t), 0).replace(/^M(\S+) (\S+)H(\S+)V(\S+)H(\S+)Z/, function (m0, x, y, x1, y1, x0) { return 'M' + x + ' ' + y + 'V' + y1 + 'H' + x1 + 'V' + y + 'Z'; }); }, { evenodd: true, adj: [hs(0.12, 0.02, 0.48, 0)] });
  S('halfFrame', 'نصف إطار', 'Half frame', function (w, h, a) { var t = a[0] * ss(w, h); return poly([[0, 0], [w, 0], [w - t * 1.4, t], [t, t], [t, h - t * 1.4], [0, h]]); }, { adj: [hs(0.2, 0.05, 0.5, 0)] });
  S('lShape', 'شكل L', 'L-shape', function (w, h, a) { var t = a[0] * ss(w, h); return poly([[0, 0], [t, 0], [t, h - t], [w, h - t], [w, h], [0, h]]); }, { adj: [hs(0.3, 0.05, 0.9, 0)] });
  S('diagStripe', 'شريط قطري', 'Diagonal stripe', function (w, h, a) { var t = a[0]; return poly([[0, h * (1 - t)], [w * t, 0], [w, 0], [0, h]]); }, { adj: [hx(0.5, 0.05, 0.95, 0)] });
  S('cube', 'مكعب', 'Cube', function (w, h, a) { var k = a[0] * ss(w, h);
    return [{ d: poly([[0, k], [w - k, k], [w - k, h], [0, h]]) }, { d: poly([[0, k], [k, 0], [w, 0], [w - k, k]]), f: 'light' }, { d: poly([[w - k, k], [w, 0], [w, h - k], [w - k, h]]), f: 'dark' }]; }, { adj: [hs(0.25, 0, 0.6, 0)] });
  S('can', 'أسطوانة', 'Cylinder', function (w, h, a) { var k = a[0] * ss(w, h);
    return [{ d: 'M0 ' + n(k) + 'A' + n(w / 2) + ' ' + n(k) + ' 0 0 1 ' + n(w) + ' ' + n(k) + 'V' + n(h - k) + 'A' + n(w / 2) + ' ' + n(k) + ' 0 0 1 0 ' + n(h - k) + 'Z' }, { d: ell(w / 2, k, w / 2, k), f: 'light' }]; }, { adj: [hsy(0.2, 0.05, 0.45, 0.5)], text: function (w, h) { return [0, h * 0.25, w, h * 0.65]; } });
  S('bevel', 'مشطوف', 'Bevel', function (w, h, a) { var k = a[0] * ss(w, h);
    return [{ d: rrect(0, 0, w, h, 0), f: 'main' }, { d: poly([[0, 0], [w, 0], [w - k, k], [k, k]]), f: 'light' }, { d: poly([[w, 0], [w, h], [w - k, h - k], [w - k, k]]), f: 'dark' }, { d: poly([[0, h], [w, h], [w - k, h - k], [k, h - k]]), f: 'dark' }, { d: poly([[0, 0], [k, k], [k, h - k], [0, h]]), f: 'light' }]; }, { adj: [hs(0.12, 0.02, 0.4, 0)] });
  S('foldedCorner', 'ورقة بزاوية مطوية', 'Folded corner', function (w, h, a) { var k = a[0] * ss(w, h);
    return [{ d: poly([[0, 0], [w, 0], [w, h - k], [w - k, h], [0, h]]) }, { d: poly([[w - k, h], [w - k, h - k], [w, h - k]]), f: 'dark' }]; }, { adj: [hs(0.2, 0.05, 0.6, 1)] });
  S('smiley', 'وجه مبتسم', 'Smiley face', function (w, h) {
    return [{ d: ell(w / 2, h / 2, w / 2, h / 2) }, { d: ell(w * 0.34, h * 0.38, w * 0.06, h * 0.07), f: 'dark' }, { d: ell(w * 0.66, h * 0.38, w * 0.06, h * 0.07), f: 'dark' },
      { d: 'M' + pt(w * 0.25, h * 0.62) + 'Q' + pt(w / 2, h * 0.86) + ' ' + pt(w * 0.75, h * 0.62), f: 'none' }]; });
  S('sun', 'شمس', 'Sun', function (w, h, a) {
    var parts = [], r = a[0], rx = w / 2 * (1 - r) * 0.62, ry = h / 2 * (1 - r) * 0.62;
    for (var i = 0; i < 8; i++) { var ang = i * 45 - 90, p0 = ep(w / 2, h / 2, w / 2, h / 2, ang), a1 = ep(w / 2, h / 2, w / 2 * 0.72, h / 2 * 0.72, ang - 9), a2 = ep(w / 2, h / 2, w / 2 * 0.72, h / 2 * 0.72, ang + 9); parts.push(poly([p0, a1, a2])); }
    return [parts.join(''), ell(w / 2, h / 2, rx * 1.15, ry * 1.15)];
  }, { adj: [hx(0.25, 0.1, 0.4, 0.5)] });
  S('moon', 'هلال', 'Moon', function (w, h, a) { var k = a[0] * w; return 'M' + pt(w, 0) + 'A' + n(w) + ' ' + n(h / 2) + ' 0 0 0 ' + pt(w, h) + 'A' + n(Math.max(1, w - k)) + ' ' + n(h / 2) + ' 0 0 1 ' + pt(w, 0) + 'Z'; }, { adj: [hx(0.45, 0.1, 0.9, 0.5)] });
  S('cloud', 'سحابة', 'Cloud', function (w, h) { return 'M' + pt(w * 0.2, h * 0.9) + 'A' + n(w * 0.18) + ' ' + n(h * 0.22) + ' 0 0 1 ' + pt(w * 0.17, h * 0.47) + 'A' + n(w * 0.17) + ' ' + n(h * 0.25) + ' 0 0 1 ' + pt(w * 0.42, h * 0.22) + 'A' + n(w * 0.17) + ' ' + n(h * 0.2) + ' 0 0 1 ' + pt(w * 0.72, h * 0.2) + 'A' + n(w * 0.17) + ' ' + n(h * 0.25) + ' 0 0 1 ' + pt(w * 0.85, h * 0.52) + 'A' + n(w * 0.16) + ' ' + n(h * 0.22) + ' 0 0 1 ' + pt(w * 0.78, h * 0.9) + 'Z'; }, { text: function (w, h) { return [w * 0.12, h * 0.25, w * 0.76, h * 0.6]; } });
  S('lightning', 'برق', 'Lightning bolt', function (w, h) { return poly([[w * 0.46, 0], [w * 0.8, 0], [w * 0.58, h * 0.38], [w, h * 0.38], [w * 0.28, h], [w * 0.4, h * 0.55], [0, h * 0.55]]); });
  S('plaque', 'لوحة', 'Plaque', function (w, h, a) { var k = a[0] * ss(w, h); return 'M' + pt(k, 0) + 'H' + n(w - k) + 'A' + n(k) + ' ' + n(k) + ' 0 0 0 ' + pt(w, k) + 'V' + n(h - k) + 'A' + n(k) + ' ' + n(k) + ' 0 0 0 ' + pt(w - k, h) + 'H' + n(k) + 'A' + n(k) + ' ' + n(k) + ' 0 0 0 ' + pt(0, h - k) + 'V' + n(k) + 'A' + n(k) + ' ' + n(k) + ' 0 0 0 ' + pt(k, 0) + 'Z'; }, { adj: [hs(0.16, 0, 0.5)] });
  S('gear', 'ترس', 'Gear', function (w, h, a) {
    var teeth = 8, p = [], ro = 1, ri = 0.78;
    for (var i = 0; i < teeth; i++) { var b = i * 360 / teeth - 90, s = 360 / teeth;
      [[b - s * 0.28, ri], [b - s * 0.18, ro], [b + s * 0.18, ro], [b + s * 0.28, ri]].forEach(function (q) { p.push(ep(w / 2, h / 2, w / 2 * q[1], h / 2 * q[1], q[0])); }); }
    return poly(p) + ell(w / 2, h / 2, w * 0.2, h * 0.2); }, { evenodd: true });
  S('flower', 'زهرة', 'Flower', function (w, h) { var parts = []; for (var i = 0; i < 8; i++) { var e = ep(w / 2, h / 2, w * 0.3, h * 0.3, i * 45); parts.push(ell(e[0], e[1], w * 0.2, h * 0.2)); } return [parts.join(''), { d: ell(w / 2, h / 2, w * 0.14, h * 0.14), f: 'light' }]; });
  S('pin', 'دبوس موقع', 'Location pin', function (w, h) { var r = Math.min(w / 2, h * 0.36), cy = r; return [{ d: 'M' + pt(w / 2, h) + 'C' + pt(w / 2 - r * 0.6, h * 0.62) + ' ' + pt(w / 2 - r, cy + r * 0.7) + ' ' + pt(w / 2 - r, cy) + 'A' + n(r) + ' ' + n(r) + ' 0 1 1 ' + pt(w / 2 + r, cy) + 'C' + pt(w / 2 + r, cy + r * 0.7) + ' ' + pt(w / 2 + r * 0.6, h * 0.62) + ' ' + pt(w / 2, h) + 'Z' }, { d: ell(w / 2, cy, r * 0.38, r * 0.38), f: 'light' }]; });
  // ---- brackets & braces
  cur = cat('brackets', 'أقواس', 'Brackets & braces');
  S('leftBracket', 'قوس مربع [', 'Left bracket', function (w, h, a) { var r = Math.min(w, a[0] * ss(w, h) * 2.4); return 'M' + pt(r, 0) + 'H0V' + n(h) + 'H' + n(r); }, { open: true, adj: [hs(0.3, 0.05, 1, 0.5)] });
  S('rightBracket', 'قوس مربع ]', 'Right bracket', function (w, h, a) { var r = Math.min(w, a[0] * ss(w, h) * 2.4); return 'M' + pt(w - r, 0) + 'H' + n(w) + 'V' + n(h) + 'H' + n(w - r); }, { open: true, adj: [hxr(0.3, 0.05, 1, 0.5)] });
  S('leftBrace', 'قوس معقوف {', 'Left brace', function (w, h) { return 'M' + pt(w, 0) + 'Q' + pt(w / 2, 0) + ' ' + pt(w / 2, h * 0.12) + 'V' + n(h * 0.38) + 'Q' + pt(w / 2, h / 2) + ' ' + pt(0, h / 2) + 'Q' + pt(w / 2, h / 2) + ' ' + pt(w / 2, h * 0.62) + 'V' + n(h * 0.88) + 'Q' + pt(w / 2, h) + ' ' + pt(w, h); }, { open: true });
  S('rightBrace', 'قوس معقوف }', 'Right brace', function (w, h) { return 'M0 0Q' + pt(w / 2, 0) + ' ' + pt(w / 2, h * 0.12) + 'V' + n(h * 0.38) + 'Q' + pt(w / 2, h / 2) + ' ' + pt(w, h / 2) + 'Q' + pt(w / 2, h / 2) + ' ' + pt(w / 2, h * 0.62) + 'V' + n(h * 0.88) + 'Q' + pt(w / 2, h) + ' ' + pt(0, h); }, { open: true });
  S('bracketPair', 'زوج أقواس مربعة', 'Bracket pair', function (w, h, a) { var r = Math.min(w * 0.4, a[0] * ss(w, h)); return 'M' + pt(r, 0) + 'H0V' + n(h) + 'H' + n(r) + 'M' + pt(w - r, 0) + 'H' + n(w) + 'V' + n(h) + 'H' + n(w - r); }, { open: true, adj: [hs(0.15, 0.02, 0.45, 0.5)] });
  S('bracePair', 'زوج أقواس معقوفة', 'Brace pair', function (w, h) { var r = Math.min(w * 0.12, 18); return 'M' + pt(r * 1.6, 0) + 'Q' + pt(r, 0) + ' ' + pt(r, r) + 'V' + n(h / 2 - r) + 'Q' + pt(r, h / 2) + ' ' + pt(0, h / 2) + 'Q' + pt(r, h / 2) + ' ' + pt(r, h / 2 + r) + 'V' + n(h - r) + 'Q' + pt(r, h) + ' ' + pt(r * 1.6, h) +
    'M' + pt(w - r * 1.6, 0) + 'Q' + pt(w - r, 0) + ' ' + pt(w - r, r) + 'V' + n(h / 2 - r) + 'Q' + pt(w - r, h / 2) + ' ' + pt(w, h / 2) + 'Q' + pt(w - r, h / 2) + ' ' + pt(w - r, h / 2 + r) + 'V' + n(h - r) + 'Q' + pt(w - r, h) + ' ' + pt(w - r * 1.6, h); }, { open: true });
  S('leftParen', 'قوس هلالي (', 'Left parenthesis', function (w, h) { return 'M' + pt(w, 0) + 'Q' + pt(0, h / 2) + ' ' + pt(w, h); }, { open: true });
  S('rightParen', 'قوس هلالي )', 'Right parenthesis', function (w, h) { return 'M0 0Q' + pt(w, h / 2) + ' ' + pt(0, h); }, { open: true });
  S('parenPair', 'زوج أقواس هلالية', 'Parenthesis pair', function (w, h) { return 'M' + pt(w * 0.2, 0) + 'Q' + pt(-w * 0.1, h / 2) + ' ' + pt(w * 0.2, h) + 'M' + pt(w * 0.8, 0) + 'Q' + pt(w * 1.1, h / 2) + ' ' + pt(w * 0.8, h); }, { open: true });

  // ================================================================ block arrows
  cur = cat('arrows', 'أسهم', 'Block arrows');
  function hArrow(w, h, a, flip) { var hd = a[1] * ss(w, h), t = a[0] * h, y0 = (h - t) / 2, y1 = (h + t) / 2, hx2 = Math.max(0, w - Math.min(hd, w));
    var p = [[0, y0], [hx2, y0], [hx2, 0], [w, h / 2], [hx2, h], [hx2, y1], [0, y1]];
    return poly(flip ? p.map(function (q) { return [w - q[0], q[1]]; }) : p); }
  var arrAdj = [{ def: 0.5, min: 0.05, max: 1, pos: function (w, h, v) { return [w / 2, (h - v * h) / 2]; }, inv: function (px, py, w, h) { return (h - 2 * py) / h; } }, { def: 0.5, min: 0, max: 1, pos: function (w, h, v) { return [w - v * ss(w, h), 0]; }, inv: function (px, py, w, h) { return (w - px) / ss(w, h); } }];
  S('rightArrow', 'سهم يمين', 'Right arrow', function (w, h, a) { return hArrow(w, h, a, false); }, { adj: arrAdj });
  S('leftArrow', 'سهم يسار', 'Left arrow', function (w, h, a) { return hArrow(w, h, a, true); }, { adj: [arrAdj[0], { def: 0.5, min: 0, max: 1, pos: function (w, h, v) { return [v * ss(w, h), 0]; }, inv: function (px, py, w, h) { return px / ss(w, h); } }] });
  function vArrow(w, h, a, flip) { var hd = a[1] * ss(w, h), t = a[0] * w, x0 = (w - t) / 2, x1 = (w + t) / 2, hy2 = Math.max(0, h - Math.min(hd, h));
    var p = [[x0, 0], [x0, hy2], [0, hy2], [w / 2, h], [w, hy2], [x1, hy2], [x1, 0]];
    return poly(flip ? p.map(function (q) { return [q[0], h - q[1]]; }) : p); }
  var vAdj = [{ def: 0.5, min: 0.05, max: 1, pos: function (w, h, v) { return [(w - v * w) / 2, h / 2]; }, inv: function (px, py, w) { return (w - 2 * px) / w; } }];
  S('downArrow', 'سهم أسفل', 'Down arrow', function (w, h, a) { return vArrow(w, h, a, false); }, { adj: vAdj.concat([{ def: 0.5, min: 0, max: 1, pos: function (w, h, v) { return [0, h - v * ss(w, h)]; }, inv: function (px, py, w, h) { return (h - py) / ss(w, h); } }]) });
  S('upArrow', 'سهم أعلى', 'Up arrow', function (w, h, a) { return vArrow(w, h, a, true); }, { adj: vAdj.concat([{ def: 0.5, min: 0, max: 1, pos: function (w, h, v) { return [0, v * ss(w, h)]; }, inv: function (px, py, w, h) { return py / ss(w, h); } }]) });
  S('leftRightArrow', 'سهم يمين ويسار', 'Left-right arrow', function (w, h, a) { var hd = Math.min(a[1] * ss(w, h), w / 2), t = a[0] * h, y0 = (h - t) / 2, y1 = (h + t) / 2; return poly([[0, h / 2], [hd, 0], [hd, y0], [w - hd, y0], [w - hd, 0], [w, h / 2], [w - hd, h], [w - hd, y1], [hd, y1], [hd, h]]); }, { adj: [arrAdj[0], { def: 0.4, min: 0, max: 1, pos: function (w, h, v) { return [w - v * ss(w, h), 0]; }, inv: function (px, py, w, h) { return (w - px) / ss(w, h); } }] });
  S('upDownArrow', 'سهم أعلى وأسفل', 'Up-down arrow', function (w, h, a) { var hd = Math.min(a[1] * ss(w, h), h / 2), t = a[0] * w, x0 = (w - t) / 2, x1 = (w + t) / 2; return poly([[w / 2, 0], [w, hd], [x1, hd], [x1, h - hd], [w, h - hd], [w / 2, h], [0, h - hd], [x0, h - hd], [x0, hd], [0, hd]]); }, { adj: [vAdj[0], { def: 0.4, min: 0, max: 1, pos: function (w, h, v) { return [0, h - v * ss(w, h)]; }, inv: function (px, py, w, h) { return (h - py) / ss(w, h); } }] });
  S('quadArrow', 'أربعة أسهم', 'Quad arrow', function (w, h, a) { var t = a[0] * ss(w, h) / 2, hd = a[1] * ss(w, h), cx = w / 2, cy = h / 2; return poly([[cx, 0], [cx + hd * 0.7, hd], [cx + t, hd], [cx + t, cy - t], [w - hd, cy - t], [w - hd, cy - hd * 0.7], [w, cy], [w - hd, cy + hd * 0.7], [w - hd, cy + t], [cx + t, cy + t], [cx + t, h - hd], [cx + hd * 0.7, h - hd], [cx, h], [cx - hd * 0.7, h - hd], [cx - t, h - hd], [cx - t, cy + t], [hd, cy + t], [hd, cy + hd * 0.7], [0, cy], [hd, cy - hd * 0.7], [hd, cy - t], [cx - t, cy - t], [cx - t, hd], [cx - hd * 0.7, hd]]); }, { adj: [hs(0.22, 0.05, 0.5, 0.5), hs(0.2, 0.1, 0.4, 0)] });
  S('leftRightUpArrow', 'ثلاثة أسهم', 'Left-right-up arrow', function (w, h, a) { var t = a[0] * ss(w, h) / 2, hd = a[1] * ss(w, h), cx = w / 2, cy = h * 0.62; return poly([[cx, 0], [cx + hd * 0.7, hd], [cx + t, hd], [cx + t, cy - t], [w - hd, cy - t], [w - hd, cy - hd * 0.7], [w, cy], [w - hd, cy + hd * 0.7], [w - hd, cy + t], [cx + t, cy + t], [cx + t, h], [cx - t, h], [cx - t, cy + t], [hd, cy + t], [hd, cy + hd * 0.7], [0, cy], [hd, cy - hd * 0.7], [hd, cy - t], [cx - t, cy - t], [cx - t, hd], [cx - hd * 0.7, hd]]); }, { adj: [hs(0.22, 0.05, 0.5, 0.5), hs(0.2, 0.1, 0.4, 0)] });
  S('leftUpArrow', 'سهم يسار وأعلى', 'Left-up arrow', function (w, h, a) { var t = a[0] * ss(w, h), hd = a[1] * ss(w, h); return poly([[0, h - hd], [hd, h - 2 * hd], [hd, h - hd - t / 2 - 0], [w - hd - t / 2, h - hd - t / 2], [w - hd - t / 2, hd], [w - 2 * hd + 0, hd], [w - hd, 0], [w, hd], [w - hd + t / 2, hd], [w - hd + t / 2, h - hd + t / 2], [hd, h - hd + t / 2], [hd, h]].map(function (q, i) { return q; }).slice(0, 0).concat([[0, h - hd], [hd, h - 2 * hd + 0], [hd, h - hd - t / 2], [w - hd - t / 2, h - hd - t / 2], [w - hd - t / 2, hd], [w - 2 * hd, hd], [w - hd, 0], [w, hd], [w - hd + t / 2, hd], [w - hd + t / 2, h - hd + t / 2], [hd, h - hd + t / 2], [hd, h]])); }, { adj: [hs(0.18, 0.05, 0.4, 0.5), hs(0.22, 0.1, 0.4, 0)] });
  S('bentArrow', 'سهم منحني الزاوية', 'Bent arrow', function (w, h, a) { var t = a[0] * ss(w, h), hd = a[1] * ss(w, h); return poly([[0, h], [0, hd + t / 2 - t / 2 + hd * 0.5], [w - hd, hd * 0.5 + 0], [w - hd, 0], [w, hd * 0.5 + t * 0.0 + hd * 0.0], [w - hd, hd], [w - hd, hd * 0.5 + t], [t, hd * 0.5 + t], [t, h]].slice(0, 0).concat([[0, h], [0, hd], [w - hd, hd], [w - hd, 0], [w, hd + t / 2], [w - hd, 2 * hd + t], [w - hd, hd + t], [t, hd + t], [t, h]])); }, { adj: [hs(0.2, 0.05, 0.35, 1), hs(0.22, 0.1, 0.4, 0)] });
  S('uturnArrow', 'سهم دوران', 'U-turn arrow', function (w, h, a) { var t = a[0] * ss(w, h), hd = a[1] * ss(w, h), R = (w - hd * 0) * 0.5 - 0, r = Math.max(t, w * 0.2), x1 = w - hd, y0 = t;
    return 'M0 ' + n(h) + 'V' + n(r + t) + 'A' + n(r + t) + ' ' + n(r + t) + ' 0 0 1 ' + pt(r + t, 0) + 'H' + n(x1 - r) + 'A' + n(r + t) + ' ' + n(r + t) + ' 0 0 1 ' + pt(x1 + t, r + t) + 'V' + n(h * 0.55) + 'H' + n(w) + 'L' + pt(x1 + t / 2, h * 0.55 + hd * 1.1) + 'L' + pt(x1 - hd + t, h * 0.55) + 'H' + n(x1) + 'V' + n(r + t) + 'A' + n(r) + ' ' + n(r) + ' 0 0 0 ' + pt(x1 - r, t) + 'H' + n(r + t) + 'A' + n(r) + ' ' + n(r) + ' 0 0 0 ' + pt(t, r + t) + 'V' + n(h) + 'Z'; }, { adj: [hs(0.2, 0.05, 0.3, 1), hs(0.25, 0.1, 0.5, 0)] });
  S('curvedRightArrow', 'سهم منحني', 'Curved arrow', function (w, h) { return 'M' + pt(0, h) + 'C' + pt(0, h * 0.35) + ' ' + pt(w * 0.3, h * 0.12) + ' ' + pt(w * 0.62, h * 0.12) + 'V0L' + pt(w, h * 0.25) + 'L' + pt(w * 0.62, h * 0.5) + 'V' + n(h * 0.38) + 'C' + pt(w * 0.4, h * 0.38) + ' ' + pt(w * 0.28, h * 0.55) + ' ' + pt(w * 0.28, h) + 'Z'; });
  S('stripedRightArrow', 'سهم مخطط', 'Striped arrow', function (w, h, a) { var t = a[0] * h, y0 = (h - t) / 2, y1 = (h + t) / 2, hd = Math.min(a[1] * ss(w, h), w * 0.6), sx = w * 0.18;
    return poly([[0, y0], [sx * 0.4, y0], [sx * 0.4, y1], [0, y1]]) + poly([[sx * 0.6, y0], [sx * 1.0, y0], [sx * 1.0, y1], [sx * 0.6, y1]]) + poly([[sx * 1.3, y0], [w - hd, y0], [w - hd, 0], [w, h / 2], [w - hd, h], [w - hd, y1], [sx * 1.3, y1]]); }, { adj: [arrAdj[0], arrAdj[1]] });
  S('notchedRightArrow', 'سهم بشق', 'Notched arrow', function (w, h, a) { var t = a[0] * h, y0 = (h - t) / 2, y1 = (h + t) / 2, hd = Math.min(a[1] * ss(w, h), w * 0.7), nt = t * 0.5; return poly([[0, y0], [w - hd, y0], [w - hd, 0], [w, h / 2], [w - hd, h], [w - hd, y1], [0, y1], [nt, h / 2]]); }, { adj: [arrAdj[0], arrAdj[1]] });
  S('homePlate', 'سهم مخمّس', 'Pentagon arrow', function (w, h, a) { var k = Math.min(a[0] * ss(w, h), w); return poly([[0, 0], [w - k, 0], [w, h / 2], [w - k, h], [0, h]]); }, { adj: [hxr(0.5, 0, 1, 0)] });
  S('chevron', 'شيفرون', 'Chevron', function (w, h, a) { var k = Math.min(a[0] * ss(w, h), w); return poly([[0, 0], [w - k, 0], [w, h / 2], [w - k, h], [0, h], [k, h / 2]]); }, { adj: [hxr(0.5, 0, 1, 0)] });
  function calloutArrow(dir) {
    return function (w, h, a) {
      var bx = dir === 'r' ? w * 0.62 : dir === 'l' ? w * 0.38 : w, by = dir === 'd' ? h * 0.6 : dir === 'u' ? h * 0.4 : h, t = a[0] * ss(w, h), hd = a[1] * ss(w, h);
      if (dir === 'r') return poly([[0, 0], [bx, 0], [bx, h / 2 - t], [w - hd, h / 2 - t], [w - hd, h / 2 - hd], [w, h / 2], [w - hd, h / 2 + hd], [w - hd, h / 2 + t], [bx, h / 2 + t], [bx, h], [0, h]]);
      if (dir === 'l') return poly([[w, 0], [bx, 0], [bx, h / 2 - t], [hd, h / 2 - t], [hd, h / 2 - hd], [0, h / 2], [hd, h / 2 + hd], [hd, h / 2 + t], [bx, h / 2 + t], [bx, h], [w, h]]);
      if (dir === 'd') return poly([[0, 0], [w, 0], [w, by], [w / 2 + t, by], [w / 2 + t, h - hd], [w / 2 + hd, h - hd], [w / 2, h], [w / 2 - hd, h - hd], [w / 2 - t, h - hd], [w / 2 - t, by], [0, by]]);
      return poly([[0, h], [w, h], [w, by], [w / 2 + t, by], [w / 2 + t, hd], [w / 2 + hd, hd], [w / 2, 0], [w / 2 - hd, hd], [w / 2 - t, hd], [w / 2 - t, by], [0, by]]);
    };
  }
  var coAdj = [hs(0.12, 0.03, 0.3, 0.5), hs(0.2, 0.1, 0.4, 0)];
  S('rightArrowCallout', 'لوحة بسهم يمين', 'Right arrow callout', calloutArrow('r'), { adj: coAdj });
  S('leftArrowCallout', 'لوحة بسهم يسار', 'Left arrow callout', calloutArrow('l'), { adj: coAdj });
  S('upArrowCallout', 'لوحة بسهم أعلى', 'Up arrow callout', calloutArrow('u'), { adj: coAdj });
  S('downArrowCallout', 'لوحة بسهم أسفل', 'Down arrow callout', calloutArrow('d'), { adj: coAdj });
  S('circularArrow', 'سهم دائري', 'Circular arrow', function (w, h, a) { var t = a[0] * ss(w, h), rx = w / 2, ry = h / 2, a0 = 200, a1 = 340 + 70, hd = t * 1.7, e = ep(w / 2, h / 2, rx - t / 2, ry - t / 2, a1);
    var o0 = ep(w / 2, h / 2, rx, ry, a0), i0 = ep(w / 2, h / 2, rx - t, ry - t, a0), o1 = ep(w / 2, h / 2, rx, ry, a1 - 22), i1 = ep(w / 2, h / 2, rx - t, ry - t, a1 - 22), tip = ep(w / 2, h / 2, rx - t / 2, ry - t / 2, a1);
    return 'M' + pt(o0[0], o0[1]) + arcTo(rx0(w, h), ry0(w, h), 0, 0, 0, 0).replace(/.*/, '') + 'A' + n(rx) + ' ' + n(ry) + ' 0 1 1 ' + pt(o1[0], o1[1]) + 'L' + pt(w / 2 + (o1[0] - w / 2) * 1.14, h / 2 + (o1[1] - h / 2) * 1.14) + 'L' + pt(tip[0], tip[1]) + 'L' + pt(w / 2 + (i1[0] - w / 2) * 0.86, h / 2 + (i1[1] - h / 2) * 0.86) + 'L' + pt(i1[0], i1[1]) + 'A' + n(rx - t) + ' ' + n(ry - t) + ' 0 1 0 ' + pt(i0[0], i0[1]) + 'Z'; }, { adj: [hs(0.14, 0.05, 0.3, 0.5)] });
  function rx0() { return 0; } function ry0() { return 0; }

  // ================================================================ flowchart
  cur = cat('flow', 'مخططات انسيابية', 'Flowchart');
  S('fProcess', 'عملية', 'Process', function (w, h) { return rrect(0, 0, w, h, 0); });
  S('fAltProcess', 'عملية بديلة', 'Alternate process', function (w, h) { return rrect(0, 0, w, h, Math.min(w, h) * 0.16); });
  S('fDecision', 'قرار', 'Decision', function (w, h) { return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]); }, { text: function (w, h) { return [w * 0.25, h * 0.25, w * 0.5, h * 0.5]; } });
  S('fData', 'بيانات', 'Data', function (w, h) { var k = w * 0.2; return poly([[k, 0], [w, 0], [w - k, h], [0, h]]); });
  S('fPredefined', 'عملية معرّفة مسبقاً', 'Predefined process', function (w, h) { var k = w * 0.12; return [{ d: rrect(0, 0, w, h, 0) }, { d: 'M' + pt(k, 0) + 'V' + n(h) + 'M' + pt(w - k, 0) + 'V' + n(h), f: 'none' }]; });
  S('fInternal', 'تخزين داخلي', 'Internal storage', function (w, h) { var k = Math.min(w, h) * 0.18; return [{ d: rrect(0, 0, w, h, 0) }, { d: 'M' + pt(k, 0) + 'V' + n(h) + 'M0 ' + n(k) + 'H' + n(w), f: 'none' }]; });
  S('fDocument', 'مستند', 'Document', function (w, h) { return 'M0 0H' + n(w) + 'V' + n(h * 0.82) + 'C' + pt(w * 0.75, h * 0.62) + ' ' + pt(w * 0.5, h * 1.02) + ' ' + pt(0, h * 0.84) + 'Z'; }, { text: function (w, h) { return [0, 0, w, h * 0.8]; } });
  S('fMultiDoc', 'مستندات متعددة', 'Multidocument', function (w, h) { var o = Math.min(w, h) * 0.08, W = w - 2 * o, H = h - 2 * o; function doc(x, y) { return 'M' + pt(x, y) + 'h' + n(W) + 'v' + n(H * 0.82) + 'C' + pt(x + W * 0.75, y + H * 0.62) + ' ' + pt(x + W * 0.5, y + H * 1.02) + ' ' + pt(x, y + H * 0.84) + 'Z'; } return doc(2 * o, 0) + doc(o, o) + doc(0, 2 * o); });
  S('fTerminator', 'بداية / نهاية', 'Terminator', function (w, h) { return rrect(0, 0, w, h, h / 2); });
  S('fPreparation', 'تحضير', 'Preparation', function (w, h) { var k = w * 0.18; return poly([[k, 0], [w - k, 0], [w, h / 2], [w - k, h], [k, h], [0, h / 2]]); });
  S('fManualInput', 'إدخال يدوي', 'Manual input', function (w, h) { return poly([[0, h * 0.2], [w, 0], [w, h], [0, h]]); }, { text: function (w, h) { return [0, h * 0.2, w, h * 0.8]; } });
  S('fManualOp', 'عملية يدوية', 'Manual operation', function (w, h) { var k = w * 0.1; return poly([[0, 0], [w, 0], [w - k, h], [k, h]]); });
  S('fConnector', 'موصل', 'Connector', function (w, h) { return ell(w / 2, h / 2, w / 2, h / 2); });
  S('fOffPage', 'موصل خارج الصفحة', 'Off-page connector', function (w, h) { return poly([[0, 0], [w, 0], [w, h * 0.7], [w / 2, h], [0, h * 0.7]]); });
  S('fCard', 'بطاقة', 'Card', function (w, h) { var k = Math.min(w, h) * 0.22; return poly([[k, 0], [w, 0], [w, h], [0, h], [0, k]]); });
  S('fPunchedTape', 'شريط مثقب', 'Punched tape', function (w, h) { return 'M0 ' + n(h * 0.12) + 'C' + pt(w * 0.25, -h * 0.1) + ' ' + pt(w * 0.25, h * 0.3) + ' ' + pt(w / 2, h * 0.12) + 'S' + pt(w * 0.8, -h * 0.1) + ' ' + pt(w, h * 0.12) + 'V' + n(h * 0.88) + 'C' + pt(w * 0.75, h * 1.1) + ' ' + pt(w * 0.75, h * 0.7) + ' ' + pt(w / 2, h * 0.88) + 'S' + pt(w * 0.2, h * 1.1) + ' ' + pt(0, h * 0.88) + 'Z'; });
  S('fSumJunction', 'تقاطع جمع', 'Summing junction', function (w, h) { var q = 0.1464; return [{ d: ell(w / 2, h / 2, w / 2, h / 2) }, { d: 'M' + pt(w * q, h * q) + 'L' + pt(w * (1 - q), h * (1 - q)) + 'M' + pt(w * (1 - q), h * q) + 'L' + pt(w * q, h * (1 - q)), f: 'none' }]; });
  S('fOr', 'أو', 'Or', function (w, h) { return [{ d: ell(w / 2, h / 2, w / 2, h / 2) }, { d: 'M' + pt(w / 2, 0) + 'V' + n(h) + 'M0 ' + n(h / 2) + 'H' + n(w), f: 'none' }]; });
  S('fCollate', 'دمج ترتيبي', 'Collate', function (w, h) { return poly([[0, 0], [w, 0], [0, h], [w, h]]); });
  S('fSort', 'فرز', 'Sort', function (w, h) { return [{ d: poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]) }, { d: 'M0 ' + n(h / 2) + 'H' + n(w), f: 'none' }]; });
  S('fExtract', 'استخراج', 'Extract', function (w, h) { return poly([[w / 2, 0], [w, h], [0, h]]); }, { text: function (w, h) { return [w * 0.25, h * 0.5, w * 0.5, h * 0.5]; } });
  S('fMerge', 'دمج', 'Merge', function (w, h) { return poly([[0, 0], [w, 0], [w / 2, h]]); }, { text: function (w, h) { return [w * 0.25, 0, w * 0.5, h * 0.5]; } });
  S('fStoredData', 'بيانات مخزنة', 'Stored data', function (w, h) { var k = w * 0.14; return 'M' + pt(k, 0) + 'H' + n(w) + 'Q' + pt(w - k, h / 2) + ' ' + pt(w, h) + 'H' + n(k) + 'Q' + pt(0, h / 2) + ' ' + pt(k, 0) + 'Z'; });
  S('fDelay', 'تأخير', 'Delay', function (w, h) { return 'M0 0H' + n(w / 2) + 'A' + n(w / 2) + ' ' + n(h / 2) + ' 0 0 1 ' + pt(w / 2, h) + 'H0Z'; });
  S('fSequential', 'وصول تتابعي', 'Sequential access', function (w, h) { var r = Math.min(w, h) / 2; return [{ d: ell(w / 2, h / 2, w / 2, h / 2) }, { d: 'M' + pt(w / 2, h) + 'H' + n(w) + 'V' + n(h) + 'H' + n(w / 2 + r * 0.5), f: 'none' }]; });
  S('fMagneticDisk', 'قرص مغناطيسي', 'Magnetic disk', function (w, h) { var k = h * 0.16; return [{ d: 'M0 ' + n(k) + 'A' + n(w / 2) + ' ' + n(k) + ' 0 0 1 ' + n(w) + ' ' + n(k) + 'V' + n(h - k) + 'A' + n(w / 2) + ' ' + n(k) + ' 0 0 1 0 ' + n(h - k) + 'Z' }, { d: ell(w / 2, k, w / 2, k), f: 'light' }]; });
  S('fDirectAccess', 'تخزين مباشر', 'Direct access storage', function (w, h) { var k = w * 0.2; return [{ d: 'M' + pt(k, 0) + 'H' + n(w - k) + 'A' + n(k) + ' ' + n(h / 2) + ' 0 0 1 ' + pt(w - k, h) + 'H' + n(k) + 'A' + n(k) + ' ' + n(h / 2) + ' 0 0 1 ' + pt(k, 0) + 'Z' }, { d: 'M' + pt(w - k, 0) + 'A' + n(k) + ' ' + n(h / 2) + ' 0 0 0 ' + pt(w - k, h), f: 'none' }]; });
  S('fDisplay', 'عرض', 'Display', function (w, h) { var k = w * 0.16; return 'M0 ' + n(h / 2) + 'L' + pt(k, 0) + 'H' + n(w - k) + 'A' + n(k) + ' ' + n(h / 2) + ' 0 0 1 ' + pt(w - k, h) + 'H' + n(k) + 'Z'; });

  // ================================================================ stars & banners
  cur = cat('stars', 'نجوم ولافتات', 'Stars & banners');
  [[4, 0.38], [5, 0.382], [6, 0.5], [7, 0.45], [8, 0.62], [10, 0.7], [12, 0.78], [16, 0.82], [24, 0.88], [32, 0.9]].forEach(function (k) {
    S('star' + k[0], 'نجمة ' + k[0] + ' رؤوس', k[0] + '-point star', function (w, h, a) { return star(w, h, k[0], a[0]); }, { adj: [{ def: k[1], min: 0.1, max: 0.98, pos: function (w, h, v) { return [w / 2 + w / 2 * v * Math.cos(rad(-90 + 180 / k[0])), h / 2 + h / 2 * v * Math.sin(rad(-90 + 180 / k[0]))]; }, inv: function (px, py, w, h) { return Math.hypot((px - w / 2) / (w / 2), (py - h / 2) / (h / 2)); } }] });
  });
  S('burst1', 'انفجار 1', 'Explosion 1', function (w, h) { var p = [], k = 12; for (var i = 0; i < k * 2; i++) { var r = i % 2 ? 0.55 : 1, jit = i % 4 === 0 ? 1 : i % 4 === 2 ? 0.92 : 1; p.push(ep(w / 2, h / 2, w / 2 * r * jit, h / 2 * r * jit, -90 + i * 180 / k + (i % 2 ? 4 : 0))); } return poly(p); });
  S('burst2', 'انفجار 2', 'Explosion 2', function (w, h) { var p = [], k = 9; for (var i = 0; i < k * 2; i++) { var r = i % 2 ? 0.45 : [1, 0.85, 0.95][((i / 2) | 0) % 3]; p.push(ep(w / 2, h / 2, w / 2 * r, h / 2 * r, -90 + i * 180 / k)); } return poly(p); });
  S('ribbonUp', 'شريط لافتة', 'Ribbon', function (w, h, a) { var f = w * 0.16, t = h * 0.22, b = h * 0.78;
    return [{ d: poly([[f, t], [w - f, t], [w - f, b], [f, b]]) }, { d: poly([[0, t * 0.6], [f, t * 0.6 + 0], [f, b + t * 0.25], [0, b + t * 0.25], [f * 0.45, (t * 0.6 + b + t * 0.25) / 2]]), f: 'dark' }, { d: poly([[w, t * 0.6], [w - f, t * 0.6], [w - f, b + t * 0.25], [w, b + t * 0.25], [w - f * 0.45, (t * 0.6 + b + t * 0.25) / 2]]), f: 'dark' }]; }, { text: function (w, h) { return [w * 0.18, h * 0.22, w * 0.64, h * 0.56]; } });
  S('ribbonDown', 'شريط مطوي', 'Folded ribbon', function (w, h) { var f = w * 0.14, t = h * 0.18;
    return [{ d: poly([[f, 0], [w - f, 0], [w - f, h * 0.62], [f, h * 0.62]]) }, { d: poly([[0, t], [f, t], [f, h * 0.62 + t], [0, h * 0.62 + t], [f * 0.5, (t + h * 0.62 + t) / 2]]), f: 'dark' }, { d: poly([[w, t], [w - f, t], [w - f, h * 0.62 + t], [w, h * 0.62 + t], [w - f * 0.5, (t + h * 0.62 + t) / 2]]), f: 'dark' }]; }, { text: function (w, h) { return [w * 0.16, 0, w * 0.68, h * 0.62]; } });
  S('vScroll', 'لفافة عمودية', 'Vertical scroll', function (w, h) { var k = Math.min(w, h) * 0.12;
    return [{ d: 'M' + pt(k, k) + 'V' + n(h - k) + 'H' + n(w - k) + 'V' + n(k) + 'Z' }, { d: ell(w / 2, k * 0.5, w / 2, k * 0.5), f: 'dark' }, { d: ell(w / 2, h - k * 0.5, w / 2, k * 0.5), f: 'dark' }]; }, { text: function (w, h) { return [w * 0.08, h * 0.12, w * 0.84, h * 0.76]; } });
  S('hScroll', 'لفافة أفقية', 'Horizontal scroll', function (w, h) { var k = Math.min(w, h) * 0.12;
    return [{ d: 'M' + pt(k, k) + 'H' + n(w - k) + 'V' + n(h - k) + 'H' + n(k) + 'Z' }, { d: ell(k, h / 2, k, h / 2 - k * 0.0), f: 'dark' }, { d: ell(w - k, h / 2, k, h / 2), f: 'dark' }]; }, { text: function (w, h) { return [w * 0.1, h * 0.12, w * 0.8, h * 0.76]; } });
  S('wave', 'موجة', 'Wave', function (w, h, a) { var k = a[0] * h; return 'M0 ' + n(k) + 'C' + pt(w * 0.25, -k * 0.2) + ' ' + pt(w * 0.25, k * 2.2) + ' ' + pt(w / 2, k) + 'S' + pt(w * 0.85, -k * 0.2) + ' ' + pt(w, k) + 'V' + n(h - k) + 'C' + pt(w * 0.75, h - k * 2.2) + ' ' + pt(w * 0.75, h + k * 0.2) + ' ' + pt(w / 2, h - k) + 'S' + pt(w * 0.15, h - k * 2.2) + ' ' + pt(0, h - k) + 'Z'; }, { adj: [hy(0.12, 0.03, 0.2, 0.5)] });
  S('doubleWave', 'موجة مزدوجة', 'Double wave', function (w, h, a) { var k = a[0] * h; return 'M0 ' + n(k) + 'C' + pt(w * 0.17, -k * 0.5) + ' ' + pt(w * 0.17, k * 2.5) + ' ' + pt(w * 0.33, k) + 'S' + pt(w * 0.5, -k * 0.5) + ' ' + pt(w * 0.67, k) + 'S' + pt(w * 0.83, k * 2.5) + ' ' + pt(w, k) + 'V' + n(h - k) + 'C' + pt(w * 0.83, h - k * 2.5) + ' ' + pt(w * 0.83, h + k * 0.5) + ' ' + pt(w * 0.67, h - k) + 'S' + pt(w * 0.5, h - k * 2.5) + ' ' + pt(w * 0.33, h - k) + 'S' + pt(w * 0.17, h + k * 0.5) + ' ' + pt(0, h - k) + 'Z'; }, { adj: [hy(0.1, 0.03, 0.18, 0.5)] });

  // ================================================================ callouts
  cur = cat('callouts', 'فقاعات وتعليقات', 'Callouts');
  function wedge(w, h, tx, ty, body, r) {
    // a rounded/plain rectangle body with a triangular tail to (tx,ty) (in box units)
    var cx = w / 2, cy = h / 2, dx = tx - cx, dy = ty - cy, tailW = Math.min(w, h) * 0.22;
    var side = Math.abs(dx / w) > Math.abs(dy / h) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'b' : 't');
    r = Math.min(r || 0, w / 2, h / 2);
    var pts = [];
    function seg(p) { pts.push(p); }
    // walk the rectangle clockwise, inserting the tail on the proper side
    var f = side === 't' ? clamp(0.5 + dx / w * 0.4, 0.25, 0.75) : side === 'b' ? clamp(0.5 + dx / w * 0.4, 0.25, 0.75) : clamp(0.5 + dy / h * 0.4, 0.25, 0.75);
    var d = 'M' + pt(r, 0);
    if (side === 't') d += 'H' + n(f * w - tailW) + 'L' + pt(tx, ty) + 'L' + pt(f * w + tailW * 0.2, 0);
    d += 'H' + n(w - r) + (r ? 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + pt(w, r) : '');
    if (side === 'r') d += 'V' + n(f * h - tailW) + 'L' + pt(tx, ty) + 'L' + pt(w, f * h + tailW * 0.2);
    d += 'V' + n(h - r) + (r ? 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + pt(w - r, h) : '');
    if (side === 'b') d += 'H' + n(f * w + tailW) + 'L' + pt(tx, ty) + 'L' + pt(f * w - tailW * 0.2, h);
    d += 'H' + n(r) + (r ? 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + pt(0, h - r) : '');
    if (side === 'l') d += 'V' + n(f * h + tailW) + 'L' + pt(tx, ty) + 'L' + pt(0, f * h - tailW * 0.2);
    d += 'V' + n(r) + (r ? 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + pt(r, 0) : '') + 'Z';
    return d;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  S('wedgeRect', 'فقاعة مستطيلة', 'Rectangular callout', function (w, h, a) { return wedge(w, h, a[0][0] * w, a[0][1] * h, 0, 0); }, { adj: [hp(0.2, 1.3)], text: function (w, h) { return [0, 0, w, h]; } });
  S('wedgeRoundRect', 'فقاعة مستديرة', 'Rounded callout', function (w, h, a) { return wedge(w, h, a[0][0] * w, a[0][1] * h, 0, Math.min(w, h) * 0.16); }, { adj: [hp(0.2, 1.3)] });
  S('wedgeEllipse', 'فقاعة بيضاوية', 'Oval callout', function (w, h, a) {
    var tx = a[0][0] * w, ty = a[0][1] * h, cx = w / 2, cy = h / 2, ang = Math.atan2((ty - cy) / h, (tx - cx) / w) * 180 / PI, a0 = ang + 14, a1 = ang - 14;
    var p0 = ep(cx, cy, w / 2, h / 2, a0), p1 = ep(cx, cy, w / 2, h / 2, a1);
    return 'M' + pt(p0[0], p0[1]) + 'A' + n(w / 2) + ' ' + n(h / 2) + ' 0 1 1 ' + pt(p1[0], p1[1]) + 'L' + pt(tx, ty) + 'Z'; }, { adj: [hp(0.2, 1.3)], text: function (w, h) { return [w * 0.146, h * 0.146, w * 0.708, h * 0.708]; } });
  S('cloudCallout', 'فقاعة سحابية', 'Cloud callout', function (w, h, a) {
    var tx = a[0][0] * w, ty = a[0][1] * h, body = 'M' + pt(w * 0.2, h * 0.7) + 'A' + n(w * 0.16) + ' ' + n(h * 0.2) + ' 0 0 1 ' + pt(w * 0.16, h * 0.33) + 'A' + n(w * 0.17) + ' ' + n(h * 0.2) + ' 0 0 1 ' + pt(w * 0.42, h * 0.12) + 'A' + n(w * 0.17) + ' ' + n(h * 0.16) + ' 0 0 1 ' + pt(w * 0.72, h * 0.12) + 'A' + n(w * 0.17) + ' ' + n(h * 0.2) + ' 0 0 1 ' + pt(w * 0.84, h * 0.4) + 'A' + n(w * 0.15) + ' ' + n(h * 0.2) + ' 0 0 1 ' + pt(w * 0.78, h * 0.7) + 'Z';
    var bx = w / 2, by = h * 0.62, d1 = ell(bx + (tx - bx) * 0.35, by + (ty - by) * 0.35, w * 0.045, h * 0.04), d2 = ell(bx + (tx - bx) * 0.65, by + (ty - by) * 0.65, w * 0.03, h * 0.027), d3 = ell(tx, ty, w * 0.02, h * 0.018);
    return [{ d: body }, { d: d1 }, { d: d2 }, { d: d3 }]; }, { adj: [hp(0.15, 1.15)], text: function (w, h) { return [w * 0.14, h * 0.2, w * 0.72, h * 0.5]; } });
  function lineCallout(n2) {
    return function (w, h, a) { var tx = a[0][0] * w, ty = a[0][1] * h, sx = tx < 0 ? 0 : tx > w ? w : tx, sy = tx < 0 || tx > w ? h / 2 : (ty > h ? h : 0);
      return [{ d: rrect(0, 0, w, h, 0) }, { d: 'M' + pt(sx, sy) + (n2 === 2 ? 'L' + pt((sx + tx) / 2, sy + (ty - sy) * 0.5 - (n2 === 2 ? 0 : 0)) : '') + 'L' + pt(tx, ty), f: 'none' }]; };
  }
  S('lineCallout1', 'تعليق بخط', 'Line callout', lineCallout(1), { adj: [hp(-0.25, 1.3)] });
  S('lineCallout2', 'تعليق بخط منكسر', 'Bent line callout', lineCallout(2), { adj: [hp(-0.25, 1.3)] });
  S('accentCallout', 'تعليق بشريط جانبي', 'Accent callout', function (w, h, a) { var tx = a[0][0] * w, ty = a[0][1] * h; return [{ d: rrect(0, 0, w, h, 0) }, { d: 'M' + pt(w * 0.06, 0) + 'V' + n(h), f: 'none' }, { d: 'M' + pt(0, h / 2) + 'L' + pt(tx, ty), f: 'none' }]; }, { adj: [hp(-0.25, 1.3)] });
  S('thoughtCloud', 'فقاعة تفكير', 'Thought bubble', function (w, h, a) { return S.__cc ? '' : BY.cloudCallout.d(w, h, a); }, { adj: [hp(0.15, 1.15)], text: function (w, h) { return [w * 0.14, h * 0.2, w * 0.72, h * 0.5]; } });

  // ================================================================ math
  cur = cat('math', 'رموز رياضية', 'Math symbols');
  S('mPlus', 'جمع +', 'Plus', function (w, h, a) { var t = a[0] * ss(w, h); return poly([[(w - t) / 2, 0], [(w + t) / 2, 0], [(w + t) / 2, (h - t) / 2], [w, (h - t) / 2], [w, (h + t) / 2], [(w + t) / 2, (h + t) / 2], [(w + t) / 2, h], [(w - t) / 2, h], [(w - t) / 2, (h + t) / 2], [0, (h + t) / 2], [0, (h - t) / 2], [(w - t) / 2, (h - t) / 2]]); }, { adj: [hs(0.24, 0.05, 0.45, 0.5)] });
  S('mMinus', 'طرح −', 'Minus', function (w, h, a) { var t = a[0] * h; return rrect(0, (h - t) / 2, w, t, 0); }, { adj: [{ def: 0.24, min: 0.05, max: 0.9, pos: function (w, h, v) { return [w / 2, (h - v * h) / 2]; }, inv: function (px, py, w, h) { return (h - 2 * py) / h; } }] });
  S('mMultiply', 'ضرب ×', 'Multiply', function (w, h, a) { var t = a[0] * ss(w, h) * 0.7, cx = w / 2, cy = h / 2; return poly([[t, 0], [cx, cy - t], [w - t, 0], [w, t], [cx + t, cy], [w, h - t], [w - t, h], [cx, cy + t], [t, h], [0, h - t], [cx - t, cy], [0, t]]); }, { adj: [hs(0.24, 0.05, 0.45, 0.5)] });
  S('mDivide', 'قسمة ÷', 'Divide', function (w, h, a) { var t = a[0] * h, r = Math.min(w, h) * 0.11; return [rrect(0, (h - t) / 2, w, t, 0), ell(w / 2, r * 1.1, r, r), ell(w / 2, h - r * 1.1, r, r)].join(''); }, { adj: [{ def: 0.2, min: 0.05, max: 0.4, pos: function (w, h, v) { return [w / 2 + w * 0.3, (h - v * h) / 2]; }, inv: function (px, py, w, h) { return (h - 2 * py) / h; } }] });
  S('mEqual', 'يساوي =', 'Equal', function (w, h, a) { var t = a[0] * h; return rrect(0, h / 2 - t * 1.3, w, t, 0) + rrect(0, h / 2 + t * 0.3, w, t, 0); }, { adj: [{ def: 0.16, min: 0.04, max: 0.3, pos: function (w, h, v) { return [w / 2, h / 2 - v * h * 1.3]; }, inv: function (px, py, w, h) { return (h / 2 - py) / (h * 1.3); } }] });
  S('mNotEqual', 'لا يساوي ≠', 'Not equal', function (w, h, a) { var t = a[0] * h, k = w * 0.14; return rrect(0, h / 2 - t * 1.3, w, t, 0) + rrect(0, h / 2 + t * 0.3, w, t, 0) + poly([[w / 2 + k * 1.2, 0], [w / 2 + k * 2.4, 0], [w / 2 - k * 1.2, h], [w / 2 - k * 2.4, h]]); }, { evenodd: false, adj: [{ def: 0.16, min: 0.04, max: 0.3, pos: function (w, h, v) { return [w * 0.1, h / 2 - v * h * 1.3]; }, inv: function (px, py, w, h) { return (h / 2 - py) / (h * 1.3); } }] });
  S('mLessEq', 'أصغر أو يساوي ≤', 'Less or equal', function (w, h) { var t = h * 0.12; return polyOpen([[w, h * 0.05], [0, h * 0.4], [w, h * 0.75]]) + 'M0 ' + n(h * 0.92) + 'H' + n(w); }, { open: true });
  S('mGreaterEq', 'أكبر أو يساوي ≥', 'Greater or equal', function (w, h) { return polyOpen([[0, h * 0.05], [w, h * 0.4], [0, h * 0.75]]) + 'M0 ' + n(h * 0.92) + 'H' + n(w); }, { open: true });
  S('mApprox', 'يقارب ≈', 'Approximately', function (w, h) { return 'M0 ' + n(h * 0.38) + 'C' + pt(w * 0.25, -h * 0.05) + ' ' + pt(w * 0.25, -h * 0.05) + ' ' + pt(w / 2, h * 0.38) + 'S' + pt(w * 0.75, h * 0.8) + ' ' + pt(w, h * 0.38) + 'M0 ' + n(h * 0.78) + 'C' + pt(w * 0.25, h * 0.35) + ' ' + pt(w * 0.25, h * 0.35) + ' ' + pt(w / 2, h * 0.78) + 'S' + pt(w * 0.75, h * 1.2) + ' ' + pt(w, h * 0.78); }, { open: true });
  S('mInfinity', 'ما لا نهاية ∞', 'Infinity', function (w, h) { return 'M' + pt(w / 2, h / 2) + 'C' + pt(w * 0.35, h * 0.1) + ' ' + pt(w * 0.02, h * 0.1) + ' ' + pt(w * 0.02, h / 2) + 'C' + pt(w * 0.02, h * 0.9) + ' ' + pt(w * 0.35, h * 0.9) + ' ' + pt(w / 2, h / 2) + 'C' + pt(w * 0.65, h * 0.1) + ' ' + pt(w * 0.98, h * 0.1) + ' ' + pt(w * 0.98, h / 2) + 'C' + pt(w * 0.98, h * 0.9) + ' ' + pt(w * 0.65, h * 0.9) + ' ' + pt(w / 2, h / 2) + 'Z'; }, { open: true });
  S('mSqrt', 'جذر √', 'Radical', function (w, h) { return 'M0 ' + n(h * 0.55) + 'L' + pt(w * 0.12, h * 0.48) + 'L' + pt(w * 0.26, h * 0.9) + 'L' + pt(w * 0.42, h * 0.05) + 'H' + n(w); }, { open: true });
  S('mCheck', 'علامة صح ✓', 'Check mark', function (w, h) { return poly([[0, h * 0.55], [w * 0.14, h * 0.4], [w * 0.38, h * 0.62], [w * 0.86, 0], [w, h * 0.14], [w * 0.38, h]]); });
  S('mCross', 'علامة خطأ ✗', 'Cross mark', function (w, h) { var t = Math.min(w, h) * 0.16, cx = w / 2, cy = h / 2; return poly([[t, 0], [cx, cy - t], [w - t, 0], [w, t], [cx + t, cy], [w, h - t], [w - t, h], [cx, cy + t], [t, h], [0, h - t], [cx - t, cy], [0, t]]); });

  // ================================================================ science & education
  cur = cat('edu', 'علوم وتعليم', 'Science & education');
  S('eRightAngle', 'زاوية قائمة', 'Right angle mark', function (w, h) { return polyOpen([[0, h * 0.0], [w, 0], [w, h]]).replace(/^M0 0L(\S+) 0L/, 'M0 0H$1V').replace(/^M0 0H(\S+)V(\S+) (\S+)$/, 'M0 0H$1V$3'); }, { open: true });
  S('eAngle', 'قوس زاوية', 'Angle arc', function (w, h, a) { var a1 = a[0] * 90; return 'M' + pt(w, h) + 'L' + pt(0, h) + 'M' + pt(w, h) + 'L' + pt(w - w * Math.cos(rad(a1 * 2)), h - w * Math.sin(rad(a1 * 2))) + 'M' + pt(w * 0.55, h) + 'A' + n(w * 0.45) + ' ' + n(w * 0.45) + ' 0 0 1 ' + pt(w - w * 0.45 * Math.cos(rad(a1 * 2)), h - w * 0.45 * Math.sin(rad(a1 * 2))); }, { open: true, adj: [{ def: 0.33, min: 0.05, max: 0.9, pos: function (w, h, v) { return [w - w * Math.cos(rad(v * 180)), h - w * Math.sin(rad(v * 180))]; }, inv: function (px, py, w, h) { return Math.atan2(h - py, w - px) * 180 / PI / 180; } }] });
  S('eAxes', 'محورا إحداثيات', 'Coordinate axes', function (w, h) { var a = Math.min(w, h) * 0.04; return 'M0 ' + n(h / 2) + 'H' + n(w) + 'M' + pt(w - a * 3, h / 2 - a * 1.5) + 'L' + pt(w, h / 2) + 'L' + pt(w - a * 3, h / 2 + a * 1.5) + 'M' + pt(w / 2, h) + 'V0M' + pt(w / 2 - a * 1.5, a * 3) + 'L' + pt(w / 2, 0) + 'L' + pt(w / 2 + a * 1.5, a * 3); }, { open: true });
  S('eAxes4', 'محاور بتدريج', 'Axes with ticks', function (w, h) { var d = 'M0 ' + n(h / 2) + 'H' + n(w) + 'M' + pt(w / 2, h) + 'V0', k = Math.min(w, h) * 0.02; for (var i = 1; i < 10; i++) { var x = w * i / 10, y = h * i / 10; d += 'M' + pt(x, h / 2 - k) + 'V' + n(h / 2 + k) + 'M' + pt(w / 2 - k, y) + 'H' + n(w / 2 + k); } return d; }, { open: true });
  S('eNumberLine', 'خط الأعداد', 'Number line', function (w, h) { var d = 'M0 ' + n(h / 2) + 'H' + n(w), a = Math.min(w, h) * 0.12; d += 'M' + pt(w - a, h / 2 - a / 2) + 'L' + pt(w, h / 2) + 'L' + pt(w - a, h / 2 + a / 2) + 'M' + pt(a, h / 2 - a / 2) + 'L0 ' + n(h / 2) + 'L' + pt(a, h / 2 + a / 2); for (var i = 1; i < 10; i++) d += 'M' + pt(w * i / 10, h / 2 - h * 0.18) + 'V' + n(h / 2 + h * 0.18); return d; }, { open: true });
  S('eGrid', 'شبكة', 'Grid', function (w, h, a) { var c = Math.max(2, Math.round(a[0] * 10)), d = rrect(0, 0, w, h, 0); for (var i = 1; i < c; i++) d += 'M' + pt(w * i / c, 0) + 'V' + n(h) + 'M' + pt(0, h * i / c) + 'H' + n(w); return d; }, { open: true, adj: [{ def: 0.5, min: 0.2, max: 1, pos: function (w, h, v) { return [w * v, 0]; }, inv: function (px, py, w) { return px / w; } }] });
  S('eTicks', 'علامات تساوي', 'Equal-length marks', function (w, h) { return 'M' + pt(w * 0.35, 0) + 'L' + pt(w * 0.65, h) + 'M' + pt(w * 0.15, 0) + 'L' + pt(w * 0.45, h); }, { open: true });
  S('eParallel', 'علامة توازي', 'Parallel marks', function (w, h) { return 'M0 ' + n(h) + 'L' + pt(w * 0.5, 0) + 'L' + pt(w, h) + 'M' + pt(w * 0.2, h * 0.7) + 'L' + pt(w * 0.5, h * 0.2); }, { open: true });
  S('eAtom', 'ذرة', 'Atom', function (w, h) { var parts = [ell(w / 2, h / 2, w * 0.08, h * 0.08)]; var orbit = function (ang) { var d = '', N = 40; for (var i = 0; i <= N; i++) { var t = i / N * 2 * PI, x = w * 0.48 * Math.cos(t), y = h * 0.17 * Math.sin(t), c = Math.cos(rad(ang)), s = Math.sin(rad(ang)); d += (i ? 'L' : 'M') + pt(w / 2 + x * c - y * s, h / 2 + x * s + y * c); } return d; }; return [{ d: parts[0] }, { d: orbit(0) + orbit(60) + orbit(120), f: 'none' }]; });
  S('eFlask', 'دورق مخروطي', 'Erlenmeyer flask', function (w, h) { return [{ d: poly([[w * 0.38, 0], [w * 0.62, 0], [w * 0.62, h * 0.32], [w, h * 0.92], [w * 0.96, h], [w * 0.04, h], [0, h * 0.92], [w * 0.38, h * 0.32]]) }, { d: poly([[w * 0.2, h * 0.68], [w * 0.8, h * 0.68], [w, h * 0.92], [w * 0.96, h], [w * 0.04, h], [0, h * 0.92]]), f: 'light' }]; });
  S('eBeaker', 'كأس زجاجية', 'Beaker', function (w, h) { return [{ d: poly([[w * 0.06, 0], [w * 0.94, 0], [w * 0.86, h], [w * 0.14, h]]) }, { d: poly([[w * 0.1, h * 0.45], [w * 0.9, h * 0.45], [w * 0.86, h], [w * 0.14, h]]), f: 'light' }, { d: 'M' + pt(w * 0.06, h * 0.15) + 'H' + n(w * 0.3) + 'M' + pt(w * 0.07, h * 0.3) + 'H' + n(w * 0.22), f: 'none' }]; });
  S('eTestTube', 'أنبوب اختبار', 'Test tube', function (w, h) { return [{ d: 'M0 0H' + n(w) + 'V' + n(h - w / 2) + 'A' + n(w / 2) + ' ' + n(w / 2) + ' 0 0 1 0 ' + n(h - w / 2) + 'Z' }, { d: 'M0 ' + n(h * 0.5) + 'H' + n(w) + 'V' + n(h - w / 2) + 'A' + n(w / 2) + ' ' + n(w / 2) + ' 0 0 1 0 ' + n(h - w / 2) + 'Z', f: 'light' }]; });
  S('eMagnet', 'مغناطيس', 'Magnet', function (w, h) { var t = w * 0.3; return [{ d: 'M0 ' + n(h) + 'V' + n(w / 2) + 'A' + n(w / 2) + ' ' + n(w / 2) + ' 0 0 1 ' + n(w) + ' ' + n(w / 2) + 'V' + n(h) + 'H' + n(w - t) + 'V' + n(w / 2) + 'A' + n(w / 2 - t) + ' ' + n(w / 2 - t) + ' 0 0 0 ' + n(t) + ' ' + n(w / 2) + 'V' + n(h) + 'Z' }, { d: poly([[0, h * 0.78], [t, h * 0.78], [t, h], [0, h]]), f: 'light' }, { d: poly([[w - t, h * 0.78], [w, h * 0.78], [w, h], [w - t, h]]), f: 'dark' }]; });
  S('eResistor', 'مقاومة', 'Resistor', function (w, h) { var d = 'M0 ' + n(h / 2) + 'H' + n(w * 0.15), x = w * 0.15, step = w * 0.7 / 6; for (var i = 0; i < 6; i++) { d += 'L' + pt(x + step * (i + 0.5), i % 2 ? h * 0.9 : h * 0.1); } d += 'L' + pt(x + step * 6, h / 2) + 'H' + n(w); return d; }, { open: true });
  S('eCell', 'بطارية / خلية', 'Battery cell', function (w, h) { return 'M0 ' + n(h / 2) + 'H' + n(w * 0.4) + 'M' + pt(w * 0.4, h * 0.1) + 'V' + n(h * 0.9) + 'M' + pt(w * 0.6, h * 0.3) + 'V' + n(h * 0.7) + 'M' + pt(w * 0.6, h / 2) + 'H' + n(w); }, { open: true });
  S('eBulb', 'مصباح', 'Lamp', function (w, h) { return [{ d: ell(w / 2, h / 2, w * 0.3, h * 0.3) }, { d: 'M' + pt(w * 0.29, h * 0.29) + 'L' + pt(w * 0.71, h * 0.71) + 'M' + pt(w * 0.71, h * 0.29) + 'L' + pt(w * 0.29, h * 0.71) + 'M0 ' + n(h / 2) + 'H' + n(w * 0.2) + 'M' + pt(w * 0.8, h / 2) + 'H' + n(w), f: 'none' }]; });
  S('eThermometer', 'ميزان حرارة', 'Thermometer', function (w, h) { var r = Math.min(w * 0.5, h * 0.2), tw = r * 0.55, cx = w / 2; return [{ d: 'M' + pt(cx - tw, h - r * 1.7) + 'V' + n(tw) + 'A' + n(tw) + ' ' + n(tw) + ' 0 0 1 ' + pt(cx + tw, tw) + 'V' + n(h - r * 1.7) + 'A' + n(r) + ' ' + n(r) + ' 0 1 1 ' + pt(cx - tw, h - r * 1.7) + 'Z' }, { d: 'M' + pt(cx - tw * 0.4, h - r * 1.2) + 'V' + n(h * 0.4) + 'H' + n(cx + tw * 0.4) + 'V' + n(h - r * 1.2) + 'Z' + ell(cx, h - r, r * 0.75, r * 0.75), f: 'dark' }]; });
  S('eProtractor', 'منقلة', 'Protractor', function (w, h) { var d = 'M0 ' + n(h) + 'A' + n(w / 2) + ' ' + n(h) + ' 0 0 1 ' + n(w) + ' ' + n(h) + 'Z'; return [{ d: d }, { d: ell(w / 2, h, w * 0.04, w * 0.04) + (function () { var s = ''; for (var i = 0; i <= 18; i++) { var p0 = ep(w / 2, h, w / 2, h, 180 + i * 10), p1 = ep(w / 2, h, w / 2 * (i % 3 ? 0.92 : 0.86), h * (i % 3 ? 0.92 : 0.86), 180 + i * 10); s += 'M' + pt(p0[0], p0[1]) + 'L' + pt(p1[0], p1[1]); } return s; })(), f: 'none' }]; });
  S('eRuler', 'مسطرة', 'Ruler', function (w, h) { var d = ''; for (var i = 1; i < 20; i++) d += 'M' + pt(w * i / 20, 0) + 'V' + n(h * (i % 5 ? 0.3 : 0.5)); return [{ d: rrect(0, 0, w, h, 0) }, { d: d, f: 'none' }]; });
  S('eTriangleSet', 'مثلث هندسي', 'Set square', function (w, h) { return [{ d: poly([[0, h], [0, 0], [w, h]]) }, { d: poly([[w * 0.14, h * 0.78], [w * 0.14, h * 0.4], [w * 0.5, h * 0.78]]), f: 'light' }]; });

  // finishing: default text rect
  CATS.forEach(function (c) { c.shapes.forEach(function (s) { if (!s.line && !s.text) s.text = function (w, h) { return [0, 0, w, h]; }; }); });

  global.PdfShapeLib = {
    cats: CATS, get: function (id) { return BY[id] || null; }, all: function () { return Object.keys(BY).map(function (k) { return BY[k]; }); },
    count: function () { return Object.keys(BY).length; }
  };
})(window);
