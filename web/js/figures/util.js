/*
 * Mk — small helpers shared by all figure "LaTeX" parsers (graph, geometry, chart, physics, circuit, diagrams, tables).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Mk = factory();
})(this, function () {
  'use strict';

  function digits(s) {
    return String(s).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/٫/g, '.').replace(/−/g, '-');
  }

  /** read a balanced group starting at s[i] ('{' '[' or '(') -> {content, end} (end = index after the closing char) */
  function group(s, i) {
    var open = s[i], close = open === '{' ? '}' : open === '[' ? ']' : ')', depth = 0;
    for (var k = i; k < s.length; k++) {
      var c = s[k];
      if (c === '\\' && k + 1 < s.length) { k++; continue; }
      if (c === '{' || (c === open && open !== '{')) depth++;
      else if (c === '}' || (c === close && close !== '}')) {
        depth--;
        if (depth === 0) return { content: s.slice(i + 1, k), end: k + 1 };
      }
    }
    return { content: s.slice(i + 1), end: s.length };
  }

  /** split on a separator at top level (outside {} [] ()) */
  function split(s, sep) {
    var out = [], depth = 0, cur = '';
    sep = sep || ',';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '\\' && i + 1 < s.length) { cur += c + s[i + 1]; i++; continue; }
      if (c === '{' || c === '[' || c === '(') depth++;
      if (c === '}' || c === ']' || c === ')') depth--;
      if (depth === 0 && s.substr(i, sep.length) === sep) { out.push(cur); cur = ''; i += sep.length - 1; continue; }
      cur += c;
    }
    out.push(cur);
    return out.map(function (x) { return x.trim(); }).filter(function (x) { return x !== ''; });
  }

  function unbrace(v) {
    v = String(v).trim();
    while (v[0] === '{' && group(v, 0).end === v.length) v = v.slice(1, -1).trim();
    return v;
  }

  /** "[a=1, b={x,y}, grid, color=red]" content -> {a:'1', b:'x,y', grid:true, color:'red'} */
  function options(s) {
    var o = {}, last = null;
    if (!s) return o;
    var LISTS = /^(sides|legs|angles|labels|marks|anglelabels|colors|data|values|bins|forces|sets|freq|classes|labels2|ticks|xticks|yticks)$/;
    split(s, ',').forEach(function (part) {
      // "sides=5,6,7": bare numbers after a key=value belong to that value (a list)
      if (last && part.indexOf('=') < 0 && ((LISTS.test(last) && !/^[a-z][a-z ]*$/i.test(part.trim())) || /^[-+]?[\d٠-٩.(\\{]/.test(part.trim()))) { o[last] = o[last] + ',' + part.trim(); return; }
      var eq = -1, depth = 0;
      for (var i = 0; i < part.length; i++) {
        var c = part[i];
        if (c === '{' || c === '(' || c === '[') depth++;
        else if (c === '}' || c === ')' || c === ']') depth--;
        else if (c === '=' && depth === 0) { eq = i; break; }
      }
      if (eq < 0) { o[part.trim()] = true; last = null; return; }
      last = part.slice(0, eq).trim();
      o[last] = unbrace(part.slice(eq + 1));
    });
    return o;
  }

  /**
   * Parse a body made of commands:  \name[opt]{a}{b}(x,y) …  and plain lines.
   * returns [{name, opt:{}, rawOpt, args:[…], coords:[…], line}] ; text lines as {name:'#text', text}
   */
  function commands(body) {
    var out = [], s = String(body || ''), i = 0, line = 1;
    while (i < s.length) {
      var c = s[i];
      if (c === '\n') { line++; i++; continue; }
      if (c === '%') { while (i < s.length && s[i] !== '\n') i++; continue; }
      if (/\s|;/.test(c)) { i++; continue; }
      if (c === '\\') {
        var m = /^\\([a-zA-Z@]+\*?)/.exec(s.slice(i));
        if (!m) { i += 2; continue; }
        var cmd = { name: m[1], opt: {}, rawOpt: '', args: [], coords: [], line: line, start: i };
        i += m[0].length;
        for (;;) {
          var j = i;
          while (j < s.length && (s[j] === ' ' || s[j] === '\t')) j++;
          if (s[j] === '[') { var g = group(s, j); cmd.rawOpt += (cmd.rawOpt ? ',' : '') + g.content; i = g.end; continue; }
          if (s[j] === '{') { var g2 = group(s, j); cmd.args.push(g2.content); i = g2.end; continue; }
          if (s[j] === '(' && (cmd.args.length || /^(point|coordinate|node|draw|fill|filldraw|path|coord)$/i.test(cmd.name) || true)) {
            // coordinates directly after a command: \point{أ}(1,2)
            var g3 = group(s, j); cmd.coords.push(g3.content); i = g3.end; continue;
          }
          break;
        }
        cmd.opt = options(cmd.rawOpt);
        cmd.end = i;
        out.push(cmd);
        continue;
      }
      // plain text line (e.g. "- أحمر [0.3]" in trees)
      var e = s.indexOf('\n', i); if (e < 0) e = s.length;
      out.push({ name: '#text', text: s.slice(i, e), line: line, indent: 0 });
      i = e;
    }
    return out;
  }

  // ------------------------------------------------------------ numbers  (2\sqrt{3}, \frac{1}{2}, 3.5, ٤٫٢, \pi/2, 30°)
  function evalNum(v, fallback) {
    if (typeof v === 'number') return v;
    if (v === undefined || v === null || v === '') return fallback;
    var s = digits(String(v)).trim()
      .replace(/\$/g, '')
      .replace(/°|\^\{?\\circ\}?|\\degree/g, '')
      .replace(/\\left|\\right|\\,|\\;|\\!|\\ /g, '')
      .replace(/\s*(cm|mm|m|سم|مم|م|pt|px|kg|كغ|كجم|N|نيوتن)\s*$/i, '');
    try {
      var js = texToJs(s);
      /* eslint-disable no-new-func */
      var r = Function('"use strict";return (' + js + ');')();
      return typeof r === 'number' && isFinite(r) ? r : fallback;
    } catch (e) { return fallback; }
  }
  function texToJs(s) {
    var out = '', i = 0;
    function arg() {
      while (s[i] === ' ') i++;
      if (s[i] === '{') { var g = group(s, i); i = g.end; return '(' + texToJs(g.content) + ')'; }
      var c = s[i++]; return c;
    }
    while (i < s.length) {
      var c = s[i];
      if (c === '\\') {
        var m = /^\\([a-zA-Z]+)/.exec(s.slice(i)); i += m ? m[0].length : 1;
        var n = m ? m[1] : '';
        if (n === 'frac' || n === 'dfrac' || n === 'tfrac') { var a = arg(), b = arg(); out += '#(' + a + '/' + b + ')'; }
        else if (n === 'sqrt') {
          var idx = null;
          if (s[i] === '[') { var g = group(s, i); idx = texToJs(g.content); i = g.end; }
          var r = arg(); out += '#' + (idx ? 'Math.pow(' + r + ',1/(' + idx + '))' : 'Math.sqrt(' + r + ')');
        }
        else if (n === 'pi') out += '#Math.PI';
        else if (n === 'times' || n === 'cdot') out += '*';
        else if (n === 'div') out += '/';
        else if (/^(sin|cos|tan)$/.test(n)) out += '#Math.' + n;
        else if (n === 'ln') out += '#Math.log';
        else if (n === 'log') out += '#Math.log10';
        else if (n === 'e') out += '#Math.E';
        continue;
      }
      if (c === '^') { i++; out += '**' + arg(); continue; }
      if (c === '{') { var gg = group(s, i); out += '#(' + texToJs(gg.content) + ')'; i = gg.end; continue; }
      if (/[0-9.+\-*/) ]/.test(c)) { out += c; i++; continue; }
      if (c === '(') { out += '#('; i++; continue; }
      if (c === 'π') { out += '#Math.PI'; i++; continue; }
      if (c === '×') { out += '*'; i++; continue; }
      if (c === '÷') { out += '/'; i++; continue; }
      throw new Error('bad number');
    }
    // '#' marks a possible implicit multiplication: keep it only after a value (digit, ')' or a constant)
    out = out.replace(/\s+/g, '');
    return out.replace(/(^|[(+\-*/,])#/g, '$1').replace(/#/g, '*');
  }

  function list(v) { return split(unbrace(v || ''), ',').map(unbrace); }
  function numList(v) { return list(v).map(function (x) { return evalNum(x, NaN); }); }
  /** "a:b" or "a,b" -> [a,b] */
  function range(v) {
    var s = unbrace(String(v));
    var p = s.indexOf(':') >= 0 ? s.split(':') : split(s, ',');
    return [evalNum(p[0], NaN), evalNum(p[1], NaN)];
  }
  /** "(2, 3)" or "2,3" -> [2,3] */
  function point(v) {
    var s = unbrace(String(v)).replace(/^\(|\)$/g, '');
    var p = split(s, s.indexOf('،') >= 0 && s.indexOf(',') < 0 ? '،' : ',');
    return [evalNum(p[0], NaN), evalNum(p[1], NaN)];
  }
  /** polar "5@30" (length@degrees) -> [len, deg] */
  function polar(v) {
    var s = unbrace(String(v)), p = s.split('@');
    return [evalNum(p[0], NaN), evalNum(p[1] || 0, 0)];
  }
  function bool(o, key, dflt) {
    if (o['no' + key] === true) return false;
    if (o[key] === undefined) return dflt;
    if (o[key] === true) return true;
    return !/^(false|no|0|off|لا)$/i.test(String(o[key]));
  }
  function fmt(v, dec) {
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    var d = dec === undefined ? 4 : dec;
    return String(+v.toFixed(d));
  }
  /** build "[a=1, b=2]" skipping undefined; values with , or = get braces */
  function optStr(pairs) {
    var parts = [];
    pairs.forEach(function (p) {
      if (p === null || p === undefined) return;
      if (typeof p === 'string') { parts.push(p); return; }
      var k = p[0], v = p[1];
      if (v === undefined || v === null || v === '' || v === false) return;
      if (v === true) { parts.push(k); return; }
      v = String(v);
      parts.push(k + '=' + (/[,=\[\]]/.test(v) ? '{' + v + '}' : v));
    });
    return parts.length ? '[' + parts.join(', ') + ']' : '';
  }
  // colour names (English + Arabic) -> hex
  var COLORS = { black: '#1b2a30', red: '#c2352b', blue: '#1f5fbf', green: '#2e8b3a', teal: '#0e9f9a', turquoise: '#0e9f9a', orange: '#e07a00', purple: '#7b3fb3',
    brown: '#8a5a2b', gray: '#6b7c85', grey: '#6b7c85', magenta: '#b0307a', cyan: '#0096c7', yellow: '#d4a106', olive: '#6b8e23', violet: '#7b3fb3', pink: '#d45d8c',
    'أسود': '#1b2a30', 'أحمر': '#c2352b', 'أزرق': '#1f5fbf', 'أخضر': '#2e8b3a', 'فيروزي': '#0e9f9a', 'برتقالي': '#e07a00', 'بنفسجي': '#7b3fb3', 'بني': '#8a5a2b', 'رمادي': '#6b7c85', 'أصفر': '#d4a106', 'وردي': '#d45d8c' };
  function color(v, dflt) {
    if (!v || v === true) return dflt;
    v = String(v).trim();
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
    var base = v.split('!')[0].toLowerCase();
    return COLORS[base] || COLORS[v] || dflt;
  }

  return { digits: digits, group: group, split: split, unbrace: unbrace, options: options, commands: commands, evalNum: evalNum,
    list: list, numList: numList, range: range, point: point, polar: polar, bool: bool, fmt: fmt, optStr: optStr, color: color, COLORS: COLORS };
});
