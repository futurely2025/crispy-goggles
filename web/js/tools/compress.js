/* Compress PDF — 4 levels: lossless re-pack, recompress/downscale embedded images, stronger recompression,
 * and (maximum) re-draw every page as a JPEG. Shows the size before and after and never hands back a bigger file silently. */
(function () {
  'use strict';
  var h = T.h, main = T.shell('compress');
  var doc = null, level = 'medium';
  var LEVELS = {
    light:   { name: 'خفيف', note: 'إعادة تعبئة دون أي فقد في الجودة (حذف المكرر وضغط البنية).', q: 0, side: 0 },
    medium:  { name: 'متوسط', note: 'إعادة ضغط الصور الكبيرة بجودة جيدة. النص يبقى نصاً قابلاً للتحديد.', q: 0.75, side: 2200 },
    strong:  { name: 'قوي', note: 'ضغط أعلى للصور بتصغير دقتها. مناسب للإرسال بالبريد.', q: 0.55, side: 1400 },
    extreme: { name: 'أقصى', note: 'تحويل كل صفحة إلى صورة JPEG. أصغر حجم لكن النص يصبح صورة (غير قابل للتحديد). مناسب للكتب الممسوحة.', q: 0.6, dpi: 110 }
  };
  var zone = T.dropzone({ accept: '.pdf,application/pdf', label: 'اختر ملف PDF للضغط', hint: 'أو اسحب الملف وأفلته هنا', test: T.isPdf, onFiles: function (fs) { open(fs[0]); } });
  var seg = T.segmented(Object.keys(LEVELS).map(function (k) { return [k, LEVELS[k].name]; }), level, function (v) { level = v; sync(); });
  var note = h('p', { class: 'tl-muted' });
  var q = h('input', { class: 'tl-in', type: 'range', min: 30, max: 95, step: 1, 'aria-label': 'جودة الصور' });
  var qv = h('b'), dpiSel = T.select([['72', '72 dpi (شاشة)'], ['96', '96 dpi'], ['110', '110 dpi'], ['150', '150 dpi (طباعة عادية)'], ['200', '200 dpi']], '110');
  var adv = h('div');
  var go = h('button', { class: 'tl-btn primary big block', type: 'button', text: 'ضغط الملف', onclick: run });
  var info = h('div'), resultHost = h('div');
  var card = h('div', { class: 'tl-card', hidden: true }, [info, h('h2', { text: 'مستوى الضغط' }), seg, note, adv, go]);
  main.appendChild(zone); main.appendChild(h('div', { class: 'tl-grid2', style: 'max-width:720px;margin:0 auto;width:100%' }, [h('div', { style: 'grid-column:1/-1;display:flex;flex-direction:column;gap:14px' }, [card, resultHost])]));
  q.oninput = function () { qv.textContent = q.value + '%'; };

  function sync() {
    var L = LEVELS[level]; note.textContent = L.note; adv.innerHTML = '';
    if (level === 'light') return;
    q.value = Math.round(L.q * 100); qv.textContent = q.value + '%';
    adv.appendChild(T.field('جودة الصور', h('div', { class: 'tl-row' }, [q, qv])));
    if (level === 'extreme') { dpiSel.value = String(L.dpi); adv.appendChild(T.field('دقة الصفحات', dpiSel)); }
  }
  function open(file) {
    T.task('جارٍ فتح الملف…', function () { return T.openPdf(file); }).then(function (d) {
      doc = d; zone.hidden = true; card.hidden = false; resultHost.innerHTML = '';
      info.innerHTML = ''; info.appendChild(h('div', { class: 'tl-row wrap', style: 'margin-bottom:12px' }, [h('b', { text: d.name }), h('span', { class: 'tl-muted', text: d.pages + ' صفحة · ' + T.fmtSize(d.bytes.length) }), h('span', { style: 'flex:1' }),
        h('button', { class: 'tl-btn sm', type: 'button', text: 'ملف آخر', onclick: function () { try { doc.pdf.destroy(); } catch (e) { /* ignore */ } doc = null; zone.hidden = false; card.hidden = true; resultHost.innerHTML = ''; } })]));
      sync();
    }, function (e) { T.fail(e, 'تعذّر فتح الملف'); });
  }

  // ---------------------------------------------------------- image recompression inside the PDF structure
  function nameOf(L, o) { return o instanceof L.PDFName ? o.decodeText() : null; }
  function num(L, d, k) { var v = d.get(L.PDFName.of(k)); return v instanceof L.PDFNumber ? v.asNumber() : null; }
  function bitmapFromBytes(bytes, type) { return createImageBitmap(new Blob([bytes], { type: type })); }
  function recompress(lib, L, opts, prog) {
    var ctx = lib.context, imgs = [];
    ctx.enumerateIndirectObjects().forEach(function (e) {
      var obj = e[1];
      if (!(obj instanceof L.PDFRawStream)) return;
      if (nameOf(L, obj.dict.get(L.PDFName.of('Subtype'))) !== 'Image') return;
      imgs.push(e);
    });
    var saved = 0, replaced = 0, chain = Promise.resolve();
    imgs.forEach(function (e, k) {
      chain = chain.then(function () {
        prog('الصور: ' + (k + 1) + ' من ' + imgs.length, k / Math.max(1, imgs.length));
        var ref = e[0], obj = e[1], d = obj.dict, N = L.PDFName.of;
        var w = num(L, d, 'Width'), hgt = num(L, d, 'Height');
        if (!w || !hgt || d.get(N('ImageMask')) === L.PDFBool.True || d.has(N('Mask')) || d.has(N('Decode'))) return;
        if (num(L, d, 'BitsPerComponent') !== 8 && !d.has(N('Filter'))) return;
        var f = d.get(N('Filter')); if (f instanceof L.PDFArray) { if (f.size() !== 1) return; f = f.get(0); }
        var fname = nameOf(L, f), cs = d.get(N('ColorSpace')), csn = nameOf(L, cs), comps = 0;
        if (csn === 'DeviceRGB') comps = 3; else if (csn === 'DeviceGray') comps = 1;
        else if (cs instanceof L.PDFArray && nameOf(L, cs.get(0)) === 'ICCBased') {
          var prof = ctx.lookup(cs.get(1)); var n = prof && prof.dict ? num(L, prof.dict, 'N') : null; if (n === 3 || n === 1) comps = n;
        }
        if (!comps) return;
        var origLen = obj.contents.length, bmp;
        if (fname === 'DCTDecode') bmp = bitmapFromBytes(obj.contents, 'image/jpeg');
        else if (fname === 'FlateDecode' && num(L, d, 'BitsPerComponent') === 8 && !d.has(N('DecodeParms'))) {
          var raw; try { raw = L.decodePDFRawStream(obj).decode(); } catch (x) { return; }
          if (raw.length < w * hgt * comps) return;
          var rgba = new Uint8ClampedArray(w * hgt * 4);
          for (var i = 0, j = 0, p = 0; i < w * hgt; i++) { if (comps === 3) { rgba[j++] = raw[p++]; rgba[j++] = raw[p++]; rgba[j++] = raw[p++]; } else { var g = raw[p++]; rgba[j++] = g; rgba[j++] = g; rgba[j++] = g; } rgba[j++] = 255; }
          bmp = createImageBitmap(new ImageData(rgba, w, hgt));
        } else return;
        return Promise.resolve(bmp).then(function (bm) {
          var scale = opts.side && Math.max(w, hgt) > opts.side ? opts.side / Math.max(w, hgt) : 1;
          // very small images are not worth touching
          if (scale === 1 && origLen < 30000) { bm.close && bm.close(); return; }
          var nw = Math.max(1, Math.round(w * scale)), nh = Math.max(1, Math.round(hgt * scale));
          var c = document.createElement('canvas'); c.width = nw; c.height = nh; var g2 = c.getContext('2d');
          g2.fillStyle = '#fff'; g2.fillRect(0, 0, nw, nh); g2.imageSmoothingQuality = 'high'; g2.drawImage(bm, 0, 0, nw, nh); bm.close && bm.close();
          return T.canvasBlob(c, 'image/jpeg', opts.q).then(T.blobBytes).then(function (bytes) {
            if (bytes.length >= origLen * 0.92) return;               // no real gain: keep the original
            var map = { Type: L.PDFName.of('XObject'), Subtype: L.PDFName.of('Image'), Width: L.PDFNumber.of(nw), Height: L.PDFNumber.of(nh),
              ColorSpace: L.PDFName.of(comps === 1 ? 'DeviceGray' : 'DeviceRGB'), BitsPerComponent: L.PDFNumber.of(8), Filter: L.PDFName.of('DCTDecode') };
            if (comps === 1) { /* keep it gray: the canvas JPEG is RGB, so declare RGB */ map.ColorSpace = L.PDFName.of('DeviceRGB'); }
            if (d.has(N('SMask'))) map.SMask = d.get(N('SMask'));
            ctx.assign(ref, ctx.stream(bytes, map));
            saved += origLen - bytes.length; replaced++;
          });
        });
      }).catch(function () { /* one bad image must not stop the rest */ });
    });
    return chain.then(function () { return { saved: saved, replaced: replaced, total: imgs.length }; });
  }

  // ---------------------------------------------------------- the four strategies
  function viaStructure(L, opts, prog) {
    return T.editableBytes(doc).then(function (b) { return T.loadLibDoc(b); }).then(function (lib) {
      var step = opts.q ? recompress(lib, L, opts, prog) : Promise.resolve({ replaced: 0, total: 0 });
      return step.then(function (st) {
        lib.setProducer('معادلات عربية — أدوات PDF'); prog('جارٍ الحفظ…', 0.97);
        return lib.save({ useObjectStreams: true, addDefaultPage: false }).then(function (bytes) { return { bytes: bytes, st: st }; });
      });
    });
  }
  function viaRaster(L, opts, prog) {
    var dpi = +dpiSel.value || 110;
    return L.PDFDocument.create().then(function (out) {
      var chain = Promise.resolve();
      for (var i = 1; i <= doc.pages; i++) (function (n) {
        chain = chain.then(function () {
          prog('الصفحة ' + n + ' من ' + doc.pages, (n - 1) / doc.pages);
          return doc.pdf.getPage(n).then(function (pg) {
            var vp = pg.getViewport({ scale: 1 });
            return T.renderPage(doc.pdf, n, { dpi: dpi }).then(function (c) {
              return T.canvasBlob(c, 'image/jpeg', opts.q).then(T.blobBytes).then(function (jb) {
                c.width = c.height = 1;
                return out.embedJpg(jb).then(function (im) { var page = out.addPage([vp.width, vp.height]); page.drawImage(im, { x: 0, y: 0, width: vp.width, height: vp.height }); });
              });
            });
          });
        });
      })(i);
      return chain.then(function () { out.setProducer('معادلات عربية — أدوات PDF'); return out.save({ useObjectStreams: true }); }).then(function (bytes) { return { bytes: bytes, st: { raster: true } }; });
    });
  }

  function run() {
    var Lv = LEVELS[level], opts = { q: level === 'light' ? 0 : (+q.value / 100), side: Lv.side || 0 };
    var before = doc.bytes.length;
    T.task('جارٍ الضغط…', function (prog) {
      return T.pdfLib().then(function (L) { return level === 'extreme' ? viaRaster(L, opts, prog) : viaStructure(L, opts, prog); });
    }).then(function (r) {
      var after = r.bytes.length, pct = Math.round((1 - after / before) * 100), name = T.baseName(doc.name) + '_compressed.pdf';
      resultHost.innerHTML = '';
      var smaller = after < before;
      var box = h('section', { class: 'tl-card tl-result' }, [
        h('h2', { text: smaller ? '✓ تم الضغط' : 'لم يصغر الملف' }),
        h('div', { class: 'tl-row wrap', style: 'gap:22px;margin:6px 0 12px' }, [
          h('div', null, [h('div', { class: 'tl-muted', text: 'قبل' }), h('b', { style: 'font-size:22px', text: T.fmtSize(before) })]),
          h('div', { style: 'font-size:26px;color:var(--tool)', text: '←' }),
          h('div', null, [h('div', { class: 'tl-muted', text: 'بعد' }), h('b', { style: 'font-size:22px;color:' + (smaller ? 'var(--tool)' : 'var(--danger)'), text: T.fmtSize(after) })]),
          smaller ? h('div', { style: 'padding:6px 14px;border-radius:999px;background:var(--tq-soft);color:var(--tq-3);font-weight:700', text: 'وفّرت ' + pct + '%' }) : null]),
        h('p', { class: 'tl-muted', text: level === 'light' ? 'أُعيد بناء الملف دون أي فقد في الجودة. للحصول على توفير أكبر اختر مستوى أعلى.' : r.st.raster ? 'تم تحويل ' + doc.pages + ' صفحة إلى صور JPEG.' : r.st.total ? 'أُعيد ضغط ' + r.st.replaced + ' من ' + r.st.total + ' صورة داخل الملف.' : 'لا توجد صور داخل الملف للضغط؛ جرّب مستوى «أقصى» إن كان مصوّراً.' }),
        smaller ? null : h('p', { class: 'tl-err', text: 'الملف مضغوط أصلاً بدرجة جيدة، فالنتيجة أكبر من الأصل. الأفضل الاحتفاظ بالملف الأصلي، أو جرّب مستوى أقوى.' }),
        h('div', { class: 'tl-row wrap' }, [h('button', { class: 'tl-btn primary big', type: 'button', text: '⬇ تنزيل ' + (smaller ? '' : 'على أي حال'), onclick: function () { T.download(r.bytes, name, 'application/pdf'); } })])]);
      resultHost.appendChild(box); setTimeout(function () { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 60);
    }, function (e) { T.fail(e, 'تعذّر الضغط'); });
  }
  sync();
})();
