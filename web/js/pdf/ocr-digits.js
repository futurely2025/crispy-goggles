/* PdfOcrDigits — a small neural digit reader for the OCR engine.
 *
 * Tesseract's Arabic model is weak on the Arabic-Indic digits (٣٤٥ …). Here every numeric word is cut into its glyphs (connected components),
 * each glyph is classified by a tiny MLP trained on synthetic renderings (many Arabic and Latin fonts, heavy augmentation),
 * and the word is read left → right (numbers are written left to right even inside Arabic text).
 *
 * Classes: 0–8 = ١…٩   9–18 = 0…9 (Western)   19 = "other" (letters, noise, glued glyphs → leave the word to Tesseract)   20 = «/»   21 = «+».
 * The Arabic-Indic zero «٠» is a dot: it is told apart from a decimal point by its height above the baseline.
 */
(function (global) {
  'use strict';
  var N = 24, SZ = N * N, NF = SZ + 1, model = null;
  var EAST = '١٢٣٤٥٦٧٨٩', WEST = '0123456789';
  function labelChar(c) { return c < 9 ? EAST[c] : c < 19 ? WEST[c - 9] : c === 20 ? '/' : c === 21 ? '+' : ''; }

  // ------------------------------------------------------------ connected components of a binary image (ink = 0) inside a rect
  function components(bin, rect) {
    var W = bin.w, x0 = Math.max(0, rect.x0 | 0), y0 = Math.max(0, rect.y0 | 0), x1 = Math.min(bin.w - 1, rect.x1 | 0), y1 = Math.min(bin.h - 1, rect.y1 | 0), w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w < 3 || h < 3) return [];
    var lab = new Int32Array(w * h), comps = [], stack = [], x, y, id = 0;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      if (lab[y * w + x] || bin.g[(y0 + y) * W + x0 + x] > 127) continue;
      id++; var c = { id: id, x0: x, y0: y, x1: x, y1: y, n: 0, px: [] }; stack.length = 0; stack.push(x, y); lab[y * w + x] = id;
      while (stack.length) {
        var cy = stack.pop(), cx = stack.pop(); c.n++; c.px.push(cx, cy);
        if (cx < c.x0) c.x0 = cx; if (cx > c.x1) c.x1 = cx; if (cy < c.y0) c.y0 = cy; if (cy > c.y1) c.y1 = cy;
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h || lab[ny * w + nx] || bin.g[(y0 + ny) * W + x0 + nx] > 127) continue;
          lab[ny * w + nx] = id; stack.push(nx, ny);
        }
      }
      comps.push(c);
    }
    comps.forEach(function (c) { c.ox = x0; c.oy = y0; });
    return comps;
  }

  // ------------------------------------------------------------ features: the glyph mask fitted into 20x20 (aspect kept) centred in 24x24, plus the aspect ratio
  var tmp = null;
  function featuresOf(mask, mw, mh) {
    // mask: Uint8Array mw*mh with 1 = ink
    if (!tmp) { tmp = { a: document.createElement('canvas'), b: document.createElement('canvas') }; tmp.b.width = tmp.b.height = N; }
    var a = tmp.a, k = Math.min(20 / mw, 20 / mh);
    a.width = mw; a.height = mh;
    var ax = a.getContext('2d'), id = ax.createImageData(mw, mh), i;
    for (i = 0; i < mask.length; i++) { var v = mask[i] ? 0 : 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    ax.putImageData(id, 0, 0);
    var bx = tmp.b.getContext('2d', { willReadFrequently: true }); bx.fillStyle = '#fff'; bx.fillRect(0, 0, N, N); bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = 'high';
    var dw = Math.max(1, mw * k), dh = Math.max(1, mh * k); bx.drawImage(a, (N - dw) / 2, (N - dh) / 2, dw, dh);
    var d = bx.getImageData(0, 0, N, N).data, f = new Float32Array(NF);
    for (i = 0; i < SZ; i++) f[i] = 1 - d[i * 4] / 255;
    f[SZ] = Math.max(0, Math.min(2.5, mw / mh)) / 2.5;
    return f;
  }
  function maskOf(c) { var w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1, m = new Uint8Array(w * h), i; for (i = 0; i < c.px.length; i += 2) m[(c.px[i + 1] - c.y0) * w + c.px[i] - c.x0] = 1; return { m: m, w: w, h: h }; }

  // ------------------------------------------------------------ the network: NF → H1 (relu) → H2 (relu) → classes (softmax)
  function forward(f) {
    var M = model, h1 = new Float32Array(M.h1), h2 = new Float32Array(M.h2), o = new Float32Array(M.out), i, j, s;
    for (j = 0; j < M.h1; j++) { s = M.b1[j]; for (i = 0; i < NF; i++) s += f[i] * M.w1[i * M.h1 + j]; h1[j] = s > 0 ? s : 0; }
    for (j = 0; j < M.h2; j++) { s = M.b2[j]; for (i = 0; i < M.h1; i++) s += h1[i] * M.w2[i * M.h2 + j]; h2[j] = s > 0 ? s : 0; }
    var mx = -1e9; for (j = 0; j < M.out; j++) { s = M.b3[j]; for (i = 0; i < M.h2; i++) s += h2[i] * M.w3[i * M.out + j]; o[j] = s; if (s > mx) mx = s; }
    var sum = 0; for (j = 0; j < M.out; j++) { o[j] = Math.exp(o[j] - mx); sum += o[j]; } for (j = 0; j < M.out; j++) o[j] /= sum;
    return o;
  }
  function classify(f) { var o = forward(f), b = 0, j; for (j = 1; j < o.length; j++) if (o[j] > o[b]) b = j; return { cls: b, p: o[b], probs: o }; }

  function setModel(m) {
    function arr(a) { return Float32Array.from(a); }
    model = { h1: m.h1, h2: m.h2, out: m.out, w1: arr(m.w1), b1: arr(m.b1), w2: arr(m.w2), b2: arr(m.b2), w3: arr(m.w3), b3: arr(m.b3) };
  }
  var loading = null;
  function load(base) {
    if (model) return Promise.resolve(true);
    if (loading) return loading;
    loading = fetch(base + 'vendor/tesseract/digits.json').then(function (r) { if (!r.ok) throw new Error('no digits model'); return r.json(); }).then(function (m) { setModel(m); return true; }).catch(function () { return false; });
    return loading;
  }

  // ------------------------------------------------------------ reading a numeric word
  /** bin: {w,h,g} binary page (ink 0); box: word rect in the same pixels; band: typical text line band height (px).
   *  Returns {text, conf, west, east} or null when the word is not clearly a number. */
  function readNumber(bin, box, band) {
    if (!model) return null;
    var pad = Math.round((box.y1 - box.y0) * 0.12), comps = components(bin, { x0: box.x0 - pad, y0: box.y0 - pad, x1: box.x1 + pad, y1: box.y1 + pad });
    // only glyphs that belong to the word (their centre is inside its box), and not specks
    comps = comps.filter(function (c) {
      var cx = c.ox + (c.x0 + c.x1) / 2, cy = c.oy + (c.y0 + c.y1) / 2;
      return cx >= box.x0 - 2 && cx <= box.x1 + 2 && cy >= box.y0 - pad && cy <= box.y1 + pad && c.n >= 3;
    });
    if (!comps.length) return null;
    comps.forEach(function (c) { c.X0 = c.ox + c.x0; c.X1 = c.ox + c.x1; c.Y0 = c.oy + c.y0; c.Y1 = c.oy + c.y1; c.w = c.X1 - c.X0 + 1; c.h = c.Y1 - c.Y0 + 1; });
    comps.sort(function (a, b) { return a.X0 - b.X0; });
    var maxH = Math.max.apply(null, comps.map(function (c) { return c.h; }));
    if (band && maxH > band * 1.9) return null;
    var tall = comps.filter(function (c) { return c.h >= maxH * 0.55; });
    var top = Math.min.apply(null, tall.map(function (c) { return c.Y0; })), base = Math.max.apply(null, tall.map(function (c) { return c.Y1; })), mid = (top + base) / 2, dh = base - top + 1;
    var toks = [], conf = 1, west = 0, east = 0, i, c;
    for (i = 0; i < comps.length; i++) {
      c = comps[i];
      if (c.h <= dh * 0.34 && c.w <= dh * 0.55 && c.h < maxH * 0.5) { toks.push({ k: 'dot', c: c }); continue; }       // a point, or the Arabic zero
      if (c.h <= dh * 0.22 && c.w >= dh * 0.3) { toks.push({ k: 'bar', c: c }); continue; }                              // a minus / hyphen / one bar of «=»
      if (c.h < dh * 0.5) return null;
      var mk = maskOf({ x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, px: c.px }), r = classify(featuresOf(mk.m, mk.w, mk.h));
      if (r.cls === 19 || r.p < 0.6) return null;
      var ch = labelChar(r.cls); if (!ch) return null;
      toks.push({ k: 'g', ch: ch, p: r.p, c: c }); conf = Math.min(conf, r.p);
      if (r.cls < 9) east++; else if (r.cls < 19) west++;
    }
    if (!toks.some(function (t) { return t.k === 'g' && /[0-9١-٩]/.test(t.ch); })) return null;                           // at least one real digit
    if (east && west) return null;                                                                                    // never mix the two scripts
    var out = '';
    for (i = 0; i < toks.length; i++) {
      var t = toks[i], nx = toks[i + 1];
      if (t.k === 'g') { out += t.ch; continue; }
      if (t.k === 'bar') {
        if (nx && nx.k === 'bar' && Math.abs(nx.c.X0 - t.c.X0) < dh * 0.3) { out += '='; i++; } else out += '-';
        continue;
      }
      // dots: two stacked dots are a colon; a dot on the baseline is a point; a dot around half height is the Arabic zero
      if (nx && nx.k === 'dot' && Math.abs((nx.c.X0 + nx.c.X1) / 2 - (t.c.X0 + t.c.X1) / 2) < dh * 0.25 && Math.abs(nx.c.Y0 - t.c.Y0) > dh * 0.25) { out += ':'; i++; continue; }
      var cy = (t.c.Y0 + t.c.Y1) / 2;
      if (cy > base - dh * 0.22) out += (east ? '٫' : '.');
      else if (Math.abs(cy - mid) < dh * 0.3 && !west) { out += '٠'; east++; }
      else return null;
    }
    if (/^[.٫:\-=]|[.٫:\-=]$/.test(out)) return null;
    return { text: out, conf: conf * 100, west: west, east: east };
  }

  global.PdfOcrDigits = { load: load, setModel: setModel, readNumber: readNumber, components: components, featuresOf: featuresOf, maskOf: maskOf, classify: classify, labelChar: labelChar, NF: NF, N: N, isReady: function () { return !!model; } };
})(window);
