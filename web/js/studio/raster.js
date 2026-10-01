/*
 * Raster — shared helpers for figures (graphs, geometry, structures):
 *   Raster.fontCss(['Amiri'])            -> Promise<'@font-face{…base64…}'>  (fonts embedded so the SVG is self-contained)
 *   Raster.png(svgString, wPx, hPx, dpi) -> Promise<{dataUrl, pngBase64, widthPt, heightPt}>
 *   Raster.loadScripts([...])            -> sequential, cached script loader
 */
(function (global) {
  'use strict';
  var FILES = {
    'Amiri': 'Amiri', 'Noto Naskh Arabic': 'NotoNaskhArabic', 'Scheherazade New': 'ScheherazadeNew',
    'Noto Kufi Arabic': 'NotoKufiArabic', 'Cairo': 'Cairo'
  };
  var base = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/js\/studio\/raster\.js.*$/, '') : '';
  })();
  var cache = {};
  function b64(buf) {
    var bytes = new Uint8Array(buf), s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function face(family, weight) {
    var f = FILES[family];
    if (!f && global.UserFonts && UserFonts.isCustom(family)) return weight == 400 ? UserFonts.css(family) : Promise.resolve('');   // the user's own font (5.4)
    if (!f) return Promise.resolve('');
    var key = family + weight;
    if (!cache[key]) {
      cache[key] = fetch(base + 'fonts/arabic/' + f + '-' + weight + '.woff2').then(function (r) {
        if (!r.ok) throw new Error('font');
        return r.arrayBuffer();
      }).then(function (buf) {
        return '@font-face{font-family:"' + family + '";font-weight:' + weight + ';src:url(data:font/woff2;base64,' + b64(buf) + ') format("woff2");}';
      }).catch(function () { return ''; });
    }
    return cache[key];
  }
  function fontCss(families, bold) {
    var list = [];
    (families || []).forEach(function (f) { list.push(face(f, 400)); if (bold) list.push(face(f, 700)); });
    return Promise.all(list).then(function (a) { return a.join(''); });
  }

  function png(svg, w, h, dpi, transparent) {
    dpi = dpi || 300;
    var scale = dpi / 96;
    var max = 7000;                               // keep canvases in a safe size range
    if (w * scale > max) scale = max / w;
    if (h * scale > max) scale = max / h;
    return new Promise(function (resolve, reject) {
      var src = svg;
      if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(src)) src = src.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      var url = URL.createObjectURL(new Blob([src], { type: 'image/svg+xml;charset=utf-8' }));
      var img = new Image();
      img.onload = function () { setTimeout(draw, 40); };
      function draw() {
        var c = document.createElement('canvas');
        c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        var g = c.getContext('2d');
        if (!transparent) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
        g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var d = c.toDataURL('image/png');
        resolve({ dataUrl: d, pngBase64: d.slice(d.indexOf(',') + 1), widthPt: w * 0.75, heightPt: h * 0.75 });
      }
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('تعذّر تحويل الرسم إلى صورة')); };
      img.src = url;
    });
  }

  var loaded = {};
  function loadScripts(list) {
    return list.reduce(function (p, src) {
      return p.then(function () {
        if (loaded[src]) return loaded[src];
        loaded[src] = new Promise(function (res, rej) {
          var s = document.createElement('script');
          s.src = base + src; s.onload = res; s.onerror = function () { delete loaded[src]; rej(new Error('load ' + src)); };
          document.head.appendChild(s);
        });
        return loaded[src];
      });
    }, Promise.resolve());
  }

  // Arabic-Indic digits
  function digits(s, eastern) {
    s = String(s);
    if (!eastern) return s.replace(/-/g, '−');
    return s.replace(/[0-9]/g, function (d) { return String.fromCharCode(0x0660 + +d); }).replace(/\./g, '٫').replace(/-/g, '−');
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // Lay out a short label word by word, so mixed Arabic/number labels ("٥ سم", "المساحة ≈ ٢") read correctly
  // in every renderer (SVG <text> bidi support differs between browsers and image rasterizers).
  function words(x, y, str, attrs, fs, rtl) {
    var ws = String(str).trim().split(/\s+/).filter(Boolean);
    attrs = attrs || '';
    var hasAr = /[\u0600-\u06FF]/.test(str), mixed = hasAr && /[0-9A-Za-z\u0660-\u0669()\[\]\u0370-\u03FF=≈<>+−]/.test(str);
    if (!mixed) ws = [ws.join(' ')];
    if (ws.length <= 1) return '<text x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" text-anchor="middle" direction="ltr"' + attrs + '>' + esc(ws[0] || '') + '</text>';
    if (rtl) ws = ws.map(function (t) { var m = t.match(/^([\s\S]*?)([،,؛;:.]+)$/); return m && m[1] ? m[2] + m[1] : t; });   // trailing comma sits on the left in RTL
    var w = ws.map(function (t) { return t.length * fs * (/[\u0600-\u06FF]/.test(t) ? 0.38 : 0.52) + 1; });
    var gap = fs * 0.28, total = w.reduce(function (a, b) { return a + b; }, 0) + gap * (ws.length - 1);
    var out = '', cur = rtl ? x + total / 2 : x - total / 2;
    ws.forEach(function (t, i) {
      if (rtl) { out += '<text x="' + (cur - w[i] / 2).toFixed(2) + '" y="' + y.toFixed(2) + '" text-anchor="middle" direction="ltr"' + attrs + '>' + esc(t) + '</text>'; cur -= w[i] + gap; }
      else { out += '<text x="' + (cur + w[i] / 2).toFixed(2) + '" y="' + y.toFixed(2) + '" text-anchor="middle" direction="ltr"' + attrs + '>' + esc(t) + '</text>'; cur += w[i] + gap; }
    });
    return out;
  }

  global.Raster = { words: words, fontCss: fontCss, png: png, loadScripts: loadScripts, digits: digits, esc: esc, base: base };
})(window);
