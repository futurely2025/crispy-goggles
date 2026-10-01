const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.route(/appsforoffice|googleapis|gstatic/, r => r.abort());
  await p.goto('http://localhost:8765/pdf.html'); await p.waitForTimeout(1200);
  await p.setInputFiles('#fileInp', 'fx/b.pdf'); await p.waitForSelector('.page svg.ov'); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__pdf.setZoom(0.9)); await p.waitForTimeout(500);
  await p.screenshot({ path: 'm_light.png' });
  await p.click('#themeBtn'); await p.waitForTimeout(200); await p.screenshot({ path: 'm_pop.png' });
  await p.click('.mapp [data-k=theme][data-v=dark]'); await p.waitForTimeout(300); await p.mouse.click(700, 500); await p.screenshot({ path: 'm_dark.png' });
  await p.keyboard.press('f'); await p.waitForTimeout(300); await p.screenshot({ path: 'm_focus.png' });
  await b.close();
})();
