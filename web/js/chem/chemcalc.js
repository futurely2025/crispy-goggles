/* ChemCalc — stoichiometry with Arabic steps: molar mass, moles↔mass, particles, gas volume (STP), molarity,
 * dilution, and the limiting reagent of a (balanced automatically) reaction. Uses ChemBalance for formulas. */
(function (global) {
  'use strict';
  var NA = 6.022e23;
  function r(v, d) { return String(+(+v).toFixed(d === undefined ? 3 : d)); }
  function sci(v) {
    if (!isFinite(v) || v === 0) return '0';
    var e = Math.floor(Math.log10(Math.abs(v))); if (e > -3 && e < 5) return r(v, 4);
    return r(v / Math.pow(10, e), 3) + ' \\times 10^{' + e + '}';
  }
  function ce(f) { return '\\ce{' + f + '}'; }
  function mm(formula, st) {
    var m = global.ChemBalance.molarMass(formula);
    if (st) st.push({ t: 'الكتلة المولية لـ ' + formula + ' = مجموع (عدد الذرات × الكتلة الذرية):', tex: 'M_{' + ce(formula) + '} = ' + m.parts.map(function (p) { return (p.n > 1 ? p.n + ' \\times ' : '') + r(p.mass); }).join(' + ') + ' = ' + r(m.mass) + '\\ \\text{g/mol}' });
    return m.mass;
  }
  var TYPES = {
    molar: { t: 'الكتلة المولية|Molar mass', f: [['الصيغة|Formula', 'H2SO4']],
      run: function (a) { var st = []; mm(a[0], st); return st; } },
    moles: { t: 'عدد المولات من الكتلة|Moles from mass', f: [['الصيغة|Formula', 'NaOH'], ['الكتلة (g)|Mass (g)', '20']],
      run: function (a) { var st = [], M = mm(a[0], st), m = +a[1], n = m / M; st.push({ t: 'عدد المولات = الكتلة ÷ الكتلة المولية:', tex: 'n = \\frac{m}{M} = \\frac{' + r(m) + '}{' + r(M) + '} = ' + r(n, 4) + '\\ \\text{mol}' }); return st; } },
    mass: { t: 'الكتلة من عدد المولات|Mass from moles', f: [['الصيغة|Formula', 'CaCO3'], ['عدد المولات (mol)|Moles', '0.25']],
      run: function (a) { var st = [], M = mm(a[0], st), n = +a[1]; st.push({ t: 'الكتلة = عدد المولات × الكتلة المولية:', tex: 'm = n \\times M = ' + r(n) + ' \\times ' + r(M) + ' = ' + r(n * M) + '\\ \\text{g}' }); return st; } },
    particles: { t: 'عدد الجسيمات (عدد أفوجادرو)|Number of particles', f: [['الصيغة|Formula', 'H2O'], ['الكتلة (g)|Mass (g)', '9']],
      run: function (a) { var st = [], M = mm(a[0], st), n = +a[1] / M; st.push({ t: 'عدد المولات:', tex: 'n = \\frac{' + r(+a[1]) + '}{' + r(M) + '} = ' + r(n, 4) + '\\ \\text{mol}' }); st.push({ t: 'عدد الجزيئات = عدد المولات × عدد أفوجادرو:', tex: 'N = n \\times N_A = ' + r(n, 4) + ' \\times 6.022 \\times 10^{23} = ' + sci(n * NA) }); return st; } },
    gas: { t: 'حجم الغاز في الظروف القياسية|Gas volume at STP', f: [['الصيغة|Formula', 'CO2'], ['الكتلة (g)|Mass (g)', '11']],
      run: function (a) { var st = [], M = mm(a[0], st), n = +a[1] / M; st.push({ t: 'عدد المولات:', tex: 'n = \\frac{' + r(+a[1]) + '}{' + r(M) + '} = ' + r(n, 4) + '\\ \\text{mol}' }); st.push({ t: 'في الظروف القياسية يشغل المول الواحد من أي غاز 22.4 لتراً:', tex: 'V = n \\times 22.4 = ' + r(n, 4) + ' \\times 22.4 = ' + r(n * 22.4) + '\\ \\text{L}' }); return st; } },
    molarity: { t: 'التركيز المولاري|Molarity', f: [['الصيغة|Formula', 'NaCl'], ['الكتلة (g)|Mass (g)', '5.85'], ['حجم المحلول (mL)|Volume (mL)', '250']],
      run: function (a) { var st = [], M = mm(a[0], st), n = +a[1] / M, V = +a[2] / 1000; st.push({ t: 'عدد مولات المذاب:', tex: 'n = \\frac{' + r(+a[1]) + '}{' + r(M) + '} = ' + r(n, 4) + '\\ \\text{mol}' }); st.push({ t: 'نحوّل الحجم إلى لتر: ' + r(+a[2]) + ' mL = ' + r(V, 4) + ' L، والتركيز = المولات ÷ الحجم:', tex: 'C = \\frac{n}{V} = \\frac{' + r(n, 4) + '}{' + r(V, 4) + '} = ' + r(n / V, 4) + '\\ \\text{mol/L}' }); return st; } },
    dilution: { t: 'التخفيف (ت₁ح₁ = ت₂ح₂)|Dilution', f: [['التركيز الأول C₁ (M)|C1', '2'], ['الحجم الأول V₁ (mL)|V1', '50'], ['التركيز الثاني C₂ (M) — فارغ للمجهول|C2 (empty = unknown)', '0.5'], ['الحجم الثاني V₂ (mL) — فارغ للمجهول|V2 (empty = unknown)', '']],
      run: function (a) {
        var st = [], C1 = +a[0], V1 = +a[1], C2 = a[2] === '' ? null : +a[2], V2 = a[3] === '' ? null : +a[3];
        st.push({ t: 'عدد المولات لا يتغير عند التخفيف:', tex: 'C_1 V_1 = C_2 V_2' });
        if (V2 === null && C2) st.push({ t: 'الحجم الجديد:', tex: 'V_2 = \\frac{C_1 V_1}{C_2} = \\frac{' + r(C1) + ' \\times ' + r(V1) + '}{' + r(C2) + '} = ' + r(C1 * V1 / C2) + '\\ \\text{mL}' });
        else if (C2 === null && V2) st.push({ t: 'التركيز الجديد:', tex: 'C_2 = \\frac{C_1 V_1}{V_2} = \\frac{' + r(C1) + ' \\times ' + r(V1) + '}{' + r(V2) + '} = ' + r(C1 * V1 / V2, 4) + '\\ \\text{M}' });
        else throw new Error('اترك أحد الحقلين (C₂ أو V₂) فارغاً ليُحسب');
        return st;
      } },
    limiting: { t: 'المادة المحددة للتفاعل|Limiting reagent', f: [['المعادلة|Equation', 'H2 + O2 -> H2O'], ['كتلة المتفاعل الأول (g)|Mass of 1st reactant', '4'], ['كتلة المتفاعل الثاني (g)|Mass of 2nd reactant', '40']],
      run: function (a) {
        var st = [], B = global.ChemBalance, bal = B.balance(a[0]), co = bal.coefficients.map(Number);
        var sides = a[0].split(/\s*(?:<=>|<->|->|→|⟶|=)\s*/), L = sides[0].split(/\s+\+\s+/).map(function (s) { return s.trim().replace(/^\d+\s*/, ''); }), R = (sides[1] || '').split(/\s+\+\s+/).map(function (s) { return s.trim().replace(/^\d+\s*/, ''); });
        if (L.length < 2) throw new Error('يلزم متفاعلان على الأقل');
        st.push({ t: 'نوازن المعادلة:', tex: '\\ce{' + bal.text + '}' });
        var M1 = mm(L[0], st), M2 = mm(L[1], st), n1 = +a[1] / M1, n2 = +a[2] / M2;
        st.push({ t: 'عدد مولات كل متفاعل:', tex: 'n_{' + ce(L[0]) + '} = \\frac{' + r(+a[1]) + '}{' + r(M1) + '} = ' + r(n1, 4) + ' ، \\quad n_{' + ce(L[1]) + '} = \\frac{' + r(+a[2]) + '}{' + r(M2) + '} = ' + r(n2, 4) });
        var q1 = n1 / co[0], q2 = n2 / co[1], lim = q1 <= q2 ? 0 : 1;
        st.push({ t: 'نقسم عدد المولات على المعامل في المعادلة الموزونة، والأصغر هو المادة المحددة:', tex: '\\frac{' + r(n1, 4) + '}{' + co[0] + '} = ' + r(q1, 4) + ' ، \\quad \\frac{' + r(n2, 4) + '}{' + co[1] + '} = ' + r(q2, 4) });
        st.push({ t: 'المادة المحددة هي ' + L[lim] + '، والمادة الفائضة ' + L[1 - lim] + '.', tex: null });
        if (R[0]) {
          var Mp = mm(R[0], st), np = Math.min(q1, q2) * co[L.length];
          st.push({ t: 'كتلة الناتج ' + R[0] + ' المتكوّن:', tex: 'n_{' + ce(R[0]) + '} = ' + r(Math.min(q1, q2), 4) + ' \\times ' + co[L.length] + ' = ' + r(np, 4) + '\\ \\text{mol} \\Rightarrow m = ' + r(np, 4) + ' \\times ' + r(Mp) + ' = ' + r(np * Mp) + '\\ \\text{g}' });
        }
        return st;
      } }
  };
  global.ChemCalc = { TYPES: TYPES, molarMass: mm };
})(window);
