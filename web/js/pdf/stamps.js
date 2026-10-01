/* PDF studio — stamps: ready marks (✓ ✗ ★), word stamps (ممتاز، أحسنت، راجع…), a grade stamp and custom stamps.
 * PdfStamps.svg(def) → { svg, w, h }  (px; texts are turned into outlines by the caller before saving). */
(function (global) {
  'use strict';
  function f2(n) { return (Math.round(n * 100) / 100).toString(); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var AR = /[؀-ۿ]/;
  var mctx = document.createElement('canvas').getContext('2d');
  function measure(s, size) { mctx.font = '700 ' + size + 'px Cairo, "Noto Kufi Arabic", Amiri, sans-serif'; return mctx.measureText(s).width; }
  function wrap(w, h, body) { return '<svg xmlns="http://www.w3.org/2000/svg" width="' + f2(w) + '" height="' + f2(h) + '" viewBox="0 0 ' + f2(w) + ' ' + f2(h) + '">' + body + '</svg>'; }
  function text(x, y, s, size, color, extra) {
    var rtl = AR.test(s);
    return '<text x="' + f2(x) + '" y="' + f2(y) + '" text-anchor="middle" font-family="Cairo, Noto Kufi Arabic, Amiri, sans-serif" font-weight="700" font-size="' + f2(size) + '" fill="' + color + '" style="direction:' + (rtl ? 'rtl' : 'ltr') + '" direction="' + (rtl ? 'rtl' : 'ltr') + '"' + (extra || '') + '>' + esc(s) + '</text>';
  }

  var BUILT = [
    { id: 'check', label: '✓ صح', mark: 'check', color: '#2e8b3a' },
    { id: 'cross', label: '✗ خطأ', mark: 'cross', color: '#c2352b' },
    { id: 'half', label: '½ نصف', mark: 'half', color: '#e07a00' },
    { id: 'star', label: '★ نجمة', mark: 'star', color: '#e0a800' },
    { id: 'excellent', text: 'ممتاز', color: '#2e8b3a', shape: 'badge' },
    { id: 'wellDone', text: 'أحسنت', color: '#0e9f9a', shape: 'badge' },
    { id: 'review', text: 'راجع', color: '#e07a00', shape: 'badge' },
    { id: 'attention', text: 'انتبه!', color: '#c2352b', shape: 'badge' },
    { id: 'important', text: 'مهم', color: '#c2352b', shape: 'circle' },
    { id: 'repeated', text: 'تكرر', color: '#7b3fb5', shape: 'circle' },
    { id: 'note', text: 'ملاحظة', color: '#1f5fbf', shape: 'ribbon' },
    { id: 'solution', text: 'الحل', color: '#0a7c78', shape: 'ribbon' },
    { id: 'grade', text: 'الدرجة', color: '#c2352b', shape: 'grade', ask: 'grade' },
    { id: 'date', text: '', color: '#1f5fbf', shape: 'badge', ask: 'date' }
  ];

  function mark(kind, color) {
    var s = 48, b = '';
    if (kind === 'check') b = '<path d="M8 26 L19 38 L41 10" fill="none" stroke="' + color + '" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>';
    else if (kind === 'cross') b = '<path d="M11 11 L37 37 M37 11 L11 37" fill="none" stroke="' + color + '" stroke-width="6" stroke-linecap="round"/>';
    else if (kind === 'half') b = '<path d="M7 26 L16 36 L33 12" fill="none" stroke="' + color + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M28 34 L43 20" stroke="' + color + '" stroke-width="4" stroke-linecap="round"/>';
    else if (kind === 'star') {
      var pts = [];
      for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 9.5 : 22; pts.push(f2(24 + r * Math.cos(a)) + ' ' + f2(25 + r * Math.sin(a))); }
      b = '<path d="M' + pts.join(' L') + 'Z" fill="' + color + '" stroke="#a37800" stroke-width="1.2" stroke-linejoin="round"/>';
    }
    return { svg: wrap(s, s, b), w: s, h: s };
  }

  function wordStamp(t, color, shape, sub) {
    var size = 22, tw = measure(t, size), pad = 16;
    if (shape === 'circle') {
      var r = Math.max(34, tw / 2 + 14), d = 2 * r + 8, c = d / 2;
      var body = '<circle cx="' + f2(c) + '" cy="' + f2(c) + '" r="' + f2(r) + '" fill="none" stroke="' + color + '" stroke-width="3"/>' +
        '<circle cx="' + f2(c) + '" cy="' + f2(c) + '" r="' + f2(r - 6) + '" fill="none" stroke="' + color + '" stroke-width="1.2"/>' +
        text(c, c + size * 0.35, t, size, color);
      return { svg: wrap(d, d, '<g transform="rotate(-12 ' + f2(c) + ' ' + f2(c) + ')">' + body + '</g>'), w: d, h: d };
    }
    if (shape === 'ribbon') {
      var w = tw + 2 * pad + 18, h = 40;
      var bodyR = '<path d="M2 2 H' + f2(w - 2) + ' L' + f2(w - 14) + ' ' + f2(h / 2) + ' L' + f2(w - 2) + ' ' + f2(h - 2) + ' H2 L14 ' + f2(h / 2) + 'Z" fill="' + color + '"/>' +
        text(w / 2, h / 2 + size * 0.33, t, size - 2, '#ffffff');
      return { svg: wrap(w, h, bodyR), w: w, h: h };
    }
    if (shape === 'grade') {
      var line = sub || '', s2 = 26, w2 = Math.max(tw, measure(line, s2)) + 2 * pad + 8, h2 = 84;
      var bodyG = '<rect x="2" y="2" width="' + f2(w2 - 4) + '" height="' + f2(h2 - 4) + '" rx="10" fill="#ffffff" fill-opacity="0.6" stroke="' + color + '" stroke-width="3"/>' +
        text(w2 / 2, 30, t, 17, color) + '<line x1="14" y1="40" x2="' + f2(w2 - 14) + '" y2="40" stroke="' + color + '" stroke-width="1.2"/>' +
        text(w2 / 2, 70, line, s2, color);
      return { svg: wrap(w2, h2, '<g transform="rotate(-6 ' + f2(w2 / 2) + ' ' + f2(h2 / 2) + ')">' + bodyG + '</g>'), w: w2 + 6, h: h2 + 10 };
    }
    // badge: rounded double frame, slightly tilted like a real stamp
    var w3 = tw + 2 * pad + 8, h3 = 46;
    var bodyB = '<rect x="3" y="3" width="' + f2(w3 - 6) + '" height="' + f2(h3 - 6) + '" rx="9" fill="none" stroke="' + color + '" stroke-width="3"/>' +
      '<rect x="8" y="8" width="' + f2(w3 - 16) + '" height="' + f2(h3 - 16) + '" rx="6" fill="none" stroke="' + color + '" stroke-width="1"/>' +
      text(w3 / 2, h3 / 2 + size * 0.36, t, size, color);
    return { svg: wrap(w3 + 8, h3 + 8, '<g transform="translate(4 4) rotate(-5 ' + f2(w3 / 2) + ' ' + f2(h3 / 2) + ')">' + bodyB + '</g>'), w: w3 + 8, h: h3 + 8 };
  }

  /** def: { mark } | { text, color, shape, sub } */
  function svg(def) {
    if (def.mark) return mark(def.mark, def.color);
    return wordStamp(def.text, def.color || '#c2352b', def.shape || 'badge', def.sub);
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  var KEY = 'armath.pdf.stamps';
  function custom() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function saveCustom(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-24))); } catch (e) { /* ignore */ } }

  global.PdfStamps = { BUILT: BUILT, svg: svg, today: today, custom: custom, saveCustom: saveCustom };
})(window);
