/* LabRender — laboratory apparatus drawn from a LaTeX-like description (units = cm, y up; "at" = bottom centre).
 * \begin{lab}
 *   \stand[clamp=5.2]{(-2,0)}            \burette[fill=0.7, color=blue, label=محلول NaOH]{(0,3.4)}
 *   \flask[fill=0.35, color=pink, label=حمض]{(0,0)}   \beaker[fill=0.5]{(4,0)}   \roundflask   \testtube[angle=20]
 *   \cylinder[fill=0.6]   \funnel[paper]   \pipette   \dropper   \thermometer[level=0.6]   \burner[flame]   \tripod[gauze]
 *   \condenser[angle=-20, length=4]{(x,y)}   \tube{(0,3) (1,4) (3,4)}   \bubbles[w=1, h=1]{(x,y)}   \label[to=(1,2)]{(3,4)}{نص}
 * \end{lab}
 * Options on containers: fill (0–1 level), color (liquid), ppt (precipitate), bubbles, label, w, h, scale. */
(function (global) {
  'use strict';
  var S = 37.7953, INK = '#1b2a30', GLASS = '#f4fbfd', LIQ = '#7cc6ee';
  var NAMED = { blue: '#7cc6ee', pink: '#f7a8c8', red: '#f08080', green: '#9fdc9f', yellow: '#f6e27a', orange: '#f7b267', purple: '#c5a3e6',
    colorless: '#e6f4f8', 'أزرق': '#7cc6ee', 'وردي': '#f7a8c8', 'أحمر': '#f08080', 'أخضر': '#9fdc9f', 'أصفر': '#f6e27a', 'برتقالي': '#f7b267', 'بنفسجي': '#c5a3e6', 'عديم اللون': '#e6f4f8' };
  function f2(v) { return (+v).toFixed(2); }
  function liq(c) { if (!c || c === true) return LIQ; var k = String(c).trim(); return NAMED[k] || NAMED[k.toLowerCase()] || (global.Mk ? Mk.color(k, LIQ) : LIQ); }
  function num(v, d) { return global.Mk ? Mk.evalNum(v, d) : (v === undefined ? d : +v); }

  // ------------------------------------------------------------ parse
  function parse(opts, body) {
    var o = typeof opts === 'string' ? Mk.options(opts) : (opts || {}), items = [];
    Mk.commands(body).forEach(function (c) {
      var a = c.args, co = c.opt, n = c.name;
      var at = a[0] && /\(/.test(a[0]) ? Mk.point(a[0]) : (c.coords[0] ? Mk.point(c.coords[0]) : [0, 0]);
      if (n === 'label' || n === 'text') items.push({ t: n, at: Mk.point(a[0] || '(0,0)'), text: a[1] || '', to: co.to ? Mk.point(co.to) : null });
      else if (n === 'tube') { var re = /\(([^()]*)\)/g, m, pts = []; while ((m = re.exec(a[0] || ''))) pts.push(Mk.point(m[1])); items.push({ t: 'tube', pts: pts }); }
      else if (n === 'arrow') items.push({ t: 'arrow', a: Mk.point(a[0]), b: Mk.point(a[1]), text: co.label || '' });
      else items.push({ t: n, at: at, o: co });
    });
    return { v: 1, items: items, opt: o };
  }


  // ------------------------------------------------------------ text: measured widths, words laid out right-to-left for Arabic
  var ctx = null;
  function measure(str, fs) {
    try {
      if (!ctx) ctx = document.createElement('canvas').getContext('2d');
      ctx.font = '700 ' + fs + 'px Amiri, "Times New Roman", serif';
      return ctx.measureText(String(str)).width;
    } catch (e) { return String(str).length * fs * 0.45; }
  }
  var AR = /[\u0600-\u06FF]/;
  function run(xLeft, y, str, fs) {
    var words = String(str).trim().split(/\s+/), sp = measure(' ', fs), segs = [];
    if (AR.test(str)) {
      // group Latin/number words into LTR runs, then lay the runs out from right to left
      var runs = [];
      words.forEach(function (w) { var a = AR.test(w); if (!a && runs.length && !runs[runs.length - 1].ar) runs[runs.length - 1].w.push(w); else runs.push({ ar: a, w: [w] }); });
      runs.reverse().forEach(function (r) { segs = segs.concat(r.w); });
    } else segs = [words.join(' ')];
    var x = xLeft, out = '';
    segs.forEach(function (w) {
      out += '<text class="lb" x="' + f2(x) + '" y="' + f2(y) + '" text-anchor="start" direction="ltr" style="direction:ltr">' + String(w).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</text>';
      x += measure(w, fs) + sp;
    });
    return out;
  }

  // ------------------------------------------------------------ drawing helpers (local cm → px handled by caller)
  function render(data) {
    var items = data.items || [], out = [], labels = [], bb = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    var sc = num((data.opt || {}).scale, 1) * S;
    var P = function (x, y) { return [x * sc, -y * sc]; };
    var ib = null, boxes = [], reqs = [];
    var grow = function (x, y) {
      bb.x0 = Math.min(bb.x0, x); bb.y0 = Math.min(bb.y0, y); bb.x1 = Math.max(bb.x1, x); bb.y1 = Math.max(bb.y1, y);
      if (ib) { ib.x0 = Math.min(ib.x0, x); ib.y0 = Math.min(ib.y0, y); ib.x1 = Math.max(ib.x1, x); ib.y1 = Math.max(ib.y1, y); }
    };
    // a label that belongs to an apparatus: placed after everything is drawn (above it when that space is free, else as a callout at the side)
    var req = function (text, ay, o2) { if (text && text !== true) reqs.push({ text: String(text), ay: ay, box: ib, side: (o2 && o2.side) || 'auto' }); };
    var path = function (pts, close) { return pts.map(function (q, i) { var p = P(q[0], q[1]); grow(p[0], p[1]); return (i ? 'L' : 'M') + f2(p[0]) + ' ' + f2(p[1]); }).join('') + (close ? 'Z' : ''); };
    var glass = function (d, fill) { out.push('<path d="' + d + '" fill="' + (fill || GLASS) + '" fill-opacity="' + (fill ? 1 : 0.55) + '" stroke="' + INK + '" stroke-width="1.8" stroke-linejoin="round"/>'); };
    var liquid = function (d, col) { out.push('<path d="' + d + '" fill="' + col + '" fill-opacity="0.75" stroke="none"/>'); };
    var line = function (a, b, w, col, dash) { var p = P(a[0], a[1]), q = P(b[0], b[1]); grow(p[0], p[1]); grow(q[0], q[1]); out.push('<path d="M' + f2(p[0]) + ' ' + f2(p[1]) + 'L' + f2(q[0]) + ' ' + f2(q[1]) + '" stroke="' + (col || INK) + '" stroke-width="' + (w || 1.2) + '"' + (dash ? ' stroke-dasharray="4 3"' : '') + ' stroke-linecap="round" fill="none"/>'); };
    var label = function (x, y, text, tx, ty) {
      if (!text) return;
      labels.push({ x: x, y: y, text: String(text), tx: tx, ty: ty });
    };
    var ticks = function (x, y0, y1, n, side) { for (var k = 1; k < n; k++) { var y = y0 + (y1 - y0) * k / n; line([x, y], [x + side * (k % 2 ? 0.18 : 0.3), y], 1); } };
    var extras = function (o, x0, x1, yb, level) {
      if (o.ppt || o.precipitate) { var pc = liq(o.ppt === true ? 'white' : o.ppt); for (var k = 0; k < 18; k++) { var px = x0 + 0.12 + (x1 - x0 - 0.24) * ((k * 37) % 18) / 18, py = yb + 0.06 + ((k * 13) % 5) * 0.035; var p = P(px, py); out.push('<circle cx="' + f2(p[0]) + '" cy="' + f2(p[1]) + '" r="2.2" fill="' + (o.ppt === true ? '#8a8f93' : pc) + '"/>'); } }
      if (o.bubbles && level > yb + 0.3) for (var j = 0; j < 7; j++) { var bx = x0 + (x1 - x0) * (0.2 + 0.6 * ((j * 29) % 7) / 7), by = yb + 0.25 + (level - yb - 0.4) * ((j * 17) % 7) / 7, q = P(bx, by); out.push('<circle cx="' + f2(q[0]) + '" cy="' + f2(q[1]) + '" r="' + (2 + (j % 3)) + '" fill="#fff" fill-opacity="0.8" stroke="#5aa9cf" stroke-width="0.8"/>'); }
    };

    items.forEach(function (it) {
      var o = it.o || {}, x = it.at ? it.at[0] : 0, y = it.at ? it.at[1] : 0, col = liq(o.color), fill = Math.max(0, Math.min(1, num(o.fill, 0)));
      var k = num(o.scale, 1);
      ib = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, t: it.t };
      if (!/^(label|text|arrow|tube|bubbles)$/.test(it.t)) boxes.push(ib);
      switch (it.t) {
        case 'beaker': {
          var w = num(o.w, 2.2) * k, h = num(o.h, 2.6) * k, r = 0.18 * k, x0 = x - w / 2, x1 = x + w / 2;
          var lv = y + h * 0.85 * fill;
          if (fill) liquid(path([[x0 + 0.05, y + 0.05], [x1 - 0.05, y + 0.05], [x1 - 0.05, lv], [x0 + 0.05, lv]], true), col);
          glass(path([[x0 - 0.18, y + h + 0.05], [x0, y + h - 0.05], [x0, y + r], [x0 + r, y], [x1 - r, y], [x1, y + r], [x1, y + h]]), 'none');
          out[out.length - 1] = out[out.length - 1].replace('fill="none" fill-opacity="1"', 'fill="none"');
          ticks(x1 - 0.02, y + h * 0.2, y + h * 0.8, 4, -1);
          extras(o, x0, x1, y, lv);
          req(o.label, y + h * 0.45, o);
          break;
        }
        case 'flask': case 'erlenmeyer': {
          var W = num(o.w, 2.4) * k, H = num(o.h, 3.0) * k, nw = 0.7 * k, nh = 0.9 * k, bh = H - nh;
          var half = function (yy) { return W / 2 - (W / 2 - nw / 2) * Math.min(1, yy / bh); };
          if (fill) { var ly = bh * 0.9 * fill; liquid(path([[x - W / 2 + 0.08, y + 0.05], [x + W / 2 - 0.08, y + 0.05], [x + half(ly) - 0.06, y + ly], [x - half(ly) + 0.06, y + ly]], true), col); extras(o, x - half(ly), x + half(ly), y, y + ly); }
          glass(path([[x - nw / 2 - 0.08, y + H + 0.06], [x - nw / 2, y + H - 0.04], [x - nw / 2, y + bh], [x - W / 2, y + 0.12], [x - W / 2 + 0.12, y], [x + W / 2 - 0.12, y], [x + W / 2, y + 0.12], [x + nw / 2, y + bh], [x + nw / 2, y + H - 0.04], [x + nw / 2 + 0.08, y + H + 0.06]]));
          req(o.label, y + bh * 0.4, o);
          break;
        }
        case 'roundflask': {
          var R = num(o.r, 1.1) * k, nw2 = 0.55 * k, nh2 = num(o.neck, 1.3) * k, cy = y + R;
          if (fill) {
            var lvl = -R + 2 * R * 0.85 * fill, seg = [];
            var a0 = Math.asin(Math.max(-1, Math.min(1, lvl / R)));
            for (var i = 0; i <= 30; i++) { var a = -Math.PI / 2 + (a0 + Math.PI / 2) * i / 30; seg.push([x + R * 0.96 * Math.cos(a), cy + R * 0.96 * Math.sin(a)]); }
            var seg2 = seg.map(function (q) { return [2 * x - q[0], q[1]]; }).reverse();
            liquid(path(seg2.concat(seg), true), col);
          }
          var arc = [], ta = Math.asin(nw2 / 2 / R);
          for (var j = 0; j <= 40; j++) { var t = Math.PI / 2 + ta + (2 * Math.PI - 2 * ta) * j / 40; arc.push([x + R * Math.cos(t), cy + R * Math.sin(t)]); }
          glass(path([[x - nw2 / 2 - 0.08, cy + R + nh2 + 0.06], [x - nw2 / 2, cy + R + nh2 - 0.04]].concat(arc, [[x + nw2 / 2, cy + R + nh2 - 0.04], [x + nw2 / 2 + 0.08, cy + R + nh2 + 0.06]])));
          req(o.label, cy, o);
          break;
        }
        case 'testtube': {
          var tw = num(o.w, 0.62) * k, th = num(o.h, 3.2) * k, rr = tw / 2, ang = num(o.angle, 0);
          var pts = [[-tw / 2 - 0.06, th + 0.05], [-tw / 2, th]], lp = [];
          for (var q = 0; q <= 16; q++) { var aa = Math.PI + Math.PI * q / 16; pts.push([rr * Math.cos(aa), rr + rr * Math.sin(aa)]); }
          pts.push([tw / 2, th], [tw / 2 + 0.06, th + 0.05]);
          var rot = function (q2) { var c = Math.cos(ang * Math.PI / 180), s2 = Math.sin(ang * Math.PI / 180); return [x + q2[0] * c - q2[1] * s2, y + q2[0] * s2 + q2[1] * c]; };
          if (fill) { var lh = (th - 0.2) * fill; for (var q3 = 0; q3 <= 16; q3++) { var a3 = Math.PI + Math.PI * q3 / 16; lp.push([rr * 0.86 * Math.cos(a3), rr + rr * 0.86 * Math.sin(a3)]); } lp.push([rr * 0.86, lh], [-rr * 0.86, lh]); liquid(path(lp.map(rot), true), col); if (!ang) extras(o, x - rr * 0.75, x + rr * 0.75, y + 0.05, y + lh); }
          glass(path(pts.map(rot)));
          req(o.label, rot([0, th * 0.4])[1], o);
          break;
        }
        case 'cylinder': {
          var cw = num(o.w, 0.95) * k, chh = num(o.h, 4.2) * k;
          if (fill) liquid(path([[x - cw / 2 + 0.05, y + 0.3], [x + cw / 2 - 0.05, y + 0.3], [x + cw / 2 - 0.05, y + 0.3 + (chh - 0.5) * fill], [x - cw / 2 + 0.05, y + 0.3 + (chh - 0.5) * fill]], true), col);
          glass(path([[x - cw / 2 - 0.12, y + chh + 0.05], [x - cw / 2, y + chh], [x - cw / 2, y + 0.3], [x + cw / 2, y + 0.3], [x + cw / 2, y + chh]]));
          out.push('<path d="' + path([[x - 0.75 * k, y], [x + 0.75 * k, y], [x + 0.45 * k, y + 0.3], [x - 0.45 * k, y + 0.3]], true) + '" fill="#dfe8ea" stroke="' + INK + '" stroke-width="1.5"/>');
          ticks(x + cw / 2, y + 0.5, y + chh - 0.2, 10, -1);
          req(o.label, y + chh * 0.55, o);
          break;
        }
        case 'burette': {
          var bw2 = num(o.w, 0.42) * k, bh2 = num(o.h, 6) * k, yb = y;              // "at" = the tip
          var top = yb + bh2, body0 = yb + 0.9 * k;
          if (fill) liquid(path([[x - bw2 / 2 + 0.04, body0], [x + bw2 / 2 - 0.04, body0], [x + bw2 / 2 - 0.04, body0 + (bh2 - 1.1) * fill], [x - bw2 / 2 + 0.04, body0 + (bh2 - 1.1) * fill]], true), col);
          glass(path([[x - bw2 / 2, top], [x - bw2 / 2, body0], [x - 0.08, body0 - 0.35], [x - 0.05, yb], [x + 0.05, yb], [x + 0.08, body0 - 0.35], [x + bw2 / 2, body0], [x + bw2 / 2, top]]));
          out.push('<path d="' + path([[x - 0.45, body0 - 0.18], [x + 0.45, body0 - 0.18]]) + '" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>');
          ticks(x + bw2 / 2, body0 + 0.3, top - 0.3, 12, -1);
          if (o.drop || o.drops) { var dp = P(x, yb - 0.25); out.push('<path d="M' + f2(dp[0]) + ' ' + f2(dp[1] - 4) + 'q4 6 0 8q-4 -2 0 -8Z" fill="' + col + '" stroke="#5aa9cf" stroke-width="0.8"/>'); }
          req(o.label, top - bh2 * 0.25, o);
          break;
        }
        case 'pipette': {
          var ph = num(o.h, 4.5) * k;
          glass(path([[x - 0.06, y], [x - 0.08, y + ph * 0.35], [x - 0.35, y + ph * 0.42], [x - 0.35, y + ph * 0.58], [x - 0.08, y + ph * 0.65], [x - 0.08, y + ph], [x + 0.08, y + ph], [x + 0.08, y + ph * 0.65], [x + 0.35, y + ph * 0.58], [x + 0.35, y + ph * 0.42], [x + 0.08, y + ph * 0.35], [x + 0.06, y]], true));
          line([x - 0.14, y + ph * 0.8], [x + 0.14, y + ph * 0.8], 1.2);
          req(o.label, y + ph * 0.5, o);
          break;
        }
        case 'dropper': {
          glass(path([[x - 0.05, y], [x - 0.12, y + 1.6], [x + 0.12, y + 1.6], [x + 0.05, y]], true));
          var bp = P(x, y + 2.1); out.push('<ellipse cx="' + f2(bp[0]) + '" cy="' + f2(bp[1]) + '" rx="' + f2(0.3 * sc) + '" ry="' + f2(0.5 * sc) + '" fill="#c2352b" stroke="' + INK + '" stroke-width="1.5"/>'); grow(bp[0], bp[1] - 0.5 * sc);
          req(o.label, y + 2.1, o);
          break;
        }
        case 'funnel': {
          var fw = num(o.w, 2.2) * k, fh = 1.3 * k, st = num(o.stem, 1.4) * k;
          if (o.paper) out.push('<path d="' + path([[x - fw / 2 + 0.2, y + st + fh - 0.05], [x, y + st + 0.15], [x + fw / 2 - 0.2, y + st + fh - 0.05]]) + '" fill="#fff" stroke="#8aa0a8" stroke-width="1.2"/>');
          glass(path([[x - fw / 2, y + st + fh], [x - 0.1, y + st], [x - 0.08, y], [x + 0.08, y], [x + 0.1, y + st], [x + fw / 2, y + st + fh]]), 'none');
          out[out.length - 1] = out[out.length - 1].replace('fill="none" fill-opacity="1"', 'fill="none"');
          req(o.label, y + st + fh * 0.6, o);
          break;
        }
        case 'burner': case 'bunsen': {
          out.push('<path d="' + path([[x - 0.8 * k, y], [x + 0.8 * k, y], [x + 0.6 * k, y + 0.28 * k], [x - 0.6 * k, y + 0.28 * k]], true) + '" fill="#9aa9ae" stroke="' + INK + '" stroke-width="1.5"/>');
          out.push('<path d="' + path([[x - 0.17 * k, y + 0.28 * k], [x + 0.17 * k, y + 0.28 * k], [x + 0.17 * k, y + 2.1 * k], [x - 0.17 * k, y + 2.1 * k]], true) + '" fill="#c9d3d6" stroke="' + INK + '" stroke-width="1.5"/>');
          var hole = P(x, y + 0.6 * k); out.push('<rect x="' + f2(hole[0] - 3) + '" y="' + f2(hole[1] - 5) + '" width="6" height="7" fill="' + INK + '"/>');
          if (o.flame !== false && !o.off) {
            var fb = P(x, y + 2.1 * k), fl = 1.2 * k * sc;
            out.push('<path d="M' + f2(fb[0] - 7) + ' ' + f2(fb[1]) + 'C' + f2(fb[0] - 11) + ' ' + f2(fb[1] - fl * 0.5) + ' ' + f2(fb[0] - 2) + ' ' + f2(fb[1] - fl * 0.8) + ' ' + f2(fb[0]) + ' ' + f2(fb[1] - fl) + 'C' + f2(fb[0] + 2) + ' ' + f2(fb[1] - fl * 0.8) + ' ' + f2(fb[0] + 11) + ' ' + f2(fb[1] - fl * 0.5) + ' ' + f2(fb[0] + 7) + ' ' + f2(fb[1]) + 'Z" fill="#f7b267" stroke="#e07a00" stroke-width="1"/>');
            out.push('<path d="M' + f2(fb[0] - 4) + ' ' + f2(fb[1]) + 'C' + f2(fb[0] - 6) + ' ' + f2(fb[1] - fl * 0.35) + ' ' + f2(fb[0] - 1) + ' ' + f2(fb[1] - fl * 0.5) + ' ' + f2(fb[0]) + ' ' + f2(fb[1] - fl * 0.62) + 'C' + f2(fb[0] + 1) + ' ' + f2(fb[1] - fl * 0.5) + ' ' + f2(fb[0] + 6) + ' ' + f2(fb[1] - fl * 0.35) + ' ' + f2(fb[0] + 4) + ' ' + f2(fb[1]) + 'Z" fill="#6fb3ff"/>');
            grow(fb[0], fb[1] - fl);
          }
          req(o.label, y + 1.2 * k, o);
          break;
        }
        case 'tripod': {
          var tw2 = num(o.w, 2.4) * k, tph = num(o.h, 2.6) * k;
          line([x - tw2 / 2, y + tph], [x + tw2 / 2, y + tph], 3);
          line([x - tw2 / 2 + 0.2, y + tph], [x - tw2 / 2 - 0.1, y], 2.4); line([x + tw2 / 2 - 0.2, y + tph], [x + tw2 / 2 + 0.1, y], 2.4); line([x, y + tph], [x, y + 0.2], 2, '#8aa0a8');
          if (o.gauze) { out.push('<path d="' + path([[x - tw2 / 2 - 0.1, y + tph + 0.03], [x + tw2 / 2 + 0.1, y + tph + 0.03], [x + tw2 / 2 + 0.1, y + tph + 0.12], [x - tw2 / 2 - 0.1, y + tph + 0.12]], true) + '" fill="#b7c2c6" stroke="' + INK + '" stroke-width="1"/>'); }
          req(o.label, y + tph * 0.5, o);
          break;
        }
        case 'stand': {
          req(o.label, y + num(o.h, 7) * k * 0.5, o);
          var sh = num(o.h, 7) * k, rx = x, cl = o.clamp !== undefined ? num(o.clamp, sh * 0.7) : null, arm = num(o.arm, 1.9);
          out.push('<path d="' + path([[x - 0.5, y], [x + 3.2 * k, y], [x + 3.2 * k, y + 0.3], [x - 0.5, y + 0.3]], true) + '" fill="#9aa9ae" stroke="' + INK + '" stroke-width="1.5"/>');
          out.push('<path d="' + path([[rx - 0.08, y + 0.3], [rx + 0.08, y + 0.3], [rx + 0.08, y + sh], [rx - 0.08, y + sh]], true) + '" fill="#c9d3d6" stroke="' + INK + '" stroke-width="1.4"/>');
          if (cl !== null) {
            line([rx, y + cl], [rx + arm, y + cl], 3.2, '#5f7179');
            out.push('<path d="' + path([[rx + arm - 0.1, y + cl - 0.28], [rx + arm + 0.5, y + cl - 0.28], [rx + arm + 0.5, y + cl + 0.28], [rx + arm - 0.1, y + cl + 0.28]], true) + '" fill="none" stroke="#5f7179" stroke-width="2"/>');
            var bs = P(rx, y + cl); out.push('<rect x="' + f2(bs[0] - 6) + '" y="' + f2(bs[1] - 6) + '" width="12" height="12" rx="2" fill="#5f7179"/>');
          }
          break;
        }
        case 'thermometer': {
          var tl = num(o.h, 4.5) * k, lvv = Math.max(0.05, Math.min(1, num(o.level, 0.5))), ang2 = num(o.angle, 0);
          var R2 = function (q4) { var c = Math.cos(ang2 * Math.PI / 180), s3 = Math.sin(ang2 * Math.PI / 180); return [x + q4[0] * c - q4[1] * s3, y + q4[0] * s3 + q4[1] * c]; };
          glass(path([[-0.12, 0.35], [-0.12, tl], [0.12, tl], [0.12, 0.35]].map(R2)));
          var bc = P.apply(null, R2([0, 0.22])); out.push('<circle cx="' + f2(bc[0]) + '" cy="' + f2(bc[1]) + '" r="' + f2(0.26 * sc) + '" fill="#e03a3a" stroke="' + INK + '" stroke-width="1.4"/>');
          line(R2([0, 0.4]), R2([0, 0.4 + (tl - 0.6) * lvv]), 3.2, '#e03a3a');
          req(o.label, R2([0, tl * 0.75])[1], o);
          break;
        }
        case 'condenser': {
          var L = num(o.length, 4) * k, an = num(o.angle, -20) * Math.PI / 180, ux = Math.cos(an), uy = Math.sin(an), nx = -uy, ny = ux;
          var at2 = function (s4, t4) { return [x + ux * s4 + nx * t4, y + uy * s4 + ny * t4]; };
          out.push('<path d="' + path([at2(0.4, 0.38), at2(L - 0.4, 0.38), at2(L - 0.4, -0.38), at2(0.4, -0.38)], true) + '" fill="#e3f4fb" fill-opacity="0.8" stroke="' + INK + '" stroke-width="1.6"/>');
          line(at2(0, 0.1), at2(L, 0.1), 1.6); line(at2(0, -0.1), at2(L, -0.1), 1.6);
          line(at2(L - 0.9, -0.38), at2(L - 0.9, -0.9), 1.6); line(at2(0.9, 0.38), at2(0.9, 0.9), 1.6);
          req(o.label, at2(L / 2, 0)[1], o);
          var wi = at2(L - 0.9, -1.2), wo = at2(0.9, 1.2);
          if (o.water !== false) { label(wi[0], wi[1] - 0.3, 'دخول الماء'); label(wo[0], wo[1] + 0.2, 'خروج الماء'); }
          break;
        }
        case 'tube': {
          var d = path(it.pts);
          out.push('<path d="' + d + '" fill="none" stroke="' + INK + '" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/><path d="' + d + '" fill="none" stroke="#eef7fa" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>');
          break;
        }
        case 'bubbles': {
          var bw3 = num(o.w, 1), bh3 = num(o.h, 1.2);
          for (var bi = 0; bi < 9; bi++) { var bq = P(x - bw3 / 2 + bw3 * ((bi * 37) % 9) / 9, y + bh3 * ((bi * 23) % 9) / 9); out.push('<circle cx="' + f2(bq[0]) + '" cy="' + f2(bq[1]) + '" r="' + (2.2 + bi % 3) + '" fill="#fff" stroke="#5aa9cf" stroke-width="1"/>'); grow(bq[0], bq[1]); }
          break;
        }
        case 'arrow': {
          line(it.a, it.b, 1.8, '#c2352b');
          var pa = P(it.a[0], it.a[1]), pb = P(it.b[0], it.b[1]), dx = pb[0] - pa[0], dy = pb[1] - pa[1], ll = Math.hypot(dx, dy) || 1, ux2 = dx / ll, uy2 = dy / ll;
          out.push('<path d="M' + f2(pb[0]) + ' ' + f2(pb[1]) + 'L' + f2(pb[0] - ux2 * 9 - uy2 * 4) + ' ' + f2(pb[1] - uy2 * 9 + ux2 * 4) + 'L' + f2(pb[0] - ux2 * 9 + uy2 * 4) + ' ' + f2(pb[1] - uy2 * 9 - ux2 * 4) + 'Z" fill="#c2352b"/>');
          if (it.text) label((it.a[0] + it.b[0]) / 2, (it.a[1] + it.b[1]) / 2 + 0.35, it.text);
          break;
        }
        case 'label': case 'text': {
          if (it.to) { line(it.to, it.at, 1, '#5f7179'); var tp = P(it.to[0], it.to[1]); out.push('<circle cx="' + f2(tp[0]) + '" cy="' + f2(tp[1]) + '" r="2.2" fill="#5f7179"/>'); }
          label(it.at[0], it.at[1], it.text);
          break;
        }
      }
    });
    ib = null;
    var fs = 15, font = 'Amiri', LEAD = '#5f7179';
    var gap = 0.5 * sc, lineH = fs * 1.45;
    // free labels (\label, arrows, condenser water) are centred on their point
    labels.forEach(function (l) {
      var p = P(l.x, l.y), m = measure(l.text, fs);
      grow(p[0] - m / 2 - 4, p[1] - fs); grow(p[0] + m / 2 + 4, p[1] + 5);
      out.push(run(p[0] - m / 2, p[1], l.text, fs));
    });
    // apparatus labels: above the piece when nothing is drawn over it, otherwise a callout at the side of the drawing
    var draw0 = { x0: bb.x0, x1: bb.x1, y0: bb.y0, y1: bb.y1 }, cx0 = (draw0.x0 + draw0.x1) / 2, sides = { left: [], right: [] }, tops = [];
    reqs.forEach(function (r) {
      var b = r.box, w = measure(r.text, fs), side = r.side;
      if (!b || b.x0 > b.x1) return;
      var over = boxes.some(function (o2) { return o2 !== b && o2.y0 < b.y0 - 4 && o2.y1 > b.y0 - 60 && o2.x1 > b.x0 + 2 && o2.x0 < b.x1 - 2; });   // something drawn above it
      if (side === 'auto') side = over ? ((b.x0 + b.x1) / 2 >= cx0 ? 'right' : 'left') : 'top';
      if (side === 'top' || side === 'bottom') {
        var tx = (b.x0 + b.x1) / 2, ty = side === 'top' ? b.y0 - 8 : b.y1 + fs + 6;
        var hit = tops.some(function (t) { return Math.abs(t.y - ty) < fs && Math.abs(t.x - tx) < (t.w + w) / 2 + 6; });
        if (hit) ty -= lineH;
        tops.push({ x: tx, y: ty, w: w });
        grow(tx - w / 2, ty - fs); grow(tx + w / 2, ty + 5);
        out.push(run(tx - w / 2, ty, r.text, fs));
        return;
      }
      sides[side === 'left' ? 'left' : 'right'].push({ r: r, w: w, ay: P(0, r.ay)[1], ax: side === 'left' ? b.x0 : b.x1 });
    });
    ['left', 'right'].forEach(function (sd) {
      var L = sides[sd].sort(function (a, b) { return a.ay - b.ay; }), last = -1e9;
      L.forEach(function (c) {
        var ty = Math.max(c.ay, last + lineH); last = ty;
        var tx = sd === 'right' ? draw0.x1 + gap : draw0.x0 - gap - c.w;
        var ex = sd === 'right' ? tx - 5 : tx + c.w + 5;
        out.push('<path d="M' + f2(c.ax) + ' ' + f2(c.ay) + 'L' + f2(ex) + ' ' + f2(ty - fs * 0.3) + '" stroke="' + LEAD + '" stroke-width="1" fill="none"/><circle cx="' + f2(c.ax) + '" cy="' + f2(c.ay) + '" r="2" fill="' + LEAD + '"/>');
        grow(tx, ty - fs); grow(tx + c.w, ty + 5);
        out.push(run(tx, ty, c.r.text, fs));
      });
    });
    if (bb.x0 > bb.x1) { bb = { x0: 0, y0: 0, x1: 100, y1: 100 }; }
    var pad = 14, W = bb.x1 - bb.x0 + 2 * pad, H = bb.y1 - bb.y0 + 2 * pad;
    return (global.Raster ? Raster.fontCss([font], true) : Promise.resolve('')).then(function (css) {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + f2(W) + '" height="' + f2(H) + '" viewBox="' + f2(bb.x0 - pad) + ' ' + f2(bb.y0 - pad) + ' ' + f2(W) + ' ' + f2(H) + '"><defs><style>' + css + ' .lb{font-family:"' + font + '","Times New Roman",serif;font-size:' + fs + 'px;fill:' + INK + ';font-weight:700}</style></defs>' +
        '<rect x="' + f2(bb.x0 - pad) + '" y="' + f2(bb.y0 - pad) + '" width="' + f2(W) + '" height="' + f2(H) + '" fill="#fff"/>' + out.join('') + '</svg>';
      return { svg: svg, w: W, h: H };
    });
  }

  function serialize(d) { return d.code || '\\begin{lab}\n\\end{lab}'; }

  var TEMPLATES = {
    titration: { t: 'المعايرة (سحاحة ودورق)|Titration', code: '\\begin{lab}\n  \\stand[h=8, clamp=6.4]{(-2.2,0)}\n  \\burette[fill=0.75, color=colorless, h=6, drops, label=محلول قياسي]{(0,3.6)}\n  \\flask[fill=0.35, color=pink, label=المحلول المجهول + دليل]{(0,0)}\n\\end{lab}' },
    filtration: { t: 'الترشيح|Filtration', code: '\\begin{lab}\n  \\stand[h=6, clamp=4.2]{(-2.2,0)}\n  \\funnel[paper, label=ورقة ترشيح]{(0,2.5)}\n  \\beaker[fill=0.3, color=colorless, label=الراشح]{(0,0)}\n\\end{lab}' },
    heating: { t: 'التسخين (موقد وحامل ثلاثي)|Heating', code: '\\begin{lab}\n  \\burner[label=موقد بنزن]{(0,0)}\n  \\tripod[gauze, h=3.3]{(0,0)}\n  \\beaker[fill=0.5, bubbles, label=ماء يغلي]{(0,3.45)}\n  \\thermometer[level=0.8, h=4]{(0.35,3.8)}\n\\end{lab}' },
    distillation: { t: 'التقطير البسيط|Simple distillation', code: '\\begin{lab}\n  \\stand[h=8, clamp=6.2, arm=1.6]{(-1.8,0)}\n  \\burner{(0,0)}\n  \\roundflask[fill=0.5, label=خليط]{(0,3.6)}\n  \\thermometer[level=0.5, h=2.6, label=ترمومتر]{(0,6.3)}\n  \\condenser[angle=-25, length=5.5]{(0.4,6.4)}\n  \\tube{(5.38,4.1) (5.6,3.3)}\n  \\flask[fill=0.3, label=المقطَّر]{(5.6,0)}\n\\end{lab}' },
    reaction: { t: 'تفاعل في أنبوب اختبار|Test-tube reaction', code: '\\begin{lab}\n  \\testtube[fill=0.4, color=blue, ppt, label=راسب]{(0,0)}\n  \\dropper[label=محلول NaOH]{(0,3.6)}\n  \\testtube[fill=0.5, color=yellow, bubbles, angle=0]{(2,0)}\n\\end{lab}' },
    measure: { t: 'أدوات القياس|Measuring glassware', code: '\\begin{lab}\n  \\cylinder[fill=0.6, label=مخبار مدرج]{(0,0)}\n  \\beaker[fill=0.4, label=كأس]{(2.3,0)}\n  \\pipette[label=ماصة]{(4.3,0.2)}\n  \\flask[fill=0.3, label=دورق مخروطي]{(6.3,0)}\n\\end{lab}' }
  };

  global.LabRender = { parse: parse, render: function (d) { if (d.code && !d.items) d = Object.assign(parse('', (String(d.code).match(/\\begin\s*\{lab\}\s*(?:\[[^\]]*\])?([\s\S]*?)\\end\s*\{lab\}/) || [0, d.code])[1]), { code: d.code }); return render(d); }, serialize: serialize, TEMPLATES: TEMPLATES };
})(window);
