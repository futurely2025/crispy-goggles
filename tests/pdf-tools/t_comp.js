const H = require('./th.js');
(async () => {
  const { b, p } = await H.open('compress.html');
  await p.setInputFiles('input[type=file]', 'fx/big.pdf');
  await p.waitForSelector('.tl-seg', { timeout: 20000 });
  for (const lv of ['light', 'medium', 'strong', 'extreme']) {
    await p.locator('.tl-seg button[data-v=' + lv + ']').click();
    const t0 = Date.now();
    await p.locator('.tl-btn.block').click();
    await p.waitForSelector('.tl-result', { timeout: 120000 });
    const txt = await p.locator('.tl-result').innerText();
    const d = await H.download(p, () => p.locator('.tl-result .tl-btn.primary').click());
    console.log(lv, (Date.now() - t0) + 'ms', d.bytes.length, JSON.stringify(await H.pdfInfo(d.bytes)).slice(0, 60), '|', txt.replace(/\n+/g, ' ').slice(0, 130));
    await p.evaluate(() => document.querySelector('.tl-result') && document.querySelector('.tl-result').remove());
    if (lv === 'medium') await p.screenshot({ path: 'c1.png' });
  }
  await b.close();
})();
