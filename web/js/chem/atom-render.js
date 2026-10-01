/* AtomRender — element card, Bohr model, Lewis dot symbol, orbital (box) diagram and the periodic table.
 *   \element{Fe}   \bohr{Na}   \lewis{Cl}   \lewis{Na+}   \lewis{O2-}   \orbital{O}   \orbital[short]{Fe}
 *   \ptable   \ptable[highlight={Na,K,Rb}, names]
 * All return {svg, w, h}; texts are plain SVG text (the add-in turns them into outlines when inserting). */
(function (global) {
  'use strict';
  var INK = '#1b2a30', TQ = '#0e9f9a', MUT = '#5f7179';
  function E() { return global.ChemElements; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function f2(v) { return (+v).toFixed(2); }
  function T(x, y, s, size, o) {
    o = o || {};
    var ar = /[؀-ۿ]/.test(s);
    return '<text x="' + f2(x) + '" y="' + f2(y) + '" text-anchor="' + (o.anchor || 'middle') + '" font-family="' + (ar ? 'Amiri' : 'Times New Roman') + ', serif" font-size="' + f2(size) + '"' +
      (o.bold ? ' font-weight="700"' : '') + (o.italic ? ' font-style="italic"' : '') + ' fill="' + (o.color || INK) + '" style="direction:' + (ar ? 'rtl' : 'ltr') + '" direction="' + (ar ? 'rtl' : 'ltr') + '">' + esc(s) + '</text>';
  }
  function wrap(w, h, body) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + f2(w) + '" height="' + f2(h) + '" viewBox="0 0 ' + f2(w) + ' ' + f2(h) + '"><rect width="100%" height="100%" fill="#fff"/>' + body + '</svg>';
  }
  function massTxt(e) { return Number.isInteger(e.mass) ? '(' + e.mass + ')' : String(e.mass); }

  function card(sym, o) {
    var e = E().info(sym), w = 150, h = 176;
    var b = '<rect x="4" y="4" width="' + (w - 8) + '" height="' + (h - 8) + '" rx="10" fill="' + e.color + '" stroke="' + INK + '" stroke-width="1.6"/>';
    b += T(w - 16, 30, String(e.z), 18, { anchor: 'end', bold: true });
    b += T(w / 2, 96, e.sym, 56, { bold: true });
    b += T(w / 2, 126, e.ar, 19, { bold: true });
    b += T(w / 2, 154, massTxt(e), 15);
    if (!o || !o.nolabels) b += T(16, 30, e.catAr, 10.5, { anchor: 'end', color: MUT });   // rtl text: 'end' = its left edge
    return { svg: wrap(w, h, b), w: w, h: h };
  }

  function bohr(sym, o) {
    var e = E().info(sym), n = e.shells.length, rn = 30, step = 28, R = rn + step * n, pad = 34, w = 2 * (R + pad), h = 2 * (R + pad) + 56;
    var cx = w / 2, cy = R + pad, b = '';
    var names = ['K', 'L', 'M', 'N', 'O', 'P', 'Q'];
    e.shells.forEach(function (cnt, i) {
      var r = rn + step * (i + 1);
      b += '<circle cx="' + f2(cx) + '" cy="' + f2(cy) + '" r="' + f2(r) + '" fill="none" stroke="#8aa0a8" stroke-width="1.3"/>';
      for (var k = 0; k < cnt; k++) {
        var a = -Math.PI / 2 + 2 * Math.PI * k / cnt;
        b += '<circle cx="' + f2(cx + r * Math.cos(a)) + '" cy="' + f2(cy + r * Math.sin(a)) + '" r="4.6" fill="' + TQ + '" stroke="#fff" stroke-width="1.2"/>';
      }
      // shell label in the gap between two electrons, as close as possible to the upper right
      var st = 360 / Math.max(cnt, 1), best = -40;
      if (cnt > 2) { best = 1e9; for (var j = 0; j < cnt; j++) { var cand = -90 + st * (j + 0.5); if (Math.abs(cand + 40) < Math.abs(best + 40)) best = cand; } }
      var la = best * Math.PI / 180;
      b += '<rect x="' + f2(cx + r * Math.cos(la) - 1) + '" y="' + f2(cy + r * Math.sin(la) - 7) + '" width="' + f2(names[i].length * 7 + String(cnt).length * 6 + 16) + '" height="13" rx="3" fill="#fff" opacity="0.9"/>';
      b += T(cx + r * Math.cos(la) + 2, cy + r * Math.sin(la) + 4, names[i] + ' (' + cnt + ')', 11, { color: MUT, anchor: 'start' });
    });
    b += '<circle cx="' + f2(cx) + '" cy="' + f2(cy) + '" r="' + rn + '" fill="#ffd8c2" stroke="#c2352b" stroke-width="1.6"/>';
    b += T(cx, cy - 2, e.z + 'p', 13, { bold: true, color: '#c2352b' });
    b += T(cx, cy + 14, e.neutrons + 'n', 12, { color: INK });
    b += T(cx, h - 30, e.ar, 16, { bold: true });
    b += T(cx, h - 10, e.sym + ':  ' + e.shells.join(', '), 13, { color: MUT });   // separate lines: no mixed-direction text
    return { svg: wrap(w, h, b), w: w, h: h };
  }

  // valence dots: one per side first (top, right, bottom, left), then pairs
  function dots(cnt) {
    var sides = [0, 0, 0, 0];
    for (var i = 0; i < cnt; i++) sides[i % 4]++;
    return sides;
  }
  function lewis(q, o) {
    var m = String(q).trim().match(/^([A-Z][a-z]?)(\d*)([+-])?$/);
    if (!m) { try { m = [0, E().info(String(q).trim()).sym, '', null]; } catch (x) { m = null; } }   // Arabic name: \lewis{الكلور}
    if (!m) throw new Error('اكتب رمز العنصر مثل \\lewis{O} أو أيوناً مثل \\lewis{Na+}');
    var e = E().info(m[1]), charge = m[3] ? (m[3] === '+' ? 1 : -1) * (+m[2] || 1) : 0;
    if (e.valence === null) throw new Error('تمثيل لويس للعناصر الممثلة فقط (المجموعات 1، 2، 13–18)');
    var v = Math.max(0, Math.min(8, e.valence - charge));
    var fs = 54, w = 170, h = 150, cx = w / 2, cy = h / 2 + 4, b = '';
    b += T(cx, cy + fs * 0.34, e.sym, fs);
    // fill order: one dot on each side (top, right, bottom, left), then the second of each pair
    var place = [[0, -1], [1, 0], [0, 1], [-1, 0]], off = 38, gap = 7, counts = [0, 0, 0, 0];
    if (e.z === 2) { b += '<circle cx="' + f2(cx - 7) + '" cy="' + f2(cy - 42) + '" r="4.3" fill="' + INK + '"/><circle cx="' + f2(cx + 7) + '" cy="' + f2(cy - 42) + '" r="4.3" fill="' + INK + '"/>'; v = 0; }
    for (var i = 0; i < v; i++) {
      var side = i % 4, second = i >= 4, d = place[side], t = [-d[1], d[0]];
      var px = cx + d[0] * off + (side === 1 ? 4 : side === 3 ? -4 : 0), py = cy + d[1] * off + (side === 0 ? -4 : side === 2 ? 6 : 0);
      counts[side]++;
      var sft = v > side + 4 || second ? (second ? gap : -gap) : 0;
      b += '<circle cx="' + f2(px + t[0] * sft) + '" cy="' + f2(py + t[1] * sft) + '" r="4.3" fill="' + (i >= e.valence ? '#c2352b' : INK) + '"/>';
    }
    if (charge) {
      b += '<path d="M' + f2(cx - 64) + ' ' + f2(cy - 58) + 'h-8v116h8M' + f2(cx + 64) + ' ' + f2(cy - 58) + 'h8v116h-8" fill="none" stroke="' + INK + '" stroke-width="2.2"/>';
      b += T(cx + 84, cy - 46, (Math.abs(charge) > 1 ? Math.abs(charge) : '') + (charge > 0 ? '+' : '−'), 22, { anchor: 'start', bold: true });
      w = 210;
    }
    b += T(cx, h - 6, e.ar, 14, { color: MUT });
    return { svg: wrap(w, h + 10, b), w: w, h: h + 10 };
  }

  function orbital(sym, o) {
    var e = E().info(sym), cfg = e.config.slice(), core = '';
    if (o && o.short && e.z > 2) {
      var nob = [2, 10, 18, 36, 54, 86].filter(function (n) { return n < e.z; }).pop();
      if (nob) { var nc = E().config(nob).map(function (s) { return s[0] + s[1]; }); cfg = cfg.filter(function (s) { return nc.indexOf(s[0] + s[1]) < 0; }); core = '[' + E().SYM[nob - 1] + ']'; }
    }
    var BW = 30, gap = 16, x = 16 + (core ? 48 : 0), y = 44, b = '';
    if (core) b += T(34, y + 21, core, 17);
    cfg.forEach(function (s) {
      var l = s[0][1], nb = { s: 1, p: 3, d: 5, f: 7 }[l], cnt = s[1];
      var up = [], dn = [];
      for (var i = 0; i < nb; i++) { up[i] = cnt > i ? 1 : 0; dn[i] = cnt > nb + i ? 1 : 0; }       // Hund: one up in each box first
      for (var k = 0; k < nb; k++) {
        var bx = x + k * BW;
        b += '<rect x="' + f2(bx) + '" y="' + y + '" width="' + BW + '" height="' + BW + '" fill="#fff" stroke="' + INK + '" stroke-width="1.5"/>';
        if (up[k]) b += '<path d="M' + f2(bx + 10) + ' ' + (y + 24) + 'V' + (y + 7) + 'M' + f2(bx + 6) + ' ' + (y + 12) + 'L' + f2(bx + 10) + ' ' + (y + 6) + 'L' + f2(bx + 14) + ' ' + (y + 12) + '" stroke="' + TQ + '" stroke-width="2" fill="none"/>';
        if (dn[k]) b += '<path d="M' + f2(bx + 20) + ' ' + (y + 6) + 'V' + (y + 23) + 'M' + f2(bx + 16) + ' ' + (y + 18) + 'L' + f2(bx + 20) + ' ' + (y + 24) + 'L' + f2(bx + 24) + ' ' + (y + 18) + '" stroke="#c2352b" stroke-width="2" fill="none"/>';
      }
      b += T(x + nb * BW / 2, y + BW + 20, s[0], 15, { italic: false });
      b += T(x + nb * BW / 2, y - 10, String(cnt) + 'e', 11, { color: MUT });
      x += nb * BW + gap;
    });
    // caption on two lines (Arabic name / Latin configuration): mixing both in one SVG text breaks the bidi order
    var cfgTxt = E().configTex(e.sym, !!(o && o.short)).replace(/\\(?:text|mathrm)\{([^}]*)\}/g, '$1').replace(/\^\{(\d+)\}/g, function (m0, d) { return d.split('').map(function (c) { return '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]; }).join(''); }).replace(/\\,/g, ' ');
    var w = Math.max(x + 4, 16 + cfgTxt.length * 7.2, 150), h = y + BW + 78;
    b += T(w / 2, h - 30, e.ar, 14, { bold: true });
    b += T(w / 2, h - 10, e.sym + ':  ' + cfgTxt, 13, { color: MUT });
    return { svg: wrap(w, h, b), w: w, h: h };
  }

  function ptable(o) {
    o = o || {};
    var hl = o.highlight ? String(o.highlight).replace(/[{}]/g, '').split(/[,،\s]+/).filter(Boolean) : [];
    var cw = 46, ch = 54, gx = 16, gy = 30, names = !!o.names, b = '';
    var W = gx * 2 + cw * 18, H = gy + ch * 7 + 18 + ch * 2 + 90;
    b += T(W / 2, 20, o.title || 'الجدول الدوري للعناصر', 18, { bold: true });
    for (var z = 1; z <= 118; z++) {
      var e = E().info(z), p = E().pos(z), row = p[0], col = p[1];
      var x = gx + (18 - col) * cw, y = gy + (row <= 7 ? (row - 1) * ch : 7 * ch + 18 + (row - 8) * ch);   // right-to-left: group 1 on the right
      if (o.ltr) x = gx + (col - 1) * cw;
      var on = hl.indexOf(e.sym) >= 0 || hl.indexOf(e.ar) >= 0;
      b += '<rect x="' + f2(x + 1) + '" y="' + f2(y + 1) + '" width="' + (cw - 2) + '" height="' + (ch - 2) + '" rx="3" fill="' + e.color + '" stroke="' + (on ? '#c2352b' : '#8aa0a8') + '" stroke-width="' + (on ? 2.6 : 0.8) + '"/>';
      b += T(x + cw - 5, y + 12, String(z), 9, { anchor: 'end', color: MUT });
      b += T(x + cw / 2, y + (names ? 31 : 36), e.sym, names ? 17 : 19, { bold: true });
      if (names) b += T(x + cw / 2, y + 47, e.ar, 8.2);
    }
    // group numbers and legend
    for (var g = 1; g <= 18; g++) b += T(gx + (o.ltr ? g - 1 : 18 - g) * cw + cw / 2, gy - 4, String(g), 9, { color: MUT });
    var cats = Object.keys(E().CAT_AR), lx = W - gx, ly = gy + 7 * ch + 18 + 2 * ch + 26;
    cats.forEach(function (c, i) {
      var colW = (W - 2 * gx) / 5, x = W - gx - (i % 5) * colW, y = ly + Math.floor(i / 5) * 24;
      b += '<rect x="' + f2(x - 18) + '" y="' + f2(y - 12) + '" width="16" height="14" rx="2" fill="' + E().CAT_COLOR[c] + '" stroke="#8aa0a8" stroke-width="0.8"/>';
      b += T(x - 24, y, E().CAT_AR[c], 12, { anchor: 'start' });
    });
    return { svg: wrap(W, H, b), w: W, h: H };
  }

  // ------------------------------------------------------------ figure kind "atom"
  function parse(b) {
    var o = Mk.options(b.opts || '');
    return { v: 1, what: b.env, q: String(b.body || '').trim(), o: o };
  }
  function render(d) {
    var r;
    if (d.what === 'element') r = card(d.q, d.o);
    else if (d.what === 'bohr') r = bohr(d.q, d.o);
    else if (d.what === 'lewis') r = lewis(d.q, d.o);
    else if (d.what === 'orbital') r = orbital(d.q, d.o);
    else r = ptable(d.o);
    return (global.Raster && Raster.fontCss ? Raster.fontCss(['Amiri'], true) : Promise.resolve('')).then(function (css) {
      if (css) r.svg = r.svg.replace(/(<svg[^>]*>)/, '$1<defs><style>' + css + '</style></defs>');
      return r;
    });
  }
  function serialize(d) {
    var op = Object.keys(d.o || {}).map(function (k) { return d.o[k] === true ? k : k + '=' + (/,/.test(d.o[k]) ? '{' + d.o[k] + '}' : d.o[k]); });
    return '\\' + d.what + (op.length ? '[' + op.join(', ') + ']' : '') + (d.what === 'ptable' ? '' : '{' + d.q + '}');
  }
  global.AtomRender = { card: card, bohr: bohr, lewis: lewis, orbital: orbital, ptable: ptable, parse: parse, render: render, serialize: serialize };
})(window);
