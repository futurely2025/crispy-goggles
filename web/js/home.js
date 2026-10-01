/* Home task pane: MathType-like launcher, selected-equation card, dialog handling, document tools */
(function (global) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var T = function (k) { return I18N.t(k); };
  var settings = Settings.load();
  if (global.WordBridge) { WordBridge.setVector(settings.vector !== false); if (WordBridge.setFigClear) WordBridge.setFigClear(settings.figBg === 'none'); }
  var inWord = false;
  var selected = null;       // meta of the selected equation
  var lastAutoId = null;
  var DEFAULT_NAMES = { sin: 'جا', cos: 'جتا', tan: 'طا', cot: 'طتا', sec: 'قا', csc: 'قتا', log: 'لو', ln: 'لط', lim: 'نها' };

  function applyLang() {
    I18N.setLang(settings.lang);
    RenderHost.lang = settings.lang;
    I18N.apply();
    $('langBtn').textContent = settings.lang === 'en' ? 'ع' : 'EN';
    $('envLabel').textContent = inWord ? T('connected') : T('browserMode');
  }
  function save() { Settings.save(settings); }
  function reload() { settings = Settings.load(); if (global.WordBridge) { WordBridge.setVector(settings.vector !== false); if (WordBridge.setFigClear) WordBridge.setFigClear(settings.figBg === 'none'); } }

  // ------------------------------------------------------------ feedback
  var toastTimer;
  function toast(msg, err) {
    if (err && window.ArLog) ArLog.add('error', msg, { feature: 'toast' });
    var t = $('toast');
    t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, err ? 6000 : 2600);
  }
  function busy(on, text) {
    $('busy').hidden = !on;
    $('busyText').textContent = text || T('working');
    ['mathBtn', 'chemBtn', 'editBtn', 'convertBtn', 'allTexBtn', 'refreshBtn'].forEach(function (id) { $(id).disabled = !!on; });
    Array.prototype.forEach.call(document.querySelectorAll('.tile'), function (b) { b.disabled = !!on; });
  }
  function errMsg(e) { return (e && (e.message || e.code)) ? (e.message || e.code) : String(e); }

  // ------------------------------------------------------------ opening the editor
  function baseUrl() { return location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, ''); }
  function editorData(mode, meta, host) {
    var d = { mode: mode, host: host, lang: settings.lang };
    if (meta) { d.tex = meta.t; d.opts = meta.o; d.editId = meta.id || '__selection__'; d.mode = meta.m || mode; }
    return d;
  }
  var dialog = null;
  function studioData(kind, meta, host, extra) {
    var d = Object.assign({ host: host, lang: settings.lang }, extra || {});
    if (meta && meta.k) { d.data = meta.d; d.editId = meta.id; }
    return d;
  }
  function openPage(page, data, size) {
    reload();
    if (inWord && settings.openIn !== 'pane' && Office.context.ui && Office.context.ui.displayDialogAsync) {
      var url = baseUrl() + page + '.html?host=dialog&v=5.0.0#d=' + encodeURIComponent(JSON.stringify(Object.assign({}, data, { host: 'dialog' })));
      Office.context.ui.displayDialogAsync(url, { height: size ? size[1] : 80, width: size ? size[0] : 62, displayInIframe: false, promptBeforeOpen: false }, function (res) {
        if (res.status !== Office.AsyncResultStatus.Succeeded) {
          toast(T('dialogBlocked'));
          openInPane(page, data);
          return;
        }
        dialog = res.value;
        dialog.addEventHandler(Office.EventType.DialogMessageReceived, function (arg) {
          var msg = null;
          try { msg = JSON.parse(arg.message); } catch (e) { /* ignore */ }
          try { dialog.close(); } catch (e) { /* ignore */ }
          dialog = null;
          handleEditorMessage(msg);
        });
        dialog.addEventHandler(Office.EventType.DialogEventReceived, function () { dialog = null; });
      });
      return;
    }
    openInPane(page, data);
  }
  function openEditor(mode, meta, extra) {
    if (meta && meta.k) return openStudio(meta.k, meta);
    reload();
    openPage('editor', Object.assign(editorData(mode, meta, 'dialog'), extra || {}), [52, 74]);    // 5.4: a smaller, MathType-like window (the editor adapts to any size)
  }
  function openStudio(kind, meta, extra) {
    reload();
    var ex = Object.assign({}, extra || {});
    if (kind === 'circuit') ex.tab = 'circuit';
    if (kind === 'chemfig') ex.tab = 'chemfig';
    openPage(studioPage(kind), studioData(kind, meta, 'dialog', ex), [76, 88]);
  }
  function openInPane(page, data) {
    var f = $('edFrame');
    f.src = page + '.html?host=frame&v=5.0.0#d=' + encodeURIComponent(JSON.stringify(Object.assign({}, data, { host: 'frame' })));
    $('paneEditor').hidden = false;
    $('home').hidden = true;
  }
  function closePane() {
    $('paneEditor').hidden = true;
    $('home').hidden = false;
    $('edFrame').src = 'about:blank';
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || !e.data.armath) return;
    closePane();
    handleEditorMessage(e.data.armath);
  });

  // ------------------------------------------------------------ figures (graphs / geometry / structures)
  function renderFigure(kind, data) { return Figures.render(kind, data); }
  function figLabel(kind) { return Figures.label(kind, settings.lang); }
  function studioPage(kind) { var k = Figures.KINDS[kind]; return k && k.studio ? k.studio : kind; }
  function insertFigure(msg) {
    busy(true);
    var editing = !!msg.editId;
    // a figure keeps its own background (5.4) when it is edited again
    var fbg = msg.bg !== undefined ? msg.bg : (msg.editId && selected && selected.id === msg.editId ? selected.bg : undefined);
    return renderFigure(msg.kind, msg.data).then(function (r) {
      var fsvg = WordBridge.bgSvg ? WordBridge.bgSvg(r.svg, fbg) : WordBridge.figSvg ? WordBridge.figSvg(r.svg) : r.svg;
      var clear = fbg ? fbg === 'none' || fbg === 'transparent' : settings.figBg === 'none';
      return Promise.all([Raster.png(fsvg, r.w, r.h, +settings.dpi || 600, clear), WordBridge.vectorOf(fsvg)]).then(function (res) {
        var p = res[0];
        var mo = { v: 3, id: msg.editId || (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)), k: msg.kind, d: msg.data, o: { display: true } };
        if (fbg) mo.bg = fbg;
        var meta = WordBridge.MARK + JSON.stringify(mo);
        var k2 = Math.min(1, 460 / p.widthPt);
        var item = { r: { pngBase64: p.pngBase64, svgVector: res[1], widthPt: p.widthPt * k2, heightPt: p.heightPt * k2, depthPt: 0 }, meta: meta, line: 0, title: figLabel(msg.kind), figure: true };
        return WordBridge.insert([item], { rtl: false, display: true, center: true }, msg.editId || null);
      });
    }).then(function (res) {
      toast(res && res.replaced ? T('figUpdated') : T('figInserted'));
      setTimeout(checkSelection, 300);
    }).catch(function (e) { toast(T('error') + ': ' + errMsg(e), true); })
      .then(function () { busy(false); });
  }

  function handleEditorMessage(msg) {
    if (msg && msg.type === 'insertFigure') {
      reload();
      if (!inWord) { toast(T('browserMode')); return; }
      return insertFigure(msg);
    }
    if (!msg || msg.type !== 'insert') return;
    reload();
    if (!inWord) { toast(T('browserMode')); return; }
    busy(true);
    var editing = msg.editId && msg.editId !== '';
    var numbered = !!msg.numbered && !editing;
    var o = Object.assign({}, msg.opts || {}, { numbered: !!msg.numbered });
    WordBridge.renderItems(msg.equations, msg.mode, o, +settings.dpi || 600, editing && msg.editId !== '__selection__' ? msg.editId : null)
      .then(function (items) {
        return WordBridge.insert(items, {
          rtl: !!o.rtl && msg.mode !== 'chem', display: !!o.display, textBold: !!msg.textBold,
          textColor: msg.textColor || '', sep: msg.sep, numbered: numbered
        }, msg.editId);
      })
      .then(function (res) {
        var eqs = (msg.equations || []).filter(function (e) { return e.kind !== 'text'; });
        var n = eqs.length, nFig = eqs.filter(function (e) { return e.kind === 'figure' || e.kind === 'table'; }).length;
        var en = settings.lang === 'en', many;
        if (!nFig) many = en ? n + ' equations inserted' : 'تم إدراج ' + n + ' معادلات';
        else if (nFig === n) many = en ? n + ' figures/tables inserted' : 'تم إدراج ' + n + ' رسوم وجداول';
        else many = en ? (n - nFig) + ' equations and ' + nFig + ' figures/tables inserted' : 'تم إدراج ' + (n - nFig) + ' معادلات و' + nFig + ' رسوم وجداول';
        showVecState();
        toast(res && res.replaced ? T('updated') : (n > 1 ? many : (nFig ? T('figInserted') : T('inserted'))));
        setTimeout(checkSelection, 300);
      })
      .catch(function (e) { toast(T('error') + ': ' + errMsg(e), true); })
      .then(function () { busy(false); });
  }

  // ------------------------------------------------------------ selected equation card
  var selTimer = null;
  function onSelectionChanged() { clearTimeout(selTimer); selTimer = setTimeout(checkSelection, 220); }
  function checkSelection() {
    if (!inWord) return;
    WordBridge.selectedEquation().then(function (m) {
      selected = m;
      showCard(m);
      if (m && settings.autoEdit && m.id && m.id !== lastAutoId && !dialog && $('paneEditor').hidden) {
        lastAutoId = m.id;
        if (m.k) openStudio(m.k, m); else openEditor(m.m, m);
      }
      if (!m) lastAutoId = null;
    }).catch(function () { /* ignore */ });
  }
  function showCard(m) {
    $('selCard').hidden = !m;
    $('selHint').hidden = !!m || !inWord;
    if (!m) return;
    var box = $('selPreview');
    box.innerHTML = '';
    var fig = !!m.k;
    $('selMode').textContent = fig ? figLabel(m.k) : (m.m === 'chem' ? T('chem') : T('math'));
    $('selMode').classList.toggle('fig', fig);
    $('selTitle').textContent = fig ? T('selectedFig') : T('selected');
    box.classList.toggle('fig', fig);
    $('copyTexBtn').hidden = fig; $('oneToTexBtn').hidden = fig;
    if (fig) {
      renderFigure(m.k, m.d).then(function (r) {
        if (selected !== m) return;
        box.innerHTML = r.svg;
        var svg = box.firstChild;
        if (svg) { var k = Math.min(1, 260 / r.w, 150 / r.h); svg.setAttribute('width', (r.w * k).toFixed(1)); svg.setAttribute('height', (r.h * k).toFixed(1)); }
      }).catch(function () { box.textContent = '—'; });
      return;
    }
    var o = Object.assign({}, m.o, { mode: m.m, fontSize: 14 });
    RenderHost.preview(m.t, o).then(function (r) {
      if (selected !== m) return;
      box.innerHTML = r.svgString;
      var svg = box.firstChild;
      if (svg) { svg.setAttribute('width', (r.width * 1.3).toFixed(2) + 'em'); svg.setAttribute('height', (r.total * 1.3).toFixed(2) + 'em'); }
    }).catch(function () { box.textContent = m.t; });
  }
  $('editBtn').onclick = function () { if (!selected) return; if (selected.k) openStudio(selected.k, selected); else openEditor(selected.m, selected); };
  $('copyTexBtn').onclick = function () {
    if (!selected) return;
    var t = selected.m === 'chem' ? '\\ce{' + selected.t + '}' : selected.t;
    var done = function () { toast(T('copied')); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () { fallbackCopy(t); done(); });
    else { fallbackCopy(t); done(); }
  };
  // copy the selected equation / figure as a sharp PNG (≈ 300 dpi) to paste into any app
  // copy the selected equation / figure as a picture: 600 dpi (sharp), with its own background or transparent (5.7)
  function copyPic(transparent) {
    if (!selected) return;
    var m = selected;
    var job = m.k ? renderFigure(m.k, m.d).then(function (r) {
      var svg = WordBridge.bgSvg ? WordBridge.bgSvg(r.svg, transparent ? 'none' : m.bg) : r.svg;
      return Raster.png(svg, r.w, r.h, 600, transparent || m.bg === 'none' || (!m.bg && settings.figBg === 'none'));
    }).then(function (p) { return p.dataUrl || ('data:image/png;base64,' + p.pngBase64); })
      : RenderHost.render(m.t, Object.assign({}, m.o, { mode: m.m }, transparent ? { bg: '' } : {}), 600).then(function (r) { return r.dataUrl; });
    job.then(function (url) {
      return fetch(url).then(function (x) { return x.blob(); }).then(function (blob) {
        if (!navigator.clipboard || !window.ClipboardItem) throw new Error('clipboard');
        return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      }).then(function () { toast(transparent ? (settings.lang === 'en' ? 'Copied as a transparent image' : 'نُسخت صورة شفافة') : T('imageCopied')); }, function () {
        var a = document.createElement('a'); a.href = url; a.download = (m.k ? 'figure' : 'equation') + (transparent ? '-transparent' : '') + '.png'; document.body.appendChild(a); a.click(); a.remove();
      });
    }).catch(function (e) { toast(T('error') + ': ' + errMsg(e), true); });
  }
  $('copyPicBtn').onclick = function () { copyPic(false); };
  function fallbackCopy(t) {
    var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
  }
  $('oneToTexBtn').onclick = function () {
    if (!selected) return;
    busy(true);
    WordBridge.toLatex(selected.id || null).then(function () { checkSelection(); })
      .catch(function (e) { toast(errMsg(e), true); }).then(function () { busy(false); });
  };
  $('delBtn').onclick = function () {
    if (!selected || !selected.id) return;
    WordBridge.deleteById(selected.id).then(checkSelection).catch(function (e) { toast(errMsg(e), true); });
  };

  // ------------------------------------------------------------ document tools
  function curOpts() {
    reload();
    return {
      rtl: settings.rtl, digits: settings.digits, arabicFunctions: settings.arabicFunctions, arabicComma: settings.arabicComma,
      sumStyle: settings.sumStyle, font: settings.font, mathFont: settings.mathFont, fontSize: settings.fontSize,
      color: settings.color, bold: settings.bold, names: Object.assign({}, DEFAULT_NAMES, settings.names || {})
    };
  }
  $('convertBtn').onclick = function () {
    busy(true);
    reload();
    var en = settings.lang === 'en';
    WordBridge.convertDollars(curOpts(), +settings.dpi || 600, function (i, n) {
      $('busyText').textContent = (en ? 'Converting ' : 'جارٍ التحويل ') + i + ' / ' + n;
    }).then(function (r) {
      if (r.failed && window.ArLog) ArLog.warn('convert', (r.errors || []).slice(0, 12).map(function (x) { return typeof x === 'string' ? x : JSON.stringify(x); }).join(' | '));
      if (!r.done && !r.failed) toast(en ? 'No formulas found ($…$, \\(…\\), $$…$$, \\begin{…})' : 'لم يتم العثور على صيغ مكتوبة ($…$ أو \\(…\\) أو $$…$$ أو \\begin{…})');
      else toast((en ? 'Converted: ' : 'تم تحويل: ') + r.done + (r.failed ? (en ? ' — not converted: ' + r.failed + ' (highlighted, with a comment)' : ' — تعذّر: ' + r.failed + ' (مظللة بالأصفر مع تعليق يوضح السبب)') : ''), r.failed > 0);
    }).catch(function (e) { toast(errMsg(e), true); }).then(function () { busy(false); });
  };
  $('allTexBtn').onclick = function () {
    busy(true);
    WordBridge.toLatex(null).then(function (n) { toast((settings.lang === 'en' ? 'Equations: ' : 'عدد المعادلات: ') + n); })
      .catch(function (e) { toast(errMsg(e), true); }).then(function () { busy(false); });
  };
  $('refreshBtn').onclick = function () {
    busy(true);
    WordBridge.refreshAll(curOpts(), +settings.dpi || 600).then(function (n) { toast((settings.lang === 'en' ? 'Updated: ' : 'تم تحديث: ') + n); })
      .catch(function (e) { toast(errMsg(e), true); }).then(function () { busy(false); });
  };

  // ------------------------------------------------------------ settings panel
  function syncSettings() {
    $('sOpenIn').value = settings.openIn;
    $('sLang').value = settings.lang;
    $('sDpi').value = String(settings.dpi);
    $('sSum').value = settings.sumStyle;
    $('sAutoEdit').checked = !!settings.autoEdit;
    $('sVector').checked = settings.vector !== false;
    showVecState();
    if ($('sFigClear')) $('sFigClear').checked = settings.figBg === 'none';
    var grid = $('namesGrid');
    grid.innerHTML = '';
    var names = Object.assign({}, DEFAULT_NAMES, settings.names || {});
    Object.keys(DEFAULT_NAMES).forEach(function (k) {
      var l = document.createElement('label');
      l.textContent = '\\' + k;
      var inp = document.createElement('input');
      inp.value = names[k];
      inp.onchange = function () {
        reload();
        settings.names = Object.assign({}, DEFAULT_NAMES, settings.names || {});
        settings.names[k] = this.value.trim() || DEFAULT_NAMES[k];
        this.value = settings.names[k];
        save();
      };
      l.appendChild(inp);
      grid.appendChild(l);
    });
  }
  function bindSetting(id, key, conv) {
    $(id).onchange = function () {
      reload();
      settings[key] = conv ? conv(this) : this.value;
      save();
      if (key === 'lang') { applyLang(); syncSettings(); if (selected) showCard(selected); }
    };
  }
  bindSetting('sOpenIn', 'openIn');
  bindSetting('sLang', 'lang');
  bindSetting('sDpi', 'dpi', function (el) { setTimeout(showVecState, 0); return +el.value; });
  bindSetting('sSum', 'sumStyle');
  bindSetting('sAutoEdit', 'autoEdit', function (el) { return el.checked; });
  bindSetting('sVector', 'vector', function (el) { WordBridge.resetSvg(); setTimeout(showVecState, 0); return el.checked; });
  // what the next insertion will be: the picture is vector (SVG, sharp at any zoom/print) or the PNG fallback at the chosen dpi
  function showVecState() {
    var el = $('vecState'); if (!el || !window.WordBridge) return;
    var st = WordBridge.vectorState(), en = settings.lang === 'en', dpi = +settings.dpi || 900;
    var msg = {
      on: en ? '✓ Vector (SVG) is active: equations stay sharp at any zoom and in print. The ' + dpi + ' dpi picture is only a fallback for older Word.' : '✓ الإدراج المتّجه (SVG) مفعّل: المعادلة حادّة عند أي تكبير وفي الطباعة. صورة ' + dpi + ' dpi احتياطية لإصدارات Word القديمة فقط.',
      off: en ? 'Vector is off: equations are inserted as a ' + dpi + ' dpi picture. Turn the switch on for the sharpest result.' : 'المتّجه مُعطّل: تُدرج المعادلات كصورة بدقة ' + dpi + ' dpi. فعّل المفتاح للحصول على أعلى وضوح.',
      failed: en ? 'Word refused SVG earlier, so a ' + dpi + ' dpi picture is used (retried after a day). Toggle the switch off and on to retry now. Tip: in Word → File → Options → Advanced → Image size and quality, tick "Do not compress images in file".' : 'رفض Word الـ SVG سابقاً فتُدرج صورة ' + dpi + ' dpi (تُعاد المحاولة بعد يوم). أطفئ المفتاح ثم شغّله لإعادة المحاولة الآن. نصيحة: من Word ← ملف ← خيارات ← خيارات متقدمة ← «حجم الصورة وجودتها» فعّل «عدم ضغط الصور في الملف».',
      unsupported: en ? 'Vector conversion is not available in this browser engine: a ' + dpi + ' dpi picture is used.' : 'التحويل المتّجه غير متاح في محرك المتصفح هنا: تُدرج صورة ' + dpi + ' dpi.'
    };
    el.textContent = msg[st] || '';
    el.style.color = st === 'on' ? 'var(--tq-3)' : 'var(--danger)';
  }
  // figures without a white background: new figures follow the switch, and the ones already in the document are redrawn
  if ($('sFigClear')) $('sFigClear').onchange = function () {
    reload();
    settings.figBg = this.checked ? 'none' : '';
    save(); reload();
    if (!inWord) return;
    busy(true);
    var en = settings.lang === 'en';
    WordBridge.refreshFigures(+settings.dpi || 600).then(function (n) {
      toast(n ? (en ? 'Figures updated: ' : 'تم تحديث خلفية الرسوم: ') + n : (en ? 'Applies to the figures you insert from now on' : 'سيُطبَّق على الرسوم التي تدرجها من الآن'));
    }).catch(function (e) { toast(errMsg(e), true); }).then(function () { busy(false); });
  };
  $('resetNames').onclick = function () { reload(); settings.names = null; save(); syncSettings(); };
  $('langBtn').onclick = function () {
    reload(); settings.lang = settings.lang === 'en' ? 'ar' : 'en'; save(); applyLang(); syncSettings();
    if (selected) showCard(selected);
  };

  $('aiGuideBtn').onclick = function () {
    var u = baseUrl() + 'ai-format.html';
    try {
      if (inWord && Office.context.ui && Office.context.ui.openBrowserWindow) { Office.context.ui.openBrowserWindow(u); return; }
    } catch (e) { /* fall back */ }
    window.open(u, '_blank');
  };
  $('mathBtn').onclick = function () { openEditor('math', null); };
  Array.prototype.forEach.call(document.querySelectorAll('.tile[data-studio]'), function (b) {
    b.onclick = function () {
      var k = b.getAttribute('data-studio');
      if (k === 'solve') openEditor('math', null, { solve: true, input: 'latex' });
      else if (k === 'calc') openStudio('chart', null, { tab: 'calc' });
      else openStudio(k, null);
    };
  });
  $('chemBtn').onclick = function () { openEditor('chem', null); };
  // the PDF studio is a full-page tool: it opens in the browser (it does not insert into Word)
  $('pdfTile').onclick = function () {
    var u = baseUrl() + 'pdf.html';
    try { if (inWord && Office.context.ui && Office.context.ui.openBrowserWindow) { Office.context.ui.openBrowserWindow(u); return; } } catch (e) { /* fall back */ }
    window.open(u, '_blank');
  };

  $('pdfToolsTile').onclick = function () {
    var u = baseUrl() + 'tools/index.html';
    try { if (inWord && Office.context.ui && Office.context.ui.openBrowserWindow) { Office.context.ui.openBrowserWindow(u); return; } } catch (e) { /* fall back */ }
    window.open(u, '_blank');
  };

  // ------------------------------------------------------------ boot
  applyLang();
  syncSettings();
  showCard(null);
  var hideLoader = function () { var l = $('loader'); if (l) { l.classList.add('done'); setTimeout(function () { l.hidden = true; }, 400); } };
  RenderHost.warm((settings && settings.mathFont) || 'stix2').then(hideLoader, hideLoader);
  setTimeout(hideLoader, 4000);
  if (window.Office && Office.onReady) {
    Office.onReady(function (info) {
      if (info && info.host === Office.HostType.Word) {
        inWord = true;
        applyLang();
        try { Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, onSelectionChanged); } catch (e) { /* ignore */ }
        checkSelection();
      }
    });
  }
  window.__home = { curOpts: function () { return curOpts(); }, copyPic: copyPic, toast: toast, busy: busy, get settings() { return settings; }, get selected() { return selected; }, handleEditorMessage: handleEditorMessage, openEditor: openEditor, openStudio: openStudio, checkSelection: checkSelection, renderFigure: renderFigure, showCard: showCard };
})(window);
