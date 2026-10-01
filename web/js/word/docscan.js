/* DocScan — finds everything convertible in the text of Word paragraphs:
 *   $…$  \(…\)                       inline equations (one paragraph)
 *   $$…$$  \[…\]                     display equations (may span paragraphs)
 *   \begin{aligned|cases|align|equation|gather|…}   display equations
 *   \begin{graph|geometry|chart|physics|circuit|tabular|vartable|…}  figures and tables (may span paragraphs)
 *   \chemfig{…} \smiles{…} \molecule{…} \freqtable{…} \statstable{…}  when alone on their paragraph
 * Returns matches with paragraph/offset coordinates so the exact Word range can be found. Pure JavaScript. */
(function (global) {
  'use strict';
  var FIG_ENVS = /^(graph|geometry|chart|physics|circuit|circuitikz|numberline|venn|tree|vartable|signtable|tikzpicture|tabular\*?|lab)$/;
  var MATH_ENVS = /^(aligned|align\*?|alignat\*?|equation\*?|gather\*?|gathered|multline\*?|cases|dcases|rcases|split|array|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|smallmatrix|eqnarray\*?)$/;
  var BLOCK_CMDS = /^\s*\\(chemfig|smiles|molecule|freqtable|statstable|ztable|binomtable|element|bohr|lewis|orbital|ptable)\b/;
  var MAX_SPAN = 60;   // paragraphs a block may span

  function escaped(t, i) { var n = 0; for (var k = i - 1; k >= 0 && t[k] === '\\'; k--) n++; return n % 2 === 1; }

  // closing "$" of an inline formula: not escaped, not "$$", no space just inside, not followed by a digit (currency)
  function closeDollar(t, from) {
    for (var k = from; k < t.length; k++) {
      if (t[k] !== '$' || escaped(t, k)) continue;
      if (t[k + 1] === '$') { k++; continue; }
      if (/\s/.test(t[k - 1] || ' ')) continue;
      if (/[0-9]/.test(t[k + 1] || '')) continue;
      return k;
    }
    return -1;
  }
  function findToken(paras, a, from, tok) {
    for (var p = a; p < paras.length && p <= a + MAX_SPAN; p++) {
      var t = paras[p], k = p === a ? from : 0;
      while (true) {
        var j = t.indexOf(tok, k);
        if (j < 0) break;
        if (!escaped(t, j)) return { p: p, i: j };
        k = j + 1;
      }
    }
    return null;
  }
  function findEnd(paras, a, from, env) {
    var depth = 1, re = new RegExp('\\\\(begin|end)\\s*\\{' + env.replace(/\*/g, '\\*') + '\\}', 'g');
    for (var p = a; p < paras.length && p <= a + MAX_SPAN; p++) {
      var t = paras[p]; re.lastIndex = p === a ? from : 0;
      var m;
      while ((m = re.exec(t))) {
        depth += m[1] === 'begin' ? 1 : -1;
        if (!depth) return { p: p, i: m.index, e: m.index + m[0].length };
      }
    }
    return null;
  }
  // end of a \cmd[opts]{…} group on one paragraph
  function groupEnd(t, i) {
    var j = i;
    while (j < t.length && t[j] !== '{') { if (t[j] === '[') { var d = 0; for (; j < t.length; j++) { if (t[j] === '[') d++; else if (t[j] === ']' && !--d) break; } } j++; }
    if (t[j] !== '{') return -1;
    var depth = 0;
    for (; j < t.length; j++) { if (t[j] === '{' && !escaped(t, j)) depth++; else if (t[j] === '}' && !escaped(t, j) && !--depth) return j + 1; }
    return -1;
  }
  function slice(paras, a, s, b, e) {
    if (a === b) return paras[a].slice(s, e);
    var out = paras[a].slice(s);
    for (var p = a + 1; p < b; p++) out += '\n' + paras[p];
    return out + '\n' + paras[b].slice(0, e);
  }

  /** paras: array of paragraph texts → [{a, s, b, e, code, tex, type:'inline'|'display'|'block', whole}] */
  function find(paras) {
    var out = [];
    paras = paras.map(function (t) { return String(t || '').replace(/\u000b/g, ' '); });
    for (var p = 0; p < paras.length; p++) {
      var t = paras[p], i = 0;
      while (i < t.length) {
        var c = t[i], m = null;
        if (c === '\\' && !escaped(t, i)) {
          var env = t.slice(i).match(/^\\begin\s*\{([A-Za-z]+\*?)\}/);
          if (env && (FIG_ENVS.test(env[1]) || MATH_ENVS.test(env[1]))) {
            var end = findEnd(paras, p, i + env[0].length, env[1]);
            if (end) m = { a: p, s: i, b: end.p, e: end.e, type: FIG_ENVS.test(env[1]) ? 'block' : 'display' };
          } else if (t[i + 1] === '[') {
            var cl = findToken(paras, p, i + 2, '\\]');
            if (cl) m = { a: p, s: i, b: cl.p, e: cl.i + 2, type: 'display', inner: [2, 2] };
          } else if (t[i + 1] === '(') {
            var cp = t.indexOf('\\)', i + 2);
            if (cp > 0) m = { a: p, s: i, b: p, e: cp + 2, type: 'inline', inner: [2, 2] };
          } else if (i === t.search(/\S/) && BLOCK_CMDS.test(t.slice(i))) {
            var ge = /^\\(ztable|binomtable|ptable)\b/.test(t.slice(i)) && !/\{/.test(t.slice(i)) ? t.length : groupEnd(t, i + 1);
            if (ge > 0 && !t.slice(ge).trim()) m = { a: p, s: i, b: p, e: ge, type: 'block' };
          }
        } else if (c === '$' && !escaped(t, i)) {
          if (t[i + 1] === '$') {
            var dd = findToken(paras, p, i + 2, '$$');
            if (dd) m = { a: p, s: i, b: dd.p, e: dd.i + 2, type: 'display', inner: [2, 2] };
          } else if (t[i + 1] && !/\s/.test(t[i + 1])) {
            var k = closeDollar(t, i + 1);
            if (k > i + 1) m = { a: p, s: i, b: p, e: k + 1, type: 'inline', inner: [1, 1] };
          }
        }
        if (m) {
          m.code = slice(paras, m.a, m.s, m.b, m.e);
          m.tex = m.inner ? m.code.slice(m.inner[0], m.code.length - m.inner[1]).trim() : m.code.trim();
          m.whole = !paras[m.a].slice(0, m.s).trim() && !paras[m.b].slice(m.e).trim();
          if (m.tex && m.tex.length <= 20000) out.push(m);
          if (m.b !== p) { p = m.b; t = paras[p]; }
          i = m.e;
          continue;
        }
        i++;
      }
    }
    return out;
  }

  // Word search syntax: "^" starts a special code — double it to search for the character itself
  function wordEscape(s) { return String(s).replace(/\^/g, '^^'); }
  // index of the occurrence of needle (non-overlapping, left to right) that starts at pos
  function occurrence(text, needle, pos) {
    var n = 0, k = 0;
    while (true) {
      var j = text.indexOf(needle, k);
      if (j < 0 || j > pos) return -1;
      if (j === pos) return n;
      n++; k = j + needle.length;
    }
  }

  global.DocScan = { find: find, wordEscape: wordEscape, occurrence: occurrence };
})(typeof window !== 'undefined' ? window : this);
