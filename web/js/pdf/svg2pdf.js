/* Svg2Pdf — draws a (flattened, text-free) SVG into a pdf-lib page as real vector PDF operators.
 * Supports g/transform/opacity/clip-path, path (all commands incl. arcs), rect (rounded), circle, ellipse,
 * line, polyline, polygon, image (PNG/JPEG data URIs), fill/stroke/dash/cap/join/fill-rule/opacities.
 * Coordinates: the caller gives the target box in "display" space (points, y downwards) plus the matrix
 * that maps display space to the page's PDF user space. */
(function (global) {
  'use strict';

  // ------------------------------------------------------------ matrices [a b c d e f]
  function mul(m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function parseTransform(s) {
    var m = [1, 0, 0, 1, 0, 0];
    if (!s) return m;
    var re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g, t;
    while ((t = re.exec(s))) {
      var v = t[2].trim().split(/[\s,]+/).map(Number), n;
      switch (t[1]) {
        case 'matrix': n = v; break;
        case 'translate': n = [1, 0, 0, 1, v[0] || 0, v[1] || 0]; break;
        case 'scale': n = [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0]; break;
        case 'rotate':
          var a = (v[0] || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
          n = [c, sn, -sn, c, 0, 0];
          if (v.length > 2) n = mul(mul([1, 0, 0, 1, v[1], v[2]], n), [1, 0, 0, 1, -v[1], -v[2]]);
          break;
        case 'skewX': n = [1, 0, Math.tan(v[0] * Math.PI / 180), 1, 0, 0]; break;
        case 'skewY': n = [1, Math.tan(v[0] * Math.PI / 180), 0, 1, 0, 0]; break;
      }
      m = mul(m, n);
    }
    return m;
  }
  function f(n) { return (Math.round(n * 1000) / 1000).toString(); }
  function cm(m) { return m.map(f).join(' ') + ' cm\n'; }

  // ------------------------------------------------------------ colours
  var NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500',
    gray: '#808080', grey: '#808080', purple: '#800080', brown: '#a52a2a', teal: '#008080', navy: '#000080', cyan: '#00ffff', magenta: '#ff00ff' };
  function color(v, root) {
    if (!v || v === 'none' || v === 'transparent') return null;
    v = String(v).trim();
    var g = v.match(/^url\(\s*['"]?#([^)'"]+)['"]?\s*\)/);
    if (g) {                                         // gradient → its first stop colour (close enough in print)
      var el = root && root.querySelector('[id="' + g[1] + '"]'), stop = el && el.querySelector('stop');
      return stop ? color(stop.getAttribute('stop-color') || (stop.getAttribute('style') || '').replace(/.*stop-color:\s*([^;]+).*/, '$1'), root) : null;
    }
    if (NAMED[v.toLowerCase()]) v = NAMED[v.toLowerCase()];
    var h = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (h) {
      var s = h[1].length === 3 ? h[1].replace(/./g, '$&$&') : h[1];
      return { r: parseInt(s.slice(0, 2), 16) / 255, g: parseInt(s.slice(2, 4), 16) / 255, b: parseInt(s.slice(4, 6), 16) / 255, a: 1 };
    }
    var r = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/i);
    if (r) return { r: +r[1] / 255, g: +r[2] / 255, b: +r[3] / 255, a: r[4] === undefined ? 1 : +r[4] };
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  // ------------------------------------------------------------ path data → PDF path operators
  function arcToBeziers(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
    // SVG arc → list of cubic segments [c1x,c1y,c2x,c2y,x,y]
    if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
    rx = Math.abs(rx); ry = Math.abs(ry);
    var sinp = Math.sin(phi * Math.PI / 180), cosp = Math.cos(phi * Math.PI / 180);
    var dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    var x1p = cosp * dx + sinp * dy, y1p = -sinp * dx + cosp * dy;
    var lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    var num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    var co = Math.sqrt(Math.max(0, num / den)) * (fa === fs ? -1 : 1);
    var cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    var cx = cosp * cxp - sinp * cyp + (x1 + x2) / 2, cy = sinp * cxp + cosp * cyp + (y1 + y2) / 2;
    var ang = function (ux, uy, vx, vy) { var a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
    var t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry), dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
    var n = Math.ceil(Math.abs(dt) / (Math.PI / 2)), out = [], d = dt / n, k = 4 / 3 * Math.tan(d / 4);
    for (var i = 0; i < n; i++) {
      var a1 = t1 + i * d, a2 = a1 + d;
      var p = function (a) { var x = rx * Math.cos(a), y = ry * Math.sin(a); return [cosp * x - sinp * y + cx, sinp * x + cosp * y + cy]; };
      var dp = function (a) { var x = -rx * Math.sin(a), y = ry * Math.cos(a); return [cosp * x - sinp * y, sinp * x + cosp * y]; };
      var P1 = p(a1), P2 = p(a2), D1 = dp(a1), D2 = dp(a2);
      out.push([P1[0] + k * D1[0], P1[1] + k * D1[1], P2[0] - k * D2[0], P2[1] - k * D2[1], P2[0], P2[1]]);
    }
    return out;
  }
  function pathOps(d) {
    var toks = String(d || '').match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
    var out = '', i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lcx = null, lcy = null, lqx = null, lqy = null, prev = '';
    var num = function () { return +toks[i++]; };
    var flag = function () {             // arc flags may be packed ("11" = two flags)
      var t = toks[i];
      if (t.length > 1 && /^[01]+$/.test(t)) { toks.splice(i, 1, t[0], t.slice(1)); }
      return +toks[i++];
    };
    while (i < toks.length) {
      if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
      var rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
      if (C === 'Z') { out += 'h\n'; x = sx; y = sy; prev = 'Z'; lcx = lqx = null; continue; }
      if (i >= toks.length || /[a-zA-Z]/.test(toks[i])) { if (C !== 'Z') break; continue; }
      switch (C) {
        case 'M': x = ox + num(); y = oy + num(); sx = x; sy = y; out += f(x) + ' ' + f(y) + ' m\n'; cmd = rel ? 'l' : 'L'; lcx = lqx = null; break;
        case 'L': x = ox + num(); y = oy + num(); out += f(x) + ' ' + f(y) + ' l\n'; lcx = lqx = null; break;
        case 'H': x = ox + num(); out += f(x) + ' ' + f(y) + ' l\n'; lcx = lqx = null; break;
        case 'V': y = oy + num(); out += f(x) + ' ' + f(y) + ' l\n'; lcx = lqx = null; break;
        case 'C': var c1x = ox + num(), c1y = oy + num(), c2x = ox + num(), c2y = oy + num(); x = ox + num(); y = oy + num();
          out += [c1x, c1y, c2x, c2y, x, y].map(f).join(' ') + ' c\n'; lcx = c2x; lcy = c2y; lqx = null; break;
        case 'S': var r1x = lcx === null ? x : 2 * x - lcx, r1y = lcx === null ? y : 2 * y - lcy, s2x = ox + num(), s2y = oy + num(); x = ox + num(); y = oy + num();
          out += [r1x, r1y, s2x, s2y, x, y].map(f).join(' ') + ' c\n'; lcx = s2x; lcy = s2y; lqx = null; break;
        case 'Q': var qx = ox + num(), qy = oy + num(), nx = ox + num(), ny = oy + num();
          out += [x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), nx + 2 / 3 * (qx - nx), ny + 2 / 3 * (qy - ny), nx, ny].map(f).join(' ') + ' c\n';
          x = nx; y = ny; lqx = qx; lqy = qy; lcx = null; break;
        case 'T': var tqx = lqx === null ? x : 2 * x - lqx, tqy = lqx === null ? y : 2 * y - lqy, tx = ox + num(), ty = oy + num();
          out += [x + 2 / 3 * (tqx - x), y + 2 / 3 * (tqy - y), tx + 2 / 3 * (tqx - tx), ty + 2 / 3 * (tqy - ty), tx, ty].map(f).join(' ') + ' c\n';
          x = tx; y = ty; lqx = tqx; lqy = tqy; lcx = null; break;
        case 'A': var arx = num(), ary = num(), rot = num(), fa = flag(), fs = flag(), ax = ox + num(), ay = oy + num();
          arcToBeziers(x, y, arx, ary, rot, fa, fs, ax, ay).forEach(function (b) { out += b.map(f).join(' ') + ' c\n'; });
          x = ax; y = ay; lcx = lqx = null; break;
        default: i++;
      }
      prev = C;
    }
    return out;
  }
  function ellipseOps(cx, cy, rx, ry) {
    var k = 0.5522847498;
    return f(cx + rx) + ' ' + f(cy) + ' m\n' +
      [cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry].map(f).join(' ') + ' c\n' +
      [cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy].map(f).join(' ') + ' c\n' +
      [cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry].map(f).join(' ') + ' c\n' +
      [cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy].map(f).join(' ') + ' c\nh\n';
  }
  function rectOps(x, y, w, h, rx, ry) {
    if (!rx && !ry) return [x, y, w, h].map(f).join(' ') + ' re\n';
    rx = Math.min(rx || ry, w / 2); ry = Math.min(ry || rx, h / 2);
    var k = 0.5522847498;
    return f(x + rx) + ' ' + f(y) + ' m\n' + f(x + w - rx) + ' ' + f(y) + ' l\n' +
      [x + w - rx + rx * k, y, x + w, y + ry - ry * k, x + w, y + ry].map(f).join(' ') + ' c\n' +
      f(x + w) + ' ' + f(y + h - ry) + ' l\n' +
      [x + w, y + h - ry + ry * k, x + w - rx + rx * k, y + h, x + w - rx, y + h].map(f).join(' ') + ' c\n' +
      f(x + rx) + ' ' + f(y + h) + ' l\n' +
      [x + rx - rx * k, y + h, x, y + h - ry + ry * k, x, y + h - ry].map(f).join(' ') + ' c\n' +
      f(x) + ' ' + f(y + ry) + ' l\n' +
      [x, y + ry - ry * k, x + rx - rx * k, y, x + rx, y].map(f).join(' ') + ' c\nh\n';
  }
  function num(el, a, d) { var v = parseFloat(el.getAttribute(a)); return isNaN(v) ? (d || 0) : v; }
  function geometry(el) {
    switch (el.localName) {
      case 'path': return pathOps(el.getAttribute('d'));
      case 'rect': return rectOps(num(el, 'x'), num(el, 'y'), num(el, 'width'), num(el, 'height'), num(el, 'rx'), num(el, 'ry'));
      case 'circle': return ellipseOps(num(el, 'cx'), num(el, 'cy'), num(el, 'r'), num(el, 'r'));
      case 'ellipse': return ellipseOps(num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry'));
      case 'line': return f(num(el, 'x1')) + ' ' + f(num(el, 'y1')) + ' m\n' + f(num(el, 'x2')) + ' ' + f(num(el, 'y2')) + ' l\n';
      case 'polyline': case 'polygon':
        var p = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number), o = '';
        for (var i = 0; i + 1 < p.length; i += 2) o += f(p[i]) + ' ' + f(p[i + 1]) + (i ? ' l\n' : ' m\n');
        return o + (el.localName === 'polygon' ? 'h\n' : '');
    }
    return '';
  }

  var INHERIT = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'clip-rule'];
  function styleOf(el, parent) {
    var st = Object.assign({}, parent);
    INHERIT.forEach(function (k) { var v = el.getAttribute(k); if (v !== null && v !== '' && v !== 'inherit') st[k] = v; });
    var css = el.getAttribute('style');
    if (css) css.split(';').forEach(function (d) { var kv = d.split(':'); if (kv.length === 2 && INHERIT.indexOf(kv[0].trim()) >= 0) st[kv[0].trim()] = kv[1].trim(); });
    return st;
  }

  /** draws svgString into box {x,y,w,h} (display space) on a page; toPdf = matrix display → PDF user space.
   *  env = {doc, page} (pdf-lib). Returns Promise<string> of content operators (caller adds the stream). */
  function draw(svgString, box, toPdf, env) {
    var doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    var root = doc.documentElement;
    if (!root || root.localName !== 'svg') return Promise.resolve('');
    var vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    var W = parseFloat(root.getAttribute('width')) || vb[2] || box.w, H = parseFloat(root.getAttribute('height')) || vb[3] || box.h;
    if (vb.length !== 4 || !vb[2] || !vb[3]) vb = [0, 0, W, H];
    var base = mul(mul([1, 0, 0, 1, box.x, box.y], [box.w / vb[2], 0, 0, box.h / vb[3], 0, 0]), [1, 0, 0, 1, -vb[0], -vb[1]]);
    // pre-embed images and opacity states
    var gs = {}, imgs = {}, jobs = [];
    var gsFor = function (fa, sa) {
      var key = f(fa) + '|' + f(sa);
      if (!gs[key]) {
        var ref = env.doc.context.register(env.doc.context.obj({ Type: 'ExtGState', ca: fa, CA: sa }));
        gs[key] = env.page.node.newExtGState('GSam', ref).toString();
      }
      return gs[key];
    };
    Array.prototype.forEach.call(root.querySelectorAll('image'), function (im) {
      var href = im.getAttribute('href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
      if (imgs[href] !== undefined || !/^data:image\/(png|jpe?g)/i.test(href)) return;
      imgs[href] = null;
      var bytes = Uint8Array.from(atob(href.split(',')[1]), function (c) { return c.charCodeAt(0); });
      jobs.push((/png/i.test(href) ? env.doc.embedPng(bytes) : env.doc.embedJpg(bytes)).then(function (pi) {
        imgs[href] = env.page.node.newXObject('Imam', pi.ref).toString();
      }).catch(function () { /* skip a broken image */ }));
    });
    return Promise.all(jobs).then(function () {
      var out = 'q\n' + cm(toPdf) + cm(base);
      var walk = function (el, st) {
        var tag = el.localName;
        if (/^(defs|clipPath|mask|style|title|desc|metadata|linearGradient|radialGradient|pattern|marker|symbol|text)$/.test(tag)) return '';
        if (el.getAttribute('display') === 'none' || el.getAttribute('visibility') === 'hidden') return '';
        var s = styleOf(el, st), o = '';
        var tr = el.getAttribute('transform'), op = parseFloat(el.getAttribute('opacity'));
        if (isNaN(op)) op = 1;
        var clip = (el.getAttribute('clip-path') || '').match(/#([^)'"]+)/);
        var open = !!(tr || clip || op < 1 || tag === 'svg' && el !== root);
        if (open) o += 'q\n';
        if (tr) o += cm(parseTransform(tr));
        if (tag === 'svg' && el !== root) {
          var nx = num(el, 'x'), ny = num(el, 'y'), nw = num(el, 'width'), nh = num(el, 'height');
          var nvb = (el.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
          o += cm([1, 0, 0, 1, nx, ny]);
          if (nvb.length === 4 && nvb[2] && nvb[3] && nw && nh) { var sc = Math.min(nw / nvb[2], nh / nvb[3]); o += cm([sc, 0, 0, sc, (nw - nvb[2] * sc) / 2 - nvb[0] * sc, (nh - nvb[3] * sc) / 2 - nvb[1] * sc]); }
        }
        if (clip) {
          var cp = root.querySelector('clipPath[id="' + clip[1] + '"]');
          if (cp) {
            var g = '';
            Array.prototype.forEach.call(cp.children, function (c) {
              var ct = c.getAttribute('transform');
              g += ct ? '' : geometry(c);   // (transformed clip children are rare here)
            });
            var eo = Array.prototype.some.call(cp.children, function (c) { return c.getAttribute('clip-rule') === 'evenodd' || c.getAttribute('fill-rule') === 'evenodd'; });
            if (g) o += g + (eo ? 'W* n\n' : 'W n\n');
          }
        }
        if (tag === 'g' || tag === 'svg' || tag === 'a') {
          var inner = '';
          Array.prototype.forEach.call(el.children, function (c) { inner += walk(c, Object.assign({}, s, { __op: (s.__op || 1) * op })); });
          if (!inner) return '';
          return o + inner + (open ? 'Q\n' : '');
        }
        if (tag === 'image') {
          var href = el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
          var name = imgs[href];
          if (!name) return '';
          var ix = num(el, 'x'), iy = num(el, 'y'), iw = num(el, 'width'), ih = num(el, 'height');
          if (op < 1 || (s.__op || 1) < 1) o += gsFor(op * (s.__op || 1), op * (s.__op || 1)) + ' gs\n';
          return o + 'q\n' + cm([iw, 0, 0, -ih, ix, iy + ih]) + name + ' Do\nQ\n' + (open ? 'Q\n' : '');
        }
        var geo = geometry(el);
        if (!geo) return '';
        var fillC = tag === 'line' || tag === 'polyline' && s.fill === undefined ? null : color(s.fill === undefined ? '#000' : s.fill, root);
        var strokeC = color(s.stroke, root), sw = parseFloat(s['stroke-width']); if (isNaN(sw)) sw = 1;
        if (strokeC && sw <= 0) strokeC = null;
        if (!fillC && !strokeC) return '';
        var go = op * (s.__op || 1);
        var fa = fillC ? go * fillC.a * (s['fill-opacity'] === undefined ? 1 : +s['fill-opacity']) : 1;
        var sa = strokeC ? go * strokeC.a * (s['stroke-opacity'] === undefined ? 1 : +s['stroke-opacity']) : 1;
        var paint = '';
        if (fa < 0.999 || sa < 0.999) paint += gsFor(Math.max(0, Math.min(1, fa)), Math.max(0, Math.min(1, sa))) + ' gs\n';
        if (fillC) paint += [fillC.r, fillC.g, fillC.b].map(f).join(' ') + ' rg\n';
        if (strokeC) {
          paint += [strokeC.r, strokeC.g, strokeC.b].map(f).join(' ') + ' RG\n' + f(sw) + ' w\n';
          var cap = { round: 1, square: 2 }[s['stroke-linecap']] || 0, join = { round: 1, bevel: 2 }[s['stroke-linejoin']] || 0;
          paint += cap + ' J\n' + join + ' j\n';
          if (s['stroke-miterlimit']) paint += f(+s['stroke-miterlimit']) + ' M\n';
          var da = s['stroke-dasharray'];
          paint += (da && da !== 'none' ? '[' + da.split(/[\s,]+/).filter(Boolean).map(Number).map(f).join(' ') + '] 0 d\n' : '[] 0 d\n');
        }
        var eo2 = s['fill-rule'] === 'evenodd';
        var opx = fillC && strokeC ? (eo2 ? 'B*' : 'B') : fillC ? (eo2 ? 'f*' : 'f') : 'S';
        return (open ? o : 'q\n' + o) + paint + geo + opx + '\nQ\n';
      };
      out += walk(root, {});
      return out + 'Q\n';
    });
  }

  /** adds operators as a new content stream, keeping the page's own drawing state isolated */
  function addStream(env, ops) {
    var ctx = env.doc.context, node = env.page.node;
    if (!env.page.__wrapped) {
      node.wrapContentStreams(ctx.register(ctx.stream('q\n')), ctx.register(ctx.stream('Q\n')));
      env.page.__wrapped = true;
    }
    node.addContentStream(ctx.register(ctx.flateStream(ops)));
  }

  global.Svg2Pdf = { draw: draw, addStream: addStream, parseTransform: parseTransform, mul: mul, pathOps: pathOps };
})(window);
