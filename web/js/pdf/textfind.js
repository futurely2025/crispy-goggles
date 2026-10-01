/* PDF studio — the text inside text-based PDFs (not scanned ones):
 *   · «تحديد نص» tool (X): pdf.js text layer over each visible page → select and copy a question's text (Ctrl+C)
 *   · search (Ctrl+F): finds words in every page (Arabic letters normalised), highlights them, next / previous. */
(function () {
  'use strict';
  var P = window.__pdf, S = P.S, $ = function (id) { return document.getElementById(id); };
  var PT = 96 / 72;
  function lib() { return window.pdfjsLib; }

  // ------------------------------------------------------------ text layer
  function onTool(t) {
    document.body.classList.toggle('textsel', t === 'textsel');
    if (t === 'textsel') {
      var any = false;
      S.pages.forEach(function (p, i) { if (P.rendered(i)) { build(i); any = true; } });
      if (!hint) { hint = true; P.toast('اسحب على النص لتحديده ثم Ctrl+C للنسخ — يعمل في ملفات PDF النصية فقط (ليس المصوّرة)'); }
    }
  }
  var hint = false, warnedScan = false;
  function onRender(i) { if (S.tool === 'textsel') build(i); }
  function onUnrender(i) { var pin = P.pinOf(i), tl = pin && pin.querySelector('.textLayer'); if (tl) tl.remove(); }
  function build(i) {
    var p = S.pages[i], pin = P.pinOf(i); if (!p || !pin || p.src < 0) return;
    var old = pin.querySelector('.textLayer');
    if (old && old.__zoom === S.zoom && old.__rot === p.rot) return;
    if (old) old.remove();
    P.loadSrc(p).then(function (pg) {
      if (P.pinOf(i) !== pin || !lib() || !lib().TextLayer) return;
      var vp = pg.getViewport({ scale: S.zoom * PT, rotation: (pg.rotate + p.rot) % 360 });
      var div = document.createElement('div');
      div.className = 'textLayer'; div.__zoom = S.zoom; div.__rot = p.rot;
      div.style.setProperty('--scale-factor', vp.scale);
      pin.appendChild(div);
      var tl = new (lib().TextLayer)({ textContentSource: pg.streamTextContent({ includeMarkedContent: true, disableNormalization: true }), container: div, viewport: vp });
      return tl.render().then(function () {
        if (!div.querySelector('span:not(.markedContent)') && !warnedScan) { warnedScan = true; P.toast('هذه الصفحة مصوّرة — لا يوجد نص للتحديد. استخدم «قص سؤال» أو «لقطة»'); }
      });
    }).catch(function (e) { if (window.ArLog) ArLog.error('textlayer', e); });
  }

  // ------------------------------------------------------------ search
  var cache = {}, hits = [], cur = -1, query = '', runId = 0;
  // Arabic-insensitive: diacritics and tatweel removed, alef / ya / ta marbuta forms unified
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[ً-ْٰـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); });
  }
  function pageText(p) {
    var key = (p.doc || 'main') + '|' + p.src;
    if (cache[key]) return Promise.resolve(cache[key]);
    return P.loadSrc(p).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
      var items = tc.items.filter(function (it) { return it.str !== undefined; }), text = '', map = [];
      items.forEach(function (it, k) {
        var s = norm(it.str);
        for (var c = 0; c < s.length; c++) map.push([k, c, s.length]);
        text += s; map.push([k, s.length, s.length]); text += ' ';
      });
      return (cache[key] = { items: items, text: text, map: map });
    });
  }
  function search(q) {
    query = q; hits = []; cur = -1; var my = ++runId;
    redraw();
    var nq = norm(q).replace(/\s+/g, ' ').trim();
    if (nq.length < 2) { status(''); return Promise.resolve(); }
    status('جارٍ البحث…');
    var chain = Promise.resolve(), textless = 0, texted = 0;
    S.pages.forEach(function (p, i) {
      if (p.src < 0) return;
      chain = chain.then(function () {
        if (my !== runId) return;
        return pageText(p).then(function (t) {
          if (t.items.length) texted++; else textless++;
          var hay = t.text.replace(/\s+/g, ' '), idx = hay.indexOf(nq);
          // map positions of the collapsed text back: rebuild with the same collapsing
          var positions = collapsedMap(t.text);
          while (idx >= 0) {
            var a = positions[idx], b = positions[idx + nq.length - 1];
            if (a !== undefined && b !== undefined) hits.push({ i: i, pid: p.id, from: t.map[a], to: t.map[b] });
            idx = hay.indexOf(nq, idx + nq.length);
          }
        }).catch(function () { textless++; });
      });
    });
    return chain.then(function () {
      if (my !== runId) return;
      if (!hits.length) status(texted ? 'لا نتائج' : 'الملف مصوّر — لا يوجد نص للبحث فيه');
      else { cur = firstAfterCurrent(); show(); }
      redraw();
    });
  }
  function collapsedMap(text) {           // index in whitespace-collapsed text → index in original
    var out = [], prevSpace = false;
    for (var k = 0; k < text.length; k++) {
      var sp = /\s/.test(text[k]);
      if (sp && prevSpace) continue;
      out.push(k); prevSpace = sp;
    }
    return out;
  }
  function firstAfterCurrent() { for (var k = 0; k < hits.length; k++) if (hits[k].i >= S.cur) return k; return 0; }
  function rectsOf(h) {
    var p = S.pages[h.i], pg = P.srcPage(p); if (!pg) return [];
    var t = cache[(p.doc || 'main') + '|' + p.src]; if (!t) return [];
    var vp = pg.getViewport({ scale: 1, rotation: (pg.rotate + p.rot) % 360 }), out = [];
    for (var k = h.from[0]; k <= h.to[0]; k++) {
      var it = t.items[k]; if (!it || !it.str) continue;
      var len = Math.max(1, norm(it.str).length), c0 = k === h.from[0] ? h.from[1] : 0, c1 = k === h.to[0] ? Math.min(h.to[1] + 1, len) : len;
      var tr = it.transform, fh = Math.hypot(tr[2], tr[3]) || Math.abs(tr[3]) || 10, w = it.width || fh * len * 0.5;
      var rtl = it.dir === 'rtl' || /[؀-ۿ]/.test(it.str);
      var ns = norm(it.str), tot = mw(ns) || len, a0 = mw(ns.slice(0, c0)) / tot, a1 = mw(ns.slice(0, c1)) / tot;
      var s0 = rtl ? 1 - a1 : a0, s1 = rtl ? 1 - a0 : a1;
      var r = vp.convertToViewportRectangle([tr[4] + w * s0, tr[5] - fh * 0.22, tr[4] + w * s1, tr[5] + fh * 0.9]);
      out.push({ x: Math.min(r[0], r[2]), y: Math.min(r[1], r[3]), w: Math.abs(r[2] - r[0]), h: Math.abs(r[3] - r[1]) });
    }
    return out;
  }
  var mctx = null;                        // glyph-width proportions (better than equal widths for Arabic)
  function mw(s) {
    if (!s) return 0;
    if (!mctx) { try { mctx = document.createElement('canvas').getContext('2d'); mctx.font = '40px Amiri, "Traditional Arabic", "Times New Roman", serif'; } catch (e) { mctx = false; } }
    return mctx ? mctx.measureText(s).width : s.length;
  }
  function marks(p, i) {
    if (!hits.length) return '';
    var out = '';
    hits.forEach(function (h, k) {
      if (h.pid !== p.id) return;
      rectsOf(h).forEach(function (r) {
        out += '<rect x="' + r.x.toFixed(2) + '" y="' + r.y.toFixed(2) + '" width="' + r.w.toFixed(2) + '" height="' + r.h.toFixed(2) + '" fill="' + (k === cur ? '#ff8c00' : '#ffe066') + '" fill-opacity="' + (k === cur ? 0.45 : 0.4) + '"/>';
      });
    });
    return out;
  }
  function redraw() { var seen = {}; S.pages.forEach(function (p, i) { P.drawBg(i); }); }
  function show() {
    if (cur < 0 || !hits[cur]) return;
    var h = hits[cur], i = S.pages.findIndex(function (p) { return p.id === h.pid; });
    if (i < 0) return;
    status((cur + 1) + ' من ' + hits.length);
    P.goto(i);
    var rs = rectsOf(h), el = P.pageEl(i), c = P.cropOf(S.pages[i]);
    if (rs.length) $('viewer').scrollTop = el.offsetTop + (rs[0].y - c.y) * S.zoom * PT - $('viewer').clientHeight / 3;
    redraw();
  }
  function step(d) { if (!hits.length) return; cur = (cur + d + hits.length) % hits.length; show(); }
  function status(t) { var s = $('findStat'); if (s) s.textContent = t; }

  // ------------------------------------------------------------ search bar
  var bar = null, timer = null;
  function openFind() {
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'findbar'; bar.id = 'findBar';
      bar.innerHTML = '<input id="findInp" type="search" dir="auto" placeholder="ابحث في نص الملف…"><span id="findStat"></span>' +
        '<button type="button" id="findPrev" title="السابق (Shift+Enter)">▲</button><button type="button" id="findNext" title="التالي (Enter)">▼</button><button type="button" id="findClose" title="إغلاق (Esc)">✕</button>';
      document.querySelector('.viewer').appendChild(bar);
      var inp = $('findInp');
      inp.addEventListener('input', function () { clearTimeout(timer); var v = this.value; timer = setTimeout(function () { search(v); }, 300); });
      inp.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); if (inp.value !== query) search(inp.value); else step(e.shiftKey ? -1 : 1); }
        if (e.key === 'Escape') closeFind();
      });
      $('findNext').onclick = function () { step(1); };
      $('findPrev').onclick = function () { step(-1); };
      $('findClose').onclick = closeFind;
    }
    bar.hidden = false;
    var i2 = $('findInp'); i2.focus(); i2.select();
  }
  function closeFind() { if (bar) { bar.hidden = true; var fi = $('findInp'); if (fi && document.activeElement === fi) fi.blur(); } hits = []; cur = -1; query = ''; runId++; redraw(); }
  function reset() { cache = {}; hits = []; cur = -1; query = ''; if (bar) { bar.hidden = true; $('findInp').value = ''; } }


  // all matches of a plain string or RegExp on every text page → [{i, pid, rects:[{x,y,w,h}], text}] (rects in page points)
  // (used by "redact by search"; the text is the normalised page text, so Arabic marks and alef forms are ignored)
  function findAll(pattern) {
    var re = pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g') : null, nq = re ? null : norm(pattern).replace(/\s+/g, ' ').trim();
    var out = [], chain = Promise.resolve();
    S.pages.forEach(function (p, i) {
      if (p.src < 0) return;
      chain = chain.then(function () {
        return pageText(p).then(function (t) {
          var hay = t.text, idxs = [];
          if (re) { var m; re.lastIndex = 0; while ((m = re.exec(hay))) { if (!m[0]) { re.lastIndex++; continue; } idxs.push([m.index, m[0].length]); } }
          else if (nq.length >= 2) { var h2 = hay.replace(/\s+/g, ' '), cm = collapsedMap(hay), at = h2.indexOf(nq); while (at >= 0) { idxs.push([cm[at], (cm[at + nq.length - 1] - cm[at]) + 1]); at = h2.indexOf(nq, at + nq.length); } }
          idxs.forEach(function (r) {
            var a = t.map[r[0]], b = t.map[r[0] + r[1] - 1]; if (!a || !b) return;
            out.push({ i: i, pid: p.id, rects: rectsOf({ i: i, pid: p.id, from: a, to: b }), text: hay.substr(r[0], r[1]) });
          });
        }).catch(function () { /* page without text */ });
      });
    });
    return chain.then(function () { return out; });
  }

  window.PdfText = { findAll: findAll, pageText: pageText, rectsOf: rectsOf, onTool: onTool, onRender: onRender, onUnrender: onUnrender, marks: marks, openFind: openFind, closeFind: closeFind, search: search, reset: reset, hits: function () { return hits; }, norm: norm };
})();
