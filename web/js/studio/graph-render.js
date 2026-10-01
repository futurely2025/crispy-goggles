/*
 * GraphRender — draws function graphs in Arabic textbook style as a self-contained SVG.
 *   GraphRender.render(data) -> Promise<{svg, w, h, info}>
 * needs: ArabicCAS (+nerdamer), RenderHost (labels), Raster (fonts, digits)
 */
(function (global) {
  'use strict';
  var PALETTE = ['#0e9f9a', '#c2352b', '#1f5fbf', '#e07a00', '#7b3fb3', '#2e8b3a', '#b8860b', '#3d5560'];

  function defaults() {
    return {
      v: 1,
      fns: [{ expr: 'س^2 - 4', color: PALETTE[0], width: 2.2, dash: 'solid', name: 'ص', label: true, visible: true }],
      xmin: -6, xmax: 6, ymin: -6, ymax: 8, auto: true, equal: false,
      w: 560, h: 420,
      grid: true, minor: true, axes: true, arrows: true, ticks: true, axisNames: true,
      notation: 'ar', digits: 'western', piTicks: false,
      roots: true, yint: true, extrema: false, inter: true, coords: true,
      area: { on: false, fn: 0, fn2: -1, a: 0, b: 2, color: '#0e9f9a', value: true },
      points: [],
      font: 'Amiri', mathFont: 'stix2', fontSize: 12, title: ''
    };
  }

  // ------------------------------------------------------------ numbers
  function niceStep(range, target) {
    var raw = range / Math.max(1, target), mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
    var s = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
    return { step: s * mag, minor: s === 2 ? 4 : 5 };
  }
  function fmt(v, step) {
    var dec = Math.max(0, Math.min(6, -Math.floor(Math.log10(step || 1)) + (step && step / Math.pow(10, Math.floor(Math.log10(step))) === 2.5 ? 1 : 0)));
    var s = (+v.toFixed(dec)).toString();
    return s === '-0' ? '0' : s;
  }
  function round2(v) {
    if (Math.abs(v - Math.round(v)) < 1e-7) return String(Math.round(v));
    return String(+v.toFixed(2));
  }
  function piLabel(k) {                // k = multiple of π (in halves / thirds / quarters)
    var den = [1, 2, 3, 4, 6].filter(function (d) { return Math.abs(k * d - Math.round(k * d)) < 1e-9; })[0];
    if (!den) return null;
    var num = Math.round(k * den);
    if (num === 0) return '0';
    var sgn = num < 0 ? '-' : ''; num = Math.abs(num);
    return sgn + (num === 1 ? '' : num) + 'π' + (den === 1 ? '' : '/' + den);
  }
  function simpson(f, a, b, n) {
    n = n || 400; if (n % 2) n++;
    var h = (b - a) / n, s = f(a) + f(b);
    for (var i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
    return s * h / 3;
  }
  function bisect(g, a, b) {
    var fa = g(a);
    for (var i = 0; i < 70; i++) {
      var m = (a + b) / 2, fm = g(m);
      if (!isFinite(fm)) return null;
      if ((fa <= 0 && fm <= 0) || (fa >= 0 && fm >= 0)) { a = m; fa = fm; } else b = m;
    }
    return (a + b) / 2;
  }
  function safe(f) { return function (x) { var y; try { y = f(x); } catch (e) { return NaN; } return typeof y === 'number' ? y : NaN; }; }

  // ------------------------------------------------------------ compile
  function compileAll(data) {
    return data.fns.map(function (fn, i) {
      var out = { i: i, fn: fn, f: null, err: null, vertical: null };
      if (fn.pts && fn.pts.length) { out.pts = fn.pts; return out; }
      var t = String(fn.expr || '').trim();
      if (!t) { out.err = ''; return out; }
      var vm = t.match(/^(?:س|x)\s*=\s*([^=]+)$/);
      if (vm && !/س|x/.test(vm[1])) {
        try { out.vertical = ArabicCAS.compile(vm[1]).f(0); } catch (e) { out.err = e.message; }
        return out;
      }
      try { var c = ArabicCAS.compile(t); out.f = safe(c.f); out.cas = c.cas; } catch (e) { out.err = e.message; }
      return out;
    });
  }

  // ------------------------------------------------------------ features
  function features(data, comp) {
    var pts = [], X0 = data.xmin, X1 = data.xmax, N = 1200, dx = (X1 - X0) / N;
    var near = function (x, y) { return pts.some(function (p) { return Math.abs(p.x - x) < dx * 2 && Math.abs(p.y - y) < 1e-6 + Math.abs(data.ymax - data.ymin) / 400; }); };
    var add = function (p) { if (!near(p.x, p.y) && isFinite(p.y)) pts.push(p); };
    comp.forEach(function (c) {
      if (!c.f || c.fn.visible === false) return;
      var f = c.f, prev = f(X0);
      for (var k = 1; k <= N; k++) {
        var x = X0 + k * dx, y = f(x);
        if (data.roots && isFinite(prev) && isFinite(y)) {
          if (y === 0) add({ x: x, y: 0, kind: 'root', fn: c.i });
          else if (prev * y < 0 && Math.abs(y - prev) < (data.ymax - data.ymin)) {
            var r = bisect(f, x - dx, x); if (r !== null) add({ x: r, y: 0, kind: 'root', fn: c.i });
          }
        }
        prev = y;
      }
      if (data.yint && X0 <= 0 && X1 >= 0) { var y0 = f(0); if (isFinite(y0)) add({ x: 0, y: y0, kind: 'yint', fn: c.i }); }
      if (data.extrema) {
        var h = dx / 4, d = function (x) { return (f(x + h) - f(x - h)) / (2 * h); };
        var pd = d(X0 + dx);
        for (var j = 2; j < N; j++) {
          var xx = X0 + j * dx, dd = d(xx);
          if (isFinite(pd) && isFinite(dd) && pd * dd < 0 && Math.abs(dd - pd) < 50) {
            var xe = bisect(d, xx - dx, xx);
            if (xe !== null) { var ye = f(xe); if (isFinite(ye)) add({ x: xe, y: ye, kind: pd > 0 ? 'max' : 'min', fn: c.i }); }
          }
          pd = dd;
        }
      }
    });
    if (data.inter) {
      for (var a = 0; a < comp.length; a++) for (var b = a + 1; b < comp.length; b++) {
        var A = comp[a], B = comp[b];
        if (!A.f || !B.f || A.fn.visible === false || B.fn.visible === false) continue;
        var g = function (x) { return A.f(x) - B.f(x); }, pg = g(X0);
        for (var k2 = 1; k2 <= N; k2++) {
          var x2 = X0 + k2 * dx, gy = g(x2);
          if (isFinite(pg) && isFinite(gy) && (gy === 0 || pg * gy < 0) && Math.abs(gy - pg) < (data.ymax - data.ymin)) {
            var xr = gy === 0 ? x2 : bisect(g, x2 - dx, x2);
            if (xr !== null) add({ x: xr, y: A.f(xr), kind: 'inter', fn: a });
          }
          pg = gy;
        }
      }
    }
    return pts.filter(function (p) { return p.x >= X0 && p.x <= X1 && p.y >= data.ymin && p.y <= data.ymax; });
  }

  function autoWindow(data, comp) {
    var xs = [data.xmin, data.xmax];
    if (!(xs[1] > xs[0])) xs = [-6, 6];
    var ys = [];
    comp.forEach(function (c) {
      if (c.pts && c.fn.visible !== false) c.pts.forEach(function (q) { if (isFinite(q[1])) ys.push(q[1]); });
      if (!c.f || c.fn.visible === false) return;
      for (var k = 0; k <= 300; k++) { var y = c.f(xs[0] + (xs[1] - xs[0]) * k / 300); if (isFinite(y)) ys.push(y); }
    });
    if (!ys.length) return;
    ys.sort(function (a, b) { return a - b; });
    var lo = ys[Math.floor(ys.length * 0.04)], hi = ys[Math.ceil(ys.length * 0.96) - 1];
    lo = Math.min(lo, 0); hi = Math.max(hi, 0);
    if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
    var xspan = xs[1] - xs[0];
    if (hi - lo > 2.5 * xspan) {
      // very tall: keep the interesting part (roots, y-intercept, turning points) instead of the far branches
      var fy = [0];
      comp.forEach(function (c) {
        if (!c.f || c.fn.visible === false) return;
        var y0 = c.f(0); if (isFinite(y0) && xs[0] <= 0 && xs[1] >= 0) fy.push(y0);
        var prev = null, pd = null;
        for (var k = 0; k <= 600; k++) {
          var x = xs[0] + xspan * k / 600, y = c.f(x);
          if (prev !== null && isFinite(y) && isFinite(prev)) { var d = y - prev; if (pd !== null && d * pd < 0) fy.push(prev); pd = d; }
          prev = y;
        }
      });
      var fmin = Math.min.apply(null, fy), fmax = Math.max.apply(null, fy);
      var cap = Math.max(xspan * 1.2, (fmax - fmin) * 1.8);
      if (cap < hi - lo) { lo = Math.max(lo, fmin - cap * 0.18); hi = Math.min(hi, lo + cap); if (hi - lo < cap) lo = hi - cap; }
    }
    var padY = (hi - lo) * 0.12;
    data.ymin = +(lo - padY).toPrecision(3); data.ymax = +(hi + padY).toPrecision(3);
  }

  // ------------------------------------------------------------ labels (MathJax, embedded)
  var labelCache = {};
  function mathLabel(tex, color, data) {
    var key = [tex, color, data.digits, data.notation, data.mathFont, data.font, data.fontSize].join('|');
    if (labelCache[key]) return labelCache[key];
    var ar = data.notation !== 'en';
    var o = { rtl: ar, arabicFunctions: ar, arabicComma: ar, digits: data.digits === 'eastern' ? 'eastern' : 'western', color: color,
      fontSize: 14, mathFont: data.mathFont || 'stix2', font: data.font || 'Amiri', display: false, mode: 'math' };
    labelCache[key] = RenderHost.preview(tex, o, true).then(function (r) {
      if (r.errors && r.errors.length) return null;
      return { svg: r.svgString, w: r.width, h: r.total, d: r.depth };
    }).catch(function () { return null; });
    return labelCache[key];
  }
  function nest(lbl, x, y, px) {
    var w = lbl.w * px, h = lbl.h * px;
    var s = lbl.svg.replace(/^<svg\b([^>]*)>/, function (m0, attrs) {
      attrs = attrs.replace(/\s(width|height|style|x|y)="[^"]*"/g, '');
      return '<svg' + attrs + ' x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) + '" overflow="visible">';
    });
    return { s: s, w: w, h: h };
  }

  // ------------------------------------------------------------ main
  function render(data) {
    data = Object.assign(defaults(), data || {});
    var comp = compileAll(data);
    if (data.auto) autoWindow(data, comp);
    if (data.equal) {
      var pw0 = data.w - 28, ph0 = data.h - 28;
      var ux = (data.xmax - data.xmin) / pw0, cy = (data.ymax + data.ymin) / 2, half = ux * ph0 / 2;
      data.ymin = cy - half; data.ymax = cy + half;
    }
    var W = data.w, H = data.h, pad = 14;
    var X = function (x) { return pad + (x - data.xmin) / (data.xmax - data.xmin) * (W - 2 * pad); };
    var Y = function (y) { return H - pad - (y - data.ymin) / (data.ymax - data.ymin) * (H - 2 * pad); };
    var eastern = data.digits === 'eastern', ar = data.notation !== 'en';
    var D = function (s) { return Raster.esc(Raster.digits(s, eastern)); };
    var uid = 'g' + Math.random().toString(36).slice(2, 7);
    var font = data.font || 'Amiri';
    var fs = (data.fontSize || 12) * 96 / 72;                  // px
    var out = [];
    var ax0 = Math.min(Math.max(0, data.xmin), data.xmax), ay0 = Math.min(Math.max(0, data.ymin), data.ymax);
    var AX = X(ax0), AY = Y(ay0);

    // grid
    var tx = niceStep(data.xmax - data.xmin, (W - 2 * pad) / 64), ty = niceStep(data.ymax - data.ymin, (H - 2 * pad) / 52);
    if (data.equal) { var sx = Math.max(tx.step, ty.step); tx = ty = { step: sx, minor: tx.step >= ty.step ? tx.minor : ty.minor }; }
    var xTicks = [], yTicks = [];
    if (data.piTicks) {
      var ps = Math.PI / ((data.xmax - data.xmin) / Math.PI > 6 ? 1 : 2);
      for (var kp = Math.ceil(data.xmin / ps); kp * ps <= data.xmax + 1e-9; kp++) xTicks.push({ v: kp * ps, t: piLabel(kp * ps / Math.PI) });
      tx = { step: ps, minor: 2 };
    } else {
      for (var k = Math.ceil(data.xmin / tx.step); k * tx.step <= data.xmax + 1e-9; k++) xTicks.push({ v: k * tx.step, t: fmt(k * tx.step, tx.step) });
    }
    for (var k2 = Math.ceil(data.ymin / ty.step); k2 * ty.step <= data.ymax + 1e-9; k2++) yTicks.push({ v: k2 * ty.step, t: fmt(k2 * ty.step, ty.step) });
    if (data.grid) {
      if (data.minor) {
        var mx = tx.step / tx.minor, my = ty.step / ty.minor, mp = [];
        for (var a = Math.ceil(data.xmin / mx); a * mx <= data.xmax; a++) mp.push('M' + X(a * mx).toFixed(2) + ' ' + pad + 'V' + (H - pad));
        for (var b = Math.ceil(data.ymin / my); b * my <= data.ymax; b++) mp.push('M' + pad + ' ' + Y(b * my).toFixed(2) + 'H' + (W - pad));
        out.push('<path d="' + mp.join('') + '" stroke="#edf3f4" stroke-width="0.7" fill="none"/>');
      }
      var gp = [];
      xTicks.forEach(function (t) { gp.push('M' + X(t.v).toFixed(2) + ' ' + pad + 'V' + (H - pad)); });
      yTicks.forEach(function (t) { gp.push('M' + pad + ' ' + Y(t.v).toFixed(2) + 'H' + (W - pad)); });
      out.push('<path d="' + gp.join('') + '" stroke="#d5e3e6" stroke-width="0.9" fill="none"/>');
    }

    // shaded area
    var areaInfo = null;
    if (data.area && data.area.on) {
      var cA = comp[data.area.fn], cB = data.area.fn2 >= 0 ? comp[data.area.fn2] : null;
      var a0 = Math.max(Math.min(+data.area.a, +data.area.b), data.xmin), b0 = Math.min(Math.max(+data.area.a, +data.area.b), data.xmax);
      if (cA && cA.f && b0 > a0) {
        var g2 = cB && cB.f ? cB.f : function () { return 0; };
        var top = [], bot = [], n = 240;
        for (var q = 0; q <= n; q++) {
          var xq = a0 + (b0 - a0) * q / n, y1 = cA.f(xq), y2 = g2(xq);
          if (!isFinite(y1) || !isFinite(y2)) continue;
          y1 = Math.max(data.ymin, Math.min(data.ymax, y1)); y2 = Math.max(data.ymin, Math.min(data.ymax, y2));
          top.push(X(xq).toFixed(2) + ',' + Y(y1).toFixed(2)); bot.unshift(X(xq).toFixed(2) + ',' + Y(y2).toFixed(2));
        }
        out.push('<polygon points="' + top.concat(bot).join(' ') + '" fill="' + data.area.color + '" fill-opacity="0.22" stroke="none"/>');
        var vA = simpson(function (x) { var d = cA.f(x) - g2(x); return isFinite(d) ? Math.abs(d) : 0; }, +data.area.a < +data.area.b ? +data.area.a : +data.area.b, Math.max(+data.area.a, +data.area.b));
        var vS = simpson(function (x) { var d = cA.f(x) - g2(x); return isFinite(d) ? d : 0; }, +data.area.a, +data.area.b);
        // label anchor: where the region is tallest, halfway between the two curves (px)
        var best = null;
        for (var qq = 1; qq < 40; qq++) {
          var xb = a0 + (b0 - a0) * qq / 40, u1 = cA.f(xb), u2 = g2(xb);
          if (!isFinite(u1) || !isFinite(u2)) continue;
          u1 = Math.max(data.ymin, Math.min(data.ymax, u1)); u2 = Math.max(data.ymin, Math.min(data.ymax, u2));
          var hpx = Math.abs(Y(u1) - Y(u2));
          if (!best || hpx > best.h + 0.5) best = { x: X(xb), y: (Y(u1) + Y(u2)) / 2, h: hpx };
        }
        areaInfo = { area: vA, integral: vS, at: best };
        [a0, b0].forEach(function (xv) { out.push('<path d="M' + X(xv).toFixed(2) + ' ' + Y(Math.max(data.ymin, Math.min(data.ymax, g2(xv)))).toFixed(2) + 'V' + Y(Math.max(data.ymin, Math.min(data.ymax, cA.f(xv)))).toFixed(2) + '" stroke="' + data.area.color + '" stroke-width="1" stroke-dasharray="3 3"/>'); });
      }
    }

    // axes + ticks + numbers
    if (data.axes) {
      out.push('<path d="M' + pad + ' ' + AY.toFixed(2) + 'H' + (W - pad) + 'M' + AX.toFixed(2) + ' ' + (H - pad) + 'V' + pad + '" stroke="#1b2a30" stroke-width="1.3" fill="none"/>');
      if (data.arrows) {
        out.push('<path d="M' + (W - pad + 6) + ' ' + AY.toFixed(2) + 'l-10 -4.2v8.4z M' + AX.toFixed(2) + ' ' + (pad - 6) + 'l-4.2 10h8.4z" fill="#1b2a30"/>');
      }
      if (data.ticks) {
        var tk = [], txt = [];
        var below = AY + fs + 5 < H - 2 ? 1 : -1;
        xTicks.forEach(function (t) {
          if (Math.abs(t.v) < 1e-12 && data.xmin < 0 && data.ymin < 0) return;
          var x = X(t.v); if (x < pad + 4 || x > W - pad - 8) return;
          tk.push('M' + x.toFixed(2) + ' ' + (AY - 3).toFixed(2) + 'v6');
          txt.push('<text class="l" x="' + x.toFixed(2) + '" y="' + (AY + (below > 0 ? fs + 3 : -6)).toFixed(2) + '" text-anchor="middle">' + D(t.t) + '</text>');
        });
        var left = AX - 6 > 22 ? 1 : -1;
        yTicks.forEach(function (t) {
          if (Math.abs(t.v) < 1e-12 && data.xmin < 0 && data.ymin < 0) return;
          var y = Y(t.v); if (y < pad + 8 || y > H - pad - 4) return;
          tk.push('M' + (AX - 3).toFixed(2) + ' ' + y.toFixed(2) + 'h6');
          txt.push('<text class="l" x="' + (AX + (left > 0 ? -6 : 6)).toFixed(2) + '" y="' + (y + fs * 0.34).toFixed(2) + '" text-anchor="' + (left > 0 ? 'end' : 'start') + '">' + D(t.t) + '</text>');
        });
        out.push('<path d="' + tk.join('') + '" stroke="#1b2a30" stroke-width="1"/>');
        out.push('<g class="num" fill="#1b2a30">' + txt.join('') + '</g>');
        if (data.xmin < 0 && data.xmax > 0 && data.ymin < 0 && data.ymax > 0) {
          out.push('<text class="l nm" x="' + (AX - 5).toFixed(2) + '" y="' + (AY + fs + 2).toFixed(2) + '" text-anchor="end" fill="#1b2a30">' + (ar ? 'و' : 'O') + '</text>');
        }
      }
      if (data.axisNames) {
        out.push('<text class="l an" x="' + (W - pad - 2) + '" y="' + (AY + (AY + fs * 1.5 < H ? fs * 1.45 : -8)).toFixed(2) + '" text-anchor="end">' + (ar ? 'س' : 'x') + '</text>');
        out.push('<text class="l an" x="' + (AX + 8).toFixed(2) + '" y="' + (pad + fs * 0.6).toFixed(2) + '" text-anchor="start">' + (ar ? 'ص' : 'y') + '</text>');
      }
    }

    // curves
    out.push('<g clip-path="url(#' + uid + 'c)" fill="none" stroke-linecap="round" stroke-linejoin="round">');
    var span = data.ymax - data.ymin;
    comp.forEach(function (c) {
      var fn = c.fn;
      if (fn.visible === false) return;
      var dash = fn.dash === 'dash' ? ' stroke-dasharray="8 5"' : fn.dash === 'dot' ? ' stroke-dasharray="1.5 4.5"' : '';
      var sw = +fn.width || 2.2;
      if (c.vertical !== null && c.vertical !== undefined && isFinite(c.vertical)) {
        out.push('<path d="M' + X(c.vertical).toFixed(2) + ' ' + pad + 'V' + (H - pad) + '" stroke="' + fn.color + '" stroke-width="' + sw + '"' + dash + '/>');
        return;
      }
      if (c.pts) {
        var pp = c.pts.filter(function (q) { return isFinite(q[0]) && isFinite(q[1]); });
        if (fn.line !== false && pp.length > 1) out.push('<path d="' + pp.map(function (q, i) { return (i ? 'L' : 'M') + X(q[0]).toFixed(2) + ' ' + Y(q[1]).toFixed(2); }).join('') + '" stroke="' + fn.color + '" stroke-width="' + sw + '"' + dash + '/>');
        if (fn.marks !== false) pp.forEach(function (q) { out.push('<circle cx="' + X(q[0]).toFixed(2) + '" cy="' + Y(q[1]).toFixed(2) + '" r="3.4" fill="' + fn.color + '" stroke="#fff" stroke-width="1"/>'); });
        return;
      }
      if (!c.f) return;
      var d0 = data.xmin, d1 = data.xmax;
      if (fn.domain && isFinite(fn.domain[0]) && isFinite(fn.domain[1])) { d0 = Math.max(d0, fn.domain[0]); d1 = Math.min(d1, fn.domain[1]); }
      if (!(d1 > d0)) return;
      var N = Math.round((W - 2 * pad) * 2.5 * (d1 - d0) / (data.xmax - data.xmin)) + 2, d = [], pen = false, py = null;
      for (var k3 = 0; k3 <= N; k3++) {
        var x = d0 + (d1 - d0) * k3 / N, y = c.f(x);
        if (!isFinite(y) || Math.abs(y) > 1e7) { pen = false; py = null; continue; }
        if (py !== null && Math.abs(y - py) > span * 1.2 && ((y > data.ymax || y < data.ymin) || (py > data.ymax || py < data.ymin))) pen = false;   // asymptote
        var yc = Math.max(data.ymin - span * 3, Math.min(data.ymax + span * 3, y));
        d.push((pen ? 'L' : 'M') + X(x).toFixed(2) + ' ' + Y(yc).toFixed(2));
        pen = true; py = y;
      }
      out.push('<path d="' + d.join('') + '" stroke="' + fn.color + '" stroke-width="' + sw + '"' + dash + '/>');
    });
    out.push('</g>');

    // points
    var pts = features(data, comp);
    (data.points || []).forEach(function (p) { var px = +p.x, py2 = +p.y; if (isFinite(px) && isFinite(py2)) pts.push({ x: px, y: py2, kind: 'user', label: p.label || '' }); });
    var ptLabels = [];
    pts.forEach(function (p) {
      var col = p.kind === 'user' ? '#1b2a30' : (data.fns[p.fn] && data.fns[p.fn].color) || '#1b2a30';
      out.push('<circle cx="' + X(p.x).toFixed(2) + '" cy="' + Y(p.y).toFixed(2) + '" r="3.6" fill="#fff" stroke="' + col + '" stroke-width="2"/>');
      if (data.coords || p.label) {
        var cx = data.piTicks && Math.abs(p.x) > 1e-9 && piLabel(p.x / Math.PI) ? piLabel(p.x / Math.PI) : round2(p.x);
        ptLabels.push({ x: X(p.x), y: Y(p.y), name: p.label || '', cx: cx, cy: round2(p.y) });
      }
    });

    var info = { features: pts, area: areaInfo, errors: comp.map(function (c) { return c.err; }), window: { xmin: data.xmin, xmax: data.xmax, ymin: data.ymin, ymax: data.ymax } };

    // function labels (MathJax) + point labels
    var labelJobs = comp.map(function (c) {
      var fn = c.fn;
      if (fn.visible === false || fn.label === false || c.pts || (!c.f && c.vertical === null) || c.err) return Promise.resolve(null);
      var expr = String(fn.expr).trim();
      var tex = /=/.test(expr) ? expr : ((fn.name || (ar ? 'ص' : 'y')) + ' = ' + expr);
      return mathLabel(tex, fn.color, data).then(function (l) { return l ? { l: l, c: c } : null; });
    });
    return Promise.all([Promise.all(labelJobs), Raster.fontCss([font], true)]).then(function (res) {
      var labels = res[0], css = res[1];
      var boxes = [];
      var px = fs * 1.05;
      var placeBox = function (bx) {
        for (var tries = 0; tries < 12; tries++) {
          var hit = boxes.some(function (o) { return !(bx.x + bx.w < o.x || o.x + o.w < bx.x || bx.y + bx.h < o.y || o.y + o.h < bx.y); });
          if (!hit) break;
          bx.y += (tries % 2 ? -1 : 1) * (bx.h + 4) * (tries + 1) / 2 * (tries % 2 ? 1 : 1);
          bx.y = Math.max(pad, Math.min(H - pad - bx.h, bx.y));
        }
        boxes.push(bx); return bx;
      };
      var lab = [];
      labels.forEach(function (it) {
        if (!it) return;
        var c = it.c, w = it.l.w * px, h = it.l.h * px, x, y;
        if (c.vertical !== null && c.vertical !== undefined) { x = X(c.vertical) + 6; y = pad + 6; }
        else {
          // walk from the right edge to find a visible point of the curve
          for (var fr = 0.9; fr > 0.05; fr -= 0.04) {
            var xv = data.xmin + (data.xmax - data.xmin) * fr, yv = c.f(xv);
            if (isFinite(yv) && yv < data.ymax - span * 0.1 && yv > data.ymin + span * 0.08) {
              x = X(xv) - w - 6; y = Y(yv) - h - 6;
              if (x < pad) x = X(xv) + 6;
              break;
            }
          }
          if (x === undefined) { x = W - pad - w - 4; y = pad + 4; }
        }
        x = Math.max(pad + 2, Math.min(W - pad - w - 2, x)); y = Math.max(pad + 2, Math.min(H - pad - h - 2, y));
        var bx = placeBox({ x: x, y: y, w: w, h: h });
        var n = nest(it.l, bx.x, bx.y, px);
        lab.push('<rect x="' + (bx.x - 3).toFixed(2) + '" y="' + (bx.y - 2).toFixed(2) + '" width="' + (n.w + 6).toFixed(2) + '" height="' + (n.h + 4).toFixed(2) + '" rx="4" fill="#fff" fill-opacity="0.86"/>' + n.s);
      });
      // coordinates are written in visual order (bidi-override) so every renderer draws them the same way
      var vnum = function (v) {
        var s = String(v), neg = s[0] === '-';
        if (neg) s = s.slice(1);
        s = Raster.digits(s, eastern);
        if (!ar) return (neg ? '\u2212' : '') + s;
        if (/π/.test(s)) s = s.split('/').reverse().join('/');          // ٣π/٢ read right-to-left
        return s + (neg ? '\u2212' : '');
      };
      ptLabels.forEach(function (p) {
        var coord = data.coords ? (ar ? '(' + vnum(p.cy) + ' \u060C' + vnum(p.cx) + ')' : '(' + vnum(p.cx) + ', ' + vnum(p.cy) + ')') : '';
        var len = coord.length + (p.name ? p.name.length + 1 : 0);
        var w = len * fs * 0.5 + 6, h = fs + 4;
        var bx0 = { x: p.x + 6, y: p.y - h - 4, w: w, h: h };
        if (bx0.x + w > W - pad) bx0.x = p.x - w - 6;
        var bx = placeBox(bx0);
        var cxp = bx.x + w / 2, ty = (bx.y + fs * 0.95).toFixed(2);
        var parts = [];
        if (p.name) parts.push('<tspan font-weight="700">' + Raster.esc(p.name) + '</tspan>');
        if (coord) parts.push('<tspan direction="ltr" unicode-bidi="bidi-override">' + Raster.esc(coord) + '</tspan>');
        if (ar) parts.reverse();
        lab.push('<text class="l pt" x="' + cxp.toFixed(2) + '" y="' + ty + '" text-anchor="middle" direction="ltr">' + parts.join(' ') + '</text>');
      });
      if (areaInfo && data.area.value) {
        var ta = (ar ? 'المساحة ≈ ' : 'Area ≈ ') + round2(areaInfo.area);
        var mxA = X((+data.area.a + +data.area.b) / 2), myA = Math.min(H - pad - 4, AY + (AY < H - 40 ? 30 : -16));
        var at = areaInfo.at, taW = ta.length * fs * 0.48 + 8, taH = fs + 6;
        if (at && at.h > taH * 1.5) { mxA = at.x; myA = at.y + fs * 0.35; }
        var abx = placeBox({ x: mxA - taW / 2, y: myA - fs * 0.95, w: taW, h: taH });
        myA = abx.y + fs * 0.95;
        lab.push('<rect x="' + (abx.x).toFixed(2) + '" y="' + (abx.y - 2).toFixed(2) + '" width="' + taW.toFixed(2) + '" height="' + taH.toFixed(2) + '" rx="4" fill="#fff" fill-opacity="0.8"/>');
        lab.push(Raster.words(mxA, myA, Raster.digits(ta, eastern), ' class="l pt" fill="' + data.area.color + '" font-weight="700"', fs * 0.95, ar));
      }
      var title = data.title ? Raster.words(W / 2, pad + fs, data.title, ' class="l ttl"', fs * 1.3, ar) : '';
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
        '<defs><style>' + css + ' .l{font-family:"' + font + '","Times New Roman",serif;font-size:' + fs.toFixed(1) + 'px;} .an{font-size:' + (fs * 1.35).toFixed(1) + 'px;font-style:' + (ar ? 'normal' : 'italic') + ';} .nm{font-size:' + (fs * 1.1).toFixed(1) + 'px} .pt{font-size:' + (fs * 0.95).toFixed(1) + 'px;fill:#24363c} .ttl{font-size:' + (fs * 1.3).toFixed(1) + 'px;font-weight:700}</style>' +
        '<clipPath id="' + uid + 'c"><rect x="' + pad + '" y="' + pad + '" width="' + (W - 2 * pad) + '" height="' + (H - 2 * pad) + '"/></clipPath></defs>' +
        '<rect width="' + W + '" height="' + H + '" fill="#fff"/>' + out.join('') + lab.join('') + title + '</svg>';
      return { svg: svg, w: W, h: H, info: info, data: data };
    });
  }

  global.GraphRender = { defaults: defaults, render: render, PALETTE: PALETTE, piLabel: piLabel, round2: round2 };
})(window);
