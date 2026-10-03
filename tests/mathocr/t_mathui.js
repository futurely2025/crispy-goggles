const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 200)); });
  await p.route(/appsforoffice|googleapis|gstatic/, r => r.abort());
  await p.goto('http://localhost:8765/pdf.html'); await p.waitForTimeout(1200);
  await p.setInputFiles('#fileInp', 'fx/eq.pdf'); await p.waitForSelector('.page svg.ov'); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__pdf.setZoom(1)); await p.waitForTimeout(400);
  const r = await p.evaluate(() => { const r = document.querySelector('.page svg.ov').getBoundingClientRect(); return { x: r.left, y: r.top, k: r.width / window.__pdf.S.pages[0].w }; });
  await p.locator('[data-tool=mathocr]').click();
  // equation at pdf y: 842-600-h ... draw box around the first image (x 100.., top = 842-600-h)
  const h1 = 131 * 0.5 * 1, W1 = 0; const y0 = 842 - 600 - 70, x0 = 95;
  await p.mouse.move(r.x + x0 * r.k, r.y + (842 - 600 - 75) * r.k); await p.mouse.down(); await p.mouse.move(r.x + 330 * r.k, r.y + (842 - 600 + 8) * r.k, { steps: 5 }); await p.mouse.up();
  await p.waitForSelector('#mathT', { timeout: 100000 });
  console.log('LATEX:', await p.locator('#mathT').inputValue()); console.log(await p.locator('.ocr-stat').innerText());
  await p.screenshot({ path: 'math_dlg.png' });
  await p.locator('.dlg [data-a=ok]').click(); await p.waitForTimeout(3000);
  console.log('modal open', await p.evaluate(() => !document.getElementById('modal').hidden), await p.evaluate(() => document.getElementById('mframe').src.slice(0, 80)));
  await b.close();
})();
