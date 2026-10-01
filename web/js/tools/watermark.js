/* Watermark — text (Arabic-safe, drawn by the browser) or image, tilted, translucent, on chosen pages. */
(function () {
  'use strict';
  var h = T.h, main = T.shell('watermark'), doc = null, img = null;

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
  var kind = T.segmented([['text', 'نص'], ['image', 'صورة']], 'text', sync);
  var txt = h('input', { class: 'tl-in', value: 'سرّي', dir: 'auto' });
  var size = h('input', { class: 'tl-in', type: 'number', min: 10, max: 400, value: 96 });
  var color = h('input', { type: 'color', value: '#c2352b', class: 'tl-in' });
  var op = h('input', { class: 'tl-in', type: 'range', min: 5, max: 100, value: 25 }), opv = h('b', { text: '25%' }); op.oninput = function () { opv.textContent = op.value + '%'; };
  var ang = h('input', { class: 'tl-in', type: 'number', min: -90, max: 90, value: 35 });
  var pos = T.select([['c', 'وسط الصفحة'], ['tile', 'تكرار على كل الصفحة']], 'c');
  var scope = T.segmented([['all', 'الكل'], ['odd', 'فردية'], ['even', 'زوجية'], ['rng', 'نطاق']], 'all', sync);
  var rng = h('input', { class: 'tl-in', dir: 'ltr', placeholder: '1-3,5' });
  var file = h('input', { type: 'file', accept: 'image/*', class: 'tl-in' });
  file.onchange = function () { var f = file.files[0]; if (!f) return; T.readBytes(f).then(function (b) { img = { bytes: b, type: f.type }; }); };
  var tF = T.field('النص', txt), iF = T.field('الصورة', file), rF = T.field('النطاق', rng), cF = T.field('اللون', color), sF = T.field('حجم الخط', size);
  var info = h('div', { class: 'tl-muted' }), resultHost = h('div');
  var go = h('button', { class: 'tl-btn primary big block', type: 'button', text: 'إضافة العلامة المائية', onclick: run });
  var work = h('div', { class: 'tl-card', hidden: true }, [h('div', { class: 'tl-row wrap' }, [info, h('span', { style: 'flex:1' }), h('button', { class: 'tl-btn sm', type: 'button', text: 'ملف آخر', onclick: reset })]),
    T.field('النوع', kind), tF, iF, sF, cF, T.field('الشفافية', h('div', { class: 'tl-row' }, [op, opv])), T.field('الزاوية (درجة)', ang), T.field('التوزيع', pos), T.field('الصفحات', scope), rF, go]);
  main.appendChild(zone); main.appendChild(work); main.appendChild(resultHost);
  function sync() { tF.hidden = sF.hidden = cF.hidden = kind.value !== 'text'; iF.hidden = kind.value !== 'image'; rF.hidden = scope.value !== 'rng'; }
  function reset() { doc = null; zone.hidden = false; work.hidden = true; resultHost.innerHTML = ''; }
  function open(f) { T.task('جارٍ فتح الملف…', function () { return T.openPdf(f); }).then(function (d) { doc = d; zone.hidden = true; work.hidden = false; info.textContent = d.name + ' · ' + d.pages + ' صفحة'; sync(); }, function (e) { T.fail(e, 'تعذّر فتح الملف'); }); }
  function run() {
    resultHost.innerHTML = '';
    T.task('جارٍ إضافة العلامة…', function () {
      var pages = range(scope.value, rng.value, doc.pages), a = (+ang.value || 0) * Math.PI / 180, alpha = op.value / 100;
      return Promise.all([T.pdfLib(), T.editableBytes(doc)]).then(function (r) {
        var L = r[0];
        return L.PDFDocument.load(r[1], { ignoreEncryption: true }).then(function (pd) {
          var pre;
          if (kind.value === 'text') {
            if (!txt.value.trim()) throw new Error('اكتب نص العلامة');
            var tp = textPng(txt.value, { size: +size.value || 96, color: color.value, bold: true }); pre = pngBytes(tp.canvas).then(function (b) { return pd.embedPng(b).then(function (im) { return { im: im, w: tp.w, h: tp.h }; }); });
          } else {
            if (!img) throw new Error('اختر صورة العلامة');
            pre = (/png/i.test(img.type) ? pd.embedPng(img.bytes) : pd.embedJpg(img.bytes)).then(function (im) { var s = im.scale(1); return { im: im, w: s.width, h: s.height }; });
          }
          return pre.then(function (m) {
            pages.forEach(function (n) {
              var pg = pd.getPage(n - 1), W = pg.getWidth(), H = pg.getHeight(), k = 1;
              if (kind.value === 'image' && m.w > W * .8) k = W * .8 / m.w;
              var w = m.w * k, hh = m.h * k, spots = [[W / 2, H / 2]];
              if (pos.value === 'tile') { spots = []; for (var y = hh; y < H + hh; y += hh * 3.2) for (var x = w * .6; x < W + w; x += w * 1.6) spots.push([x, y]); }
              spots.forEach(function (s) {
                // pdf-lib rotates around the bottom-left corner: shift so the picture turns around its centre
                var cx = s[0], cy = s[1], x0 = cx - (w / 2) * Math.cos(a) + (hh / 2) * Math.sin(a), y0 = cy - (w / 2) * Math.sin(a) - (hh / 2) * Math.cos(a);
                pg.drawImage(m.im, { x: x0, y: y0, width: w, height: hh, rotate: L.degrees(a * 180 / Math.PI), opacity: alpha });
              });
            });
            return pd.save();
          });
        });
      });
    }).then(function (bytes) {
      var name = T.baseName(doc.name) + '_watermark.pdf';
      resultHost.appendChild(T.resultCard('تمت إضافة العلامة المائية', T.fmtSize(bytes.length), [{ label: 'تنزيل ' + name, name: name, data: bytes, mime: 'application/pdf' }]));
    }, function (e) { T.fail(e, 'تعذّرت إضافة العلامة'); });
  }
})();
