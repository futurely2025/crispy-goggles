const H = require('./th.js'); const JSZip = require('../../web/vendor/jszip/jszip.min.js');
(async () => {
  let { b, p } = await H.open('jpg-to-pdf.html');
  await p.setInputFiles('input[type=file]', ['fx/i1.jpg', 'fx/i2.jpg', 'fx/i3.png', 'fx/i4.webp']);
  await p.waitForSelector('.tl-file img'); await p.waitForTimeout(800);
  await p.locator('.tl-file').nth(1).getByTitle('تدوير يمين').click(); await p.waitForTimeout(200);
  await p.screenshot({ path: 'j1.png' });
  let d = await H.download(p, async () => { await p.locator('.tl-btn.block').click(); await p.waitForSelector('.tl-result', { timeout: 60000 }); await p.locator('.tl-result .tl-btn').click(); });
  let info = await H.pdfInfo(d.bytes); console.log(d.name, d.bytes.length, info.pages, info.sizes.map(s => Math.round(s.width) + 'x' + Math.round(s.height)).join(' '));
  require('fs').writeFileSync('fx/imgs.pdf', d.bytes); await b.close();
  ({ b, p } = await H.open('pdf-to-jpg.html')); p.setDefaultTimeout(60000);
  await p.setInputFiles('input[type=file]', 'fx/imgs.pdf'); await p.waitForSelector('.tl-pg canvas'); 
  await p.locator('select').selectOption('200');
  d = await H.download(p, async () => { await p.locator('.tl-btn.block').click(); await p.waitForSelector('.tl-result'); await p.getByText('تنزيل الكل (ZIP)').click(); });
  const z = await JSZip.loadAsync(d.bytes); console.log(d.name, Object.keys(z.files)); const f0 = await z.files[Object.keys(z.files)[0]].async('uint8array'); console.log('first jpg', f0[0].toString(16), f0[1].toString(16), f0.length);
  await p.screenshot({ path: 'j2.png' });
  await b.close();
})();
