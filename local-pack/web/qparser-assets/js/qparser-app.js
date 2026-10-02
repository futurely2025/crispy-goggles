/* محلل الأسئلة — الواجهة. المصادر: المستند المفتوح في Word، أو ملف .docx، أو نص ملصوق. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var Q = window.QParser;
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
      state.res = Q.analyze(state.blocks, category(), { subject: $('subject').value });
    } catch (e) { say('تعذر التحليل: ' + (e.message || e), true); return; }
    var n = state.res.tf.length + state.res.mcq.length;
    if (!n && !state.res.errors.length) { say('لم يتم العثور على أسئلة (تأكد أن كل سؤال يبدأ بـ «س 1)»).', true); $('out').hidden = true; return; }
    say('');
    render();
  }

  function fromXml(xml, name) {
    try { load(Q.blocksFromXml(xml), name); } catch (e) { say('تعذرت قراءة الملف: ' + (e.message || e), true); }
  }
  function readFile(f) {
    if (!f) return;
    if (!/\.docx$/i.test(f.name)) { say('الملف يجب أن يكون Word بامتداد .docx', true); return; }
    say('جارٍ قراءة الملف…');
    JSZip.loadAsync(f).then(function (z) { return z.file('word/document.xml').async('string'); })
      .then(function (xml) { fromXml(xml, Q.examNameFromFilename(f.name)); })
      .catch(function () { say('الملف ليس مستند Word صالحاً (.docx).', true); });
  }
  $('file').onchange = function () { readFile(this.files[0]); this.value = ''; };
  // سحب وإفلات ملف Word في أي مكان من الصفحة
  ['dragenter', 'dragover'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); document.body.classList.add('q-drop'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { e.preventDefault(); document.body.classList.remove('q-drop'); });
  });
  document.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) readFile(e.dataTransfer.files[0]); });
  $('fileBtn').onclick = function () { $('file').click(); };
  $('pasteBtn').onclick = function () { $('pasteBox').hidden = !$('pasteBox').hidden; };
  $('pasteGo').onclick = function () { load(Q.blocksFromText($('pasteTxt').value), ''); };
  $('subject').addEventListener('change', function () { if (state.blocks) run(); });
  $('cat').addEventListener('input', function () { if (state.blocks) { clearTimeout(run.t); run.t = setTimeout(run, 250); } });

  // the open Word document: read straight from the Word API (flat OPC package -> document.xml)
  var inWord = false;
  function readDocument() {
    if (!inWord) { say('القراءة المباشرة تعمل داخل Word فقط — اختر ملف Word من الزر بالأعلى.', true); return; }
    say('جارٍ قراءة المستند…');
    var name = '';
    try { name = Office.context.document.url || ''; } catch (e) { /* unsaved document */ }
    Word.run(function (ctx) {
      var o = ctx.document.body.getOoxml();
      return ctx.sync().then(function () { return o.value; });
    }).then(function (xml) { fromXml(xml, Q.examNameFromFilename(name)); },
      function (err) { say('تعذرت قراءة المستند: ' + ((err && err.message) || err), true); });
  }
  $('docBtn').onclick = function () { readDocument(); };
  // مستند محقون من زر Word (القالب المثبّت): <script id="qp-xml"> + <meta id="qp-name">
  var injected = document.getElementById('qp-xml');
  if (injected) {
    var nm = document.getElementById('qp-name');
    fromXml(injected.textContent, Q.examNameFromFilename(nm ? nm.getAttribute('content') : ''));
  }
  if (window.Office && Office.onReady) {
    Office.onReady(function (info) {
      if (info && info.host === Office.HostType.Word) { inWord = true; $('docBtn').hidden = false; readDocument(); }
    });
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
    if (r.trans) body += '<div class="q-info g"><small>🌐 ترجمة السؤال</small>' + esc(r.trans) + '</div>';
    if (r.steps) body += '<div class="q-info b"><small>🎯 خطوات الحل</small>' + esc(r.steps) + '</div>';
    if (r.idea) body += '<div class="q-info p"><small>💡 الفكرة الأساسية</small>' + esc(r.idea) + '</div>';
    if (r.shrah) body += '<div class="q-info b"><small>🎯 الشرح</small>' + esc(r.shrah) + '</div>';
    if (r.rule) body += '<div class="q-info p"><small>📐 القاعدة</small>' + esc(r.rule) + '</div>';
    if (r.examples) body += '<div class="q-info g"><small>✏️ أمثلة إضافية</small>' + esc(r.examples) + '</div>';
    if (r.explanation) body += '<div class="q-info y"><small>💡 التوضيح العلمي</small>' + esc(r.explanation) + '</div>';
    if (r.src) body += '<div class="q-src">📚 ' + esc(r.src) + '</div>';
    return '<details class="q-card' + (dup ? ' dup' : '') + '"><summary><span class="q-n' + (isTf ? '' : ' m') + '">' + r.num + '</span>' +
      '<span class="q-t">' + esc(r.question) + '</span><span class="q-tags"><span class="q-tag">' + esc(r.difficulty) + '</span>' +
      (r.warn && r.warn.length ? '<span class="q-tag w">⚠️ راجع</span>' : '') + (dup ? '<span class="q-tag d">🔁 مكرر</span>' : '') +
      '</span></summary><div class="q-body">' + body + '</div></details>';
  }

  function matchCard(m) {
    var rows = m.pairs.map(function (p) {
      return '<tr><td><b>' + p.num + '</b> ' + esc(p.key) + '</td><td>← ' + esc(p.value) + '</td></tr>';
    }).join('');
    return '<details class="q-card" open><summary><span class="q-n m">' + m.num + '–' + m.numTo + '</span><span class="q-t">' + esc(m.question) +
      '</span><span class="q-tags"><span class="q-tag">' + esc(m.difficulty) + '</span></span></summary><div class="q-body">' +
      '<table class="q-pairs"><thead><tr><th>المجموعة أ</th><th>المجموعة ب</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      (m.trans ? '<div class="q-info g"><small>🌐 ترجمة السؤال</small>' + esc(m.trans) + '</div>' : '') +
      (m.shrah ? '<div class="q-info b"><small>🎯 الشرح</small>' + esc(m.shrah) + '</div>' : '') +
      (m.explanation ? '<div class="q-info y"><small>💡 التوضيح العلمي</small>' + esc(m.explanation) + '</div>' : '') +
      '<div class="q-src">📚 ' + esc(m.src) + (m.time ? ' | ⏰ ' + esc(m.time) : '') + '</div></div></details>';
  }

  function render() {
    var res = state.res, cat = category(), csv = Q.csvFiles(res, cat);
    var all = res.tf.concat(res.mcq), nW = all.filter(function (r) { return r.warn && r.warn.length; }).length, nR = res.dups.removed.length;
    var stem = 'questions';   // اسم ASCII ثابت: يضمن حفظ الملف بامتداد .csv في كل المتصفحات
    $('out').hidden = false;
    $('stats').innerHTML = '<span class="q-chip s">📘 ' + esc(res.profile.label) + '</span><span class="q-chip">الكل ' + all.length + '</span><span class="q-chip">صح/خطأ ' + res.tf.length + '</span>' +
      '<span class="q-chip">اختيار ' + res.mcq.length + '</span>' +
      (res.match.length ? '<span class="q-chip">وصل ' + res.match.length + ' كتلة</span>' : '') +
      (nW ? '<span class="q-chip w">⚠️ تحتاج مراجعة ' + nW + '</span>' : '') +
      (nR ? '<span class="q-chip d">🔁 مكررة ' + nR + '</span>' : '<span class="q-chip">✓ لا تكرار</span>') +
      (res.errors.length ? '<span class="q-chip e">🛑 ناقصة ' + res.errors.length + '</span>' : '');
    var dl = $('dl'); dl.innerHTML = '';
    dl.appendChild(dlBtn('TF (' + res.tf.length + ')', 'tf', stem, csv));
    dl.appendChild(dlBtn('MCQ (' + res.mcq.length + ')', 'mcq', stem, csv));
    if (res.match.length) {
      dl.appendChild(dlBtn('وصل CSV (' + res.match.length + ')', 'match', stem, csv));
      var xb = document.createElement('span');
      xb.innerHTML = '<button class="qb s" type="button">⬇️ وصل Excel</button> ';
      xb.firstChild.onclick = function () {
        Q.makeXlsx(JSZip, csv.matchTable.cols, csv.matchTable.rows, 'أسئلة الوصل (المزاوجة)', 'blob').then(function (b) {
          var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = stem + '_match.xlsx';
          document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        });
      };
      dl.appendChild(xb);
    }
    dl.appendChild(dlBtn('الكل (' + all.length + ')', 'all', stem, csv));
    dl.appendChild(dlBtn('المُنقَّى (' + res.kept.length + ')', 'clean', stem, csv));
    var tabs = [['tf', '✅ صح/خطأ ' + res.tf.length], ['mcq', '🧩 اختيار ' + res.mcq.length]];
    if (res.match.length) tabs.push(['match', '🔀 وصل ' + res.match.length]);
    tabs.push(['dup', '🔍 التكرار ' + nR]);
    if (res.errors.length) tabs.push(['err', '🛑 أخطاء ' + res.errors.length]);
    if (!tabs.some(function (t) { return t[0] === state.tab; })) state.tab = 'tf';
    $('tabs').innerHTML = tabs.map(function (t) { return '<button class="q-tab' + (state.tab === t[0] ? ' on' : '') + '" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('');
    Array.prototype.forEach.call($('tabs').children, function (b) { b.onclick = function () { state.tab = b.getAttribute('data-t'); render(); }; });
    var html = '';
    if (state.tab === 'tf') html = res.tf.map(function (r) { return card(r, res.dups.removed); }).join('');
    else if (state.tab === 'mcq') html = res.mcq.map(function (r) { return card(r, res.dups.removed); }).join('');
    else if (state.tab === 'match') html = res.match.map(matchCard).join('');
    else if (state.tab === 'dup') {
      html = res.dups.groups.length ? res.dups.groups.map(function (g, gi) {
        return '<div class="q-group"><b>مجموعة ' + (gi + 1) + ' — ' + g.length + ' أسئلة متشابهة</b>' + g.map(function (i, k) {
          var r = all[i];
          return '<div class="' + (k ? 'r' : 'k') + '">' + (k ? '🗑️ محذوف' : '✅ محتفظ به') + ' — ' + (r.type === 'tf' ? 'صح/خطأ' : 'اختيار') + ' س' + r.num + ': ' + esc(r.question) + '</div>';
        }).join('') + '</div>';
      }).join('') : '<div class="q-ans">🎉 لا توجد أسئلة مكررة</div>';
    } else html = res.errors.map(function (e) {
      return '<div class="q-err"><b>س' + e.num + '</b> <span class="q-tag">' + esc(e.type || '') + '</span> ' + esc(e.q) + '<ul>' + e.missing.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
    $('panel').innerHTML = html;
  }
})();
