/* PdfOcr — «نسخ نص (OCR)» in the studio: a region, the whole page or the whole file → editable Arabic/English text.
 * The recognition itself lives in ocr-engine.js (image preparation, LSTM passes, voting, dictionary repair); this file is the interface:
 * mode / language / digits choices, the original picture next to the text, a review list of doubtful words with suggestions,
 * and insertion on the page as an editable text object. */
(function () {
  'use strict';
  var P = window.__pdf, S = P.S, UI = window.PdfUI, esc = UI.esc, E = window.PdfOcrEngine;
  var KEY = 'armath.pdf.ocr2';
  var cfg = { mode: 'fast', lang: 'auto', digits: 'keep' };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* ignore */ }
  function saveCfg() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ } }
  var running = false;

  var MODE_NAMES = { fast: 'سريع (الافتراضي)', accurate: 'دقيق', max: 'أقصى دقة (أبطأ)' };
  function sel(id, items, val) { return '<select id="' + id + '">' + items.map(function (it) { return '<option value="' + it[0] + '"' + (it[0] === val ? ' selected' : '') + '>' + it[1] + '</option>'; }).join('') + '</select>'; }

  function status(msg) { P.busy(true, msg); }
  /** crop a rendered page canvas to the region (points → pixels) */
  function crop(cv, r, sc) {
    var x = Math.max(0, Math.round(r.x * sc)), y = Math.max(0, Math.round(r.y * sc)), w = Math.min(cv.width - x, Math.round(r.w * sc)), h = Math.min(cv.height - y, Math.round(r.h * sc));
    var out = document.createElement('canvas'); out.width = Math.max(1, w); out.height = Math.max(1, h);
    var g = out.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height); g.drawImage(cv, x, y, w, h, 0, 0, w, h);
    return out;
  }
  function renderScale(r) { var sc = Math.min(4.6, Math.max(2, 2600 / Math.max(40, r.w))); while ((r.w * sc) * (r.h * sc) > 22e6 && sc > 1.2) sc *= 0.9; return sc; }
  /** recognise one picture with the current settings (language "auto" is handled by the engine) */
  function recognizeImage(img, over) {
    var o = Object.assign({ mode: cfg.mode, digits: cfg.digits, lang: cfg.lang }, over || {});
    o.onStatus = status;
    o.onProgress = function (m) { if (m && m.status === 'recognizing text') status('جارٍ التعرف على النص… ' + Math.round((m.progress || 0) * 100) + '%'); else if (m && /load|init/.test(m.status)) status('تحضير محرك التعرف (أول مرة فقط)…'); };
    return E.recognize(img, o);
  }

  // ================================================================ region / page
  function run(i, r, over) {
    if (running) return P.toast('عملية تعرّف جارية — انتظر انتهاءها');
    if (r.w < 12 || r.h < 8) return P.toast('ارسم مستطيلاً أكبر حول النص المراد التعرف عليه');
    if (!E) return P.toast('محرك التعرف غير متاح', true);
    running = true; status('تحضير الصورة…');
    var sc = renderScale(r), thumb = null;
    P.pageBitmap(i, sc).then(function (cv) {
      var img = crop(cv, r, sc); cv.width = cv.height = 1;
      var t = document.createElement('canvas'), k = Math.min(1, 900 / img.width, 160 / img.height); t.width = Math.max(1, Math.round(img.width * k)); t.height = Math.max(1, Math.round(img.height * k)); t.getContext('2d').drawImage(img, 0, 0, t.width, t.height); thumb = img.height < img.width * 0.7 || img.width < 700 ? t.toDataURL('image/jpeg', 0.85) : null;
      return recognizeImage(img, over);
    }).then(function (res) {
      running = false; P.busy(false);
      if (!res.text.trim()) { P.toast('لم يُعثر على نص — جرّب تحديد منطقة أوضح أو أكبر، أو اختر «أقصى دقة»', true); return; }
      show(i, r, res, thumb);
    }).catch(function (e) { running = false; P.busy(false); P.toast('تعذّر التعرف على النص: ' + (e && e.message ? e.message : e), true); if (window.ArLog) ArLog.error('ocr', e); });
  }
  function runPage(i) {
    if (!S.pdf) return P.toast('افتح ملف PDF أولاً');
    i = i === undefined ? S.cur : i;
    var c = P.cropOf(S.pages[i]); run(i, { x: c.x, y: c.y, w: c.w, h: c.h });
  }

  // ================================================================ review of doubtful words
  function doubtful(res) {
    var out = [], seen = {};
    res.words.forEach(function (w) {
      var t = (w.text || '').replace(/^[^ء-يa-zA-Z0-9]+|[^ء-يa-zA-Z0-9]+$/g, '');
      if (t.length < 2 || w.conf >= 76 || seen[t]) return;
      seen[t] = 1; out.push({ text: t, conf: Math.round(w.conf), alt: w.alt, fixed: w.fixed, orig: w.orig });
    });
    out.sort(function (a, b) { return a.conf - b.conf; });
    return out.slice(0, 24);
  }
  function suggestions(w) {
    var s = [];
    if (w.alt) s.push(w.alt);
    if (w.orig && w.orig !== w.text) s.push(w.orig);
    if (/^[ء-ي]+$/.test(w.text) && E.candidates) {
      var c = E.candidates(w.text), keys = Object.keys(c).filter(function (k) { return E.known(k); });
      keys.sort(function (a, b) { return (c[a] * 3 + Math.log(2 + E.rank(a)) * 0.55) - (c[b] * 3 + Math.log(2 + E.rank(b)) * 0.55); });
      keys.slice(0, 4).forEach(function (k) { if (s.indexOf(k) < 0) s.push(k); });
    }
    return s.filter(function (x) { return x !== w.text; }).slice(0, 4);
  }
  function replaceWord(ta, from, to) {
    var v = ta.value, re = new RegExp('(^|[\\s،؛؟.,:;!()\\[\\]«»"\'])' + from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[\\s،؛؟.,:;!()\\[\\]«»"\'])'), m = re.exec(v);
    if (!m) return false;
    var at = m.index + m[1].length; ta.value = v.slice(0, at) + to + v.slice(at + from.length); ta.focus(); ta.setSelectionRange(at, at + to.length); return true;
  }
  function locate(ta, word) { var at = ta.value.indexOf(word); if (at >= 0) { ta.focus(); ta.setSelectionRange(at, at + word.length); var lh = parseFloat(getComputedStyle(ta).lineHeight) || 24, line = ta.value.slice(0, at).split('\n').length; ta.scrollTop = Math.max(0, (line - 2) * lh); } }

  // ================================================================ result dialog
  function show(i, r, res, thumb) {
    var text = res.text, conf = Math.round(res.conf), fixes = res.lines.reduce(function (n, l) { return n + (l.fixes ? l.fixes.length : 0); }, 0), voted = res.lines.reduce(function (n, l) { return n + (l.voted || 0); }, 0);
    var tone = conf >= 90 ? '#1f8a4c' : conf >= 75 ? '#b8860b' : '#c2352b';
    UI.open({
      title: 'النص المستخرج', wide: true, ok: 'إدراج كنص على الصفحة', body:
        (thumb ? '<div class="ocr-src"><img src="' + thumb + '" alt="المنطقة الأصلية"></div>' : '') +
        '<p class="dlg-note ocr-stat"><b style="color:' + tone + '">الثقة ' + conf + '%</b> · ' + res.lines.length + ' سطر · ' +         (fixes ? 'صُحّحت ' + fixes + ' كلمة آلياً · ' : '') + (voted ? 'حُسمت ' + voted + ' كلمة بين عدة قراءات · ' : '') + (Math.abs(res.angle) >= 0.2 ? 'عُدّل ميل الصورة ' + res.angle.toFixed(1) + '° · ' : '') + (res.ms / 1000).toFixed(1) + ' ث</p>' +
        '<textarea id="ocrT" rows="8" dir="auto" style="font-size:16px;line-height:1.7">' + esc(text) + '</textarea>' +
        '<div class="fld row ocr-opts"><span>الجودة</span>' + sel('ocrM', [['fast', MODE_NAMES.fast], ['accurate', MODE_NAMES.accurate], ['max', MODE_NAMES.max]], cfg.mode) +
        '<span>اللغة</span>' + sel('ocrL', [['auto', 'تلقائي'], ['ara', 'عربي'], ['ara+eng', 'عربي + إنجليزي'], ['eng', 'إنجليزي']], cfg.lang) +
        '<span>الأرقام</span>' + sel('ocrD', [['keep', 'كما هي'], ['western', '0 1 2 3'], ['indic', '٠ ١ ٢ ٣']], cfg.digits) +
        '<button type="button" class="btn ghost" id="ocrAgain">↻ أعد التعرف</button></div>' +
        '<label class="chk"><input type="checkbox" id="ocrCover"> تغطية النص الأصلي بلون الخلفية عند الإدراج</label>',
      extra: '<button type="button" class="btn" id="ocrCopy">⧉ نسخ النص</button><button type="button" class="btn" id="ocrTxt">⬇ ملف txt</button>',
      onOpen: function (el, close) {
        var ta = el.querySelector('#ocrT'), box = el.parentNode;
        box.querySelector('#ocrCopy').onclick = function () { ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ } if (!ok && navigator.clipboard) navigator.clipboard.writeText(ta.value); P.toast('نُسخ النص'); };
        box.querySelector('#ocrTxt').onclick = function () { P.download(new Blob(['﻿' + ta.value], { type: 'text/plain;charset=utf-8' }), (S.name || 'ocr').replace(/\.pdf$/i, '') + '-ocr.txt'); };
        el.querySelector('#ocrAgain').onclick = function () { cfg.mode = el.querySelector('#ocrM').value; cfg.lang = el.querySelector('#ocrL').value; cfg.digits = el.querySelector('#ocrD').value; saveCfg(); close(null); run(i, r); };
      }
    }).then(function (el) {
      if (!el) return;
      var t = el.querySelector('#ocrT').value.trim(); if (!t) return;
      var ar = (t.match(/[؀-ۿ]/g) || []).length > t.length / 4, lines = t.split('\n').filter(function (x) { return x.trim(); }).length;
      var size = Math.max(9, Math.min(26, Math.round(r.h / Math.max(1, lines) * 0.62)));
      P.push();
      if (el.querySelector('#ocrCover').checked && window.PdfAnnot && PdfAnnot.coverRegion) PdfAnnot.coverRegion(i, r);
      var o = P.born({ id: P.uid(), t: 'text', x: r.x, y: r.y, w: Math.max(80, r.w), text: t, size: size, color: '#1b2a30', bold: false, align: ar ? 'right' : 'left', bg: 'none', font: ar ? 'Amiri' : 'Times New Roman', lh: 1.5 });
      o.h = P.textHeight(o); S.pages[i].objs.push(o); P.changed(); P.markThumb(i); P.drawOverlay(i); P.setTool('select'); P.select(i, o.id);
    });
  }

  // ================================================================ every page → one text
  function runAll() {
    if (!S.pdf) return P.toast('افتح ملف PDF أولاً');
    if (running) return P.toast('عملية تعرّف جارية');
    var n = S.pages.length, out = [], k = 0, t0 = Date.now();
    UI.open({
      title: 'استخراج نص كل الصفحات', ok: 'ابدأ', body: '<p class="dlg-note">يقرأ كل صفحة بمحرك التعرف الدقيق ويجمع النص كله في ملف واحد. الصفحات الكثيرة تستغرق وقتاً (نحو ' + (cfg.mode === 'max' ? '40' : cfg.mode === 'fast' ? '5' : '15') + ' ثانية للصفحة).</p>' +
        '<div class="fld row"><span>الجودة</span>' + sel('oaM', [['fast', MODE_NAMES.fast], ['accurate', MODE_NAMES.accurate], ['max', MODE_NAMES.max]], cfg.mode) + '<span>اللغة</span>' + sel('oaL', [['auto', 'تلقائي'], ['ara', 'عربي'], ['ara+eng', 'عربي + إنجليزي'], ['eng', 'إنجليزي']], cfg.lang) + '</div>' +
        '<div class="fld row"><span>الصفحات</span><input id="oaR" dir="ltr" placeholder="الكل — أو مثلاً 1-5, 8"></div>'
    }).then(function (el) {
      if (!el) return;
      cfg.mode = el.querySelector('#oaM').value; cfg.lang = el.querySelector('#oaL').value; saveCfg();
      var list = [], rg = el.querySelector('#oaR').value.trim();
      if (rg) rg.split(/[,،]/).forEach(function (part) { var m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/); if (m) { var a = +m[1], b = m[2] ? +m[2] : a; for (var q = a; q <= b; q++) if (q >= 1 && q <= n) list.push(q - 1); } });
      else for (var q = 0; q < n; q++) list.push(q);
      if (!list.length) return P.toast('نطاق الصفحات غير صحيح', true);
      running = true; var cancelled = false;
      function next() {
        if (k >= list.length) {
          running = false; P.busy(false);
          var all = out.map(function (o) { return '── صفحة ' + (o.i + 1) + ' ──\n' + o.text; }).join('\n\n');
          return UI.open({ title: 'تم استخراج النص (' + out.length + ' صفحة)', wide: true, ok: 'تنزيل txt', body: '<p class="dlg-note">' + out.length + ' صفحة في ' + Math.round((Date.now() - t0) / 1000) + ' ثانية — متوسط الثقة ' + Math.round(out.reduce(function (a, o) { return a + o.conf; }, 0) / Math.max(1, out.length)) + '%</p><textarea id="oaT" rows="14" dir="auto" style="font-size:15px;line-height:1.7">' + esc(all) + '</textarea>' })
            .then(function (d) { if (d) P.download(new Blob(['﻿' + d.querySelector('#oaT').value], { type: 'text/plain;charset=utf-8' }), (S.name || 'ocr').replace(/\.pdf$/i, '') + '-ocr.txt'); });
        }
        var i = list[k], c = P.cropOf(S.pages[i]), sc = renderScale(c);
        status('صفحة ' + (k + 1) + ' من ' + list.length + '…');
        return P.pageBitmap(i, sc).then(function (cv) { var img = crop(cv, c, sc); cv.width = cv.height = 1; return recognizeImage(img); }).then(function (res) { out.push({ i: i, text: res.text, conf: res.conf }); k++; return next(); });
      }
      next().catch(function (e) { running = false; P.busy(false); P.toast('توقّف الاستخراج: ' + (e && e.message ? e.message : e), true); });
    });
  }

  window.PdfOcr = { run: run, runPage: runPage, runAll: runAll, config: cfg };
  // ribbon entry points (buttons are in pdf.html)
  function hook() {
    var b1 = document.getElementById('ocrPageBtn'), b2 = document.getElementById('ocrAllBtn');
    if (b1) b1.onclick = function () { runPage(); };
    if (b2) b2.onclick = runAll;
  }
  hook();
})();
