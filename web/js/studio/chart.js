/* Statistics studio: charts (data grid + LaTeX) and a step-by-step statistics calculator */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var tr = Studio.tr, S0 = Studio.init, en = Studio.lang() === 'en';
  var SAMPLE = {
    cat: { labels: ['الرياضيات', 'الفيزياء', 'الكيمياء', 'الأحياء'], series: [{ name: 'الدرجة', values: [85, 78, 90, 72] }] },
    cls: { classes: [[10, 20], [20, 30], [30, 40], [40, 50], [50, 60]], freq: [4, 7, 12, 9, 3] },
    xy: { points: [[1, 52], [2, 58], [3, 65], [4, 70], [5, 79], [6, 83]] },
    box: { boxes: [{ name: 'الشعبة أ', values: [12, 15, 17, 20, 22, 25, 30] }, { name: 'الشعبة ب', values: [10, 18, 19, 21, 24, 28] }] }
  };
  var data = Object.assign(ChartRender.defaults(), SAMPLE.cat, JSON.parse(JSON.stringify(SAMPLE.cls)), { points: SAMPLE.xy.points.slice(), boxes: JSON.parse(JSON.stringify(SAMPLE.box.boxes)) });
  data.labels = SAMPLE.cat.labels.slice(); data.series = JSON.parse(JSON.stringify(SAMPLE.cat.series));
  if (S0.data && S0.data.type) data = Object.assign(ChartRender.defaults(), S0.data);
  else { try { var set = Settings.load(); data.digits = set.digits === 'eastern' ? 'eastern' : 'western'; if (set.font) data.font = /Amiri|Naskh|Scheherazade|Kufi|Cairo/.test(set.font) ? set.font : 'Amiri'; } catch (e) { /* ignore */ } }
  if (en && !(S0.data && S0.data.type)) data.notation = 'en';

  var TYPES = [
    ['bar', 'أعمدة|Bars', '<rect x="4" y="10" width="5" height="10" fill="#0e9f9a"/><rect x="11" y="4" width="5" height="16" fill="#0e9f9a"/><rect x="18" y="8" width="5" height="12" fill="#0e9f9a"/>'],
    ['hbar', 'أشرطة أفقية|Horizontal', '<rect x="3" y="3" width="16" height="4" fill="#0e9f9a"/><rect x="3" y="9" width="10" height="4" fill="#0e9f9a"/><rect x="3" y="15" width="19" height="4" fill="#0e9f9a"/>'],
    ['line', 'خطي|Line', '<path d="M3 17L9 10L15 13L23 4" stroke="#0e9f9a" stroke-width="2.2" fill="none"/>'],
    ['pie', 'دائري|Pie', '<circle cx="13" cy="11" r="9" fill="#0e9f9a"/><path d="M13 11V2A9 9 0 0 1 21.5 14Z" fill="#e07a00"/>'],
    ['donut', 'حلقي|Donut', '<circle cx="13" cy="11" r="9" fill="#0e9f9a"/><path d="M13 11V2A9 9 0 0 1 21.5 14Z" fill="#e07a00"/><circle cx="13" cy="11" r="4.5" fill="#fff"/>'],
    ['histogram', 'مدرج تكراري|Histogram', '<rect x="3" y="12" width="5" height="8" fill="#0e9f9a"/><rect x="8" y="5" width="5" height="15" fill="#0e9f9a"/><rect x="13" y="8" width="5" height="12" fill="#0e9f9a"/><rect x="18" y="14" width="5" height="6" fill="#0e9f9a"/>'],
    ['polygon', 'مضلع تكراري|Freq. polygon', '<path d="M2 20L6 13L11 6L16 9L21 15L24 20" stroke="#0e9f9a" stroke-width="2.2" fill="none"/>'],
    ['ogive', 'منحنى متجمع|Ogive', '<path d="M3 20C9 19 11 8 23 4" stroke="#0e9f9a" stroke-width="2.2" fill="none"/>'],
    ['scatter', 'انتشار|Scatter', '<circle cx="5" cy="17" r="2" fill="#1f5fbf"/><circle cx="10" cy="13" r="2" fill="#1f5fbf"/><circle cx="15" cy="10" r="2" fill="#1f5fbf"/><circle cx="20" cy="5" r="2" fill="#1f5fbf"/><path d="M3 19L23 3" stroke="#c2352b" stroke-dasharray="3 2"/>'],
    ['normal', 'التوزيع الطبيعي|Normal', '<path d="M2 19C7 19 8 3 13 3S19 19 24 19" stroke="#1b2a30" stroke-width="1.8" fill="none"/><path d="M9 19C10 12 11 7 13 7S16 12 17 19Z" fill="#0e9f9a" fill-opacity=".5"/>'],
    ['binomial', 'ذو الحدين|Binomial', '<rect x="3" y="14" width="3" height="6" fill="#0e9f9a"/><rect x="7.5" y="8" width="3" height="12" fill="#0e9f9a"/><rect x="12" y="4" width="3" height="16" fill="#e07a00"/><rect x="16.5" y="9" width="3" height="11" fill="#e07a00"/><rect x="21" y="15" width="3" height="5" fill="#0e9f9a"/>'],
    ['box', 'صندوقي|Box plot', '<path d="M13 2V6M13 16V20M10 2H16M10 20H16" stroke="#1b2a30"/><rect x="8" y="6" width="10" height="10" fill="#c9ece6" stroke="#0e9f9a" stroke-width="1.6"/><path d="M8 11H18" stroke="#0e9f9a" stroke-width="2"/>']
  ];
  function group(t) { return /normal|binomial/.test(t) ? 'dist' : /bar|hbar|line|pie|donut/.test(t) ? 'cat' : /histogram|polygon|ogive/.test(t) ? 'cls' : t === 'scatter' ? 'xy' : 'box'; }

  // ------------------------------------------------------------ drawing
  var seq = 0, timer = null, code = null;
  function redraw(now) { clearTimeout(timer); timer = setTimeout(draw, now ? 0 : 160); }
  function produce() { return ChartRender.render(JSON.parse(JSON.stringify(data))); }
  function draw() {
    var my = ++seq;
    return produce().then(function (r) {
      if (my !== seq) return;
      var st = $('stage'); st.innerHTML = r.svg;
      var svg = st.querySelector('svg'), k = Math.min((st.clientWidth - 24) / r.w, (st.clientHeight - 24) / r.h);
      if (k > 0) { svg.style.width = (r.w * k) + 'px'; svg.style.height = (r.h * k) + 'px'; }
      $('status').textContent = r.info && r.info.regression ? tr('معادلة خط الانحدار: |Regression: ') + 'ص = ' + StatsEngine.round(r.info.regression.b) + 'س + ' + StatsEngine.round(r.info.regression.a) + ' — ر = ' + StatsEngine.round(r.info.regression.r) : '';
      $('sizeInfo').textContent = (r.w / 37.7953).toFixed(1) + ' × ' + (r.h / 37.7953).toFixed(1) + ' ' + tr('سم|cm');
      if (code) code.refresh();
      Studio.hideLoader();
    }).catch(function (e) {
      if (my !== seq) return;
      $('status').innerHTML = '<span class="err">' + Raster.esc(e.message) + '</span>';
      Studio.hideLoader();
    });
  }

  // ------------------------------------------------------------ type chooser
  function buildTypes() {
    var box = $('types'); box.innerHTML = '';
    TYPES.forEach(function (t) {
      var b = document.createElement('button'); b.type = 'button';
      b.setAttribute('aria-pressed', String(data.type === t[0]));
      b.innerHTML = '<svg viewBox="0 0 26 22">' + t[2] + '</svg><span>' + tr(t[1]) + '</span>';
      b.onclick = function () {
        var g0 = group(data.type), g1 = group(t[0]);
        data.type = t[0];
        if (g1 !== g0) ensureData(g1);
        buildTypes(); buildGrid(); buildChecks(); redraw(true);
      };
      box.appendChild(b);
    });
  }
  function ensureData(g) {
    if (g === 'cat' && !(data.series && data.series.length)) { data.labels = SAMPLE.cat.labels.slice(); data.series = JSON.parse(JSON.stringify(SAMPLE.cat.series)); }
    if (g === 'cls' && !(data.classes && data.classes.length)) { data.classes = JSON.parse(JSON.stringify(SAMPLE.cls.classes)); data.freq = SAMPLE.cls.freq.slice(); }
    if (g === 'xy' && !(data.points && data.points.length)) data.points = JSON.parse(JSON.stringify(SAMPLE.xy.points));
    if (g === 'box' && !(data.boxes && data.boxes.length)) data.boxes = JSON.parse(JSON.stringify(SAMPLE.box.boxes));
  }

  // ------------------------------------------------------------ data grid
  function numOr(v) { var n = Mk.evalNum(v, NaN); return isFinite(n) ? n : NaN; }
  function gridModel() {
    var g = group(data.type);
    if (g === 'cat') {
      var pie = /pie|donut/.test(data.type), ser = pie ? data.series.slice(0, 1) : data.series;
      return { head: [tr('الفئة|Category')].concat(ser.map(function (s, i) { return s.name || tr('القيم|Values') + (ser.length > 1 ? ' ' + (i + 1) : ''); })), editHead: true,
        rows: data.labels.map(function (l, i) { return [l].concat(ser.map(function (s) { return s.values[i] === undefined ? '' : s.values[i]; })); }), addCol: !pie };
    }
    if (g === 'cls') return { head: [tr('من|From'), tr('إلى|To'), tr('التكرار|Frequency')], rows: data.classes.map(function (c, i) { return [c[0], c[1], data.freq[i]]; }) };
    if (g === 'xy') return { head: [en ? 'x' : 'س', en ? 'y' : 'ص'], rows: data.points.map(function (p) { return [p[0], p[1]]; }) };
    var n = Math.max.apply(null, data.boxes.map(function (b) { return b.values.length; }).concat([1])), rows = [];
    for (var i = 0; i < n; i++) rows.push(data.boxes.map(function (b) { return b.values[i] === undefined ? '' : b.values[i]; }));
    return { head: data.boxes.map(function (b, i) { return b.name || String(i + 1); }), editHead: true, rows: rows, addCol: true };
  }
  function readGrid() {
    var g = group(data.type), t = $('grid');
    var head = Array.prototype.map.call(t.querySelectorAll('thead input'), function (i) { return i.value; });
    var rows = Array.prototype.map.call(t.querySelectorAll('tbody tr'), function (tr2) { return Array.prototype.map.call(tr2.querySelectorAll('input'), function (i) { return i.value.trim(); }); })
      .filter(function (r) { return r.some(function (c) { return c !== ''; }); });
    if (g === 'cat') {
      var pie = /pie|donut/.test(data.type);
      data.labels = rows.map(function (r) { return r[0]; });
      var ns = head.length - 1, ser = [];
      for (var k = 0; k < ns; k++) ser.push({ name: head[k + 1], values: rows.map(function (r) { return numOr(r[k + 1]); }), color: (data.series[k] || {}).color });
      if (pie && data.series.length > 1) ser = ser.concat(data.series.slice(1));
      data.series = ser;
    } else if (g === 'cls') {
      data.classes = []; data.freq = [];
      rows.forEach(function (r) { var a = numOr(r[0]), b = numOr(r[1]), f = numOr(r[2]); if (isFinite(a) && isFinite(b) && isFinite(f)) { data.classes.push([a, b]); data.freq.push(f); } });
    } else if (g === 'xy') {
      data.points = rows.map(function (r) { return [numOr(r[0]), numOr(r[1])]; }).filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
    } else {
      data.boxes = head.map(function (h, k) { return { name: h, values: rows.map(function (r) { return numOr(r[k]); }).filter(isFinite) }; });
    }
    redraw();
  }
  // ------------------------------------------------------------ distribution parameters
  function syncDist() {
    var dist = group(data.type) === 'dist';
    $('distSec').hidden = !dist; $('dataSec').hidden = dist;
    if (!dist) return;
    if (data.mean === undefined) { data.mean = 50; data.sd = 10; data.n = 10; data.p = 0.3; data.from = 40; data.to = 60; }
    if (data.type === 'binomial' && (data.from === 40 || data.from === undefined)) { data.from = 2; data.to = 4; }
    if (data.type === 'normal' && data.from === 2 && data.to === 4 && data.mean === 50) { data.from = 40; data.to = 60; }
    $('distNormal').hidden = data.type !== 'normal'; $('distBinom').hidden = data.type !== 'binomial';
    $('dMean').value = data.mean; $('dSd').value = data.sd; $('dZ').checked = !!data.z; $('dN').value = data.n; $('dP').value = data.p;
    $('dFrom').value = data.from === null || data.from === '-inf' ? '' : data.from; $('dTo').value = data.to === null || data.to === 'inf' ? '' : data.to;
  }
  ['dMean', 'dSd', 'dN', 'dP', 'dFrom', 'dTo', 'dZ'].forEach(function (id) {
    $(id).addEventListener(id === 'dZ' ? 'change' : 'input', function () {
      data.z = $('dZ').checked;
      if (data.z) { data.mean = 0; data.sd = 1; $('dMean').value = 0; $('dSd').value = 1; }
      else { data.mean = Prob.num($('dMean').value, 0); data.sd = Prob.num($('dSd').value, 1); }
      data.n = Math.round(Prob.num($('dN').value, 10)); data.p = Prob.num($('dP').value, 0.5);
      data.from = $('dFrom').value.trim() === '' ? '-inf' : Prob.num($('dFrom').value, null);
      data.to = $('dTo').value.trim() === '' ? 'inf' : Prob.num($('dTo').value, null);
      redraw();
    });
  });
  function buildGrid() {
    syncDist();
    if (group(data.type) === 'dist') return;
    var m = gridModel(), t = $('grid');
    var h = '<thead><tr><td class="rn"></td>' + m.head.map(function (x) { return '<th>' + (m.editHead ? '<input value="' + Raster.esc(x) + '" dir="auto">' : Raster.esc(x)) + '</th>'; }).join('') + '</tr></thead><tbody>';
    var rows = m.rows.concat([m.head.map(function () { return ''; })]);                // one empty row for new data
    rows.forEach(function (r, i) {
      h += '<tr><td class="rn">' + (i + 1) + '</td>' + r.map(function (c) { return '<td><input value="' + Raster.esc(c) + '" dir="auto"></td>'; }).join('') + '</tr>';
    });
    t.innerHTML = h + '</tbody>';
    t.oninput = function () {
      var last = t.querySelector('tbody tr:last-child');
      if (Array.prototype.some.call(last.querySelectorAll('input'), function (i) { return i.value.trim(); })) {           // grow
        var tr2 = document.createElement('tr'), n = last.children.length - 1;
        tr2.innerHTML = '<td class="rn">' + (t.querySelectorAll('tbody tr').length + 1) + '</td>' + new Array(n + 1).join('<td><input dir="auto"></td>');
        last.parentNode.appendChild(tr2);
      }
      readGrid();
    };
    t.onpaste = function (e) {
      var txt = e.clipboardData && e.clipboardData.getData('text/plain');
      if (!txt || !/[\t\n]/.test(txt)) return;
      e.preventDefault();
      var cell = e.target.closest('td, th'); if (!cell) return;
      var rowsP = txt.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(function (l) { return l.split('\t'); });
      var trEl = cell.parentNode, col = Array.prototype.indexOf.call(trEl.children, cell), inHead = !!cell.closest('thead');
      var bodyRows = Array.prototype.slice.call(t.querySelectorAll('tbody tr'));
      var r0 = inHead ? -1 : bodyRows.indexOf(trEl);
      rowsP.forEach(function (vals, ri) {
        var rIdx = r0 + ri, rowEl = rIdx < 0 ? t.querySelector('thead tr') : bodyRows[rIdx];
        if (!rowEl) {
          rowEl = document.createElement('tr'); var n = t.querySelector('tbody tr').children.length - 1;
          rowEl.innerHTML = '<td class="rn">' + (rIdx + 1) + '</td>' + new Array(n + 1).join('<td><input dir="auto"></td>');
          t.querySelector('tbody').appendChild(rowEl); bodyRows.push(rowEl);
        }
        vals.forEach(function (v, ci) { var c = rowEl.children[col + ci]; var inp = c && c.querySelector('input'); if (inp) inp.value = Mk.digits(v.trim()); });
      });
      readGrid(); buildGrid();
    };
    var act = $('gridActions'); act.innerHTML = '';
    if (m.addCol) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = tr('+ عمود (سلسلة)|+ column');
      b.onclick = function () {
        if (group(data.type) === 'cat') data.series.push({ name: tr('سلسلة|Series') + ' ' + (data.series.length + 1), values: data.labels.map(function () { return NaN; }) });
        else data.boxes.push({ name: String(data.boxes.length + 1), values: [] });
        buildGrid(); redraw();
      };
      act.appendChild(b);
      var b2 = document.createElement('button'); b2.type = 'button'; b2.className = 'chip'; b2.textContent = tr('− آخر عمود|− last column');
      b2.onclick = function () {
        if (group(data.type) === 'cat') { if (data.series.length > 1) data.series.pop(); } else if (data.boxes.length > 1) data.boxes.pop();
        buildGrid(); redraw();
      };
      act.appendChild(b2);
    }
    var b3 = document.createElement('button'); b3.type = 'button'; b3.className = 'chip'; b3.textContent = tr('مسح|Clear');
    b3.onclick = function () {
      var g = group(data.type);
      if (g === 'cat') { data.labels = []; data.series = data.series.slice(0, 1).map(function (s) { return { name: s.name, values: [] }; }); }
      if (g === 'cls') { data.classes = []; data.freq = []; }
      if (g === 'xy') data.points = [];
      if (g === 'box') data.boxes = [{ name: '1', values: [] }];
      buildGrid(); redraw();
    };
    act.appendChild(b3);
    $('rawBox').hidden = group(data.type) !== 'cls';
  }
  $('mkBins').onclick = function () {
    try {
      var vals = StatsEngine.parse($('raw').value);
      if (vals.kind !== 'raw') throw new Error(tr('أدخل قيماً مفصولة بفواصل|Enter comma-separated values'));
      var b = ChartMarkup.autoBins(vals.values, { bins: $('bins').value });
      data.classes = b.classes; data.freq = b.freq; buildGrid(); redraw(true);
    } catch (e) { Studio.toast(e.message, true); }
  };

  // ------------------------------------------------------------ options
  function buildChecks() {
    var list = [['values', 'كتابة القيم|Show values'], ['grid', 'خطوط الشبكة|Grid lines'], ['legend', 'مفتاح الرسم|Legend']];
    if (/bar|hbar/.test(data.type)) list.push(['stacked', 'أعمدة متراكمة|Stacked']);
    if (/pie|donut/.test(data.type)) list.push(['percent', 'النسب المئوية|Percentages'], ['angles', 'زوايا القطاعات|Sector angles']);
    if (data.type === 'histogram') list.push(['polygon', 'المضلع التكراري فوقه|Frequency polygon']);
    if (data.type === 'scatter') list.push(['regression', 'خط الانحدار|Regression line']);
    var box = $('optChecks'); box.innerHTML = '';
    list.forEach(function (c) {
      var l = document.createElement('label');
      l.innerHTML = '<input type="checkbox"' + (data[c[0]] ? ' checked' : '') + '><span>' + tr(c[1]) + '</span>';
      l.querySelector('input').onchange = function () { data[c[0]] = this.checked; redraw(true); };
      box.appendChild(l);
    });
    if (data.type === 'ogive') {
      var l2 = document.createElement('label');
      l2.innerHTML = '<input type="checkbox"' + (data.cumulative === 'more' ? ' checked' : '') + '><span>' + tr('متجمع نازل|Descending') + '</span>';
      l2.querySelector('input').onchange = function () { data.cumulative = this.checked ? 'more' : 'less'; redraw(true); };
      box.appendChild(l2);
    }
  }
  function seg(id, key) {
    Array.prototype.forEach.call($(id).querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === data[key]));
      b.onclick = function () { data[key] = b.getAttribute('data-v'); seg(id, key); redraw(true); };
    });
  }
  ['title', 'xlabel', 'ylabel'].forEach(function (k) { $(k).oninput = function () { data[k] = this.value; redraw(); }; });
  $('W').onchange = function () { var v = +this.value; if (v >= 240 && v <= 1400) { data.w = v; redraw(true); } };
  $('H').onchange = function () { var v = +this.value; if (v >= 180 && v <= 1400) { data.h = v; redraw(true); } };
  function syncFields() {
    ['title', 'xlabel', 'ylabel'].forEach(function (k) { $(k).value = data[k] || ''; });
    $('W').value = data.w; $('H').value = data.h;
    seg('digSeg', 'digits'); seg('notSeg', 'notation');
  }

  // ------------------------------------------------------------ tabs
  var tab = 'chart';
  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]'); if (!b) return;
    tab = b.getAttribute('data-tab');
    Array.prototype.forEach.call($('tabs').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    $('chartMain').hidden = tab !== 'chart'; $('calcMain').hidden = tab !== 'calc';
    $('okBtn').hidden = tab !== 'chart'; $('exportBtn').hidden = tab !== 'chart';
    if (tab === 'calc') calc(); else redraw(true);
  });

  // ------------------------------------------------------------ calculator
  var MEAS = [['mean', 'الوسط الحسابي|Mean', true], ['median', 'الوسيط|Median', true], ['mode', 'المنوال|Mode', true], ['range', 'المدى|Range', true],
    ['quartiles', 'الربيعيات|Quartiles', false], ['variance', 'التباين والانحراف المعياري|Variance & SD', true], ['cv', 'معامل الاختلاف|Coef. of variation', false]];
  var chosen = {};
  MEAS.forEach(function (m) {
    chosen[m[0]] = m[2];
    var l = document.createElement('label');
    l.innerHTML = '<input type="checkbox"' + (m[2] ? ' checked' : '') + '><span>' + tr(m[1]) + '</span>';
    l.querySelector('input').onchange = function () { chosen[m[0]] = this.checked; calc(); };
    $('measures').appendChild(l);
  });
  $('calcData').value = '12, 15, 15, 18, 20, 22, 22, 22, 25, 30';
  var lastSteps = [], ctimer = null;
  $('calcData').oninput = function () { clearTimeout(ctimer); ctimer = setTimeout(calc, 400); };
  $('sample').onchange = calc;
  function eqOpts() { var o = Studio.eqOpts(); o.fontSize = 15; o.display = true; return o; }
  function calc() {
    var out = $('calcSteps'); out.innerHTML = '';
    var ds;
    try { ds = StatsEngine.parse($('calcData').value); }
    catch (e) { out.innerHTML = '<li class="err" style="color:var(--danger)">' + Raster.esc(e.message) + '</li>'; lastSteps = []; return; }
    var what = Object.keys(chosen).filter(function (k) { return chosen[k]; });
    try { lastSteps = StatsEngine.steps(ds, what, { sample: $('sample').checked }); }
    catch (e) { out.innerHTML = '<li style="color:var(--danger)">' + Raster.esc(e.message) + '</li>'; lastSteps = []; return; }
    var o = eqOpts();
    lastSteps.forEach(function (s) {
      var li = document.createElement('li');
      li.innerHTML = '<div class="tx"></div>' + (s.tex ? '<div class="mx" dir="ltr"></div>' : '');
      li.querySelector('.tx').textContent = s.t;
      out.appendChild(li);
      if (s.tex) RenderHost.preview(s.tex, o).then(function (r) {
        var mx = li.querySelector('.mx');
        if (r.errors && r.errors.length) { mx.textContent = s.tex; return; }
        mx.innerHTML = r.svgString;
        var svg = mx.firstChild; svg.setAttribute('width', (r.width * 1.1).toFixed(2) + 'em'); svg.setAttribute('height', (r.total * 1.1).toFixed(2) + 'em');
      }).catch(function () { li.querySelector('.mx').textContent = s.tex; });
    });
  }
  function showSteps(list) {
    var out = $('calcSteps'); out.innerHTML = '';
    var o = eqOpts();
    list.forEach(function (s) {
      var li = document.createElement('li');
      li.innerHTML = '<div class="tx"></div>' + (s.tex ? '<div class="mx" dir="ltr"></div>' : '');
      li.querySelector('.tx').textContent = s.t;
      out.appendChild(li);
      if (s.tex) RenderHost.preview(s.tex, o).then(function (r) {
        var mx = li.querySelector('.mx');
        if (r.errors && r.errors.length) { mx.textContent = s.tex; return; }
        mx.innerHTML = r.svgString;
        var svg = mx.firstChild; svg.setAttribute('width', (r.width * 1.1).toFixed(2) + 'em'); svg.setAttribute('height', (r.total * 1.1).toFixed(2) + 'em');
      }).catch(function () { li.querySelector('.mx').textContent = s.tex; });
    });
  }
  // probability & counting calculator
  var PK = {
    normal: [['الوسط μ|Mean μ', 50], ['الانحراف σ|SD σ', 10], ['من (فارغ = −∞)|From', 40], ['إلى (فارغ = +∞)|To', 60]],
    binomial: [['عدد المحاولات ن|n', 10], ['احتمال النجاح ح|p', 0.3], ['من ر =|From k', 2], ['إلى ر =|To k', 4]],
    C: [['ن|n', 10], ['ر|r', 3]], P: [['ن|n', 10], ['ر|r', 3]]
  };
  function syncPK() {
    var k = $('pKind').value, f = PK[k];
    ['pA', 'pB', 'pC', 'pD'].forEach(function (id, i) {
      var lab = $('pL' + (i + 1)); if (f[i]) { lab.textContent = tr(f[i][0]); if ($(id).dataset.kind !== k) $(id).value = f[i][1]; }
      $(id).dataset.kind = k;
    });
    $('pW3').hidden = !f[2]; $('pW4').hidden = !f[3];
    $('pDraw').hidden = !/normal|binomial/.test(k);
  }
  $('pKind').onchange = syncPK; syncPK();
  function bnd(v, inf) { return String(v).trim() === '' ? inf : Prob.num(v, inf); }
  $('pCalc').onclick = function () {
    var k = $('pKind').value, A = Prob.num($('pA').value, 0), B = Prob.num($('pB').value, 1);
    try {
      var r = k === 'normal' ? Prob.normalSteps(A, B, bnd($('pC').value, -Infinity), bnd($('pD').value, Infinity))
        : k === 'binomial' ? Prob.binomialSteps(A, B, bnd($('pC').value, -Infinity), bnd($('pD').value, Infinity))
          : Prob.countSteps(k, A, B);
      lastSteps = r.steps; showSteps(lastSteps);
    } catch (e) { $('calcSteps').innerHTML = '<li style="color:var(--danger)">' + Raster.esc(e.message) + '</li>'; lastSteps = []; }
  };
  $('pDraw').onclick = function () {
    var k = $('pKind').value;
    data.type = k; data.z = false;
    if (k === 'normal') { data.mean = Prob.num($('pA').value, 0); data.sd = Prob.num($('pB').value, 1); }
    else { data.n = Math.round(Prob.num($('pA').value, 10)); data.p = Prob.num($('pB').value, 0.5); }
    data.from = $('pC').value.trim() === '' ? '-inf' : Prob.num($('pC').value, null); data.to = $('pD').value.trim() === '' ? 'inf' : Prob.num($('pD').value, null);
    buildTypes(); buildGrid(); buildChecks();
    $('tabs').querySelector('[data-tab=chart]').click();
  };
  $('insSteps').onclick = function () {
    if (!lastSteps.length) return;
    var items = [];
    lastSteps.forEach(function (s) { items.push({ kind: 'text', text: s.t }); if (s.tex) items.push({ tex: s.tex }); });
    Studio.insertItems(items);
  };
  function tableItem(fn) {
    try { return { kind: 'table', table: fn('', $('calcData').value) }; } catch (e) { Studio.toast(e.message, true); return null; }
  }
  $('insFreq').onclick = function () { var t = tableItem(StatsEngine.freqTable); if (t) Studio.insertItems([t]); };
  $('insSummary').onclick = function () { var t = tableItem(function (o, b) { return StatsEngine.summaryTable($('sample').checked ? 'sample' : '', b); }); if (t) Studio.insertItems([t]); };
  $('toChart').onclick = function () {
    try {
      var ds = StatsEngine.parse($('calcData').value);
      if (ds.kind === 'grouped') { data.type = 'histogram'; data.classes = ds.classes; data.freq = ds.freq; }
      else if (ds.kind === 'categorical') { data.type = 'bar'; data.labels = ds.labels; data.series = [{ name: '', values: ds.freq }]; }
      else if (ds.kind === 'freq') { data.type = 'bar'; data.labels = ds.values.map(String); data.series = [{ name: tr('التكرار|Frequency'), values: ds.freq }]; }
      else { var b = ChartMarkup.autoBins(ds.values, {}); data.type = 'histogram'; data.classes = b.classes; data.freq = b.freq; }
      buildTypes(); buildGrid(); buildChecks();
      $('tabs').querySelector('[data-tab=chart]').click();
    } catch (e) { Studio.toast(e.message, true); }
  };

  // ------------------------------------------------------------ export / insert
  $('exportBtn').onclick = function () { Studio.popAt($('exportPop'), this); };
  $('exportPop').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-exp]'); if (!b) return;
    $('exportPop').hidden = true;
    Studio.exportAs(b.getAttribute('data-exp'), produce, 'chart');
  });
  $('okBtn').onclick = function () {
    $('okBtn').disabled = true;
    produce().then(function () {
      return Studio.finish('chart', JSON.parse(JSON.stringify(data)), produce, 'chart');
    }).catch(function (e) { Studio.toast(e.message, true); }).then(function () { $('okBtn').disabled = false; });
  };
  $('cancelBtn').onclick = Studio.cancel;
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && tab === 'chart') { e.preventDefault(); $('okBtn').click(); }
    if (e.key === 'Escape') Studio.cancel();
  });
  if (S0.editId) $('okBtn').setAttribute('data-t', 'تحديث الرسم|Update chart');
  if (S0.tab === 'calc') setTimeout(function () { $('tabs').querySelector('[data-tab=calc]').click(); }, 0);
  window.addEventListener('resize', function () { redraw(true); });

  Studio.applyT();
  code = Studio.codePanel({ el: $('codeBox'), kind: 'chart', get: function () { return data; },
    set: function (d) { data = Object.assign(ChartRender.defaults(), d); buildTypes(); buildGrid(); buildChecks(); syncFields(); redraw(true); } });
  buildTypes(); buildGrid(); buildChecks(); syncFields();
  RenderHost.warm('stix2').then(function () { draw(); }, function () { draw(); });
  setTimeout(Studio.hideLoader, 5000);
  window.__chart = { get data() { return data; }, produce: produce, calc: calc };
})();
