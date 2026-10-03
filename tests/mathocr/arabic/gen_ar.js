const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs');
const N = +process.argv[2] || 200, START = +process.argv[3] || 0, SEED = +process.argv[4] || 1;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.route(/appsforoffice|googleapis|gstatic/, r => r.abort());
  await p.goto('http://localhost:8765/editor.html'); await p.waitForTimeout(3000);
  await p.evaluate(() => { // grammar + seeded rng live in the page
    let seed = 1; window.__seed = s => { seed = s >>> 0; }; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, ri = n => Math.floor(rnd() * n), pick = a => a[ri(a.length)], chance = q => rnd() < q;
    const VARS = ['س', 'ص', 'ع', 'ل', 'م', 'ن', 'هـ', 'ك', 'ج', 'ب', 'أ', 'د', 'ق', 'ر', 'ط', 'و'], LAT = ['x', 'y', 'z', 'a', 'b', 'c', 'n', 'k'], GREEK = ['\\pi', '\\theta', '\\alpha', '\\beta', '\\lambda', '\\omega', '\\Delta'];
    const FUNCS = ['\\sin', '\\cos', '\\tan', '\\log', '\\ln', '\\cot', '\\sec'], RELS = ['=', '=', '=', '=', '\\leq ', '\\geq ', '\\neq ', '\\approx ', '<', '>'], OPS = ['+', '-', '+', '-', '\\times ', '\\cdot ', '\\pm '];
    const WORDS = ['سم', 'م', 'كغ', 'ثانية', 'حيث', 'إذن', 'عندما', 'أو', 'و'];
    let vars;
    const num = () => chance(0.7) ? String(1 + ri(12)) : (chance(0.5) ? String(10 + ri(90)) : (1 + ri(9)) + '.' + (1 + ri(9)));
    const atom = () => { const r = rnd(); return r < 0.5 ? pick(vars) : r < 0.85 ? num() : r < 0.93 ? pick(GREEK) + ' ' : '\\infty '; };
    function term(d) {
      const r = rnd();
      if (d <= 0 || r < 0.3) return atom();
      if (r < 0.42) return atom() + '^{' + (chance(0.7) ? String(2 + ri(4)) : term(d - 2)) + '}';
      if (r < 0.5) return atom() + '_{' + (chance(0.6) ? String(ri(5)) : pick(vars)) + '}';
      if (r < 0.62) return '\\frac{' + expr(d - 1, 2) + '}{' + expr(d - 1, 2) + '}';
      if (r < 0.7) return '\\sqrt{' + expr(d - 1, 2) + '}';
      if (r < 0.73) return '\\sqrt[' + (2 + ri(3)) + ']{' + expr(d - 1, 1) + '}';
      if (r < 0.8) return pick(FUNCS) + ' ' + (chance(0.5) ? atom() : '(' + expr(d - 1, 2) + ')');
      if (r < 0.88) return '(' + expr(d - 1, 3) + ')' + (chance(0.3) ? '^{' + (2 + ri(3)) + '}' : '');
      if (r < 0.91) return '\\left(' + expr(d - 1, 3) + '\\right)';
      if (r < 0.94) return '\\sum_{' + pick(vars) + '=' + ri(3) + '}^{' + (chance(0.5) ? pick(vars) : String(3 + ri(8))) + '} ' + term(d - 2);
      if (r < 0.97) return '\\int_{' + ri(3) + '}^{' + (1 + ri(5)) + '} ' + term(d - 2) + '\\,d ' + pick(vars);
      return '\\lim_{' + pick(vars) + '\\to ' + (chance(0.5) ? '\\infty' : String(ri(4))) + '} ' + term(d - 2);
    }
    function expr(d, n) { let s = term(d); const k = ri(n); for (let i = 0; i < k; i++) s += pick(OPS) + term(d); return s; }
    window.__make = () => {
      vars = chance(0.82) ? VARS.slice().sort(() => rnd() - 0.5).slice(0, 2 + ri(4)) : LAT.slice().sort(() => rnd() - 0.5).slice(0, 2 + ri(3));
      let s = ''; for (let t = 0; t < 8; t++) { s = expr(chance(0.6) ? 2 : 3, 2); if (chance(0.75)) s += pick(RELS) + expr(2, 2); if (s.length <= 72) break; } if (chance(0.06)) s += '\\text{ ' + pick(WORDS) + '}'; if (chance(0.05)) s = '\\text{' + pick(WORDS) + '} ' + s;
      return s;
    };
    window.__opts = () => ({ mode: 'math', rtl: chance(0.9), arabicFunctions: chance(0.9), arabicComma: true, digits: chance(0.75) ? 'western' : 'arabic', mathFont: pick(['stix2', 'stix2', 'newcm', 'fira']), fontSize: pick([12, 14, 14, 16, 18]), color: '#000000', font: pick(['Amiri', 'Amiri', 'Cairo', 'NotoNaskhArabic', 'NotoKufiArabic', 'ScheherazadeNew']), bold: chance(0.1) });
  });
  const lines = []; let ok = 0, bad = 0, t0 = Date.now();
  await p.evaluate(s => window.__seed(s), SEED * 100003 + START);
  for (let i = 0; i < N; i++) {
    const r = await p.evaluate(async () => { const tex = window.__make(), o = window.__opts(); try { const r = await RenderHost.render(tex, o, 200 + 0); if (!r || !r.dataUrl) return null; return { tex, png: r.dataUrl, rtl: o.rtl, w: r.widthPt, h: r.heightPt }; } catch (e) { return null; } });
    if (!r || !r.png) { bad++; continue; }
    const id = String(START + ok).padStart(6, '0'); fs.writeFileSync('data/' + id + '.png', Buffer.from(r.png.split(',')[1], 'base64')); lines.push(id + '\t' + (r.rtl ? 1 : 0) + '\t' + r.tex); ok++;
    if ((i + 1) % 100 === 0) console.log(i + 1, ok, bad, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  fs.appendFileSync('labels.tsv', lines.join('\n') + '\n'); console.log('done', ok, bad); await b.close();
})();
