/* PDF studio — open a PDF, write/draw/add equations and figures on it, add solution pages, export a new PDF.
 * Everything runs in the browser: pdf.js renders the pages, pdf-lib writes the new file, additions are drawn
 * as vector graphics (Vector + Svg2Pdf). The original file is never modified. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SVGNS = 'http://www.w3.org/2000/svg';
  var PT = 96 / 72;                                   // CSS px per PDF point at 100 %
  var COLORS = ['#c2352b', '#1f5fbf', '#0e9f9a', '#2e8b3a', '#e07a00', '#7b3fb5', '#1b2a30', '#ffffff'];
  var HL = ['#ffe066', '#b2f2bb', '#a5d8ff', '#ffc9c9'];

  var S = {
    pdf: null, bytes: null, name: '', fp: '', pages: [], assets: {}, zoom: 1, tool: 'select', sel: null, cur: 0,
    undo: [], redo: [], dirty: false,
    props: { color: '#c2352b', width: 2, size: 16, bold: false, align: 'right', bg: 'none', fill: 'none' }
  };
  // source documents: 'main' is the opened file, others are PDFs whose pages were inserted (merge / insert pages)
  S.docs = {};
  var pgCache = {}, pgLoad = {};   // pdf.js page objects by "doc|index" (loaded on demand)
  function docOf(p) { return S.docs[(p && p.doc) || 'main']; }
  function srcKey(p) { return ((p && p.doc) || 'main') + '|' + p.src; }
  function srcPage(p) { return p && p.src >= 0 ? pgCache[srcKey(p)] || null : null; }
  function loadSrc(p) {
    if (!p || p.src < 0) return Promise.resolve(null);
    var k = srcKey(p);
    if (pgCache[k]) return Promise.resolve(pgCache[k]);
    var d = docOf(p);
    if (!d) return Promise.reject(new Error('المصدر غير متاح'));
    if (!pgLoad[k]) pgLoad[k] = d.pdf.getPage(p.src + 1).then(function (pg) { pgCache[k] = pg; return pg; }, function (err) { delete pgLoad[k]; throw err; });
    return pgLoad[k];
  }
  function srcExists(p) { var d = docOf(p); return p.src < 0 || (d && p.src < d.pdf.numPages); }
  function pageSize(pg, rot) { var vp = pg.getViewport({ scale: 1, rotation: (pg.rotate + (rot || 0)) % 360 }); return [vp.width, vp.height]; }
  var assetUrl = {};          // asset id -> blob URL (display)
  var clip = null;            // internal copy/paste of objects
  // look of equation / figure pictures: default background and equation ink for new items (kept in this browser)
  S.opt = (function () { try { return JSON.parse(localStorage.getItem('armath.pdf.look')) || {}; } catch (e) { return {}; } })();
  function saveOpt() { try { localStorage.setItem('armath.pdf.look', JSON.stringify(S.opt)); } catch (e) { /* ignore */ } }

  // ------------------------------------------------------------ small helpers
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  function toast(msg, err, action) {
    if (err && window.ArLog) ArLog.add('error', msg, { feature: 'toast' });
    var t = $('toast');
    t.innerHTML = '';
    t.appendChild(document.createTextNode(msg));
    if (action) { var b = document.createElement('button'); b.className = 'tact'; b.textContent = action.label; b.onclick = function () { t.hidden = true; action.fn(); }; t.appendChild(b); }
    t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toast.tm); toast.tm = setTimeout(function () { t.hidden = true; }, action ? 9000 : err ? 6000 : 2600);
  }
  function busy(on, text) { $('busy').hidden = !on; if (text) $('busyText').textContent = text; }
  function status(t) { $('status').textContent = t; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function f2(n) { return (Math.round(n * 100) / 100).toString(); }
  function popAt(pop, btn) {
    document.querySelectorAll('.pop').forEach(function (p) { if (p !== pop) p.hidden = true; });
    if (!pop.hidden) { pop.hidden = true; return; }
    pop.hidden = false;
    var r = btn.getBoundingClientRect(), w = pop.offsetWidth;
    pop.style.top = (r.bottom + 4) + 'px';
    pop.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, r.right - w)) + 'px';
  }
  document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest('.pop') && !e.target.closest('#figBtn,#pageMenuBtn,#projBtn,#setBtn,#stampBtn,#tplBtn,#arrBtn')) document.querySelectorAll('.pop').forEach(function (p) { if (p.id !== 'snapPop' || !e.target.closest('.ov')) p.hidden = true; });
  });
  function download(name, blob) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function copyBlob(blob) {
    if (!navigator.clipboard || !window.ClipboardItem) return Promise.reject(new Error('clipboard'));
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }
  function dataUrlToBlob(u) { var p = u.split(','), b = atob(p[1]), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return new Blob([a], { type: p[0].split(':')[1].split(';')[0] }); }

  // ------------------------------------------------------------ assets
  function setAsset(id, value) {
    S.assets[id] = value;
    if (assetUrl[id]) URL.revokeObjectURL(assetUrl[id]);
    assetUrl[id] = /^data:/.test(value) ? URL.createObjectURL(dataUrlToBlob(value)) : URL.createObjectURL(new Blob([value], { type: 'image/svg+xml' }));
  }
  // ---- per-object look: bg = '' (as drawn) | 'none' (transparent) | colour ; ink = colour for equations
  var WHITE = /^(rgb\(255, ?255, ?255\)|#fff|#ffffff|white)$/i;
  function stripBg(svg) {
    var vb = (svg.match(/viewBox="([^"]+)"/) || [])[1], v = vb ? vb.split(/[\s,]+/).map(Number) : null;
    return svg.replace(/<rect\b[^>]*>/g, function (r) {
      var fill = (r.match(/\sfill="([^"]*)"/) || [])[1];
      if (!fill || !WHITE.test(fill.trim()) || /fill-opacity="0?\.\d/.test(r)) return r;        // label halos stay
      var w = (r.match(/\swidth="([^"]*)"/) || [])[1], h = (r.match(/\sheight="([^"]*)"/) || [])[1];
      var full = w === '100%' || (v && parseFloat(w) >= v[2] * 0.85 && parseFloat(h) >= v[3] * 0.85);
      return full ? r.replace(/\sfill="[^"]*"/, ' fill="none"') : r;
    });
  }
  function lookOf(o) { return { bg: o.bg || '', ink: o.kind === 'eq' ? (o.ink || '') : '' }; }
  function lookSvg(o) {
    var src = S.assets[o.asset] || '', L = lookOf(o);
    if (!/^\s*<svg/.test(src) || (!L.bg && !L.ink)) return src;
    var out = src;
    if (L.bg) {
      out = stripBg(out);
      if (L.bg !== 'none') {
        var vb = (out.match(/viewBox="([^"]+)"/) || [])[1], v = vb ? vb.split(/[\s,]+/).map(Number) : [0, 0, parseFloat((out.match(/width="([\d.]+)/) || [])[1]) || 100, parseFloat((out.match(/height="([\d.]+)/) || [])[1]) || 100];
        out = out.replace(/(<svg\b[^>]*>)/, '$1<rect x="' + v[0] + '" y="' + v[1] + '" width="' + v[2] + '" height="' + v[3] + '" fill="' + L.bg + '"/>');
      }
    }
    if (L.ink) out = out.replace(/rgb\(0, ?0, ?0\)|rgb\(27, ?42, ?48\)|#000000\b|#1b2a30\b/gi, L.ink);
    return out;
  }
  var lookUrls = {};
  function lookHref(o, data) {
    if (o.t !== 'svg') return data ? assetData(o.asset) : (assetUrl[o.asset] || '');
    var L = lookOf(o);
    if (!L.bg && !L.ink) return data ? assetData(o.asset) : (assetUrl[o.asset] || '');
    var svg = lookSvg(o);
    if (data) return 'data:image/svg+xml;base64,' + Vector.toBase64(svg);
    var key = o.asset + '|' + L.bg + '|' + L.ink;
    if (!lookUrls[key]) lookUrls[key] = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    return lookUrls[key];
  }
  function assetData(id) {        // data: URL (for export snapshots)
    var v = S.assets[id];
    if (!v) return '';
    return /^data:/.test(v) ? v : 'data:image/svg+xml;base64,' + Vector.toBase64(v);
  }

  // ------------------------------------------------------------ history + autosave
  function snapshot() { return JSON.stringify({ pages: S.pages, clips: S.clips || [], deco: S.deco || {} }); }
  function push() {
    S.undo.push(snapshot()); if (S.undo.length > 80) S.undo.shift();
    S.redo = []; changed();
  }
  function changed() { S.dirty = true; syncButtons(); scheduleSave(); if (S.pages.length) { if (S.sel) refreshThumb(S.sel.page); refreshThumb(S.cur); } }
  function restore(json) {
    var d = JSON.parse(json);
    if (Array.isArray(d)) S.pages = d;                 // snapshots taken while moving hold the pages only
    else { S.pages = d.pages; S.clips = d.clips || []; S.deco = d.deco || {}; }
    if (S.sel && !selObj()) S.sel = null;           // keep the selection when the object is still there
    layoutPages(); syncButtons(); syncProps(); scheduleSave();
    if (window.PdfExt && PdfExt.refresh) PdfExt.refresh();
  }
  function undo() { if (!S.undo.length) return; S.redo.push(snapshot()); restore(S.undo.pop()); }
  function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); restore(S.redo.pop()); }
  function syncButtons() {
    $('undoBtn').disabled = !S.undo.length; $('redoBtn').disabled = !S.redo.length;
    var o = selObj();
    ['delBtn', 'dupBtn', 'copyImgBtn'].forEach(function (id) { $(id).disabled = !o; });
    if (window.PdfExt && PdfExt.sync) PdfExt.sync();
  }

  var DB = null;
  function db() {
    if (DB) return DB;
    DB = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no idb'));
      var r = indexedDB.open('armath-pdf', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('projects'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    DB.catch(function () {});
    return DB;
  }
  function idb(mode, fn) {
    return db().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction('projects', mode), st = tx.objectStore('projects'), rq = fn(st); tx.oncomplete = function () { res(rq && rq.result); }; tx.onerror = function () { rej(tx.error); }; }); });
  }
  var saveTm;
  function scheduleSave() {
    if (!S.fp) return;
    clearTimeout(saveTm);
    $('saveState').textContent = 'تغييرات غير محفوظة…';
    saveTm = setTimeout(function () {
      var data = { v: 2, name: S.name, pages: S.pages, assets: usedAssets(), clips: S.clips || [], deco: S.deco || {}, docs: extraDocs(), savedAt: Date.now() };
      idb('readwrite', function (st) { return st.put(data, S.fp); }).then(function () {
        $('saveState').textContent = 'حُفظ العمل تلقائياً ' + new Date().toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' });
      }, function () { $('saveState').textContent = 'تعذّر الحفظ التلقائي — احفظ ملف المشروع'; });
    }, 700);
  }
  function usedAssets() {
    var out = {};
    S.pages.forEach(function (p) { p.objs.forEach(function (o) { if (o.asset && S.assets[o.asset]) out[o.asset] = S.assets[o.asset]; }); });
    return out;
  }

  // ------------------------------------------------------------ opening
  function pdfjsReady() {
    return window.pdfjsLib ? Promise.resolve(window.pdfjsLib) : new Promise(function (res) { window.addEventListener('pdfjs-ready', function () { res(window.pdfjsLib); }, { once: true }); });
  }
  function openFile(file) {
    if (!file) return;
    busy(true, 'جارٍ فتح الملف…');
    file.arrayBuffer().then(function (buf) { return openBytes(new Uint8Array(buf), file.name); })
      .catch(function (e) { toast('تعذّر فتح الملف: ' + (e && e.message), true); })
      .then(function () { busy(false); });
  }
  function openBytes(bytes, name) {
    return pdfjsReady().then(function (pdfjs) {
      return pdfjs.getDocument({ data: bytes.slice(0), cMapUrl: 'vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: 'vendor/pdfjs/standard_fonts/', isEvalSupported: false }).promise;
    }).then(function (pdf) {
      if (S.docs) Object.keys(S.docs).forEach(function (k) { try { S.docs[k].pdf.destroy(); } catch (x) { /* ignore */ } });
      S.pdf = pdf; S.bytes = bytes; S.name = name || 'document.pdf'; S.fp = (pdf.fingerprints && pdf.fingerprints[0]) || name;
      S.docs = { main: { pdf: pdf, bytes: bytes, name: S.name } };
      pgCache = {}; pgLoad = {}; S.undo = []; S.redo = []; S.sel = null; S.tsel = []; S.clips = []; S.deco = {};
      $('fname').textContent = '— ' + S.name;
      document.title = S.name + ' — استوديو PDF';
      return loadSrc({ src: 0 });
    }).then(function (first) {
      S.pages = fresh(S.pdf.numPages, 'main', first);
      return idb('readonly', function (st) { return st.get(S.fp); }).catch(function () { return null; });
    }).then(function (saved) {
      return restoreExtraDocs(saved).then(function () { return saved; });
    }).then(function (saved) {
      if (saved && saved.pages && (saved.pages.some(function (p) { return p.objs.length || p.src < 0 || p.doc || p.crop; }) || saved.pages.length !== S.pages.length || (saved.clips && saved.clips.length) || (saved.deco && (saved.deco.num || saved.deco.wm)))) {
        var freshJson = JSON.stringify(S.pages);
        Object.keys(saved.assets || {}).forEach(function (k) { setAsset(k, saved.assets[k]); });
        S.pages = saved.pages.filter(srcExists);
        S.clips = saved.clips || []; S.deco = saved.deco || {};
        toast('تمت استعادة عملك السابق على هذا الملف', false, { label: 'البدء من جديد', fn: function () { push(); restore(freshJson); } });
      }
      $('empty').hidden = true;
      document.dispatchEvent(new Event('pdf-opened'));       // the properties panel takes its width before the page is fitted
      S.zoom = fitZoom();
      layoutPages();
      status('عدد الصفحات: ' + S.pages.length);
      measureAll();
      if (window.PdfExt && PdfExt.onOpen) PdfExt.onOpen();
    });
  }
  /** pages for a whole document, all sized like its first page until each page is measured */
  function fresh(n, doc, first) {
    var sz = first ? pageSize(first, 0) : [595, 842], out = [];
    for (var i = 0; i < n; i++) { var p = { id: uid(), src: i, rot: 0, w: sz[0], h: sz[1], objs: [] }; if (doc !== 'main') p.doc = doc; out.push(p); }
    return out;
  }
  // real size of every page, measured in the background (big books open at once; odd-sized pages are corrected)
  var measureRun = 0, measured = new WeakSet();
  function measureAll() {
    var run = ++measureRun, k = 0;
    (function step() {
      if (run !== measureRun) return;
      var t0 = Date.now();
      var chain = Promise.resolve();
      while (k < S.pages.length && Date.now() - t0 < 12) {
        (function (p) {
          if (p.src < 0 || measured.has(p)) return;
          chain = chain.then(function () {
            return loadSrc(p).then(function (pg) {
              measured.add(p);
              var sz = pageSize(pg, p.rot);
              if (Math.abs(sz[0] - p.w) > 0.5 || Math.abs(sz[1] - p.h) > 0.5) { p.w = sz[0]; p.h = sz[1]; resizePageEl(S.pages.indexOf(p)); }
            }).catch(function () { measured.add(p); });
          });
        })(S.pages[k]);
        k++;
      }
      chain.then(function () { if (k < S.pages.length) setTimeout(step, 0); });
    })();
  }
  function fitZoom() {
    var w = $('viewer').clientWidth - 60, pw = S.pages.length ? cropOf(S.pages[S.cur] || S.pages[0]).w * PT : 600;
    return Math.max(0.3, Math.min(2, w / pw));
  }

  // ------------------------------------------------------------ layout & rendering
  var observer = null, rendered = {};
  function scale() { return S.zoom * PT; }
  function layoutPages() {
    var box = $('pages');
    box.innerHTML = ''; rendered = {};
    if (observer) observer.disconnect();
    observer = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { var i = +en.target.dataset.i; if (en.isIntersecting) renderPage(i); else unrender(i); });
    }, { root: $('viewer'), rootMargin: '600px 0px' });
    S.pages.forEach(function (p, i) {
      var d = document.createElement('div');
      d.className = 'page' + (p.src < 0 ? ' blankpg' : '') + (p.sol ? ' solpg' : '');
      d.dataset.i = i;
      d.innerHTML = '<div class="pin"><canvas class="pdf" width="1" height="1"></canvas><svg class="bgl" xmlns="' + SVGNS + '" preserveAspectRatio="none"></svg><svg class="ov" xmlns="' + SVGNS + '" preserveAspectRatio="none"></svg></div><div class="pno">' + (i + 1) + '</div>';
      box.appendChild(d);
      sizePageEl(d, p);
      observer.observe(d);
      drawOverlay(i);
    });
    $('pgCount').textContent = S.pages.length;
    if (!(S.tsel && S.tsel.length > 1)) status('عدد الصفحات: ' + S.pages.length);
    $('zoomVal').textContent = Math.round(S.zoom * 100) + '%';
    buildThumbs();
    bindOverlays();
  }
  function pageEl(i) { return $('pages').children[i]; }
  function pinOf(i) { var el = pageEl(i); return el && el.querySelector('.pin'); }
  function cropOf(p) { return p.crop || { x: 0, y: 0, w: p.w, h: p.h }; }
  function sizePageEl(d, p) {
    var s = scale(), c = cropOf(p), pin = d.querySelector('.pin');
    d.style.width = (c.w * s) + 'px'; d.style.height = (c.h * s) + 'px';
    d.classList.toggle('cropped', !!p.crop);
    pin.style.width = (p.w * s) + 'px'; pin.style.height = (p.h * s) + 'px';
    pin.style.left = (-c.x * s) + 'px'; pin.style.top = (-c.y * s) + 'px';
    var vb = '0 0 ' + f2(p.w) + ' ' + f2(p.h);
    d.querySelector('svg.ov').setAttribute('viewBox', vb); d.querySelector('svg.bgl').setAttribute('viewBox', vb);
    drawBg(+d.dataset.i);
  }
  function resizePageEl(i) {
    var d = pageEl(i), p = S.pages[i]; if (!d || !p) return;
    sizePageEl(d, p); delete rendered[i];
    var r = d.getBoundingClientRect(), v = $('viewer').getBoundingClientRect();
    if (r.bottom > v.top - 600 && r.top < v.bottom + 600) renderPage(i);
    drawOverlay(i);
    var t = $('thumbs').children[i]; if (t) { var cv = t.querySelector('canvas,.blank'); if (cv) cv.style.height = Math.round(116 * cropOf(p).h / cropOf(p).w) + 'px'; }
  }
  // background layer: solution-page template, page numbers, watermark (drawn, not selectable)
  function drawBg(i) {
    var el = pageEl(i); if (!el) return;
    var sv = el.querySelector('svg.bgl'), p = S.pages[i];
    sv.innerHTML = (window.PdfDecor ? PdfDecor.page(p, i, S, false) : '') + (window.PdfExt && PdfExt.frames ? PdfExt.frames(p, i) : '') + (window.PdfText ? PdfText.marks(p, i) : '');
  }
  var MAXPX = 5000 * 5000;           // one page canvas never exceeds this many pixels (memory on big zooms)
  function renderPage(i) {
    var p = S.pages[i], el = pageEl(i);
    if (!p || !el || rendered[i] === S.zoom) return;
    rendered[i] = S.zoom;
    var cv = el.querySelector('canvas'), zoom = S.zoom;
    if (p.src < 0) { cv.width = 1; cv.height = 1; return; }
    loadSrc(p).then(function (pg) {
      if (rendered[i] !== zoom || S.pages[i] !== p || pageEl(i) !== el) return;
      var dpr = Math.min(3, window.devicePixelRatio || 1), sc = scale() * dpr;
      if (p.w * p.h * sc * sc > MAXPX) sc = Math.sqrt(MAXPX / (p.w * p.h));
      var vp = pg.getViewport({ scale: sc, rotation: (pg.rotate + p.rot) % 360 });
      if (cv.__task) try { cv.__task.cancel(); } catch (e) { /* ignore */ }
      // draw off-screen first so the old picture stays until the new one is ready
      var off = document.createElement('canvas'); off.width = Math.round(vp.width); off.height = Math.round(vp.height);
      cv.__task = pg.render({ canvasContext: off.getContext('2d'), viewport: vp });
      cv.__task.promise.then(function () {
        if (rendered[i] !== zoom || pageEl(i) !== el) return;
        cv.width = off.width; cv.height = off.height; cv.getContext('2d').drawImage(off, 0, 0);
        off.width = off.height = 0;
        if (window.PdfText) PdfText.onRender(i, pg);
      }, function () { if (rendered[i] === zoom) delete rendered[i]; off.width = off.height = 0; });
    }).catch(function () { delete rendered[i]; });
  }
  function unrender(i) {
    var el = pageEl(i); if (!el || rendered[i] === undefined) return;
    var cv = el.querySelector('canvas');
    if (cv.__task) try { cv.__task.cancel(); } catch (e) { /* ignore */ }
    cv.width = 1; cv.height = 1; delete rendered[i];
    if (window.PdfText) PdfText.onUnrender(i);
    var pg = srcPage(S.pages[i]); if (pg) setTimeout(function () { if (rendered[i] === undefined) try { pg.cleanup(); } catch (e) { /* ignore */ } }, 0);
  }
  function setZoom(z, keep) {
    var v = $('viewer'), frac = v.scrollTop / Math.max(1, v.scrollHeight);
    S.zoom = Math.max(0.25, Math.min(4, z));
    layoutPages();
    if (keep !== false) v.scrollTop = frac * v.scrollHeight;
  }

  // thumbnails
  var thumbObs = null;
  function buildThumbs() {
    var box = $('thumbs'); box.innerHTML = '';
    if (thumbObs) thumbObs.disconnect();
    thumbObs = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { var i = +en.target.dataset.i; if (en.isIntersecting) thumbRender(i); else thumbFree(i); });
    }, { root: box, rootMargin: '500px 0px' });
    var sel = S.tsel || [];
    S.pages.forEach(function (p, i) {
      var t = document.createElement('div');
      t.className = 'thumb' + (i === S.cur ? ' cur' : '') + (sel.indexOf(p.id) >= 0 ? ' tsel' : '');
      t.dataset.i = i; t.draggable = true;
      var c = cropOf(p), ratio = c.h / c.w;
      t.innerHTML = (p.src < 0 ? '<div class="blank" style="height:' + Math.round(116 * ratio) + 'px"></div><span class="tag">حل</span>' : '<canvas style="height:' + Math.round(116 * ratio) + 'px"></canvas>') +
        (p.src >= 0 && p.sol ? '<span class="tag">حل</span>' : '') +
        (p.objs.length ? '<span class="mark" title="فيها إضافات"></span>' : '') + '<div class="no">' + (i + 1) + '</div>';
      box.appendChild(t);
      thumbObs.observe(t);
      if (p.src < 0 && (p.objs.length || p.tpl || p.title)) setTimeout(function () { blankThumb(i); }, 0);
    });
  }
  function thumbRender(i) {
    var p = S.pages[i], t = $('thumbs').children[i];
    if (!p || p.src < 0 || !t) return;
    var cv = t.querySelector('canvas'); if (!cv || cv.__done) return;
    cv.__done = true;
    loadSrc(p).then(function (pg) {
      if ($('thumbs').children[i] !== t) return;
      var c = cropOf(p), k = Math.min(2, window.devicePixelRatio || 1) * 116 / c.w;
      var vp = pg.getViewport({ scale: k, rotation: (pg.rotate + p.rot) % 360 });
      var off = document.createElement('canvas'); off.width = Math.round(vp.width); off.height = Math.round(vp.height);
      return pg.render({ canvasContext: off.getContext('2d'), viewport: vp }).promise.then(function () {
        if (!cv.__done) return;
        cv.width = Math.max(1, Math.round(c.w * k)); cv.height = Math.max(1, Math.round(c.h * k));
        cv.getContext('2d').drawImage(off, -c.x * k, -c.y * k);
        off.width = off.height = 0;
        return thumbAdds(i, cv, k);
      });
    }).catch(function () { cv.__done = false; });
  }
  // the page's additions painted on its thumbnail (fonts are not needed at that size)
  function thumbAdds(i, cv, k) {
    var p = S.pages[i], list = p.objs.filter(function (o) { return !(S.preview && o.sol) && !o.hide && o.t !== 'note'; }), deco = window.PdfDecor ? PdfDecor.page(p, i, S, false) : '';
    if (!list.length && !deco) return Promise.resolve();
    var c = cropOf(p);
    var svg = '<svg xmlns="' + SVGNS + '" width="' + f2(p.w) + '" height="' + f2(p.h) + '" viewBox="0 0 ' + f2(p.w) + ' ' + f2(p.h) + '">' + deco + list.map(function (o) { return objInner(o, true); }).join('') + '</svg>';
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () { if (cv.width > 1) cv.getContext('2d').drawImage(img, -c.x * k, -c.y * k, p.w * k, p.h * k); res(); };
      img.onerror = function () { res(); };
      img.src = 'data:image/svg+xml;base64,' + Vector.toBase64(svg);
    });
  }
  var thumbTimer = null, thumbDirty = {};
  function refreshThumb(i) {
    thumbDirty[i] = true; clearTimeout(thumbTimer);
    thumbTimer = setTimeout(function () {
      Object.keys(thumbDirty).forEach(function (k) {
        var t = $('thumbs').children[+k], p = S.pages[+k]; if (!t || !p) return;
        if (p.src < 0) { blankThumb(+k); return; }
        var cv = t.querySelector('canvas'); if (cv && cv.__done) { cv.__done = false; thumbRender(+k); }
      });
      thumbDirty = {};
    }, 700);
  }
  // solution pages have no PDF page: their thumbnail is the template + additions only
  function blankThumb(i) {
    var t = $('thumbs').children[i], p = S.pages[i]; if (!t || !p || p.src >= 0) return;
    var box = t.querySelector('.blank'); if (!box) return;
    var cv = box.querySelector('canvas');
    var c = cropOf(p), k = Math.min(2, window.devicePixelRatio || 1) * 116 / c.w;
    if (!cv) { cv = document.createElement('canvas'); cv.style.cssText = 'width:100%;height:100%;display:block'; box.appendChild(cv); }
    cv.width = Math.round(c.w * k); cv.height = Math.round(c.h * k);
    var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
    thumbAdds(i, cv, k);
  }
  function thumbFree(i) {
    var t = $('thumbs').children[i], cv = t && t.querySelector('canvas');
    if (cv && cv.__done) { cv.__done = false; cv.width = 1; cv.height = 1; }
  }
  function markThumb(i) {
    var t = $('thumbs').children[i]; if (!t) return;
    var has = S.pages[i].objs.length > 0, m = t.querySelector('.mark');
    if (has && !m) { m = document.createElement('span'); m.className = 'mark'; t.appendChild(m); }
    if (!has && m) m.remove();
  }
  function goto(i) {
    i = Math.max(0, Math.min(S.pages.length - 1, i));
    var el = pageEl(i); if (!el) return;
    $('viewer').scrollTop = el.offsetTop - 10;
    setCur(i);
  }
  function setCur(i) {
    if (S.cur === i) return;
    S.cur = i; $('pgInp').value = i + 1;
    Array.prototype.forEach.call($('thumbs').children, function (t, k) { t.classList.toggle('cur', k === i); });
    var th = $('thumbs').children[i];
    if (th) { var b = $('thumbs'); if (th.offsetTop < b.scrollTop || th.offsetTop > b.scrollTop + b.clientHeight - 60) b.scrollTop = th.offsetTop - 40; }
  }
  $('viewer').addEventListener('scroll', function () {
    var v = $('viewer'), mid = v.scrollTop + v.clientHeight / 3, kids = $('pages').children;
    for (var i = 0; i < kids.length; i++) { if (kids[i].offsetTop + kids[i].offsetHeight > mid) { setCur(i); break; } }
  });

  // ------------------------------------------------------------ objects → SVG
  // text boxes: font, bold, italic, underline, line spacing, bullet / numbered lists, background, border.
  // Arabic lines are laid out word by word (measured), so mixed Arabic / Latin / numbers and brackets come out right
  // on screen and in the exported PDF alike.
  var FONTS = { 'Amiri': 'أميري', 'Noto Naskh Arabic': 'نسخ', 'Scheherazade New': 'شهرزاد', 'Cairo': 'القاهرة', 'Noto Kufi Arabic': 'كوفي', 'Times New Roman': 'Times', 'Arial': 'Arial' };
  var mctx = document.createElement('canvas').getContext('2d');
  function famOf(o) { var f = o.font && (FONTS[o.font] || (window.UserFonts && UserFonts.isCustom(o.font))) ? o.font : 'Amiri'; return '"' + f + '", Amiri, "Times New Roman", serif'; }
  function fontOf(o) { return (o.italic ? 'italic ' : '') + (o.bold ? '700 ' : '400 ') + o.size + 'px ' + famOf(o); }
  function tw(s) { return mctx.measureText(s).width; }
  function paras(o) {
    var n = 0;
    return String(o.text || '').split('\n').map(function (para) {
      if (!para.trim() || !o.list) return para;
      n++;
      return (o.list === 'num' ? n + '. ' : '• ') + para;
    });
  }
  function wrapText(o) {
    mctx.font = fontOf(o);
    var lines = [], pad = o.border ? 10 : 6;
    paras(o).forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean), cur = '';
      if (!words.length) { lines.push(''); return; }
      words.forEach(function (w) {
        var t = cur ? cur + ' ' + w : w;
        if (cur && tw(t) > o.w - pad) { lines.push(cur); cur = w; } else cur = t;
      });
      lines.push(cur);
    });
    return lines;
  }
  function lhOf(o) { return o.size * (+o.lh || 1.5); }
  function textHeight(o) { return Math.max(lhOf(o), wrapText(o).length * lhOf(o)) + 4 + (o.border ? 6 : 0); }
  var ARx = /[؀-ۿ]/, MIR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '«': '»', '»': '«', '<': '>', '>': '<' };
  // A line → pieces [{s, w, rtl}] in visual order (left → right), following the Unicode bidi rules closely enough for
  // school texts: Latin words (and the numbers / signs between them) stay left-to-right runs; Arabic words, lone numbers and
  // signs are ordered right-to-left; brackets and trailing punctuation around them are placed apart and mirrored.
  var LATx = /[A-Za-zÀ-ɏͰ-Ͽ]/, PUNCT = /^[^0-9A-Za-zÀ-ɏͰ-Ͽ؀-ۿ٠-٩]+$/;
  function mirStr(q) { return q.split('').reverse().map(function (c) { return MIR[c] || c; }).join(''); }
  function kind(w) { return ARx.test(w) ? 'ar' : LATx.test(w) ? 'lat' : 'n'; }
  function bidiRuns(words) {
    // Latin run: from a Latin word through the following non-Arabic words; trailing pure punctuation is given back
    var runs = [], i = 0;
    while (i < words.length) {
      if (kind(words[i]) === 'lat') {
        var j = i + 1;
        while (j < words.length && kind(words[j]) !== 'ar') j++;
        var end = j;
        while (end > i + 1 && PUNCT.test(words[end - 1])) end--;
        runs.push({ ltr: true, words: words.slice(i, end) });
        for (var k = end; k < j; k++) runs.push({ ltr: false, words: [words[k]] });
        i = j;
      } else { runs.push({ ltr: false, words: [words[i]] }); i++; }
    }
    return runs;
  }
  function splitWord(w) {             // "(كلمة):" → lead "(", core "كلمة", tail "):"
    var m = w.match(/^([(\[{«<"'“]*)([\s\S]*?)([)\]}»>"'”.,:;،؛!?]*)$/);
    return m && m[2] ? { lead: m[1], core: m[2], tail: m[3] } : { lead: '', core: w, tail: '' };
  }
  function rtlPieces(line) {
    var words = line.split(/\s+/).filter(Boolean), out = [], sp = tw(' ');
    bidiRuns(words).reverse().forEach(function (r, k) {
      if (k) out.push({ s: ' ', w: sp, sp: true });
      if (r.ltr) { var s = r.words.join(' '); out.push({ s: s, w: tw(s) }); return; }
      Array.prototype.push.apply(out, segRtl(r.words[0]));
    });
    return out;
  }
  // one word of a right-to-left run → its pieces in visual order: brackets and punctuation drawn apart, mirrored
  // (fonts such as Amiri mirror brackets inside Arabic text unreliably), Arabic letters shaped as a whole
  function segRtl(w) {
    // brackets split anywhere; . , : ; ! ? only at the start or the end (so 12.5 and 1,000 stay whole)
    var segs = w.split(/([()\[\]{}«»<>]+|^[.,:;،؛!?]+|[.,:;،؛!?]+$)/).filter(function (x) { return x !== '' && x !== undefined; });
    return segs.reverse().map(function (x) {
      var br = /^[()\[\]{}«»<>.,:;،؛!?]+$/.test(x), s = br ? mirStr(x) : x;
      return { s: s, w: tw(s), rtl: !br && ARx.test(x) };
    });
  }
  // left-to-right paragraph (starts with a Latin letter) holding some Arabic words: those words read right-to-left
  function ltrPieces(line) {
    var words = line.split(/\s+/).filter(Boolean), out = [], sp = tw(' '), k = 0;
    while (k < words.length) {
      if (kind(words[k]) === 'ar') {
        var grp = []; while (k < words.length && kind(words[k]) !== 'lat') grp.push(words[k++]);
        while (grp.length > 1 && PUNCT.test(grp[grp.length - 1])) { k--; grp.pop(); }
        grp.reverse().forEach(function (w, n) { if (out.length || n) out.push({ s: ' ', w: sp, sp: true }); Array.prototype.push.apply(out, kind(w) === 'ar' ? segRtl(w) : [{ s: w, w: tw(w) }]); });
      } else { if (out.length) out.push({ s: ' ', w: sp, sp: true }); out.push({ s: words[k], w: tw(words[k]) }); k++; }
    }
    return out;
  }
  function firstStrong(l) { for (var i = 0; i < l.length; i++) { var c = l[i]; if (ARx.test(c)) return 'r'; if (LATx.test(c)) return 'l'; } return 'r'; }
  function textSvgInner(o) {
    var lines = wrapText(o), lh = lhOf(o), out = '', pad = o.border ? 5 : 3;
    if (o.bg && o.bg !== 'none') out += '<rect x="' + f2(o.x) + '" y="' + f2(o.y) + '" width="' + f2(o.w) + '" height="' + f2(o.h) + '" fill="' + o.bg + '"' + (o.border ? ' rx="4"' : '') + '/>';
    if (o.border) out += '<rect x="' + f2(o.x) + '" y="' + f2(o.y) + '" width="' + f2(o.w) + '" height="' + f2(o.h) + '" fill="none" stroke="' + o.border + '" stroke-width="1.2" rx="4"/>';
    var attrs = ' font-family="' + esc(famOf(o)) + '" font-size="' + f2(o.size) + '"' + (o.bold ? ' font-weight="700"' : '') + (o.italic ? ' font-style="italic"' : '') + ' fill="' + o.color + '"';
    var x0 = o.x + pad, x1 = o.x + o.w - pad;
    mctx.font = fontOf(o);
    lines.forEach(function (l, k) {
      if (!l) return;
      var y = o.y + 2 + (o.border ? 3 : 0) + lh * k + o.size * 1.1 + (lh - o.size * 1.5) / 2, width, start;
      if (ARx.test(l)) {
        var ps = firstStrong(l) === 'l' ? ltrPieces(l) : rtlPieces(l);
        width = ps.reduce(function (a, q) { return a + q.w; }, 0);
        start = o.align === 'center' ? (x0 + x1 - width) / 2 : o.align === 'left' ? x0 : x1 - width;
        var x = start;
        ps.forEach(function (q) {
          if (!q.sp) out += '<text x="' + f2(q.rtl ? x + q.w : x) + '" y="' + f2(y) + '" text-anchor="' + (q.rtl ? 'end' : 'start') + '" style="direction:ltr" direction="ltr"' + attrs + '>' + esc(q.s) + '</text>';
          x += q.w;
        });
      } else {
        width = tw(l);
        start = o.align === 'center' ? (x0 + x1 - width) / 2 : o.align === 'right' ? x1 - width : x0;
        out += '<text x="' + f2(start) + '" y="' + f2(y) + '" text-anchor="start" style="direction:ltr" direction="ltr"' + attrs + '>' + esc(l) + '</text>';
      }
      if (o.under) out += '<line x1="' + f2(start) + '" y1="' + f2(y + o.size * 0.18) + '" x2="' + f2(start + width) + '" y2="' + f2(y + o.size * 0.18) + '" stroke="' + o.color + '" stroke-width="' + f2(Math.max(0.6, o.size / 16)) + '"/>';
    });
    return out;
  }
  // sticky note: an icon on the page (a real PDF comment when saved); its text shows on hover, or printed when asked
  function noteInner(o, exporting) {
    var c = o.color || '#ffd43b', out = '';
    if (!exporting) {
      out += '<g class="note"><title>' + esc(o.text || 'ملاحظة فارغة') + '</title><path d="M' + f2(o.x) + ' ' + f2(o.y) + 'h20v14l-6 6h-14z" fill="' + c + '" stroke="#8a6d00" stroke-width="0.8"/>' +
        '<path d="M' + f2(o.x + 14) + ' ' + f2(o.y + 20) + 'v-6h6" fill="none" stroke="#8a6d00" stroke-width="0.8"/>' +
        '<path d="M' + f2(o.x + 4) + ' ' + f2(o.y + 6) + 'h12M' + f2(o.x + 4) + ' ' + f2(o.y + 10) + 'h12M' + f2(o.x + 4) + ' ' + f2(o.y + 14) + 'h8" stroke="#8a6d00" stroke-width="0.7"/></g>';
    }
    if (o.show && o.text) {
      var t = { x: o.x + 24, y: o.y, w: 170, text: o.text, size: 10, color: '#3d3300', bold: false, align: 'right', bg: '#fff4bf', border: '#e0c14a', lh: 1.4 };
      t.h = textHeight(t);
      out += textSvgInner(t);
    }
    return out;
  }
  function arrowHead(o) {
    var dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, s = Math.max(7, o.width * 3.2);
    var bx = o.x2 - ux * s, by = o.y2 - uy * s, px = -uy * s * 0.45, py = ux * s * 0.45;
    return '<path d="M' + f2(o.x2) + ' ' + f2(o.y2) + 'L' + f2(bx + px) + ' ' + f2(by + py) + 'L' + f2(bx - px) + ' ' + f2(by - py) + 'Z" fill="' + o.color + '"/>';
  }
  function fillOf(o) { return o.fill === 'solid' ? o.color : o.fill === 'soft' ? o.color : 'none'; }
  // inner SVG markup of one object, in page coordinates (pt). data=true → assets as data: URLs
  function objInner(o, data, exporting) {
    switch (o.t) {
      case 'svg': case 'image':
        return '<image href="' + lookHref(o, data) + '" x="' + f2(o.x) + '" y="' + f2(o.y) + '" width="' + f2(o.w) + '" height="' + f2(o.h) + '" preserveAspectRatio="none"/>';
      case 'text': return textSvgInner(o);
      case 'shape': return window.PdfShapes ? PdfShapes.inner(o, data, exporting) : '';
      case 'mark': case 'redact': case 'link': case 'field': return window.PdfAnnot ? PdfAnnot.inner(o, data, exporting) : '';
      case 'note': return noteInner(o, exporting);
      case 'ink':
        var d = inkPath(o.pts);
        return '<path d="' + d + '" fill="none" stroke="' + o.color + '" stroke-width="' + f2(o.width) + '" stroke-linecap="' + (o.hl ? 'butt' : 'round') + '" stroke-linejoin="round"' + (o.hl ? ' stroke-opacity="0.38"' : '') + '/>';
      case 'rect': case 'white':
        var r = norm(o);
        if (o.t === 'white') return '<rect x="' + f2(r.x) + '" y="' + f2(r.y) + '" width="' + f2(r.w) + '" height="' + f2(r.h) + '" fill="#ffffff"/>';
        return '<rect x="' + f2(r.x) + '" y="' + f2(r.y) + '" width="' + f2(r.w) + '" height="' + f2(r.h) + '" fill="' + fillOf(o) + '"' + (o.fill === 'soft' ? ' fill-opacity="0.18"' : '') + ' stroke="' + o.color + '" stroke-width="' + f2(o.width) + '"/>';
      case 'ellipse':
        var e = norm(o);
        return '<ellipse cx="' + f2(e.x + e.w / 2) + '" cy="' + f2(e.y + e.h / 2) + '" rx="' + f2(e.w / 2) + '" ry="' + f2(e.h / 2) + '" fill="' + fillOf(o) + '"' + (o.fill === 'soft' ? ' fill-opacity="0.18"' : '') + ' stroke="' + o.color + '" stroke-width="' + f2(o.width) + '"/>';
      case 'line': case 'arrow':
        var dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy) || 1, cut = o.t === 'arrow' ? Math.max(7, o.width * 3.2) * 0.8 : 0;
        return '<line x1="' + f2(o.x1) + '" y1="' + f2(o.y1) + '" x2="' + f2(o.x2 - dx / L * cut) + '" y2="' + f2(o.y2 - dy / L * cut) + '" stroke="' + o.color + '" stroke-width="' + f2(o.width) + '" stroke-linecap="round"/>' + (o.t === 'arrow' ? arrowHead(o) : '');
    }
    return '';
  }
  // handwriting: a smooth curve through the points (quadratic Béziers between midpoints)
  function inkPath(pts) {
    if (!pts.length) return '';
    if (pts.length === 1) return 'M' + f2(pts[0][0]) + ' ' + f2(pts[0][1]) + 'l0.01 0';
    if (pts.length === 2) return 'M' + f2(pts[0][0]) + ' ' + f2(pts[0][1]) + 'L' + f2(pts[1][0]) + ' ' + f2(pts[1][1]);
    var d = 'M' + f2(pts[0][0]) + ' ' + f2(pts[0][1]);
    for (var k = 1; k < pts.length - 1; k++) {
      var mx = (pts[k][0] + pts[k + 1][0]) / 2, my = (pts[k][1] + pts[k + 1][1]) / 2;
      d += 'Q' + f2(pts[k][0]) + ' ' + f2(pts[k][1]) + ' ' + f2(mx) + ' ' + f2(my);
    }
    var L = pts[pts.length - 1];
    return d + 'L' + f2(L[0]) + ' ' + f2(L[1]);
  }
  // Ramer–Douglas–Peucker: fewer points, same shape (lighter files, smoother curves)
  function simplify(pts, eps) {
    if (pts.length < 4) return pts;
    var keep = new Array(pts.length); keep[0] = keep[pts.length - 1] = true;
    (function rdp(a, b) {
      var ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1], L = Math.hypot(bx - ax, by - ay) || 1e-9, best = -1, bi = -1;
      for (var k = a + 1; k < b; k++) { var dd = Math.abs((by - ay) * pts[k][0] - (bx - ax) * pts[k][1] + bx * ay - by * ax) / L; if (dd > best) { best = dd; bi = k; } }
      if (best > eps) { keep[bi] = true; rdp(a, bi); rdp(bi, b); }
    })(0, pts.length - 1);
    return pts.filter(function (p, k) { return keep[k]; });
  }
  function norm(o) {           // rect-like objects stored as two corners
    if (o.x1 === undefined) return { x: o.x, y: o.y, w: o.w, h: o.h };
    return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
  }
  function bbox(o) {
    if (o.t === 'shape' && window.PdfShapes) return PdfShapes.bbox(o);
    if (o.t === 'mark' && window.PdfAnnot) return PdfAnnot.bbox(o);
    if (o.t === 'note') return { x: o.x, y: o.y, w: 20, h: 20 };
    if (o.t === 'ink') {
      var xs = o.pts.map(function (p) { return p[0]; }), ys = o.pts.map(function (p) { return p[1]; }), m = o.width / 2;
      return { x: Math.min.apply(null, xs) - m, y: Math.min.apply(null, ys) - m, w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + 2 * m, h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + 2 * m };
    }
    return norm(o);
  }
  function drawOverlay(i) {
    var el = pageEl(i); if (!el) return;
    var p = S.pages[i], sv = el.querySelector('svg.ov'), out = '';
    el.classList.toggle('hidepg', !!(S.preview && p.sol));
    if (S.opt.grid) { var gs = S.opt.gridStep || 10; out += '<defs><pattern id="gp' + i + '" width="' + gs + '" height="' + gs + '" patternUnits="userSpaceOnUse"><path d="M' + gs + ' 0H0V' + gs + '" fill="none" stroke="#2f6fed" stroke-opacity=".28" stroke-width="' + f2(0.5 / Math.max(.5, S.zoom) + .2) + '"/></pattern></defs><rect x="0" y="0" width="' + f2(p.w) + '" height="' + f2(p.h) + '" fill="url(#gp' + i + ')" pointer-events="none"/>'; }
    p.objs.forEach(function (o) {
      if ((S.preview && o.sol) || o.hide) return;
      out += '<g data-id="' + o.id + '"' + (o.lock ? ' class="locked"' : '') + '>' + objInner(o) + (o.t === 'ink' || o.t === 'line' || o.t === 'arrow' ? hitPath(o) : '') + '</g>';
    });
    var list = S.sel && S.sel.page === i ? selObjs() : [];
    if (list.length) {
      var hs = 5 / S.zoom;
      list.forEach(function (o) {
        if (o.t === 'shape' && list.length === 1) return;
        var b = bbox(o);
        out += '<rect class="selbox' + (o.lock ? ' lk' : '') + '" x="' + f2(b.x - 2) + '" y="' + f2(b.y - 2) + '" width="' + f2(b.w + 4) + '" height="' + f2(b.h + 4) + '"/>';
        if (o.lock) out += '<text class="lockbadge" x="' + f2(b.x + b.w + 3) + '" y="' + f2(b.y + 2) + '" font-size="' + f2(11 / S.zoom) + '">🔒</text>';
      });
      if (list.length > 1) { var u = unionBox(list); out += '<rect class="selbox all" x="' + f2(u.x - 5) + '" y="' + f2(u.y - 5) + '" width="' + f2(u.w + 10) + '" height="' + f2(u.h + 10) + '"/>'; }
      var s = list.length === 1 ? list[0] : null;
      if (s && s.t === 'shape' && window.PdfShapes) out += PdfShapes.overlay(s, S.zoom);
      else if (s && s.t !== 'ink' && s.t !== 'note' && s.t !== 'mark' && !s.lock) {
        var b1 = bbox(s);
        [[b1.x + b1.w, b1.y + b1.h, 'se'], [b1.x, b1.y, 'nw'], [b1.x + b1.w, b1.y, 'ne'], [b1.x, b1.y + b1.h, 'sw']].forEach(function (h) {
          out += '<rect class="hd' + (h[2] === 'ne' || h[2] === 'sw' ? ' h2' : '') + '" data-h="' + h[2] + '" x="' + f2(h[0] - hs) + '" y="' + f2(h[1] - hs) + '" width="' + f2(hs * 2) + '" height="' + f2(hs * 2) + '"/>';
        });
      }
    }
    if (guides && guides.i === i) guides.lines.forEach(function (g) {
      out += g.v ? '<line class="guide" x1="' + f2(g.v) + '" y1="0" x2="' + f2(g.v) + '" y2="' + f2(p.h) + '"/>' : '<line class="guide" x1="0" y1="' + f2(g.h) + '" x2="' + f2(p.w) + '" y2="' + f2(g.h) + '"/>';
    });
    sv.innerHTML = out;
  }
  function hitPath(o) {        // a wide invisible stroke so thin lines are easy to pick
    var d = o.t === 'ink' ? inkPath(o.pts) : 'M' + f2(o.x1) + ' ' + f2(o.y1) + 'L' + f2(o.x2) + ' ' + f2(o.y2);
    return '<path d="' + d + '" fill="none" stroke="transparent" stroke-width="' + f2(Math.max(10 / S.zoom, o.width + 6)) + '" stroke-linecap="round"/>';
  }
  function selObj() {
    if (!S.sel) return null;
    var p = S.pages[S.sel.page];
    return p && p.objs.filter(function (o) { return o.id === S.sel.id; })[0] || null;
  }
  /** every selected object (several with Shift+click, a drag box, or a group) */
  function selObjs() {
    if (!S.sel) return [];
    var p = S.pages[S.sel.page], ids = S.sel.ids || [S.sel.id];
    return p ? p.objs.filter(function (o) { return ids.indexOf(o.id) >= 0; }) : [];
  }
  function groupIds(page, id) {
    var p = S.pages[page], o = p && p.objs.filter(function (x) { return x.id === id; })[0];
    if (!o || !o.g) return [id];
    return p.objs.filter(function (x) { return x.g === o.g; }).map(function (x) { return x.id; });
  }
  function select(page, id, ids) {
    var old = S.sel;
    S.sel = id ? { page: page, id: id, ids: ids || groupIds(page, id) } : null;
    if (old && old.page !== page) drawOverlay(old.page);
    if (page !== null && page !== undefined) drawOverlay(page);
    syncButtons(); syncProps();
  }
  function unionBox(list) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    list.forEach(function (o) { var b = bbox(o); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  // new additions count as "solution" (hidden in the student copy) while the solution mode is on
  S.solMode = true;
  function born(o) { if (S.solMode) o.sol = true; return o; }

  // ------------------------------------------------------------ tools & pointer
  function setTool(t) {
    S.tool = t;
    Array.prototype.forEach.call(document.querySelectorAll('.tools [data-tool]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.tool === t)); });
    document.body.className = 'pdfapp tool-' + t + (S.preview ? ' preview' : '') + (t === 'textsel' ? ' textsel' : '');
    $('viewer').classList.toggle('hand', t === 'hand');
    if (t !== 'select' && S.sel) { var pg = S.sel.page; S.sel = null; drawOverlay(pg); }
    syncProps();
    if (window.PdfText) PdfText.onTool(t);
    document.dispatchEvent(new Event('pdf-tool'));
  }
  Array.prototype.forEach.call(document.querySelectorAll('#tools [data-tool]'), function (b) { b.onclick = function () { setTool(b.dataset.tool); }; });

  function ptOf(e, sv) {
    var m = sv.getScreenCTM().inverse(), pt = sv.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    var r = pt.matrixTransform(m); return [r.x, r.y];
  }
  function bindOverlays() {
    Array.prototype.forEach.call(document.querySelectorAll('.page svg.ov'), function (sv) {
      sv.addEventListener('pointerdown', onDown);
    });
  }
  var drag = null, lastDown = null;
  function onDown(e) {
    if (e.button !== 0) return;
    var sv = e.currentTarget, i = +sv.closest('.page').dataset.i, p = S.pages[i], pt = ptOf(e, sv);
    setCur(i);
    var hitEl = e.target.closest('[data-id]'), hitId = hitEl && hitEl.getAttribute('data-id');
    var t = S.tool, now = Date.now();
    // double click (detected here: the overlay is redrawn between the clicks)
    if (t === 'select' && lastDown && now - lastDown.t < 400 && lastDown.i === i && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6) {
      lastDown = null; onDbl({ currentTarget: sv, clientX: e.clientX, clientY: e.clientY }); return;
    }
    lastDown = { t: now, i: i, x: e.clientX, y: e.clientY };
    if (t === 'erase') {
      if (hitId) { push(); p.objs = p.objs.filter(function (o) { return o.id !== hitId || o.lock; }); drawOverlay(i); markThumb(i); }
      drag = { kind: 'erase', i: i, sv: sv };
    } else if (t === 'select') {
      var h = e.target.getAttribute('data-h');
      var inSel = hitId && S.sel && S.sel.page === i && (S.sel.ids || []).indexOf(hitId) >= 0;
      if (h && selObj()) { drag = { kind: selObj().t === 'shape' ? 'shapeh' : 'resize', i: i, sv: sv, h: h, start: pt, orig: JSON.parse(JSON.stringify(selObj())), pushed: false }; }
      else if (hitId && e.shiftKey) {
        // Shift+click: add to / remove from the selection (whole groups at once)
        var add = groupIds(i, hitId), ids = S.sel && S.sel.page === i ? (S.sel.ids || [S.sel.id]).slice() : [];
        var has = ids.indexOf(hitId) >= 0;
        ids = has ? ids.filter(function (x) { return add.indexOf(x) < 0; }) : ids.concat(add.filter(function (x) { return ids.indexOf(x) < 0; }));
        if (ids.length) select(i, has ? ids[0] : hitId, ids); else select(i, null);
        return;
      }
      else if (hitId) {
        if (!inSel) select(i, hitId);
        else S.sel.id = hitId;
        drag = { kind: 'move', i: i, sv: sv, start: pt, origs: selObjs().map(function (o) { return JSON.parse(JSON.stringify(o)); }), pushed: false };
      }
      else { select(i, null); drag = { kind: 'marquee', i: i, sv: sv, start: pt, cur: pt }; }
    } else if (t === 'note') {
      push();
      var nt = born({ id: uid(), t: 'note', x: pt[0] - 10, y: pt[1] - 10, text: '', color: '#ffd43b', author: S.opt.author || 'المعلم' });
      p.objs.push(nt); setTool('select'); select(i, nt.id); markThumb(i);
      e.preventDefault();
      setTimeout(function () { editNote(i, nt, true); }, 0);
      return;
    } else if (t === 'stamp') {
      if (window.PdfExt && PdfExt.placeStamp) PdfExt.placeStamp(i, pt);
      e.preventDefault();
      return;
    } else if (t === 'text') {
      if (hitId) { var ho = p.objs.filter(function (o) { return o.id === hitId; })[0]; if (ho && ho.t === 'text') { e.preventDefault(); setTimeout(function () { editText(i, ho); }, 0); return; } }
      push();
      var o = born({ id: uid(), t: 'text', x: pt[0] - 220, y: pt[1] - S.props.size * 0.9, w: 220, text: '', size: S.props.size, color: S.props.color === '#ffffff' ? '#1b2a30' : S.props.color, bold: S.props.bold, align: S.props.align, bg: S.props.bg, font: S.props.font, under: S.props.under || false, lh: S.props.lh || 1.5, list: '', border: S.props.border || '' });
      o.x = Math.max(4, o.x); o.h = textHeight(o);
      p.objs.push(o); drawOverlay(i);
      e.preventDefault();
      editText(i, o, true);
      return;
    } else if (t === 'pen' || t === 'hl') {
      drag = { kind: 'ink', i: i, sv: sv, o: born({ id: uid(), t: 'ink', pts: [pt], color: t === 'hl' ? (HL.indexOf(S.props.color) >= 0 ? S.props.color : HL[0]) : S.props.color, width: t === 'hl' ? Math.max(10, S.props.width * 4) : S.props.width, hl: t === 'hl' }) };
      push(); p.objs.push(drag.o);
    } else if (/^(rect|ellipse|line|arrow|white)$/.test(t)) {
      drag = { kind: 'shape', i: i, sv: sv, o: t === 'white' ? { id: uid(), t: t, x1: pt[0], y1: pt[1], x2: pt[0], y2: pt[1], color: S.props.color, width: S.props.width, fill: S.props.fill } : born({ id: uid(), t: t, x1: pt[0], y1: pt[1], x2: pt[0], y2: pt[1], color: S.props.color, width: S.props.width, fill: S.props.fill }) };
      push(); p.objs.push(drag.o);
    } else if (window.PdfAnnot && PdfAnnot.isTool(t)) {
      drag = { kind: 'annreg', i: i, sv: sv, start: pt, cur: pt, tool: t };
    } else if (t === 'shape' && window.PdfShapes) {
      var sd = PdfShapes.onToolDown(i, sv, pt, e);
      if (sd === 'poly') { e.preventDefault(); return; }
      if (!sd) return;
      drag = sd;
    } else if (t === 'snap' || t === 'crop' || t === 'clip') {
      drag = { kind: t === 'snap' ? 'snap' : t, i: i, sv: sv, start: pt, cur: pt };
    } else return;
    sv.setPointerCapture(e.pointerId);
    sv.onpointermove = onMove;
    sv.onpointerup = sv.onpointercancel = onUp;
    e.preventDefault();
  }
  function onMove(e) {
    if (!drag) return;
    var pt = ptOf(e, drag.sv), p = S.pages[drag.i];
    if (drag.kind === 'erase') {
      var hit = document.elementFromPoint(e.clientX, e.clientY), he = hit && hit.closest && hit.closest('[data-id]');
      if (he && drag.sv.contains(he)) { var id = he.getAttribute('data-id'); p.objs = p.objs.filter(function (o) { return o.id !== id || o.lock; }); drawOverlay(drag.i); markThumb(drag.i); }
      return;
    }
    if (drag.kind === 'ink') {
      var last = drag.o.pts[drag.o.pts.length - 1];
      if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 0.8 / S.zoom) drag.o.pts.push([Math.round(pt[0] * 100) / 100, Math.round(pt[1] * 100) / 100]);
    } else if (drag.kind === 'shape') {
      var x2 = pt[0], y2 = pt[1];
      if (e.shiftKey && (drag.o.t === 'line' || drag.o.t === 'arrow')) {   // snap to 15°
        var a = Math.atan2(y2 - drag.o.y1, x2 - drag.o.x1), L = Math.hypot(x2 - drag.o.x1, y2 - drag.o.y1); a = Math.round(a / (Math.PI / 12)) * Math.PI / 12;
        x2 = drag.o.x1 + L * Math.cos(a); y2 = drag.o.y1 + L * Math.sin(a);
      } else if (e.shiftKey) { var s = Math.max(Math.abs(x2 - drag.o.x1), Math.abs(y2 - drag.o.y1)); x2 = drag.o.x1 + Math.sign(x2 - drag.o.x1) * s; y2 = drag.o.y1 + Math.sign(y2 - drag.o.y1) * s; }
      drag.o.x2 = x2; drag.o.y2 = y2;
    } else if (drag.kind === 'move') {
      var list = selObjs(); if (!list.length) return;
      if (list.some(function (o) { return o.lock; })) { if (!drag.warned) { drag.warned = true; toast('العنصر مقفل — افتح القفل من الشريط لتحريكه'); } return; }
      var dx = pt[0] - drag.start[0], dy = pt[1] - drag.start[1];
      if (!drag.pushed) {
        if (Math.hypot(dx, dy) < 1.5 / S.zoom) return;            // a click is not a move
        var byId = {}; drag.origs.forEach(function (g) { byId[g.id] = g; });
        S.undo.push(JSON.stringify(S.pages.map(function (pg, k) { return k === drag.i ? Object.assign({}, pg, { objs: pg.objs.map(function (x) { return byId[x.id] || x; }) }) : pg; }))); S.redo = []; drag.pushed = true;
      }
      var sn = e.altKey ? { dx: dx, dy: dy, lines: [] } : snapMove(drag.i, drag.origs, dx, dy);
      guides = sn.lines.length ? { i: drag.i, lines: sn.lines } : null;
      drag.origs.forEach(function (g) { var o = list.filter(function (x) { return x.id === g.id; })[0]; if (o) moveObj(o, g, sn.dx, sn.dy); });
    } else if (drag.kind === 'shapedraw') {
      PdfShapes.dragDraw(drag, pt, e);
    } else if (drag.kind === 'shapeh') {
      var so = selObj(); if (!so || so.lock) return;
      if (!drag.pushed) { S.undo.push(JSON.stringify(S.pages.map(function (pg, k) { return k === drag.i ? Object.assign({}, pg, { objs: pg.objs.map(function (x) { return x.id === so.id ? drag.orig : x; }) }) : pg; }))); S.redo = []; drag.pushed = true; }
      PdfShapes.dragHandle(drag, so, pt, e);
    } else if (drag.kind === 'resize') {
      var o = selObj(); if (!o || o.lock) return;
      if (!drag.pushed) { S.undo.push(JSON.stringify(S.pages.map(function (pg, k) { return k === drag.i ? Object.assign({}, pg, { objs: pg.objs.map(function (x) { return x.id === o.id ? drag.orig : x; }) }) : pg; }))); S.redo = []; drag.pushed = true; }
      resizeObj(o, drag.orig, drag.h, pt[0] - drag.start[0], pt[1] - drag.start[1], e.shiftKey);
    } else if (drag.kind === 'marquee') {
      drag.cur = pt;
      var mr = drag.sv.querySelector('.snaprect');
      if (!mr) { mr = document.createElementNS(SVGNS, 'rect'); mr.setAttribute('class', 'snaprect marq'); drag.sv.appendChild(mr); }
      mr.setAttribute('x', Math.min(drag.start[0], pt[0])); mr.setAttribute('y', Math.min(drag.start[1], pt[1]));
      mr.setAttribute('width', Math.abs(pt[0] - drag.start[0])); mr.setAttribute('height', Math.abs(pt[1] - drag.start[1]));
      return;
    } else if (drag.kind === 'snap' || drag.kind === 'crop' || drag.kind === 'clip' || drag.kind === 'annreg') {
      drag.cur = pt;
      var sv = drag.sv, r = sv.querySelector('.snaprect');
      if (!r) { r = document.createElementNS(SVGNS, 'rect'); r.setAttribute('class', 'snaprect'); sv.appendChild(r); }
      var x = Math.min(drag.start[0], pt[0]), y = Math.min(drag.start[1], pt[1]);
      r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', Math.abs(pt[0] - drag.start[0])); r.setAttribute('height', Math.abs(pt[1] - drag.start[1]));
      return;
    }
    drawOverlay(drag.i);
  }
  function onUp(e) {
    var d = drag; drag = null;
    if (!d) return;
    d.sv.onpointermove = d.sv.onpointerup = d.sv.onpointercancel = null;
    var p = S.pages[d.i];
    if (d.kind === 'shape') {
      var b = norm(d.o);
      if (b.w < 2 && b.h < 2 && !/line|arrow/.test(d.o.t) || (/line|arrow/.test(d.o.t) && Math.hypot(d.o.x2 - d.o.x1, d.o.y2 - d.o.y1) < 3)) { p.objs.pop(); S.undo.pop(); }
      else { if (d.o.t !== 'line' && d.o.t !== 'arrow') { d.o.x = b.x; d.o.y = b.y; d.o.w = b.w; d.o.h = b.h; delete d.o.x1; delete d.o.y1; delete d.o.x2; delete d.o.y2; } changed(); }
      drawOverlay(d.i); markThumb(d.i);
    } else if (d.kind === 'ink') { d.o.pts = simplify(d.o.pts, 0.35 / Math.max(0.5, S.zoom)); changed(); drawOverlay(d.i); markThumb(d.i); }
    else if (d.kind === 'shapedraw') { PdfShapes.endDraw(d); }
    else if (d.kind === 'move' || d.kind === 'resize' || d.kind === 'shapeh') { guides = null; if (d.pushed) changed(); drawOverlay(d.i); }
    else if (d.kind === 'marquee') {
      var mq = d.sv.querySelector('.snaprect'); if (mq) mq.remove();
      var bx = { x: Math.min(d.start[0], d.cur[0]), y: Math.min(d.start[1], d.cur[1]), w: Math.abs(d.cur[0] - d.start[0]), h: Math.abs(d.cur[1] - d.start[1]) };
      if (bx.w < 3 && bx.h < 3) return;
      var got = [];
      p.objs.forEach(function (o) {
        if (o.lock || (S.preview && o.sol)) return;
        var b = bbox(o);
        if (b.x < bx.x + bx.w && b.x + b.w > bx.x && b.y < bx.y + bx.h && b.y + b.h > bx.y) groupIds(d.i, o.id).forEach(function (x) { if (got.indexOf(x) < 0) got.push(x); });
      });
      if (got.length) select(d.i, got[0], got);
    }
    else if (d.kind === 'erase') { changed(); }
    else if (d.kind === 'annreg') {
      var ar = d.sv.querySelector('.snaprect'); if (ar) ar.remove();
      PdfAnnot.region(d.tool, d.i, { x: Math.min(d.start[0], d.cur[0]), y: Math.min(d.start[1], d.cur[1]), w: Math.abs(d.cur[0] - d.start[0]), h: Math.abs(d.cur[1] - d.start[1]) });
    }
    else if (d.kind === 'snap' || d.kind === 'crop' || d.kind === 'clip') {
      var x = Math.min(d.start[0], d.cur[0]), y = Math.min(d.start[1], d.cur[1]), w = Math.abs(d.cur[0] - d.start[0]), h = Math.abs(d.cur[1] - d.start[1]);
      var r = d.sv.querySelector('.snaprect'); if (r) r.remove();
      var reg = { x: x, y: y, w: w, h: h };
      if (d.kind === 'crop') finishCrop(d.i, reg);
      else if (d.kind === 'clip') { if (w > 8 && h > 8 && window.PdfExt) PdfExt.addClip(d.i, reg); }
      else if (w > 4 && h > 4) snapshotRegion(d.i, reg, e);
    }
  }
  // smart guides: while moving, edges and centres snap to the page and to the other objects
  var guides = null;
  function snapMove(i, origs, dx, dy) {
    var p = S.pages[i], ids = origs.map(function (g) { return g.id; }), b = unionBox(origs), tol = 5 / S.zoom;
    var c = cropOf(p), xs = [c.x, c.x + c.w / 2, c.x + c.w], ys = [c.y, c.y + c.h / 2, c.y + c.h];
    p.objs.forEach(function (o) { if (ids.indexOf(o.id) >= 0 || o.t === 'ink') return; var q = bbox(o); xs.push(q.x, q.x + q.w / 2, q.x + q.w); ys.push(q.y, q.y + q.h / 2, q.y + q.h); });
    var mine = function (v, w) { return [v, v + w / 2, v + w]; };
    var best = function (cand, targets) {
      var r = null;
      cand.forEach(function (v) { targets.forEach(function (t) { var d = t - v; if (Math.abs(d) <= tol && (!r || Math.abs(d) < Math.abs(r.d))) r = { d: d, at: t }; }); });
      return r;
    };
    var bx = best(mine(b.x + dx, b.w), xs), by = best(mine(b.y + dy, b.h), ys), lines = [];
    if (bx) { dx += bx.d; lines.push({ v: bx.at }); }
    if (by) { dy += by.d; lines.push({ h: by.at }); }
    if (S.opt.grid && S.opt.gridSnap !== false) {
      var gs = S.opt.gridStep || 10;
      if (!bx) dx += Math.round((b.x + dx) / gs) * gs - (b.x + dx);
      if (!by) dy += Math.round((b.y + dy) / gs) * gs - (b.y + dy);
    }
    return { dx: dx, dy: dy, lines: lines };
  }
  function moveObj(o, g, dx, dy) {
    if (o.t === 'shape' && window.PdfShapes) { PdfShapes.move(o, g, dx, dy); return; }
    if (o.t === 'mark' && window.PdfAnnot) { PdfAnnot.move(o, g, dx, dy); return; }
    if (o.t === 'ink') { o.pts = g.pts.map(function (p) { return [p[0] + dx, p[1] + dy]; }); return; }
    if (o.x1 !== undefined) { o.x1 = g.x1 + dx; o.y1 = g.y1 + dy; o.x2 = g.x2 + dx; o.y2 = g.y2 + dy; return; }
    o.x = g.x + dx; o.y = g.y + dy;
  }
  function resizeObj(o, g, h, dx, dy, free) {
    if (o.x1 !== undefined) { if (/e|s/.test(h) && h !== 'nw') { o.x2 = g.x2 + dx; o.y2 = g.y2 + dy; } else { o.x1 = g.x1 + dx; o.y1 = g.y1 + dy; } return; }
    var x0 = g.x, y0 = g.y, x1 = g.x + g.w, y1 = g.y + g.h;
    if (/w/.test(h)) x0 += dx; else x1 += dx;
    if (/n/.test(h)) y0 += dy; else y1 += dy;
    var w = Math.max(8, x1 - x0), hh = Math.max(8, y1 - y0);
    var keep = (o.t === 'svg' || o.t === 'image') && !free;
    if (keep) { var k = Math.max(w / g.w, hh / g.h); w = g.w * k; hh = g.h * k; }
    o.w = w; o.x = /w/.test(h) ? g.x + g.w - w : g.x;
    if (o.t === 'text') { o.h = textHeight(o); o.y = g.y; return; }
    o.h = hh; o.y = /n/.test(h) ? g.y + g.h - hh : g.y;
  }
  function onDbl(e) {
    // pointer capture during the first click makes the svg itself the target: find the object under the point
    var sv = e.currentTarget, i = +sv.closest('.page').dataset.i, pt = ptOf(e, sv), o = null;
    var objs = S.pages[i].objs;
    for (var k = objs.length - 1; k >= 0 && !o; k--) { var b = bbox(objs[k]); if (pt[0] >= b.x - 3 && pt[0] <= b.x + b.w + 3 && pt[1] >= b.y - 3 && pt[1] <= b.y + b.h + 3) o = objs[k]; }
    if (!o) return;
    if (o.lock) return toast('العنصر مقفل — افتح القفل من الشريط لتعديله');
    if (o.t === 'text') editText(i, o);
    else if (o.t === 'shape' && window.PdfShapes) PdfShapes.dbl(i, o, pt);
    else if (/^(link|field|redact|mark)$/.test(o.t) && window.PdfAnnot) PdfAnnot.dbl(i, o);
    else if (o.t === 'svg' && o.kind !== 'stamp') editSvgObj(i, o);
    else if (o.t === 'note') editNote(i, o);
  }

  // text editing in place
  function editText(i, o, isNew) {
    select(i, o.id);
    var el = pinOf(i), s = scale();
    var ta = document.createElement('textarea');
    ta.className = 'tedit'; ta.dir = 'auto'; ta.value = o.text;
    ta.style.left = (o.x * s) + 'px'; ta.style.top = (o.y * s) + 'px'; ta.style.width = (o.w * s) + 'px';
    ta.style.fontSize = (o.size * s) + 'px'; ta.style.fontWeight = o.bold ? '700' : '400'; ta.style.color = o.color;
    ta.style.fontFamily = famOf(o); ta.style.fontStyle = o.italic ? 'italic' : 'normal'; ta.style.lineHeight = String(+o.lh || 1.5);
    ta.style.textAlign = o.align;
    var fit = function () { ta.style.height = '0px'; ta.style.height = Math.max(lhOf(o) * 1.05 * s, ta.scrollHeight) + 'px'; };
    el.appendChild(ta); fit(); ta.focus();
    if (!isNew) push();
    var hidden = o.text; o.text = ''; drawOverlay(i); o.text = hidden;
    ta.oninput = fit;
    var done = false;
    var commit = function () {
      if (done) return; done = true;
      o.text = ta.value.replace(/\s+$/, '');
      ta.remove();
      var p = S.pages[i];
      if (!o.text.trim()) { p.objs = p.objs.filter(function (x) { return x !== o; }); if (isNew) S.undo.pop(); }
      else o.h = textHeight(o);
      changed(); drawOverlay(i); markThumb(i);
    };
    ta.onblur = commit;
    ta.onkeydown = function (e) { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); ta.blur(); } e.stopPropagation(); };
  }

  function editNote(i, o, isNew) {
    var colors = ['#ffd43b', '#8ce99a', '#74c0fc', '#ffa8a8', '#e599f7'];
    PdfUI.open({
      title: 'ملاحظة لاصقة',
      body: '<textarea id="nt" rows="5" dir="auto" placeholder="اكتب الملاحظة… تظهر عند المرور عليها، وتُحفظ في ملف PDF تعليقاً (Comment) يُقرأ في Acrobat وأي قارئ">' + esc(o.text || '') + '</textarea>' +
        '<div class="fld row"><span>اللون</span><span class="sw">' + colors.map(function (c) { return '<label><input type="radio" name="nc" value="' + c + '"' + (c === (o.color || colors[0]) ? ' checked' : '') + '><i style="background:' + c + '"></i></label>'; }).join('') + '</span></div>' +
        '<label class="fld row"><span>الكاتب</span><input id="na" value="' + esc(o.author || S.opt.author || 'المعلم') + '"></label>' +
        '<label class="chk"><input type="checkbox" id="ns"' + (o.show ? ' checked' : '') + '> إظهار النص مطبوعاً على الصفحة أيضاً</label>',
      ok: 'حفظ', extra: isNew ? '' : '<button type="button" class="btn ghost danger" data-a="del">حذف الملاحظة</button>',
      onOpen: function (el, close) {
        var d = el.parentNode.querySelector('[data-a=del]');
        if (d) d.onclick = function () { close(null); push(); S.pages[i].objs = S.pages[i].objs.filter(function (x) { return x !== o; }); S.sel = null; drawOverlay(i); markThumb(i); syncButtons(); };
      }
    }).then(function (el) {
      var p = S.pages[i];
      if (!el) { if (isNew && !o.text) { p.objs = p.objs.filter(function (x) { return x !== o; }); S.undo.pop(); S.sel = null; drawOverlay(i); markThumb(i); } return; }
      if (!isNew) push();
      o.text = PdfUI.val(el, '#nt').trim(); o.color = PdfUI.radio(el, 'nc') || o.color; o.show = PdfUI.val(el, '#ns');
      o.author = PdfUI.val(el, '#na').trim() || 'المعلم'; S.opt.author = o.author; saveOpt();
      if (!o.text && isNew) { p.objs = p.objs.filter(function (x) { return x !== o; }); S.undo.pop(); S.sel = null; }
      changed(); drawOverlay(i); markThumb(i);
    });
  }

  // ------------------------------------------------------------ properties bar
  (function buildSwatches() {
    var box = $('swatches');
    COLORS.concat(HL).forEach(function (c) {
      var b = document.createElement('button'); b.style.background = c; b.title = c; b.dataset.c = c;
      b.onclick = function () { setProp('color', c); };
      box.appendChild(b);
    });
  })();
  function setProp(k, v) {
    S.props[k] = v;
    var list = selObjs();
    if (list.length) {
      push();
      list.forEach(function (o) {
        if (o.lock) return;
        if (k === 'color' && o.t !== 'svg' && o.t !== 'image' && o.t !== 'white') o.color = v;
        if (k === 'color' && o.t === 'svg' && o.kind === 'eq') o.ink = v === '#ffffff' ? o.ink : v;
        if (k === 'lookBg' && o.t === 'svg') { if (v) o.bg = v; else delete o.bg; }
        if (k === 'ink' && o.t === 'svg') { if (v) o.ink = v; else delete o.ink; }
        if (k === 'width' && o.width !== undefined) o.width = +v;
        if (o.t === 'text' && /^(size|bold|align|bg|font|italic|under|lh|list|border)$/.test(k)) { o[k] = k === 'size' || k === 'lh' ? +v : v; o.h = textHeight(o); }
        if (k === 'fill' && (o.t === 'rect' || o.t === 'ellipse')) o.fill = v;
      });
      drawOverlay(S.sel.page);
    }
    syncProps();
  }
  function syncProps() {
    var o = selObj(), P = S.props;
    var src = o || P;
    Array.prototype.forEach.call($('swatches').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.c === (src.color || P.color))); });
    $('colorInp').value = /^#[0-9a-f]{6}$/i.test(src.color || P.color) ? (src.color || P.color) : '#000000';
    $('widthInp').value = String(src.width || P.width);
    $('sizeInp').value = String(src.size || P.size);
    $('boldInp').setAttribute('aria-pressed', String(!!(o && o.t === 'text' ? o.bold : P.bold)));
    $('alignInp').value = (o && o.align) || P.align;
    $('bgInp').value = (o && o.bg) || P.bg;
    $('fillInp').value = (o && o.fill) || P.fill;
    var t = o ? (o.t === 'white' ? 'white' : o.t) : S.tool, many = selObjs();
    var show = { width: /pen|hl|ink|rect|ellipse|line|arrow/.test(t), size: /text/.test(t), fill: /rect|ellipse/.test(t), look: t === 'svg', ink: !!(o && o.t === 'svg' && o.kind === 'eq' && o.ink), arr: many.length > 0, note: t === 'note' };
    $('fontInp').value = (o && o.font) || P.font || 'Amiri';
    $('italInp').setAttribute('aria-pressed', String(!!(o && o.t === 'text' ? o.italic : P.italic)));
    $('underInp').setAttribute('aria-pressed', String(!!(o && o.t === 'text' ? o.under : P.under)));
    $('lhInp').value = String((o && o.lh) || P.lh || 1.5);
    $('listInp').value = (o && o.list) || '';
    $('borderInp').value = (o && o.border) || '';
    $('lockBtn').textContent = many.length && many.every(function (x) { return x.lock; }) ? '🔓 فتح القفل' : '🔒 قفل';
    $('solBtn').setAttribute('aria-pressed', String(many.length > 0 && many.every(function (x) { return x.sol; })));
    $('selInfo').textContent = many.length > 1 ? many.length + ' عناصر' : '';
    if (o && o.t === 'svg') {
      var lb = o.bg || '', known = Array.prototype.some.call($('lookBgInp').options, function (op) { return op.value === lb; });
      $('lookBgInp').value = known ? lb : 'custom';
      if (o.kind === 'eq' && o.ink) Array.prototype.forEach.call($('swatches').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.c === o.ink)); });
    }
    Array.prototype.forEach.call(document.querySelectorAll('.props [data-for]'), function (el) { el.style.display = show[el.dataset.for] ? '' : 'none'; });
    if (window.PdfShapes) PdfShapes.sync();
  }
  $('colorInp').oninput = function () { setProp('color', this.value); };
  $('widthInp').onchange = function () { setProp('width', +this.value); };
  $('sizeInp').onchange = function () { setProp('size', +this.value); };
  $('boldInp').onclick = function () { setProp('bold', !(this.getAttribute('aria-pressed') === 'true')); };
  $('alignInp').onchange = function () { setProp('align', this.value); };
  $('bgInp').onchange = function () { setProp('bg', this.value); };
  $('fillInp').onchange = function () { setProp('fill', this.value); };
  $('fontInp').onchange = function () { setProp('font', this.value); };
  $('italInp').onclick = function () { setProp('italic', !(this.getAttribute('aria-pressed') === 'true')); };
  $('underInp').onclick = function () { setProp('under', !(this.getAttribute('aria-pressed') === 'true')); };
  $('lhInp').onchange = function () { setProp('lh', +this.value); };
  $('listInp').onchange = function () { setProp('list', this.value); };
  $('borderInp').onchange = function () { setProp('border', this.value); };
  $('noteEdit').onclick = function () { var o = selObj(); if (o && o.t === 'note') editNote(S.sel.page, o); };
  $('lockBtn').onclick = function () { var l = selObjs(); lockSel(!(l.length && l.every(function (x) { return x.lock; }))); };
  $('solBtn').onclick = toggleSol;
  $('arrBtn').onclick = function () { popAt($('arrPop'), this); };
  Array.prototype.forEach.call(document.querySelectorAll('#arrPop [data-ar]'), function (b) {
    b.onclick = function () {
      $('arrPop').hidden = true;
      var a = b.dataset.ar;
      if (/^(right|left|hcenter|top|bottom|vcenter)$/.test(a)) alignSel(a);
      else if (a === 'dh' || a === 'dv') distributeSel(a === 'dh' ? 'h' : 'v');
      else if (a === 'group') groupSel(true); else if (a === 'ungroup') groupSel(false);
      else if (a === 'front') orderSel(true); else if (a === 'back') orderSel(false);
    };
  });
  $('lookBgInp').onchange = function () { setProp('lookBg', this.value === 'custom' ? $('colorInp').value : this.value); };
  $('inkReset').onclick = function () { setProp('ink', ''); };
  // settings: background / ink for every equation and figure (existing ones + the default for new ones)
  $('setBtn').onclick = function () { popAt($('setPop'), this); };
  function applyAll(key, v) {
    if (S.pdf) {
      push();
      S.pages.forEach(function (p) { p.objs.forEach(function (o) {
        if (o.t !== 'svg') return;
        if (key === 'bg') { if (v) o.bg = v; else delete o.bg; }
        if (key === 'ink' && o.kind === 'eq') { if (v) o.ink = v; else delete o.ink; }
      }); });
      S.pages.forEach(function (p, i) { drawOverlay(i); markThumb(i); });
      syncProps();
    }
    if (key === 'bg') S.opt.figBg = v; else S.opt.ink = v;
    saveOpt();
  }
  Array.prototype.forEach.call(document.querySelectorAll('#setPop [data-fb]'), function (b) {
    b.onclick = function () { $('setPop').hidden = true; applyAll('bg', b.dataset.fb); toast(b.dataset.fb === 'none' ? 'أُزيلت الخلفية من كل المعادلات والرسوم' : b.dataset.fb ? 'صارت خلفية الكل بيضاء' : 'عادت الخلفيات كما رُسمت'); };
  });
  Array.prototype.forEach.call(document.querySelectorAll('#setPop [data-ink]'), function (b) {
    b.onclick = function () {
      $('setPop').hidden = true;
      var c = b.dataset.ink === 'pick' ? S.props.color : '';
      if (c === '#ffffff') return toast('اختر لوناً غير الأبيض أولاً');
      applyAll('ink', c); toast(c ? 'تغيّر لون كل المعادلات' : 'عادت المعادلات للونها الأصلي');
    };
  });
  function deleteSel() {
    var list = selObjs(); if (!list.length) return;
    var free = list.filter(function (o) { return !o.lock; });
    if (!free.length) return toast('العنصر مقفل — افتح القفل أولاً');
    push(); var i = S.sel.page, ids = free.map(function (o) { return o.id; });
    S.pages[i].objs = S.pages[i].objs.filter(function (x) { return ids.indexOf(x.id) < 0; });
    S.sel = null; drawOverlay(i); markThumb(i); syncButtons(); syncProps();
    if (free.length < list.length) toast('لم تُحذف العناصر المقفلة');
  }
  function cloneObjs(list, dx, dy) {
    var gmap = {};
    return list.map(function (o) {
      var c = JSON.parse(JSON.stringify(o)); c.id = uid(); delete c.lock;
      if (c.g) c.g = gmap[c.g] || (gmap[c.g] = 'g' + uid());
      moveObj(c, JSON.parse(JSON.stringify(c)), dx, dy);
      return c;
    });
  }
  function duplicateSel() {
    var list = selObjs(); if (!list.length) return;
    push(); var cs = cloneObjs(list, 12, 12);
    Array.prototype.push.apply(S.pages[S.sel.page].objs, cs);
    select(S.sel.page, cs[0].id, cs.map(function (c) { return c.id; }));
  }
  // ---- arrange: align, distribute, group, lock, order
  function alignSel(how) {
    var list = selObjs().filter(function (o) { return !o.lock; }); if (!list.length) return;
    var p = S.pages[S.sel.page], ref = list.length > 1 ? unionBox(list) : cropOf(p);
    push();
    list.forEach(function (o) {
      var b = bbox(o), dx = 0, dy = 0;
      if (how === 'right') dx = ref.x + ref.w - (b.x + b.w);
      if (how === 'left') dx = ref.x - b.x;
      if (how === 'hcenter') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
      if (how === 'top') dy = ref.y - b.y;
      if (how === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
      if (how === 'vcenter') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
      moveObj(o, JSON.parse(JSON.stringify(o)), dx, dy);
    });
    drawOverlay(S.sel.page); changed();
  }
  function distributeSel(axis) {
    var list = selObjs().filter(function (o) { return !o.lock; });
    if (list.length < 3) return toast('حدّد ثلاثة عناصر أو أكثر للتوزيع بالتساوي');
    var key = axis === 'h' ? 'x' : 'y', size = axis === 'h' ? 'w' : 'h';
    var items = list.map(function (o) { return { o: o, b: bbox(o) }; }).sort(function (a, b) { return a.b[key] - b.b[key]; });
    var first = items[0].b, last = items[items.length - 1].b;
    var total = items.reduce(function (s, it) { return s + it.b[size]; }, 0), gap = (last[key] + last[size] - first[key] - total) / (items.length - 1);
    push();
    var cur = first[key];
    items.forEach(function (it) {
      var d = cur - it.b[key];
      moveObj(it.o, JSON.parse(JSON.stringify(it.o)), axis === 'h' ? d : 0, axis === 'h' ? 0 : d);
      cur += it.b[size] + gap;
    });
    drawOverlay(S.sel.page); changed();
  }
  function groupSel(on) {
    var list = selObjs(); if (!list.length) return;
    if (on && list.length < 2) return toast('حدّد عنصرين أو أكثر (Shift + نقر، أو اسحب مربعاً حولها)');
    push();
    var g = 'g' + uid();
    list.forEach(function (o) { if (on) o.g = g; else delete o.g; });
    select(S.sel.page, S.sel.id, list.map(function (o) { return o.id; }));
    changed(); toast(on ? 'تم التجميع — تتحرك معاً وتُحدَّد بنقرة واحدة' : 'تم فك التجميع');
  }
  function lockSel(on) {
    var list = selObjs(); if (!list.length) return;
    push(); list.forEach(function (o) { if (on) o.lock = true; else delete o.lock; });
    drawOverlay(S.sel.page); syncProps(); changed();
    toast(on ? 'قُفل — لا يتحرك ولا يُحذف بالخطأ' : 'فُتح القفل');
  }
  function orderSel(front) {
    var list = selObjs(); if (!list.length) return;
    var p = S.pages[S.sel.page], rest = p.objs.filter(function (o) { return list.indexOf(o) < 0; });
    push(); p.objs = front ? rest.concat(list) : list.concat(rest);
    drawOverlay(S.sel.page); changed();
  }
  function toggleSol() {
    var list = selObjs(); if (!list.length) return;
    var on = !list.every(function (o) { return o.sol; });
    push(); list.forEach(function (o) { if (on) o.sol = true; else delete o.sol; });
    syncProps(); changed();
    toast(on ? 'عُلّم كحل — يُحذف من نسخة الطالب' : 'لم يعد حلاً — يظهر في نسخة الطالب أيضاً');
  }
  $('delBtn').onclick = deleteSel;
  $('dupBtn').onclick = duplicateSel;
  $('copyImgBtn').onclick = function () {
    var list = selObjs(); if (!list.length) return;
    var b = unionBox(list), m = 4;
    snapshotRegion(S.sel.page, { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m }, null, true);
  };

  // ------------------------------------------------------------ snapshot (crop → image)
  function pageBitmap(i, sc) {
    var p = S.pages[i], cv = document.createElement('canvas');
    cv.width = Math.round(p.w * sc); cv.height = Math.round(p.h * sc);
    var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
    if (p.src < 0) return drawBgImage(i, cx, sc).then(function () { return cv; });
    return loadSrc(p).then(function (pg) {
      return pg.render({ canvasContext: cx, viewport: pg.getViewport({ scale: sc, rotation: (pg.rotate + p.rot) % 360 }) }).promise;
    }).then(function () { return drawBgImage(i, cx, sc); }).then(function () { return cv; });
  }
  function overlayImage(i, objsOnly) {
    var p = S.pages[i], list = (objsOnly || p.objs).filter(function (o) { return !(S.preview && o.sol) && !o.hide && o.t !== 'note'; });
    if (!list.length) return Promise.resolve(null);
    var svg = '<svg xmlns="' + SVGNS + '" width="' + f2(p.w) + '" height="' + f2(p.h) + '" viewBox="0 0 ' + f2(p.w) + ' ' + f2(p.h) + '">' + list.map(function (o) { return objInner(o, true); }).join('') + '</svg>';
    // texts become outlines first so the picture never depends on fonts
    var hasText = list.some(function (o) { return o.t === 'text'; });
    return (hasText ? Vector.fromSVG(svg).catch(function () { return svg; }) : Promise.resolve(svg)).then(function (s) {
      return new Promise(function (res) {
        var img = new Image();
        img.onload = function () { res(img); }; img.onerror = function () { res(null); };
        img.src = 'data:image/svg+xml;base64,' + Vector.toBase64(s);
      });
    });
  }
  // template / numbers / watermark painted onto a bitmap (snapshots, compressed export)
  function drawBgImage(i, cx, sc, forExport) {
    var p = S.pages[i], inner = window.PdfDecor ? PdfDecor.page(p, i, S, !!forExport) : '';
    if (!inner) return Promise.resolve();
    var svg = '<svg xmlns="' + SVGNS + '" width="' + f2(p.w) + '" height="' + f2(p.h) + '" viewBox="0 0 ' + f2(p.w) + ' ' + f2(p.h) + '">' + inner + '</svg>';
    return Vector.fromSVG(svg).catch(function () { return svg; }).then(function (s) {
      return new Promise(function (res) {
        var img = new Image();
        img.onload = function () { cx.drawImage(img, 0, 0, p.w * sc, p.h * sc); res(); }; img.onerror = function () { res(); };
        img.src = 'data:image/svg+xml;base64,' + Vector.toBase64(s);
      });
    });
  }
  /** a region of a page as a PNG: { blob, url, w, h }. opts: { adds: include additions (default true), objs: only these, sc } */
  function regionImage(i, r, opts) {
    opts = opts || {};
    var sc = opts.sc || 3.2, withPage = !opts.objs, adds = opts.adds !== false;
    return Promise.all([withPage ? pageBitmap(i, sc) : Promise.resolve(null), adds ? overlayImage(i, opts.objs || null) : Promise.resolve(null)]).then(function (res) {
      var cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(r.w * sc)); cv.height = Math.max(1, Math.round(r.h * sc));
      var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
      if (res[0]) { cx.drawImage(res[0], -r.x * sc, -r.y * sc); res[0].width = res[0].height = 0; }
      if (res[1]) cx.drawImage(res[1], -r.x * sc, -r.y * sc, S.pages[i].w * sc, S.pages[i].h * sc);
      return new Promise(function (ok) { cv.toBlob(function (b) { ok({ blob: b, url: cv.toDataURL('image/png'), w: r.w, h: r.h }); cv.width = cv.height = 0; }, 'image/png'); });
    });
  }
  var lastSnap = null;
  function snapshotRegion(i, r, ev, objectOnly) {
    var sc = 3.2;           // ≈ 230 dpi
    busy(true, 'جارٍ تجهيز الصورة…');
    var ol = objectOnly ? selObjs() : null;
    Promise.all([objectOnly ? Promise.resolve(null) : pageBitmap(i, sc), overlayImage(i, ol && ol.length ? ol : null)]).then(function (res) {
      var cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(r.w * sc)); cv.height = Math.max(1, Math.round(r.h * sc));
      var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
      if (res[0]) cx.drawImage(res[0], -r.x * sc, -r.y * sc);
      if (res[1]) cx.drawImage(res[1], -r.x * sc, -r.y * sc, S.pages[i].w * sc, S.pages[i].h * sc);
      return new Promise(function (ok) { cv.toBlob(function (b) { ok({ blob: b, url: cv.toDataURL('image/png'), w: r.w, h: r.h }); }, 'image/png'); });
    }).then(function (snap) {
      lastSnap = snap; busy(false);
      copyBlob(snap.blob).then(function () { toast('تم نسخ الصورة — الصقها في تطبيقك (Ctrl+V)'); }, function () { toast('لم يسمح المتصفح بالنسخ — استخدم «حفظ PNG»', true); });
      if (!objectOnly) {
        var pop = $('snapPop'); pop.hidden = false;
        var x = ev ? ev.clientX : window.innerWidth / 2, y = ev ? ev.clientY : 120;
        pop.style.left = Math.max(6, Math.min(window.innerWidth - 240, x - 110)) + 'px'; pop.style.top = Math.min(window.innerHeight - 160, y + 10) + 'px';
      }
    }).catch(function (e) { busy(false); toast('تعذّرت اللقطة: ' + e.message, true); });
  }
  Array.prototype.forEach.call(document.querySelectorAll('#snapPop [data-sn]'), function (b) {
    b.onclick = function () {
      $('snapPop').hidden = true;
      if (!lastSnap) return;
      if (b.dataset.sn === 'copy') copyBlob(lastSnap.blob).then(function () { toast('تم النسخ'); }, function () { toast('تعذّر النسخ', true); });
      if (b.dataset.sn === 'save') download((S.name.replace(/\.pdf$/i, '') || 'لقطة') + '-لقطة.png', lastSnap.blob);
      if (b.dataset.sn === 'place') addImageObj(lastSnap.url, lastSnap.w, lastSnap.h);
    };
  });

  // ------------------------------------------------------------ images
  function addImageObj(dataUrl, wPt, hPt) {
    if (!S.pages.length) return;
    var i = S.cur, p = S.pages[i], id = uid();
    var k = Math.min(1, (p.w * 0.8) / wPt, (p.h * 0.6) / hPt);
    push(); setAsset(id, dataUrl);
    var o = born({ id: uid(), t: 'image', asset: id, x: (p.w - wPt * k) / 2, y: freeY(i, hPt * k), w: wPt * k, h: hPt * k });
    p.objs.push(o); setTool('select'); select(i, o.id); markThumb(i);
  }
  // under what is already on the page (solutions pile up downwards), else at the visible top
  function freeY(i, h) {
    var p = S.pages[i], top = visibleTop(i), low = 0;
    p.objs.forEach(function (o) { var b = bbox(o); low = Math.max(low, b.y + b.h); });
    var y = Math.max(top, low ? low + 14 : 30);
    return y + h > p.h - 10 ? Math.min(top, Math.max(10, p.h - h - 10)) : y;
  }
  function visibleTop(i) {       // y (pt) of the visible top of page i, so new things appear on screen
    var el = pageEl(i), v = $('viewer');
    return Math.max(20 + cropOf(S.pages[i]).y, (v.scrollTop - el.offsetTop) / scale() + cropOf(S.pages[i]).y + 40);
  }
  function loadImageFile(file) {
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        // re-encode to PNG/JPEG (the formats a PDF can hold)
        var cv = document.createElement('canvas'), mx = 2400, k = Math.min(1, mx / Math.max(img.width, img.height));
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
        var jpg = /jpe?g/i.test(file.type);
        addImageObj(cv.toDataURL(jpg ? 'image/jpeg' : 'image/png', 0.92), img.width * 0.75 * Math.min(1, 600 / img.width), img.height * 0.75 * Math.min(1, 600 / img.width));
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  }
  $('imgBtn').onclick = function () { if (!S.pdf) return toast('افتح ملف PDF أولاً'); $('imgInp').click(); };
  $('imgInp').onchange = function () { if (this.files[0]) loadImageFile(this.files[0]); this.value = ''; };
  document.addEventListener('paste', function (e) {
    if (!S.pdf || /TEXTAREA|INPUT/.test(document.activeElement.tagName)) return;
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var k = 0; k < items.length; k++) if (/^image\//.test(items[k].type)) { loadImageFile(items[k].getAsFile()); e.preventDefault(); return; }
    if (clip) pasteObj();
  });

  // ------------------------------------------------------------ equations & figures (the add-in's own editors)
  var modalCb = null;
  function openModal(page, data, cb) {
    modalCb = cb;
    var d = Object.assign({ host: 'frame', lang: 'ar' }, data);
    $('mframe').src = page + '.html?host=frame&embed=pdf&v=5.1.0#d=' + encodeURIComponent(JSON.stringify(d));
    $('modal').hidden = false;
  }
  function closeModal() { $('modal').hidden = true; $('mframe').src = 'about:blank'; modalCb = null; }
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || !e.data.armath) return;
    var msg = e.data.armath, cb = modalCb;
    closeModal();
    if (msg.type === 'cancel' || !cb) return;
    cb(msg);
  });
  function placeSvg(i, vec, wPx, hPx, meta, keep) {
    var p = S.pages[i], id = uid();
    setAsset(id, vec);
    var w = wPx * 0.75, h = hPx * 0.75, k = Math.min(1, (p.w - 40) / w);
    w *= k; h *= k;
    if (keep) {                 // editing: keep position and the size the user gave it
      var sc = keep.w / keep.nw;
      keep.asset = id; keep.nw = w; keep.w = w * sc; keep.h = h * sc; Object.assign(keep, meta);
      return keep;
    }
    var o = born(Object.assign({ id: uid(), t: 'svg', asset: id, x: Math.max(20, p.w - w - 36), y: freeY(i, h), w: w, h: h, nw: w }, meta));
    if (S.opt.figBg) o.bg = S.opt.figBg;
    if (S.opt.ink && meta.kind === 'eq') o.ink = S.opt.ink;
    if (meta.kind === 'fig') o.x = (p.w - w) / 2;
    p.objs.push(o);
    return o;
  }
  function insertFromEditor(msg, i, keep) {
    busy(true, 'جارٍ تجهيز المعادلات…');
    var p = S.pages[i], maxW = Math.min(620, (p.w - 60) / 0.75);
    return Compose.compose(msg, maxW).then(function (c) {
      return Vector.fromSVG(c.svg).then(function (v) { return { v: v, w: c.w, h: c.h }; });
    }).then(function (r) {
      push();
      var o = placeSvg(i, r.v, r.w, r.h, { kind: 'eq', src: msg.source || msg.equations.map(function (e) { return e.tex || e.text || ''; }).join('\n'), mode: msg.mode, opts: msg.opts }, keep);
      setTool('select'); select(i, o.id); markThumb(i);
    }).catch(function (e) { toast('تعذّر الإدراج: ' + e.message, true); }).then(function () { busy(false); });
  }
  function insertFigure(msg, i, keep) {
    busy(true, 'جارٍ تجهيز الرسم…');
    return Figures.render(msg.kind, msg.data).then(function (r) {
      return Vector.fromSVG(r.svg).then(function (v) { return { v: v, w: r.w, h: r.h }; });
    }).then(function (r) {
      push();
      var o = placeSvg(i, r.v, r.w, r.h, { kind: 'fig', fig: msg.kind, data: msg.data }, keep);
      setTool('select'); select(i, o.id); markThumb(i);
    }).catch(function (e) { toast('تعذّر الإدراج: ' + e.message, true); }).then(function () { busy(false); });
  }
  function editSvgObj(i, o) {
    if (o.kind === 'eq') openModal('editor', { mode: o.mode || 'math', tex: o.src || '', opts: o.opts }, function (msg) { if (msg.type === 'insert') insertFromEditor(msg, i, o).then(function () { drawOverlay(i); }); });
    else if (o.kind === 'fig') {
      var page = Figures.KINDS[o.fig] ? Figures.KINDS[o.fig].studio : o.fig, extra = {};
      if (o.fig === 'circuit') extra.tab = 'circuit';
      if (o.fig === 'chemfig') extra.tab = 'chemfig';
      openModal(page, Object.assign({ data: o.data }, extra), function (msg) { if (msg.type === 'insertFigure') insertFigure(msg, i, o).then(function () { drawOverlay(i); }); });
    }
  }
  $('eqBtn').onclick = function () {
    if (!S.pdf) return toast('افتح ملف PDF أولاً');
    var i = S.cur;
    openModal('editor', { mode: 'math' }, function (msg) { if (msg.type === 'insert') insertFromEditor(msg, i); });
  };
  $('figBtn').onclick = function () { if (!S.pdf) return toast('افتح ملف PDF أولاً'); popAt($('figPop'), this); };
  Array.prototype.forEach.call(document.querySelectorAll('#figPop [data-fig]'), function (b) {
    b.onclick = function () {
      $('figPop').hidden = true;
      var k = b.dataset.fig, page = k === 'circuit' ? 'physics' : k, i = S.cur;
      openModal(page, k === 'circuit' ? { tab: 'circuit' } : {}, function (msg) {
        if (msg.type === 'insertFigure') insertFigure(msg, i);
        else if (msg.type === 'insert') insertFromEditor(msg, i);     // e.g. statistics steps from the chart studio
      });
    };
  });
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });

  // ------------------------------------------------------------ pages
  S.tsel = [];                        // page ids selected in the thumbnails (Ctrl / Shift + click)
  function selPages() {
    var ids = S.tsel || [], list = [];
    S.pages.forEach(function (p, i) { if (ids.indexOf(p.id) >= 0) list.push(i); });
    return list.length ? list : [S.cur];
  }
  function newBlank(like, tpl) {
    var c = cropOf(like);
    return { id: uid(), src: -1, rot: 0, w: c.w, h: c.h, objs: [], sol: true, tpl: tpl !== undefined ? tpl : (S.opt.tpl || '') };
  }
  function rotRect(r, oh) { return { x: oh - (r.y + r.h), y: r.x, w: r.h, h: r.w }; }
  function pageOp(op, arg) {
    if (!S.pages.length) return;
    var i = S.cur, p = S.pages[i], list = selPages();
    if (op === 'del') {
      if (list.length >= S.pages.length) return toast('لا يمكن حذف كل الصفحات', true);
      var msg = list.length > 1 ? 'حذف ' + list.length + ' صفحات من النسخة الجديدة؟' : 'حذف الصفحة ' + (list[0] + 1) + ' من النسخة الجديدة؟';
      return PdfUI.confirm(msg + ' (الملف الأصلي لا يتغير)', 'حذف').then(function (ok) {
        if (!ok) return;
        push();
        var ids = list.map(function (k) { return S.pages[k].id; });
        S.pages = S.pages.filter(function (pg) { return ids.indexOf(pg.id) < 0; });
        S.tsel = []; S.sel = null;
        layoutPages(); goto(Math.min(list[0], S.pages.length - 1));
        toast(list.length > 1 ? 'حُذفت ' + list.length + ' صفحات' : 'حُذفت الصفحة');
      });
    }
    if (op === 'crop') return startCrop();
    if (op === 'insertFile') return $('mergeInp').click();
    if (op === 'extract') return exportDialog({ pages: list });
    if (op === 'selAll') { S.tsel = S.pages.map(function (pg) { return pg.id; }); markThumbSel(); return; }
    if (op === 'selNone') { S.tsel = []; markThumbSel(); return; }
    push();
    if (op === 'blank' || op === 'blankBefore') {
      var n = newBlank(p, arg);
      S.pages.splice(op === 'blank' ? i + 1 : i, 0, n);
      S.tsel = [];
      layoutPages(); goto(op === 'blank' ? i + 1 : i);
      toast('أُضيفت صفحة حل — اكتب عليها أو أضف معادلات');
      return n;
    }
    if (op === 'dup') {
      list.slice().reverse().forEach(function (k) { var c = JSON.parse(JSON.stringify(S.pages[k])); c.id = uid(); c.objs.forEach(function (o) { o.id = uid(); }); S.pages.splice(k + 1, 0, c); });
    }
    if (op === 'up' || op === 'down') {
      var moving = list.map(function (k) { return S.pages[k]; }), first = list[0], last = list[list.length - 1];
      if ((op === 'up' && first === 0) || (op === 'down' && last === S.pages.length - 1)) { S.undo.pop(); return; }
      var rest = S.pages.filter(function (pg) { return moving.indexOf(pg) < 0; });
      var at = op === 'up' ? first - 1 : first + 1;
      Array.prototype.splice.apply(rest, [at, 0].concat(moving));
      S.pages = rest; S.cur = at;
    }
    if (op === 'clear') list.forEach(function (k) { S.pages[k].objs = []; });
    if (op === 'sol') { var on = !S.pages[list[0]].sol; list.forEach(function (k) { S.pages[k].sol = on; }); toast(on ? 'عُلّمت كصفحة حل — تُحذف من نسخة الطالب' : 'أُلغيت علامة صفحة الحل'); }
    if (op === 'uncrop') list.forEach(function (k) { delete S.pages[k].crop; });
    if (op === 'tpl') list.forEach(function (k) { if (S.pages[k].src < 0) S.pages[k].tpl = arg; });
    if (op === 'rot') {
      list.forEach(function (k) {
        var pg = S.pages[k], ow = pg.w, oh = pg.h;
        pg.rot = (pg.rot + 90) % 360; pg.w = oh; pg.h = ow;
        if (pg.crop) pg.crop = rotRect(pg.crop, oh);
        // additions follow the page: centre of each object turns with it
        pg.objs.forEach(function (o) {
          var b = bbox(o), cx = b.x + b.w / 2, cy = b.y + b.h / 2, nx = oh - cy, ny = cx;
          moveObj(o, JSON.parse(JSON.stringify(o)), nx - cx, ny - cy);
        });
      });
    }
    var keepCur = S.cur;
    layoutPages(); goto(Math.min(keepCur, S.pages.length - 1));
  }
  $('addPage').onclick = function () { pageOp('blank'); };
  $('pageMenuBtn').onclick = function () { if (!S.pdf) return; syncPageMenu(); popAt($('pagePop'), this); };
  Array.prototype.forEach.call(document.querySelectorAll('#pagePop [data-pg]'), function (b) { b.onclick = function () { $('pagePop').hidden = true; pageOp(b.dataset.pg, b.dataset.arg); }; });
  function syncPageMenu() {
    var list = selPages(), n = list.length;
    $('pagePopHead').textContent = n > 1 ? 'على ' + n + ' صفحات محددة' : 'الصفحة ' + (list[0] + 1);
    var sol = S.pages[list[0]] && S.pages[list[0]].sol;
    document.querySelector('#pagePop [data-pg=sol]').textContent = sol ? '✓ صفحة حل (تُحذف من نسخة الطالب) — إلغاء' : '🎓 تعليمها كصفحة حل (تُحذف من نسخة الطالب)';
  }

  // thumbnails: click = go, Ctrl+click = add to selection, Shift+click = range, drag = move pages, drop a PDF = insert it
  var tAnchor = null;
  function markThumbSel() {
    Array.prototype.forEach.call($('thumbs').children, function (t, k) { var p = S.pages[k]; t.classList.toggle('tsel', !!p && S.tsel.indexOf(p.id) >= 0); });
    status(S.tsel.length > 1 ? 'محدد: ' + S.tsel.length + ' صفحات — أدوات «الصفحة ▾» تعمل عليها كلها' : 'عدد الصفحات: ' + S.pages.length);
  }
  $('thumbs').addEventListener('click', function (e) {
    var t = e.target.closest('.thumb'); if (!t) return;
    var i = +t.dataset.i, id = S.pages[i].id;
    if (e.ctrlKey || e.metaKey) {
      if (!S.tsel.length && S.cur !== i) S.tsel = [S.pages[S.cur].id];
      var k = S.tsel.indexOf(id); if (k >= 0) S.tsel.splice(k, 1); else S.tsel.push(id);
      tAnchor = i; markThumbSel(); return;
    }
    if (e.shiftKey) {
      var a = tAnchor === null ? S.cur : tAnchor, lo = Math.min(a, i), hi = Math.max(a, i);
      S.tsel = S.pages.slice(lo, hi + 1).map(function (p) { return p.id; }); markThumbSel(); return;
    }
    tAnchor = i;
    if (S.tsel.length) { S.tsel = []; markThumbSel(); }
    goto(i);
  });
  (function () {
    var box = $('thumbs'), moving = null;
    function clearMarks() { Array.prototype.forEach.call(box.querySelectorAll('.drop-before,.drop-after'), function (x) { x.classList.remove('drop-before', 'drop-after'); }); }
    function where(e) {
      var t = e.target.closest('.thumb');
      if (!t) { var kids = box.children; return kids.length ? { t: kids[kids.length - 1], after: true } : null; }
      var r = t.getBoundingClientRect();
      return { t: t, after: e.clientY > r.top + r.height / 2 };
    }
    box.addEventListener('dragstart', function (e) {
      var t = e.target.closest('.thumb'); if (!t) return;
      var i = +t.dataset.i, id = S.pages[i].id;
      moving = S.tsel.indexOf(id) >= 0 ? S.pages.filter(function (p) { return S.tsel.indexOf(p.id) >= 0; }) : [S.pages[i]];
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'armath-pages');
      setTimeout(function () { moving.forEach(function (p) { var th = box.children[S.pages.indexOf(p)]; if (th) th.classList.add('dragging'); }); }, 0);
    });
    box.addEventListener('dragend', function () { moving = null; clearMarks(); Array.prototype.forEach.call(box.querySelectorAll('.dragging'), function (x) { x.classList.remove('dragging'); }); });
    box.addEventListener('dragover', function (e) {
      var files = e.dataTransfer && Array.prototype.some.call(e.dataTransfer.types || [], function (x) { return x === 'Files'; });
      if (!moving && !files) return;
      e.preventDefault(); e.stopPropagation();
      var w = where(e); clearMarks(); if (w) w.t.classList.add(w.after ? 'drop-after' : 'drop-before');
    });
    box.addEventListener('dragleave', function (e) { if (!box.contains(e.relatedTarget)) clearMarks(); });
    box.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation();
      var w = where(e); clearMarks();
      var at = w ? +w.t.dataset.i + (w.after ? 1 : 0) : S.pages.length;
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!moving && f && (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name))) { insertPdfFile(f, at); return; }
      if (!moving) return;
      var target = S.pages[at] || null;           // insert before this page (null = at the end)
      while (target && moving.indexOf(target) >= 0) target = S.pages[S.pages.indexOf(target) + 1] || null;
      push();
      var rest = S.pages.filter(function (p) { return moving.indexOf(p) < 0; }), k = target ? rest.indexOf(target) : rest.length;
      Array.prototype.splice.apply(rest, [k, 0].concat(moving));
      var changedOrder = rest.some(function (p, n) { return p !== S.pages[n]; });
      if (!changedOrder) { S.undo.pop(); moving = null; return; }
      S.pages = rest; moving = null;
      layoutPages(); goto(k);
      toast('تم نقل الصفحات');
    });
  })();

  // ---- other PDFs: insert their pages (merge). Their bytes are kept with the project so the work survives a reload.
  function docKey(id) { return S.fp + '::doc::' + id; }
  function addDoc(bytes, name, id) {
    return pdfjsReady().then(function (pdfjs) {
      return pdfjs.getDocument({ data: bytes.slice(0), cMapUrl: 'vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: 'vendor/pdfjs/standard_fonts/', isEvalSupported: false }).promise;
    }).then(function (pdf) {
      id = id || 'd' + uid();
      S.docs[id] = { pdf: pdf, bytes: bytes, name: name };
      return id;
    });
  }
  function restoreExtraDocs(saved) {
    var list = (saved && saved.docs) || [];
    return Promise.all(list.map(function (d) {
      if (S.docs[d.id]) return null;
      return idb('readonly', function (st) { return st.get(docKey(d.id)); }).then(function (rec) {
        if (rec && rec.bytes) return addDoc(new Uint8Array(rec.bytes), rec.name || d.name, d.id);
      }).catch(function () { return null; });
    }));
  }
  function extraDocs() {
    var used = {};
    S.pages.forEach(function (p) { if (p.doc && S.docs[p.doc]) used[p.doc] = 1; });
    (S.undo || []).slice(-10).forEach(function (j) { (j.match(/"doc":"(d[a-z0-9]+)"/g) || []).forEach(function (m) { used[m.slice(7, -1)] = 1; }); });
    return Object.keys(used).map(function (k) { return { id: k, name: S.docs[k].name }; });
  }
  function insertPdfFile(file, at) {
    if (!S.pdf) return openFile(file);
    busy(true, 'جارٍ قراءة الملف…');
    var bytes;
    file.arrayBuffer().then(function (buf) { bytes = new Uint8Array(buf); return addDoc(bytes, file.name); }).then(function (id) {
      busy(false);
      var d = S.docs[id], n = d.pdf.numPages, here = at === undefined ? S.cur + 1 : at;
      return PdfUI.open({
        title: 'إدراج صفحات من ملف PDF آخر',
        body: '<p class="dlg-msg"><b>' + esc(file.name) + '</b> — ' + n + ' صفحة</p>' +
          '<label class="fld"><span>الصفحات</span><input id="rg" value="الكل" dir="auto" placeholder="مثل: 1-3, 5"></label>' +
          '<div class="fld"><span>المكان</span><div class="radios">' +
          (at === undefined ? '<label><input type="radio" name="pos" value="after" checked> بعد الصفحة الحالية (' + (S.cur + 1) + ')</label><label><input type="radio" name="pos" value="before"> قبل الصفحة الحالية</label>' : '<label><input type="radio" name="pos" value="here" checked> في المكان الذي أسقطته فيه</label>') +
          '<label><input type="radio" name="pos" value="end"> في آخر الملف (دمج)</label><label><input type="radio" name="pos" value="start"> في أول الملف</label></div></div>',
        ok: 'إدراج',
        validate: function (el) { try { PdfUI.parseRange(PdfUI.val(el, '#rg'), n); return null; } catch (x) { return x.message; } }
      }).then(function (el) {
        if (!el) return;
        var range = PdfUI.parseRange(PdfUI.val(el, '#rg'), n), pos = PdfUI.radio(el, 'pos');
        return loadSrc({ doc: id, src: range[0] }).then(function (first) {
          var all = fresh(n, id, first), add = range.map(function (k) { return all[k]; });
          var k = pos === 'end' ? S.pages.length : pos === 'start' ? 0 : pos === 'before' ? S.cur : here;
          push();
          Array.prototype.splice.apply(S.pages, [k, 0].concat(add));
          idb('readwrite', function (st) { return st.put({ name: file.name, bytes: bytes.buffer }, docKey(id)); }).catch(function () { toast('الملف كبير على الحفظ التلقائي — احفظ ملف المشروع', true); });
          S.tsel = add.map(function (p) { return p.id; });
          layoutPages(); goto(k); markThumbSel(); measureAll();
          toast('أُدرجت ' + add.length + ' صفحة من «' + file.name + '»');
        });
      });
    }).catch(function (e) { busy(false); toast('تعذّر فتح الملف: ' + (e && e.message), true); });
  }
  $('mergeInp').onchange = function () { var f = this.files[0]; this.value = ''; if (f) insertPdfFile(f); };

  // ---- crop: drag a rectangle on the page, then apply it to this page or to all pages of the same size
  var cropping = null;
  function startCrop() {
    setTool('crop');
    cropping = { page: S.cur };
    toast('حدّد بالسحب الجزء الذي تريد إبقاءه من الصفحة');
  }
  function finishCrop(i, r) {
    setTool('select');
    if (r.w < 20 || r.h < 20) return;
    var p = S.pages[i], same = S.pages.filter(function (q) { return Math.abs(q.w - p.w) < 1 && Math.abs(q.h - p.h) < 1; }).length;
    PdfUI.open({
      title: 'قص حواف الصفحة',
      body: '<p class="dlg-msg">المنطقة المحددة: ' + Math.round(r.w) + ' × ' + Math.round(r.h) + ' نقطة. القص يخفي الحواف فقط في النسخة الجديدة، والأصل لا يتغير.</p>' +
        '<div class="radios"><label><input type="radio" name="to" value="one" checked> هذه الصفحة فقط</label>' +
        (selPages().length > 1 ? '<label><input type="radio" name="to" value="sel"> الصفحات المحددة (' + selPages().length + ')</label>' : '') +
        '<label><input type="radio" name="to" value="all"> كل الصفحات بنفس المقاس (' + same + ')</label></div>',
      ok: 'قص'
    }).then(function (el) {
      if (!el) return;
      var to = PdfUI.radio(el, 'to'), c = { x: Math.max(0, r.x), y: Math.max(0, r.y) };
      c.w = Math.min(p.w - c.x, r.w); c.h = Math.min(p.h - c.y, r.h);
      push();
      var targets = to === 'all' ? S.pages.filter(function (q) { return Math.abs(q.w - p.w) < 1 && Math.abs(q.h - p.h) < 1; }) : to === 'sel' ? selPages().map(function (k) { return S.pages[k]; }) : [p];
      targets.forEach(function (q) { q.crop = { x: c.x, y: c.y, w: c.w, h: c.h }; });
      layoutPages(); goto(i);
      toast('تم القص — للتراجع: Ctrl+Z أو «الصفحة ▾ ← إزالة القص»');
    });
  }

  // ------------------------------------------------------------ project file
  $('projBtn').onclick = function () { if (!S.pdf) return toast('افتح ملف PDF أولاً'); popAt($('projPop'), this); };
  function projectData(full) {
    var d = { app: 'armath-pdf', v: 2, name: S.name, fp: S.fp, pages: S.pages, assets: usedAssets(), clips: S.clips || [], deco: S.deco || {}, docs: extraDocs() };
    if (full) d.docBytes = d.docs.map(function (x) { return { id: x.id, name: x.name, b64: PdfUI.b64(S.docs[x.id].bytes) }; });
    return d;
  }
  Array.prototype.forEach.call(document.querySelectorAll('#projPop [data-pj]'), function (b) {
    b.onclick = function () {
      $('projPop').hidden = true;
      if (b.dataset.pj === 'save') {
        download(S.name.replace(/\.pdf$/i, '') + '.armath.json', new Blob([JSON.stringify(projectData(true))], { type: 'application/json' }));
      } else if (b.dataset.pj === 'load') $('projInp').click();
      else if (b.dataset.pj === 'reset') {
        PdfUI.confirm('مسح كل الإضافات والصفحات المضافة والأسئلة المقصوصة على هذا الملف؟', 'مسح الكل').then(function (ok) {
          if (!ok) return;
          push();
          loadSrc({ src: 0 }).then(function (first) {
            S.pages = fresh(S.pdf.numPages, 'main', first); S.clips = []; S.deco = {}; S.tsel = [];
            layoutPages(); measureAll(); if (window.PdfExt && PdfExt.refresh) PdfExt.refresh();
          });
        });
      }
    };
  });
  $('projInp').onchange = function () {
    var file = this.files[0]; this.value = '';
    if (!file) return;
    var d;
    file.text().then(function (t) {
      d = JSON.parse(t);
      if (d.app !== 'armath-pdf') throw new Error('ليس ملف مشروع لاستوديو PDF');
      if (d.fp && d.fp !== S.fp) return PdfUI.confirm('هذا المشروع صُنع لملف PDF آخر (' + d.name + '). متابعة؟', 'متابعة');
      return true;
    }).then(function (ok) {
      if (!ok) return;
      return Promise.all((d.docBytes || []).map(function (x) {
        var u = PdfUI.unb64(x.b64);
        idb('readwrite', function (st) { return st.put({ name: x.name, bytes: u.buffer }, docKey(x.id)); }).catch(function () {});
        return S.docs[x.id] ? null : addDoc(u, x.name, x.id);
      })).then(function () {
        push();
        Object.keys(d.assets || {}).forEach(function (k) { setAsset(k, d.assets[k]); });
        S.pages = d.pages.filter(srcExists); S.clips = d.clips || []; S.deco = d.deco || {};
        layoutPages(); measureAll(); if (window.PdfExt && PdfExt.refresh) PdfExt.refresh();
        toast('تم فتح المشروع');
      });
    }).catch(function (e) { toast(e.message, true); });
  };

  // ------------------------------------------------------------ export
  function invert(m) {
    var det = m[0] * m[3] - m[1] * m[2];
    return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
  }
  function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  var QUALITY = { medium: { dpi: 150, q: 0.72 }, small: { dpi: 100, q: 0.58 } };
  /** opts: { pages: [indices], student: bool, quality: 'orig'|'medium'|'small', suffix } → Promise<Uint8Array> */
  function buildPdf(opts) {
    opts = opts || {};
    var L = window.PDFLib, out, libs = {}, lib = function (docId) {
      if (!libs[docId]) libs[docId] = L.PDFDocument.load(S.docs[docId].bytes, { ignoreEncryption: true, updateMetadata: false });
      return libs[docId];
    };
    var list = (opts.pages || S.pages.map(function (p, k) { return k; })).filter(function (k) { return !(opts.student && S.pages[k].sol); });
    if (!list.length) return Promise.reject(new Error('لا توجد صفحات للحفظ' + (opts.student ? ' (كل الصفحات المختارة صفحات حل)' : '')));
    var qual = QUALITY[opts.quality] || null, redactedPages = [];
    if (window.PdfAnnot) PdfAnnot.begin();
    return L.PDFDocument.create().then(function (d) {
      out = d;
      var chain = Promise.resolve();
      list.forEach(function (idx, n) {
        chain = chain.then(function () {
          busy(true, 'جارٍ إنشاء ملف PDF… ' + (n + 1) + ' / ' + list.length);
          var p = S.pages[idx], objs = opts.student ? p.objs.filter(function (o) { return !o.sol; }) : p.objs;
          var info = { n: n + 1, N: list.length, student: !!opts.student };
          var made, pq = qual || (window.PdfAnnot && p.src >= 0 && PdfAnnot.needsRaster(objs) ? PdfAnnot.REDACT_Q : null);
          if (pq && !qual) redactedPages.push(idx + 1);
          if (p.src >= 0 && !pq) {
            made = Promise.all([lib(p.doc || 'main'), loadSrc(p)]).then(function (r) {
              return out.copyPages(r[0], [p.src]).then(function (c) {
                var pg = c[0], total = (r[1].rotate + p.rot) % 360;
                out.addPage(pg);
                pg.setRotation(L.degrees(total));
                return { page: pg, toPdf: invert(r[1].getViewport({ scale: 1, rotation: total }).transform) };
              });
            });
          } else if (p.src >= 0) {
            made = loadSrc(p).then(function (sp) {
              var k = pq.dpi / 72, vp = sp.getViewport({ scale: k, rotation: (sp.rotate + p.rot) % 360 });
              var cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
              var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
              return sp.render({ canvasContext: cx, viewport: vp }).promise.then(function () {
                if (window.PdfAnnot) PdfAnnot.burn(cx, k, objs, p);
                return new Promise(function (ok) { cv.toBlob(ok, 'image/jpeg', pq.q); });
              }).then(function (blob) { cv.width = cv.height = 0; return blob.arrayBuffer(); }).then(function (buf) {
                return out.embedJpg(buf);
              }).then(function (img) {
                var pg = out.addPage([p.w, p.h]);
                pg.drawImage(img, { x: 0, y: 0, width: p.w, height: p.h });
                try { sp.cleanup(); } catch (x) { /* ignore */ }
                return { page: pg, toPdf: [1, 0, 0, -1, 0, p.h] };
              });
            });
          } else {
            made = Promise.resolve({ page: out.addPage([p.w, p.h]), toPdf: [1, 0, 0, -1, 0, p.h] });
          }
          return made.then(function (m) {
            var deco = window.PdfDecor ? PdfDecor.page(p, idx, S, info) : '';
            return drawObjs(out, m.page, p, m.toPdf, objs, deco).then(function () {
              var notes = objs.filter(function (o) { return o.t === 'note'; });
              if (notes.length) addNotes(out, m.page, notes, m.toPdf);
              if (window.PdfAnnot) PdfAnnot.exportPage(out, m.page, p, m.toPdf, objs, n);
              if (p.crop) {
                var c = p.crop, a = apply(m.toPdf, c.x, c.y), b = apply(m.toPdf, c.x + c.w, c.y + c.h);
                var x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]);
                m.page.setCropBox(x0, y0, Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
              }
            });
          });
        });
      });
      return chain;
    }).then(function () {
      out.setTitle(S.name.replace(/\.pdf$/i, '') + (opts.student ? ' — نسخة الطالب' : ''));
      out.setProducer('معادلات عربية — استوديو PDF');
      out.setCreator('معادلات عربية');
      if (window.PdfAnnot) PdfAnnot.finish(out, opts);
      if (redactedPages.length) toast('طُبّق التنقيح نهائياً في الصفحات: ' + redactedPages.slice(0, 15).join('، ') + (redactedPages.length > 15 ? '…' : '') + ' (حُوّلت إلى صور)');
      return out.save({ useObjectStreams: true, updateFieldAppearances: false });
    });
  }
  // sticky notes become real PDF comments (the yellow note icon in Acrobat and every PDF reader)
  function addNotes(doc, page, notes, toPdf) {
    var L = window.PDFLib, ctx = doc.context, arr = page.node.Annots();
    if (!arr) { arr = ctx.obj([]); page.node.set(L.PDFName.of('Annots'), arr); }
    var now = new Date(), pad = function (v) { return (v < 10 ? '0' : '') + v; };
    var date = 'D:' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    notes.forEach(function (o) {
      var a = apply(toPdf, o.x, o.y), b = apply(toPdf, o.x + 20, o.y + 20);
      var hex = (o.color || '#ffd43b').replace('#', ''), col = [0, 2, 4].map(function (k) { return parseInt(hex.substr(k, 2), 16) / 255; });
      var dict = ctx.obj({
        Type: 'Annot', Subtype: 'Text', Rect: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])],
        Contents: L.PDFHexString.fromText(o.text || ''), T: L.PDFHexString.fromText(o.author || 'المعلم'),
        Name: 'Comment', C: col, F: 4, Open: false, M: L.PDFString.of(date)
      });
      arr.push(ctx.register(dict));
    });
  }
  function exportPdf(opts) {
    if (!S.pdf) return toast('افتح ملف PDF أولاً');
    opts = opts || {};
    var base = S.name.replace(/\.pdf$/i, ''), jobs = opts.both ? [Object.assign({}, opts, { student: false }), Object.assign({}, opts, { student: true })] : [opts];
    busy(true, 'جارٍ إنشاء ملف PDF…');
    var chain = Promise.resolve(), sizes = [];
    jobs.forEach(function (o) {
      chain = chain.then(function () { return buildPdf(o); }).then(function (bytes) {
        var suffix = o.suffix || (o.pages && o.pages.length < S.pages.length ? ' - صفحات مختارة' : o.student ? ' - نسخة الطالب' : ' - مع الحلول');
        download(PdfUI.safeName(base + suffix) + '.pdf', new Blob([bytes], { type: 'application/pdf' }));
        sizes.push(PdfUI.fmtSize(bytes.length));
      });
    });
    return chain.then(function () {
      toast('تم الحفظ (' + sizes.join(' و ') + ') — الملف الأصلي كما هو');
    }).catch(function (e) { console.error(e); toast('تعذّر إنشاء الملف: ' + (e && e.message), true); })
      .then(function () { busy(false); });
  }
  var lastExport = { version: 'teacher', quality: 'orig' };
  function exportDialog(pre) {
    if (!S.pdf) return toast('افتح ملف PDF أولاً');
    pre = pre || {};
    var nSel = selPages().length, hasSol = S.pages.some(function (p) { return p.sol || p.objs.some(function (o) { return o.sol; }); });
    var orig = S.docs.main.bytes.length;
    return PdfUI.open({
      title: 'حفظ نسخة PDF جديدة',
      body:
        '<div class="fld"><span>النسخة</span><div class="radios">' +
        '<label><input type="radio" name="ver" value="teacher"> كاملة — نسخة المعلم (كل الحلول والإضافات)</label>' +
        '<label><input type="radio" name="ver" value="student"> نسخة الطالب — بدون الحلول' + (hasSol ? '' : ' <small>(لا توجد حلول معلّمة بعد)</small>') + '</label>' +
        '<label><input type="radio" name="ver" value="both"> الاثنتان معاً (ملفّان)</label></div></div>' +
        '<div class="fld"><span>الصفحات</span><div class="radios">' +
        '<label><input type="radio" name="pg" value="all"' + (pre.pages ? '' : ' checked') + '> كل الصفحات (' + S.pages.length + ')</label>' +
        (nSel > 1 || pre.pages ? '<label><input type="radio" name="pg" value="sel"' + (pre.pages ? ' checked' : '') + '> المحددة (' + (pre.pages || selPages()).length + ')</label>' : '') +
        '<label class="inl"><input type="radio" name="pg" value="range"> نطاق: <input id="rg" dir="ltr" placeholder="1-5, 8"></label></div></div>' +
        '<div class="fld"><span>حجم الملف</span><div class="radios">' +
        '<label><input type="radio" name="q" value="orig"> الأصل — أفضل جودة (' + PdfUI.fmtSize(orig) + ' تقريباً للكتاب)</label>' +
        '<label><input type="radio" name="q" value="medium"> مضغوط — جودة جيدة (150 نقطة/بوصة)</label>' +
        '<label><input type="radio" name="q" value="small"> مضغوط جداً — للإرسال بالهاتف (100 نقطة/بوصة)</label></div>' +
        '<p class="dlg-note">الضغط يحوّل صفحات الكتاب إلى صور؛ مناسب للكتب المصوّرة. إضافاتك (المعادلات والرسوم والنصوص) تبقى متّجهة وحادّة دائماً.</p></div>',
      ok: 'حفظ',
      onOpen: function (el) {
        el.querySelector('input[name=ver][value="' + (lastExport.version || 'teacher') + '"]').checked = true;
        el.querySelector('input[name=q][value="' + (lastExport.quality || 'orig') + '"]').checked = true;
        el.querySelector('#rg').addEventListener('focus', function () { el.querySelector('input[name=pg][value=range]').checked = true; });
      },
      validate: function (el) {
        if (PdfUI.radio(el, 'pg') === 'range') { try { PdfUI.parseRange(PdfUI.val(el, '#rg'), S.pages.length); } catch (x) { return x.message; } }
        return null;
      }
    }).then(function (el) {
      if (!el) return;
      var ver = PdfUI.radio(el, 'ver'), pg = PdfUI.radio(el, 'pg'), q = PdfUI.radio(el, 'q');
      lastExport = { version: ver, quality: q };
      var pages = pg === 'sel' ? (pre.pages || selPages()) : pg === 'range' ? PdfUI.parseRange(PdfUI.val(el, '#rg'), S.pages.length) : null;
      return exportPdf({ pages: pages, student: ver === 'student', both: ver === 'both', quality: q });
    });
  }
  function drawObjs(doc, page, p, toPdf, objs, pre) {
    objs = objs || p.objs;
    var env = { doc: doc, page: page }, all = '';
    var chain = Promise.resolve();
    if (pre) {
      var bg = '<svg xmlns="' + SVGNS + '" width="' + f2(p.w) + '" height="' + f2(p.h) + '" viewBox="0 0 ' + f2(p.w) + ' ' + f2(p.h) + '">' + pre + '</svg>';
      chain = Vector.fromSVG(bg).catch(function () { return bg; }).then(function (svg) { return Svg2Pdf.draw(svg, { x: 0, y: 0, w: p.w, h: p.h }, toPdf, env); }).then(function (ops) { all += ops; });
    }
    objs.forEach(function (o) {
      if ((o.t === 'note' && !o.show) || o.hide) return;
      chain = chain.then(function () {
        var b = { x: 0, y: 0, w: p.w, h: p.h }, svgP;
        if (o.t === 'svg') { svgP = Promise.resolve(lookSvg(o)); b = { x: o.x, y: o.y, w: o.w, h: o.h }; }
        else {
          var inner = objInner(o, true, true);
          var svg = '<svg xmlns="' + SVGNS + '" width="' + f2(p.w) + '" height="' + f2(p.h) + '" viewBox="0 0 ' + f2(p.w) + ' ' + f2(p.h) + '">' + inner + '</svg>';
          svgP = /<text/.test(inner) ? Vector.fromSVG(svg) : Promise.resolve(svg);
        }
        return svgP.then(function (svg) { return svg ? Svg2Pdf.draw(svg, b, toPdf, env) : ''; }).then(function (ops) { all += ops; });
      });
    });
    return chain.then(function () { if (all) Svg2Pdf.addStream(env, all); });
  }
  $('exportBtn').onclick = function () { exportDialog(); };

  // ------------------------------------------------------------ copy / paste objects, keys
  function copyObj() {
    var list = selObjs(); if (!list.length) return;
    clip = { objs: JSON.parse(JSON.stringify(list)), assets: {} };
    list.forEach(function (o) { if (o.asset) clip.assets[o.asset] = S.assets[o.asset]; });
  }
  function pasteObj() {
    if (!clip || !S.pages.length) return;
    push();
    var cs = cloneObjs(clip.objs, 0, 0);
    cs.forEach(function (o) { if (o.asset && clip.assets[o.asset]) { var id = uid(); setAsset(id, clip.assets[o.asset]); o.asset = id; } });
    var p = S.pages[S.cur], b = unionBox(cs), ty = visibleTop(S.cur), same = S.sel && S.sel.page === S.cur;
    cs.forEach(function (o) { moveObj(o, JSON.parse(JSON.stringify(o)), same ? 14 : 0, same ? 14 : ty - b.y); });
    Array.prototype.push.apply(p.objs, cs); setTool('select'); select(S.cur, cs[0].id, cs.map(function (o) { return o.id; })); markThumb(S.cur);
  }
  document.addEventListener('keydown', function (e) {
    if (/TEXTAREA|INPUT|SELECT/.test(document.activeElement.tagName) || !$('modal').hidden) return;
    // letters by their physical key (e.code): the shortcuts work with the Arabic keyboard layout too
    var k = (e.code && /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : e.key).toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 's') { e.preventDefault(); exportDialog(); return; }
    if (mod && k === 'f' && window.PdfText && S.pdf) { e.preventDefault(); PdfText.openFind(); return; }
    if (mod && k === 'p' && window.PdfExt && S.pdf) { e.preventDefault(); PdfExt.print(); return; }
    if (mod && k === 'o') { e.preventDefault(); $('fileInp').click(); return; }
    if (mod && k === 'c') { copyObj(); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicateSel(); return; }
    if (mod && k === 'g') { e.preventDefault(); groupSel(!e.shiftKey); return; }
    if (mod && k === 'a' && S.pdf) { e.preventDefault(); var pa = S.pages[S.cur].objs.filter(function (x) { return !x.lock && !(S.preview && x.sol); }); if (pa.length) { setTool('select'); select(S.cur, pa[0].id, pa.map(function (x) { return x.id; })); } return; }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); setZoom(S.zoom * 1.15); return; }
    if (mod && k === '-') { e.preventDefault(); setZoom(S.zoom / 1.15); return; }
    if (mod) return;
    if ((k === 'delete' || k === 'backspace') && selObj()) { e.preventDefault(); deleteSel(); return; }
    if ((k === 'delete') && !selObj() && S.tsel.length) { e.preventDefault(); pageOp('del'); return; }
    if (k === 'escape') { if (S.sel) select(S.sel.page, null); setTool('select'); return; }
    var o = selObj();
    if (o && /^arrow/.test(k)) {
      var mv = selObjs().filter(function (x) { return !x.lock; }); if (!mv.length) return;
      e.preventDefault(); push();
      var st = e.shiftKey ? 10 : 1, dx = k === 'arrowleft' ? -st : k === 'arrowright' ? st : 0, dy = k === 'arrowup' ? -st : k === 'arrowdown' ? st : 0;
      mv.forEach(function (x) { moveObj(x, JSON.parse(JSON.stringify(x)), dx, dy); }); drawOverlay(S.sel.page); return;
    }
    if (!o && (k === 'pagedown' || k === 'pageup')) return;
    var map = { v: 'select', h: 'hand', t: 'text', p: 'pen', y: 'hl', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', w: 'white', e: 'erase', s: 'snap', q: 'clip', n: 'note', x: 'textsel' };
    if (map[k] && S.pdf) { setTool(map[k]); return; }
    if (k === 'm' && S.pdf) $('eqBtn').click();
  });

  // ------------------------------------------------------------ viewer controls
  $('zoomIn').onclick = function () { setZoom(S.zoom * 1.2); };
  $('zoomOut').onclick = function () { setZoom(S.zoom / 1.2); };
  $('zoomVal').onclick = function () { setZoom(fitZoom()); };
  $('fitW').onclick = function () { if (S.pdf) setZoom(fitZoom()); };
  $('fitP').onclick = function () {
    if (!S.pdf) return;
    var c = cropOf(S.pages[S.cur] || S.pages[0]), v = $('viewer');
    setZoom(Math.max(0.25, Math.min(fitZoom(), (v.clientHeight - 50) / (c.h * PT))), false);
    goto(S.cur);
  };
  $('findBtn').onclick = function () { if (!S.pdf) return toast('افتح ملف PDF أولاً'); if (window.PdfText) PdfText.openFind(); };
  $('printBtn').onclick = function () { if (!S.pdf) return toast('افتح ملف PDF أولاً'); if (window.PdfExt) PdfExt.print(); };
  $('prevPg').onclick = function () { goto(S.cur - 1); };
  $('nextPg').onclick = function () { goto(S.cur + 1); };
  $('pgInp').onchange = function () { goto((+this.value || 1) - 1); };
  $('undoBtn').onclick = undo; $('redoBtn').onclick = redo;
  $('openBtn').onclick = $('openBtn2').onclick = function () { $('fileInp').click(); };
  $('fileInp').onchange = function () { openFile(this.files[0]); this.value = ''; };
  $('viewer').addEventListener('wheel', function (e) { if (e.ctrlKey) { e.preventDefault(); setZoom(S.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive: false });
  // hand tool
  (function () {
    var v = $('viewer'), st = null;
    v.addEventListener('pointerdown', function (e) { if (S.tool !== 'hand') return; st = { x: e.clientX, y: e.clientY, l: v.scrollLeft, t: v.scrollTop }; v.classList.add('dragging'); v.setPointerCapture(e.pointerId); });
    v.addEventListener('pointermove', function (e) { if (!st) return; v.scrollLeft = st.l - (e.clientX - st.x); v.scrollTop = st.t - (e.clientY - st.y); });
    v.addEventListener('pointerup', function () { st = null; v.classList.remove('dragging'); });
  })();
  // drag & drop
  (function () {
    var v = $('viewer'), drop = document.querySelector('.empty .drop');
    v.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
    v.addEventListener('dragleave', function () { drop.classList.remove('over'); });
    v.addEventListener('drop', function (e) {
      e.preventDefault(); drop.classList.remove('over');
      var f = e.dataTransfer.files[0]; if (!f) return;
      if (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name)) openFile(f);
      else if (/^image\//.test(f.type) && S.pdf) loadImageFile(f);
    });
  })();
  window.addEventListener('resize', function () { /* keep zoom */ });
  window.addEventListener('beforeunload', function (e) { if (S.dirty && S.fp) { clearTimeout(saveTm); } });

  setTool('select');
  syncButtons();
  if (document.fonts && document.fonts.load) { document.fonts.load('16px Amiri', 'أب'); document.fonts.load('700 16px Amiri', 'أب'); }
  RenderHost.setBase('');
  window.__pdf = { S: S, snapshot: snapshot, restore: restore, inkPath: inkPath, simplify: simplify, openBytes: openBytes, exportPdf: exportPdf, exportDialog: exportDialog, buildPdf: buildPdf, insertFromEditor: insertFromEditor, insertFigure: insertFigure, pageOp: pageOp, setTool: setTool, drawOverlay: drawOverlay, layoutPages: layoutPages, snapshotRegion: snapshotRegion, select: select, insertPdfFile: insertPdfFile, loadSrc: loadSrc,
    // for the studio modules (ext.js)
    regionImage: regionImage, openFile: openFile, pinOf: pinOf, srcPage: srcPage, rendered: function (i) { return rendered[i] !== undefined; }, fitZoom: fitZoom, setZoom: setZoom, layoutPagesKeep: function () { layoutPages(); }, drawBg: drawBg, markThumb: markThumb, push: push, changed: changed, setAsset: setAsset, uid: uid, born: born, goto: goto, toast: toast, busy: busy, popAt: popAt,
    download: download, copyBlob: copyBlob, cropOf: cropOf, visibleTop: visibleTop, selObjs: selObjs, alignSel: alignSel, groupSel: groupSel, lockSel: lockSel, saveOpt: saveOpt, newBlank: newBlank, buildThumbs: buildThumbs, textHeight: textHeight, pageEl: pageEl, ptOf: ptOf, textSvgInner: textSvgInner, wrapText: wrapText, lhOf: lhOf, objInner: objInner, bbox: bbox, moveObj: moveObj, addImage: addImageObj, freeY: freeY, visibleTop: visibleTop, editText: editText, pageBitmap: pageBitmap };
})();
