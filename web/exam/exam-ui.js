(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var FIELDS = ['studentName', 'seat', 'regNo', 'area', 'committee', 'school', 'printCode', 'examCode', 'serial',
    'subject', 'subjectCode', 'round', 'year', 'section', 'duration', 'certificate', 'paperNo'];
  var STUDENT_FIELDS = ['studentName', 'seat', 'regNo', 'area', 'committee', 'school', 'printCode', 'examCode', 'serial'];
  var PER_STUDENT = ['studentName', 'seat', 'regNo', 'serial'];   // not remembered between sessions
  var exam = null;            // parsed source
  var built = null;           // last built docx bytes
  var inWord = false;

  function status(msg, cls) { var s = $('status'); s.textContent = msg || ''; s.className = 'status' + (cls ? ' ' + cls : ''); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem('exam.' + k); localStorage.setItem('exam.' + k, v); } catch (e) { return null; } }

  var defaults = {};            // from exam-defaults.json (the original template's values)

  function effective(f) {      // typed value, else saved default, else the original file's value
    var v = $(f).value.trim();
    if (v) return v;
    var saved = store('def.' + f);
    return saved || defaults[f] || '';
  }

  var KIND_NAMES = { en: 'إنجليزي', math: 'رياضيات', other: 'تاريخ / مواد أخرى' };
  var endTouched = false;
  function kindNow() {                                   // the subject type picked by the user, or detected from the questions
    var v = $('subjectKind') ? $('subjectKind').value : '';
    return v || (exam ? ExamCore.detectKind(exam) : 'other');
  }

  function options() {
    var o = { renumber: $('renumber').checked, includeKey: $('includeKey').checked, includeImages: $('includeImages').checked, letters: $('letters').value, showSolutions: $('showSolutions').checked,
      solutionLayout: window.ExamDesigner ? ExamDesigner.get() : null };
    var kind = kindNow();
    var dirSel = $('qdir').value;
    if (kind === 'en') { if (!o.letters) o.letters = 'en'; }
    o.dir = dirSel === 'ltr' || (!dirSel && kind === 'en') ? 'ltr' : 'rtl';
    o.endMarker = $('endMarker').checked;
    var blank = $('blankStudent').checked;
    FIELDS.forEach(function (f) {
      o[f] = (blank && STUDENT_FIELDS.indexOf(f) >= 0) ? '' : effective(f);
      if (PER_STUDENT.indexOf(f) < 0) store(f, $(f).value);
    });
    if ($('sStage') && $('sStage').value === 'basic' && !$('section').value.trim()) { o.section = ''; o.hideSection = true; }   // no "القسم" line on the basic-stage cover
    return o;
  }

  function showDefaults() {
    FIELDS.forEach(function (f) {
      var d = store('def.' + f) || defaults[f] || '';
      $(f).placeholder = d ? 'الافتراضي: ' + d : '';
    });
  }

  function showPreview(r) {
    var q = r.questions, c = { tf: 0, mcq: 0, match: 0, open: 0 };
    q.forEach(function (x) { c[x.type] += x.type === 'match' ? x.pairs.length : 1; });
    var chips = [['صح/خطأ', c.tf], ['اختيار من متعدد', c.mcq], ['مزاوجة', c.match], ['أخرى', c.open]]
      .filter(function (x) { return x[1]; })
      .map(function (x) { return '<span class="chip">' + x[0] + ': ' + x[1] + '</span>'; });
    chips.push('<span class="chip alt">نوع المادة: ' + KIND_NAMES[kindNow()] + ($('subjectKind').value ? '' : ' (تلقائي)') + '</span>');
    $('chips').innerHTML = chips.join('') || '<span class="chip">لم يُعثر على أسئلة</span>';
    var w = $('warnBox');
    w.hidden = !r.warnings.length;
    $('warnSum').textContent = 'ملاحظات على المصدر (' + r.warnings.length + ')';
    $('warnList').innerHTML = r.warnings.map(function (x) { return '<li></li>'; }).join('');
    Array.prototype.forEach.call($('warnList').children, function (li, i) { li.textContent = r.warnings[i]; });
    $('preview').hidden = false;
    var total = c.tf + c.mcq + c.match + c.open;
    $('makeWord').disabled = $('dlWord').disabled = !total;
  }

  function finishSource(parsed, extra, label) {
    exam = parsed;
    var nImg = exam.questions.reduce(function (n, q) { return n + (q.images ? q.images.length : 0); }, 0);
    if (nImg) exam.warnings.unshift('نُقلت ' + nImg + ' صورة من المصدر إلى أماكنها تحت أسئلتها.');
    if (extra && (extra.hasMath || extra.hasTables)) {
      exam.warnings.unshift('المصدر يحتوي ' + [extra.hasMath && 'معادلات', extra.hasTables && 'جداول'].filter(Boolean).join(' و') + ' لا تُنقل إلى النموذج تلقائياً؛ راجعها يدوياً.');
    }
    if (extra && extra.hasImages && !nImg) exam.warnings.unshift('المصدر يحتوي صوراً لم يمكن ربطها بأسئلة (قد تكون قبل أول سؤال أو داخل الحل)؛ راجعها يدوياً.');
    exam.warnings = exam.warnings.concat(ExamCore.audit(exam));          // numbering gaps, repeated questions, odd option counts
    $('srcInfo').textContent = label;
    built = null;
    showPreview(exam);
    status(exam.questions.length ? '' : 'لم يتم العثور على أسئلة بصيغة «س1) …» في هذا المصدر.', exam.questions.length ? '' : 'err');
  }
  function setSource(lines, extra, label) {
    finishSource(ExamCore.parseExam(lines, extra && extra.images), extra, label);
  }
  function naturalSort(a, b) { return a.name.localeCompare(b.name, 'ar', { numeric: true }); }
  /** One or several .docx/.txt/.md files (several are merged in name order, numbered from 1). */
  async function loadFiles(files) {
    files = Array.prototype.slice.call(files || []).filter(function (f) { return /\.(docx|txt|md)$/i.test(f.name) || /^text\//.test(f.type); }).sort(naturalSort);
    if (!files.length) { status('اختر ملف Word (.docx) أو نصاً (.txt / .md).', 'err'); return; }
    var parsed = [], names = [], agg = { hasMath: false, hasTables: false, hasImages: false }, failed = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      try {
        var lines, extra = null;
        if (/\.(txt|md)$/i.test(f.name) || /^text\//.test(f.type)) lines = (await f.text()).split(/\r?\n/);
        else { var r = await ExamCore.readDocxParagraphs(await JSZip.loadAsync(await f.arrayBuffer())); lines = r.lines; extra = r; }
        parsed.push(ExamCore.parseExam(lines, extra && extra.images)); names.push(f.name);
        if (extra) { agg.hasMath = agg.hasMath || !!extra.hasMath; agg.hasTables = agg.hasTables || !!extra.hasTables; agg.hasImages = agg.hasImages || !!extra.hasImages; }
      } catch (err) { failed.push(f.name + ' (' + err.message + ')'); }
    }
    if (!parsed.length) { status('تعذرت قراءة الملف: ' + failed.join('، '), 'err'); return; }
    var merged = parsed.length > 1 ? ExamCore.mergeExams(parsed, names) : parsed[0];
    if (failed.length) merged.warnings.unshift('تعذرت قراءة: ' + failed.join('، '));
    finishSource(merged, agg, parsed.length > 1 ? 'المصدر: دُمج ' + parsed.length + ' ملفات بالترتيب (' + names.join('، ') + ') — يُرقَّم النموذج من 1' : 'المصدر: ' + names[0]);
  }

  var BUILTIN = { 'builtin': { name: 'القالب الأصلي', file: 'exam-template.docx', key: 'template' },
    'builtin-solution': { name: 'القالب مع الحل والشرح', file: 'exam-template-solution.docx', key: 'templateSolution' } };
  async function originalTemplateBytes(kind) {
    var b = BUILTIN[kind || 'builtin'];
    if (window.EXAM_EMBEDDED) return b64ToBytes(window.EXAM_EMBEDDED[b.key]);
    var res = await fetch(b.file + '?v=1.10.0');
    if (!res.ok) throw new Error('تعذر تحميل القالب (' + res.status + ')');
    return new Uint8Array(await res.arrayBuffer());
  }

  /** The template chosen in the library ("builtin" = the original). */
  async function templateInfo() {
    var id = ExamLib.activeId();
    if (!BUILTIN[id]) {
      var rec = await ExamLib.get(id);
      // never fall back silently to the original: the user would think their edits were ignored
      if (!rec) throw new Error('تعذر قراءة القالب المحدد «' + id.replace(/\.docx$/i, '') + '» (الملف محذوف أو مقفل). اختر قالباً آخر من القائمة أو أغلق الملف في Word ثم أعد المحاولة.');
      return { id: id, name: rec.name, bytes: rec.bytes, updated: rec.updated, open: rec.open, file: ExamLib.filesMode() };
    }
    var kind = BUILTIN[id] ? id : 'builtin';
    return { id: kind, name: BUILTIN[kind].name, bytes: await originalTemplateBytes(kind) };
  }
  async function templateBytes() { return (await templateInfo()).bytes; }

  async function build() {
    if (!exam || !exam.questions.length) throw new Error('لا توجد أسئلة');
    status('جارٍ بناء النموذج…');
    if (window.ExamTplUI) await ExamTplUI.autoSaveDraft();      // a template being edited in this window is saved first
    var t = await templateInfo();
    try { built = await ExamCore.buildDocx(JSZip, t.bytes, exam, options()); }
    catch (e) { throw new Error('القالب «' + t.name + '»: ' + e.message); }
    var o = options();
    ExamLib.addHistory({ t: Date.now(), subject: o.subject || defaults.subject || '', round: o.round || defaults.round || '',
      year: o.year || defaults.year || '', count: built.count, tpl: t.name });
    if (window.ExamTplUI) ExamTplUI.refreshDashboard();
    var when = t.file && t.updated ? ' (آخر حفظ ' + new Date(t.updated).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' }) + ')' : '';
    if (window.ExamTplUI) ExamTplUI.showUsed(t);
    var pend = store('pendingDraft');
    built.note = (built.problems && built.problems.length ? ' ⚠ فحص الملف: ' + built.problems.join(' ') + ' ' : '') + ' القالب المستخدم: «' + t.name + '»' + when + '.' +
      (t.open ? ' تنبيه: هذا القالب مفتوح في Word؛ إن عدّلته ولم تحفظ بـ Ctrl+S فلن يظهر التعديل، احفظ ثم أنشئ من جديد.' : '');
    return built;
  }

  function b64ToBytes(b64) {
    var bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function getDocxBytes() {
    return new Promise(function (resolve, reject) {
      Office.context.document.getFileAsync(Office.FileType.Compressed, { sliceSize: 1048576 }, function (r) {
        if (r.status !== Office.AsyncResultStatus.Succeeded) return reject(new Error(r.error && r.error.message || 'تعذر قراءة المستند'));
        var f = r.value, parts = [], got = 0, len = 0;
        (function next(i) {
          f.getSliceAsync(i, function (s) {
            if (s.status !== Office.AsyncResultStatus.Succeeded) { f.closeAsync(); return reject(new Error(s.error.message)); }
            var u = new Uint8Array(s.value.data); parts.push(u); len += u.length;
            if (++got === f.sliceCount) {
              f.closeAsync();
              var out = new Uint8Array(len), o = 0;
              parts.forEach(function (p) { out.set(p, o); o += p.length; });
              resolve(out);
            } else next(i + 1);
          });
        })(0);
      });
    });
  }

  function toBase64(bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }

  function download(bytes, name, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: type }));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  function fileName(ext) {
    var o = options();
    return ('نموذج ' + (o.subject || 'أسئلة') + ' ' + [o.round, o.year].filter(Boolean).join(' ')).replace(/[\\/:*?"<>|]+/g, '-').trim() + '.' + ext;
  }

  async function readWordBody() {
    return Word.run(async function (ctx) {
      var ps = ctx.document.body.paragraphs;
      ps.load('items/text');
      await ctx.sync();
      return ps.items.map(function (p) { return p.text; });
    });
  }

  function getPdfBytes() {
    return new Promise(function (resolve, reject) {
      Office.context.document.getFileAsync(Office.FileType.Pdf, { sliceSize: 1048576 }, function (r) {
        if (r.status !== Office.AsyncResultStatus.Succeeded) return reject(new Error(r.error && r.error.message || 'تعذر الحصول على PDF'));
        var f = r.value, parts = [], got = 0;
        (function next(i) {
          f.getSliceAsync(i, function (s) {
            if (s.status !== Office.AsyncResultStatus.Succeeded) { f.closeAsync(); return reject(new Error(s.error.message)); }
            parts.push(new Uint8Array(s.value.data));
            if (++got === f.sliceCount) { f.closeAsync(); resolve(new Blob(parts, { type: 'application/pdf' })); } else next(i + 1);
          });
        })(0);
      });
    });
  }

  /** Shared with the template manager (exam-templates-ui.js). */
  window.ExamApp = {
    $: $, status: status, download: download, options: options, toBase64: toBase64, b64ToBytes: b64ToBytes,
    getExam: function () { return exam; }, inWord: function () { return inWord; },
    getDocxBytes: getDocxBytes, originalTemplateBytes: originalTemplateBytes, builtins: BUILTIN, templateInfo: templateInfo,
    fileName: fileName
  };

  // ---- smart cover: stage / branch / round / inside-or-outside → certificate, section, round line, area, committee, school
  var SMART_SAVE = ['school', 'area', 'committee', 'section', 'duration', 'year', 'subject'];
  function smartSel() {
    return { stage: $('sStage').value, branch: $('sBranch').value, round: $('sRound').value, place: $('sPlace').value, city: $('sCity').value, country: $('sCountry').value };
  }
  function smartShow() {
    var box = $('smartBox'); box.setAttribute('data-stage', $('sStage').value); box.setAttribute('data-place', $('sPlace').value);
    var note = [];
    if ($('sStage').value === 'basic') note.push('الإعدادية: بدون سطر «القسم».');
    if ($('sPlace').value === 'out') note.push('خارج ليبيا: المنطقة «خارج ليبيا»، واللجنة والمدرسة «الليبية / المدينة - البلد»، والدور يضاف له «خارجية».');
    else note.push('داخل ليبيا: لا تتغير المنطقة واللجنة والمدرسة.');
    $('sNote').textContent = note.join(' ');
  }
  function smartApply(fromStage) {
    var sel = smartSel(), saved = null;
    if (fromStage) { try { saved = JSON.parse(store('stage.' + sel.stage) || 'null'); } catch (e) { saved = null; } }
    if (saved) SMART_SAVE.forEach(function (f) { if (saved[f] != null) $(f).value = saved[f]; });     // this stage's own defaults
    var r = ExamCore.smartCover(sel);
    ['certificate', 'section', 'round'].forEach(function (f) { if (f in r) $(f).value = r[f]; });
    if (sel.place === 'out') ['area', 'committee', 'school'].forEach(function (f) { if (r[f]) $(f).value = r[f]; });
    else ['area', 'committee', 'school'].forEach(function (f) { if (/^(خارج|الليبية \/)/.test($(f).value.trim())) $(f).value = ''; });
    smartShow(); refreshInfo();
  }
  function smartRead() {                                  // typed values → the selects (so typing «خارج» is understood)
    var v = {}; FIELDS.forEach(function (f) { v[f] = $(f).value.trim(); });
    var r = ExamCore.inferCover(v);
    if (r.stage) $('sStage').value = r.stage;
    if (r.branch !== undefined) $('sBranch').value = r.branch;
    if (r.round) $('sRound').value = r.round;
    if (r.place) $('sPlace').value = r.place;
    if (r.city) $('sCity').value = r.city;
    if (r.country) $('sCountry').value = r.country;
    smartShow();
  }
  function refreshInfo() { if (typeof showDefaults === 'function') showDefaults(); }

  function wire() {
    if ($('sStage')) {
      ['sStage', 'sBranch', 'sRound', 'sPlace'].forEach(function (id) { $(id).addEventListener('change', function () { smartApply(id === 'sStage'); }); });
      ['sCity', 'sCountry'].forEach(function (id) { $(id).addEventListener('input', function () { if ($('sPlace').value === 'out') smartApply(false); }); });
      ['certificate', 'round', 'area', 'committee', 'school', 'section'].forEach(function (f) { $(f).addEventListener('change', smartRead); });
      $('sSave').addEventListener('click', function () {
        var o = {}; SMART_SAVE.forEach(function (f) { var v = $(f).value.trim(); if (v) o[f] = v; });
        store('stage.' + $('sStage').value, JSON.stringify(o));
        status('حُفظت قيم المرحلة (' + ExamCore.stages[$('sStage').value].name + ') كإعداد افتراضي لها: تُحمَّل تلقائياً عند اختيار هذه المرحلة.', 'ok');
      });
    }
    FIELDS.forEach(function (f) { var v = PER_STUDENT.indexOf(f) < 0 && store(f); if (v) $(f).value = v; });
    if ($('sStage')) smartRead();
    if (window.EXAM_EMBEDDED) { defaults = window.EXAM_EMBEDDED.defaults || {}; showDefaults(); }
    else fetch('exam-defaults.json?v=1.10.0').then(function (r) { return r.json(); })
      .then(function (d) { defaults = d; showDefaults(); }).catch(function () { /* defaults are optional */ });
    $('saveDef').addEventListener('click', function () {
      FIELDS.forEach(function (f) { var v = $(f).value.trim(); if (v) store('def.' + f, v); });
      showDefaults(); status('تم حفظ القيم المكتوبة كقيم افتراضية على هذا الجهاز.', 'ok');
    });
    $('resetDef').addEventListener('click', function () {
      FIELDS.forEach(function (f) { try { localStorage.removeItem('exam.def.' + f); } catch (e) { /* ignore */ } });
      showDefaults(); status('عادت القيم الافتراضية إلى قيم الملف الأصلي.', 'ok');
    });
    $('readDoc').disabled = !inWord;
    $('dlPdf').disabled = !inWord;
    if (!inWord) $('readDoc').title = $('dlPdf').title = 'متاح عند فتح اللوحة داخل Word';

    $('file').addEventListener('change', async function (e) {
      var fl = e.target.files;
      try { await loadFiles(fl); } catch (err) { status('تعذرت قراءة الملف: ' + err.message, 'err'); }
      e.target.value = '';
    });
    // drop files anywhere on the page
    var dragN = 0;
    document.addEventListener('dragenter', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { dragN++; document.body.classList.add('dropping'); } });
    document.addEventListener('dragleave', function () { dragN = Math.max(0, dragN - 1); if (!dragN) document.body.classList.remove('dropping'); });
    document.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); });
    document.addEventListener('drop', function (e) {
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      e.preventDefault(); dragN = 0; document.body.classList.remove('dropping');
      loadFiles(e.dataTransfer.files).catch(function (err) { status('تعذرت قراءة الملف: ' + err.message, 'err'); });
    });
    $('endMarker').addEventListener('change', function () { endTouched = true; });
    $('subjectKind').addEventListener('change', function () { if (exam) showPreview(exam); });
    $('pasteGo').addEventListener('click', function () {
      var t = $('pasteBox').value;
      if (!t.trim()) { status('الصق نص الأسئلة أولاً.', 'err'); return; }
      setSource(t.split(/\r?\n/), null, 'المصدر: نص ملصوق');
    });
    $('readDoc').addEventListener('click', async function () {
      try {
        var r2 = null;
        try { r2 = await ExamCore.readDocxParagraphs(await JSZip.loadAsync(await getDocxBytes())); } catch (e1) { r2 = null; }   // keeps lists, indentation and pictures
        if (r2) setSource(r2.lines, r2, 'المصدر: المستند المفتوح في Word');
        else setSource(await readWordBody(), null, 'المصدر: المستند المفتوح في Word');
      } catch (err) { status('تعذرت قراءة المستند: ' + err.message, 'err'); }
    });
    $('dlWord').addEventListener('click', async function () {
      try { var b = await build(); download(b.bytes, fileName('docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); status('تم إنشاء الملف (' + b.count + ' سؤال).' + b.note, 'ok'); }
      catch (err) { status('تعذر إنشاء الملف: ' + err.message, 'err'); }
    });
    $('makeWord').addEventListener('click', async function () {
      try {
        var b = await build();
        if (inWord) {
          await Word.run(async function (ctx) { ctx.application.createDocument(toBase64(b.bytes)).open(); await ctx.sync(); });
          status('تم فتح النموذج في مستند جديد (' + b.count + ' سؤال).' + b.note + ' افتح هذه اللوحة هناك لحفظ PDF.', 'ok');
        } else {
          download(b.bytes, fileName('docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          status('تم تنزيل الملف (' + b.count + ' سؤال).' + b.note, 'ok');
        }
      } catch (err) { status('تعذر إنشاء النموذج: ' + err.message, 'err'); }
    });
    $('dlPdf').addEventListener('click', async function () {
      try {
        status('جارٍ تصدير PDF من Word…');
        var blob = await getPdfBytes();
        download(blob, fileName('pdf'), 'application/pdf');
        status('تم تصدير PDF. إن لم يبدأ التنزيل فاستخدم: ملف ← تصدير ← إنشاء PDF.', 'ok');
      } catch (err) { status('تعذر تصدير PDF: ' + err.message + ' — استخدم: ملف ← تصدير ← إنشاء PDF.', 'err'); }
    });
  }

  var started = false;
  function start() { if (started) return; started = true; wire(); if (window.ExamDesigner) ExamDesigner.init(); if (window.ExamTplUI) ExamTplUI.init(); }
  if (window.Office && Office.onReady) {
    Office.onReady(function (info) { inWord = !!(info && info.host === Office.HostType.Word); start(); });
  }
  // plain browsers: Office.js loads but onReady never fires outside an Office host
  if (window.EXAM_EMBEDDED) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  } else setTimeout(start, 1500);
})();
