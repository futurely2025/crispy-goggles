const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs');
const lev = (a, b) => { const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; };
const norm = s => s.replace(/[ً-ْـ‎‏]/g, '').replace(/\s+/g, ' ').trim();
const filt = process.argv[2] || '', cfgNames = (process.argv[3] || '').split(',').filter(Boolean);
const CONFIGS = {
  base: { mode: 'fast', raw: true, lang: 'ara+eng', jobs: [{ v: 'raw', psm: 3 }], dictionary: false },
  base_ara: { mode: 'fast', raw: true, lang: 'ara', jobs: [{ v: 'raw', psm: 3 }], dictionary: false },
  fast_prep: { mode: 'fast', lang: 'ara+eng', jobs: [{ v: 'gray', psm: 6 }], dictionary: false },
  best_raw: { mode: 'accurate', raw: true, lang: 'ara+eng', jobs: [{ v: 'raw', psm: 6 }], dictionary: false },
  best_gray: { mode: 'accurate', lang: 'ara+eng', jobs: [{ v: 'gray', psm: 6 }], dictionary: false },
  best_gray_ara: { mode: 'accurate', lang: 'ara', jobs: [{ v: 'gray', psm: 6 }], dictionary: false },
  best_bin: { mode: 'accurate', lang: 'ara+eng', jobs: [{ v: 'bin', psm: 6 }], dictionary: false },
  best_gray_dict: { mode: 'accurate', lang: 'ara+eng', jobs: [{ v: 'gray', psm: 6 }], dictionary: true },
  accurate: { mode: 'accurate', lang: 'ara+eng' },
  max: { mode: 'max', lang: 'ara+eng' }
};
for (const tb of [30, 40, 50, 64, 80]) CONFIGS['tb' + tb] = { mode: 'accurate', lang: 'ara', jobs: [{ v: 'gray', psm: 6 }], dictionary: false, targetBand: tb };
for (const tb of [40, 50]) CONFIGS['tb' + tb + 'bin'] = { mode: 'accurate', lang: 'ara', jobs: [{ v: 'bin', psm: 6 }], dictionary: false, targetBand: tb };
CONFIGS.d_ara = { mode: 'accurate', lang: 'ara', jobs: [{ v: 'gray', psm: 6 }], dictionary: true };
CONFIGS.d_araeng = { mode: 'accurate', lang: 'ara+eng', jobs: [{ v: 'gray', psm: 6 }], dictionary: true };
CONFIGS.nod_ara = { mode: 'accurate', lang: 'ara', jobs: [{ v: 'gray', psm: 6 }], dictionary: false };
CONFIGS.d_2pass = { mode: 'accurate', lang: 'ara', jobs: [{ v: 'gray', psm: 6 }, { v: 'bin', psm: 6 }], dictionary: true };
CONFIGS.acc_ara = { mode: 'accurate', lang: 'ara' };
CONFIGS.max_ara = { mode: 'max', lang: 'ara' };
CONFIGS.acc_ae = { mode: 'accurate', lang: 'ara+eng' };
CONFIGS.lines = { mode: 'accurate', lang: 'ara', jobs: [{ v: 'lines' }] };
CONFIGS.lines_gray = { mode: 'accurate', lang: 'ara', jobs: [{ v: 'gray', psm: 6 }, { v: 'lines' }] };
const G = { mode: 'accurate', lang: 'ara', jobs: [{ v: 'gray', psm: 6 }], dictionary: false };
CONFIGS.x_nosharp = { ...G, sharpen: false };
CONFIGS.x_nodenoise = { ...G, denoise: false };
CONFIGS.x_noboth = { ...G, sharpen: false, denoise: false };
CONFIGS.x_noflat = { ...G, flatten: false };
CONFIGS.x_def = { ...G };
CONFIGS.y_ae = { ...G, lang: 'ara+eng' };
CONFIGS.y_big = { ...G, targetBand: 64 };
CONFIGS.y_bin = { ...G, jobs: [{ v: 'bin', psm: 6 }] };
CONFIGS.dg_off = { mode: 'accurate', lang: 'ara', jobs: [{ v: 'gray', psm: 6 }], digitPass: false };
CONFIGS.dg_on = { mode: 'accurate', lang: 'ara', jobs: [{ v: 'gray', psm: 6 }], digitPass: true };
CONFIGS.nod_only = { mode: 'accurate', lang: 'ara', jobs: [{ v: 'nod', psm: 6 }] };
CONFIGS.gray_nod = { mode: 'accurate', lang: 'ara', jobs: [{ v: 'gray', psm: 6 }, { v: 'nod', psm: 6 }] };
CONFIGS.tb40_psm3 = { mode: 'accurate', lang: 'ara', jobs: [{ v: 'gray', psm: 3 }], dictionary: false, targetBand: 40 };
CONFIGS.tb40_psm4 = { mode: 'accurate', lang: 'ara', jobs: [{ v: 'gray', psm: 4 }], dictionary: false, targetBand: 40 };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto('http://localhost:8765/pdf.html'); await p.waitForTimeout(1200);
  await p.addScriptTag({ url: '/js/pdf/ocr-engine.js?' + Date.now() });
  const files = fs.readdirSync('ocr').filter(f => f.endsWith('.jpg')).filter(f => !filt || f.includes(filt));
  for (const name of (cfgNames.length ? cfgNames : Object.keys(CONFIGS))) {
    const cfg = CONFIGS[name]; let tot = 0, err = 0, t0 = Date.now(); const per = {}; global.__pt = 0; global.__ph = 0; let conf = 0, angs = [];
    for (const f of files) {
      const truth = norm(fs.readFileSync('ocr/' + f.replace('.jpg', '.txt'), 'utf8'));
      const b64 = fs.readFileSync('ocr/' + f).toString('base64');
      const r = await p.evaluate(async ([b64, cfg]) => {
        const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.getContext('2d').drawImage(img, 0, 0);
        const r = await PdfOcrEngine.recognize(cv, cfg); return { text: r.text, conf: r.conf, angle: r.angle };
      }, [b64, cfg]);
      const pc = t => (t.match(/[.،:؟؛]/g) || []).length; global.__pt = (global.__pt || 0) + pc(truth); global.__ph = (global.__ph || 0) + pc(norm(r.text));
      const e = lev(norm(r.text), truth); tot += truth.length; err += e; conf += r.conf; angs.push(r.angle.toFixed ? +r.angle.toFixed(2) : 0);
      const k = f.replace('.jpg', '').replace(/_p\d$/, ''); per[k] = per[k] || [0, 0]; per[k][0] += e; per[k][1] += truth.length;
      if (process.env.DUMP) { (global.__dump = global.__dump || {})[f] = r.text; }
      if (process.env.SHOW) console.log('   ', f, (100 * e / truth.length).toFixed(1), JSON.stringify(norm(r.text)).slice(0, 200));
    }
    console.log(name.padEnd(15), 'punct', global.__ph + '/' + global.__pt, 'CER', (100 * err / tot).toFixed(2) + '%', ((Date.now() - t0) / 1000).toFixed(0) + 's', Object.entries(per).map(([k, v]) => k + ':' + (100 * v[0] / v[1]).toFixed(1)).join(' '));
  }
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, JSON.stringify(global.__dump || {}));
  await b.close();
})();
