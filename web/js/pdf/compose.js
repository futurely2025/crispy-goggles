/* Compose — turns the editor's "insert" message (text lines, equations, figures, tables) into one SVG block,
 * laid out like the final preview: right-to-left lines with word wrapping, equations on the text baseline,
 * figures and tables centred on their own lines. Used by the PDF studio (and anything that needs one picture). */
(function (global) {
  'use strict';
  var AR = /[؀-ۿ]/;
  var ctx2d = null;
  function measure(text, font) {
    if (!ctx2d) ctx2d = document.createElement('canvas').getContext('2d');
    ctx2d.font = font;
    return ctx2d.measureText(text).width;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function inner(svgString) {           // nested svg element (keeps its viewBox), sized by the caller
    return svgString.replace(/^<\?xml[^>]*>/, '');
  }
  function nest(svgString, x, y, w, h) {
    return inner(svgString).replace(/<svg\b([^>]*)>/, function (m0, a) {
      a = a.replace(/\s(width|height|x|y|style)="[^"]*"/g, '');
      return '<svg' + a + ' x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) + '" overflow="visible">';
    });
  }

  function eqPreview(tex, o) {
    return global.RenderHost.preview(tex, o, true).then(function (r) {
      if (r.errors && r.errors.length) throw new Error(r.errors.join(' — '));
      return r;
    });
  }

  // ------------------------------------------------------------ tables → SVG
  function tableSvg(t, o, fontPx) {
    var rtl = t.rows.some(function (r) { return r.cells.some(function (c) { return c.segs.some(function (s) { return s.t === 'text' && AR.test(s.v); }); }); }) || o.rtl;
    var jobs = [];
    t.rows.forEach(function (r) { r.cells.forEach(function (c) { c.segs.forEach(function (s) {
      if (s.t === 'math') jobs.push(eqPreview(s.v, Object.assign({}, o, { mode: s.mode || 'math', display: false })).then(function (p) { s.p = p; }, function () { s.p = null; }));
    }); }); });
    return Promise.all(jobs).then(function () {
      var font = function (b) { return (b ? '700 ' : '400 ') + fontPx + 'px Amiri, "Times New Roman", serif'; };
      var pad = fontPx * 0.5, n = t.ncol || 1, colW = [], rowH = [];
      for (var i = 0; i < n; i++) colW.push(fontPx * 1.6);
      var cellInfo = t.rows.map(function (r, ri) {
        var col = 0, head = ri === 0 && t.header;
        return r.cells.map(function (c) {
          var w = 0, asc = fontPx * 0.8, dsc = fontPx * 0.3;
          var parts = c.segs.map(function (s) {
            if (s.t === 'math' && s.p) { var pw = s.p.width * fontPx, ph = s.p.height * fontPx, pd = s.p.depth * fontPx; asc = Math.max(asc, ph); dsc = Math.max(dsc, pd); w += pw + 3; return { m: s.p, w: pw, h: ph, d: pd }; }
            var tw = measure(s.v, font(head || c.bold || r.total)); w += tw + 3; return { t: s.v, w: tw };
          });
          var info = { c: c, col: col, span: c.span || 1, parts: parts, w: w, asc: asc, dsc: dsc, bold: head || c.bold || r.total, fill: head || r.total };
          if (info.span === 1) colW[col] = Math.max(colW[col], w + 2 * pad);
          col += info.span;
          return info;
        });
      });
      cellInfo.forEach(function (cells) { cells.forEach(function (ci) {
        if (ci.span > 1) { var have = 0; for (var k = 0; k < ci.span; k++) have += colW[ci.col + k] || 0; if (have < ci.w + 2 * pad) colW[ci.col + ci.span - 1] += ci.w + 2 * pad - have; }
      }); });
      cellInfo.forEach(function (cells, ri) { rowH[ri] = Math.max.apply(null, cells.map(function (ci) { return ci.asc + ci.dsc; }).concat([fontPx * 1.1])) + pad * 1.2; });
      var W = colW.reduce(function (a, b) { return a + b; }, 0), H = rowH.reduce(function (a, b) { return a + b; }, 0);
      var colX = []; var acc = 0;
      for (var q = 0; q < n; q++) { colX.push(rtl ? W - acc - colW[q] : acc); acc += colW[q]; }
      var fill = t.color || '#E2F5F3', stroke = '#5F7179', out = '', y = 0;
      cellInfo.forEach(function (cells, ri) {
        cells.forEach(function (ci) {
          var cw = 0; for (var k = 0; k < ci.span; k++) cw += colW[ci.col + k];
          var cx = rtl ? colX[ci.col + ci.span - 1] : colX[ci.col];
          if (ci.fill) out += '<rect x="' + cx.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + cw.toFixed(2) + '" height="' + rowH[ri].toFixed(2) + '" fill="' + fill + '"/>';
          if (t.border !== false) out += '<rect x="' + cx.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + cw.toFixed(2) + '" height="' + rowH[ri].toFixed(2) + '" fill="none" stroke="' + stroke + '" stroke-width="0.8"/>';
          var base = y + rowH[ri] / 2 + (ci.asc - ci.dsc) / 2, px = cx + (cw - ci.w) / 2;
          var seq = rtl ? ci.parts.slice().reverse() : ci.parts;
          seq.forEach(function (p) {
            if (p.m) out += nest(p.m.svgString, px, base - p.h, p.w, p.h + p.d);
            else out += '<text x="' + (px + p.w / 2).toFixed(2) + '" y="' + base.toFixed(2) + '" text-anchor="middle" direction="' + (AR.test(p.t) ? 'rtl' : 'ltr') + '" font-family="Amiri, Times New Roman, serif" font-size="' + fontPx.toFixed(2) + '"' + (p.bold || ci.bold ? ' font-weight="700"' : '') + ' fill="#1b2a30">' + esc(p.t) + '</text>';
            px += p.w + 3;
          });
        });
        y += rowH[ri];
      });
      return { body: out, w: W, h: H };
    });
  }

  /** msg: editor insert message → Promise<{svg, w, h}>  (maxW in px) */
  function compose(msg, maxW) {
    maxW = maxW || 560;
    var o = Object.assign({}, msg.opts || {});
    var fontPx = (+o.fontSize || 14) * 96 / 72, rtl = o.rtl !== false && msg.mode !== 'chem';
    var textFont = (msg.textBold ? '700 ' : '400 ') + fontPx + 'px Amiri, "Times New Roman", serif';
    var textColor = msg.textColor || '#1b2a30';
    var lines = [], byLine = {};
    (msg.equations || []).forEach(function (it) {
      var ln = it.line === undefined ? lines.length : it.line;
      if (!byLine[ln]) { byLine[ln] = []; lines.push({ line: ln, items: byLine[ln] }); }
      byLine[ln].push(it);
    });
    lines.sort(function (a, b) { return a.line - b.line; });
    var ready = document.fonts && document.fonts.load ? document.fonts.load(textFont, 'أب').catch(function () {}) : Promise.resolve();
    return ready.then(function () {
      var jobs = [];
      lines.forEach(function (L) {
        L.items.forEach(function (it) {
          if (it.kind === 'text') { it.__words = String(it.text).split(/\s+/).filter(Boolean).map(function (w) { return { t: w, w: measure(w, textFont) }; }); return; }
          if (it.kind === 'figure') {
            jobs.push(global.Figures.render(it.fig, it.data).then(function (r) { it.__fig = r; })); return;
          }
          if (it.kind === 'table') { jobs.push(tableSvg(it.table, o, fontPx * 0.86).then(function (r) { it.__tbl = r; })); return; }
          var oe = Object.assign({}, o, { mode: it.mode || msg.mode || 'math', display: !!o.display });
          jobs.push(eqPreview(it.tex, oe).then(function (p) { it.__eq = p; }));
        });
      });
      return Promise.all(jobs);
    }).then(function () {
      var out = '', y = 0, width = 0, gap = fontPx * 0.3, lineGap = fontPx * 0.45, minX = Infinity, maxX = -Infinity;
      var span = function (a, b) { minX = Math.min(minX, a); maxX = Math.max(maxX, b); };
      lines.forEach(function (L) {
        var blocks = L.items.filter(function (it) { return it.__fig || it.__tbl; });
        if (blocks.length) {
          blocks.forEach(function (it) {
            var w = it.__fig ? it.__fig.w : it.__tbl.w, h = it.__fig ? it.__fig.h : it.__tbl.h, k = Math.min(1, maxW / w);
            var bw = w * k, bh = h * k, x = (maxW - bw) / 2;
            if (it.__fig) out += nest(it.__fig.svg, x, y, bw, bh);
            else out += '<g transform="translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ') scale(' + k.toFixed(4) + ')">' + it.__tbl.body + '</g>';
            y += bh + lineGap; width = Math.max(width, bw); span(x, x + bw);
          });
          return;
        }
        // tokens: words and equations, wrapped to maxW
        var toks = [];
        L.items.forEach(function (it) {
          if (it.__words) it.__words.forEach(function (w) { toks.push({ t: w.t, w: w.w, asc: fontPx * 0.82, dsc: fontPx * 0.32 }); });
          else if (it.__eq) toks.push({ eq: it.__eq, w: it.__eq.width * fontPx, asc: it.__eq.height * fontPx, dsc: it.__eq.depth * fontPx });
        });
        // consecutive non-Arabic words inside a right-to-left line keep their own left-to-right order
        if (rtl) toks = toks.reduce(function (acc, t) {
          var p = acc[acc.length - 1];
          if (p && !p.eq && !t.eq && /[A-Za-z]/.test(p.t) && /[A-Za-z]/.test(t.t) && !AR.test(p.t) && !AR.test(t.t)) { p.t += ' ' + t.t; p.w = measure(p.t, textFont); return acc; }
          acc.push(t); return acc;
        }, []);
        var rows = [], cur = [], cw = 0;
        toks.forEach(function (t) {
          var gp = cur.length && cur[cur.length - 1].eq && t.eq ? fontPx * 1.1 : gap;
          if (cur.length && cw + gp + t.w > maxW) { rows.push({ toks: cur, w: cw }); cur = []; cw = 0; gp = 0; }
          cw += (cur.length ? gp : 0) + t.w; cur.push(t);
        });
        if (cur.length) rows.push({ toks: cur, w: cw });
        var onlyEq = L.items.every(function (it) { return it.__eq; });
        rows.forEach(function (r) {
          var asc = Math.max.apply(null, r.toks.map(function (t) { return t.asc; })), dsc = Math.max.apply(null, r.toks.map(function (t) { return t.dsc; }));
          var base = y + asc;
          var start = onlyEq && o.display ? (maxW + (rtl ? r.w : -r.w)) / 2 : (rtl ? maxW : 0);
          var x = start;
          r.toks.forEach(function (t, ti) {
            var next = r.toks[ti + 1];
            var x0 = rtl ? x - t.w : x;
            if (t.eq) out += nest(t.eq.svgString, x0, base - t.asc, t.w, t.asc + t.dsc);
            else {
              var tAttr = ' font-family="Amiri, Times New Roman, serif" font-size="' + fontPx.toFixed(2) + '"' + (msg.textBold ? ' font-weight="700"' : '') + ' fill="' + esc(textColor) + '">';
              var bm = AR.test(t.t) && /[()\[\]{}«»]/.test(t.t) ? t.t.match(/^([(\[{«]*)([\s\S]*?)([)\]}».:،؛!?]*)$/) : null;
              if (bm && bm[2] && !/[()\[\]{}«»]/.test(bm[2])) {
                // brackets around an Arabic word: drawn apart, already mirrored (Amiri mirrors them wrongly inside RTL text)
                var MIR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '«': '»', '»': '«' };
                var mir = function (q) { return q.split('').reverse().map(function (c) { return MIR[c] || c; }).join(''); };
                var tf = textFont, px = x0, parts = [[mir(bm[3]), 0], [bm[2], 1], [mir(bm[1]), 0]];
                parts.forEach(function (pt) {
                  if (!pt[0]) return;
                  var pw = measure(pt[0], tf);
                  out += '<text x="' + px.toFixed(2) + '" y="' + base.toFixed(2) + '"' + (pt[1] ? ' style="direction:rtl" direction="rtl" text-anchor="end"' : ' style="direction:ltr" direction="ltr"') + tAttr + esc(pt[0]) + '</text>';
                  px += pw;
                });
              } else out += '<text x="' + x0.toFixed(2) + '" y="' + base.toFixed(2) + '"' + (AR.test(t.t) ? ' style="direction:rtl" direction="rtl" text-anchor="end"' : ' style="direction:ltr" direction="ltr"') + tAttr + esc(t.t) + '</text>';
            }
            span(x0, x0 + t.w);
            var g2 = t.eq && next && next.eq ? fontPx * 1.1 : gap;          // two equations side by side: a wider gap
            x = rtl ? x0 - g2 : x0 + t.w + g2;
          });
          width = Math.max(width, r.w);
          y = base + dsc + lineGap;
        });
      });
      var H = Math.max(1, y - lineGap + 2);
      if (!isFinite(minX)) { minX = 0; maxX = 1; }
      var x0 = minX - 2, W = maxX - minX + 4;
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W.toFixed(2) + '" height="' + H.toFixed(2) + '" viewBox="' + x0.toFixed(2) + ' 0 ' + W.toFixed(2) + ' ' + H.toFixed(2) + '">' + out + '</svg>';
      return { svg: svg, w: W, h: H };
    });
  }

  global.Compose = { compose: compose, tableSvg: tableSvg };
})(window);
