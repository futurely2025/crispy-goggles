/* CircuitCalc — resistor networks written as an expression, solved step by step in Arabic.
 *   expression:  م1 + (م2 || م3)      ( + series,  || or // or ∥ parallel,  brackets )
 *   values:      م1=4, م2=6, م3=3     source: جـ=12  (or current ت=2)
 * Steps: equivalent resistance (parallel groups first), total current, then the voltage and current of every resistor. */
(function (global) {
  'use strict';
  function r(v) { return String(+(+v).toFixed(3)); }
  function sub(name) { var m = String(name).match(/^([^\d_]+)_?\{?(\d+)\}?$/); return m ? m[1] + '_{' + m[2] + '}' : name; }

  // ------------------------------------------------------------ parser → tree {t:'r', name} | {t:'s'|'p', kids}
  function parse(expr) {
    var s = String(expr || '').replace(/\/\/|∥|‖/g, '||').replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x660); }), i = 0;
    var ws = function () { while (s[i] === ' ') i++; };
    function atom() {
      ws();
      if (s[i] === '(') { i++; var e = series(); ws(); if (s[i] !== ')') throw new Error('قوس ) ناقص'); i++; return e; }
      var m = s.slice(i).match(/^[^\s()+|]+/);
      if (!m) throw new Error('توقعت اسم مقاومة عند «' + s.slice(i, i + 6) + '»');
      i += m[0].length; return { t: 'r', name: m[0] };
    }
    function parallel() {
      var a = atom(), kids = [a];
      while (true) { ws(); if (s.slice(i, i + 2) === '||') { i += 2; kids.push(atom()); } else break; }
      return kids.length > 1 ? { t: 'p', kids: kids } : a;
    }
    function series() {
      var a = parallel(), kids = [a];
      while (true) { ws(); if (s[i] === '+') { i++; kids.push(parallel()); } else break; }
      return kids.length > 1 ? { t: 's', kids: kids } : a;
    }
    var tree = series(); ws();
    if (i < s.length) throw new Error('رمز غير متوقع: ' + s.slice(i));
    return tree;
  }
  function values(txt) {
    var out = {};
    String(txt || '').replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x660); }).split(/[,،\n;؛]/).forEach(function (p) {
      var m = p.match(/^\s*([^=]+?)\s*=\s*([-\d.]+)\s*$/); if (m) out[m[1].trim()] = +m[2];
    });
    return out;
  }

  function solve(expr, valsTxt, src) {
    var tree = parse(expr), V = values(valsTxt), st = [], k = 0;
    var S = function (t, tex) { st.push({ t: t, tex: tex || null }); };
    function label(n) { return n.t === 'r' ? sub(n.name) : n.lbl; }
    // 1) equivalent resistances, innermost first
    function eq(n) {
      if (n.t === 'r') {
        if (!(V[n.name] > 0)) throw new Error('أدخل قيمة المقاومة ' + n.name + ' مثل ' + n.name + '=4');
        n.R = V[n.name]; return n.R;
      }
      n.kids.forEach(eq);
      k++;
      var nums = []; (function w(x) { if (x.t === 'r') nums.push(String(x.name).replace(/^\D+_?/, '') || x.name); else x.kids.forEach(w); })(n);
      n.lbl = 'م_{' + nums.join('') + '}';
      if (n.t === 's') {
        n.R = n.kids.reduce(function (a, c) { return a + c.R; }, 0);
        S('المقاومات ' + n.kids.map(function (c) { return c.t === 'r' ? c.name : 'المكافئة'; }).join(' و') + ' على التوالي، فتُجمع:', n.lbl + ' = ' + n.kids.map(label).join(' + ') + ' = ' + n.kids.map(function (c) { return r(c.R); }).join(' + ') + ' = ' + r(n.R) + '\\,\\Omega');
      } else {
        var inv = n.kids.reduce(function (a, c) { return a + 1 / c.R; }, 0);
        n.R = 1 / inv;
        if (n.kids.length === 2) S('مقاومتان على التوازي: حاصل الضرب ÷ المجموع:', n.lbl + ' = \\frac{' + label(n.kids[0]) + ' \\times ' + label(n.kids[1]) + '}{' + label(n.kids[0]) + ' + ' + label(n.kids[1]) + '} = \\frac{' + r(n.kids[0].R) + ' \\times ' + r(n.kids[1].R) + '}{' + r(n.kids[0].R) + ' + ' + r(n.kids[1].R) + '} = ' + r(n.R) + '\\,\\Omega');
        else S('مقاومات على التوازي:', '\\frac{1}{' + n.lbl + '} = ' + n.kids.map(function (c) { return '\\frac{1}{' + r(c.R) + '}'; }).join(' + ') + ' = ' + r(inv) + ' \\Rightarrow ' + n.lbl + ' = ' + r(n.R) + '\\,\\Omega');
      }
      return n.R;
    }
    eq(tree);
    var Rt = tree.R, sv = values(src), Vt = null, It = null;
    S('المقاومة المكافئة للدائرة:', 'م_{مك} = ' + r(Rt) + '\\,\\Omega');
    var vKey = Object.keys(sv).filter(function (x) { return /^(جـ|ج|ق|V|v|E|ε|ق\.د\.ك)/.test(x); })[0], iKey = Object.keys(sv).filter(function (x) { return /^(ت|I|i)/.test(x); })[0];
    if (vKey) { Vt = sv[vKey]; It = Vt / Rt; S('التيار الكلي من قانون أوم:', 'ت = \\frac{جـ}{م_{مك}} = \\frac{' + r(Vt) + '}{' + r(Rt) + '} = ' + r(It) + '\\,\\text{A}'); }
    else if (iKey) { It = sv[iKey]; Vt = It * Rt; S('فرق الجهد الكلي من قانون أوم:', 'جـ = ت \\times م_{مك} = ' + r(It) + ' \\times ' + r(Rt) + ' = ' + r(Vt) + '\\,\\text{V}'); }
    else return { steps: st, R: Rt };
    // 2) distribute voltage and current
    function spread(n, I, U) {
      n.I = I; n.U = U;
      if (n.t === 'r') return;
      if (n.t === 's') n.kids.forEach(function (c) { spread(c, I, I * c.R); });
      else n.kids.forEach(function (c) { spread(c, U / c.R, U); });
    }
    spread(tree, It, Vt);
    var leaves = []; (function walk(n) { if (n.t === 'r') leaves.push(n); else n.kids.forEach(walk); })(tree);
    leaves.forEach(function (n) {
      S('المقاومة ' + n.name + ':', 'جـ_{' + String(n.name).replace(/^\D+_?/, '') + '} = ت \\times م = ' + r(n.I) + ' \\times ' + r(n.R) + ' = ' + r(n.U) + '\\,\\text{V} ، \\quad ت_{' + String(n.name).replace(/^\D+_?/, '') + '} = ' + r(n.I) + '\\,\\text{A}');
    });
    S('القدرة الكلية المستهلكة:', 'قد = جـ \\times ت = ' + r(Vt) + ' \\times ' + r(It) + ' = ' + r(Vt * It) + '\\,\\text{W}');
    return { steps: st, R: Rt, I: It, V: Vt, leaves: leaves.map(function (n) { return { name: n.name, R: n.R, I: n.I, U: n.U }; }) };
  }

  global.CircuitCalc = { parse: parse, values: values, solve: solve };
})(window);
