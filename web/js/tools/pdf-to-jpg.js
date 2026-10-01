/* PDF to JPG — render pages to JPG / PNG / WebP at up to 600 dpi; individual files or one ZIP. */
(function () {
  'use strict';
  var h = T.h, main = T.shell('pdf-to-jpg');
  var doc = null, sel = {}, results = [];
  var zone = T.dropzone({ accept: '.pdf,application/pdf', label: 'اختر ملف PDF', hint: 'أو اسحب الملف وأفلته هنا', test: T.isPdf, onFiles: function (fs) { open(fs[0]); } });
  var fmt = T.segmented([['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP']], 'jpg', function () { sync(); });
  var dpi = T.select([['72', '72 dpi — شاشة'], ['150', '150 dpi — جيدة'], ['200', '200 dpi'], ['300', '300 dpi — طباعة'], ['600', '600 dpi — أعلى دقة']], '150');
  var q = h('input', { class: 'tl-in', type: 'range', min: 40, max: 100, value: 90 }), qv = h('b', { text: '90%' });
  q.oninput = function () { qv.textContent = q.value + '%'; };
  var scope = T.segmented([['all', 'كل الصفحات'], ['sel', 'المحددة'], ['rng', 'نطاق']], 'all', function () { sync(); });
  var rng = h('input', { class: 'tl-in', dir: 'ltr', placeholder: '1-3,5' });
  var qField = T.field('الجودة', h('div', { class: 'tl-row' }, [q, qv])), rngField = T.field('النطاق', rng);
  var info = h('div', { class: 'tl-muted' }), grid = h('div', { class: 'tl-pages' }), resultHost = h('div'), out = h('div', { class: 'tl-pages', style: 'margin-top:12px' });
  var go = h('button', { class: 'tl-btn primary big block', type: 'button', text: 'تحويل إلى صور', onclick: run });
  var work = h('div', { class: 'tl-split', hidden: true }, [
    h('div', null, [h('div', { class: 'tl-row wrap', style: 'margin-bottom:10px' }, [info, h('span', { style: 'flex:1' }), h('button', { class: 'tl-btn sm', type: 'button', text: 'ملف آخر', onclick: reset })]), grid]),
    h('aside', { class: 'tl-side' }, [h('div', { class: 'tl-card' }, [h('h2', { text: 'الإعدادات' }), T.field('صيغة الصورة', fmt), T.field('الدقة', dpi), qField, T.field('الصفحات', scope), rngField, go]), resultHost])]);
  main.appendChild(zone); main.appendChild(work);

  function sync() { qField.hidden = fmt.value === 'png'; rngField.hidden = scope.value !== 'rng'; }
  function reset() { if (doc) { try { doc.pdf.destroy(); } catch (e) { /* ignore */ } } doc = null; sel = {}; zone.hidden = false; work.hidden = true; resultHost.innerHTML = ''; }
  function open(file) {
    T.task('جارٍ فتح الملف…', function () { return T.openPdf(file); }).then(function (d) {
      doc = d; sel = {}; zone.hidden = true; work.hidden = false; resultHost.innerHTML = ''; info.textContent = d.name + ' · ' + d.pages + ' صفحة';
      grid.innerHTML = ''; var qq = T.thumbQueue();
      for (var i = 1; i <= d.pages; i++) (function (n) {
        var th = h('div', { class: 'th' }); var cell = h('div', { class: 'tl-pg', tabindex: 0, role: 'checkbox', 'aria-checked': 'false' }, [th, h('span', { class: 'tick', text: '✓' }), h('span', { class: 'no', text: String(n) })]);
        cell.onclick = function () { sel[n] = !sel[n]; cell.classList.toggle('sel', !!sel[n]); cell.setAttribute('aria-checked', String(!!sel[n])); if (scope.value === 'all' && sel[n]) scope.querySelector('[data-v=sel]').click(); };
        cell.onkeydown = function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cell.click(); } };
        T.lazyThumb(th, function () { qq(function () { return T.renderPage(d.pdf, n, { width: 200 }).then(function (c) { th.innerHTML = ''; th.appendChild(c); }, function () { /* ignore */ }); }); });
        grid.appendChild(cell);
      })(i);
      sync();
    }, function (e) { T.fail(e, 'تعذّر فتح الملف'); });
  }
  function pageList() {
    var n = doc.pages, i, l = [];
    if (scope.value === 'sel') { for (i = 1; i <= n; i++) if (sel[i]) l.push(i); if (!l.length) throw new Error('حدّد صفحة واحدة على الأقل من الشبكة'); return l; }
    if (scope.value === 'rng') return T.parsePages(rng.value, n);
    for (i = 1; i <= n; i++) l.push(i); return l;
  }
  function run() {
    var pages; try { pages = pageList(); } catch (e) { T.toast(e.message, true); return; }
    var f = fmt.value, mime = f === 'jpg' ? 'image/jpeg' : f === 'png' ? 'image/png' : 'image/webp', ext = f, quality = +q.value / 100, dp = +dpi.value;
    results = [];
    T.task('جارٍ التحويل…', function (prog) {
      var chain = Promise.resolve();
      pages.forEach(function (n, k) {
        chain = chain.then(function () {
          prog('الصفحة ' + n + ' (' + (k + 1) + ' من ' + pages.length + ')', k / pages.length);
          return T.renderPage(doc.pdf, n, { dpi: dp }).then(function (c) {
            var w = c.width, hh = c.height;
            return T.canvasBlob(c, mime, f === 'png' ? undefined : quality).then(function (b) { c.width = c.height = 1; results.push({ n: n, blob: b, w: w, h: hh, name: T.baseName(doc.name) + '_' + T.pad(n, String(doc.pages).length) + '.' + ext }); });
          });
        });
      });
      return chain;
    }).then(function () {
      resultHost.innerHTML = ''; out.innerHTML = '';
      var total = results.reduce(function (s, r) { return s + r.blob.size; }, 0);
      var items = [];
      var card = T.resultCard('تم تحويل ' + results.length + ' صفحة', results[0].w + '×' + results[0].h + ' بكسل · ' + T.fmtSize(total), results.length === 1 ? [{ label: 'تنزيل ' + results[0].name, name: results[0].name, data: results[0].blob }] : []);
      if (results.length > 1) {
        var zb = h('button', { class: 'tl-btn primary big', type: 'button', text: '⬇ تنزيل الكل (ZIP)', onclick: zip }); card.querySelector('.tl-row').appendChild(zb);
        results.slice(0, 80).forEach(function (r) {
          var url = URL.createObjectURL(r.blob);
          out.appendChild(h('div', { class: 'tl-pg' }, [h('div', { class: 'th' }, h('img', { src: url, alt: 'صفحة ' + r.n, style: 'max-width:100%;max-height:100%;background:#fff' })), h('span', { class: 'no', text: r.n + ' · ' + T.fmtSize(r.blob.size) }),
            h('button', { class: 'tl-ib', type: 'button', title: 'تنزيل', 'aria-label': 'تنزيل الصفحة ' + r.n, text: '⬇', onclick: function () { T.download(r.blob, r.name); } })]));
        });
        card.appendChild(out);
      }
      resultHost.appendChild(card);
    }, function (e) { T.fail(e, 'تعذّر التحويل'); });
  }
  function zip() {
    T.task('جارٍ إنشاء ZIP…', function () {
      return T.jszip().then(function (Z) { var z = new Z(); results.forEach(function (r) { z.file(r.name, r.blob, { compression: 'STORE' }); }); return z.generateAsync({ type: 'blob', compression: 'STORE' }); });
    }).then(function (b) { T.download(b, T.baseName(doc.name) + '_images.zip'); }, function (e) { T.fail(e, 'تعذّر إنشاء ZIP'); });
  }
  sync();
})();
