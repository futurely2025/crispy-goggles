/* Rotate PDF — all / odd / even / range, 90/180/270, with a live thumbnail strip. */
(function () {
  'use strict';
  var h = T.h, main = T.shell('rotate'), doc = null;

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
  var ang = T.segmented([['90', '↻ 90°'], ['180', '180°'], ['270', '↺ 90°']], '90', function () { preview(); });
  var scope = T.segmented([['all', 'الكل'], ['odd', 'فردية'], ['even', 'زوجية'], ['rng', 'نطاق']], 'all', function () { rF.hidden = scope.value !== 'rng'; preview(); });
  var rng = h('input', { class: 'tl-in', dir: 'ltr', placeholder: '1-3,5' }); rng.oninput = preview;
  var rF = T.field('النطاق', rng); rF.hidden = true;
  var info = h('div', { class: 'tl-muted' }), grid = h('div', { class: 'tl-pages' }), resultHost = h('div'), cells = [];
  var go = h('button', { class: 'tl-btn primary big block', type: 'button', text: 'تدوير وحفظ', onclick: run });
  var work = h('div', { class: 'tl-split', hidden: true }, [
    h('div', null, [h('div', { class: 'tl-row wrap', style: 'margin-bottom:10px' }, [info, h('span', { style: 'flex:1' }), h('button', { class: 'tl-btn sm', type: 'button', text: 'ملف آخر', onclick: function () { doc = null; zone.hidden = false; work.hidden = true; resultHost.innerHTML = ''; } })]), grid]),
    h('aside', { class: 'tl-side' }, [h('div', { class: 'tl-card' }, [h('h2', { text: 'الإعدادات' }), T.field('الزاوية', ang), T.field('الصفحات', scope), rF, go]), resultHost])]);
  main.appendChild(zone); main.appendChild(work);
  function picked() { try { return range(scope.value, rng.value, doc.pages); } catch (e) { return []; } }
  function preview() { if (!doc) return; var l = picked(), a = +ang.value; cells.forEach(function (c, i) { var on = l.indexOf(i + 1) >= 0; c.th.style.transform = on ? 'rotate(' + a + 'deg)' : ''; c.cell.classList.toggle('sel', on); }); }
  function open(f) {
    T.task('جارٍ فتح الملف…', function () { return T.openPdf(f); }).then(function (d) {
      doc = d; zone.hidden = true; work.hidden = false; info.textContent = d.name + ' · ' + d.pages + ' صفحة'; grid.innerHTML = ''; cells = []; var qq = T.thumbQueue();
      for (var i = 1; i <= d.pages; i++) (function (n) {
        var th = h('div', { class: 'th', style: 'transition:transform .25s' }), cell = h('div', { class: 'tl-pg' }, [th, h('span', { class: 'no', text: String(n) })]); cells.push({ th: th, cell: cell }); grid.appendChild(cell);
        T.lazyThumb(th, function () { qq(function () { return T.renderPage(d.pdf, n, { width: 180 }).then(function (c) { th.innerHTML = ''; th.appendChild(c); }, function () { /* ignore */ }); }); });
      })(i);
      preview();
    }, function (e) { T.fail(e, 'تعذّر فتح الملف'); });
  }
  function run() {
    resultHost.innerHTML = '';
    T.task('جارٍ التدوير…', function () {
      var l = range(scope.value, rng.value, doc.pages); if (!l.length) throw new Error('لا توجد صفحات محددة');
      return Promise.all([T.pdfLib(), T.editableBytes(doc)]).then(function (r) { return r[0].PDFDocument.load(r[1], { ignoreEncryption: true }).then(function (pd) { l.forEach(function (n) { var pg = pd.getPage(n - 1); pg.setRotation(r[0].degrees((pg.getRotation().angle + (+ang.value)) % 360)); }); return pd.save(); }); });
    }).then(function (bytes) {
      var name = T.baseName(doc.name) + '_rotated.pdf';
      resultHost.appendChild(T.resultCard('تم تدوير الصفحات', T.fmtSize(bytes.length), [{ label: 'تنزيل ' + name, name: name, data: bytes, mime: 'application/pdf' }]));
    }, function (e) { T.fail(e, 'تعذّر التدوير'); });
  }
})();
