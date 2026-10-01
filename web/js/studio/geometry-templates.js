/*
 * Geometry templates: each builds points (units, y up) + elements, lists draggable handles and keeps
 * the figure's defining property while dragging (right angle, equal sides, parallel sides, points on a circle …).
 */
(function (global) {
  'use strict';
  var V = {
    sub: function (a, b) { return [a[0] - b[0], a[1] - b[1]]; }, add: function (a, b) { return [a[0] + b[0], a[1] + b[1]]; },
    mul: function (a, k) { return [a[0] * k, a[1] * k]; }, len: function (a) { return Math.hypot(a[0], a[1]); },
    norm: function (a) { var l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; }, perp: function (a) { return [-a[1], a[0]]; },
    dot: function (a, b) { return a[0] * b[0] + a[1] * b[1]; }, mid: function (a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; },
    rot: function (a, t) { var c = Math.cos(t), s = Math.sin(t); return [a[0] * c - a[1] * s, a[0] * s + a[1] * c]; }
  };
  function inter(p1, p2, p3, p4) {                   // intersection of lines p1p2 and p3p4
    var d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
    if (Math.abs(d) < 1e-9) return V.mid(p1, p3);
    var a = p1[0] * p2[1] - p1[1] * p2[0], b = p3[0] * p4[1] - p3[1] * p4[0];
    return [(a * (p3[0] - p4[0]) - (p1[0] - p2[0]) * b) / d, (a * (p3[1] - p4[1]) - (p1[1] - p2[1]) * b) / d];
  }
  function onCircle(O, R, p) { var d = V.sub(p, O); return V.add(O, V.mul(V.norm(d), R)); }
  function translateAll(d, dv, except) { Object.keys(d.P).forEach(function (k) { if (k !== except) d.P[k] = V.add(d.P[k], dv); }); }

  var T = {};

  T.triangle = { icon: '△', t: 'مثلث|Triangle', build: function () {
    return { P: { A: [0.4, 3.2], B: [-2.6, -1], C: [3, -1] }, E: [{ t: 'poly', p: ['A', 'B', 'C'] }], handles: ['A', 'B', 'C'] };
  } };

  T.right = { icon: '◺', t: 'مثلث قائم|Right triangle', build: function () {
    return { P: { A: [-2, 2.4], B: [-2, -1.2], C: [2.6, -1.2] }, E: [{ t: 'poly', p: ['A', 'B', 'C'] }], handles: ['A', 'B', 'C'], prm: { c: 4.6 } };
  }, derive: function (d) {
    var dir = V.norm(V.perp(V.sub(d.P.A, d.P.B))); d.P.C = V.add(d.P.B, V.mul(dir, -d.prm.c));
  }, drag: function (d, k, p, old) {
    if (k === 'B') { translateAll(d, V.sub(p, d.P.B)); return; }
    if (k === 'C') { var dir = V.norm(V.perp(V.sub(d.P.A, d.P.B))); d.prm.c = -V.dot(V.sub(p, d.P.B), dir); if (Math.abs(d.prm.c) < 0.3) d.prm.c = 0.3 * (d.prm.c < 0 ? -1 : 1); return; }
    d.P[k] = p;
  } };

  T.isosceles = { icon: '▲', t: 'متطابق الضلعين|Isosceles', build: function () {
    return { P: { A: [0, 3.2], B: [-2.2, -1], C: [2.2, -1] }, E: [{ t: 'poly', p: ['A', 'B', 'C'] }], handles: ['A', 'B', 'C'], prm: { h: 4.2 } };
  }, derive: function (d) {
    var m = V.mid(d.P.B, d.P.C), n = V.norm(V.perp(V.sub(d.P.C, d.P.B))); d.P.A = V.add(m, V.mul(n, d.prm.h));
  }, drag: function (d, k, p) {
    if (k === 'A') { var m = V.mid(d.P.B, d.P.C), n = V.norm(V.perp(V.sub(d.P.C, d.P.B))); d.prm.h = V.dot(V.sub(p, m), n); return; }
    d.P[k] = p;
  } };

  T.equilateral = { icon: '🔺', t: 'متطابق الأضلاع|Equilateral', build: function () {
    return { P: { A: [0, 2.8], B: [-2.4, -1.4], C: [2.4, -1.4] }, E: [{ t: 'poly', p: ['A', 'B', 'C'] }], handles: ['B', 'C'] };
  }, derive: function (d) {
    var m = V.mid(d.P.B, d.P.C), n = V.norm(V.perp(V.sub(d.P.C, d.P.B))); d.P.A = V.add(m, V.mul(n, V.len(V.sub(d.P.C, d.P.B)) * Math.sqrt(3) / 2));
  } };

  T.square = { icon: '□', t: 'مربع|Square', build: function () {
    return { P: { A: [-2, -2], B: [2, -2], C: [2, 2], D: [-2, 2] }, E: [{ t: 'poly', p: ['A', 'B', 'C', 'D'] }], handles: ['A', 'B'] };
  }, derive: function (d) {
    var n = V.perp(V.sub(d.P.B, d.P.A)); d.P.C = V.add(d.P.B, n); d.P.D = V.add(d.P.A, n);
  } };

  T.rectangle = { icon: '▭', t: 'مستطيل|Rectangle', build: function () {
    return { P: { A: [-3, -1.6], B: [3, -1.6], C: [3, 1.6], D: [-3, 1.6] }, E: [{ t: 'poly', p: ['A', 'B', 'C', 'D'] }], handles: ['A', 'B', 'D'], prm: { h: 3.2 } };
  }, derive: function (d) {
    var n = V.mul(V.norm(V.perp(V.sub(d.P.B, d.P.A))), d.prm.h); d.P.C = V.add(d.P.B, n); d.P.D = V.add(d.P.A, n);
  }, drag: function (d, k, p) {
    if (k === 'D') { d.prm.h = V.dot(V.sub(p, d.P.A), V.norm(V.perp(V.sub(d.P.B, d.P.A)))); return; }
    d.P[k] = p;
  } };

  T.parallelogram = { icon: '▱', t: 'متوازي أضلاع|Parallelogram', build: function () {
    return { P: { A: [-3, -1.5], B: [2, -1.5], C: [3.2, 1.5], D: [-1.8, 1.5] }, E: [{ t: 'poly', p: ['A', 'B', 'C', 'D'] }], handles: ['A', 'B', 'D'] };
  }, derive: function (d) { d.P.C = V.sub(V.add(d.P.B, d.P.D), d.P.A); } };

  T.rhombus = { icon: '◇', t: 'معين|Rhombus', build: function () {
    return { P: { A: [-2.5, -1.2], B: [1.2, -1.2], C: [3, 2], D: [-0.7, 2] }, E: [{ t: 'poly', p: ['A', 'B', 'C', 'D'] }], handles: ['A', 'B', 'D'], prm: { ang: 1.05 } };
  }, derive: function (d) {
    d.P.D = V.add(d.P.A, V.rot(V.sub(d.P.B, d.P.A), d.prm.ang)); d.P.C = V.sub(V.add(d.P.B, d.P.D), d.P.A);
  }, drag: function (d, k, p) {
    if (k === 'D') { var u = V.sub(d.P.B, d.P.A), w = V.sub(p, d.P.A); d.prm.ang = Math.atan2(w[1], w[0]) - Math.atan2(u[1], u[0]); return; }
    d.P[k] = p;
  } };

  T.trapezoid = { icon: '⏢', t: 'شبه منحرف|Trapezoid', build: function () {
    return { P: { A: [-3.2, -1.5], B: [3.2, -1.5], C: [1.6, 1.6], D: [-1.8, 1.6] }, E: [{ t: 'poly', p: ['A', 'B', 'C', 'D'] }], handles: ['A', 'B', 'C', 'D'], prm: { top: 3.4 } };
  }, derive: function (d) {
    d.P.C = V.add(d.P.D, V.mul(V.norm(V.sub(d.P.B, d.P.A)), d.prm.top));
  }, drag: function (d, k, p) {
    if (k === 'C') { d.prm.top = V.dot(V.sub(p, d.P.D), V.norm(V.sub(d.P.B, d.P.A))); return; }
    d.P[k] = p;
  } };

  T.polygon = { icon: '⬠', t: 'مضلع منتظم|Regular polygon', build: function () {
    return { P: { O: [0, 0], A: [0, -2.6] }, E: [], handles: ['O', 'A'], prm: { n: 6 }, hidden: { O: true }, opt: { angles: 'none' } };
  }, derive: function (d) {
    var n = Math.max(3, Math.min(12, d.prm.n | 0)), keys = [], O = d.P.O, v = V.sub(d.P.A, O);
    var L = 'ABCDEFGHIJKL';
    for (var i = 0; i < n; i++) { var k = L[i]; keys.push(k); if (i) d.P[k] = V.add(O, V.rot(v, 2 * Math.PI * i / n)); }
    for (var j = n; j < 12; j++) delete d.P[L[j]];
    d.E = [{ t: 'poly', p: keys }];
  } };

  T.circle = { icon: '◯', t: 'دائرة ونصف قطر|Circle & radius', build: function () {
    return { P: { O: [0, 0], A: [2.6, 0] }, E: [{ t: 'circle', c: 'O', through: 'A' }, { t: 'seg', p: ['O', 'A'] }], handles: ['O', 'A'], names: { O: 'م' }, sideLbl: { 'O-A': 'نق' } };
  }, drag: function (d, k, p) { if (k === 'O') { translateAll(d, V.sub(p, d.P.O)); return; } d.P[k] = p; } };

  T.chord = { icon: '⊖', t: 'وتر ومماس وقطر|Chord, tangent, diameter', build: function () {
    return { P: { O: [0, 0], A: [-1.8, 2.07], B: [2.6, 0.6], T: [0.5, -2.7], U: [0, 0], D1: [-2.74, 0], D2: [2.74, 0] },
      E: [{ t: 'circle', c: 'O', through: 'A' }, { t: 'seg', p: ['A', 'B'] }, { t: 'seg', p: ['D1', 'D2'], dash: false }, { t: 'seg', p: ['O', 'T'], dash: true },
        { t: 'line', p: ['T', 'U'], ext: 2.2 }, { t: 'angle', p: ['O', 'T', 'U'] }],
      handles: ['O', 'A', 'B', 'T', 'D1'], names: { O: 'م', U: '', D2: 'د', D1: 'جـ', T: 'ل' } };
  }, derive: function (d) {
    var O = d.P.O, R = V.len(V.sub(d.P.A, O));
    d.P.B = onCircle(O, R, d.P.B); d.P.T = onCircle(O, R, d.P.T); d.P.D1 = onCircle(O, R, d.P.D1);
    d.P.D2 = V.sub(V.mul(O, 2), d.P.D1);
    d.P.U = V.add(d.P.T, V.mul(V.norm(V.perp(V.sub(d.P.T, O))), 1.6));
  }, drag: function (d, k, p) { if (k === 'O') { translateAll(d, V.sub(p, d.P.O)); return; } d.P[k] = p; } };

  T.inscribed = { icon: '∡', t: 'زاوية محيطية ومركزية|Inscribed & central', build: function () {
    return { P: { O: [0, 0], A: [-2.3, -1.3], B: [2.3, -1.3], C: [-0.8, 2.52] },
      E: [{ t: 'circle', c: 'O', through: 'A' }, { t: 'seg', p: ['C', 'A'] }, { t: 'seg', p: ['C', 'B'] }, { t: 'seg', p: ['O', 'A'] }, { t: 'seg', p: ['O', 'B'] },
        { t: 'angle', p: ['A', 'C', 'B'], value: true, color: '#0e9f9a' }, { t: 'angle', p: ['A', 'O', 'B'], value: true, color: '#c2352b' }],
      handles: ['O', 'A', 'B', 'C'], names: { O: 'م' }, opt: { ticks: false } };
  }, derive: function (d) {
    var O = d.P.O, R = V.len(V.sub(d.P.A, O)); d.P.B = onCircle(O, R, d.P.B); d.P.C = onCircle(O, R, d.P.C);
  }, drag: function (d, k, p) { if (k === 'O') { translateAll(d, V.sub(p, d.P.O)); return; } d.P[k] = p; } };

  T.parallel = { icon: '⫽', t: 'متوازيان وقاطع|Parallel lines & transversal', build: function () {
    return { P: { P1: [-3.4, 1.2], Q1: [3.4, 1.2], P2: [-3.4, -1.2], Q2: [3.4, -1.2], T1: [-1.4, 3], T2: [1.6, -3], X1: [0, 0], X2: [0, 0] },
      E: [{ t: 'line', p: ['P1', 'Q1'], par: 1, ext: 0.4 }, { t: 'line', p: ['P2', 'Q2'], par: 1, ext: 0.4 }, { t: 'line', p: ['T1', 'T2'], ext: 0.4 },
        { t: 'angle', p: ['Q1', 'X1', 'T1'], label: '1', color: '#0e9f9a', fill: true }, { t: 'angle', p: ['Q2', 'X2', 'X1'], label: '2', color: '#0e9f9a', fill: true },
        { t: 'angle', p: ['P2', 'X2', 'T2'], label: '3', color: '#c2352b', fill: true }],
      handles: ['P1', 'Q1', 'P2', 'T1', 'T2'], prm: { d: 2.4 },
      names: { P1: '', Q1: '', P2: '', Q2: '', T1: '', T2: '', X1: 'أ', X2: 'ب' }, opt: { dots: false, ticks: false } };
  }, derive: function (d) {
    var u = V.norm(V.sub(d.P.Q1, d.P.P1)), n = V.perp(u);
    var off = V.mul(n, -d.prm.d);
    d.P.P2 = V.add(d.P.P1, off); d.P.Q2 = V.add(d.P.Q1, off);
    d.P.X1 = inter(d.P.P1, d.P.Q1, d.P.T1, d.P.T2); d.P.X2 = inter(d.P.P2, d.P.Q2, d.P.T1, d.P.T2);
  }, drag: function (d, k, p) {
    if (k === 'P2') { var n = V.perp(V.norm(V.sub(d.P.Q1, d.P.P1))); d.prm.d = -V.dot(V.sub(p, d.P.P1), n); return; }
    d.P[k] = p;
  } };

  T.angle = { icon: '∠', t: 'زاوية|Angle', build: function () {
    return { P: { A: [3, 2.2], B: [-2, -0.8], C: [3.6, -0.8] }, E: [{ t: 'ray', p: ['B', 'A'], ext: 0.6 }, { t: 'ray', p: ['B', 'C'], ext: 0.6 }, { t: 'angle', p: ['A', 'B', 'C'], value: true }],
      handles: ['A', 'B', 'C'] };
  } };

  T.segment = { icon: '―', t: 'قطعة / شعاع / مستقيم|Segment / ray / line', build: function () {
    return { P: { A: [-2.8, -0.6], B: [2.6, 0.8], C: [-2.8, -2.2], D: [2.6, -0.8], E: [-2.2, 2.6], F: [2.2, 3.4] },
      E: [{ t: 'seg', p: ['A', 'B'] }, { t: 'ray', p: ['C', 'D'], ext: 0.8 }, { t: 'line', p: ['E', 'F'], ext: 0.8 }], handles: ['A', 'B', 'C', 'D', 'E', 'F'], opt: { ticks: false } };
  } };

  T.cube = { icon: '⬚', t: 'متوازي مستطيلات|Cuboid', build: function () {
    return { P: { A: [-2.6, -2], B: [1.4, -2], C: [1.4, 1.2] }, E: [], handles: ['A', 'B', 'C', 'G'], prm: { o: [1.4, 1.1] }, opt: { angles: 'none', ticks: false } };
  }, derive: function (d) {
    var A = d.P.A, B = d.P.B, n = V.norm(V.perp(V.sub(B, A))), h = V.dot(V.sub(d.P.C, B), n), o = d.prm.o;
    d.P.C = V.add(B, V.mul(n, h)); d.P.D = V.add(A, V.mul(n, h));
    d.P.E = V.add(A, o); d.P.F = V.add(B, o); d.P.G = V.add(d.P.C, o); d.P.H = V.add(d.P.D, o);
    d.E = [{ t: 'poly', p: ['A', 'B', 'C', 'D'] }, { t: 'poly', p: ['B', 'F', 'G', 'C'], fillOpacity: 0.05 }, { t: 'poly', p: ['D', 'C', 'G', 'H'], fillOpacity: 0.22 },
      { t: 'seg', p: ['A', 'E'], dash: true, len: false, tick: false }, { t: 'seg', p: ['E', 'F'], dash: true, len: false, tick: false }, { t: 'seg', p: ['E', 'H'], dash: true, len: false, tick: false }];
  }, drag: function (d, k, p) {
    if (k === 'G') { d.prm.o = V.sub(p, d.P.C); return; }
    d.P[k] = p;
  } };

  var ORDER = ['triangle', 'right', 'isosceles', 'equilateral', 'square', 'rectangle', 'parallelogram', 'rhombus', 'trapezoid', 'polygon', 'circle', 'chord', 'inscribed', 'parallel', 'angle', 'segment', 'cube'];
  var AR = ['أ', 'ب', 'جـ', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي', 'ك', 'ل'];

  function create(id, notation) {
    var t = T[id] || T.triangle, b = t.build();
    var d = { v: 1, tpl: id, P: b.P, E: b.E, prm: b.prm || {}, handles: b.handles, names: {}, sideLbl: b.sideLbl || {}, angLbl: {}, hidden: b.hidden || {}, opt: b.opt || {} };
    if (t.derive) t.derive(d);
    autoNames(d, notation, b.names || {});
    return d;
  }
  function toLatin(v) {
    if (!v) return '';
    if (v === 'م') return 'O';
    var i = AR.indexOf(v);
    return i >= 0 ? String.fromCharCode(65 + i) : v;
  }
  function autoNames(d, notation, fixed) {
    fixed = fixed || d.fixedNames || {};
    d.fixedNames = fixed;
    Object.keys(d.P).forEach(function (k) {
      if (d.hidden[k]) { d.names[k] = ''; return; }
      var v = fixed[k] !== undefined ? fixed[k] : (/^[A-L]$/.test(k) ? AR[k.charCodeAt(0) - 65] : '');
      d.names[k] = notation === 'en' ? toLatin(v) : v;
    });
  }
  function drag(d, k, p) {
    var t = T[d.tpl];
    if (t && t.drag) t.drag(d, k, p); else d.P[k] = p;
    if (t && t.derive) t.derive(d);
  }
  function derive(d) { var t = T[d.tpl]; if (t && t.derive) t.derive(d); }

  global.GeoTemplates = { T: T, ORDER: ORDER, create: create, drag: drag, derive: derive, AR: AR, autoNames: autoNames };
})(window);
