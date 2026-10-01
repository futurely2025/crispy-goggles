/* Vector — turns a rendered SVG (equation, graph, geometry, chart…) into a self-contained vector SVG for Word.
 *  • every <text> becomes glyph outlines: the text is shaped with HarfBuzz using the very same font files the
 *    browser used, and each cluster is placed exactly where the browser laid it out (getExtentOfChar), so
 *    bidi, tspans, baseline shifts and anchors match the on-screen preview;
 *  • CSS (classes, <style>, style="…", currentColor) is resolved into plain presentation attributes and nested
 *    <svg> viewports become <g transform>, so any SVG renderer (Word, PowerPoint, PDF export) draws it the same.
 * No network service is involved: HarfBuzz runs locally (WebAssembly) and the fonts ship with the add-in. */
(function (global) {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var VER = '?v=5.0.0';
  var base = (function () {
    try { var s = document.currentScript && document.currentScript.src; if (s) return s.replace(/js\/core\/vector\.js[\s\S]*$/, ''); } catch (e) { /* ignore */ }
    return '';
  })();

  // family (lower-case) -> font file prefix in fonts/vector/
  var ARABIC = { 'amiri': 'Amiri', 'noto naskh arabic': 'NotoNaskhArabic', 'scheherazade new': 'ScheherazadeNew', 'noto kufi arabic': 'NotoKufiArabic', 'cairo': 'Cairo' };
  var SANS = /(arial|helvetica|sans|cairo|kufi|segoe|tahoma|verdana|calibri|arimo)/i;
  var SYM = 'STIXTwoMath-sym';

  var hb = null, hbP = null, fonts = {}, fontP = {};

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = function () { res(); }; s.onerror = function () { rej(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadHB() {
    if (hbP) return hbP;
    hbP = (typeof global.createHarfBuzz === 'function' ? Promise.resolve() : loadScript(base + 'vendor/harfbuzz/hb.js' + VER))
      .then(function () { return typeof global.hbjs === 'function' ? null : loadScript(base + 'vendor/harfbuzz/hbjs.js' + VER); })
      .then(function () { return global.createHarfBuzz({ locateFile: function (f) { return base + 'vendor/harfbuzz/' + f + VER; } }); })
      .then(function (inst) { hb = global.hbjs(inst); return hb; });
    hbP.catch(function () { hbP = null; });
    return hbP;
  }
  function loadFont(file) {
    if (fontP[file]) return fontP[file];
    var src = /^user:/.test(file) && global.UserFonts
      ? UserFonts.bytes(file.slice(5)).then(function (b) { if (!b) throw new Error('font ' + file + ' missing'); return b.slice(0); })
      : fetch(base + 'fonts/vector/' + file + '.ttf' + VER).then(function (r) {
        if (!r.ok) throw new Error('font ' + file + ': HTTP ' + r.status);
        return r.arrayBuffer();
      });
    fontP[file] = src.then(function (buf) {
      var blob = hb.createBlob(buf), face = hb.createFace(blob, 0), font = hb.createFont(face);
      var set = {};
      try { var u = face.collectUnicodes(); for (var i = 0; i < u.length; i++) set[u[i]] = 1; } catch (e) { set = null; }
      fonts[file] = { font: font, upem: face.upem || 1000, set: set, paths: {} };
      return fonts[file];
    });
    fontP[file].catch(function () { delete fontP[file]; });
    return fontP[file];
  }

  // ------------------------------------------------------------ font choice
  function families(cs) {
    return String(cs.fontFamily || '').split(',').map(function (f) { return f.trim().replace(/^["']|["']$/g, '').toLowerCase(); }).filter(Boolean);
  }
  function styleKeys(cs) {
    var bold = (parseInt(cs.fontWeight, 10) || 400) >= 600, italic = /italic|oblique/.test(cs.fontStyle || '');
    var fams = families(cs), ar = null;
    for (var i = 0; i < fams.length; i++) {
      if (ARABIC[fams[i]]) { ar = ARABIC[fams[i]] + (bold ? '-700' : '-400'); break; }
      if (global.UserFonts && UserFonts.isCustom(fams[i])) { ar = 'user:' + fams[i]; break; }        // the user's own font (5.4)
    }
    var sans = fams.length && SANS.test(fams[0]) && !/serif/.test(fams[0]) || (fams[0] === 'sans-serif');
    var latin = (sans ? 'Arimo-' : 'Tinos-') + (bold ? (italic ? 'BI' : 'B') : (italic ? 'I' : 'R'));
    return { ar: ar || 'Amiri' + (bold ? '-700' : '-400'), latin: latin, primaryIsArabic: !!ar };
  }
  function isArabicLetter(c) {
    return (c >= 0x0600 && c <= 0x06FF && !(c >= 0x0660 && c <= 0x0669) && !(c >= 0x06F0 && c <= 0x06F9)) ||
      (c >= 0x0750 && c <= 0x077F) || (c >= 0x08A0 && c <= 0x08FF) || (c >= 0xFB50 && c <= 0xFDFF) || (c >= 0xFE70 && c <= 0xFEFF);
  }
  function has(file, cp) { var f = fonts[file]; return !!(f && (f.set ? f.set[cp] : true)); }
  function pickFont(keys, cp) {
    // same rule as the browser: the first family that has the character wins, then the fallbacks
    var arScript = cp >= 0x0600 && cp <= 0x06FF || cp >= 0x0750 && cp <= 0x077F || cp >= 0x08A0 && cp <= 0x08FF || cp >= 0xFB50 && cp <= 0xFEFF;
    var order = keys.primaryIsArabic || arScript ? [keys.ar, keys.latin, SYM] : [keys.latin, SYM, keys.ar];
    for (var i = 0; i < order.length; i++) if (has(order[i], cp)) return order[i];
    return null;
  }

  // ------------------------------------------------------------ text model
  // addressable characters of a <text>, with the element that styles each one (SVG white-space collapsing)
  function charList(text) {
    var list = [];
    (function walk(node, owner) {
      for (var n = node.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) { var s = n.nodeValue; for (var i = 0; i < s.length; i++) list.push({ ch: s[i], el: owner }); }
        else if (n.nodeType === 1 && /^(tspan|a|textPath)$/.test(n.localName)) walk(n, n);
      }
    })(text, text);
    var pre = text.getAttribute('xml:space') === 'preserve' || /pre/.test(getComputedStyle(text).whiteSpace || '');
    if (pre) return list.map(function (c) { if (/[\t\n\r]/.test(c.ch)) c.ch = ' '; return c; });
    var out = [];
    list.forEach(function (c) {
      var ws = /[ \t\n\r]/.test(c.ch);
      if (ws) { if (out.length && out[out.length - 1].ch !== ' ') out.push({ ch: ' ', el: c.el }); }
      else out.push(c);
    });
    while (out.length && out[out.length - 1].ch === ' ') out.pop();
    return out;
  }

  function transformPath(d, X, Y, k) {
    // glyph outline (font units, y up) → user space
    var i = 0;
    return d.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, function (num) {
      var v = +num, r = (i++ % 2 === 0) ? X + v * k : Y - v * k;
      return (Math.round(r * 100) / 100).toString();
    });
  }
  function glyphPath(file, gid) {
    var f = fonts[file];
    if (f.paths[gid] === undefined) f.paths[gid] = f.font.glyphToPath(gid);
    return f.paths[gid];
  }

  function paintOf(el) {
    var cs = getComputedStyle(el);
    return {
      fill: cs.fill, fillOpacity: cs.fillOpacity, stroke: cs.stroke, strokeWidth: parseFloat(cs.strokeWidth) || 0,
      strokeOpacity: cs.strokeOpacity, strokeLinejoin: cs.strokeLinejoin, paintOrder: cs.paintOrder || '',
      fontSize: parseFloat(cs.fontSize) || 16, keys: styleKeys(cs), hidden: cs.visibility === 'hidden' || cs.display === 'none'
    };
  }

  // shape + place every run of one <text>; returns [{owner, d}]
  function textToPaths(text) {
    var chars = charList(text), n = 0;
    try { n = text.getNumberOfChars(); } catch (e) { n = 0; }
    if (!n) return [];
    if (chars.length !== n) {
      // unusual white-space: fall back to the raw characters when the counts still disagree
      var raw = []; (function w(node, o) { for (var c = node.firstChild; c; c = c.nextSibling) { if (c.nodeType === 3) for (var i = 0; i < c.nodeValue.length; i++) raw.push({ ch: c.nodeValue[i], el: o }); else if (c.nodeType === 1) w(c, c); } })(text, text);
      if (raw.length === n) chars = raw; else chars = chars.slice(0, n);
    }
    var paints = new Map();
    var paint = function (el) { if (!paints.has(el)) paints.set(el, paintOf(el)); return paints.get(el); };
    var pos = chars.map(function (c, i) {
      try { var e = text.getExtentOfChar(i), s = text.getStartPositionOfChar(i); return { x: e.x, w: e.width, y: s.y }; } catch (err) { return null; }
    });
    // runs: same styling element, same font file, same direction; broken at spaces
    var runs = [], cur = null;
    chars.forEach(function (c, i) {
      var cp = c.ch.codePointAt(0);
      if (c.ch === ' ' || c.ch === ' ' || cp === 0x2061 || cp === 0x2062 || cp === 0x2063 || cp === 0x200B || !pos[i]) { cur = null; return; }
      var pt = paint(c.el);
      if (pt.hidden) { cur = null; return; }
      var file = pickFont(pt.keys, cp);
      if (!file) { cur = null; return; }
      var dir = isArabicLetter(cp) || (cp === 0x0640) ? 'rtl' : 'ltr';
      if (cur && cur.el === c.el && cur.file === file && (cur.dir === dir || (dir === 'rtl' && /[ً-ٰٟ]/.test(c.ch)))) { cur.idx.push(i); cur.s += c.ch; return; }
      cur = { el: c.el, file: file, dir: dir, idx: [i], s: c.ch };
      runs.push(cur);
    });
    var byOwner = new Map();
    runs.forEach(function (run) {
      var pt = paint(run.el), f = fonts[run.file], k = pt.fontSize / f.upem;
      var buf = hb.createBuffer();
      buf.addText(run.s);
      buf.setDirection(run.dir);
      buf.guessSegmentProperties();
      hb.shape(f.font, buf);
      var gl = buf.json();
      buf.destroy();
      // pen position of every glyph (visual order) and the left-most pen of every cluster
      var pen = 0, penMin = {};
      gl.forEach(function (g) { g.pen = pen; pen += g.ax; if (penMin[g.cl] === undefined || g.pen < penMin[g.cl]) penMin[g.cl] = g.pen; });
      var starts = Object.keys(penMin).map(Number).sort(function (a, b) { return a - b; });
      var range = {};
      starts.forEach(function (s, j) { range[s] = [s, j + 1 < starts.length ? starts[j + 1] : run.s.length]; });
      var d = '';
      gl.forEach(function (g) {
        var r = range[g.cl]; if (!r) return;
        var left = Infinity, y = null;
        for (var q = r[0]; q < r[1]; q++) {
          var p = pos[run.idx[q]]; if (!p) continue;
          if (p.x < left) left = p.x;
          if (y === null) y = p.y;
        }
        if (!isFinite(left) || y === null) return;
        var path = glyphPath(run.file, g.g);
        if (!path) return;
        d += transformPath(path, left + (g.pen - penMin[g.cl] + g.dx) * k, y - g.dy * k, k);
      });
      if (!d) return;
      if (!byOwner.has(run.el)) byOwner.set(run.el, '');
      byOwner.set(run.el, byOwner.get(run.el) + d);
    });
    var out = [];
    byOwner.forEach(function (d, el) { out.push({ paint: paint(el), d: d }); });
    return out;
  }

  function colorAttr(v) { return !v || v === 'none' ? 'none' : v; }
  function replaceText(text) {
    var parts = textToPaths(text);
    var parent = text.parentNode, wrap = document.createElementNS(SVGNS, 'g');
    var tr = text.getAttribute('transform');
    if (tr) wrap.setAttribute('transform', tr);
    var op = getComputedStyle(text).opacity;
    if (op && +op < 1) wrap.setAttribute('opacity', op);
    parts.forEach(function (p) {
      var pt = p.paint;
      var halo = pt.stroke && pt.stroke !== 'none' && pt.strokeWidth > 0;
      if (halo && /^stroke/.test(pt.paintOrder)) {
        // outline first (a white halo behind the letters), then the letters — no reliance on paint-order support
        var h = document.createElementNS(SVGNS, 'path');
        h.setAttribute('d', p.d); h.setAttribute('fill', colorAttr(pt.stroke)); h.setAttribute('stroke', colorAttr(pt.stroke));
        h.setAttribute('stroke-width', pt.strokeWidth.toFixed(2)); h.setAttribute('stroke-linejoin', pt.strokeLinejoin || 'round');
        if (+pt.strokeOpacity < 1) { h.setAttribute('stroke-opacity', pt.strokeOpacity); h.setAttribute('fill-opacity', pt.strokeOpacity); }
        wrap.appendChild(h);
        halo = false;
      }
      var e = document.createElementNS(SVGNS, 'path');
      e.setAttribute('d', p.d);
      e.setAttribute('fill', colorAttr(pt.fill));
      if (+pt.fillOpacity < 1) e.setAttribute('fill-opacity', pt.fillOpacity);
      if (halo) { e.setAttribute('stroke', colorAttr(pt.stroke)); e.setAttribute('stroke-width', pt.strokeWidth.toFixed(2)); }
      else e.setAttribute('stroke', 'none');
      wrap.appendChild(e);
    });
    parent.insertBefore(wrap, text);
    parent.removeChild(text);
  }

  // ------------------------------------------------------------ CSS → attributes
  var SHAPES = { path: 1, rect: 1, circle: 1, ellipse: 1, line: 1, polyline: 1, polygon: 1 };
  function num(v) { var f = parseFloat(v); return isNaN(f) ? null : Math.round(f * 1000) / 1000; }
  function flatten(svg) {
    Array.prototype.slice.call(svg.querySelectorAll('style,title,desc,metadata,script')).forEach(function (s) { s.parentNode.removeChild(s); });
    var all = [svg].concat(Array.prototype.slice.call(svg.querySelectorAll('*')));
    // resolve computed paint first (while the stylesheet still applies), then strip CSS
    var jobs = all.map(function (el) {
      var tag = el.localName, a = {};
      if (SHAPES[tag] && !el.closest('clipPath')) {
        var cs = getComputedStyle(el);
        a.fill = colorAttr(cs.fill);
        if (+cs.fillOpacity < 1) a['fill-opacity'] = cs.fillOpacity;
        if (cs.fillRule === 'evenodd') a['fill-rule'] = 'evenodd';
        a.stroke = colorAttr(cs.stroke);
        if (a.stroke !== 'none') {
          a['stroke-width'] = num(cs.strokeWidth);
          if (+cs.strokeOpacity < 1) a['stroke-opacity'] = cs.strokeOpacity;
          if (cs.strokeDasharray && cs.strokeDasharray !== 'none') a['stroke-dasharray'] = cs.strokeDasharray.split(/[\s,]+/).map(num).join(' ');
          if (cs.strokeLinecap && cs.strokeLinecap !== 'butt') a['stroke-linecap'] = cs.strokeLinecap;
          if (cs.strokeLinejoin && cs.strokeLinejoin !== 'miter') a['stroke-linejoin'] = cs.strokeLinejoin;
        }
        if (+cs.opacity < 1) a.opacity = cs.opacity;
        if (cs.visibility === 'hidden' || cs.display === 'none') a.__hide = 1;
      } else if (tag === 'g' || (tag === 'svg' && el !== svg)) {
        var cg = getComputedStyle(el);
        if (+cg.opacity < 1) a.opacity = cg.opacity;
        if (cg.display === 'none') a.__hide = 1;
      } else if (tag === 'clipPath') {
        Array.prototype.forEach.call(el.children, function (c) { if (getComputedStyle(c).clipRule === 'evenodd') c.setAttribute('clip-rule', 'evenodd'); });
      }
      if (tag === 'svg' && el !== svg) a.__vp = viewportTransform(el);
      // CSS transforms (style="transform: translateX(…)") become a transform attribute
      if (/transform/.test(el.getAttribute('style') || '') || (el.getAttribute('class') && !el.hasAttribute('transform'))) {
        var tf = getComputedStyle(el).transform;
        if (tf && tf !== 'none') a.transform = tf.replace(/,\s*/g, ' ');
      }
      return { el: el, a: a };
    });
    jobs.forEach(function (j) {
      var el = j.el;
      if (j.a.__hide) { if (el.parentNode) el.parentNode.removeChild(el); return; }
      Array.prototype.slice.call(el.attributes).forEach(function (at) {
        if (/^(class|style|color|data-|aria-|role|focusable|font-|text-|dominant-baseline|paint-order|overflow|preserveAspectRatio)/.test(at.name) && at.name !== 'clip-path') el.removeAttribute(at.name);
        // paint lives on the shapes themselves now (groups may carry currentColor, which not every renderer knows)
        else if (!SHAPES[el.localName] && /^(fill|stroke)/.test(at.name)) el.removeAttribute(at.name);
      });
      Object.keys(j.a).forEach(function (k) { if (k.indexOf('__') !== 0 && j.a[k] !== null && j.a[k] !== undefined) el.setAttribute(k, j.a[k]); });
      if (j.a.__vp !== undefined) {
        // nested viewport → plain group
        var g = document.createElementNS(SVGNS, 'g');
        if (j.a.__vp) g.setAttribute('transform', j.a.__vp);
        if (j.a.opacity) g.setAttribute('opacity', j.a.opacity);
        while (el.firstChild) g.appendChild(el.firstChild);
        el.parentNode.replaceChild(g, el);
      }
    });
    // a mask that only punches holes (white rectangle + black shapes) in a group of lines — bonds stopping short
    // of atom labels — is replaced by white covers drawn right above the group (masks are poorly supported)
    Array.prototype.slice.call(svg.querySelectorAll('[mask]')).forEach(function (g) {
      var id = (g.getAttribute('mask').match(/#([^)"']+)/) || [])[1], mk = id && svg.querySelector('mask[id="' + id + '"]');
      if (!mk) return;
      var kids = Array.prototype.slice.call(mk.children), holes = kids.filter(function (k) { return /^(#000|#000000|black|rgb\(0, 0, 0\))$/i.test(k.getAttribute('fill') || ''); });
      var linesOnly = !g.querySelector('rect,polygon,path[fill]:not([fill="none"]),circle[fill]:not([fill="none"]),ellipse,text');
      if (!holes.length || holes.length !== kids.length - 1 || !linesOnly) return;
      var cover = document.createElementNS(SVGNS, 'g');
      holes.forEach(function (h) { var c = h.cloneNode(true); c.setAttribute('fill', '#ffffff'); c.setAttribute('stroke', 'none'); cover.appendChild(c); });
      g.removeAttribute('mask');
      g.parentNode.insertBefore(cover, g.nextSibling);
      mk.parentNode.removeChild(mk);
    });
    // empty groups left behind
    Array.prototype.slice.call(svg.querySelectorAll('g')).reverse().forEach(function (g) { if (!g.firstElementChild && g.parentNode) g.parentNode.removeChild(g); });
  }
  function viewportTransform(el) {
    var x = el.x.baseVal.value || 0, y = el.y.baseVal.value || 0;
    var w = el.width.baseVal.value, h = el.height.baseVal.value, vb = el.viewBox && el.viewBox.baseVal;
    var t = (x || y) ? 'translate(' + num(x) + ' ' + num(y) + ')' : '';
    if (vb && vb.width && vb.height && w && h) {
      var sx = w / vb.width, sy = h / vb.height, par = el.getAttribute('preserveAspectRatio') || '';
      if (!/none/.test(par)) {
        var s = /slice/.test(par) ? Math.max(sx, sy) : Math.min(sx, sy);
        var ox = /xMin/.test(par) ? 0 : /xMax/.test(par) ? w - vb.width * s : (w - vb.width * s) / 2;
        var oy = /YMin/.test(par) ? 0 : /YMax/.test(par) ? h - vb.height * s : (h - vb.height * s) / 2;
        t += ' translate(' + num(ox) + ' ' + num(oy) + ') scale(' + num(s) + ')';
      } else t += ' scale(' + num(sx) + ' ' + num(sy) + ')';
      if (vb.x || vb.y) t += ' translate(' + num(-vb.x) + ' ' + num(-vb.y) + ')';
    }
    return t.trim();
  }

  // @font-face rules inside the SVG's own <style> do not apply inside a shadow root: register them on the document
  var registered = {};
  function registerFaces(svgString) {
    if (!global.FontFace || !document.fonts) return Promise.resolve();
    var jobs = [], re = /@font-face\s*\{([^}]*)\}/g, m;
    while ((m = re.exec(svgString))) {
      var body = m[1];
      var fam = (body.match(/font-family\s*:\s*["']?([^;"']+)["']?/) || [])[1];
      var src = (body.match(/src\s*:\s*(url\([^)]*\)[^;]*)/) || [])[1];
      if (!fam || !src) continue;
      var weight = (body.match(/font-weight\s*:\s*([^;]+)/) || [])[1] || '400';
      var style = (body.match(/font-style\s*:\s*([^;]+)/) || [])[1] || 'normal';
      var key = fam + '|' + weight + '|' + style + '|' + src.length + '|' + src.slice(-40);
      if (registered[key]) { jobs.push(registered[key]); continue; }
      try {
        var ff = new FontFace(fam.trim(), src.trim(), { weight: weight.trim(), style: style.trim() });
        document.fonts.add(ff);
        registered[key] = ff.load().catch(function () {});
        jobs.push(registered[key]);
      } catch (e) { /* ignore a bad rule */ }
    }
    return Promise.all(jobs);
  }

  function waitFonts(svg) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var want = {};
    Array.prototype.forEach.call(svg.querySelectorAll('text,tspan'), function (t) {
      var cs = getComputedStyle(t);
      want[(parseInt(cs.fontWeight, 10) >= 600 ? '700 ' : '400 ') + (/italic/.test(cs.fontStyle) ? 'italic ' : '') + '16px ' + cs.fontFamily] = 1;
    });
    return Promise.all(Object.keys(want).map(function (f) { return document.fonts.load(f, 'أب12').catch(function () {}); }))
      .then(function () { return document.fonts.ready; });
  }

  /** svgString → Promise<vector svgString> */
  function fromSVG(svgString) {
    var host;
    return Promise.all([loadHB(), registerFaces(svgString)]).then(function () {
      host = document.createElement('div');
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:fixed;left:-40000px;top:0;opacity:0;pointer-events:none;';
      // isolated like a stand-alone .svg file: no page CSS (shadow DOM), left-to-right, default font size
      document.body.appendChild(host);
      var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
      root.innerHTML = '<div dir="ltr" style="all:initial;display:block;direction:ltr;unicode-bidi:isolate;font-size:16px;font-family:serif;line-height:normal;white-space:normal">' + svgString + '</div>';
      var svg = root.querySelector('svg');
      if (!svg) throw new Error('no svg');
      return waitFonts(svg).then(function () {
        var texts = Array.prototype.slice.call(svg.querySelectorAll('text')).filter(function (t) { return !t.closest('defs,clipPath,mask'); });
        var need = {};
        texts.forEach(function (t) {
          [t].concat(Array.prototype.slice.call(t.querySelectorAll('tspan'))).forEach(function (el) {
            var k = styleKeys(getComputedStyle(el)); need[k.ar] = 1; need[k.latin] = 1;
          });
        });
        return Promise.all(Object.keys(need).map(loadFont)).then(function () {
          // symbols font only when something is still missing
          var missing = texts.some(function (t) {
            var k = styleKeys(getComputedStyle(t));
            return Array.prototype.some.call(t.textContent, function (ch) { var cp = ch.codePointAt(0); return cp > 0x20 && !has(k.ar, cp) && !has(k.latin, cp); });
          });
          return missing ? loadFont(SYM).catch(function () {}) : null;
        }).then(function () {
          texts.forEach(replaceText);
          flatten(svg);
          svg.setAttribute('xmlns', SVGNS);
          svg.removeAttribute('xmlns:xlink');
          var out = new XMLSerializer().serializeToString(svg);
          return out.replace(/ xmlns:xlink="[^"]*"/g, '');
        });
      });
    }).then(function (out) { if (host && host.parentNode) host.parentNode.removeChild(host); return out; },
      function (e) { if (host && host.parentNode) host.parentNode.removeChild(host); throw e; });
  }

  function toBase64(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  global.Vector = {
    fromSVG: fromSVG,
    toBase64: toBase64,
    ready: function () { return loadHB(); },
    supported: function () { return typeof WebAssembly === 'object' && typeof fetch === 'function'; },
    setBase: function (b) { base = b || ''; }
  };
})(window);
