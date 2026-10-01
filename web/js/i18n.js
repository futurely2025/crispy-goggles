/* UI strings (Arabic / English) + shared settings store */
(function (global) {
  'use strict';
  var S = {
    ar: {
      appName: 'معادلات عربية', editorTitle: 'محرر المعادلات', loading: 'جارٍ التحميل…',
      zoomIn: 'تكبير', zoomOut: 'تصغير', fitWidth: 'ملاءمة العرض', expand: 'ملء الشاشة', toggleToolbar: 'إظهار/إخفاء شريط الرموز',
      studios: 'أدوات متقدمة', stGraph: 'رسم الدوال', stGeometry: 'الأشكال الهندسية', stStructure: 'الصيغ البنائية', stSolve: 'حل خطوة بخطوة', stChart: 'الإحصاء والرسوم البيانية', stPhysics: 'الفيزياء والميكانيكا', stCircuit: 'الدوائر الكهربائية', stPdf: 'استوديو PDF — حلول على الكتب', stPdfTools: 'أدوات PDF — دمج، ضغط، تحويل…', stChem: 'الكيمياء: الذرة والمختبر', copyImage: 'نسخ كصورة', imageCopied: 'تم نسخ الصورة — الصقها في تطبيقك (Ctrl+V)', stDiagram: 'جدول التغيرات والمخططات',
      figGraph: 'رسم بياني', figGeometry: 'شكل هندسي', figStructure: 'صيغة بنائية', figInserted: 'تم إدراج الرسم', selectedFig: 'الرسم المحدد', figUpdated: 'تم تحديث الرسم',
      tagline: 'أسهل طريقة لكتابة المعادلات العربية والكيميائية في Word',
      math: 'رياضيات', chem: 'كيمياء',
      insertMath: 'إدراج وتحرير معادلة رياضية', insertChem: 'إدراج وتحرير معادلة كيميائية',
      notation: 'الترميز', notationAr: 'عربي', notationEn: 'English',
      digits: 'الأرقام', mathFont: 'خط الرياضيات', arFont: 'الخط العربي', size: 'الحجم', bold: 'عريض', color: 'اللون',
      undo: 'تراجع', redo: 'إعادة', visual: 'مرئي', latex: 'LaTeX',
      preview: 'المعاينة النهائية', insert: 'إدراج', update: 'تحديث المعادلة', cancel: 'إلغاء', close: 'إغلاق',
      saveDefault: 'استخدام هذا الخط والحجم افتراضياً',
      emptyPreview: 'ستظهر المعادلة هنا', typeHere: 'اكتب المعادلة هنا…',
      chemPlaceholder: 'مثال:  2H2 + O2 -> 2H2O', latexPlaceholder: 'مثال:  جا^2 س + جتا^2 س = 1',
      rows: 'الصفوف', cols: 'الأعمدة', brackets: 'الأقواس', none: 'بدون',
      periodic: 'الجدول الدوري', layout: 'ترتيب المعادلات', stack: 'تحت بعض', inline: 'في نفس السطر', auto: 'حسب الأسطر الفارغة',
      display: 'سطر مستقل', inlineEq: 'داخل السطر',
      multiInVisual: 'النص يحتوي على عدة معادلات — استخدم وضع LaTeX لتحريرها معاً.',
      error: 'خطأ', copied: 'تم النسخ', copyImage: 'نسخ كصورة', downloadPng: 'تنزيل PNG',
      fontClassic: 'كلاسيكي (STIX)', fontLatex: 'LaTeX (Computer Modern)', fontSans: 'حديث (Fira Sans)',
      selected: 'المعادلة المحددة', edit: 'تحرير', toLatex: 'إلى LaTeX', delete: 'حذف', copyLatex: 'نسخ LaTeX',
      noSelection: 'اضغط على أي معادلة في المستند لتحريرها.',
      quickLatex: 'إدراج سريع من LaTeX', docTools: 'أدوات المستند', docIndex: 'فهرس المستند وفحصه', scanDoc: 'فحص المستند الآن', settings: 'الإعدادات', help: 'مساعدة',
      convertDollars: 'تحويل كل LaTeX في المستند (بـ $ أو بدونها، والرسوم والجداول)', allToLatex: 'إرجاع المعادلات إلى كود LaTeX', refreshAll: 'تطبيق الإعدادات على كل المعادلات',
      openIn: 'فتح المحرر في', popup: 'نافذة منبثقة', sidePane: 'اللوحة الجانبية', uiLang: 'لغة الواجهة',
      quality: 'جودة الصورة الاحتياطية', vector: 'إدراج متّجه SVG — حادّ عند أي تكبير', autoEdit: 'فتح المحرر تلقائياً عند تحديد معادلة', figClear: 'خلفية شفافة للرسوم (بدون أبيض) — يُطبَّق على الموجود والجديد',
      inserted: 'تم إدراج المعادلة', updated: 'تم تحديث المعادلة', working: 'جارٍ العمل…',
      connected: 'متصل بـ Word', browserMode: 'وضع المتصفح — افتح الإضافة من Word للإدراج المباشر',
      dialogBlocked: 'تعذر فتح النافذة المنبثقة — سيتم فتح المحرر في اللوحة الجانبية.',
      numberTip: 'ترقيم المعادلة تلقائياً (1)، (2)…', numberOn: 'الترقيم التلقائي مفعّل — المعادلة في سطر مستقل برقم', numberOff: 'الترقيم التلقائي متوقف',
      history: 'آخر المعادلات', historyEmpty: 'لا توجد معادلات سابقة بعد',
      export: 'تصدير', expPng: 'نسخ كصورة PNG', expPngFile: 'تنزيل صورة PNG', expSvg: 'تنزيل SVG (للويب والتطبيقات)', expLatex: 'نسخ كود LaTeX', expMathml: 'نسخ MathML',
      colorSelection: 'لون الجزء المحدد', colorEquation: 'لون المعادلة', colorText: 'لون النص', sameAsEq: 'مثل لون المعادلة', custom: 'لون مخصص',
      colorHint: 'حدد جزءاً من المعادلة ثم اختر لونه. «لون النص» للكلام داخل المعادلة (\\text) وللنص بين المعادلات.',
      aiCopy: 'صيغة الذكاء الاصطناعي', aiCopyTip: 'انسخ التعليمات وأعطها لـ ChatGPT أو Claude ليكتب المعادلات بالصيغة التي تفهمها الإضافة',
      aiPaste: 'لصق من الذكاء الاصطناعي', aiPasteTip: 'يلصق ردّ الذكاء الاصطناعي وينظّفه تلقائياً (\\[ \\] و$$ و** و#)',
      aiCopied: 'تم نسخ صيغة الذكاء الاصطناعي — الصقها في بداية محادثتك معه', aiCleaned: 'تم تنظيف النص الملصوق وتحويله لصيغة الإضافة',
      aiPasteHint: 'اضغط Ctrl+V داخل المربع — سيُنظَّف النص تلقائياً', aiGuide: 'دليل الصيغة لكل الأدوات (LaTeX)',
      textWord: 'النص', textBoldTip: 'النص الموجود بين المعادلات: عادي أو عريض',
      textHint: 'الأسطر النصية والتعليقات (%) تُدرج نصاً عادياً قابلاً للتعديل. ولكتابة نص ومعادلة في نفس السطر: مساحة الدائرة: $م = \\pi نق^2$ — و%% لتعليق مخفي',
      functions: 'أسماء الدوال', sum: 'رمز المجموع', comma: 'الفاصلة', names: 'تخصيص أسماء الدوال', reset: 'استعادة الافتراضي'
    },
    en: {
      zoomIn: 'Zoom in', zoomOut: 'Zoom out', fitWidth: 'Fit width', expand: 'Full screen', toggleToolbar: 'Show/hide toolbar',
      studios: 'Advanced tools', stGraph: 'Function graphs', stGeometry: 'Geometry figures', stStructure: 'Structural formulas', stSolve: 'Step-by-step solver', stChart: 'Statistics & charts', stPhysics: 'Physics & mechanics', stCircuit: 'Electric circuits', stPdf: 'PDF studio — solutions on books', stPdfTools: 'PDF tools — merge, compress, convert…', stChem: 'Chemistry: atoms & lab', copyImage: 'Copy as image', imageCopied: 'Image copied — paste it in your app (Ctrl+V)', stDiagram: 'Tables & diagrams',
      figGraph: 'Graph', figGeometry: 'Geometry', figStructure: 'Structure', figInserted: 'Figure inserted', selectedFig: 'Selected figure', figUpdated: 'Figure updated',
      appName: 'Arabic Math', editorTitle: 'Equation editor', loading: 'Loading…',
      tagline: 'The easiest way to write Arabic math and chemistry in Word',
      math: 'Math', chem: 'Chemistry',
      insertMath: 'Insert & edit math', insertChem: 'Insert & edit chemistry',
      notation: 'Notation', notationAr: 'Arabic', notationEn: 'English',
      digits: 'Digits', mathFont: 'Math font', arFont: 'Arabic font', size: 'Size', bold: 'Bold', color: 'Color',
      undo: 'Undo', redo: 'Redo', visual: 'Visual', latex: 'LaTeX',
      preview: 'Final preview', insert: 'Insert', update: 'Update equation', cancel: 'Cancel', close: 'Close',
      saveDefault: 'Use this font and size as the default',
      emptyPreview: 'Your equation will appear here', typeHere: 'Type the equation…',
      chemPlaceholder: 'e.g.  2H2 + O2 -> 2H2O', latexPlaceholder: 'e.g.  \\sin^2 x + \\cos^2 x = 1',
      rows: 'Rows', cols: 'Columns', brackets: 'Brackets', none: 'None',
      periodic: 'Periodic table', layout: 'Layout', stack: 'Stacked', inline: 'Same line', auto: 'By blank lines',
      display: 'Display', inlineEq: 'Inline',
      multiInVisual: 'The text has several equations — use LaTeX mode to edit them together.',
      error: 'Error', copied: 'Copied', copyImage: 'Copy as image', downloadPng: 'Download PNG',
      fontClassic: 'Classic (STIX)', fontLatex: 'LaTeX (Computer Modern)', fontSans: 'Modern (Fira Sans)',
      selected: 'Selected equation', edit: 'Edit', toLatex: 'To LaTeX', delete: 'Delete', copyLatex: 'Copy LaTeX',
      noSelection: 'Click an equation in the document to edit it.',
      quickLatex: 'Quick insert from LaTeX', docTools: 'Document tools', docIndex: 'Document index & check', scanDoc: 'Scan the document', settings: 'Settings', help: 'Help',
      convertDollars: 'Convert all LaTeX in the document (with or without $, figures, tables)', allToLatex: 'Turn equations back into LaTeX', refreshAll: 'Apply settings to all equations',
      openIn: 'Open editor in', popup: 'Pop-up window', sidePane: 'Side pane', uiLang: 'Interface language',
      quality: 'Fallback image quality', vector: 'Insert as vector (SVG): sharp at any zoom, print and PDF', autoEdit: 'Open the editor automatically when an equation is selected', figClear: 'Transparent figure background (no white) — existing and new figures',
      inserted: 'Equation inserted', updated: 'Equation updated', working: 'Working…',
      connected: 'Connected to Word', browserMode: 'Browser mode — open the add-in from Word to insert',
      dialogBlocked: 'The pop-up could not be opened — opening the editor in the side pane.',
      numberTip: 'Auto-number the equation (1), (2)…', numberOn: 'Auto numbering on — display equation with a number', numberOff: 'Auto numbering off',
      history: 'Recent equations', historyEmpty: 'No equations yet',
      export: 'Export', expPng: 'Copy as PNG image', expPngFile: 'Download PNG', expSvg: 'Download SVG (web & apps)', expLatex: 'Copy LaTeX', expMathml: 'Copy MathML',
      colorSelection: 'Selected part colour', colorEquation: 'Equation colour', colorText: 'Text colour', sameAsEq: 'Same as equation', custom: 'Custom colour',
      colorHint: 'Select part of the equation, then pick its colour. “Text colour” applies to words inside the equation (\\text) and text between equations.',
      aiCopy: 'AI format', aiCopyTip: 'Copy instructions for ChatGPT/Claude so they write equations in the add-in format',
      aiPaste: 'Paste from AI', aiPasteTip: 'Paste an AI answer and clean it automatically (\\[ \\], $$, **, #)',
      aiCopied: 'AI format copied — paste it at the start of your AI chat', aiCleaned: 'Pasted text cleaned into the add-in format',
      aiPasteHint: 'Press Ctrl+V inside the box — it will be cleaned automatically', aiGuide: 'Format guide for every tool (LaTeX)',
      textWord: 'Text', textBoldTip: 'Text between equations: normal or bold',
      textHint: 'Text lines and % comments become normal, editable text. Mix text and math on one line: Area: $A = \\pi r^2$ — %% for a hidden comment',
      functions: 'Function names', sum: 'Sum symbol', comma: 'Comma', names: 'Custom function names', reset: 'Reset to default'
    }
  };

  var KEY = 'armath.v2.settings';
  var DEF = {
    lang: 'ar', rtl: true, digits: 'western', arabicFunctions: true, arabicComma: true, sumStyle: 'mirror',
    font: 'Amiri', mathFont: 'stix2', fontSize: 14, color: '#000000', bold: false, display: false,
    openIn: 'dialog', dpi: 900, dpiV: 2, vector: true, autoEdit: false, layout: 'stack', sep: 'space', labels: false, names: null, figBg: ''
  };
  function load() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
    var o = {};
    for (var k in DEF) o[k] = s[k] !== undefined ? s[k] : DEF[k];
    // 5.8: the fallback picture is 900 dpi by default; a stored old default (600) is raised once, a deliberate choice is kept
    if (s.dpiV !== 2 && (s.dpi === undefined || +s.dpi === 600)) o.dpi = 900;
    return o;
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }

  var lang = load().lang;
  global.I18N = {
    strings: S,
    get lang() { return lang; },
    setLang: function (l) { lang = S[l] ? l : 'ar'; },
    t: function (k) { return (S[lang] && S[lang][k]) || S.ar[k] || k; },
    apply: function (root) {
      Array.prototype.forEach.call((root || document).querySelectorAll('[data-i18n]'), function (el) {
        el.textContent = I18N.t(el.getAttribute('data-i18n'));
      });
      Array.prototype.forEach.call((root || document).querySelectorAll('[data-i18n-title]'), function (el) {
        el.title = I18N.t(el.getAttribute('data-i18n-title'));
      });
      Array.prototype.forEach.call((root || document).querySelectorAll('[data-i18n-ph]'), function (el) {
        el.placeholder = I18N.t(el.getAttribute('data-i18n-ph'));
      });
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
    }
  };
  global.Settings = { KEY: KEY, DEF: DEF, load: load, save: save };
})(window);
