/* Geometry studio UI */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var tr = Studio.tr, S0 = Studio.init, G = GeoTemplates;
  var notation = Studio.lang() === 'en' ? 'en' : 'ar';
  var data;
  if (S0.data && S0.data.P) { data = S0.data; notation = (data.opt && data.opt.notation) || notation; }
  else {
    data = G.create(S0.tpl || 'triangle', notation);
    try { var set = Settings.load(); data.opt.digits = set.digits === 'eastern' ? 'eastern' : 'western'; if (['Amiri', 'Noto Naskh Arabic', 'Scheherazade New', 'Noto Kufi Arabic', 'Cairo'].indexOf(set.font) >= 0) data.opt.font = set.font; } catch (e) { /* ignore */ }
  }
  data.opt = Object.assign(GeometryRender.defaultsOpt(), { notation: notation, unit: notation === 'en' ? 'cm' : 'سم' }, data.opt || {});
  var view = null;                 // fixed viewBox while editing

  function fitView() {
    var W = $('stage').clientWidth - 24, H = $('stage').clientHeight - 24;
    return GeometryRender.render(data).then(function (r) {
      var b = r.vb, k = Math.max(b[2] / W, b[3] / H) * 1.15;
      var w = W * k, h = H * k, cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2;
      view = [cx - w / 2, cy - h / 2, w, h];
    });
  }
  var seq = 0;
  function draw() {
    var my = ++seq;
    return GeometryRender.render(data, { viewBox: view }).then(function (r) {
      if (my !== seq) return;
      var st = $('stage');
      st.innerHTML = r.svg;
      var svg = st.querySelector('svg');
      svg.style.width = (st.clientWidth - 24) + 'px'; svg.style.height = (st.clientHeight - 24) + 'px';
      // drag handles
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      (data.handles || []).forEach(function (k) {
        var p = r.px[k]; if (!p) return;
        var h = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        h.setAttribute('class', 'hd'); h.setAttribute('data-k', k);
        h.innerHTML = '<circle r="13" cx="' + p[0] + '" cy="' + p[1] + '" fill="#0e9f9a" fill-opacity="0.12"/>' +
          '<circle class="ring" r="6.5" cx="' + p[0] + '" cy="' + p[1] + '" fill="#fff" stroke="#0e9f9a" stroke-width="2"/>';
        g.appendChild(h);
      });
      svg.appendChild(g);
      Studio.hideLoader();
      GeometryRender.render(data).then(function (x) {
        $('sizeInfo').textContent = (x.w / 37.7953).toFixed(1) + ' × ' + (x.h / 37.7953).toFixed(1) + ' ' + tr('سم|cm');
        if (codeP && !(window.__geoDrag && window.__geoDrag())) codeP.refresh();
      });
    });
  }
  var rt = null;
  function redraw() { cancelAnimationFrame(rt); rt = requestAnimationFrame(draw); }

  // dragging
  (function () {
    var st = $('stage'), drag = null;
    window.__geoDrag = function () { return !!drag; };
    function pt(e) {
      var svg = st.querySelector('svg'); var m = svg.getScreenCTM().inverse();
      var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; p = p.matrixTransform(m);
      return [p.x / GeometryRender.S, -p.y / GeometryRender.S];
    }
    st.addEventListener('pointerdown', function (e) {
      var h = e.target.closest('.hd'); if (!h) return;
      drag = h.getAttribute('data-k'); st.setPointerCapture(e.pointerId); e.preventDefault();
    });
    st.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var p = pt(e);
      if (data.opt.grid || e.shiftKey) p = [Math.round(p[0] * 2) / 2, Math.round(p[1] * 2) / 2];
      G.drag(data, drag, p);
      redraw();
    });
    var end = function () { if (drag) { drag = null; buildLabels(); if (codeP) codeP.refresh(); } };
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  })();

  // templates
  function buildTpls() {
    var box = $('tpls'); box.innerHTML = '';
    G.ORDER.forEach(function (id) {
      var t = G.T[id], b = document.createElement('button');
      b.type = 'button'; b.className = 'tpl'; b.setAttribute('aria-pressed', String(data.tpl === id));
      b.innerHTML = '<span class="g">' + t.icon + '</span><span class="n">' + tr(t.t) + '</span>';
      b.onclick = function () {
        var keep = Object.assign({}, data.opt), def = GeometryRender.defaultsOpt();
        ['angles', 'ticks', 'dots'].forEach(function (k) { keep[k] = def[k]; });
        data = G.create(id, notation);
        data.opt = Object.assign({}, keep, data.opt || {}, { notation: notation });
        if (G.T[id].build().opt) Object.assign(data.opt, G.T[id].build().opt);
        buildTpls(); syncControls(); buildLabels();
        fitView().then(draw);
      };
      box.appendChild(b);
    });
    $('nRow').hidden = data.tpl !== 'polygon';
    $('nInp').value = data.prm.n || 6;
  }
  $('nInp').onchange = function () { data.prm.n = Math.max(3, Math.min(12, +this.value || 6)); G.derive(data); G.autoNames(data, notation); buildLabels(); redraw(); };

  // options
  var CHECKS = [['ticks', 'علامات تساوي الأضلاع|Equal-side ticks'], ['right', 'علامة الزاوية القائمة|Right-angle mark'], ['names', 'أسماء النقاط|Point names'], ['dots', 'نقاط الرؤوس|Vertex dots']];
  function seg(id, get, set) {
    Array.prototype.forEach.call($(id).querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === get()));
      b.onclick = function () { set(b.getAttribute('data-v')); seg(id, get, set); redraw(); };
    });
  }
  function syncControls() {
    var o = data.opt;
    seg('sidesSeg', function () { return o.sides; }, function (v) { o.sides = v; });
    seg('anglesSeg', function () { return o.angles; }, function (v) { o.angles = v; });
    seg('digSeg', function () { return o.digits; }, function (v) { o.digits = v; });
    seg('notSeg', function () { return notation; }, function (v) {
      notation = v; o.notation = v;
      if (o.unit === 'سم' || o.unit === 'cm') o.unit = v === 'en' ? 'cm' : 'سم';
      $('unit').value = o.unit;
      G.autoNames(data, notation); buildLabels();
    });
    var box = $('optChecks'); box.innerHTML = '';
    CHECKS.forEach(function (c) {
      var l = document.createElement('label');
      l.innerHTML = '<input type="checkbox"' + (o[c[0]] ? ' checked' : '') + '><span>' + tr(c[1]) + '</span>';
      l.querySelector('input').onchange = function () { o[c[0]] = this.checked; redraw(); };
      box.appendChild(l);
    });
    $('unit').value = o.unit; $('dec').value = String(o.dec);
    $('cStroke').value = o.stroke; $('cFill').value = o.fill; $('cAccent').value = o.accent;
    $('lw').value = String(o.width); $('fo').value = String(o.fillOpacity); $('fsz').value = String(o.fontSize); $('font').value = o.font;
    $('gridBtn').setAttribute('aria-pressed', String(!!o.grid));
  }
  $('unit').oninput = function () { data.opt.unit = this.value; redraw(); };
  $('dec').onchange = function () { data.opt.dec = +this.value; redraw(); };
  $('cStroke').oninput = function () { data.opt.stroke = this.value; redraw(); };
  $('cFill').oninput = function () { data.opt.fill = this.value; if (!+data.opt.fillOpacity) { data.opt.fillOpacity = 0.12; $('fo').value = '0.12'; } redraw(); };
  $('cAccent').oninput = function () { data.opt.accent = this.value; redraw(); };
  $('lw').onchange = function () { data.opt.width = +this.value; redraw(); };
  $('fo').onchange = function () { data.opt.fillOpacity = +this.value; redraw(); };
  $('fsz').onchange = function () { data.opt.fontSize = +this.value; redraw(); };
  $('font').onchange = function () { data.opt.font = this.value; redraw(); };
  $('gridBtn').onclick = function () { data.opt.grid = !data.opt.grid; this.setAttribute('aria-pressed', String(data.opt.grid)); redraw(); };
  $('fitBtn').onclick = function () { fitView().then(draw); };

  // labels (names / sides / angles)
  function nm(k) { return data.names[k] || k; }
  function buildLabels() {
    var pn = $('ptNames'); pn.innerHTML = '';
    Object.keys(data.P).forEach(function (k) {
      if (data.hidden && data.hidden[k]) return;
      var used = (data.E || []).some(function (e) { return (e.p || []).indexOf(k) >= 0 || e.c === k || e.through === k; });
      if (!used) return;
      pn.insertAdjacentHTML('beforeend', '<span class="k">' + k + '</span>');
      var i = document.createElement('input'); i.className = 'inp'; i.value = data.names[k] || ''; i.dir = 'auto';
      i.oninput = function () { data.names[k] = this.value; (data.fixedNames = data.fixedNames || {})[k] = this.value; redraw(); };
      pn.appendChild(i);
    });
    var sides = [], angs = [];
    (data.E || []).forEach(function (e) {
      if (e.t === 'poly') e.p.forEach(function (q, i) {
        var n = e.p.length; sides.push([q, e.p[(i + 1) % n]]); angs.push([e.p[(i + n - 1) % n], q, e.p[(i + 1) % n]]);
      });
      if (e.t === 'seg' && e.len !== false) sides.push(e.p);
      if (e.t === 'angle') angs.push(e.p);
    });
    var sl = $('sideLbls'); sl.innerHTML = '';
    var seen = {};
    sides.forEach(function (s) {
      var key = s[0] + '-' + s[1], k2 = s[1] + '-' + s[0]; if (seen[key] || seen[k2]) return; seen[key] = 1;
      sl.insertAdjacentHTML('beforeend', '<span class="k">' + Raster.esc(nm(s[0]) + ' ' + nm(s[1])) + '</span>');
      var i = document.createElement('input'); i.className = 'inp'; i.dir = 'auto';
      var cur = data.sideLbl[key] !== undefined ? data.sideLbl[key] : data.sideLbl[k2];
      i.value = cur === undefined ? '' : cur;
      i.placeholder = tr('تلقائي|auto');
      i.oninput = function () { delete data.sideLbl[k2]; if (this.value === '') delete data.sideLbl[key]; else data.sideLbl[key] = this.value; redraw(); };
      sl.appendChild(i);
    });
    var al = $('angLbls'); al.innerHTML = '';
    angs.forEach(function (a) {
      var key = a.join('-'), k2 = [a[2], a[1], a[0]].join('-');
      al.insertAdjacentHTML('beforeend', '<span class="k">∠ ' + Raster.esc(nm(a[0]) + nm(a[1]) + nm(a[2])) + '</span>');
      var i = document.createElement('input'); i.className = 'inp'; i.dir = 'auto'; i.placeholder = tr('تلقائي|auto');
      var cur = data.angLbl[key] !== undefined ? data.angLbl[key] : data.angLbl[k2];
      i.value = cur === '__none__' ? '-' : (cur || '');
      i.oninput = function () {
        delete data.angLbl[k2];
        if (this.value === '') delete data.angLbl[key]; else data.angLbl[key] = this.value === '-' ? '__none__' : this.value;
        redraw();
      };
      al.appendChild(i);
    });
  }

  // export / insert
  function produce() { return GeometryRender.render(JSON.parse(JSON.stringify(data))); }
  $('exportBtn').onclick = function () { Studio.popAt($('exportPop'), this); };
  $('exportPop').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-exp]'); if (!b) return;
    $('exportPop').hidden = true;
    Studio.exportAs(b.getAttribute('data-exp'), produce, 'geometry');
  });
  $('okBtn').onclick = function () {
    $('okBtn').disabled = true;
    var clean = JSON.parse(JSON.stringify(data)); clean.opt.grid = false;
    Studio.finish('geometry', clean, function () { return GeometryRender.render(clean); }, 'geometry').catch(function (e) { Studio.toast(e.message, true); })
      .then(function () { $('okBtn').disabled = false; });
  };
  $('cancelBtn').onclick = Studio.cancel;
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('okBtn').click(); }
    if (e.key === 'Escape') Studio.cancel();
  });
  if (S0.editId) $('okBtn').setAttribute('data-t', 'تحديث الشكل|Update figure');
  window.addEventListener('resize', function () { fitView().then(draw); });

  Studio.applyT();
  var codeP = Studio.codePanel({ el: $('codeBox'), kind: 'geometry', get: function () { return data; },
    set: function (d) {
      data = d;
      data.opt = Object.assign(GeometryRender.defaultsOpt(), { notation: notation }, data.opt || {});
      data.handles = Object.keys(data.show || {}).filter(function (k) { return data.show[k] && data.P[k]; });
      buildTpls(); syncControls(); buildLabels(); fitView().then(draw);
    } });
  buildTpls(); syncControls(); buildLabels();
  setTimeout(function () { fitView().then(draw).catch(function (e) { Studio.toast(e.message, true); Studio.hideLoader(); }); }, 30);
  setTimeout(Studio.hideLoader, 5000);
  window.__geo = { get data() { return data; }, produce: produce };
})();
