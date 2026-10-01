const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs');
(async () => {
  const f = process.argv[2] || 'fx/ocr_keep.pdf';
  const b = await chromium.launch(); const p = await b.newPage(); await p.goto('http://localhost:8765/tools/index.html'); await p.waitForTimeout(800);
  const bytes = [...fs.readFileSync(f)];
  const r = await p.evaluate(async (bytes) => {
    const d = await T.openPdf(new Uint8Array(bytes), 'x.pdf'); const pg = await d.pdf.getPage(1); const vp = pg.getViewport({ scale: 1.6 }); const c = await T.renderPage(d.pdf, 1, { scale: 1.6 });
    const tc = await pg.getTextContent(); const g = c.getContext('2d'); g.strokeStyle = 'rgba(220,0,0,.8)'; g.lineWidth = 1;
    tc.items.forEach(i => { if (!i.str.trim()) return; const x = i.transform[4] * 1.6, y = vp.height - i.transform[5] * 1.6, w = i.width * 1.6, h = (i.height || 8) * 1.6; g.strokeRect(x, y - h, w, h); });
    return { png: c.toDataURL('image/png'), text: tc.items.map(i => i.str).join('').slice(0, 200), n: tc.items.length };
  }, bytes);
  fs.writeFileSync('chk_layer.png', Buffer.from(r.png.split(',')[1], 'base64')); console.log(r.n, r.text); await b.close();
})();
