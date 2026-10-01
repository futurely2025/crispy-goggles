/* Organize PDF — reorder by dragging, rotate, delete, duplicate, insert blank pages, add pages from other PDFs. */
(function () {
  'use strict';
  var h = T.h, main = T.shell('organize');
  var docs = [], pages = [], sel = {}, uid = 0, hist = [], histAt = -1, last = null, dragIds = null;
  var thumbs = {};                       // "doc|n|rot" -> canvas (rendered once)

  var zone = T.dropzone({ accept: '.pdf,application/pdf', label: 'اختر ملف PDF', hint: 'أو اسحب الملف وأفلته هنا', test: T.isPdf, onFiles: function (fs) { openMain(fs[0]); } });
  var grid = h('div', { class: 'tl-pages', id: 'grid' });
  var info = h('div', { class: 'tl-muted' });
  var outName = h('input', { class: 'tl-in', value: 'organized' });
  var resultHost = h('div');
  var addInput = h('input', { type: 'file', accept: '.pdf,application/pdf', multiple: true, hidden: true });
  addInput.onchange = function () { addDocs([].slice.call(addInput.files)); addInput.value = ''; };

  function btn(txt, title, fn, cls) { return h('button', { class: 'tl-btn sm ' + (cls || ''), type: 'button', title: title || txt, text: txt, onclick: fn }); }
  var undoB = btn('↶ تراجع', 'تراجع (Ctrl+Z)', function () { undo(); }), redoB = btn('↷ إعادة', 'إعادة (Ctrl+Y)', function () { redo(); });
  var bar = h('div', { class: 'tl-row wrap tl-card', style: 'padding:10px;position:sticky;top:60px;z-index:20' }, [
    undoB, redoB, h('span', { class: 'sep' }),
    btn('↺ تدوير يسار', 'تدوير المحدد 90° إلى اليسار', function () { rotateSel(-90); }), btn('↻ تدوير يمين', 'تدوير المحدد 90° إلى اليمين', function () { rotateSel(90); }),
    btn('⧉ تكرار', 'تكرار المحدد', dupSel), btn('🗑 حذف', 'حذف المحدد (Delete)', delSel, 'danger'),
    btn('＋ صفحة فارغة', 'إدراج صفحة فارغة بعد المحدد', addBlank), btn('＋ من ملف PDF', 'إضافة صفحات من ملف آخر', function () { addInput.click(); }),
    btn('⇅ عكس الترتيب', 'عكس ترتيب كل الصفحات', reverseAll), btn('تحديد الكل', null, function () { pages.forEach(function (p) { sel[p.id] = true; }); paint(); }),
    btn('إلغاء التحديد', null, function () { sel = {}; paint(); }), addInput]);
  var side = h('aside', { class: 'tl-side' }, [h('div', { class: 'tl-card' }, [h('h2', { text: 'الناتج' }), info, T.field('اسم الملف', outName),
    h('button', { class: 'tl-btn primary big block', type: 'button', text: 'حفظ الملف', onclick: save }), h('small', { class: 'tl-muted', text: 'Ctrl/⌘ + نقر لتحديد عدة صفحات، Shift لتحديد مجال، واسحب لإعادة الترتيب.' })]), resultHost]);
  var work = h('div', { class: 'tl-split', hidden: true }, [h('div', null, [bar, h('div', { style: 'height:12px' }), grid]), side]);
  main.appendChild(zone); main.appendChild(work);

  // ---------------------------------------------------------- history
  function snap() { hist = hist.slice(0, histAt + 1); hist.push(pages.map(function (p) { return Object.assign({}, p); })); histAt = hist.length - 1; if (hist.length > 80) { hist.shift(); histAt--; } btns(); }
  function restore() { pages = hist[histAt].map(function (p) { return Object.assign({}, p); }); sel = {}; draw(); btns(); }
  function undo() { if (histAt > 0) { histAt--; restore(); } }
  function redo() { if (histAt < hist.length - 1) { histAt++; restore(); } }
  function btns() { undoB.disabled = histAt <= 0; redoB.disabled = histAt >= hist.length - 1; }
  document.addEventListener('keydown', function (e) {
    if (!pages.length || /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) return;
    var k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'a') { e.preventDefault(); pages.forEach(function (p) { sel[p.id] = true; }); paint(); }
    else if (e.key === 'Delete') { delSel(); }
  });

  // ---------------------------------------------------------- opening
  function openMain(file) {
    T.task('جارٍ فتح الملف…', function () { return T.openPdf(file); }).then(function (d) {
      docs = [d]; d.lib = null; pages = []; sel = {}; hist = []; histAt = -1; resultHost.innerHTML = '';
      for (var i = 1; i <= d.pages; i++) pages.push({ id: ++uid, doc: 0, n: i, rot: 0 });
      outName.value = T.baseName(d.name) + '_organized';
      zone.hidden = true; work.hidden = false; snap(); draw();
    }, function (e) { T.fail(e, 'تعذّر فتح الملف'); });
  }
  function addDocs(files) {
    var insertAt = (function () { var idx = -1; pages.forEach(function (p, i) { if (sel[p.id]) idx = i; }); return idx < 0 ? pages.length : idx + 1; })();
    T.task('جارٍ إضافة الصفحات…', function () {
      var chain = Promise.resolve();
      files.forEach(function (f) { chain = chain.then(function () { return T.openPdf(f).then(function (d) {
        docs.push(d); var di = docs.length - 1, add = [];
        for (var i = 1; i <= d.pages; i++) add.push({ id: ++uid, doc: di, n: i, rot: 0 });
        pages.splice.apply(pages, [insertAt, 0].concat(add)); insertAt += add.length;
      }, function (e) { T.toast(f.name + ': ' + T.errText(e), true); }); }); });
      return chain;
    }).then(function () { snap(); draw(); });
  }

  // ---------------------------------------------------------- editing
  function selIdx() { var l = []; pages.forEach(function (p, i) { if (sel[p.id]) l.push(i); }); return l; }
  function need() { if (!selIdx().length) { T.toast('حدّد صفحة أو أكثر أولاً', true); return false; } return true; }
  function rotateOne(id, d) { pages.forEach(function (p) { if (p.id === id) p.rot = (p.rot + d + 360) % 360; }); snap(); draw(); }
  function rotateSel(d) { if (!need()) return; pages.forEach(function (p) { if (sel[p.id]) p.rot = (p.rot + d + 360) % 360; }); snap(); draw(); }
  function delSel() { if (!selIdx().length) return; if (selIdx().length === pages.length) { T.toast('لا يمكن حذف كل الصفحات', true); return; } pages = pages.filter(function (p) { return !sel[p.id]; }); sel = {}; snap(); draw(); }
  function delOne(id) { if (pages.length === 1) { T.toast('لا يمكن حذف الصفحة الأخيرة', true); return; } pages = pages.filter(function (p) { return p.id !== id; }); delete sel[id]; snap(); draw(); }
  function dupSel() { if (!need()) return; var out = []; pages.forEach(function (p) { out.push(p); if (sel[p.id]) out.push(Object.assign({}, p, { id: ++uid })); }); pages = out; snap(); draw(); }
  function addBlank() {
    var idx = selIdx(), at = idx.length ? idx[idx.length - 1] + 1 : pages.length;
    pages.splice(at, 0, { id: ++uid, blank: true, rot: 0 }); snap(); draw();
  }
  function reverseAll() { pages.reverse(); snap(); draw(); }
  function moveTo(ids, beforeId) {
    var moving = pages.filter(function (p) { return ids.indexOf(p.id) >= 0; });
    var rest = pages.filter(function (p) { return ids.indexOf(p.id) < 0; });
    var at = beforeId === null ? rest.length : rest.findIndex(function (p) { return p.id === beforeId; });
    if (at < 0) at = rest.length;
    rest.splice.apply(rest, [at, 0].concat(moving)); pages = rest; snap(); draw();
  }

  // ---------------------------------------------------------- drawing
  var q = T.thumbQueue();
  function thumb(p, th) {
    if (p.blank) { th.innerHTML = ''; th.appendChild(h('div', { style: 'width:110px;height:150px;background:#fff;border:1px solid var(--line);display:grid;place-items:center;color:var(--muted);font-size:12px', text: 'فارغة' })); return; }
    var key = p.doc + '|' + p.n + '|' + p.rot;
    if (thumbs[key]) { th.innerHTML = ''; th.appendChild(thumbs[key].cloneNode(false)); paintClone(th, thumbs[key]); return; }
    T.lazyThumb(th, function () { q(function () { return T.renderPage(docs[p.doc].pdf, p.n, { width: 220, rotation: p.rot }).then(function (c) { thumbs[key] = c; th.innerHTML = ''; th.appendChild(copy(c)); }, function () { /* ignore */ }); }); });
  }
  function copy(c) { var n = document.createElement('canvas'); n.width = c.width; n.height = c.height; n.getContext('2d').drawImage(c, 0, 0); return n; }
  function paintClone(th, src) { th.innerHTML = ''; th.appendChild(copy(src)); }

  function draw() {
    grid.innerHTML = '';
    pages.forEach(function (p, i) {
      var th = h('div', { class: 'th' });
      var cell = h('div', { class: 'tl-pg' + (p.blank ? ' blank' : ''), draggable: 'true', 'data-id': p.id, tabindex: 0, role: 'option', 'aria-label': 'صفحة ' + (i + 1) }, [
        th, h('span', { class: 'tick', text: '✓' }), h('span', { class: 'no', text: String(i + 1) + (p.blank ? ' (فارغة)' : p.doc > 0 ? ' · ' + (p.doc + 1) : '') }),
        h('div', { class: 'acts' }, [
          ib('↺', 'تدوير يسار', function (e) { e.stopPropagation(); rotateOne(p.id, -90); }),
          ib('↻', 'تدوير يمين', function (e) { e.stopPropagation(); rotateOne(p.id, 90); }),
          ib('🗑', 'حذف', function (e) { e.stopPropagation(); delOne(p.id); }, 'danger')])]);
      thumb(p, th);
      cell.onclick = function (e) { clickSel(p, i, e); };
      cell.ondblclick = function () { sel = {}; sel[p.id] = true; paint(); };
      cell.addEventListener('dragstart', function (e) {
        if (!sel[p.id]) { sel = {}; sel[p.id] = true; paint(); }
        dragIds = pages.filter(function (x) { return sel[x.id]; }).map(function (x) { return x.id; });
        e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'p'); } catch (x) { /* ignore */ }
        setTimeout(function () { dragIds.forEach(function (id) { var el = grid.querySelector('[data-id="' + id + '"]'); el && el.classList.add('drag'); }); }, 0);
      });
      cell.addEventListener('dragend', function () { dragIds = null; [].forEach.call(grid.children, function (c) { c.classList.remove('drag', 'dropat'); }); });
      cell.addEventListener('dragover', function (e) { if (!dragIds) return; e.preventDefault(); cell.classList.add('dropat'); });
      cell.addEventListener('dragleave', function () { cell.classList.remove('dropat'); });
      cell.addEventListener('drop', function (e) { e.preventDefault(); cell.classList.remove('dropat'); if (dragIds && dragIds.indexOf(p.id) < 0) moveTo(dragIds, p.id); dragIds = null; });
      grid.appendChild(cell);
    });
    // drop at the very end
    grid.ondragover = function (e) { if (dragIds) e.preventDefault(); };
    grid.ondrop = function (e) { if (dragIds && e.target === grid) { e.preventDefault(); moveTo(dragIds, null); dragIds = null; } };
    paint();
    info.textContent = pages.length + ' صفحة في الناتج' + (docs.length > 1 ? ' · من ' + docs.length + ' ملفات' : '');
  }
  function ib(t, title, fn, cls) { return h('button', { class: 'tl-ib ' + (cls || ''), type: 'button', title: title, 'aria-label': title, text: t, onclick: fn }); }
  function clickSel(p, i, e) {
    if (e.shiftKey && last !== null) {
      var a = Math.min(last, i), b = Math.max(last, i); if (!(e.ctrlKey || e.metaKey)) sel = {};
      for (var k = a; k <= b; k++) sel[pages[k].id] = true;
    } else if (e.ctrlKey || e.metaKey) sel[p.id] = !sel[p.id];
    else { var was = sel[p.id] && selIdx().length === 1; sel = {}; if (!was) sel[p.id] = true; }
    last = i; paint();
  }
  function paint() { [].forEach.call(grid.children, function (c) { var on = !!sel[+c.getAttribute('data-id')]; c.classList.toggle('sel', on); c.setAttribute('aria-selected', String(on)); }); }

  // ---------------------------------------------------------- export
  function save() {
    T.task('جارٍ إنشاء الملف…', function (prog) {
      return T.pdfLib().then(function (L) {
        var libs = {}, chain = Promise.resolve();
        docs.forEach(function (d, i) { chain = chain.then(function () { return T.editableBytes(d).then(function (b) { return T.loadLibDoc(b); }).then(function (x) { libs[i] = x; }); }); });
        return chain.then(function () {
          return L.PDFDocument.create().then(function (out) {
            var jobs = Promise.resolve(), sizeHint = [595.28, 841.89];
            pages.forEach(function (p, k) {
              jobs = jobs.then(function () {
                prog('الصفحة ' + (k + 1) + ' من ' + pages.length, k / pages.length);
                if (p.blank) { var pg = out.addPage(sizeHint); return; }
                return out.copyPages(libs[p.doc], [p.n - 1]).then(function (r) {
                  var pg = r[0], base = pg.getRotation().angle || 0;
                  pg.setRotation(L.degrees((base + p.rot + 360) % 360)); out.addPage(pg);
                  var sz = pg.getSize(); sizeHint = (p.rot / 90) % 2 ? [sz.height, sz.width] : [sz.width, sz.height];
                });
              });
            });
            return jobs.then(function () { out.setProducer('معادلات عربية — أدوات PDF'); return out.save({ useObjectStreams: true }); });
          });
        });
      });
    }).then(function (bytes) {
      var name = T.baseName(outName.value.trim() || 'organized') + '.pdf';
      resultHost.innerHTML = ''; resultHost.appendChild(T.resultCard('تم الحفظ', pages.length + ' صفحة · ' + T.fmtSize(bytes.length), [{ label: 'تنزيل ' + name, name: name, data: bytes, mime: 'application/pdf' }]));
    }, function (e) { T.fail(e, 'تعذّر الحفظ'); });
  }
})();
