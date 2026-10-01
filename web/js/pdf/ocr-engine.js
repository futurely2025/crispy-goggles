/* PdfOcrEngine — high-accuracy offline OCR (Arabic + English) for the studio and the tools.
 *
 *  1. Image preparation  : grayscale → text-size estimate → resample to the size the LSTM likes → shading (uneven light) removal →
 *                          skew detection and correction → denoise / sharpen → Sauvola adaptive binarisation (variants).
 *  2. Recognition        : Tesseract LSTM ("best" float models or the fast ones), several passes on different image variants,
 *                          then the best reading of every text line is kept (line-level voting by confidence).
 *  3. Post-processing   : punctuation and spacing rules for Arabic, stray-symbol removal, digit unification,
 *                          and a dictionary pass that repairs low-confidence words confused through dots / hamza / ta-marbuta.
 *
 *  Everything runs in the browser from vendor/tesseract (no network).
 *  API:  PdfOcrEngine.recognize(canvas, opts) → Promise<{text, lines, words, conf, passes, angle}>
 */
(function (global) {
  'use strict';
  var base = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/js\/pdf\/ocr-engine\.js.*$/, '') : ''; })();

  // ================================================================ small helpers
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('تعذّر تحميل ' + src)); }; document.head.appendChild(s); }); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ================================================================ 1. image preparation
  function grayOf(cv) {
    var w = cv.width, h = cv.height, d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, g = new Uint8ClampedArray(w * h), i, j;
    for (i = 0, j = 0; j < g.length; i += 4, j++) g[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    return { w: w, h: h, g: g };
  }
  function canvasOf(img) {
    var c = mk(img.w, img.h), x = c.getContext('2d'), d = x.createImageData(img.w, img.h), a = d.data, g = img.g, i, j;
    for (i = 0, j = 0; j < g.length; i += 4, j++) { a[i] = a[i + 1] = a[i + 2] = g[j]; a[i + 3] = 255; }
    x.putImageData(d, 0, 0); return c;
  }
  function otsu(g, step) {
    var hist = new Float64Array(256), n = 0, i;
    for (i = 0; i < g.length; i += step || 1) { hist[g[i]]++; n++; }
    var sum = 0, t; for (t = 0; t < 256; t++) sum += t * hist[t];
    var sB = 0, wB = 0, best = 0, th = 128;
    for (t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; var wF = n - wB; if (!wF) break; sB += t * hist[t]; var mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; th = t; } }
    return th;
  }
  /** resample a gray image with a high-quality canvas pipeline (step-wise halving when shrinking) */
  function resize(img, k) {
    if (Math.abs(k - 1) < 0.02) return img;
    var src = canvasOf(img), w = img.w, h = img.h, tw = Math.max(8, Math.round(img.w * k)), th = Math.max(8, Math.round(img.h * k)), cur = src;
    while (cur.width * 0.5 > tw && cur.height * 0.5 > th) { var half = mk(cur.width / 2, cur.height / 2), hx = half.getContext('2d'); hx.imageSmoothingEnabled = true; hx.imageSmoothingQuality = 'high'; hx.drawImage(cur, 0, 0, half.width, half.height); cur = half; }
    var out = mk(tw, th), ox = out.getContext('2d'); ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = 'high'; ox.drawImage(cur, 0, 0, tw, th);
    return grayOf(out);
  }
  /** row bands of ink: [{y0,y1}] using an Otsu binarisation of the (already de-skewed) image */
  function bands(img, th) {
    var w = img.w, h = img.h, g = img.g, rows = new Float32Array(h), y, x, i;
    for (y = 0; y < h; y++) { var c = 0, o = y * w; for (x = 0; x < w; x++) if (g[o + x] < th) c++; rows[y] = c; }
    var mx = 0; for (y = 0; y < h; y++) mx = Math.max(mx, rows[y]);
    // smooth over 3 rows and threshold at a small fraction of the busiest row
    var sm = new Float32Array(h); for (y = 0; y < h; y++) sm[y] = ((rows[y - 1] || 0) + rows[y] + (rows[y + 1] || 0)) / 3;
    var cut = Math.max(1, mx * 0.04), out = [], cur = null;
    for (y = 0; y < h; y++) { if (sm[y] > cut) { if (!cur) cur = { y0: y, y1: y }; else cur.y1 = y; } else if (cur) { out.push(cur); cur = null; } }
    if (cur) out.push(cur);
    // merge bands separated by tiny gaps (dots, diacritics) and drop specks
    var med = medianOf(out.map(function (b) { return b.y1 - b.y0 + 1; })) || 1, merged = [];
    out.forEach(function (b) { var last = merged[merged.length - 1]; if (last && b.y0 - last.y1 < med * 0.22) last.y1 = b.y1; else merged.push({ y0: b.y0, y1: b.y1 }); });
    return merged.filter(function (b) { return b.y1 - b.y0 + 1 >= Math.max(5, med * 0.3); });
  }
  function medianOf(a) { if (!a.length) return 0; a = a.slice().sort(function (x, y) { return x - y; }); return a[a.length >> 1]; }

  /** typical text-line band height and line pitch (px) of an upright, flattened image */
  function lineMetrics(img) {
    var small = img, k = 1;
    if (Math.max(img.w, img.h) > 1500) { k = 1500 / Math.max(img.w, img.h); small = resize(img, k); }
    small = blur(small, 0.8);
    var bin = sauvola(small, clamp((Math.round(Math.min(small.w, small.h) / 14) | 1), 15, 61), 0.25), bs = bands(bin, 128);
    if (!bs.length) return { band: 0, pitch: 0, n: 0 };
    var hs = bs.map(function (b) { return b.y1 - b.y0 + 1; }), m = medianOf(hs), typ = hs.filter(function (v) { return v < m * 1.8; }), band = medianOf(typ), pitch = 0;
    if (bs.length >= 3) {
      var gaps = []; for (var i = 1; i < bs.length; i++) gaps.push((bs[i].y0 + bs[i].y1) / 2 - (bs[i - 1].y0 + bs[i - 1].y1) / 2);
      pitch = medianOf(gaps);
      // bands that merged (touching lines) make the band too tall: trust the pitch then
      if (band > pitch * 0.82) band = pitch * 0.62;
    }
    return { band: band / k, pitch: pitch / k, n: bs.length };
  }
  function lineHeight(img) { return lineMetrics(img).band; }

  /** background (paper) estimation → divide it out: removes shadows, gradients, yellowing */
  function flatten(img, bandH) {
    var w = img.w, h = img.h, g = img.g, f = Math.max(2, Math.round(Math.min(w, h) / 160)), sw = Math.ceil(w / f), sh = Math.ceil(h / f), sm = new Float32Array(sw * sh), x, y, i, j;
    for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) { var s = 0, n = 0; for (j = 0; j < f && y * f + j < h; j++) for (i = 0; i < f && x * f + i < w; i++) { s += g[(y * f + j) * w + x * f + i]; n++; } sm[y * sw + x] = s / n; }
    // grey closing (dilate then erode) with a radius bigger than a letter stroke removes the ink, leaving paper
    var r = Math.max(2, Math.round((bandH || 40) * 0.9 / f));
    function morph(src, isMax) {
      var tmp = new Float32Array(sw * sh), out = new Float32Array(sw * sh), a, b, v, k;
      for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) { v = isMax ? -1 : 1e9; for (k = Math.max(0, x - r); k <= Math.min(sw - 1, x + r); k++) { a = src[y * sw + k]; v = isMax ? (a > v ? a : v) : (a < v ? a : v); } tmp[y * sw + x] = v; }
      for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) { v = isMax ? -1 : 1e9; for (k = Math.max(0, y - r); k <= Math.min(sh - 1, y + r); k++) { b = tmp[k * sw + x]; v = isMax ? (b > v ? b : v) : (b < v ? b : v); } out[y * sw + x] = v; }
      return out;
    }
    var bg = morph(morph(sm, true), false);
    // smooth the background a little (3x3 box, twice)
    for (var rep = 0; rep < 2; rep++) { var t = new Float32Array(bg.length); for (y = 0; y < sh; y++) for (x = 0; x < sw; x++) { var ss = 0, nn = 0; for (j = -1; j <= 1; j++) for (i = -1; i <= 1; i++) { var yy = y + j, xx = x + i; if (yy >= 0 && yy < sh && xx >= 0 && xx < sw) { ss += bg[yy * sw + xx]; nn++; } } t[y * sw + x] = ss / nn; } bg = t; }
    var out = new Uint8ClampedArray(w * h);
    for (y = 0; y < h; y++) {
      var fy = clamp((y + 0.5) / f - 0.5, 0, sh - 1), y0 = fy | 0, y1 = Math.min(sh - 1, y0 + 1), wy = fy - y0;
      for (x = 0; x < w; x++) {
        var fx = clamp((x + 0.5) / f - 0.5, 0, sw - 1), x0 = fx | 0, x1 = Math.min(sw - 1, x0 + 1), wx = fx - x0;
        var b = (bg[y0 * sw + x0] * (1 - wx) + bg[y0 * sw + x1] * wx) * (1 - wy) + (bg[y1 * sw + x0] * (1 - wx) + bg[y1 * sw + x1] * wx) * wy;
        out[y * w + x] = clamp(g[y * w + x] / Math.max(40, b) * 255, 0, 255);
      }
    }
    return { w: w, h: h, g: out };
  }
  /** stretch the histogram so paper → 255 and ink → ~0 */
  function stretch(img) {
    var g = img.g, hist = new Uint32Array(256), i, n = g.length;
    for (i = 0; i < n; i++) hist[g[i]]++;
    var lo = 0, hi = 255, c = 0; for (i = 0; i < 256; i++) { c += hist[i]; if (c > n * 0.004) { lo = i; break; } }
    c = 0; for (i = 255; i >= 0; i--) { c += hist[i]; if (c > n * 0.35) { hi = i; break; } }          // the paper: the brightest third of the pixels
    if (hi - lo < 30) return img;
    var out = new Uint8ClampedArray(n), k = 255 / (hi - lo);
    for (i = 0; i < n; i++) out[i] = clamp((g[i] - lo) * k, 0, 255);
    return { w: img.w, h: img.h, g: out };
  }

  /** skew (degrees, + = clockwise page rotation needed) by maximising the sharpness of the row profile */
  function skewAngle(img) {
    var k = Math.min(1, 900 / Math.max(img.w, img.h)), s = k < 1 ? resize(img, k) : img, th = otsu(s.g, 2), pts = [], x, y, w = s.w, h = s.h;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (s.g[y * w + x] < th) pts.push(x, y);
    var n = pts.length / 2; if (n < 200) return 0;
    var stepP = Math.max(1, Math.floor(n / 60000)), cx = w / 2, cy = h / 2;
    function score(a) {
      var sn = Math.sin(a * Math.PI / 180), cs = Math.cos(a * Math.PI / 180), bins = new Float32Array(h * 2 + 4), i, off = h;
      for (i = 0; i < n; i += stepP) { var X = pts[2 * i] - cx, Y = pts[2 * i + 1] - cy, yy = Math.round(-X * sn + Y * cs + cy) + 2; if (yy >= 0 && yy < bins.length) bins[yy]++; }
      var sc = 0; for (i = 1; i < bins.length; i++) { var d = bins[i] - bins[i - 1]; sc += d * d; } return sc;
    }
    var best = 0, bs = -1, a;
    for (a = -8; a <= 8.001; a += 0.5) { var v = score(a); if (v > bs) { bs = v; best = a; } }
    for (a = best - 0.5; a <= best + 0.501; a += 0.1) { var v2 = score(a); if (v2 > bs) { bs = v2; best = a; } }
    for (a = best - 0.1; a <= best + 0.101; a += 0.02) { var v3 = score(a); if (v3 > bs) { bs = v3; best = a; } }
    // an angle only counts when it clearly beats "no rotation"
    return score(0) * 1.03 >= bs ? 0 : -best;               // the angle to give rotate() so the lines become horizontal
  }
  function rotate(img, deg) {
    if (Math.abs(deg) < 0.12) return img;
    var rad = deg * Math.PI / 180, w = img.w, h = img.h, c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad)), W = Math.ceil(w * c + h * s), H = Math.ceil(w * s + h * c);
    var out = mk(W, H), x = out.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.translate(W / 2, H / 2); x.rotate(rad); x.drawImage(canvasOf(img), -w / 2, -h / 2);
    return grayOf(out);
  }
  function blur(img, sigma) {
    var r = Math.max(1, Math.ceil(sigma * 2)), ker = new Float32Array(2 * r + 1), s = 0, i, x, y, w = img.w, h = img.h;
    for (i = -r; i <= r; i++) { ker[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += ker[i + r]; } for (i = 0; i < ker.length; i++) ker[i] /= s;
    var tmp = new Float32Array(w * h), out = new Uint8ClampedArray(w * h), g = img.g;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var a = 0; for (i = -r; i <= r; i++) a += g[y * w + clamp(x + i, 0, w - 1)] * ker[i + r]; tmp[y * w + x] = a; }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var b = 0; for (i = -r; i <= r; i++) b += tmp[clamp(y + i, 0, h - 1) * w + x] * ker[i + r]; out[y * w + x] = b; }
    return { w: w, h: h, g: out };
  }
  /** paper noise level: std of the pixels that are paper after flattening */
  function noiseLevel(img) {
    var g = img.g, n = 0, s = 0, s2 = 0, i;
    for (i = 0; i < g.length; i += 7) if (g[i] > 170) { n++; s += g[i]; s2 += g[i] * g[i]; }
    if (n < 100) return 0; var m = s / n; return Math.sqrt(Math.max(0, s2 / n - m * m));
  }
  function unsharp(img, sigma, amount) {
    var b = blur(img, sigma), out = new Uint8ClampedArray(img.g.length), i;
    for (i = 0; i < out.length; i++) out[i] = clamp(img.g[i] + (img.g[i] - b.g[i]) * amount, 0, 255);
    return { w: img.w, h: img.h, g: out };
  }
  /** Sauvola adaptive threshold through integral images → pure black/white */
  function sauvola(img, win, k) {
    var w = img.w, h = img.h, g = img.g, W = w + 1, I = new Float64Array(W * (h + 1)), I2 = new Float64Array(W * (h + 1)), x, y;
    for (y = 0; y < h; y++) { var rs = 0, rs2 = 0; for (x = 0; x < w; x++) { var v = g[y * w + x]; rs += v; rs2 += v * v; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + rs; I2[(y + 1) * W + x + 1] = I2[y * W + x + 1] + rs2; } }
    var r = win >> 1, out = new Uint8ClampedArray(w * h), R = 128;
    for (y = 0; y < h; y++) {
      var y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (x = 0; x < w; x++) {
        var x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), area = (x1 - x0) * (y1 - y0);
        var s = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0], s2 = I2[y1 * W + x1] - I2[y0 * W + x1] - I2[y1 * W + x0] + I2[y0 * W + x0];
        var m = s / area, sd = Math.sqrt(Math.max(0, s2 / area - m * m)), T = m * (1 + k * (sd / R - 1));
        out[y * w + x] = g[y * w + x] > T ? 255 : 0;
      }
    }
    return { w: w, h: h, g: out };
  }
  /** remove isolated specks (≤ 2 px of ink with no black 8-neighbour) from a binary image */
  function despeckle(img) {
    var w = img.w, h = img.h, g = img.g, out = new Uint8ClampedArray(g), x, y, i, j;
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) if (g[y * w + x] === 0) { var n = 0; for (j = -1; j <= 1; j++) for (i = -1; i <= 1; i++) if ((i || j) && g[(y + j) * w + x + i] === 0) n++; if (n === 0) out[y * w + x] = 255; }
    return { w: w, h: h, g: out };
  }
  function pad(img, p, val) {
    var W = img.w + 2 * p, H = img.h + 2 * p, out = new Uint8ClampedArray(W * H).fill(val === undefined ? 255 : val), y;
    for (y = 0; y < img.h; y++) out.set(img.g.subarray(y * img.w, (y + 1) * img.w), (y + p) * W + p);
    return { w: W, h: H, g: out };
  }

  /** connected components (8-neighbour) of a binary image (ink = 0): label map + boxes + areas */
  function labelComps(img) {
    var w = img.w, h = img.h, g = img.g, lab = new Int32Array(w * h), parent = [0], x, y, nl = 0;
    function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      if (g[y * w + x] > 127) continue;
      var nb = [], l;
      if (x > 0 && lab[y * w + x - 1]) nb.push(lab[y * w + x - 1]);
      if (y > 0) { if (lab[(y - 1) * w + x]) nb.push(lab[(y - 1) * w + x]); if (x > 0 && lab[(y - 1) * w + x - 1]) nb.push(lab[(y - 1) * w + x - 1]); if (x < w - 1 && lab[(y - 1) * w + x + 1]) nb.push(lab[(y - 1) * w + x + 1]); }
      if (!nb.length) { nl++; parent.push(nl); lab[y * w + x] = nl; }
      else { var m = nb[0]; nb.forEach(function (v) { if (v < m) m = v; }); lab[y * w + x] = m; nb.forEach(function (v) { var a = find(v), b = find(m); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }); }
    }
    var info = {}, i;
    for (i = 0; i < w * h; i++) if (lab[i]) { var r = find(lab[i]); lab[i] = r; var o = info[r] || (info[r] = { x0: 1e9, y0: 1e9, x1: -1, y1: -1, n: 0 }); var cx = i % w, cy = (i / w) | 0; if (cx < o.x0) o.x0 = cx; if (cx > o.x1) o.x1 = cx; if (cy < o.y0) o.y0 = cy; if (cy > o.y1) o.y1 = cy; o.n++; }
    return { lab: lab, info: info };
  }
  /** vowel marks (fatha, kasra, tanween, shadda …) confuse the recogniser: erase the small elongated marks, keep dots and letters */
  function stripMarks(bin, band) {
    var L = labelComps(bin), out = new Uint8ClampedArray(bin.g), w = bin.w, kill = {}, removed = 0, k, i;
    for (k in L.info) {
      var o = L.info[k], cw = o.x1 - o.x0 + 1, ch = o.y1 - o.y0 + 1;
      if (cw >= ch * 1.8 && ch <= band * 0.23 && cw <= band * 0.9 && o.n <= band * band * 0.14) { kill[k] = 1; removed++; }
      else if (ch <= band * 0.3 && cw <= band * 0.5 && cw >= ch * 1.1 && o.n <= band * band * 0.06 && cw > ch) { /* dots stay */ }
    }
    if (removed) for (i = 0; i < out.length; i++) if (L.lab[i] && kill[L.lab[i]]) out[i] = 255;
    return { img: { w: bin.w, h: bin.h, g: out }, removed: removed, total: Object.keys(L.info).length };
  }

  /** the picture to KEEP (searchable-PDF output): paper to pure white (clipping the grain), ink to solid dark, smooth edges */
  function enhance(img) {
    var g = img.g, n = 0, s = 0, s2 = 0, i;
    for (i = 0; i < g.length; i += 5) if (g[i] > 150) { n++; s += g[i]; s2 += g[i] * g[i]; }
    var mu = n ? s / n : 235, sd = n ? Math.sqrt(Math.max(0, s2 / n - mu * mu)) : 6, white = clamp(mu - 1.2 * sd, 150, 250), black = 70, lut = new Uint8ClampedArray(256), v;
    for (v = 0; v < 256; v++) lut[v] = v <= black ? 0 : v >= white ? 255 : Math.pow((v - black) / (white - black), 1.2) * 255;
    var out = new Uint8ClampedArray(g.length); for (i = 0; i < g.length; i++) out[i] = lut[g[i]];
    return { w: img.w, h: img.h, g: out };
  }

  /** the whole preparation. Returns {gray, bin, angle, scale, bandH}; heavy steps can be switched off through opts. */
  function prepare(cv, opts) {
    opts = opts || {};
    var img = grayOf(cv), info = { angle: 0, scale: 1, bandH: 0, noise: 0 };
    var target = opts.targetBand || 42;
    // 1) paper: remove uneven light / shadow / yellowing, then stretch contrast (at the original size; the radius follows the image size)
    var rad = Math.max(14, Math.round(Math.max(img.w, img.h) * 0.022));
    if (opts.flatten !== false) img = stretch(flatten(img, rad / 0.9)); else img = stretch(img);
    // 2) skew
    if (opts.deskew !== false) { var est = blur(Math.max(img.w, img.h) > 1500 ? resize(img, 1500 / Math.max(img.w, img.h)) : img, 0.8); info.angle = skewAngle(est); if (info.angle) img = rotate(img, info.angle); }
    // 3) scale: bring the typical text-line band to ~42 px (the LSTM normalises lines to 36 px: a band a little taller than that reads best — measured on scans)
    var lm = lineMetrics(img), lh0 = lm.band;
    if (lh0 > 6) { var k = clamp(target / lh0, 0.35, 4.2); if (Math.max(img.w, img.h) * k > 6500) k = 6500 / Math.max(img.w, img.h); if (k > 1.06 || k < 0.8) { img = resize(img, k); info.scale = k; } }
    info.bandH = lh0 ? lh0 * info.scale : target; info.lines = lm.n;
    // 4) denoise / sharpen
    info.noise = noiseLevel(img);
    var gray = img;
    if (opts.denoise !== false) { if (info.noise > 9) gray = blur(gray, 1.0); else if (info.noise > 4.5) gray = blur(gray, 0.65); }
    if (opts.sharpen !== false) gray = unsharp(gray, 1.4, info.noise > 9 ? 0.5 : 0.9);
    // 5) binary variant
    var win = (Math.round(info.bandH * 0.9) | 1) || 31, bin = despeckle(sauvola(gray, clamp(win, 21, 91), 0.22)), nod = null;
    if (opts.marks !== false) { var sm = stripMarks(bin, info.bandH); info.marks = sm.total ? sm.removed / sm.total : 0; if (info.marks > 0.06) nod = sm.img; }
    return { gray: pad(gray, 24, 255), bin: pad(bin, 24, 255), nod: nod ? pad(nod, 24, 255) : null, marks: info.marks || 0, clean: opts.wantClean ? pad(enhance(gray), 24, 255) : null, angle: info.angle, scale: info.scale, bandH: info.bandH, noise: info.noise, lines: info.lines };
  }

  // ================================================================ 2. recognition
  var worker = null, workerKey = '', workerP = null, progressCb = null;
  function getWorker(model, langs) {
    var key = model + '|' + langs;
    if (workerP && workerKey === key) return workerP;
    workerKey = key;
    workerP = (global.Tesseract ? Promise.resolve() : loadScript(base + 'vendor/tesseract/tesseract.min.js?v=5')).then(function () {
      if (worker) { try { worker.terminate(); } catch (e) { /* ignore */ } worker = null; }
      return global.Tesseract.createWorker(langs.split('+'), 1, {
        workerPath: base + 'vendor/tesseract/worker.min.js', corePath: base + 'vendor/tesseract/core', langPath: base + 'vendor/tesseract/' + (model === 'best' ? 'lang-best' : 'lang'),
        gzip: true, workerBlobURL: false, cacheMethod: 'none',
        logger: function (m) { if (progressCb && m) progressCb(m); }
      });
    }).then(function (w) { worker = w; return w; });
    return workerP;
  }
  var PARAMS = { preserve_interword_spaces: '1', tessedit_char_blacklist: '|~^_`{}\\', user_defined_dpi: '300', lstm_choice_mode: '0' };
  function linesOf(data) {
    // tesseract.js v5 returns blocks → paragraphs → lines → words; flatten it
    var out = [];
    (data.blocks || []).forEach(function (b) { (b.paragraphs || []).forEach(function (p) { (p.lines || []).forEach(function (l) { out.push(l); }); }); });
    if (!out.length && data.lines) out = data.lines;
    return out.map(function (l) {
      var ws = (l.words || []).map(function (w) { return { text: w.text, conf: w.confidence, bbox: w.bbox }; }).filter(function (w) { return w.text && w.text.trim(); });
      return { text: (l.text || ws.map(function (w) { return w.text; }).join(' ')).replace(/\s+$/, ''), conf: l.confidence !== undefined ? l.confidence : meanConf(ws), bbox: l.bbox, words: ws };
    }).filter(function (l) { return l.text.trim(); });
  }
  function meanConf(ws) { var n = 0, s = 0; ws.forEach(function (w) { var k = (w.text || '').length; n += k; s += k * (w.conf || 0); }); return n ? s / n : 0; }
  function pass(cv, model, langs, psm, label, k) {
    return getWorker(model, langs).then(function (w) {
      return w.setParameters(Object.assign({ tessedit_pageseg_mode: String(psm) }, PARAMS)).then(function () { return w.recognize(cv, {}, { blocks: true, text: true }); });
    }).then(function (res) { var ls = linesOf(res.data); return { label: label, k: k || 1, lines: ls, text: res.data.text || '', conf: res.data.confidence || 0 }; });
  }

  /** line-by-line pass: every text line is cut out of the prepared page and read alone (PSM 7) — no layout analysis to get wrong */
  function linePass(prep, model, langs, label, k) {
    var gray = prep.gray, bin = prep.bin, W = gray.w, H = gray.h, th = 128, bs = bands(bin, th);
    var med = medianOf(bs.map(function (b) { return b.y1 - b.y0 + 1; })) || 40, gc = canvasOf(gray), jobs = [];
    // thin diacritic-only bands belong to the neighbouring line: attach them
    bs = bs.filter(function (b) { return b.y1 - b.y0 + 1 >= med * 0.45; });
    bs.forEach(function (b) {
      var padY = Math.round(med * 0.45), y0 = Math.max(0, b.y0 - padY), y1 = Math.min(H - 1, b.y1 + padY), x0 = W, x1 = 0, x, y;
      for (y = b.y0; y <= b.y1; y++) for (x = 0; x < W; x++) if (bin.g[y * W + x] < 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
      if (x1 <= x0) return;
      var m = Math.round(med * 0.9), cx0 = Math.max(0, x0 - m), cx1 = Math.min(W - 1, x1 + m), c = mk(cx1 - cx0 + 1 + 2 * 12, y1 - y0 + 1 + 2 * 12), g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(gc, cx0, y0, cx1 - cx0 + 1, y1 - y0 + 1, 12, 12, cx1 - cx0 + 1, y1 - y0 + 1);
      jobs.push({ c: c, ox: cx0 - 12, oy: y0 - 12 });
    });
    return getWorker(model, langs).then(function (w) {
      return w.setParameters(Object.assign({ tessedit_pageseg_mode: '7' }, PARAMS)).then(function () {
        var lines = [], chain = Promise.resolve();
        jobs.forEach(function (j) {
          chain = chain.then(function () { return w.recognize(j.c, {}, { blocks: true, text: true }); }).then(function (res) {
            linesOf(res.data).forEach(function (l) {
              [l.bbox].concat(l.words.map(function (x) { return x.bbox; })).forEach(function (b) { if (b) { b.x0 += j.ox; b.x1 += j.ox; b.y0 += j.oy; b.y1 += j.oy; } });
              lines.push(l);
            });
          });
        });
        return chain.then(function () {
          // one line per band: when tesseract split a band in two, join them
          return { label: label, k: k || 1, lines: lines, text: lines.map(function (l) { return l.text; }).join('\n'), conf: meanConf([].concat.apply([], lines.map(function (l) { return l.words; }))) };
        });
      });
    });
  }

  // ---- numbers: the Arabic model is weak on the Arabic-Indic digits (٣٤٥ → «مث»), so every numeric-looking word is re-read glyph by glyph
  //      by a small neural digit reader (ocr-digits.js) — see there.
  var DIGITS = '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹0123456789', NUMSET = new RegExp('^[' + DIGITS + '٫٬,.:/%٪+\\-=()]+$'), HASDIG = new RegExp('[' + DIGITS + ']');
  function numericWord(t) {
    t = (t || '').trim(); if (!t || t.length > 14) return false;
    if (NUMSET.test(t)) return HASDIG.test(t) || t.length <= 2;
    var d = (t.match(new RegExp('[' + DIGITS + ']', 'g')) || []).length, l = (t.match(/[ء-يA-Za-z]/g) || []).length;
    return d >= 1 && d >= l && t.length <= 10;
  }
  function loadDigits() {
    if (global.PdfOcrDigits) return global.PdfOcrDigits.load(base);
    return loadScript(base + 'js/pdf/ocr-digits.js?v=5.11').then(function () { return global.PdfOcrDigits.load(base); }).catch(function () { return false; });
  }
  function digitPass(lines, prep) {
    var D = global.PdfOcrDigits; if (!D || !D.isReady() || !prep) return 0;
    var changed = 0, bin = prep.bin;
    lines.forEach(function (l) {
      l.words.forEach(function (w) {
        var b = w.nbox || w.bbox; if (!b) return;
        var numeric = numericWord(w.text);
        // short, doubtful words may be digits read as letters
        if (!numeric && !((w.conf || 0) < 75 && (w.text || '').length <= 7)) return;
        var r = D.readNumber(bin, { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, prep.bandH);
        if (!r || r.conf < 70 || r.text === w.text) return;
        var nd = (r.text.match(/[0-9٠-٩]/g) || []).length;
        if (!numeric && (nd < 2 || /^[١]+$/.test(r.text))) return;               // letters that merely look like digits stay letters
        w.orig = w.text; w.text = r.text; w.conf = Math.max(w.conf || 0, r.conf); w.fixed = true; changed++;
      });
      if (l.words.some(function (w) { return w.fixed && w.orig && !l.digitFix; })) { l.text = l.words.map(function (w) { return w.text; }).join(' '); l.digitFix = true; }
    });
    return changed;
  }

  // ---- voting between passes (ROVER-like): every word of the best reading may be replaced by a better-supported word at the same place
  function nb(b, k) { return b ? { x0: b.x0 / k, y0: b.y0 / k, x1: b.x1 / k, y1: b.y1 / k } : null; }
  function ov(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }
  /** spellings that differ only by ة/ه, ى/ي or hamza forms are not OCR evidence: keep the reference reading */
  function orthoKey(t) { return (t || '').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[أإآٱ]/g, 'ا'); }
  function wordScore(w) {
    var core = (w.text || '').replace(/[^ء-ي]/g, ''), s = w.conf || 0;
    if (core.length >= 3 && dict && dict.size) s += lookup(core) >= 0 ? 14 - Math.min(6, Math.log(2 + rankOf(core)) * 0.5) : -12;
    return s;
  }
  function passScore(p) { var n = 0, s = 0; p.lines.forEach(function (l) { n += l.text.length; s += l.text.length * lineScore(l); }); return n ? s / n : 0; }
  function sameLine(a, b) {
    if (!a.nbox || !b.nbox) return false;
    var oy = ov(a.nbox.y0, a.nbox.y1, b.nbox.y0, b.nbox.y1), hh = Math.min(a.nbox.y1 - a.nbox.y0, b.nbox.y1 - b.nbox.y0), ox = ov(a.nbox.x0, a.nbox.x1, b.nbox.x0, b.nbox.x1), ww = Math.min(a.nbox.x1 - a.nbox.x0, b.nbox.x1 - b.nbox.x0);
    return oy > hh * 0.55 && ox > ww * 0.3;
  }
  function vote(passes) {
    passes.forEach(function (p) { p.lines.forEach(function (l) { l.nbox = nb(l.bbox, p.k || 1); l.words.forEach(function (w) { w.nbox = nb(w.bbox, p.k || 1); }); }); });
    var ref = passes.slice().sort(function (a, b) { return passScore(b) - passScore(a); })[0], out = [];
    if (passes.length === 1) return ref.lines.map(function (l) { return Object.assign({ from: ref.label }, l); });
    var used = passes.map(function () { return {}; });
    ref.lines.forEach(function (rl) {
      var line = Object.assign({ from: ref.label }, rl), matches = [], changed = 0;
      passes.forEach(function (p, pi) { if (p === ref) return; p.lines.forEach(function (l, li) { if (sameLine(rl, l)) { matches.push(l); used[pi][li] = 1; } }); });
      if (matches.length && rl.words.length) {
        var words = rl.words.map(function (rw) {
          var best = rw, bs = wordScore(rw);
          if (rw.nbox) matches.forEach(function (l) {
            l.words.forEach(function (w) {
              if (!w.nbox) return;
              var ox = ov(rw.nbox.x0, rw.nbox.x1, w.nbox.x0, w.nbox.x1), uw = Math.max(rw.nbox.x1, w.nbox.x1) - Math.min(rw.nbox.x0, w.nbox.x0);
              if (ox / uw > 0.45 && w.text !== rw.text && orthoKey(w.text) !== orthoKey(rw.text)) { var sc = wordScore(w); if (sc > bs + 6) { bs = sc; best = w; } }
            });
          });
          if (best !== rw) changed++;
          return best === rw ? rw : Object.assign({}, best, { alt: rw.text });
        });
        if (changed) { line.words = words; line.text = words.map(function (w) { return w.text; }).join(' '); line.voted = changed; }
      }
      out.push(line);
    });
    // lines the best pass lost completely but another pass read with confidence
    passes.forEach(function (p, pi) {
      if (p === ref) return;
      p.lines.forEach(function (l, li) { if (!used[pi][li] && l.nbox && l.conf > 72 && plausibility(l) > 0.6) out.push(Object.assign({ from: p.label, extra: true }, l)); });
    });
    out.sort(function (a, b) { var A = a.nbox || nb(a.bbox, 1), B = b.nbox || nb(b.bbox, 1); return (A ? A.y0 : 0) - (B ? B.y0 : 0); });
    return out;
  }

  // ================================================================ 3. post-processing
  var AR = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
  var dict = null, dictP = null;
  function loadDict() {
    if (dict) return Promise.resolve(dict);
    if (dictP) return dictP;
    dictP = fetch(base + 'vendor/tesseract/ardict.txt.gz').then(function (r) {
      if (!r.ok) throw new Error('no dict');
      if (global.DecompressionStream) return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
      return r.text();
    }).then(function (t) {
      var list = t.split('\n'); dict = new Map(); list.forEach(function (w, i) { if (w && !dict.has(w)) dict.set(w, i); });
      // the bare stem of every «ال…» word is a word too (the list is rich in definite forms)
      list.forEach(function (w, i) { if (w.length >= 5 && w.indexOf('ال') === 0) { var st = w.slice(2); if (!dict.has(st)) dict.set(st, i + 400); } });
      return dict;
    }).catch(function () { dict = new Map(); return dict; });
    return dictP;
  }
  var PRE = ['وبال', 'فبال', 'كال', 'بال', 'وال', 'فال', 'لل', 'ال', 'و', 'ف', 'ب', 'ك', 'ل', 'س'], SUF = ['ها', 'هم', 'هن', 'كم', 'كن', 'نا', 'ني', 'ون', 'ين', 'ان', 'ات', 'ة', 'ه', 'ي', 'ك', 'ا'];
  function stripDia(w) { return w.replace(/[ً-ْٰـ]/g, ''); }
  /** rank of a word in the frequency list (smaller = commoner); clitics («و ب ال … ها ون») are peeled off; -1 when unknown */
  function lookup(w) {
    if (!dict || !dict.size) return 0;
    if (dict.has(w)) return dict.get(w);
    var best = -1, i, j, p, s, r, v;
    function upd(x) { if (x >= 0 && (best < 0 || x < best)) best = x; }
    for (i = 0; i < PRE.length; i++) {
      p = PRE[i];
      if (w.length - p.length >= 2 && w.indexOf(p) === 0) {
        r = w.slice(p.length); if (dict.has(r)) upd(dict.get(r) + 300);
        // prefix AND suffix together: only a real suffix (≥ 2 letters, or ة) and a stem of ≥ 3 letters
        for (j = 0; j < SUF.length; j++) { s = SUF[j]; if ((s.length >= 2 || s === 'ة') && r.length - s.length >= 3 && r.slice(-s.length) === s && dict.has(v = r.slice(0, -s.length))) upd(dict.get(v) + 700); }
      }
    }
    for (j = 0; j < SUF.length; j++) { s = SUF[j]; if (w.length - s.length >= (s.length === 1 ? 4 : 2) && w.slice(-s.length) === s && dict.has(v = w.slice(0, -s.length))) upd(dict.get(v) + 400); }
    return best;
  }
  function known(w) { return !dict || !dict.size || lookup(w) >= 0; }
  // letters that differ only by dots / small marks — the usual OCR confusions
  var CONF = { 'ب': 'تثنيئ', 'ت': 'بثنيئة', 'ث': 'بتنيئ', 'ن': 'بتثيئ', 'ي': 'بتثنئى', 'ئ': 'بتثنيى', 'ى': 'يئا', 'ج': 'حخ', 'ح': 'جخ', 'خ': 'جح', 'د': 'ذ', 'ذ': 'د', 'ر': 'ز', 'ز': 'ر', 'س': 'ش', 'ش': 'س', 'ص': 'ض', 'ض': 'ص', 'ط': 'ظ', 'ظ': 'ط', 'ع': 'غ', 'غ': 'ع', 'ف': 'ق', 'ق': 'ف', 'ا': 'أإآل', 'أ': 'اإآ', 'إ': 'اأآ', 'آ': 'اأإ', 'ه': '', 'ة': 'ت', 'و': 'ؤز', 'ؤ': 'و', 'ل': 'ا', 'ك': 'ل', 'م': 'ه' };
  function candidates(w) {
    var out = {}, i, j, c, L = w.length, alts;
    function add(s, cost) { if (s !== w && (out[s] === undefined || out[s] > cost)) out[s] = cost; }
    for (i = 0; i < L; i++) {
      alts = CONF[w[i]] || '';
      for (j = 0; j < alts.length; j++) add(w.slice(0, i) + alts[j] + w.slice(i + 1), 1);
    }
    // two substitutions (only among confusable letters), insertion / deletion of a weak letter
    for (i = 0; i < L; i++) { var a1 = CONF[w[i]] || ''; for (var i2 = i + 1; i2 < L; i2++) { var a2 = CONF[w[i2]] || ''; for (j = 0; j < a1.length; j++) for (c = 0; c < a2.length; c++) add(w.slice(0, i) + a1[j] + w.slice(i + 1, i2) + a2[c] + w.slice(i2 + 1), 2.2); } }
    var weak = 'اليوهنت';
    for (i = 0; i < L; i++) { add(w.slice(0, i) + w.slice(i + 1), 'ايول'.indexOf(w[i]) >= 0 ? 1.7 : 2.9); for (j = 0; j < ALPHA.length; j++) add(w.slice(0, i) + ALPHA[j] + w.slice(i), weak.indexOf(ALPHA[j]) >= 0 ? 1.8 : 2.3); }
    for (j = 0; j < ALPHA.length; j++) add(w + ALPHA[j], 2.6);
    // a missing / extra letter combined with one confusion is too loose: stop here
    return out;
  }
  var IND = '٠١٢٣٤٥٦٧٨٩', EXT = '۰۱۲۳۴۵۶۷۸۹';
  function digits(t, mode) {
    if (mode === 'western') return t.replace(/[٠-٩]/g, function (d) { return String(IND.indexOf(d)); }).replace(/[۰-۹]/g, function (d) { return String(EXT.indexOf(d)); });
    if (mode === 'indic') return t.replace(/[0-9]/g, function (d) { return IND[+d]; }).replace(/[۰-۹]/g, function (d) { return IND[EXT.indexOf(d)]; });
    return t;
  }
  function tidy(line) {
    var t = line;
    t = t.replace(/[|¦]/g, ' ').replace(/‏|‎|‪|‫|‬/g, '');
    t = t.replace(/ـ{2,}/g, 'ـ');
    // Latin punctuation inside Arabic text → Arabic punctuation
    if ((t.match(/[؀-ۿ]/g) || []).length > t.replace(/\s/g, '').length * 0.4) {
      t = t.replace(/(?<=[؀-ۿ]),/g, '،').replace(/(?<=[؀-ۿ]) ?;/g, '؛').replace(/(?<=[؀-ۿ]) ?\?/g, '؟');
    }
    t = t.replace(/\s+([،؛؟.,:!)\]])/g, '$1').replace(/([(\[])\s+/g, '$1');
    t = t.replace(/([،؛؟,!])(?=[^\s\d)\]،؛؟.,!:"'»])/g, '$1 ');
    t = t.replace(/([ء-ي])\.(?=[ء-ي])/g, '$1. ');
    t = t.replace(/([0-9٠-٩])(?=[\u0621-\u064A])/g, '$1 ').replace(/([\u0621-\u064A])(?=[0-9٠-٩])/g, '$1 ');
    t = t.replace(/[ \t]{2,}/g, function (m) { return m.length > 4 ? m : ' '; }).replace(/^\s+|\s+$/g, '');
    return t;
  }
  var ALPHA = 'ابتثجحخدذرزسشصضطظعغفقكلمنهويءأإآؤئةى';
  var ARW = /^[ء-يً-ْ]+$/;
  function rankOf(w) { var r = lookup(w); return r < 0 ? 90000 : r; }
  /** the best known word within one confusion of `p` (cost ≤ 1.8), or null */
  function mend(p) {
    if (known(p)) return { w: p, cost: 0 };
    var c = candidates(p), best = null, bs = 1e9;
    Object.keys(c).forEach(function (k) { if (c[k] <= 1.8 && known(k)) { var sc = c[k] * 3 + Math.log(2 + rankOf(k)) * 0.55; if (sc < bs) { bs = sc; best = { w: k, cost: c[k] }; } } });
    return best;
  }
  /** a word that glued two words together: «مجهولةومشتقاتها» → «مجهولة ومشتقاتها» (one of the halves may carry a confusion: «المناسية») */
  function splitWord(core) {
    var L = core.length, best = null, bestScore = 1e9, i;
    if (L < 6) return null;
    for (i = 3; i <= L - 3; i++) {
      var a = core.slice(0, i), b = core.slice(i), strip = /^(ال|و|ب|ك|ل|ف)/;
      if (a.replace(strip, '').length < 3 || b.replace(strip, '').length < 3) continue;
      var ma = mend(a), mb = ma && mend(b);
      if (!ma || !mb || (ma.cost && mb.cost)) continue;
      // a cut is far more believable at a letter that cannot join its successor (ا د ذ ر ز و ة) or before «و»/«ال»
      var prev = a[a.length - 1], nat = 'ادذرزوة'.indexOf(prev) >= 0 || b[0] === 'و' || b.indexOf('ال') === 0;
      var sc = Math.log(2 + rankOf(ma.w)) + Math.log(2 + rankOf(mb.w)) - (nat ? 2.5 : 0) + (ma.cost + mb.cost) * 3;
      if (sc < bestScore) { bestScore = sc; best = [ma.w, mb.w]; }
    }
    return best && bestScore < 20.8 ? best : null;
  }
  function fixWord(w, conf) {
    if (!dict || !dict.size || !AR.test(w)) return null;
    var core = stripDia(w).replace(/^[^ء-ي]+|[^ء-ي]+$/g, '');
    if (core.length < 3 || known(core)) return null;
    // a comma read as «ء» at the end of a word: «مشتقاتهاء» → «مشتقاتها،»
    if (core[core.length - 1] === 'ء' && w.slice(-1) === 'ء' && known(core.slice(0, -1))) return w.slice(0, -1) + '،';
    var c = candidates(core), best = null, bestScore = 1e9, second = 1e9;
    Object.keys(c).forEach(function (k) {
      if (!known(k)) return;
      var score = c[k] * 3 + Math.log(2 + rankOf(k)) * 0.55;
      if (score < bestScore) { second = bestScore; bestScore = score; best = k; } else if (score < second) second = score;
    });
    if (!best) {
      var sp = splitWord(core); if (sp) return w.replace(core, sp[0] + ' ' + sp[1]);
      return null;
    }
    // only when it is the clear winner, and more eagerly for lower confidence
    var margin = conf < 55 ? 0.4 : conf < 70 ? 0.9 : 1.6;
    if (second - bestScore < margin) { var sp2 = splitWord(core); return sp2 ? w.replace(core, sp2[0] + ' ' + sp2[1]) : null; }
    return w.replace(core, best);
  }
  /** how plausible a reading is: share of known Arabic words (used to choose between passes) */
  function plausibility(l) {
    if (!dict || !dict.size) return 0;
    var n = 0, k = 0;
    l.text.split(/\s+/).forEach(function (t) { var c = stripDia(t).replace(/^[^ء-ي]+|[^ء-ي]+$/g, ''); if (c.length >= 3 && ARW.test(c)) { n++; if (known(c)) k++; } });
    return n ? k / n : 0;
  }
  function lineScore(l) { return l.conf * 0.55 + plausibility(l) * 45; }

  function post(lines, opts) {
    opts = opts || {};
    lines.forEach(function (l) {
      var toks = l.text.split(/\s+/).filter(Boolean), ws = l.words || [], aligned = ws.length === toks.length, fixes = [];
      if (opts.dictionary !== false && dict && dict.size) {
        var out = [];
        for (var i = 0; i < toks.length; i++) {
          var t = toks[i], conf = aligned ? ws[i].conf : l.conf, f = fixWord(t, conf);
          if (f && f !== t) { fixes.push({ from: t, to: f }); out.push({ t: f, conf: conf, fixed: true, orig: t }); continue; }
          // two fragments of one word: «الـ» «ختلفة» → try the pair when neither is a word but the join is
          var c1 = stripDia(t).replace(/[^ء-ي]/g, ''), nx = toks[i + 1];
          if (nx && c1 && c1.length <= 4 && !known(c1) && ARW.test(c1)) {
            var j = c1 + stripDia(nx).replace(/[^ء-ي]/g, '');
            if (j.length >= 4 && known(j)) { fixes.push({ from: t + ' ' + nx, to: j }); out.push({ t: j, conf: Math.min(conf, aligned ? ws[i + 1].conf : conf), fixed: true, orig: t + ' ' + nx }); i++; continue; }
          }
          out.push({ t: t, conf: conf });
        }
        if (fixes.length) {
          l.text = out.map(function (o) { return o.t; }).join(' ');
          l.words = out.reduce(function (acc, o) { o.t.split(/\s+/).forEach(function (p) { acc.push({ text: p, conf: o.conf, fixed: o.fixed, orig: o.orig }); }); return acc; }, []);
        }
      }
      l.fixes = fixes;
      l.text = tidy(digits(l.text, opts.digits || 'keep'));
    });
    return lines;
  }

  function assemble(lines, opts) {
    // paragraphs: a vertical gap clearly bigger than the line spacing starts a new paragraph
    var out = [], hs = lines.map(function (l) { return l.bbox ? l.bbox.y1 - l.bbox.y0 : 0; }).filter(Boolean), med = medianOf(hs) || 1, prev = null;
    lines.forEach(function (l) {
      if (prev && l.bbox && prev.bbox && l.bbox.y0 - prev.bbox.y1 > med * 0.95) out.push('');
      out.push(l.text); prev = l;
    });
    var text = out.join('\n');
    if (opts && opts.joinLines) text = text.replace(/([^\n.؟?!:؛])\n(?=[^\n])/g, '$1 ');
    return text.replace(/\n{3,}/g, '\n\n').trim();
  }

  // ================================================================ public API
  var MODES = {
    fast: { model: 'fast', jobs: [{ v: 'gray', psm: 6 }] },
    accurate: { model: 'best', jobs: [{ v: 'gray', psm: 6 }, { v: 'bin', psm: 6 }, { v: 'gray', psm: 6, f: 0.8 }], adaptive: true },
    max: { model: 'best', jobs: [{ v: 'gray', psm: 6 }, { v: 'bin', psm: 6 }, { v: 'gray', psm: 6, f: 0.78 }, { v: 'gray', psm: 6, f: 1.3 }, { v: 'bin', psm: 6, f: 0.9 }, { v: 'gray', psm: 3 }] }
  };
  function scaled(cv, f) { if (!f || f === 1) return cv; var c = mk(cv.width * f, cv.height * f), x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(cv, 0, 0, c.width, c.height); return c; }
  function latinShare(t) { var l = (t.match(/[A-Za-z]/g) || []).length, a = (t.match(/[\u0600-\u06FF]/g) || []).length; return l / Math.max(1, l + a); }
  /** language "auto": Arabic only first (more exact on Arabic text); widen to English when the page has English words or the reading is poor */
  function recognizeAuto(cv, opts) {
    return recognize(cv, Object.assign({}, opts, { lang: 'ara' })).then(function (res) {
      if (latinShare(res.text) > 0.06 || res.conf < 60) {
        if (opts.onStatus) opts.onStatus('نص مختلط — إعادة القراءة بالعربية والإنجليزية…');
        return recognize(cv, Object.assign({}, opts, { lang: 'ara+eng', prepared: res._prep })).then(function (r2) { return r2.conf >= res.conf - 2 || latinShare(res.text) > 0.2 ? r2 : res; });
      }
      return res;
    });
  }
  function rotateCanvas(cv, deg) {
    var q = ((deg % 360) + 360) % 360, c = mk(q % 180 ? cv.height : cv.width, q % 180 ? cv.width : cv.height), x = c.getContext('2d');
    x.translate(c.width / 2, c.height / 2); x.rotate(q * Math.PI / 180); x.drawImage(cv, -cv.width / 2, -cv.height / 2); return c;
  }
  /** a page scanned sideways or upside down reads as noise: when the confidence is very low, try the other orientations */
  function rescueOrientation(cv, opts, res) {
    if (opts._o || opts.orient === false || (res.conf >= 62 && plausibilityOf({ lines: res.lines }) >= 0.3)) return Promise.resolve(res);
    var tries = [90, 270, 180], best = null, chain = Promise.resolve();
    if (opts.onStatus) opts.onStatus('الصفحة قد تكون مقلوبة — تجربة اتجاهات أخرى…');
    tries.forEach(function (deg) {
      chain = chain.then(function () {
        if (best && best.conf > 80) return;
        var rc = rotateCanvas(cv, deg);
        return recognize(rc, Object.assign({}, opts, { _o: true, jobs: [{ v: 'gray', psm: 6 }], mode: opts.mode === 'fast' ? 'fast' : 'accurate', lang: opts.lang === 'auto' ? 'ara' : opts.lang })).then(function (r) { r._deg = deg; r._cv = rc; if (!best || r.conf > best.conf) best = r; });
      });
    });
    return chain.then(function () {
      if (!best || best.conf < res.conf + 15) return res;
      return recognize(best._cv, Object.assign({}, opts, { _o: true })).then(function (r) { r.orient = best._deg; return r; });
    });
  }
  function recognize(cv, opts) {
    opts = opts || {};
    if (opts.lang === 'auto') return recognizeAuto(cv, opts);
    return recognizeOnce(cv, opts).then(function (res) { return rescueOrientation(cv, opts, res); });
  }
  function recognizeOnce(cv, opts) {
    var mode = Object.assign({}, MODES[opts.mode] || MODES.accurate, opts.model ? { model: opts.model } : {}), langs = opts.lang || 'ara+eng', t0 = Date.now(), jobs = opts.jobs || mode.jobs;
    progressCb = opts.onProgress || null;
    function step(msg) { if (opts.onStatus) opts.onStatus(msg); }
    step('تجهيز الصورة…');
    return new Promise(function (r) { setTimeout(r, 20); }).then(function () {
      var prep = opts.prepared || (opts.raw ? null : prepare(cv, opts));
      var base = { gray: prep ? canvasOf(prep.gray) : cv, bin: prep ? canvasOf(prep.bin) : cv, raw: cv };
      if (prep && prep.nod) base.nod = canvasOf(prep.nod); else if (opts.jobs) base.nod = base.gray;
      // a text with vowel marks gets an extra reading with the marks erased
      if (base.nod && !opts.jobs && !jobs.some(function (j) { return j.v === 'nod'; })) jobs = jobs.concat([{ v: 'nod', psm: 6 }]);
      var done = [], chain = Promise.resolve(loadDict());
      jobs.forEach(function (j, k) {
        chain = chain.then(function () {
          // "accurate": extra passes only while the reading is not yet convincing
          if (j.v === 'nod' && !base.nod) return;
          if (mode.adaptive && k > 0 && done.length && j.v !== 'nod') { var first = done[0]; if (first.conf >= 93 && plausibilityOf(first) >= 0.93) return; }
          step('التعرف على النص (' + (k + 1) + '/' + jobs.length + ')…');
          if (j.v === 'lines') { if (!prep) return; return linePass(prep, mode.model, langs, 'lines', 1).then(function (p) { done.push(p); }); }
          return pass(scaled(base[j.v], j.f), mode.model, langs, j.psm, j.v + j.psm + (j.f ? '@' + j.f : ''), j.f || 1).then(function (p) { done.push(p); });
        });
      });
      return chain.then(function () {
        step('مقارنة القراءات وتدقيقها…');
        var lines = vote(done), conf;
        if (opts.digitPass !== false && prep) { step('قراءة الأرقام…'); return loadDigits().then(function () { digitPass(lines, prep); return finish(lines); }); }
        return finish(lines);
      });
      function finish(lines) {
        var conf;
        post(lines, opts);
        var all = []; lines.forEach(function (l) { l.words.forEach(function (w) { all.push(w); }); });
        conf = meanConf(all);
        return { text: assemble(lines, opts), lines: lines, words: all, conf: conf, passes: done.map(function (p) { return { label: p.label, conf: p.conf }; }), angle: prep ? prep.angle : 0, scale: prep ? prep.scale : 1, geom: prep ? { pad: 24, w: prep.gray.w, h: prep.gray.h, kx: (prep.gray.w - 48) / cv.width, ky: (prep.gray.h - 48) / cv.height } : { pad: 0, w: cv.width, h: cv.height, kx: 1, ky: 1 }, _prep: prep, ms: Date.now() - t0, prepared: prep ? { gray: base.gray, bin: base.bin, clean: prep.clean ? canvasOf(prep.clean) : null } : null };
      }
    });
  }
  function plausibilityOf(p) { var n = 0, s = 0; p.lines.forEach(function (l) { n += l.text.length; s += l.text.length * plausibility(l); }); return n ? s / n : 1; }

  global.PdfOcrEngine = {
    recognize: recognize, prepare: prepare, tidy: tidy, digits: digits, loadDict: loadDict, fixWord: fixWord, known: known, candidates: candidates,
    skewAngle: skewAngle, lineHeight: lineHeight, lineMetrics: lineMetrics, rank: function (w) { return rankOf(w); }, grayOf: grayOf, canvasOf: canvasOf, getWorker: getWorker, base: base, MODES: MODES,
    _t: { flatten: flatten, stretch: stretch, rotate: rotate, sauvola: sauvola, bands: bands, blur: blur, resize: resize, otsu: otsu },
    stop: function () { if (worker) { try { worker.terminate(); } catch (e) { /* ignore */ } } worker = null; workerP = null; workerKey = ''; }
  };
})(window);
