const H = require('./th.js');
(async () => {
  const { b, p } = await H.open('organize.html');
  await p.setInputFiles('input[type=file]', 'fx/b.pdf');
  await p.waitForSelector('.tl-pg canvas', { timeout: 15000 }); await p.waitForTimeout(1200);
  const order = async () => (await p.locator('.tl-pg .no').allInnerTexts()).join(' ');
  console.log('start:', await order());
  // select page 2, rotate right; select 4 -> delete; duplicate page1; add blank after 3
  await p.locator('.tl-pg').nth(1).click(); await p.getByTitle('تدوير المحدد 90° إلى اليمين').click();
  await p.locator('.tl-pg').nth(3).click(); await p.getByTitle('حذف المحدد (Delete)').click(); await p.waitForTimeout(200);
  console.log('after delete 4th:', await order());
  await p.locator('.tl-pg').nth(0).click(); await p.getByTitle('تكرار المحدد').click(); await p.waitForTimeout(200);
  console.log('after dup 1st:', await order());
  // drag-reorder: drag last cell before first
  const cells = p.locator('.tl-pg'); const n = await cells.count();
  await cells.nth(n - 1).dragTo(cells.nth(0)); await p.waitForTimeout(300);
  console.log('after drag last->first:', await order());
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200); console.log('undo:', await order());
  await p.getByTitle('إدراج صفحة فارغة بعد المحدد').click(); await p.waitForTimeout(200); console.log('blank:', await order());
  await p.screenshot({ path: 'o1.png' });
  const d = await H.download(p, async () => { await p.locator('.tl-btn.block').click(); await p.waitForSelector('.tl-result'); await p.locator('.tl-result .tl-btn').click(); });
  const info = await H.pdfInfo(d.bytes); console.log(d.name, info.pages, JSON.stringify(info.sizes.map(s => Math.round(s.width) + 'x' + Math.round(s.height))));
  const { PDFDocument } = require('../../web/vendor/pdf-lib/pdf-lib.min.js'); const doc = await PDFDocument.load(d.bytes); console.log('rotations', doc.getPages().map(x => x.getRotation().angle).join(','));
  await b.close();
})();
