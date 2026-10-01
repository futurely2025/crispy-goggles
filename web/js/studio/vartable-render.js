/*
 * VarTable — sign tables and variation tables (جدول الإشارة / جدول التغيرات).
 * data = { v:1, code }
 *
 * \begin{vartable}[digits=eastern]
 *   \x{-\infty, -1, 1, +\infty}                 % first row (x values, LaTeX allowed)
 *   \sign[name=د'(س)]{+, 0, -, 0, +}             % signs between values and 0 / | / || at the values
 *   \var[name=د(س)]{-/-\infty, +/2, -/-2, +/+\infty}   % +/value = top, -/value = bottom, || = not defined; -||+/a/b around a break
 * \end{vartable}
 * \begin{vartable}\auto{س^3 - 3س}\end{vartable}     % built automatically from the function
 * Imports tkz-tab:  \tkzTabInit{$x$/1,$f'(x)$/1,$f(x)$/2}{$-\infty$,$-1$,$1$,$+\infty$}  \tkzTabLine{,+,z,-,z,+,}  \tkzTabVar{-/$-\infty$,+/$2$,-/$-2$,+/$+\infty$}
 */
(function (global) {
  'use strict';
  var INK = '#1b2a30';
  function f2(v) { return (+v).toFixed(2); }
  function clean(s) { return String(s || '').trim().replace(/^\$|\$$/g, '').trim(); }

  function model(code) {
    var src = String(code || '');
    var o = {}, m = src.match(/\\begin\s*\{(vartable|signtable)\}\s*(\[[^\]]*\])?/);
    if (m && m[2]) o = Mk.options(m[2].slice(1, -1));
    var body = src.replace(/\\begin\s*\{(vartable|signtable|tikzpicture)\}\s*(\[[^\]]*\])?/, '').replace(/\\end\s*\{(vartable|signtable|tikzpicture)\}[\s\S]*$/, '');
    var t = { opt: o, x: [], rows: [], xname: o.xname || 'س' };
    if (/\\tkzTab/.test(body)) {
      var init = body.match(/\\tkzTabInit\s*(\[[^\]]*\])?\s*\{([\s\S]*?)\}\s*\{([\s\S]*?)\}\s*(?=\\|$)/);
      if (!init) throw new Error('\\tkzTabInit غير مكتمل');
      var heads = Mk.split(init[2], ',').map(function (h) { var p = h.split('/'); return { name: clean(p[0]), h: +p[1] || 1 }; });
      t.xname = heads[0].name; t.x = Mk.split(init[3], ',').map(clean);
      var hi = 1, re = /\\tkzTab(Line|Var)\s*\{([\s\S]*?)\}\s*(?=\\|$)/g, mm;
      while ((mm = re.exec(body))) {
        var nm = heads[hi] ? heads[hi].name : '';
        if (mm[1] === 'Line') t.rows.push({ t: 'sign', name: nm, cells: Mk.split(mm[2] + ' ', ',').map(function (c) { c = c.trim(); return c === 'z' ? '0' : c === 't' ? '|' : c === 'd' ? '||' : c; }) });
        else t.rows.push({ t: 'var', name: nm, items: Mk.split(mm[2], ',').map(varItem) });
        hi++;
      }
      return t;
    }
    Mk.commands(body).forEach(function (c) {
      if (c.name === 'x') { t.x = Mk.split(c.args[0] || '', ',').map(clean); if (c.opt.name) t.xname = c.opt.name; }
      else if (c.name === 'sign') t.rows.push({ t: 'sign', name: c.opt.name || '', cells: Mk.split((c.args[0] || '') + ' ', ',').map(function (x) { return x.trim(); }) });
      else if (c.name === 'var') t.rows.push({ t: 'var', name: c.opt.name || '', items: Mk.split(c.args[0] || '', ',').map(varItem) });
      else if (c.name === 'auto') t.auto = c.args[0];
    });
    return t;
  }
  function varItem(s) {
    s = String(s).trim();
    var m = s.match(/^([+-]?)(D|\|\|)([+-]?)\s*\/\s*([^/]*)\/?(.*)$/);
    if (m) return { brk: true, l: m[1] || '-', r: m[3] || '+', a: clean(m[4]), b: clean(m[5]) };
    if (s === '||' || s === 'D') return { brk: true, l: '', r: '', a: '', b: '' };
    var p = s.match(/^([+-])\s*\/\s*([\s\S]*)$/);
    if (p) return { pos: p[1], v: clean(p[2]) };
    return { pos: '+', v: clean(s) };
  }

  // ------------------------------------------------------------ automatic table from f(x)  (needs ArabicCAS + nerdamer)
  function auto(expr, o) {
    if (!global.ArabicCAS || !global.nerdamer) throw new Error('محرك الحل غير محمّل');
    o = o || {};
    var p = ArabicCAS.parse(expr), f = p.cas;
    var ctx = p.ctx, T = function (x) { return ArabicCAS.toTex(x, ctx); };
    var fnum = nerdamer(f).buildFunction(['x']);
    var d = nerdamer.diff(f, 'x').toString(), dnum = nerdamer(d).buildFunction(['x']);
    var realRoots = function (e) {
      var out = [];
      try {
        var sols = nerdamer.solve(e, 'x').toString().replace(/^\[|\]$/g, '').split(',').filter(Boolean);
        sols.forEach(function (s) { var v = +nerdamer(s).evaluate().text('decimals'); if (isFinite(v) && !/i/.test(nerdamer(s).evaluate().toString())) out.push({ v: v, tex: /\d{6,}/.test(s) ? String(+v.toFixed(3)) : T(s) }); });
      } catch (e2) { /* ignore */ }
      return out;
    };
    // singular points: bases raised to negative powers in the simplified form, e.g. (-1+x)^(-2)
    var fs = f; try { fs = nerdamer('simplify(' + f + ')').toString(); } catch (e3) { /* keep */ }
    var sing = [], seen = {};
    var bre = /\(([^()]*(?:\([^()]*\)[^()]*)*)\)\^\(-[\d.]+\)|([a-z0-9.+*-]+)\^\(-[\d.]+\)/g, bm;
    while ((bm = bre.exec(fs))) { var base = bm[1] || bm[2]; if (!/x/.test(base) || seen[base]) continue; seen[base] = 1; realRoots(base).forEach(function (r) { sing.push(r); }); }
    var ds = d; try { ds = nerdamer('simplify(' + d + ')').toString(); } catch (e4) { /* keep */ }
    var crit = realRoots(ds).filter(function (c) {
      var v = fnum(c.v); if (!isFinite(v)) return false;
      return !sing.some(function (q) { return Math.abs(q.v - c.v) < 1e-9; });
    });
    var pts = crit.map(function (c) { return { v: c.v, tex: c.tex, kind: 'c' }; }).concat(sing.map(function (q) { return { v: q.v, tex: q.tex, kind: 's' }; }));
    pts.sort(function (a, b) { return a.v - b.v; });
    pts = pts.filter(function (q, k) { return !k || Math.abs(q.v - pts[k - 1].v) > 1e-9; });
    var big = 1e6;
    var limTex = function (x, side) {
      var v = fnum(x + side * 1e-7);
      if (!isFinite(v) || Math.abs(v) > big) return (v > 0 ? '+' : '-') + '\\infty';
      return null;
    };
    var valTex = function (x) {
      try { var s = nerdamer(f).sub('x', String(x)).toString(); var ev = nerdamer('simplify(' + s + ')').toString(); var n2 = +nerdamer(ev).evaluate().text('decimals'); return /\d{6,}/.test(ev) ? String(+n2.toFixed(3)) : T(ev); }
      catch (e5) { return String(+fnum(x).toFixed(3)); }
    };
    var endVal = function (sgn) {
      var xsamp = [10, 30, 100, 300, 1000, 3000, 1e4, 1e5], vals = [];
      xsamp.forEach(function (x) { var v = fnum(sgn * x); if (isFinite(v)) vals.push(v); });
      if (!vals.length) return (sgn > 0 ? '+' : '-') + '\\infty';
      var last = vals[vals.length - 1], prev = vals.length > 1 ? vals[vals.length - 2] : last;
      if (Math.abs(last) > 1e5 && Math.abs(last) >= Math.abs(prev)) return (last > 0 ? '+' : '-') + '\\infty';
      var r = Math.round(last * 1000) / 1000;
      if (Math.abs(r - Math.round(r)) < 1e-3) r = Math.round(r);
      return String(r === 0 ? 0 : r);
    };
    var xs = ['-\\infty'].concat(pts.map(function (q) { return q.tex; }), ['+\\infty']);
    var cells = [], items = [];
    var bounds = [-Infinity].concat(pts.map(function (q) { return q.v; }), [Infinity]);
    var signAt = function (a, b) {
      var m = !isFinite(a) ? b - 1 - Math.abs(b) : !isFinite(b) ? a + 1 + Math.abs(a) : (a + b) / 2;
      if (!isFinite(a) && !isFinite(b)) m = 0;
      var v = dnum(m); return v > 0 ? '+' : v < 0 ? '-' : '0';
    };
    for (var i = 0; i < bounds.length - 1; i++) {
      cells.push(signAt(bounds[i], bounds[i + 1]));
      if (i < pts.length) cells.push(pts[i].kind === 's' ? '||' : '0');
    }
    // variation items: at each boundary, the value (or limits) and its vertical position from the neighbouring signs
    var posAfter = function (s) { return s === '+' ? '+' : '-'; };
    items.push({ pos: cells[0] === '+' ? '-' : '+', v: endVal(-1) });
    pts.forEach(function (q, k) {
      var before = cells[2 * k], after = cells[2 * k + 2];
      if (q.kind === 's') {
        var la = limTex(q.v, -1) || valTex(q.v), rb = limTex(q.v, 1) || valTex(q.v);
        items.push({ brk: true, l: /^\+/.test(la) ? '+' : '-', r: /^\+/.test(rb) ? '+' : '-', a: la, b: rb });
      } else items.push({ pos: before === '+' && after === '-' ? '+' : before === '-' && after === '+' ? '-' : posAfter(before), v: valTex(q.v) });
    });
    var last = cells[cells.length - 1];
    items.push({ pos: last === '+' ? '+' : '-', v: endVal(1) });
    var name = o.name || 'د';
    return { x: xs, rows: [{ t: 'sign', name: name + "'(" + 'س' + ')', cells: [''].concat(cells, ['']) }, { t: 'var', name: name + '(س)', items: items }] };
  }
  function autoCode(expr, o) {
    var a = auto(expr, o);
    var esc = function (s) { return /[,{}]/.test(s) ? '{' + s + '}' : s; };
    return ['\\begin{vartable}', '  \\x{' + a.x.join(', ') + '}',
      '  \\sign[name=' + a.rows[0].name + ']{' + a.rows[0].cells.slice(1, -1).join(', ') + '}',
      '  \\var[name=' + a.rows[1].name + ']{' + a.rows[1].items.map(function (it) { return it.brk ? it.l + '||' + it.r + '/' + esc(it.a) + '/' + esc(it.b) : it.pos + '/' + esc(it.v); }).join(', ') + '}',
      '\\end{vartable}'].join('\n');
  }

  // ------------------------------------------------------------ render
  function render(data) {
    var code = typeof data === 'string' ? data : data.code;
    var t = model(code);
    if (t.auto) { var a = auto(t.auto, t.opt); t.x = a.x; t.rows = a.rows; }
    if (!t.x.length) throw new Error('اكتب قيم س في \\x{…}');
    var o = t.opt, fs = Mk.evalNum(o.fontsize, 12) * 96 / 72;
    var anyAr = /[\u0600-\u06FF]/.test(t.xname + t.rows.map(function (r) { return r.name; }).join(''));
    var ar = o.notation ? !/en|lat/.test(String(o.notation)) : anyAr;
    var eastern = /east|هند/.test(String(o.digits || ''));
    var n = t.x.length, colW = Mk.evalNum(o.colwidth, 74), labW = 96, rowH = fs * 2.4;
    var W = labW + (n - 1) * colW + colW * 0.9, rows = t.rows;
    var heights = rows.map(function (r) { return r.t === 'var' ? rowH * 2.1 : rowH; });
    var H = rowH + heights.reduce(function (s, h) { return s + h; }, 0);
    var labX = ar ? W - labW : 0, gridX0 = ar ? 0 : labW, gridX1 = ar ? W - labW : W;
    var XV = function (i) { return gridX0 + colW * 0.45 + i * colW; };                // x-values increase to the right
    var math = [], out = '';
    var put = function (tex, x, y, color, size) { math.push({ tex: String(tex), x: x, y: y, color: color || INK, size: size || 1 }); };
    // frame
    out += '<rect x="1" y="1" width="' + f2(W - 2) + '" height="' + f2(H - 2) + '" fill="#fff" stroke="' + INK + '" stroke-width="1.6"/>';
    out += '<path d="M' + f2(ar ? labX : labW) + ' 1V' + f2(H - 1) + '" stroke="' + INK + '" stroke-width="1.6"/>';
    var y = rowH;
    out += '<path d="M1 ' + f2(y) + 'H' + f2(W - 1) + '" stroke="' + INK + '" stroke-width="1.6"/>';
    put(t.xname, labX + labW / 2, rowH / 2);
    t.x.forEach(function (v, i) { put(v, XV(i), rowH / 2); });
    rows.forEach(function (r, ri) {
      var h = heights[ri], y0 = y;
      put(r.name, labX + labW / 2, y0 + h / 2);
      if (r.t === 'sign') {
        // cells: [before x0?, at x0, between, at x1, …]  — accept both "n-1 between" and full 2n-1 forms
        var c = r.cells.slice();
        if (c.length === 2 * n + 1) c = c.slice(1, -1);
        if (c.length === n - 1) { var cc = []; c.forEach(function (s, i) { cc.push(s); if (i < n - 2) cc.push(''); }); c = [''].concat(cc, ['']); }
        else if (c.length === 2 * n - 1) { /* ok: value, sign, value, … */ } else if (c.length === 2 * n - 3) c = [''].concat(c, ['']);
        c.forEach(function (s, k) {
          s = String(s).trim();
          if (k % 2 === 0) {                                         // at x value k/2
            var xi = XV(k / 2);
            if (s === '0' || s === 'z') { out += '<path d="M' + f2(xi) + ' ' + f2(y0) + 'V' + f2(y0 + h) + '" stroke="#9fb3b8" stroke-dasharray="3 3"/>'; put('0', xi, y0 + h / 2); }
            else if (s === '|' || s === 't') out += '<path d="M' + f2(xi) + ' ' + f2(y0) + 'V' + f2(y0 + h) + '" stroke="#9fb3b8" stroke-dasharray="3 3"/>';
            else if (s === '||' || s === 'd') out += '<path d="M' + f2(xi - 2) + ' ' + f2(y0) + 'V' + f2(y0 + h) + 'M' + f2(xi + 2) + ' ' + f2(y0) + 'V' + f2(y0 + h) + '" stroke="' + INK + '" stroke-width="1.3"/>';
          } else if (s) {
            var xm = (XV((k - 1) / 2) + XV((k + 1) / 2)) / 2, col = s === '+' ? '#0a7c78' : s === '-' ? '#c2352b' : INK;
            put(s === '-' ? '-' : s, xm, y0 + h / 2, col, 1.15);
          }
        });
      } else {
        var its = r.items, top = y0 + rowH * 0.45, bot = y0 + h - rowH * 0.45;
        var pos = [];
        its.forEach(function (it, i) {
          var xi = XV(i);
          if (it.brk) {
            out += '<path d="M' + f2(xi - 2) + ' ' + f2(y0) + 'V' + f2(y0 + h) + 'M' + f2(xi + 2) + ' ' + f2(y0) + 'V' + f2(y0 + h) + '" stroke="' + INK + '" stroke-width="1.3"/>';
            if (it.a) put(it.a, xi - 20, it.l === '+' ? top : bot);
            if (it.b) put(it.b, xi + 20, it.r === '+' ? top : bot);
            pos.push({ inX: xi - 20, inY: it.l === '+' ? top : bot, outX: xi + 20, outY: it.r === '+' ? top : bot, skipIn: !it.a, skipOut: !it.b });
          } else {
            var yy = it.pos === '+' ? top : it.pos === '-' ? bot : (top + bot) / 2;
            if (it.v !== '') put(it.v, xi, yy);
            pos.push({ inX: xi, inY: yy, outX: xi, outY: yy });
          }
        });
        for (var i = 0; i < pos.length - 1; i++) {
          var a = pos[i], b = pos[i + 1];
          if (a.skipOut || b.skipIn) continue;
          var x1 = a.outX + 20, y1 = a.outY + (b.inY > a.outY ? 8 : b.inY < a.outY ? -8 : 0), x2 = b.inX - 20, y2 = b.inY + (b.inY > a.outY ? -8 : b.inY < a.outY ? 8 : 0);
          if (x2 - x1 < 8) continue;
          var ang = Math.atan2(y2 - y1, x2 - x1), hx = Math.cos(ang), hy = Math.sin(ang);
          out += '<path d="M' + f2(x1) + ' ' + f2(y1) + 'L' + f2(x2 - hx * 6) + ' ' + f2(y2 - hy * 6) + '" stroke="' + INK + '" stroke-width="1.5"/>';
          out += '<path d="M' + f2(x2) + ' ' + f2(y2) + 'L' + f2(x2 - hx * 10 - hy * 4.5) + ' ' + f2(y2 - hy * 10 + hx * 4.5) + 'L' + f2(x2 - hx * 10 + hy * 4.5) + ' ' + f2(y2 - hy * 10 - hx * 4.5) + 'Z" fill="' + INK + '"/>';
        }
      }
      y += h;
      if (ri < rows.length - 1) out += '<path d="M1 ' + f2(y) + 'H' + f2(W - 1) + '" stroke="' + INK + '" stroke-width="1.2"/>';
    });
    var mopts = { rtl: ar, arabicFunctions: ar, arabicComma: ar, digits: eastern ? 'eastern' : 'western', fontSize: 14, mathFont: o.mathfont || 'stix2', font: o.font || 'Amiri', display: false, mode: 'math' };
    var jobs = math.map(function (m) {
      if (!global.RenderHost) return Promise.resolve(null);
      return RenderHost.preview(m.tex, Object.assign({}, mopts, { color: m.color }), true).then(function (r) { return r.errors && r.errors.length ? null : r; }).catch(function () { return null; });
    });
    return Promise.all([Raster.fontCss([o.font || 'Amiri'], true)].concat(jobs)).then(function (res) {
      var css = res[0], lab = '';
      math.forEach(function (m, i) {
        var r = res[i + 1], px = fs * 1.05 * m.size;
        if (!r) { lab += '<text x="' + f2(m.x) + '" y="' + f2(m.y + fs * 0.35) + '" text-anchor="middle" direction="ltr" style="font-family:serif;font-size:' + f2(fs) + 'px" fill="' + m.color + '">' + Raster.esc(Raster.digits(m.tex.replace(/\\infty/g, '∞').replace(/\\/g, ''), eastern)) + '</text>'; return; }
        var w = r.width * px, h = r.total * px;
        lab += r.svgString.replace(/^<svg\b([^>]*)>/, function (m0, a) { return '<svg' + a.replace(/\s(width|height|style|x|y)="[^"]*"/g, '') + ' x="' + f2(m.x - w / 2) + '" y="' + f2(m.y - h / 2) + '" width="' + f2(w) + '" height="' + f2(h) + '" overflow="visible">'; });
      });
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + f2(W) + '" height="' + f2(H) + '" viewBox="0 0 ' + f2(W) + ' ' + f2(H) + '"><defs><style>' + css + '</style></defs>' + out + lab + '</svg>';
      return { svg: svg, w: W, h: H };
    });
  }

  function parse(opts, body, env) {
    var e = env === 'signtable' ? 'signtable' : 'vartable';
    var code = /\\tkzTab/.test(body) && !opts ? body.trim() : '\\begin{' + e + '}' + (opts ? '[' + opts + ']' : '') + '\n' + String(body || '').replace(/^\n+|\s+$/g, '') + '\n\\end{' + e + '}';
    var t = model(code);
    if (!t.x.length && !t.auto) throw new Error('اكتب قيم س في \\x{…} أو استخدم \\auto{الدالة}');
    return { v: 1, code: code };
  }
  function serialize(d) { return String(d.code || '').trim(); }
  global.VarTable = { parse: parse, serialize: serialize, render: render, auto: auto, autoCode: autoCode, model: model };
})(window);
