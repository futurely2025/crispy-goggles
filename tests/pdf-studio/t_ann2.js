const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 250)); });
  await p.route(/appsforoffice|googleapis|gstatic/, r => r.abort());
  await p.goto('http://localhost:8765/pdf.html'); await p.waitForTimeout(1500);
  await p.setInputFiles('#fileInp', 'fx/b.pdf'); await p.waitForSelector('.page svg.ov'); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__pdf.setZoom(0.8)); await p.waitForTimeout(500);
  const R = async () => p.evaluate(() => { const r = document.querySelector('.page svg.ov').getBoundingClientRect(); return { x: r.left, y: r.top, k: r.width / window.__pdf.S.pages[0].w }; });
  // 1) text markup: text selection tool, select by drag over heading, bar appears
  await p.evaluate(() => window.__pdf.setTool('textsel')); await p.waitForTimeout(1200);
  let r = await R(); const tl = await p.evaluate(() => { const s = document.querySelector('.page .textLayer span:not(.markedContent)'); if (!s) return null; const b = s.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; });
  console.log('textLayer span', tl);
  if (tl) { await p.mouse.move(tl[0] + 1, (tl[1] + tl[3]) / 2); await p.mouse.down(); await p.mouse.move(tl[2] - 2, (tl[1] + tl[3]) / 2, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(400); console.log('mkbar visible', await p.locator('.mkbar').isVisible()); await p.locator('.mkbar .mk-c').first().click(); await p.waitForTimeout(300); }
  console.log('objs', await p.evaluate(() => JSON.stringify(window.__pdf.S.pages[0].objs.map(o => o.t + ':' + (o.mk || '') + ':' + (o.rects ? o.rects.length : '')))));
  // 2) measure distance
  await p.locator('#rtabs [data-rt=measure]').click(); await p.locator('[data-meas=measureDist]').click(); r = await R();
  await p.mouse.move(r.x + 50 * r.k, r.y + 300 * r.k); await p.mouse.down(); await p.mouse.move(r.x + 250 * r.k, r.y + 300 * r.k, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(300);
  // measure area polygon
  await p.locator('[data-meas=measureArea]').click(); r = await R(); for (const q of [[60, 350], [200, 350], [200, 450], [60, 430]]) { await p.mouse.click(r.x + q[0] * r.k, r.y + q[1] * r.k); await p.waitForTimeout(120); } await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  // 3) signature dialog: draw
  await p.locator('#rtabs [data-rt=forms]').click(); await p.locator('#signBtn').click(); await p.waitForTimeout(400);
  const cb = await p.locator('#sgCv').boundingBox(); await p.mouse.move(cb.x + 40, cb.y + 100); await p.mouse.down(); for (let i = 0; i < 20; i++) await p.mouse.move(cb.x + 40 + i * 20, cb.y + 100 + Math.sin(i / 2) * 40); await p.mouse.up();
  await p.locator('.dlg [data-a=ok]').click(); await p.waitForTimeout(500);
  console.log('objs', await p.evaluate(() => JSON.stringify(window.__pdf.S.pages[0].objs.map(o => o.t + (o.k ? ':' + o.k : '')))));
  // 4) redact by search
  await p.locator('#rtabs [data-rt=protect]').click(); await p.locator('#redSearchBtn').click(); await p.waitForTimeout(300);
  await p.locator('#rsT').fill('page'); await p.locator('#rsGo').click(); await p.waitForTimeout(1500);
  console.log('search res:', await p.locator('#rsRes').innerText());
  await p.locator('.dlg [data-a=ok]').click(); await p.waitForTimeout(400);
  console.log('redacts:', await p.evaluate(() => window.__pdf.S.pages.reduce((n, pg) => n + pg.objs.filter(o => o.t === 'redact').length, 0)));
  await p.evaluate(() => window.PdfAnnot.openPanel('comments')); await p.waitForTimeout(300);
  await p.screenshot({ path: 'a3.png' });
  await b.close();
})();
