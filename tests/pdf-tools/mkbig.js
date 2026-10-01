// a PDF with big noisy raster images (JPEG + Flate RGB) to test compression
const { PDFDocument } = require('../../web/vendor/pdf-lib/pdf-lib.min.js');
const fs = require('fs');
(async () => {
  const { chromium } = require('/opt/node22/lib/node_modules/playwright');
  const b = await chromium.launch(); const p = await b.newPage();
  const jpgs = await p.evaluate(async () => {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const c = document.createElement('canvas'); c.width = 2400; c.height = 3200; const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 2400, 3200); grd.addColorStop(0, '#2a5'); grd.addColorStop(1, '#a25'); g.fillStyle = grd; g.fillRect(0, 0, 2400, 3200);
      const id = g.getImageData(0, 0, 2400, 3200); for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() * 60) | 0; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } g.putImageData(id, 0, 0);
      g.fillStyle = '#000'; g.font = '200px serif'; g.fillText('Scan ' + k, 300, 800);
      out.push(c.toDataURL('image/jpeg', 0.97).split(',')[1]);
    }
    return out;
  });
  await b.close();
  const d = await PDFDocument.create();
  for (const j of jpgs) { const im = await d.embedJpg(Buffer.from(j, 'base64')); const pg = d.addPage([595, 842]); pg.drawImage(im, { x: 0, y: 0, width: 595, height: 842 }); }
  fs.writeFileSync('fx/big.pdf', await d.save()); console.log(fs.statSync('fx/big.pdf').size);
})();
