// runs inside the page: synthetic digit data + MLP trainer (uses PdfOcrDigits for components/features so training and inference match)
window.TL = (function () {
  const D = window.PdfOcrDigits;
  let seed = 123456789; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; const rr = (a, b) => a + (b - a) * rnd(); const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.7;
  const EAST = '١٢٣٤٥٦٧٨٩', WEST = '0123456789';
  const AR_LET = 'ابتثجحخدذرزسشصضطظعغفقكلمنهويأإؤئةى';
  const cv = document.createElement('canvas'), cv2 = document.createElement('canvas');
  function render(text, font, px, aug, size) {
    const S = size || Math.round(px * 3.2); cv.width = cv.height = S; cv2.width = cv2.height = S;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#000'; g.strokeStyle = '#000'; g.font = font.replace('PX', px + 'px'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'ltr';
    const rot = aug ? gauss() * 0.045 : 0, sh = aug ? gauss() * 0.06 : 0, sx = aug ? rr(0.85, 1.15) : 1, sy = aug ? rr(0.9, 1.1) : 1;
    g.setTransform(sx * Math.cos(rot), sx * Math.sin(rot), sh + -Math.sin(rot) * sy, Math.cos(rot) * sy, S / 2, S / 2);
    g.fillText(text, 0, 0);
    const th = aug ? rr(-1.2, 2.6) : 0;
    if (th > 0.3) { g.lineWidth = th; g.lineJoin = 'round'; g.strokeText(text, 0, 0); } else if (th < -0.3) { g.strokeStyle = '#fff'; g.lineWidth = -th; g.strokeText(text, 0, 0); }
    g.setTransform(1, 0, 0, 1, 0, 0);
    const g2 = cv2.getContext('2d', { willReadFrequently: true }); g2.fillStyle = '#fff'; g2.fillRect(0, 0, S, S);
    g2.filter = aug ? 'blur(' + rr(0, 1.3) + 'px)' : 'none';
    if (aug && rnd() < 0.7) { // wobble: shift rows sideways and columns up/down a little (hand-set type, uneven scans)
      const amp = rr(0, 0.045) * px, lam = rr(0.4, 1.6) * px, ph = rnd() * 6.28, amp2 = rr(0, 0.03) * px, lam2 = rr(0.4, 1.6) * px, ph2 = rnd() * 6.28;
      for (let y = 0; y < S; y += 2) g2.drawImage(cv, 0, y, S, 2, amp * Math.sin(y / lam * 6.28 + ph), y, S, 2);
      cv.getContext('2d').clearRect(0, 0, 0, 0);
    } else g2.drawImage(cv, 0, 0);
    g2.filter = 'none';
    const id = g2.getImageData(0, 0, S, S), a = id.data, nz = aug ? rr(0, 28) : 0;
    let mn = 255, mx = 0; for (let i = 0; i < a.length; i += 4) { let v = a[i] + (nz ? gauss() * nz : 0); a[i] = v; if (v < mn) mn = v; if (v > mx) mx = v; }
    const thr = mn + (mx - mn) * (aug ? rr(0.38, 0.62) : 0.5), bin = { w: S, h: S, g: new Uint8ClampedArray(S * S) };
    for (let i = 0; i < S * S; i++) bin.g[i] = a[i * 4] > thr ? 255 : 0;
    return D.components(bin, { x0: 0, y0: 0, x1: S - 1, y1: S - 1 });
  }
  function union(comps, minN) {
    const cs = comps.filter(c => c.n >= minN); if (!cs.length) return null;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; cs.forEach(c => { x0 = Math.min(x0, c.ox + c.x0); y0 = Math.min(y0, c.oy + c.y0); x1 = Math.max(x1, c.ox + c.x1); y1 = Math.max(y1, c.oy + c.y1); });
    const w = x1 - x0 + 1, h = y1 - y0 + 1, m = new Uint8Array(w * h); cs.forEach(c => { for (let i = 0; i < c.px.length; i += 2) m[(c.oy + c.px[i + 1] - y0) * w + c.ox + c.px[i] - x0] = 1; });
    return { m, w, h };
  }
  function sample(text, font, label, px) { const comps = render(text, font, px, true); const u = union(comps, 6); if (!u || u.w < 3 || u.h < 3) return null; return { f: D.featuresOf(u.m, u.w, u.h), y: label }; }
  async function loadFonts(list) {
    const ok = [];
    for (const f of list) {
      try { if (f.url) { const ff = new FontFace(f.fam, 'url(' + f.url + ')', { weight: f.bold ? '700' : '400', style: f.italic ? 'italic' : 'normal' }); await ff.load(); document.fonts.add(ff); } ok.push(f); } catch (e) { /* skip */ }
    }
    return ok;
  }
  const css = f => (f.italic ? 'italic ' : '') + (f.bold ? 'bold ' : '') + 'PX "' + f.fam + '"';
  function makeData(eastFonts, westFonts, otherFonts, nE, nW, nO) {
    const X = [], Y = [];
    const add = s => { if (s) { X.push(s.f); Y.push(s.y); } };
    eastFonts.forEach(f => { for (let d = 0; d < 9; d++) for (let k = 0; k < nE; k++) add(sample(EAST[d], css(f), d, rr(36, 110))); });
    westFonts.forEach(f => { for (let d = 0; d < 10; d++) for (let k = 0; k < nW; k++) add(sample(WEST[d], css(f), 9 + d, rr(36, 110))); });
    // "other": single Arabic letters, glued letters, Latin letters, punctuation, specks
    otherFonts.forEach(f => {
      for (let k = 0; k < nO; k++) {
        const len = 1 + Math.floor(rnd() * 5); let t = ''; for (let i = 0; i < len; i++) t += AR_LET[Math.floor(rnd() * AR_LET.length)];
        const comps = render(t, css(f), rr(36, 100), true).filter(c => c.n >= 25);
        comps.forEach(c => { if (rnd() < 0.5) { const m = D.maskOf(c); X.push(D.featuresOf(m.m, m.w, m.h)); Y.push(19); } });
      }
      const extra = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ()[]{}*#@&?!;،؛؟«»\\|';
      for (let k = 0; k < Math.floor(nO * 0.5); k++) add(sample(extra[Math.floor(rnd() * extra.length)], css(f), 19, rr(36, 100)));
    });
    // slash and plus (they occur inside dates, times, sums)
    eastFonts.concat(westFonts).forEach(f => { for (let k = 0; k < Math.floor(nW * 0.9); k++) { add(sample('/', css(f), 20, rr(36, 110))); add(sample('+', css(f), 21, rr(36, 110))); } });
    return { X, Y };
  }
  // ---- MLP (Adam)
  function init(nin, h1, h2, nout) {
    const he = (n, m, k) => { const w = new Float32Array(n * m); for (let i = 0; i < w.length; i++) w[i] = gauss() * Math.sqrt(2 / n) * 0.6; return w; };
    return { h1, h2, out: nout, w1: he(nin, h1), b1: new Float32Array(h1), w2: he(h1, h2), b2: new Float32Array(h2), w3: he(h2, nout), b3: new Float32Array(nout) };
  }
  function train(M, data, epochs, onEpoch, val) {
    const NF = data.X[0].length, n = data.X.length, B = 64, params = ['w1', 'b1', 'w2', 'b2', 'w3', 'b3'];
    const m = {}, v = {}; params.forEach(p => { m[p] = new Float32Array(M[p].length); v[p] = new Float32Array(M[p].length); });
    let step = 0; const idx = Array.from({ length: n }, (_, i) => i);
    for (let ep = 0; ep < epochs; ep++) {
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      const lr = 0.0025 * Math.pow(0.9, ep); let loss = 0;
      for (let b0 = 0; b0 < n; b0 += B) {
        const G = {}; params.forEach(p => G[p] = new Float32Array(M[p].length)); const bn = Math.min(B, n - b0);
        for (let bi = 0; bi < bn; bi++) {
          const x = data.X[idx[b0 + bi]], y = data.Y[idx[b0 + bi]];
          const h1 = new Float32Array(M.h1), h2 = new Float32Array(M.h2), o = new Float32Array(M.out);
          for (let j = 0; j < M.h1; j++) { let s = M.b1[j]; for (let i = 0; i < NF; i++) s += x[i] * M.w1[i * M.h1 + j]; h1[j] = s > 0 ? s : 0; }
          for (let j = 0; j < M.h2; j++) { let s = M.b2[j]; for (let i = 0; i < M.h1; i++) s += h1[i] * M.w2[i * M.h2 + j]; h2[j] = s > 0 ? s : 0; }
          let mx = -1e9; for (let j = 0; j < M.out; j++) { let s = M.b3[j]; for (let i = 0; i < M.h2; i++) s += h2[i] * M.w3[i * M.out + j]; o[j] = s; if (s > mx) mx = s; }
          let sum = 0; for (let j = 0; j < M.out; j++) { o[j] = Math.exp(o[j] - mx); sum += o[j]; } for (let j = 0; j < M.out; j++) o[j] /= sum;
          loss -= Math.log(o[y] + 1e-9);
          const d3 = new Float32Array(M.out); for (let j = 0; j < M.out; j++) d3[j] = o[j] - (j === y ? 1 : 0);
          const d2 = new Float32Array(M.h2); for (let i = 0; i < M.h2; i++) { let s = 0; for (let j = 0; j < M.out; j++) { s += d3[j] * M.w3[i * M.out + j]; G.w3[i * M.out + j] += h2[i] * d3[j]; } d2[i] = h2[i] > 0 ? s : 0; }
          for (let j = 0; j < M.out; j++) G.b3[j] += d3[j];
          const d1 = new Float32Array(M.h1); for (let i = 0; i < M.h1; i++) { let s = 0; for (let j = 0; j < M.h2; j++) { s += d2[j] * M.w2[i * M.h2 + j]; G.w2[i * M.h2 + j] += h1[i] * d2[j]; } d1[i] = h1[i] > 0 ? s : 0; }
          for (let j = 0; j < M.h2; j++) G.b2[j] += d2[j];
          for (let i = 0; i < NF; i++) { const xi = x[i]; if (xi === 0) continue; for (let j = 0; j < M.h1; j++) G.w1[i * M.h1 + j] += xi * d1[j]; }
          for (let j = 0; j < M.h1; j++) G.b1[j] += d1[j];
        }
        step++; const b1c = 1 - Math.pow(0.9, step), b2c = 1 - Math.pow(0.999, step);
        params.forEach(p => { const P = M[p], g = G[p], mm = m[p], vv = v[p]; for (let i = 0; i < P.length; i++) { const gi = g[i] / bn + 1e-5 * P[i]; mm[i] = 0.9 * mm[i] + 0.1 * gi; vv[i] = 0.999 * vv[i] + 0.001 * gi * gi; P[i] -= lr * (mm[i] / b1c) / (Math.sqrt(vv[i] / b2c) + 1e-8); } });
      }
      onEpoch && onEpoch(ep, loss / n, val ? evaluate(M, val) : null);
    }
    return M;
  }
  function predict(M, x) {
    const NF = x.length, h1 = new Float32Array(M.h1), h2 = new Float32Array(M.h2), o = new Float32Array(M.out);
    for (let j = 0; j < M.h1; j++) { let s = M.b1[j]; for (let i = 0; i < NF; i++) s += x[i] * M.w1[i * M.h1 + j]; h1[j] = s > 0 ? s : 0; }
    for (let j = 0; j < M.h2; j++) { let s = M.b2[j]; for (let i = 0; i < M.h1; i++) s += h1[i] * M.w2[i * M.h2 + j]; h2[j] = s > 0 ? s : 0; }
    let b = 0, mx = -1e9; for (let j = 0; j < M.out; j++) { let s = M.b3[j]; for (let i = 0; i < M.h2; i++) s += h2[i] * M.w3[i * M.out + j]; if (s > mx) { mx = s; b = j; } } return b;
  }
  function evaluate(M, d) { let ok = 0, east = 0, eN = 0, west = 0, wN = 0, oth = 0, oN = 0; d.X.forEach((x, i) => { const p = predict(M, x), y = d.Y[i]; if (p === y) ok++; if (y < 9) { eN++; if (p === y) east++; } else if (y < 19) { wN++; if (p === y) west++; } else if (y === 19) { oN++; if (p === y) oth++; } }); return { acc: ok / d.X.length, east: east / eN, west: west / wN, other: oth / oN, n: d.X.length }; }
  return { makeData, loadFonts, init, train, evaluate, css, render, union, sample, seedIt: s => { seed = s; } };
})();
