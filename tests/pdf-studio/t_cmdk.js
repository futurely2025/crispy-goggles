const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.route(/appsforoffice|googleapis|gstatic/, r => r.abort());
  await p.goto('http://localhost:8765/pdf.html'); await p.waitForTimeout(1200);
  await p.setInputFiles('#fileInp', 'fx/a.pdf'); await p.waitForSelector('.page svg.ov'); await p.waitForTimeout(800);
  await p.keyboard.press('Control+k'); await p.waitForTimeout(200);
  console.log('open', await p.locator('.cmdk').isVisible());
  await p.keyboard.type('تنقيح'); await p.waitForTimeout(200);
  console.log('rows', await p.locator('.cmdk-row').allInnerTexts());
  await p.screenshot({ path: 'cmdk.png' });
  await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  console.log('tool', await p.evaluate(() => window.__pdf.S.tool));
  await p.keyboard.press('Control+k'); await p.keyboard.type('نجمة'); await p.waitForTimeout(150); console.log(await p.locator('.cmdk-row').allInnerTexts());
  await b.close();
})();
