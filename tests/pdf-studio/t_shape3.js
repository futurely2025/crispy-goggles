const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 250)); });
  await p.route(/appsforoffice|googleapis|gstatic/, r => r.abort());
  await p.goto('http://localhost:8765/pdf.html'); await p.waitForTimeout(1500);
  await p.setInputFiles('#fileInp', 'fx/b.pdf'); await p.waitForSelector('.page svg.ov'); await p.waitForTimeout(1200);
  await p.evaluate(() => window.__pdf.setZoom(0.8)); await p.waitForTimeout(500);
  const R = async () => p.evaluate(() => { const r = document.querySelector('.page svg.ov').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, k: r.width / window.__pdf.S.pages[0].w }; });
  const choose = async (title) => { await p.locator('#shapeBtn').click(); await p.locator('#shgSearch').fill(title); await p.waitForTimeout(150); await p.locator('.shg-item').first().click(); await p.waitForTimeout(250); };
  const draw = async (x0, y0, x1, y1) => { const r = await R(); await p.mouse.move(r.x + x0 * r.k, r.y + y0 * r.k); await p.mouse.down(); await p.mouse.move(r.x + x1 * r.k, r.y + y1 * r.k, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(300); };
  await choose('نجمة 5'); await draw(30, 40, 120, 130);
  await choose('فقاعة مستديرة'); await draw(150, 40, 330, 120);
  await choose('سهم يمين'); await draw(30, 160, 200, 230);
  await choose('قلب'); await draw(220, 150, 300, 230);
  await choose('سهم'); await draw(40, 260, 200, 300);
  await choose('موصل منكسر بسهم'); await draw(40, 330, 220, 400);
  await choose('سحابة مراجعة');
  { const r = await R(); const pts = [[250, 260], [330, 270], [340, 330], [280, 350], [240, 310]]; for (const q of pts) { await p.mouse.click(r.x + q[0] * r.k, r.y + q[1] * r.k); await p.waitForTimeout(120); } await p.keyboard.press('Enter'); await p.waitForTimeout(300); }
  console.log('objs:', await p.evaluate(() => JSON.stringify(window.__pdf.S.pages[0].objs.map(o => o.k))));
  await p.evaluate(() => window.__pdf.select(0, null)); await p.waitForTimeout(300);
  await p.evaluate(() => { window.__pdf.exportDialog(); }); await p.waitForTimeout(500);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 90000 }), p.locator('.dlg [data-a=ok]').click()]);
  await dl.saveAs('fx/shape_out2.pdf'); console.log('saved', fs.statSync('fx/shape_out2.pdf').size);
  await b.close();
})();
