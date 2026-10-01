/* Task pane: «الفحص الذاتي» (self-test inside the pane, with read-only Word checks) and «سجل الأخطاء» (view / copy / clear). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function en() { return !!(window.I18N && I18N.lang === 'en'); }
  function L(ar, e) { return en() ? e : ar; }
  function inWord() { try { return !!(window.Office && Office.context && Office.context.host); } catch (e) { return false; } }

  function wordInfo() {
    if (!inWord() || !window.Word) return Promise.resolve(null);
    var info = {};
    try {
      var d = Office.context.diagnostics || {};
      info.host = d.host || 'Word'; info.platform = d.platform || ''; info.version = d.version || '';
      var max = '1.1';
      ['1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9'].forEach(function (v) { if (Office.context.requirements.isSetSupported('WordApi', v)) max = v; });
      info.maxApi = max; info.api13 = Office.context.requirements.isSetSupported('WordApi', '1.3');
    } catch (e) { info.error = 'تعذّر قراءة معلومات Office: ' + e.message; return Promise.resolve(info); }
    return Word.run(function (ctx) {
      var body = ctx.document.body, paras = body.paragraphs, pics = body.inlinePictures;
      paras.load('items'); pics.load('items/altTextDescription');
      return ctx.sync().then(function () {
        info.paras = paras.items.length;
        info.eqs = pics.items.filter(function (p) { return window.WordBridge && WordBridge.parseMeta(p.altTextDescription); }).length;
        return info;
      });
    }).catch(function (e) { info.error = 'قراءة المستند فشلت: ' + (e.message || e.code || e); if (window.ArLog) ArLog.error('selftest-word', e); return info; });
  }
  function openSelftest() {
    wordInfo().then(function (w) {
      var f = $('edFrame');
      f.src = 'selftest.html?host=frame&v=5.7.0#d=' + encodeURIComponent(JSON.stringify({ host: 'frame', word: w }));
      $('paneEditor').hidden = false; $('home').hidden = true;
    });
  }
  function showLog() {
    var old = $('logView'); if (old) old.remove();
    var c = ArLog.counts(), box = document.createElement('div');
    box.id = 'logView';
    box.style.cssText = 'position:fixed;inset:0;background:rgba(12,30,34,.45);z-index:80;display:flex;align-items:flex-end;justify-content:center';
    box.innerHTML = '<div style="background:#fff;width:100%;max-height:85vh;border-radius:14px 14px 0 0;display:flex;flex-direction:column;box-shadow:0 -8px 30px rgba(0,0,0,.25)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #e3ecee;font-weight:700">' + L('سجل الأخطاء', 'Error log') +
      ' <span style="font-weight:400;color:#6b7f86;font-size:12px">' + L('أخطاء: ', 'Errors: ') + (c.error || 0) + '</span><button id="lvX" style="border:0;background:none;font-size:16px;cursor:pointer">✕</button></div>' +
      '<textarea id="lvT" readonly style="flex:1;min-height:260px;border:0;padding:10px;font:11px Consolas,monospace;direction:ltr;resize:none"></textarea>' +
      '<div style="display:flex;gap:6px;padding:10px 12px;border-top:1px solid #e3ecee"><button class="btn primary" id="lvC" type="button">📋 ' + L('نسخ لإرساله', 'Copy') + '</button>' +
      '<button class="btn" id="lvS" type="button">🩺 ' + L('الفحص الذاتي', 'Self-test') + '</button><span style="flex:1"></span><button class="btn danger" id="lvD" type="button">' + L('مسح', 'Clear') + '</button></div></div>';
    document.body.appendChild(box);
    $('lvT').value = ArLog.list().length ? ArLog.report(80) : L('لا توجد أخطاء مسجّلة ✓', 'No errors logged ✓');
    $('lvX').onclick = function () { box.remove(); };
    box.addEventListener('click', function (e) { if (e.target === box) box.remove(); });
    $('lvC').onclick = function () {
      var t = ArLog.report(80);
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).catch(function () { $('lvT').select(); document.execCommand('copy'); }).then(function () { $('lvC').textContent = '✓ ' + L('نُسخ', 'Copied'); });
    };
    $('lvS').onclick = function () { box.remove(); openSelftest(); };
    $('lvD').onclick = function () { ArLog.clear(); $('lvT').value = L('لا توجد أخطاء مسجّلة ✓', 'No errors logged ✓'); sync(); };
  }
  function sync() {
    var b = $('logBtn'); if (!b) return;
    var n = ArLog.counts().error || 0;
    b.textContent = '📋 ' + L('سجل الأخطاء', 'Error log') + (n ? ' (' + n + ')' : '');
  }
  function init() {
    var body = document.querySelector('#settingsPanel .panel-body');
    if (!body || $('selftestBtn')) return;
    var wrap = document.createElement('div');
    wrap.className = 'wide';
    wrap.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px';
    wrap.innerHTML = '<button class="btn" id="selftestBtn" type="button">🩺 ' + L('الفحص الذاتي', 'Self-test') + '</button><button class="btn" id="logBtn" type="button"></button>';
    body.appendChild(wrap);
    $('selftestBtn').onclick = openSelftest;
    $('logBtn').onclick = showLog;
    sync();
    document.getElementById('settingsPanel').addEventListener('toggle', sync);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.ArDiag = { openSelftest: openSelftest, showLog: showLog, wordInfo: wordInfo };
})();
