const H = require('./th.js');
(async () => {
  const { b, p } = await H.open('merge.html');
  console.log('title:', await p.title());
  await p.setInputFiles('input[type=file]', ['fx/a.pdf', 'fx/b.pdf', 'fx/c.pdf']);
  await p.waitForSelector('.tl-file', { timeout: 15000 }); await p.waitForTimeout(800);
  console.log('cards', await p.locator('.tl-file').count(), '| summary:', await p.locator('.tl-side .tl-muted').first().innerText());
  // range on b: 2-3
  await p.locator('.tl-file').nth(1).locator('input.tl-in').fill('2-3'); await p.waitForTimeout(100);
  console.log('after range:', await p.locator('.tl-side .tl-muted').first().innerText());
  // move c to front via button (c is index 2: click "تقديم" twice)
  await p.locator('.tl-file').nth(2).locator('button[title="تقديم"]').click(); await p.waitForTimeout(100);
  await p.locator('.tl-file').nth(1).locator('button[title="تقديم"]').click(); await p.waitForTimeout(200);
  console.log('order:', await p.locator('.tl-file .nm').allInnerTexts());
  await p.screenshot({ path: 'm1.png' });
  await p.locator('.tl-btn.primary.big.block').click();
  await p.waitForSelector('.tl-result', { timeout: 30000 });
  const d = await H.download(p, () => p.locator('.tl-result .tl-btn').click());
  console.log(d.name, await H.pdfInfo(d.bytes));   // expect 2 (c) + 3 (a) + 2 (b 2-3) = 7
  await p.screenshot({ path: 'm2.png' });
  await b.close();
})();
