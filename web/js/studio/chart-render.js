/*
 * ChartRender — statistical charts (Arabic, right-to-left categories) as a self-contained SVG.
 * types: bar | hbar | line | pie | donut | histogram | polygon | ogive | scatter | box
 *   ChartRender.render(data) -> Promise<{svg, w, h, info}>
 */
(function (global) {
  'use strict';
  var PALETTE = ['#0e9f9a', '#e07a00', '#1f5fbf', '#c2352b', '#7b3fb3', '#2e8b3a', '#b8860b', '#d45d8c', '#3d5560', '#0096c7'];
  var INK = '#1b2a30', GRID = '#dde7e9', MUTED = '#5f7179';

  function defaults() {
    return { v: 1, type: 'bar', labels: [], series: [], classes: [], freq: [], points: [], boxes: [],
      title: '', xlabel: '', ylabel: '', values: true, legend: true, grid: true, percent: true, angles: false,
      polygon: false, regression: false, stacked: false, cumulative: 'less',
      digits: 'western', notation: 'ar', w: 560, h: 380, font: 'Amiri', fontSize: 12, ymin: null, ymax: null };
  }

  function niceStep(range, target) {
    var raw = range / Math.max(1, target), mag = Math.pow(10, Math.floor(Math.log10(raw || 1))), n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }
  function f2(v) { return (+v).toFixed(2); }
  function rnd(v) { return String(+(+v).toFixed(2)); }

  function render(data) {
    data = Object.assign(defaults(), data || {});
    if ((data.type === 'normal' || data.type === 'binomial') && global.Prob) return Prob.render(data);   // probability distributions
    var W = +data.w || 560, H = +data.h || 380;
    var ar = data.notation !== 'en', eastern = data.digits === 'eastern';
    var fs = (data.fontSize || 12) * 96 / 72;
    var D = function (v) { return Raster.digits(String(v), eastern); };
    var font = data.font || 'Amiri';
    var out = [], defs = [], pendingEq = null;
    var txt = function (x, y, s, cls, extra) { return Raster.words(x, y, D(s), ' class="' + (cls || 'l') + '"' + (extra || ''), fs * (cls === 'ttl' ? 1.25 : cls === 'sm' ? 0.85 : 1), ar); };
    var top = 10, legendItems = [];
    if (data.title) { out.push(txt(W / 2, top + fs, data.title, 'ttl')); top += fs * 1.8; }
    var type = data.type;
    var info = {};
    var series = (data.series || []).map(function (s, i) { return { name: s.name || '', values: (s.values || []).map(Number), color: s.color || PALETTE[i % PALETTE.length] }; });

    // -------------------------------------------------- pie / donut
    if (type === 'pie' || type === 'donut') {
      var vals = series.length ? series[0].values : (data.freq || []).map(Number);
      var labels = data.labels && data.labels.length ? data.labels : vals.map(function (v, i) { return String(i + 1); });
      var total = vals.reduce(function (a, b) { return a + (b > 0 ? b : 0); }, 0);
      if (!total) throw new Error('مجموع القيم صفر');
      var legendW = data.legend ? Math.min(W * 0.36, 40 + Math.max.apply(null, labels.map(function (l) { return String(l).length; })) * fs * 0.5 + fs * 4) : 0;
      var R = Math.min((W - legendW - 40) / 2, (H - top - 24) / 2) * (data.legend ? 0.9 : 0.78);
      var cx = ar ? W - 20 - R - (data.legend ? 0 : (W - 40 - 2 * R) / 2) : 20 + R;
      if (!data.legend) cx = W / 2;
      else cx = ar ? W - 24 - R : 24 + R;
      var cy = top + (H - top) / 2;
      var a0 = -Math.PI / 2;
      vals.forEach(function (v, i) {
        if (!(v > 0)) return;
        var frac = v / total, a1 = a0 + frac * 2 * Math.PI, col = (data.colors && data.colors[i]) || PALETTE[i % PALETTE.length];
        var large = frac > 0.5 ? 1 : 0;
        var p0 = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)], p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
        var path = frac >= 0.9999 ? '<circle cx="' + f2(cx) + '" cy="' + f2(cy) + '" r="' + f2(R) + '" fill="' + col + '" stroke="#fff" stroke-width="2"/>'
          : '<path d="M' + f2(cx) + ' ' + f2(cy) + 'L' + f2(p0[0]) + ' ' + f2(p0[1]) + 'A' + f2(R) + ' ' + f2(R) + ' 0 ' + large + ' 1 ' + f2(p1[0]) + ' ' + f2(p1[1]) + 'Z" fill="' + col + '" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>';
        out.push(path);
        var am = (a0 + a1) / 2, rl = type === 'donut' ? R * 0.78 : R * 0.64;
        var lab = [];
        if (data.percent) lab.push(rnd(frac * 100) + '%');
        if (data.angles) lab.push(rnd(frac * 360) + '°');
        if (!data.percent && !data.angles && data.values) lab.push(rnd(v));
        if (frac > 0.035 && lab.length) out.push(txt(cx + rl * Math.cos(am), cy + rl * Math.sin(am) + fs * 0.35, lab.join(' '), 'pv', ' fill="#fff" font-weight="700"'));
        legendItems.push({ label: labels[i], color: col, extra: data.legend && !data.percent && data.values ? rnd(v) : '' });
        a0 = a1;
      });
      if (type === 'donut') out.push('<circle cx="' + f2(cx) + '" cy="' + f2(cy) + '" r="' + f2(R * 0.55) + '" fill="#fff"/>' + txt(cx, cy + fs * 0.4, rnd(total), 'ttl'));
      if (data.legend) {
        var lx = ar ? cx - R - 30 : cx + R + 30, ly = cy - legendItems.length * fs * 0.8;
        legendItems.forEach(function (it, i) {
          var y = ly + i * fs * 1.6;
          out.push('<rect x="' + f2(ar ? lx - 14 : lx) + '" y="' + f2(y - fs * 0.75) + '" width="14" height="14" rx="3" fill="' + it.color + '"/>');
          out.push('<text class="l" x="' + f2(ar ? lx - 20 : lx + 20) + '" y="' + f2(y + fs * 0.1) + '" text-anchor="' + (ar ? 'end' : 'start') + '" direction="ltr">' + Raster.esc(D(it.label)) + '</text>');
        });
      }
      info.total = total;
      return finish();
    }

    // -------------------------------------------------- cartesian charts: build numeric model
    var numericX = /histogram|polygon|ogive|scatter/.test(type);
    var horizontal = type === 'hbar';
    var cats = data.labels || [];
    var xs0, xs1, ys0 = Infinity, ys1 = -Infinity, ptsets = [];
    if (type === 'histogram' || type === 'polygon' || type === 'ogive') {
      var cl = data.classes || [], fq = (data.freq || []).map(Number);
      if (!cl.length) throw new Error('أدخل الفئات وتكراراتها');
      xs0 = cl[0][0]; xs1 = cl[cl.length - 1][1];
      var h0 = cl[0][1] - cl[0][0];
      if (type === 'polygon' || data.polygon) { xs0 -= h0; xs1 += cl[cl.length - 1][1] - cl[cl.length - 1][0]; }
      if (type === 'ogive') {
        var cum = 0, og = [[cl[0][0], 0]];
        cl.forEach(function (c, i) { cum += fq[i]; og.push([c[1], cum]); });
        if (data.cumulative === 'more') { var tot = cum; cum = tot; og = []; cl.forEach(function (c, i) { og.push([c[0], cum]); cum -= fq[i]; }); og.push([cl[cl.length - 1][1], 0]); }
        ptsets.push({ pts: og, color: PALETTE[0], line: true, marks: true });
        ys0 = 0; ys1 = Math.max.apply(null, og.map(function (p) { return p[1]; }));
      } else { ys0 = 0; ys1 = Math.max.apply(null, fq); }
    } else if (type === 'scatter') {
      var P = data.points || [];
      if (!P.length) throw new Error('أدخل النقاط (س، ص)');
      xs0 = Math.min.apply(null, P.map(function (p) { return p[0]; })); xs1 = Math.max.apply(null, P.map(function (p) { return p[0]; }));
      ys0 = Math.min.apply(null, P.map(function (p) { return p[1]; })); ys1 = Math.max.apply(null, P.map(function (p) { return p[1]; }));
      var px = (xs1 - xs0) * 0.1 || 1; xs0 -= px; xs1 += px;
      if (xs0 > 0 && xs0 < (xs1 - xs0) * 0.5) xs0 = 0;
    } else if (type === 'box') {
      var bx = data.boxes && data.boxes.length ? data.boxes : series.map(function (s) { return { name: s.name, values: s.values }; });
      if (!bx.length) throw new Error('أدخل البيانات');
      bx.forEach(function (b) { b.values.forEach(function (v) { ys0 = Math.min(ys0, v); ys1 = Math.max(ys1, v); }); });
      cats = bx.map(function (b, i) { return b.name || String(i + 1); });
    } else {
      if (!series.length) throw new Error('أدخل البيانات');
      var ncat = Math.max(cats.length, Math.max.apply(null, series.map(function (s) { return s.values.length; })));
      while (cats.length < ncat) cats = cats.concat([String(cats.length + 1)]);
      if (data.stacked && series.length > 1) {
        for (var ci = 0; ci < ncat; ci++) { var sp = 0, sn = 0; series.forEach(function (s) { var v = s.values[ci] || 0; if (v > 0) sp += v; else sn += v; }); ys1 = Math.max(ys1, sp); ys0 = Math.min(ys0, sn); }
      } else series.forEach(function (s) { s.values.forEach(function (v) { if (isFinite(v)) { ys0 = Math.min(ys0, v); ys1 = Math.max(ys1, v); } }); });
      ys0 = Math.min(0, ys0);
    }
    if (data.ymin !== null && data.ymin !== undefined && data.ymin !== '') ys0 = +data.ymin;
    if (data.ymax !== null && data.ymax !== undefined && data.ymax !== '') ys1 = +data.ymax;
    if (!(ys1 > ys0)) ys1 = ys0 + 1;
    var ystep = data.ystep ? +data.ystep : niceStep(ys1 - ys0, (H - top - 80) / 42);
    if (!(data.ymax !== null && data.ymax !== undefined && data.ymax !== '')) ys1 = Math.ceil(ys1 / ystep - 1e-9) * ystep + (type === 'box' || type === 'scatter' || type === 'line' ? 0 : (data.values ? ystep * 0.35 : 0));
    if (!(data.ymin !== null && data.ymin !== undefined && data.ymin !== '') && ys0 < 0) ys0 = Math.floor(ys0 / ystep) * ystep;
    if ((type === 'box' || type === 'scatter' || type === 'line') && !(data.ymin !== null && data.ymin !== undefined && data.ymin !== '')) { ys0 = Math.floor(ys0 / ystep) * ystep; if (ys0 > 0 && type !== 'scatter') ys0 = ys0 - ystep; }

    // legend (multi-series)
    var multi = series.length > 1 && /bar|hbar|line/.test(type);
    if (multi && data.legend) {
      var lx = ar ? W - 16 : 16, ly = top + fs * 0.4;
      series.forEach(function (s) {
        var w = String(s.name).length * fs * 0.5 + 30;
        out.push('<rect x="' + f2(ar ? lx - 14 : lx) + '" y="' + f2(ly - 5) + '" width="14" height="14" rx="3" fill="' + s.color + '"/>');
        out.push('<text class="l" x="' + f2(ar ? lx - 20 : lx + 20) + '" y="' + f2(ly + fs * 0.62) + '" text-anchor="' + (ar ? 'end' : 'start') + '" direction="ltr">' + Raster.esc(D(s.name)) + '</text>');
        lx += (ar ? -1 : 1) * (w + 14);
      });
      top += fs * 1.9;
    }
    var yLabelW = Math.max.apply(null, [ys0, ys1].map(function (v) { return D(rnd(v)).length; })) * fs * 0.55 + 12;
    var catLabelW = horizontal ? Math.min(W * 0.3, Math.max.apply(null, cats.map(function (c) { return String(c).length; })) * fs * 0.52 + 14) : 0;
    var axisOnRight = ar && !numericX;                       // Arabic: value axis on the right, categories read right-to-left
    var mL = axisOnRight ? 16 : (horizontal ? catLabelW : yLabelW) + (data.ylabel && !axisOnRight ? 6 : 0) + 8;
    var mR = axisOnRight ? (horizontal ? catLabelW : yLabelW) + 8 : 20;
    var longCats = !horizontal && !numericX && cats.some(function (c) { return String(c).length > 7; });
    var mB = (data.xlabel ? fs * 2.1 : 0) + (numericX || horizontal ? fs * 1.6 : (longCats ? fs * 2.6 : fs * 1.7)) + 6;
    var mT = top + (data.ylabel ? fs * 1.6 : fs * 0.6);
    var PW = W - mL - mR, PH = H - mT - mB;
    if (PW < 60 || PH < 60) throw new Error('المساحة صغيرة جداً — كبّر أبعاد الرسم');

    // value mapping
    var Yv = function (v) { return mT + PH - (v - ys0) / (ys1 - ys0) * PH; };
    var Xv = function (v) { return mL + (v - xs0) / (xs1 - xs0) * PW; };
    if (horizontal) Xv = function (v) { var fr = (v - ys0) / (ys1 - ys0); return axisOnRight ? mL + PW - fr * PW : mL + fr * PW; };

    // grid + value axis
    var ticks = [];
    for (var t = Math.ceil(ys0 / ystep - 1e-9) * ystep; t <= ys1 + 1e-9; t += ystep) ticks.push(+t.toFixed(10));
    ticks.forEach(function (tv) {
      if (horizontal) {
        var x = Xv(tv);
        if (data.grid) out.push('<path d="M' + f2(x) + ' ' + mT + 'V' + (mT + PH) + '" stroke="' + GRID + '" stroke-width="1"/>');
        out.push('<text class="n" x="' + f2(x) + '" y="' + f2(mT + PH + fs * 1.2) + '" text-anchor="middle">' + D(rnd(tv)) + '</text>');
      } else {
        var y = Yv(tv);
        if (data.grid) out.push('<path d="M' + mL + ' ' + f2(y) + 'H' + (mL + PW) + '" stroke="' + GRID + '" stroke-width="1"/>');
        out.push('<text class="n" x="' + f2(axisOnRight ? mL + PW + 7 : mL - 7) + '" y="' + f2(y + fs * 0.34) + '" text-anchor="' + (axisOnRight ? 'start' : 'end') + '">' + D(rnd(tv)) + '</text>');
      }
    });
    // axes lines
    var baseY = Yv(Math.max(ys0, Math.min(0, ys1)));
    if (horizontal) {
      var bx0 = Xv(Math.max(ys0, 0));
      out.push('<path d="M' + f2(bx0) + ' ' + mT + 'V' + (mT + PH) + 'M' + mL + ' ' + (mT + PH) + 'H' + (mL + PW) + '" stroke="' + INK + '" stroke-width="1.3"/>');
    } else {
      out.push('<path d="M' + mL + ' ' + f2(baseY) + 'H' + (mL + PW) + '" stroke="' + INK + '" stroke-width="1.3"/>');
      var ax = axisOnRight ? mL + PW : mL;
      out.push('<path d="M' + f2(ax) + ' ' + mT + 'V' + (mT + PH) + '" stroke="' + INK + '" stroke-width="1.3"/>');
    }
    // axis titles
    if (data.ylabel) out.push(txt(horizontal ? mL + PW / 2 : (axisOnRight ? mL + PW : mL), mT - fs * 0.7, data.ylabel, 'at', ' font-weight="700"'));
    if (data.xlabel) out.push(txt(mL + PW / 2, H - 8, data.xlabel, 'at', ' font-weight="700"'));

    // -------------------------------------------------- categorical: bar / hbar / line / box
    if (!numericX) {
      var n = cats.length, band = (horizontal ? PH : PW) / n;
      var catPos = function (i) {                               // centre of the category band
        if (horizontal) return mT + band * (i + 0.5);
        return axisOnRight ? mL + PW - band * (i + 0.5) : mL + band * (i + 0.5);
      };
      cats.forEach(function (c, i) {
        var p = catPos(i);
        if (horizontal) out.push('<text class="l" x="' + f2(axisOnRight ? mL + PW + 8 : mL - 8) + '" y="' + f2(p + fs * 0.34) + '" text-anchor="' + (axisOnRight ? 'start' : 'end') + '" direction="ltr">' + Raster.esc(D(c)) + '</text>');
        else if (longCats) {
          var ws = String(c).split(/\s+/), l1 = ws.slice(0, Math.ceil(ws.length / 2)).join(' '), l2 = ws.slice(Math.ceil(ws.length / 2)).join(' ');
          out.push(txt(p, mT + PH + fs * 1.2, l1, 'l')); if (l2) out.push(txt(p, mT + PH + fs * 2.3, l2, 'l'));
        } else out.push(txt(p, mT + PH + fs * 1.25, c, 'l'));
      });
      if (type === 'bar' || type === 'hbar') {
        var ns = data.stacked ? 1 : series.length, gw = band * 0.72, bw = gw / ns;
        var stackPos = [], stackNeg = [];
        series.forEach(function (s, si) {
          s.values.forEach(function (v, i) {
            if (!isFinite(v)) return;
            var c0 = catPos(i), off = data.stacked ? 0 : (si - (ns - 1) / 2) * bw;
            if (axisOnRight && !horizontal) off = -off;
            var from = 0, to = v;
            if (data.stacked) { var acc = v >= 0 ? (stackPos[i] || 0) : (stackNeg[i] || 0); from = acc; to = acc + v; if (v >= 0) stackPos[i] = to; else stackNeg[i] = to; }
            var col = series.length === 1 && data.colors && data.colors[i] ? data.colors[i] : s.color;
            if (horizontal) {
              var x0 = Xv(from), x1 = Xv(to), yb = c0 + off - bw * 0.45;
              out.push('<rect x="' + f2(Math.min(x0, x1)) + '" y="' + f2(yb) + '" width="' + f2(Math.abs(x1 - x0)) + '" height="' + f2(bw * 0.9) + '" fill="' + col + '" rx="2"/>');
              if (data.values) out.push('<text class="sm" x="' + f2(axisOnRight ? Math.min(x0, x1) - 4 : Math.max(x0, x1) + 4) + '" y="' + f2(yb + bw * 0.45 + fs * 0.3) + '" text-anchor="' + (axisOnRight ? 'end' : 'start') + '">' + D(rnd(v)) + '</text>');
            } else {
              var y0 = Yv(from), y1 = Yv(to), xb = c0 + off - bw * 0.45;
              out.push('<rect x="' + f2(xb) + '" y="' + f2(Math.min(y0, y1)) + '" width="' + f2(bw * 0.9) + '" height="' + f2(Math.abs(y1 - y0)) + '" fill="' + col + '" rx="2"/>');
              if (data.values && !data.stacked) out.push('<text class="sm" x="' + f2(xb + bw * 0.45) + '" y="' + f2(v >= 0 ? y1 - 5 : y1 + fs) + '" text-anchor="middle">' + D(rnd(v)) + '</text>');
              else if (data.values && data.stacked && Math.abs(y1 - y0) > fs) out.push('<text class="sm" x="' + f2(xb + bw * 0.45) + '" y="' + f2((y0 + y1) / 2 + fs * 0.35) + '" text-anchor="middle" fill="#fff">' + D(rnd(v)) + '</text>');
            }
          });
        });
      } else if (type === 'line') {
        series.forEach(function (s) {
          var pts = s.values.map(function (v, i) { return isFinite(v) ? [catPos(i), Yv(v)] : null; }).filter(Boolean);
          out.push('<path d="' + pts.map(function (p, i) { return (i ? 'L' : 'M') + f2(p[0]) + ' ' + f2(p[1]); }).join('') + '" fill="none" stroke="' + s.color + '" stroke-width="2.6" stroke-linejoin="round"/>');
          pts.forEach(function (p, i) {
            out.push('<circle cx="' + f2(p[0]) + '" cy="' + f2(p[1]) + '" r="4" fill="#fff" stroke="' + s.color + '" stroke-width="2.2"/>');
            if (data.values) out.push('<text class="sm" x="' + f2(p[0]) + '" y="' + f2(p[1] - 8) + '" text-anchor="middle">' + D(rnd(s.values.filter(isFinite)[i])) + '</text>');
          });
        });
      } else if (type === 'box') {
        var boxes = data.boxes && data.boxes.length ? data.boxes : series.map(function (s) { return { name: s.name, values: s.values }; });
        info.boxes = [];
        boxes.forEach(function (b, i) {
          var a = b.values.slice().filter(isFinite).sort(function (x, y) { return x - y; });
          var med = function (arr) { var k = arr.length; return k % 2 ? arr[(k - 1) / 2] : (arr[k / 2 - 1] + arr[k / 2]) / 2; };
          var half = Math.floor(a.length / 2), q1 = med(a.slice(0, half)), q3 = med(a.slice(a.length % 2 ? half + 1 : half)), m = med(a);
          var c0 = catPos(i), bw2 = Math.min(band * 0.45, 70), col = PALETTE[i % PALETTE.length];
          out.push('<path d="M' + f2(c0) + ' ' + f2(Yv(a[0])) + 'V' + f2(Yv(q1)) + 'M' + f2(c0) + ' ' + f2(Yv(q3)) + 'V' + f2(Yv(a[a.length - 1])) +
            'M' + f2(c0 - bw2 / 4) + ' ' + f2(Yv(a[0])) + 'h' + f2(bw2 / 2) + 'M' + f2(c0 - bw2 / 4) + ' ' + f2(Yv(a[a.length - 1])) + 'h' + f2(bw2 / 2) + '" stroke="' + INK + '" stroke-width="1.5"/>');
          out.push('<rect x="' + f2(c0 - bw2 / 2) + '" y="' + f2(Yv(q3)) + '" width="' + f2(bw2) + '" height="' + f2(Yv(q1) - Yv(q3)) + '" fill="' + col + '" fill-opacity="0.25" stroke="' + col + '" stroke-width="2"/>');
          out.push('<path d="M' + f2(c0 - bw2 / 2) + ' ' + f2(Yv(m)) + 'h' + f2(bw2) + '" stroke="' + col + '" stroke-width="3"/>');
          if (data.values) [['min', a[0]], ['q1', q1], ['m', m], ['q3', q3], ['max', a[a.length - 1]]].forEach(function (q) {
            out.push('<text class="sm" x="' + f2(c0 + (axisOnRight ? -1 : 1) * (bw2 / 2 + 6)) + '" y="' + f2(Yv(q[1]) + fs * 0.3) + '" text-anchor="' + (axisOnRight ? 'end' : 'start') + '">' + D(rnd(q[1])) + '</text>');
          });
          info.boxes.push({ min: a[0], q1: q1, median: m, q3: q3, max: a[a.length - 1] });
        });
      }
      return finish();
    }

    // -------------------------------------------------- numeric x: histogram / polygon / ogive / scatter
    var xstep = niceStep(xs1 - xs0, PW / 60), xt = [];
    if (type === 'histogram' || type === 'polygon' || type === 'ogive') {
      var bounds = {};
      data.classes.forEach(function (c) { bounds[c[0]] = 1; bounds[c[1]] = 1; });
      xt = Object.keys(bounds).map(Number).sort(function (a, b) { return a - b; });
      if (type === 'polygon' || data.polygon) xt = [xs0].concat(xt, [xs1]);
    } else for (var xv = Math.ceil(xs0 / xstep) * xstep; xv <= xs1 + 1e-9; xv += xstep) xt.push(+xv.toFixed(10));
    xt.forEach(function (v) {
      var x = Xv(v);
      if (data.grid && type === 'scatter') out.push('<path d="M' + f2(x) + ' ' + mT + 'V' + (mT + PH) + '" stroke="' + GRID + '"/>');
      out.push('<path d="M' + f2(x) + ' ' + f2(mT + PH) + 'v5" stroke="' + INK + '"/>');
      out.push('<text class="n" x="' + f2(x) + '" y="' + f2(mT + PH + fs * 1.3) + '" text-anchor="middle">' + D(rnd(v)) + '</text>');
    });
    if (type === 'histogram' || type === 'polygon') {
      var fq2 = data.freq.map(Number);
      if (type === 'histogram') data.classes.forEach(function (c, i) {
        var x0 = Xv(c[0]), x1 = Xv(c[1]), y = Yv(fq2[i]);
        out.push('<rect x="' + f2(x0) + '" y="' + f2(y) + '" width="' + f2(x1 - x0) + '" height="' + f2(mT + PH - y) + '" fill="' + PALETTE[0] + '" fill-opacity="0.78" stroke="#fff" stroke-width="1.5"/>');
        if (data.values) out.push('<text class="sm" x="' + f2((x0 + x1) / 2) + '" y="' + f2(y - 5) + '" text-anchor="middle">' + D(rnd(fq2[i])) + '</text>');
      });
      if (type === 'polygon' || data.polygon) {
        var c0 = data.classes[0], cn = data.classes[data.classes.length - 1];
        var pp = [[c0[0] - (c0[1] - c0[0]) / 2, 0]].concat(data.classes.map(function (c, i) { return [(c[0] + c[1]) / 2, fq2[i]]; }), [[cn[1] + (cn[1] - cn[0]) / 2, 0]]);
        ptsets.push({ pts: pp, color: type === 'polygon' ? PALETTE[0] : PALETTE[3], line: true, marks: true, values: type === 'polygon' && data.values });
      }
    }
    if (type === 'scatter') {
      ptsets.push({ pts: data.points, color: PALETTE[2], line: false, marks: true });
      if (data.regression && data.points.length > 1 && global.StatsEngine) {
        var rg = StatsEngine.regression(data.points);
        info.regression = rg;
        var ya = rg.a + rg.b * xs0, yb2 = rg.a + rg.b * xs1;
        out.push('<path d="M' + f2(Xv(xs0)) + ' ' + f2(Yv(ya)) + 'L' + f2(Xv(xs1)) + ' ' + f2(Yv(yb2)) + '" stroke="' + PALETTE[3] + '" stroke-width="2" stroke-dasharray="8 5"/>');
        var eqTex = (ar ? 'ص = ' : '\\hat{y} = ') + rnd(rg.b) + (ar ? '\\,س' : 'x') + (rg.a < 0 ? ' - ' : ' + ') + rnd(Math.abs(rg.a)) + (ar ? ' \\qquad ر = ' : ' ,\\quad r = ') + String(Math.round(rg.r * 1000) / 1000);
        pendingEq = { tex: eqTex, x: axisOnRight || ar ? mL + 8 : mL + PW - 8, y: mT + 6, color: PALETTE[3], anchor: ar ? 'start' : 'end' };
      }
    }
    ptsets.forEach(function (ps) {
      var pts = ps.pts.map(function (p) { return [Xv(p[0]), Yv(p[1])]; });
      if (ps.line) out.push('<path d="' + pts.map(function (p, i) { return (i ? 'L' : 'M') + f2(p[0]) + ' ' + f2(p[1]); }).join('') + '" fill="none" stroke="' + ps.color + '" stroke-width="2.4" stroke-linejoin="round"/>');
      if (ps.marks) pts.forEach(function (p, i) {
        out.push('<circle cx="' + f2(p[0]) + '" cy="' + f2(p[1]) + '" r="4" fill="' + (ps.line ? '#fff' : ps.color) + '" stroke="' + ps.color + '" stroke-width="2"/>');
        if (ps.values) out.push('<text class="sm" x="' + f2(p[0]) + '" y="' + f2(p[1] - 8) + '" text-anchor="middle">' + D(rnd(ps.pts[i][1])) + '</text>');
      });
    });
    return finish();

    function finish() {
      var eqP = pendingEq && global.RenderHost ? RenderHost.preview(pendingEq.tex, { rtl: ar, arabicFunctions: ar, arabicComma: ar, digits: eastern ? 'eastern' : 'western',
        color: pendingEq.color, fontSize: 14, mathFont: data.mathFont || 'stix2', font: font, display: false, mode: 'math' }, true).catch(function () { return null; }) : Promise.resolve(null);
      return Promise.all([Raster.fontCss([font], true), eqP]).then(function (res) {
        var css = res[0], lbl = res[1];
        if (lbl && !(lbl.errors && lbl.errors.length)) {
          var px = fs * 1.05, w = lbl.width * px, h = lbl.total * px;
          var x = pendingEq.anchor === 'start' ? pendingEq.x : pendingEq.x - w;
          out.push('<rect x="' + f2(x - 4) + '" y="' + f2(pendingEq.y - 2) + '" width="' + f2(w + 8) + '" height="' + f2(h + 4) + '" rx="4" fill="#fff" fill-opacity="0.9"/>');
          out.push(lbl.svgString.replace(/^<svg\b([^>]*)>/, function (m0, a) {
            return '<svg' + a.replace(/\s(width|height|style|x|y)="[^"]*"/g, '') + ' x="' + f2(x) + '" y="' + f2(pendingEq.y) + '" width="' + f2(w) + '" height="' + f2(h) + '" overflow="visible">';
          }));
        }
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
          '<defs><style>' + css + ' text{font-family:"' + font + '","Times New Roman",serif;fill:' + INK + '} .l,.at,.pv{font-size:' + f2(fs) + 'px} .n{font-size:' + f2(fs * 0.92) + 'px;fill:' + MUTED + '} .sm{font-size:' + f2(fs * 0.85) + 'px;fill:#24363c} .ttl{font-size:' + f2(fs * 1.25) + 'px;font-weight:700}</style>' + defs.join('') + '</defs>' +
          '<rect width="' + W + '" height="' + H + '" fill="#fff"/>' + out.join('') + '</svg>';
        return { svg: svg, w: W, h: H, info: info };
      });
    }
  }

  global.ChartRender = { render: render, defaults: defaults, PALETTE: PALETTE };
})(window);
