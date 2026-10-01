const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 250)); });
  await p.route(/appsforoffice|googleapis|gstatic/, r => r.abort());
  await p.goto('http://localhost:8765/pdf.html'); await p.waitForTimeout(1500);
  await p.setInputFiles('#fileInp', 'fx/a.pdf'); await p.waitForSelector('.page svg.ov'); await p.waitForTimeout(1200);
  await p.evaluate(() => { const P = window.__pdf; P.S.pages[0].objs.push({id:P.uid(),t:'rect',x:60,y:60,w:100,h:60,color:'#c00',sw:2},{id:P.uid(),t:'ellipse',x:200,y:80,w:80,h:60,color:'#06c',sw:2}); P.drawOverlay(0); });
  // measure tab
  await p.evaluate(() => { const t=[...document.querySelectorAll('.rtabs [data-rt], [data-rt]')].find(x=>x.dataset.rt==='measure'); t && t.click(); });
  await p.click('#gridBtn'); await p.waitForTimeout(300);
  console.log('grid rect', await p.evaluate(() => !!document.querySelector('.page svg.ov pattern')));
  await p.click('#layersBtn'); await p.waitForTimeout(300);
  console.log('rows', await p.locator('#layersPanel .lyr').count());
  await p.locator('#layersPanel .lyr [data-a=eye]').first().click(); await p.waitForTimeout(200);
  console.log('hidden objs svg groups', await p.evaluate(() => document.querySelectorAll('.page svg.ov g[data-id]').length), 'hide flags', await p.evaluate(() => window.__pdf.S.pages[0].objs.filter(o=>o.hide).length));
  await p.locator('#layersPanel .lyr [data-a=dn]').nth(1).click(); await p.waitForTimeout(200);
  console.log('order', await p.evaluate(() => window.__pdf.S.pages[0].objs.map(o=>o.t).join(',')));
  const bytes = await p.evaluate(async () => { const u = await window.__pdf.buildPdf({}); return u && u.length; }).catch(e=>'err '+e.message);
  console.log('build', bytes);
  await p.screenshot({ path: 'layers.png' });
  await b.close();
})();
