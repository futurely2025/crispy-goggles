const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.route(/appsforoffice|googleapis|gstatic/, r => r.abort());
  await p.goto('http://localhost:8765/pdf.html'); await p.waitForTimeout(1200);
  await p.setInputFiles('#fileInp', 'fx/b.pdf'); await p.waitForSelector('.page svg.ov'); await p.waitForTimeout(1500);
  const R = () => p.evaluate(() => { const r = document.querySelector('.page svg.ov').getBoundingClientRect(); return { x: r.left, y: r.top, k: r.width / window.__pdf.S.pages[0].w }; });
  await p.locator('[data-tool=text]').first().click(); let r = await R();
  await p.mouse.click(r.x + 250 * r.k, r.y + 200 * r.k); await p.waitForTimeout(300);
  await p.keyboard.type('مرحبا نص تجريبي'); await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  const st = () => p.evaluate(() => { const S = window.__pdf.S; const o = S.pages[0].objs.filter(o => o.t === 'text')[0]; return { tool: S.tool, sel: S.sel && S.sel.ids, n: S.pages[0].objs.length, x: o && Math.round(o.x), y: o && Math.round(o.y), w: o && o.w }; });
  console.log('after type', JSON.stringify(await st()));
  await p.screenshot({ path: 'tx1.png' });
  // drag the text
  const bx = await p.evaluate(() => { const id = window.__pdf.S.sel.id; const g = document.querySelector('.page svg.ov g[data-id="' + id + '"]'); const q = g.getBoundingClientRect(); return { cx: q.left + q.width / 2, cy: q.top + q.height / 2, w: q.width, h: q.height }; }); console.log(JSON.stringify(bx)); const cx = bx.cx, cy = bx.cy;
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 60, cy + 80, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(300);
  console.log(JSON.stringify(await p.evaluate(() => window.__pdf.S.pages[0].objs.map(o => [o.id, o.t, o.g, Math.round(o.x), Math.round(o.y)]))));
  console.log('after drag', JSON.stringify(await st()));
  const b2 = await p.evaluate(() => { const g = document.querySelector('.page svg.ov g[data-id="' + window.__pdf.S.sel.id + '"]').getBoundingClientRect(); return [g.left + g.width / 2, g.top + g.height / 2]; }); await p.mouse.dblclick(b2[0], b2[1]); await p.waitForTimeout(300); console.log('early', await p.locator('textarea.tedit').count(), await p.evaluate(() => document.activeElement.className)); await p.waitForTimeout(400); console.log('editing textarea', await p.locator('textarea.tedit').count());
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.screenshot({ path: 'tx2.png' });
  await b.close();
})();
(async () => {
  const b = await require('/opt/node22/lib/node_modules/playwright').chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.route(/appsforoffice|googleapis|gstatic/, r => r.abort());
  await p.goto('http://localhost:8765/pdf.html'); await p.waitForTimeout(1200);
  await p.setInputFiles('#fileInp', 'fx/b.pdf'); await p.waitForSelector('.page svg.ov'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const P = window.__pdf; const o = { id: P.uid(), t: 'text', x: 40, y: 100, w: 200, text: 'hello', size: 16, color: '#000', align: 'left', lh: 1.5 }; o.h = P.textHeight(o); P.S.pages[0].objs.push(o); P.drawOverlay(0); P.select(0, o.id); });
  await p.keyboard.press('Enter'); await p.waitForTimeout(400); console.log('Enter -> editor', await p.locator('textarea.tedit').count());
  await b.close();
})();
