/*
 * LaTeX tabular  ->  table model (inserted into Word as a real, editable table; $…$ cells become equations)
 *
 * \begin{tabular}{|c|c|c|}  \hline  س & ص & $س^2$ \\ \hline  1 & 2 & $1$ \\ \hline \end{tabular}
 * supports \hline, \cline, \multicolumn{n}{c}{…}, \textbf{…}, $…$ math, \\ rows, options [header, noborder, color=…]
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root.Mk || require('./util.js'));
  else root.TableMarkup = factory(root.Mk);
})(this, function (Mk) {
  'use strict';

  function cellSegs(s) {
    var out = [], buf = '', i = 0, bold = false;
    s = String(s).trim();
    var tb = s.match(/^\\textbf\s*\{([\s\S]*)\}$/);
    if (tb) { s = tb[1]; bold = true; }
    while (i < s.length) {
      var c = s[i];
      if (c === '\\' && s[i + 1] === '$') { buf += '$'; i += 2; continue; }
      if (c === '$') {
        var dbl = s[i + 1] === '$';
        var j = s.indexOf(dbl ? '$$' : '$', i + (dbl ? 2 : 1));
        if (j < 0) { buf += s.slice(i); break; }
        if (buf.trim()) out.push({ t: 'text', v: clean(buf) });
        buf = '';
        var tex = s.slice(i + (dbl ? 2 : 1), j).trim(), ce = tex.match(/^\\ce\s*\{([\s\S]*)\}$/);
        out.push(ce ? { t: 'math', v: ce[1], mode: 'chem' } : { t: 'math', v: tex });
        i = j + (dbl ? 2 : 1);
        continue;
      }
      if (c === '\\' && /^\\ce\s*\{/.test(s.slice(i))) {
        var g = Mk.group(s, s.indexOf('{', i));
        if (buf.trim()) out.push({ t: 'text', v: clean(buf) });
        buf = ''; out.push({ t: 'math', v: g.content, mode: 'chem' }); i = g.end; continue;
      }
      buf += c; i++;
    }
    if (buf.trim()) out.push({ t: 'text', v: clean(buf) });
    return { segs: out, bold: bold };
  }
  function clean(t) {
    return t.replace(/\\textbf\s*\{([^{}]*)\}/g, '$1').replace(/\\text\s*\{([^{}]*)\}/g, '$1').replace(/\\(?:quad|,|;| )/g, ' ')
      .replace(/\\%/g, '%').replace(/\\&/g, '&').replace(/~/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function splitCells(row) {
    var out = [], cur = '', depth = 0, math = false;
    for (var i = 0; i < row.length; i++) {
      var c = row[i];
      if (c === '\\' && i + 1 < row.length) { cur += c + row[i + 1]; i++; continue; }
      if (c === '$') math = !math;
      if (c === '{') depth++; if (c === '}') depth--;
      if (c === '&' && depth === 0 && !math) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  }
  function parse(spec, body, opts) {
    var o = typeof opts === 'string' ? Mk.options(opts) : (opts || {});
    var cols = String(spec || '').replace(/\{[^}]*\}/g, '').replace(/[^lcrpXmb|]/g, '');
    var align = cols.replace(/\|/g, '').split('').map(function (c) { return c === 'l' ? 'left' : c === 'r' ? 'right' : 'center'; });
    var vlines = /\|/.test(cols);
    var rows = [], text = String(body || '').replace(/%[^\n]*/g, '');
    var parts = [], cur = '', depth = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '{') depth++; if (c === '}') depth--;
      if (c === '\\' && text[i + 1] === '\\' && depth === 0) { parts.push(cur); cur = ''; i++; while (text[i + 1] === '[') { var g = Mk.group(text, i + 1); i = g.end - 1; } continue; }
      if (c === '\\' && i + 1 < text.length) { cur += c + text[i + 1]; i++; continue; }
      cur += c;
    }
    if (cur.trim()) parts.push(cur);
    var hlines = 0;
    parts.forEach(function (p) {
      var hl = (p.match(/\\hline|\\toprule|\\midrule|\\bottomrule|\\cline\{[^}]*\}/g) || []).length;
      p = p.replace(/\\hline|\\toprule|\\midrule|\\bottomrule|\\cline\{[^}]*\}/g, '').trim();
      hlines += hl;
      if (rows.length && hl) rows[rows.length - 1].lineBelow = true;
      else if (!rows.length && hl) rows.topLine = true;
      if (!p) return;
      var cells = splitCells(p).map(function (cs) {
        var m = cs.trim().match(/^\\multicolumn\s*\{(\d+)\}\s*\{([^}]*)\}\s*\{([\s\S]*)\}$/);
        if (m) { var cc = cellSegs(m[3]); return { segs: cc.segs, bold: cc.bold, span: +m[1], align: /l/.test(m[2]) ? 'left' : /r/.test(m[2]) ? 'right' : 'center' }; }
        var c2 = cellSegs(cs); return { segs: c2.segs, bold: c2.bold, span: 1 };
      });
      rows.push({ cells: cells });
    });
    if (!rows.length) throw new Error('الجدول فارغ');
    var ncol = Math.max(align.length, Math.max.apply(null, rows.map(function (r) { return r.cells.reduce(function (a, c) { return a + (c.span || 1); }, 0); })));
    while (align.length < ncol) align.push('center');
    var border = o.noborder ? false : (vlines || hlines > 0 || o.border ? true : true);
    var header = o.noheader ? false : (o.header || (rows.length > 1 && rows[0].lineBelow && hlines >= 2) || rows[0].cells.every(function (c) { return c.bold; }));
    return { rows: rows, align: align, ncol: ncol, border: border, header: !!header, color: Mk.color(o.color, '#E2F5F3') };
  }
  return { parse: parse, cellSegs: cellSegs };
});
