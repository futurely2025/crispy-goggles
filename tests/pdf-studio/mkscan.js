// scanned-looking Arabic + English exam page as an image-only PDF
const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const { PDFDocument } = require('/home/user/crispy-goggles/web/vendor/pdf-lib/pdf-lib.min.js'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://localhost:8765/tools/index.html');
  const jpg = await p.evaluate(async () => {
    await document.fonts.load('40px Amiri', 'ب'); const c = document.createElement('canvas'); c.width = 1240; c.height = 1754; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#111'; g.direction = 'rtl'; g.textAlign = 'right'; g.font = '46px Amiri'; g.fillText('السؤال الأول: احسب مساحة المثلث الذي طول قاعدته ٨ سم', 1160, 200);
    g.fillText('وارتفاعه ٦ سم ثم أوجد محيطه إذا كان متساوي الساقين', 1160, 280);
    g.direction = 'ltr'; g.textAlign = 'left'; g.font = '44px Times New Roman'; g.fillText('Question 2: Find the value of x if 3x + 5 = 20', 80, 420);
    const id = g.getImageData(0, 0, c.width, c.height); for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() * 18) | 0; id.data[i] -= n; id.data[i + 1] -= n; id.data[i + 2] -= n; } g.putImageData(id, 0, 0);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  });
  await b.close();
  const d = await PDFDocument.create(); const im = await d.embedJpg(Buffer.from(jpg, 'base64')); const pg = d.addPage([595, 842]); pg.drawImage(im, { x: 0, y: 0, width: 595, height: 842 });
  fs.writeFileSync('fx/scan.pdf', await d.save()); console.log('ok');
})();
