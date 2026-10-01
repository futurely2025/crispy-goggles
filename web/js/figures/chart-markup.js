/*
 * Chart markup <-> ChartRender data
 *
 * \begin{chart}[type=bar, title=درجات الطلاب, xlabel=المادة, ylabel=الدرجة, values, digits=eastern]
 *   \data{الرياضيات:85, الفيزياء:78, الكيمياء:90}            % one series with its categories
 * \end{chart}
 * \begin{chart}[type=bar, stacked]  \labels{2022, 2023, 2024}  \series[name=ذكور]{12, 15, 18}  \series[name=إناث]{10, 14, 20}  \end{chart}
 * \begin{chart}[type=histogram, polygon]  \classes{10-20:4, 20-30:7, 30-40:12}  \end{chart}
 * \begin{chart}[type=histogram, bins=5]  \data{12, 15, 22, 27, 31, …}  \end{chart}    % automatic classes from raw data
 * \begin{chart}[type=scatter, regression]  \points{(1,2) (2,4.1) (3,5.9)}  \end{chart}
 * \begin{chart}[type=box]  \box[name=الشعبة أ]{12, 15, 17, 20, 22}  \end{chart}
 * \begin{chart}[type=pie, percent, angles]  \data{كرة القدم:12, السلة:8, السباحة:5}  \end{chart}
 * \begin{chart}[type=normal, mean=50, sd=10, from=40, to=60]\end{chart}   \begin{chart}[type=binomial, n=10, p=0.3, from=2, to=4]\end{chart}
 * types: bar, hbar, line, pie, donut, histogram, polygon, ogive, scatter, box, normal, binomial
 */
(function (global) {
  'use strict';
  var CM = 37.7953;
  var TYPES = { bar: 'bar', column: 'bar', 'أعمدة': 'bar', hbar: 'hbar', 'أشرطة': 'hbar', line: 'line', 'خطي': 'line', pie: 'pie', 'دائري': 'pie', 'قطاعات': 'pie',
    donut: 'donut', histogram: 'histogram', 'مدرج': 'histogram', polygon: 'polygon', 'مضلع': 'polygon', ogive: 'ogive', 'متجمع': 'ogive',
    scatter: 'scatter', 'انتشار': 'scatter', box: 'box', boxplot: 'box', 'صندوقي': 'box',
    normal: 'normal', 'طبيعي': 'normal', gauss: 'normal', binomial: 'binomial', 'ذو الحدين': 'binomial', 'ثنائي': 'binomial' };
  function size(v, d) { if (v === undefined || v === true) return d; var s = Mk.digits(String(v)), n = parseFloat(s); if (!isFinite(n)) return d; return /cm|سم/.test(s) ? Math.round(n * CM) : Math.round(n); }
  function pairs(s) {
    return Mk.split(Mk.digits(Mk.unbrace(s)), s.indexOf('،') >= 0 && s.indexOf(',') < 0 ? '،' : ',').map(function (p) {
      var i = p.lastIndexOf(':'); if (i < 0) return { v: Mk.evalNum(p, NaN) };
      return { label: p.slice(0, i).trim(), v: Mk.evalNum(p.slice(i + 1), NaN) };
    });
  }
  function autoBins(vals, o) {
    vals = vals.filter(isFinite).sort(function (a, b) { return a - b; });
    if (!vals.length) throw new Error('لا توجد قيم');
    var lo = vals[0], hi = vals[vals.length - 1];
    var w = o.classwidth ? Mk.evalNum(o.classwidth, 0) : 0;
    if (!w) {
      var k = o.bins ? Mk.evalNum(o.bins, 5) : Math.max(4, Math.min(10, Math.round(1 + 3.322 * Math.log10(vals.length))));
      var raw = (hi - lo) / k || 1, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
      w = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
    }
    var start = o.start !== undefined ? Mk.evalNum(o.start, lo) : Math.floor(lo / w) * w;
    var cls = [], fq = [];
    for (var a = start; a <= hi; a += w) { cls.push([+a.toFixed(10), +(a + w).toFixed(10)]); fq.push(0); }
    vals.forEach(function (v) { var i = Math.min(cls.length - 1, Math.floor((v - start) / w + 1e-9)); fq[i]++; });
    return { classes: cls, freq: fq };
  }
  function parse(opts, body) {
    var o = typeof opts === 'string' ? Mk.options(opts) : (opts || {}), d = ChartRender.defaults();
    d.type = TYPES[String(o.type || 'bar').toLowerCase()] || TYPES[o.type] || 'bar';
    ['title', 'xlabel', 'ylabel'].forEach(function (k) { if (o[k]) d[k] = String(o[k]).replace(/\$/g, ''); });
    [['values', 'values'], ['legend', 'legend'], ['grid', 'grid'], ['percent', 'percent'], ['angles', 'angles'], ['polygon', 'polygon'], ['regression', 'regression'], ['stacked', 'stacked']]
      .forEach(function (p) { d[p[1]] = Mk.bool(o, p[0], d[p[1]]); });
    if (o.digits) d.digits = /east|هند/i.test(o.digits) ? 'eastern' : 'western';
    if (o.eastern) d.digits = 'eastern';
    if (o.notation) d.notation = /en|lat/i.test(o.notation) ? 'en' : 'ar';
    if (o.more || /more|نازل/.test(o.cumulative || '')) d.cumulative = 'more';
    d.w = size(o.width, d.w); d.h = size(o.height, d.h);
    if (o.ymin !== undefined) d.ymin = Mk.evalNum(o.ymin, null);
    if (o.ymax !== undefined) d.ymax = Mk.evalNum(o.ymax, null);
    if (o.ystep !== undefined) d.ystep = Mk.evalNum(o.ystep, null);
    if (o.font) d.font = o.font;
    if (o.colors) d.colors = Mk.list(o.colors).map(function (c) { return Mk.color(c, undefined); });
    if (/normal|binomial/.test(d.type) && global.Prob) { Prob.readOpts(d, o); if (!o.height) d.h = 330; }
    var raw = null;
    Mk.commands(body).forEach(function (c) {
      var n = c.name, a = c.args[0] || '', co = c.opt;
      if (n === 'data') {
        var ps = pairs(a);
        if (ps.every(function (p) { return p.label === undefined; })) { raw = ps.map(function (p) { return p.v; }); if (!/histogram|polygon|ogive|box/.test(d.type)) { d.series.push({ name: co.name || '', values: raw }); } }
        else { d.labels = ps.map(function (p) { return p.label; }); d.series.push({ name: co.name || '', values: ps.map(function (p) { return p.v; }), color: co.color ? Mk.color(co.color) : undefined }); }
      } else if (n === 'labels') d.labels = Mk.list(a);
      else if (n === 'series') d.series.push({ name: co.name || '', values: Mk.numList(a), color: co.color ? Mk.color(co.color) : undefined });
      else if (n === 'classes') {
        pairs(a).forEach(function (p) {
          var m = String(p.label || '').match(/(-?[\d.]+)\s*(?:-|–|إلى|to)\s*(-?[\d.]+)/);
          if (m) { d.classes.push([+m[1], +m[2]]); d.freq.push(p.v); }
        });
      } else if (n === 'points') {
        var re = /\(([^()]*)\)/g, m2;
        while ((m2 = re.exec(a))) { var pt = Mk.point(m2[1]); if (isFinite(pt[0]) && isFinite(pt[1])) d.points.push(pt); }
      } else if (n === 'box') d.boxes.push({ name: co.name || '', values: Mk.numList(a) });
    });
    if (raw && /histogram|polygon|ogive/.test(d.type) && !d.classes.length) { var b = autoBins(raw, o); d.classes = b.classes; d.freq = b.freq; }
    if (raw && d.type === 'box' && !d.boxes.length) d.boxes.push({ name: o.name || '', values: raw });
    d.series = d.series.filter(function (s) { return s.values.length; });
    if (/pie|donut/.test(d.type) && !d.labels.length && d.series[0]) d.labels = d.series[0].values.map(function (v, i) { return String(i + 1); });
    return d;
  }
  function serialize(d) {
    var o = [['type', d.type]], dflt = ChartRender.defaults();
    ['title', 'xlabel', 'ylabel'].forEach(function (k) { if (d[k]) o.push([k, d[k]]); });
    if (d.values === false) o.push('novalues'); if (d.legend === false) o.push('nolegend'); if (d.grid === false) o.push('nogrid');
    if (/pie|donut/.test(d.type)) { if (d.percent === false) o.push('nopercent'); if (d.angles) o.push('angles'); }
    if (d.polygon) o.push('polygon'); if (d.regression) o.push('regression'); if (d.stacked) o.push('stacked');
    if (d.cumulative === 'more' && d.type === 'ogive') o.push('more');
    if (d.digits === 'eastern') o.push(['digits', 'eastern']);
    if (d.notation === 'en') o.push(['notation', 'en']);
    if (d.w !== dflt.w) o.push(['width', (d.w / CM).toFixed(1) + 'cm']);
    if (d.h !== dflt.h) o.push(['height', (d.h / CM).toFixed(1) + 'cm']);
    if (d.ymax !== null && d.ymax !== undefined && d.ymax !== '') o.push(['ymax', d.ymax]);
    if (d.type === 'normal') { if (d.z) o.push('z'); else { o.push(['mean', d.mean]); o.push(['sd', d.sd]); } }
    if (d.type === 'binomial') { o.push(['n', d.n]); o.push(['p', d.p]); }
    if (/normal|binomial/.test(d.type)) { if (d.from !== null && d.from !== undefined) o.push(['from', d.from]); if (d.to !== null && d.to !== undefined) o.push(['to', d.to]); }
    var L = ['\\begin{chart}' + Mk.optStr(o)];
    if (/normal|binomial/.test(d.type)) { L.push('\\end{chart}'); return L.join('\n'); }
    if (/histogram|polygon|ogive/.test(d.type)) L.push('  \\classes{' + d.classes.map(function (c, i) { return c[0] + '-' + c[1] + ':' + d.freq[i]; }).join(', ') + '}');
    else if (d.type === 'scatter') L.push('  \\points{' + d.points.map(function (p) { return '(' + p[0] + ', ' + p[1] + ')'; }).join(' ') + '}');
    else if (d.type === 'box') d.boxes.forEach(function (b) { L.push('  \\box' + Mk.optStr([['name', b.name]]) + '{' + b.values.join(', ') + '}'); });
    else if (d.series.length === 1 && d.labels.length) L.push('  \\data{' + d.labels.map(function (l, i) { return l + ':' + d.series[0].values[i]; }).join(', ') + '}');
    else {
      if (d.labels.length) L.push('  \\labels{' + d.labels.join(', ') + '}');
      d.series.forEach(function (s) { L.push('  \\series' + Mk.optStr([['name', s.name], ['color', s.color && ChartRender.PALETTE.indexOf(s.color) < 0 ? s.color : null]]) + '{' + s.values.join(', ') + '}'); });
    }
    L.push('\\end{chart}');
    return L.join('\n');
  }
  global.ChartMarkup = { parse: parse, serialize: serialize, autoBins: autoBins };
})(window);
