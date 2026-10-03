const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('C', m.text().slice(0, 200)); });
  await p.goto('http://localhost:8765/pdf.html'); await p.waitForTimeout(800); await p.addScriptTag({ url: '/js/pdf/mathocr.js?' + Date.now() });
  const truth = fs.readFileSync('mx/eq/truth.txt', 'utf8').split('\n'); const scales = process.argv[2] ? JSON.parse(process.argv[2]) : [1];
  let t0 = Date.now();
  for (let i = 0; i < truth.length; i++) {
    const b64 = fs.readFileSync('mx/eq/e' + String(i).padStart(2, '0') + '.png').toString('base64');
    const r = await p.evaluate(async ([b64, scales]) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); const r = await PdfMathOcr.recognize(c, { scales }); return { l: r.latex, c: +r.conf.toFixed(2), ms: r.ms }; }, [b64, scales]);
    console.log(i, '|', truth[i], '|', r.l, '|', r.c, r.ms + 'ms');
  }
  console.log('total', Date.now() - t0); await b.close();
})();
