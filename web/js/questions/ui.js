/* questions.html — UI. Sources: the open Word document (via the task pane), a .docx file, or pasted text. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var Q = window.QParser;
  var inFrame = window.parent !== window;
  var state = { blocks: null, res: null, tab: 'tf' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function say(t, err) { $('msg').textContent = t || ''; $('msg').className = 'q-msg' + (err ? ' err' : ''); }
  function category() { return Q.categoryFromName($('cat').value); }

  // ----------------------------------------------------------- sources
  function load(blocks, name) {
    state.blocks = blocks;
    if (name && !$('cat').value.trim()) $('cat').value = name;
    run();
  }
  function run() {
    if (!state.blocks) return;
    try {
      state.res = Q.analyze(state.blocks, category());
    } catch (e) { say('تعذر التحليل: ' + (e.message || e), true); return; }
    var n = state.res.tf.length + state.res.mcq.length;
    if (!n && !state.res.errors.length) { say('لم يتم العثور على أسئلة (تأكد أن كل سؤال يبدأ بـ «س 1)»).', true); $('out').hidden = true; return; }
    say('');
    render();
  }

  function fromXml(xml, name) {
    try { load(Q.blocksFromXml(xml), name); } catch (e) { say('تعذرت قراءة الملف: ' + (e.message || e), true); }
  }
  $('file').onchange = function () {
    var f = this.files[0];
    if (!f) return;
    say('جارٍ قراءة الملف…');
    JSZip.loadAsync(f).then(function (z) { return z.file('word/document.xml').async('string'); })
      .then(function (xml) { fromXml(xml, Q.examNameFromFilename(f.name)); })
      .catch(function () { say('الملف ليس مستند Word صالحاً (.docx).', true); });
    this.value = '';
  };
  $('fileBtn').onclick = function () { $('file').click(); };
  $('pasteBtn').onclick = function () { $('pasteBox').hidden = !$('pasteBox').hidden; };
  $('pasteGo').onclick = function () { load(Q.blocksFromText($('pasteTxt').value), ''); };
  $('cat').addEventListener('input', function () { if (state.blocks) { clearTimeout(run.t); run.t = setTimeout(run, 250); } });

  // the open document is read by the task pane (it owns the Word API) and posted here
  if (inFrame) {
    $('backBtn').hidden = false;
    $('docBtn').hidden = false;
    $('backBtn').onclick = function () { parent.postMessage({ armath: { type: 'close' } }, location.origin); };
    $('docBtn').onclick = function () { say('جارٍ قراءة المستند…'); parent.postMessage({ qask: 'doc' }, location.origin); };
    window.addEventListener('message', function (e) {
      if (e.origin !== location.origin || !e.data || !e.data.qdoc) return;
      var d = e.data.qdoc;
      if (d.error) { say('تعذرت قراءة المستند: ' + d.error, true); return; }
      fromXml(d.xml, Q.examNameFromFilename(d.name || ''));
    });
    parent.postMessage({ qask: 'doc' }, location.origin);        // analyse the open document on load
  }

  // ----------------------------------------------------------- output
  function download(name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function copy(text, btn) {
    var ok = function () { var o = btn.textContent; btn.textContent = '✓ تم النسخ'; setTimeout(function () { btn.textContent = o; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text.replace(/^﻿/, '')).then(ok, function () { say('تعذر النسخ', true); });
  }
  function dlBtn(label, key, fname, csv) {
    var wrap = document.createElement('span');
    wrap.innerHTML = '<button class="qb" type="button">⬇️ ' + label + '</button> <button class="qb o" type="button" title="نسخ المحتوى">📋</button>';
    wrap.firstChild.onclick = function () { download(fname + '_' + key + '.csv', csv[key]); };
    wrap.lastChild.onclick = function () { copy(csv[key], this); };
    return wrap;
  }

  function card(r, removed) {
    var isTf = r.type === 'tf', dup = removed.indexOf(r.idx) >= 0, body = '';
    if (isTf) {
      var sah = r.correct_answer === 'صح';
      body += '<div class="q-ans' + (sah ? '' : ' no') + '">' + (sah ? '✅' : '❌') + ' الإجابة: ' + esc(r.correct_answer) + '</div>';
      if (r.corr) body += '<div class="q-info o"><small>📝 تصحيح الخطأ</small>' + esc(r.corr) + '</div>';
    } else {
      body += '<div class="q-opts">' + Q.LETTERS.map(function (l, i) {
        var t = r.options[i];
        return t ? '<div class="q-opt' + (t === r.correct_answer ? ' ok' : '') + '"><b>' + l + '</b><span>' + esc(t) + '</span></div>' : '';
      }).join('') + '</div><div class="q-ans">✅ الإجابة الصحيحة: ' + esc(r.correct_answer) + '</div>';
    }
    if (r.warn && r.warn.length) body += '<div class="q-info o"><small>⚠️ تنبيه</small>' + r.warn.map(esc).join('<br>') + '</div>';
    if (r.shrah) body += '<div class="q-info b"><small>🎯 الشرح</small>' + esc(r.shrah) + '</div>';
    if (r.explanation) body += '<div class="q-info y"><small>💡 التوضيح العلمي</small>' + esc(r.explanation) + '</div>';
    if (r.src) body += '<div class="q-src">📚 ' + esc(r.src) + '</div>';
    return '<details class="q-card' + (dup ? ' dup' : '') + '"><summary><span class="q-n' + (isTf ? '' : ' m') + '">' + r.num + '</span>' +
      '<span class="q-t">' + esc(r.question) + '</span><span class="q-tags"><span class="q-tag">' + esc(r.difficulty) + '</span>' +
      (r.warn && r.warn.length ? '<span class="q-tag w">⚠️ راجع</span>' : '') + (dup ? '<span class="q-tag d">🔁 مكرر</span>' : '') +
      '</span></summary><div class="q-body">' + body + '</div></details>';
  }

  function render() {
    var res = state.res, cat = category(), csv = Q.csvFiles(res, cat);
    var all = res.tf.concat(res.mcq), nW = all.filter(function (r) { return r.warn && r.warn.length; }).length, nR = res.dups.removed.length;
    var stem = (state.blocks && $('cat').value.trim() || 'questions').replace(/[\\/:*?"<>|]/g, '_');
    $('out').hidden = false;
    $('stats').innerHTML = '<span class="q-chip">الكل ' + all.length + '</span><span class="q-chip">صح/خطأ ' + res.tf.length + '</span>' +
      '<span class="q-chip">اختيار ' + res.mcq.length + '</span>' +
      (nW ? '<span class="q-chip w">⚠️ تحتاج مراجعة ' + nW + '</span>' : '') +
      (nR ? '<span class="q-chip d">🔁 مكررة ' + nR + '</span>' : '<span class="q-chip">✓ لا تكرار</span>') +
      (res.errors.length ? '<span class="q-chip e">🛑 ناقصة ' + res.errors.length + '</span>' : '');
    var dl = $('dl'); dl.innerHTML = '';
    dl.appendChild(dlBtn('TF (' + res.tf.length + ')', 'tf', stem, csv));
    dl.appendChild(dlBtn('MCQ (' + res.mcq.length + ')', 'mcq', stem, csv));
    dl.appendChild(dlBtn('الكل (' + all.length + ')', 'all', stem, csv));
    dl.appendChild(dlBtn('المُنقَّى (' + res.kept.length + ')', 'clean', stem, csv));
    var tabs = [['tf', '✅ صح/خطأ ' + res.tf.length], ['mcq', '🧩 اختيار ' + res.mcq.length], ['dup', '🔍 التكرار ' + nR]];
    if (res.errors.length) tabs.push(['err', '🛑 أخطاء ' + res.errors.length]);
    if (!tabs.some(function (t) { return t[0] === state.tab; })) state.tab = 'tf';
    $('tabs').innerHTML = tabs.map(function (t) { return '<button class="q-tab' + (state.tab === t[0] ? ' on' : '') + '" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('');
    Array.prototype.forEach.call($('tabs').children, function (b) { b.onclick = function () { state.tab = b.getAttribute('data-t'); render(); }; });
    var html = '';
    if (state.tab === 'tf') html = res.tf.map(function (r) { return card(r, res.dups.removed); }).join('');
    else if (state.tab === 'mcq') html = res.mcq.map(function (r) { return card(r, res.dups.removed); }).join('');
    else if (state.tab === 'dup') {
      html = res.dups.groups.length ? res.dups.groups.map(function (g, gi) {
        return '<div class="q-group"><b>مجموعة ' + (gi + 1) + ' — ' + g.length + ' أسئلة متشابهة</b>' + g.map(function (i, k) {
          var r = all[i];
          return '<div class="' + (k ? 'r' : 'k') + '">' + (k ? '🗑️ محذوف' : '✅ محتفظ به') + ' — ' + (r.type === 'tf' ? 'صح/خطأ' : 'اختيار') + ' س' + r.num + ': ' + esc(r.question) + '</div>';
        }).join('') + '</div>';
      }).join('') : '<div class="q-ans">🎉 لا توجد أسئلة مكررة</div>';
    } else html = res.errors.map(function (e) {
      return '<div class="q-err"><b>س' + e.num + '</b> ' + esc(e.q) + '<ul>' + e.missing.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
    $('panel').innerHTML = html;
  }
})();
