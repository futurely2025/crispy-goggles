/* Merge PDF — several files into one, in the order shown, optionally only some pages of each. */
(function () {
  'use strict';
  var h = T.h, main = T.shell('merge');
  var files = [], seq = 0, dragId = null;

  var zone = T.dropzone({ multiple: true, accept: '.pdf,application/pdf', label: 'اختر ملفات PDF', hint: 'أو اسحبها وأفلتها هنا — يمكنك اختيار عدة ملفات دفعة واحدة', test: T.isPdf, onFiles: addFiles });
  var list = h('div', { class: 'tl-files', id: 'list' });
  var more = T.dropzone({ multiple: true, accept: '.pdf,application/pdf', label: '+ إضافة ملفات', hint: 'اسحب هنا أو اضغط', test: T.isPdf, onFiles: addFiles });
  more.classList.add('small');
  var outName = h('input', { class: 'tl-in', value: 'merged', 'aria-label': 'اسم الملف الناتج' });
  var title = h('input', { class: 'tl-in', placeholder: 'اختياري', 'aria-label': 'عنوان المستند' });
  var summary = h('p', { class: 'tl-muted' });
  var go = h('button', { class: 'tl-btn primary big block', type: 'button', text: 'دمج الملفات', onclick: merge });
  var sortBtn = h('button', { class: 'tl-btn sm', type: 'button', text: 'ترتيب بالاسم', onclick: function () { files.sort(function (a, b) { return a.name.localeCompare(b.name, 'ar', { numeric: true }); }); draw(); } });
  var clearBtn = h('button', { class: 'tl-btn sm danger', type: 'button', text: 'مسح الكل', onclick: function () { files.forEach(destroy); files = []; draw(); } });
  var resultHost = h('div');

  var work = h('div', { class: 'tl-split', hidden: true }, [
    h('div', null, [h('div', { class: 'tl-row wrap', style: 'margin-bottom:10px' }, [h('b', { text: 'الملفات (اسحب البطاقات لإعادة الترتيب)' }), h('span', { style: 'flex:1' }), sortBtn, clearBtn]), list, h('div', { style: 'margin-top:14px' }, more)]),
    h('aside', { class: 'tl-side' }, [h('div', { class: 'tl-card' }, [h('h2', { text: 'الناتج' }), summary,
      T.field('اسم الملف', outName), T.field('عنوان المستند (Metadata)', title), go]), resultHost])]);
  main.appendChild(zone); main.appendChild(work);

  function destroy(f) { try { f.doc.pdf.destroy(); } catch (e) { /* ignore */ } }

  function addFiles(list0) {
    T.task('جارٍ فتح الملفات…', function (p) {
      var chain = Promise.resolve(), n = 0;
      list0.forEach(function (file) {
        chain = chain.then(function () { p('جارٍ فتح ' + file.name, n++ / list0.length); return T.openPdf(file).then(function (doc) {
          files.push({ id: ++seq, name: file.name, size: file.size, doc: doc, range: '' });
        }, function (e) { T.toast(file.name + ': ' + T.errText(e), true); }); });
      });
      return chain;
    }).then(draw);
  }

  function pageCount(f) {
    if (!f.range.trim()) return f.doc.pages;
    try { return T.parsePages(f.range, f.doc.pages).length; } catch (e) { return -1; }
  }
  function draw() {
    zone.hidden = files.length > 0; work.hidden = !files.length;
    list.innerHTML = '';
    files.forEach(function (f, i) {
      var th = h('div', { class: 'th' });
      T.lazyThumb(th, function () { T.renderPage(f.doc.pdf, 1, { width: 240 }).then(function (c) { th.innerHTML = ''; th.appendChild(c); }, function () { th.textContent = 'PDF'; }); });
      var rng = h('input', { class: 'tl-in', dir: 'ltr', placeholder: 'كل الصفحات', value: f.range, 'aria-label': 'صفحات هذا الملف', style: 'min-height:32px;padding:4px 8px;font-size:13px', oninput: function () {
        f.range = rng.value; var n = pageCount(f); rng.style.borderColor = n < 0 ? 'var(--danger)' : ''; mt.textContent = meta(f); sum(); } });
      var mt = h('div', { class: 'mt', text: meta(f) });
      var card = h('div', { class: 'tl-file', draggable: 'true', 'data-id': f.id }, [
        h('span', { class: 'tl-num', text: String(i + 1) }), th, h('div', { class: 'nm', title: f.name, text: f.name }), mt, rng,
        h('div', { class: 'ctl' }, [
          h('button', { class: 'tl-ib', type: 'button', title: 'تقديم', 'aria-label': 'تقديم', text: '→', disabled: i === 0, onclick: function () { mv(i, -1); } }),
          h('button', { class: 'tl-ib', type: 'button', title: 'تأخير', 'aria-label': 'تأخير', text: '←', disabled: i === files.length - 1, onclick: function () { mv(i, 1); } }),
          h('button', { class: 'tl-ib danger', type: 'button', title: 'إزالة', 'aria-label': 'إزالة', text: '✕', onclick: function () { destroy(f); files.splice(i, 1); draw(); } })])]);
      card.addEventListener('dragstart', function (e) { dragId = f.id; card.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(f.id)); } catch (x) { /* ignore */ } });
      card.addEventListener('dragend', function () { dragId = null; card.classList.remove('drag'); [].forEach.call(list.children, function (c) { c.classList.remove('dropat'); }); });
      card.addEventListener('dragover', function (e) { if (dragId === null) return; e.preventDefault(); card.classList.add('dropat'); });
      card.addEventListener('dragleave', function () { card.classList.remove('dropat'); });
      card.addEventListener('drop', function (e) {
        e.preventDefault(); e.stopPropagation(); card.classList.remove('dropat');
        var from = files.findIndex(function (x) { return x.id === dragId; }), to = i;
        if (from < 0 || from === to) return;
        files.splice(to, 0, files.splice(from, 1)[0]); draw();
      });
      list.appendChild(card);
    });
    sum();
  }
  function meta(f) { var n = pageCount(f); return (n < 0 ? 'نطاق غير صالح' : n + ' / ' + f.doc.pages + ' صفحة') + ' · ' + T.fmtSize(f.size); }
  function sum() {
    var total = 0, bad = false;
    files.forEach(function (f) { var n = pageCount(f); if (n < 0) bad = true; else total += n; });
    summary.textContent = files.length + ' ملف · ' + total + ' صفحة في الناتج';
    go.disabled = files.length < 1 || bad || total === 0;
    go.textContent = files.length < 2 ? 'إنشاء الملف' : 'دمج ' + files.length + ' ملفات';
  }
  function mv(i, d) { var j = i + d; if (j < 0 || j >= files.length) return; var t = files[i]; files[i] = files[j]; files[j] = t; draw(); }

  function merge() {
    T.task('جارٍ الدمج…', function (p) {
      return T.pdfLib().then(function (L) {
        return L.PDFDocument.create().then(function (out) {
          var chain = Promise.resolve();
          files.forEach(function (f, k) {
            chain = chain.then(function () {
              p('دمج ' + f.name, k / files.length);
              return T.editableBytes(f.doc).then(function (b) { return T.loadLibDoc(b); }).then(function (src) {
                var idx = (f.range.trim() ? T.parsePages(f.range, f.doc.pages) : Array.from({ length: f.doc.pages }, function (_, i) { return i + 1; })).map(function (n) { return n - 1; });
                return out.copyPages(src, idx).then(function (pages) { pages.forEach(function (pg) { out.addPage(pg); }); });
              });
            });
          });
          return chain.then(function () {
            out.setTitle(title.value.trim() || T.baseName(outName.value) || 'merged');
            out.setProducer('معادلات عربية — أدوات PDF'); out.setCreationDate(new Date());
            p('جارٍ الحفظ…', 0.95);
            return out.save({ useObjectStreams: true });
          });
        });
      });
    }).then(function (bytes) {
      var name = (T.baseName(outName.value.trim() || 'merged')) + '.pdf';
      resultHost.innerHTML = '';
      resultHost.appendChild(T.resultCard('تم الدمج', files.length + ' ملف · ' + T.fmtSize(bytes.length), [{ label: 'تنزيل ' + name, name: name, data: bytes, mime: 'application/pdf' }]));
    }, function (e) { T.fail(e, 'تعذّر الدمج'); });
  }
})();
