/* PDF tools — shared core (5.8)
 * Everything runs in the browser: files are never uploaded. Libraries (pdf.js, pdf-lib, qpdf-wasm, JSZip, mammoth, jsdiff)
 * are loaded on demand from vendor/. Pages call T.shell() first, then use the helpers below. */
(function (global) {
  'use strict';
  var base = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/js\/tools\/core\.js.*$/, '') : '../';
  })();
  var VER = '?v=5.8.0';

  // ------------------------------------------------------------ tool catalogue (hub + navigation)
  var TOOLS = [
    { id: 'merge', cat: 'organize', ico: '⧉', ar: 'دمج PDF', en: 'Merge PDF', d: 'ادمج عدة ملفات PDF في ملف واحد بالترتيب الذي تريده، مع اختيار صفحات كل ملف.', col: '#0e9f9a' },
    { id: 'split', cat: 'organize', ico: '✂', ar: 'تقسيم PDF', en: 'Split PDF', d: 'قسّم الملف بنطاقات صفحات، أو كل N صفحة، أو استخرج صفحات محددة.', col: '#2f80c8' },
    { id: 'organize', cat: 'organize', ico: '▦', ar: 'ترتيب الصفحات', en: 'Organize PDF', d: 'رتّب صفحات الملف بالسحب، احذف وكرّر وأدر وأضف صفحات فارغة أو من ملف آخر.', col: '#7b5cc4' },
    { id: 'compress', cat: 'optimize', ico: '⇲', ar: 'ضغط PDF', en: 'Compress PDF', d: 'قلّل حجم الملف بثلاثة مستويات مع بيان الحجم قبل وبعد.', col: '#e08a1e' },
    { id: 'word-to-pdf', cat: 'to', ico: 'W', ar: 'Word إلى PDF', en: 'Word to PDF', d: 'حوّل مستندات Word (docx) إلى PDF مع دعم العربية من اليمين لليسار.', col: '#2b579a' },
    { id: 'jpg-to-pdf', cat: 'to', ico: '🖼', ar: 'صور إلى PDF', en: 'JPG to PDF', d: 'حوّل الصور (JPG وPNG وWebP…) إلى ملف PDF بمقاس صفحة وهوامش من اختيارك.', col: '#d1478f' },
    { id: 'pdf-to-jpg', cat: 'from', ico: '⎘', ar: 'PDF إلى صور', en: 'PDF to JPG', d: 'حوّل كل صفحة إلى صورة JPG أو PNG أو WebP بدقة تصل إلى 600 dpi.', col: '#c2552b' },
    { id: 'protect', cat: 'security', ico: '🔒', ar: 'حماية PDF', en: 'Protect PDF', d: 'ضع كلمة مرور بتشفير AES-256 وحدّد صلاحيات الطباعة والنسخ والتعديل.', col: '#1f8a4c' },
    { id: 'unlock', cat: 'security', ico: '🔓', ar: 'فك حماية PDF', en: 'Unlock PDF', d: 'أزل كلمة المرور والقيود من ملف PDF تملك صلاحية فتحه.', col: '#6d8a1f' },
    { id: 'compare', cat: 'review', ico: '⇆', ar: 'مقارنة PDF', en: 'Compare PDF', d: 'قارن نسختين جنباً إلى جنب: فروق مرئية على الصفحات وفروق النص كلمة بكلمة.', col: '#b02f4a' },
    { id: 'edit', cat: 'edit', ico: '✎', ar: 'تحرير PDF', en: 'Edit PDF', d: 'استوديو PDF الكامل: قص الأسئلة، معادلات، رسوم، نصوص، أختام وتوقيع.', col: '#0a7c78', href: '../pdf.html' }
  ];
  var CATS = [
    ['organize', 'تنظيم الصفحات', 'Organize PDF'], ['optimize', 'تحسين', 'Optimize PDF'], ['to', 'تحويل إلى PDF', 'Convert to PDF'],
    ['from', 'تحويل من PDF', 'Convert from PDF'], ['security', 'الأمان', 'PDF Security'], ['review', 'المراجعة', 'Review PDF'], ['edit', 'التحرير', 'Edit PDF']
  ];

  // ------------------------------------------------------------ tiny DOM helpers
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (kids === undefined ? [] : [].concat(kids)).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  // ------------------------------------------------------------ feedback
  var toastEl, busyEl, busyTxt, busyBar;
  function toast(msg, isErr) {
    if (!toastEl) { toastEl = h('div', { class: 'tl-toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.className = 'tl-toast show' + (isErr ? ' err' : '');
    clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.className = 'tl-toast'; }, isErr ? 6500 : 3200);
  }
  function busy(on, text, frac) {
    if (!busyEl) {
      busyTxt = h('div', { class: 'tl-busy-t' }); busyBar = h('i');
      busyEl = h('div', { class: 'tl-busy', hidden: true }, h('div', { class: 'tl-busy-c' }, [h('span', { class: 'tl-spin' }), busyTxt, h('div', { class: 'tl-bar' }, busyBar)]));
      document.body.appendChild(busyEl);
    }
    busyEl.hidden = !on;
    if (on) { busyTxt.textContent = text || 'جارٍ العمل…'; busyBar.style.width = frac === undefined ? '0%' : Math.round(frac * 100) + '%'; busyBar.parentNode.style.visibility = frac === undefined ? 'hidden' : 'visible'; }
  }
  // run a long task with the busy overlay; the task gets progress(text, fraction)
  function task(text, fn) {
    busy(true, text);
    return Promise.resolve().then(function () { return fn(function (t, f) { busy(true, t || text, f); }); })
      .then(function (r) { busy(false); return r; }, function (e) { busy(false); throw e; });
  }
  function fail(e, what) {
    if (global.ArLog && ArLog.error) try { ArLog.error('pdf-tools', (what || '') + ': ' + (e && (e.stack || e.message || e))); } catch (x) { /* ignore */ }
    if (global.console) console.error(what || '', e);
    toast((what ? what + ': ' : '') + errText(e), true);
  }
  function errText(e) {
    var m = (e && (e.message || e.name)) || String(e);
    if (/password/i.test(m) || (e && e.name === 'PasswordException')) return 'الملف محمي بكلمة مرور';
    if (/Invalid PDF|InvalidPDF|header/i.test(m)) return 'الملف ليس PDF سليماً أو تالف';
    return m;
  }

  // ------------------------------------------------------------ misc utilities
  // wrapped in bidi isolates so "1.2 KB" keeps its order inside right-to-left text
  function fmtSize(n) {
    var t = n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : (n / 1048576).toFixed(n < 10485760 ? 2 : 1) + ' MB';
    return '\u2066' + t + '\u2069';
  }
  function baseName(name) { return String(name || 'document').replace(/\.[^.\\/]+$/, ''); }
  function pad(n, w) { n = String(n); while (n.length < w) n = '0' + n; return n; }
  function readBytes(file) { return file.arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  function download(data, name, mime) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = h('a', { href: url, download: name }); document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
  }
  var AR_DIGITS = /[٠-٩۰-۹]/g;
  function normDigits(s) { return String(s).replace(AR_DIGITS, function (c) { var k = c.charCodeAt(0); return String(k >= 0x6F0 ? k - 0x6F0 : k - 0x660); }); }
  /** "1-3, 5, 8-" -> [1,2,3,5,8,...max] (1-based, in the order written, keeps repeats). Throws Error with an Arabic message. */
  function parsePages(str, max) {
    var s = normDigits(str).replace(/[،;]/g, ',').replace(/\s+/g, '');
    if (!s) throw new Error('اكتب أرقام الصفحات، مثل 1-3,5');
    var out = [];
    s.split(',').forEach(function (part) {
      if (!part) return;
      var m = /^(\d*)(?:[-–](\d*))?$/.exec(part);
      if (!m || (m[1] === '' && m[2] === undefined)) throw new Error('نطاق غير مفهوم: ' + part);
      var a = m[1] === '' ? 1 : +m[1], b = m[2] === undefined ? a : (m[2] === '' ? max : +m[2]);
      if (a < 1 || b < 1 || a > max || b > max) throw new Error('الصفحة خارج الملف (1–' + max + '): ' + part);
      if (a <= b) for (var i = a; i <= b; i++) out.push(i); else for (var j = a; j >= b; j--) out.push(j);
    });
    if (!out.length) throw new Error('لا توجد صفحات');
    return out;
  }
  /** compact "1-3,5" text from a sorted list of page numbers */
  function pagesText(list) {
    var out = [], i = 0;
    while (i < list.length) { var j = i; while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++; out.push(j > i ? list[i] + '-' + list[j] : String(list[i])); i = j + 1; }
    return out.join(',');
  }

  // ------------------------------------------------------------ libraries
  var libP = {};
  function script(src) {
    if (libP[src]) return libP[src];
    libP[src] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = base + src + VER; s.onload = function () { res(); }; s.onerror = function () { delete libP[src]; rej(new Error('تعذّر تحميل ' + src)); };
      document.head.appendChild(s);
    });
    return libP[src];
  }
  function pdfLib() { return global.PDFLib ? Promise.resolve(global.PDFLib) : script('vendor/pdf-lib/pdf-lib.min.js').then(function () { return global.PDFLib; }); }
  function jszip() { return global.JSZip ? Promise.resolve(global.JSZip) : script('vendor/jszip/jszip.min.js').then(function () { return global.JSZip; }); }
  function mammoth() { return global.mammoth ? Promise.resolve(global.mammoth) : script('vendor/mammoth-docx/mammoth.browser.min.js').then(function () { return global.mammoth; }); }
  function jsdiff() { return global.Diff ? Promise.resolve(global.Diff) : script('vendor/diff/diff.min.js').then(function () { return global.Diff; }); }
  var pdfjsP;
  function pdfjs() {
    if (!pdfjsP) pdfjsP = import(base + 'vendor/pdfjs/pdf.min.js?v=4.10.38').then(function (m) {
      m.GlobalWorkerOptions.workerSrc = new URL(base + 'vendor/pdfjs/pdf.worker.min.js?v=4.10.38', location.href).href;
      return m;
    });
    return pdfjsP;
  }

  // qpdf (WebAssembly) — encryption, decryption and repair. One fresh instance per call (the CLI keeps global state).
  var qpdfFactory;
  function qpdfModule() {
    var make = function () {
      return global.__qpdfFactory({
        locateFile: function (f) { return base + 'vendor/qpdf/' + f + VER; },
        print: function () {}, printErr: function () {}
      });
    };
    if (global.__qpdfFactory) return make();
    if (!qpdfFactory) qpdfFactory = script('vendor/qpdf/qpdf.js').then(function () {
      // qpdf.js declares `var Module = (function(){…})()` -> the factory function
      global.__qpdfFactory = global.Module; try { delete global.Module; } catch (e) { global.Module = undefined; }
      if (typeof global.__qpdfFactory !== 'function') throw new Error('qpdf لم يُحمَّل');
    });
    return qpdfFactory.then(make);
  }
  /** run qpdf with args; input bytes at /in.pdf, output read from /out.pdf. Resolves {bytes, code, log}. */
  function qpdf(bytes, args) {
    var log = [];
    return qpdfModule().then(function (m) {
      var FS = m.FS, code = 0;
      FS.writeFile('/in.pdf', bytes);
      var errs = [];
      m.printErr = function (s) { errs.push(s); }; m.print = function (s) { log.push(s); };
      try { m.callMain(args.map(function (a) { return a === '$IN' ? '/in.pdf' : a === '$OUT' ? '/out.pdf' : a; })); }
      catch (e) { code = e && e.status !== undefined ? e.status : 2; if (e && e.status === undefined && !(e && /exit/.test(String(e)))) errs.push(String(e)); }
      var out = null;
      try { out = FS.readFile('/out.pdf'); } catch (e) { /* no output */ }
      return { bytes: out, code: code, log: log.concat(errs).join('\n') };
    });
  }

  // ------------------------------------------------------------ opening PDFs (pdf.js) with password prompt
  function askPassword(name, wrong) {
    return new Promise(function (resolve) {
      var inp = h('input', { type: 'password', class: 'tl-in', autocomplete: 'off', placeholder: 'كلمة المرور' });
      var ok = h('button', { class: 'tl-btn primary', type: 'button', text: 'فتح' });
      var no = h('button', { class: 'tl-btn', type: 'button', text: 'إلغاء' });
      var box = h('div', { class: 'tl-busy' }, h('div', { class: 'tl-busy-c tl-pw' }, [
        h('b', { text: 'الملف محمي بكلمة مرور' }), h('span', { class: 'tl-muted', text: name || '' }),
        wrong ? h('span', { class: 'tl-err', text: 'كلمة المرور غير صحيحة، حاول مرة أخرى' }) : null,
        inp, h('div', { class: 'tl-row' }, [ok, no])]));
      document.body.appendChild(box); setTimeout(function () { inp.focus(); }, 30);
      function done(v) { box.remove(); resolve(v); }
      ok.onclick = function () { done(inp.value); }; no.onclick = function () { done(null); };
      inp.onkeydown = function (e) { if (e.key === 'Enter') done(inp.value); else if (e.key === 'Escape') done(null); };
    });
  }
  /** Open a PDF for reading/rendering. Returns {pdf, bytes, name, pages, password}. Asks for the password when needed.
   *  `bytes` are the original bytes (still encrypted). Use T.decryptedBytes(doc) when pdf-lib must edit it. */
  function openPdf(src, name) {
    var bytesP = src instanceof Uint8Array ? Promise.resolve(src) : readBytes(src);
    name = name || (src && src.name) || 'document.pdf';
    return Promise.all([pdfjs(), bytesP]).then(function (r) {
      var lib = r[0], bytes = r[1];
      function attempt(pw, wrong) {
        var task = lib.getDocument({ data: bytes.slice(0), password: pw, cMapUrl: base + 'vendor/pdfjs/cmaps/', cMapPacked: true,
          standardFontDataUrl: base + 'vendor/pdfjs/standard_fonts/', isEvalSupported: false });
        return task.promise.then(function (pdf) { return { pdf: pdf, bytes: bytes, name: name, pages: pdf.numPages, password: pw || '' }; }, function (e) {
          if (e && e.name === 'PasswordException') {
            return askPassword(name, e.code === 2 || wrong).then(function (p) { if (p === null) throw new Error('أُلغي فتح الملف المحمي'); return attempt(p, true); });
          }
          throw e;
        });
      }
      return attempt(undefined, false);
    });
  }
  /** bytes pdf-lib can edit: decrypts with qpdf when the file was opened with a password */
  function editableBytes(doc) {
    if (!doc.password) return Promise.resolve(doc.bytes);
    return qpdf(doc.bytes, ['--password=' + doc.password, '--decrypt', '$IN', '$OUT']).then(function (r) {
      if (!r.bytes) throw new Error('تعذّر فك تشفير الملف');
      return r.bytes;
    });
  }
  function loadLibDoc(bytes) { return pdfLib().then(function (L) { return L.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }); }); }

  /** render one page to a canvas. opts: {scale} | {width} | {dpi} (dpi → scale dpi/72) */
  function renderPage(pdf, n, opts) {
    opts = opts || {};
    return pdf.getPage(n).then(function (page) {
      var base1 = page.getViewport({ scale: 1 });
      var scale = opts.scale || (opts.dpi ? opts.dpi / 72 : opts.width ? opts.width / base1.width : 1);
      var max = opts.maxPixels || 36e6;                                   // keep a canvas within what browsers allow
      if (base1.width * base1.height * scale * scale > max) scale = Math.sqrt(max / (base1.width * base1.height));
      var vp = page.getViewport({ scale: scale, rotation: opts.rotation === undefined ? undefined : (page.rotate + opts.rotation) % 360 });
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.floor(vp.width)); c.height = Math.max(1, Math.floor(vp.height));
      var g = c.getContext('2d', { willReadFrequently: !!opts.read });
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      return page.render({ canvasContext: g, viewport: vp, background: 'rgb(255,255,255)' }).promise.then(function () { page.cleanup(); return c; });
    });
  }
  function canvasBlob(c, type, q) {
    return new Promise(function (res, rej) { c.toBlob(function (b) { b ? res(b) : rej(new Error('تعذّر ترميز الصورة')); }, type || 'image/png', q); });
  }
  function blobBytes(b) { return b.arrayBuffer().then(function (x) { return new Uint8Array(x); }); }
  // run async fn(i) for i in [0,n) with limited concurrency, in order of completion safe
  function pool(n, limit, fn) {
    var next = 0, results = new Array(n), failed = null;
    function worker() {
      if (failed || next >= n) return Promise.resolve();
      var i = next++;
      return Promise.resolve(fn(i)).then(function (r) { results[i] = r; return worker(); }, function (e) { failed = e; throw e; });
    }
    var ws = []; for (var k = 0; k < Math.min(limit, n); k++) ws.push(worker());
    return Promise.all(ws).then(function () { return results; });
  }

  // ------------------------------------------------------------ page shell
  function shell(id) {
    var meta = TOOLS.filter(function (t) { return t.id === id; })[0] || { ar: document.title, en: '', d: '', ico: '⎙', col: '#0e9f9a' };
    document.documentElement.lang = 'ar'; document.documentElement.dir = 'rtl';
    document.title = meta.ar + ' — ' + meta.en + ' — معادلات عربية';
    document.documentElement.style.setProperty('--tool', meta.col);
    var nav = h('nav', { class: 'tl-nav', 'aria-label': 'الأدوات' });
    TOOLS.forEach(function (t) { nav.appendChild(h('a', { href: t.href ? t.href.replace('../', base) : base + 'tools/' + t.id + '.html', class: t.id === id ? 'on' : '', title: t.en }, [h('i', { text: t.ico }), h('span', { text: t.ar })])); });
    var head = h('header', { class: 'tl-head' }, [
      h('a', { class: 'tl-brand', href: base + 'tools/index.html' }, [h('span', { class: 'tl-logo', text: 'م' }), h('b', { text: 'أدوات PDF' }), h('small', { text: 'معادلات عربية' })]),
      h('button', { class: 'tl-menu', type: 'button', 'aria-label': 'كل الأدوات', text: '☰', onclick: function () { nav.classList.toggle('open'); } }),
      nav
    ]);
    var main = h('main', { class: 'tl-main', id: 'main' });
    var title = h('section', { class: 'tl-title' }, [h('span', { class: 'tl-badge', text: meta.ico }), h('div', null, [h('h1', { text: meta.ar }), h('p', { text: meta.d }), h('small', { class: 'tl-en', dir: 'ltr', text: meta.en })])]);
    var foot = h('footer', { class: 'tl-foot' }, [h('span', { text: '🔐 تتم المعالجة كلها على جهازك — لا يُرفع أي ملف إلى أي خادم.' }),
      h('a', { href: base + 'pdf.html', text: 'استوديو تحرير PDF' }), h('a', { href: base + 'tools/index.html', text: 'كل الأدوات' })]);
    document.body.className = 'tl-page'; document.body.innerHTML = '';
    document.body.appendChild(h('a', { class: 'tl-skip', href: '#main', text: 'تخطي إلى المحتوى' }));
    document.body.appendChild(head); main.appendChild(title); document.body.appendChild(main); document.body.appendChild(foot);
    return main;
  }

  // ------------------------------------------------------------ widgets
  /** drop zone + file button. opts {accept: '.pdf,application/pdf', multiple, label, hint, onFiles(files)} */
  function dropzone(opts) {
    var inp = h('input', { type: 'file', hidden: true, accept: opts.accept || '', multiple: !!opts.multiple });
    var zone = h('div', { class: 'tl-drop', tabindex: 0, role: 'button', 'aria-label': opts.label || 'اختر ملفاً' }, [
      h('div', { class: 'tl-drop-i', text: opts.icon || '⇪' }),
      h('b', { text: opts.label || 'اختر ملف PDF' }),
      h('span', { class: 'tl-muted', text: opts.hint || 'أو اسحب الملف وأفلته هنا' }), inp]);
    function take(list) {
      var files = Array.prototype.slice.call(list || []);
      if (opts.test) files = files.filter(opts.test);
      if (!files.length) { toast('نوع الملف غير مدعوم هنا', true); return; }
      opts.onFiles(opts.multiple ? files : [files[0]]);
    }
    zone.onclick = function () { inp.click(); };
    zone.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
    inp.onchange = function () { take(inp.files); inp.value = ''; };
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('over'); }); });
    zone.addEventListener('drop', function (e) { take(e.dataTransfer && e.dataTransfer.files); });
    zone.pick = function () { inp.click(); };
    return zone;
  }
  function isPdf(f) { return /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name); }
  function isImage(f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif|tiff?)$/i.test(f.name); }
  function isDocx(f) { return /\.docx$/i.test(f.name) || /wordprocessingml/.test(f.type); }

  function field(label, control, hint) { return h('label', { class: 'tl-field' }, [h('span', { text: label }), control, hint ? h('small', { class: 'tl-muted', text: hint }) : null]); }
  function select(opts, value, onchange) {
    var s = h('select', { class: 'tl-in' }, opts.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    s.value = value; if (onchange) s.onchange = function () { onchange(s.value); };
    return s;
  }
  function segmented(items, value, onchange) {
    var box = h('div', { class: 'tl-seg', role: 'tablist' });
    items.forEach(function (it) {
      var b = h('button', { type: 'button', role: 'tab', 'data-v': it[0], 'aria-selected': String(it[0] === value), class: it[0] === value ? 'on' : '', text: it[1], title: it[2] || '',
        onclick: function () { box.value = it[0]; $$('button', box).forEach(function (x) { var on = x.getAttribute('data-v') === it[0]; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); }); onchange && onchange(it[0]); } });
      box.appendChild(b);
    });
    box.value = value;
    return box;
  }
  /** result card with download buttons. items: [{label, name, data, mime}] */
  function resultCard(title, lines, items, extra) {
    var card = h('section', { class: 'tl-card tl-result', 'aria-live': 'polite' }, [
      h('h2', { text: '✓ ' + title }), lines ? h('p', { class: 'tl-muted', text: lines }) : null,
      h('div', { class: 'tl-row wrap' }, items.map(function (it) {
        return h('button', { class: 'tl-btn primary big', type: 'button', text: '⬇ ' + it.label, onclick: function () { download(it.data, it.name, it.mime); } });
      }).concat(extra || []))]);
    setTimeout(function () { card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 60);
    return card;
  }
  /** a lazily rendered thumbnail canvas inside `box` (renders when scrolled into view) */
  var io;
  function lazyThumb(box, render) {
    if (!global.IntersectionObserver) { render(box); return; }
    if (!io) io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); var fn = e.target.__render; e.target.__render = null; fn && fn(e.target); } });
    }, { rootMargin: '300px' });
    box.__render = render; io.observe(box);
  }
  function thumbQueue() { // render thumbnails one after another so big books do not freeze the page
    var chain = Promise.resolve();
    return function (fn) { chain = chain.then(fn, fn); return chain; };
  }

  global.T = {
    base: base, TOOLS: TOOLS, CATS: CATS, $: $, $$: $$, h: h, toast: toast, busy: busy, task: task, fail: fail, errText: errText,
    fmtSize: fmtSize, baseName: baseName, pad: pad, readBytes: readBytes, download: download, parsePages: parsePages, pagesText: pagesText, normDigits: normDigits,
    pdfLib: pdfLib, jszip: jszip, mammoth: mammoth, jsdiff: jsdiff, pdfjs: pdfjs, qpdf: qpdf, script: script,
    openPdf: openPdf, editableBytes: editableBytes, loadLibDoc: loadLibDoc, askPassword: askPassword,
    renderPage: renderPage, canvasBlob: canvasBlob, blobBytes: blobBytes, pool: pool,
    shell: shell, dropzone: dropzone, isPdf: isPdf, isImage: isImage, isDocx: isDocx, field: field, select: select, segmented: segmented,
    resultCard: resultCard, lazyThumb: lazyThumb, thumbQueue: thumbQueue
  };
})(window);
