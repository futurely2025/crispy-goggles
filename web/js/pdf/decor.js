/* PDF studio — page decoration, drawn under the user's additions (SVG, page coordinates in pt):
 *   solution-page templates (lines, squares, dots, axes, question/answer), the page title of a solution page,
 *   page numbers and a watermark (text and/or logo).  PdfDecor.page(page, index, S, info) → inner SVG markup. */
(function (global) {
  'use strict';
  var MM = 72 / 25.4;
  function f2(n) { return (Math.round(n * 100) / 100).toString(); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var AR = /[؀-ۿ]/;
  function T(x, y, s, size, o) {
    o = o || {};
    var rtl = AR.test(s);
    return '<text x="' + f2(x) + '" y="' + f2(y) + '" font-family="' + (o.font || 'Amiri') + ', Times New Roman, serif" font-size="' + f2(size) + '"' +
      (o.bold ? ' font-weight="700"' : '') + ' fill="' + (o.color || '#1b2a30') + '"' + (o.opacity !== undefined ? ' fill-opacity="' + o.opacity + '"' : '') +
      ' text-anchor="' + (o.anchor || 'middle') + '" style="direction:' + (rtl ? 'rtl' : 'ltr') + '" direction="' + (rtl ? 'rtl' : 'ltr') + '"' +
      (o.transform ? ' transform="' + o.transform + '"' : '') + '>' + esc(s) + '</text>';
  }
  function digits(s, eastern) { return eastern ? String(s).replace(/[0-9]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[+d]; }) : String(s); }

  // ------------------------------------------------------------ solution-page templates
  var TEMPLATES = {
    '': 'فارغة',
    lines: 'مسطّرة',
    grid: 'مربعات (5 مم)',
    dots: 'نقاط',
    axes: 'محاور إحداثية + أسطر',
    half: 'مساحة للسؤال في الأعلى + أسطر'
  };
  function lines(c, y0, gap, out) {
    for (var y = y0; y < c.y + c.h - 30; y += gap) out.push('<line x1="' + f2(c.x + 36) + '" y1="' + f2(y) + '" x2="' + f2(c.x + c.w - 36) + '" y2="' + f2(y) + '" stroke="#b9ccd6" stroke-width="0.6"/>');
    // margin line on the right (Arabic writing starts there)
    out.push('<line x1="' + f2(c.x + c.w - 60) + '" y1="' + f2(y0 - 20) + '" x2="' + f2(c.x + c.w - 60) + '" y2="' + f2(c.y + c.h - 30) + '" stroke="#e8a3a3" stroke-width="0.7"/>');
  }
  function grid(c, y0, y1, out) {
    var s = 5 * MM, k = 0, x0 = c.x + 28, x1 = c.x + c.w - 28;
    for (var y = y0; y <= y1 + 0.1; y += s, k++) out.push('<line x1="' + f2(x0) + '" y1="' + f2(y) + '" x2="' + f2(x1) + '" y2="' + f2(y) + '" stroke="' + (k % 5 ? '#d7e3e8' : '#a9c1cb') + '" stroke-width="' + (k % 5 ? 0.45 : 0.7) + '"/>');
    k = 0;
    for (var x = x0; x <= x1 + 0.1; x += s, k++) out.push('<line x1="' + f2(x) + '" y1="' + f2(y0) + '" x2="' + f2(x) + '" y2="' + f2(y1) + '" stroke="' + (k % 5 ? '#d7e3e8' : '#a9c1cb') + '" stroke-width="' + (k % 5 ? 0.45 : 0.7) + '"/>');
  }
  function template(p, c) {
    var t = p.tpl || '', out = [], top = c.y + (p.title ? 64 : 40);
    if (t === 'lines') lines(c, top + 10, 26, out);
    else if (t === 'grid') grid(c, top, c.y + c.h - 30, out);
    else if (t === 'dots') {
      var s = 5 * MM;
      for (var y = top; y < c.y + c.h - 28; y += s) for (var x = c.x + 28; x < c.x + c.w - 28; x += s) out.push('<circle cx="' + f2(x) + '" cy="' + f2(y) + '" r="0.75" fill="#9fb6c0"/>');
    } else if (t === 'axes') {
      var h = Math.min(c.h * 0.45, c.w - 56), gy1 = top + h, gx0 = c.x + (c.w - h) / 2, cx = gx0 + h / 2, cy = top + h / 2, s2 = 5 * MM;
      // square grid with the axes through the middle
      var n = Math.floor(h / s2), size = n * s2, ox = cx - size / 2, oy = cy - size / 2;
      for (var k = 0; k <= n; k++) {
        out.push('<line x1="' + f2(ox) + '" y1="' + f2(oy + k * s2) + '" x2="' + f2(ox + size) + '" y2="' + f2(oy + k * s2) + '" stroke="#d7e3e8" stroke-width="0.45"/>');
        out.push('<line x1="' + f2(ox + k * s2) + '" y1="' + f2(oy) + '" x2="' + f2(ox + k * s2) + '" y2="' + f2(oy + size) + '" stroke="#d7e3e8" stroke-width="0.45"/>');
      }
      var ax = ox + Math.round(n / 2) * s2, ay = oy + Math.round(n / 2) * s2;
      out.push('<path d="M' + f2(ox - 6) + ' ' + f2(ay) + 'H' + f2(ox + size + 8) + 'M' + f2(ax) + ' ' + f2(oy + size + 6) + 'V' + f2(oy - 8) + '" stroke="#2b4148" stroke-width="1" fill="none"/>');
      out.push('<path d="M' + f2(ox + size + 10) + ' ' + f2(ay) + 'l-7 -3v6z M' + f2(ax) + ' ' + f2(oy - 10) + 'l-3 7h6z" fill="#2b4148"/>');
      out.push(T(ox + size + 10, ay + 14, 'س', 11, { color: '#2b4148' }), T(ax - 10, oy - 4, 'ص', 11, { color: '#2b4148' }));
      lines(c, oy + size + 36, 26, out);
    } else if (t === 'half') {
      var qh = Math.min(260, c.h * 0.33);
      out.push('<rect x="' + f2(c.x + 30) + '" y="' + f2(top - 6) + '" width="' + f2(c.w - 60) + '" height="' + f2(qh) + '" rx="8" fill="#f6fafb" stroke="#b9ccd6" stroke-width="0.8" stroke-dasharray="4 3"/>');
      out.push(T(c.x + c.w - 42, top + 12, 'السؤال', 11, { anchor: 'start', color: '#6b8792', bold: true }));
      out.push(T(c.x + c.w - 42, top + qh + 26, 'الحل', 12, { anchor: 'start', color: '#0a7c78', bold: true }));
      lines(c, top + qh + 50, 26, out);
    }
    if (p.title) {
      out.push(T(c.x + c.w - 36, c.y + 38, p.title, 15, { anchor: 'start', bold: true, color: '#0a7c78' }));
      out.push('<line x1="' + f2(c.x + 36) + '" y1="' + f2(c.y + 48) + '" x2="' + f2(c.x + c.w - 36) + '" y2="' + f2(c.y + 48) + '" stroke="#0e9f9a" stroke-width="1"/>');
    }
    return out.join('');
  }

  // ------------------------------------------------------------ page numbers
  var NUM_FORMATS = { n: '{n}', dash: '- {n} -', of: '{n} / {N}', ar: 'صفحة {n}', arOf: 'صفحة {n} من {N}' };
  function numbers(p, i, S, info, c) {
    var o = S.deco && S.deco.num;
    if (!o || !o.on) return '';
    var n = info ? info.n : i + 1, N = info ? info.N : S.pages.length;
    if (o.skipFirst && n === 1) return '';
    if (o.onlyBook && p.src < 0) return '';
    var start = +o.start || 1, shown = n - 1 + start, total = N - 1 + start;
    var txt = (NUM_FORMATS[o.fmt] || '{n}').replace('{n}', digits(shown, o.eastern)).replace('{N}', digits(total, o.eastern));
    var pos = o.pos || 'bc', size = +o.size || 11, m = 22;
    var x = /c$/.test(pos) ? c.x + c.w / 2 : /r$/.test(pos) ? c.x + c.w - m : c.x + m;
    var y = /^t/.test(pos) ? c.y + m + size * 0.4 : c.y + c.h - m + size * 0.35;
    var anchor = /c$/.test(pos) ? 'middle' : /r$/.test(pos) ? 'end' : 'start';
    if (AR.test(txt)) anchor = anchor === 'end' ? 'start' : anchor === 'start' ? 'end' : 'middle';   // rtl text: anchors swap sides
    return T(x, y, txt, size, { anchor: anchor, color: o.color || '#4a5f66' });
  }

  // ------------------------------------------------------------ watermark
  function watermark(p, S, c) {
    var w = S.deco && S.deco.wm;
    if (!w || !w.on) return '';
    if (w.scope === 'sol' && p.src >= 0 && !p.sol) return '';
    var op = w.opacity !== undefined ? +w.opacity : 0.12, out = '', cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    var ang = w.angle === undefined ? -35 : +w.angle;
    if (w.pos === 'bottom') { cy = c.y + c.h - 50; ang = 0; }
    if (w.img && S.assets && S.assets[w.img]) {
      var iw = Math.min(c.w * (w.imgScale || 0.45), 360), ih = iw * (w.imgRatio || 1);
      out += '<image href="' + S.assets[w.img] + '" x="' + f2(cx - iw / 2) + '" y="' + f2(cy - ih / 2 - (w.text ? 30 : 0)) + '" width="' + f2(iw) + '" height="' + f2(ih) + '" opacity="' + op + '" preserveAspectRatio="xMidYMid meet"/>';
    }
    if (w.text) {
      var size = +w.size || Math.min(64, c.w / Math.max(4, w.text.length * 0.55));
      out += '<g opacity="' + op + '">' + T(cx, cy + size * 0.35 + (w.img ? 40 : 0), w.text, size, { color: w.color || '#0e9f9a', bold: true, transform: ang ? 'rotate(' + ang + ' ' + f2(cx) + ' ' + f2(cy) + ')' : '' }) + '</g>';
    }
    return out;
  }

  function page(p, i, S, info) {
    var c = p.crop || { x: 0, y: 0, w: p.w, h: p.h };
    var ex = info && typeof info === 'object' ? info : null;
    return (p.src < 0 ? template(p, c) : '') + watermark(p, S, c) + numbers(p, i, S, ex, c);
  }

  global.PdfDecor = { page: page, TEMPLATES: TEMPLATES, NUM_FORMATS: NUM_FORMATS };
})(window);
