/*
 * ArabicMath engine v2 — runs inside a renderer frame (one frame per math font).
 *
 *   LaTeX (+Arabic) --preprocess--> LaTeX --MathJax--> MathML --transform--> MathML
 *   --MathJax--> SVG --mirror (RTL)--> SVG --rasterize--> PNG
 *
 * Math fonts come from MathJax 4 (STIX2 / New Computer Modern / Fira).
 * Arabic letters use an embedded Arabic font so images look the same everywhere.
 */
(function (global) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var MMLNS = 'http://www.w3.org/1998/Math/MathML';
  var VERSION = '5.0.0';

  var DEFAULT_NAMES = {
    sin: 'جا', cos: 'جتا', tan: 'طا', cot: 'طتا', sec: 'قا', csc: 'قتا',
    log: 'لو', ln: 'لط', lim: 'نها', max: 'عظمى', min: 'صغرى', exp: 'أس'
  };

  // Arabic fonts shipped with the add-in (embedded into every image that uses them)
  var ARABIC_FONTS = {
    'Amiri': 'Amiri',
    'Noto Naskh Arabic': 'NotoNaskhArabic',
    'Scheherazade New': 'ScheherazadeNew',
    'Noto Kufi Arabic': 'NotoKufiArabic',
    'Cairo': 'Cairo'
  };
  // Latin companions (5.7, «Aa بالخط»): digits/letters next to an Arabic font that has none of its own.
  // Same files the vector export uses, so the preview, the PNG and the picture in Word all match.
  var LATIN_FONTS = { 'Tinos': 'Tinos', 'Arimo': 'Arimo' };
  var SANS_FONT = /(arial|helvetica|sans|cairo|kufi|segoe|tahoma|verdana|calibri|arimo)/i;
  function latinCompanion(font) { var f = String(font || ''); return SANS_FONT.test(f) && !/serif/i.test(f) ? 'Arimo' : 'Tinos'; }

  var DEFAULTS = {
    mode: 'math',           // 'math' | 'chem'
    rtl: true,
    digits: 'western',      // 'western' | 'eastern'
    arabicFunctions: true,
    arabicComma: true,
    sumStyle: 'mirror',     // 'mirror' | 'arabic'
    font: 'Amiri',          // Arabic letters font
    fontSize: 14,           // pt
    color: '#000000',
    textColor: '',          // colour for \\text{…} parts ('' = same as equation)
    bold: false,
    display: false,
    names: DEFAULT_NAMES
  };

  var LIMIT_OPS = ['نها', 'عظمى', 'صغرى', 'مجـ'];
  var EXTRA_FUNCS = ['جا', 'جتا', 'ظا', 'طا', 'ظتا', 'طتا', 'قا', 'قتا', 'لو', 'لط', 'لوه', 'لوهـ', 'نها', 'جاز', 'جتاز', 'ظاز', 'طاز'];

  var ARABIC_LETTER_RUN = /[\u0621-\u063A\u0640-\u065F\u0670-\u06D3\u06D5\u06FA-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFC]+/g;
  var HAS_ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

  var MIRROR_RANGES = [
    [0x28, 0x29], [0x3C, 0x3C], [0x3E, 0x3E], [0x5B, 0x5B], [0x5D, 0x5D], [0x7B, 0x7B], [0x7D, 0x7D],
    [0xAB, 0xAB], [0xBB, 0xBB], [0x2039, 0x203A], [0x2045, 0x2046], [0x207D, 0x207E], [0x208D, 0x208E],
    [0x20D6, 0x20D7], [0x20E1, 0x20E1], [0x2140, 0x2140],
    [0x2190, 0x21FF],
    [0x2201, 0x2204], [0x2208, 0x220D], [0x2211, 0x2211], [0x2215, 0x2216], [0x221A, 0x221D],
    [0x221F, 0x2222], [0x2224, 0x2224], [0x2226, 0x2226], [0x222B, 0x2233], [0x2239, 0x2239],
    [0x223B, 0x224C], [0x2252, 0x2255], [0x225F, 0x2260], [0x2262, 0x2262], [0x2264, 0x226B],
    [0x226E, 0x228C], [0x228F, 0x2292], [0x2298, 0x2298], [0x22A2, 0x22A3], [0x22A6, 0x22B8],
    [0x22BE, 0x22BF], [0x22C9, 0x22CD], [0x22D0, 0x22D1], [0x22D6, 0x22ED], [0x22F0, 0x22FF],
    [0x2308, 0x230B], [0x2320, 0x2321], [0x2329, 0x232A], [0x239B, 0x23B3], [0x23B7, 0x23B7],
    [0x27C3, 0x27C6], [0x27E6, 0x27EF], [0x27F0, 0x27FF], [0x2983, 0x2998], [0x29FC, 0x29FD],
    [0x2A0B, 0x2A1C], [0x2A7D, 0x2AA2]
  ];
  function isMirrored(cp) {
    for (var i = 0; i < MIRROR_RANGES.length; i++) {
      if (cp >= MIRROR_RANGES[i][0] && cp <= MIRROR_RANGES[i][1]) return true;
    }
    return false;
  }

  function merge(a, b) {
    var o = {}, k;
    for (k in a) o[k] = a[k];
    for (k in (b || {})) if (b[k] !== undefined && b[k] !== null) o[k] = b[k];
    o.names = Object.assign({}, DEFAULT_NAMES, (b && b.names) || {});
    if (o.mode === 'chem') {           // chemistry is always written left-to-right
      o.rtl = false;
      o.arabicFunctions = false;
      o.arabicComma = false;
      o.digits = 'western';
    }
    return o;
  }

  function familyAttr(font) {
    var f = String(font || 'Amiri').replace(/["';{}<>]/g, '').trim() || 'Amiri';
    var q = /\s/.test(f) ? "'" + f + "'" : f;
    return f === 'Amiri' ? 'Amiri' : q + ', Amiri';
  }

  // ---------------------------------------------------------------- preprocess
  var TEXT_CMD = /\\(text|textrm|textbf|textit|textsf|texttt|textnormal|mbox|hbox|operatorname\*?|label|tag\*?|ce|pu|color|textcolor|begin|end|mathrm|href)\s*\{/g;

  function findGroupEnd(s, openIdx) {
    var depth = 0;
    for (var i = openIdx; i < s.length; i++) {
      var c = s[i];
      if (c === '\\') { i++; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return i; }
    }
    return s.length - 1;
  }

  function splitSegments(tex) {
    var out = [], last = 0, m;
    TEXT_CMD.lastIndex = 0;
    while ((m = TEXT_CMD.exec(tex))) {
      var open = TEXT_CMD.lastIndex - 1;
      var end = findGroupEnd(tex, open);
      if (m.index > last) out.push({ math: true, s: tex.slice(last, m.index) });
      out.push({ math: false, s: tex.slice(m.index, end + 1), cmd: m[1] });
      last = end + 1;
      TEXT_CMD.lastIndex = last;
    }
    if (last < tex.length) out.push({ math: true, s: tex.slice(last) });
    return out;
  }

  function buildFuncSet(names) {
    var set = {};
    EXTRA_FUNCS.concat(LIMIT_OPS).forEach(function (n) { set[n] = true; });
    Object.keys(names || {}).forEach(function (k) { if (HAS_ARABIC.test(names[k])) set[names[k]] = true; });
    return set;
  }

  // ------------------------------------------------------------ siunitx: \qty \SI \si \num \unit \ang
  var SI_UNITS = { meter: 'm', metre: 'm', second: 's', kilogram: 'kg', gram: 'g', newton: 'N', joule: 'J', watt: 'W', volt: 'V', ampere: 'A', ohm: '\\Omega',
    hertz: 'Hz', pascal: 'Pa', coulomb: 'C', farad: 'F', henry: 'H', tesla: 'T', weber: 'Wb', kelvin: 'K', celsius: '^{\\circ}C', degreeCelsius: '^{\\circ}C',
    mole: 'mol', litre: 'L', liter: 'L', hour: 'h', minute: 'min', electronvolt: 'eV', percent: '\\%', degree: '^{\\circ}', radian: 'rad', candela: 'cd', bar: 'bar', atmosphere: 'atm', calorie: 'cal' };
  var SI_PREFIX = { kilo: 'k', centi: 'c', milli: 'm', micro: '\\mu ', mega: 'M', giga: 'G', nano: 'n', pico: 'p', deci: 'd' };
  function siUnit(u) {
    u = String(u || '').trim();
    if (!/\\/.test(u)) return u.replace(/\s*\.\s*|\s*~\s*/g, '\\cdot ').replace(/\bohm\b/g, '\\Omega').replace(/\*/g, '\\cdot ');
    var out = '', pendingPer = false, first = true;
    u.replace(/\\([a-zA-Z]+)/g, function (m0, n) {
      if (n === 'per') { pendingPer = true; return ''; }
      if (n === 'squared' || n === 'square') { out += '^2'; return ''; }
      if (n === 'cubed' || n === 'cubic') { out += '^3'; return ''; }
      if (SI_PREFIX[n]) { out += (first ? '' : (pendingPer ? '/' : '\\cdot ')) + SI_PREFIX[n]; pendingPer = false; first = false; out += '\u0000'; return ''; }
      var sym = SI_UNITS[n] || n;
      if (/\u0000$/.test(out)) out = out.slice(0, -1) + sym;
      else out += (first ? '' : (pendingPer ? '/' : '\\cdot ')) + sym;
      pendingPer = false; first = false;
      return '';
    });
    return out.replace(/\u0000/g, '');
  }
  function siNum(v) {
    v = String(v || '').trim();
    var m = v.match(/^([-+]?[\d.,]+)\s*[eE]\s*([-+]?\d+)$/);
    if (m) return m[1] + '\\times 10^{' + m[2].replace(/^\+/, '') + '}';
    return v.replace(/\s*\+-\s*/g, '\\pm ');
  }
  function siunitx(t) {
    if (!/\\(qty|SI|si|num|unit|ang)\s*(\[[^\]]*\])?\s*\{/.test(t)) return t;
    var grab = function (s, i) { var d = 0; for (var k = i; k < s.length; k++) { if (s[k] === '{') d++; else if (s[k] === '}') { d--; if (!d) return { v: s.slice(i + 1, k), e: k + 1 }; } } return { v: s.slice(i + 1), e: s.length }; };
    var re = /\\(qty|SI|si|num|unit|ang)\s*(\[[^\]]*\])?\s*\{/g, m, out = '', last = 0;
    while ((m = re.exec(t))) {
      var cmd = m[1], a = grab(t, m.index + m[0].length - 1), rep;
      if (cmd === 'qty' || cmd === 'SI') {
        var j = a.e; while (t[j] === ' ') j++;
        var b = t[j] === '{' ? grab(t, j) : { v: '', e: a.e };
        rep = siNum(a.v) + (b.v ? '\\,\\class{armath-ltr}{\\mathrm{' + siUnit(b.v) + '}}' : ''); a.e = b.e;
      } else if (cmd === 'si' || cmd === 'unit') rep = '\\class{armath-ltr}{\\mathrm{' + siUnit(a.v) + '}}';
      else if (cmd === 'num') rep = siNum(a.v);
      else rep = a.v + '^{\\circ}';
      out += t.slice(last, m.index) + rep; last = a.e; re.lastIndex = a.e;
    }
    return out + t.slice(last);
  }

  function wrapCe(t) {                       // inline chemistry keeps its left-to-right order inside RTL equations
    var out = '', i = 0, m, re = /\\ce\s*\{/g;
    while ((m = re.exec(t))) {
      var d = 0, k = m.index + m[0].length - 1;
      for (; k < t.length; k++) { if (t[k] === '{') d++; else if (t[k] === '}') { d--; if (!d) break; } }
      out += t.slice(i, m.index) + '\\class{armath-ltr}{' + t.slice(m.index, k + 1) + '}';
      i = k + 1; re.lastIndex = i;
    }
    return out + t.slice(i);
  }
  // Arabic words inside chemistry (arrow conditions «->[عامل حفاز]», notes) are written as text so their spaces stay
  function ceArabicText(s) {
    return s.replace(/\\text\s*\{[^{}]*\}|([\u0600-\u06FF][\u0600-\u06FF\u0640\s]*[\u0600-\u06FF\u0640]|[\u0600-\u06FF])/g, function (m0, run) {
      return run ? '\\text{' + run + '}' : m0;
    });
  }
  function ceGroupsArabic(t) {
    if (!/[\u0600-\u06FF]/.test(t)) return t;
    var out = '', i = 0, m, re = /\\ce\s*\{/g;
    while ((m = re.exec(t))) {
      var d = 0, k = m.index + m[0].length - 1;
      for (; k < t.length; k++) { if (t[k] === '{') d++; else if (t[k] === '}') { d--; if (!d) break; } }
      out += t.slice(i, m.index + m[0].length) + ceArabicText(t.slice(m.index + m[0].length, k));
      i = k; re.lastIndex = k;
    }
    return out + t.slice(i);
  }
  function preprocess(tex, opts) {
    opts = merge(DEFAULTS, opts);
    tex = siunitx(String(tex || '').replace(/\\placeholder(?:\[[^\]]*\])?\{([^{}]*)\}/g, '{$1}'));
    tex = tex.replace(/\\ltr\s*\{/g, '\\class{armath-ltr}{');
    // \econfig{Fe} / \econfig[short]{Fe} → electron configuration (kept left-to-right)
    if (global.ChemElements && /\\econfig/.test(tex)) tex = tex.replace(/\\econfig\s*(\[[^\]]*\])?\s*\{\s*([A-Za-z]{1,3}|[\u0600-\u06FF]+)\s*\}/g, function (m0, o, el) {
      try { return '\\class{armath-ltr}{' + global.ChemElements.configTex(el, !!o && /short|مختصر/.test(o)) + '}'; } catch (e) { return m0; }
    });
    if (opts.mode !== 'chem' && /\\ce\s*\{/.test(tex)) tex = ceGroupsArabic(tex);
    if (opts.mode !== 'chem' && opts.rtl && /\\ce\s*\{/.test(tex)) tex = wrapCe(tex);
    if (opts.mode === 'chem') {
      var t = tex.trim();
      if (!/\\ce\s*\{/.test(t)) t = '\\ce{' + t.replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); }) + '}';
      t = ceGroupsArabic(t);
      return opts.bold ? '\\boldsymbol{' + t + '}' : t;
    }
    var names = opts.names;
    var funcSet = buildFuncSet(names);
    var funcList = Object.keys(funcSet).sort(function (a, b) { return b.length - a.length; });

    function opFor(word) {
      if (LIMIT_OPS.indexOf(word) >= 0) return '\\operatorname*{' + word + '}\\limits ';
      return '\\operatorname{' + word + '}';
    }
    function wrapRun(run) {
      if (funcSet[run]) return opFor(run);
      for (var i = 0; i < funcList.length; i++) {
        var f = funcList[i];
        if (run.length === f.length + 1 && run.indexOf(f) === 0) {
          return opFor(f) + '\\text{\u2063' + run.slice(f.length) + '}';
        }
      }
      return '\\text{\u2063' + run + '}';
    }

    var segs = splitSegments(tex);
    function nextMath(i) { var n = segs[i + 1]; return n && n.math ? n.s : ''; }
    var out = segs.map(function (seg, idx) {
      if (!seg.math) {
        // MathLive writes \operatorname{\mathrm{جا}} — simplify
        var t = seg.s.replace(/\\operatorname(\*?)\{\\mathrm\{([^{}]*)\}\}/g, '\\operatorname$1{$2}');
        // Arabic textbooks put the limit under نها even inside a line
        if (seg.cmd === 'operatorname*' && !/^\s*\\(no)?limits/.test(nextMath(idx))) t += '\\limits ';
        return t;
      }
      var s = seg.s
        .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
        .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
        .replace(/\u066B/g, '.').replace(/\u060C/g, ',').replace(/\u061B/g, ';')
        .replace(/\u066A/g, '\\%').replace(/\u00D7/g, '\\times ').replace(/\u00F7/g, '\\div ');
      s = s.replace(ARABIC_LETTER_RUN, wrapRun);
      if (opts.arabicFunctions) {
        s = s.replace(/\\(sin|cos|tan|cot|sec|csc|log|ln|exp)(?![a-zA-Z])/g, function (m0, n) {
          return '\\operatorname{' + (names[n] || n) + '}';
        });
        s = s.replace(/\\(lim|max|min)(?![a-zA-Z])(\s*\\limits)?/g, function (m0, n) {
          return '\\operatorname*{' + (names[n] || n) + '}\\limits ';
        });
      }
      return s;
    }).join('');
    return opts.bold ? '\\boldsymbol{' + out + '}' : out;
  }

  // ------------------------------------------------------------ glyph ink metrics
  var inkCache = {}, inkCtx = null;
  var TEXT_SCALE = 0.9;   // MathJax draws text at ~0.88–0.96em to match the math font's x-height
  function measureInk(text, family, bold) {
    var key = text + '|' + family + '|' + (bold ? 1 : 0);
    if (inkCache[key]) return inkCache[key];
    try {
      if (!inkCtx) inkCtx = document.createElement('canvas').getContext('2d');
      inkCtx.font = (bold ? '700 ' : '400 ') + '100px ' + family;
      var m = inkCtx.measureText(text);
      if (m.actualBoundingBoxAscent === undefined) return null;
      inkCache[key] = { asc: m.actualBoundingBoxAscent / 100 * TEXT_SCALE, desc: m.actualBoundingBoxDescent / 100 * TEXT_SCALE,
        ovL: Math.max(0, (m.actualBoundingBoxLeft || 0)) / 100 * TEXT_SCALE, ovR: Math.max(0, (m.actualBoundingBoxRight || 0) - m.width) / 100 * TEXT_SCALE };
      return inkCache[key];
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------ MathML stage
  function transformMathML(mml, opts) {
    var doc = new DOMParser().parseFromString(mml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return { mml: mml, errors: [] };
    var fam = familyAttr(opts.font);
    var errors = [];

    function setArabicFont(el) {
      var mv = el.getAttribute('mathvariant');
      el.removeAttribute('mathvariant');
      el.setAttribute('fontfamily', fam);
      if (opts.bold || (mv && /bold/.test(mv))) el.setAttribute('fontweight', 'bold');
    }

    // merge runs of single Arabic <mi> (\operatorname{جا} -> ج ا) so the letters join
    Array.prototype.slice.call(doc.getElementsByTagName('*')).forEach(function (p) {
      var kids = Array.prototype.slice.call(p.children);
      for (var i = 0; i < kids.length; i++) {
        var a = kids[i];
        if (a.localName !== 'mi' || !HAS_ARABIC.test(a.textContent)) continue;
        while (i + 1 < kids.length && kids[i + 1].localName === 'mi' && HAS_ARABIC.test(kids[i + 1].textContent)) {
          a.textContent += kids[i + 1].textContent;
          p.removeChild(kids[i + 1]);
          kids.splice(i + 1, 1);
        }
      }
    });

    // small space after Arabic function names (جا س)
    var funcSet = buildFuncSet(opts.names || DEFAULT_NAMES);
    Array.prototype.slice.call(doc.getElementsByTagNameNS(MMLNS, 'mi'))
      .concat(Array.prototype.slice.call(doc.getElementsByTagNameNS(MMLNS, 'mo')))
      .forEach(function (el) {
        if (!funcSet[el.textContent]) return;
        var c = el;
        while (c.parentNode && c.parentNode.localName === 'mrow' && c.parentNode.children.length === 1) c = c.parentNode;
        var sc = c.parentNode && c.parentNode.localName;
        if (/^(msup|msub|msubsup|munder|mover|munderover)$/.test(sc) && c.parentNode.firstElementChild === c) c = c.parentNode;
        var next = c.nextElementSibling;
        if (next && next.localName === 'mo' && next.textContent === '\u2061') next = next.nextElementSibling;
        if (!next || next.localName === 'mspace') return;
        if (next.localName === 'mo' && /^[\(\[\|]/.test(next.textContent)) return;
        var sp = doc.createElementNS(MMLNS, 'mspace');
        sp.setAttribute('width', '0.2em');
        c.parentNode.insertBefore(sp, next);
      });

    Array.prototype.forEach.call(doc.getElementsByTagNameNS(MMLNS, 'merror'), function (e) {
      errors.push(e.textContent.trim());
    });
    Array.prototype.forEach.call(doc.getElementsByTagNameNS(MMLNS, 'mtext'), function (e) {
      if (e.getAttribute('mathcolor') === 'red' && /^\\[a-zA-Z]+/.test(e.textContent)) {
        errors.push('Undefined control sequence ' + e.textContent);
      }
    });

    function explicitColor(el) {
      for (var n = el; n && n.nodeType === 1; n = n.parentNode) if (n.getAttribute && n.getAttribute('mathcolor')) return true;
      return false;
    }
    ['mi', 'mn', 'mo', 'mtext', 'ms'].forEach(function (tag) {
      Array.prototype.slice.call(doc.getElementsByTagNameNS(MMLNS, tag)).forEach(function (el) {
        var t = el.textContent;
        if (tag === 'mtext') {
          if (t.indexOf('\u2063') >= 0) { t = t.replace(/\u2063/g, ''); el.textContent = t; }
          else if (opts.textColor && !explicitColor(el) && /\S/.test(t)) el.setAttribute('mathcolor', opts.textColor);
        }
        if (tag === 'mn' && opts.digits === 'eastern') {
          el.textContent = t.replace(/[0-9]/g, function (d) { return String.fromCharCode(0x0660 + (+d)); })
            .replace(/\./g, '\u066B');
          setArabicFont(el);
          return;
        }
        if (tag === 'mo' && opts.rtl && opts.arabicComma && (t === ',' || t === ';')) {
          el.textContent = t === ',' ? '\u060C' : '\u061B';
          setArabicFont(el);
          el.setAttribute('lspace', '0');
          el.setAttribute('rspace', '0');
          if (el.nextElementSibling) {
            var gap = doc.createElementNS(MMLNS, 'mspace');
            gap.setAttribute('width', '0.3em');
            el.parentNode.insertBefore(gap, el.nextElementSibling);
          }
          return;
        }
        if (tag === 'mo' && t === '\u2211' && opts.sumStyle === 'arabic' && opts.rtl) {
          el.textContent = 'مجـ';
          setArabicFont(el);
          var root = doc.documentElement;
          if (opts.display || (root && root.getAttribute('display') === 'block')) el.setAttribute('mathsize', '140%');
          return;
        }
        if (HAS_ARABIC.test(t)) { setArabicFont(el); return; }
        // «أرقام وحروف بخط النص» (5.7): digits, Latin letters and chemical symbols drawn with the chosen font too
        if (opts.latinFont && (tag === 'mn' || ((tag === 'mi' || tag === 'mtext') && /[A-Za-z0-9]/.test(t)))) {
          var italic = tag === 'mi' && opts.mode !== 'chem' && t.length === 1 && /[A-Za-z]/.test(t) && !el.getAttribute('mathvariant');
          setArabicFont(el);
          el.setAttribute('fontfamily', fam + ', ' + latinCompanion(opts.font));
          if (italic) el.setAttribute('fontstyle', 'italic');
        }
      });
    });
    // leading/trailing spaces of \text{…} must become real math space: when an RTL equation is mirrored the
    // text is flipped in place, which would move the space to the wrong side ("5 سم" printed as "5سم")
    Array.prototype.slice.call(doc.getElementsByTagNameNS(MMLNS, 'mtext')).forEach(function (el) {
      var t = el.textContent, m = t.match(/^([\s\u00A0]*)([\s\S]*?)([\s\u00A0]*)$/);
      if (!m || !m[2] || (!m[1] && !m[3])) return;
      var row = doc.createElementNS(MMLNS, 'mrow');
      el.parentNode.insertBefore(row, el);
      var sp = function (n) { var s = doc.createElementNS(MMLNS, 'mspace'); s.setAttribute('width', (0.28 * Math.min(n, 4)).toFixed(2) + 'em'); return s; };
      if (m[1]) row.appendChild(sp(m[1].length));
      el.textContent = m[2];
      row.appendChild(el);
      if (m[3]) row.appendChild(sp(m[3].length));
    });
    // MathJax assumes every text glyph is 0.75em tall and 0.2em deep. Arabic letters (أ ل ك ط، hamza, dots)
    // are taller/deeper, so they collided with fraction bars and radicals. Measure the real ink and pad.
    Array.prototype.slice.call(doc.getElementsByTagNameNS(MMLNS, '*')).forEach(function (el) {
      var tag = el.localName;
      if (tag !== 'mi' && tag !== 'mtext' && tag !== 'mn') return;
      var t = el.textContent;
      if (!HAS_ARABIC.test(t)) return;
      var ink = measureInk(t, el.getAttribute('fontfamily') || fam, el.getAttribute('fontweight') === 'bold');
      if (!ink) return;
      var up = Math.max(0, ink.asc - 0.70) + 0.06, down = Math.max(0, ink.desc - 0.18) + 0.03;
      var pad = doc.createElementNS(MMLNS, 'mpadded');
      pad.setAttribute('height', '+' + up.toFixed(3) + 'em');
      pad.setAttribute('depth', '+' + down.toFixed(3) + 'em');
      // glyphs whose ink leaves their advance box (alif, lam, kaf, final yeh…) touched neighbouring digits
      var side = Math.min(0.12, Math.max(ink.ovL || 0, ink.ovR || 0)) + 0.025;
      pad.setAttribute('lspace', '+' + side.toFixed(3) + 'em'); pad.setAttribute('width', '+' + (2 * side).toFixed(3) + 'em');
      el.parentNode.insertBefore(pad, el);
      pad.appendChild(el);
    });
    return { mml: new XMLSerializer().serializeToString(doc), errors: errors };
  }

  // ------------------------------------------------------------- SVG mirror
  function codesOf(g) {
    var out = [];
    var nodes = g.querySelectorAll('[data-c]');
    for (var i = 0; i < nodes.length; i++) {
      var c = parseInt(nodes[i].getAttribute('data-c'), 16);
      if (!isNaN(c)) out.push(c);
    }
    return out;
  }

  function flipInPlace(g) {
    var box;
    try { box = g.getBBox(); } catch (e) { return; }
    if (!box || (!box.width && !box.height)) return;
    var cx = box.x + box.width / 2;
    var wrap = document.createElementNS(SVGNS, 'g');
    wrap.setAttribute('transform', 'matrix(-1 0 0 1 ' + (2 * cx).toFixed(2) + ' 0)');
    while (g.firstChild) wrap.appendChild(g.firstChild);
    g.appendChild(wrap);
  }

  // x (em from the left edge of the picture, after RTL mirroring) of the first top-level relation (= < > ≤ ≥ ≠ ≈ ≡ ⇒ …):
  // used to line the '=' of several equations up (5.4.1 «محاذاة =»). null when the formula has none at the top level.
  var REL = { 0x3D: 1, 0x3C: 1, 0x3E: 1, 0x2264: 1, 0x2265: 1, 0x2260: 1, 0x2248: 1, 0x2261: 1, 0x21D2: 1, 0x21D4: 1, 0x2243: 1, 0x2245: 1, 0x2A7D: 1, 0x2A7E: 1, 0x221D: 1, 0x2250: 1 };
  var TOP = { math: 1, mrow: 1, mstyle: 1, TeXAtom: 1, semantics: 1, 'inferred-mrow': 1, mpadded: 1 };
  function relationX(svg) {
    try {
      var mos = svg.querySelectorAll('g[data-mml-node="mo"]'), sr = svg.getBoundingClientRect();
      if (!sr.width) return null;
      var vbw = svg.viewBox.baseVal.width / 1000;
      for (var i = 0; i < mos.length; i++) {
        var g = mos[i], codes = codesOf(g);
        if (codes.length !== 1 || !REL[codes[0]]) continue;
        var top = true;
        for (var a = g.parentNode; a && a !== svg; a = a.parentNode) {
          var k = a.getAttribute && a.getAttribute('data-mml-node');
          if (k && !TOP[k]) { top = false; break; }
        }
        if (!top) continue;
        var r = g.getBoundingClientRect();
        if (!r.width) continue;
        return ((r.left + r.right) / 2 - sr.left) / sr.width * vbw;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function mirrorSVG(svg) {
    var vb = svg.viewBox.baseVal;
    var top = null;
    for (var i = 0; i < svg.childNodes.length; i++) {
      if (svg.childNodes[i].nodeName === 'g') { top = svg.childNodes[i]; break; }
    }
    if (!top) return;
    var m = document.createElementNS(SVGNS, 'g');
    m.setAttribute('transform', 'matrix(-1 0 0 1 ' + (2 * vb.x + vb.width).toFixed(2) + ' 0)');
    while (top.firstChild) m.appendChild(top.firstChild);
    top.appendChild(m);
    var toks = svg.querySelectorAll('g[data-mml-node="mi"],g[data-mml-node="mn"],g[data-mml-node="mo"],g[data-mml-node="mtext"],g[data-mml-node="ms"]');
    var targets = [];
    // groups that must keep their left-to-right order (units, inline chemistry): flip the whole group back
    var ltr = svg.querySelectorAll('.armath-ltr');
    for (var q = 0; q < ltr.length; q++) { if (!ltr[q].parentNode.closest || !ltr[q].parentNode.closest('.armath-ltr')) targets.push(ltr[q]); }
    for (var j = 0; j < toks.length; j++) {
      var g = toks[j];
      if (g.closest && g.closest('.armath-ltr')) continue;
      var kind = g.getAttribute('data-mml-node');
      if (g.querySelector('text')) { targets.push(g); continue; }
      if (kind === 'mn' || kind === 'mtext' || kind === 'ms') { targets.push(g); continue; }
      if (!codesOf(g).some(isMirrored)) targets.push(g);
    }
    targets.forEach(flipInPlace);
  }

  // ------------------------------------------------------------- errors
  var ERR = [
    [/Missing close brace/i, 'قوس { غير مغلق — ينقص }', 'Missing close brace }'],
    [/Extra close brace/i, 'يوجد قوس } زائد', 'Extra close brace }'],
    [/Missing open brace/i, 'ينقص قوس {', 'Missing open brace {'],
    [/Undefined control sequence\s*(.*)/i, 'أمر غير معروف: $1', 'Unknown command: $1'],
    [/Extra \\right/i, 'يوجد \\right بدون \\left', 'Extra \\right'],
    [/Missing \\right/i, 'يوجد \\left بدون \\right', 'Missing \\right'],
    [/Double exponent/i, 'أس مكرر — استخدم أقواس {}', 'Double exponent — use braces {}'],
    [/Double subscripts/i, 'دليل سفلي مكرر — استخدم أقواس {}', 'Double subscripts — use braces {}'],
    [/Misplaced &/i, 'علامة & في غير مكانها', 'Misplaced &'],
    [/Missing argument for (.*)/i, 'ينقص مُدخل للأمر $1', 'Missing argument for $1']
  ];
  var uiLang = 'ar';
  function translateError(m) {
    m = String(m || '').trim().replace(/\s+/g, ' ');
    for (var i = 0; i < ERR.length; i++) {
      if (ERR[i][0].test(m)) return m.replace(ERR[i][0], uiLang === 'en' ? ERR[i][2] : ERR[i][1]);
    }
    return m;
  }

  // ------------------------------------------------------------- setup
  var state = { ready: null, base: '', fontData: {}, fontLoads: {}, fontFmt: {} };

  function toBase64(buf) {
    var bytes = new Uint8Array(buf), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  // Loads (once) the embedded Arabic font: page @font-face for measuring + base64 for images
  function ensureLatinFont(family, bold, italic) {
    var file = LATIN_FONTS[family];
    if (!file) return Promise.resolve();
    var key = family + '|' + (bold ? '700' : '400') + (italic ? 'i' : '');
    if (state.fontLoads[key]) return state.fontLoads[key];
    var url = state.base + 'fonts/vector/' + file + '-' + (bold ? (italic ? 'BI' : 'B') : (italic ? 'I' : 'R')) + '.ttf';
    state.fontLoads[key] = fetch(url).then(function (r) {
      if (!r.ok) throw new Error('font ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      state.fontData[key] = toBase64(buf);
      state.fontFmt[key] = 'ttf';
      if (global.FontFace && document.fonts) {
        var ff = new FontFace(family, buf, { weight: bold ? '700' : '400', style: italic ? 'italic' : 'normal' });
        document.fonts.add(ff);
        return ff.load();
      }
    }).catch(function () { delete state.fontLoads[key]; });
    return state.fontLoads[key];
  }

  function ensureArabicFont(family, bold) {
    var file = ARABIC_FONTS[family];
    if (!file && global.UserFonts && UserFonts.isCustom(family)) {       // the user's own font (5.4): one file, bold is synthesised
      var ukey = family + '|400';
      if (!state.fontLoads[ukey]) {
        state.fontLoads[ukey] = UserFonts.bytes(family).then(function (buf) {
          if (!buf) return;
          state.fontData[ukey] = toBase64(buf);
          state.fontFmt[ukey] = new DataView(buf).getUint32(0) === 0x4F54544F ? 'otf' : 'ttf';
          return UserFonts.load(family);
        }).catch(function () { delete state.fontLoads[ukey]; });
      }
      return state.fontLoads[ukey];
    }
    if (!file) return Promise.resolve();
    var key = family + (bold ? '|700' : '|400');
    if (state.fontLoads[key]) return state.fontLoads[key];
    var url = state.base + 'fonts/arabic/' + file + (bold ? '-700' : '-400') + '.woff2';
    state.fontLoads[key] = fetch(url).then(function (r) {
      if (!r.ok) throw new Error('font ' + r.status);
      return r.arrayBuffer();
    }).then(function (buf) {
      state.fontData[key] = toBase64(buf);
      if (global.FontFace && document.fonts) {
        var ff = new FontFace(family, buf, { weight: bold ? '700' : '400' });
        document.fonts.add(ff);
        return ff.load();
      }
    }).catch(function () { /* fallback to system fonts */ });
    return state.fontLoads[key];
  }

  function init(options) {
    if (state.ready) return state.ready;
    options = options || {};
    state.base = options.base || '';
    if (options.lang) uiLang = options.lang;
    state.ready = new Promise(function (resolve, reject) {
      var t0 = Date.now();
      (function wait() {
        var MJ = global.MathJax;
        if (MJ && MJ.tex2mmlPromise && MJ.mathml2svgPromise && MJ.startup && MJ.startup.promise) {
          return MJ.startup.promise.then(resolve, reject);
        }
        if (Date.now() - t0 > 45000) return reject(new Error('MathJax did not load'));
        setTimeout(wait, 30);
      })();
    }).then(function () { return ensureArabicFont('Amiri', false); });
    return state.ready;
  }

  var holder = null;
  function getHolder() {
    if (holder && holder.isConnected) return holder;
    holder = document.createElement('div');
    holder.setAttribute('aria-hidden', 'true');
    holder.setAttribute('dir', 'ltr');
    holder.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;visibility:hidden;pointer-events:none;font-size:40px;direction:ltr;';
    document.body.appendChild(holder);
    return holder;
  }

  var queue = Promise.resolve();   // MathJax is not re-entrant: serialise renders
  function serial(fn) {
    var p = queue.then(fn, fn);
    queue = p.catch(function () {});
    return p;
  }

  function toSVG(tex, opts) {
    opts = merge(DEFAULTS, opts);
    return init().then(function () {
      var lat = opts.latinFont ? latinCompanion(opts.font) : null;
      return Promise.all([ensureArabicFont(opts.font, false), opts.bold ? ensureArabicFont(opts.font, true) : null,
        lat ? ensureLatinFont(lat, !!opts.bold, false) : null, lat ? ensureLatinFont(lat, !!opts.bold, true) : null]);
    }).then(function () {
      return serial(function () {
        var pre = preprocess(tex, opts);
        var MJ = global.MathJax;
        return MJ.tex2mmlPromise(pre, { display: !!opts.display }).then(function (mml) {
          var tr = transformMathML(mml, opts);
          return MJ.mathml2svgPromise(tr.mml, { display: !!opts.display }).then(function (node) {
            var svgs = node.querySelectorAll('svg');
            var svg = svgs[0];
            var h = getHolder();
            h.innerHTML = '';
            h.appendChild(svg);
            if (opts.rtl) mirrorSVG(svg);
            var vb = svg.viewBox.baseVal;
            var errors = tr.errors.slice();
            if (svg.querySelector('[data-mml-node="merror"]') && !errors.length) errors.push('LaTeX error');
            errors = errors.map(translateError);
            var rel = relationX(svg);
            // empty space on the left / right (em) so several equations share the same width and '=' position
            var padL = Math.max(0, +opts.padL || 0), padR = Math.max(0, +opts.padR || 0);
            if (padL || padR) {
              svg.setAttribute('viewBox', [vb.x - padL * 1000, vb.y, vb.width + (padL + padR) * 1000, vb.height].map(function (v) { return +v.toFixed(2); }).join(' '));
              vb = svg.viewBox.baseVal;
              if (rel !== null) rel += padL;
            }
            svg.removeAttribute('style');
            svg.setAttribute('color', opts.color || '#000');
            svg.style.color = opts.color || '#000';
            return {
              svg: svg, width: vb.width / 1000, height: -vb.y / 1000,
              depth: (vb.y + vb.height) / 1000, total: vb.height / 1000,
              errors: errors, mml: tr.mml, tex: pre, rel: rel
            };
          });
        });
      });
    });
  }

  function fontCss(svg) {
    var css = '';
    var txt = svg.querySelectorAll('[style*="font-family"]');
    if (!txt.length && !svg.querySelector('text')) return '';
    var used = {};
    Array.prototype.forEach.call(txt, function (el) {
      var st = el.getAttribute('style') || '';
      Object.keys(ARABIC_FONTS).concat(Object.keys(LATIN_FONTS), global.UserFonts ? UserFonts.families() : []).forEach(function (fam) { if (st.indexOf(fam) >= 0) used[fam] = true; });
    });
    used.Amiri = true; // fallback family
    Object.keys(used).forEach(function (fam) {
      ['400', '700', '400i', '700i'].forEach(function (w) {
        var d = state.fontData[fam + '|' + w], fmt = state.fontFmt[fam + '|' + w];
        var desc = LATIN_FONTS[fam] ? 'font-weight:' + parseInt(w, 10) + ';font-style:' + (/i$/.test(w) ? 'italic' : 'normal') + ';' : '';
        if (d && fmt) css += '@font-face{font-family:"' + fam + '";' + desc + 'src:url(data:font/' + fmt + ';base64,' + d + ') format("' + (fmt === 'otf' ? 'opentype' : 'truetype') + '");}';
        else if (d) css += '@font-face{font-family:"' + fam + '";font-weight:' + w + ';src:url(data:font/woff2;base64,' + d + ') format("woff2");}';
      });
    });
    return css;
  }

  function serialize(svg, pxPerEm, opts, embedFonts, valign) {
    var clone = svg.cloneNode(true);
    var vb = svg.viewBox.baseVal;
    clone.setAttribute('xmlns', SVGNS);
    clone.setAttribute('width', (vb.width / 1000 * pxPerEm).toFixed(2));
    clone.setAttribute('height', (vb.height / 1000 * pxPerEm).toFixed(2));
    clone.removeAttribute('style');
    clone.setAttribute('color', opts.color || '#000');
    clone.setAttribute('style', 'color:' + (opts.color || '#000') + (valign ? ';vertical-align:' + valign : ''));
    // background of this equation: '' / 'none' = transparent (default), otherwise a colour (white, #hex …)
    var bg = String(opts.bg || '').trim();
    if (bg && bg !== 'none' && bg !== 'transparent' && /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|[a-z]+)$/i.test(bg)) {
      var rect = document.createElementNS(SVGNS, 'rect');
      rect.setAttribute('x', vb.x); rect.setAttribute('y', vb.y);
      rect.setAttribute('width', vb.width); rect.setAttribute('height', vb.height);
      rect.setAttribute('fill', bg); rect.setAttribute('stroke', 'none');
      clone.insertBefore(rect, clone.firstChild);
    }
    if (embedFonts && clone.querySelector('text')) {
      var css = fontCss(clone);
      if (css) {
        var style = document.createElementNS(SVGNS, 'style');
        style.textContent = css;
        var defs = document.createElementNS(SVGNS, 'defs');
        defs.appendChild(style);
        clone.insertBefore(defs, clone.firstChild);
      }
    }
    return new XMLSerializer().serializeToString(clone);
  }

  function rasterize(svgString, wPx, hPx) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }));
      img.onload = function () {
        setTimeout(function () {
          try {
            var c = document.createElement('canvas');
            // very high dpi (1200) on a long equation: stay inside the browser's canvas limits (size in Word is in pt anyway)
            var k = Math.min(1, 16000 / Math.max(1, wPx), 16000 / Math.max(1, hPx), Math.sqrt(1.2e8 / Math.max(1, wPx * hPx)));
            c.width = Math.max(1, Math.ceil(wPx * k));
            c.height = Math.max(1, Math.ceil(hPx * k));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            resolve(c.toDataURL('image/png'));
          } catch (e) { reject(e); }
        }, 30);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('rasterize failed')); };
      img.src = url;
    });
  }

  /** MathML (for export) */
  function toMathML(tex, opts) {
    opts = merge(DEFAULTS, opts);
    return init().then(function () {
      return serial(function () {
        return global.MathJax.tex2mmlPromise(preprocess(tex, opts), { display: !!opts.display }).then(function (mml) {
          var tr = transformMathML(mml, opts);
          return tr.mml.replace(/\s(data-[\w-]+)="[^"]*"/g, '');
        });
      });
    });
  }

  /** Preview: returns an SVG string (fonts embedded) sized in em, plus metrics */
  function preview(tex, opts, embedFonts) {
    return toSVG(tex, opts).then(function (r) {
      return {
        svgString: serialize(r.svg, 16, merge(DEFAULTS, opts), !!embedFonts),
        width: r.width, height: r.height, depth: r.depth, total: r.total, errors: r.errors, rel: r.rel
      };
    });
  }

  /** Full render for Word: PNG (dpi) + metrics in points */
  function render(tex, opts, dpi) {
    opts = merge(DEFAULTS, opts);
    dpi = dpi || 600;
    return toSVG(tex, opts).then(function (r) {
      var fontPt = +opts.fontSize || 14;
      var pxPerEm = fontPt * dpi / 72;
      var svgString = serialize(r.svg, pxPerEm, opts, true);
      var svgPt = serialize(r.svg, fontPt * 96 / 72, opts, true, (-r.depth * fontPt * 96 / 72).toFixed(2) + 'px');
      var vec = opts.vector && global.Vector && global.Vector.supported()
        ? global.Vector.fromSVG(svgPt).catch(function () { return null; }) : Promise.resolve(null);
      return Promise.all([rasterize(svgString, r.width * pxPerEm, r.total * pxPerEm), vec]).then(function (res) {
        var dataUrl = res[0];
        return {
          pngBase64: dataUrl.split(',')[1],
          dataUrl: dataUrl,
          svgVector: res[1] || undefined,
          svgString: svgPt,
          widthPt: r.width * fontPt,
          heightPt: r.total * fontPt,
          depthPt: r.depth * fontPt,
          rel: r.rel, width: r.width,
          errors: r.errors
        };
      });
    });
  }

  global.ArabicMath = {
    VERSION: VERSION,
    DEFAULTS: DEFAULTS,
    DEFAULT_NAMES: DEFAULT_NAMES,
    ARABIC_FONTS: ARABIC_FONTS,
    init: init,
    preprocess: preprocess,
    toSVG: toSVG,
    preview: preview,
    render: render,
    toMathML: toMathML,
    merge: merge,
    isMirrored: isMirrored,
    setLang: function (l) { uiLang = l; }
  };
})(window);
