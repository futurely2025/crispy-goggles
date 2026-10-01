/* Structural-formula studio UI */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var tr = Studio.tr, S0 = Studio.init, en = Studio.lang() === 'en';
  var data = Object.assign(StructureRender.defaults(), S0.data && S0.data.smiles ? S0.data : {});
  if (!(S0.data && S0.data.smiles)) {
    if (S0.smiles) { data.smiles = S0.smiles; data.name = S0.name || ''; }
    if (en) data.name = 'Ethanol';
    try { var set = Settings.load(); if (['Amiri', 'Noto Naskh Arabic', 'Scheherazade New', 'Noto Kufi Arabic', 'Cairo'].indexOf(set.font) >= 0) data.font = set.font; } catch (e) { /* ignore */ }
  }

  var seq = 0, timer = null;
  function redraw(now) { clearTimeout(timer); timer = setTimeout(draw, now ? 0 : 200); }
  function draw() {
    var my = ++seq;
    return produce().then(function (r) {
      if (my !== seq) return;
      var st = $('stage'); st.innerHTML = r.svg;
      var svg = st.querySelector('svg');
      var k = Math.min((st.clientWidth - 40) / r.w, (st.clientHeight - 40) / r.h, 2.2);
      svg.style.width = (r.w * k) + 'px'; svg.style.height = (r.h * k) + 'px';
      $('status').textContent = r.formula ? tr('الصيغة الجزيئية: |Molecular formula: ') + r.formula : '';
      $('sizeInfo').textContent = (r.w / 37.7953).toFixed(1) + ' × ' + (r.h / 37.7953).toFixed(1) + ' ' + tr('سم|cm');
      $('smiles').classList.remove('err');
      $('okBtn').disabled = false;
      Studio.hideLoader();
    }).catch(function (e) {
      if (my !== seq) return;
      $('status').innerHTML = '<span class="err">' + Raster.esc(e.message) + '</span>';
      if (mode !== 'chemfig') $('smiles').classList.add('err');
      $('okBtn').disabled = true;
      Studio.hideLoader();
    });
  }

  function buildLib(q) {
    var box = $('lib'); box.innerHTML = '';
    q = String(q || '').trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه');
    var norm = function (s) { return String(s).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/^ال/, ''); };
    MOLECULES.forEach(function (c) {
      var items = c.items.filter(function (it) { return !q || norm(it[0]).indexOf(q.replace(/^ال/, '')) >= 0 || norm(it[0]).replace(/ال/g, '').indexOf(q) >= 0 || it[1].toLowerCase().indexOf(q) >= 0 || it[2].toLowerCase() === q; });
      if (!items.length) return;
      box.insertAdjacentHTML('beforeend', '<div class="cat">' + Raster.esc(tr(c.cat)) + '</div>');
      items.forEach(function (it) {
        var b = document.createElement('button'); b.type = 'button';
        b.setAttribute('aria-pressed', String(it[2] === data.smiles));
        b.innerHTML = '<span>' + Raster.esc(en ? it[1] : it[0]) + '</span><span class="en">' + Raster.esc(en ? '' : it[1]) + '</span>';
        b.onclick = function () {
          data.smiles = it[2]; data.name = en ? it[1] : it[0];
          $('smiles').value = data.smiles; $('name').value = data.name;
          Array.prototype.forEach.call(box.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', 'false'); });
          b.setAttribute('aria-pressed', 'true');
          redraw(true);
        };
        box.appendChild(b);
      });
    });
    if (!box.children.length) box.innerHTML = '<div class="hint" style="padding:8px">' + tr('لا توجد نتائج — يمكنك كتابة صيغة SMILES مباشرة.|No results — type a SMILES string.') + '</div>';
  }
  $('search').oninput = function () { buildLib(this.value); };
  $('smiles').oninput = function () { data.smiles = this.value; redraw(); };
  $('name').oninput = function () { data.name = this.value; redraw(); };
  [['showName', 'showName'], ['showFormula', 'showFormula'], ['terminal', 'terminalCarbons'], ['explicitH', 'explicitHydrogens']].forEach(function (p) {
    $(p[0]).checked = data[p[1]] !== false && !!data[p[1]];
    $(p[0]).onchange = function () { data[p[1]] = this.checked; redraw(true); };
  });
  $('explicitH').checked = data.explicitHydrogens !== false;
  $('scale').value = data.scale; $('scale').oninput = function () { data.scale = +this.value; redraw(); };
  $('bt').value = data.bondThickness; $('bt').oninput = function () { data.bondThickness = +this.value; redraw(); };
  $('font').value = data.font; $('font').onchange = function () { data.font = this.value; redraw(true); };
  function seg() {
    Array.prototype.forEach.call($('themeSeg').querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === data.theme));
      b.onclick = function () { data.theme = b.getAttribute('data-v'); seg(); redraw(true); };
    });
  }

  // chemfig mode
  var mode = S0.data && S0.data.code && /\\chemfig/.test(S0.data.code) ? 'chemfig' : (S0.tab === 'chemfig' ? 'chemfig' : 'smiles');
  var cf = { code: '\\chemfig{CH_3-CH_2-OH}', name: 'الإيثانول', mono: false };
  if (mode === 'chemfig' && S0.data && S0.data.code) { cf.code = S0.data.code; cf.name = S0.data.name || ''; cf.mono = !!S0.data.mono; }
  function cfData() {
    var c = cf.code.trim(); if (!/^\\chemfig/.test(c)) c = '\\chemfig{' + c + '}';
    return { v: 1, code: c, name: cf.name, theme: cf.mono ? 'mono' : 'color', mono: cf.mono };
  }
  function produce() { return mode === 'chemfig' ? ChemFig.render(cfData()) : StructureRender.render(JSON.parse(JSON.stringify(data))); }
  var CF_EX = [['الإيثانول', 'CH_3-CH_2-OH'], ['حمض الإيثانويك', 'CH_3-C(=[1]O)-[7]OH'], ['البنزين', '*6(=-=-=-)'], ['الفينول', '*6(-=-(-OH)=-=)'],
    ['الإيثين', 'H_2C=CH_2'], ['الإيثاين', 'HC~CH'], ['صيغة مفصّلة للإيثان', 'C(-[2]H)(-[6]H)(-[4]H)-C(-[2]H)(-[6]H)-H'], ['سلسلة متعرجة', '-[1]-[7]-[1]-[7]OH'], ['الأسيتون', 'CH_3-C(=[2]O)-CH_3']];
  function setMode(m) {
    mode = m;
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tab') === m)); });
    Array.prototype.forEach.call(document.querySelectorAll('.st-side > details'), function (d) { d.hidden = m === 'chemfig' ? d.id !== 'cfSec' : d.id === 'cfSec'; });
    if (m === 'chemfig') { $('cfCode').value = cf.code; $('cfName').value = cf.name; $('cfMono').checked = cf.mono; }
    redraw(true);
  }
  document.getElementById('tabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-tab]'); if (b) setMode(b.getAttribute('data-tab')); });
  $('cfCode').oninput = function () { cf.code = this.value; redraw(); };
  $('cfName').oninput = function () { cf.name = this.value; redraw(); };
  $('cfMono').onchange = function () { cf.mono = this.checked; redraw(true); };
  CF_EX.forEach(function (x) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = x[0];
    b.onclick = function () { cf.code = '\\chemfig{' + x[1] + '}'; cf.name = x[0].indexOf('سلسلة') === 0 || x[0].indexOf('صيغة') === 0 ? '' : x[0]; $('cfCode').value = cf.code; $('cfName').value = cf.name; redraw(true); };
    $('cfEx').appendChild(b);
  });
  $('exportBtn').onclick = function () { Studio.popAt($('exportPop'), this); };
  $('exportPop').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-exp]'); if (!b) return;
    $('exportPop').hidden = true;
    Studio.exportAs(b.getAttribute('data-exp'), produce, 'structure');
  });
  $('okBtn').onclick = function () {
    $('okBtn').disabled = true;
    (mode === 'chemfig' ? Studio.finish('chemfig', cfData(), produce, 'chemfig') : Studio.finish('structure', JSON.parse(JSON.stringify(data)), produce, 'structure')).catch(function (e) { Studio.toast(e.message, true); })
      .then(function () { $('okBtn').disabled = false; });
  };
  $('cancelBtn').onclick = Studio.cancel;
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('okBtn').click(); }
    if (e.key === 'Escape') Studio.cancel();
  });
  if (S0.editId) $('okBtn').setAttribute('data-t', 'تحديث الصيغة|Update structure');
  window.addEventListener('resize', function () { redraw(true); });

  Studio.applyT();
  $('smiles').value = data.smiles; $('name').value = data.name || '';
  buildLib(''); seg();
  if (mode === 'chemfig') setMode('chemfig'); else draw();
  setTimeout(Studio.hideLoader, 5000);
  window.__struct = { data: data, produce: produce };
})();
