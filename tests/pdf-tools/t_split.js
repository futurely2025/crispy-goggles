const H = require('./th.js'); const JSZip = require('../../web/vendor/jszip/jszip.min.js');
(async () => {
  const { b, p } = await H.open('split.html');
  await p.setInputFiles('input[type=file]', 'fx/b.pdf');
  await p.waitForSelector('.tl-pg', { timeout: 15000 }); await p.waitForTimeout(800);
  console.log('pages', await p.locator('.tl-pg').count(), '| ranges default:', JSON.stringify(await p.locator('textarea').inputValue()));
  // ranges: "1-2\n3-"
  await p.locator('textarea').fill('1-2\n3-');
  let d = await H.download(p, async () => { await p.locator('.tl-btn.block').click(); await p.waitForSelector('.tl-result'); await p.locator('.tl-result .tl-btn.primary').click(); });
  const z = await JSZip.loadAsync(d.bytes); console.log(d.name, Object.keys(z.files)); for (const n of Object.keys(z.files)) console.log(' ', n, (await H.pdfInfo(await z.files[n].async('uint8array'))).pages);
  // pick mode: click pages 2 and 4, shift-click 5 -> extract
  await p.locator('.tl-pg').nth(1).click(); await p.locator('.tl-pg').nth(3).click(); await p.locator('.tl-pg').nth(4).click({ modifiers: ['Shift'] });
  console.log('pick info:', await p.locator('.tl-side .tl-muted').first().innerText());
  d = await H.download(p, async () => { await p.locator('.tl-btn.block').click(); await p.waitForSelector('.tl-result'); await p.locator('.tl-result .tl-btn.primary').first().click(); });
  console.log(d.name, await H.pdfInfo(d.bytes));
  await p.screenshot({ path: 's1.png' });
  await b.close();
})();
