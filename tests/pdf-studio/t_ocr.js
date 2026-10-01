const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 250)); });
  await p.route(/appsforoffice|googleapis|gstatic/, r => r.abort());
  await p.goto('http://localhost:8765/pdf.html'); await p.waitForTimeout(1500);
  await p.setInputFiles('#fileInp', 'fx/scan.pdf'); await p.waitForSelector('.page svg.ov'); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__pdf.setZoom(0.8)); await p.waitForTimeout(500);
  const r = await p.evaluate(() => { const r = document.querySelector('.page svg.ov').getBoundingClientRect(); return { x: r.left, y: r.top, k: r.width / window.__pdf.S.pages[0].w }; });
  await p.locator('#tools [data-tool=ocr]').click();
  const t0 = Date.now();
  await p.mouse.move(r.x + 20 * r.k, r.y + 50 * r.k); await p.mouse.down(); await p.mouse.move(r.x + 580 * r.k, r.y + 235 * r.k, { steps: 6 }); await p.mouse.up();
  await p.waitForSelector('#ocrT', { timeout: 120000 });
  console.log('time', Date.now() - t0, 'ms'); console.log('TEXT:', JSON.stringify(await p.locator('#ocrT').inputValue()));
  console.log(await p.locator('.dlg-note').first().innerText());
  await b.close();
})();
