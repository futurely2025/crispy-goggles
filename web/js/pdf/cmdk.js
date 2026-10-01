/* Command palette (Ctrl+K / ⌘K): type to find any studio command — ribbon buttons, tools, PDF tool pages — and run it. */
(function () {
  'use strict';
  var P = window.__pdf; if (!P) return;
  var box = null, inp, list, items = [], idx = 0;
  var PAGES = [['دمج PDF', 'merge'], ['تقسيم PDF', 'split'], ['ترتيب الصفحات', 'organize'], ['ضغط PDF', 'compress'], ['Word إلى PDF', 'word-to-pdf'], ['صور إلى PDF', 'jpg-to-pdf'], ['PDF إلى صور', 'pdf-to-jpg'], ['PDF إلى Word', 'pdf-to-word'],
    ['حماية PDF بكلمة مرور', 'protect'], ['فك حماية PDF', 'unlock'], ['مقارنة PDF', 'compare'], ['علامة مائية', 'watermark'], ['ترقيم الصفحات', 'page-numbers'], ['تدوير الصفحات', 'rotate']];
  function norm(s) { return String(s || '').toLowerCase().replace(/[ً-ٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه'); }
  function collect() {
    var out = [], seen = {};
    function add(label, hint, run) { label = String(label || '').replace(/\s+/g, ' ').trim(); if (!label || seen[label + hint]) return; seen[label + hint] = 1; out.push({ label: label, hint: hint, run: run, key: norm(label + ' ' + hint) }); }
    var tabs = {};
    [].forEach.call(document.querySelectorAll('#rtabs [data-rt]'), function (t) { tabs[t.dataset.rt] = t; });
    [].forEach.call(document.querySelectorAll('nav.tools button, nav.tools a.rtlink, .tools.rib button, .tools button'), function (b) {
      if (b.closest('[hidden]') && !b.closest('.tools')) return; if (b.disabled) return;
      var t = (b.querySelector('b') || {}).textContent || b.title || b.getAttribute('aria-label') || b.textContent;
      var nav = b.closest('nav.tools'), tab = nav && nav.id && nav.id.replace(/^tools/, '').toLowerCase();
      add(t, b.title && b.title !== t ? b.title : '', function () { var rt = nav && Object.keys(tabs).filter(function (k) { return nav.id.toLowerCase() === ('tools' + k).toLowerCase() || nav.id === k; })[0]; if (rt && tabs[rt]) tabs[rt].click(); b.click(); });
    });
    PAGES.forEach(function (p) { add(p[0], 'صفحة أداة', function () { location.href = 'tools/' + p[1] + '.html'; }); });
    [['تكبير', 'zoomIn'], ['تصغير', 'zoomOut']].forEach(function (z) { var e = document.getElementById(z[1]); if (e) add(z[0], 'عرض', function () { e.click(); }); });
    if (window.PdfShapeLib) PdfShapeLib.all().forEach(function (sh) { add('شكل: ' + (sh.ar || sh.id), sh.en || '', function () { if (!P.S.pdf) return P.toast('افتح ملف PDF أولاً'); P.S.shapeKind = sh.id; P.setTool('shape'); P.toast('اسحب على الصفحة لرسم الشكل'); }); });
    return out;
  }
  function build() {
    box = document.createElement('div'); box.className = 'cmdk'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'لوحة الأوامر');
    box.innerHTML = '<div class="cmdk-in"><input type="text" placeholder="اكتب اسم أمر أو أداة… (مثال: نجمة، تنقيح، ضغط)" dir="auto" autocomplete="off"><kbd>Esc</kbd></div><div class="cmdk-list" role="listbox"></div>';
    document.body.appendChild(box); inp = box.querySelector('input'); list = box.querySelector('.cmdk-list');
    box.addEventListener('mousedown', function (e) { if (e.target === box) close(); });
    inp.addEventListener('input', draw);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); e.preventDefault(); } else if (e.key === 'ArrowDown') { move(1); e.preventDefault(); } else if (e.key === 'ArrowUp') { move(-1); e.preventDefault(); } else if (e.key === 'Enter') { run(idx); e.preventDefault(); }
    });
  }
  function draw() {
    var q = norm(inp.value).split(/\s+/).filter(Boolean), rows = items.filter(function (it) { return q.every(function (w) { return it.key.indexOf(w) >= 0; }); }).slice(0, 40);
    rows.sort(function (a, b) { var A = q.length && norm(a.label).indexOf(q[0]) === 0 ? 0 : 1, B = q.length && norm(b.label).indexOf(q[0]) === 0 ? 0 : 1; return A - B; });
    list.innerHTML = ''; list.rows = rows; idx = 0;
    if (!rows.length) { list.innerHTML = '<p class="cmdk-none">لا نتائج</p>'; return; }
    rows.forEach(function (r, i) { var d = document.createElement('div'); d.className = 'cmdk-row' + (i === 0 ? ' on' : ''); d.setAttribute('role', 'option'); d.innerHTML = '<b></b><small></small>'; d.firstChild.textContent = r.label; d.lastChild.textContent = r.hint; d.onmousedown = function (e) { e.preventDefault(); run(i); }; list.appendChild(d); });
  }
  function move(d) { var rows = list.querySelectorAll('.cmdk-row'); if (!rows.length) return; rows[idx].classList.remove('on'); idx = (idx + d + rows.length) % rows.length; rows[idx].classList.add('on'); rows[idx].scrollIntoView({ block: 'nearest' }); }
  function run(i) { var r = list.rows && list.rows[i]; if (!r) return; close(); setTimeout(function () { try { r.run(); } catch (e) { console.error(e); } }, 30); }
  function open() { if (!box) build(); items = collect(); box.hidden = false; inp.value = ''; draw(); inp.focus(); }
  function close() { if (box) box.hidden = true; }
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (box && !box.hidden) close(); else open(); }
  }, true);
  window.PdfCmdk = { open: open, close: close };
  // a visible entry point next to the ribbon tabs
  var tb = document.getElementById('rtabs');
  if (tb) { var b = document.createElement('button'); b.type = 'button'; b.className = 'cmdk-btn'; b.title = 'لوحة الأوامر (Ctrl+K)'; b.innerHTML = '⌕ <span>بحث في الأوامر</span><kbd>Ctrl K</kbd>'; b.onclick = open; tb.appendChild(b); }
})();
