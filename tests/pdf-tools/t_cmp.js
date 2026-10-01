const H = require('./th.js');
(async () => {
  const { b, p } = await H.open('compare.html', { h: 1000, w: 1300 }); p.setDefaultTimeout(60000);
  const ins = p.locator('input[type=file]');
  await ins.nth(0).setInputFiles('fx/b.pdf'); await p.waitForTimeout(600); await ins.nth(1).setInputFiles('fx/b2.pdf');
  await p.waitForSelector('.cmp-row'); await p.waitForTimeout(2500);
  console.log('summary:', (await p.locator('.tl-card').nth(2).innerText()).replace(/\n+/g, ' | '));
  console.log('rows', await p.locator('.cmp-row').count(), '| badges:', (await p.locator('.cmp-badge').allInnerTexts()).join(' ; '));
  await p.getByText('التالي').click(); await p.waitForTimeout(600); console.log('nav:', await p.locator('.tl-card.tl-row b').last().innerText());
  await p.screenshot({ path: 'cmp1.png' });
  await p.locator('.tl-seg button[data-v=text]').click(); await p.waitForTimeout(300);
  console.log('text diff:', (await p.locator('.cmp-item').allInnerTexts()).join(' || ').replace(/\n+/g, ' '));
  await p.screenshot({ path: 'cmp2.png' });
  await p.locator('.tl-seg button[data-v=overlay]').click(); await p.waitForTimeout(2500); await p.screenshot({ path: 'cmp3.png' });
  await b.close();
})();
