/* Self-test: runs every feature of the add-in in this browser / Word pane and reports what fails, with details.
 * Nothing is inserted into a document. Word checks are read-only and come from the task pane (passed in the URL). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var init = {};
  try { var m = location.hash.match(/#d=(.*)$/); if (m) init = JSON.parse(decodeURIComponent(m[1])) || {}; } catch (e) { init = {}; }
  var inPane = window.parent !== window;
  $('ver').textContent = ArLog.version;
  if (inPane) $('closeBtn').hidden = false;

  var OPTS = { rtl: true, arabicFunctions: true, arabicComma: true, digits: 'western', fontSize: 14, mathFont: 'stix2', font: 'Amiri', display: true, mode: 'math', color: '#000000',
    names: { sin: 'جا', cos: 'جتا', tan: 'طا', cot: 'طتا', sec: 'قا', csc: 'قتا', log: 'لو', ln: 'لط', lim: 'نها' } };
  function withTimeout(p, ms, what) {
    return Promise.race([p, new Promise(function (res, rej) { setTimeout(function () { rej(new Error('انتهى الوقت (' + Math.round(ms / 1000) + ' ث): ' + what)); }, ms); })]);
  }
  function need(cond, msg) { if (!cond) throw new Error(msg); }
  function render(tex, o) {
    return RenderHost.render(tex, Object.assign({}, OPTS, o || {}), 150).then(function (r) {
      need(!(r.errors && r.errors.length), (r.errors || []).join(' — '));
      need(r.pngBase64 && r.pngBase64.length > 200, 'صورة فارغة');
      return r;
    });
  }

  // ------------------------------------------------------------ the tests
  var FIGS = [
    ['رسم دالة', '\\begin{graph}[x=-4:4, y=-5:6, extrema]\n  \\plot{س^2 - 4}\n  \\point[label=أ]{(0, -4)}\n\\end{graph}'],
    ['دالتان ومساحة (π)', '\\begin{graph}[x=-0.5:7, pi]\n  \\plot{جا س}\n  \\plot[color=red, dashed]{جتا س}\n  \\area[of=1, from=0, to=\\pi]\n\\end{graph}'],
    ['pgfplots', '\\begin{tikzpicture}\n\\begin{axis}[xmin=-3, xmax=3]\n  \\addplot[blue, domain=-3:3]{exp(-x^2)};\n\\end{axis}\n\\end{tikzpicture}'],
    ['مثلث بأطواله', '\\begin{geometry}[sides=values, angles=values]\n  \\triangle{أ,ب,جـ}[sides=5,6,7]\n\\end{geometry}'],
    ['إنشاءات هندسية', '\\begin{geometry}\n  \\triangle{أ,ب,جـ}[sides=5,6,7]\n  \\circumcircle[center=م]{أ,ب,جـ}\n  \\perpbisector{أ,ب}\n\\end{geometry}'],
    ['انعكاس', '\\begin{geometry}\n  \\triangle{أ,ب,جـ}[sides=5,6,7]\n  \\reflect[over={أ,ب}]{أ,ب,جـ}\n\\end{geometry}'],
    ['أعمدة', '\\begin{chart}[type=bar, title=درجات]\n  \\data{الرياضيات:85, الفيزياء:78}\n\\end{chart}'],
    ['مدرج تكراري', '\\begin{chart}[type=histogram, polygon]\n  \\classes{10-20:4, 20-30:7, 30-40:12}\n\\end{chart}'],
    ['التوزيع الطبيعي', '\\begin{chart}[type=normal, mean=50, sd=10, from=40, to=60]\n\\end{chart}'],
    ['ذو الحدين', '\\begin{chart}[type=binomial, n=10, p=0.3, from=2, to=4]\n\\end{chart}'],
    ['مستوى مائل', '\\begin{physics}\n  \\incline[angle=30, base=6, name=م]{(0,0)}\n  \\block[on=م, at=0.55, name=ج]{ك}\n  \\force[from=ج, angle=-90, len=1.6]{و}\n\\end{physics}'],
    ['منحنى الحركة', '\\begin{physics}\n  \\motion[type=vt, area, slopes]{(0,0) (2,10) (5,10) (7,0)}\n\\end{physics}'],
    ['موجة', '\\begin{physics}\n  \\wave[amplitude=1, wavelength=4, length=10]{(0,0)}\n\\end{physics}'],
    ['دائرة كهربائية', '\\begin{circuit}\n  \\battery{(0,0)}{(0,3)}\n  \\resistor[label=م₁]{(0,3)}{(4,3)}\n  \\lamp{(4,3)}{(4,0)}\n  \\switch{(4,0)}{(0,0)}\n\\end{circuit}'],
    ['circuitikz', '\\begin{circuitikz}\n\\draw (0,0) to[battery1] (0,3) to[R] (4,3) to[C] (4,0) -- (0,0);\n\\end{circuitikz}'],
    ['جدول التغيرات (تلقائي)', '\\begin{vartable}\n  \\auto{س^3 - 3س}\n\\end{vartable}'],
    ['جدول الإشارة', '\\begin{signtable}\n  \\x{-\\infty, -2, 3, +\\infty}\n  \\sign[name=س + 2]{-, 0, +, |, +}\n\\end{signtable}'],
    ['خط الأعداد', '\\begin{numberline}\n  \\solution{-2 < س \\le 3}\n\\end{numberline}'],
    ['أشكال فن', '\\begin{venn}[sets={أ,ب}, shade={أ∩ب}]\n  \\region[أ]{1, 2}\n  \\region[أ∩ب]{3}\n\\end{venn}'],
    ['شجرة احتمالات', '\\begin{tree}[products]\n- أحمر [0.3]\n  - أزرق [0.5]\n- أزرق [0.7]\n\\end{tree}'],
    ['صيغة بنائية chemfig', '\\chemfig[name=الإيثانول]{CH_3-CH_2-OH}'],
    ['صيغة بنائية SMILES', '\\smiles[name=الأسبرين]{CC(=O)Oc1ccccc1C(=O)O}'],
    ['بطاقة عنصر', '\\element{Fe}'],
    ['نموذج بور', '\\bohr{Na}'],
    ['رمز لويس (أيون)', '\\lewis{O2-}'],
    ['أوربيتالات', '\\orbital[short]{Fe}'],
    ['الجدول الدوري', '\\ptable[highlight={Na,K}]'],
    ['أدوات المختبر', '\\begin{lab}\n  \\beaker[fill=0.5, label=ماء]{(0,0)}\n  \\burner{(3,0)}\n\\end{lab}']
  ];
  var TABLES = [
    ['جدول tabular', '\\begin{tabular}{|c|c|}\n\\hline\nس & ص \\\\ \\hline\n1 & $س^2$ \\\\ \\hline\n\\end{tabular}'],
    ['جدول تكراري', '\\freqtable{2:3, 4:5, 6:2}'],
    ['جدول المقاييس', '\\statstable{12, 15, 18, 20}'],
    ['جدول Z', '\\ztable[from=0, to=1]'],
    ['جدول ذي الحدين', '\\binomtable[n=5, p=0.4]']
  ];

  var TESTS = [];
  function T(group, name, fn, o) { TESTS.push({ group: group, name: name, fn: fn, info: o && o.info, ms: (o && o.ms) || 25000 }); }

  // ---- environment
  T('البيئة', 'الإصدار وسجل الأخطاء', function () { need(window.ArLog, 'السجل غير محمّل'); return 'v' + ArLog.version + ' — ' + ((navigator.userAgent.match(/(Edg|Chrome|Firefox|Version)\/[\d.]+/g) || []).pop() || navigator.userAgent.slice(0, 40)); });
  T('البيئة', 'التخزين المحلي', function () { localStorage.setItem('armath.selftest', '1'); need(localStorage.getItem('armath.selftest') === '1', 'localStorage لا يعمل'); localStorage.removeItem('armath.selftest'); return 'يعمل'; });
  T('البيئة', 'قاعدة البيانات (IndexedDB)', function () {
    return new Promise(function (res, rej) { if (!window.indexedDB) return rej(new Error('غير مدعومة — الحفظ التلقائي في استوديو PDF لن يعمل')); var r = indexedDB.open('armath-selftest', 1); r.onsuccess = function () { r.result.close(); indexedDB.deleteDatabase('armath-selftest'); res('تعمل'); }; r.onerror = function () { rej(r.error || new Error('تعذّر الفتح')); }; });
  });
  T('البيئة', 'الخطوط العربية', function () {
    return document.fonts.load('16px Amiri', 'أبج').then(function () { need(document.fonts.check('16px Amiri', 'أبج'), 'خط أميري لم يُحمَّل من fonts/arabic'); return 'أميري محمّل'; });
  });
  T('البيئة', 'الحافظة (نسخ الصور)', function () { need(navigator.clipboard && window.ClipboardItem, 'المتصفح لا يسمح بنسخ الصور — سيُستخدم التنزيل بدلاً منه'); return 'متاحة'; }, { info: true });
  T('البيئة', 'العمل بدون إنترنت', function () { need('serviceWorker' in navigator, 'غير مدعوم في هذا المتصفح'); return location.protocol === 'https:' ? 'مدعوم' : 'مدعوم (يحتاج https)'; }, { info: true });
  T('Word', 'معلومات Word', function () {
    var w = init.word;
    if (!w) throw new Error(inPane ? 'لم تصل معلومات Word' : 'افتح الفحص من داخل Word (الإعدادات ← الفحص الذاتي) لفحص Word');
    if (w.error) throw new Error(w.error);
    need(w.api13, 'Word لا يدعم WordApi 1.3 — الإضافة تحتاجه');
    return w.host + ' — ' + w.platform + ' ' + w.version + ' | WordApi: ' + w.maxApi + ' | فقرات المستند: ' + w.paras + ' | معادلات الإضافة: ' + w.eqs;
  }, { info: !init.word });

  // ---- equations
  T('المعادلات', 'محرك الرسم (MathJax)', function () { return withTimeout(RenderHost.warm('stix2'), 30000, 'renderer.html').then(function () { return 'جاهز'; }); }, { ms: 35000 });
  T('المعادلات', 'القانون العام', function () { return render('س = \\frac{-ب \\pm \\sqrt{ب^2 - 4 أ جـ}}{2 أ}').then(function (r) { return Math.round(r.widthPt) + '×' + Math.round(r.heightPt) + ' نقطة'; }); });
  T('المعادلات', 'دوال عربية ونهايات وتكامل', function () { return render('نها_{س \\to 0} \\frac{جا س}{س} + \\int_{0}^{\\pi} جتا س \\, ءس = 1').then(function () { return 'تم'; }); });
  T('المعادلات', 'مصفوفة ونظام معادلات', function () { return render('\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix} , \\begin{cases} 2س + ص = 5 \\\\ س - ص = 1 \\end{cases}').then(function () { return 'تم'; }); });
  T('المعادلات', 'الوحدات والأعداد', function () { return render('ت = \\qty{9.8}{m/s^2} , \\num{6.02e23}').then(function () { return 'تم'; }); });
  T('المعادلات', 'معادلة كيميائية', function () { return render('2H2 + O2 -> 2H2O', { mode: 'chem' }).then(function () { return 'تم'; }); });
  T('المعادلات', 'التوزيع الإلكتروني', function () { return render('\\econfig[short]{Fe}').then(function () { return 'تم'; }); });
  T('المعادلات', 'خلفية المعادلة: شفافة وبيضاء وملونة (5.4)', function () {
    return Promise.all([render('س^2', { bg: '' }), render('س^2', { bg: '#ffffff' }), render('س^2', { bg: '#fce4ec' })]).then(function (r) {
      need(!/<rect/.test(r[0].svgString), 'الشفافة فيها خلفية');
      need(/<rect[^>]*fill="#ffffff"/.test(r[1].svgString), 'البيضاء بلا خلفية');
      need(/<rect[^>]*fill="#fce4ec"/.test(r[2].svgString), 'الملونة بلا خلفية');
      return 'شفافة ✓ بيضاء ✓ ملونة ✓';
    });
  });
  T('المعادلات', 'محاذاة المعادلات على = (5.4.1)', function () {
    need(window.EqAlign, 'وحدة المحاذاة غير محمّلة');
    var tex = ['2س + 3 = 7', '2س = 4', 'س = \\frac{4}{2} = 2'];
    return Promise.all(tex.map(function (t) { return RenderHost.preview(t, OPTS); })).then(function (rs) {
      rs.forEach(function (r, i) { need(r.rel !== null && r.rel > 0 && r.rel < r.width, 'لم أجد = في ' + tex[i]); });
      var p = EqAlign.pads(rs.map(function (r) { return { w: r.width, rel: r.rel }; }), 30);
      var W = rs.map(function (r, i) { return r.width + (p[i] ? p[i].padL + p[i].padR : 0); }), X = rs.map(function (r, i) { return r.rel + (p[i] ? p[i].padL : 0); });
      need(Math.max.apply(null, W) - Math.min.apply(null, W) < 0.01 && Math.max.apply(null, X) - Math.min.apply(null, X) < 0.01, 'العروض أو مواضع = غير متساوية');
      return 'ثلاث معادلات: نفس العرض و= في نفس المكان ✓';
    });
  });
  T('المعادلات', 'مدير الخطوط (5.4)', function () {
    need(window.UserFonts, 'مدير الخطوط غير محمّل');
    return fetch('fonts/vector/Cairo-400.ttf').then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      var n = UserFonts.fontName(buf);
      need(/cairo/i.test(n), 'قراءة اسم الخط: ' + n);
      return 'خطوطك: ' + UserFonts.families().length + (UserFonts.families().length ? ' (' + UserFonts.families().join('، ') + ')' : '') + ' — قراءة ملفات الخطوط ✓';
    });
  });
  T('المعادلات', 'نص عربي فوق سهم التفاعل بمسافاته (5.7)', function () {
    return RenderHost.mathml('\\ce{A ->[عامل حفاز] B}', Object.assign({}, OPTS, { mode: 'chem' })).then(function (m) {
      need(/عامل[\s\u00A0]+حفاز|عامل<\/mtext>[\s\S]*?<mspace|عامل\s/.test(m) || /عامل حفاز/.test(m), 'الكلمتان ملتصقتان: ' + m.slice(0, 160));
      return '«عامل حفاز» بمسافة ✓';
    });
  });
  T('المعادلات', 'الأرقام والحروف بالخط المختار «Aa» (5.7)', function () {
    var o = Object.assign({}, OPTS, { font: 'Cairo', latinFont: true });
    return RenderHost.mathml('3x + 25', o).then(function (m) {
      need(/<mn[^>]*fontfamily="[^"]*Cairo[^"]*Arimo/.test(m), 'الأرقام لم تأخذ الخط: ' + m.slice(0, 160));
      need(/<mi[^>]*fontstyle="italic"/.test(m), 'المتغير فقد الميل');
      return RenderHost.preview('3x + 25', o);
    }).then(function (r) { return Vector.fromSVG(r.svgString); }).then(function (v) {
      need(/<path/.test(v) && !/<text/.test(v), 'بقيت نصوص غير محوّلة'); return 'القاهرة + Arimo ✓ متّجه ✓';
    });
  });
  T('المعادلات', 'كشف الأخطاء (أمر خاطئ مقصود)', function () {
    return RenderHost.render('\\frc{1}{2}', OPTS, 150).then(function (r) { need(r.errors && r.errors.length, 'لم يُكتشف الأمر الخاطئ \\frc'); return 'اكتُشف: ' + r.errors[0]; });
  });
  T('المعادلات', 'التحويل المتّجه (SVG)', function () {
    need(Vector.supported(), 'المتصفح لا يدعم التحويل المتجه');
    return RenderHost.preview('س^2 + جا س', OPTS).then(function (r) { return Vector.fromSVG(r.svgString); }).then(function (v) {
      need(/<path/.test(v) && !/<text/.test(v), 'بقيت نصوص غير محوّلة'); return Math.round(v.length / 1024) + ' ك.ب';
    });
  }, { ms: 40000 });

  // ---- figures
  FIGS.forEach(function (f) {
    T('الرسوم', f[0], function () {
      var sc = Figures.scan(f[1]), b = sc.blocks[0];
      need(b && b.type === 'figure', 'لم يُتعرّف على الرسم');
      return Figures.prepare(b).then(function (md) {
        return Figures.render(md.kind, md.data).then(function (r) {
          need(r && r.w > 10 && r.h > 10 && r.svg && r.svg.length > 200, 'رسم فارغ');
          return Figures.serialize(md.kind, md.data).then(function (code) {
            var b2 = Figures.scan(code).blocks[0];
            need(b2, 'الكود الناتج لا يُقرأ ثانية: ' + code.slice(0, 60));
            return Figures.prepare(b2).then(function () { return md.kind + ' — ' + Math.round(r.w) + '×' + Math.round(r.h); });
          });
        });
      });
    });
  });
  TABLES.forEach(function (t) {
    T('الجداول', t[0], function () {
      var b = Figures.scan(t[1]).blocks[0];
      need(b, 'لم يُتعرّف على الجدول');
      return Figures.prepare(b).then(function (md) { need(md.type === 'table' && md.table.rows.length, 'جدول فارغ'); return md.table.rows.length + ' صفوف'; });
    });
  });

  // ---- tools
  T('الأدوات', 'منظّف ردود الذكاء الاصطناعي', function () {
    var out = AIFormat.clean('## العنوان\n\n**المعطى:** \\( x^2 = 4 \\)\n\n\\[\nx = \\pm 2\n\\]');
    need(/x\^2 = 4/.test(out) && !/\\\(|\\\[|\*\*/.test(out), 'نتيجة غير متوقعة: ' + out.slice(0, 80)); return 'تم';
  });
  T('الأدوات', 'اكتشاف الصيغ المكتوبة في المستند', function () {
    var f = DocScan.find(['المساحة $A=\\pi r^2$ والحجم', 'السعر 5$ فقط', '\\begin{graph}', '\\plot{x^2}', '\\end{graph}', '$$س^2$$']);
    need(f.length === 3, 'وُجد ' + f.length + ' بدل 3'); return f.map(function (x) { return x.type; }).join('، ');
  });
  T('الأدوات', 'فهم LaTeX في المستند بدون $ (5.5)', function () {
    need(window.LatexSense, 'وحدة الفهم غير محمّلة');
    var r = DocScan.find(['فإن: \\frac{أ}{ب} = \\dots', 'أ) 3 \\hspace{4cm} ب) -3', 'مثل \\frac{}{} و \\sqrt{}', 'التفاعل 2H_2 + O_2 \\rightarrow 2H_2O هنا', 'ع_{ر،د} = $\\frac{1}{2}$']);
    var eq = r.filter(function (m) { return m.type !== 'space'; }), sp = r.filter(function (m) { return m.type === 'space'; });
    need(eq.length === 3, 'عدد الصيغ ' + eq.length + ': ' + eq.map(function (m) { return m.tex; }).join(' | '));
    need(sp.length === 1 && sp[0].text === '\t', 'المسافة \\hspace لم تتحول');
    need(LatexSense.classify(eq[1].tex).mode === 'chem', 'التفاعل لم يُعرف كيمياء');
    need(/ع_\{ر،د\} = \\frac/.test(eq[2].tex), 'لم تُدمج «ع_{ر،د} =» مع $…$');
    return 'كسر بدون $ ✓ — \\hspace → مسافة ✓ — أمثلة فارغة تُترك ✓ — كيمياء بدون \\ce ✓ — دمج ✓';
  });
  T('الأدوات', 'الحل خطوة بخطوة', function () {
    return Figures.loadAll(['vendor/nerdamer/all.min.js?v=1.1.13', 'js/math/cas.js?v=5.2.0']).then(function () {
      var r = ArabicCAS.steps('solve', 'س^2 - 5س + 6 = 0');
      var txt = JSON.stringify(r);
      need(/2/.test(txt) && /3/.test(txt), 'الحل لا يحوي 2 و 3'); return (r.steps || []).length + ' خطوات';
    });
  });
  T('الأدوات', 'حاسبة الدوائر', function () { var r = CircuitCalc.solve('م1 + (م2 || م3)', 'م1=4, م2=6, م3=3', 'جـ=12'); need(Math.abs(r.R - 6) < 1e-9 && Math.abs(r.I - 2) < 1e-9, 'م=' + r.R + ' ت=' + r.I); return 'م = 6 Ω، ت = 2 A'; });
  T('الأدوات', 'الاحتمالات', function () { var p = Prob.phi(1) - Prob.phi(-1); need(Math.abs(p - 0.6827) < 0.001, 'Φ خاطئة: ' + p); return 'P(-1<Z<1) = ' + p.toFixed(4); });
  T('الأدوات', 'موازنة المعادلات الكيميائية', function () { var b = ChemBalance.balance('Fe + O2 -> Fe2O3'); need(/4\s*Fe/.test(b.text) && /3\s*O2/.test(b.text), b.text); return b.text; });
  T('الأدوات', 'الحسابات الكيميائية', function () { var st = ChemCalc.TYPES.molar.run(['H2SO4']); need(/98\.07/.test(JSON.stringify(st)), 'الكتلة المولية خاطئة'); return 'H₂SO₄ = 98.07 g/mol'; });
  T('الأدوات', 'الجدول الدوري', function () { var e = ChemElements.info('Fe'); need(e.z === 26 && e.shells.join(',') === '2,8,14,2', JSON.stringify(e.shells)); return 'Fe: ' + e.shells.join('، '); });

  // ---- Word packaging (no document needed)
  T('Word', 'تجهيز المعادلة للإدراج (OOXML)', function () {
    return WordBridge.renderItems([{ tex: 'س^2 = 4', line: 0 }], 'math', OPTS, 150).then(function (items) {
      var x = WordBridge.buildOoxml(items, { rtl: true, display: true });
      var doc = new DOMParser().parseFromString(x, 'application/xml');
      need(!doc.getElementsByTagName('parsererror').length, 'OOXML غير صالح');
      need(/pic:pic/.test(x) && /ARMATH1:/.test(x), 'لا توجد صورة أو بيانات تحرير');
      return Math.round(x.length / 1024) + ' ك.ب' + (/svgBlip/.test(x) ? ' — متّجه' : ' — PNG');
    });
  }, { ms: 40000 });
  T('Word', 'تجهيز رسم للإدراج', function () {
    var b = Figures.scan('\\begin{graph}[x=-3:3]\n\\plot{س^2}\n\\end{graph}').blocks[0];
    return Figures.prepare(b).then(function (md) {
      return WordBridge.renderItems([{ kind: 'figure', fig: md.kind, data: md.data, line: 0 }], 'math', OPTS, 150);
    }).then(function (items) {
      var x = WordBridge.buildOoxml(items, { rtl: true, display: true });
      need(!new DOMParser().parseFromString(x, 'application/xml').getElementsByTagName('parsererror').length, 'OOXML غير صالح');
      return 'تم';
    });
  }, { ms: 40000 });

  // ---- PDF studio pipeline
  T('استوديو PDF', 'إنشاء ملف PDF بمعادلة متّجهة', function () {
    var L = window.PDFLib; need(L, 'pdf-lib غير محمّلة');
    var msg = { type: 'insert', mode: 'math', opts: OPTS, equations: [{ kind: 'text', text: 'الحل:', line: 0 }, { tex: 'س = 2', line: 0 }] };
    var doc, page;
    return L.PDFDocument.create().then(function (d) { doc = d; page = d.addPage([595, 842]); return Compose.compose(msg, 400); }).then(function (c) {
      return Vector.fromSVG(c.svg).then(function (v) { return Svg2Pdf.draw(v, { x: 50, y: 50, w: c.w * 0.75, h: c.h * 0.75 }, [1, 0, 0, -1, 0, 842], { doc: doc, page: page }); });
    }).then(function (ops) {
      need(ops && ops.length > 50, 'لم تُرسم المعادلة'); Svg2Pdf.addStream({ doc: doc, page: page }, ops); return doc.save();
    }).then(function (bytes) {
      var size = bytes.length;             // pdf.js takes the buffer over, so measure first
      return pdfReady().then(function (pdfjs) { return pdfjs.getDocument({ data: bytes }).promise; }).then(function (pdf) { need(pdf.numPages === 1, 'عدد الصفحات ' + pdf.numPages); return (size / 1024).toFixed(1) + ' ك.ب — يُقرأ بـ pdf.js'; });
    });
  }, { ms: 40000 });
  T('استوديو PDF', 'أدوات الملفات (ZIP، النطاقات)', function () {
    need(PdfUI.crc32(new TextEncoder().encode('123456789')).toString(16) === 'cbf43926', 'CRC32 خاطئ');
    need(PdfUI.parseRange('1-3, 5', 10).join(',') === '0,1,2,4', 'النطاق خاطئ');
    var z = PdfUI.zip([{ name: 'أ.txt', data: new Uint8Array([65]) }]); need(z.size > 60, 'ZIP فارغ');
    return 'تم';
  });

  T('استوديو PDF', 'البحث والقلم والتراجع (5.3)', function () {
    var before = ArLog.list().length;
    return new Promise(function (res, rej) {
      var f = document.createElement('iframe'), t0 = Date.now();
      f.src = 'pdf.html?host=frame&embed=pdf&selftest=1&v=' + ArLog.version;
      f.onload = function () {
        (function wait() {
          var w = f.contentWindow, P = w && w.__pdf;
          if (!(P && w.PdfText && P.snapshot)) { if (Date.now() - t0 > 20000) { f.remove(); return rej(new Error('لم يُحمَّل الاستوديو')); } return setTimeout(wait, 150); }
          try {
            var n = w.PdfText.norm('أَلدّالـةُ إلى ٣');
            need(n === 'الداله الي 3', 'توحيد الحروف في البحث خاطئ: ' + n);
            var pts = []; for (var k = 0; k <= 80; k++) pts.push([k * 2, Math.sin(k / 8) * 20]);
            var sp = P.simplify(pts, 0.6); need(sp.length > 5 && sp.length < pts.length, 'تنعيم القلم لم يختصر النقاط: ' + sp.length);
            need(/Q/.test(P.inkPath(sp)), 'مسار القلم ليس منحنياً');
            var s0 = P.S.clips; P.S.clips = [{ id: 'x', page: 'p', r: { x: 0, y: 0, w: 1, h: 1 } }];
            var snap = JSON.parse(P.snapshot()); P.S.clips = s0 || [];
            need(snap.clips && snap.clips.length === 1 && snap.deco, 'التراجع لا يشمل الأسئلة المقصوصة والترقيم');
            var logged = ArLog.list().slice(before).filter(function (e) { return e.page === 'pdf.html' && e.lvl === 'error'; });
            f.remove();
            if (logged.length) return rej(new Error(logged[0].msg));
            res('بحث عربي ✓ — قلم ' + pts.length + '→' + sp.length + ' نقطة ✓ — تراجع ✓');
          } catch (e) { f.remove(); rej(e); }
        })();
      };
      $('frames').appendChild(f);
    });
  }, { ms: 30000 });

  T('الأدوات', 'كيمياء: التحويل بين المبسّط وLaTeX', function () {
    return new Promise(function (res, rej) {
      var f = document.createElement('iframe'), t0 = Date.now();
      f.src = 'editor.html?host=frame&embed=pdf&selftest=1&v=' + ArLog.version + '#d=' + encodeURIComponent(JSON.stringify({ host: 'frame', lang: 'ar', mode: 'chem' }));
      f.onload = function () {
        (function wait() {
          var w = f.contentWindow;
          if (!(w && w.ChemLatex && w.__editor)) { if (Date.now() - t0 > 20000) { f.remove(); return rej(new Error('لم يُحمَّل المحرر')); } return setTimeout(wait, 150); }
          try {
            var src = '% الاحتراق\n2H2 + O2 -> 2H2O', tex = w.ChemLatex.toLatex(src);
            need(tex === '% الاحتراق\n\\ce{2H2 + O2 -> 2H2O}', 'التحويل إلى LaTeX: ' + tex);
            need(w.ChemLatex.toPlain(tex) === src, 'الرجوع إلى المبسّط خاطئ');
            f.remove(); res('\\ce{2H2 + O2 -> 2H2O} ⇄ 2H2 + O2 -> 2H2O');
          } catch (e) { f.remove(); rej(e); }
        })();
      };
      $('frames').appendChild(f);
    });
  }, { ms: 30000 });

  // ---- pages open without errors (inside hidden frames; office.js is skipped there on purpose)
  var PAGES = [['المحرر', 'editor', function (w) { return w.__editor && w.ChemLatex && w.EditorHotkeys; }], ['رسم الدوال', 'graph'], ['الأشكال الهندسية', 'geometry'], ['الإحصاء', 'chart'], ['الفيزياء', 'physics'],
    ['الصيغ البنائية', 'structure'], ['المخططات', 'diagram'], ['الكيمياء', 'chem', function (w) { return w.__chem && w.ChemCode; }], ['استوديو PDF', 'pdf', function (w) { return w.__pdf && w.PdfExt && w.PdfText; }], ['دليل الصيغة', 'ai-format', function (w) { return w.AIFormat && w.AIFormat.GUIDE && w.AIFormat.PROMPT_FULL_AR; }]];
  PAGES.forEach(function (pg) {
    T('الصفحات', pg[0], function () {
      var before = ArLog.list().length;
      return new Promise(function (res, rej) {
        var f = document.createElement('iframe'), t0 = Date.now(), errs = [];
        f.src = pg[1] + '.html?host=frame&embed=pdf&selftest=1&v=' + ArLog.version + '#d=' + encodeURIComponent(JSON.stringify({ host: 'frame', lang: 'ar' }));
        f.onload = function () {
          var w = f.contentWindow;
          try { w.addEventListener('error', function (e) { errs.push(e.message); }); } catch (x) { /* ignore */ }
          (function wait() {
            var ok = false; try { ok = pg[2] ? !!pg[2](w) : !!w.document.body && (!w.document.getElementById('loader') || w.document.getElementById('loader').hidden || Date.now() - t0 > 6000); } catch (x) { ok = false; }
            if (ok) {
              setTimeout(function () {
                var logged = ArLog.list().slice(before).filter(function (e) { return e.page === pg[1] + '.html' && e.lvl === 'error'; }).map(function (e) { return e.msg; });
                f.remove();
                if (errs.length || logged.length) rej(new Error((errs.concat(logged)).slice(0, 3).join(' | ')));
                else res('فُتحت في ' + (Date.now() - t0) + ' م.ث');
              }, 1200);
              return;
            }
            if (Date.now() - t0 > 20000) { f.remove(); return rej(new Error('لم تكتمل خلال 20 ث')); }
            setTimeout(wait, 150);
          })();
        };
        $('frames').appendChild(f);
      });
    });
  });

  function pdfReady() { return window.pdfjsLib ? Promise.resolve(window.pdfjsLib) : new Promise(function (r) { window.addEventListener('pdfjs-ready', function () { r(window.pdfjsLib); }, { once: true }); }); }

  // ------------------------------------------------------------ runner + UI
  var results = [], running = false;
  function draw() {
    var groups = {}, order = [];
    TESTS.forEach(function (t, k) { if (!groups[t.group]) { groups[t.group] = []; order.push(t.group); } groups[t.group].push(k); });
    $('out').innerHTML = order.map(function (g) {
      var ks = groups[g], bad = ks.filter(function (k) { return results[k] && results[k].s === 'fail'; }).length;
      return '<section><h2><span>' + esc(g) + '</span><span style="color:' + (bad ? '#c2352b' : '#2e8b3a') + '">' + (bad ? bad + ' فاشل' : ks.every(function (k) { return results[k]; }) ? '✓' : '') + '</span></h2>' +
        ks.map(function (k) {
          var t = TESTS[k], r = results[k] || { s: 'wait', d: '' };
          var icon = r.s === 'pass' ? '✓' : r.s === 'fail' ? '✗' : r.s === 'info' ? 'ℹ' : '…';
          return '<div class="t ' + r.s + '"><span class="s">' + icon + '</span><div><div>' + esc(t.name) + '</div>' + (r.d ? '<div class="d">' + esc(r.d) + '</div>' : '') + '</div><span class="ms">' + (r.ms !== undefined ? r.ms + ' م.ث' : '') + '</span></div>';
        }).join('') + '</section>';
    }).join('');
    var done = results.filter(Boolean).length, pass = results.filter(function (r) { return r && (r.s === 'pass' || r.s === 'info'); }).length;
    $('nDone').textContent = done; $('nAll').textContent = TESTS.length; $('nPass').textContent = pass; $('nFail').textContent = done - pass;
    $('prog').style.width = (100 * done / TESTS.length) + '%';
  }
  function run() {
    if (running) return;
    running = true; results = []; draw();
    var t0 = Date.now(), chain = Promise.resolve();
    TESTS.forEach(function (t, k) {
      chain = chain.then(function () {
        var s = Date.now();
        return withTimeout(Promise.resolve().then(t.fn), t.ms, t.name).then(function (d) {
          results[k] = { s: 'pass', d: d || '', ms: Date.now() - s };
        }, function (e) {
          var msg = (e && e.message) || String(e);
          results[k] = { s: t.info ? 'info' : 'fail', d: msg, ms: Date.now() - s };
          if (!t.info) ArLog.add('error', t.group + ' / ' + t.name + ': ' + msg, { feature: 'selftest', error: e });
        }).then(function () { draw(); $('nTime').textContent = Math.round((Date.now() - t0) / 1000); });
      });
    });
    return chain.then(function () {
      running = false; showLog();
      var fails = results.filter(function (r) { return r.s === 'fail'; }).length;
      ArLog.info('selftest', 'نتيجة الفحص: ' + (TESTS.length - fails) + '/' + TESTS.length + ' ناجح');
      window.__selftest = { done: true, results: results.map(function (r, k) { return { group: TESTS[k].group, name: TESTS[k].name, s: r.s, d: r.d }; }) };
    });
  }
  function reportText() {
    var lines = ['معادلات عربية — تقرير الفحص الذاتي', 'الإصدار ' + ArLog.version + ' | ' + new Date().toISOString(), navigator.userAgent, init.word && !init.word.error ? 'Word: ' + init.word.host + ' ' + init.word.platform + ' ' + init.word.version + ' WordApi ' + init.word.maxApi : 'Word: —', ''];
    TESTS.forEach(function (t, k) { var r = results[k]; if (r) lines.push((r.s === 'pass' ? '✓' : r.s === 'info' ? 'ℹ' : '✗') + ' ' + t.group + ' / ' + t.name + (r.s !== 'pass' || r.d ? ' — ' + r.d : '')); });
    return lines.join('\n') + '\n\n' + ArLog.report(40);
  }
  function showLog() { var l = ArLog.list(); $('log').textContent = l.length ? ArLog.report(80) : 'لا توجد أخطاء مسجّلة ✓'; }
  function toast(m) { var t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.tm); toast.tm = setTimeout(function () { t.hidden = true; }, 2500); }
  $('runBtn').onclick = run;
  $('copyBtn').onclick = function () {
    var txt = reportText();
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('نُسخ التقرير — أرسله للمطوّر'); }, function () {
      var a = document.createElement('textarea'); a.value = txt; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); toast('نُسخ التقرير'); } catch (e) { /* ignore */ } a.remove();
    });
  };
  $('logClear').onclick = function () { ArLog.clear(); showLog(); };
  $('closeBtn').onclick = function () { try { window.parent.postMessage({ armath: { type: 'cancel' } }, location.origin); } catch (e) { /* ignore */ } };
  RenderHost.setBase('');
  draw(); showLog();
  if (init.auto !== false) setTimeout(run, 300);
})();
