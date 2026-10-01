/*
 * Geometry markup  <->  GeometryRender data   (units = cm, y up)
 *
 * \begin{geometry}[sides=values, angles=values, unit=سم, digits=eastern]
 *   \triangle{أ,ب,جـ}[sides=5,6,7]                 % |أب|, |بجـ|, |جـأ|
 *   \triangle{أ,ب,جـ}[right=ب, legs=3,4]           % right angle at ب
 *   \triangle{أ,ب,جـ}[base=6, angles=50,60]        % ASA on base بجـ
 *   \triangle{أ,ب,جـ}[sides=5,7, angle=60]         % SAS: أب, أجـ and ∠أ
 *   \triangle{أ,ب,جـ}[equilateral, side=4]   \triangle{أ,ب,جـ}[isosceles, base=4, legs=5]
 *   \square{أ,ب,جـ,د}[side=4]  \rectangle{…}[width=6, height=3]  \parallelogram{…}[base=5, side=3, angle=60]
 *   \rhombus{…}[side=4, angle=60]  \trapezoid{…}[bottom=6, top=3, height=3]  \regular{أ,ب,جـ,د,هـ}[side=3]
 *   \circle{م}[radius=3]   \circle{م,أ}
 *   \point{هـ}{(1, 2)}   \point[on=م, angle=120]{و}   \midpoint{د}{أ,ب}   \foot{هـ}{أ}{ب,جـ}   \intersection{ن}{أ,جـ}{ب,د}
 *   \polygon{أ,ب,جـ}  \segment[dashed, label=5 سم, marks=2]{أ,جـ}  \side[label=س]{أ,ب}  \line{أ,ب}  \ray{أ,ب}  \vector{أ,ب}
 *   \angle[label=α, value, arcs=2, right]{ب,أ,جـ}   \parallelmark[marks=1]{أ,ب}   \text{(2,3)}{نص}
 *   constructions: \perpbisector[name=م]{أ,ب}  \bisector[name=د]{ب,أ,جـ}  \median[name=د]{أ}{ب,جـ}
 *                  \circumcircle[center=م]{أ,ب,جـ}  \incircle[center=و, touch]{أ,ب,جـ}  \tangent{م}{أ}  \tangents[names=ل,ك]{ن}{م}
 *   transformations (image named أ′ ب′ … or names=…): \reflect[over=س|ص|أ,ب | center=م]{أ,ب,جـ}  \rotate[center=م, angle=90]{…}
 *                  \translate[by=(3,1) | vector=أ,ب]{…}  \dilate[center=م, k=2]{…}   options: lines, dashed, color=…
 * \end{geometry}
 *
 * Imports TikZ (\coordinate, \node, \draw … -- … cycle, circle, pic{angle=…}, pic{right angle=…})
 * and tkz-euclide (\tkzDefPoint, \tkzDrawPolygon, \tkzDrawSegments, \tkzDrawCircle, \tkzMarkRightAngle, \tkzMarkAngle, \tkzLabelAngle, \tkzLabelPoints, \tkzMarkSegments).
 */
(function (global) {
  'use strict';
  var D2R = Math.PI / 180;
  var V = {
    sub: function (a, b) { return [a[0] - b[0], a[1] - b[1]]; }, add: function (a, b) { return [a[0] + b[0], a[1] + b[1]]; },
    mul: function (a, k) { return [a[0] * k, a[1] * k]; }, len: function (a) { return Math.hypot(a[0], a[1]); },
    norm: function (a) { var l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; }, perp: function (a) { return [-a[1], a[0]]; },
    dot: function (a, b) { return a[0] * b[0] + a[1] * b[1]; }, rot: function (a, t) { var c = Math.cos(t), s = Math.sin(t); return [a[0] * c - a[1] * s, a[0] * s + a[1] * c]; }
  };
  var POS = { above: [0, -1], below: [0, 1], left: [-1, 0], right: [1, 0], 'above left': [-1, -1], 'above right': [1, -1], 'below left': [-1, 1], 'below right': [1, 1],
    'فوق': [0, -1], 'تحت': [0, 1], 'يسار': [-1, 0], 'يمين': [1, 0], north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

  function newData(o) {
    var def = GeometryRender.defaultsOpt();
    var d = { v: 1, tpl: 'markup', P: {}, E: [], names: {}, sideLbl: {}, angLbl: {}, hidden: {}, show: {}, nameDir: {}, handles: [], prm: {}, opt: {} };
    o = o || {};
    if (o.sides) d.opt.sides = /val|length|قيم|أطوال/.test(o.sides) ? 'values' : 'none';
    if (o.angles) d.opt.angles = /val|قيم/.test(o.angles) ? 'values' : /mark|علام/.test(o.angles) ? 'marks' : 'none';
    ['ticks', 'right', 'names', 'dots', 'grid'].forEach(function (k) { if (o[k] !== undefined || o['no' + k] !== undefined) d.opt[k] = Mk.bool(o, k, def[k]); });
    if (o.unit !== undefined) d.opt.unit = o.unit === true ? '' : o.unit;
    if (o.decimals !== undefined) d.opt.dec = Mk.evalNum(o.decimals, 1) | 0;
    if (o.digits) d.opt.digits = /east|هند/i.test(o.digits) ? 'eastern' : 'western';
    if (o.eastern) d.opt.digits = 'eastern';
    if (o.notation) d.opt.notation = /en|lat/i.test(o.notation) ? 'en' : 'ar';
    if (o.fill) d.opt.fill = Mk.color(o.fill, def.fill);
    if (o.nofill) d.opt.fillOpacity = 0;
    if (o.opacity) d.opt.fillOpacity = Mk.evalNum(o.opacity, def.fillOpacity);
    if (o.stroke || o.color) d.opt.stroke = Mk.color(o.stroke || o.color, def.stroke);
    if (o.accent) d.opt.accent = Mk.color(o.accent, def.accent);
    if (o.linewidth) d.opt.width = Mk.evalNum(o.linewidth, def.width);
    if (o.fontsize) d.opt.fontSize = Mk.evalNum(o.fontsize, def.fontSize);
    if (o.font) d.opt.font = o.font;
    if (o.scale) d.scale = Mk.evalNum(o.scale, 1);
    return d;
  }
  function names(s) { return Mk.split(Mk.unbrace(s || ''), s && s.indexOf('،') >= 0 && s.indexOf(',') < 0 ? '،' : ','); }
  function addPoint(d, name, xy, explicit) {
    d.P[name] = xy;
    if (d.names[name] === undefined) d.names[name] = name;
    if (explicit) d.show[name] = true;
  }
  function need(d, n) { if (!d.P[n]) throw new Error('النقطة «' + n + '» غير معرّفة بعد'); return d.P[n]; }
  function nums(v) { return Mk.numList(v); }
  function applyShapeOptions(d, list, co, closed) {
    var n = list.length;
    var elem = { t: 'poly', p: list.slice() };
    if (co.fill !== undefined) elem.fill = co.fill === true ? undefined : (co.fill === 'none' ? false : Mk.color(co.fill, undefined));
    if (co.nofill) elem.fill = false;
    if (co.color) elem.color = Mk.color(co.color, undefined);
    if (co.dashed) elem.dash = true;
    if (closed !== false) d.E.push(elem);
    if (co.labels) Mk.list(co.labels).forEach(function (t, i) { if (t !== '' && t !== '-') d.sideLbl[list[i] + '-' + list[(i + 1) % n]] = t; });
    if (co.marks) Mk.list(co.marks).forEach(function (t, i) { var m = Mk.evalNum(t, 0) | 0; if (m) d.E.push({ t: 'side', p: [list[i], list[(i + 1) % n]], marks: m }); });
    if (co.anglelabels || co.anglabels) Mk.list(co.anglelabels || co.anglabels).forEach(function (t, i) {
      if (t === '' || t === '-') return;
      d.angLbl[list[(i + n - 1) % n] + '-' + list[i] + '-' + list[(i + 1) % n]] = t;
    });
  }

  // ------------------------------------------------------------ constructions
  function triangle(d, L, co) {
    if (L.length !== 3) throw new Error('المثلث يحتاج ثلاث نقاط');
    var A = L[0], B = L[1], C = L[2], pa, pb, pc;
    if (co.right) {
      var r = String(co.right === true ? B : co.right).trim();
      var i = L.indexOf(r); if (i < 0) i = 1;
      var R = L[i], N1 = L[(i + 1) % 3], N0 = L[(i + 2) % 3];
      var legs = nums(co.legs || ''), hyp = Mk.evalNum(co.hyp || co.hypotenuse, NaN);
      var l0 = legs[0], l1 = legs[1];
      if (!isFinite(l1) && isFinite(hyp) && isFinite(l0)) l1 = Math.sqrt(hyp * hyp - l0 * l0);
      if (!isFinite(l0)) l0 = 3; if (!isFinite(l1)) l1 = 4;
      var P = {}; P[R] = [0, 0]; P[N0] = [0, l0]; P[N1] = [l1, 0];
      pa = P[A]; pb = P[B]; pc = P[C];
    } else if (co.equilateral || co['متطابق الأضلاع']) {
      var sd = Mk.evalNum(co.side, 4);
      pb = [0, 0]; pc = [sd, 0]; pa = [sd / 2, sd * Math.sqrt(3) / 2];
    } else if (co.isosceles) {
      var base = Mk.evalNum(co.base, 4), leg = Mk.evalNum(co.legs || co.leg, NaN), h = Mk.evalNum(co.height, NaN);
      if (!isFinite(h)) h = isFinite(leg) ? Math.sqrt(Math.max(0, leg * leg - base * base / 4)) : 4;
      pb = [0, 0]; pc = [base, 0]; pa = [base / 2, h];
    } else if (co.base && co.angles) {
      var b2 = Mk.evalNum(co.base, 6), an = nums(co.angles), t1 = an[0] * D2R, t2 = an[1] * D2R;
      if (!(an[0] + an[1] < 180)) throw new Error('مجموع زاويتي القاعدة يجب أن يكون أقل من ١٨٠°');
      pb = [0, 0]; pc = [b2, 0];
      var k = b2 * Math.sin(t2) / Math.sin(t1 + t2);            // |BA|
      pa = [k * Math.cos(t1), k * Math.sin(t1)];
    } else if (co.sides) {
      var sv = nums(co.sides);
      if (sv.length === 2 && co.angle !== undefined) {           // SAS at A
        var ang = Mk.evalNum(co.angle, 60) * D2R;
        pa = [0, 0]; pb = [sv[0], 0]; pc = [sv[1] * Math.cos(ang), sv[1] * Math.sin(ang)];
        // turn so that BC is the horizontal base
        var P2 = rebase({ a: pa, b: pb, c: pc }); pa = P2.a; pb = P2.b; pc = P2.c;
      } else {
        var ab = sv[0], bc = sv[1], ca = sv[2];
        if (!(ab + bc > ca && bc + ca > ab && ca + ab > bc)) throw new Error('الأطوال ' + sv.join('، ') + ' لا تكوّن مثلثاً (متباينة المثلث)');
        pb = [0, 0]; pc = [bc, 0];
        var x = (ab * ab - ca * ca + bc * bc) / (2 * bc);
        pa = [x, Math.sqrt(Math.max(0, ab * ab - x * x))];
      }
    } else { pa = [1.4, 3.4]; pb = [0, 0]; pc = [5, 0]; }
    addPoint(d, A, pa); addPoint(d, B, pb); addPoint(d, C, pc);
    applyShapeOptions(d, L, co);
  }
  function rebase(p) {                      // rotate the triangle so that b→c is horizontal and a above
    var u = V.sub(p.c, p.b), t = -Math.atan2(u[1], u[0]);
    var f = function (q) { return V.rot(V.sub(q, p.b), t); };
    var a = f(p.a), b = [0, 0], c = f(p.c);
    if (a[1] < 0) { a[1] = -a[1]; }
    return { a: a, b: b, c: c };
  }
  function quad(d, kind, L, co) {
    if (L.length !== 4) throw new Error('الشكل الرباعي يحتاج أربع نقاط');
    var pts;
    if (kind === 'square') { var s = Mk.evalNum(co.side, 4); pts = [[0, 0], [s, 0], [s, s], [0, s]]; }
    else if (kind === 'rectangle') { var w = Mk.evalNum(co.width || co.length, 6), h = Mk.evalNum(co.height || co.width2, 3); pts = [[0, 0], [w, 0], [w, h], [0, h]]; }
    else if (kind === 'parallelogram') {
      var bb = Mk.evalNum(co.base, 5), sd = Mk.evalNum(co.side, 3), an = Mk.evalNum(co.angle, 60) * D2R;
      var off = [sd * Math.cos(an), sd * Math.sin(an)];
      pts = [[0, 0], [bb, 0], V.add([bb, 0], off), off];
    } else if (kind === 'rhombus') {
      var s2 = Mk.evalNum(co.side, 4), a2 = Mk.evalNum(co.angle, 60) * D2R, o2 = [s2 * Math.cos(a2), s2 * Math.sin(a2)];
      pts = [[0, 0], [s2, 0], V.add([s2, 0], o2), o2];
    } else if (kind === 'trapezoid') {
      var bot = Mk.evalNum(co.bottom || co.base, 6), top = Mk.evalNum(co.top, 3), ht = Mk.evalNum(co.height, 3);
      var shift = co.offset !== undefined ? Mk.evalNum(co.offset, 0) : (co.right ? 0 : (bot - top) / 2);
      pts = [[0, 0], [bot, 0], [shift + top, ht], [shift, ht]];
    } else if (kind === 'kite') {
      var dh = Mk.evalNum(co.width, 4), up = Mk.evalNum(co.top, 1.6), dn = Mk.evalNum(co.bottom, 3.6);
      pts = [[0, 0], [dh / 2, dn], [0, dn + up], [-dh / 2, dn]];
    }
    L.forEach(function (n, i) { addPoint(d, n, pts[i]); });
    applyShapeOptions(d, L, co);
  }
  function regular(d, L, co) {
    var n = L.length >= 3 ? L.length : (Mk.evalNum(co.n, 6) | 0);
    if (L.length < 3) { L = []; for (var i = 0; i < n; i++) L.push(GeoTemplates && GeoTemplates.AR ? (GeoTemplates.AR[i] || 'P' + i) : 'P' + i); }
    var side = Mk.evalNum(co.side, NaN), R = Mk.evalNum(co.radius, NaN);
    if (!isFinite(R)) R = isFinite(side) ? side / (2 * Math.sin(Math.PI / n)) : 2.5;
    var start = -Math.PI / 2 - Math.PI / n;
    L.forEach(function (nm, i) { addPoint(d, nm, [R * Math.cos(start + 2 * Math.PI * i / n), R * Math.sin(start + 2 * Math.PI * i / n)]); });
    applyShapeOptions(d, L, co);
    if (co.center) { addPoint(d, String(co.center), [0, 0]); d.show[String(co.center)] = true; }
  }
  function circle(d, args, co) {
    var L = names(args[0]);
    var c = L[0];
    if (!d.P[c]) addPoint(d, c, [0, 0]);
    var e = { t: 'circle', c: c };
    if (L[1]) { need(d, L[1]); e.through = L[1]; }
    else e.r = Mk.evalNum(co.radius || co.r, 2.5);
    if (co.fill) e.fill = Mk.color(co.fill === true ? undefined : co.fill, GeometryRender.defaultsOpt().fill);
    if (co.color) e.color = Mk.color(co.color, undefined);
    if (co.dashed) e.dash = true;
    d.E.push(e);
    d.show[c] = co.nocenter ? false : true;
    if (co.nocenter) d.hidden[c] = true;
    if (co.radiuslabel || co.showradius) {                    // draw a radius with a label
      var rp = c + '_r'; addPoint(d, rp, V.add(d.P[c], [radiusOf(d, e), 0])); d.hidden[rp] = true; d.names[rp] = '';
      d.E.push({ t: 'seg', p: [c, rp], label: co.radiuslabel === true ? (d.opt.notation === 'en' ? 'r' : 'نق') : co.radiuslabel });
    }
  }
  function radiusOf(d, e) { return e.through ? V.len(V.sub(d.P[e.through], d.P[e.c])) : e.r; }
  function circleOf(d, c) { var e = d.E.filter(function (x) { return x.t === 'circle' && x.c === c; })[0]; if (!e) throw new Error('لا توجد دائرة مركزها «' + c + '»'); return radiusOf(d, e); }

  // ------------------------------------------------------------ own syntax
  function parse(opts, body) {
    var o = typeof opts === 'string' ? Mk.options(opts) : (opts || {});
    var d = newData(o);
    Mk.commands(body).forEach(function (c) {
      var n = c.name, a = c.args, co = c.opt;
      try {
        if (n === 'triangle') triangle(d, names(a[0]), co);
        else if (/^(square|rectangle|parallelogram|rhombus|trapezoid|kite)$/.test(n)) quad(d, n, names(a[0]), co);
        else if (n === 'regular' || (n === 'polygon' && co.n)) regular(d, names(a[0] || ''), co);
        else if (n === 'polygon') { var L = names(a[0]); L.forEach(function (q) { need(d, q); }); applyShapeOptions(d, L, co); }
        else if (n === 'circle') circle(d, a, co);
        else if (n === 'point' || n === 'coordinate') {
          var nm = a[0], xy;
          if (co.on) { var cc = String(co.on), R = circleOf(d, cc), t = Mk.evalNum(co.angle, 90) * D2R; xy = V.add(need(d, cc), [R * Math.cos(t), R * Math.sin(t)]); }
          else if (a[1]) xy = Mk.point(a[1]);
          else if (c.coords[0]) xy = Mk.point(c.coords[0]);
          else if (d.P[nm]) xy = d.P[nm];
          else throw new Error('حدّد إحداثيات النقطة «' + nm + '» مثل \\point{' + nm + '}{(1, 2)}');
          addPoint(d, nm, xy, true);
          if (co.pos) d.nameDir[nm] = POS[co.pos] || POS.above;
          if (co.hidden || co.noname) d.names[nm] = '';
          if (co.nodot) (d.dotsFor = d.dotsFor || {})[nm] = false;
        }
        else if (n === 'midpoint') { var ab = names(a[1]); addPoint(d, a[0], V.mul(V.add(need(d, ab[0]), need(d, ab[1])), 0.5), true); }
        else if (n === 'foot' || n === 'projection') {
          var from = need(d, a[1]), bc = names(a[2]), P1 = need(d, bc[0]), P2 = need(d, bc[1]), u = V.norm(V.sub(P2, P1));
          addPoint(d, a[0], V.add(P1, V.mul(u, V.dot(V.sub(from, P1), u))), true);
          if (!co.nodraw) { d.E.push({ t: 'seg', p: [a[1], a[0]], dash: !!co.dashed, len: false }); d.E.push({ t: 'angle', p: [a[1], a[0], bc[1] === a[0] ? bc[0] : bc[1]], right: true }); }
        }
        else if (n === 'intersection') {
          var l1 = names(a[1]), l2 = names(a[2]);
          addPoint(d, a[0], inter(need(d, l1[0]), need(d, l1[1]), need(d, l2[0]), need(d, l2[1])), true);
        }
        else if (n === 'segment' || n === 'side' || n === 'vector' || n === 'line' || n === 'ray') {
          var S2 = names(a[0]); need(d, S2[0]); need(d, S2[1]);
          var e = { t: n === 'segment' || n === 'vector' ? 'seg' : n, p: [S2[0], S2[1]] };
          if (n === 'vector') { e.arrow = true; e.len = co.label !== undefined; }
          if (co.dashed) e.dash = true;
          if (co.color) e.color = Mk.color(co.color, undefined);
          if (co.label !== undefined) e.label = co.label === true ? '' : co.label;
          if (co.marks !== undefined) e.marks = Mk.evalNum(co.marks, 0) | 0;
          if (co.parallel || co.par) e.par = Mk.evalNum(co.parallel || co.par, 1) | 0;
          if (co.nolength) e.len = false;
          d.E.push(e);
        }
        else if (n === 'parallelmark') { var pm = names(a[0]); d.E.push({ t: 'side', p: pm, par: Mk.evalNum(co.marks, 1) | 0, len: false }); }
        else if (n === 'angle') {
          var T = names(a[0]); T.forEach(function (q) { need(d, q); });
          var ae = { t: 'angle', p: T };
          if (co.label !== undefined) ae.label = co.label;
          if (co.value) ae.value = true;
          if (co.arcs) ae.arcs = Mk.evalNum(co.arcs, 1) | 0;
          if (co.right) ae.right = true;
          if (co.color) ae.color = Mk.color(co.color, undefined);
          if (co.fill) ae.fill = true;
          d.E.push(ae);
        }
        else if (n === 'text' || n === 'label') {
          var at = a[0], txt = a[1] || '';
          if (d.P[Mk.unbrace(at)]) d.E.push({ t: 'text', at: Mk.unbrace(at), text: txt, dy: -14 });
          else d.E.push({ t: 'text', xy: Mk.point(at), text: txt });
        }
        else if (n === 'name') { d.names[a[0]] = a[1] || ''; }
        else if (CONSTRUCT[n]) CONSTRUCT[n](d, a, co);
      } catch (err) { throw new Error(err.message + ' — السطر ' + c.line); }
    });
    // polygons of arcs placeholders removed
    d.E = d.E.filter(function (e) { return !(e.t === 'side' && e.p[0] === e.p[1]); });
    if (!Object.keys(d.P).length) throw new Error('الشكل فارغ: ابدأ بـ \\triangle أو \\point');
    return d;
  }
  // ------------------------------------------------------------ constructions and transformations
  function helper(d, key, xy) { addPoint(d, key, xy); d.names[key] = ''; d.hidden[key] = true; return key; }
  function named(d, name, xy, fallbackKey) {
    if (name) { addPoint(d, name, xy, true); return name; }
    return helper(d, fallbackKey, xy);
  }
  function prime(n) { return n + '′'; }
  function triPts(d, a) { var T = names(a[0]); if (T.length !== 3) throw new Error('حدّد رؤوس المثلث الثلاثة'); T.forEach(function (q) { need(d, q); }); return T; }
  var CONSTRUCT = {
    // العمود المنصف لقطعة
    perpbisector: function (d, a, co) {
      var AB = names(a[0]), A = need(d, AB[0]), B = need(d, AB[1]);
      var M = V.mul(V.add(A, B), 0.5), u = V.norm(V.perp(V.sub(B, A))), L = V.len(V.sub(B, A)) * 0.5;
      var m = named(d, co.name || co.mid, M, '_pb' + AB.join(''));
      var k1 = helper(d, '_pb1' + AB.join(''), V.add(M, V.mul(u, L))), k2 = helper(d, '_pb2' + AB.join(''), V.sub(M, V.mul(u, L)));
      d.E.push({ t: 'line', p: [k2, k1], dash: co.dashed !== false && !co.solid, color: co.color ? Mk.color(co.color) : undefined, len: false });
      d.E.push({ t: 'angle', p: [AB[1], m, k1], right: true });
      if (co.marks !== false && !co.nomarks) { d.E.push({ t: 'side', p: [AB[0], m], marks: 1, label: '' }); d.E.push({ t: 'side', p: [m, AB[1]], marks: 1, label: '' }); }
    },
    // منصف الزاوية عند الرأس الأوسط: \bisector{ب,أ,جـ}[name=د]
    bisector: function (d, a, co) {
      var T = names(a[0]); T.forEach(function (q) { need(d, q); });
      var O = d.P[T[1]], u1 = V.norm(V.sub(d.P[T[0]], O)), u2 = V.norm(V.sub(d.P[T[2]], O)), bis = V.norm(V.add(u1, u2));
      var far = V.add(O, V.mul(bis, Math.max(V.len(V.sub(d.P[T[0]], O)), V.len(V.sub(d.P[T[2]], O)))));
      var end = inter(O, far, d.P[T[0]], d.P[T[2]]);          // meets the opposite side
      var D = named(d, co.name, end, '_bi' + T.join(''));
      d.E.push({ t: 'seg', p: [T[1], D], dash: !!co.dashed, len: false, color: co.color ? Mk.color(co.color) : undefined });
      d.E.push({ t: 'angle', p: [T[0], T[1], D], arcs: 1 }); d.E.push({ t: 'angle', p: [D, T[1], T[2]], arcs: 1 });
    },
    // القطعة المتوسطة: \median{أ}{ب,جـ}[name=د]
    median: function (d, a, co) {
      var A = a[0], BC = names(a[1]); need(d, A); need(d, BC[0]); need(d, BC[1]);
      var M = named(d, co.name, V.mul(V.add(d.P[BC[0]], d.P[BC[1]]), 0.5), '_md' + A + BC.join(''));
      d.E.push({ t: 'seg', p: [A, M], dash: !!co.dashed, len: false });
      d.E.push({ t: 'side', p: [BC[0], M], marks: 1, label: '' }); d.E.push({ t: 'side', p: [M, BC[1]], marks: 1, label: '' });
    },
    // الدائرة المارة برؤوس المثلث
    circumcircle: function (d, a, co) {
      var T = triPts(d, a), A = d.P[T[0]], B = d.P[T[1]], C = d.P[T[2]];
      var D = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
      if (Math.abs(D) < 1e-12) throw new Error('النقاط على استقامة واحدة');
      var sq = function (p) { return p[0] * p[0] + p[1] * p[1]; };
      var O = [(sq(A) * (B[1] - C[1]) + sq(B) * (C[1] - A[1]) + sq(C) * (A[1] - B[1])) / D, (sq(A) * (C[0] - B[0]) + sq(B) * (A[0] - C[0]) + sq(C) * (B[0] - A[0])) / D];
      var c = named(d, co.center || co.name, O, '_cc' + T.join(''));
      d.E.push({ t: 'circle', c: c, r: V.len(V.sub(A, O)), color: co.color ? Mk.color(co.color) : undefined, dash: !!co.dashed });
      if (co.radii) T.forEach(function (q) { d.E.push({ t: 'seg', p: [c, q], dash: true, len: false }); });
    },
    // الدائرة الداخلية للمثلث (تمس الأضلاع الثلاثة)
    incircle: function (d, a, co) {
      var T = triPts(d, a), A = d.P[T[0]], B = d.P[T[1]], C = d.P[T[2]];
      var la = V.len(V.sub(B, C)), lb = V.len(V.sub(C, A)), lc = V.len(V.sub(A, B)), per = la + lb + lc;
      var I = [(la * A[0] + lb * B[0] + lc * C[0]) / per, (la * A[1] + lb * B[1] + lc * C[1]) / per];
      var area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2, r = area / (per / 2);
      var c = named(d, co.center || co.name, I, '_ic' + T.join(''));
      d.E.push({ t: 'circle', c: c, r: r, color: co.color ? Mk.color(co.color) : undefined });
      if (co.touch || co.points) {                      // tangency points with right-angle marks
        var tn = co.points ? Mk.list(co.points) : [];
        [[T[1], T[2]], [T[2], T[0]], [T[0], T[1]]].forEach(function (s2, k) {
          var P1 = d.P[s2[0]], P2 = d.P[s2[1]], u = V.norm(V.sub(P2, P1)), F = V.add(P1, V.mul(u, V.dot(V.sub(I, P1), u)));
          var f = named(d, tn[k], F, '_it' + k + T.join(''));
          d.E.push({ t: 'seg', p: [c, f], dash: true, len: false });
          d.E.push({ t: 'angle', p: [c, f, s2[1]], right: true });
        });
      }
    },
    // مماس للدائرة عند نقطة عليها: \tangent{م}{أ}
    tangent: function (d, a, co) {
      var c = a[0], T = a[1]; need(d, c); need(d, T);
      var r = V.sub(d.P[T], d.P[c]), u = V.norm(V.perp(r)), L = Mk.evalNum(co.length, V.len(r) * 1.2);
      var k1 = helper(d, '_tg1' + c + T, V.add(d.P[T], V.mul(u, L / 2))), k2 = helper(d, '_tg2' + c + T, V.sub(d.P[T], V.mul(u, L / 2)));
      d.E.push({ t: 'line', p: [k2, k1], color: co.color ? Mk.color(co.color) : undefined, len: false });
      if (!co.noradius) d.E.push({ t: 'seg', p: [c, T], dash: true, len: false });
      d.E.push({ t: 'angle', p: [c, T, k1], right: true });
    },
    // مماسان من نقطة خارج الدائرة: \tangents{ن}{م}[names=أ,ب]
    tangents: function (d, a, co) {
      var P = a[0], c = a[1]; need(d, P); need(d, c);
      var R = circleOf(d, c), v = V.sub(d.P[P], d.P[c]), dist = V.len(v);
      if (dist <= R + 1e-9) throw new Error('النقطة «' + P + '» ليست خارج الدائرة');
      var t = Math.acos(R / dist), base = Math.atan2(v[1], v[0]), nm = co.names ? Mk.list(co.names) : [];
      if (nm.length < 2) nm[1] = nm[1] || (nm[0] ? nm[0] + '′' : '');
      [base + t, base - t].forEach(function (ang, k) {
        var X = V.add(d.P[c], [R * Math.cos(ang), R * Math.sin(ang)]);
        var q = named(d, nm[k], X, '_tt' + k + P + c);
        d.E.push({ t: 'seg', p: [P, q], len: false });
        if (!co.noradius) { d.E.push({ t: 'seg', p: [c, q], dash: true, len: false }); d.E.push({ t: 'angle', p: [c, q, P], right: true }); }
      });
    },
    // التحويلات الهندسية — تُنتج صورة الشكل بأسماء مُشرطة (أ′ ب′ …)
    reflect: function (d, a, co) { transformCmd(d, a, co, 'reflect'); },
    rotate: function (d, a, co) { transformCmd(d, a, co, 'rotate'); },
    translate: function (d, a, co) { transformCmd(d, a, co, 'translate'); },
    dilate: function (d, a, co) { transformCmd(d, a, co, 'dilate'); },
    enlarge: function (d, a, co) { transformCmd(d, a, co, 'dilate'); }
  };
  function transformCmd(d, a, co, kind) {
    var L = names(a[0]); L.forEach(function (q) { need(d, q); });
    var f;
    if (kind === 'reflect') {
      if (co.center) { var Cc = need(d, String(co.center)); f = function (p) { return V.sub(V.mul(Cc, 2), p); }; }
      else if (co.over || co.line || co.axis) {
        var ax = String(co.over || co.line || co.axis);
        if (/^[xس]$/.test(ax)) f = function (p) { return [p[0], -p[1]]; };
        else if (/^[yص]$/.test(ax)) f = function (p) { return [-p[0], p[1]]; };
        else {
          var AB = names(ax), P1 = need(d, AB[0]), P2 = need(d, AB[1]), u = V.norm(V.sub(P2, P1));
          f = function (p) { var q = V.add(P1, V.mul(u, V.dot(V.sub(p, P1), u))); return V.sub(V.mul(q, 2), p); };
        }
      } else throw new Error('حدّد محور الانعكاس over=أ,ب أو المركز center=م');
    } else if (kind === 'rotate') {
      var O = co.center ? need(d, String(co.center)) : [0, 0], t = Mk.evalNum(co.angle, 90) * D2R;
      if (co.cw || co.clockwise) t = -t;
      f = function (p) { return V.add(O, V.rot(V.sub(p, O), t)); };
    } else if (kind === 'translate') {
      var vv;
      if (co.vector && /,/.test(String(co.vector)) && !/\(/.test(String(co.vector))) { var VB = names(String(co.vector)); vv = V.sub(need(d, VB[1]), need(d, VB[0])); }
      else vv = Mk.point(co.by || co.vector || '(3,0)');
      f = function (p) { return V.add(p, vv); };
    } else {
      var Z = co.center ? need(d, String(co.center)) : [0, 0], kk = Mk.evalNum(co.k || co.factor || co.scale, 2);
      f = function (p) { return V.add(Z, V.mul(V.sub(p, Z), kk)); };
    }
    var out = co.names ? Mk.list(co.names) : [];
    L.forEach(function (q, i) { if (!out[i]) out[i] = prime(q); });            // missing names → أ′ ب′ …
    var col = co.color ? Mk.color(co.color) : '#c2352b';
    L.forEach(function (q, i) { addPoint(d, out[i], f(d.P[q]), true); });
    if (L.length >= 3) d.E.push({ t: 'poly', p: out.slice(0, L.length), color: col, fill: co.nofill ? false : Mk.color(co.fill || col), fillOpacity: 0.1, dash: !!co.dashed });
    else if (L.length === 2) d.E.push({ t: 'seg', p: out.slice(0, 2), color: col, len: false });
    if (co.lines || co.paths) L.forEach(function (q, i) { d.E.push({ t: 'seg', p: [q, out[i]], dash: true, len: false, color: '#8aa0a8' }); });
    if (kind === 'reflect' && (co.over || co.line) && !/^[xyسص]$/.test(String(co.over || co.line)) && !co.noaxis) {
      var AB2 = names(String(co.over || co.line)); d.E.push({ t: 'line', p: AB2, dash: true, len: false, color: '#5f7179' });
    }
    if (kind === 'rotate' && co.center && co.arc !== false && co.arcs !== false) d.E.push({ t: 'angle', p: [L[0], String(co.center), out[0]], label: co.anglelabel || (Mk.fmt(Math.abs(Mk.evalNum(co.angle, 90)), 1) + '°') });
  }

  function inter(p1, p2, p3, p4) {
    var den = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
    if (Math.abs(den) < 1e-12) throw new Error('المستقيمان متوازيان');
    var a = p1[0] * p2[1] - p1[1] * p2[0], b = p3[0] * p4[1] - p3[1] * p4[0];
    return [(a * (p3[0] - p4[0]) - (p1[0] - p2[0]) * b) / den, (a * (p3[1] - p4[1]) - (p1[1] - p2[1]) * b) / den];
  }

  // ------------------------------------------------------------ serialize (any geometry data -> own syntax)
  function serialize(d) {
    var def = GeometryRender.defaultsOpt(), o = d.opt || {}, op = [];
    if (o.sides && o.sides !== def.sides) op.push(['sides', o.sides]);
    if (o.angles && o.angles !== def.angles) op.push(['angles', o.angles]);
    if (o.unit !== undefined && o.unit !== def.unit) op.push(['unit', o.unit || '{}']);
    if (o.digits === 'eastern') op.push(['digits', 'eastern']);
    if (o.notation === 'en') op.push(['notation', 'en']);
    ['ticks', 'right', 'names', 'dots'].forEach(function (k) { if (o[k] === false) op.push('no' + k); });
    if (o.fill && o.fill !== def.fill) op.push(['fill', o.fill]);
    if (o.fillOpacity !== undefined && o.fillOpacity !== def.fillOpacity) op.push(['opacity', o.fillOpacity]);
    if (o.stroke && o.stroke !== def.stroke) op.push(['stroke', o.stroke]);
    if (o.accent && o.accent !== def.accent) op.push(['accent', o.accent]);
    if (d.scale && d.scale !== 1) op.push(['scale', d.scale]);
    var nm = function (k) { return d.names && d.names[k] ? d.names[k] : k; };
    var out = ['\\begin{geometry}' + Mk.optStr(op)];
    var used = {};
    (d.E || []).forEach(function (e) { (e.p || []).forEach(function (q) { used[q] = 1; }); if (e.c) used[e.c] = 1; if (e.through) used[e.through] = 1; if (e.at) used[e.at] = 1; });
    Object.keys(d.P).forEach(function (k) {
      if (!used[k] && !(d.show && d.show[k])) return;
      var po = [];
      if (d.hidden && d.hidden[k] || (d.names && d.names[k] === '')) po.push('noname');
      out.push('  \\point' + Mk.optStr(po) + '{' + key(k) + '}{(' + Mk.fmt(d.P[k][0], 3) + ', ' + Mk.fmt(d.P[k][1], 3) + ')}');
    });
    (d.E || []).forEach(function (e) {
      if (e.t === 'poly') out.push('  \\polygon{' + e.p.map(key).join(',') + '}');
      else if (e.t === 'seg') out.push('  \\' + (e.arrow ? 'vector' : 'segment') + Mk.optStr([e.dash ? 'dashed' : null, ['label', e.label], ['marks', e.marks], ['parallel', e.par]]) + '{' + e.p.map(key).join(',') + '}');
      else if (e.t === 'side') out.push('  \\side' + Mk.optStr([['label', e.label], ['marks', e.marks]]) + '{' + e.p.map(key).join(',') + '}');
      else if (e.t === 'line' || e.t === 'ray') out.push('  \\' + e.t + Mk.optStr([e.dash ? 'dashed' : null, ['parallel', e.par]]) + '{' + e.p.map(key).join(',') + '}');
      else if (e.t === 'circle') out.push('  \\circle' + (e.through ? '' : Mk.optStr([['radius', Mk.fmt(+e.r, 3)]])) + '{' + key(e.c) + (e.through ? ',' + key(e.through) : '') + '}');
      else if (e.t === 'angle') out.push('  \\angle' + Mk.optStr([['label', e.label], e.value ? 'value' : null, ['arcs', e.arcs], e.right ? 'right' : null, e.fill ? 'fill' : null]) + '{' + e.p.map(key).join(',') + '}');
      else if (e.t === 'text') out.push('  \\text{' + (e.at ? key(e.at) : '(' + e.xy.join(', ') + ')') + '}{' + e.text + '}');
    });
    Object.keys(d.sideLbl || {}).forEach(function (k) { var ab = k.split('-'); out.push('  \\side' + Mk.optStr([['label', d.sideLbl[k]]]) + '{' + key(ab[0]) + ',' + key(ab[1]) + '}'); });
    Object.keys(d.angLbl || {}).forEach(function (k) {
      var v = d.angLbl[k]; if (v === '__none__') return;
      out.push('  \\angle' + Mk.optStr([['label', v]]) + '{' + k.split('-').map(key).join(',') + '}');
    });
    out.push('\\end{geometry}');
    // point keys are written as their displayed names when those are unique
    function key(k) { return k; }
    return renameKeys(out.join('\n'), d);
  }
  function renameKeys(code, d) {
    // replace internal keys (A, B, P1…) by the displayed names when names are unique non-empty
    var map = {}, seen = {};
    Object.keys(d.P).forEach(function (k) {
      var n = d.names && d.names[k];
      if (n && !seen[n] && n !== k && !/[,{}()\[\]]/.test(n)) { map[k] = n; seen[n] = 1; }
    });
    if (!Object.keys(map).length) return code;
    return code.replace(/\{([^{}]*)\}/g, function (m0, inner) {
      if (!/^[^=]*$/.test(inner)) return m0;
      var parts = inner.split(',');
      if (!parts.every(function (p) { p = p.trim(); return map[p] || d.P[p] || /^\(/.test(p); })) return m0;
      return '{' + parts.map(function (p) { var t = p.trim(); return map[t] || t; }).join(',') + '}';
    });
  }

  // ------------------------------------------------------------ TikZ / tkz-euclide import
  var GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', phi: 'φ', varphi: 'φ', omega: 'ω', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', epsilon: 'ε', varepsilon: 'ε', rho: 'ρ', tau: 'τ', psi: 'ψ', Delta: 'Δ', Omega: 'Ω', circ: '°', degree: '°' };
  function labelText(s) {
    s = Mk.unbrace(String(s || '')).replace(/^\$|\$$/g, '').replace(/\\mathrm\{([^}]*)\}|\\text\{([^}]*)\}|\\textbf\{([^}]*)\}/g, '$1$2$3')
      .replace(/\^\{?\\circ\}?/g, '°').replace(/\\([a-zA-Z]+)/g, function (m0, g) { return GREEK[g] || m0; })
      .replace(/\\,|\\;|\\ /g, ' ').replace(/[{}]/g, '').trim();
    return s;
  }
  function fromTikz(code) {
    var d = newData({});
    d.opt.sides = 'none'; d.opt.angles = 'none'; d.opt.ticks = false;
    var auto = 0;
    var src = code.replace(/\\begin\{tikzpicture\}(\[[^\]]*\])?/, '').replace(/\\end\{tikzpicture\}/, '').replace(/%[^\n]*/g, '')
      .replace(/\\(tkz[A-Za-z]+)/g, ';\\$1');
    var scale = 1;
    var sm = code.match(/\\begin\{tikzpicture\}\s*\[([^\]]*)\]/);
    if (sm) { var so = Mk.options(sm[1]); if (so.scale) scale = Mk.evalNum(so.scale, 1); }
    function coordOf(tok, last) {
      tok = tok.trim();
      var m;
      if ((m = /^\(\s*([^()]*?)\s*\)$/.exec(tok))) {
        var inner = m[1];
        if (/^[-\d.\s\\a-z{}]+,[-\d.\s\\a-z{}]+$/i.test(inner) && !d.P[inner]) { var p = Mk.point(inner); return { xy: [p[0] * scale, p[1] * scale] }; }
        if (/^[-\d.]+\s*:\s*[-\d.]+$/.test(inner)) { var pp = inner.split(':'); var r = +pp[1] * scale, t = +pp[0] * D2R; return { xy: [r * Math.cos(t), r * Math.sin(t)] }; }
        if (d.P[inner]) return { name: inner };
      }
      if ((m = /^\+\+?\(\s*([^()]*)\s*\)$/.exec(tok)) && last) { var q = Mk.point(m[1]); return { xy: V.add(d.P[last], [q[0] * scale, q[1] * scale]) }; }
      return null;
    }
    function ensure(c) {
      if (c.name) return c.name;
      var same = Object.keys(d.P).filter(function (q) { return Math.abs(d.P[q][0] - c.xy[0]) < 1e-9 && Math.abs(d.P[q][1] - c.xy[1]) < 1e-9; })[0];
      if (same) return same;
      var k = '_p' + (auto++); addPoint(d, k, c.xy); d.names[k] = ''; d.hidden[k] = true; return k;
    }
    var stmts = [];
    var depth = 0, cur = '';
    for (var i = 0; i < src.length; i++) {
      var ch = src[i];
      if (ch === '{') depth++; if (ch === '}') depth--;
      if (ch === ';' && depth === 0) { stmts.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) stmts.push(cur.trim());
    stmts.forEach(function (st) {
      var m;
      // \coordinate[label=above:$A$] (A) at (0,0)
      if ((m = /^\\coordinate\s*(\[[^\]]*\])?\s*\(([^)]*)\)\s*at\s*(\([^)]*\))/.exec(st))) {
        var c = coordOf(m[3]); if (!c) return;
        addPoint(d, m[2].trim(), c.xy || d.P[c.name]);
        var lo = m[1] ? Mk.options(m[1].slice(1, -1)) : {};
        if (lo.label) { var lp = String(lo.label).split(':'); if (lp.length > 1) { d.names[m[2].trim()] = labelText(lp.slice(1).join(':')); d.nameDir[m[2].trim()] = POS[lp[0].trim()] || POS.above; } else d.names[m[2].trim()] = labelText(lp[0]); }
        else d.names[m[2].trim()] = '';
        return;
      }
      // \node[pos] (A) at (x,y) {$A$}   or  \node[pos] at (A) {$A$}
      if ((m = /^\\node\s*(\[[^\]]*\])?\s*(?:\(([^)]*)\))?\s*at\s*(\([^)]*\))\s*\{([\s\S]*)\}\s*$/.exec(st))) {
        var no = m[1] ? Mk.options(m[1].slice(1, -1)) : {};
        var pc = coordOf(m[3]); if (!pc) return;
        var txt = labelText(m[4]);
        var posKey = Object.keys(no).filter(function (k) { return POS[k] && no[k] === true; })[0] || (no.anchor ? null : null);
        if (m[2]) { addPoint(d, m[2].trim(), pc.xy || d.P[pc.name]); d.names[m[2].trim()] = txt; if (posKey) d.nameDir[m[2].trim()] = POS[posKey]; return; }
        if (pc.name && d.names[pc.name] === '' && txt.length <= 3) { d.names[pc.name] = txt; if (posKey) d.nameDir[pc.name] = POS[posKey]; d.show[pc.name] = true; return; }
        var xy = pc.xy || d.P[pc.name], off = posKey ? V.mul(POS[posKey], 14) : [0, 0];
        d.E.push({ t: 'text', xy: xy, text: txt, dx: off[0], dy: off[1] });
        return;
      }
      // \draw / \fill / \filldraw / \path
      if ((m = /^\\(draw|fill|filldraw|path)\s*(\[[^\]]*(?:\[[^\]]*\][^\]]*)*\])?\s*([\s\S]*)$/.exec(st))) {
        var kind = m[1], dop = m[2] ? Mk.options(m[2].slice(1, -1)) : {}, path = m[3];
        var color = Mk.color(dop.color || dop.draw || Object.keys(dop).filter(function (k) { return dop[k] === true && Mk.COLORS[k.split('!')[0].toLowerCase()]; })[0], undefined);
        var fill = kind !== 'draw' ? Mk.color(dop.fill || color, GeometryRender.defaultsOpt().fill) : (dop.fill ? Mk.color(dop.fill, undefined) : undefined);
        var dashed = !!(dop.dashed || dop['densely dashed'] || dop['dotted']);
        var arrow = Object.keys(dop).some(function (k) { return /^(->|-stealth|-latex|->>)$/.test(k); });
        // pics: angle marks
        var pm, pre = /pic\s*(\[[^\]]*\])?\s*\{\s*(right angle|angle)\s*=\s*\(?([^)}]*?)\)?\s*--\s*\(?([^)}]*?)\)?\s*--\s*\(?([^)}]*?)\)?\s*\}/g;
        while ((pm = pre.exec(path))) {
          var po = pm[1] ? Mk.options(pm[1].slice(1, -1)) : {};
          var ae = { t: 'angle', p: [pm[3].trim(), pm[4].trim(), pm[5].trim()] };
          if (pm[2] === 'right angle') ae.right = true;
          var q = Object.keys(po).filter(function (k) { return /^".*"$/.test(k); })[0];
          if (q) ae.label = labelText(q.slice(1, -1));
          if (po.fill) ae.fill = true;
          if (ae.p.every(function (x) { return d.P[x]; })) d.E.push(ae);
        }
        path = path.replace(pre, '');
        // tokenise path
        var toks = path.match(/\+\+?\([^()]*\)|\([^()]*\)|--|cycle|circle\s*(\[[^\]]*\])?\s*(\([^()]*\))?|rectangle|node\s*(\[[^\]]*\])?\s*\{[^{}]*\}|to\s*(\[[^\]]*\])?/g) || [];
        var chain = [], lastName = null, pending = null;
        var flush = function (closed) {
          if (chain.length >= 2) {
            if (closed || (chain.length > 2 && chain[0] === chain[chain.length - 1])) {
              var pts = chain.slice(); if (pts[0] === pts[pts.length - 1]) pts.pop();
              var pe = { t: 'poly', p: pts, fill: fill ? fill : false };
              if (color) pe.color = color; if (dashed) pe.dash = true;
              d.E.push(pe);
            } else {
              for (var k = 1; k < chain.length; k++) {
                var se = { t: 'seg', p: [chain[k - 1], chain[k]], len: false };
                if (color) se.color = color; if (dashed) se.dash = true; if (arrow && k === chain.length - 1) se.arrow = true;
                d.E.push(se);
              }
            }
          }
          chain = [];
        };
        toks.forEach(function (t) {
          if (t === '--' || /^to/.test(t)) { pending = 'line'; return; }
          if (t === 'cycle') { flush(true); return; }
          if (/^circle/.test(t)) {
            var cm = /\(([^()]*)\)/.exec(t), co2 = /\[([^\]]*)\]/.exec(t), r = cm ? Mk.evalNum(cm[1], 1) : (co2 ? Mk.evalNum(Mk.options(co2[1]).radius, 1) : 1);
            if (lastName) { var ce = { t: 'circle', c: lastName, r: r * scale }; if (color) ce.color = color; if (fill) ce.fill = fill; if (dashed) ce.dash = true; d.E.push(ce); d.show[lastName] = !d.hidden[lastName]; }
            chain = []; return;
          }
          if (/^node/.test(t)) {
            var nb = /\{([^{}]*)\}/.exec(t), nopt = /\[([^\]]*)\]/.exec(t), txt2 = labelText(nb ? nb[1] : '');
            var pk = nopt ? Object.keys(Mk.options(nopt[1])).filter(function (k) { return POS[k]; })[0] : null;
            if (lastName && txt2) {
              if (d.hidden[lastName] && txt2.length <= 3) { d.names[lastName] = txt2; d.hidden[lastName] = false; if (pk) d.nameDir[lastName] = POS[pk]; }
              else { var off2 = pk ? V.mul(POS[pk], 14) : [0, 0]; d.E.push({ t: 'text', xy: d.P[lastName].slice(), text: txt2, dx: off2[0], dy: off2[1] }); }
            }
            return;
          }
          if (t === 'rectangle') { pending = 'rect'; return; }
          var cc = coordOf(t, lastName); if (!cc) return;
          var name = ensure(cc);
          if (pending === 'rect' && lastName) {
            var p0 = d.P[lastName], p1 = d.P[name];
            var k1 = ensure({ xy: [p1[0], p0[1]] }), k2 = ensure({ xy: [p0[0], p1[1]] });
            d.E.push({ t: 'poly', p: [lastName, k1, name, k2], fill: fill ? fill : false, color: color, dash: dashed });
            chain = []; pending = null; lastName = name; return;
          }
          if (pending === 'line' || !chain.length) chain.push(name);
          else { flush(false); chain.push(name); }
          pending = null; lastName = name;
        });
        flush(false);
        return;
      }
      // tkz-euclide
      if ((m = /^\\tkzDefPoint\s*(\([^)]*\))\s*\{([^}]*)\}/.exec(st))) { var tp = Mk.point(m[1].slice(1, -1)); addPoint(d, m[2].trim(), tp); return; }
      if ((m = /^\\tkzDefPoints\s*\{([^}]*)\}/.exec(st))) {
        Mk.split(m[1], ',').reduce(function (acc, v, i, arr) { if (i % 3 === 2) addPoint(d, v.trim(), [Mk.evalNum(arr[i - 2], 0), Mk.evalNum(arr[i - 1], 0)]); return acc; }, 0);
        return;
      }
      if ((m = /^\\tkzDrawPolygon\s*(\[[^\]]*\])?\s*\(([^)]*)\)/.exec(st))) { var tl = Mk.split(m[2], ','); d.E.push({ t: 'poly', p: tl }); return; }
      if ((m = /^\\tkzDrawSegments?\s*(\[[^\]]*\])?\s*\(([^)]*)\)/.exec(st))) {
        var so2 = m[1] ? Mk.options(m[1].slice(1, -1)) : {};
        m[2].trim().split(/\s+/).forEach(function (pair) { var ab = pair.split(','); if (ab.length === 2) d.E.push({ t: 'seg', p: [ab[0].trim(), ab[1].trim()], dash: !!so2.dashed, len: false }); });
        return;
      }
      if ((m = /^\\tkzDrawCircles?\s*(\[[^\]]*\])?\s*\(([^)]*)\)/.exec(st))) { var cl = Mk.split(m[2], ','); d.E.push({ t: 'circle', c: cl[0], through: cl[1] }); return; }
      if ((m = /^\\tkzDrawLines?\s*(\[[^\]]*\])?\s*\(([^)]*)\)/.exec(st))) { var ll = Mk.split(m[2], ','); d.E.push({ t: 'line', p: [ll[0], ll[1]], ext: 0.8 }); return; }
      if ((m = /^\\tkzMarkRightAngles?\s*(\[[^\]]*\])?\s*\(([^)]*)\)/.exec(st))) { d.E.push({ t: 'angle', p: Mk.split(m[2], ','), right: true }); return; }
      if ((m = /^\\tkzMarkAngles?\s*(\[[^\]]*\])?\s*\(([^)]*)\)/.exec(st))) { d.E.push({ t: 'angle', p: Mk.split(m[2], ',') }); return; }
      if ((m = /^\\tkzLabelAngles?\s*(\[[^\]]*\])?\s*\(([^)]*)\)\s*\{([^}]*)\}/.exec(st))) {
        var al = Mk.split(m[2], ','), ex = d.E.filter(function (e) { return e.t === 'angle' && e.p.join() === al.join(); })[0];
        if (ex) ex.label = labelText(m[3]); else d.E.push({ t: 'angle', p: al, label: labelText(m[3]) });
        return;
      }
      if ((m = /^\\tkzMarkSegments?\s*(\[[^\]]*\])?\s*\(([^)]*)\)/.exec(st))) {
        var mo = m[1] ? Mk.options(m[1].slice(1, -1)) : {}, cnt = /\|\|\|/.test(mo.mark || '') ? 3 : /\|\|/.test(mo.mark || '') ? 2 : 1;
        m[2].trim().split(/\s+/).forEach(function (pair) { var ab = pair.split(','); if (ab.length === 2) d.E.push({ t: 'side', p: [ab[0].trim(), ab[1].trim()], marks: cnt, len: false }); });
        return;
      }
      if ((m = /^\\tkzLabelPoints?\s*(\[[^\]]*\])?\s*\(([^)]*)\)/.exec(st))) {
        var lo2 = m[1] ? Mk.options(m[1].slice(1, -1)) : {}, pk2 = Object.keys(lo2).filter(function (k) { return POS[k]; })[0];
        Mk.split(m[2], ',').forEach(function (k) { d.show[k] = true; if (pk2) d.nameDir[k] = POS[pk2]; });
        return;
      }
      if ((m = /^\\tkzLabelSegments?\s*(\[[^\]]*\])?\s*\(([^)]*)\)\s*\{([^}]*)\}/.exec(st))) {
        m[2].trim().split(/\s+/).forEach(function (pair) { var ab = pair.split(','); if (ab.length === 2) d.sideLbl[ab[0].trim() + '-' + ab[1].trim()] = labelText(m[3]); });
        return;
      }
      if ((m = /^\\tkzDrawPoints?\s*(\[[^\]]*\])?\s*\(([^)]*)\)/.exec(st))) { Mk.split(m[2], ',').forEach(function (k) { d.show[k] = true; }); return; }
    });
    if (!Object.keys(d.P).length) throw new Error('لم أتعرف على نقاط في رسم TikZ');
    // TikZ figures usually name points with $A$ labels: show auto-named (visible) keys as they are
    return d;
  }

  global.GeometryMarkup = { parse: parse, serialize: serialize, fromTikz: fromTikz };
})(window);
