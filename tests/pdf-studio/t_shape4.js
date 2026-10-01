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
  const o0 = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__pdf.S.pages[0].objs.slice(-1)[0])));
  await choose('مستطيل بزوايا'); await draw(60, 60, 260, 160);
  let o = await o0(); console.log('created', o.k, Math.round(o.x), Math.round(o.y), Math.round(o.w), Math.round(o.h));
  // drag SE handle
  let r = await R(); const hpos = async (h) => p.evaluate((h) => { const e = document.querySelector('.page svg.ov [data-h="' + h + '"]'); const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, h);
  let [hx, hy] = await hpos('se'); await p.mouse.move(hx, hy); await p.mouse.down(); await p.mouse.move(hx + 60, hy + 40, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(200);
  o = await o0(); console.log('after SE drag', Math.round(o.w), Math.round(o.h));
  // rotate handle
  [hx, hy] = await hpos('rot'); await p.mouse.move(hx, hy); await p.mouse.down(); await p.mouse.move(hx + 120, hy + 60, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(200);
  o = await o0(); console.log('rot', o.rot);
  // adjust handle
  [hx, hy] = await hpos('a0'); await p.mouse.move(hx, hy); await p.mouse.down(); await p.mouse.move(hx + 40, hy + 30, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(200);
  o = await o0(); console.log('adj', JSON.stringify(o.adj));
  // double-click to edit text
  const cx = await p.evaluate(() => { const g = document.querySelector('.page svg.ov [data-id]'); const b = g.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
  await p.mouse.dblclick(cx[0], cx[1]); await p.waitForTimeout(500);
  console.log('textarea:', await p.locator('textarea.shape-edit').count());
  await p.keyboard.type('مرحباً بالعالم Shape text'); await p.keyboard.press('Control+Enter'); await p.waitForTimeout(400);
  o = await o0(); console.log('text', JSON.stringify(o.text.s));
  // inspector: set gradient + shadow
  await p.locator('[data-seg="fill.m"] [data-v="lin"]').click(); await p.waitForTimeout(200);
  await p.locator('details[data-sec=fx] summary').click(); await p.locator('input[data-k="shadow.on"]').check(); await p.waitForTimeout(300);
  o = await o0(); console.log('fill', JSON.stringify(o.fill.m), 'shadow', o.shadow.on);
  await p.screenshot({ path: 's3.png' });
  // export
  await p.evaluate(() => { window.__pdf.exportDialog(); }); await p.waitForTimeout(500);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 90000 }), p.locator('.dlg [data-a=ok]').click()]);
  await dl.saveAs('fx/shape_out.pdf'); console.log('saved', fs.statSync('fx/shape_out.pdf').size);
  await b.close();
})();
