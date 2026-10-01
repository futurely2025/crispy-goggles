/*
 * ChemBalance — balances chemical equations written in mhchem syntax.
 *   ChemBalance.balance('Fe + O2 -> Fe2O3')        -> '4Fe + 3O2 -> 2Fe2O3'
 *   supports (), [], hydrates (CuSO4.5H2O / *5H2O), charges (Fe^{3+}, SO4^2-, e-), states (s)(l)(g)(aq)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChemBalance = factory();
})(this, function () {
  'use strict';

  var ARROWS = /\s*(<=>|<->|<=>>|<<=>|->|<-|⟶|→|⇌|⇄|=)\s*/;

  // ------------------------------------------------------------ fractions (BigInt)
  function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { var t = a % b; a = b; b = t; } return a; }
  function F(n, d) {
    d = d === undefined ? 1n : d;
    if (d < 0n) { n = -n; d = -d; }
    var g = gcd(n, d) || 1n;
    return { n: n / g, d: d / g };
  }
  function fsub(a, b) { return F(a.n * b.d - b.n * a.d, a.d * b.d); }
  function fmul(a, b) { return F(a.n * b.n, a.d * b.d); }
  function fdiv(a, b) { return F(a.n * b.d, a.d * b.n); }
  function isZero(a) { return a.n === 0n; }

  // ------------------------------------------------------------ formula parser
  function parseFormula(s) {
    var src = String(s).trim();
    var charge = 0;
    // electron
    if (/^e(\^?\{?-\}?|-)$/.test(src)) return { atoms: {}, charge: -1 };
    // charge: ^{2-}  ^2-  ^-  ^{+}  or trailing + / - after the formula
    var cm = src.match(/\^\s*\{?\s*(\d*)\s*([+-])\s*\}?\s*$/), cm2 = cm ? null : src.match(/\^\s*\{?\s*([+-])\s*(\d*)\s*\}?\s*$/);
    if (cm2) cm = [cm2[0], cm2[2], cm2[1]], cm.index = cm2.index;
    if (cm) {
      var d = cm[1], sg = cm[2];
      charge = (sg === '-' ? -1 : 1) * (d ? parseInt(d, 10) : 1);
      src = src.slice(0, cm.index);
    } else {
      var tm = src.match(/([A-Za-z)\]\d])(\d*)([+-])$/);
      if (tm && !/^\d*[+-]$/.test(src)) {
        charge = (tm[3] === '-' ? -1 : 1) * (tm[2] ? parseInt(tm[2], 10) : 1);
        src = src.slice(0, src.length - tm[2].length - 1);
        // "SO4 2-": digits belonged to the charge; "Fe3+": keep ambiguity simple (charge 3)
      }
    }
    src = src.replace(/_\{?(\d+)\}?/g, '$1');                     // H_2O -> H2O
    var parts = src.split(/[.·•*]/);                              // hydrates
    var atoms = {};
    parts.forEach(function (p) {
      p = p.trim(); if (!p) return;
      var m = p.match(/^(\d+)\s*(.*)$/), mult = 1;
      if (m) { mult = parseInt(m[1], 10); p = m[2]; }
      var a = parseGroup(p);
      Object.keys(a).forEach(function (k) { atoms[k] = (atoms[k] || 0) + a[k] * mult; });
    });
    return { atoms: atoms, charge: charge };
  }
  function parseGroup(s) {
    var i = 0;
    function group(close) {
      var out = {};
      while (i < s.length) {
        var c = s[i];
        if (c === '(' || c === '[' || c === '{') {
          i++;
          var inner = group(c === '(' ? ')' : c === '[' ? ']' : '}');
          var n = count();
          Object.keys(inner).forEach(function (k) { out[k] = (out[k] || 0) + inner[k] * n; });
          continue;
        }
        if (c === ')' || c === ']' || c === '}') { i++; if (close) return out; continue; }
        var m = /^[A-Z][a-z]?/.exec(s.slice(i));
        if (m) { i += m[0].length; var k2 = count(); out[m[0]] = (out[m[0]] || 0) + k2; continue; }
        if (/\s/.test(c)) { i++; continue; }
        throw new Error('رمز غير معروف في الصيغة: ' + s);
      }
      return out;
    }
    function count() { var m = /^\d+/.exec(s.slice(i)); if (!m) return 1; i += m[0].length; return parseInt(m[0], 10); }
    return group(null);
  }

  // ------------------------------------------------------------ species "2H2O(l)"
  function parseSpecies(raw) {
    var t = raw.trim();
    var m = t.match(/^(\d+(?:\/\d+)?|\d*\.\d+)?\s*(.*)$/);
    var body = m[2];
    var state = '';
    var sm = body.match(/\s*(\((?:s|l|g|aq)\)|\s[v^])\s*$/i);
    if (sm) { state = sm[1]; body = body.slice(0, sm.index); }
    return { text: body.trim(), state: state, f: parseFormula(body) };
  }
  function splitSide(side) {
    // species are separated by " + " (mhchem); a '+' glued to a formula is a charge
    return side.split(/\s+\+\s+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  // ------------------------------------------------------------ null space
  function nullVector(M, cols) {
    var A = M.map(function (r) { return r.map(function (x) { return F(BigInt(x)); }); });
    var rows = A.length, piv = [], r = 0;
    for (var c = 0; c < cols && r < rows; c++) {
      var p = -1;
      for (var k = r; k < rows; k++) if (!isZero(A[k][c])) { p = k; break; }
      if (p < 0) continue;
      var tmp = A[r]; A[r] = A[p]; A[p] = tmp;
      var pv = A[r][c];
      for (var j = 0; j < cols; j++) A[r][j] = fdiv(A[r][j], pv);
      for (k = 0; k < rows; k++) {
        if (k === r || isZero(A[k][c])) continue;
        var f = A[k][c];
        for (j = 0; j < cols; j++) A[k][j] = fsub(A[k][j], fmul(f, A[r][j]));
      }
      piv.push(c); r++;
    }
    var free = [];
    for (c = 0; c < cols; c++) if (piv.indexOf(c) < 0) free.push(c);
    if (free.length === 0) throw new Error('لا يمكن موازنة هذه المعادلة (تحقّق من الصيغ)');
    if (free.length > 1) throw new Error('للمعادلة أكثر من طريقة موازنة مستقلة — افصلها إلى تفاعلين');
    var fc = free[0], x = [];
    for (c = 0; c < cols; c++) x[c] = F(0n);
    x[fc] = F(1n);
    piv.forEach(function (pc, ri) { x[pc] = F(-A[ri][fc].n, A[ri][fc].d); });
    // scale to integers
    var L = 1n;
    x.forEach(function (q) { L = L / gcd(L, q.d) * q.d; });
    var ints = x.map(function (q) { return q.n * (L / q.d); });
    var g = 0n; ints.forEach(function (v) { g = gcd(g, v); });
    ints = ints.map(function (v) { return v / (g || 1n); });
    if (ints.some(function (v) { return v < 0n; }) && ints.every(function (v) { return v <= 0n; })) ints = ints.map(function (v) { return -v; });
    if (ints.some(function (v) { return v <= 0n; })) throw new Error('لا توجد موازنة موجبة لهذه المعادلة');
    return ints.map(Number);
  }

  // ------------------------------------------------------------ public
  function analyse(eq) {
    var src = String(eq).replace(/\\ce\s*\{([\s\S]*)\}/, '$1').trim();
    var am = src.match(ARROWS);
    if (!am) throw new Error('اكتب سهم التفاعل ->');
    var arrow = am[1];
    var over = '';
    var left = src.slice(0, am.index), right = src.slice(am.index + am[0].length);
    var om = right.match(/^\[[^\]]*\](?:\[[^\]]*\])?\s*/);          // ->[\Delta] conditions
    if (om) { over = om[0].trim(); right = right.slice(om[0].length); }
    var L = splitSide(left).map(parseSpecies), R = splitSide(right).map(parseSpecies);
    if (!L.length || !R.length) throw new Error('يجب وجود متفاعلات ونواتج');
    return { L: L, R: R, arrow: arrow === '=' ? '->' : arrow, over: over };
  }
  function balance(eq) {
    var a = analyse(eq), all = a.L.concat(a.R);
    var els = [];
    all.forEach(function (s) { Object.keys(s.f.atoms).forEach(function (e) { if (els.indexOf(e) < 0) els.push(e); }); });
    var M = els.map(function (e) { return all.map(function (s, i) { return (s.f.atoms[e] || 0) * (i < a.L.length ? 1 : -1); }); });
    if (all.some(function (s) { return s.f.charge; })) M.push(all.map(function (s, i) { return s.f.charge * (i < a.L.length ? 1 : -1); }));
    var co = nullVector(M, all.length);
    var fmt = function (s, i) { return (co[i] === 1 ? '' : co[i]) + s.text + (s.state ? (/^\(/.test(s.state) ? s.state : ' ' + s.state.trim()) : ''); };
    var left = a.L.map(function (s, i) { return fmt(s, i); }).join(' + ');
    var right = a.R.map(function (s, i) { return fmt(s, i + a.L.length); }).join(' + ');
    return {
      text: left + ' ' + a.arrow + (a.over ? a.over : '') + ' ' + right,
      coefficients: co,
      elements: els,
      check: els.map(function (e) {
        var l = 0, r = 0;
        all.forEach(function (s, i) { var n = (s.f.atoms[e] || 0) * co[i]; if (i < a.L.length) l += n; else r += n; });
        return { el: e, left: l, right: r };
      }).concat(all.some(function (s) { return s.f.charge; }) ? [(function () {
        var l = 0, r = 0;
        all.forEach(function (s, i) { var n = s.f.charge * co[i]; if (i < a.L.length) l += n; else r += n; });
        return { el: 'الشحنة', left: l, right: r };
      })()] : [])
    };
  }
  function isBalanced(eq) {
    try {
      var a = analyse(eq);
      var raw = String(eq).replace(/\\ce\s*\{([\s\S]*)\}/, '$1');
      var sides = raw.split(ARROWS);
      var coef = function (side) { return splitSide(side).map(function (t) { var m = t.match(/^(\d+)/); return m ? +m[1] : 1; }); };
      var cl = coef(sides[0]), cr = coef(sides[sides.length - 1]);
      var els = {};
      a.L.forEach(function (s, i) { Object.keys(s.f.atoms).forEach(function (e) { els[e] = (els[e] || 0) + s.f.atoms[e] * cl[i]; }); });
      a.R.forEach(function (s, i) { Object.keys(s.f.atoms).forEach(function (e) { els[e] = (els[e] || 0) - s.f.atoms[e] * cr[i]; }); });
      return Object.keys(els).every(function (e) { return els[e] === 0; });
    } catch (e) { return false; }
  }

  // molar mass (g/mol)
  var MASS = { H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.18, Na: 22.99, Mg: 24.305,
    Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948, K: 39.098, Ca: 40.078, Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996,
    Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38, Ga: 69.723, Ge: 72.63, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798,
    Rb: 85.468, Sr: 87.62, Y: 88.906, Zr: 91.224, Nb: 92.906, Mo: 95.95, Ag: 107.87, Cd: 112.41, Sn: 118.71, Sb: 121.76, I: 126.9, Xe: 131.29,
    Cs: 132.91, Ba: 137.33, Pt: 195.08, Au: 196.97, Hg: 200.59, Pb: 207.2, Bi: 208.98, U: 238.03 };
  function molarMass(formula) {
    var f = parseFormula(formula), m = 0, parts = [];
    Object.keys(f.atoms).forEach(function (e) {
      if (!MASS[e]) throw new Error('لا تتوفر الكتلة الذرية للعنصر ' + e);
      m += MASS[e] * f.atoms[e];
      parts.push({ el: e, n: f.atoms[e], mass: MASS[e] });
    });
    return { mass: Math.round(m * 1000) / 1000, parts: parts };
  }

  return { balance: balance, isBalanced: isBalanced, parseFormula: parseFormula, molarMass: molarMass, MASS: MASS };
});
