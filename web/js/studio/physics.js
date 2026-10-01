/* Physics studio: mechanics / optics / electrostatics diagrams and electric circuits (code-driven with templates) */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var tr = Studio.tr, S0 = Studio.init;
  var tab = S0.tab === 'circuit' || (S0.data && /\\begin\s*\{circuit/.test(S0.data.code || '')) ? 'circuit' : 'physics';
  var state = { physics: { tpl: 'incline', prm: null, code: '' }, circuit: { tpl: 'series', code: '' } };
  if (S0.data && S0.data.code) { state[tab].code = S0.data.code; state[tab].tpl = null; }

  var SNIPS = {
    physics: [['+ جسم|+ block', '\\block[at=(3,0), w=1.4, h=1]{ك}'], ['+ قوة|+ force', '\\force[angle=90, len=2, color=blue]{ق}'], ['+ سرعة|+ velocity', '\\velocity[angle=0, len=2]{ع}'],
      ['+ أرض|+ ground', '\\ground{(-1,0)}{(8,0)}'], ['+ مستوى مائل|+ incline', '\\incline[angle=30, base=6]{(0,0)}'], ['+ بكرة|+ pulley', '\\pulley[r=0.5]{(4,4)}'],
      ['+ حبل|+ rope', '\\rope{(0,2) (4,4)}'], ['+ نابض|+ spring', '\\spring{(0,1)}{(3,1)}'], ['+ زاوية|+ angle', '\\arc[label=θ, r=0.9]{(0,0)}{0}{30}'],
      ['+ بُعد|+ dimension', '\\dim[label=ف]{(0,0)}{(4,0)}'], ['+ نقطة|+ point', '\\point[label=أ]{(2,2)}'], ['+ نص|+ text', '\\text{(3,3)}{نص}'], ['+ شحنة|+ charge', '\\charge[q=+]{(0,0)}'],
      ['+ منحنى (ع–ز)|+ v–t graph', '\\motion[type=vt, area, slopes]{(0,0) (2,10) (5,10) (7,0)}'], ['+ منحنى (ف–ز)|+ x–t graph', '\\motion[type=xt, slopes]{(0,0) (3,15) (5,15) (8,0)}'],
      ['+ موجة مستعرضة|+ transverse wave', '\\wave[amplitude=1, wavelength=4, length=10]{(0,0)}'], ['+ موجة طولية|+ longitudinal wave', '\\wave[amplitude=1, wavelength=3, length=9, type=long]{(0,0)}']],
    circuit: [['+ مقاومة|+ resistor', '\\resistor[label=م]{(0,3)}{(3,3)}'], ['+ بطارية|+ battery', '\\battery{(0,0)}{(0,3)}'], ['+ مصباح|+ lamp', '\\lamp{(3,3)}{(3,0)}'],
      ['+ مفتاح|+ switch', '\\switch{(3,0)}{(0,0)}'], ['+ أميتر|+ ammeter', '\\ammeter{(3,3)}{(6,3)}'], ['+ فولتميتر|+ voltmeter', '\\voltmeter{(0,4.5)}{(3,4.5)}'],
      ['+ مكثف|+ capacitor', '\\capacitor[label=س]{(6,3)}{(6,0)}'], ['+ ملف|+ inductor', '\\inductor[label=ل]{(0,3)}{(3,3)}'], ['+ دايود|+ diode', '\\diode{(0,3)}{(3,3)}'],
      ['+ سلك|+ wire', '\\wire{(3,0)}{(0,0)}'], ['+ نقطة تفرع|+ junction', '\\junction{(3,3)}'], ['+ تيار|+ current', '\\current[label=ت]{(1,3)}{(1.5,3)}']]
  };

  function templates() { return tab === 'circuit' ? CircuitRender.TEMPLATES : PhysicsMarkup.TEMPLATES; }
  function kind() { return tab === 'circuit' ? 'circuit' : 'physics'; }
  function curCode() { return state[tab].code; }
  function data() { return { v: 1, code: curCode() }; }
  function produce() { return tab === 'circuit' ? CircuitRender.render(data()) : PhysicsRender.render(data()); }

  var seq = 0, timer = null, code = null;
  function redraw(now) { clearTimeout(timer); timer = setTimeout(draw, now ? 0 : 200); }
  function draw() {
    var my = ++seq;
    return produce().then(function (r) {
      if (my !== seq) return;
      var st = $('stage'); st.innerHTML = r.svg;
      var svg = st.querySelector('svg'), k = Math.min((st.clientWidth - 30) / r.w, (st.clientHeight - 30) / r.h, 2.2);
      if (k > 0) { svg.style.width = (r.w * k) + 'px'; svg.style.height = (r.h * k) + 'px'; }
      var inf = r.info || {};
      $('status').textContent = inf.range !== undefined ? tr('المدى الأفقي = |Range = ') + (+inf.range.toFixed(2)) + tr(' م — أقصى ارتفاع = | m — max height = ') + (+inf.height.toFixed(2)) + tr(' م — زمن التحليق = | m — flight time = ') + (+inf.time.toFixed(2)) + tr(' ث| s') : '';
      $('sizeInfo').textContent = (r.w / 37.7953).toFixed(1) + ' × ' + (r.h / 37.7953).toFixed(1) + ' ' + tr('سم|cm');
      $('okBtn').disabled = false;
      Studio.hideLoader();
    }).catch(function (e) {
      if (my !== seq) return;
      $('status').innerHTML = '<span class="err">' + Raster.esc(e.message) + '</span>';
      $('okBtn').disabled = true;
      Studio.hideLoader();
    });
  }

  function buildGallery() {
    var g = $('gallery'), T = templates(); g.innerHTML = '';
    Object.keys(T).forEach(function (k) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = tr(T[k].t);
      b.setAttribute('aria-pressed', String(state[tab].tpl === k));
      b.onclick = function () { choose(k); };
      g.appendChild(b);
    });
  }
  function choose(k) {
    var T = templates()[k], st = state[tab];
    st.tpl = k;
    st.prm = {};
    (T.p || []).forEach(function (q) { st.prm[q[0]] = q[2]; });
    st.code = T.code(st.prm);
    buildGallery(); buildParams(); if (code) code.refresh(); redraw(true);
  }
  function buildParams() {
    var box = $('params'), st = state[tab], T = st.tpl ? templates()[st.tpl] : null;
    $('paramSec').hidden = !(T && T.p && T.p.length);
    if (!T || !T.p) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="grid2"></div><p class="hint">' + tr('تغيير القيم يعيد كتابة الكود؛ عدّل الكود بعد ذلك إن أردت.|Changing a value rewrites the code.') + '</p>';
    var grid = box.firstChild;
    T.p.forEach(function (q) {
      var l = document.createElement('label');
      l.innerHTML = '<span>' + tr(q[1]) + '</span><input class="inp num">';
      var inp = l.querySelector('input'); inp.value = st.prm[q[0]];
      inp.oninput = function () {
        var v = Mk.evalNum(this.value, NaN); if (!isFinite(v)) return;
        st.prm[q[0]] = v; st.code = T.code(st.prm); if (code) code.refresh(); redraw();
      };
      grid.appendChild(l);
    });
  }
  function buildSnips() {
    var box = $('snips'); box.innerHTML = '';
    SNIPS[tab].forEach(function (s) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = tr(s[0]);
      b.onclick = function () {
        var c = curCode(), env = tab === 'circuit' ? 'circuit' : 'physics';
        if (!/\\end\s*\{/.test(c)) c = '\\begin{' + env + '}\n\\end{' + env + '}';
        state[tab].code = c.replace(/\n?\\end\s*\{(physics|circuit)\}\s*$/, '\n  ' + s[1] + '\n\\end{$1}');
        state[tab].tpl = null; buildGallery(); buildParams();
        code.refresh(); redraw(true);
        var ta = code.el, pos = ta.value.lastIndexOf(s[1]); ta.focus(); ta.setSelectionRange(pos, pos + s[1].length);
      };
      box.appendChild(b);
    });
  }

  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]'); if (!b) return;
    tab = b.getAttribute('data-tab');
    Array.prototype.forEach.call($('tabs').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    setupCode();
    if (!state[tab].code) choose(tab === 'circuit' ? 'series' : 'incline');
    else { buildGallery(); buildParams(); code.refresh(); redraw(true); }
    buildSnips();
  });
  function setupCode() {
    code = Studio.codePanel({ el: $('codeBox'), kind: kind(), accept: ['physics', 'circuit'], get: data,
      set: function (d, k) {
        if (k && k !== kind()) { tab = k; Array.prototype.forEach.call($('tabs').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-tab') === k)); }); buildSnips(); }
        state[tab].code = d.code; state[tab].tpl = null; buildGallery(); buildParams(); redraw(true);
      } });
  }

  // ------------------------------------------------------------ circuit calculator (steps)
  var ccSteps = [];
  function syncCalc() { $('calcSec').hidden = tab !== 'circuit'; }
  $('ccGo').onclick = function () {
    var out = $('ccOut'); out.innerHTML = '';
    try { ccSteps = CircuitCalc.solve($('ccExpr').value, $('ccVals').value, $('ccSrc').value).steps; }
    catch (e) { out.innerHTML = '<li style="color:var(--danger)">' + Raster.esc(e.message) + '</li>'; ccSteps = []; return; }
    var o = Studio.eqOpts(); o.fontSize = 13;
    ccSteps.forEach(function (s) {
      var li = document.createElement('li');
      li.innerHTML = '<div class="tx"></div>' + (s.tex ? '<div class="mx" dir="ltr"></div>' : '');
      li.querySelector('.tx').textContent = s.t; out.appendChild(li);
      if (s.tex) RenderHost.preview(s.tex, o).then(function (r) {
        var mx = li.querySelector('.mx'); if (r.errors && r.errors.length) { mx.textContent = s.tex; return; }
        mx.innerHTML = r.svgString; var svg = mx.firstChild; svg.setAttribute('width', (r.width * 1.05).toFixed(2) + 'em'); svg.setAttribute('height', (r.total * 1.05).toFixed(2) + 'em');
      });
    });
  };
  $('ccIns').onclick = function () {
    if (!ccSteps.length) $('ccGo').onclick();
    if (!ccSteps.length) return;
    var items = [];
    ccSteps.forEach(function (s) { items.push({ kind: 'text', text: s.t }); if (s.tex) items.push({ tex: s.tex }); });
    Studio.insertItems(items);
  };
  $('tabs').addEventListener('click', syncCalc);

  $('exportBtn').onclick = function () { Studio.popAt($('exportPop'), this); };
  $('exportPop').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-exp]'); if (!b) return;
    $('exportPop').hidden = true;
    Studio.exportAs(b.getAttribute('data-exp'), produce, kind());
  });
  $('okBtn').onclick = function () {
    $('okBtn').disabled = true;
    produce().then(function () { return Studio.finish(kind(), data(), produce, kind()); })
      .catch(function (e) { Studio.toast(e.message, true); }).then(function () { $('okBtn').disabled = false; });
  };
  $('cancelBtn').onclick = Studio.cancel;
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('okBtn').click(); }
    if (e.key === 'Escape') Studio.cancel();
  });
  if (S0.editId) $('okBtn').setAttribute('data-t', 'تحديث الرسم|Update diagram');
  window.addEventListener('resize', function () { redraw(true); });

  Studio.applyT();
  Array.prototype.forEach.call($('tabs').querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-tab') === tab)); });
  setupCode(); buildSnips(); syncCalc();
  if (state[tab].code) { buildGallery(); buildParams(); code.refresh(); }
  else choose(tab === 'circuit' ? 'series' : 'incline');
  RenderHost.warm('stix2').then(function () { draw(); }, function () { draw(); });
  setTimeout(Studio.hideLoader, 5000);
  window.__physics = { produce: produce, get code() { return curCode(); } };
})();
