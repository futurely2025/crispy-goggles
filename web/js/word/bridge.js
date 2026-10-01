/* Word bridge: insert / find / update equation images through Office.js */
(function (global) {
  'use strict';
  var MARK = 'ARMATH1:';

  function xmlEsc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // meta stored in the picture's alt text:  ARMATH1:{"v":2,"id":..,"m":"math","t":"..","o":{..}}
  function metaString(m) { return MARK + JSON.stringify(m); }
  function parseMeta(descr) {
    if (!descr || descr.indexOf(MARK) !== 0) return null;
    try {
      var m = JSON.parse(descr.slice(MARK.length));
      if (!m) return null;
      m.m = m.m || (m.o && m.o.mode) || 'math';
      m.o = m.o || {};
      return m;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------ vector (SVG) state
  // Word 365 draws the SVG part; older readers (and anything that ignores the extension) use the PNG beside it.
  // If Word ever refuses a package with SVG we remember it and continue with PNG only.
  var SVG_FAIL = 'armath.svgFailed';
  var svgOn = true;
  var figClear = false;                                 // figures without their white background (setting)
  function figSvg(svg) { return figClear && global.Look ? Look.stripBg(svg) : svg; }
  // a figure's own background (5.4): undefined = follow the setting, 'none' = transparent, '#fff' / any colour
  function bgSvg(svg, bg) {
    if (bg === undefined || bg === null || bg === '') return figSvg(svg);
    var s = global.Look ? Look.stripBg(svg) : svg;
    if (bg === 'none' || bg === 'transparent') return s;
    var vb = (s.match(/<svg[^>]*\sviewBox="([^"]+)"/) || [])[1], x = 0, y = 0, w, h;
    if (vb) { var a = vb.trim().split(/[\s,]+/).map(Number); x = a[0]; y = a[1]; w = a[2]; h = a[3]; }
    else { w = parseFloat((s.match(/<svg[^>]*\swidth="([\d.]+)/) || [])[1]); h = parseFloat((s.match(/<svg[^>]*\sheight="([\d.]+)/) || [])[1]); }
    if (!(w > 0 && h > 0)) return s;
    return s.replace(/(<svg[^>]*>)/, '$1<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + xmlEsc(bg) + '" stroke="none"/>');
  }
  function figItem(kind, data, dpi, id, bg) {
    return Figures.render(kind, data).then(function (r) {
      var svg = bgSvg(r.svg, bg), clear = bg === undefined || bg === null || bg === '' ? figClear : bg === 'none' || bg === 'transparent';
      return Promise.all([Raster.png(svg, r.w, r.h, dpi, clear), vectorOf(svg)]).then(function (res) {
        var p = res[0], k2 = Math.min(1, 460 / p.widthPt);
        var meta = { v: 3, id: id || newId(), k: kind, d: data, o: { display: true } };
        if (bg !== undefined && bg !== null && bg !== '') meta.bg = bg;
        return { r: { pngBase64: p.pngBase64, svgVector: res[1], widthPt: p.widthPt * k2, heightPt: p.heightPt * k2, depthPt: 0 }, meta: metaString(meta), figure: true, title: Figures.label(kind, 'ar'), id: meta.id };
      });
    });
  }
  // 5.7: a refusal is no longer permanent — PNG only for this session and the next 24 h, then SVG (sharp at any zoom)
  // is tried again (an old «1» from earlier versions is retried once). Word falls back to PNG by itself if it refuses again.
  var svgFailSession = false;
  function svgFailed() {
    if (svgFailSession) return true;
    try { var v = +localStorage.getItem(SVG_FAIL) || 0; return v > 1 && Date.now() - v < 864e5; } catch (e) { return false; }
  }
  function svgActive() { return svgOn && !svgFailed() && !!global.Vector && global.Vector.supported(); }
  function markSvgFailed(e) { if (global.ArLog) ArLog.warn('svg-insert', 'Word refused SVG, using PNG only: ' + ((e && (e.message || e.code)) || e)); svgFailSession = true; try { localStorage.setItem(SVG_FAIL, String(Date.now())); } catch (x) { /* ignore */ } if (global.console) console.warn('SVG insert failed, using PNG only', e); }
  function hasSvg(items) {
    return (items || []).some(function (it) {
      if (it.r && it.r.svgVector) return true;
      return it.kind === 'table' && it.table.rows.some(function (r) { return r.cells.some(function (c) { return c.segs.some(function (sg) { return sg.r && sg.r.svgVector; }); }); });
    });
  }
  function withSvgFallback(run, items) {
    var useSvg = svgActive() && (items === undefined || hasSvg(items));
    return run(!useSvg).catch(function (e) {
      if (!useSvg) throw e;
      markSvgFailed(e);
      return run(true);
    });
  }
  function vectorOf(svgString) {
    if (!svgActive() || !svgString) return Promise.resolve(null);
    return global.Vector.fromSVG(svgString).catch(function (e) { if (global.console) console.warn('vector conversion failed', e); return null; });
  }

  function imageRun(r, meta, rid, title, svgRid) {
    var cx = Math.max(1, Math.round(r.widthPt * 12700));
    var cy = Math.max(1, Math.round(r.heightPt * 12700));
    var pos = -Math.round(r.depthPt * 2);
    var id = 1 + Math.floor(Math.random() * 90000000);
    return '<w:r><w:rPr>' + (pos ? '<w:position w:val="' + pos + '"/>' : '') + '</w:rPr>' +
      '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:docPr id="' + id + '" name="ArabicMath ' + id + '" descr="' + xmlEsc(meta) + '" title="' + xmlEsc(title || 'معادلة عربية') + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
      '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:nvPicPr><pic:cNvPr id="0" name="equation.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '">' + (svgRid ? '<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">' +
        '<asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="' + svgRid + '"/></a:ext></a:extLst>' : '') +
      '</a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  }
  var HAS_AR = /[\u0600-\u06FF]/;
  // a real Word paragraph (editable text) — inherits the document's font and size
  function colorTag(c) { var h = String(c || '').replace('#', ''); return /^[0-9a-fA-F]{6}$/.test(h) ? '<w:color w:val="' + h.toUpperCase() + '"/>' : ''; }
  function textRPr(text, o) {
    var rtl = HAS_AR.test(text);
    return '<w:rPr>' + (o.textBold ? '<w:b/><w:bCs/>' : '') + colorTag(o.textColor) + (rtl ? '<w:rtl/>' : '') + '</w:rPr>';
  }
  // a real Word paragraph (editable text) — inherits the document's font and size
  function textPara(text, o, keepNext) {
    var rtl = HAS_AR.test(text);
    return '<w:p><w:pPr>' + (rtl ? '<w:bidi/>' : '') + (keepNext ? '<w:keepNext/>' : '') + '<w:spacing w:before="120" w:after="40"/></w:pPr>' +
      '<w:r>' + textRPr(text, o) + '<w:t xml:space="preserve">' + xmlEsc(text) + '</w:t></w:r></w:p>';
  }
  function textRun(text, o, first, last) {
    return '<w:r>' + textRPr(text, o) + '<w:t xml:space="preserve">' + (first ? '' : ' ') + xmlEsc(text) + (last ? '' : ' ') + '</w:t></w:r>';
  }
  // equation number "(n)" at the far edge, equation centred (tab stops, A4 text width)
  function numberRuns(n, rtl) {
    return '<w:r><w:tab/></w:r><w:r><w:t>(</w:t></w:r>' +
      '<w:fldSimple w:instr=" SEQ Equation \\* ARABIC "><w:r><w:t>' + n + '</w:t></w:r></w:fldSimple>' +
      '<w:r><w:t>)</w:t></w:r>';
  }

  /** items: [{r, meta, line} | {kind:'text', text, line, inline}] ; o: {rtl, display, sep, textBold, textColor, numbered, startNumber} */
  function buildOoxml(items, o) {
    o = o || {};
    var groups = [], byLine = {};
    var img = 0;
    items.forEach(function (it) {
      var ln = it.line === undefined || it.line === null ? 0 : it.line;
      if (!byLine[ln]) { byLine[ln] = []; groups.push({ line: ln, items: byLine[ln] }); }
      byLine[ln].push(it);
      if (it.kind === 'table') it.table.rows.forEach(function (r) { r.cells.forEach(function (c) { c.segs.forEach(function (sg) { if (sg.r) sg.idx = ++img; }); }); });
      else if (it.kind !== 'text') it.idx = ++img;
    });
    groups.sort(function (a, b) { return a.line - b.line; });
    var hasText = items.some(function (it) { return it.kind === 'text'; });
    var inline = groups.length === 1 && !hasText && !o.numbered && !items.some(function (it) { return it.kind === 'table' || it.figure; });
    var sepText = o.sep === 'comma' ? (o.rtl ? '\u060C ' : ', ') : '\u2003\u2003';
    var sepRun = '<w:r><w:rPr>' + (o.rtl ? '<w:rtl/>' : '') + '</w:rPr><w:t xml:space="preserve">' + sepText + '</w:t></w:r>';
    var rels = '', media = '', body = '';
    var num = (o.startNumber || 1) - 1;
    function addImage(idx, r, meta, title) {
      var rid = 'rIdArMath' + idx;
      rels += '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/armath' + idx + '.png"/>';
      media += '<pkg:part pkg:name="/word/media/armath' + idx + '.png" pkg:contentType="image/png" pkg:compression="store">' +
        '<pkg:binaryData>' + r.pngBase64 + '</pkg:binaryData></pkg:part>';
      var svgRid = null;
      if (r.svgVector && !o.noSvg) {
        svgRid = 'rIdArMathS' + idx;
        rels += '<Relationship Id="' + svgRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/armath' + idx + '.svg"/>';
        media += '<pkg:part pkg:name="/word/media/armath' + idx + '.svg" pkg:contentType="image/svg+xml" pkg:compression="store">' +
          '<pkg:binaryData>' + global.Vector.toBase64(r.svgVector) + '</pkg:binaryData></pkg:part>';
      }
      return imageRun(r, meta, rid, title, svgRid);
    }
    function tableXml(t) {
      var ar = HAS_AR.test(JSON.stringify(t.rows.map(function (r) { return r.cells.map(function (c) { return c.segs.map(function (sg) { return sg.t === 'text' ? sg.v : ''; }).join(''); }); })));
      var ncol = t.ncol || 1, colW = Math.round(Math.min(9000, ncol * 1900) / ncol);
      var bd = t.border === false ? 'none' : 'single';
      var borders = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (k) { return '<w:' + k + ' w:val="' + bd + '" w:sz="6" w:space="0" w:color="5F7179"/>'; }).join('') + '</w:tblBorders>';
      var fill = String(t.color || '#E2F5F3').replace('#', '').toUpperCase();
      var x = '<w:tbl><w:tblPr>' + (ar ? '<w:bidiVisual/>' : '') + '<w:jc w:val="center"/>' + borders + '<w:tblLayout w:type="autofit"/>' +
        '<w:tblCellMar><w:left w:w="110" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>';
      for (var c = 0; c < ncol; c++) x += '<w:gridCol w:w="' + colW + '"/>';
      x += '</w:tblGrid>';
      t.rows.forEach(function (row, ri) {
        var head = ri === 0 && t.header, total = !!row.total;
        x += '<w:tr>' + (head ? '<w:trPr><w:tblHeader/><w:jc w:val="center"/></w:trPr>' : '<w:trPr><w:jc w:val="center"/></w:trPr>');
        row.cells.forEach(function (cell) {
          var span = cell.span || 1;
          x += '<w:tc><w:tcPr><w:tcW w:w="' + colW * span + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') +
            (head || total ? '<w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/>' : '') + '<w:vAlign w:val="center"/></w:tcPr>';
          var cellAr = cell.segs.some(function (sg) { return sg.t === 'text' && HAS_AR.test(sg.v); });
          x += '<w:p><w:pPr>' + (cellAr || ar ? '<w:bidi/>' : '') + '<w:spacing w:before="40" w:after="40"/><w:jc w:val="center"/></w:pPr>';
          cell.segs.forEach(function (sg, k) {
            if (sg.t === 'math' && sg.r) x += (k ? '<w:r><w:t xml:space="preserve"> </w:t></w:r>' : '') + addImage(sg.idx, sg.r, sg.meta || '', 'معادلة عربية');
            else if (sg.t === 'math') x += '<w:r><w:t xml:space="preserve">' + xmlEsc(sg.v) + '</w:t></w:r>';
            else x += '<w:r><w:rPr>' + (head || total || cell.bold ? '<w:b/><w:bCs/>' : '') + (HAS_AR.test(sg.v) ? '<w:rtl/>' : '') + '</w:rPr><w:t xml:space="preserve">' + (k ? ' ' : '') + xmlEsc(sg.v) + '</w:t></w:r>';
          });
          x += '</w:p></w:tc>';
        });
        x += '</w:tr>';
      });
      return x + '</w:tbl>';
    }
    groups.forEach(function (g, gi) {
      var tb = g.items.filter(function (x) { return x.kind === 'table'; })[0];
      if (tb) { body += tableXml(tb.table) + (gi === groups.length - 1 ? '<w:p/>' : ''); return; }
      if (g.items.length === 1 && g.items[0].figure) {
        var fi = g.items[0];
        body += '<w:p><w:pPr><w:keepNext w:val="0"/><w:spacing w:before="80" w:after="120"/><w:jc w:val="center"/></w:pPr>' + addImage(fi.idx, fi.r, fi.meta, fi.title) + '</w:p>';
        return;
      }
      var hasEq = g.items.some(function (x) { return x.kind !== 'text'; });
      if (!hasEq) {                                   // text-only line(s) -> normal paragraphs
        g.items.forEach(function (it) {
          var nextIsEq = groups[gi + 1] && groups[gi + 1].items.some(function (x) { return x.kind !== 'text'; });
          body += textPara(it.text, o, nextIsEq);
        });
        return;
      }
      var runs = '', prevEq = false;
      g.items.forEach(function (it, k) {
        if (it.kind === 'text') {
          runs += textRun(it.text, o, k === 0, k === g.items.length - 1);
          prevEq = false;
          return;
        }
        if (prevEq) runs += sepRun;
        runs += addImage(it.idx, it.r, it.meta, it.title);
        prevEq = true;
      });
      if (inline) { body += '<w:p>' + (o.center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : '') + runs + '</w:p>'; return; }
      var mixedLine = g.items.some(function (x) { return x.kind === 'text'; });
      if (o.numbered && !mixedLine) {
        var rtl = !!o.rtl;
        body += '<w:p><w:pPr>' + (rtl ? '<w:bidi/>' : '') +
          '<w:tabs><w:tab w:val="center" w:pos="4513"/><w:tab w:val="' + (rtl ? 'left' : 'right') + '" w:pos="9026"/></w:tabs>' +
          '<w:spacing w:before="80" w:after="120"/></w:pPr>' +
          '<w:r><w:tab/></w:r>' + runs + numberRuns(++num, rtl) + '</w:p>';
        return;
      }
      body += '<w:p><w:pPr>' + (o.rtl ? '<w:bidi/>' : '') + '<w:spacing w:before="60" w:after="120"/>' +
        (o.display ? '<w:jc w:val="center"/>' : '') + '</w:pPr>' + runs + '</w:p>';
    });
    return '<pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage">' +
      '<pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml">' +
      '<pkg:xmlData><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships></pkg:xmlData></pkg:part>' +
      '<pkg:part pkg:name="/word/_rels/document.xml.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml">' +
      '<pkg:xmlData><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels +
      '</Relationships></pkg:xmlData></pkg:part>' +
      '<pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml">' +
      '<pkg:xmlData><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
      '<w:body>' + body + '</w:body></w:document></pkg:xmlData></pkg:part>' + media +
      '</pkg:package>';
  }

  // ------------------------------------------------------------ rendering helpers
  function renderItems(equations, mode, opts, dpi, keepId) {
    var items = [], chain = Promise.resolve(), pads = {};
    var o = Object.assign({}, opts, { mode: mode });
    // «محاذاة =» (5.4.1): equations alone on their line get the same width with '=' at the same place
    if (o.alignEq && global.EqAlign) chain = EqAlign.measure(equations, o).then(function (p) { pads = p; }, function () { pads = {}; });
    var k = 0, firstEq = true;
    var MAXW = 460;                                         // points: keep figures inside the text column
    equations.forEach(function (eq) {
      if (eq.kind === 'text') { chain = chain.then(function () { items.push({ kind: 'text', text: eq.text, line: eq.line }); }); return; }
      if (eq.kind === 'figure') {
        chain = chain.then(function () {
          var fbg = o.bg || undefined;                 // an equation background chosen in the editor applies to its figures too
          return Figures.render(eq.fig, eq.data).then(function (r) {
            var svg = bgSvg(r.svg, fbg), clear = fbg ? fbg === 'none' || fbg === 'transparent' : figClear;
            return Promise.all([Raster.png(svg, r.w, r.h, dpi, clear), vectorOf(svg)]);
          }).then(function (res) {
            var p = res[0], k2 = Math.min(1, MAXW / p.widthPt);
            var meta = { v: 3, id: newId(), k: eq.fig, d: eq.data, o: { display: true } };
            if (fbg) meta.bg = fbg;
            items.push({ r: { pngBase64: p.pngBase64, svgVector: res[1], widthPt: p.widthPt * k2, heightPt: p.heightPt * k2, depthPt: 0 }, meta: metaString(meta), line: eq.line, figure: true, title: Figures.label(eq.fig, 'ar'), id: meta.id });
          });
        });
        return;
      }
      if (eq.kind === 'table') {
        chain = chain.then(function () {
          var t = JSON.parse(JSON.stringify(eq.table)), jobs = [];
          var ot = Object.assign({}, o, { display: false, fontSize: Math.min(+o.fontSize || 14, 12), bg: '' });
          t.rows.forEach(function (r) { r.cells.forEach(function (c) { c.segs.forEach(function (sg) {
            if (sg.t !== 'math') return;
            var om = Object.assign({}, ot, { mode: sg.mode || 'math' });
            jobs.push(RenderHost.render(sg.v, svgActive() ? Object.assign({ vector: true }, om) : om, dpi).then(function (rr) {
              if (rr.errors && rr.errors.length) return;
              sg.r = rr; sg.meta = metaString({ v: 2, id: newId(), m: om.mode, t: sg.v, o: om });
            }));
          }); }); });
          return Promise.all(jobs).then(function () { items.push({ kind: 'table', table: t, line: eq.line }); });
        });
        return;
      }
      var num = ++k, useKeep = firstEq, idx = equations.indexOf(eq); firstEq = false;
      var em = eq.mode || mode, oe = eq.mode ? Object.assign({}, o, { mode: eq.mode }) : o;
      chain = chain.then(function () {
        if (pads[idx]) oe = Object.assign({}, oe, pads[idx]);
        return RenderHost.render(eq.tex, svgActive() ? Object.assign({ vector: true }, oe) : oe, dpi).then(function (r) {
          if (r.errors && r.errors.length) throw new Error((equations.length > 1 ? '(' + num + ') ' : '') + r.errors.join(' — '));
          var meta = { v: 2, id: (useKeep && keepId) ? keepId : newId(), m: em, t: eq.tex, o: oe };
          items.push({ r: r, meta: metaString(meta), label: eq.label, line: eq.line, id: meta.id });
        });
      });
    });
    return chain.then(function () { return items; });
  }

  // ------------------------------------------------------------ Word operations
  function findById(ctx, id) {
    var pics = ctx.document.body.inlinePictures;
    pics.load('items/altTextDescription');
    return ctx.sync().then(function () {
      for (var i = 0; i < pics.items.length; i++) {
        var m = parseMeta(pics.items[i].altTextDescription);
        if (m && m.id === id) return pics.items[i];
      }
      return null;
    });
  }

  function countNumbered() {
    return Word.run(function (ctx) {
      var pics = ctx.document.body.inlinePictures;
      pics.load('items/altTextDescription');
      return ctx.sync().then(function () {
        var n = 0;
        pics.items.forEach(function (p) { var m = parseMeta(p.altTextDescription); if (m && m.o && m.o.numbered) n++; });
        return n;
      });
    }).catch(function () { return 0; });
  }

  /** Insert (or replace when editId given) */
  function insert(items, layout, editId) {
    if (layout.numbered && !editId) {
      return countNumbered().then(function (n) { return insertNow(items, Object.assign({}, layout, { numberBase: n }), editId); });
    }
    return insertNow(items, layout, editId);
  }
  function insertNow(items, layout, editId) {
    return withSvgFallback(function (noSvg) { return insertOnce(items, Object.assign({}, layout, { noSvg: noSvg }), editId); }, items);
  }
  function insertOnce(items, layout, editId) {
    var lines = {};
    items.forEach(function (it) { lines[it.line || 0] = 1; });
    var oneLine = Object.keys(lines).length === 1 && !items.some(function (it) { return it.kind === 'text'; });
    return Word.run(function (ctx) {
      var sel = ctx.document.getSelection();
      sel.load('isEmpty');
      var p;
      if (editId === '__selection__') {
        var sp = sel.inlinePictures;
        sp.load('items/altTextDescription');
        p = ctx.sync().then(function () {
          return sp.items.length === 1 && parseMeta(sp.items[0].altTextDescription) ? sp.items[0] : null;
        });
      } else {
        p = editId ? findById(ctx, editId) : Promise.resolve(null);
      }
      return p.then(function (pic) {
        return ctx.sync().then(function () {
          var target, loc = 'Replace';
          var ooxml = buildOoxml(items, Object.assign({}, layout, { startNumber: (layout.numberBase || 0) + 1 }));
          if (pic) target = pic.getRange('Whole');
          else { target = sel; if (!sel.isEmpty) loc = 'After'; }
          var range = target.insertOoxml(ooxml, loc);
          if (layout.display && oneLine && !layout.numbered) range.paragraphs.getFirst().alignment = 'Centered';
          range.select('End');
          return ctx.sync().then(function () { return { replaced: !!pic }; });
        });
      });
    });
  }

  function selectedEquation() {
    return Word.run(function (ctx) {
      var pics = ctx.document.getSelection().inlinePictures;
      pics.load('items/altTextDescription');
      return ctx.sync().then(function () {
        if (pics.items.length !== 1) return null;
        return parseMeta(pics.items[0].altTextDescription);
      });
    });
  }

  function deleteById(id) {
    return Word.run(function (ctx) {
      return findById(ctx, id).then(function (pic) {
        if (pic) pic.delete();
        return ctx.sync().then(function () { return !!pic; });
      });
    });
  }

  function forEachEquation(fn) {
    return Word.run(function (ctx) {
      var sel = ctx.document.getSelection();
      sel.load('isEmpty');
      return ctx.sync().then(function () {
        var scope = sel.isEmpty ? ctx.document.body : sel;
        var pics = scope.inlinePictures;
        pics.load('items/altTextDescription');
        return ctx.sync().then(function () {
          var list = [];
          pics.items.forEach(function (p) { var m = parseMeta(p.altTextDescription); if (m) list.push([p, m]); });
          var chain = Promise.resolve(), n = 0;
          list.forEach(function (pm) { chain = chain.then(function () { return fn(pm[0], pm[1]); }).then(function (r) { if (r !== false) n++; }); });
          return chain.then(function () { return ctx.sync(); }).then(function () { return n; });
        });
      });
    });
  }

  function toLatex(onlyId) {
    return forEachEquation(function (pic, m) {
      if (m.k) return false;                             // figures (graphs, geometry, structures) stay pictures
      if (onlyId && m.id !== onlyId) return false;
      var t = m.m === 'chem' ? '\\ce{' + m.t + '}' : m.t;
      var d = m.o && m.o.display;
      pic.insertText((d ? '$$' : '$') + t + (d ? '$$' : '$'), 'Before');
      pic.delete();
    });
  }

  function refreshAll(opts, dpi) {
    return withSvgFallback(function (noSvg) {
      return forEachEquation(function (pic, m) {
        if (m.k) return false;
        var o = Object.assign({}, m.o, opts, { display: !!(m.o && m.o.display), mode: m.m });
        return renderItems([{ tex: m.t, line: 0 }], m.m, o, dpi, m.id).then(function (items) {
          pic.getRange('Whole').insertOoxml(buildOoxml(items, { rtl: o.rtl && m.m !== 'chem', display: false, noSvg: noSvg }), 'Replace');
        });
      });
    });
  }

  // background of the selected equations / figures (or all of them when nothing is selected): '' transparent … '#fff'
  function setBackground(bg, dpi) {
    return withSvgFallback(function (noSvg) {
      return forEachEquation(function (pic, m) {
        if (m.k) {
          return figItem(m.k, m.d, dpi, m.id, bg || 'none').then(function (it) {
            delete it.figure;
            pic.getRange('Whole').insertOoxml(buildOoxml([it], { rtl: false, display: false, noSvg: noSvg }), 'Replace');
          });
        }
        var o = Object.assign({}, m.o, { bg: bg || '', mode: m.m });
        return renderItems([{ tex: m.t, line: 0 }], m.m, o, dpi, m.id).then(function (items) {
          pic.getRange('Whole').insertOoxml(buildOoxml(items, { rtl: o.rtl && m.m !== 'chem', display: false, noSvg: noSvg }), 'Replace');
        });
      });
    });
  }

  // redraw every figure already in the document (after changing the figure-background setting)
  function refreshFigures(dpi) {
    return withSvgFallback(function (noSvg) {
      return forEachEquation(function (pic, m) {
        if (!m.k) return false;
        return figItem(m.k, m.d, dpi, m.id, m.bg).then(function (it) {
          delete it.figure;                                  // replace the picture in place, inside its paragraph
          pic.getRange('Whole').insertOoxml(buildOoxml([it], { rtl: false, display: false, noSvg: noSvg }), 'Replace');
        });
      });
    });
  }

  // ------------------------------------------------------------ document converter
  /* Converts every formula written as text in the document (or the selection): $…$, \(…\), $$…$$, \[…\],
   * \begin{aligned|cases|…}, and figure / table blocks (\begin{graph} … \end{graph}, tabular, \chemfig …).
   * Inline formulas take the size of the text around them. Anything that cannot be converted is highlighted
   * in yellow with a comment that explains why. */
  // only: {key: true} — convert just the formulas the user kept in the preview list (5.7)
  function convertDollars(opts, dpi, onProgress, only) {
    var stats = { done: 0, failed: 0, errors: [] };
    return withSvgFallback(function (noSvg) {
      return convertPass(opts, dpi, noSvg, stats, onProgress, only);
    }).then(function () { return stats; });
  }
  function matchKey(m) { return m.a + ':' + m.s + ':' + m.b + ':' + m.e + ':' + m.code.length; }
  /** every formula the converter would change, without changing anything: [{key, type, code, tex, mode, whole, para}] */
  function scanDoc() {
    return Word.run(function (ctx) {
      var sel = ctx.document.getSelection();
      sel.load('isEmpty');
      return ctx.sync().then(function () {
        var paras = (sel.isEmpty ? ctx.document.body : sel).paragraphs;
        paras.load('items/text');
        return ctx.sync().then(function () {
          var texts = paras.items.map(function (p) { return p.text; });
          return { scope: sel.isEmpty ? 'doc' : 'sel', items: global.DocScan.find(texts).map(function (m) {
            var o = { key: matchKey(m), type: m.type, code: m.code, tex: m.tex, whole: !!m.whole, para: m.a, text: m.text };
            if (m.type === 'block') { var sc = global.Figures && Figures.scan(m.code); var b = sc && sc.blocks[0]; o.kind = b ? b.kind : 'figure'; o.mode = 'block'; }
            else if (m.type !== 'space') { var cl = global.LatexSense ? LatexSense.classify(m.tex) : { mode: 'math', tex: m.tex }; o.mode = cl.mode; o.tex = cl.tex; }
            return o;
          }) };
        });
      });
    });
  }
  /** select one found formula in the document (to look at it before converting) */
  function selectMatch(key) {
    return Word.run(function (ctx) {
      var sel = ctx.document.getSelection();
      sel.load('isEmpty');
      return ctx.sync().then(function () {
        var paras = (sel.isEmpty ? ctx.document.body : sel).paragraphs;
        paras.load('items/text');
        return ctx.sync().then(function () {
          var texts = paras.items.map(function (p) { return p.text; });
          var m = global.DocScan.find(texts).filter(function (x) { return matchKey(x) === key; })[0];
          if (!m) return false;
          var loc = rangeFor(paras, texts, m);
          return ctx.sync().then(function () {
            var r = resolveRange(paras, loc);
            if (!r) return false;
            r.select();
            return ctx.sync().then(function () { return true; });
          });
        });
      });
    });
  }
  function rangeFor(paras, texts, m) {
    var esc = global.DocScan.wordEscape, occ = global.DocScan.occurrence;
    function find(p, needle, pos) {
      var k = occ(texts[p], needle, pos);
      if (k < 0 || !needle.trim() || needle.length > 250) return null;
      var r = paras.items[p].search(esc(needle), { matchCase: true, ignoreSpace: false });
      r.load('items');
      return { res: r, k: k };
    }
    if (m.whole && m.b > m.a) return { span: [m.a, m.b] };
    if (m.a === m.b && m.e - m.s <= 250) return { one: find(m.a, texts[m.a].slice(m.s, m.e), m.s) };
    var head = texts[m.a].slice(m.s, m.a === m.b ? Math.min(m.e, m.s + 200) : Math.min(texts[m.a].length, m.s + 200));
    var tailFrom = m.a === m.b ? Math.max(m.s + head.length, m.e - 200) : Math.max(0, m.e - 200);
    var tail = texts[m.b].slice(tailFrom, m.e);
    return { head: find(m.a, head, m.s), tail: tail ? find(m.b, tail, tailFrom) : null };
  }
  function resolveRange(paras, loc) {
    if (loc.span) return paras.items[loc.span[0]].getRange('Start').expandTo(paras.items[loc.span[1]].getRange('End'));
    var pick = function (f) { return f && f.res.items.length > f.k ? f.res.items[f.k] : null; };
    if (loc.one !== undefined) return pick(loc.one);
    var h = pick(loc.head), t = loc.tail ? pick(loc.tail) : h;
    return h && t ? h.expandTo(t) : null;
  }
  function convertPass(opts, dpi, noSvg, stats, onProgress, only) {
    return Word.run(function (ctx) {
      var sel = ctx.document.getSelection();
      sel.load('isEmpty');
      return ctx.sync().then(function () {
        var paras = (sel.isEmpty ? ctx.document.body : sel).paragraphs;
        paras.load('items/text');
        return ctx.sync().then(function () {
          var texts = paras.items.map(function (p) { return p.text; });
          var matches = global.DocScan.find(texts);
          if (only) matches = matches.filter(function (m) { return only[matchKey(m)]; });
          if (!matches.length) return;
          // 1) locate every match in one round trip
          var locs = matches.map(function (m) { return rangeFor(paras, texts, m); });
          return ctx.sync().then(function () {
            var ranges = matches.map(function (m, i) {
              var r = null;
              try { r = resolveRange(paras, locs[i]); } catch (e) { r = null; }
              if (r) r.load('font/size,font/name');
              return r;
            });
            return ctx.sync().then(function () {
              // 2) render and replace, one by one (a failure stays in the text, highlighted)
              var chain = Promise.resolve();
              matches.forEach(function (m, i) {
                chain = chain.then(function () {
                  var rg = ranges[i];
                  if (onProgress) onProgress(i + 1, matches.length);
                  if (!rg) { if (m.type === 'space') return; stats.failed++; stats.errors.push({ code: m.code, msg: 'not found' }); return; }
                  if (m.type === 'space') {                    // \hspace{…} \quad … between answer choices → a real tab / space
                    rg.insertText(m.text, 'Replace');
                    return ctx.sync().then(function () { stats.spaces = (stats.spaces || 0) + 1; }, function () {});
                  }
                  return itemsFor(m, rg, opts, dpi).then(function (res) {
                    var ooxml = buildOoxml(res.items, { rtl: !!res.o.rtl && res.mode !== 'chem', display: m.type !== 'inline' && m.whole, noSvg: noSvg, center: m.type !== 'inline' && m.whole });
                    var out = rg.insertOoxml(ooxml, 'Replace');
                    if (m.type !== 'inline' && m.whole && m.type !== 'block') out.paragraphs.getFirst().alignment = 'Centered';
                    return ctx.sync().then(function () { stats.done++; }, function (e) {
                      // Word refused the package: with SVG parts this means "no SVG support" → whole pass again, PNG only
                      if (!noSvg && hasSvg(res.items)) { var w = new Error('word-svg'); w.wordError = e; throw w; }
                      throw e;
                    });
                  }).catch(function (e) {
                    if (e && e.wordError) throw e.wordError;
                    stats.failed++;
                    var msg = errText(e);
                    stats.errors.push({ code: m.code, msg: msg });
                    try {
                      rg.font.highlightColor = '#FFF59D';
                      if (rg.insertComment) rg.insertComment((global.RenderHost && RenderHost.lang === 'en' ? 'Arabic Math — could not convert: ' : 'معادلات عربية — تعذّر التحويل: ') + msg);
                    } catch (x) { /* older Word: highlight only */ }
                    return ctx.sync().catch(function () {});
                  });
                });
              });
              return chain;
            });
          });
        });
      });
    });
  }
  function errText(e) { return String((e && (e.message || e.code)) || e).slice(0, 300); }
  function itemsFor(m, rg, opts, dpi) {
    var size = rg.font && rg.font.size;
    var o = Object.assign({}, opts);
    if (m.type !== 'block' && size && size > 5 && size < 72) o.fontSize = Math.round(size * 2) / 2;   // same size as the surrounding text
    if (m.type === 'block') {
      var sc = global.Figures.scan(m.code), blk = sc.blocks[0];
      if (!blk) return Promise.reject(new Error('unknown block'));
      return global.Figures.prepare(blk).then(function (pp) {
        var eq = pp.type === 'table' ? { kind: 'table', table: pp.table, line: 0 } : { kind: 'figure', fig: pp.kind, data: pp.data, line: 0 };
        return renderItems([eq], 'math', o, dpi).then(function (items) { return { items: items, o: o, mode: 'math' }; });
      });
    }
    var tex = m.tex, mode = 'math';
    if (global.LatexSense) { var cl = LatexSense.classify(tex); tex = cl.tex; mode = cl.mode; }        // chemistry written with or without \ce
    else { var ce = tex.match(/^\\ce\s*\{([\s\S]*)\}$/); if (ce) { tex = ce[1]; mode = 'chem'; } }
    o.display = m.type === 'display';
    return renderItems([{ tex: tex, line: 0 }], mode, o, dpi).then(function (items) { return { items: items, o: o, mode: mode }; });
  }

  global.WordBridge = {
    MARK: MARK, parseMeta: parseMeta, buildOoxml: buildOoxml, renderItems: renderItems,
    insert: insert, selectedEquation: selectedEquation, deleteById: deleteById,
    toLatex: toLatex, refreshAll: refreshAll, convertDollars: convertDollars, scanDoc: scanDoc, selectMatch: selectMatch, refreshFigures: refreshFigures, figItem: figItem,
    setFigClear: function (on) { figClear = !!on; }, figSvg: figSvg, bgSvg: bgSvg, setBackground: setBackground,
    vectorOf: vectorOf, withSvgFallback: withSvgFallback, svgActive: svgActive,
    setVector: function (on) { svgOn = on !== false; },
    resetSvg: function () { svgFailSession = false; try { localStorage.removeItem(SVG_FAIL); } catch (e) { /* ignore */ } }
  };
})(window);
