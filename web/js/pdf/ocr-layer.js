/* OcrLayer — adds an invisible, searchable/selectable text layer to a PDF page (like Acrobat's "Recognize Text").
 * The text is written as a Type0 font without glyphs (render mode 3 = invisible) whose ToUnicode map is the identity,
 * so every viewer finds, selects and copies the Arabic/Latin text exactly as recognised. Each word is stretched (Tz) to its box.
 *
 *   OcrLayer.addText(pdfDoc, page, lines, map)
 *     lines : engine lines (PdfOcrEngine.recognize().lines) — uses nbox (px of the prepared image) and words
 *     map   : {x0, y0, sx, sy, H}  px → pt:  x_pt = (px - x0) * sx ;  y_pt = H - (py - y0) * sy     (H = page height in pt)
 */
(function (global) {
  'use strict';
  var cache = new WeakMap();
  function fontRef(doc) {
    if (cache.has(doc)) return cache.get(doc);
    var L = global.PDFLib, ctx = doc.context, N = L.PDFName;
    var cmap = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def ' +
      '1 begincodespacerange <0000> <FFFF> endcodespacerange 1 beginbfrange <0000> <FFFF> <0000> endbfrange endcmap CMapName currentdict /CMap defineresource pop end end';
    var tu = ctx.register(ctx.stream(cmap));
    var desc = ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: 'GlyphLessFont', Flags: 4, FontBBox: [0, 0, 500, 1000], ItalicAngle: 0, Ascent: 1000, Descent: 0, CapHeight: 1000, StemV: 80 }));
    var cid = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'CIDFontType2', BaseFont: 'GlyphLessFont', CIDSystemInfo: ctx.obj({ Registry: L.PDFString.of('Adobe'), Ordering: L.PDFString.of('Identity'), Supplement: 0 }), FontDescriptor: desc, DW: 500 }));
    var font = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: 'GlyphLessFont', Encoding: 'Identity-H', DescendantFonts: [cid], ToUnicode: tu }));
    cache.set(doc, font); return font;
  }
  function hex(s) {
    var out = '', i;
    for (i = 0; i < s.length; i++) { var c = s.charCodeAt(i); out += ('0000' + c.toString(16)).slice(-4); }
    return '<' + out + '>';
  }
  function f(n) { return (Math.round(n * 100) / 100).toString(); }
  function addText(doc, page, lines, map) {
    var L = global.PDFLib, ctx = doc.context, ops = [], ref = fontRef(doc), RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
    // PDF stores text in VISUAL order (left to right as drawn); viewers run the bidi algorithm to get the logical text back.
    // So an Arabic word is written reversed, digits / Latin runs stay as they are, and the words of a line go left → right.
    var MIR = { '(': ')', ')': '(', '[': ']', ']': '[', '«': '»', '»': '«', '{': '}', '}': '{', '<': '>', '>': '<' };
    function visual(t) {
      if (!RTL.test(t)) return t;
      var r = t.split('').reverse().map(function (c) { return MIR[c] || c; }).join('');
      return r.replace(/[0-9A-Za-z٠-٩][0-9A-Za-z٠-٩.,:\/%+\-=]*/g, function (m) { return m.split('').reverse().join(''); });
    }
    function run(text, b) {
      if (!text || !b) return;
      var w = (b.x1 - b.x0) * map.sx, h = (b.y1 - b.y0) * map.sy; if (w <= 0.5 || h <= 0.5) return;
      var n = text.length, fs = Math.max(4, h * 0.82), tz = Math.max(5, Math.min(2000, w / (n * 0.5 * fs) * 100));
      var x = (b.x0 - map.x0) * map.sx, y = map.H - (b.y1 - map.y0) * map.sy + h * 0.2;
      ops.push('BT 3 Tr /OCRF ' + f(fs) + ' Tf ' + f(tz) + ' Tz 1 0 0 1 ' + f(x) + ' ' + f(y) + ' Tm ' + hex(text) + ' Tj ET');
    }
    lines.forEach(function (l) {
      var lb = l.nbox || l.bbox, ws = l.words || [], boxed = ws.length && ws.every(function (w) { return w.nbox || w.bbox; }), items;
      if (!lb) return;
      if (boxed) items = ws.map(function (w) { return { t: (w.text || '').replace(/[‎‏]/g, ''), b: w.nbox || w.bbox }; }).filter(function (i) { return i.t && i.b; });
      else items = [{ t: (l.text || '').replace(/[‎‏]/g, ''), b: lb }];
      // stream order = reading order (an RTL line is read right → left), so search and copy see the words in sequence
      var rtl = (l.text.match(/[؀-ۿ]/g) || []).length > l.text.replace(/\s/g, '').length * 0.4;
      items.sort(function (a, b) { return rtl ? b.b.x0 - a.b.x0 : a.b.x0 - b.b.x0; });
      items.forEach(function (it) { run(visual(it.t), it.b); });
    });
    if (!ops.length) return 0;
    // keep the original content balanced, then add ours on top
    page.node.normalize && page.node.normalize();
    var stream = ctx.register(ctx.stream('q\n' + ops.join('\n') + '\nQ'));
    page.node.addContentStream(stream);
    page.node.setFontDictionary(L.PDFName.of('OCRF'), ref);
    return ops.length;
  }
  global.OcrLayer = { addText: addText };
})(window);
