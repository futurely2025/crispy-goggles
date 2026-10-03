/* PdfMathOcr — printed equation picture → LaTeX, in the browser, offline.
 * The model is pix2tex (LaTeX-OCR, MIT licence): a ResNet+ViT encoder, a transformer decoder and a small "resizer" network that finds the
 * scale the model was trained on. The three networks were exported to ONNX (weights stored as float16, cast back at run time) and run with
 * onnxruntime-web (WebAssembly). Files: vendor/mathocr/{resizer,encoder,decoder}.onnx + tokens.json, vendor/onnxruntime/*.
 *
 *   PdfMathOcr.recognize(canvas, {onStatus}) → Promise<{latex, conf, ms}>
 */
(function (global) {
  'use strict';
  var base = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/js\/pdf\/mathocr\.js.*$/, '') : ''; })();
  var ort = null, S = null, tokens = null, loading = null;

  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('تعذّر تحميل ' + src)); }; document.head.appendChild(s); }); }
  function fetchBuf(url, label, cb) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('ملف نموذج المعادلات غير موجود: ' + label);
      return r.arrayBuffer();
    });
  }
  /** loads the runtime and the three networks (first use only) */
  function load(onStatus) {
    if (S) return Promise.resolve(S);
    if (loading) return loading;
    function st(m) { if (onStatus) onStatus(m); }
    loading = (global.ort ? Promise.resolve() : loadScript(base + 'vendor/onnxruntime/ort.wasm.min.js')).then(function () {
      ort = global.ort; ort.env.wasm.wasmPaths = base + 'vendor/onnxruntime/'; ort.env.wasm.numThreads = (global.crossOriginIsolated && navigator.hardwareConcurrency > 2) ? Math.min(4, navigator.hardwareConcurrency) : 1;
      st('تحميل نموذج المعادلات (أول مرة فقط)…');
      return Promise.all([fetchBuf(base + 'vendor/mathocr/resizer.onnx', 'resizer'), fetchBuf(base + 'vendor/mathocr/encoder.onnx', 'encoder'), fetchBuf(base + 'vendor/mathocr/decoder.onnx', 'decoder'), fetch(base + 'vendor/mathocr/tokens.json').then(function (r) { return r.json(); })]);
    }).then(function (r) {
      tokens = r[3]; st('تهيئة النموذج…');
      var opt = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
      return Promise.all([ort.InferenceSession.create(new Uint8Array(r[0]), opt), ort.InferenceSession.create(new Uint8Array(r[1]), opt), ort.InferenceSession.create(new Uint8Array(r[2]), opt)]);
    }).then(function (s) { S = { rs: s[0], enc: s[1], dec: s[2] }; return S; }, function (e) { loading = null; throw e; });
    return loading;
  }
  function available() { return fetch(base + 'vendor/mathocr/tokens.json', { method: 'HEAD' }).then(function (r) { return r.ok; }, function () { return false; }); }

  // ---------------------------------------------------------------- image preparation (a port of pix2tex's pad / minmax_size / resizer loop)
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function grayData(cv) { var d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data, g = new Float32Array(cv.width * cv.height), i; for (i = 0; i < g.length; i++) g[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000; return g; }
  /** crop to the ink, normalise to dark-on-white, and pad the size up to multiples of 32 (white) */
  function pad(cv) {
    var w = cv.width, h = cv.height, g = grayData(cv), mn = 255, mx = 0, i, sum = 0;
    for (i = 0; i < g.length; i++) { if (g[i] < mn) mn = g[i]; if (g[i] > mx) mx = g[i]; }
    var rng = Math.max(1, mx - mn); for (i = 0; i < g.length; i++) { g[i] = (g[i] - mn) / rng * 255; sum += g[i]; }
    var dark = sum / g.length > 128;                                  // text dark on white (usual) — otherwise invert
    var x0 = w, y0 = h, x1 = -1, y1 = -1, x, y;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var ink = dark ? g[y * w + x] < 128 : g[y * w + x] > 128; if (ink) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 < 0) return null;
    var cw = x1 - x0 + 1, ch = y1 - y0 + 1, W = Math.ceil(cw / 32) * 32, H = Math.ceil(ch / 32) * 32, out = mk(W, H), ox = out.getContext('2d'), id = ox.createImageData(W, H), a = id.data;
    for (i = 0; i < W * H; i++) { a[i * 4] = a[i * 4 + 1] = a[i * 4 + 2] = 255; a[i * 4 + 3] = 255; }
    for (y = 0; y < ch; y++) for (x = 0; x < cw; x++) { var v = g[(y0 + y) * w + x0 + x]; if (!dark) v = 255 - v; var o = (y * W + x) * 4; a[o] = a[o + 1] = a[o + 2] = v; }
    ox.putImageData(id, 0, 0); return out;
  }
  var MAXW = 672, MAXH = 192, MINW = 32, MINH = 32;
  function minmax(cv) {
    var rw = cv.width / MAXW, rh = cv.height / MAXH, r = Math.max(rw, rh), c = cv;
    if (r > 1) { c = mk(Math.floor(cv.width / r), Math.floor(cv.height / r)); var x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cv, 0, 0, c.width, c.height); }
    var W = Math.max(c.width, MINW), H = Math.max(c.height, MINH);
    if (W !== c.width || H !== c.height) { var p = mk(W, H), px = p.getContext('2d'); px.fillStyle = '#fff'; px.fillRect(0, 0, W, H); px.drawImage(c, 0, 0); c = p; }
    return c;
  }
  function resizeTo(cv, w, h, up) { var c = mk(w, h), x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(cv, 0, 0, w, h); return c; }
  function tensor(cv) {
    var g = grayData(cv), f = new Float32Array(g.length), i; for (i = 0; i < g.length; i++) f[i] = (g[i] / 255 - 0.7931) / 0.1738;
    return new ort.Tensor('float32', f, [1, 1, cv.height, cv.width]);
  }
  /** the resizer network predicts the width (a multiple of 32) the picture should have; iterate until stable (as pix2tex does) */
  function prepare(cv, sess, scaleMul) {
    var base0 = minmax(pad(cv)); if (!base0) return Promise.resolve(null);
    var r = 1, w = base0.width, h = base0.height, n = 0, img = base0;
    function step() {
      h = Math.max(1, Math.floor(h * r));
      var cand = pad(minmax(resizeTo(base0, Math.max(1, w), h)));
      if (!cand) return Promise.resolve(img);
      img = cand;
      return sess.rs.run({ img: tensor(img) }).then(function (o) {
        var logits = o.cls.data, b = 0, i; for (i = 1; i < logits.length; i++) if (logits[i] > logits[b]) b = i;
        var nw = (b + 1) * 32; w = nw;
        if (nw === img.width || ++n >= 10) return img;
        r = nw / img.width; return step();
      });
    }
    return step().then(function (res) {
      if (!scaleMul || scaleMul === 1) return res;
      return pad(minmax(resizeTo(res, Math.max(32, Math.round(res.width * scaleMul)), Math.max(32, Math.round(res.height * scaleMul)))));
    });
  }

  // ---------------------------------------------------------------- decoding
  function decode(sess, img, onStatus) {
    return sess.enc.run({ img: tensor(img) }).then(function (eo) {
      var ctx = eo.ctx, toks = [1], lp = 0, steps = 0;
      function next() {
        var tk = new ort.Tensor('int64', BigInt64Array.from(toks.map(function (t) { return BigInt(t); })), [1, toks.length]);
        return sess.dec.run({ tokens: tk, ctx: ctx }).then(function (o) {
          var l = o.logits.data, b = 0, i, mx = -1e9, sum = 0;
          for (i = 0; i < l.length; i++) if (l[i] > mx) { mx = l[i]; b = i; }
          for (i = 0; i < l.length; i++) sum += Math.exp(l[i] - mx);
          lp += -Math.log(sum);                                          // log-prob of the chosen token
          steps++;
          if (b === 2 || b === 0 || steps >= 256) return finish();
          toks.push(b);
          // a degenerate loop (same token over and over) means the picture is not a formula this model understands
          var n = toks.length; if (n > 24 && toks.slice(n - 12).every(function (t) { return t === toks[n - 1]; })) return finish();
          if (onStatus && steps % 8 === 0) onStatus('قراءة المعادلة… ' + steps);
          return next();
        });
      }
      function finish() { return { toks: toks.slice(1), conf: Math.exp(lp / Math.max(1, steps)) }; }
      return next();
    });
  }
  function detok(ids) { return ids.map(function (t) { return tokens[t] || ''; }).join('').replace(/Ġ/g, ' ').replace(/\[(EOS|BOS|PAD)\]/g, '').trim(); }
  /** pix2tex's own cleanup: the model writes a space between every token; remove the ones LaTeX does not need */
  function post(s) {
    var textReg = /(\\(operatorname|mathrm|text|mathbf)\s?\*? \{.*?\})/g, names = (s.match(textReg) || []).map(function (x) { return x.replace(/ /g, ''); }), k = 0;
    s = s.replace(textReg, function () { return names[k++]; });
    var letter = '[a-zA-Z]', noletter = '[\\W_^\\d]', news = s, prev;
    do {
      prev = news;
      news = news.replace(new RegExp('(?!\\\\ )(' + noletter + ')\\s+?(' + noletter + ')', 'g'), '$1$2');
      news = news.replace(new RegExp('(?!\\\\ )(' + noletter + ')\\s+?(' + letter + ')', 'g'), '$1$2');
      news = news.replace(new RegExp('(' + letter + ')\\s+?(' + noletter + ')', 'g'), '$1$2');
    } while (news !== prev);
    return news;
  }
  /** make the model's LaTeX acceptable to MathLive (the equation editor): old font switches, \stackrel, text-size commands … */
  function tidy(s) {
    s = s.replace(/\\begin\{array\}\s*\{[^}]*\}\s*\{?\s*\{?\s*(.*?)\s*\}?\s*\}?\s*\\end\{array\}/g, function (m, inner) { return inner.indexOf('&') < 0 && inner.indexOf('\\\\') < 0 ? inner : m; });
    // font switches  {\cal X} {\bf X} {\it X} {\rm X} {\mathsf ...}
    s = s.replace(/\{\s*\\(cal|mathcal)\s+([^{}]*)\}/g, '\\mathcal{$2}').replace(/\{\s*\\bf\s+([^{}]*)\}/g, '\\mathbf{$1}').replace(/\{\s*\\it\s+([^{}]*)\}/g, '$1').replace(/\{\s*\\rm\s+([^{}]*)\}/g, '\\mathrm{$1}').replace(/\{\s*\\mathsf\s*\{([^{}]*)\}\s*\}/g, '\\mathsf{$1}');
    s = s.replace(/\\(textbf)\s*\{/g, '\\mathbf{').replace(/\\(textrm|textnormal)\s*\{/g, '\\text{').replace(/\\boldsymbol\s*\{\s*\\imath\s*\}/g, 'i');
    s = s.replace(/\\(scriptsize|tiny|small|footnotesize|normalsize|large|Large|LARGE|huge|Huge|bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr|big|Big|bigg|Bigg|vphantom\{[^}]*\}|phantom\{[^}]*\}|nonumber|label\{[^}]*\})(?![a-zA-Z])/g, '');
    s = s.replace(/\\stackrel\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '\\overset{$1}{$2}').replace(/\\stackrel/g, '\\overset');
    s = s.replace(/\\operatorname\*\s*\{lim\}/g, '\\lim').replace(/\\operatorname\*/g, '\\operatorname').replace(/\\(longrightarrow)(?=\s*[^\\])/g, '\\to');
    s = s.replace(/\\(mathrm|mathbf|mathcal|mathbb|mathfrak|mathsf|mathtt)\s*\{\s*\}/g, '').replace(/\{\s*\}/g, '');
    // collapse needlessly doubled braces: {{x}} → {x} (MathLive keeps them as empty groups)
    for (var k = 0; k < 4; k++) s = s.replace(/\{\{([^{}]*)\}\}/g, '{$1}');
    return balance(s.replace(/\s+/g, ' ').trim());
  }
  function balance(s) {
    var depth = 0, out = '', i, c;
    for (i = 0; i < s.length; i++) { c = s[i]; if (c === '\\') { out += c + (s[i + 1] || ''); i++; continue; } if (c === '{') depth++; else if (c === '}') { if (depth === 0) continue; depth--; } out += c; }
    while (depth-- > 0) out += '}';
    return out;
  }
  /** a reading that is probably invented: very low model confidence, many exotic commands, a blown-up array … */
  function suspicious(latex, conf) {
    var cmds = (latex.match(/\\[a-zA-Z]+/g) || []), exotic = cmds.filter(function (c) { return /^\\(overset|stackrel|underline|overline|underbrace|overbrace|mathfrak|mathcal|bigotimes|bigoplus|bigcup|bigcap|wedge|vee|propto|asymp|simeq|cong|equiv|lor|land|neg|setminus|hookrightarrow|longleftarrow|Longrightarrow|Longleftrightarrow|phantom|slash|not)$/.test(c); }).length;
    return conf < 0.8 || exotic >= 4 || /\\begin\{array\}/.test(latex) && conf < 0.93 || latex.length > 260 && conf < 0.95;
  }

  /** opts: {onStatus, scales:[1, .85, 1.18]} — with several scales the most confident reading wins */
  function recognize(cv, opts) {
    opts = opts || {}; var t0 = Date.now(), scales = opts.scales || [1];
    return load(opts.onStatus).then(function (sess) {
      var best = null, chain = Promise.resolve();
      scales.forEach(function (sc) {
        chain = chain.then(function () {
          if (best && best.conf > 0.992) return;                        // already certain: skip the other scales
          if (opts.onStatus) opts.onStatus('تجهيز الصورة…');
          return prepare(cv, sess, sc).then(function (img) { if (!img) return; return decode(sess, img, opts.onStatus).then(function (r) { if (!best || r.conf > best.conf) best = r; }); });
        });
      });
      return chain.then(function () {
        if (!best) return { latex: '', conf: 0, ms: Date.now() - t0 };
        var raw = detok(best.toks), latex = tidy(post(raw));
        return { latex: latex, raw: raw, conf: best.conf, ms: Date.now() - t0, suspicious: suspicious(latex, best.conf) };
      });
    });
  }

  global.PdfMathOcr = { recognize: recognize, load: load, available: available, post: post, tidy: tidy, prepare: function (cv) { return load().then(function (s) { return prepare(cv, s); }); } };
})(window);
