/* Math tables & diagrams studio: variation/sign tables (automatic from a function), number lines, Venn diagrams, probability trees */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var tr = Studio.tr, S0 = Studio.init;
  var type = S0.type || 'vartable', code = '', panel = null;
  if (S0.data && S0.data.code) {
    code = S0.data.code;
    var em = code.match(/\\begin\s*\{(vartable|signtable|numberline|venn|tree)\}/);
    type = em ? em[1] : (/\\tkzTab/.test(code) ? 'vartable' : type);
  }
  var DEF = {
    vartable: '\\begin{vartable}\n  \\auto{س^3 - 3س}\n\\end{vartable}',
    signtable: '\\begin{signtable}\n  \\x{-\\infty, -2, 3, +\\infty}\n  \\sign[name=س + 2]{-, 0, +, |, +}\n  \\sign[name=س - 3]{-, |, -, 0, +}\n  \\sign[name=(س+2)(س-3)]{+, 0, -, 0, +}\n\\end{signtable}',
    numberline: '\\begin{numberline}\n  \\solution{-2 < س \\le 3}\n\\end{numberline}',
    venn: '\\begin{venn}[sets={أ,ب}, universe=ش, shade={أ∩ب}]\n  \\region[أ]{1, 2, 3}\n  \\region[أ∩ب]{4, 5}\n  \\region[ب]{6, 7}\n  \\region[out]{8, 9}\n\\end{venn}',
    tree: '\\begin{tree}[products]\n- أحمر [\\frac{3}{5}]\n  - أحمر [\\frac{2}{4}]\n  - أزرق [\\frac{2}{4}]\n- أزرق [\\frac{2}{5}]\n  - أحمر [\\frac{3}{4}]\n  - أزرق [\\frac{1}{4}]\n\\end{tree}'
  };
  if (!code) code = DEF[type];
  function kind() { return /vartable|signtable/.test(type) ? 'vartable' : 'diagram'; }
  function data() { return kind() === 'vartable' ? { v: 1, code: code } : { v: 1, env: type, code: code }; }
  function produce() { return kind() === 'vartable' ? VarTable.render(data()) : DiagramRender.render(data()); }

  var seq = 0, timer = null;
  function redraw(now) { clearTimeout(timer); timer = setTimeout(draw, now ? 0 : 220); }
  function draw() {
    var my = ++seq;
    return produce().then(function (r) {
      if (my !== seq) return;
      var st = $('stage'); st.innerHTML = r.svg;
      var svg = st.querySelector('svg'), k = Math.min((st.clientWidth - 30) / r.w, (st.clientHeight - 30) / r.h, 2);
      if (k > 0) { svg.style.width = (r.w * k) + 'px'; svg.style.height = (r.h * k) + 'px'; }
      $('status').textContent = '';
      $('sizeInfo').textContent = (r.w / 37.7953).toFixed(1) + ' × ' + (r.h / 37.7953).toFixed(1) + ' ' + tr('سم|cm');
      $('okBtn').disabled = false; Studio.hideLoader();
    }).catch(function (e) {
      if (my !== seq) return;
      $('status').innerHTML = '<span class="err">' + Raster.esc(e.message) + '</span>'; $('okBtn').disabled = true; Studio.hideLoader();
    });
  }
  function setCode(c) { code = c; if (panel) panel.refresh(); redraw(); }

  // ------------------------------------------------------------ quick forms
  function buildForm() {
    var f = $('form'); f.innerHTML = '';
    if (type === 'vartable' || type === 'signtable') {
      f.innerHTML = '<label><span>' + tr('الدالة د(س) =|Function f(x) =') + '</span><input class="inp" id="fx" dir="auto" style="font-family:Amiri,serif;font-size:16px"></label>' +
        '<div class="row"><button type="button" class="btn primary sm" id="mk">' + tr('إنشاء الجدول تلقائياً|Build automatically') + '</button></div>' +
        '<p class="hint">' + tr('تُحسب المشتقة ونقاطها الحرجة والنقاط غير المعرّفة والنهايات تلقائياً. يمكنك بعدها تعديل الكود، أو كتابة الجدول يدوياً بـ \\x و\\sign و\\var.|Derivative, critical points, undefined points and limits are computed for you.') + '</p>';
      var m = code.match(/\\auto\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/);
      $('fx').value = m ? m[1] : 'س^3 - 3س';
      var build = function () {
        try {
          var c = VarTable.autoCode($('fx').value);
          if (type === 'signtable') c = c.replace(/\n\s*\\var\[[^\n]*/, '').replace(/vartable/g, 'signtable');
          setCode(c);
        } catch (e) { Studio.toast(e.message, true); }
      };
      $('mk').onclick = build;
      $('fx').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); build(); } };
    } else if (type === 'numberline') {
      f.innerHTML = '<label><span>' + tr('متباينة أو فترة في كل سطر|One inequality or interval per line') + '</span><textarea class="inp" id="nl" dir="auto"></textarea></label>' +
        '<div class="grid2"><label><span>' + tr('من|Min') + '</span><input class="inp num" id="nmin"></label><label><span>' + tr('إلى|Max') + '</span><input class="inp num" id="nmax"></label></div>' +
        '<p class="hint">' + tr('أمثلة: س > 2 — ‎-1 ≤ س < 4 — [‎-2, 3) — (‎-∞, 1]|Examples: x > 2, -1 <= x < 4, [-2, 3)') + '</p>';
      var lines = []; code.replace(/\\(solution|interval)\{([^}]*)\}/g, function (m0, k, v) { lines.push(v); });
      $('nl').value = lines.join('\n');
      var upd = function () {
        var L = $('nl').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        var o = []; if ($('nmin').value) o.push('min=' + $('nmin').value); if ($('nmax').value) o.push('max=' + $('nmax').value);
        setCode('\\begin{numberline}' + (o.length ? '[' + o.join(', ') + ']' : '') + '\n' + L.map(function (x, i) {
          var col = i ? ', color=' + ['red', 'blue', 'orange', 'purple'][(i - 1) % 4] : '';
          return /^[\[(]/.test(x) ? '  \\interval' + (col ? '[' + col.slice(2) + ']' : '') + '{' + x + '}' : '  \\solution' + (col ? '[' + col.slice(2) + ']' : '') + '{' + x.replace(/≤|<=/g, '\\le ').replace(/≥|>=/g, '\\ge ') + '}';
        }).join('\n') + '\n\\end{numberline}');
      };
      ['nl', 'nmin', 'nmax'].forEach(function (id) { $(id).oninput = upd; });
    } else if (type === 'venn') {
      f.innerHTML = '<label><span>' + tr('أسماء المجموعات (2 أو 3)|Set names (2 or 3)') + '</span><input class="inp" id="vs" dir="auto" value="أ, ب"></label>' +
        '<label><span>' + tr('المنطقة المظللة (∩ ∪ − \')|Shaded region') + '</span><input class="inp" id="vsh" dir="auto" value="أ∩ب"></label>' +
        '<div class="chips" id="vops"></div><div id="vreg"></div>';
      ['∩', '∪', '−', '\'', '(', ')'].forEach(function (op) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = op;
        b.onclick = function () { var i = $('vsh'); i.value += op; upd(); i.focus(); };
        $('vops').appendChild(b);
      });
      var regs = function () {
        var names = $('vs').value.split(/[,،]/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 3);
        var R = names.length === 3 ? [[names[0], 'فقط'], [names[1], 'فقط'], [names[2], 'فقط'], [names[0] + '∩' + names[1] + '−' + names[2]], [names[0] + '∩' + names[2] + '−' + names[1]], [names[1] + '∩' + names[2] + '−' + names[0]], [names.join('∩')], ['out']]
          : [[names[0], 'فقط'], [names[0] + '∩' + names[1]], [names[1], 'فقط'], ['out']];
        var box = $('vreg'); box.innerHTML = '<div class="lbl" style="margin-top:8px">' + tr('العناصر في كل منطقة|Elements per region') + '</div>';
        R.forEach(function (r) {
          var l = document.createElement('label');
          l.innerHTML = '<span>' + (r[0] === 'out' ? tr('خارج المجموعات|Outside') : r[0] + (r[1] ? ' ' + tr('فقط|only') : '')) + '</span><input class="inp" dir="auto" data-r="' + r[0] + '">';
          box.appendChild(l);
        });
        var have = {}; code.replace(/\\region\[([^\]]*)\]\{([^}]*)\}/g, function (m0, k, v) { have[k.replace(/\s+/g, '')] = v; });
        Array.prototype.forEach.call(box.querySelectorAll('input'), function (i) { var k = i.getAttribute('data-r').replace(/\s+/g, ''); if (have[k] !== undefined) i.value = have[k]; i.oninput = upd; });
      };
      var sm = code.match(/sets=\{([^}]*)\}/), shm = code.match(/shade=\{([^}]*)\}/);
      if (sm) $('vs').value = sm[1].split(',').join(', ');
      if (shm) $('vsh').value = shm[1];
      var upd = function () {
        var names = $('vs').value.split(/[,،]/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 3);
        var L = ['\\begin{venn}[sets={' + names.join(',') + '}' + ($('vsh').value.trim() ? ', shade={' + $('vsh').value.trim() + '}' : '') + ']'];
        Array.prototype.forEach.call($('vreg').querySelectorAll('input'), function (i) { if (i.value.trim()) L.push('  \\region[' + i.getAttribute('data-r') + ']{' + i.value.trim() + '}'); });
        L.push('\\end{venn}');
        setCode(L.join('\n'));
      };
      regs();
      $('vs').oninput = function () { regs(); upd(); };
      $('vsh').oninput = upd;
    } else if (type === 'tree') {
      f.innerHTML = '<label><span>' + tr('الفروع: كل سطر «- الاسم [الاحتمال]» والمسافة في أول السطر تعني فرعاً داخلياً|One branch per line: "- name [p]"; indent for sub-branches') + '</span><textarea class="inp" id="tt" dir="auto"></textarea></label>' +
        '<div class="checks"><label><input type="checkbox" id="tp"><span>' + tr('حاصل ضرب الاحتمالات|Products') + '</span></label></div>';
      var m2 = code.match(/\\begin\s*\{tree\}(\[[^\]]*\])?([\s\S]*?)\\end\s*\{tree\}/);
      $('tt').value = m2 ? m2[2].replace(/^\n|\n$/g, '') : '';
      $('tp').checked = /products/.test(code);
      var upd2 = function () { setCode('\\begin{tree}' + ($('tp').checked ? '[products]' : '') + '\n' + $('tt').value + '\n\\end{tree}'); };
      $('tt').oninput = upd2; $('tp').onchange = upd2;
      $('tt').onkeydown = function (e) { if (e.key === 'Tab') { e.preventDefault(); var t = this, a = t.selectionStart; t.value = t.value.slice(0, a) + '  ' + t.value.slice(t.selectionEnd); t.setSelectionRange(a + 2, a + 2); upd2(); } };
    }
  }
  function syncTypes() { Array.prototype.forEach.call($('types').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-k') === type)); }); }
  $('types').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-k]'); if (!b) return;
    type = b.getAttribute('data-k'); code = DEF[type];
    syncTypes(); setupPanel(); buildForm(); redraw(true);
  });
  function setupPanel() {
    panel = Studio.codePanel({ el: $('codeBox'), kind: kind(), accept: ['vartable', 'diagram'], get: data,
      set: function (d) {
        code = d.code;
        var em2 = code.match(/\\begin\s*\{(vartable|signtable|numberline|venn|tree)\}/);
        var t2 = em2 ? em2[1] : 'vartable';
        if (t2 !== type) { type = t2; syncTypes(); buildForm(); }
        redraw(true);
      } });
    panel.refresh();
  }

  $('exportBtn').onclick = function () { Studio.popAt($('exportPop'), this); };
  $('exportPop').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-exp]'); if (!b) return;
    $('exportPop').hidden = true; Studio.exportAs(b.getAttribute('data-exp'), produce, type);
  });
  $('okBtn').onclick = function () {
    $('okBtn').disabled = true;
    produce().then(function () { return Studio.finish(kind(), data(), produce, type); })
      .catch(function (e) { Studio.toast(e.message, true); }).then(function () { $('okBtn').disabled = false; });
  };
  $('cancelBtn').onclick = Studio.cancel;
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('okBtn').click(); }
    if (e.key === 'Escape') Studio.cancel();
  });
  if (S0.editId) $('okBtn').setAttribute('data-t', 'تحديث|Update');
  window.addEventListener('resize', function () { redraw(true); });
  Studio.applyT();
  syncTypes(); setupPanel(); buildForm();
  RenderHost.warm('stix2').then(function () { draw(); }, function () { draw(); });
  setTimeout(Studio.hideLoader, 5000);
  window.__diagram = { produce: produce, get code() { return code; } };
})();
