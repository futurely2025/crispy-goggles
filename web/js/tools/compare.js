/* Compare PDF — two versions side by side: visual differences per page (boxes + % changed), word-level text
 * differences, and an overlay view. Pages are rendered lazily; a background pass finds the changed pages. */
(function () {
  'use strict';
  var h = T.h, main = T.shell('compare');
  var A = null, B = null, view = 'side', diffs = [], textRes = null, changeList = [], cur = -1, bgToken = 0, scale = 1;
  var DW = 560;                                     // CSS width of one page column at 100%

  function slot(label, key, color) {
    var name = h('div', { class: 'nm', style: 'font-weight:700' }), meta = h('div', { class: 'tl-muted' });
    var zone = T.dropzone({ accept: '.pdf,application/pdf', label: label, hint: 'اسحب الملف أو اضغط', test: T.isPdf, onFiles: function (fs) { load(key, fs[0]); } });
    zone.classList.add('small');
    var box = h('div', { class: 'tl-card', style: 'border-top:4px solid ' + color }, [h('div', { class: 'tl-muted', text: label }), name, meta, zone]);
    box.set = function (d) { name.textContent = d.name; meta.textContent = d.pages + ' صفحة · ' + T.fmtSize(d.bytes.length); zone.querySelector('b').textContent = 'استبدال الملف'; };
    return box;
  }
  var slotA = slot('الأصل (القديم)', 'A', '#c2352b'), slotB = slot('المعدّل (الجديد)', 'B', '#1f8a4c');
  var summary = h('div', { class: 'tl-card', hidden: true });
  var viewSeg = T.segmented([['side', 'جنباً إلى جنب'], ['text', 'فروق النص'], ['overlay', 'تراكب']], view, function (v) { view = v; render(); });
  var navInfo = h('b', { text: '—' });
  var prevB = h('button', { class: 'tl-btn sm', type: 'button', text: '→ السابق', onclick: function () { step(-1); } }), nextB = h('button', { class: 'tl-btn sm', type: 'button', text: 'التالي ←', onclick: function () { step(1); } });
  var zoomIn = h('button', { class: 'tl-btn sm', type: 'button', text: '＋', 'aria-label': 'تكبير', onclick: function () { zoom(1.15); } }), zoomOut = h('button', { class: 'tl-btn sm', type: 'button', text: '－', 'aria-label': 'تصغير', onclick: function () { zoom(1 / 1.15); } });
  var toolbar = h('div', { class: 'tl-card tl-row wrap', style: 'position:sticky;top:60px;z-index:30;padding:10px', hidden: true }, [viewSeg, h('span', { style: 'flex:1' }), prevB, navInfo, nextB, h('span', { class: 'sep' }), zoomOut, zoomIn]);
  var stage = h('div', { class: 'tl-card', hidden: true, style: 'padding:12px;overflow:auto' });
  var prog = h('div', { class: 'tl-bar', hidden: true }, h('i'));
  main.appendChild(h('div', { class: 'tl-grid2' }, [slotA, slotB])); main.appendChild(summary); main.appendChild(prog); main.appendChild(toolbar); main.appendChild(stage);
  var style = h('style', { text: '.cmp-row{margin-bottom:22px}.cmp-h{display:flex;gap:10px;align-items:center;margin:0 0 6px;font-weight:700}.cmp-cols{display:flex;gap:14px;align-items:flex-start;justify-content:center}.cmp-pg{position:relative;line-height:0;box-shadow:0 2px 10px rgba(0,0,0,.2);background:#fff}.cmp-pg canvas{width:100%;height:auto;display:block}.cmp-box{position:absolute;border:2px solid;border-radius:3px;pointer-events:none}.cmp-box.a{border-color:#c2352b;background:rgba(194,53,43,.16)}.cmp-box.b{border-color:#1f8a4c;background:rgba(31,138,76,.16)}.cmp-box.on{box-shadow:0 0 0 4px rgba(255,193,7,.7)}.cmp-badge{padding:1px 10px;border-radius:999px;font-size:12px;background:var(--tq-soft)}.cmp-badge.d{background:#fdeceb;color:var(--danger)}.cmp-ph{display:grid;place-items:center;background:#eef2f4;color:var(--muted);line-height:1.5}.cmp-txt{font-size:15px;line-height:2;white-space:pre-wrap}ins.cmp{background:#d8f3e3;color:#145c34;text-decoration:none;border-radius:3px;padding:0 2px}del.cmp{background:#fbdcd9;color:#8f261e;border-radius:3px;padding:0 2px}.cmp-ctx{color:var(--muted)}.cmp-item{padding:10px 12px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;cursor:pointer;background:#fff}.cmp-item:hover{border-color:var(--tool)}' });
  document.head.appendChild(style);

  // ------------------------------------------------------------ loading
  function load(key, file) {
    T.task('جارٍ فتح الملف…', function () { return T.openPdf(file); }).then(function (d) {
      if (key === 'A') { if (A) try { A.pdf.destroy(); } catch (e) { /* ignore */ } A = d; slotA.set(d); } else { if (B) try { B.pdf.destroy(); } catch (e) { /* ignore */ } B = d; slotB.set(d); }
      if (A && B) analyse();
    }, function (e) { T.fail(e, 'تعذّر فتح الملف'); });
  }

  // ------------------------------------------------------------ analysis (background)
  function analyse() {
    var token = ++bgToken, n = Math.max(A.pages, B.pages);
    diffs = new Array(n); textRes = null; changeList = []; cur = -1;
    summary.hidden = false; toolbar.hidden = false; stage.hidden = false; prog.hidden = false; prog.firstChild.style.width = '0%';
    summary.innerHTML = ''; summary.appendChild(h('span', { class: 'tl-muted', text: 'جارٍ تحليل الفروق…' }));
    stage.innerHTML = ''; navInfo.textContent = '—';
    var chain = Promise.resolve();
    for (var i = 0; i < n; i++) (function (k) {
      chain = chain.then(function () {
        if (token !== bgToken) throw 'stale';
        prog.firstChild.style.width = Math.round(k / n * 85) + '%';
        return pageDiff(k + 1).then(function (r) { diffs[k] = r; });
      });
    })(i);
    chain.then(function () { prog.firstChild.style.width = '90%'; return textDiff(); }).then(function (t) {
      if (token !== bgToken) return;
      textRes = t; prog.hidden = true; buildChangeList(); renderSummary(); render();
    }, function (e) { if (e !== 'stale') { prog.hidden = true; T.fail(e, 'تعذّرت المقارنة'); } });
  }
  function grab(doc, n, w) { return n <= doc.pages ? T.renderPage(doc.pdf, n, { width: w, read: true }) : Promise.resolve(null); }
  function pageDiff(n) {
    var W = 520;
    return Promise.all([grab(A, n, W), grab(B, n, W)]).then(function (cs) {
      var a = cs[0], b = cs[1];
      if (!a || !b) return { n: n, missing: !a ? 'A' : 'B', pct: 100, boxes: [] };
      // bring B to A's size when the pages differ in size
      var bb = b;
      if (b.width !== a.width || b.height !== a.height) { bb = document.createElement('canvas'); bb.width = a.width; bb.height = a.height; var g = bb.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, bb.width, bb.height); g.drawImage(b, 0, 0, a.width, a.height); }
      var w = a.width, hh = a.height, da = a.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, hh).data, db = bb.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, hh).data;
      var CELL = 10, cw = Math.ceil(w / CELL), ch = Math.ceil(hh / CELL), cnt = new Uint16Array(cw * ch), changed = 0;
      for (var y = 0; y < hh; y++) for (var x = 0; x < w; x++) { var p = (y * w + x) * 4; if (Math.abs(da[p] - db[p]) + Math.abs(da[p + 1] - db[p + 1]) + Math.abs(da[p + 2] - db[p + 2]) > 90) { changed++; cnt[((y / CELL) | 0) * cw + ((x / CELL) | 0)]++; } }
      var mark = new Uint8Array(cw * ch); for (var i = 0; i < mark.length; i++) mark[i] = cnt[i] >= 3 ? 1 : 0;
      // merge neighbouring cells (dilate by 2 cells) into boxes
      var seen = new Uint8Array(cw * ch), boxes = [];
      for (var s = 0; s < mark.length; s++) {
        if (!mark[s] || seen[s]) continue;
        var stack = [s], x0 = cw, y0 = ch, x1 = 0, y1 = 0; seen[s] = 1;
        while (stack.length) {
          var c = stack.pop(), cx = c % cw, cy = (c / cw) | 0; x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
          for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) { var nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue; var ni = ny * cw + nx; if (mark[ni] && !seen[ni]) { seen[ni] = 1; stack.push(ni); } }
        }
        boxes.push({ x: Math.max(0, x0 * CELL - 4) / w, y: Math.max(0, y0 * CELL - 4) / hh, w: Math.min(w, (x1 - x0 + 1) * CELL + 8) / w, h: Math.min(hh, (y1 - y0 + 1) * CELL + 8) / hh });
      }
      a.width = a.height = 1; b.width = b.height = 1;
      return { n: n, pct: changed / (w * hh) * 100, boxes: boxes, sizeDiff: (A.pages >= n && B.pages >= n) && (Math.abs(a.width / a.height - b.width / b.height) > 0.01) };
    });
  }

  // ------------------------------------------------------------ text
  function pageTokens(doc, n) {
    return doc.pdf.getPage(n).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
      var s = '', lastY = null;
      tc.items.forEach(function (it) { if (!it.str && !it.hasEOL) return; var y = it.transform ? Math.round(it.transform[5]) : 0; if (lastY !== null && Math.abs(y - lastY) > 3 && !/\s$/.test(s)) s += ' '; s += it.str + (it.hasEOL ? ' ' : ''); lastY = y; });
      return s.replace(/[ً-ٰٟـ]/g, '').split(/\s+/).filter(Boolean);       // ignore tashkeel & tatweel
    });
  }
  function allTokens(doc) {
    var out = [], chain = Promise.resolve();
    for (var i = 1; i <= doc.pages; i++) (function (n) { chain = chain.then(function () { return pageTokens(doc, n).then(function (t) { t.forEach(function (w) { out.push({ w: w, p: n }); }); }); }); })(i);
    return chain.then(function () { return out; });
  }
  function textDiff() {
    return Promise.all([allTokens(A), allTokens(B), T.jsdiff()]).then(function (r) {
      var ta = r[0], tb = r[1], D = r[2];
      var parts = D.diffArrays(ta.map(function (x) { return x.w; }), tb.map(function (x) { return x.w; }));
      var ia = 0, ib = 0, chunks = [];
      parts.forEach(function (p) {
        var n = p.value.length;
        if (p.added) { chunks.push({ t: 'add', words: p.value, pa: ta[Math.min(ia, ta.length - 1)] ? ta[Math.min(ia, ta.length - 1)].p : 1, pb: tb[ib] ? tb[ib].p : B.pages }); ib += n; }
        else if (p.removed) { chunks.push({ t: 'del', words: p.value, pa: ta[ia] ? ta[ia].p : A.pages, pb: tb[Math.min(ib, tb.length - 1)] ? tb[Math.min(ib, tb.length - 1)].p : 1 }); ia += n; }
        else { chunks.push({ t: 'eq', words: p.value, pa: ta[ia] ? ta[ia].p : 1, pb: tb[ib] ? tb[ib].p : 1 }); ia += n; ib += n; }
      });
      // merge a removal directly followed by an addition into one "changed" item
      var items = [];
      for (var i = 0; i < chunks.length; i++) {
        var c = chunks[i];
        if (c.t === 'eq') { items.push(c); continue; }
        var it = { t: 'chg', del: [], add: [], pa: c.pa, pb: c.pb };
        while (i < chunks.length && chunks[i].t !== 'eq') { if (chunks[i].t === 'del') it.del = it.del.concat(chunks[i].words); else it.add = it.add.concat(chunks[i].words); i++; }
        i--; items.push(it);
      }
      return { items: items, changes: items.filter(function (x) { return x.t === 'chg'; }).length, wordsA: ta.length, wordsB: tb.length, scanned: ta.length < 5 && tb.length < 5 };
    });
  }

  // ------------------------------------------------------------ changes list & summary
  function buildChangeList() {
    changeList = [];
    diffs.forEach(function (d, i) { if (d && (d.missing || d.boxes.length)) changeList.push({ page: i + 1, d: d }); });
  }
  function renderSummary() {
    var pagesChanged = changeList.length, n = diffs.length;
    summary.innerHTML = '';
    var cells = [['الأصل', A.pages + ' صفحة'], ['المعدّل', B.pages + ' صفحة'], ['صفحات فيها فروق مرئية', pagesChanged + ' من ' + n],
      ['فروق النص', textRes.scanned ? 'لا نص (ملف ممسوح)' : textRes.changes + ' موضع']];
    summary.appendChild(h('div', { class: 'tl-row wrap', style: 'gap:26px' }, cells.map(function (c) { return h('div', null, [h('div', { class: 'tl-muted', text: c[0] }), h('b', { style: 'font-size:18px', text: c[1] })]); }).concat(
      !pagesChanged && !textRes.changes ? [h('b', { style: 'color:var(--tool)', text: '✓ الملفان متطابقان' })] : [])));
    navInfo.textContent = pagesChanged ? '0 / ' + pagesChanged : 'لا فروق';
  }

  // ------------------------------------------------------------ views
  function render() {
    stage.innerHTML = '';
    if (!textRes) return;
    prevB.disabled = nextB.disabled = view === 'text' || !changeList.length;
    zoomIn.disabled = zoomOut.disabled = view === 'text';
    if (view === 'text') return renderText();
    var q = T.thumbQueue();
    diffs.forEach(function (d, i) {
      var n = i + 1, row = h('div', { class: 'cmp-row', id: 'row' + n });
      row.appendChild(h('div', { class: 'cmp-h' }, [h('span', { text: 'صفحة ' + n }), d.missing ? h('span', { class: 'cmp-badge d', text: d.missing === 'A' ? 'صفحة جديدة في المعدّل' : 'صفحة محذوفة من المعدّل' }) : d.boxes.length ? h('span', { class: 'cmp-badge d', text: d.boxes.length + ' موضع · ' + d.pct.toFixed(d.pct < 1 ? 2 : 1) + '%' }) : h('span', { class: 'cmp-badge', text: 'متطابقة' })]));
      var cols = h('div', { class: 'cmp-cols' });
      var w = Math.round(DW * scale);
      if (view === 'side') {
        cols.appendChild(pageBox(A, n, w, d, 'a', q)); cols.appendChild(pageBox(B, n, w, d, 'b', q));
      } else cols.appendChild(overlayBox(n, w, q));
      row.appendChild(cols); stage.appendChild(row);
    });
    markCurrent();
  }
  function pageBox(doc, n, w, d, side, q) {
    var box = h('div', { class: 'cmp-pg', style: 'width:' + w + 'px' });
    if (n > doc.pages) { box.className = 'cmp-pg cmp-ph'; box.style.height = Math.round(w * 1.41) + 'px'; box.textContent = 'لا توجد صفحة'; return box; }
    var ph = h('div', { class: 'cmp-ph', style: 'width:100%;aspect-ratio:1/1.41', text: '…' }); box.appendChild(ph);
    T.lazyThumb(box, function () { q(function () { return T.renderPage(doc.pdf, n, { width: w * Math.min(2, window.devicePixelRatio || 1) }).then(function (c) { ph.replaceWith(c); }); }); });
    (d.boxes || []).forEach(function (b, k) { var e = h('div', { class: 'cmp-box ' + side, 'data-k': k, style: 'left:' + b.x * 100 + '%;top:' + b.y * 100 + '%;width:' + b.w * 100 + '%;height:' + b.h * 100 + '%' }); box.appendChild(e); });
    return box;
  }
  function overlayBox(n, w, q) {
    var box = h('div', { class: 'cmp-pg', style: 'width:' + w + 'px' }); var ph = h('div', { class: 'cmp-ph', style: 'width:100%;aspect-ratio:1/1.41', text: '…' }); box.appendChild(ph);
    var d = diffs[n - 1];
    T.lazyThumb(box, function () { q(function () {
      var W = w * Math.min(2, window.devicePixelRatio || 1);
      return Promise.all([grab(A, n, W), grab(B, n, W)]).then(function (cs) {
        var a = cs[0] || cs[1], b = cs[1] || cs[0], bb = b;
        if (b.width !== a.width || b.height !== a.height) { bb = document.createElement('canvas'); bb.width = a.width; bb.height = a.height; var g0 = bb.getContext('2d'); g0.fillStyle = '#fff'; g0.fillRect(0, 0, bb.width, bb.height); g0.drawImage(b, 0, 0, a.width, a.height); }
        var out = document.createElement('canvas'); out.width = a.width; out.height = a.height; var g = out.getContext('2d');
        var ia = a.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, a.width, a.height), ib = bb.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, a.width, a.height), o = g.createImageData(a.width, a.height);
        for (var i = 0; i < o.data.length; i += 4) {
          var la = (ia.data[i] * 0.3 + ia.data[i + 1] * 0.59 + ia.data[i + 2] * 0.11), lb = (ib.data[i] * 0.3 + ib.data[i + 1] * 0.59 + ib.data[i + 2] * 0.11);
          o.data[i] = lb; o.data[i + 1] = la; o.data[i + 2] = la; o.data[i + 3] = 255;           // A-only ink = cyan-ish, B-only ink = red, shared = black/gray
          // shared ink stays dark; ink only in the old file shows cyan; only in the new file shows red
          if (la > 235 && lb > 235) { o.data[i] = o.data[i + 1] = o.data[i + 2] = 255; }
        }
        g.putImageData(o, 0, 0); ph.replaceWith(out); a.width = a.height = 1; if (bb !== b) bb.width = bb.height = 1; b.width = b.height = 1;
      });
    }); });
    return box;
  }
  function renderText() {
    var t = textRes;
    if (t.scanned) { stage.appendChild(h('p', { class: 'tl-muted', text: 'لا يوجد نص قابل للقراءة في الملفين (ملفات ممسوحة ضوئياً). استخدم عرض «جنباً إلى جنب» أو «تراكب» للمقارنة البصرية.' })); return; }
    if (!t.changes) { stage.appendChild(h('p', { style: 'color:var(--tool);font-weight:700', text: '✓ النصان متطابقان كلمةً بكلمة.' })); return; }
    stage.appendChild(h('div', { class: 'tl-row wrap', style: 'margin-bottom:12px' }, [h('b', { text: t.changes + ' موضع تغيير' }), h('span', { class: 'tl-muted', text: '· كلمات الأصل ' + t.wordsA + ' · كلمات المعدّل ' + t.wordsB }),
      h('span', { class: 'tl-row' }, [h('del', { class: 'cmp', text: 'محذوف' }), h('ins', { class: 'cmp', text: 'مضاف' })])]));
    var CTX = 7, k = 0;
    t.items.forEach(function (it, idx) {
      if (it.t !== 'chg') return;
      k++;
      var prev = t.items[idx - 1], next = t.items[idx + 1];
      var before = prev && prev.t === 'eq' ? prev.words.slice(-CTX).join(' ') : '', after = next && next.t === 'eq' ? next.words.slice(0, CTX).join(' ') : '';
      var card = h('div', { class: 'cmp-item', dir: 'auto', title: 'اذهب إلى الصفحة', onclick: function () { view = 'side'; viewSeg.querySelector('[data-v=side]').click(); setTimeout(function () { var r = document.getElementById('row' + it.pa); r && r.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 120); } }, [
        h('div', { class: 'tl-muted', style: 'font-size:12px', text: '#' + k + ' · صفحة ' + it.pa + (it.pb !== it.pa ? ' ← ' + it.pb : '') }),
        h('div', { class: 'cmp-txt' }, [h('span', { class: 'cmp-ctx', text: (before ? '… ' + before + ' ' : '') }), it.del.length ? h('del', { class: 'cmp', text: it.del.join(' ') }) : null, it.del.length && it.add.length ? ' ' : null, it.add.length ? h('ins', { class: 'cmp', text: it.add.join(' ') }) : null, h('span', { class: 'cmp-ctx', text: (after ? ' ' + after + ' …' : '') })])]);
      stage.appendChild(card);
    });
  }

  // ------------------------------------------------------------ navigation
  function step(d) {
    if (!changeList.length) return;
    cur = cur < 0 ? (d > 0 ? 0 : changeList.length - 1) : (cur + d + changeList.length) % changeList.length;
    markCurrent(true);
  }
  function markCurrent(scroll) {
    if (cur < 0 || !changeList.length) { navInfo.textContent = changeList.length ? '0 / ' + changeList.length : navInfo.textContent; return; }
    navInfo.textContent = (cur + 1) + ' / ' + changeList.length + ' (صفحة ' + changeList[cur].page + ')';
    [].forEach.call(stage.querySelectorAll('.cmp-box.on'), function (e) { e.classList.remove('on'); });
    var row = document.getElementById('row' + changeList[cur].page);
    if (row) { [].forEach.call(row.querySelectorAll('.cmp-box'), function (e) { e.classList.add('on'); }); if (scroll) row.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }
  function zoom(f) { scale = Math.max(0.4, Math.min(2.2, scale * f)); render(); }
})();
