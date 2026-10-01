/*
 * PhysicsRender — mechanics / optics / electricity diagrams from a LaTeX-like description.
 * The figure's data is its source code: { v:1, code:'\\begin{physics}…\\end{physics}' }.
 *
 * \begin{physics}[scale=1, digits=eastern]
 *   \ground{(-1,0)}{(9,0)}                          \wall{(0,0)}{(0,4)}     \ceiling{(2,5)}{(7,5)}
 *   \incline[angle=30, base=6, name=م]{(0,0)}         % rises to the right (use flip for the other side)
 *   \block[on=م, at=0.55, w=1.4, h=0.9, name=ج]{ك}   % block on the incline (at = fraction of its length)
 *   \block[at=(3,0), w=1.6, h=1]{ك}                   % block on the ground (bottom-centre)
 *   \block[hang=(6,3), w=1, h=1]{ك₂}                  % hanging block (top-centre)
 *   \ball[r=0.4, name=ك]{(2,3)}
 *   \force[from=ج, angle=-90, len=2, color=red]{و}   % angle in degrees (0 = right, 90 = up)
 *   \force[from=ج, dir=normal, len=1.6]{ر}            % dir = normal | along | against | up | down | left | right
 *   \force[at=(1,1), to=(3,2)]{ق}                      % from a point to a point
 *   \force[from=ج, angle=180, pos=above]{ق}           % label position: end (default) | above | below | left | right | start
 *   \rope{(1,2) (5,4) (6,3)}   \pulley[r=0.5]{(6,4)}   \spring[coils=8]{(0,1)}{(3,1)}
 *   \arc[label=θ, r=0.9]{(0,0)}{0}{30}                % centre, start angle, end angle
 *   \dim[label=ف, offset=0.5]{(0,0)}{(6,0)}           % dimension line with arrows
 *   \projectile[v=20, angle=45, g=9.8, marks]{(0,0)}
 *   \lens[type=convex, f=2, object=5, height=1.2]{(0,0)}   \mirror[type=concave, f=2, object=5]{(0,0)}
 *   \charge[q=+]{(0,0)}   \field[angle=0, len=6, n=5]{(0,0)}{(0,3)}
 *   \pivot{(3,0)}   \beam{(0,0.3)}{(6,0.3)}   \point[label=أ]{(2,2)}   \text{(3,4)}{نص}
 *   \axes[x=س, y=ص, len=2]{(0,0)}
 *   \motion[type=vt|xt|at, w=7, h=4, area, slopes, names={أ,ب,جـ}]{(0,0) (2,10) (5,10) (7,0)}    % motion graphs
 *   \wave[amplitude=1, wavelength=4, length=10, type=long]{(0,0)}
 * \end{physics}
 */
(function (global) {
  'use strict';
  var S = 37.7953, D2R = Math.PI / 180;
  var INK = '#1b2a30';
  var V = {
    sub: function (a, b) { return [a[0] - b[0], a[1] - b[1]]; }, add: function (a, b) { return [a[0] + b[0], a[1] + b[1]]; },
    mul: function (a, k) { return [a[0] * k, a[1] * k]; }, len: function (a) { return Math.hypot(a[0], a[1]); },
    norm: function (a) { var l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; }, perp: function (a) { return [-a[1], a[0]]; },
    dir: function (deg) { return [Math.cos(deg * D2R), Math.sin(deg * D2R)]; }, ang: function (a) { return Math.atan2(a[1], a[0]) / D2R; },
    rot: function (a, deg) { var c = Math.cos(deg * D2R), s = Math.sin(deg * D2R); return [a[0] * c - a[1] * s, a[0] * s + a[1] * c]; }
  };
  var COLORS = { force: '#c2352b', weight: '#c2352b' };

  function pt(v) { var p = Mk.point(v); if (!isFinite(p[0]) || !isFinite(p[1])) throw new Error('إحداثيات غير صحيحة: ' + v); return p; }
  function f2(v) { return (+v).toFixed(2); }

  // ------------------------------------------------------------ parse code -> scene
  function scene(code) {
    var m = String(code || '').match(/\\begin\s*\{physics\}\s*(\[[^\]]*\])?([\s\S]*?)\\end\s*\{physics\}/);
    var opts = m && m[1] ? Mk.options(m[1].slice(1, -1)) : {}, body = m ? m[2] : String(code || '');
    var sc = { opt: opts, items: [], named: {} };
    var lastBody = null;
    function bodyRef(name) {
      if (!name) return lastBody;
      var b = sc.named[name];
      if (!b) throw new Error('لا يوجد جسم باسم «' + name + '»');
      return b;
    }
    Mk.commands(body).forEach(function (c) {
      var n = c.name, a = c.args, o = c.opt, it = null;
      try {
        if (n === 'ground' || n === 'wall' || n === 'ceiling' || n === 'surface') it = { t: 'surface', kind: n, a: pt(a[0]), b: pt(a[1]), flip: !!o.flip };
        else if (n === 'incline') {
          var at = pt(a[0] || '(0,0)'), th = Mk.evalNum(o.angle, 30), base = Mk.evalNum(o.base, 6), flip = !!(o.flip || o.left);
          var A = at, B = V.add(at, [flip ? -base : base, 0]), C = V.add(B, [0, base * Math.tan(th * D2R)]);
          it = { t: 'incline', A: A, B: B, C: C, angle: th, flip: flip, label: o.label !== undefined ? o.label : 'θ', showAngle: Mk.bool(o, 'showangle', true), hatch: Mk.bool(o, 'hatch', true) };
          it.surf = { from: A, to: C, dir: V.norm(V.sub(C, A)) };
          if (o.name) sc.named[o.name] = it;
          sc.lastIncline = it;
        }
        else if (n === 'block' || n === 'box' || n === 'mass') {
          var w = Mk.evalNum(o.w || o.width, 1.4), h = Mk.evalNum(o.h || o.height, 1), rot = Mk.evalNum(o.rotate, 0), center;
          if (o.on) {
            var inc = o.on === true ? sc.lastIncline : sc.named[o.on];
            if (!inc || !inc.surf) throw new Error('لا يوجد مستوى مائل باسم «' + o.on + '»');
            var t = Mk.evalNum(o.at, 0.5), P = V.add(inc.surf.from, V.mul(V.sub(inc.surf.to, inc.surf.from), t));
            rot = V.ang(inc.surf.dir); if (inc.flip) rot = rot - 180;
            var nrm = V.dir(rot + 90);
            center = V.add(P, V.mul(nrm, h / 2));
            it = { t: 'block', c: center, w: w, h: h, rot: rot, surfDir: V.dir(rot), normal: nrm };
          } else if (o.hang) {
            var hp = pt(o.hang); center = V.add(hp, [0, -h / 2]);
            it = { t: 'block', c: center, w: w, h: h, rot: 0, surfDir: [1, 0], normal: [0, 1], hang: hp };
          } else {
            var bp = o.at ? pt(o.at) : (c.coords[0] ? pt(c.coords[0]) : [0, 0]);
            center = V.add(bp, V.rot([0, h / 2], rot));
            it = { t: 'block', c: center, w: w, h: h, rot: rot, surfDir: V.dir(rot), normal: V.dir(rot + 90) };
          }
          it.label = a[0] !== undefined ? a[0] : ''; it.fill = Mk.color(o.fill || o.color, '#dff3f1'); it.stroke = Mk.color(o.stroke, INK);
          if (o.name) sc.named[o.name] = it;
          lastBody = it;
        }
        else if (n === 'ball' || n === 'particle') {
          var bc = pt(a[0] || c.coords[0] || '(0,0)');
          it = { t: 'ball', c: bc, r: Mk.evalNum(o.r, n === 'particle' ? 0.12 : 0.4), label: o.label || '', fill: Mk.color(o.fill || o.color, n === 'particle' ? INK : '#dff3f1'), normal: [0, 1], surfDir: [1, 0], w: 0, h: 0 };
          if (o.name) sc.named[o.name] = it;
          lastBody = it;
        }
        else if (n === 'force' || n === 'vector' || n === 'velocity' || n === 'acc') {
          var start, dir, L = Mk.evalNum(o.len || o.length, 1.8), end;
          var ref = o.from && o.from !== true && !/^\(/.test(o.from) ? String(o.from).split('.') : null;
          var body2 = ref ? bodyRef(ref[0]) : (o.at || o.to || c.coords.length ? null : lastBody);
          if (o.at || (o.from && /^\(/.test(o.from))) start = pt(o.at || o.from);
          else if (a.length > 1 && /^\s*\(/.test(a[0])) { start = pt(a[0]); }
          else if (body2) start = anchor(body2, ref ? ref[1] : o.point);
          else start = [0, 0];
          var rel = o.dir;
          if (o.to) { end = pt(o.to); dir = V.norm(V.sub(end, start)); L = V.len(V.sub(end, start)); }
          else if (a.length > 1 && /^\s*\(/.test(a[1])) { end = pt(a[1]); dir = V.norm(V.sub(end, start)); L = V.len(V.sub(end, start)); }
          else {
            var b3 = body2 || lastBody;
            if (rel === 'normal' && b3) dir = b3.normal;
            else if ((rel === 'along' || rel === 'up-slope') && b3) dir = b3.surfDir;
            else if ((rel === 'against' || rel === 'down-slope') && b3) dir = V.mul(b3.surfDir, -1);
            else if (rel === 'up') dir = [0, 1]; else if (rel === 'down') dir = [0, -1];
            else if (rel === 'left') dir = [-1, 0]; else if (rel === 'right') dir = [1, 0];
            else dir = V.dir(Mk.evalNum(o.angle, n === 'force' && !o.angle ? -90 : 0));
            if (o.angle !== undefined && b3 && /^(normal|along|against)$/.test(rel || '')) dir = V.rot(dir, Mk.evalNum(o.angle, 0));
            end = V.add(start, V.mul(dir, L));
          }
          if (o.tail) start = V.add(start, V.mul(dir, -Mk.evalNum(o.tail, 0)));
          var dflt = n === 'velocity' ? '#1f5fbf' : n === 'acc' ? '#2e8b3a' : n === 'vector' ? '#1f5fbf' : '#c2352b';
          it = { t: 'arrow', a: start, b: end, color: Mk.color(o.color, dflt), label: a.length > 1 && /^\s*\(/.test(a[0]) ? (a[2] || '') : (a[0] || ''), dash: !!o.dashed,
            w: Mk.evalNum(o.width, n === 'velocity' || n === 'acc' ? 2 : 2.4), pos: o.pos, double: n === 'acc' };
        }
        else if (n === 'rope' || n === 'string' || n === 'path' || n === 'curve') {
          var pts = []; var re = /\(([^()]*)\)/g, mm, src = a.join(' ') + ' ' + c.coords.map(function (x) { return '(' + x + ')'; }).join(' ');
          while ((mm = re.exec(src))) pts.push(pt(mm[1]));
          it = { t: 'poly', pts: pts, color: Mk.color(o.color, n === 'rope' || n === 'string' ? '#6b4f2a' : INK), w: Mk.evalNum(o.width, n === 'rope' ? 1.6 : 2), dash: !!o.dashed, arrow: !!o.arrow, smooth: n === 'curve' };
        }
        else if (n === 'pulley') it = { t: 'pulley', c: pt(a[0] || c.coords[0]), r: Mk.evalNum(o.r, 0.5), mount: o.mount || (o.nomount ? 'none' : 'ceiling'), label: o.label || '' };
        else if (n === 'spring') it = { t: 'spring', a: pt(a[0]), b: pt(a[1]), coils: Mk.evalNum(o.coils, 8) | 0, width: Mk.evalNum(o.width, 0.35), label: o.label || '' };
        else if (n === 'arc' || n === 'angle') it = { t: 'arc', c: pt(a[0]), from: Mk.evalNum(a[1], 0), to: Mk.evalNum(a[2], 30), r: Mk.evalNum(o.r, 0.9), label: o.label !== undefined ? o.label : '', color: Mk.color(o.color, '#0e9f9a') };
        else if (n === 'dim' || n === 'dimension') it = { t: 'dim', a: pt(a[0]), b: pt(a[1]), label: o.label || '', off: Mk.evalNum(o.offset, 0.45) };
        else if (n === 'projectile') {
          var p0 = pt(a[0] || '(0,0)'), v0 = Mk.evalNum(o.v, 20), th2 = Mk.evalNum(o.angle, 45), g = Mk.evalNum(o.g, 9.8), h0 = Mk.evalNum(o.h, 0);
          var vx = v0 * Math.cos(th2 * D2R), vy = v0 * Math.sin(th2 * D2R);
          var T = (vy + Math.sqrt(vy * vy + 2 * g * h0)) / g, R = vx * T, H = h0 + vy * vy / (2 * g);
          var k = o.scale ? Mk.evalNum(o.scale, 0.1) : Math.min(9 / Math.max(R, 1e-6), 5 / Math.max(H, 1e-6));
          var pp = [];
          for (var i = 0; i <= 80; i++) { var tt = T * i / 80; pp.push([p0[0] + vx * tt * k, p0[1] + (h0 + vy * tt - g * tt * tt / 2) * k - h0 * k]); }
          it = { t: 'projectile', p0: p0, pts: pp, k: k, R: R, H: H, T: T, v0: v0, th: th2, h0: h0, marks: !!o.marks, showV: Mk.bool(o, 'velocity', true), labels: Mk.bool(o, 'labels', true) };
          sc.info = { range: R, height: H, time: T };
        }
        else if (n === 'lens' || n === 'mirror') it = optics(n, pt(a[0] || '(0,0)'), o);
        else if (n === 'charge') it = { t: 'charge', c: pt(a[0] || c.coords[0]), q: String(o.q || '+'), r: Mk.evalNum(o.r, 0.35), label: o.label || '' };
        else if (n === 'field') it = { t: 'field', a: pt(a[0]), b: pt(a[1]), angle: Mk.evalNum(o.angle, 0), len: Mk.evalNum(o.len, 5), n: Mk.evalNum(o.n, 5) | 0, label: o.label || '', color: Mk.color(o.color, '#1f5fbf') };
        else if (n === 'plate') it = { t: 'plate', a: pt(a[0]), b: pt(a[1]), sign: o.sign || '' };
        else if (n === 'pivot' || n === 'fulcrum') it = { t: 'pivot', c: pt(a[0] || c.coords[0]), size: Mk.evalNum(o.size, 0.5) };
        else if (n === 'beam' || n === 'rod' || n === 'bar') it = { t: 'beam', a: pt(a[0]), b: pt(a[1]), th: Mk.evalNum(o.thickness, 0.22), fill: Mk.color(o.fill, '#e7d3b0') };
        else if (n === 'point') it = { t: 'point', c: pt(a[0] || c.coords[0]), label: o.label || a[1] || '', pos: o.pos };
        else if (n === 'text' || n === 'label') it = { t: 'text', c: pt(a[0]), text: a[1] || '', color: Mk.color(o.color, INK), size: Mk.evalNum(o.size, 1) };
        else if (n === 'motion' || n === 'vt' || n === 'xt') {
          // motion graph: \motion[type=vt, w=7, h=4, area, slopes]{(0,0) (2,10) (5,10) (7,0)}
          var kind = n === 'motion' ? String(o.type || 'vt').toLowerCase() : n, raw = a[0] || '', mm, pts = [], re2 = /\(([^()]*)\)/g;
          while ((mm = re2.exec(raw))) pts.push(pt(mm[1]));
          if (pts.length < 2) throw new Error('\\motion يحتاج نقطتين على الأقل مثل {(0,0) (4,20)}');
          var XL = { vt: 'ز (ث)', xt: 'ز (ث)', at: 'ز (ث)' }, YL = { vt: 'ع (م/ث)', xt: 'ف (م)', at: 'ت (م/ث²)' };
          it = { t: 'motion', at: pt(o.at || '(0,0)'), pts: pts, w: Mk.evalNum(o.w || o.width, 7), h: Mk.evalNum(o.h || o.height, 4), kind: kind,
            xl: o.xlabel !== undefined ? o.xlabel : XL[kind] || 'ز', yl: o.ylabel !== undefined ? o.ylabel : YL[kind] || 'ص',
            area: !!(o.area || o.distance), slopes: !!(o.slopes || o.slope || o.acc), names: o.names ? Mk.list(o.names) : null, color: Mk.color(o.color, '#1f5fbf'), smooth: !!o.smooth };
        }
        else if (n === 'wave') {
          it = { t: 'wave', at: pt(a[0] || '(0,0)'), A: Mk.evalNum(o.amplitude || o.a, 1), lam: Mk.evalNum(o.wavelength || o.lambda, 4), len: Mk.evalNum(o.length, 10),
            phase: Mk.evalNum(o.phase, 0), labels: o.labels !== false && !o.nolabels, color: Mk.color(o.color, '#0e9f9a'), kind: /long|طول/.test(String(o.type || '')) ? 'long' : 'trans' };
        }
        else if (n === 'axes') it = { t: 'axes', c: pt(a[0] || '(0,0)'), len: Mk.evalNum(o.len, 2), x: o.x !== undefined ? o.x : 'س', y: o.y !== undefined ? o.y : 'ص', angle: Mk.evalNum(o.angle, 0) };
        else if (n === 'line' || n === 'dashed') { var lp = [pt(a[0]), pt(a[1])]; it = { t: 'poly', pts: lp, color: Mk.color(o.color, '#6b7c85'), w: Mk.evalNum(o.width, 1.2), dash: n === 'dashed' || !!o.dashed }; }
        else if (n === 'circle') it = { t: 'circle', c: pt(a[0]), r: Mk.evalNum(o.r, 1), color: Mk.color(o.color, INK), dash: !!o.dashed, fill: o.fill ? Mk.color(o.fill) : 'none' };
      } catch (e) { throw new Error(e.message + ' — السطر ' + c.line); }
      if (it) sc.items.push(it);
    });
    if (!sc.items.length) throw new Error('الرسم فارغ: ابدأ بـ \\ground أو \\incline أو \\block …');
    return sc;
  }
  function anchor(b, where) {
    if (b.t === 'ball') {
      if (where === 'top') return V.add(b.c, [0, b.r]); if (where === 'bottom') return V.add(b.c, [0, -b.r]);
      return b.c;
    }
    var u = V.dir(b.rot || 0), nn = V.dir((b.rot || 0) + 90);
    if (where === 'top') return V.add(b.c, V.mul(nn, b.h / 2));
    if (where === 'bottom') return V.add(b.c, V.mul(nn, -b.h / 2));
    if (where === 'left') return V.add(b.c, V.mul(u, -b.w / 2));
    if (where === 'right') return V.add(b.c, V.mul(u, b.w / 2));
    return b.c;
  }

  // thin lens / spherical mirror with the three principal rays
  function optics(kind, O, o) {
    var type = String(o.type || (kind === 'lens' ? 'convex' : 'concave'));
    var conv = /convex|محدب/.test(type), f = Math.abs(Mk.evalNum(o.f, 2)), u = Math.abs(Mk.evalNum(o.object, 2.5 * f)), hO = Mk.evalNum(o.height, 1.2);
    // converging element: convex lens, concave mirror
    var converging = kind === 'lens' ? conv : !conv;
    var F = converging ? f : -f;
    var v = u === F ? Infinity : (u * F) / (u - F);                 // real if v > 0
    var m = -v / u, hI = m * hO;
    return { t: kind, O: O, type: type, converging: converging, f: f, u: u, v: v, hO: hO, hI: hI, real: v > 0 && isFinite(v),
      size: Mk.evalNum(o.size, Math.max(2.4, Math.abs(hO) * 2.2, Math.abs(isFinite(hI) ? hI : 0) * 1.3)), rays: Mk.bool(o, 'rays', true), labels: Mk.bool(o, 'labels', true) };
  }

  // ------------------------------------------------------------ render
  function render(data) {
    var code = typeof data === 'string' ? data : (data && data.code) || '';
    var sc = scene(code);
    var o = sc.opt, SC = S * Mk.evalNum(o.scale, 1);
    var eastern = /east|هند/.test(String(o.digits || '')), ar = !/en|lat/.test(String(o.notation || 'ar'));
    var fs = Mk.evalNum(o.fontsize, 12) * 96 / 72;
    var P = function (p) { return [p[0] * SC, -p[1] * SC]; };
    var body = [], top = [], texts = [], mathLabels = [];
    var bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    var grow = function (q, pad) { pad = pad || 0; bb.x0 = Math.min(bb.x0, q[0] - pad); bb.y0 = Math.min(bb.y0, q[1] - pad); bb.x1 = Math.max(bb.x1, q[0] + pad); bb.y1 = Math.max(bb.y1, q[1] + pad); };
    var L = function (a, b, col, w, dash) { grow(a); grow(b); return '<path d="M' + f2(a[0]) + ' ' + f2(a[1]) + 'L' + f2(b[0]) + ' ' + f2(b[1]) + '" stroke="' + (col || INK) + '" stroke-width="' + (w || 2) + '"' + (dash ? ' stroke-dasharray="6 4"' : '') + ' stroke-linecap="round" fill="none"/>'; };
    var label = function (pos, text, col, anchorDir) {
      if (text === undefined || text === null || text === '') return;
      var t = String(text);
      var isMath = /\$|\\|\^|_/.test(t);
      var p = anchorDir ? V.add(pos, V.mul(anchorDir, fs * 0.9)) : pos;
      if (isMath && global.RenderHost) { mathLabels.push({ p: p, tex: t.replace(/^\$|\$$/g, ''), color: col || INK }); grow(p, fs * 1.4); return; }
      texts.push({ x: p[0], y: p[1] + fs * 0.35, t: Raster.digits(t, eastern), color: col || INK });
      grow(p, fs * (0.5 + t.length * 0.3));
    };
    var arrowHead = function (tip, dir, col, size) {
      size = size || 11;
      var base = V.sub(tip, V.mul(dir, size)), pp = V.mul(V.perp(dir), size * 0.42);
      return '<path d="M' + f2(tip[0]) + ' ' + f2(tip[1]) + 'L' + f2(base[0] + pp[0]) + ' ' + f2(base[1] + pp[1]) + 'L' + f2(base[0] - pp[0]) + ' ' + f2(base[1] - pp[1]) + 'Z" fill="' + col + '"/>';
    };
    var hatch = function (a, b, side) {                  // hatch marks on one side of segment a→b (screen coords)
      var u = V.norm(V.sub(b, a)), n = V.mul(V.perp(u), side), len = V.len(V.sub(b, a)), out = '';
      for (var s = 6; s < len; s += 9) { var q = V.add(a, V.mul(u, s)); var q2 = V.add(V.add(q, V.mul(n, 8)), V.mul(u, -6)); out += 'M' + f2(q[0]) + ' ' + f2(q[1]) + 'L' + f2(q2[0]) + ' ' + f2(q2[1]); grow(q2); }
      return '<path d="' + out + '" stroke="#6b7c85" stroke-width="1.1"/>';
    };

    sc.items.forEach(function (it) {
      if (it.t === 'surface') {
        var a = P(it.a), b = P(it.b);
        var side = it.kind === 'ceiling' ? -1 : it.kind === 'wall' ? (it.flip ? -1 : 1) : 1;
        // screen y is down: ground hatch goes below (positive y), ceiling above
        var u = V.norm(V.sub(b, a)), nrm = V.perp(u);
        var want = it.kind === 'ceiling' ? [0, -1] : it.kind === 'wall' ? [it.flip ? 1 : -1, 0] : [0, 1];
        side = (nrm[0] * want[0] + nrm[1] * want[1]) >= 0 ? 1 : -1;
        body.push(L(a, b, INK, 2.2) + hatch(a, b, side));
      } else if (it.t === 'incline') {
        var A = P(it.A), B = P(it.B), C = P(it.C);
        grow(A); grow(B); grow(C);
        body.push('<polygon points="' + [A, B, C].map(function (q) { return f2(q[0]) + ',' + f2(q[1]); }).join(' ') + '" fill="#eef4f5" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>');
        if (it.hatch) body.push(hatch(it.flip ? B : A, it.flip ? A : B, it.flip ? -1 : 1));
        // right-angle mark at B
        var s2 = 10, ub = V.norm(V.sub(A, B)), vb = V.norm(V.sub(C, B));
        var q1 = V.add(B, V.mul(ub, s2)), q3 = V.add(B, V.mul(vb, s2)), q2 = V.add(q1, V.mul(vb, s2));
        body.push('<path d="M' + f2(q1[0]) + ' ' + f2(q1[1]) + 'L' + f2(q2[0]) + ' ' + f2(q2[1]) + 'L' + f2(q3[0]) + ' ' + f2(q3[1]) + '" fill="none" stroke="' + INK + '" stroke-width="1.2"/>');
        if (it.showAngle) {
          var r = 34, d1 = V.norm(V.sub(B, A)), d2 = V.norm(V.sub(C, A));
          var e1 = V.add(A, V.mul(d1, r)), e2 = V.add(A, V.mul(d2, r)), sweep = (d1[0] * d2[1] - d1[1] * d2[0]) > 0 ? 1 : 0;
          body.push('<path d="M' + f2(e1[0]) + ' ' + f2(e1[1]) + 'A' + r + ' ' + r + ' 0 0 ' + sweep + ' ' + f2(e2[0]) + ' ' + f2(e2[1]) + '" fill="none" stroke="#0e9f9a" stroke-width="1.6"/>');
          if (it.label) label(V.add(A, V.mul(V.norm(V.add(d1, d2)), r + fs * 0.9)), it.label, '#0e9f9a');
        }
      } else if (it.t === 'block') {
        var cc = P(it.c), rot = -(it.rot || 0);
        var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (k) { return V.add(cc, V.rot([k[0] * it.w * SC / 2, k[1] * it.h * SC / 2], rot)); });
        corners.forEach(function (q) { grow(q); });
        if (it.hang) body.push(L(P(it.hang), V.add(cc, V.rot([0, -it.h * SC / 2], rot)), '#6b4f2a', 1.6));
        body.push('<polygon points="' + corners.map(function (q) { return f2(q[0]) + ',' + f2(q[1]); }).join(' ') + '" fill="' + it.fill + '" stroke="' + it.stroke + '" stroke-width="2" stroke-linejoin="round"/>');
        if (it.label) {
          // arrows starting on the block would cover its name — put the name where it is farthest from them
          var segs = sc.items.filter(function (q) { return q.t === 'arrow' && q.a && q.b; }).map(function (q) { return [P(q.a), P(q.b)]; });
          var dist = function (pnt) {
            var m = Infinity;
            segs.forEach(function (sg) {
              var ab = V.sub(sg[1], sg[0]), l2 = ab[0] * ab[0] + ab[1] * ab[1] || 1;
              var t = Math.max(0, Math.min(1, ((pnt[0] - sg[0][0]) * ab[0] + (pnt[1] - sg[0][1]) * ab[1]) / l2));
              m = Math.min(m, V.len(V.sub(pnt, V.add(sg[0], V.mul(ab, t)))));
            });
            return m;
          };
          var need = Math.max(fs * 0.7, String(it.label).replace(/[$_{}^\\]|mathrm/g, '').length * fs * 0.34 + 4);
          var lp = cc, bestD = dist(cc);
          if (bestD < need) {
            [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (k) {
              var q = V.add(cc, V.rot([k[0] * it.w * SC * 0.3, k[1] * it.h * SC * 0.3], rot)), d = dist(q);
              if (d > bestD + 0.5) { bestD = d; lp = q; }
            });
            if (bestD < need) {   // small block: write the name just outside, beside it
              [[-1, 0], [1, 0]].forEach(function (k) {
                var q = V.add(cc, V.rot([k[0] * (it.w * SC / 2 + fs * 0.75), 0], rot)), d = dist(q);
                if (d > bestD + 0.5) { bestD = d; lp = q; }
              });
            }
          }
          label(lp, it.label, INK);
        }
      } else if (it.t === 'ball') {
        var bc = P(it.c); grow(bc, it.r * SC);
        body.push('<circle cx="' + f2(bc[0]) + '" cy="' + f2(bc[1]) + '" r="' + f2(it.r * SC) + '" fill="' + it.fill + '" stroke="' + INK + '" stroke-width="' + (it.r < 0.2 ? 1 : 2) + '"/>');
        if (it.label) label(V.add(bc, [0, -it.r * SC - fs * 0.6]), it.label, INK);
      } else if (it.t === 'arrow') {
        var a2 = P(it.a), b2 = P(it.b), dir = V.norm(V.sub(b2, a2));
        var tipBack = V.sub(b2, V.mul(dir, 6));
        top.push(L(a2, tipBack, it.color, it.w, it.dash) + arrowHead(b2, dir, it.color, it.w > 2.2 ? 12 : 10) + (it.double ? arrowHead(V.sub(b2, V.mul(dir, 8)), dir, it.color, 10) : ''));
        top.push('<circle cx="' + f2(a2[0]) + '" cy="' + f2(a2[1]) + '" r="2.6" fill="' + it.color + '"/>');
        if (it.label) {
          var side2 = V.perp(dir); if (side2[1] > 0 || (Math.abs(side2[1]) < 1e-6 && side2[0] < 0)) side2 = V.mul(side2, -1);
          var lpos = String(it.pos || 'end'), lp;
          if (/^(above|side|left|right|below)$/.test(lpos)) {
            // beside the arrow (for arrows that lie along a line, a spring or a radius)
            var sd = lpos === 'below' ? V.mul(side2, -1) : lpos === 'left' ? (side2[0] < 0 ? side2 : V.mul(side2, -1)) : lpos === 'right' ? (side2[0] > 0 ? side2 : V.mul(side2, -1)) : side2;
            var hw = String(it.label).replace(/[$_{}^\\]/g, '').length * fs * 0.27;
            lp = V.add(V.add(a2, V.mul(V.sub(b2, a2), 0.62)), V.mul(sd, fs * 0.75 + Math.abs(sd[0]) * hw));
          } else if (lpos === 'start') lp = V.sub(a2, V.mul(dir, fs * 0.9));
          else lp = V.add(V.add(b2, V.mul(dir, fs * 0.9)), V.mul(side2, fs * 0.2));
          label(lp, it.label, it.color);
        }
      } else if (it.t === 'poly') {
        var pts = it.pts.map(P); pts.forEach(function (q) { grow(q); });
        var d = it.smooth && pts.length > 2 ? smoothPath(pts) : pts.map(function (q, i) { return (i ? 'L' : 'M') + f2(q[0]) + ' ' + f2(q[1]); }).join('');
        body.push('<path d="' + d + '" stroke="' + it.color + '" stroke-width="' + it.w + '" fill="none"' + (it.dash ? ' stroke-dasharray="6 4"' : '') + ' stroke-linejoin="round" stroke-linecap="round"/>');
        if (it.arrow && pts.length > 1) body.push(arrowHead(pts[pts.length - 1], V.norm(V.sub(pts[pts.length - 1], pts[pts.length - 2])), it.color, 10));
      } else if (it.t === 'pulley') {
        var pc = P(it.c), pr = it.r * SC; grow(pc, pr + 4);
        if (it.mount === 'ceiling') {
          var topY = pc[1] - pr - 22;
          body.push(L(pc, [pc[0], topY], INK, 2) + L([pc[0] - 26, topY], [pc[0] + 26, topY], INK, 2.2) + hatch([pc[0] - 26, topY], [pc[0] + 26, topY], -1));
        }
        body.push('<circle cx="' + f2(pc[0]) + '" cy="' + f2(pc[1]) + '" r="' + f2(pr) + '" fill="#e8eef0" stroke="' + INK + '" stroke-width="2"/><circle cx="' + f2(pc[0]) + '" cy="' + f2(pc[1]) + '" r="3" fill="' + INK + '"/>');
        if (it.label) label(V.add(pc, [pr + fs, 0]), it.label);
      } else if (it.t === 'spring') {
        var sa = P(it.a), sb = P(it.b), su = V.norm(V.sub(sb, sa)), sn = V.perp(su), slen = V.len(V.sub(sb, sa));
        var lead = Math.min(14, slen * 0.12), wv = it.width * SC, path = 'M' + f2(sa[0]) + ' ' + f2(sa[1]);
        var p1 = V.add(sa, V.mul(su, lead)); path += 'L' + f2(p1[0]) + ' ' + f2(p1[1]);
        var n2 = it.coils * 2, seg = (slen - 2 * lead) / n2;
        for (var k2 = 1; k2 <= n2; k2++) { var q = V.add(V.add(sa, V.mul(su, lead + seg * (k2 - 0.5))), V.mul(sn, (k2 % 2 ? 1 : -1) * wv / 2)); path += 'L' + f2(q[0]) + ' ' + f2(q[1]); grow(q); }
        var p2 = V.sub(sb, V.mul(su, lead)); path += 'L' + f2(p2[0]) + ' ' + f2(p2[1]) + 'L' + f2(sb[0]) + ' ' + f2(sb[1]);
        grow(sa); grow(sb);
        body.push('<path d="' + path + '" fill="none" stroke="#3d5560" stroke-width="1.8" stroke-linejoin="round"/>');
        if (it.label) label(V.add(V.mul(V.add(sa, sb), 0.5), V.mul(sn, -(wv / 2 + fs))), it.label);
      } else if (it.t === 'arc') {
        var ac = P(it.c), ar2 = it.r * SC;
        var s0 = [ac[0] + ar2 * Math.cos(it.from * D2R), ac[1] - ar2 * Math.sin(it.from * D2R)], s1 = [ac[0] + ar2 * Math.cos(it.to * D2R), ac[1] - ar2 * Math.sin(it.to * D2R)];
        var large = Math.abs(it.to - it.from) > 180 ? 1 : 0, sw = it.to > it.from ? 0 : 1;
        top.push('<path d="M' + f2(s0[0]) + ' ' + f2(s0[1]) + 'A' + f2(ar2) + ' ' + f2(ar2) + ' 0 ' + large + ' ' + sw + ' ' + f2(s1[0]) + ' ' + f2(s1[1]) + '" fill="none" stroke="' + it.color + '" stroke-width="1.6"/>');
        grow(s0); grow(s1);
        var mid = (it.from + it.to) / 2;
        if (it.label) label([ac[0] + (ar2 + fs * 0.8) * Math.cos(mid * D2R), ac[1] - (ar2 + fs * 0.8) * Math.sin(mid * D2R)], it.label, it.color);
      } else if (it.t === 'dim') {
        var da = P(it.a), db = P(it.b), du = V.norm(V.sub(db, da)), dn = V.perp(du); if (dn[1] < 0) dn = V.mul(dn, -1);
        var off = V.mul(dn, it.off * SC), qa = V.add(da, off), qb = V.add(db, off);
        top.push('<path d="M' + f2(da[0]) + ' ' + f2(da[1]) + 'L' + f2(qa[0] + dn[0] * 5) + ' ' + f2(qa[1] + dn[1] * 5) + 'M' + f2(db[0]) + ' ' + f2(db[1]) + 'L' + f2(qb[0] + dn[0] * 5) + ' ' + f2(qb[1] + dn[1] * 5) + '" stroke="#6b7c85" stroke-width="0.9"/>');
        top.push(L(V.add(qa, V.mul(du, 8)), V.sub(qb, V.mul(du, 8)), '#3d5560', 1.3) + arrowHead(qa, V.mul(du, -1), '#3d5560', 8) + arrowHead(qb, du, '#3d5560', 8));
        if (it.label) label(V.add(V.mul(V.add(qa, qb), 0.5), V.mul(dn, (it.off > 0 ? 1 : -1) * fs * 0.8)), it.label, '#3d5560');   // on the outer side of the dimension line
      } else if (it.t === 'projectile') {
        var pp = it.pts.map(P); pp.forEach(function (q) { grow(q); });
        body.push('<path d="' + pp.map(function (q, i) { return (i ? 'L' : 'M') + f2(q[0]) + ' ' + f2(q[1]); }).join('') + '" fill="none" stroke="#0e9f9a" stroke-width="2.4" stroke-dasharray="' + (it.marks ? '0' : '0') + '"/>');
        if (it.marks) for (var i2 = 0; i2 <= 80; i2 += 10) body.push('<circle cx="' + f2(pp[i2][0]) + '" cy="' + f2(pp[i2][1]) + '" r="3.5" fill="#fff" stroke="#0e9f9a" stroke-width="1.8"/>');
        var p0 = P(it.p0);
        body.push(L([p0[0] - 10, p0[1]], [pp[pp.length - 1][0] + 20, p0[1]], INK, 1.6));
        if (it.showV) {
          var vd = V.dir(it.th), vlen = 1.6 * SC, vt = [p0[0] + vd[0] * vlen, p0[1] - vd[1] * vlen];
          top.push(L(p0, V.sub(vt, V.mul(V.norm(V.sub(vt, p0)), 6)), '#1f5fbf', 2.2) + arrowHead(vt, V.norm(V.sub(vt, p0)), '#1f5fbf', 10));
          label(V.add(vt, [8, -8]), ar ? 'ع₀' : 'v₀', '#1f5fbf');
          var r3 = 26, e3 = [p0[0] + r3, p0[1]], e4 = [p0[0] + r3 * vd[0], p0[1] - r3 * vd[1]];
          top.push('<path d="M' + f2(e3[0]) + ' ' + f2(e3[1]) + 'A' + r3 + ' ' + r3 + ' 0 0 0 ' + f2(e4[0]) + ' ' + f2(e4[1]) + '" fill="none" stroke="#0e9f9a" stroke-width="1.4"/>');
          label([p0[0] + r3 + 12, p0[1] - 9], 'θ', '#0e9f9a');
        }
        if (it.labels) {
          var ih = 40, hp = pp[ih], base2 = [hp[0], p0[1]];
          top.push(L(hp, base2, '#6b7c85', 1, true));
          label(V.add(V.mul(V.add(hp, base2), 0.5), [fs * 1.8, 0]), (ar ? 'ف' : 'H') + ' = ' + Raster.digits(String(+it.H.toFixed(2)), eastern) + (ar ? ' م' : ' m'), '#3d5560');
          label([ (p0[0] + pp[pp.length - 1][0]) / 2, p0[1] + fs * 1.3], (ar ? 'المدى = ' : 'R = ') + Raster.digits(String(+it.R.toFixed(2)), eastern) + (ar ? ' م' : ' m'), '#3d5560');
        }
      } else if (it.t === 'lens' || it.t === 'mirror') {
        drawOptics(it);
      } else if (it.t === 'charge') {
        var qc = P(it.c), qr = it.r * SC, pos = /\+|موجب/.test(it.q);
        grow(qc, qr + 2);
        body.push('<circle cx="' + f2(qc[0]) + '" cy="' + f2(qc[1]) + '" r="' + f2(qr) + '" fill="' + (pos ? '#f7d9d6' : '#dbe6f7') + '" stroke="' + (pos ? '#c2352b' : '#1f5fbf') + '" stroke-width="2"/>');
        body.push('<path d="M' + f2(qc[0] - qr * 0.5) + ' ' + f2(qc[1]) + 'h' + f2(qr) + (pos ? 'M' + f2(qc[0]) + ' ' + f2(qc[1] - qr * 0.5) + 'v' + f2(qr) : '') + '" stroke="' + (pos ? '#c2352b' : '#1f5fbf') + '" stroke-width="2.2"/>');
        if (it.label) label(V.add(qc, [0, -qr - fs * 0.7]), it.label);
      } else if (it.t === 'field') {
        var fa = P(it.a), fb = P(it.b), fu = V.dir(it.angle), fus = [fu[0], -fu[1]], flen = it.len * SC;
        for (var k3 = 0; k3 < it.n; k3++) {
          var st0 = V.add(fa, V.mul(V.sub(fb, fa), it.n > 1 ? k3 / (it.n - 1) : 0.5)), en0 = V.add(st0, V.mul(fus, flen));
          body.push(L(st0, en0, it.color, 1.5) + arrowHead(V.add(st0, V.mul(fus, flen * 0.55)), fus, it.color, 9));
        }
        if (it.label) label(V.add(fb, V.add(V.mul(fus, flen / 2), [0, -fs * 1.25])), it.label, it.color);
      } else if (it.t === 'plate') {
        var pa = P(it.a), pb2 = P(it.b);
        body.push(L(pa, pb2, INK, 5));
        if (it.sign) {
          var pm = V.mul(V.add(pa, pb2), 0.5), pn = V.perp(V.norm(V.sub(pb2, pa)));
          // write the sign on the outer side (away from the other plates / the field between them)
          var others = sc.items.filter(function (q) { return q !== it && (q.t === 'plate' || q.t === 'field'); });
          if (others.length) {
            var oc = [0, 0]; others.forEach(function (q) { oc = V.add(oc, V.mul(V.add(P(q.a), P(q.b)), 0.5)); }); oc = V.mul(oc, 1 / others.length);
            var away = V.sub(pm, oc); if (away[0] * pn[0] + away[1] * pn[1] < 0) pn = V.mul(pn, -1);
          } else pn = V.mul(pn, -1);
          label(V.add(pm, V.mul(pn, fs * 1.1)), it.sign, INK);
        }
      } else if (it.t === 'pivot') {
        var pv = P(it.c), sz = it.size * SC; grow([pv[0] - sz, pv[1] + sz * 1.1]); grow([pv[0] + sz, pv[1]]);
        body.push('<path d="M' + f2(pv[0]) + ' ' + f2(pv[1]) + 'L' + f2(pv[0] - sz * 0.7) + ' ' + f2(pv[1] + sz) + 'H' + f2(pv[0] + sz * 0.7) + 'Z" fill="#c9d7db" stroke="' + INK + '" stroke-width="1.8" stroke-linejoin="round"/>');
        body.push(hatch([pv[0] - sz, pv[1] + sz], [pv[0] + sz, pv[1] + sz], 1));
      } else if (it.t === 'beam') {
        var ba = P(it.a), bb2 = P(it.b), bu = V.norm(V.sub(bb2, ba)), bn = V.mul(V.perp(bu), it.th * SC / 2);
        var cs = [V.add(ba, bn), V.add(bb2, bn), V.sub(bb2, bn), V.sub(ba, bn)]; cs.forEach(function (q) { grow(q); });
        body.push('<polygon points="' + cs.map(function (q) { return f2(q[0]) + ',' + f2(q[1]); }).join(' ') + '" fill="' + it.fill + '" stroke="' + INK + '" stroke-width="1.6"/>');
      } else if (it.t === 'point') {
        var pp2 = P(it.c); grow(pp2, 4);
        top.push('<circle cx="' + f2(pp2[0]) + '" cy="' + f2(pp2[1]) + '" r="3.2" fill="' + INK + '"/>');
        if (it.label) label(V.add(pp2, [0, -fs * 0.9]), it.label);
      } else if (it.t === 'text') {
        var tp = P(it.c); label(tp, it.text, it.color);
      } else if (it.t === 'motion') {
        var mp = it.pts, xs = mp.map(function (q) { return q[0]; }), ys = mp.map(function (q) { return q[1]; });
        var xmax = Math.max.apply(null, xs), ymax = Math.max(0, Math.max.apply(null, ys)), ymin = Math.min(0, Math.min.apply(null, ys));
        var kx = it.w / (xmax || 1), ky = it.h / ((ymax - ymin) || 1);
        var M = function (q) { return P([it.at[0] + q[0] * kx, it.at[1] + (q[1] - ymin) * ky]); };
        var o0 = M([0, 0]), xe2 = M([xmax, 0]), yb = M([0, ymin]), yt = M([0, ymax]);
        xe2 = [xe2[0] + 0.7 * SC, xe2[1]]; yt = [yt[0], yt[1] - 0.6 * SC];
        if (it.area) {
          var poly = [M([mp[0][0], 0])].concat(mp.map(M), [M([mp[mp.length - 1][0], 0])]);
          body.push('<path d="' + poly.map(function (q, i) { return (i ? 'L' : 'M') + f2(q[0]) + ' ' + f2(q[1]); }).join('') + 'Z" fill="#0e9f9a" fill-opacity="0.18"/>');
        }
        // guides to every point, ticks and values on both axes
        var seenX = {}, seenY = {};
        mp.forEach(function (q) {
          var pp = M(q), fx = M([q[0], 0]), fy = M([0, q[1]]);
          if (q[1] !== 0) body.push('<path d="M' + f2(fx[0]) + ' ' + f2(fx[1]) + 'V' + f2(pp[1]) + 'H' + f2(fy[0]) + '" stroke="#8aa0a8" stroke-width="1" stroke-dasharray="4 3" fill="none"/>');
          if (!seenX[q[0]]) { seenX[q[0]] = 1; texts.push({ x: fx[0], y: o0[1] + fs * 1.25 + (ymin < 0 ? 0 : 0), t: Raster.digits(String(q[0]), eastern), color: INK }); body.push(L([fx[0], o0[1] - 3], [fx[0], o0[1] + 3], INK, 1.2)); }
          if (!seenY[q[1]] && q[1] !== 0) { seenY[q[1]] = 1; texts.push({ x: fy[0] - fs * 0.9, y: fy[1] + fs * 0.35, t: Raster.digits(String(q[1]).replace('-', '−'), eastern), color: INK }); body.push(L([fy[0] - 3, fy[1]], [fy[0] + 3, fy[1]], INK, 1.2)); }
        });
        grow([o0[0] - fs * 2.6, o0[1] + fs * 1.8]); grow([yb[0] - fs * 2.6, yb[1] + fs * 1.8]);
        top.push(L(o0, V.sub(xe2, [6, 0]), INK, 1.5) + arrowHead(xe2, [1, 0], INK, 9) + L(yb, V.add(yt, [0, 6]), INK, 1.5) + arrowHead(yt, [0, -1], INK, 9));
        label(V.add(xe2, [fs * 0.2, fs * 1.2]), it.xl, INK); label(V.add(yt, [0, -fs * 0.8]), it.yl, INK);
        grow(V.add(xe2, [fs * 2.2, 0])); grow(V.add(yt, [-fs * 2, -fs * 1.4]));
        var line = mp.map(M);
        top.push('<path d="' + line.map(function (q, i) { return (i ? 'L' : 'M') + f2(q[0]) + ' ' + f2(q[1]); }).join('') + '" fill="none" stroke="' + it.color + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>');
        line.forEach(function (q, i) {
          top.push('<circle cx="' + f2(q[0]) + '" cy="' + f2(q[1]) + '" r="2.8" fill="' + it.color + '"/>');
          if (it.names && it.names[i]) label(V.add(q, [0, -fs * 0.9]), it.names[i], INK);
        });
        for (var si = 0; si + 1 < mp.length; si++) {
          var q1 = mp[si], q2 = mp[si + 1], dx = q2[0] - q1[0];
          if (!dx) continue;
          var mid = V.mul(V.add(M(q1), M(q2)), 0.5);
          if (it.slopes) {
            var sl = (q2[1] - q1[1]) / dx, sym = it.kind === 'xt' ? 'ع' : 'ت';
            var sd2 = V.norm(V.perp(V.sub(M(q2), M(q1)))); if (sd2[1] > 0) sd2 = V.mul(sd2, -1);
            label(V.add(mid, V.mul(sd2, fs * 1.3)), sym + ' = ' + Raster.digits(String(+sl.toFixed(2)).replace('-', '−'), eastern), '#c2352b');
          }
          if (it.area) {
            var ar2 = dx * (q1[1] + q2[1]) / 2, cy2 = M([0, (q1[1] + q2[1]) / 4 + ymin * 0])[1];
            if (Math.abs(ar2) > 1e-9) texts.push({ x: mid[0], y: (cy2 + o0[1]) / 2 + fs * 0.35, t: Raster.digits(String(+ar2.toFixed(2)).replace('-', '−'), eastern), color: '#0a7c78' });
          }
        }
      } else if (it.t === 'wave') {
        var w0 = P(it.at), k2 = 2 * Math.PI / it.lam, wpts = [];
        for (var wi = 0; wi <= 240; wi++) {
          var wx = it.len * wi / 240, wy = it.A * Math.sin(k2 * wx + it.phase * D2R);
          wpts.push(P([it.at[0] + wx, it.at[1] + wy]));
        }
        wpts.forEach(function (q) { grow(q); });
        body.push(L(w0, P([it.at[0] + it.len, it.at[1]]), '#8aa0a8', 1, true));
        if (it.kind === 'long') {                          // longitudinal: compressions / rarefactions
          var lines = '';
          var stepL = it.lam / 16;
          for (var li = 0; li * stepL <= it.len + 1e-9; li++) {
            var lx0 = li * stepL, lx = it.at[0] + lx0 - (it.lam / (2 * Math.PI)) * 0.8 * Math.sin(k2 * lx0);   // bunching = compressions
            if (lx < it.at[0] || lx > it.at[0] + it.len) continue;
            var a1 = P([lx, it.at[1] - it.A]), a2 = P([lx, it.at[1] + it.A]); lines += 'M' + f2(a1[0]) + ' ' + f2(a1[1]) + 'L' + f2(a2[0]) + ' ' + f2(a2[1]);
          }
          body.push('<path d="' + lines + '" stroke="' + it.color + '" stroke-width="1.5"/>');
        } else body.push('<path d="' + wpts.map(function (q, i) { return (i ? 'L' : 'M') + f2(q[0]) + ' ' + f2(q[1]); }).join('') + '" fill="none" stroke="' + it.color + '" stroke-width="2.4"/>');
        if (it.labels && it.kind === 'long') {
          var c1 = P([it.at[0] + it.lam, it.at[1] + it.A]), c2 = P([it.at[0] + 2 * it.lam, it.at[1] + it.A]), yl3 = c1[1] - fs * 0.9;
          if (2 * it.lam <= it.len + 1e-9) {
            top.push(L([c1[0], yl3], [c2[0], yl3], '#3d5560', 1.2) + arrowHead([c1[0], yl3], [-1, 0], '#3d5560', 8) + arrowHead([c2[0], yl3], [1, 0], '#3d5560', 8));
            label([(c1[0] + c2[0]) / 2, yl3 - fs * 0.7], 'λ', '#3d5560'); grow([c1[0], yl3 - fs * 1.4]);
          }
          label([c1[0], P([0, it.at[1] - it.A])[1] + fs * 1.1], 'تضاغط', '#3d5560'); label([(c1[0] + c2[0]) / 2, P([0, it.at[1] - it.A])[1] + fs * 1.1], 'تخلخل', '#3d5560');
          grow([0, P([0, it.at[1] - it.A])[1] + fs * 1.8]);
        } else if (it.labels) {
          var cr = (Math.PI / 2 - it.phase * D2R) / k2; while (cr < 0) cr += it.lam;
          var pA = P([it.at[0] + cr, it.at[1] + it.A]), pB = P([it.at[0] + cr + it.lam, it.at[1] + it.A]), yl2 = pA[1] - fs * 1.1;
          if (cr + it.lam <= it.len + 1e-9) {
            top.push(L([pA[0], yl2], [pB[0], yl2], '#3d5560', 1.2) + arrowHead([pA[0], yl2], [-1, 0], '#3d5560', 8) + arrowHead([pB[0], yl2], [1, 0], '#3d5560', 8));
            label([(pA[0] + pB[0]) / 2, yl2 - fs * 0.7], 'λ', '#3d5560'); grow([pA[0], yl2 - fs * 1.4]);
          }
          var base2 = P([it.at[0] + cr, it.at[1]]);
          top.push(L(base2, pA, '#c2352b', 1.2, true));
          label([pA[0] + fs * 0.7, (pA[1] + base2[1]) / 2], 'A', '#c2352b');
        }
      } else if (it.t === 'axes') {
        var xc = P(it.c), al = it.len * SC, ax = V.rot([1, 0], -it.angle), ay = V.rot([0, -1], -it.angle);
        var xe = V.add(xc, V.mul(ax, al)), ye = V.add(xc, V.mul(ay, al));
        top.push(L(xc, V.sub(xe, V.mul(ax, 6)), '#3d5560', 1.4) + arrowHead(xe, ax, '#3d5560', 9) + L(xc, V.sub(ye, V.mul(ay, 6)), '#3d5560', 1.4) + arrowHead(ye, ay, '#3d5560', 9));
        label(V.add(xe, V.mul(ax, fs * 0.8)), it.x, '#3d5560'); label(V.add(ye, V.mul(ay, fs * 0.8)), it.y, '#3d5560');
      } else if (it.t === 'circle') {
        var ccc = P(it.c), crr = it.r * SC; grow(ccc, crr);
        body.push('<circle cx="' + f2(ccc[0]) + '" cy="' + f2(ccc[1]) + '" r="' + f2(crr) + '" fill="' + it.fill + '" fill-opacity="' + (it.fill === 'none' ? 0 : 0.2) + '" stroke="' + it.color + '" stroke-width="1.8"' + (it.dash ? ' stroke-dasharray="6 4"' : '') + '/>');
      }
    });

    function smoothPath(pts) {
      var d = 'M' + f2(pts[0][0]) + ' ' + f2(pts[0][1]);
      for (var i = 1; i < pts.length - 1; i++) { var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; d += 'Q' + f2(pts[i][0]) + ' ' + f2(pts[i][1]) + ' ' + f2(mx) + ' ' + f2(my); }
      var l = pts[pts.length - 1]; return d + 'L' + f2(l[0]) + ' ' + f2(l[1]);
    }

    function drawOptics(it) {
      var O = P(it.O), f = it.f * SC, u = it.u * SC, hO = it.hO * SC, sz = it.size * SC;
      var mirror = it.t === 'mirror';
      var maxX = Math.max(u, 2 * f, isFinite(it.v) ? Math.abs(it.v) * SC : 0) + f * 0.8;
      var axisL = O[0] - maxX, axisR = O[0] + (mirror ? f * 0.6 + (it.real ? 0 : Math.abs(it.v) * SC + f * 0.4) : maxX);
      body.push(L([axisL, O[1]], [axisR, O[1]], '#6b7c85', 1.2, false));
      // element
      if (!mirror) {
        var tipTop = [O[0], O[1] - sz], tipBot = [O[0], O[1] + sz];
        body.push(L(tipTop, tipBot, '#1f5fbf', 2.4));
        var hd = it.converging ? 1 : -1;
        body.push('<path d="M' + f2(O[0] - 8) + ' ' + f2(tipTop[1] + 9 * hd) + 'L' + f2(O[0]) + ' ' + f2(tipTop[1]) + 'L' + f2(O[0] + 8) + ' ' + f2(tipTop[1] + 9 * hd) +
          'M' + f2(O[0] - 8) + ' ' + f2(tipBot[1] - 9 * hd) + 'L' + f2(O[0]) + ' ' + f2(tipBot[1]) + 'L' + f2(O[0] + 8) + ' ' + f2(tipBot[1] - 9 * hd) + '" fill="none" stroke="#1f5fbf" stroke-width="2.2"/>');
        grow(tipTop); grow(tipBot);
      } else {
        var R2 = 2 * f, bulge = it.converging ? -1 : 1;           // concave mirror opens to the left (towards the object)
        var sag = R2 - Math.sqrt(Math.max(0, R2 * R2 - sz * sz));
        body.push('<path d="M' + f2(O[0] - bulge * sag) + ' ' + f2(O[1] - sz) + 'Q' + f2(O[0] + bulge * sag) + ' ' + f2(O[1]) + ' ' + f2(O[0] - bulge * sag) + ' ' + f2(O[1] + sz) + '" fill="none" stroke="#1f5fbf" stroke-width="2.6"/>');
        for (var hh = -sz + 6; hh < sz; hh += 9) { var xm = O[0] + 4 + (bulge * sag) * (1 - (hh * hh) / (sz * sz)) * 0.5; body.push('<path d="M' + f2(xm) + ' ' + f2(O[1] + hh) + 'l7 -5" stroke="#6b7c85" stroke-width="1"/>'); }
        grow([O[0], O[1] - sz]); grow([O[0], O[1] + sz]);
      }
      // focal points & centre
      var marks = [[O[0] - f, 'F'], [O[0] - 2 * f, mirror ? 'C' : '2F']];
      if (!mirror) marks.push([O[0] + f, 'F'], [O[0] + 2 * f, '2F']);
      marks.forEach(function (mk) {
        body.push('<circle cx="' + f2(mk[0]) + '" cy="' + f2(O[1]) + '" r="3" fill="' + INK + '"/>'); grow([mk[0], O[1]]);
        if (it.labels) label([mk[0], O[1] + fs * 1.1], ar ? (mk[1] === 'F' ? 'ب' : mk[1] === 'C' ? 'م' : '٢ب') : mk[1], '#3d5560');
      });
      // object arrow
      var ob = [O[0] - u, O[1]], ot = [O[0] - u, O[1] - hO];
      top.push(L(ob, V.add(ot, [0, 8]), '#2e8b3a', 2.6) + arrowHead(ot, [0, -1], '#2e8b3a', 11)); grow(ot);
      if (it.labels) label([ot[0], ot[1] - fs * 0.8], ar ? 'الجسم' : 'object', '#2e8b3a');
      if (!isFinite(it.v)) { label([O[0], O[1] - sz - fs], ar ? 'الصورة في اللانهاية' : 'image at infinity', '#c2352b'); return; }
      var vx = mirror ? O[0] - it.v * SC : O[0] + it.v * SC;           // mirror: real image in front (left)
      var ib = [vx, O[1]], itp = [vx, O[1] - it.hI * SC];
      grow(itp); grow(ib);
      var icol = '#c2352b';
      top.push(L(ib, V.sub(itp, [0, Math.sign(itp[1] - ib[1]) * 8]), icol, 2.6, !it.real) + arrowHead(itp, V.norm(V.sub(itp, ib)), icol, 11));
      if (it.labels) label([itp[0], itp[1] + (itp[1] < ib[1] ? -fs * 0.8 : fs * 1.2)], ar ? (it.real ? 'الصورة (حقيقية)' : 'الصورة (تقديرية)') : (it.real ? 'real image' : 'virtual image'), icol);
      if (!it.rays) return;
      var ray = function (pts, dashFrom) { var s = ''; for (var i = 1; i < pts.length; i++) s += L(pts[i - 1], pts[i], '#e07a00', 1.5, dashFrom !== undefined && i > dashFrom); return s; };
      var ext = function (a, b, k) { return V.add(b, V.mul(V.norm(V.sub(b, a)), k)); };
      var hitY = O[1] - hO;
      if (!mirror) {
        // 1) parallel to the axis, then through the far focus (or away from the near focus)
        var P1 = [O[0], hitY], far = it.converging ? [O[0] + f, O[1]] : [O[0] - f, O[1]];
        var dirOut = it.converging ? V.norm(V.sub(far, P1)) : V.norm(V.sub(P1, far));
        var end1 = V.add(P1, V.mul(dirOut, maxX * 1.1));
        top.push(ray([ot, P1, end1]));
        if (!it.real) top.push(L(P1, it.converging ? V.add(P1, V.mul(dirOut, -maxX)) : far, '#e07a00', 1.2, true));
        // 2) through the optical centre undeviated
        var d2 = V.norm(V.sub(O, ot)), end2 = V.add(O, V.mul(d2, maxX * 1.1));
        top.push(ray([ot, O, end2]));
        if (!it.real) top.push(L(O, V.add(O, V.mul(d2, -maxX)), '#e07a00', 1.2, true));
      } else {
        // 1) parallel ray reflects through F (concave) / as if from F behind (convex)
        var M1 = [O[0], hitY], Fp = [O[0] - f, O[1]], Fv = [O[0] + f, O[1]];
        var out1 = it.converging ? V.norm(V.sub(Fp, M1)) : V.norm(V.sub(M1, Fv));
        top.push(ray([ot, M1, V.add(M1, V.mul(out1, maxX * 1.1))]));
        if (!it.real) top.push(L(M1, it.converging ? V.add(M1, V.mul(out1, -maxX)) : Fv, '#e07a00', 1.2, true));
        // 2) ray towards the pole reflects symmetrically
        var d3 = V.norm(V.sub(O, ot)), out2 = [-d3[0], d3[1]];
        top.push(ray([ot, O, V.add(O, V.mul(out2, maxX * 1.1))]));
        if (!it.real) top.push(L(O, V.add(O, V.mul(out2, -maxX)), '#e07a00', 1.2, true));
      }
    }

    if (!isFinite(bb.x0)) bb = { x0: -50, y0: -50, x1: 50, y1: 50 };
    var M = 14, box = [bb.x0 - M, bb.y0 - M, bb.x1 - bb.x0 + 2 * M, bb.y1 - bb.y0 + 2 * M];
    var font = String(o.font || 'Amiri');
    var mathJobs = mathLabels.map(function (ml) {
      return RenderHost.preview(ml.tex, { rtl: ar, arabicFunctions: ar, arabicComma: ar, digits: eastern ? 'eastern' : 'western', color: ml.color, fontSize: 14, mathFont: 'stix2', font: font, display: false, mode: 'math' }, true)
        .then(function (r) { return r.errors && r.errors.length ? null : r; }).catch(function () { return null; });
    });
    return Promise.all([Raster.fontCss([font], true)].concat(mathJobs)).then(function (res) {
      var css = res[0];
      var ml = mathLabels.map(function (m2, i) {
        var r = res[i + 1]; if (!r) return '';
        var px = fs * 1.05, w = r.width * px, h = r.total * px, x = m2.p[0] - w / 2, y = m2.p[1] - h / 2;
        return r.svgString.replace(/^<svg\b([^>]*)>/, function (m0, a) { return '<svg' + a.replace(/\s(width|height|style|x|y)="[^"]*"/g, '') + ' x="' + f2(x) + '" y="' + f2(y) + '" width="' + f2(w) + '" height="' + f2(h) + '" overflow="visible">'; });
      }).join('');
      var tx = texts.map(function (t) { return Raster.words(t.x, t.y, t.t, ' class="pl" fill="' + t.color + '"', fs * 1.1, ar); }).join('');
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + f2(box[2]) + '" height="' + f2(box[3]) + '" viewBox="' + box.map(f2).join(' ') + '">' +
        '<defs><style>' + css + ' .pl{font-family:"' + font + '","Times New Roman",serif;font-size:' + f2(fs * 1.1) + 'px;font-weight:700;paint-order:stroke;stroke:#fff;stroke-width:3.2px;stroke-linejoin:round}</style></defs>' +
        '<rect x="' + f2(box[0]) + '" y="' + f2(box[1]) + '" width="' + f2(box[2]) + '" height="' + f2(box[3]) + '" fill="#fff"/>' + body.join('') + top.join('') + tx + ml + '</svg>';
      return { svg: svg, w: box[2], h: box[3], info: sc.info || {} };
    });
  }

  global.PhysicsRender = { render: render, scene: scene };
})(window);
