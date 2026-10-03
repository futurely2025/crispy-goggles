/*
 * exam-templates-ui.js — template library, structured template editor and dashboard.
 * Relies on ExamApp (exam-ui.js), ExamLib (exam-lib.js), TemplateEditor (exam-tpl.js).
 */
(function () {
  'use strict';
  var A, $, byTok = {
    SUBJECT: 'المادة', SUBJECT_CODE: 'رمز المادة', PAPER_NO: 'رقم الورقة', CERT: 'الشهادة', ROUND_LINE: 'الدور والعام',
    SECTION: 'القسم', DURATION: 'الزمن', STUDENT_NAME: 'اسم الطالب', AREA: 'المنطقة', COMMITTEE: 'اللجنة', SCHOOL: 'المدرسة',
    SEAT: 'رقم الجلوس', PRINT_CODE: 'رمز الطباعة', EXAM_CODE: 'رمز الامتحان', SERIAL: 'التسلسل', EXTRA: 'رقم القيد',
    Q_NO: 'رقم السؤال', Q_TEXT: 'نص السؤال', QTYPE: 'نوع السؤال', ANSWER_FULL: 'الإجابة (حرف ونص)', ANSWER: 'الإجابة (حرف)', ANSWER_TEXT: 'نص الإجابة',
    CORRECTION: 'تصحيح الخطأ', EXPLANATION: 'الشرح', CLARIFICATION: 'التوضيح', SOURCE: 'المصدر', TIME: 'الوقت المثالي', DIFFICULTY: 'الصعوبة', NOTE: 'ملاحظة',
    STEPS: 'خطوات الحل', IDEA: 'الفكرة الأساسية', TRANSLATION: 'ترجمة السؤال', Q_IMAGE: 'صورة السؤال', OPT_LETTER: 'حرف الخيار', OPT_TEXT: 'نص الخيار', TITLE: 'عنوان القسم', MATCH_KEY: 'حل الوصل'
  };
  var DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  var SAMPLE = ['س1) ما عاصمة ليبيا؟', '(أ) طرابلس', '(ب) بنغازي', '(ج) سبها', '(د) مصراتة', 'الإجابة: أ',
    'س2) في أي عام نالت ليبيا استقلالها؟', '(أ) 1951', '(ب) 1969', '(ج) 1943', '(د) 1911', 'الإجابة: أ'];

  var records = [], ed = null, lastInput = null, confirmId = null;

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'on') Object.keys(attrs.on).forEach(function (ev) { e.addEventListener(ev, attrs.on[ev]); });
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function msg(id, text, cls) { var s = $(id); s.textContent = text || ''; s.className = 'status' + (cls ? ' ' + cls : ''); }
  function fmtDate(t) { try { return new Date(t).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return ''; } }
  function kb(n) { return Math.round(n / 1024) + ' ك.ب'; }
  function stem(n) { return String(n || 'قالب').replace(/\.docx$/i, ''); }

  // ------------------------------------------------------------ library list
  async function refreshAll() {
    records = await ExamLib.list();
    var active = ExamLib.activeId();
    if (!A.builtins[active] && !records.some(function (r) { return r.id === active; })) { ExamLib.setActive('builtin'); active = 'builtin'; }
    renderList(active); renderSelect(active); refreshDashboard();
  }

  function renderSelect(active) {
    var sel = $('tplSelect'); sel.innerHTML = '';
    Object.keys(A.builtins).forEach(function (k) { sel.appendChild(el('option', { value: k, text: A.builtins[k].name })); });
    records.forEach(function (r) { sel.appendChild(el('option', { value: r.id, text: r.name })); });
    sel.value = active;
  }

  function card(rec, active, kind) {
    var builtin = !rec, id = builtin ? kind : rec.id, on = id === active;
    var bname = builtin ? A.builtins[kind].name : '';
    var btn = function (t, fn, cls) { return el('button', { type: 'button', class: 'btn sm' + (cls ? ' ' + cls : ''), text: t, on: { click: fn } }); };
    var acts = [];
    if (!on) acts.push(btn('استخدام', function () { ExamLib.setActive(id); refreshAll(); msg('tplStatus', 'القالب المستخدم الآن: ' + (builtin ? bname : rec.name), 'ok'); }));
    acts.push(btn('تعديل في Word', function () { editInWord(builtin ? null : rec, kind); }, 'primary'));
    acts.push(btn(builtin ? 'نسخ وتعديل سريع' : 'تعديل سريع', function () { openEditor(builtin ? null : rec, kind); }));
    if (!builtin) acts.push(btn('نسخ', function () { duplicate(rec); }));
    acts.push(btn('تنزيل', async function () {
      var b = builtin ? await A.originalTemplateBytes(kind) : (await ExamLib.get(rec.id)).bytes;
      A.download(b, (builtin ? bname : rec.name) + '.docx', DOCX);
    }));
    if (!builtin) acts.push(btn(confirmId === id ? 'تأكيد الحذف؟' : 'حذف', function () {
      if (confirmId !== id) { confirmId = id; renderList(active); setTimeout(function () { confirmId = null; renderList(ExamLib.activeId()); }, 3500); return; }
      confirmId = null;
      ExamLib.remove(id).then(function () { if (on) ExamLib.setActive('builtin'); refreshAll(); });
    }, 'danger'));
    var title = el('h3', { text: builtin ? bname : rec.name }, [
      on ? el('span', { class: 'badge', text: 'مستخدم' }) : null,
      builtin ? el('span', { class: 'badge alt', text: 'مدمج' }) : null]);
    return el('div', { class: 'tpl' + (on ? ' on' : '') }, [title,
      el('div', { class: 'meta', text: builtin ? (kind === 'builtin' ? 'القالب الرسمي المدمج في الإضافة (بدون حل)' : 'نفس الشكل مع الحل: دائرة على الإجابة الصحيحة، الشرح، التوضيح، المصدر، الوقت') : 'آخر تعديل ' + fmtDate(rec.updated) + ' · ' + kb(rec.size) }),
      el('div', { class: 'row' }, acts)]);
  }

  function renderList(active) {
    var box = $('tplList'); box.innerHTML = '';
    Object.keys(A.builtins).forEach(function (k) { box.appendChild(card(null, active, k)); });
    records.forEach(function (r) { box.appendChild(card(r, active)); });
  }

  async function addRecord(bytes, name) {
    var r = await ExamCore.inspectTemplate(JSZip, bytes);
    if (!r.ok) { msg('tplStatus', r.error, 'err'); return null; }
    bytes = await TemplateEditor.clearDraft(JSZip, bytes);
    var rec = { id: ExamLib.uid(), name: name, bytes: bytes, created: Date.now() };
    try { await ExamLib.put(rec); } catch (e) { msg('tplStatus', 'تعذر حفظ القالب على هذا الجهاز: ' + e.message, 'err'); return null; }
    return rec;
  }

  async function duplicate(rec) {
    var c = await addRecord((await ExamLib.get(rec.id)).bytes, 'نسخة من ' + rec.name);
    if (c) { await refreshAll(); msg('tplStatus', 'تم إنشاء نسخة.', 'ok'); }
  }

  async function importBytes(bytes, name) {
    var rec = await addRecord(bytes, name);
    if (!rec) return;
    ExamLib.setActive(rec.id);
    await refreshAll();
    msg('tplStatus', 'تمت إضافة القالب «' + rec.name + '» واعتماده. اضغط «تعديل في Word» لتعديله بكل أدوات Word.', 'ok');
  }

  // ------------------------------------------------- full editing inside Word
  async function editInWord(rec, kind) {
    if (!rec) {                                            // built-in: edit a private copy
      rec = await addRecord(await A.originalTemplateBytes(kind), kind === 'builtin-solution' ? 'قالبي بالحل' : 'قالبي');
      if (!rec) return;
      await refreshAll();
    }
    try {
      if (ExamLib.filesMode()) {                           // a real file: Word opens it, Ctrl+S saves it in place
        ExamLib.setActive(rec.id);
        await ExamLib.openInWord(rec.id);
        await refreshAll();
        msg('tplStatus', 'فُتح الملف «' + rec.id + '» في Word. عدّله واحفظه بـ Ctrl+S كأي ملف؛ يُعتمد تلقائياً في النماذج التالية دون أي خطوة أخرى.', 'ok');
        return;
      }
      var full = await ExamLib.get(rec.id);
      var bytes = await TemplateEditor.setDraft(JSZip, full.bytes, rec.id, rec.name);
      if (A.inWord()) {
        await Word.run(async function (ctx) { ctx.application.createDocument(A.toBase64(bytes)).open(); await ctx.sync(); });
        try { localStorage.setItem('exam.pendingDraft', rec.name); } catch (e) { /* ignore */ }
        msg('tplStatus', 'فُتح القالب «' + rec.name + '» في نافذة Word جديدة (نسخة غير محفوظة كملف). عدّله هناك، ثم في تلك النافذة نفسها افتح لوحة «نموذج الأسئلة» ← «القوالب» ← «حفظ التعديلات في القالب». بدون هذه الخطوة لا يصل تعديلك إلى النماذج. (للتعديل بـ Ctrl+S كملف حقيقي يلزم تثبيت الإضافة المحلية.)', 'ok');
      } else {
        A.download(bytes, rec.name + ' - للتعديل.docx', DOCX);
        msg('tplStatus', 'نُزّل القالب. افتحه في Word وعدّله كما تشاء واحفظه، ثم هنا اضغط «استيراد ملف Word كقالب».', 'ok');
      }
    } catch (e) { msg('tplStatus', 'تعذر فتح القالب في Word: ' + e.message, 'err'); }
  }

  var draft = null;
  async function detectDraft() {
    if (!A.inWord() || ExamLib.filesMode()) return;
    try {
      draft = await TemplateEditor.readDraft(JSZip, await A.getDocxBytes());
      if (!draft) return;
      $('draftName').textContent = draft.name || '';
      $('draftCard').hidden = false;
      document.querySelector('.tab[data-tab=templates]').click();
    } catch (e) { /* not a draft, or the document can't be read */ }
  }
  async function saveDraft(asNew) {
    var res = await saveDraftInner(asNew);
    return res;
  }
  /** called before every build: a template opened for editing in this window is saved first */
  async function autoSaveDraft() {
    if (!draft) return;
    var r = await saveDraftInner(false);
    if (!r) throw new Error($('draftStatus').textContent || 'تعذر حفظ القالب المعدَّل');
  }
  async function saveDraftInner(asNew) {
    try {
      msg('draftStatus', 'جارٍ قراءة المستند…');
      var bytes = await TemplateEditor.clearDraft(JSZip, await A.getDocxBytes());
      var chk = await ExamCore.inspectTemplate(JSZip, bytes);
      if (!chk.ok) { msg('draftStatus', chk.error, 'err'); return false; }
      var rec = asNew ? null : await ExamLib.get(draft.id);
      if (!rec) rec = { id: ExamLib.uid(), name: asNew ? (draft.name || 'قالب') + ' (نسخة)' : (draft.name || 'قالب'), created: Date.now() };
      rec.bytes = bytes;
      await ExamLib.put(rec);
      ExamLib.setActive(rec.id);
      if (asNew) { draft = { id: rec.id, name: rec.name }; $('draftName').textContent = rec.name; }
      await refreshAll();
      msg('draftStatus', 'تم حفظ القالب «' + rec.name + '» واعتماده. يمكنك متابعة التعديل وحفظه مرة أخرى، أو إغلاق هذه النافذة.', 'ok');
      try { localStorage.removeItem('exam.pendingDraft'); } catch (e) { /* ignore */ }
      return true;
    } catch (e) { msg('draftStatus', 'تعذر الحفظ: ' + e.message, 'err'); return false; }
  }

  // ------------------------------------------------------------------ editor
  async function openEditor(rec, kind) {
    if (!rec) {                                            // built-in: edit a private copy
      rec = await addRecord(await A.originalTemplateBytes(kind), kind === 'builtin-solution' ? 'قالبي بالحل' : 'قالبي');
      if (!rec) return;
      await refreshAll();
    }
    if (!rec.bytes) rec = await ExamLib.get(rec.id);
    ed = { rec: rec, bytes: rec.bytes, pending: {}, info: await TemplateEditor.list(JSZip, rec.bytes) };
    $('edName').value = rec.name;
    $('editor').hidden = false;
    renderTokenBar();
    renderRows();
    $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderTokenBar() {
    var old = $('edTokBar'); if (old) old.remove();
    var sel = el('select', { id: 'edTok' }, [el('option', { value: '', text: 'إدراج حقل تلقائي…' })].concat(
      Object.keys(byTok).map(function (k) { return el('option', { value: k, text: byTok[k] + '  {{' + k + '}}' }); })));
    sel.addEventListener('change', function () {
      if (!sel.value) return;
      if (!lastInput || lastInput.disabled) { msg('edStatus', 'اضغط داخل السطر الذي تريد إدراج الحقل فيه أولاً.', 'err'); sel.value = ''; return; }
      var t = '{{' + sel.value + '}}', i = lastInput, s = i.selectionStart == null ? i.value.length : i.selectionStart;
      i.value = i.value.slice(0, s) + t + i.value.slice(i.selectionEnd == null ? s : i.selectionEnd);
      i.dispatchEvent(new Event('input')); i.focus(); sel.value = '';
    });
    $('edInfo').parentNode.insertBefore(el('div', { id: 'edTokBar', class: 'row' }, [sel]), $('edInfo'));
  }

  function show(t) { return String(t).replace(/\t/g, '⇥'); }
  function unshow(t) { return t.replace(/⇥/g, '\t'); }
  function changedCount() { return Object.keys(ed.pending).filter(function (k) { return Object.keys(ed.pending[k]).length; }).length; }

  function setPending(id, key, val) {
    var p = ed.pending[id] || (ed.pending[id] = {});
    if (val === undefined || val === null || val === '') delete p[key]; else p[key] = val;
    if (!Object.keys(p).length) delete ed.pending[id];
    var row = document.querySelector('[data-pid="' + id + '"]');
    if (row) row.classList.toggle('changed', !!ed.pending[id]);
    if (row) row.classList.toggle('gone', !!(ed.pending[id] && ed.pending[id].del));
    $('edInfo').textContent = infoText();
  }
  function infoText() {
    var n = changedCount();
    return ed.info.paragraphs.length + ' سطراً في القالب · ' + (n ? 'تعديلات غير محفوظة: ' + n : 'لا توجد تعديلات غير محفوظة');
  }
  function num(v) { if (v === '' || v == null) return null; var n = parseFloat(v); return isNaN(n) ? null : n; }

  function renderRows() {
    var box = $('edRows'); box.innerHTML = '';
    var q = $('edFilter').value.trim(), showEmpty = $('edEmpty').checked;
    var fonts = ed.info.fonts;
    ed.info.paragraphs.forEach(function (p, i) {
      var pend = ed.pending[p.id] || {};
      var disp = pend.text != null ? pend.text : p.text;
      if (p.empty && !showEmpty && !ed.pending[p.id]) return;
      if (q && disp.indexOf(q) < 0) return;
      var where = p.part.indexOf('header') >= 0 ? 'الترويسة' : p.part.indexOf('footer') >= 0 ? 'التذييل' : 'الصفحة';
      var input = el('input', { class: 'ed-text', type: 'text', dir: 'rtl', value: show(disp), 'aria-label': 'نص السطر',
        placeholder: p.empty ? '(سطر فارغ — اكتب هنا لإضافة نص)' : '' });
      input.value = show(disp);
      input.disabled = p.locked || p.isBody;
      input.addEventListener('focus', function () { lastInput = input; });
      input.addEventListener('input', function () { var v = unshow(input.value); setPending(p.id, 'text', v === p.text ? null : v); });

      function field(label, key, step, cur, cast) {
        var inp = el('input', { type: 'number', step: step, placeholder: cur == null ? 'كما هو' : String(cur) });
        if (pend[key] != null) inp.value = pend[key];
        inp.addEventListener('input', function () { setPending(p.id, key, num(inp.value)); });
        return el('label', { text: label }, [inp]);
      }
      var fontSel = el('select', {}, [el('option', { value: '', text: 'كما هو' })].concat(
        fonts.map(function (f) { return el('option', { value: f, text: f }); })));
      fontSel.value = pend.font || '';
      fontSel.addEventListener('change', function () { setPending(p.id, 'font', fontSel.value); });
      var boldSel = el('select', {}, [el('option', { value: '', text: 'كما هو' }), el('option', { value: '1', text: 'غامق' }), el('option', { value: '0', text: 'عادي' })]);
      boldSel.value = pend.bold == null ? '' : pend.bold ? '1' : '0';
      boldSel.addEventListener('change', function () { setPending(p.id, 'bold', boldSel.value === '' ? null : boldSel.value === '1'); });
      var fmt = el('details', {}, [el('summary', { text: 'التنسيق: الحجم، الخط، المسافات' }), el('div', { class: 'ed-fmt' }, [
        field('الحجم (نقطة)', 'sz', '0.5', p.sz), el('label', { text: 'الخط' }, [fontSel]), el('label', { text: 'السماكة' }, [boldSel]),
        field('مسافة قبل (نقطة)', 'before', '1', p.before), field('مسافة بعد (نقطة)', 'after', '1', p.after), field('تباعد الأسطر (×)', 'line', '0.1', p.line)])]);

      var acts = [];
      if (!p.inTable && !p.isBody) {
        acts.push(el('button', { type: 'button', class: 'btn sm', text: '＋ سطر فارغ بعده', on: { click: function () { setPending(p.id, 'dup', !(ed.pending[p.id] && ed.pending[p.id].dup)); } } }));
        acts.push(el('button', { type: 'button', class: 'btn sm danger', text: 'حذف السطر', on: { click: function () { setPending(p.id, 'del', !(ed.pending[p.id] && ed.pending[p.id].del)); } } }));
      }
      acts.push(el('button', { type: 'button', class: 'btn sm', text: 'تراجع', on: { click: function () { delete ed.pending[p.id]; renderRows(); } } }));
      var toks = p.tokens.map(function (t) { return el('span', { class: 'chip', text: (byTok[t.slice(2, -2)] || t) }); });
      var row = el('div', { class: 'ed-row' + (ed.pending[p.id] ? ' changed' : '') + (pend.del ? ' gone' : ''), 'data-pid': p.id }, [
        el('div', { class: 'ed-head' }, [el('span', { text: where + ' · ' + (p.idx + 1) }),
          el('span', { text: p.isBody ? 'مكان الأسئلة — لا يُعدَّل' : p.locked ? 'حقل تلقائي — التنسيق فقط' : p.inTable ? 'داخل جدول' : '' })]),
        input, toks.length ? el('div', { class: 'tokens' }, toks) : null, fmt, el('div', { class: 'ed-act' }, acts)]);
      box.appendChild(row);
    });
    if (!box.children.length) box.appendChild(el('p', { class: 'hint', text: 'لا توجد أسطر مطابقة.' }));
    $('edInfo').textContent = infoText();
  }

  function editsFor() {
    var out = {};
    Object.keys(ed.pending).forEach(function (id) { out[id] = ed.pending[id]; });
    return out;
  }

  async function applied() {
    var bytes = changedCount() ? await TemplateEditor.apply(JSZip, ed.bytes, editsFor()) : ed.bytes;
    var chk = await ExamCore.inspectTemplate(JSZip, bytes);
    if (!chk.ok) throw new Error(chk.error);
    var after = await TemplateEditor.list(JSZip, bytes), before = ed.info.tokens;
    var lost = before.filter(function (t) { return after.tokens.indexOf(t) < 0; });
    return { bytes: bytes, info: after, lost: lost };
  }

  async function save(asNew) {
    try {
      var r = await applied();
      var name = $('edName').value.trim() || ed.rec.name;
      if (asNew) {
        var rec = await addRecord(r.bytes, name === ed.rec.name ? name + ' (نسخة)' : name);
        if (!rec) return;
        ed.rec = rec;
      } else {
        ed.rec.name = name; ed.rec.bytes = r.bytes;
        await ExamLib.put(ed.rec);
      }
      ed.bytes = r.bytes; ed.info = r.info; ed.pending = {};
      $('edName').value = ed.rec.name;
      ExamLib.setActive(ed.rec.id);
      await refreshAll();
      renderRows();
      msg('edStatus', 'تم الحفظ واعتماد القالب «' + ed.rec.name + '».' + (r.lost.length ? ' تنبيه: حُذفت الحقول ' + r.lost.join(' ') + ' فلن تُملأ.' : ''), r.lost.length ? 'err' : 'ok');
    } catch (e) { msg('edStatus', 'تعذر الحفظ: ' + e.message, 'err'); }
  }

  async function tryIt() {
    try {
      var r = await applied();
      var exam = A.getExam();
      if (!exam || !exam.questions.length) exam = ExamCore.parseExam(SAMPLE);
      var o = A.options();
      var out = await ExamCore.buildDocx(JSZip, r.bytes, exam, o);
      if (A.inWord()) {
        await Word.run(async function (ctx) { ctx.application.createDocument(A.toBase64(out.bytes)).open(); await ctx.sync(); });
        msg('edStatus', 'فُتحت تجربة القالب في مستند جديد (' + out.count + ' سؤال). لم يُحفظ شيء بعد.', 'ok');
      } else {
        A.download(out.bytes, 'تجربة-القالب.docx', DOCX);
        msg('edStatus', 'تم تنزيل تجربة القالب (' + out.count + ' سؤال). لم يُحفظ شيء بعد.', 'ok');
      }
    } catch (e) { msg('edStatus', 'تعذرت التجربة: ' + e.message, 'err'); }
  }

  // ---------------------------------------- which template is used / diagnostics
  function showUsed(t) {
    var when = t && t.file && t.updated ? ' · آخر حفظ للملف ' + fmtDate(t.updated) : '';
    var mode = ExamLib.filesMode() ? 'ملف حقيقي' : 'محفوظ داخل المتصفح';
    $('tplUsed').textContent = t ? 'استُخدم في آخر إنشاء: «' + t.name + '» (' + mode + ')' + when : '';
  }
  async function diagnose() {
    var out = [], id = ExamLib.activeId();
    out.push('page: ' + location.href);
    out.push('mode: ' + (ExamLib.filesMode() ? 'FILES (real .docx files)' : 'BROWSER-STORAGE (no local file API)'));
    out.push('folder: ' + (ExamLib.folder() || '-'));
    out.push('active: ' + id);
    out.push('inWord: ' + A.inWord());
    try {
      var l = await ExamLib.list();
      out.push('templates: ' + (l.length ? '' : '(none)'));
      l.forEach(function (r) { out.push('  - ' + r.id + ' | ' + r.size + ' bytes | modified ' + new Date(r.updated).toISOString() + (r.open ? ' | OPEN-IN-WORD' : '')); });
      if (!A.builtins[id]) {
        var rec = await ExamLib.get(id);
        out.push('active readable: ' + (rec ? 'yes (' + rec.bytes.length + ' bytes)' : 'NO'));
        if (rec) {
          var info = await TemplateEditor.list(JSZip, rec.bytes);
          var first = info.paragraphs.filter(function (p) { return !p.empty; }).slice(0, 4).map(function (p) { return p.text.slice(0, 40); });
          out.push('first texts in active template: ' + JSON.stringify(first));
          var orig = await TemplateEditor.list(JSZip, await A.originalTemplateBytes());
          var diff = info.paragraphs.filter(function (p, i) { var o = orig.paragraphs[i]; return !o || o.text !== p.text || o.sz !== p.sz || o.before !== p.before || o.after !== p.after; }).length;
          out.push('paragraphs differing from the original: ' + diff + ' of ' + info.paragraphs.length);
        }
      }
      var last = ExamLib.history()[0];
      if (last) out.push('last build: ' + new Date(last.t).toISOString() + ' template=' + last.tpl);
    } catch (e) { out.push('error: ' + e.message); }
    var pre = $('diagOut'); pre.textContent = out.join('\n'); pre.hidden = false;
  }

  // --------------------------------------------------------------- dashboard
  function refreshDashboard() {
    var h = ExamLib.history(), q = h.reduce(function (s, x) { return s + (x.count || 0); }, 0);
    var tiles = [[h.length, 'نموذج أُنشئ'], [q, 'سؤال مُعالَج'], [records.length + 1, 'قالب في المكتبة'], [h.length ? fmtDate(h[0].t) : '—', 'آخر إنشاء']];
    var box = $('tiles'); box.innerHTML = '';
    tiles.forEach(function (t) { box.appendChild(el('div', { class: 'tile' }, [el('b', { text: String(t[0]) }), el('span', { text: t[1] })])); });
    var hb = $('histBox'); hb.innerHTML = '';
    if (!h.length) { hb.appendChild(el('p', { class: 'hint', text: 'لم يُنشأ أي نموذج بعد.' })); return; }
    var table = el('table', { class: 'hist' }, [el('tr', {}, ['التاريخ', 'المادة', 'الدور والعام', 'أسئلة', 'القالب'].map(function (c) { return el('th', { text: c }); }))]);
    h.slice(0, 30).forEach(function (x) {
      table.appendChild(el('tr', {}, [fmtDate(x.t), x.subject, [x.round, x.year].filter(Boolean).join(' '), String(x.count), x.tpl].map(function (c) { return el('td', { text: c || '' }); })));
    });
    hb.appendChild(table);
  }

  async function exportBackup() {
    var recs = await ExamLib.list(), store = {};
    recs = await Promise.all(recs.map(function (r) { return r.bytes ? r : ExamLib.get(r.id).then(function (f) { f.created = r.created; return f; }); }));
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf('exam.') === 0 && k !== 'exam.history') store[k] = localStorage.getItem(k); } } catch (e) { /* ignore */ }
    var data = { kind: 'exam-addin-backup', v: 1, saved: Date.now(), store: store,
      templates: recs.map(function (r) { return { id: r.id, name: r.name, created: r.created, updated: r.updated, b64: A.toBase64(r.bytes) }; }) };
    A.download(new TextEncoder().encode(JSON.stringify(data)), 'نسخة-احتياطية-نموذج-الأسئلة.json', 'application/json');
    msg('bkStatus', 'تم تصدير ' + recs.length + ' قالب مع القيم الافتراضية.', 'ok');
  }
  async function importBackup(file) {
    try {
      var d = JSON.parse(await file.text());
      if (d.kind !== 'exam-addin-backup') throw new Error('الملف ليس نسخة احتياطية لهذه الإضافة');
      for (var i = 0; i < d.templates.length; i++) {
        var t = d.templates[i];
        await ExamLib.put({ id: t.id, name: t.name, created: t.created, bytes: A.b64ToBytes(t.b64) });
      }
      Object.keys(d.store || {}).forEach(function (k) { try { localStorage.setItem(k, d.store[k]); } catch (e) { /* ignore */ } });
      await refreshAll();
      msg('bkStatus', 'تمت استعادة ' + d.templates.length + ' قالب. أعد فتح اللوحة لتظهر القيم الافتراضية.', 'ok');
    } catch (e) { msg('bkStatus', 'تعذرت الاستعادة: ' + e.message, 'err'); }
  }

  // -------------------------------------------------------------------- init
  async function migrateLegacy() {
    try {
      var b = localStorage.getItem('exam.tpl');
      if (!b) return;
      var rec = await addRecord(A.b64ToBytes(b), localStorage.getItem('exam.tplName') || 'قالب معدَّل سابق');
      localStorage.removeItem('exam.tpl'); localStorage.removeItem('exam.tplName');
      if (rec) ExamLib.setActive(rec.id);
    } catch (e) { /* ignore */ }
  }

  /** first run with the local server: bring templates saved earlier in the browser over as real files */
  async function migrateIdb() {
    if (!ExamLib.filesMode()) return;
    try {
      if (localStorage.getItem('exam.migratedFiles')) return;
      var old = await ExamLib.idbList(), keep = ExamLib.activeId();
      for (var i = 0; i < old.length; i++) {
        var r = { id: ExamLib.uid(), name: old[i].name, bytes: old[i].bytes };
        await ExamLib.put(r);
        if (old[i].id === keep) ExamLib.setActive(r.id);
      }
      localStorage.setItem('exam.migratedFiles', '1');
    } catch (e) { /* ignore */ }
  }
  function detectFilesUi() {
    var on = ExamLib.filesMode();
    $('tplReveal').hidden = !on; $('tplDir').hidden = !on;
    // served by the local add-in server but without the files API = an old server process is still running
    $('oldServer').hidden = on || !(location.hostname === 'localhost' && location.port === '43891');
    if (on) $('tplDir').textContent = 'القوالب ملفات Word حقيقية في المجلد: ' + ExamLib.folder() + ' — يمكنك أيضاً نسخ أي ملف قالب إليه.';
  }

  // ------------------------------------------------- new-template wizard
  var WIZ_FIELDS = [['CORRECTION', 'تصحيح الخطأ'], ['STEPS', 'خطوات الحل'], ['IDEA', 'الفكرة الأساسية'], ['EXPLANATION', 'الشرح'], ['CLARIFICATION', 'التوضيح'], ['TRANSLATION', 'ترجمة السؤال'], ['SOURCE', 'المصدر'], ['TIME', 'الوقت والصعوبة'], ['NOTE', 'ملاحظة']];
  function initWizard() {
    function boxes(id, list, on) {
      var host = $(id); host.innerHTML = '';
      list.forEach(function (d) {
        var cb = el('input', { type: 'checkbox', value: d[0] }); cb.checked = on.indexOf(d[0]) >= 0;
        host.appendChild(el('label', { class: 'chk' }, [cb, el('span', { text: ' ' + d[1] })]));
      });
    }
    boxes('wizRows', ExamCore.coverRows, ['SUBJECT']);
    boxes('wizFields', WIZ_FIELDS, ['CORRECTION', 'EXPLANATION']);
    function picked(id) { return Array.prototype.filter.call($(id).querySelectorAll('input'), function (c) { return c.checked; }).map(function (c) { return c.value; }); }
    function plain() { return document.querySelector('input[name=wizBase]:checked').value === 'plain'; }
    Array.prototype.forEach.call(document.querySelectorAll('input[name=wizBase]'), function (r) {
      r.addEventListener('change', function () { $('wizFieldsBox').hidden = plain(); });
    });
    async function make(open) {
      var name = $('wizName').value.trim();
      if (!name) { msg('wizStatus', 'اكتب اسماً للقالب.', 'err'); return; }
      try {
        var base = await A.originalTemplateBytes(plain() ? 'builtin' : 'builtin-solution');
        var bytes = await ExamCore.makeTemplate(JSZip, base, { header: $('wizHeader').checked, instructions: $('wizInstr').checked, rows: picked('wizRows'), fields: plain() ? null : picked('wizFields') });
        var rec = await addRecord(bytes, name);
        if (!rec) return;
        ExamLib.setActive(rec.id);
        await refreshAll();
        msg('wizStatus', 'أُنشئ القالب «' + name + '» واعتُمد.', 'ok');
        if (open) await editInWord(rec);
      } catch (e) { msg('wizStatus', 'تعذر إنشاء القالب: ' + e.message, 'err'); }
    }
    $('wizMake').addEventListener('click', function () { make(false); });
    $('wizMakeOpen').addEventListener('click', function () { make(true); });
  }

  function init() {
    A = window.ExamApp; $ = A.$;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) { x.classList.toggle('on', x === t); });
        ['make', 'templates', 'dash'].forEach(function (n) { $('tab-' + n).hidden = n !== t.getAttribute('data-tab'); });
      });
    });
    initWizard();
    $('tplSelect').addEventListener('change', function () { ExamLib.setActive(this.value); refreshAll(); });
    $('tplFile').addEventListener('change', async function (e) {
      var f = e.target.files[0]; if (!f) return;
      try { await importBytes(new Uint8Array(await f.arrayBuffer()), stem(f.name)); } catch (err) { msg('tplStatus', 'تعذر الاستيراد: ' + err.message, 'err'); }
      e.target.value = '';
    });
    $('tplAdopt').addEventListener('click', async function () {
      try { await importBytes(await A.getDocxBytes(), 'من المستند المفتوح ' + new Date().toLocaleDateString('ar')); }
      catch (err) { msg('tplStatus', 'تعذر اعتماد المستند: ' + err.message, 'err'); }
    });
    $('edSave').addEventListener('click', function () { save(false); });
    $('edSaveAs').addEventListener('click', function () { save(true); });
    $('edTry').addEventListener('click', tryIt);
    $('edClose').addEventListener('click', function () {
      if (ed && changedCount() && !window.confirm('توجد تعديلات غير محفوظة. إغلاق دون حفظ؟')) return;
      ed = null; $('editor').hidden = true;
    });
    $('edFilter').addEventListener('input', function () { if (ed) renderRows(); });
    $('edEmpty').addEventListener('change', function () { if (ed) renderRows(); });
    $('histClear').addEventListener('click', function () { ExamLib.clearHistory(); refreshDashboard(); });
    $('bkExport').addEventListener('click', exportBackup);
    $('bkFile').addEventListener('change', function (e) { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });
    $('tplReveal').addEventListener('click', function () { ExamLib.revealFolder(); });
    $('diagBtn').addEventListener('click', diagnose);
    $('draftSave').addEventListener('click', function () { saveDraft(false); });
    $('draftSaveAs').addEventListener('click', function () { saveDraft(true); });
    ExamLib.detect().then(migrateIdb).then(migrateLegacy).then(refreshAll).then(detectFilesUi).then(detectDraft);
    window.addEventListener('focus', function () { if (ExamLib.filesMode()) refreshAll(); });
    ExamLib.persistent().then(function (ok) { if (!ok) msg('tplStatus', 'تنبيه: هذا المتصفح لا يحفظ القوالب بين الجلسات؛ استخدم «نسخة احتياطية».', 'err'); });
  }

  window.ExamTplUI = { init: init, refreshDashboard: refreshDashboard, autoSaveDraft: autoSaveDraft, showUsed: showUsed };
})();
