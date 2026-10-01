/* Split PDF — by ranges, every N pages, selected pages, or one file per page. */
(function () {
  'use strict';
  var h = T.h, main = T.shell('split');
  var doc = null, sel = {}, mode = 'ranges', lastClick = 0, cells = [];

  var zone = T.dropzone({ accept: '.pdf,application/pdf', label: 'اختر ملف PDF', hint: 'أو اسحب الملف وأفلته هنا', test: T.isPdf, onFiles: function (fs) { open(fs[0]); } });
  var info = h('div', { class: 'tl-muted' });
  var grid = h('div', { class: 'tl-pages' });
  var optHost = h('div');
  var go = h('button', { class: 'tl-btn primary big block', type: 'button', onclick: run });
  var resultHost = h('div');
  var seg = T.segmented([['ranges', 'نطاقات'], ['every', 'كل N صفحة'], ['pick', 'صفحات محددة'], ['each', 'كل صفحة ملف']], mode, function (v) { mode = v; drawOpts(); });

  var ranges = h('textarea', { class: 'tl-in', dir: 'ltr', rows: 4, placeholder: '1-3\n4-6\n7-', 'aria-label': 'النطاقات', style: 'min-height:110px;font-family:Consolas,monospace' });
  var mergeRanges = h('input', { type: 'checkbox' });
  var everyN = h('input', { class: 'tl-in', type: 'number', min: 1, value: 1, dir: 'ltr' });
  var pickInfo = h('p', { class: 'tl-muted' });

  main.appendChild(zone);
  var work = h('div', { class: 'tl-split', hidden: true }, [
    h('div', null, [h('div', { class: 'tl-row wrap', style: 'margin-bottom:10px' }, [info, h('span', { style: 'flex:1' }),
      h('button', { class: 'tl-btn sm', type: 'button', text: 'تحديد الكل', onclick: function () { selectAll(true); } }),
      h('button', { class: 'tl-btn sm', type: 'button', text: 'إلغاء التحديد', onclick: function () { selectAll(false); } }),
      h('button', { class: 'tl-btn sm', type: 'button', text: 'عكس', onclick: invert }),
      h('button', { class: 'tl-btn sm', type: 'button', text: 'ملف آخر', onclick: function () { reset(); } })]), grid]),
    h('aside', { class: 'tl-side' }, [h('div', { class: 'tl-card' }, [h('h2', { text: 'طريقة التقسيم' }), seg, h('div', { style: 'margin-top:14px' }, optHost), go]), resultHost])]);
  main.appendChild(work);

  function reset() { if (doc) { try { doc.pdf.destroy(); } catch (e) { /* ignore */ } } doc = null; sel = {}; zone.hidden = false; work.hidden = true; resultHost.innerHTML = ''; }
  function open(file) {
    T.task('جارٍ فتح الملف…', function () { return T.openPdf(file); }).then(function (d) {
      doc = d; sel = {}; zone.hidden = true; work.hidden = false; resultHost.innerHTML = '';
      info.textContent = d.name + ' · ' + d.pages + ' صفحة · ' + T.fmtSize(d.bytes.length);
      ranges.value = d.pages > 1 ? '1-' + Math.ceil(d.pages / 2) + '\n' + (Math.ceil(d.pages / 2) + 1) + '-' : '1';
      drawGrid(); drawOpts();
    }, function (e) { T.fail(e, 'تعذّر فتح الملف'); });
  }
  function drawGrid() {
    grid.innerHTML = ''; cells = [];
    var q = T.thumbQueue();
    for (var i = 1; i <= doc.pages; i++) (function (n) {
      var th = h('div', { class: 'th' });
      var cell = h('div', { class: 'tl-pg', role: 'checkbox', tabindex: 0, 'aria-checked': 'false', 'aria-label': 'صفحة ' + n }, [th, h('span', { class: 'tick', text: '✓' }), h('span', { class: 'no', text: String(n) })]);
      cell.onclick = function (e) { toggle(n, e.shiftKey); };
      cell.onkeydown = function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(n, e.shiftKey); } };
      T.lazyThumb(th, function () { q(function () { return T.renderPage(doc.pdf, n, { width: 200 }).then(function (c) { th.innerHTML = ''; th.appendChild(c); }, function () { /* ignore */ }); }); });
      cells[n] = cell; grid.appendChild(cell);
    })(i);
    paint();
  }
  function toggle(n, shift) {
    if (shift && lastClick) { var a = Math.min(lastClick, n), b = Math.max(lastClick, n), on = !sel[n]; for (var i = a; i <= b; i++) sel[i] = on; }
    else sel[n] = !sel[n];
    lastClick = n; if (mode !== 'pick') { mode = 'pick'; seg.querySelector('[data-v=pick]').click(); } else { paint(); drawOpts(); }
  }
  function selected() { var l = []; for (var i = 1; i <= doc.pages; i++) if (sel[i]) l.push(i); return l; }
  function selectAll(on) { for (var i = 1; i <= doc.pages; i++) sel[i] = on; paint(); drawOpts(); }
  function invert() { for (var i = 1; i <= doc.pages; i++) sel[i] = !sel[i]; paint(); drawOpts(); }
  function paint() { cells.forEach(function (c, n) { if (!c) return; c.classList.toggle('sel', !!sel[n]); c.setAttribute('aria-checked', String(!!sel[n])); }); }

  function drawOpts() {
    optHost.innerHTML = '';
    if (!doc) return;
    if (mode === 'ranges') {
      optHost.appendChild(T.field('النطاقات — كل سطر ملف مستقل', ranges, 'مثال: 1-3 ثم سطر جديد 4-6 ثم 7- (حتى النهاية). يمكن أيضاً الفصل بفاصلة.'));
      optHost.appendChild(h('label', { class: 'tl-check' }, [mergeRanges, h('span', { text: 'دمج كل النطاقات في ملف واحد' })]));
      go.textContent = 'تقسيم';
    } else if (mode === 'every') {
      optHost.appendChild(T.field('عدد الصفحات في كل ملف', everyN, 'سينتج ' + Math.ceil(doc.pages / Math.max(1, +everyN.value || 1)) + ' ملف تقريباً'));
      everyN.oninput = function () { drawOpts(); everyN.focus(); };
      go.textContent = 'تقسيم';
    } else if (mode === 'pick') {
      var s = selected();
      pickInfo.textContent = s.length ? 'المحدد: ' + s.length + ' صفحة (' + T.pagesText(s) + ')' : 'اضغط على الصفحات لتحديدها (Shift لتحديد مجال).';
      optHost.appendChild(pickInfo);
      optHost.appendChild(h('label', { class: 'tl-check' }, [h('input', { type: 'checkbox', id: 'pickSep', checked: false }), h('span', { text: 'كل صفحة محددة في ملف مستقل' })]));
      go.textContent = 'استخراج الصفحات المحددة';
    } else { optHost.appendChild(h('p', { class: 'tl-muted', text: 'سيُنشأ ملف منفصل لكل صفحة (' + doc.pages + ' ملف) داخل ملف ZIP.' })); go.textContent = 'تقسيم إلى صفحات'; }
  }

  function plan() {
    var n = doc.pages, parts = [], base = T.baseName(doc.name), i;
    if (mode === 'ranges') {
      var chunks = ranges.value.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      if (!chunks.length) throw new Error('اكتب نطاقاً واحداً على الأقل');
      if (mergeRanges.checked) return [{ pages: T.parsePages(chunks.join(','), n), name: base + '_extract' }];
      chunks.forEach(function (c, k) { parts.push({ pages: T.parsePages(c, n), name: base + '_part' + T.pad(k + 1, 2) }); });
    } else if (mode === 'every') {
      var step = Math.max(1, Math.floor(+everyN.value || 1));
      for (i = 1; i <= n; i += step) { var p = []; for (var j = i; j < i + step && j <= n; j++) p.push(j); parts.push({ pages: p, name: base + '_' + T.pad(i, 3) + (p.length > 1 ? '-' + T.pad(p[p.length - 1], 3) : '') }); }
    } else if (mode === 'pick') {
      var s = selected(); if (!s.length) throw new Error('حدّد صفحة واحدة على الأقل');
      var sep = document.getElementById('pickSep') && document.getElementById('pickSep').checked;
      if (sep) s.forEach(function (x) { parts.push({ pages: [x], name: base + '_p' + T.pad(x, 3) }); });
      else parts.push({ pages: s, name: base + '_selected' });
    } else { for (i = 1; i <= n; i++) parts.push({ pages: [i], name: base + '_p' + T.pad(i, 3) }); }
    return parts;
  }

  function run() {
    var parts;
    try { parts = plan(); } catch (e) { T.toast(e.message, true); return; }
    T.task('جارٍ التقسيم…', function (prog) {
      return Promise.all([T.pdfLib(), T.editableBytes(doc)]).then(function (r) {
        return T.loadLibDoc(r[1]).then(function (src) {
          var out = [], chain = Promise.resolve();
          parts.forEach(function (part, k) {
            chain = chain.then(function () {
              prog('الملف ' + (k + 1) + ' من ' + parts.length, k / parts.length);
              return r[0].PDFDocument.create().then(function (d) {
                return d.copyPages(src, part.pages.map(function (x) { return x - 1; })).then(function (pgs) {
                  pgs.forEach(function (pg) { d.addPage(pg); }); d.setProducer('معادلات عربية — أدوات PDF'); return d.save({ useObjectStreams: true });
                });
              }).then(function (bytes) { out.push({ name: part.name + '.pdf', bytes: bytes, pages: part.pages.length }); });
            });
          });
          return chain.then(function () { return out; });
        });
      });
    }).then(function (files) {
      resultHost.innerHTML = '';
      if (files.length === 1) {
        resultHost.appendChild(T.resultCard('تم', files[0].pages + ' صفحة · ' + T.fmtSize(files[0].bytes.length), [{ label: 'تنزيل ' + files[0].name, name: files[0].name, data: files[0].bytes, mime: 'application/pdf' }]));
        return;
      }
      return T.jszip().then(function (Z) {
        var z = new Z(); files.forEach(function (f) { z.file(f.name, f.bytes); });
        return z.generateAsync({ type: 'uint8array', compression: 'STORE' });
      }).then(function (zip) {
        var card = T.resultCard('تم التقسيم إلى ' + files.length + ' ملف', 'الحجم الكلي ' + T.fmtSize(zip.length), [{ label: 'تنزيل الكل (ZIP)', name: T.baseName(doc.name) + '_split.zip', data: zip, mime: 'application/zip' }]);
        var lst = h('div', { style: 'margin-top:12px;max-height:240px;overflow:auto;display:flex;flex-direction:column;gap:6px' });
        files.slice(0, 60).forEach(function (f) { lst.appendChild(h('div', { class: 'tl-row' }, [h('span', { style: 'flex:1;direction:ltr;text-align:start;font-size:13px', text: f.name + ' — ' + f.pages + 'p · ' + T.fmtSize(f.bytes.length) }),
          h('button', { class: 'tl-btn sm', type: 'button', text: '⬇', 'aria-label': 'تنزيل ' + f.name, onclick: function () { T.download(f.bytes, f.name, 'application/pdf'); } })])); });
        card.appendChild(lst); resultHost.appendChild(card);
      });
    }, function (e) { T.fail(e, 'تعذّر التقسيم'); });
  }
})();
