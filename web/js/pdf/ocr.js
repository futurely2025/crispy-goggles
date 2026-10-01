/* PdfOcr — "نسخ نص (OCR)": drag a box over a scanned question (image PDF) and get its text (Arabic + English), in the browser.
 * Tesseract.js runs from vendor/tesseract (no network); the result can be copied or placed on the page as editable text. */
(function () {
  'use strict';
  var P = window.__pdf, S = P.S, UI = window.PdfUI, esc = UI.esc;
  var base = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/js\/pdf\/ocr\.js.*$/, '') : ''; })();
  var worker = null, workerP = null, curLang = '';

  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('تعذّر تحميل محرك التعرف على النص')); }; document.head.appendChild(s); }); }
  function getWorker(langs) {
    if (worker && curLang === langs) return Promise.resolve(worker);
    if (workerP && curLang === langs) return workerP;
    curLang = langs;
    workerP = (window.Tesseract ? Promise.resolve() : loadScript(base + 'vendor/tesseract/tesseract.min.js?v=5')).then(function () {
      if (worker) { try { worker.terminate(); } catch (e) { /* ignore */ } worker = null; }
      return window.Tesseract.createWorker(langs.split('+'), 1, {
        workerPath: base + 'vendor/tesseract/worker.min.js', corePath: base + 'vendor/tesseract/core', langPath: base + 'vendor/tesseract/lang',
        gzip: true, workerBlobURL: false, cacheMethod: 'none',
        logger: function (m) { if (m && m.status) { var pc = m.progress ? ' ' + Math.round(m.progress * 100) + '%' : ''; P.busy(true, (/recogni/.test(m.status) ? 'جارٍ التعرف على النص…' : 'تحضير محرك التعرف…') + pc); } }
      });
    }).then(function (w) { worker = w; return w; });
    return workerP;
  }

  function crop(cv, r, sc) {
    var x = Math.max(0, Math.round(r.x * sc)), y = Math.max(0, Math.round(r.y * sc)), w = Math.min(cv.width - x, Math.round(r.w * sc)), h = Math.min(cv.height - y, Math.round(r.h * sc));
    var out = document.createElement('canvas'); out.width = Math.max(1, w); out.height = Math.max(1, h);
    var g = out.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height); g.drawImage(cv, x, y, w, h, 0, 0, w, h);
    // grayscale + gentle contrast stretch helps scans
    var d = g.getImageData(0, 0, out.width, out.height), a = d.data, lo = 255, hi = 0, i;
    for (i = 0; i < a.length; i += 4) { var l = (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) | 0; a[i] = a[i + 1] = a[i + 2] = l; if (l < lo) lo = l; if (l > hi) hi = l; }
    if (hi - lo > 40) for (i = 0; i < a.length; i += 4) { var v = Math.max(0, Math.min(255, (a[i] - lo) * 255 / (hi - lo))); a[i] = a[i + 1] = a[i + 2] = v; }
    g.putImageData(d, 0, 0);
    return out;
  }

  function run(i, r) {
    var p = S.pages[i];
    if (r.w < 12 || r.h < 8) return P.toast('ارسم مستطيلاً أكبر حول النص المراد التعرف عليه');
    var lang = (localStorage.getItem('armath.pdf.ocrlang') || 'ara+eng');
    P.busy(true, 'تحضير محرك التعرف…');
    // text size is unknown (a school book vs a poster): try two resolutions and keep the more confident reading
    var big = Math.min(4.2, Math.max(1.5, 2400 / r.w)), small = Math.min(big, Math.max(1, 1000 / r.w)), scales = Math.abs(big - small) < 0.25 ? [big] : [small, big];
    var best = null;
    var chain = Promise.resolve();
    scales.forEach(function (sc) {
      chain = chain.then(function () {
        return P.pageBitmap(i, sc).then(function (cv) {
          var img = crop(cv, r, sc); cv.width = cv.height = 1;
          return getWorker(lang).then(function (w) { return w.recognize(img); });
        }).then(function (res) { if (!best || (res.data.confidence || 0) > (best.data.confidence || 0)) best = res; });
      });
    });
    chain.then(function () { return { res: best }; }).then(function (o) {
      P.busy(false);
      var text = (o.res.data.text || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(), conf = Math.round(o.res.data.confidence || 0);
      if (!text) { P.toast('لم يُعثر على نص — جرّب تحديد منطقة أوضح أو أكبر', true); return; }
      show(i, r, text, conf, lang);
    }).catch(function (e) { P.busy(false); P.toast('تعذّر التعرف على النص: ' + (e && e.message ? e.message : e), true); if (window.ArLog) ArLog.error('ocr', e); });
  }
  function show(i, r, text, conf, lang) {
    UI.open({
      title: 'النص المستخرج', wide: true, ok: 'إدراج كنص على الصفحة', body:
        '<p class="dlg-note">دقة التعرف التقريبية: <b>' + conf + '%</b> — راجع النص وصحّحه قبل الاستخدام (الخطوط المشكّلة أو الصور الرديئة تقلّل الدقة).</p>' +
        '<textarea id="ocrT" rows="9" dir="auto" style="font-size:16px;line-height:1.7">' + esc(text) + '</textarea>' +
        '<div class="fld row"><span>اللغة</span><select id="ocrL"><option value="ara+eng"' + (lang === 'ara+eng' ? ' selected' : '') + '>عربي + إنجليزي</option><option value="ara"' + (lang === 'ara' ? ' selected' : '') + '>عربي فقط</option><option value="eng"' + (lang === 'eng' ? ' selected' : '') + '>إنجليزي فقط</option></select><button type="button" class="btn ghost" id="ocrAgain">إعادة التعرف</button></div>' +
        '<label class="chk"><input type="checkbox" id="ocrCover"> تغطية النص الأصلي بلون الخلفية عند الإدراج</label>',
      extra: '<button type="button" class="btn" id="ocrCopy">⧉ نسخ النص</button>',
      onOpen: function (el, close) {
        el.parentNode.querySelector('#ocrCopy').onclick = function () { var t = el.querySelector('#ocrT'); t.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ } if (!ok && navigator.clipboard) navigator.clipboard.writeText(t.value); P.toast('نُسخ النص'); };
        el.querySelector('#ocrAgain').onclick = function () { try { localStorage.setItem('armath.pdf.ocrlang', el.querySelector('#ocrL').value); } catch (e) { /* ignore */ } close(null); run(i, r); };
      }
    }).then(function (el) {
      if (!el) return;
      var t = el.querySelector('#ocrT').value.trim(); if (!t) return;
      var ar = (t.match(/[؀-ۿ]/g) || []).length > t.length / 4, lines = t.split('\n').length;
      var size = Math.max(9, Math.min(26, Math.round(r.h / Math.max(1, lines) * 0.62)));
      P.push();
      if (el.querySelector('#ocrCover').checked && window.PdfAnnot && PdfAnnot.coverRegion) PdfAnnot.coverRegion(i, r);
      var o = P.born({ id: P.uid(), t: 'text', x: r.x, y: r.y, w: Math.max(80, r.w), text: t, size: size, color: '#1b2a30', bold: false, align: ar ? 'right' : 'left', bg: 'none', font: ar ? 'Amiri' : 'Times New Roman', lh: 1.5 });
      o.h = P.textHeight(o); S.pages[i].objs.push(o); P.changed(); P.markThumb(i); P.drawOverlay(i); P.setTool('select'); P.select(i, o.id);
    });
  }
  window.PdfOcr = { run: run };
})();
