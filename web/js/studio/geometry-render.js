/*
 * GeometryRender — draws geometry figures (Arabic labels, lengths, angles, marks) as a self-contained SVG.
 *   GeometryRender.render(data, {viewBox:[x,y,w,h]}) -> Promise<{svg, w, h, vb, px}>
 * data: { P:{A:[x,y]…} (units, y up), E:[elements], names:{A:'أ'}, sideLbl:{'A-B':'…'}, angLbl:{'A-B-C':'…'}, opt:{…} }
 * elements: {t:'poly',p:[…],fill} {t:'seg',p:[a,b],dash,par} {t:'line',p:[a,b]} {t:'ray',p:[a,b]}
 *           {t:'circle',c,through|r,fill} {t:'angle',p:[a,b,c],arcs,label} {t:'dot',p:[a]}
 */
(function (global) {
  'use strict';
  var S = 37.7953;                               // px per unit (1 unit = 1 cm when inserted at 100 %)

  function defaultsOpt() {
    return { stroke: '#1b2a30', width: 2, fill: '#0e9f9a', fillOpacity: 0.12, accent: '#c2352b', names: true, dots: true,
      sides: 'none', angles: 'marks', ticks: true, right: true, unit: 'سم', dec: 1, digits: 'western', notation: 'ar',
      grid: false, font: 'Amiri', fontSize: 12 };
  }

  var V = {
    sub: function (a, b) { return [a[0] - b[0], a[1] - b[1]]; }, add: function (a, b) { return [a[0] + b[0], a[1] + b[1]]; },
    mul: function (a, k) { return [a[0] * k, a[1] * k]; }, len: function (a) { return Math.hypot(a[0], a[1]); },
    norm: function (a) { var l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; }, perp: function (a) { return [-a[1], a[0]]; },
    dist: function (a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  };
  function angleAt(a, b, c) {                    // degrees, 0..180
    var u = V.norm(V.sub(a, b)), w = V.norm(V.sub(c, b));
    var d = Math.max(-1, Math.min(1, u[0] * w[0] + u[1] * w[1]));
    return Math.acos(d) * 180 / Math.PI;
  }
  function f2(v) { return v.toFixed(2); }

  function render(data, o) {
    o = o || {};
    var opt = Object.assign(defaultsOpt(), data.opt || {});
    var eastern = opt.digits === 'eastern', ar = opt.notation !== 'en';
    var fs = (opt.fontSize || 12) * 96 / 72;
    var P = {};                                    // pixel coordinates
    var SC = S * (+data.scale || 1);
    Object.keys(data.P || {}).forEach(function (k) { var p = data.P[k]; P[k] = [p[0] * SC, -p[1] * SC]; });
    var names = data.names || {};
    var body = [], marks = [], texts = [];
    var bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    var grow = function (x, y) { bb.x0 = Math.min(bb.x0, x); bb.y0 = Math.min(bb.y0, y); bb.x1 = Math.max(bb.x1, x); bb.y1 = Math.max(bb.y1, y); };
    var D = function (s) { return Raster.digits(s, eastern); };
    var num = function (v) { return D(String(+v.toFixed(opt.dec))); };
    var stroke = opt.stroke, sw = +opt.width || 2;

    // neighbours of each point (for label placement)
    var nb = {};
    var link = function (a, b) { (nb[a] = nb[a] || []).push(b); (nb[b] = nb[b] || []).push(a); };
    (data.E || []).forEach(function (e) {
      if (e.t === 'poly') e.p.forEach(function (q, i) { link(q, e.p[(i + 1) % e.p.length]); });
      if (e.t === 'seg' || e.t === 'line' || e.t === 'ray' || e.t === 'side') link(e.p[0], e.p[1]);
      if (e.t === 'path') e.p.forEach(function (q, i) { if (i) link(e.p[i - 1], q); });
      if (e.t === 'circle' && e.through) link(e.c, e.through);
      if (e.t === 'angle') { link(e.p[0], e.p[1]); link(e.p[2], e.p[1]); }
    });

    // collect polygon sides and angles for automatic marks
    var sides = [], angles = [];
    (data.E || []).forEach(function (e) {
      if (e.t !== 'poly' || !e.p.every(function (q) { return P[q]; })) return;
      var n = e.p.length, cen = [0, 0];
      e.p.forEach(function (q) { cen = V.add(cen, P[q]); }); cen = V.mul(cen, 1 / n);
      e.p.forEach(function (q, i) {
        var a = e.p[(i + n - 1) % n], b = q, c = e.p[(i + 1) % n];
        sides.push({ a: b, b: c, len: V.dist(data.P[b], data.P[c]), cen: cen });
        angles.push({ a: a, b: b, c: c, deg: angleAt(data.P[a], data.P[b], data.P[c]), poly: true });
      });
    });
    (data.E || []).forEach(function (e) {
      if ((e.t === 'seg' || e.t === 'side') && e.p.every(function (q) { return P[q]; }) && e.len !== false) sides.push({ a: e.p[0], b: e.p[1], len: V.dist(data.P[e.p[0]], data.P[e.p[1]]), cen: null, seg: true, e: e });
      if (e.t === 'angle' && e.p.every(function (q) { return P[q]; })) angles.push({ a: e.p[0], b: e.p[1], c: e.p[2], deg: angleAt(data.P[e.p[0]], data.P[e.p[1]], data.P[e.p[2]]), e: e });
    });
    // equality groups
    var group = function (list, key, tol) {
      var groups = [];
      list.forEach(function (it) {
        var g = groups.filter(function (x) { return Math.abs(x.v - it[key]) < tol; })[0];
        if (!g) { g = { v: it[key], items: [] }; groups.push(g); }
        g.items.push(it);
      });
      var k = 0;
      groups.forEach(function (g) { if (g.items.length > 1) { k++; g.items.forEach(function (it) { it.grp = k; }); } });
    };
    var uniqSides = [];
    sides.forEach(function (s) {
      var same = uniqSides.filter(function (u) { return (u.a === s.a && u.b === s.b) || (u.a === s.b && u.b === s.a); })[0];
      if (!same) { uniqSides.push(s); return; }
      if (s.e) { same.e = s.e; if (same.cen === null) same.cen = s.cen; }              // explicit \segment / \side options win
    });
    sides = uniqSides;
    group(sides.filter(function (s) { return !s.seg || s.e.tick !== false; }), 'len', 0.03);
    group(angles.filter(function (a) { return Math.abs(a.deg - 90) > 0.5; }), 'deg', 0.6);
    sides.forEach(function (sd) { if (sd.e && sd.e.marks !== undefined) sd.grp = +sd.e.marks || 0; });
    angles.forEach(function (an) { if (an.e && an.e.arcs !== undefined) an.grp = +an.e.arcs || 0; });

    // ---------------- grid (edit helper / optional)
    var vb = o.viewBox;
    if (opt.grid && vb) {
      var g = [];
      for (var gx = Math.ceil(vb[0] / S) * S; gx < vb[0] + vb[2]; gx += S) g.push('M' + f2(gx) + ' ' + vb[1] + 'v' + vb[3]);
      for (var gy = Math.ceil(vb[1] / S) * S; gy < vb[1] + vb[3]; gy += S) g.push('M' + vb[0] + ' ' + f2(gy) + 'h' + vb[2]);
      body.push('<path d="' + g.join('') + '" stroke="#e3edef" stroke-width="1"/>');
    }

    // ---------------- shapes
    (data.E || []).forEach(function (e) {
      if (e.t === 'poly') {
        if (!e.p.every(function (q) { return P[q]; })) return;
        var pts = e.p.map(function (q) { grow(P[q][0], P[q][1]); return f2(P[q][0]) + ',' + f2(P[q][1]); }).join(' ');
        var fill = e.fill === false ? 'none' : (e.fill || opt.fill);
        body.push('<polygon points="' + pts + '" fill="' + fill + '" fill-opacity="' + (fill === 'none' ? 0 : (e.fillOpacity !== undefined ? e.fillOpacity : opt.fillOpacity)) + '" stroke="' + (e.color || stroke) + '" stroke-width="' + (e.w || sw) + '"' + (e.dash ? ' stroke-dasharray="7 5"' : '') + ' stroke-linejoin="round"/>');
      } else if (e.t === 'seg' || e.t === 'line' || e.t === 'ray') {
        var A = P[e.p[0]], B = P[e.p[1]]; if (!A || !B) return;
        var u = V.norm(V.sub(B, A)), ext = (e.ext || 1.3) * SC;
        var s0 = e.t === 'line' ? V.sub(A, V.mul(u, ext)) : A, s1 = e.t === 'seg' ? B : V.add(B, V.mul(u, ext));
        grow(s0[0], s0[1]); grow(s1[0], s1[1]);
        var dash = e.dash ? ' stroke-dasharray="7 5"' : '';
        body.push('<path d="M' + f2(s0[0]) + ' ' + f2(s0[1]) + 'L' + f2(s1[0]) + ' ' + f2(s1[1]) + '" stroke="' + (e.color || stroke) + '" stroke-width="' + (e.w || sw) + '"' + dash + ' stroke-linecap="round"/>');
        if ((e.t !== 'seg' && e.arrows !== false) || e.arrow) {        // arrow heads at the open ends (or a vector)
          var head = function (tip, dir) {
            var l = V.sub(tip, V.mul(dir, 10)), pp = V.mul(V.perp(dir), 4.5);
            return 'M' + f2(tip[0]) + ' ' + f2(tip[1]) + 'L' + f2(l[0] + pp[0]) + ' ' + f2(l[1] + pp[1]) + 'L' + f2(l[0] - pp[0]) + ' ' + f2(l[1] - pp[1]) + 'Z';
          };
          var hp = head(s1, u) + (e.t === 'line' || e.arrow === 'both' ? head(s0, V.mul(u, -1)) : '');
          body.push('<path d="' + hp + '" fill="' + (e.color || stroke) + '"/>');
        }
        if (e.par) {                                     // parallel chevrons
          var m = V.mul(V.add(A, B), 0.5), pv = V.perp(u), ch = [];
          for (var k = 0; k < e.par; k++) {
            var c0 = V.add(m, V.mul(u, (k - (e.par - 1) / 2) * 6));
            var a1 = V.add(V.sub(c0, V.mul(u, 5)), V.mul(pv, 5)), a2 = V.sub(V.sub(c0, V.mul(u, 5)), V.mul(pv, 5));
            ch.push('M' + f2(a1[0]) + ' ' + f2(a1[1]) + 'L' + f2(c0[0]) + ' ' + f2(c0[1]) + 'L' + f2(a2[0]) + ' ' + f2(a2[1]));
          }
          marks.push('<path d="' + ch.join('') + '" stroke="' + opt.accent + '" stroke-width="1.6" fill="none"/>');
        }
      } else if (e.t === 'text') {
        var tp = e.at && P[e.at] ? P[e.at] : (e.xy ? [e.xy[0] * SC, -e.xy[1] * SC] : null);
        if (tp) { grow(tp[0], tp[1]); texts.push({ x: tp[0] + (e.dx || 0), y: tp[1] + (e.dy || 0) + fs * 0.35, t: e.text, cls: 'sl', anchor: 'middle', color: e.color }); }
      } else if (e.t === 'path') {
        var pts2 = (e.p || []).map(function (q) { return P[q]; }).filter(Boolean);
        if (pts2.length < 2) return;
        pts2.forEach(function (q) { grow(q[0], q[1]); });
        body.push('<path d="' + pts2.map(function (q, i) { return (i ? 'L' : 'M') + f2(q[0]) + ' ' + f2(q[1]); }).join('') + (e.closed ? 'Z' : '') + '" fill="' + (e.fill || 'none') + '" fill-opacity="' + (e.fill ? (e.fillOpacity || opt.fillOpacity) : 0) + '" stroke="' + (e.color || stroke) + '" stroke-width="' + (e.w || sw) + '"' + (e.dash ? ' stroke-dasharray="7 5"' : '') + ' stroke-linejoin="round"/>');
      } else if (e.t === 'circle') {
        var C = P[e.c]; if (!C) return;
        var r = e.through && P[e.through] ? V.dist(C, P[e.through]) : (+e.r || 2) * SC;
        grow(C[0] - r, C[1] - r); grow(C[0] + r, C[1] + r);
        var cf = e.fill ? e.fill : 'none';
        body.push('<circle cx="' + f2(C[0]) + '" cy="' + f2(C[1]) + '" r="' + f2(r) + '" fill="' + cf + '" fill-opacity="' + (cf === 'none' ? 0 : (e.fillOpacity !== undefined ? e.fillOpacity : opt.fillOpacity)) + '" stroke="' + (e.color || stroke) + '" stroke-width="' + (e.w || sw) + '"' + (e.dash ? ' stroke-dasharray="7 5"' : '') + '/>');
      }
    });

    // ---------------- equal-side ticks and side labels
    sides.forEach(function (s) {
      var A = P[s.a], B = P[s.b], m = V.mul(V.add(A, B), 0.5), u = V.norm(V.sub(B, A)), pv = V.perp(u);
      if (opt.ticks && s.grp) {
        var tk = [];
        for (var k = 0; k < s.grp; k++) {
          var c0 = V.add(m, V.mul(u, (k - (s.grp - 1) / 2) * 5));
          var t1 = V.add(c0, V.mul(pv, 6)), t2 = V.sub(c0, V.mul(pv, 6));
          tk.push('M' + f2(t1[0]) + ' ' + f2(t1[1]) + 'L' + f2(t2[0]) + ' ' + f2(t2[1]));
        }
        marks.push('<path d="' + tk.join('') + '" stroke="' + stroke + '" stroke-width="1.6"/>');
      }
      var key = s.a + '-' + s.b, key2 = s.b + '-' + s.a;
      var custom = data.sideLbl && (data.sideLbl[key] !== undefined ? data.sideLbl[key] : data.sideLbl[key2]);
      if ((custom === undefined || custom === null) && s.e && s.e.label !== undefined) custom = s.e.label;
      var txt = custom !== undefined && custom !== null ? custom : (opt.sides === 'values' ? num(s.len) + (opt.unit ? ' ' + opt.unit : '') : '');
      if (!txt) return;
      // outward side of the polygon (or "up" for free segments)
      var out = pv;
      if (s.cen) { var toC = V.sub(s.cen, m); if (out[0] * toC[0] + out[1] * toC[1] > 0) out = V.mul(out, -1); }
      else if (out[1] > 0) out = V.mul(out, -1);
      var off = fs * 0.95 + (s.grp ? 4 : 0);
      var lp = V.add(m, V.mul(out, off));
      texts.push({ x: lp[0], y: lp[1], t: D(txt), cls: 'sl', anchor: 'middle' });
    });

    // ---------------- angles
    angles.forEach(function (an) {
      var key = an.a + '-' + an.b + '-' + an.c, key2 = an.c + '-' + an.b + '-' + an.a;
      var custom = data.angLbl && (data.angLbl[key] !== undefined ? data.angLbl[key] : data.angLbl[key2]);
      if ((custom === undefined || custom === null) && an.e && an.e.label) custom = an.e.label;
      if (custom === '__none__') return;
      var B = P[an.b], u1 = V.norm(V.sub(P[an.a], B)), u2 = V.norm(V.sub(P[an.c], B));
      var right = Math.abs(an.deg - 90) < 0.5 || !!(an.e && an.e.right);
      var explicit = !!an.e;
      var showVal = custom !== undefined && custom !== null && custom !== '' ? D(custom) :
        ((opt.angles === 'values' || (explicit && an.e.value)) ? D(String(Math.round(an.deg * 10) / 10)) + '°' : '');
      var wantArc = explicit || opt.angles === 'values' || (opt.angles === 'marks' && an.grp) || (custom && custom !== '');
      if (right && opt.right && (opt.angles !== 'none' || explicit)) {
        var s = 11, q1 = V.add(B, V.mul(u1, s)), q3 = V.add(B, V.mul(u2, s)), q2 = V.add(q1, V.mul(u2, s));
        marks.push('<path d="M' + f2(q1[0]) + ' ' + f2(q1[1]) + 'L' + f2(q2[0]) + ' ' + f2(q2[1]) + 'L' + f2(q3[0]) + ' ' + f2(q3[1]) + '" fill="none" stroke="' + (explicit && an.e.color || stroke) + '" stroke-width="1.4"/>');
      } else if (wantArc && opt.angles !== 'none' || explicit) {
        var r = an.deg < 35 ? 30 : an.deg < 60 ? 24 : 20;
        var n = explicit && an.e.arcs ? an.e.arcs : (an.grp || 1);
        var cross = u1[0] * u2[1] - u1[1] * u2[0], sweep = cross > 0 ? 1 : 0;
        var arcs = [];
        for (var k = 0; k < n; k++) {
          var rr = r + k * 4, a1 = V.add(B, V.mul(u1, rr)), a2 = V.add(B, V.mul(u2, rr));
          arcs.push('M' + f2(a1[0]) + ' ' + f2(a1[1]) + 'A' + rr + ' ' + rr + ' 0 0 ' + sweep + ' ' + f2(a2[0]) + ' ' + f2(a2[1]));
        }
        var col = explicit && an.e.color ? an.e.color : opt.accent;
        if (explicit && an.e.fill) {
          var f1 = V.add(B, V.mul(u1, r)), f3 = V.add(B, V.mul(u2, r));
          marks.push('<path d="M' + f2(B[0]) + ' ' + f2(B[1]) + 'L' + f2(f1[0]) + ' ' + f2(f1[1]) + 'A' + r + ' ' + r + ' 0 0 ' + sweep + ' ' + f2(f3[0]) + ' ' + f2(f3[1]) + 'Z" fill="' + col + '" fill-opacity="0.15" stroke="none"/>');
        }
        marks.push('<path d="' + arcs.join('') + '" fill="none" stroke="' + col + '" stroke-width="1.5"/>');
      }
      if (showVal) {
        var bis = V.norm(V.add(u1, u2)); if (!isFinite(bis[0]) || V.len(V.add(u1, u2)) < 1e-6) bis = V.perp(u1);
        var rad = (an.deg < 35 ? 30 : an.deg < 60 ? 24 : 20) + fs * 0.9 + (an.grp ? (an.grp - 1) * 4 : 0);
        var lp = V.add(B, V.mul(bis, rad));
        texts.push({ x: lp[0], y: lp[1] + fs * 0.35, t: showVal, cls: 'al', anchor: 'middle', color: explicit && an.e.color || opt.accent, raw: true });
      }
    });

    // ---------------- points and names
    var used = {};
    (data.E || []).forEach(function (e) {
      (e.p || []).forEach(function (q) { used[q] = 1; });
      if (e.c) used[e.c] = 1; if (e.through) used[e.through] = 1;
      if (e.t === 'text' && e.at) delete used[e.at];
    });
    Object.keys(P).forEach(function (k) {
      if (!used[k] && !(data.show && data.show[k])) return;
      var p = P[k]; grow(p[0], p[1]);
      var nm = names[k] !== undefined ? names[k] : k;
      if (data.hidden && data.hidden[k] && !(data.names && data.names[k])) return;
      var showDot = data.dotsFor ? data.dotsFor[k] : opt.dots;
      if (data.hidden && data.hidden[k]) showDot = false;
      if (showDot) marks.push('<circle cx="' + f2(p[0]) + '" cy="' + f2(p[1]) + '" r="3" fill="' + stroke + '"/>');
      if (!opt.names || !nm) return;
      var ns = nb[k] || [], dir = [0, -1];
      if (ns.length) {
        var avg = [0, 0];
        ns.forEach(function (q) { if (P[q]) avg = V.add(avg, V.norm(V.sub(P[q], p))); });
        dir = V.len(avg) < 1e-3 ? V.norm(V.perp(V.sub(P[ns[0]], p))) : V.mul(V.norm(avg), -1);
      }
      if (data.nameDir && data.nameDir[k]) dir = V.norm(data.nameDir[k]);
      var lp = V.add(p, V.mul(dir, fs * 0.95));
      texts.push({ x: lp[0], y: lp[1] + fs * 0.4, t: nm, cls: 'pn', anchor: 'middle' });
    });

    // bbox including labels
    texts.forEach(function (t) {
      var w = String(t.t).length * fs * 0.55;
      grow(t.x - w / 2, t.y - fs * 1.1); grow(t.x + w / 2, t.y + fs * 0.3);
    });
    if (!isFinite(bb.x0)) { bb = { x0: -50, y0: -50, x1: 50, y1: 50 }; }
    var M = 10;
    var box = vb || [bb.x0 - M, bb.y0 - M, bb.x1 - bb.x0 + 2 * M, bb.y1 - bb.y0 + 2 * M];
    var font = opt.font || 'Amiri';
    return Raster.fontCss([font], true).then(function (css) {
      var tx = texts.map(function (t) {
        var size = t.cls === 'pn' ? fs * 1.25 : fs;
        return Raster.words(t.x, t.y, t.t, ' class="' + t.cls + '"' + (t.color ? ' fill="' + t.color + '"' : ''), size, ar);
      }).join('');
      var w = box[2], h = box[3];
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + f2(w) + '" height="' + f2(h) + '" viewBox="' + box.map(f2).join(' ') + '">' +
        '<defs><style>' + css + ' .pn,.sl,.al{font-family:"' + font + '","Times New Roman",serif;fill:#1b2a30} .pn{font-size:' + f2(fs * 1.25) + 'px;font-weight:700;font-style:' + (ar ? 'normal' : 'italic') + '} .sl{font-size:' + f2(fs) + 'px} .al{font-size:' + f2(fs * 0.95) + 'px}</style></defs>' +
        (o.transparent ? '' : '<rect x="' + f2(box[0]) + '" y="' + f2(box[1]) + '" width="' + f2(w) + '" height="' + f2(h) + '" fill="#fff"/>') +
        body.join('') + marks.join('') + tx + '</svg>';
      return { svg: svg, w: w, h: h, vb: box, px: P, S: S };
    });
  }

  global.GeometryRender = { render: render, S: S, angleAt: angleAt, V: V, defaultsOpt: defaultsOpt };
})(window);
