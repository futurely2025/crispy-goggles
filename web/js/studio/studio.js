/*
 * Studio — shared plumbing for the figure studios (graph / geometry / structure):
 * host detection, sending the result to Word (through the task pane), web fallback (copy/download), toast.
 */
(function (global) {
  'use strict';
  function parseHash() {
    var m = location.hash.match(/#d=(.*)$/);
    if (!m) return {};
    try { return JSON.parse(decodeURIComponent(m[1])) || {}; } catch (e) { return {}; }
  }
  var init = parseHash();
  var host = init.host || new URLSearchParams(location.search).get('host') || (window.parent !== window ? 'frame' : 'web');
  if (window.I18N && init.lang) { try { I18N.setLang(init.lang); } catch (e) { /* ignore */ } }

  var officeReady = new Promise(function (res) {
    if (window.Office && Office.onReady) Office.onReady(function () { res(true); }); else res(false);
    setTimeout(function () { res(false); }, 8000);
  });

  var toastTimer;
  function toast(msg, err) {
    if (err && window.ArLog) ArLog.add('error', msg, { feature: 'toast' });
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, err ? 6000 : 2400);
  }

  function sdkPost(msg) {
    try {
      if (window.parent !== window) { window.parent.postMessage({ armath: msg }, init.origin || '*'); return true; }
      if (window.ArMath && window.ArMath.postMessage) { window.ArMath.postMessage(JSON.stringify(msg)); return true; }
      if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); return true; }
      if (window.chrome && window.chrome.webview) { window.chrome.webview.postMessage(msg); return true; }
    } catch (e) { /* ignore */ }
    return false;
  }
  function send(msg) {
    if (host === 'dialog' && window.Office) {
      officeReady.then(function () {
        try { Office.context.ui.messageParent(JSON.stringify(msg)); } catch (e) { toast(e.message, true); }
      });
      return true;
    }
    if (host === 'frame' && window.parent !== window) { window.parent.postMessage({ armath: msg }, location.origin); return true; }
    return false;
  }

  function download(name, url) {
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function copyPng(dataUrl) {
    return fetch(dataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
      if (navigator.clipboard && window.ClipboardItem) return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      throw new Error('clipboard');
    });
  }
  function dpi() { try { return +(Settings.load().dpi) || 600; } catch (e) { return 600; } }

  /** kind: graph|geometry|structure ; data: JSON spec ; produce(): Promise<{svg,w,h}> */
  function finish(kind, data, produce, name) {
    if (host === 'sdk') {
      return produce().then(function (r) {
        return Raster.png(r.svg, r.w, r.h, init.dpi || 300).then(function (p) {
          sdkPost({ type: 'result', kind: kind, data: data, svg: r.svg, png: p.dataUrl, widthPt: p.widthPt, heightPt: p.heightPt });
        });
      });
    }
    if (send({ type: 'insertFigure', kind: kind, data: data, editId: init.editId || null })) return Promise.resolve();
    // plain browser: copy the picture (or download it)
    return produce().then(function (r) {
      return Raster.png(r.svg, r.w, r.h, 300).then(function (p) {
        return copyPng(p.dataUrl).then(function () { toast(I18N.lang === 'en' ? 'Image copied' : 'تم نسخ الصورة — الصقها في Word'); },
          function () { download((name || kind) + '.png', p.dataUrl); });
      });
    });
  }
  function cancel() {
    if (host === 'sdk') return sdkPost({ type: 'cancel' });
    if (!send({ type: 'cancel' })) history.length > 1 ? history.back() : window.close();
  }
  function exportAs(fmt, produce, name) {
    return produce().then(function (r) {
      if (fmt === 'svg') {
        // stand-alone vector file: text as outlines, no fonts or CSS needed to open it anywhere
        var vec = window.Vector ? Promise.resolve() : new Promise(function (res, rej) { var sc = document.createElement('script'); sc.src = 'js/core/vector.js?v=5.0.0'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
        return vec.then(function () { return window.Vector.fromSVG(r.svg); }).catch(function () { return r.svg; }).then(function (svg) {
          download((name || 'figure') + '.svg', URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })));
        });
      }
      return Raster.png(r.svg, r.w, r.h, dpi()).then(function (p) {
        if (fmt === 'copy') return copyPng(p.dataUrl).then(function () { toast(I18N.lang === 'en' ? 'Image copied' : 'تم نسخ الصورة'); }, function () { toast('clipboard', true); });
        download((name || 'figure') + '.png', p.dataUrl);
      });
    }).catch(function (e) { toast(e.message, true); });
  }
  function hideLoader() {
    var l = document.getElementById('loader');
    if (l && !l.hidden) { l.classList.add('done'); setTimeout(function () { l.hidden = true; }, 400); }
  }

  function lang() { return (window.I18N && I18N.lang === 'en') ? 'en' : 'ar'; }
  function tr(s) { var p = String(s).split('|'); return lang() === 'en' && p[1] !== undefined ? p[1] : p[0]; }
  function applyT(root) {
    root = root || document;
    Array.prototype.forEach.call(root.querySelectorAll('[data-t]'), function (el) { el.textContent = tr(el.getAttribute('data-t')); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-ph]'), function (el) { el.placeholder = tr(el.getAttribute('data-ph')); });
    if (root === document) { document.documentElement.dir = lang() === 'en' ? 'ltr' : 'rtl'; document.documentElement.lang = lang(); }
  }
  function popAt(pop, btn) {
    var r = btn.getBoundingClientRect();
    pop.hidden = false;
    var w = pop.offsetWidth;
    pop.style.top = (r.bottom + 6) + 'px';
    pop.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + 'px';
    setTimeout(function () {
      var off = function (e) { if (!pop.contains(e.target)) { pop.hidden = true; document.removeEventListener('mousedown', off); } };
      document.addEventListener('mousedown', off);
    }, 0);
  }

  // equation options from the add-in settings (used when a studio inserts equations / tables / step lists)
  function eqOpts() {
    var st = {};
    try { st = Settings.load(); } catch (e) { /* ignore */ }
    var names = Object.assign({ sin: 'جا', cos: 'جتا', tan: 'طا', cot: 'طتا', sec: 'قا', csc: 'قتا', log: 'لو', ln: 'لط', lim: 'نها' }, st.names || {});
    return { rtl: st.rtl !== false, digits: st.digits || 'western', arabicFunctions: st.arabicFunctions !== false, arabicComma: st.arabicComma !== false,
      sumStyle: st.sumStyle || 'mirror', font: st.font || 'Amiri', mathFont: st.mathFont || 'stix2', fontSize: st.fontSize || 14,
      color: st.color || '#000000', bold: !!st.bold, display: true, names: names, mode: 'math' };
  }
  /** insert a list of document items: {kind:'text', text} | {tex} | {kind:'figure', fig, data} | {kind:'table', table} */
  function insertItems(items, extra) {
    items = (items || []).map(function (it, i) { return Object.assign({ line: i }, it); });
    var msg = Object.assign({ type: 'insert', mode: 'math', equations: items, opts: eqOpts(), layout: 'stack', sep: 'space', textBold: false, textColor: '', numbered: false, editId: null }, extra || {});
    if (host === 'sdk') { sdkPost({ type: 'items', items: items }); return true; }
    if (send(msg)) return true;
    toast(tr('افتح الأداة من Word لإدراج النتائج مباشرة|Open from Word to insert'), true);
    return false;
  }

  /**
   * Code panel: shows the figure as "LaTeX" markup and applies edits back.
   *   Studio.codePanel({ el, kind, get: () => data, set: (data) => void })  ->  { refresh() }
   */
  function codePanel(o) {
    var box = o.el;
    box.innerHTML = '<textarea class="code" spellcheck="false" dir="ltr"></textarea>' +
      '<div class="code-bar"><span class="code-msg"></span><button type="button" class="chip" data-a="copy">' + tr('نسخ|Copy') + '</button>' +
      '<button type="button" class="chip" data-a="reset">' + tr('من الرسم|From figure') + '</button></div>';
    var ta = box.querySelector('textarea'), msg = box.querySelector('.code-msg'), editing = false, timer = null, last = '';
    function refresh() {
      if (editing) return;
      Figures.serialize(o.kind, o.get()).then(function (code) { last = code; if (!editing) ta.value = code; msg.textContent = ''; msg.className = 'code-msg'; })
        .catch(function (e) { msg.textContent = e.message; });
    }
    function apply() {
      var src = ta.value;
      if (!src.trim() || src === last) return;
      var sc = Figures.scan(src);
      var b = sc.blocks.filter(function (x) { return x.type === 'figure'; })[0];
      if (!b) { msg.textContent = tr('لم أجد رسماً في الكود|No figure found'); msg.className = 'code-msg err'; return; }
      Figures.prepare(b).then(function (m) {
        if (m.kind !== o.kind && !(o.accept && o.accept.indexOf(m.kind) >= 0)) throw new Error(tr('هذا الكود لأداة أخرى: |Code belongs to another tool: ') + Figures.label(m.kind, lang()));
        last = src;
        o.set(m.data, m.kind);
        msg.textContent = tr('✓ تم التطبيق|✓ Applied'); msg.className = 'code-msg ok';
      }).catch(function (e) { msg.textContent = e.message; msg.className = 'code-msg err'; });
    }
    ta.addEventListener('input', function () { editing = true; clearTimeout(timer); timer = setTimeout(apply, 650); });
    ta.addEventListener('blur', function () { clearTimeout(timer); apply(); editing = false; });
    ta.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); clearTimeout(timer); apply(); } });
    box.querySelector('[data-a=copy]').onclick = function () {
      var t = ta.value;
      (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast(tr('تم النسخ|Copied')); }, function () {
        ta.select(); try { document.execCommand('copy'); toast(tr('تم النسخ|Copied')); } catch (e) { /* ignore */ }
      });
    };
    box.querySelector('[data-a=reset]').onclick = function () { editing = false; refresh(); };
    return { refresh: refresh, apply: apply, el: ta };
  }

  global.Studio = { eqOpts: eqOpts, insertItems: insertItems, codePanel: codePanel, lang: lang, tr: tr, applyT: applyT, popAt: popAt, init: init, host: host, send: send, finish: finish, cancel: cancel, toast: toast, exportAs: exportAs, hideLoader: hideLoader, dpi: dpi };
})(window);
