/* Word to PDF — docx → HTML (docx2html.js) → paginated like Word → page images (crisp, up to 3×) → PDF.
 * The pages are pictures of the laid-out document: layout, Arabic shaping, tables, images and equations are kept;
 * the text inside the PDF is not selectable (an invisible text layer is on the roadmap). */
(function () {
  'use strict';
  var h = T.h, main = T.shell('word-to-pdf');
  var file = null, parsed = null;
  var QUAL = { draft: { name: 'مسودة (حجم صغير)', s: 1.5, jpeg: 0.8 }, std: { name: 'قياسية', s: 2.5, jpeg: 0.9 }, high: { name: 'عالية جداً (PNG)', s: 3.2, jpeg: 0 } };
  var zone = T.dropzone({ accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', icon: 'W', label: 'اختر مستند Word (docx)', hint: 'أو اسحب الملف وأفلته هنا', test: function (f) { return T.isDocx(f) || /\.doc$/i.test(f.name); }, onFiles: function (fs) { open(fs[0]); } });
  var qual = T.select(Object.keys(QUAL).map(function (k) { return [k, QUAL[k].name]; }), 'std');
  var info = h('div'), warn = h('div'), resultHost = h('div');
  var go = h('button', { class: 'tl-btn primary big block', type: 'button', text: 'تحويل إلى PDF', onclick: run });
  var card = h('div', { class: 'tl-card', hidden: true, style: 'max-width:680px;margin:0 auto;width:100%' }, [info, warn, T.field('جودة الصفحات', qual, 'الجودة الأعلى = وضوح أكبر وحجم ملف أكبر.'), go]);
  main.appendChild(zone); main.appendChild(card); main.appendChild(resultHost);
  main.appendChild(h('div', { class: 'tl-card', style: 'max-width:680px;margin:0 auto;width:100%' }, [h('h2', { text: 'ماذا تدعم هذه الأداة؟' }), h('ul', { class: 'tl-muted', style: 'margin:0;padding-inline-start:20px;line-height:2' }, [
    h('li', { text: 'الفقرات واتجاه النص (RTL) والمحاذاة والتباعد والمسافات البادئة، وأحجام الخط والغامق والمائل والألوان.' }), h('li', { text: 'القوائم المرقّمة والنقطية (بما فيها الترقيم العربي أ، ب، ج).' }),
    h('li', { text: 'الجداول بدمج الخلايا والحدود والتظليل، والجداول من اليمين لليسار.' }), h('li', { text: 'الصور، ومربعات النص، والرأس والتذييل مع رقم الصفحة، وحجم الصفحة والهوامش.' }),
    h('li', { text: 'معادلات Word (OMML) تُعرض بخطوط رياضية داخل المتصفح.' }), h('li', { text: 'ملاحظة: الأشكال العائمة تُوضع في مكانها داخل النص، ولا يُدعم ملف doc القديم (احفظه docx).' })])]));

  function open(f) {
    if (/\.doc$/i.test(f.name)) { T.toast('الصيغة doc القديمة غير مدعومة — افتح الملف في Word واحفظه بصيغة docx', true); return; }
    T.task('جارٍ قراءة المستند…', function () { return Promise.all([T.jszip(), f.arrayBuffer()]).then(function (r) { return script('js/tools/docx2html.js').then(function () { return Docx2Html.convert(r[1]); }); }); })
      .then(function (p) {
        file = f; parsed = p; zone.hidden = true; card.hidden = false; resultHost.innerHTML = '';
        var st = p.stats;
        info.innerHTML = ''; info.appendChild(h('div', { class: 'tl-row wrap', style: 'margin-bottom:8px' }, [h('b', { text: f.name }), h('span', { class: 'tl-muted', text: T.fmtSize(f.size) }), h('span', { style: 'flex:1' }),
          h('button', { class: 'tl-btn sm', type: 'button', text: 'ملف آخر', onclick: function () { file = parsed = null; zone.hidden = false; card.hidden = true; resultHost.innerHTML = ''; } })]));
        info.appendChild(h('p', { class: 'tl-muted', text: st.paragraphs + ' فقرة · ' + st.tables + ' جدول · ' + st.images + ' صورة · ' + st.math + ' معادلة · الصفحة ' + Math.round(p.page.w * 0.75 / 72 * 2.54 * 10) / 10 + '×' + Math.round(p.page.h * 0.75 / 72 * 2.54 * 10) / 10 + ' سم' }));
        warn.innerHTML = '';
        if (st.skipped) warn.appendChild(h('p', { class: 'tl-err', text: 'تنبيه: ' + st.skipped + ' صورة بصيغة غير مدعومة (EMF/WMF) لن تظهر.' }));
      }, function (e) { T.fail(e, 'تعذّرت قراءة المستند'); });
  }
  function script(src) { return T.script(src); }

  // ---------------------------------------------------------- fonts for the page images
  var fontCss = null;
  function loadFonts() {
    if (fontCss) return Promise.resolve(fontCss);
    function b64(buf) { var a = new Uint8Array(buf), s = '', C = 0x8000; for (var i = 0; i < a.length; i += C) s += String.fromCharCode.apply(null, a.subarray(i, i + C)); return btoa(s); }
    return Promise.all([400, 700].map(function (w) { return fetch(T.base + 'fonts/arabic/Amiri-' + w + '.woff2').then(function (r) { return r.arrayBuffer(); }).then(function (b) { return { w: w, b: b64(b) }; }); })).then(function (fs) {
      fontCss = fs.map(function (f) { return '@font-face{font-family:"Amiri";font-weight:' + f.w + ';src:url(data:font/woff2;base64,' + f.b + ') format("woff2");}'; }).join('');
      // the same face for measuring in this page
      var st = document.createElement('style'); st.textContent = fontCss; document.head.appendChild(st);
      return Promise.all([document.fonts.load('16px Amiri'), document.fonts.load('700 16px Amiri')]).then(function () { return fontCss; });
    });
  }

  // ---------------------------------------------------------- pagination
  function paginate() {
    var P = parsed.page, cw = P.w - P.ml - P.mr, ch = P.h - P.mt - P.mb;
    var host = h('div', { style: 'position:fixed;left:-20000px;top:0;width:' + cw + 'px;visibility:hidden;font-size:16px;background:#fff' });
    host.appendChild(parsed.root); document.body.appendChild(host);
    var rootTop = parsed.root.getBoundingClientRect().top, total = parsed.root.getBoundingClientRect().height;
    var tops = [], forced = [], forbid = [], cands = [], knBottoms = [];
    var inTable = function (n) { return !!(n.closest && n.closest('td')); };
    [].forEach.call(parsed.root.children, function (c) { var r = c.getBoundingClientRect(); tops.push({ el: c, top: r.top - rootTop, bottom: r.bottom - rootTop }); cands.push(r.top - rootTop); if (c.getAttribute && c.getAttribute('data-pbb')) forced.push(r.top - rootTop); if (c.getAttribute && c.getAttribute('data-kn')) knBottoms.push({ top: r.top - rootTop, bottom: r.bottom - rootTop }); });
    [].forEach.call(parsed.root.querySelectorAll('[data-pb]'), function (e) { forced.push(e.getBoundingClientRect().top - rootTop); });
    // text lines and inline pictures: candidate cut tops (outside tables) and forbidden zones (everywhere)
    var tw = document.createTreeWalker(parsed.root, NodeFilter.SHOW_TEXT), n, rg = document.createRange();
    while ((n = tw.nextNode())) {
      if (!n.nodeValue.trim()) continue; rg.selectNodeContents(n);
      var rects = rg.getClientRects(), intable = inTable(n.parentNode);
      for (var i = 0; i < rects.length; i++) { var r = rects[i]; if (r.height < 2) continue; forbid.push([r.top - rootTop + 1.5, r.bottom - rootTop - 1.5]); if (!intable) cands.push(r.top - rootTop); }
    }
    [].forEach.call(parsed.root.querySelectorAll('img,math'), function (e) { var r = e.getBoundingClientRect(); forbid.push([r.top - rootTop + 1.5, r.bottom - rootTop - 1.5]); });
    [].forEach.call(parsed.root.querySelectorAll('table'), function (t) { if (t.parentNode.closest && t.parentNode.closest('td')) return; [].forEach.call(t.rows, function (tr) { cands.push(tr.getBoundingClientRect().top - rootTop); }); });
    document.body.removeChild(host);
    cands = cands.filter(function (y) { return y > 0 && !forbid.some(function (f) { return y > f[0] && y < f[1]; }); }).sort(function (a, b) { return a - b; });
    forced.sort(function (a, b) { return a - b; });
    var cuts = [0], start = 0, guard = 0;
    while ((total - start > ch + 0.5 || forced.some(function (y) { return y > start + 1 && y < total - 1; })) && guard++ < 5000) {
      var limit = start + ch, f = forced.filter(function (y) { return y > start + 1 && y <= limit; })[0], c;
      if (f !== undefined) c = f;
      else {
        c = null; for (var k = cands.length - 1; k >= 0; k--) if (cands[k] <= limit + 0.5 && cands[k] > start + 24) { c = cands[k]; break; }
        if (c === null) c = limit;                                  // one block taller than the page: cut at the limit
        // keep a heading with the paragraph that follows it
        for (var q = 0; q < knBottoms.length; q++) { var kb = knBottoms[q]; if (kb.bottom > c - 3 && kb.bottom <= c + 3 && kb.top > start + 24) { c = kb.top; break; } }
      }
      cuts.push(c); start = c;
    }
    cuts.push(total);
    return { cuts: cuts, tops: tops, cw: cw, ch: ch, total: total };
  }

  // ---------------------------------------------------------- one page → image
  function pageHtml(pg, i, n, pag) {
    var P = parsed.page, y0 = pag.cuts[i], y1 = pag.cuts[i + 1], first = null, parts = [];
    var ser = new XMLSerializer();
    pag.tops.forEach(function (t) { if (t.bottom > y0 + 0.5 && t.top < y1 - 0.5) { if (first === null) first = t.top; parts.push(ser.serializeToString(t.el)); } });
    var hdr = parsed.header ? '<div style="position:absolute;left:' + P.ml + 'px;top:' + P.hd + 'px;width:' + pag.cw + 'px">' + ser.serializeToString(parsed.header) + '</div>' : '';
    var ftr = parsed.footer ? '<div style="position:absolute;left:' + P.ml + 'px;bottom:' + P.fd + 'px;width:' + pag.cw + 'px">' + ser.serializeToString(parsed.footer) + '</div>' : '';
    var body = '<div style="position:absolute;left:' + P.ml + 'px;top:' + P.mt + 'px;width:' + pag.cw + 'px;height:' + (y1 - y0) + 'px;overflow:hidden">' +
      '<div style="position:absolute;left:0;top:' + (-y0) + 'px;width:' + pag.cw + 'px"><div style="height:' + (first || 0) + 'px"></div>' + parts.join('') + '</div></div>';
    var html = '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + P.w + 'px;height:' + P.h + 'px;position:relative;background:#fff;overflow:hidden;font-size:16px;color:#000;line-height:normal"><style>' + fontCss + 'table{border-spacing:0}img{border:0}.p{margin:0}</style>' + hdr + body + ftr + '</div>';
    return html.split('\u0001PAGE\u0001').join(String(i + 1)).split('\u0001PAGES\u0001').join(String(n));
  }
  function toCanvas(html, S) {
    var P = parsed.page, svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + P.w + '" height="' + P.h + '" viewBox="0 0 ' + P.w + ' ' + P.h + '"><foreignObject x="0" y="0" width="' + P.w + '" height="' + P.h + '">' + html + '</foreignObject></svg>';
    // a data: URL keeps the canvas origin-clean (a blob: URL taints it in Chromium when the SVG has a foreignObject)
    var bytes = new TextEncoder().encode(svg), bin = '', CH = 0x8000;
    for (var q = 0; q < bytes.length; q += CH) bin += String.fromCharCode.apply(null, bytes.subarray(q, q + CH));
    var url = 'data:image/svg+xml;base64,' + btoa(bin);
    return new Promise(function (res, rej) {
      var im = new Image(); im.onload = function () {
        setTimeout(function () {
          var c = document.createElement('canvas'), sc = Math.min(S, 8000 / Math.max(P.w, P.h)); c.width = Math.round(P.w * sc); c.height = Math.round(P.h * sc);
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height); res(c);
        }, 30);
      }; im.onerror = function () { rej(new Error('تعذّر رسم الصفحة')); }; im.src = url;
    });
  }

  function run() {
    var Q = QUAL[qual.value], P = parsed.page, pages = [];
    T.task('جارٍ تحضير الخطوط والصفحات…', function (prog) {
      return loadFonts().then(function () {
        var pag = paginate(), n = pag.cuts.length - 1, chain = Promise.resolve(), thumbs = [];
        return T.pdfLib().then(function (L) {
          return L.PDFDocument.create().then(function (out) {
            for (var i = 0; i < n; i++) (function (k) {
              chain = chain.then(function () {
                prog('الصفحة ' + (k + 1) + ' من ' + n, k / n);
                return toCanvas(pageHtml(null, k, n, pag), Q.s).then(function (c) {
                  if (k < 12) { var t = document.createElement('canvas'); t.width = 200; t.height = Math.round(200 * c.height / c.width); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); thumbs.push(t); }
                  return T.canvasBlob(c, Q.jpeg ? 'image/jpeg' : 'image/png', Q.jpeg || undefined).then(T.blobBytes).then(function (b) {
                    c.width = c.height = 1;
                    return (Q.jpeg ? out.embedJpg(b) : out.embedPng(b)).then(function (im) { var pg = out.addPage([P.w * 0.75, P.h * 0.75]); pg.drawImage(im, { x: 0, y: 0, width: P.w * 0.75, height: P.h * 0.75 }); });
                  });
                });
              });
            })(i);
            return chain.then(function () { out.setTitle(T.baseName(file.name)); out.setProducer('معادلات عربية — أدوات PDF'); return out.save({ useObjectStreams: true }); }).then(function (bytes) { return { bytes: bytes, n: n, thumbs: thumbs }; });
          });
        });
      });
    }).then(function (r) {
      var name = T.baseName(file.name) + '.pdf'; resultHost.innerHTML = '';
      var c = T.resultCard('تم التحويل', r.n + ' صفحة · ' + T.fmtSize(r.bytes.length), [{ label: 'تنزيل ' + name, name: name, data: r.bytes, mime: 'application/pdf' }]);
      var tg = h('div', { class: 'tl-pages', style: 'margin-top:14px' }); r.thumbs.forEach(function (t, i) { tg.appendChild(h('div', { class: 'tl-pg' }, [h('div', { class: 'th' }, t), h('span', { class: 'no', text: String(i + 1) })])); });
      c.appendChild(tg); resultHost.appendChild(c);
      // the converter consumed the DOM: re-read the file so another run starts clean
      T.readBytes(file).then(function (b) { return Docx2Html.convert(b.buffer); }).then(function (p) { parsed = p; });
    }, function (e) { T.fail(e, 'تعذّر التحويل'); });
  }
})();
