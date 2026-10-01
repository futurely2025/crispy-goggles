/* docx2html — a purpose-built Word (.docx) → HTML converter for "Word to PDF".
 * Unlike generic converters it keeps what matters for Arabic documents: paragraph direction (bidi) and alignment,
 * complex-script font sizes/bold (szCs, bCs), numbering (including Arabic letters), tables (merged cells, borders,
 * shading, RTL tables), images, text boxes, headers/footers with page numbers, page size and margins, and Word
 * equations (OMML → MathML). Reads the file with JSZip; nothing is sent anywhere. */
(function (global) {
  'use strict';
  var NS = {
    w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
    v: 'urn:schemas-microsoft-com:vml', mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006'
  };
  var AR = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  var ARRUN = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]+|[^؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]+/g;
  var MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' };

  // ------------------------------------------------------------ XML helpers
  function kids(el, name, ns) { var out = []; if (!el) return out; for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === name && (!ns || c.namespaceURI === ns)) out.push(c); return out; }
  function kid(el, name, ns) { if (!el) return null; for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === name && (!ns || c.namespaceURI === ns)) return c; return null; }
  function at(el, name) { if (!el) return null; var v = el.getAttributeNS(NS.w, name); if (v === null || v === '') v = el.getAttribute('w:' + name); return v === '' ? null : v; }
  function on(el) { if (!el) return false; var v = at(el, 'val'); return !(v === '0' || v === 'false' || v === 'off' || v === 'none'); }
  function tw(v) { return v === null || v === undefined || v === '' ? null : parseFloat(v) / 15; }       // twips → px
  function parseXml(s) { return new DOMParser().parseFromString(s, 'application/xml'); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ------------------------------------------------------------ styles
  function readRPr(el) {
    var o = {};
    if (!el) return o;
    var f = kid(el, 'rFonts');
    if (f) o.fonts = { ascii: at(f, 'ascii') || at(f, 'hAnsi'), cs: at(f, 'cs'), ea: at(f, 'eastAsia') };
    ['b', 'bCs', 'i', 'iCs', 'strike', 'dstrike', 'caps', 'smallCaps', 'vanish', 'rtl'].forEach(function (k) { var e = kid(el, k); if (e) o[k] = on(e); });
    var u = kid(el, 'u'); if (u) o.u = at(u, 'val') !== 'none';
    var c = kid(el, 'color'); if (c && at(c, 'val') && at(c, 'val') !== 'auto') o.color = '#' + at(c, 'val');
    var sz = kid(el, 'sz'); if (sz) o.sz = parseFloat(at(sz, 'val')) / 2;
    var szc = kid(el, 'szCs'); if (szc) o.szCs = parseFloat(at(szc, 'val')) / 2;
    var hl = kid(el, 'highlight'); if (hl) o.hl = at(hl, 'val');
    var va = kid(el, 'vertAlign'); if (va) o.va = at(va, 'val');
    var sh = kid(el, 'shd'); if (sh && at(sh, 'fill') && at(sh, 'fill') !== 'auto') o.shd = '#' + at(sh, 'fill');
    var sp = kid(el, 'spacing'); if (sp && at(sp, 'val')) o.spacing = parseFloat(at(sp, 'val')) / 15;
    return o;
  }
  function readPPr(el) {
    var o = {};
    if (!el) return o;
    var jc = kid(el, 'jc'); if (jc) o.jc = at(jc, 'val');
    var bd = kid(el, 'bidi'); if (bd) o.bidi = on(bd);
    var ind = kid(el, 'ind');
    if (ind) o.ind = { left: tw(at(ind, 'left')), right: tw(at(ind, 'right')), start: tw(at(ind, 'start')), end: tw(at(ind, 'end')), firstLine: tw(at(ind, 'firstLine')), hanging: tw(at(ind, 'hanging')) };
    var sp = kid(el, 'spacing');
    if (sp) o.spacing = { before: tw(at(sp, 'before')), after: tw(at(sp, 'after')), line: at(sp, 'line') !== null ? parseFloat(at(sp, 'line')) : null, rule: at(sp, 'lineRule') };
    ['keepNext', 'keepLines', 'pageBreakBefore', 'contextualSpacing'].forEach(function (k) { var e = kid(el, k); if (e) o[k] = on(e); });
    var np = kid(el, 'numPr'); if (np) { var il = kid(np, 'ilvl'), ni = kid(np, 'numId'); o.numPr = { ilvl: il ? +at(il, 'val') : 0, numId: ni ? at(ni, 'val') : null }; }
    var sh = kid(el, 'shd'); if (sh && at(sh, 'fill') && at(sh, 'fill') !== 'auto') o.shd = '#' + at(sh, 'fill');
    var pb = kid(el, 'pBdr'); if (pb) o.bdr = readBorders(pb);
    o.mark = readRPr(kid(el, 'rPr'));
    return o;
  }
  function readBorders(el) {
    var o = {};
    ['top', 'left', 'bottom', 'right', 'start', 'end', 'insideH', 'insideV'].forEach(function (k) {
      var b = kid(el, k); if (!b) return;
      var v = at(b, 'val'), sz = parseFloat(at(b, 'sz') || '4'), col = at(b, 'color');
      o[k] = (v === 'nil' || v === 'none') ? null : { style: /double/.test(v) ? 'double' : /dot/.test(v) ? 'dotted' : /dash/.test(v) ? 'dashed' : 'solid', w: Math.max(1, Math.round(sz / 8 * 4 / 3 * 10) / 10), color: col && col !== 'auto' ? '#' + col : '#000' };
    });
    return o;
  }
  function merge(a, b) {            // shallow merge of property objects, nested objects merged one level
    var o = {}, k;
    for (k in a) o[k] = a[k];
    for (k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && o[k] && typeof o[k] === 'object') { var n = {}, j; for (j in o[k]) n[j] = o[k][j]; for (j in b[k]) if (b[k][j] !== null && b[k][j] !== undefined) n[j] = b[k][j]; o[k] = n; } else if (b[k] !== undefined) o[k] = b[k]; }
    return o;
  }

  function parseStyles(doc) {
    var S = { map: {}, defP: {}, defR: {}, defTable: null };
    if (!doc) return S;
    var dd = kid(doc.documentElement, 'docDefaults');
    if (dd) { S.defR = readRPr(kid(kid(dd, 'rPrDefault'), 'rPr')); S.defP = readPPr(kid(kid(dd, 'pPrDefault'), 'pPr')); }
    kids(doc.documentElement, 'style').forEach(function (s) {
      var id = at(s, 'styleId'), based = kid(s, 'basedOn');
      var tp = kid(s, 'tblPr');
      S.map[id] = { id: id, type: at(s, 'type'), based: based ? at(based, 'val') : null, def: at(s, 'default') === '1' || at(s, 'default') === 'true', p: readPPr(kid(s, 'pPr')), r: readRPr(kid(s, 'rPr')),
        tbl: tp ? { bdr: kid(tp, 'tblBorders') ? readBorders(kid(tp, 'tblBorders')) : null, mar: readCellMar(kid(tp, 'tblCellMar')) } : null };
      if (S.map[id].def && S.map[id].type === 'paragraph') S.defPStyle = id;
    });
    return S;
  }
  function readCellMar(el) {
    if (!el) return null; var o = {};
    ['top', 'left', 'bottom', 'right', 'start', 'end'].forEach(function (k) { var e = kid(el, k); if (e) o[k] = tw(at(e, 'w')); });
    return o;
  }
  function styleChain(S, id) { var out = [], guard = 0; while (id && S.map[id] && guard++ < 20) { out.unshift(S.map[id]); id = S.map[id].based; } return out; }
  function resolveP(S, id, rPr) { var o = S.defP, rr = S.defR; styleChain(S, id || S.defPStyle).forEach(function (s) { o = merge(o, s.p); rr = merge(rr, s.r); }); o = merge(o, {}); return { p: o, r: rr }; }

  // ------------------------------------------------------------ numbering
  function parseNumbering(doc) {
    var N = { abs: {}, num: {} };
    if (!doc) return N;
    kids(doc.documentElement, 'abstractNum').forEach(function (a) {
      var lv = {}; kids(a, 'lvl').forEach(function (l) {
        var f = kid(l, 'numFmt'), t = kid(l, 'lvlText'), s = kid(l, 'start'), ind = kid(kid(l, 'pPr'), 'ind');
        lv[+at(l, 'ilvl')] = { fmt: f ? at(f, 'val') : 'decimal', text: t ? at(t, 'val') : '', start: s ? +at(s, 'val') : 1,
          left: ind ? tw(at(ind, 'left') || at(ind, 'start')) : null, hanging: ind ? tw(at(ind, 'hanging')) : null, rPr: readRPr(kid(l, 'rPr')), isLgl: !!kid(l, 'isLgl') };
      });
      N.abs[at(a, 'abstractNumId')] = lv;
    });
    kids(doc.documentElement, 'num').forEach(function (n) {
      var ab = kid(n, 'abstractNumId'), ov = {}; kids(n, 'lvlOverride').forEach(function (o) { var so = kid(o, 'startOverride'); if (so) ov[+at(o, 'ilvl')] = +at(so, 'val'); });
      N.num[at(n, 'numId')] = { abs: ab ? at(ab, 'val') : null, ov: ov };
    });
    return N;
  }
  var ABJAD = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي', 'ك', 'ل', 'م', 'ن', 'س', 'ع', 'ف', 'ص', 'ق', 'ر', 'ش', 'ت', 'ث', 'خ', 'ذ', 'ض', 'ظ', 'غ'];
  var ALPHA = ['أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'هـ', 'و', 'ي'];
  function roman(n, lower) { var r = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']], s = ''; r.forEach(function (x) { while (n >= x[0]) { s += x[1]; n -= x[0]; } }); return lower ? s.toLowerCase() : s; }
  function letters(n, upper) { var s = ''; while (n > 0) { n--; s = String.fromCharCode(97 + n % 26) + s; n = Math.floor(n / 26); } return upper ? s.toUpperCase() : s; }
  function fmtNum(n, fmt, eastern) {
    var s;
    switch (fmt) {
      case 'decimalZero': s = (n < 10 ? '0' : '') + n; break;
      case 'lowerLetter': s = letters(n, false); break; case 'upperLetter': s = letters(n, true); break;
      case 'lowerRoman': s = roman(n, true); break; case 'upperRoman': s = roman(n, false); break;
      case 'arabicAbjad': s = ABJAD[(n - 1) % ABJAD.length]; break; case 'arabicAlpha': s = ALPHA[(n - 1) % ALPHA.length]; break;
      case 'hindiNumbers': eastern = true; s = String(n); break;
      case 'ordinal': s = n + '.'; break;
      default: s = String(n);
    }
    if (eastern) s = s.replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[+d]; });
    return s;
  }
  function bulletChar(t) {
    if (!t) return '•';
    var c = t.charCodeAt(0);
    if (c >= 0xF000) { return c === 0xF0A7 ? '▪' : c === 0xF0D8 ? '➢' : c === 0xF0FC ? '✓' : c === 0xF076 ? '❖' : '•'; }
    return t === 'o' ? '◦' : t === 'o' ? '◦' : t;
  }

  // ------------------------------------------------------------ OMML → MathML
  function mmlTokens(text, plain) {
    var out = '', m, re = /(\d+(?:[.,٫]\d+)?)|([A-Za-zͰ-Ͽ؀-ۿ]+)|(\s+)|([\s\S])/g;
    while ((m = re.exec(text))) {
      if (m[1]) out += '<mn>' + esc(m[1]) + '</mn>';
      else if (m[2]) out += plain || m[2].length > 1 ? '<mi mathvariant="normal">' + esc(m[2]) + '</mi>' : '<mi>' + esc(m[2]) + '</mi>';
      else if (m[3]) continue;
      else out += '<mo>' + esc(m[4]) + '</mo>';
    }
    return out;
  }
  function mc(el) { var s = ''; for (var c = el.firstElementChild; c; c = c.nextElementSibling) s += omml(c); return s; }
  function row(el) { return '<mrow>' + (el ? mc(el) : '') + '</mrow>'; }
  function ch(el, name, def) { var p = kid(el, name, NS.m); if (!p) return def; var v = p.getAttributeNS(NS.m, 'val') || p.getAttribute('m:val'); return v === null ? def : v; }
  function omml(el) {
    if (el.namespaceURI !== NS.m) return '';
    var n = el.localName, pr = kid(el, n + 'Pr', NS.m);
    switch (n) {
      case 'oMathPara': return kids(el, 'oMath', NS.m).map(function (x) { return omml(x).replace('<math ', '<math display="block" '); }).join('');
      case 'oMath': return '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow>' + mc(el) + '</mrow></math>';
      case 'r': { var t = kids(el, 't', NS.m).map(function (x) { return x.textContent; }).join(''), sty = pr && kid(pr, 'sty', NS.m); var plain = sty && /p|b$/.test(sty.getAttributeNS(NS.m, 'val') || sty.getAttribute('m:val') || ''); return mmlTokens(t, !!plain); }
      case 'f': { var type = ch(el, 'type', 'bar'); var f = pr && kid(pr, 'type', NS.m); var bar = !(f && (f.getAttributeNS(NS.m, 'val') || f.getAttribute('m:val')) === 'noBar'); return '<mfrac' + (bar ? '' : ' linethickness="0"') + '>' + row(kid(el, 'num', NS.m)) + row(kid(el, 'den', NS.m)) + '</mfrac>'; }
      case 'rad': { var hide = pr && kid(pr, 'degHide', NS.m); var hv = hide && (hide.getAttributeNS(NS.m, 'val') || hide.getAttribute('m:val')); var deg = kid(el, 'deg', NS.m);
        return (hide && hv !== '0' && hv !== 'false') || !deg || !deg.textContent.trim() ? '<msqrt>' + row(kid(el, 'e', NS.m)) + '</msqrt>' : '<mroot>' + row(kid(el, 'e', NS.m)) + row(deg) + '</mroot>'; }
      case 'sSup': return '<msup>' + row(kid(el, 'e', NS.m)) + row(kid(el, 'sup', NS.m)) + '</msup>';
      case 'sSub': return '<msub>' + row(kid(el, 'e', NS.m)) + row(kid(el, 'sub', NS.m)) + '</msub>';
      case 'sSubSup': return '<msubsup>' + row(kid(el, 'e', NS.m)) + row(kid(el, 'sub', NS.m)) + row(kid(el, 'sup', NS.m)) + '</msubsup>';
      case 'sPre': return '<mmultiscripts>' + row(kid(el, 'e', NS.m)) + '<mprescripts/>' + row(kid(el, 'sub', NS.m)) + row(kid(el, 'sup', NS.m)) + '</mmultiscripts>';
      case 'nary': {
        var chr = pr && kid(pr, 'chr', NS.m); var op = chr ? (chr.getAttributeNS(NS.m, 'val') || chr.getAttribute('m:val')) : '∫';
        var und = pr && kid(pr, 'limLoc', NS.m), un = und && (und.getAttributeNS(NS.m, 'val') || und.getAttribute('m:val')) === 'undOvr';
        var sh = pr && kid(pr, 'subHide', NS.m), ph = pr && kid(pr, 'supHide', NS.m);
        var sub = sh && (sh.getAttributeNS(NS.m, 'val') !== '0') ? '' : row(kid(el, 'sub', NS.m)), sup = ph && (ph.getAttributeNS(NS.m, 'val') !== '0') ? '' : row(kid(el, 'sup', NS.m));
        var o = '<mo>' + esc(op || '∫') + '</mo>', big = un || /[∑∏⋃⋂]/.test(op || '');
        var core = !sub && !sup ? o : !sup ? (big ? '<munder>' : '<msub>') + o + sub + (big ? '</munder>' : '</msub>') : !sub ? (big ? '<mover>' : '<msup>') + o + sup + (big ? '</mover>' : '</msup>') : (big ? '<munderover>' : '<msubsup>') + o + sub + sup + (big ? '</munderover>' : '</msubsup>');
        return '<mrow>' + core + row(kid(el, 'e', NS.m)) + '</mrow>';
      }
      case 'd': {
        var bc = pr && kid(pr, 'begChr', NS.m), ec = pr && kid(pr, 'endChr', NS.m), sc = pr && kid(pr, 'sepChr', NS.m);
        var b = bc ? (bc.getAttributeNS(NS.m, 'val') || bc.getAttribute('m:val') || '') : '(', e2 = ec ? (ec.getAttributeNS(NS.m, 'val') || ec.getAttribute('m:val') || '') : ')', sp = sc ? (sc.getAttributeNS(NS.m, 'val') || sc.getAttribute('m:val') || '') : '|';
        var items = kids(el, 'e', NS.m).map(function (x) { return row(x); });
        return '<mrow>' + (b ? '<mo fence="true" stretchy="true">' + esc(b) + '</mo>' : '') + items.join(sp ? '<mo separator="true">' + esc(sp) + '</mo>' : '') + (e2 ? '<mo fence="true" stretchy="true">' + esc(e2) + '</mo>' : '') + '</mrow>';
      }
      case 'func': return '<mrow>' + row(kid(el, 'fName', NS.m)) + '<mo>&#x2061;</mo>' + row(kid(el, 'e', NS.m)) + '</mrow>';
      case 'limLow': return '<munder>' + row(kid(el, 'e', NS.m)) + row(kid(el, 'lim', NS.m)) + '</munder>';
      case 'limUpp': return '<mover>' + row(kid(el, 'e', NS.m)) + row(kid(el, 'lim', NS.m)) + '</mover>';
      case 'acc': { var ac = pr && kid(pr, 'chr', NS.m); var c2 = ac ? (ac.getAttributeNS(NS.m, 'val') || ac.getAttribute('m:val')) : '^'; return '<mover accent="true">' + row(kid(el, 'e', NS.m)) + '<mo>' + esc(c2 || '^') + '</mo></mover>'; }
      case 'bar': { var pos = pr && kid(pr, 'pos', NS.m), bot = pos && (pos.getAttributeNS(NS.m, 'val') || pos.getAttribute('m:val')) === 'bot'; return (bot ? '<munder>' : '<mover>') + row(kid(el, 'e', NS.m)) + '<mo>' + (bot ? '_' : '&#xAF;') + '</mo>' + (bot ? '</munder>' : '</mover>'); }
      case 'groupChr': { var gc = pr && kid(pr, 'chr', NS.m); var g2 = gc ? (gc.getAttributeNS(NS.m, 'val') || gc.getAttribute('m:val')) : '⏟'; return '<munder>' + row(kid(el, 'e', NS.m)) + '<mo>' + esc(g2 || '⏟') + '</mo></munder>'; }
      case 'borderBox': return '<menclose notation="box">' + row(kid(el, 'e', NS.m)) + '</menclose>';
      case 'm': return '<mrow><mo>[</mo><mtable>' + kids(el, 'mr', NS.m).map(function (r) { return '<mtr>' + kids(r, 'e', NS.m).map(function (c) { return '<mtd>' + row(c) + '</mtd>'; }).join('') + '</mtr>'; }).join('') + '</mtable><mo>]</mo></mrow>';
      case 'eqArr': return '<mtable>' + kids(el, 'e', NS.m).map(function (c) { return '<mtr><mtd>' + row(c) + '</mtd></mtr>'; }).join('') + '</mtable>';
      case 'e': case 'num': case 'den': case 'sub': case 'sup': case 'lim': case 'deg': case 'fName': case 'box': case 'phant': return '<mrow>' + mc(el) + '</mrow>';
      default: return '';
    }
  }

  // ------------------------------------------------------------ the converter
  function convert(arrayBuffer) {
    return global.JSZip.loadAsync(arrayBuffer).then(function (zip) {
      var docFile = zip.file('word/document.xml');
      if (!docFile) throw new Error('الملف ليس مستند Word بصيغة docx (ربما هو doc قديم — احفظه من Word بصيغة docx)');
      var read = function (name) { var f = zip.file(name); return f ? f.async('string').then(parseXml) : Promise.resolve(null); };
      return Promise.all([read('word/document.xml'), read('word/styles.xml'), read('word/numbering.xml'), read('word/_rels/document.xml.rels')]).then(function (r) {
        var body = r[0], S = parseStyles(r[1]), N = parseNumbering(r[2]), rels = {};
        if (r[3]) kids(r[3].documentElement, 'Relationship').forEach(function (x) { rels[x.getAttribute('Id')] = { type: x.getAttribute('Type'), target: x.getAttribute('Target'), mode: x.getAttribute('TargetMode') }; });
        var media = {}, jobs = [];
        Object.keys(rels).forEach(function (id) {
          var rl = rels[id]; if (!/\/image$/.test(rl.type) || rl.mode === 'External') return;
          var path = 'word/' + rl.target.replace(/^\.?\//, '').replace(/^\.\.\//, ''); var f = zip.file(path) || zip.file(rl.target.replace(/^\//, ''));
          if (!f) return; var ext = (path.split('.').pop() || '').toLowerCase();
          if (MIME[ext]) jobs.push(f.async('base64').then(function (b) { media[id] = 'data:' + MIME[ext] + ';base64,' + b; })); else media[id] = null;
        });
        // headers / footers referenced by the last section
        var bodyEl = kid(body.documentElement, 'body'), sect = kid(bodyEl, 'sectPr'), hf = { header: null, footer: null };
        var hfJobs = [];
        if (sect) kids(sect, 'headerReference').concat(kids(sect, 'footerReference')).forEach(function (rf) {
          if (at(rf, 'type') !== 'default') return;
          var rid = rf.getAttributeNS(NS.r, 'id'), rl = rels[rid]; if (!rl) return; var kind = rf.localName === 'headerReference' ? 'header' : 'footer';
          hfJobs.push(read('word/' + rl.target.replace(/^\.?\//, '')).then(function (d) { hf[kind] = d; }));
        });
        return Promise.all(jobs.concat(hfJobs)).then(function () { return build(body, S, N, rels, media, hf); });
      });
    });
  }

  function build(bodyDoc, S, N, rels, media, hf) {
    var stats = { images: 0, math: 0, tables: 0, paragraphs: 0, skipped: 0, textboxes: 0 };
    var counters = {};                                  // numId -> [counts per level]
    var root = document.createElement('div'); root.className = 'docx';
    var bodyEl = kid(bodyDoc.documentElement, 'body'), sect = kid(bodyEl, 'sectPr');

    // ---- page setup
    var page = { w: 794, h: 1123, ml: 96, mr: 96, mt: 96, mb: 96, hd: 48, fd: 48, gutter: 0 };
    if (sect) {
      var sz = kid(sect, 'pgSz'), mg = kid(sect, 'pgMar');
      if (sz) { page.w = tw(at(sz, 'w')) || page.w; page.h = tw(at(sz, 'h')) || page.h; if (at(sz, 'orient') === 'landscape' && page.w < page.h) { var t = page.w; page.w = page.h; page.h = t; } }
      if (mg) { page.ml = tw(at(mg, 'left')) || 0; page.mr = tw(at(mg, 'right')) || 0; page.mt = tw(at(mg, 'top')) || 0; page.mb = tw(at(mg, 'bottom')) || 0; page.hd = tw(at(mg, 'header')) || 48; page.fd = tw(at(mg, 'footer')) || 48; page.gutter = tw(at(mg, 'gutter')) || 0; }
    }
    var docBidi = false;

    // ---- text → nodes
    function fontStack(rp, cs) {
      var f = rp.fonts || {}, a = [];
      var name = cs ? (f.cs || f.ascii) : (f.ascii || f.cs);
      if (name) a.push('"' + name + '"');
      a.push(cs ? '"Amiri", "Traditional Arabic", serif' : '"Times New Roman", "Amiri", serif');
      return a.join(', ');
    }
    function runStyle(rp, cs) {
      var st = [], sz = cs ? (rp.szCs || rp.sz) : rp.sz;
      st.push('font-family:' + fontStack(rp, cs));
      if (sz) st.push('font-size:' + (sz * 4 / 3) + 'px');
      if (cs ? rp.bCs : rp.b) st.push('font-weight:700');
      if (cs ? rp.iCs : rp.i) st.push('font-style:italic');
      var deco = []; if (rp.u) deco.push('underline'); if (rp.strike || rp.dstrike) deco.push('line-through'); if (deco.length) st.push('text-decoration:' + deco.join(' '));
      if (rp.color) st.push('color:' + rp.color);
      var hl = { yellow: '#ff0', green: '#0f0', cyan: '#0ff', magenta: '#f0f', blue: '#00f', red: '#f00', darkBlue: '#00008b', darkCyan: '#008b8b', darkGreen: '#006400', darkMagenta: '#8b008b', darkRed: '#8b0000', darkYellow: '#808000', darkGray: '#a9a9a9', lightGray: '#d3d3d3', black: '#000' };
      if (rp.hl && hl[rp.hl]) st.push('background:' + hl[rp.hl]); else if (rp.shd) st.push('background:' + rp.shd);
      if (rp.caps) st.push('text-transform:uppercase'); if (rp.smallCaps) st.push('font-variant:small-caps');
      if (rp.va === 'superscript') st.push('vertical-align:super;font-size:' + ((sz || 11) * 4 / 3 * 0.65) + 'px'); else if (rp.va === 'subscript') st.push('vertical-align:sub;font-size:' + ((sz || 11) * 4 / 3 * 0.65) + 'px');
      if (rp.spacing && !cs) st.push('letter-spacing:' + rp.spacing + 'px');
      return st.join(';');
    }
    function textNodes(text, rp, frag) {
      if (!text) return;
      (text.match(ARRUN) || []).forEach(function (seg) {
        var cs = AR.test(seg) || (rp.rtl && /\S/.test(seg) && !/[A-Za-z]/.test(seg)), sp = document.createElement('span');
        sp.setAttribute('style', runStyle(rp, cs)); sp.textContent = seg; frag.appendChild(sp);
      });
    }
    function imgNode(rid, wpx, hpx) {
      var src = media[rid]; stats.images++;
      if (!src) { var ph = document.createElement('span'); ph.setAttribute('style', 'display:inline-block;border:1px dashed #999;color:#999;font:12px sans-serif;padding:4px'); ph.textContent = 'صورة بصيغة غير مدعومة'; stats.skipped++; return ph; }
      var im = document.createElement('img'); im.setAttribute('src', src); if (wpx) im.setAttribute('width', Math.round(wpx)); if (hpx) im.setAttribute('height', Math.round(hpx));
      im.setAttribute('style', 'vertical-align:middle;max-width:100%'); return im;
    }
    function drawing(d, rp, frag) {
      var inl = kid(d, 'inline', NS.wp) || kid(d, 'anchor', NS.wp), ext = inl && kid(inl, 'extent', NS.wp);
      var w = ext ? parseFloat(ext.getAttribute('cx')) / 9525 : 0, h2 = ext ? parseFloat(ext.getAttribute('cy')) / 9525 : 0;
      var blip = d.getElementsByTagNameNS(NS.a, 'blip')[0];
      var tb = d.getElementsByTagNameNS(NS.w, 'txbxContent')[0];
      if (blip) { var rid = blip.getAttributeNS(NS.r, 'embed'); if (rid) frag.appendChild(imgNode(rid, w, h2)); return; }
      if (tb) {
        stats.textboxes++; var box = document.createElement('span'); box.setAttribute('style', 'display:inline-block;vertical-align:top;border:1px solid #000;padding:4px;box-sizing:border-box;' + (w ? 'width:' + w + 'px;' : '') + 'white-space:normal');
        kids(tb, 'p').forEach(function (p) { box.appendChild(paragraph(p, true)); }); frag.appendChild(box); return;
      }
    }
    var fieldState = null;                                   // complex field being collected {instr, result:boolean}
    function runs(parent, ctx, frag, parentRp) {
      for (var c = parent.firstElementChild; c; c = c.nextElementSibling) {
        var ln = c.localName, nsu = c.namespaceURI;
        if (nsu === NS.m) { if (ln === 'oMath' || ln === 'oMathPara') { stats.math++; var span = document.createElement(ln === 'oMathPara' ? 'div' : 'span'); span.innerHTML = omml(c); var msz = (((ctx.r && ctx.r.sz) || 11) * 4 / 3 * 1.05) + 'px'; span.setAttribute('style', 'font-size:' + msz + ';' + (ln === 'oMathPara' ? 'text-align:center;direction:ltr;padding:4px 0' : 'direction:ltr;display:inline-block')); frag.appendChild(span); } continue; }
        if (ln === 'r') { runOne(c, ctx, frag, parentRp); }
        else if (ln === 'hyperlink' || ln === 'smartTag' || ln === 'ins' || ln === 'sdtContent' || ln === 'customXml') runs(c, ctx, frag, parentRp);
        else if (ln === 'sdt') runs(kid(c, 'sdtContent') || c, ctx, frag, parentRp);
        else if (ln === 'AlternateContent') { var choice = kid(c, 'Choice'); if (choice) runs(choice, ctx, frag, parentRp); }
        else if (ln === 'fldSimple') { var ins = at(c, 'instr') || ''; if (/\bPAGE\b/.test(ins) && !/NUMPAGES/.test(ins)) frag.appendChild(document.createTextNode('\u0001PAGE\u0001')); else if (/NUMPAGES/.test(ins)) frag.appendChild(document.createTextNode('\u0001PAGES\u0001')); else runs(c, ctx, frag, parentRp); }
        else if (ln === 'bookmarkStart' || ln === 'bookmarkEnd' || ln === 'del' || ln === 'proofErr' || ln === 'pPr') continue;
      }
    }
    function runOne(r, ctx, frag, parentRp) {
      var rp = merge(merge(ctx.r, parentRp || {}), readRPr(kid(r, 'rPr')));
      var rs = kid(kid(r, 'rPr'), 'rStyle'); if (rs) rp = merge(merge(ctx.r, readRStyle(at(rs, 'val'))), readRPr(kid(r, 'rPr')));
      if (rp.vanish) return;
      for (var c = r.firstElementChild; c; c = c.nextElementSibling) {
        var n = c.localName;
        if (n === 'fldChar') {
          var t = at(c, 'fldCharType');
          if (t === 'begin') fieldState = { instr: '', phase: 'instr' }; else if (t === 'separate' && fieldState) { fieldState.phase = 'result'; if (/\bPAGE\b/.test(fieldState.instr) && !/NUMPAGES/.test(fieldState.instr)) frag.appendChild(document.createTextNode('\u0001PAGE\u0001')); else if (/NUMPAGES/.test(fieldState.instr)) frag.appendChild(document.createTextNode('\u0001PAGES\u0001')); }
          else if (t === 'end') fieldState = null;
          continue;
        }
        if (n === 'instrText') { if (fieldState) fieldState.instr += c.textContent; continue; }
        if (fieldState && fieldState.phase === 'result' && /\b(PAGE|NUMPAGES)\b/.test(fieldState.instr)) continue;     // result replaced by our token
        if (n === 't') textNodes(c.textContent, rp, frag);
        else if (n === 'tab') { var tb = document.createElement('span'); tb.setAttribute('style', 'display:inline-block;width:48px'); tb.className = 'tab'; frag.appendChild(tb); }
        else if (n === 'br' || n === 'cr') { var ty = at(c, 'type'); if (ty === 'page') { var pb = document.createElement('span'); pb.className = 'pb'; pb.setAttribute('data-pb', '1'); pb.setAttribute('style', 'display:block;height:0'); frag.appendChild(pb); } else frag.appendChild(document.createElement('br')); }
        else if (n === 'noBreakHyphen') textNodes('‑', rp, frag);
        else if (n === 'sym') { var code = parseInt(at(c, 'char') || '0', 16); textNodes(String.fromCharCode(code >= 0xF000 ? (code & 0xFF) : code), rp, frag); }
        else if (n === 'drawing') drawing(c, rp, frag);
        else if (n === 'pict') { var im = c.getElementsByTagNameNS(NS.v, 'imagedata')[0]; if (im) { var rid = im.getAttributeNS(NS.r, 'id'); if (rid) frag.appendChild(imgNode(rid, 0, 0)); } }
        else if (n === 'footnoteReference' || n === 'endnoteReference') { var sp = document.createElement('sup'); sp.textContent = at(c, 'id'); frag.appendChild(sp); }
        else if (n === 'AlternateContent') { var ch2 = kid(c, 'Choice'); if (ch2) for (var k = ch2.firstElementChild; k; k = k.nextElementSibling) if (k.localName === 'drawing') drawing(k, rp, frag); }
      }
    }
    function readRStyle(id) { var o = {}; styleChain(S, id).forEach(function (s) { o = merge(o, s.r); }); return o; }

    // ---- paragraphs
    var prevPStyle = null;
    function paragraph(p, inBox) {
      var ppr = kid(p, 'pPr'), sid = ppr && kid(ppr, 'pStyle') ? at(kid(ppr, 'pStyle'), 'val') : null;
      var base = resolveP(S, sid), pp = merge(base.p, readPPr(ppr)), rp0 = base.r;
      var el = document.createElement('div'); el.className = 'p'; stats.paragraphs++;
      var rtl = pp.bidi === true; var st = [];
      el.setAttribute('dir', rtl ? 'rtl' : 'ltr'); st.push('direction:' + (rtl ? 'rtl' : 'ltr'));
      var jc = pp.jc, align = 'start';
      if (jc === 'center') align = 'center'; else if (jc === 'both' || jc === 'distribute' || jc === 'thaiDistribute') align = 'justify'; else if (jc === 'right') align = rtl ? 'left' : 'right'; else if (jc === 'left') align = rtl ? 'right' : 'left'; else if (jc === 'end') align = 'end'; else if (jc === 'start') align = 'start';
      st.push('text-align:' + align);
      // spacing
      var sp = pp.spacing || {}, before = sp.before, after = sp.after;
      if (pp.contextualSpacing && prevPStyle === sid) { before = 0; after = 0; }
      if (before) st.push('padding-top:' + before + 'px'); if (after) st.push('padding-bottom:' + after + 'px');
      if (sp.line) { if (sp.rule === 'exact' || sp.rule === 'atLeast') st.push('line-height:' + (sp.line / 15) + 'px'); else if (sp.line !== 240) st.push('line-height:' + (sp.line / 240 * 1.18).toFixed(3)); }
      // indentation (left/right are leading/trailing in Word for bidi paragraphs)
      var ind = pp.ind || {}, ls = ind.start !== undefined && ind.start !== null ? ind.start : ind.left, rs = ind.end !== undefined && ind.end !== null ? ind.end : ind.right;
      var num = null;
      if (pp.numPr && pp.numPr.numId && pp.numPr.numId !== '0') num = numberFor(pp.numPr, rtl);
      if (num && num.lvl) { if (ls === undefined || ls === null || !(ppr && kid(ppr, 'ind'))) ls = num.lvl.left !== null ? num.lvl.left : ls; if (num.lvl.hanging && !(ind.hanging)) ind = merge(ind, { hanging: num.lvl.hanging }); }
      if (ls) st.push('margin-inline-start:' + ls + 'px'); if (rs) st.push('margin-inline-end:' + rs + 'px');
      if (ind.firstLine) st.push('text-indent:' + ind.firstLine + 'px'); else if (ind.hanging) st.push('text-indent:-' + ind.hanging + 'px');
      if (pp.shd) st.push('background:' + pp.shd);
      if (pp.bdr) ['top', 'bottom', 'left', 'right'].forEach(function (k) { var b = pp.bdr[k]; if (b) st.push('border-' + k + ':' + b.w + 'px ' + b.style + ' ' + b.color + ';padding-' + k + ':3px'); });
      if (pp.keepNext) el.setAttribute('data-kn', '1');
      if (pp.pageBreakBefore && !inBox) { el.setAttribute('data-pbb', '1'); }
      st.push('white-space:pre-wrap;overflow-wrap:anywhere');
      st.push('font-family:' + fontStack(rp0, false) + ';font-size:' + ((rp0.sz || 11) * 4 / 3) + 'px');
      el.setAttribute('style', st.join(';'));
      var frag = document.createDocumentFragment();
      if (num && num.text) {
        var m = document.createElement('span'); var mrp = merge(merge(rp0, pp.mark || {}), num.lvl.rPr || {});
        m.setAttribute('style', runStyle(mrp, AR.test(num.text)) + ';display:inline-block;min-width:' + Math.max(18, (ind.hanging || 24) - 6) + 'px;margin-inline-end:6px;text-indent:0;white-space:pre'); m.textContent = num.text; frag.appendChild(m);
      }
      fieldState = null;
      runs(p, { r: rp0, p: pp }, frag, {});
      if (!frag.childNodes.length || (frag.childNodes.length === 1 && num)) { var z = document.createElement('span'); var mk = merge(rp0, pp.mark || {}); z.setAttribute('style', runStyle(mk, false)); z.textContent = '​'; frag.appendChild(z); }
      el.appendChild(frag);
      prevPStyle = sid;
      return el;
    }
    function numberFor(np, rtl) {
      var nm = N.num[np.numId]; if (!nm) return null; var ab = N.abs[nm.abs]; if (!ab) return null; var lvl = ab[np.ilvl]; if (!lvl) return null;
      var cs = counters[np.numId] || (counters[np.numId] = []);
      var cur = cs[np.ilvl];
      cur = cur === undefined ? (nm.ov[np.ilvl] !== undefined ? nm.ov[np.ilvl] : lvl.start) : cur + 1; cs[np.ilvl] = cur;
      for (var d = np.ilvl + 1; d < 10; d++) cs[d] = undefined;
      var text;
      if (lvl.fmt === 'bullet') text = bulletChar(lvl.text);
      else text = (lvl.text || '%1.').replace(/%(\d)/g, function (m0, d2) { var li = +d2 - 1, v = cs[li], l2 = ab[li]; if (v === undefined) v = l2 ? l2.start : 1; return fmtNum(v, l2 ? l2.fmt : 'decimal', rtl && /[٠-٩]/.test(lvl.text || '') ? true : false); });
      return { text: text, lvl: lvl };
    }

    // ---- tables
    function table(t) {
      stats.tables++;
      var tp = kid(t, 'tblPr'), sid = tp && kid(tp, 'tblStyle') ? at(kid(tp, 'tblStyle'), 'val') : null, bdr = null, cmar = null;
      styleChain(S, sid).forEach(function (s) { if (s.tbl) { if (s.tbl.bdr) bdr = merge(bdr || {}, s.tbl.bdr); if (s.tbl.mar) cmar = merge(cmar || {}, s.tbl.mar); } });
      if (tp && kid(tp, 'tblBorders')) bdr = merge(bdr || {}, readBorders(kid(tp, 'tblBorders')));
      if (tp && kid(tp, 'tblCellMar')) cmar = merge(cmar || {}, readCellMar(kid(tp, 'tblCellMar')));
      var rtl = !!(tp && kid(tp, 'bidiVisual') && on(kid(tp, 'bidiVisual')));
      var grid = kids(kid(t, 'tblGrid'), 'gridCol').map(function (g) { return tw(at(g, 'w')); });
      var tbl = document.createElement('table'), total = grid.reduce(function (a, b) { return a + b; }, 0);
      var tblW = tp && kid(tp, 'tblW'), wv = tblW && at(tblW, 'type') === 'dxa' ? tw(at(tblW, 'w')) : null, pct = tblW && at(tblW, 'type') === 'pct' ? parseFloat(at(tblW, 'w')) / 50 : null;
      var jc = tp && kid(tp, 'jc') ? at(kid(tp, 'jc'), 'val') : null;
      var st = ['border-collapse:collapse', 'table-layout:fixed', 'direction:' + (rtl ? 'rtl' : 'ltr'), 'width:' + (pct ? pct + '%' : (wv || total) + 'px')];
      if (jc === 'center') st.push('margin-inline:auto');
      else if (rtl ? (jc !== 'left') : (jc === 'right' || jc === 'end')) st.push('margin-left:auto');       // an RTL table sits at the right edge unless told otherwise
      tbl.setAttribute('style', st.join(';')); tbl.setAttribute('dir', rtl ? 'rtl' : 'ltr');
      var cg = document.createElement('colgroup'); grid.forEach(function (w) { var c = document.createElement('col'); c.setAttribute('style', 'width:' + w + 'px'); cg.appendChild(c); }); tbl.appendChild(cg);
      var rows = kids(t, 'tr'), open = {}, nrows = rows.length, ncols = grid.length || 1;
      rows.forEach(function (tr, ri) {
        var trEl = document.createElement('tr'), trp = kid(tr, 'trPr'), hh = trp && kid(trp, 'trHeight'); if (hh) trEl.setAttribute('style', 'height:' + tw(at(hh, 'val')) + 'px');
        var col = 0;
        kids(tr, 'tc').forEach(function (tc) {
          var cp = kid(tc, 'tcPr'), gs = cp && kid(cp, 'gridSpan') ? +at(kid(cp, 'gridSpan'), 'val') : 1, vm = cp && kid(cp, 'vMerge');
          if (vm && at(vm, 'val') !== 'restart') { if (open[col]) open[col].rowSpan = (open[col].rowSpan || 1) + 1; col += gs; return; }
          var td = document.createElement('td'); if (gs > 1) td.colSpan = gs; if (vm) open[col] = td; else delete open[col];
          var cst = ['vertical-align:' + ((cp && kid(cp, 'vAlign') && at(kid(cp, 'vAlign'), 'val') === 'center') ? 'middle' : (cp && kid(cp, 'vAlign') && at(kid(cp, 'vAlign'), 'val') === 'bottom') ? 'bottom' : 'top'), 'overflow:hidden', 'box-sizing:border-box'];
          var m = cmar || { left: 7.2, right: 7.2, top: 0, bottom: 0 }; var cm = cp && kid(cp, 'tcMar') ? readCellMar(kid(cp, 'tcMar')) : null; if (cm) m = merge(m, cm);
          cst.push('padding:' + (m.top || 0) + 'px ' + (m.right !== undefined ? m.right : (m.end || 7.2)) + 'px ' + (m.bottom || 0) + 'px ' + (m.left !== undefined ? m.left : (m.start || 7.2)) + 'px');
          var sh = cp && kid(cp, 'shd'); if (sh && at(sh, 'fill') && at(sh, 'fill') !== 'auto') cst.push('background:' + '#' + at(sh, 'fill'));
          // borders: table borders by position, then the cell's own
          var cb = cp && kid(cp, 'tcBorders') ? readBorders(kid(cp, 'tcBorders')) : {};
          var first = col === 0, last = col + gs >= ncols, top = ri === 0, bot = ri === nrows - 1, B = bdr || {};
          function pick(own, tab) { return own !== undefined ? own : tab; }
          var sides = { top: pick(cb.top, top ? B.top : B.insideH), bottom: pick(cb.bottom, bot ? B.bottom : B.insideH),
            'inline-start': pick(cb.start !== undefined ? cb.start : cb.left, first ? (B.start !== undefined ? B.start : B.left) : B.insideV), 'inline-end': pick(cb.end !== undefined ? cb.end : cb.right, last ? (B.end !== undefined ? B.end : B.right) : B.insideV) };
          Object.keys(sides).forEach(function (k) { var b = sides[k]; cst.push('border-' + k + ':' + (b ? b.w + 'px ' + b.style + ' ' + b.color : 'none')); });
          td.setAttribute('style', cst.join(';'));
          var cnt = 0; for (var ch2 = tc.firstElementChild; ch2; ch2 = ch2.nextElementSibling) { if (ch2.localName === 'p') { td.appendChild(paragraph(ch2, true)); cnt++; } else if (ch2.localName === 'tbl') { td.appendChild(table(ch2)); cnt++; } }
          if (!cnt) td.appendChild(document.createTextNode('​'));
          trEl.appendChild(td); col += gs;
        });
        tbl.appendChild(trEl);
      });
      return tbl;
    }

    // ---- body
    function blocks(parent, host) {
      for (var c = parent.firstElementChild; c; c = c.nextElementSibling) {
        var n = c.localName;
        if (n === 'p') {
          host.appendChild(paragraph(c, false));
        } else if (n === 'tbl') { host.appendChild(table(c)); prevPStyle = null; }
        else if (n === 'sdt') blocks(kid(c, 'sdtContent') || c, host);
        else if (n === 'AlternateContent') { var ch = kid(c, 'Choice'); if (ch) blocks(ch, host); }
        else if (n === 'oMathPara' && c.namespaceURI === NS.m) { stats.math++; var d = document.createElement('div'); d.innerHTML = omml(c); d.setAttribute('style', 'text-align:center;direction:ltr;padding:6px 0'); host.appendChild(d); }
      }
    }
    blocks(bodyEl, root);
    var out = { root: root, page: page, stats: stats, header: null, footer: null };
    ['header', 'footer'].forEach(function (k) {
      if (!hf[k]) return; var host = document.createElement('div'); host.className = 'docx-' + k; prevPStyle = null; blocks(hf[k].documentElement, host); out[k] = host;
    });
    return out;
  }

  global.Docx2Html = { convert: convert };
})(window);
