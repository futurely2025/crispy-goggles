/* Page numbers — formats, Arabic-Indic digits, six positions, start number, skip first page. */
(function () {
  'use strict';
  var h = T.h, main = T.shell('page-numbers'), doc = null;

  function textPng(text, o) {          // the browser shapes Arabic correctly, so draw on a canvas and embed the picture
    var c = document.createElement('canvas'), g = c.getContext('2d'), s = o.size * 4, font = (o.bold ? 'bold ' : '') + s + 'px ' + (o.font || '"Segoe UI",Tahoma,Arial,sans-serif');
    g.font = font; var w = Math.ceil(g.measureText(text).width) + 20, hh = Math.ceil(s * 1.5);
    c.width = w; c.height = hh; g = c.getContext('2d'); g.font = font; g.fillStyle = o.color; g.textBaseline = 'middle'; g.direction = 'inherit'; g.textAlign = 'center';
    g.fillText(text, w / 2, hh / 2);
    return { canvas: c, w: w / 4, h: hh / 4 };
  }
  function pngBytes(c) { return T.canvasBlob(c, 'image/png').then(T.blobBytes); }
  function range(scope, rngText, n) {
    var l = [], i;
    if (scope === 'all') for (i = 1; i <= n; i++) l.push(i);
    else if (scope === 'odd') for (i = 1; i <= n; i += 2) l.push(i);
    else if (scope === 'even') for (i = 2; i <= n; i += 2) l.push(i);
    else l = T.parsePages(rngText, n);
    return l;
  }

  var zone = T.dropzone({ accept: '.pdf,application/pdf', label: 'اختر ملف PDF', hint: 'أو اسحب الملف وأفلته هنا', test: T.isPdf, onFiles: function (fs) { open(fs[0]); } });
  var fmt = T.select([['n', '1'], ['dash', '- 1 -'], ['of', '1 / N'], ['pg', 'صفحة 1'], ['pgof', 'صفحة 1 من N']], 'pgof');
  var dig = T.segmented([['ar', '1 2 3'], ['hi', '١ ٢ ٣']], 'hi');
  var pos = T.select([['bc', 'أسفل — وسط'], ['bl', 'أسفل — يسار'], ['br', 'أسفل — يمين'], ['tc', 'أعلى — وسط'], ['tl', 'أعلى — يسار'], ['tr', 'أعلى — يمين']], 'bc');
  var start = h('input', { class: 'tl-in', type: 'number', value: 1, min: 0 }), size = h('input', { class: 'tl-in', type: 'number', value: 11, min: 6, max: 48 }), mar = h('input', { class: 'tl-in', type: 'number', value: 28, min: 6, max: 120 });
  var color = h('input', { type: 'color', value: '#333333', class: 'tl-in' }), skip = h('input', { type: 'checkbox' });
  var info = h('div', { class: 'tl-muted' }), resultHost = h('div');
  var go = h('button', { class: 'tl-btn primary big block', type: 'button', text: 'ترقيم الصفحات', onclick: run });
  var work = h('div', { class: 'tl-card', hidden: true }, [h('div', { class: 'tl-row wrap' }, [info, h('span', { style: 'flex:1' }), h('button', { class: 'tl-btn sm', type: 'button', text: 'ملف آخر', onclick: function () { doc = null; zone.hidden = false; work.hidden = true; resultHost.innerHTML = ''; } })]),
    T.field('الصيغة', fmt), T.field('الأرقام', dig), T.field('الموضع', pos), T.field('يبدأ الترقيم من', start), T.field('حجم الخط', size), T.field('البعد عن الحافة (نقطة)', mar), T.field('اللون', color), h('label', { class: 'tl-check' }, [skip, h('span', { text: ' تخطّي الصفحة الأولى (الغلاف)' })]), go]);
  main.appendChild(zone); main.appendChild(work); main.appendChild(resultHost);
  function open(f) { T.task('جارٍ فتح الملف…', function () { return T.openPdf(f); }).then(function (d) { doc = d; zone.hidden = true; work.hidden = false; info.textContent = d.name + ' · ' + d.pages + ' صفحة'; }, function (e) { T.fail(e, 'تعذّر فتح الملف'); }); }
  function label(n, total) {
    var t = { n: '{n}', dash: '- {n} -', of: '{n} / {t}', pg: 'صفحة {n}', pgof: 'صفحة {n} من {t}' }[fmt.value].replace('{n}', n).replace('{t}', total);
    return dig.value === 'hi' ? t.replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }) : t;
  }
  function run() {
    resultHost.innerHTML = '';
    T.task('جارٍ الترقيم…', function () {
      return Promise.all([T.pdfLib(), T.editableBytes(doc)]).then(function (r) {
        return r[0].PDFDocument.load(r[1], { ignoreEncryption: true }).then(function (pd) {
          var total = pd.getPageCount(), s0 = +start.value || 0, first = skip.checked ? 1 : 0, chain = Promise.resolve(), cache = {}, sz = +size.value || 11, m = +mar.value || 28;
          function pic(txt) {
            if (cache[txt]) return cache[txt];
            var t = textPng(txt, { size: sz, color: color.value }); return (cache[txt] = pngBytes(t.canvas).then(function (b) { return pd.embedPng(b); }).then(function (im) { return { im: im, w: t.w, h: t.h }; }));
          }
          for (var i = first; i < total; i++) (function (i) {
            chain = chain.then(function () {
              var num = s0 + (i - first), shown = num, tot = s0 + total - first - 1;
              return pic(label(shown, tot)).then(function (p) {
                var pg = pd.getPage(i), W = pg.getWidth(), H = pg.getHeight(), c = pos.value, x = c[1] === 'l' ? m : c[1] === 'r' ? W - m - p.w : (W - p.w) / 2, y = c[0] === 'b' ? m : H - m - p.h;
                pg.drawImage(p.im, { x: x, y: y, width: p.w, height: p.h });
              });
            });
          })(i);
          return chain.then(function () { return pd.save(); });
        });
      });
    }).then(function (bytes) {
      var name = T.baseName(doc.name) + '_numbered.pdf';
      resultHost.appendChild(T.resultCard('تم ترقيم الصفحات', T.fmtSize(bytes.length), [{ label: 'تنزيل ' + name, name: name, data: bytes, mime: 'application/pdf' }]));
    }, function (e) { T.fail(e, 'تعذّر الترقيم'); });
  }
})();
