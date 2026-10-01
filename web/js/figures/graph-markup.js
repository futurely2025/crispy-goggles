/*
 * Graph markup  <->  GraphRender data
 *
 * \begin{graph}[x=-6:6, y=-4:8, grid, pi, digits=eastern, roots, extrema, intersections, width=12cm, height=9cm, title={…}]
 *   \plot[color=red, name=د(س), style=dashed, width=thick, domain=-2:2]{س^2 - 4}
 *   \plot{س = 2}                          % vertical line
 *   \points[color=blue, line]{(0,1) (1,3) (2,2)}
 *   \point[label=أ]{(2, 0)}
 *   \area[of=1, and=2, from=-2, to=2, color=teal]
 * \end{graph}
 *
 * Also imports pgfplots:  \begin{tikzpicture}\begin{axis}[…] \addplot[…]{x^2}; … \end{axis}\end{tikzpicture}
 */
(function (global) {
  'use strict';
  var CM = 37.7953;
  var WIDTHS = { 'ultra thin': 0.8, 'very thin': 1, thin: 1.4, semithick: 1.8, medium: 2.2, thick: 2.6, 'very thick': 3.4, 'ultra thick': 4.2 };

  function size(v, dflt) {
    if (v === undefined || v === true) return dflt;
    var s = Mk.digits(String(v)).trim(), n = parseFloat(s);
    if (!isFinite(n)) return dflt;
    if (/cm|سم/.test(s)) return Math.round(n * CM);
    if (/mm|مم/.test(s)) return Math.round(n * CM / 10);
    if (/in/.test(s)) return Math.round(n * 96);
    return Math.round(n);
  }
  function widthOf(v, dflt) {
    if (v === undefined || v === true) return dflt;
    if (WIDTHS[v] !== undefined) return WIDTHS[v];
    var n = Mk.evalNum(v, NaN); return isFinite(n) ? n : dflt;
  }
  function styleOf(o) {
    var st = o.style || '';
    if (o.dashed || /dash/.test(st)) return 'dash';
    if (o.dotted || /dot/.test(st)) return 'dot';
    return 'solid';
  }
  function nextColor(d) {
    var used = d.fns.map(function (f) { return f.color; });
    return GraphRender.PALETTE.filter(function (c) { return used.indexOf(c) < 0; })[0] || GraphRender.PALETTE[d.fns.length % GraphRender.PALETTE.length];
  }
  function hasArabic(s) { return /[؀-ۿ]/.test(s); }

  function applyEnvOptions(d, o) {
    if (o.x !== undefined) { var r = Mk.range(o.x); if (isFinite(r[0]) && isFinite(r[1]) && r[1] > r[0]) { d.xmin = r[0]; d.xmax = r[1]; } }
    if (o.y !== undefined) { var r2 = Mk.range(o.y); if (isFinite(r2[0]) && isFinite(r2[1]) && r2[1] > r2[0]) { d.ymin = r2[0]; d.ymax = r2[1]; d.auto = false; } }
    ['xmin', 'xmax', 'ymin', 'ymax'].forEach(function (k) {
      if (o[k] !== undefined) { var n = Mk.evalNum(o[k], NaN); if (isFinite(n)) { d[k] = n; if (k[0] === 'y') d.auto = false; } }
    });
    if (o.auto !== undefined) d.auto = Mk.bool(o, 'auto', true);
    d.w = size(o.width, d.w); d.h = size(o.height, d.h);
    [['grid', 'grid'], ['minor', 'minor'], ['axes', 'axes'], ['arrows', 'arrows'], ['ticks', 'ticks'], ['axisnames', 'axisNames'], ['pi', 'piTicks'],
      ['roots', 'roots'], ['yint', 'yint'], ['extrema', 'extrema'], ['intersections', 'inter'], ['inter', 'inter'], ['coords', 'coords'], ['equal', 'equal']]
      .forEach(function (p) { d[p[1]] = Mk.bool(o, p[0], d[p[1]]); });
    if (o.digits) d.digits = /east|هند|arab-?indic/i.test(o.digits) ? 'eastern' : 'western';
    if (o.eastern) d.digits = 'eastern';
    if (o.notation) d.notation = /en|lat/i.test(o.notation) ? 'en' : 'ar';
    if (o.title) d.title = o.title;
    if (o.font) d.font = o.font;
    if (o.fontsize) d.fontSize = Mk.evalNum(o.fontsize, d.fontSize);
  }

  function parse(opts, body) {
    var d = GraphRender.defaults();
    d.fns = [];
    d.roots = true; d.yint = true; d.inter = true;
    var o = typeof opts === 'string' ? Mk.options(opts) : (opts || {});
    applyEnvOptions(d, o);
    var sawArabic = false, sawLatin = false;
    Mk.commands(body).forEach(function (c) {
      var n = c.name.toLowerCase(), a = c.args, co = c.opt;
      if (n === 'plot' || n === 'addplot' || n === 'function' || n === 'fn' || n === 'vline') {
        var expr = n === 'vline' ? ((d.notation === 'en' ? 'x' : 'س') + ' = ' + (a[0] || '0')) : (a[0] || '').trim();
        if (!expr) return;
        if (hasArabic(expr)) sawArabic = true; else if (/[a-z]/i.test(expr.replace(/\\[a-z]+/gi, ''))) sawLatin = true;
        var fn = { expr: expr, color: Mk.color(co.color || firstColorKey(co), nextColor(d)),
          width: widthOf(co.width || firstWidthKey(co), 2.2), dash: styleOf(co), name: co.name || '', label: Mk.bool(co, 'label', true), visible: true };
        if (co.domain) { var dm = Mk.range(co.domain); if (isFinite(dm[0]) && isFinite(dm[1])) fn.domain = dm; }
        d.fns.push(fn);
      } else if (n === 'points' || n === 'data') {
        var pts = parsePoints(a[0] || '');
        if (pts.length) d.fns.push({ pts: pts, color: Mk.color(co.color || firstColorKey(co), nextColor(d)),
          width: widthOf(co.width, 2.2), dash: styleOf(co), line: Mk.bool(co, 'line', false), marks: Mk.bool(co, 'marks', true), label: false, visible: true });
      } else if (n === 'point') {
        var label = co.label || '', pv;
        if (a.length >= 2) { label = a[0]; pv = Mk.point(a[1]); }
        else if (c.coords.length) { label = a[0] || label; pv = Mk.point(c.coords[0]); }
        else pv = Mk.point(a[0] || '');
        if (isFinite(pv[0]) && isFinite(pv[1])) d.points.push({ x: pv[0], y: pv[1], label: label });
      } else if (n === 'area' || n === 'shade') {
        d.area = { on: true, fn: Math.max(0, (Mk.evalNum(co.of || co.under || 1, 1) | 0) - 1), fn2: co.and || co.above ? (Mk.evalNum(co.and || co.above, 0) | 0) - 1 : -1,
          a: Mk.evalNum(co.from, 0), b: Mk.evalNum(co.to, 1), color: Mk.color(co.color, '#0e9f9a'), value: Mk.bool(co, 'value', true) };
      } else if (n === 'title') {
        d.title = a[0] || '';
      }
    });
    if (!o.notation) d.notation = sawLatin && !sawArabic ? 'en' : 'ar';
    if (!o.pi && d.fns.some(function (f) { return /جا|جتا|طا|\\sin|\\cos|\\tan/.test(f.expr || ''); }) && o.pi === undefined && o.nopi === undefined) d.piTicks = true;
    if (!d.fns.length && !d.points.length) throw new Error('لا توجد دوال داخل الرسم (استخدم \\plot{…})');
    return d;
  }
  function firstColorKey(o) { var k = Object.keys(o).filter(function (x) { return o[x] === true && Mk.COLORS[x.split('!')[0].toLowerCase()]; })[0]; return k; }
  function firstWidthKey(o) { return Object.keys(o).filter(function (x) { return o[x] === true && WIDTHS[x] !== undefined; })[0]; }
  function parsePoints(s) {
    var out = [], re = /\(([^()]*)\)/g, m;
    while ((m = re.exec(s))) { var p = Mk.point(m[1]); if (isFinite(p[0]) && isFinite(p[1])) out.push(p); }
    return out;
  }

  function serialize(d) {
    var o = [];
    o.push(['x', Mk.fmt(d.xmin, 3) + ':' + Mk.fmt(d.xmax, 3)]);
    if (!d.auto) o.push(['y', Mk.fmt(d.ymin, 3) + ':' + Mk.fmt(d.ymax, 3)]);
    var dflt = GraphRender.defaults();
    [['grid', 'grid'], ['minor', 'minor'], ['axes', 'axes'], ['arrows', 'arrows'], ['ticks', 'ticks'], ['axisnames', 'axisNames']].forEach(function (p) { if (d[p[1]] === false) o.push('no' + p[0]); });
    if (d.piTicks) o.push('pi');
    if (d.roots === false) o.push('noroots'); if (d.yint === false) o.push('noyint');
    if (d.extrema) o.push('extrema'); if (d.inter === false) o.push('nointersections');
    if (d.coords === false) o.push('nocoords'); if (d.equal) o.push('equal');
    if (d.digits === 'eastern') o.push(['digits', 'eastern']);
    if (d.notation === 'en') o.push(['notation', 'en']);
    if (d.w !== dflt.w) o.push(['width', (d.w / CM).toFixed(1) + 'cm']);
    if (d.h !== dflt.h) o.push(['height', (d.h / CM).toFixed(1) + 'cm']);
    if (d.title) o.push(['title', d.title]);
    if (d.font && d.font !== dflt.font) o.push(['font', d.font]);
    var lines = ['\\begin{graph}' + Mk.optStr(o)];
    d.fns.forEach(function (f, i) {
      var fo = [];
      if (f.color && f.color !== GraphRender.PALETTE[i % GraphRender.PALETTE.length]) fo.push(['color', f.color]);
      if (f.name) fo.push(['name', f.name]);
      if (f.dash === 'dash') fo.push('dashed'); if (f.dash === 'dot') fo.push('dotted');
      if (f.width && Math.abs(f.width - 2.2) > 0.05) fo.push(['width', f.width]);
      if (f.domain) fo.push(['domain', Mk.fmt(f.domain[0], 3) + ':' + Mk.fmt(f.domain[1], 3)]);
      if (f.label === false && !f.pts) fo.push('nolabel');
      if (f.pts) {
        if (f.line) fo.push('line'); if (f.marks === false) fo.push('nomarks');
        lines.push('  \\points' + Mk.optStr(fo) + '{' + f.pts.map(function (p) { return '(' + Mk.fmt(p[0], 4) + ', ' + Mk.fmt(p[1], 4) + ')'; }).join(' ') + '}');
      } else if (String(f.expr || '').trim()) lines.push('  \\plot' + Mk.optStr(fo) + '{' + f.expr + '}');
    });
    (d.points || []).forEach(function (p) { lines.push('  \\point' + Mk.optStr([['label', p.label]]) + '{(' + p.x + ', ' + p.y + ')}'); });
    if (d.area && d.area.on) {
      lines.push('  \\area' + Mk.optStr([['of', d.area.fn + 1], ['and', d.area.fn2 >= 0 ? d.area.fn2 + 1 : null], ['from', Mk.fmt(+d.area.a, 4)], ['to', Mk.fmt(+d.area.b, 4)],
        ['color', d.area.color !== '#0e9f9a' ? d.area.color : null], d.area.value === false ? 'novalue' : null]));
    }
    lines.push('\\end{graph}');
    return lines.join('\n');
  }

  // ------------------------------------------------------------ pgfplots import
  function pgfExpr(e) {
    var s = String(e).trim().replace(/;$/, '');
    // pgfplots trig functions take degrees: sin(deg(x)) == sin x (radians); sin(x) == sin(x°)
    s = s.replace(/\b(sin|cos|tan|cot|sec|csc)\s*\(\s*deg\s*\(/g, '$1R((');
    s = s.replace(/\b(sin|cos|tan)\s*\(/g, '$1D(');
    s = s.replace(/\bdeg\s*\(/g, '(180/\\pi)*(').replace(/\brad\s*\(/g, '(\\pi/180)*(');
    // functions to LaTeX
    var out = '', i = 0;
    while (i < s.length) {
      var m = /^(sinR|cosR|tanR|cotR|secR|cscR|sinD|cosD|tanD|sqrt|exp|ln|log10|log2|log|abs|e|pi)\b/.exec(s.slice(i));
      if (m && !/[a-zA-Z]/.test(s[i - 1] || '')) {
        var name = m[1]; i += name.length;
        if (name === 'pi') { out += '\\pi '; continue; }
        if (name === 'e' && s[i] !== '(') { out += 'e'; continue; }
        while (s[i] === ' ') i++;
        if (s[i] !== '(') { out += name; continue; }
        var g = Mk.group(s, i); i = g.end;
        var inner = pgfExpr(g.content);
        if (/R$/.test(name)) out += '\\' + name.slice(0, -1) + '(' + inner + ')';
        else if (/D$/.test(name)) out += '\\' + name.slice(0, -1) + '(\\frac{\\pi (' + inner + ')}{180})';
        else if (name === 'sqrt') out += '\\sqrt{' + inner + '}';
        else if (name === 'exp') out += 'e^{' + inner + '}';
        else if (name === 'ln' || name === 'log') out += '\\ln(' + inner + ')';
        else if (name === 'log10') out += '\\log(' + inner + ')';
        else if (name === 'log2') out += '\\log_2(' + inner + ')';
        else if (name === 'abs') out += '|' + inner + '|';
        continue;
      }
      if (s[i] === '*' && s[i + 1] === '*') { out += '^'; i += 2; continue; }
      if (s[i] === '*') { out += ' \\cdot '; i++; continue; }
      if (s[i] === '^' && s[i + 1] === '(') { var g2 = Mk.group(s, i + 1); out += '^{' + pgfExpr(g2.content) + '}'; i = g2.end; continue; }
      out += s[i++];
    }
    return out.replace(/\s+/g, ' ').trim();
  }
  function fromPgf(code) {
    var d = GraphRender.defaults();
    d.fns = []; d.notation = 'en'; d.roots = false; d.yint = false; d.inter = false; d.auto = true;
    var am = code.match(/\\begin\{axis\}\s*(\[)?/);
    var o = {};
    if (am && am[1]) { var g = Mk.group(code, am.index + am[0].length - 1); o = Mk.options(g.content); }
    if (o.xmin !== undefined) d.xmin = Mk.evalNum(o.xmin, d.xmin);
    if (o.xmax !== undefined) d.xmax = Mk.evalNum(o.xmax, d.xmax);
    if (o.ymin !== undefined && o.ymax !== undefined) { d.ymin = Mk.evalNum(o.ymin, d.ymin); d.ymax = Mk.evalNum(o.ymax, d.ymax); d.auto = false; }
    if (o.domain && o.xmin === undefined) { var dm = Mk.range(o.domain); if (isFinite(dm[0])) { d.xmin = dm[0]; d.xmax = dm[1]; } }
    d.grid = !!o.grid && !/none/.test(String(o.grid));
    d.minor = /both|minor/.test(String(o.grid || ''));
    if (o.title) d.title = Mk.unbrace(o.title).replace(/\$/g, '');
    if (o.width) d.w = size(o.width, d.w);
    if (o.height) d.h = size(o.height, d.h);
    if (/pi/.test(String(o.xtick || '') + String(o.xticklabels || ''))) d.piTicks = true;
    var body = code.replace(/^[\s\S]*?\\begin\{axis\}(\s*\[[^\]]*(\[[^\]]*\][^\]]*)*\])?/, '').replace(/\\end\{axis\}[\s\S]*$/, '');
    var re = /\\addplot\+?\s*(\[[^\]]*(?:\[[^\]]*\][^\]]*)*\])?\s*([\s\S]*?);/g, m, legends = [];
    var lm, lre = /\\addlegendentry\s*\{([^}]*)\}/g;
    while ((lm = lre.exec(body))) legends.push(lm[1].replace(/\$/g, ''));
    var k = 0;
    while ((m = re.exec(body))) {
      var po = m[1] ? Mk.options(m[1].slice(1, -1)) : {};
      var rest = m[2].trim();
      var color = Mk.color(po.color || firstColorKey(po) || po.draw, GraphRender.PALETTE[k % GraphRender.PALETTE.length]);
      var width = widthOf(firstWidthKey(po) || po['line width'], 2.2);
      if (/^coordinates/.test(rest)) {
        var pts = parsePoints(rest.replace(/^coordinates\s*/, ''));
        d.fns.push({ pts: pts, color: color, width: width, dash: styleOf(po), line: !po['only marks'], marks: !!po['only marks'] || !!po.mark, label: false, visible: true });
      } else {
        var ex = rest.replace(/^\(\s*\{?\s*x\s*\}?\s*,\s*\{?([\s\S]*?)\}?\s*\)$/, '$1').replace(/^\{([\s\S]*)\}$/, '$1');
        var fn = { expr: pgfExpr(ex), color: color, width: width, dash: styleOf(po), name: legends[k] ? '' : '', label: !!legends[k], visible: true };
        if (legends[k]) { var lg = legends[k].replace(/\s/g, ''); fn.name = lg.replace(/=.*$/, '') || 'y'; }
        if (po.domain) { var dd = Mk.range(po.domain); if (isFinite(dd[0])) fn.domain = dd; }
        d.fns.push(fn);
      }
      k++;
    }
    if (!d.fns.length) throw new Error('لم أجد \\addplot داخل الرسم');
    return d;
  }

  global.GraphMarkup = { parse: parse, serialize: serialize, fromPgf: fromPgf, pgfExpr: pgfExpr };
})(window);
