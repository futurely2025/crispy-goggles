/* Prob — probability: normal & binomial distributions, permutations/combinations, step-by-step working in
 * Arabic, the standard normal (Z) table, and distribution charts (normal curve with the shaded area,
 * binomial bars).  Markup (inside the chart environment):
 *   \begin{chart}[type=normal, mean=50, sd=10, from=40, to=60]\end{chart}        % from/to optional (−∞ / +∞)
 *   \begin{chart}[type=normal, z, from=-1.96, to=1.96]\end{chart}                 % standard normal Z
 *   \begin{chart}[type=binomial, n=10, p=0.3, from=2, to=4]\end{chart}
 * Tables: \ztable   \binomtable[n=6, p=0.4] */
(function (global) {
  'use strict';

  // ------------------------------------------------------------ numerics
  function erf(x) {             // W. J. Cody-grade accuracy via the complementary error function (|err| < 1.2e-7)
    var z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    var r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
      t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? 1 - r : r - 1;
  }
  function phi(z) { if (z === Infinity) return 1; if (z === -Infinity) return 0; return 0.5 * (1 + erf(z / Math.SQRT2)); }
  function pdf(x, mu, sd) { var z = (x - mu) / sd; return Math.exp(-z * z / 2) / (sd * Math.sqrt(2 * Math.PI)); }
  function fact(n) { var r = 1; for (var i = 2; i <= n; i++) r *= i; return r; }
  function nCr(n, r) { if (r < 0 || r > n) return 0; r = Math.min(r, n - r); var v = 1; for (var i = 1; i <= r; i++) v = v * (n - r + i) / i; return Math.round(v); }
  function nPr(n, r) { if (r < 0 || r > n) return 0; var v = 1; for (var i = 0; i < r; i++) v *= (n - i); return v; }
  function binom(n, p, k) { return nCr(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k); }
  function r4(v) { return String(+(+v).toFixed(4)); }
  function r2(v) { return String(+(+v).toFixed(2)); }
  function num(v, d) { if (v === undefined || v === null || v === '' || v === true) return d; var s = String(v).trim().replace(/[٠-٩]/g, function (c) { return c.charCodeAt(0) - 0x660; });
    if (/^[-−]?(inf|infty|∞|\\infty)$/i.test(s)) return /^[-−]/.test(s) ? -Infinity : Infinity; var n = parseFloat(s.replace('−', '-')); return isFinite(n) ? n : d; }
  function tx(v) { return v === Infinity ? '\\infty' : v === -Infinity ? '-\\infty' : r4(v); }

  // ------------------------------------------------------------ steps (Arabic)
  function interval(a, b, v) {
    if (a === -Infinity && b === Infinity) return v + ' \\in ح';
    if (a === -Infinity) return v + ' < ' + tx(b);
    if (b === Infinity) return v + ' > ' + tx(a);
    return tx(a) + ' < ' + v + ' < ' + tx(b);
  }
  function normalSteps(mu, sd, a, b) {
    if (!(sd > 0)) throw new Error('الانحراف المعياري يجب أن يكون موجباً');
    var st = [], S = function (t, tex) { st.push({ t: t, tex: tex || null }); };
    var z1 = a === -Infinity ? -Infinity : (a - mu) / sd, z2 = b === Infinity ? Infinity : (b - mu) / sd;
    S('المتغير س يتبع التوزيع الطبيعي بوسط حسابي μ = ' + r4(mu) + ' وانحراف معياري σ = ' + r4(sd) + '، والمطلوب:', 'ل(' + interval(a, b, 'س') + ')');
    S('نحوّل إلى الدرجة المعيارية:', 'Z = \\frac{س - μ}{σ}');
    if (a !== -Infinity) S('عند س = ' + r4(a) + ':', 'Z_1 = \\frac{' + r4(a) + ' - ' + r4(mu) + '}{' + r4(sd) + '} = ' + r2(z1));
    if (b !== Infinity) S('عند س = ' + r4(b) + ':', 'Z_2 = \\frac{' + r4(b) + ' - ' + r4(mu) + '}{' + r4(sd) + '} = ' + r2(z2));
    var P, tex;
    if (a === -Infinity) { P = phi(z2); tex = 'ل(Z < ' + r2(z2) + ') = Φ(' + r2(z2) + ') = ' + r4(P); }
    else if (b === Infinity) { P = 1 - phi(z1); tex = 'ل(Z > ' + r2(z1) + ') = 1 - Φ(' + r2(z1) + ') = 1 - ' + r4(phi(z1)) + ' = ' + r4(P); }
    else { P = phi(z2) - phi(z1); tex = 'ل(' + r2(z1) + ' < Z < ' + r2(z2) + ') = Φ(' + r2(z2) + ') - Φ(' + r2(z1) + ') = ' + r4(phi(z2)) + ' - ' + r4(phi(z1)) + ' = ' + r4(P); }
    S('من جدول التوزيع الطبيعي المعياري:', tex);
    S('إذن الاحتمال المطلوب ≈ ' + r4(P) + ' أي حوالي ' + r2(P * 100) + '٪.', null);
    return { steps: st, p: P, z1: z1, z2: z2 };
  }
  function binomialSteps(n, p, a, b) {
    n = Math.round(n);
    if (!(n >= 1 && n <= 170)) throw new Error('عدد المحاولات ن يجب أن يكون بين 1 و170');
    if (!(p >= 0 && p <= 1)) throw new Error('الاحتمال ح يجب أن يكون بين 0 و1');
    var lo = a === -Infinity ? 0 : Math.max(0, Math.ceil(a)), hi = b === Infinity ? n : Math.min(n, Math.floor(b));
    var st = [], S = function (t, tex) { st.push({ t: t, tex: tex || null }); };
    S('س متغير ذو الحدين: عدد المحاولات ن = ' + n + '، واحتمال النجاح ح = ' + r4(p) + '، فاحتمال الفشل ل = 1 - ح = ' + r4(1 - p) + ':', 'ل(س = ر) = \\binom{ن}{ر} ح^{ر} (1 - ح)^{ن - ر}');
    var tot = 0, terms = [];
    for (var k = lo; k <= hi; k++) {
      var v = binom(n, p, k); tot += v; terms.push(r4(v));
      if (hi - lo <= 5) S('عند ر = ' + k + ':', 'ل(س = ' + k + ') = \\binom{' + n + '}{' + k + '} (' + r4(p) + ')^{' + k + '} (' + r4(1 - p) + ')^{' + (n - k) + '} = ' + nCr(n, k) + ' \\times ' + r4(Math.pow(p, k)) + ' \\times ' + r4(Math.pow(1 - p, n - k)) + ' = ' + r4(v));
    }
    if (hi > lo) S('نجمع الاحتمالات:', 'ل(' + lo + ' \\le س \\le ' + hi + ') = ' + (terms.length <= 8 ? terms.join(' + ') + ' = ' : '') + r4(tot));
    S('الوسط الحسابي والتباين لتوزيع ذي الحدين:', 'μ = ن ح = ' + r4(n * p) + ' ، \\quad σ^2 = ن ح (1 - ح) = ' + r4(n * p * (1 - p)));
    return { steps: st, p: tot, lo: lo, hi: hi };
  }
  function countSteps(kind, n, r) {
    n = Math.round(n); r = Math.round(r);
    if (!(n >= 0 && r >= 0 && r <= n && n <= 170)) throw new Error('يجب أن يكون 0 ≤ ر ≤ ن');
    var st = [], S = function (t, tex) { st.push({ t: t, tex: tex || null }); };
    var expand = function (m) { if (m <= 1) return '1'; var a = []; for (var i = m; i >= Math.max(1, m - 5); i--) a.push(i); return a.join(' \\times ') + (m > 6 ? ' \\times \\cdots' : ''); };
    if (kind === 'P') {
      S('عدد التباديل (الترتيب مهم):', 'ل(' + n + '، ' + r + ') = \\frac{ن!}{(ن - ر)!} = \\frac{' + n + '!}{' + (n - r) + '!}');
      var f = []; for (var i = 0; i < r; i++) f.push(n - i);
      S('نختصر:', 'ل(' + n + '، ' + r + ') = ' + (f.length ? f.join(' \\times ') : '1') + ' = ' + nPr(n, r));
    } else {
      S('عدد التوافيق (الترتيب غير مهم):', '\\binom{' + n + '}{' + r + '} = \\frac{ن!}{ر!(ن - ر)!} = \\frac{' + n + '!}{' + r + '! \\times ' + (n - r) + '!}');
      var rr = Math.min(r, n - r), top = [], bot = [];
      for (var j = 0; j < rr; j++) top.push(n - j);
      for (var q = rr; q >= 1; q--) bot.push(q);
      S('نختصر:', '\\binom{' + n + '}{' + r + '} = \\frac{' + (top.join(' \\times ') || '1') + '}{' + (bot.join(' \\times ') || '1') + '} = ' + nCr(n, r));
    }
    if (n <= 12) S('حيث:', n + '! = ' + expand(n) + ' = ' + fact(n));
    return { steps: st, value: kind === 'P' ? nPr(n, r) : nCr(n, r) };
  }

  // ------------------------------------------------------------ tables (models for Word tables)
  function cell(v, bold) { return { segs: [{ t: /[=^_\\]/.test(String(v)) ? 'math' : 'text', v: String(v), mode: 'math' }], span: 1, bold: !!bold }; }
  function ztable(opts) {
    var rows = [{ cells: [cell('Z', true)].concat([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (c) { return cell('0.0' + c, true); })), lineBelow: true }];
    var from = num(opts && opts.from, 0), to = num(opts && opts.to, 3.4);
    for (var z = from; z <= to + 1e-9; z += 0.1) {
      var zz = Math.round(z * 10) / 10;
      rows.push({ cells: [cell(zz.toFixed(1), true)].concat([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (c) { return cell(phi(zz + c / 100).toFixed(4)); })), lineBelow: false });
    }
    return { rows: rows, align: 'c', ncol: 11, border: true, header: true, color: '#E2F5F3' };
  }
  function binomTable(opts) {
    var n = Math.round(num(opts.n, 5)), p = num(opts.p, 0.5), rows = [{ cells: [cell('ر', true), cell('ل(س = ر)', true), cell('ل(س ≤ ر)', true)], lineBelow: true }], cum = 0;
    for (var k = 0; k <= n; k++) { var v = binom(n, p, k); cum += v; rows.push({ cells: [cell(k), cell(v.toFixed(4)), cell(Math.min(1, cum).toFixed(4))] }); }
    rows.push({ cells: [cell('المجموع', true), cell('1', true), cell('')], total: true });
    return { rows: rows, align: 'c', ncol: 3, border: true, header: true, color: '#E2F5F3' };
  }

  // ------------------------------------------------------------ charts
  function readOpts(d, o) {
    d.mean = num(o.mean !== undefined ? o.mean : o.mu, 0); d.sd = num(o.sd !== undefined ? o.sd : o.sigma, 1);
    if (o.z) { d.mean = 0; d.sd = 1; d.z = true; }
    d.n = Math.round(num(o.n, 10)); d.p = num(o.p, 0.5);
    d.from = o.from !== undefined ? num(o.from, -Infinity) : null; d.to = o.to !== undefined ? num(o.to, Infinity) : null;
    if (d.from === -Infinity) d.from = '-inf'; if (d.to === Infinity) d.to = 'inf';
    return d;
  }
  function bound(v, dflt) { return v === null || v === undefined || v === '' ? dflt : v === '-inf' ? -Infinity : v === 'inf' ? Infinity : +v; }
  function render(data) {
    var Rs = global.Raster, W = +data.w || 560, H = +data.h || 330, fs = (data.fontSize || 12) * 96 / 72;
    var ar = data.notation !== 'en', eastern = data.digits === 'eastern', font = data.font || 'Amiri';
    var D = function (v) { return Rs.digits(String(v), eastern); };
    var TQ = '#0e9f9a', INK = '#1b2a30', GRID = '#dde7e9', ACC = '#e07a00';
    var out = [], mL = 44, mR = 24, mT = 16 + (data.title ? fs * 1.8 : 0), mB = 44 + (data.xlabel ? fs * 1.4 : 0);
    if (data.title) out.push(Rs.words(W / 2, 12 + fs, D(data.title), ' class="ttl"', fs * 1.25, ar));
    var PW = W - mL - mR, PH = H - mT - mB, label = null;
    if (data.type === 'normal') {
      var mu = +data.mean, sd = +data.sd, a = bound(data.from, null), b = bound(data.to, null);
      var x0 = mu - 4 * sd, x1 = mu + 4 * sd, ymax = pdf(mu, mu, sd) * 1.12;
      var X = function (x) { return mL + (x - x0) / (x1 - x0) * PW; }, Y = function (y) { return mT + PH - y / ymax * PH; };
      var curve = [];
      for (var i = 0; i <= 240; i++) { var x = x0 + (x1 - x0) * i / 240; curve.push([X(x), Y(pdf(x, mu, sd))]); }
      var dstr = function (pts) { return pts.map(function (p, k) { return (k ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2); }).join(''); };
      if (a !== null || b !== null) {
        var lo = a === null || a === -Infinity ? x0 : Math.max(x0, a), hi = b === null || b === Infinity ? x1 : Math.min(x1, b);
        var area = [[X(lo), Y(0)]];
        for (var j = 0; j <= 160; j++) { var xx = lo + (hi - lo) * j / 160; area.push([X(xx), Y(pdf(xx, mu, sd))]); }
        area.push([X(hi), Y(0)]);
        out.push('<path d="' + dstr(area) + 'Z" fill="' + TQ + '" fill-opacity="0.3" stroke="none"/>');
        [a, b].forEach(function (v) { if (v !== null && isFinite(v) && v >= x0 && v <= x1) out.push('<path d="M' + X(v).toFixed(2) + ' ' + Y(0).toFixed(2) + 'V' + Y(pdf(v, mu, sd)).toFixed(2) + '" stroke="' + TQ + '" stroke-width="1.6"/>'); });
        var P = phi(b === null ? Infinity : (b - mu) / sd) - phi(a === null ? -Infinity : (a - mu) / sd);
        var v = data.z ? 'Z' : 'س';
        label = { tex: 'ل(' + interval(a === null ? -Infinity : a, b === null ? Infinity : b, v) + ') ≈ ' + r4(P), x: W / 2, y: mT + 4 };
      }
      out.push('<path d="M' + X(mu).toFixed(2) + ' ' + Y(0).toFixed(2) + 'V' + Y(pdf(mu, mu, sd)).toFixed(2) + '" stroke="' + INK + '" stroke-width="1" stroke-dasharray="4 3"/>');
      out.push('<path d="' + dstr(curve) + '" fill="none" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>');
      out.push('<path d="M' + mL + ' ' + Y(0).toFixed(2) + 'H' + (mL + PW) + '" stroke="' + INK + '" stroke-width="1.4"/>');
      for (var k = -3; k <= 3; k++) {
        var tx0 = X(mu + k * sd);
        out.push('<path d="M' + tx0.toFixed(2) + ' ' + Y(0).toFixed(2) + 'v5" stroke="' + INK + '" stroke-width="1.2"/>');
        out.push('<text class="sm" x="' + tx0.toFixed(2) + '" y="' + (Y(0) + fs * 1.15).toFixed(2) + '" text-anchor="middle" direction="ltr">' + D(r4(mu + k * sd).replace('-', '−')) + '</text>');
        if (!data.z) out.push('<text class="xs" x="' + tx0.toFixed(2) + '" y="' + (Y(0) + fs * 2.25).toFixed(2) + '" text-anchor="middle" direction="ltr" fill="#5f7179">' + (k === 0 ? 'μ' : 'μ' + (k > 0 ? '+' : '−') + (Math.abs(k) > 1 ? Math.abs(k) : '') + 'σ') + '</text>');
      }
    } else {                                    // binomial
      var n = Math.max(1, Math.round(+data.n)), p = +data.p, probs = [], pmax = 0;
      for (var q = 0; q <= n; q++) { probs.push(binom(n, p, q)); pmax = Math.max(pmax, probs[q]); }
      var ytop = Math.ceil(pmax * 1.15 * 20) / 20 || 0.05, lo2 = bound(data.from, null), hi2 = bound(data.to, null);
      var bw = PW / (n + 1), Yb = function (y) { return mT + PH - y / ytop * PH; };
      for (var gy = 0; gy <= ytop + 1e-9; gy += ytop / 5) {
        out.push('<path d="M' + mL + ' ' + Yb(gy).toFixed(2) + 'H' + (mL + PW) + '" stroke="' + GRID + '"/>');
        out.push('<text class="sm" x="' + (mL - 6) + '" y="' + (Yb(gy) + fs * 0.35).toFixed(2) + '" text-anchor="end" direction="ltr">' + D(r2(gy)) + '</text>');
      }
      var sel = 0;
      probs.forEach(function (pv, k2) {
        var inside = (lo2 !== null || hi2 !== null) && k2 >= (lo2 === null ? -Infinity : lo2) && k2 <= (hi2 === null ? Infinity : hi2);
        if (inside) sel += pv;
        var x = mL + k2 * bw + bw * 0.14, w = bw * 0.72;
        out.push('<rect x="' + x.toFixed(2) + '" y="' + Yb(pv).toFixed(2) + '" width="' + w.toFixed(2) + '" height="' + (Yb(0) - Yb(pv)).toFixed(2) + '" fill="' + (inside ? ACC : TQ) + '"/>');
        out.push('<text class="sm" x="' + (x + w / 2).toFixed(2) + '" y="' + (Yb(0) + fs * 1.15).toFixed(2) + '" text-anchor="middle" direction="ltr">' + D(k2) + '</text>');
        if (n <= 14 && data.values !== false) out.push('<text class="xs" x="' + (x + w / 2).toFixed(2) + '" y="' + (Yb(pv) - 4).toFixed(2) + '" text-anchor="middle" direction="ltr">' + D(pv.toFixed(n <= 8 ? 3 : 2)) + '</text>');
      });
      out.push('<path d="M' + mL + ' ' + Yb(0).toFixed(2) + 'H' + (mL + PW) + 'M' + mL + ' ' + mT + 'V' + Yb(0).toFixed(2) + '" stroke="' + INK + '" stroke-width="1.4" fill="none"/>');
      if (lo2 !== null || hi2 !== null) {
        var l0 = lo2 === null || lo2 === -Infinity ? 0 : Math.ceil(lo2), h0 = hi2 === null || hi2 === Infinity ? n : Math.floor(hi2);
        label = { tex: 'ل(' + l0 + ' \\le س \\le ' + h0 + ') = ' + r4(sel), x: W / 2, y: mT + 2 };
      } else label = { tex: 'ن = ' + n + ' ، \\quad ح = ' + r4(p), x: W / 2, y: mT + 2 };
    }
    if (data.xlabel) out.push(Rs.words(mL + PW / 2, H - 10, D(data.xlabel), ' class="l" font-weight="700"', fs, ar));
    var eqP = label && global.RenderHost ? global.RenderHost.preview(label.tex, { rtl: ar, arabicFunctions: ar, arabicComma: ar, digits: eastern ? 'eastern' : 'western', color: '#c2352b', fontSize: 14, font: font, display: false, mode: 'math' }, true).catch(function () { return null; }) : Promise.resolve(null);
    return Promise.all([Rs.fontCss([font], true), eqP]).then(function (res) {
      var lbl = res[1];
      if (lbl && !(lbl.errors && lbl.errors.length)) {
        var px = fs * 1.05, w = lbl.width * px, h = lbl.total * px, x = label.x - w / 2;
        out.push('<rect x="' + (x - 5).toFixed(2) + '" y="' + (label.y - 2).toFixed(2) + '" width="' + (w + 10).toFixed(2) + '" height="' + (h + 4).toFixed(2) + '" rx="5" fill="#fff" fill-opacity="0.92"/>');
        out.push(lbl.svgString.replace(/^<svg\b([^>]*)>/, function (m0, a) { return '<svg' + a.replace(/\s(width|height|style|x|y)="[^"]*"/g, '') + ' x="' + x.toFixed(2) + '" y="' + label.y.toFixed(2) + '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) + '" overflow="visible">'; }));
      }
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><defs><style>' + res[0] +
        ' .l,.sm,.xs,.ttl{font-family:"' + font + '","Times New Roman",serif;font-size:' + fs.toFixed(1) + 'px;fill:' + INK + '} .sm{font-size:' + (fs * 0.9).toFixed(1) + 'px} .xs{font-size:' + (fs * 0.78).toFixed(1) + 'px} .ttl{font-size:' + (fs * 1.25).toFixed(1) + 'px;font-weight:700}</style></defs>' +
        '<rect width="' + W + '" height="' + H + '" fill="#fff"/>' + out.join('') + '</svg>';
      return { svg: svg, w: W, h: H, info: {} };
    });
  }

  global.Prob = { erf: erf, phi: phi, pdf: pdf, nCr: nCr, nPr: nPr, binom: binom, fact: fact, num: num,
    normalSteps: normalSteps, binomialSteps: binomialSteps, countSteps: countSteps, ztable: ztable, binomTable: binomTable, render: render, readOpts: readOpts };
})(window);
