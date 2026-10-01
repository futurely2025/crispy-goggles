const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const r = await p.evaluate(() => { const mk = (w, h, col, type) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '80px sans-serif'; g.fillText(w + 'x' + h, 40, h / 2); return c.toDataURL(type, 0.9).split(',')[1]; };
    return { j1: mk(1600, 1200, '#2a7', 'image/jpeg'), j2: mk(900, 1400, '#a52', 'image/jpeg'), p1: mk(800, 800, '#35a', 'image/png'), w1: mk(1000, 600, '#a39', 'image/webp') }; });
  fs.writeFileSync('fx/i1.jpg', Buffer.from(r.j1, 'base64')); fs.writeFileSync('fx/i2.jpg', Buffer.from(r.j2, 'base64')); fs.writeFileSync('fx/i3.png', Buffer.from(r.p1, 'base64')); fs.writeFileSync('fx/i4.webp', Buffer.from(r.w1, 'base64'));
  await b.close(); console.log('ok');
})();
