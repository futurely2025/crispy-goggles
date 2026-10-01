const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs');
const { PDFDocument } = require('/home/user/crispy-goggles/web/vendor/pdf-lib/pdf-lib.min.js');
const corpus = JSON.parse(fs.readFileSync('ocr/corpus.json', 'utf8')); const all = [].concat(...Object.values(corpus)).filter(l => !/[A-Za-z]{4}/.test(l));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); await p.goto('http://localhost:8765/pdf.html'); await p.waitForTimeout(1200);
  const out = [];
  for (const [name, dpi, fam, px150, deg, noise] of [['page300', 300, 'Cairo', 22, 0.9, 12], ['page150', 150, 'Noto Naskh Arabic', 22, -1.4, 16]]) {
    const lines = []; for (let i = 0; i < 36; i++) lines.push(all[i % all.length]);
    const url = await p.evaluate(async ([lines, dpi, fam, px150, deg, noise]) => {
      const k = dpi / 150, W = Math.round(1240 * k), H = Math.round(1754 * k), px = px150 * k; await document.fonts.load('40px "' + fam + '"');
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#151515';
      g.font = 'bold ' + (px * 1.5) + 'px "' + fam + '"'; g.direction = 'rtl'; g.textAlign = 'right'; g.fillText('الفصل الأول: مقدمة عامة', W - 110 * k, 140 * k);
      g.font = px + 'px "' + fam + '"'; const lh = px * 1.75; lines.forEach((t, i) => g.fillText(t, W - 110 * k, 220 * k + lh * i));
      const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; const g2 = c2.getContext('2d'); g2.fillStyle = '#fff'; g2.fillRect(0, 0, W, H); g2.translate(W / 2, H / 2); g2.rotate(deg * Math.PI / 180); g2.translate(-W / 2, -H / 2); g2.filter = 'blur(' + (0.5 * k) + 'px)'; g2.drawImage(cv, 0, 0);
      const d = g2.getImageData(0, 0, W, H), a = d.data; let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, shade = 1 - 0.3 * (0.6 * x / W + 0.4 * y / H), nz = (rnd() + rnd() + rnd() - 1.5) * noise * 2; for (let q = 0; q < 3; q++) a[i + q] = Math.max(0, Math.min(255, a[i + q] * shade + nz)); }
      g2.putImageData(d, 0, 0); return c2.toDataURL('image/jpeg', 0.6);
    }, [lines, dpi, fam, px150, deg, noise]);
    const jpg = Buffer.from(url.split(',')[1], 'base64'); fs.writeFileSync('ocr/' + name + '.jpg', jpg); fs.writeFileSync('ocr/' + name + '.txt', ['الفصل الأول: مقدمة عامة'].concat(lines).join('\n'));
    const pdf = await PDFDocument.create(); const im = await pdf.embedJpg(jpg); const pg = pdf.addPage([595.28, 841.89]); pg.drawImage(im, { x: 0, y: 0, width: 595.28, height: 841.89 }); fs.writeFileSync('fx/' + name + '.pdf', await pdf.save());
    console.log(name, jpg.length);
  }
  await b.close();
})();
