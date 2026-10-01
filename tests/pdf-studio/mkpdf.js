// make sample PDFs for tests
const { PDFDocument, StandardFonts, rgb } = require('/home/user/crispy-goggles/web/vendor/pdf-lib/pdf-lib.min.js');
const fs = require('fs');
(async () => {
  for (const [name, n, text] of [['a.pdf', 3, 'Alpha page'], ['b.pdf', 5, 'Bravo page'], ['c.pdf', 2, 'Charlie page']]) {
    const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= n; i++) { const p = d.addPage([400, 560]); p.drawText(text + ' ' + i, { x: 40, y: 480, size: 28, font: f }); p.drawRectangle({ x: 40, y: 100, width: 100 + i * 30, height: 80, color: rgb(i / 6, 0.4, 0.6) }); }
    d.setTitle(name); fs.writeFileSync('fx/' + name, await d.save());
  }
  // b2: like b but with one changed page & text for compare
  const d = await PDFDocument.create(); const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 5; i++) { const p = d.addPage([400, 560]); p.drawText((i === 3 ? 'Bravo CHANGED ' : 'Bravo page ') + i, { x: 40, y: 480, size: 28, font: f }); p.drawRectangle({ x: 40, y: 100, width: 100 + i * 30 + (i === 4 ? 60 : 0), height: 80, color: rgb(i / 6, 0.4, 0.6) }); }
  fs.writeFileSync('fx/b2.pdf', await d.save());
  console.log('ok');
})();
