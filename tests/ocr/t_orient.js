const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto('http://localhost:8765/pdf.html'); await p.waitForTimeout(800); await p.addScriptTag({ url: '/js/pdf/ocr-engine.js?' + Date.now() });
  const b64 = fs.readFileSync('ocr/cairo200_p1.jpg').toString('base64');
  for (const deg of [0, 90, 180, 270]) {
    const r = await p.evaluate(async ([b64, deg]) => {
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
      const sw = deg % 180 !== 0, c = document.createElement('canvas'); c.width = sw ? img.height : img.width; c.height = sw ? img.width : img.height; const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.rotate(deg * Math.PI / 180); g.drawImage(img, -img.width / 2, -img.height / 2);
      const t0 = performance.now(); const r = await PdfOcrEngine.recognize(c, { mode: 'accurate', lang: 'auto' }); return { conf: Math.round(r.conf), orient: r.orient, text: r.text.slice(0, 80), ms: Math.round(performance.now() - t0) };
    }, [b64, deg]);
    console.log(deg, JSON.stringify(r));
  }
  await b.close();
})();
