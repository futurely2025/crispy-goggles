/* Graph studio UI */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var tr = Studio.tr;
  var S = Studio.init;
  var data = GraphRender.defaults();
  if (S.data && S.data.fns) data = Object.assign(data, S.data);
  else if (S.expr) data.fns[0].expr = S.expr;
  // defaults from the add-in settings (digits / notation / font)
  try {
    var set = Settings.load();
    if (!(S.data && S.data.fns)) {
      data.digits = set.digits === 'eastern' ? 'eastern' : 'western';
      data.notation = set.rtl === false ? 'en' : 'ar';
      if (['Amiri', 'Noto Naskh Arabic', 'Scheherazade New', 'Noto Kufi Arabic', 'Cairo'].indexOf(set.font) >= 0) data.font = set.font;
      data.mathFont = set.mathFont || 'stix2';
    }
  } catch (e) { /* ignore */ }
  if (Studio.lang() === 'en' && !(S.data && S.data.fns)) { data.notation = 'en'; data.fns[0].expr = 'x^2 - 4'; data.fns[0].name = 'y'; }

  var last = null, seq = 0;
  function produce() { return GraphRender.render(JSON.parse(JSON.stringify(data))); }

  // ------------------------------------------------------------ drawing
  var timer = null;
  function redraw(now) {
    clearTimeout(timer);
    timer = setTimeout(draw, now ? 0 : 90);
  }
  function draw() {
    var my = ++seq;
    return GraphRender.render(JSON.parse(JSON.stringify(data))).then(function (r) {
      if (my !== seq) return;
      last = r;
      if (data.auto) { data.ymin = r.data.ymin; data.ymax = r.data.ymax; }
      if (data.equal) { data.ymin = r.data.ymin; data.ymax = r.data.ymax; }
      $('stage').innerHTML = r.svg;
      fitStage();
      syncWindow();
      showInfo(r.info);
      if (codeP) codeP.refresh();
      Studio.hideLoader();
    }).catch(function (e) { $('status').innerHTML = '<span class="err">' + Raster.esc(e.message) + '</span>'; Studio.hideLoader(); });
  }

  function fitStage() {
    var st = $('stage'), svg = st.querySelector('svg'); if (!svg) return;
    var k = Math.min((st.clientWidth - 24) / data.w, (st.clientHeight - 24) / data.h);
    if (!(k > 0)) return;
    svg.style.width = (data.w * k) + 'px'; svg.style.height = (data.h * k) + 'px';
  }
  window.addEventListener('resize', fitStage);
  function showInfo(info) {
    // per-function errors
    Array.prototype.forEach.call(document.querySelectorAll('.fnwrap'), function (w, i) {
      var e = info.errors[i], inp = w.querySelector('.inp.math'), er = w.querySelector('.fnerr');
      inp.classList.toggle('err', !!e);
      er.hidden = !e; er.textContent = e || '';
    });
    // key-points table
    var KIND = { root: tr('صفر الدالة|Root'), yint: tr('المقطع الصادي|y-intercept'), max: tr('قيمة عظمى|Maximum'), min: tr('قيمة صغرى|Minimum'), inter: tr('نقطة تقاطع|Intersection'), user: tr('نقطة|Point') };
    var rows = info.features.map(function (p) {
      var col = p.kind === 'user' ? '#1b2a30' : (data.fns[p.fn] && data.fns[p.fn].color);
      return '<tr><td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + col + ';margin-inline-end:6px"></span>' + KIND[p.kind] + '</td><td class="v"><span dir="ltr">(' + GraphRender.round2(p.x) + ', ' + GraphRender.round2(p.y) + ')</span></td></tr>';
    });
    $('featTable').innerHTML = rows.length ? rows.join('') : '<tr><td class="hint">' + tr('لا توجد نقاط في هذه النافذة|No points in view') + '</td></tr>';
    $('areaInfo').textContent = info.area ? tr('المساحة ≈ |Area ≈ ') + GraphRender.round2(info.area.area) + ' — ' + tr('قيمة التكامل = |Integral = ') + GraphRender.round2(info.area.integral) : '';
    $('status').textContent = '';
    $('sizeInfo').textContent = (data.w * 0.75 / 72 * 2.54).toFixed(1) + ' × ' + (data.h * 0.75 / 72 * 2.54).toFixed(1) + ' ' + tr('سم|cm');
  }

  // ------------------------------------------------------------ functions list
  var TEMPLATES_AR = ['س', 'س^2', 'س^3', '\\sqrt{س}', '\\frac{1}{س}', '|س|', 'جا س', 'جتا س', 'طا س', 'هـ^س', 'لط س', '2^س'];
  var TEMPLATES_EN = ['x', 'x^2', 'x^3', '\\sqrt{x}', '\\frac{1}{x}', '|x|', '\\sin x', '\\cos x', '\\tan x', 'e^x', '\\ln x', '2^x'];
  function buildFns() {
    var list = $('fnList'); list.innerHTML = '';
    data.fns.forEach(function (fn, i) {
      var w = document.createElement('div'); w.className = 'fnwrap';
      w.innerHTML =
        '<div class="fnrow">' +
          '<span class="dot" style="background:' + fn.color + '"><input type="color" value="' + fn.color + '" title="' + tr('اللون|Colour') + '"></span>' +
          '<input class="inp math" dir="auto" spellcheck="false">' +
          '<button type="button" class="ibtn eye" title="' + tr('إظهار/إخفاء|Show/hide') + '" aria-pressed="' + (fn.visible !== false) + '">👁</button>' +
          '<button type="button" class="ibtn del" title="' + tr('حذف|Delete') + '">×</button>' +
        '</div>' +
        '<div class="fnopt">' +
          '<select class="inp" data-k="dash"><option value="solid">' + tr('متصل|Solid') + '</option><option value="dash">' + tr('متقطع|Dashed') + '</option><option value="dot">' + tr('منقّط|Dotted') + '</option></select>' +
          '<select class="inp" data-k="width"><option value="1.4">' + tr('رفيع|Thin') + '</option><option value="2.2">' + tr('متوسط|Medium') + '</option><option value="3.2">' + tr('سميك|Thick') + '</option></select>' +
          '<label class="lbl" style="display:flex;align-items:center;gap:4px"><input type="checkbox" data-k="label"' + (fn.label !== false ? ' checked' : '') + '>' + tr('تسمية|Label') + '</label>' +
          '<input class="inp" data-k="name" size="4" style="width:58px;text-align:center" title="' + tr('اسم الدالة في التسمية|Name in label') + '">' +
        '</div><div class="fnerr" hidden></div>';
      var inp = w.querySelector('.inp.math');
      inp.value = fn.expr;
      inp.oninput = function () { fn.expr = this.value; redraw(); };
      w.querySelector('input[type=color]').oninput = function () { fn.color = this.value; w.querySelector('.dot').style.background = this.value; redraw(); };
      w.querySelector('.eye').onclick = function () { fn.visible = fn.visible === false; this.setAttribute('aria-pressed', String(fn.visible)); redraw(true); };
      w.querySelector('.del').onclick = function () { data.fns.splice(i, 1); if (!data.fns.length) addFn(''); buildFns(); buildAreaSel(); redraw(true); };
      w.querySelector('[data-k=dash]').value = fn.dash || 'solid';
      w.querySelector('[data-k=width]').value = String(fn.width || 2.2);
      w.querySelector('[data-k=name]').value = fn.name || (data.notation === 'en' ? 'y' : 'ص');
      Array.prototype.forEach.call(w.querySelectorAll('[data-k]'), function (el) {
        el.onchange = el.oninput = function () {
          var k = el.getAttribute('data-k');
          fn[k] = el.type === 'checkbox' ? el.checked : (k === 'width' ? +el.value : el.value);
          redraw();
        };
      });
      list.appendChild(w);
    });
  }
  function addFn(expr) {
    var used = data.fns.map(function (f) { return f.color; });
    var color = GraphRender.PALETTE.filter(function (c) { return used.indexOf(c) < 0; })[0] || GraphRender.PALETTE[data.fns.length % GraphRender.PALETTE.length];
    var ar = data.notation !== 'en';
    var names = ar ? ['ص', 'ص', 'ع', 'ل', 'م'] : ['y', 'y', 'g(x)', 'h(x)', 'k(x)'];
    data.fns.push({ expr: expr, color: color, width: 2.2, dash: 'solid', name: data.fns.length ? (ar ? ['د(س)', 'هـ(س)', 'ق(س)', 'ل(س)'][data.fns.length % 4] : names[data.fns.length % 5]) : names[0], label: true, visible: true });
  }
  $('addFn').onclick = function () { addFn(''); buildFns(); buildAreaSel(); var ins = document.querySelectorAll('.fnwrap .inp.math'); ins[ins.length - 1].focus(); };
  function buildTemplates() {
    var t = $('tpl'); t.innerHTML = '';
    (data.notation === 'en' ? TEMPLATES_EN : TEMPLATES_AR).forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip m'; b.textContent = x.replace(/\\sqrt\{(.)\}/, '√$1').replace(/\\frac\{1\}\{(.)\}/, '1/$1').replace(/\^2/, '²').replace(/\^3/, '³').replace(/\\/g, '');
      b.onclick = function () {
        var empty = data.fns.filter(function (f) { return !String(f.expr).trim(); })[0];
        if (empty) empty.expr = x; else addFn(x);
        buildFns(); buildAreaSel(); redraw(true);
      };
      t.appendChild(b);
    });
  }

  // ------------------------------------------------------------ checkboxes
  var FEAT = [['roots', 'الأصفار|Roots'], ['yint', 'المقطع الصادي|y-intercept'], ['extrema', 'القيم القصوى|Extrema'], ['inter', 'نقاط التقاطع|Intersections'], ['coords', 'كتابة الإحداثيات|Show coordinates']];
  var AXES = [['axes', 'المحاور|Axes'], ['arrows', 'أسهم المحاور|Arrows'], ['ticks', 'الأرقام والتدريج|Ticks & numbers'], ['axisNames', 'اسما المحورين|Axis names'],
    ['grid', 'الشبكة|Grid'], ['minor', 'شبكة فرعية|Minor grid'], ['piTicks', 'تدريج بـ π|π ticks']];
  function checks(el, list) {
    el.innerHTML = '';
    list.forEach(function (c) {
      var l = document.createElement('label');
      l.innerHTML = '<input type="checkbox"' + (data[c[0]] ? ' checked' : '') + '><span>' + tr(c[1]) + '</span>';
      l.querySelector('input').onchange = function () { data[c[0]] = this.checked; redraw(true); };
      el.appendChild(l);
    });
  }

  // ------------------------------------------------------------ window
  function syncWindow() {
    ['xmin', 'xmax', 'ymin', 'ymax'].forEach(function (k) { if (document.activeElement !== $(k)) $(k).value = +(+data[k]).toPrecision(4); });
    $('auto').checked = !!data.auto; $('equal').checked = !!data.equal;
  }
  ['xmin', 'xmax', 'ymin', 'ymax'].forEach(function (k) {
    $(k).onchange = function () {
      var v = parseFloat(String(this.value).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x660; }).replace('−', '-'));
      if (!isFinite(v)) return syncWindow();
      data[k] = v;
      if (k[0] === 'y') data.auto = false;
      if (data.xmax <= data.xmin || data.ymax <= data.ymin) { data[k] = k.slice(1) === 'min' ? data[k.replace('min', 'max')] - 1 : data[k.replace('max', 'min')] + 1; }
      redraw(true);
    };
  });
  $('auto').onchange = function () { data.auto = this.checked; redraw(true); };
  $('equal').onchange = function () { data.equal = this.checked; if (this.checked) data.auto = false; redraw(true); };
  function zoom(f, cx, cy) {
    cx = cx === undefined ? (data.xmin + data.xmax) / 2 : cx; cy = cy === undefined ? (data.ymin + data.ymax) / 2 : cy;
    data.xmin = cx - (cx - data.xmin) * f; data.xmax = cx + (data.xmax - cx) * f;
    data.ymin = cy - (cy - data.ymin) * f; data.ymax = cy + (data.ymax - cy) * f;
    data.auto = false;
    redraw(true);
  }
  $('zoomIn').onclick = function () { zoom(0.8); };
  $('zoomOut').onclick = function () { zoom(1.25); };
  $('fitBtn').onclick = function () { data.xmin = -6; data.xmax = 6; data.auto = true; data.equal = false; redraw(true); };

  // pan & wheel zoom on the stage
  (function () {
    var st = $('stage'), drag = null;
    function toData(e) {
      var svg = st.querySelector('svg'); if (!svg) return null;
      var r = svg.getBoundingClientRect(), pad = 14;
      var fx = ((e.clientX - r.left) / r.width * data.w - pad) / (data.w - 2 * pad);
      var fy = ((e.clientY - r.top) / r.height * data.h - pad) / (data.h - 2 * pad);
      return { x: data.xmin + fx * (data.xmax - data.xmin), y: data.ymax - fy * (data.ymax - data.ymin), r: r };
    }
    st.addEventListener('pointerdown', function (e) {
      var p = toData(e); if (!p) return;
      drag = { x: e.clientX, y: e.clientY, w: Object.assign({}, { xmin: data.xmin, xmax: data.xmax, ymin: data.ymin, ymax: data.ymax }), r: p.r };
      st.classList.add('grabbing'); st.setPointerCapture(e.pointerId);
    });
    st.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var sx = (drag.w.xmax - drag.w.xmin) / (drag.r.width * (data.w - 28) / data.w), sy = (drag.w.ymax - drag.w.ymin) / (drag.r.height * (data.h - 28) / data.h);
      var dx = (e.clientX - drag.x) * sx, dy = (e.clientY - drag.y) * sy;
      data.xmin = drag.w.xmin - dx; data.xmax = drag.w.xmax - dx; data.ymin = drag.w.ymin + dy; data.ymax = drag.w.ymax + dy;
      data.auto = false;
      redraw();
    });
    var end = function () { drag = null; st.classList.remove('grabbing'); };
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
    st.addEventListener('wheel', function (e) {
      var p = toData(e); if (!p) return;
      e.preventDefault();
      zoom(e.deltaY > 0 ? 1.12 : 0.89, p.x, p.y);
    }, { passive: false });
  })();

  // ------------------------------------------------------------ area
  function buildAreaSel() {
    var a = $('areaFn'), b = $('areaFn2');
    a.innerHTML = ''; b.innerHTML = '<option value="-1">' + tr('محور السينات|x-axis') + '</option>';
    data.fns.forEach(function (f, i) {
      var t = (i + 1) + ') ' + (f.expr || '…');
      a.insertAdjacentHTML('beforeend', '<option value="' + i + '">' + Raster.esc(t) + '</option>');
      b.insertAdjacentHTML('beforeend', '<option value="' + i + '">' + Raster.esc(t) + '</option>');
    });
    if (data.area.fn >= data.fns.length) data.area.fn = 0;
    if (data.area.fn2 >= data.fns.length) data.area.fn2 = -1;
    a.value = data.area.fn; b.value = data.area.fn2;
  }
  $('areaOn').onchange = function () { data.area.on = this.checked; redraw(true); };
  $('areaVal').onchange = function () { data.area.value = this.checked; redraw(true); };
  $('areaFn').onchange = function () { data.area.fn = +this.value; redraw(true); };
  $('areaFn2').onchange = function () { data.area.fn2 = +this.value; redraw(true); };
  ['areaA', 'areaB'].forEach(function (id, k) {
    $(id).onchange = function () {
      var v; try { v = ArabicCAS.compile(this.value).f(0); } catch (e) { v = parseFloat(this.value); }
      if (!isFinite(v)) return;
      data.area[k ? 'b' : 'a'] = v; data.area.on = true; $('areaOn').checked = true; redraw(true);
    };
  });

  // ------------------------------------------------------------ extra points
  function buildPts() {
    var l = $('ptList'); l.innerHTML = '';
    data.points.forEach(function (p, i) {
      var r = document.createElement('div'); r.className = 'row';
      r.innerHTML = '<input class="inp num" placeholder="' + (data.notation === 'en' ? 'x' : 'س') + '"><input class="inp num" placeholder="' + (data.notation === 'en' ? 'y' : 'ص') + '"><input class="inp" style="width:70px" placeholder="' + tr('الاسم|Name') + '"><button type="button" class="ibtn del">×</button>';
      var ins = r.querySelectorAll('input');
      ins[0].value = p.x; ins[1].value = p.y; ins[2].value = p.label || '';
      ins[0].oninput = function () { p.x = this.value; redraw(); };
      ins[1].oninput = function () { p.y = this.value; redraw(); };
      ins[2].oninput = function () { p.label = this.value; redraw(); };
      r.querySelector('.del').onclick = function () { data.points.splice(i, 1); buildPts(); redraw(true); };
      l.appendChild(r);
    });
  }
  $('addPt').onclick = function () { data.points.push({ x: 1, y: 1, label: data.notation === 'en' ? 'A' : 'أ' }); buildPts(); redraw(true); };

  // ------------------------------------------------------------ appearance
  function seg(id, key) {
    Array.prototype.forEach.call($(id).querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === data[key]));
      b.onclick = function () {
        data[key] = b.getAttribute('data-v'); seg(id, key);
        if (key === 'notation') { buildTemplates(); }
        redraw(true);
      };
    });
  }
  $('font').onchange = function () { data.font = this.value; redraw(true); };
  $('fsz').onchange = function () { data.fontSize = +this.value; redraw(true); };
  $('W').onchange = function () { var v = +this.value; if (v >= 200 && v <= 1400) { data.w = v; redraw(true); } };
  $('H').onchange = function () { var v = +this.value; if (v >= 150 && v <= 1400) { data.h = v; redraw(true); } };
  $('title').oninput = function () { data.title = this.value; redraw(); };
  var SIZES = [['صغير|Small', 400, 300], ['متوسط|Medium', 560, 420], ['عريض|Wide', 640, 360], ['مربع|Square', 480, 480], ['كبير|Large', 720, 540]];
  SIZES.forEach(function (s) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = tr(s[0]);
    b.onclick = function () { data.w = s[1]; data.h = s[2]; $('W').value = s[1]; $('H').value = s[2]; redraw(true); };
    $('sizeChips').appendChild(b);
  });

  // ------------------------------------------------------------ export / insert
  $('exportBtn').onclick = function () { Studio.popAt($('exportPop'), this); };
  $('exportPop').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-exp]'); if (!b) return;
    $('exportPop').hidden = true;
    Studio.exportAs(b.getAttribute('data-exp'), produce, 'graph');
  });
  $('okBtn').onclick = function () {
    var bad = data.fns.filter(function (f) { return String(f.expr).trim(); }).length === 0;
    if (bad) { Studio.toast(tr('اكتب دالة واحدة على الأقل|Enter at least one function'), true); return; }
    $('okBtn').disabled = true;
    var clean = JSON.parse(JSON.stringify(data));
    Studio.finish('graph', clean, produce, 'graph').catch(function (e) { Studio.toast(e.message, true); })
      .then(function () { $('okBtn').disabled = false; });
  };
  $('cancelBtn').onclick = Studio.cancel;
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('okBtn').click(); }
    if (e.key === 'Escape') Studio.cancel();
  });
  if (S.editId) $('okBtn').setAttribute('data-t', 'تحديث الرسم|Update graph');

  // ------------------------------------------------------------ boot
  Studio.applyT();
  var codeP = null;
  function syncAll() {
    buildFns(); buildTemplates(); buildAreaSel(); buildPts();
    checks($('featChecks'), FEAT); checks($('axisChecks'), AXES);
    seg('notSeg', 'notation'); seg('digSeg', 'digits');
    $('font').value = data.font; $('fsz').value = String(data.fontSize); $('W').value = data.w; $('H').value = data.h; $('title').value = data.title || '';
    $('areaOn').checked = !!data.area.on; $('areaVal').checked = data.area.value !== false; $('areaA').value = data.area.a; $('areaB').value = data.area.b;
  }
  codeP = Studio.codePanel({ el: $('codeBox'), kind: 'graph', get: function () { return data; },
    set: function (d) { data = Object.assign(GraphRender.defaults(), d); syncAll(); redraw(true); } });
  buildFns(); buildTemplates(); buildAreaSel(); buildPts();
  checks($('featChecks'), FEAT); checks($('axisChecks'), AXES);
  seg('notSeg', 'notation'); seg('digSeg', 'digits');
  $('font').value = data.font; $('fsz').value = String(data.fontSize); $('W').value = data.w; $('H').value = data.h; $('title').value = data.title || '';
  $('areaOn').checked = !!data.area.on; $('areaVal').checked = data.area.value !== false; $('areaA').value = data.area.a; $('areaB').value = data.area.b;
  RenderHost.warm(data.mathFont).then(function () { draw(); }, function () { draw(); });
  setTimeout(Studio.hideLoader, 6000);
  window.__graph = { get data() { return data; }, draw: draw, produce: produce };
})();
