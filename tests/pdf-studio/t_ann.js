const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 250)); });
  await p.route(/appsforoffice|googleapis|gstatic/, r => r.abort());
  await p.goto('http://localhost:8765/pdf.html'); await p.waitForTimeout(1500);
  await p.setInputFiles('#fileInp', 'fx/b.pdf'); await p.waitForSelector('.page svg.ov'); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__pdf.setZoom(0.8)); await p.waitForTimeout(500);
  console.log('ribbon tabs:', await p.locator('#rtabs [data-rt]').count());
  await p.locator('#rtabs [data-rt=protect]').click(); await p.waitForTimeout(200);
  await p.screenshot({ path: 'a1.png' });
  const R = async () => p.evaluate(() => { const r = document.querySelector('.page svg.ov').getBoundingClientRect(); return { x: r.left, y: r.top, k: r.width / window.__pdf.S.pages[0].w }; });
  // redact tool: drag over heading
  await p.locator('[data-tool=redact]').first().click();
  let r = await R(); await p.mouse.move(r.x + 40 * r.k, r.y + 55 * r.k); await p.mouse.down(); await p.mouse.move(r.x + 300 * r.k, r.y + 110 * r.k, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(500);
  console.log('dialog?', await p.locator('.dlg').count());
  await p.locator('.dlg #rl').fill('محجوب'); await p.locator('.dlg [data-a=ok]').click(); await p.waitForTimeout(300);
  // link tool
  await p.locator('#rtabs [data-rt=forms]').click(); await p.locator('[data-tool=link]').click();
  r = await R(); await p.mouse.move(r.x + 40 * r.k, r.y + 200 * r.k); await p.mouse.down(); await p.mouse.move(r.x + 200 * r.k, r.y + 230 * r.k, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(400);
  await p.locator('.dlg #lkUrl').fill('https://example.com'); await p.locator('.dlg [data-a=ok]').click(); await p.waitForTimeout(300);
  // text field
  await p.locator('[data-tool=ftext]').click(); r = await R(); await p.mouse.move(r.x + 40 * r.k, r.y + 260 * r.k); await p.mouse.down(); await p.mouse.move(r.x + 220 * r.k, r.y + 285 * r.k, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(400);
  await p.locator('.dlg #fn').fill('student_name'); await p.locator('.dlg #fv').fill('علي Ali'); await p.locator('.dlg [data-a=ok]').click(); await p.waitForTimeout(300);
  // checkbox click
  await p.locator('[data-tool=fcheck]').click(); r = await R(); await p.mouse.click(r.x + 60 * r.k, r.y + 320 * r.k); await p.waitForTimeout(400); await p.locator('.dlg [data-a=ok]').click(); await p.waitForTimeout(300);
  // combo
  await p.locator('[data-tool=fcombo]').click(); r = await R(); await p.mouse.click(r.x + 200 * r.k, r.y + 330 * r.k); await p.waitForTimeout(400); await p.locator('.dlg [data-a=ok]').click(); await p.waitForTimeout(300);
  // shape + bookmarks
  await p.evaluate(() => { window.PdfAnnot.openPanel('bmarks'); }); await p.locator('#bmAdd').click(); await p.waitForTimeout(300); await p.locator('.dlg [data-a=ok]').click(); await p.waitForTimeout(300);
  console.log('objs:', await p.evaluate(() => JSON.stringify(window.__pdf.S.pages[0].objs.map(o => o.t + (o.fk ? ':' + o.fk : '')))));
  await p.screenshot({ path: 'a2.png' });
  // export
  await p.evaluate(() => { window.__pdf.exportDialog(); }); await p.waitForTimeout(500);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 90000 }), p.locator('.dlg [data-a=ok]').click()]);
  await dl.saveAs('fx/annot_out.pdf'); console.log('saved', fs.statSync('fx/annot_out.pdf').size);
  await b.close();
})();
