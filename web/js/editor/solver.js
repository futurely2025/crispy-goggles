/*
 * Step-by-step solver (math) and chemical balancer (chem) — side sheet inside the editor.
 * Loads nerdamer + ArabicCAS lazily the first time it is opened.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var E = null;                      // editor hooks (window.__editor)
  var L = {
    ar: {
      solve: 'حل خطوة بخطوة', balance: 'موازنة المعادلة', problem: 'المسألة', op: 'العملية', variable: 'المتغير',
      to: 'يؤول إلى', from: 'من', upto: 'إلى', run: 'احسب', insertSteps: 'إدراج الحل كاملاً', insertResult: 'إدراج الناتج فقط',
      toLatex: 'تحرير الحل في LaTeX', graph: 'ارسم الدالة', copy: 'نسخ', loading: 'جارٍ تحميل محرك الحل…', empty: 'اكتب معادلة أو مقداراً في المحرر أولاً.',
      pick: 'المعادلة', parseErr: 'تعذّر فهم المعادلة', stepsTitle: 'خطوات الحل', noSteps: 'اختر العملية ثم اضغط «احسب».',
      applyBal: 'تطبيق الموازنة في المحرر', check: 'التحقق من عدد الذرات', element: 'العنصر', reactants: 'المتفاعلات', products: 'النواتج',
      insertBal: 'إدراج المعادلة الموزونة', molar: 'الكتلة المولية', molarPh: 'اكتب صيغة، مثل C6H12O6', balanced: 'المعادلة موزونة ✓', title: 'عنوان الحل',
      ops: { auto: 'تلقائي', simplify: 'تبسيط', solve: 'حل معادلة', derive: 'اشتقاق', integrate: 'تكامل', limit: 'نهاية',
        factor: 'تحليل', expand: 'فك الأقواس', evaluate: 'قيمة عددية' }
    },
    en: {
      solve: 'Step-by-step', balance: 'Balance equation', problem: 'Problem', op: 'Operation', variable: 'Variable',
      to: 'approaches', from: 'from', upto: 'to', run: 'Compute', insertSteps: 'Insert full solution', insertResult: 'Insert result only',
      toLatex: 'Edit solution in LaTeX', graph: 'Plot the function', copy: 'Copy', loading: 'Loading the solver…', empty: 'Type an equation or expression first.',
      pick: 'Equation', parseErr: 'Could not read the equation', stepsTitle: 'Steps', noSteps: 'Pick an operation and press “Compute”.',
      applyBal: 'Apply in editor', check: 'Atom check', element: 'Element', reactants: 'Reactants', products: 'Products',
      insertBal: 'Insert balanced', molar: 'Molar mass', molarPh: 'Formula, e.g. C6H12O6', balanced: 'Balanced ✓', title: 'Title',
      ops: { auto: 'Auto', simplify: 'Simplify', solve: 'Solve', derive: 'Derivative', integrate: 'Integral', limit: 'Limit',
        factor: 'Factor', expand: 'Expand', evaluate: 'Numeric value' }
    }
  };
  function t(k) { var l = (window.I18N && I18N.lang === 'en') ? 'en' : 'ar'; return L[l][k]; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var loaded = null;
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function ensureCAS() {
    if (window.ArabicCAS) return Promise.resolve();
    if (!loaded) loaded = loadScript('vendor/nerdamer/all.min.js?v=1.1.13').then(function () { return loadScript('js/math/cas.js?v=5.0.0'); });
    return loaded;
  }

  var state = { op: 'auto', v: 'س', to: '0', lo: '', hi: '', steps: null, pick: 0, bal: null };

  function sheet() { return $('solverSheet'); }
  function open() {
    E = window.__editor;
    if (!E) return;
    var chem = E.st.mode === 'chem';
    sheet().hidden = false;
    sheet().classList.toggle('chem', chem);
    document.body.classList.add('sheet-open');
    $('shTitle').textContent = chem ? '⚖ ' + t('balance') : '⚡ ' + t('solve');
    if (chem) return buildChem();
    buildMath();
  }
  function close() {
    sheet().hidden = true;
    document.body.classList.remove('sheet-open');
  }

  // ------------------------------------------------------------ math
  function sources() {
    return E.onlyMath(E.currentEquations()).filter(function (e) { return e.mode !== 'chem'; });
  }
  function renderInto(el, tex, size) {
    var o = Object.assign({}, E.opts(), { display: true, fontSize: size || 15, mode: 'math' });
    return RenderHost.preview(tex, o).then(function (r) {
      if (r.errors && r.errors.length) { el.textContent = tex; el.classList.add('raw'); return; }
      el.innerHTML = r.svgString;
      var svg = el.firstChild;
      if (svg && svg.setAttribute) {
        svg.setAttribute('width', (r.width * (size || 15) / 14).toFixed(3) + 'em');
        svg.setAttribute('height', (r.total * (size || 15) / 14).toFixed(3) + 'em');
        svg.style.verticalAlign = (-r.depth * (size || 15) / 14).toFixed(3) + 'em';
      }
      return { w: r.width, rel: r.rel, svg: svg, k: (size || 15) / 14 };
    }).catch(function () { el.textContent = tex; });
  }
  function buildMath() {
    var body = $('shBody');
    var src = sources();
    body.innerHTML = '';
    if (!src.length) { body.innerHTML = '<p class="sh-empty">' + t('empty') + '</p>'; $('shFoot').hidden = true; return; }
    if (state.pick >= src.length) state.pick = 0;

    var sec = document.createElement('div'); sec.className = 'sh-sec';
    sec.innerHTML = '<div class="sh-lbl">' + t('problem') + '</div>';
    if (src.length > 1) {
      var sel = document.createElement('select'); sel.className = 'fsel sh-pick';
      src.forEach(function (e, i) { var o = document.createElement('option'); o.value = i; o.textContent = (i + 1) + ') ' + e.tex.slice(0, 40); sel.appendChild(o); });
      sel.value = state.pick;
      sel.onchange = function () { state.pick = +this.value; state.steps = null; buildMath(); };
      sec.appendChild(sel);
    }
    var pv = document.createElement('div'); pv.className = 'sh-src'; pv.dir = 'ltr';
    sec.appendChild(pv);
    body.appendChild(sec);
    renderInto(pv, src[state.pick].tex, 16);

    var ops = document.createElement('div'); ops.className = 'sh-ops';
    Object.keys(L.ar.ops).forEach(function (k) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t('ops')[k];
      b.setAttribute('aria-pressed', String(state.op === k));
      b.onclick = function () { state.op = k; state.steps = null; buildMath(); };
      ops.appendChild(b);
    });
    body.appendChild(ops);

    var par = document.createElement('div'); par.className = 'sh-params';
    var needV = /solve|derive|integrate|limit/.test(state.op);
    if (needV) par.appendChild(field(t('variable'), 'v', 3));
    if (state.op === 'limit') par.appendChild(field(t('to'), 'to', 6));
    if (state.op === 'integrate') { par.appendChild(field(t('from'), 'lo', 5)); par.appendChild(field(t('upto'), 'hi', 5)); }
    var run = document.createElement('button'); run.type = 'button'; run.className = 'btn primary sm'; run.id = 'shRun'; run.textContent = t('run');
    run.onclick = compute;
    par.appendChild(run);
    body.appendChild(par);

    var list = document.createElement('ol'); list.className = 'steps'; list.id = 'shSteps';
    body.appendChild(list);
    $('shFoot').hidden = true;
    if (state.steps) showSteps(); else compute();
  }
  function field(label, key, size) {
    var w = document.createElement('label'); w.className = 'sh-f';
    w.innerHTML = '<span>' + label + '</span>';
    var i = document.createElement('input'); i.type = 'text'; i.size = size; i.value = state[key]; i.dir = 'auto';
    i.oninput = function () { state[key] = this.value; };
    i.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); compute(); } };
    w.appendChild(i);
    return w;
  }
  function compute() {
    var list = $('shSteps'); if (!list) return;
    list.innerHTML = '<li class="info">' + t('loading') + '</li>';
    ensureCAS().then(function () {
      var src = sources()[state.pick];
      var res;
      try {
        res = ArabicCAS.steps(state.op, src.tex, { v: state.v, to: state.to, lower: state.lo, upper: state.hi });
      } catch (e) {
        var m = String(e && e.message || e);
        if (!/[؀-ۿ]/.test(m)) m = t('parseErr') + ' (' + m + ')';
        list.innerHTML = '<li class="bad">' + esc(m) + '</li>';
        $('shFoot').hidden = true;
        state.steps = null;
        return;
      }
      state.steps = res.steps;
      state.solvedOp = res.op;
      showSteps();
    }, function (e) { list.innerHTML = '<li class="bad">' + esc(e.message) + '</li>'; });
  }
  function showSteps() {
    var list = $('shSteps'); list.innerHTML = '';
    var n = 0, jobs = [];
    state.steps.forEach(function (s) {
      var li = document.createElement('li');
      var bullet = /^•/.test(s.t);
      if (!bullet) n++;
      li.className = bullet ? 'sub' : '';
      li.innerHTML = '<span class="n">' + (bullet ? '' : n) + '</span><div class="c"><div class="tx"></div><div class="mx" dir="ltr"></div></div>';
      li.querySelector('.tx').textContent = s.t.replace(/^•\s*/, '');
      if (s.tex) jobs.push(renderInto(li.querySelector('.mx'), s.tex, 15)); else li.querySelector('.mx').remove();
      list.appendChild(li);
    });
    $('shFoot').hidden = false;
    // steps lined up on '=' like in the final document (when «محاذاة =» is on)
    Promise.all(jobs).then(function (rs) {
      if (!E.st.alignEq || !window.EqAlign) return;
      var ok = rs.filter(function (x) { return x && x.svg; });
      EqAlign.pads(ok.map(function (x) { return { w: x.w, rel: x.rel }; }), 26).forEach(function (p, i) {
        if (!p) return;
        ok[i].svg.style.marginLeft = (p.padL * ok[i].k).toFixed(3) + 'em';
        ok[i].svg.style.marginRight = (p.padR * ok[i].k).toFixed(3) + 'em';
      });
    });
  }
  function stepsAsItems(resultOnly) {
    var items = [], line = 0, s = state.steps;
    if (resultOnly) {
      for (var i = s.length - 1; i >= 0; i--) if (s[i].tex) { items.push({ tex: s[i].tex, line: 0 }); break; }
      return items;
    }
    s.forEach(function (x) {
      items.push({ kind: 'text', text: x.t, line: line++ });
      if (x.tex) items.push({ tex: x.tex, line: line++ });
    });
    return items;
  }
  function stepsAsLatex() {
    return state.steps.map(function (x) { return '% ' + x.t + (x.tex ? '\n' + x.tex : ''); }).join('\n');
  }

  // ------------------------------------------------------------ chemistry
  function buildChem() {
    var body = $('shBody');
    body.innerHTML = '';
    var lines = E.onlyMath(E.currentEquations());
    var reactions = lines.filter(function (e) { return /->|<=>|<->|→|⟶|⇌|=/.test(e.tex); });
    state.bal = [];
    if (!reactions.length) body.innerHTML = '<p class="sh-empty">' + t('empty') + '</p>';
    reactions.forEach(function (r) {
      var box = document.createElement('div'); box.className = 'sh-sec bal';
      var res;
      try { res = ChemBalance.balance(r.tex); } catch (e) {
        box.innerHTML = '<div class="sh-src raw" dir="ltr">' + esc(r.tex) + '</div><p class="bad">' + esc(e.message) + '</p>';
        body.appendChild(box); return;
      }
      state.bal.push({ from: r.tex, to: res.text });
      var already = ChemBalance.isBalanced(r.tex);
      box.innerHTML = '<div class="sh-src" dir="ltr"></div>' + (already ? '<p class="ok">' + t('balanced') + '</p>' : '') +
        '<table class="atoms"><tr><th>' + t('element') + '</th><th>' + t('reactants') + '</th><th>' + t('products') + '</th><th></th></tr>' +
        res.check.map(function (c) { return '<tr><td dir="ltr">' + c.el + '</td><td>' + c.left + '</td><td>' + c.right + '</td><td>' + (c.left === c.right ? '✓' : '✗') + '</td></tr>'; }).join('') + '</table>';
      body.appendChild(box);
      var o = Object.assign({}, E.opts(), { mode: 'chem', fontSize: 16, display: true });
      RenderHost.preview(res.text, o).then(function (x) { box.querySelector('.sh-src').innerHTML = x.svgString; }).catch(function () {});
    });
    // molar mass calculator
    var mm = document.createElement('div'); mm.className = 'sh-sec';
    mm.innerHTML = '<div class="sh-lbl">' + t('molar') + '</div><div class="sh-params"><label class="sh-f"><input type="text" id="mmIn" dir="ltr" size="16" placeholder="' + t('molarPh') + '"></label></div><div id="mmOut" class="mm-out"></div>';
    body.appendChild(mm);
    var inp = mm.querySelector('#mmIn');
    inp.oninput = function () {
      var out = $('mmOut'), v = this.value.trim();
      if (!v) { out.innerHTML = ''; return; }
      try {
        var r = ChemBalance.molarMass(v);
        out.innerHTML = '<b dir="ltr">M(' + esc(v) + ') = ' + r.mass + ' g/mol</b><div class="mm-parts" dir="ltr">' +
          r.parts.map(function (p) { return p.el + ': ' + p.n + ' × ' + p.mass; }).join(' &nbsp;+&nbsp; ') + '</div>';
      } catch (e) { out.innerHTML = '<span class="bad">' + esc(e.message) + '</span>'; }
    };
    var first = reactions[0] && reactions[0].tex.split(/->|<=>|=/)[0].split(/\s\+\s/)[0];
    if (first) { inp.value = first.replace(/^\d+/, '').replace(/\((s|l|g|aq)\)/, '').trim(); inp.oninput(); }
    $('shFoot').hidden = !state.bal.length;
  }
  function applyBalance() {
    var ta = $('chemInp'), v = ta.value;
    state.bal.forEach(function (b) { v = v.replace(b.from, b.to); });
    ta.value = v;
    E.schedulePreview();
    buildChem();
  }

  // ------------------------------------------------------------ footer actions
  function onFoot(e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var a = b.getAttribute('data-act');
    var chem = E.st.mode === 'chem';
    if (chem) {
      if (a === 'apply') applyBalance();
      if (a === 'insert') { applyBalance(); close(); E.ok(); }
      return;
    }
    if (a === 'graph') return openGraph();
    if (!state.steps) return;
    if (a === 'insert') { E.insertItems(stepsAsItems(false)); close(); }
    else if (a === 'result') { E.insertItems(stepsAsItems(true), { layout: 'stack' }); close(); }
    else if (a === 'latex') { E.setLatexSource(stepsAsLatex()); close(); }
    else if (a === 'copy') { E.copyText(stepsAsLatex()); }
  }
  function openGraph() {
    var src = sources()[state.pick]; if (!src) return;
    var tex = src.tex.replace(/\\begin\{cases\}[\s\S]*$/, '').trim();
    var fns = [];
    var m = tex.match(/^\s*(?:ص|y|د\s*\(\s*س\s*\)|f\s*\(\s*x\s*\))\s*=\s*([\s\S]+)$/);
    if (m) fns.push(m[1]);
    else if (/=/.test(tex)) {                            // both sides: the solutions are the intersections
      var sides = tex.split('='), l = sides[0].trim(), r = sides.slice(1).join('=').trim();
      if (/^0$/.test(r)) fns.push(l); else if (/^0$/.test(l)) fns.push(r); else fns.push(l, r);
    }
    else fns.push(tex);
    var ar = E.st.rtl !== false;
    var data = { fns: fns.filter(Boolean).map(function (f, i) {
      return { expr: f, color: ['#0e9f9a', '#c2352b'][i % 2], width: 2.2, dash: 'solid', name: i ? (ar ? 'ص' : 'y') : (ar ? 'ص' : 'y'), label: true, visible: true };
    }), notation: ar ? 'ar' : 'en', digits: E.st.digits === 'eastern' ? 'eastern' : 'western', inter: true, roots: fns.length === 1 };
    var payload = { host: E.host, lang: (window.I18N && I18N.lang) || 'ar', data: Object.assign(GraphDefaults(), data) };
    location.href = 'graph.html?host=' + encodeURIComponent(E.host) + '&v=5.0.0#d=' + encodeURIComponent(JSON.stringify(payload));
  }
  function GraphDefaults() {
    return { v: 1, xmin: -6, xmax: 6, ymin: -6, ymax: 8, auto: true, equal: false, w: 560, h: 420, grid: true, minor: true, axes: true, arrows: true, ticks: true,
      axisNames: true, piTicks: false, yint: false, extrema: false, coords: true, area: { on: false, fn: 0, fn2: -1, a: 0, b: 2, color: '#0e9f9a', value: true },
      points: [], font: 'Amiri', mathFont: E.st.mathFont || 'stix2', fontSize: 12, title: '' };
  }
  function footer() {
    var f = $('shFoot'), chem = E && E.st.mode === 'chem';
    f.innerHTML = chem
      ? '<button type="button" class="btn primary" data-act="insert">' + t('insertBal') + '</button>' +
        '<button type="button" class="btn ghost" data-act="apply">' + t('applyBal') + '</button>'
      : '<button type="button" class="btn primary" data-act="insert">' + t('insertSteps') + '</button>' +
        '<button type="button" class="btn ghost" data-act="result">' + t('insertResult') + '</button>' +
        '<button type="button" class="tool" data-act="latex" title="' + t('toLatex') + '">✎ LaTeX</button>' +
        '<button type="button" class="tool" data-act="graph" title="' + t('graph') + '">📈</button>' +
        '<button type="button" class="tool" data-act="copy" title="' + t('copy') + '">⧉</button>';
  }

  function boot() {
    E = window.__editor;
    var btn = $('solveBtn');
    if (!btn || !sheet()) return;
    btn.onclick = function () { if (!sheet().hidden) return close(); footer(); open(); };
    $('shClose').onclick = close;
    $('shFoot').addEventListener('click', onFoot);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet().hidden) { e.stopPropagation(); close(); } }, true);
    var sync = function () {
      var chem = E.st.mode === 'chem';
      btn.querySelector('.ico').textContent = chem ? '⚖' : '⚡';
      btn.querySelector('.lb').textContent = chem ? t('balance') : t('solve');
      if (!sheet().hidden) { footer(); open(); }
    };
    $('modeSeg').addEventListener('click', function () { setTimeout(sync, 0); });
    sync();
    if (E.init && E.init.solve && E.st.mode === 'math') setTimeout(function () { footer(); open(); }, 700);
  }
  if (window.__editor) boot(); else document.addEventListener('armath:editor-ready', boot);
  window.ArabicSolver = { open: function () { footer(); open(); }, close: close, state: state };
})();
