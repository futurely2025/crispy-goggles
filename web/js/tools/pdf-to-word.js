/* PDF to Word — rebuild lines and paragraphs from the PDF text layer into a real .docx (RTL aware) or plain text. */
(function () {
  'use strict';
  var h = T.h, main = T.shell('pdf-to-word'), doc = null;
  var zone = T.dropzone({ accept: '.pdf,application/pdf', label: 'اختر ملف PDF', hint: 'أو اسحب الملف وأفلته هنا', test: T.isPdf, onFiles: function (fs) { open(fs[0]); } });
  var fmt = T.segmented([['docx', 'Word (docx)'], ['txt', 'نص عادي (txt)']], 'docx');
  var brk = h('input', { type: 'checkbox', checked: 'checked' }), head = h('input', { type: 'checkbox', checked: 'checked' });
  var info = h('div', { class: 'tl-muted' }), resultHost = h('div');
  var go = h('button', { class: 'tl-btn primary big block', type: 'button', text: 'تحويل', onclick: run });
  var work = h('div', { class: 'tl-card', hidden: true }, [h('div', { class: 'tl-row wrap' }, [info, h('span', { style: 'flex:1' }), h('button', { class: 'tl-btn sm', type: 'button', text: 'ملف آخر', onclick: function () { doc = null; zone.hidden = false; work.hidden = true; resultHost.innerHTML = ''; } })]),
    T.field('الصيغة', fmt), h('label', { class: 'tl-check' }, [brk, h('span', { text: ' فاصل صفحة بين صفحات الأصل' })]), h('label', { class: 'tl-check' }, [head, h('span', { text: ' اكتشاف العناوين (الخط الأكبر)' })]),
    h('p', { class: 'tl-muted', text: 'يُستخرج النص من طبقة النص في الملف. الصور والجداول المعقدة لا تُنقل؛ والملفات الممسوحة ضوئياً تحتاج أولاً إلى OCR في استوديو PDF.' }), go]);
  main.appendChild(zone); main.appendChild(work); main.appendChild(resultHost);
  function open(f) { T.task('جارٍ فتح الملف…', function () { return T.openPdf(f); }).then(function (d) { doc = d; zone.hidden = true; work.hidden = false; info.textContent = d.name + ' · ' + d.pages + ' صفحة'; }, function (e) { T.fail(e, 'تعذّر فتح الملف'); }); }
  var AR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/, ARG = new RegExp(AR.source, 'g');

  // some producers (e.g. Chrome print) store Arabic runs in visual order; pdf.js marks those ltr — flip them back to logical order
  function fixVisual(s, dir) { return dir === 'ltr' && AR.test(s) ? s.split('').reverse().join('') : s; }

  // lines of one page: [{y, size, items:[{x,w,s}], rtl}]
  function pageLines(tc) {
    var its = tc.items.filter(function (i) { return i.str !== undefined && (i.str.trim() || i.hasEOL); }).map(function (i) { return { s: i.str.normalize('NFKC'), x: i.transform[4], y: i.transform[5], w: i.width, sz: Math.abs(i.transform[3]) || i.height || 10 }; });
    its.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var lines = [];
    its.forEach(function (it) {
      var ln = lines.filter(function (l) { return Math.abs(l.y - it.y) <= Math.max(2, Math.min(l.size, it.sz) * .45); })[0];
      if (!ln) { ln = { y: it.y, size: it.sz, items: [] }; lines.push(ln); }
      ln.items.push(it); ln.size = Math.max(ln.size, it.sz);
    });
    lines.sort(function (a, b) { return b.y - a.y; });
    lines.forEach(function (l) {
      var chars = l.items.map(function (i) { return i.s; }).join(''), ar = (chars.match(ARG) || []).length, la = (chars.match(/[A-Za-z0-9]/g) || []).length;
      l.rtl = ar >= la && ar > 0;
      l.items.sort(function (a, b) { return a.x - b.x; });
      if (l.rtl) l.items.reverse();                                        // logical order starts at the right
      var out = '', prev = null;
      l.items.forEach(function (i) {
        if (prev) { var gap = l.rtl ? (prev.x - (i.x + i.w)) : (i.x - (prev.x + prev.w)); if (gap > i.sz * .18 && !/\s$/.test(out) && !/^\s/.test(i.s)) out += ' '; }
        out += i.s; prev = i;
      });
      out = out.replace(/(\S)\s([\u064B-\u065F])(?=\S)/g, '$1$2 ').replace(/\s([\u064B-\u065F])/g, '$1');
      l.text = out.replace(/\s+/g, ' ').trim(); l.x0 = Math.min.apply(null, l.items.map(function (i) { return i.x; })); l.x1 = Math.max.apply(null, l.items.map(function (i) { return i.x + i.w; }));
    });
    return lines.filter(function (l) { return l.text; });
  }
  function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[a.length >> 1] || 10; }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function paragraphs(pages) {
    var all = [].concat.apply([], pages.map(function (p) { return p.lines; })), body = median(all.map(function (l) { return l.size; }));
    var res = [];
    pages.forEach(function (pg, pi) {
      var cur = null, prev = null;
      pg.lines.forEach(function (l) {
        var big = head.checked && l.size > body * 1.25, gap = prev ? prev.y - l.y : 0, newP = !cur || big || cur.big || gap > l.size * 1.7 || l.rtl !== cur.rtl || /[.:؟?!؛]$/.test(prev.text) && (prev.x1 - prev.x0) < (pg.W * .6) && !l.rtl === !cur.rtl && gap > l.size * 1.25;
        if (newP) { cur = { text: l.text, rtl: l.rtl, size: l.size, big: big, pb: res.length && !prev }; res.push(cur); } else cur.text += ' ' + l.text;
        prev = l;
      });
    });
    return { list: res, body: body };
  }
  function docx(par, pagesBreak) {
    var body = par.list.map(function (p, i) {
      var sz = Math.round(Math.max(8, Math.min(40, p.size)) * 2), rt = p.rtl ? '<w:rtl/>' : '', runs = '';
      // keep Latin words as their own LTR runs inside an Arabic paragraph so numbers/English do not flip
      p.text.split(/([A-Za-z0-9][A-Za-z0-9 .,:/\-+=()%]*[A-Za-z0-9)%]|[A-Za-z0-9])/).forEach(function (seg) {
        if (!seg) return; var lat = /^[A-Za-z0-9]/.test(seg);
        runs += '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>' + (p.big ? '<w:b/><w:bCs/>' : '') + (lat || !p.rtl ? '' : rt) + '<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/></w:rPr><w:t xml:space="preserve">' + esc(seg) + '</w:t></w:r>';
      });
      return '<w:p><w:pPr>' + (pagesBreak && p.pb ? '<w:pageBreakBefore/>' : '') + (p.rtl ? '<w:bidi/>' : '') + '<w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr>' + runs + '</w:p>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';
  }
  function run() {
    resultHost.innerHTML = '';
    T.task('جارٍ استخراج النص…', function () {
      var pages = [], chain = Promise.resolve();
      for (var n = 1; n <= doc.pages; n++) (function (n) {
        chain = chain.then(function () { return doc.pdf.getPage(n).then(function (pg) { return pg.getTextContent().then(function (tc) { var vp = pg.getViewport({ scale: 1 }); pages.push({ lines: pageLines(tc), W: vp.width }); pg.cleanup(); }); }); });
      })(n);
      return chain.then(function () {
        var chars = pages.reduce(function (a, p) { return a + p.lines.reduce(function (b, l) { return b + l.text.length; }, 0); }, 0);
        if (chars < 5) throw new Error('لا توجد طبقة نص في هذا الملف (يبدو ممسوحاً ضوئياً). افتحه في استوديو PDF واستخدم أداة OCR أولاً.');
        var par = paragraphs(pages);
        if (fmt.value === 'txt') return { bytes: new TextEncoder().encode('﻿' + par.list.map(function (p) { return p.text; }).join('\n\n')), ext: 'txt', mime: 'text/plain', n: par.list.length };
        return T.jszip().then(function (JSZip) {
          var z = new JSZip();
          z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
          z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
          z.file('word/document.xml', docx(par, brk.checked));
          return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }).then(function (b) { return { bytes: b, ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', n: par.list.length }; });
        });
      });
    }).then(function (r) {
      var name = T.baseName(doc.name) + '.' + r.ext;
      resultHost.appendChild(T.resultCard('تم التحويل', r.n + ' فقرة · ' + T.fmtSize(r.bytes.length), [{ label: 'تنزيل ' + name, name: name, data: r.bytes, mime: r.mime }]));
    }, function (e) { T.fail(e, 'تعذّر التحويل'); });
  }
})();
