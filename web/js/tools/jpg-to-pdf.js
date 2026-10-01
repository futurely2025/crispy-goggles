/* JPG to PDF — images (JPG, PNG, WebP, GIF, BMP, AVIF) into one PDF; page size, orientation, margin, order, rotation. */
(function () {
  'use strict';
  var h = T.h, main = T.shell('jpg-to-pdf');
  var imgs = [], seq = 0, dragId = null;
  var SIZES = { fit: null, a4: [595.28, 841.89], a3: [841.89, 1190.55], a5: [419.53, 595.28], letter: [612, 792], legal: [612, 1008] };
  var MARGINS = { 0: 0, 1: 28.35, 2: 56.7, 3: 85.05 };               // none / 1 cm / 2 cm / 3 cm
  var test = function (f) { return T.isImage(f); };
  var zone = T.dropzone({ multiple: true, accept: 'image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif', icon: '🖼', label: 'اختر الصور', hint: 'JPG وPNG وWebP وGIF وBMP — يمكنك اختيار عدة صور', test: test, onFiles: add });
  var more = T.dropzone({ multiple: true, accept: 'image/*', label: '+ إضافة صور', hint: 'اسحب هنا أو اضغط', test: test, onFiles: add }); more.classList.add('small');
  var list = h('div', { class: 'tl-files' });
  var size = T.select([['fit', 'حسب حجم الصورة (حتى A4)'], ['a4', 'A4'], ['letter', 'Letter'], ['a3', 'A3'], ['a5', 'A5'], ['legal', 'Legal']], 'a4');
  var orient = T.select([['auto', 'تلقائي (حسب الصورة)'], ['p', 'عمودي'], ['l', 'أفقي']], 'auto');
  var margin = T.select([['0', 'بدون هوامش'], ['1', 'صغيرة (1 سم)'], ['2', 'متوسطة (2 سم)'], ['3', 'كبيرة (3 سم)']], '1');
  var q = h('input', { class: 'tl-in', type: 'range', min: 50, max: 100, value: 92 }), qv = h('b', { text: '92%' });
  q.oninput = function () { qv.textContent = q.value + '%'; };
  var outName = h('input', { class: 'tl-in', value: 'images', dir: 'ltr' });
  var summary = h('p', { class: 'tl-muted' });
  var go = h('button', { class: 'tl-btn primary big block', type: 'button', text: 'إنشاء PDF', onclick: run });
  var resultHost = h('div');
  var work = h('div', { class: 'tl-split', hidden: true }, [
    h('div', null, [h('div', { class: 'tl-row wrap', style: 'margin-bottom:10px' }, [h('b', { text: 'الصور (اسحب لإعادة الترتيب)' }), h('span', { style: 'flex:1' }),
      h('button', { class: 'tl-btn sm', type: 'button', text: 'ترتيب بالاسم', onclick: function () { imgs.sort(function (a, b) { return a.name.localeCompare(b.name, 'ar', { numeric: true }); }); draw(); } }),
      h('button', { class: 'tl-btn sm danger', type: 'button', text: 'مسح الكل', onclick: function () { imgs.forEach(function (i) { URL.revokeObjectURL(i.url); }); imgs = []; draw(); } })]), list, h('div', { style: 'margin-top:14px' }, more)]),
    h('aside', { class: 'tl-side' }, [h('div', { class: 'tl-card' }, [h('h2', { text: 'إعدادات الصفحة' }), T.field('حجم الصفحة', size), T.field('الاتجاه', orient), T.field('الهوامش', margin),
      T.field('جودة الصور المحوَّلة (PNG/WebP…)', h('div', { class: 'tl-row' }, [q, qv]), 'صور JPEG تُدرج كما هي دون إعادة ضغط.'), T.field('اسم الملف', outName), summary, go]), resultHost])]);
  main.appendChild(zone); main.appendChild(work);

  function add(files) {
    files.forEach(function (f) {
      var url = URL.createObjectURL(f), it = { id: ++seq, file: f, name: f.name, url: url, rot: 0, w: 0, h: 0 };
      var im = new Image(); im.onload = function () { it.w = im.naturalWidth; it.h = im.naturalHeight; draw(); }; im.onerror = function () { T.toast('تعذّر قراءة ' + f.name, true); imgs = imgs.filter(function (x) { return x !== it; }); draw(); };
      im.src = url; imgs.push(it);
    });
    draw();
  }
  function draw() {
    zone.hidden = imgs.length > 0; work.hidden = !imgs.length; list.innerHTML = '';
    imgs.forEach(function (it, i) {
      var im = h('img', { src: it.url, alt: it.name, style: 'transform:rotate(' + it.rot + 'deg);transition:transform .2s;max-width:' + (it.rot % 180 ? '170px' : '100%') + ';max-height:' + (it.rot % 180 ? '100%' : '100%') });
      var card = h('div', { class: 'tl-file', draggable: 'true' }, [h('span', { class: 'tl-num', text: String(i + 1) }), h('div', { class: 'th' }, im), h('div', { class: 'nm', title: it.name, text: it.name }),
        h('div', { class: 'mt', text: (it.w ? it.w + '×' + it.h + ' · ' : '') + T.fmtSize(it.file.size) }),
        h('div', { class: 'ctl' }, [ib('↺', 'تدوير يسار', function () { it.rot = (it.rot + 270) % 360; draw(); }), ib('↻', 'تدوير يمين', function () { it.rot = (it.rot + 90) % 360; draw(); }),
          ib('→', 'تقديم', function () { mv(i, -1); }, '', i === 0), ib('←', 'تأخير', function () { mv(i, 1); }, '', i === imgs.length - 1),
          ib('✕', 'إزالة', function () { URL.revokeObjectURL(it.url); imgs.splice(i, 1); draw(); }, 'danger')])]);
      card.addEventListener('dragstart', function (e) { dragId = it.id; card.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'i'); } catch (x) { /* ignore */ } });
      card.addEventListener('dragend', function () { dragId = null; card.classList.remove('drag'); });
      card.addEventListener('dragover', function (e) { if (dragId !== null) { e.preventDefault(); card.classList.add('dropat'); } });
      card.addEventListener('dragleave', function () { card.classList.remove('dropat'); });
      card.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); card.classList.remove('dropat'); var from = imgs.findIndex(function (x) { return x.id === dragId; }); if (from >= 0 && from !== i) { imgs.splice(i, 0, imgs.splice(from, 1)[0]); draw(); } });
      list.appendChild(card);
    });
    summary.textContent = imgs.length + ' صورة → ' + imgs.length + ' صفحة';
    go.disabled = !imgs.length;
  }
  function ib(t, title, fn, cls, dis) { return h('button', { class: 'tl-ib ' + (cls || ''), type: 'button', title: title, 'aria-label': title, text: t, disabled: !!dis, onclick: fn }); }
  function mv(i, d) { var j = i + d; if (j < 0 || j >= imgs.length) return; var t = imgs[i]; imgs[i] = imgs[j]; imgs[j] = t; draw(); }

  // JPEG EXIF orientation (1 = upright). Browsers apply it when drawing, pdf-lib does not, so tilted photos are re-encoded.
  function exifOrientation(b) {
    if (b[0] !== 0xFF || b[1] !== 0xD8) return 1;
    var p = 2;
    while (p + 4 < b.length) {
      if (b[p] !== 0xFF) return 1; var mk = b[p + 1], len = (b[p + 2] << 8) | b[p + 3];
      if (mk === 0xE1 && b[p + 4] === 0x45 && b[p + 5] === 0x78) {
        var t = p + 10, le = b[t] === 0x49, rd16 = function (o) { return le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]; }, rd32 = function (o) { return le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]); };
        var ifd = t + rd32(t + 4), n = rd16(ifd);
        for (var k = 0; k < n; k++) { var e = ifd + 2 + k * 12; if (rd16(e) === 0x0112) return rd16(e + 8); }
        return 1;
      }
      if (mk === 0xDA) return 1; p += 2 + len;
    }
    return 1;
  }
  function viaCanvas(it, asJpeg, quality, rot) {
    return new Promise(function (res, rej) {
      var im = new Image(); im.onload = function () {
        var sw = im.naturalWidth, sh = im.naturalHeight, swap = rot % 180 !== 0, c = document.createElement('canvas');
        c.width = swap ? sh : sw; c.height = swap ? sw : sh; var g = c.getContext('2d');
        if (asJpeg) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
        g.translate(c.width / 2, c.height / 2); g.rotate(rot * Math.PI / 180); g.drawImage(im, -sw / 2, -sh / 2);
        T.canvasBlob(c, asJpeg ? 'image/jpeg' : 'image/png', quality).then(T.blobBytes).then(function (b) { res({ bytes: b, jpeg: asJpeg, w: c.width, h: c.height }); }, rej);
      }; im.onerror = function () { rej(new Error('تعذّر قراءة ' + it.name)); }; im.src = it.url;
    });
  }
  function prepare(it, quality) {
    return T.readBytes(it.file).then(function (b) {
      var isJpg = b[0] === 0xFF && b[1] === 0xD8, isPng = b[0] === 0x89 && b[1] === 0x50;
      if (isJpg && it.rot === 0 && exifOrientation(b) === 1) return { bytes: b, jpeg: true };
      if (isPng && it.rot === 0) return { bytes: b, jpeg: false };
      return viaCanvas(it, isJpg || !/png|gif|webp|avif/i.test(it.file.type), quality, it.rot);   // rotated / tilted / other formats
    });
  }

  function run() {
    var quality = +q.value / 100;
    T.task('جارٍ إنشاء الملف…', function (prog) {
      return T.pdfLib().then(function (L) {
        return L.PDFDocument.create().then(function (out) {
          var chain = Promise.resolve();
          imgs.forEach(function (it, k) {
            chain = chain.then(function () {
              prog('الصورة ' + (k + 1) + ' من ' + imgs.length, k / imgs.length);
              return prepare(it, quality).then(function (pr) { return (pr.jpeg ? out.embedJpg(pr.bytes) : out.embedPng(pr.bytes)); }).then(function (im) {
                var iw = im.width, ih = im.height, pw, ph, m = MARGINS[margin.value] || 0, S = SIZES[size.value];
                if (!S) { var k2 = Math.min(1, 841.89 / Math.max(iw, ih) * 1.0); var sc = Math.min(72 / 150, k2 === 1 ? 72 / 150 : k2); pw = Math.max(72, iw * sc) + 2 * m; ph = Math.max(72, ih * sc) + 2 * m; if (Math.max(pw, ph) > 841.89 + 2 * m) { var f = (841.89 + 2 * m) / Math.max(pw, ph); pw *= f; ph *= f; } }
                else { pw = S[0]; ph = S[1]; var land = orient.value === 'l' || (orient.value === 'auto' && iw > ih); if (land) { var t = pw; pw = ph; ph = t; } }
                var page = out.addPage([pw, ph]), aw = pw - 2 * m, ah = ph - 2 * m, s = Math.min(aw / iw, ah / ih), dw = iw * s, dh = ih * s;
                page.drawImage(im, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
              });
            });
          });
          return chain.then(function () { out.setProducer('معادلات عربية — أدوات PDF'); prog('جارٍ الحفظ…', 0.97); return out.save({ useObjectStreams: true }); });
        });
      });
    }).then(function (bytes) {
      var name = T.baseName(outName.value.trim() || 'images') + '.pdf';
      resultHost.innerHTML = ''; resultHost.appendChild(T.resultCard('تم إنشاء الملف', imgs.length + ' صفحة · ' + T.fmtSize(bytes.length), [{ label: 'تنزيل ' + name, name: name, data: bytes, mime: 'application/pdf' }]));
    }, function (e) { T.fail(e, 'تعذّر إنشاء الملف'); });
  }
})();
