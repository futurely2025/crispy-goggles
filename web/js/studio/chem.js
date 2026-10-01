/* Chemistry studio: interactive periodic table (card / Bohr / Lewis / orbitals / whole table / configuration),
 * lab apparatus (templates + editable code) and stoichiometry calculations with Arabic steps. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var tr = Studio.tr, S0 = Studio.init, E = ChemElements, esc = Raster.esc;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  // ChemBalance knows only the common elements: complete its mass table from the periodic table
  if (window.ChemBalance && ChemBalance.MASS) E.SYM.forEach(function (s, i) { if (!(s in ChemBalance.MASS)) ChemBalance.MASS[s] = E.MASS[i]; });

  // ------------------------------------------------------------ state
  var tab = 'atom';
  var atom = { what: 'element', sym: 'Na', ion: '', short: false, hlSel: true, names: false, ltr: false, hlMore: '' };
  var lab = { v: 1, code: LabRender.TEMPLATES.titration.code };
  if (S0.data && S0.data.what) {
    var d0 = S0.data, o0 = d0.o || {};
    atom.what = d0.what;
    if (d0.what === 'ptable') {
      var hl = String(o0.highlight || '').replace(/[{}]/g, '').split(/[,،\s]+/).filter(Boolean);
      if (hl.length) { try { atom.sym = E.info(hl[0]).sym; } catch (e) { /* ignore */ } atom.hlMore = hl.slice(1).join(', '); } else atom.hlSel = false;
      atom.names = !!o0.names; atom.ltr = !!o0.ltr;
    } else {
      var m = String(d0.q || '').match(/^([A-Z][a-z]?|[^\d+-]+)(\d*[+-])?$/);
      try { atom.sym = E.info(m ? m[1] : d0.q).sym; } catch (e) { /* ignore */ }
      atom.ion = m && m[2] ? m[2].replace(/^1/, '') : '';
      atom.short = !!o0.short;
    }
  } else if (S0.data && S0.data.code) { lab.code = S0.data.code; tab = 'lab'; }
  if (S0.tab && /^(atom|lab|calc)$/.test(S0.tab)) tab = S0.tab;

  // ------------------------------------------------------------ figure data for the atom tab
  function atomData() {
    var o = {};
    if (atom.what === 'ptable') {
      var hl = (atom.hlSel ? [atom.sym] : []).concat(String(atom.hlMore || '').split(/[,،\s]+/).filter(Boolean));
      if (hl.length) o.highlight = hl.join(',');
      if (atom.names) o.names = true;
      if (atom.ltr) o.ltr = true;
      return { v: 1, what: 'ptable', q: '', o: o };
    }
    if (atom.what === 'orbital' && atom.short) o.short = true;
    var q = atom.sym + (atom.what === 'lewis' && atom.ion ? atom.ion : '');
    return { v: 1, what: atom.what, q: q, o: o };
  }
  function configTex() { return '\\econfig' + (atom.short ? '[short]' : '') + '{' + atom.sym + '}'; }

  function produce() {
    if (tab === 'lab') return LabRender.render({ v: 1, code: lab.code });
    return AtomRender.render(atomData());
  }

  // ------------------------------------------------------------ periodic-table picker
  function buildPick() {
    var box = $('pick'), cells = [];
    box.classList.toggle('ltr', atom.ltr);
    for (var z = 1; z <= 118; z++) {
      var p = E.pos(z), row = p[0] <= 7 ? p[0] : p[0] + 1;   // one gap row before the f-block
      cells.push('<button type="button" data-z="' + z + '" style="grid-row:' + row + ';grid-column:' + p[1] + ';background:' + E.CAT_COLOR[E.info(z).cat] + '" title="' + esc(E.AR[z - 1]) + ' — ' + z + '">' +
        '<small>' + z + '</small>' + E.SYM[z - 1] + '</button>');
    }
    box.innerHTML = cells.join('') + '<div class="gap" style="grid-row:8"></div>';
    box.onclick = function (e) {
      var b = e.target.closest('button[data-z]'); if (!b) return;
      atom.sym = E.SYM[+b.getAttribute('data-z') - 1];
      $('search').value = '';
      if (atom.what === 'lewis' && atom.ion && !ionOk()) atom.ion = '';
      sync(); redraw(true);
    };
  }
  function ionOk() { var e = E.info(atom.sym); return e.valence !== null; }
  function markPick() {
    each($('pick').querySelectorAll('button[data-z]'), function (b) { b.setAttribute('aria-pressed', String(E.SYM[+b.getAttribute('data-z') - 1] === atom.sym)); });
  }
  function showInfo() {
    var e = E.info(atom.sym);
    var row = function (k, v, ltr) { return '<b>' + tr(k) + '</b><span' + (ltr ? ' class="ltr"' : '') + '>' + esc(v) + '</span>'; };
    var cfgTxt = E.configTex(e.sym, false).replace(/\\(?:text|mathrm)\{([^}]*)\}/g, '$1').replace(/\\,/g, ' ').replace(/\^\{(\d+)\}/g, function (m0, d) { return d.split('').map(function (c) { return '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]; }).join(''); });
    $('info').innerHTML = row('العنصر|Element', e.ar + ' (' + e.sym + ')') + row('العدد الذري|Atomic number', e.z) + row('الكتلة الذرية|Atomic mass', e.mass) +
      row('التصنيف|Category', e.catAr) + row('الدورة|Period', e.period) + row('المجموعة|Group', e.group || '—') +
      row('توزيع المستويات|Shells', e.shells.join(' ، ')) + (e.valence !== null ? row('إلكترونات التكافؤ|Valence e⁻', e.valence) : '') +
      row('عدد النيوترونات|Neutrons', e.neutrons) + row('التوزيع الإلكتروني|Configuration', cfgTxt, true);
  }

  // ------------------------------------------------------------ drawing
  var seq = 0, timer = null;
  function redraw(now) { clearTimeout(timer); timer = setTimeout(draw, now ? 0 : 250); }
  function fit(host, r, maxK) {
    var svg = host.querySelector('svg'); if (!svg) return;
    var st = $('stage'), W = Math.max(200, host.clientWidth - 10), H = host.classList.contains('wide') && tab === 'atom' ? 1e9 : Math.max(260, st.clientHeight - 30);   // the whole table: fit the width, the stage scrolls
    var k = Math.min(W / r.w, H / r.h, maxK || 1.6);
    svg.style.width = (r.w * k) + 'px'; svg.style.height = (r.h * k) + 'px';
  }
  function draw() {
    var my = ++seq;
    if (tab === 'calc') { Studio.hideLoader(); return Promise.resolve(); }
    if (tab === 'atom' && atom.what === 'config') {
      var o = Studio.eqOpts(); o.rtl = false; o.fontSize = 22;
      return RenderHost.preview(E.configTex(atom.sym, atom.short), o).then(function (r) {
        if (my !== seq) return;
        var e = E.info(atom.sym);
        $('preview').innerHTML = '<div style="text-align:center"><div style="font-weight:700;font-size:16px;margin-bottom:8px">' + esc(tr('التوزيع الإلكتروني لـ|Configuration of') + ' ' + e.ar + ' (' + e.sym + ')') + '</div><div dir="ltr" class="mx">' + r.svgString + '</div></div>';
        var s = $('preview').querySelector('.mx svg'); if (s) { s.setAttribute('width', (r.width * 1.4).toFixed(2) + 'em'); s.setAttribute('height', (r.total * 1.4).toFixed(2) + 'em'); }
        $('status').dir = 'auto'; $('status').textContent = tr('يُدرج كمعادلة قابلة للتعديل: |Inserted as an editable equation: ') + configTex();
        $('sizeInfo').textContent = ''; $('okBtn').disabled = false; Studio.hideLoader();
      }).catch(fail(my));
    }
    return produce().then(function (r) {
      if (my !== seq) return;
      var host = $('preview'); host.classList.toggle('wide', tab === 'lab' || atom.what === 'ptable');
      host.innerHTML = r.svg; fit(host, r, tab === 'lab' ? 1.3 : 1.6);
      $('status').textContent = tab === 'atom' ? AtomRender.serialize(atomData()) : ''; $('status').dir = 'ltr';
      $('sizeInfo').textContent = (r.w / 37.7953).toFixed(1) + ' × ' + (r.h / 37.7953).toFixed(1) + ' ' + tr('سم|cm');
      $('okBtn').disabled = false;
      Studio.hideLoader();
    }).catch(fail(my));
  }
  function fail(my) {
    return function (e) {
      if (my !== seq) return;
      $('status').dir = 'auto'; $('status').innerHTML = '<span class="err">' + esc(e.message) + '</span>';
      $('okBtn').disabled = true; Studio.hideLoader();
    };
  }

  // ------------------------------------------------------------ atom-tab controls
  function sync() {
    each($('reps').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === atom.what)); });
    $('optLewis').hidden = atom.what !== 'lewis';
    $('optShort').hidden = !(atom.what === 'orbital' || atom.what === 'config');
    $('optTable').hidden = atom.what !== 'ptable';
    $('ion').value = atom.ion; $('short').checked = atom.short;
    $('hlSel').checked = atom.hlSel; $('names').checked = atom.names; $('ltr').checked = atom.ltr; $('hlMore').value = atom.hlMore;
    markPick(); showInfo();
  }
  $('reps').onclick = function (e) {
    var b = e.target.closest('button[data-v]'); if (!b) return;
    atom.what = b.getAttribute('data-v'); sync(); redraw(true);
  };
  $('search').oninput = function () {
    var q = this.value.trim(); if (!q) return;
    var z = /^\d+$/.test(q) ? +q : 0, e = null;
    try { e = E.info(z || (q.length <= 2 ? q[0].toUpperCase() + q.slice(1).toLowerCase() : q)); } catch (x) {
      var norm = function (s) { return String(s).replace(/[أإآ]/g, 'ا').replace(/^ال/, ''); }, n = norm(q), i = -1;
      E.AR.some(function (a, k) { if (norm(a).indexOf(n) === 0) { i = k; return true; } return false; });
      if (i >= 0) e = E.info(i + 1);
    }
    if (!e) { this.classList.add('err'); return; }
    this.classList.remove('err'); atom.sym = e.sym; sync(); redraw();
  };
  $('ion').onchange = function () { atom.ion = this.value; redraw(true); };
  $('short').onchange = function () { atom.short = this.checked; redraw(true); };
  $('hlSel').onchange = function () { atom.hlSel = this.checked; redraw(true); };
  $('names').onchange = function () { atom.names = this.checked; redraw(true); };
  $('ltr').onchange = function () { atom.ltr = this.checked; buildPick(); markPick(); redraw(true); };
  $('hlMore').oninput = function () { atom.hlMore = this.value; redraw(); };

  // ------------------------------------------------------------ lab tab
  var panel = Studio.codePanel({ el: $('labCode'), kind: 'lab', get: function () { return lab; }, set: function (d) { lab = { v: 1, code: d.code }; markTpl(); redraw(true); } });
  function markTpl() { each($('tgal').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(LabRender.TEMPLATES[b.getAttribute('data-k')].code === lab.code)); }); }
  $('tgal').innerHTML = Object.keys(LabRender.TEMPLATES).map(function (k) { return '<button type="button" data-k="' + k + '">' + esc(tr(LabRender.TEMPLATES[k].t)) + '</button>'; }).join('');
  $('tgal').onclick = function (e) {
    var b = e.target.closest('button[data-k]'); if (!b) return;
    lab = { v: 1, code: LabRender.TEMPLATES[b.getAttribute('data-k')].code }; markTpl(); panel.refresh(); redraw(true);
  };
  var SNIPS = [
    ['كأس|Beaker', '\\beaker[fill=0.5, label=كأس]{(X,0)}'], ['دورق مخروطي|Conical flask', '\\flask[fill=0.35, color=pink]{(X,0)}'],
    ['دورق كروي|Round flask', '\\roundflask[fill=0.5]{(X,2.2)}'], ['أنبوب اختبار|Test tube', '\\testtube[fill=0.4, color=blue]{(X,0)}'],
    ['مخبار مدرج|Cylinder', '\\cylinder[fill=0.6]{(X,0)}'], ['سحاحة|Burette', '\\burette[fill=0.7, drops]{(X,3.6)}'],
    ['ماصة|Pipette', '\\pipette{(X,0.2)}'], ['قطارة|Dropper', '\\dropper{(X,3.6)}'], ['قمع|Funnel', '\\funnel[paper]{(X,2.5)}'],
    ['موقد بنزن|Burner', '\\burner[flame]{(X,0)}'], ['حامل ثلاثي|Tripod', '\\tripod[gauze, h=3.3]{(X,0)}'], ['حامل وماسك|Stand', '\\stand[h=7, clamp=5]{(X,0)}'],
    ['ترمومتر|Thermometer', '\\thermometer[level=0.6, h=4]{(X,1)}'], ['مكثّف|Condenser', '\\condenser[angle=-20, length=4]{(X,4)}'],
    ['أنبوب توصيل|Tube', '\\tube{(X,3) (X+1,4) (X+3,4)}'], ['تسمية|Label', '\\label[to=(X,1)]{(X+2,3)}{نص}']
  ];
  $('snips').innerHTML = SNIPS.map(function (s, i) { return '<button type="button" class="chip" data-i="' + i + '">' + esc(tr(s[0])) + '</button>'; }).join('');
  $('snips').onclick = function (e) {
    var b = e.target.closest('button[data-i]'); if (!b) return;
    // place the new piece to the left of what is already drawn (x = max existing x + 2.5)
    var xs = [], re = /\{\(\s*(-?[\d.]+)\s*,/g, m; while ((m = re.exec(lab.code))) xs.push(+m[1]);
    var X = xs.length ? Math.max.apply(null, xs) + 2.5 : 0;
    var line = SNIPS[+b.getAttribute('data-i')][1].replace(/X\+(\d+(?:\.\d+)?)/g, function (a, n) { return String(+(X + +n).toFixed(2)); }).replace(/\bX\b/g, String(+X.toFixed(2)));
    var code = lab.code;
    lab = { v: 1, code: /\\end\s*\{lab\}/.test(code) ? code.replace(/\s*\\end\s*\{lab\}\s*$/, '\n  ' + line + '\n\\end{lab}') : '\\begin{lab}\n  ' + line + '\n\\end{lab}' };
    markTpl(); panel.refresh(); redraw(true);
  };

  // ------------------------------------------------------------ calc tab
  var steps = [];
  $('ctype').innerHTML = Object.keys(ChemCalc.TYPES).map(function (k) { return '<option value="' + k + '">' + esc(tr(ChemCalc.TYPES[k].t)) + '</option>'; }).join('');
  function fields() {
    var T = ChemCalc.TYPES[$('ctype').value];
    $('cfields').innerHTML = T.f.map(function (f, i) {
      return '<label class="fld"><span>' + esc(tr(f[0])) + '</span><input class="inp" data-i="' + i + '" dir="ltr" value="' + esc(f[1]) + '"></label>';
    }).join('');
    $('calcTitle').textContent = tr(T.t); $('calcOut').innerHTML = ''; steps = [];
  }
  $('ctype').onchange = fields;
  $('cfields').addEventListener('keydown', function (e) { if (e.key === 'Enter') solve(); });
  function solve() {
    var T = ChemCalc.TYPES[$('ctype').value], args = [];
    each($('cfields').querySelectorAll('input'), function (x) { args.push(x.value.trim()); });
    var out = $('calcOut'); out.innerHTML = '';
    try { steps = T.run(args); } catch (e) { steps = []; out.innerHTML = '<li style="color:var(--danger)">' + esc(e.message) + '</li>'; return false; }
    var o = Studio.eqOpts(); o.fontSize = 15;
    steps.forEach(function (s) {
      var li = document.createElement('li');
      li.innerHTML = '<div class="tx"></div>' + (s.tex ? '<div class="mx" dir="ltr"></div>' : '');
      li.querySelector('.tx').textContent = s.t; out.appendChild(li);
      if (s.tex) RenderHost.preview(s.tex, o).then(function (r) {
        var mx = li.querySelector('.mx'); if (r.errors && r.errors.length) { mx.textContent = s.tex; return; }
        mx.innerHTML = r.svgString; var svg = mx.firstChild; svg.setAttribute('width', (r.width * 1.1).toFixed(2) + 'em'); svg.setAttribute('height', (r.total * 1.1).toFixed(2) + 'em');
      });
    });
    return true;
  }
  $('cGo').onclick = solve;

  // ------------------------------------------------------------ tabs
  function setTab(t) {
    tab = t;
    each($('tabs').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tab') === t)); });
    each(document.querySelectorAll('.st-side [data-for]'), function (s) { s.hidden = s.getAttribute('data-for') !== t; });
    $('pick').hidden = t !== 'atom'; $('preview').hidden = t === 'calc'; $('calcView').hidden = t !== 'calc';
    $('exportBtn').hidden = t === 'calc';
    $('okBtn').textContent = tr(t === 'calc' ? 'إدراج الحل بالخطوات|Insert solution' : t === 'lab' ? 'إدراج الرسم|Insert drawing' : 'إدراج|Insert');
    $('okBtn').disabled = false; $('status').textContent = ''; $('sizeInfo').textContent = '';
    if (t === 'lab') panel.refresh();
    if (t === 'calc' && !$('cfields').children.length) fields();
    redraw(true);
  }
  $('tabs').onclick = function (e) { var b = e.target.closest('button[data-tab]'); if (b) setTab(b.getAttribute('data-tab')); };

  // ------------------------------------------------------------ insert / export
  $('okBtn').onclick = function () {
    if (tab === 'calc') {
      if (!steps.length && !solve()) return;
      var items = [];
      steps.forEach(function (s) { items.push({ kind: 'text', text: s.t }); if (s.tex) items.push({ tex: s.tex }); });
      return Studio.insertItems(items);
    }
    if (tab === 'atom' && atom.what === 'config') {
      var e = E.info(atom.sym);
      return Studio.insertItems([{ kind: 'text', text: tr('التوزيع الإلكتروني لـ|Electron configuration of') + ' ' + e.ar + ' (' + e.sym + '):' }, { tex: configTex() }]);
    }
    var kind = tab === 'lab' ? 'lab' : 'atom', data = tab === 'lab' ? { v: 1, code: lab.code } : atomData();
    Studio.finish(kind, data, produce, kind).catch(function (err) { Studio.toast(err.message, true); });
  };
  $('cancelBtn').onclick = Studio.cancel;
  $('exportBtn').onclick = function () { Studio.popAt($('exportPop'), this); };
  $('exportPop').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-exp]'); if (!b) return;
    $('exportPop').hidden = true;
    Studio.exportAs(b.getAttribute('data-exp'), produce, tab === 'lab' ? 'lab' : atom.what + '-' + atom.sym);
  });
  window.addEventListener('resize', function () { redraw(); });

  Studio.applyT();
  buildPick(); sync(); setTab(tab);
  window.__chem = { atom: atom, get lab() { return lab; }, get steps() { return steps; }, get tab() { return tab; }, atomData: atomData, configTex: configTex, sync: sync, buildPick: buildPick, redraw: redraw, setTab: setTab, draw: draw, solve: solve };
})();
