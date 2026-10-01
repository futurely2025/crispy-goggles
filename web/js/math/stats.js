/*
 * StatsEngine — descriptive statistics with Arabic step-by-step working (no external services).
 *   StatsEngine.parse(text | {values, freq, classes})   -> dataset
 *   StatsEngine.summary(ds, {sample})                    -> {n, sum, mean, median, modes, min, max, range, variance, sd, q1, q3, iqr, cv}
 *   StatsEngine.steps(ds, what, {sample})                -> [{t, tex}]   what: mean|median|mode|variance|sd|range|quartiles|all
 *   StatsEngine.freqTable(opts, body)  / summaryTable(opts, body) -> table model for Word
 *   StatsEngine.regression(points)                       -> {a, b, r, r2, steps}
 * Datasets: raw values, value/frequency pairs ("2:5"), or classes ("10-20:7").
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root.Mk || require('../figures/util.js'));
  else root.StatsEngine = factory(root.Mk);
})(this, function (Mk) {
  'use strict';

  function num(v) { return Mk.evalNum(String(v).trim(), NaN); }
  function r(v, d) { if (!isFinite(v)) return String(v); d = d === undefined ? 4 : d; return String(+(+v).toFixed(d)); }

  // ------------------------------------------------------------ parsing
  /**
   * text forms:
   *   "3, 5, 7, 7, 9"                      raw values (commas, spaces, Arabic commas, new lines)
   *   "1:4, 2:6, 3:9"                      value : frequency
   *   "10-20:4, 20-30:7"   "[10,20):4"     classes : frequency
   *   "values={1,2,3}, freq={4,5,6}"       key=value form (also classes={10-20,20-30})
   */
  function parse(input) {
    if (input && typeof input === 'object' && !Array.isArray(input)) return fromObject(input);
    var s = Mk.digits(String(input || '')).replace(/\r/g, '').trim();
    if (!s) throw new Error('لا توجد بيانات');
    if (/(values|freq|classes)\s*=/.test(s)) return fromObject(Mk.options(s));
    var items = s.split(/[\n,،;؛]+|\s{2,}|\t/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (items.length === 1 && /\s/.test(items[0])) items = items[0].split(/\s+/);
    var hasColon = items.some(function (x) { return /[:=]/.test(x); });
    if (!hasColon) {
      var vals = items.map(num);
      var bad = items.filter(function (x, i) { return !isFinite(vals[i]); });
      if (bad.length) throw new Error('قيم غير عددية: ' + bad.slice(0, 4).join('، '));
      return { kind: 'raw', values: vals };
    }
    var pairs = items.map(function (x) {
      var p = x.split(/[:=]/), key = p[0].trim(), f = num(p[1]);
      if (!isFinite(f) || f < 0) throw new Error('تكرار غير صالح في «' + x + '»');
      var cm = key.match(/^[\[(]?\s*(-?[\d.]+)\s*(?:-|–|—|إلى|to|,)\s*(-?[\d.]+)\s*[\])]?$/);
      if (cm) return { a: +cm[1], b: +cm[2], f: f };
      var v = num(key);
      if (!isFinite(v)) return { label: key, f: f };
      return { v: v, f: f };
    });
    if (pairs.every(function (p) { return p.a !== undefined; })) return { kind: 'grouped', classes: pairs.map(function (p) { return [p.a, p.b]; }), freq: pairs.map(function (p) { return p.f; }) };
    if (pairs.every(function (p) { return p.v !== undefined; })) return { kind: 'freq', values: pairs.map(function (p) { return p.v; }), freq: pairs.map(function (p) { return p.f; }) };
    return { kind: 'categorical', labels: pairs.map(function (p) { return p.label !== undefined ? p.label : String(p.v); }), freq: pairs.map(function (p) { return p.f; }) };
  }
  function fromObject(o) {
    var f = o.freq !== undefined ? Mk.numList(o.freq) : null;
    if (o.classes !== undefined) {
      var cls = Mk.list(o.classes).map(function (c) { var m = Mk.digits(c).match(/(-?[\d.]+)\s*(?:-|–|إلى|to|,)\s*(-?[\d.]+)/); return m ? [+m[1], +m[2]] : null; });
      if (cls.some(function (c) { return !c; })) throw new Error('صيغة الفئات: 10-20, 20-30 …');
      if (!f || f.length !== cls.length) throw new Error('عدد التكرارات لا يساوي عدد الفئات');
      return { kind: 'grouped', classes: cls, freq: f };
    }
    var v = Mk.numList(o.values || o.data || '');
    if (f) { if (f.length !== v.length) throw new Error('عدد التكرارات لا يساوي عدد القيم'); return { kind: 'freq', values: v, freq: f }; }
    return { kind: 'raw', values: v };
  }

  // expand to (value, frequency) with sorted values
  function table(ds) {
    if (ds.kind === 'raw') {
      var m = {};
      ds.values.forEach(function (v) { m[v] = (m[v] || 0) + 1; });
      var keys = Object.keys(m).map(Number).sort(function (a, b) { return a - b; });
      return { x: keys, f: keys.map(function (k) { return m[k]; }) };
    }
    if (ds.kind === 'freq') {
      var idx = ds.values.map(function (v, i) { return i; }).sort(function (a, b) { return ds.values[a] - ds.values[b]; });
      return { x: idx.map(function (i) { return ds.values[i]; }), f: idx.map(function (i) { return ds.freq[i]; }) };
    }
    if (ds.kind === 'grouped') return { x: ds.classes.map(function (c) { return (c[0] + c[1]) / 2; }), f: ds.freq.slice() };
    throw new Error('البيانات وصفية: يمكن رسمها وحساب المنوال فقط');
  }
  function sorted(ds) {
    var t = table(ds), out = [];
    t.x.forEach(function (x, i) { for (var k = 0; k < t.f[i]; k++) out.push(x); });
    return out;
  }
  function medianOf(a) {
    var n = a.length; if (!n) return NaN;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }

  // ------------------------------------------------------------ summary
  function summary(ds, o) {
    o = o || {};
    if (ds.kind === 'categorical') {
      var mx = Math.max.apply(null, ds.freq);
      return { n: ds.freq.reduce(function (a, b) { return a + b; }, 0), modes: ds.labels.filter(function (l, i) { return ds.freq[i] === mx; }), categorical: true };
    }
    var t = table(ds), n = t.f.reduce(function (a, b) { return a + b; }, 0);
    if (!n) throw new Error('مجموع التكرارات صفر');
    var sum = t.x.reduce(function (a, x, i) { return a + x * t.f[i]; }, 0), mean = sum / n;
    var ss = t.x.reduce(function (a, x, i) { return a + t.f[i] * (x - mean) * (x - mean); }, 0);
    var variance = ss / (o.sample ? n - 1 : n);
    var res = { n: n, sum: sum, mean: mean, ss: ss, variance: variance, sd: Math.sqrt(variance), x: t.x, f: t.f };
    if (ds.kind === 'grouped') {
      var c = ds.classes, F = 0, h, L, k;
      res.min = c[0][0]; res.max = c[c.length - 1][1]; res.range = res.max - res.min;
      // median by interpolation
      for (k = 0; k < c.length; k++) { if (F + ds.freq[k] >= n / 2) break; F += ds.freq[k]; }
      k = Math.min(k, c.length - 1);
      L = c[k][0]; h = c[k][1] - c[k][0];
      res.median = L + ((n / 2 - F) / ds.freq[k]) * h;
      res.medianClass = k; res.medianF = F;
      // mode (Czuber)
      var mi = ds.freq.indexOf(Math.max.apply(null, ds.freq));
      var d1 = ds.freq[mi] - (mi > 0 ? ds.freq[mi - 1] : 0), d2 = ds.freq[mi] - (mi < c.length - 1 ? ds.freq[mi + 1] : 0);
      res.modes = [c[mi][0] + (d1 + d2 ? d1 / (d1 + d2) : 0.5) * (c[mi][1] - c[mi][0])];
      res.modeClass = mi; res.d1 = d1; res.d2 = d2;
      var q = function (p) { var target = p * n, acc = 0; for (var j = 0; j < c.length; j++) { if (acc + ds.freq[j] >= target) return c[j][0] + ((target - acc) / ds.freq[j]) * (c[j][1] - c[j][0]); acc += ds.freq[j]; } return c[c.length - 1][1]; };
      res.q1 = q(0.25); res.q3 = q(0.75);
    } else {
      var a = sorted(ds);
      res.sorted = a;
      res.min = a[0]; res.max = a[a.length - 1]; res.range = res.max - res.min;
      res.median = medianOf(a);
      var mf = Math.max.apply(null, t.f);
      res.modes = mf > 1 || t.x.length === 1 ? t.x.filter(function (x, i) { return t.f[i] === mf; }) : [];
      if (res.modes.length === t.x.length && t.x.length > 1) res.modes = [];            // every value equally often: no mode
      var half = Math.floor(a.length / 2);
      res.q1 = medianOf(a.slice(0, half)); res.q3 = medianOf(a.slice(a.length % 2 ? half + 1 : half));
    }
    res.iqr = res.q3 - res.q1;
    res.cv = mean ? res.sd / Math.abs(mean) * 100 : NaN;
    return res;
  }

  // ------------------------------------------------------------ steps (Arabic notation: س values, ت frequencies, ن count)
  function steps(ds, what, o) {
    o = o || {};
    var s = summary(ds, o), st = [], grouped = ds.kind === 'grouped', fr = ds.kind !== 'raw';
    var S = function (t, tex) { st.push({ t: t, tex: tex || null }); };
    var list = function (arr, max) { max = max || 14; var a = arr.slice(0, max).map(function (v) { return r(v); }); if (arr.length > max) a.push('\\ldots'); return a.join(' ، '); };
    if (s.categorical) { S('المنوال (الفئة الأكثر تكراراً):', '\\text{' + s.modes.join('، ') + '}'); return st; }
    var want = function (k) { return what === 'all' || what === k || (Array.isArray(what) && what.indexOf(k) >= 0); };
    if (want('mean')) {
      if (!fr) {
        S('الوسط الحسابي = مجموع القيم ÷ عددها:', '\\bar{س} = \\frac{\\sum س}{ن} = \\frac{' + list(ds.values, 8).replace(/ ، /g, ' + ') + '}{' + s.n + '} = \\frac{' + r(s.sum) + '}{' + s.n + '} = ' + r(s.mean));
      } else {
        S(grouped ? 'الوسط الحسابي باستخدام مراكز الفئات:' : 'الوسط الحسابي من جدول التكرار:', '\\bar{س} = \\frac{\\sum ت \\times س}{\\sum ت} = \\frac{' + r(s.sum) + '}{' + s.n + '} = ' + r(s.mean));
      }
    }
    if (want('median')) {
      if (grouped) {
        var c = ds.classes[s.medianClass], h = c[1] - c[0];
        S('ترتيب الوسيط = ن ÷ 2 = ' + r(s.n / 2) + '، فالفئة الوسيطية هي ' + c[0] + ' – ' + c[1] + ':', null);
        S('الوسيط = الحد الأدنى للفئة الوسيطية + (ترتيب الوسيط − التكرار المتجمع السابق) ÷ تكرار الفئة × طول الفئة:',
          'الوسيط = ' + c[0] + ' + \\frac{' + r(s.n / 2) + ' - ' + s.medianF + '}{' + ds.freq[s.medianClass] + '} \\times ' + r(h) + ' = ' + r(s.median));
      } else {
        S('نرتب القيم تصاعدياً:', list(s.sorted, 16));
        if (s.n % 2) S('عدد القيم فردي (' + s.n + ')، فالوسيط هو القيمة رقم ' + ((s.n + 1) / 2) + ':', 'الوسيط = ' + r(s.median));
        else S('عدد القيم زوجي (' + s.n + ')، فالوسيط هو متوسط القيمتين ' + (s.n / 2) + ' و' + (s.n / 2 + 1) + ':',
          'الوسيط = \\frac{' + r(s.sorted[s.n / 2 - 1]) + ' + ' + r(s.sorted[s.n / 2]) + '}{2} = ' + r(s.median));
      }
    }
    if (want('mode')) {
      if (grouped) {
        var mc = ds.classes[s.modeClass];
        S('الفئة المنوالية ' + mc[0] + ' – ' + mc[1] + ' (أكبر تكرار). بطريقة الفروق:', 'المنوال = ' + mc[0] + ' + \\frac{' + s.d1 + '}{' + s.d1 + ' + ' + s.d2 + '} \\times ' + r(mc[1] - mc[0]) + ' = ' + r(s.modes[0]));
      } else if (s.modes.length) S('المنوال هو القيمة الأكثر تكراراً:', 'المنوال = ' + s.modes.map(function (v) { return r(v); }).join(' ، '));
      else S('لا يوجد منوال لأن كل القيم تتكرر بالعدد نفسه.', null);
    }
    if (want('range')) S('المدى = أكبر قيمة − أصغر قيمة:', 'المدى = ' + r(s.max) + ' - ' + r(s.min) + ' = ' + r(s.range));
    if (want('quartiles')) {
      S('الربيع الأدنى والربيع الأعلى:', 'ر_1 = ' + r(s.q1) + ' ، \\quad ر_3 = ' + r(s.q3));
      S('المدى الربيعي:', 'ر_3 - ر_1 = ' + r(s.q3) + ' - ' + r(s.q1) + ' = ' + r(s.iqr));
    }
    if (want('variance') || want('sd')) {
      var den = o.sample ? 'ن - 1' : 'ن', denV = o.sample ? s.n - 1 : s.n;
      S('نحسب مجموع مربعات الانحرافات عن الوسط (' + r(s.mean) + '):', '\\sum ' + (fr ? 'ت ' : '') + '(س - \\bar{س})^2 = ' + r(s.ss));
      S(o.sample ? 'التباين (للعينة):' : 'التباين:', 'ع^2 = \\frac{\\sum ' + (fr ? 'ت ' : '') + '(س - \\bar{س})^2}{' + den + '} = \\frac{' + r(s.ss) + '}{' + denV + '} = ' + r(s.variance));
      S('الانحراف المعياري = الجذر التربيعي للتباين:', 'ع = \\sqrt{' + r(s.variance) + '} \\approx ' + r(s.sd, 3));
    }
    if (want('cv') && isFinite(s.cv)) S('معامل الاختلاف:', 'م.خ = \\frac{ع}{\\bar{س}} \\times 100\\% = ' + r(s.cv, 2) + '\\%');
    return st;
  }

  // ------------------------------------------------------------ regression / correlation
  function regression(points, o) {
    o = o || {};
    var n = points.length;
    if (n < 2) throw new Error('نحتاج نقطتين على الأقل');
    var sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    points.forEach(function (p) { sx += p[0]; sy += p[1]; sxx += p[0] * p[0]; syy += p[1] * p[1]; sxy += p[0] * p[1]; });
    var den = n * sxx - sx * sx;
    if (!den) throw new Error('كل قيم س متساوية');
    var b = (n * sxy - sx * sy) / den, a = (sy - b * sx) / n;
    var rr = (n * sxy - sx * sy) / Math.sqrt(den * (n * syy - sy * sy));
    var st = [
      { t: 'المجاميع:', tex: 'ن = ' + n + ' ، \\sum س = ' + r(sx) + ' ، \\sum ص = ' + r(sy) + ' ، \\sum س^2 = ' + r(sxx) + ' ، \\sum س ص = ' + r(sxy) },
      { t: 'ميل خط الانحدار:', tex: 'ب = \\frac{ن \\sum س ص - \\sum س \\sum ص}{ن \\sum س^2 - (\\sum س)^2} = ' + r(b) },
      { t: 'المقطع:', tex: 'أ = \\bar{ص} - ب \\bar{س} = ' + r(a) },
      { t: 'معادلة خط الانحدار:', tex: '\\hat{ص} = ' + r(a) + (b < 0 ? ' - ' : ' + ') + r(Math.abs(b)) + ' س' },
      { t: 'معامل ارتباط بيرسون:', tex: 'ر = \\frac{ن \\sum س ص - \\sum س \\sum ص}{\\sqrt{(ن \\sum س^2 - (\\sum س)^2)(ن \\sum ص^2 - (\\sum ص)^2)}} = ' + r(rr, 4) }
    ];
    var desc = Math.abs(rr) >= 0.9 ? 'قوي جداً' : Math.abs(rr) >= 0.7 ? 'قوي' : Math.abs(rr) >= 0.4 ? 'متوسط' : Math.abs(rr) >= 0.2 ? 'ضعيف' : 'ضعيف جداً';
    st.push({ t: 'الارتباط ' + (rr > 0 ? 'طردي' : rr < 0 ? 'عكسي' : 'منعدم') + ' ' + desc + '.', tex: null });
    return { a: a, b: b, r: rr, r2: rr * rr, steps: st };
  }

  // ------------------------------------------------------------ tables (for Word)
  function T(v) { return { segs: [{ t: 'text', v: String(v) }], span: 1 }; }
  function M(tex) { return { segs: [{ t: 'math', v: tex }], span: 1 }; }
  function freqTable(opts, body) {
    var o = typeof opts === 'string' ? Mk.options(opts) : (opts || {});
    var ds = parse(body);
    var cols = o.columns ? Mk.list(o.columns) : null;
    var want = function (k, dflt) { return cols ? cols.indexOf(k) >= 0 : (o['no' + k] ? false : (o[k] !== undefined ? Mk.bool(o, k, dflt) : dflt)); };
    var rows = [], head = [];
    var grouped = ds.kind === 'grouped', cat = ds.kind === 'categorical';
    var t = cat ? { x: ds.labels, f: ds.freq } : (ds.kind === 'raw' ? table(ds) : (grouped ? { x: ds.classes, f: ds.freq } : table(ds)));
    var n = t.f.reduce(function (a, b) { return a + b; }, 0);
    head.push(T(grouped ? 'الفئة' : (cat ? 'الفئة' : (o.xname || 'القيمة س'))));
    if (grouped && want('mid', true)) head.push(T('مركز الفئة س'));
    head.push(T('التكرار ت'));
    if (want('relative', true)) head.push(T('التكرار النسبي'));
    if (want('percent', false)) head.push(T('النسبة المئوية'));
    if (!cat && want('cumulative', true)) head.push(T('التكرار المتجمع الصاعد'));
    if (!cat && want('fx', false)) head.push(M('س \\times ت'));
    rows.push({ cells: head });
    var cum = 0, sfx = 0;
    t.x.forEach(function (x, i) {
      var f = t.f[i], row = [];
      cum += f;
      var mid = grouped ? (x[0] + x[1]) / 2 : x;
      row.push(T(grouped ? x[0] + ' – ' + x[1] : (cat ? x : r(x))));
      if (grouped && want('mid', true)) row.push(T(r(mid)));
      row.push(T(f));
      if (want('relative', true)) row.push(T(r(f / n, 3)));
      if (want('percent', false)) row.push(T(r(f / n * 100, 1) + '٪'));
      if (!cat && want('cumulative', true)) row.push(T(cum));
      if (!cat && want('fx', false)) { row.push(T(r(mid * f))); sfx += mid * f; }
      rows.push({ cells: row });
    });
    var tot = [T('المجموع')];
    if (grouped && want('mid', true)) tot.push(T(''));
    tot.push(T(n));
    if (want('relative', true)) tot.push(T('1'));
    if (want('percent', false)) tot.push(T('100٪'));
    if (!cat && want('cumulative', true)) tot.push(T(''));
    if (!cat && want('fx', false)) tot.push(T(r(sfx)));
    if (Mk.bool(o, 'total', true)) rows.push({ cells: tot, total: true });
    var align = head.map(function () { return 'center'; });
    return { rows: rows, align: align, ncol: head.length, border: true, header: true, color: Mk.color(o.color, '#E2F5F3') };
  }
  function summaryTable(opts, body) {
    var o = typeof opts === 'string' ? Mk.options(opts) : (opts || {});
    var ds = parse(body), s = summary(ds, { sample: !!o.sample });
    var rows = [{ cells: [T('المقياس'), T('القيمة')] }];
    var add = function (name, v) { if (v !== undefined && v !== null && !(typeof v === 'number' && !isFinite(v))) rows.push({ cells: [T(name), T(typeof v === 'number' ? r(v, 3) : v)] }); };
    add('عدد القيم ن', s.n); add('الوسط الحسابي', s.mean); add('الوسيط', s.median);
    add('المنوال', s.modes && s.modes.length ? s.modes.map(function (v) { return r(v, 3); }).join('، ') : 'لا يوجد');
    add('أصغر قيمة', s.min); add('أكبر قيمة', s.max); add('المدى', s.range);
    add('الربيع الأدنى', s.q1); add('الربيع الأعلى', s.q3); add('المدى الربيعي', s.iqr);
    add(o.sample ? 'التباين (عينة)' : 'التباين', s.variance); add('الانحراف المعياري', s.sd);
    if (isFinite(s.cv)) add('معامل الاختلاف', r(s.cv, 2) + '٪');
    return { rows: rows, align: ['right', 'center'], ncol: 2, border: true, header: true, color: Mk.color(o.color, '#E2F5F3') };
  }

  return { parse: parse, summary: summary, steps: steps, regression: regression, freqTable: freqTable, summaryTable: summaryTable, table: table, round: r };
});
