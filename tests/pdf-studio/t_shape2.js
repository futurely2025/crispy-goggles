const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 250)); });
  await p.route(/appsforoffice|googleapis|gstatic/, r => r.abort());
  await p.goto('http://localhost:8765/pdf.html'); await p.waitForTimeout(1500);
  await p.setInputFiles('#fileInp', 'fx/b.pdf'); await p.waitForSelector('.page svg.ov', { timeout: 20000 }); await p.waitForTimeout(1200);
  const rect = async () => p.evaluate(() => { const r = document.querySelector('.page svg.ov').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const pick = async (id) => { await p.locator('#shapeBtn').click(); await p.locator('#shgSearch').fill(''); await p.evaluate(id => { document.querySelector('.shg-cats [data-c=all]').click(); [...document.querySelectorAll('.shg-item')].find(b => b.title.includes('')); }, id); await p.evaluate((id) => { const items = [...document.querySelectorAll('.shg-item')]; }, id); };
  const choose = async (title) => { await p.locator('#shapeBtn').click(); await p.locator('#shgSearch').fill(title); await p.waitForTimeout(150); await p.locator('.shg-item').first().click(); };
  const R = await rect(); console.log('page ov', JSON.stringify(R));
  // 1) star5 drag
  await choose('نجمة 5'); await p.mouse.move(R.x + 60, R.y + 80); await p.mouse.down(); await p.mouse.move(R.x + 160, R.y + 180, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(400);
  console.log('objs:', await p.evaluate(() => JSON.stringify(window.__pdf.S.pages[0].objs.map(o => o.t + ':' + o.k))));
  console.log('inspector visible:', await p.locator('#insp').isVisible(), '| tool:', await p.evaluate(() => window.__pdf.S.tool));
  await p.screenshot({ path: 's1.png' });
  // 2) callout drawn with click only
  await choose('فقاعة مستديرة'); await p.mouse.click(R.x + 300, R.y + 140); await p.waitForTimeout(300);
  // 3) arrow line
  await choose('سهم'); await p.locator('.shg-item').first(); await b.close();
})();
