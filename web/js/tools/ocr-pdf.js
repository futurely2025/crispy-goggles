/* OCR — searchable PDF: reads scanned pages (Arabic + English) and writes an invisible text layer so the file can be searched, selected and copied.
 * Options: keep the original pages as they are, or clean them (flatten shadows, straighten, denoise) and replace them with the cleaned scan. */
(function () {
  'use strict';
  var h = T.h, main = T.shell('ocr-pdf'), doc = null, images = null;
  var zone = T.dropzone({ accept: '.pdf,application/pdf,image/*', multiple: true, label: 'اختر ملف PDF ممسوحاً ضوئياً (أو صوراً)', hint: 'أو اسحب الملف وأفلته هنا', test: function (f) { return T.isPdf(f) || T.isImage(f); }, onFiles: function (fs) { open(fs); } });
  var mode = T.select([['fast', 'سريع (الافتراضي)'], ['accurate', 'دقيق'], ['max', 'أقصى دقة (أبطأ)']], 'fast');
  var lang = T.select([['auto', 'تلقائي'], ['ara', 'عربي'], ['ara+eng', 'عربي + إنجليزي'], ['eng', 'إنجليزي']], 'auto');
  var how = T.segmented([['keep', 'إبقاء الصفحات كما هي'], ['clean', 'تنظيف المسح وتصحيح الميل']], 'clean');
  var digs = T.select([['keep', 'كما هي'], ['western', '0 1 2 3'], ['indic', '٠ ١ ٢ ٣']], 'keep');
  var rng = h('input', { class: 'tl-in', dir: 'ltr', placeholder: 'الكل — أو مثلاً 1-5, 8' });
  var wantTxt = h('input', { type: 'checkbox' });
  var info = h('div', { class: 'tl-muted' }), resultHost = h('div'), log = h('div', { class: 'tl-muted', style: 'max-height:140px;overflow:auto;font-size:12px' });
  var go = h('button', { class: 'tl-btn primary big block', type: 'button', text: 'ابدأ التعرف على النص', onclick: run });
  var work = h('div', { class: 'tl-card', hidden: true }, [h('div', { class: 'tl-row wrap' }, [info, h('span', { style: 'flex:1' }), h('button', { class: 'tl-btn sm', type: 'button', text: 'ملف آخر', onclick: reset })]),
    T.field('الجودة', mode, 'الدقيق يقرأ كل صفحة بعدة قراءات ويقارنها (نحو 15–40 ثانية للصفحة)'), T.field('اللغة', lang), T.field('الصفحات الناتجة', how, 'التنظيف يُحسّن الصور الرديئة؛ الإبقاء يحفظ الصفحة الأصلية بلا أي تغيير مع إضافة النص فقط'), T.field('الأرقام في النص', digs), T.field('الصفحات', rng),
    h('label', { class: 'tl-check' }, [wantTxt, h('span', { text: ' نزّل أيضاً ملف نصي (txt) بكل النص' })]), go, log]);
  main.appendChild(zone); main.appendChild(work); main.appendChild(resultHost);

  function reset() { doc = null; images = null; zone.hidden = false; work.hidden = true; resultHost.innerHTML = ''; log.innerHTML = ''; }
  function open(fs) {
    var pdfs = fs.filter(T.isPdf);
    if (pdfs.length) {
      T.task('جارٍ فتح الملف…', function () { return T.openPdf(pdfs[0]); }).then(function (d) { doc = d; images = null; zone.hidden = true; work.hidden = false; info.textContent = d.name + ' · ' + d.pages + ' صفحة'; }, function (e) { T.fail(e, 'تعذّر فتح الملف'); });
    } else {
      images = fs.filter(T.isImage); doc = null; zone.hidden = true; work.hidden = false; info.textContent = images.length + ' صورة'; // each image becomes one page
    }
  }
  function pageNumbers(n) { var s = rng.value.trim(); if (!s) { var all = []; for (var i = 1; i <= n; i++) all.push(i); return all; } return T.parsePages(s, n); }
  function loadImage(file) { return createImageBitmap(file).then(function (bm) { var c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bm, 0, 0); return c; }); }
  function jpegOf(cv, q) { return T.canvasBlob(cv, 'image/jpeg', q).then(T.blobBytes); }

  function run() {
    resultHost.innerHTML = ''; log.innerHTML = '';
    var total = doc ? pageNumbers(doc.pages) : images.map(function (x, i) { return i + 1; });
    if (!total.length) return T.fail(new Error('لا توجد صفحات محددة'));
    var t0 = Date.now(), texts = [], confs = [];
    T.task('تحضير محرك التعرف…', function (setBusy) {
      return Promise.all([T.pdfLib(), T.script('js/pdf/ocr-engine.js'), T.script('js/pdf/ocr-layer.js'), doc ? T.editableBytes(doc) : Promise.resolve(null)]).then(function (r) {
        var L = r[0], srcBytes = r[3];
        return Promise.all([L.PDFDocument.create(), srcBytes ? L.PDFDocument.load(srcBytes, { ignoreEncryption: true }) : Promise.resolve(null)]).then(function (docs) {
          var out = docs[0], src = docs[1], chain = Promise.resolve();
          total.forEach(function (pn, k) {
            chain = chain.then(function () {
              var label = 'صفحة ' + (k + 1) + ' من ' + total.length; setBusy(label + ' — تجهيز…', k / total.length);
              var getCanvas = doc ? T.renderPage(doc.pdf, pn, { dpi: 300 }) : loadImage(images[pn - 1]);
              var pageSize = doc ? doc.pdf.getPage(pn).then(function (pg) { var v = pg.getViewport({ scale: 1 }); return { w: v.width, h: v.height, rot: pg.rotate }; }) : Promise.resolve(null);
              return Promise.all([getCanvas, pageSize]).then(function (cs) {
                var cv = cs[0], ps = cs[1] || { w: Math.min(842, cv.width * 72 / 150), h: cv.height * Math.min(842, cv.width * 72 / 150) / cv.width, rot: 0 };
                var clean = how.value === 'clean' || !doc || ps.rot;
                return PdfOcrEngine.recognize(cv, {
                  mode: mode.value, lang: lang.value, digits: digs.value, deskew: clean, flatten: clean, denoise: clean, sharpen: clean, wantClean: clean,
                  onStatus: function (m) { setBusy(label + ' — ' + m, (k + 0.3) / total.length); }, onProgress: function (m) { if (m && m.status === 'recognizing text') setBusy(label + ' — التعرف ' + Math.round((m.progress || 0) * 100) + '%', (k + 0.3 + 0.6 * (m.progress || 0)) / total.length); }
                }).then(function (res) {
                  texts.push({ n: pn, text: res.text }); confs.push(res.conf);
                  log.appendChild(h('div', { text: label + ' — ثقة ' + Math.round(res.conf) + '% · ' + res.lines.length + ' سطر' + (Math.abs(res.angle) >= 0.2 && clean ? ' · صُحّح الميل ' + res.angle.toFixed(1) + '°' : '') }));
                  var g = res.geom;
                  if (clean) {
                    // the cleaned scan replaces the page: same width, height follows the cleaned picture
                    var pw = ps.w, phh = pw * g.h / g.w;
                    return jpegOf(res.prepared.clean || res.prepared.gray, 0.8).then(function (jb) { return out.embedJpg(jb); }).then(function (im) {
                      var pg = out.addPage([pw, phh]); pg.drawImage(im, { x: 0, y: 0, width: pw, height: phh });
                      OcrLayer.addText(out, pg, res.lines, { x0: 0, y0: 0, sx: pw / g.w, sy: phh / g.h, H: phh });
                    });
                  }
                  return out.copyPages(src, [pn - 1]).then(function (cp) {
                    var pg = out.addPage(cp[0]);
                    OcrLayer.addText(out, pg, res.lines, { x0: g.pad, y0: g.pad, sx: ps.w / cv.width / g.kx, sy: ps.h / cv.height / g.ky, H: pg.getHeight() });
                  });
                });
              });
            });
          });
          return chain.then(function () { return out.save(); });
        });
      });
    }).then(function (bytes) {
      var name = T.baseName(doc ? doc.name : 'scan') + '_ocr.pdf', items = [{ label: 'تنزيل ' + name, name: name, data: bytes, mime: 'application/pdf' }];
      if (wantTxt.checked) { var txt = new TextEncoder().encode('﻿' + texts.map(function (t) { return '── صفحة ' + t.n + ' ──\n' + t.text; }).join('\n\n')); items.push({ label: 'تنزيل النص (txt)', name: T.baseName(name) + '.txt', data: txt, mime: 'text/plain' }); }
      var avg = Math.round(confs.reduce(function (a, c) { return a + c; }, 0) / Math.max(1, confs.length));
      resultHost.appendChild(T.resultCard('أصبح الملف قابلاً للبحث', total.length + ' صفحة · متوسط الثقة ' + avg + '% · ' + Math.round((Date.now() - t0) / 1000) + ' ثانية · ' + T.fmtSize(bytes.length), items));
    }, function (e) { T.fail(e, 'تعذّر التعرف على النص'); });
  }
})();
