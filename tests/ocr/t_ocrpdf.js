const H = require('./th.js'); const fs = require('fs');
(async () => {
  const how = process.argv[2] || 'clean', file = process.argv[3] || 'page150';
  const { b, p } = await H.open('ocr-pdf.html'); p.setDefaultTimeout(170000);
  await p.setInputFiles('input[type=file]', 'fx/' + file + '.pdf'); await p.waitForSelector('.tl-btn.block');
  if (how === 'keep') await p.locator('.tl-seg [data-v=keep]').click();
  await p.locator('select').first().selectOption(process.argv[4] || 'fast');
  const t0 = Date.now();
  const d = await H.download(p, async () => { await p.locator('.tl-btn.block').click(); await p.waitForSelector('.tl-result'); await p.locator('.tl-result .tl-btn.primary').first().click(); });
  console.log(how, d.name, d.bytes.length, ((Date.now() - t0) / 1000).toFixed(0) + 's'); console.log(await p.locator('.tl-result').innerText());
  fs.writeFileSync('fx/ocr_' + how + '.pdf', d.bytes);
  await b.close();
})();
