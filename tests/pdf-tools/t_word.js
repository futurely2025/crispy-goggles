const H = require('./th.js');
(async () => {
  const { b, p } = await H.open('word-to-pdf.html'); p.setDefaultTimeout(120000);
  await p.setInputFiles('input[type=file]', 'fx/exam.docx');
  await p.waitForSelector('select'); console.log('info:', (await p.locator('.tl-card p.tl-muted').first().innerText()));
  const t0 = Date.now();
  const d = await H.download(p, async () => { await p.locator('.tl-btn.block').click(); await p.waitForSelector('.tl-result'); await p.locator('.tl-result .tl-btn.primary').click(); });
  const info = await H.pdfInfo(d.bytes); console.log(d.name, d.bytes.length, 'pages', info.pages, (Date.now() - t0) + 'ms', JSON.stringify(info.sizes[0]));
  require('fs').writeFileSync('fx/exam.pdf', d.bytes);
  await p.screenshot({ path: 'w1.png', fullPage: false });
  await b.close();
})();
