const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs');
const corpus = JSON.parse(fs.readFileSync('ocr/corpus.json', 'utf8'));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto('http://localhost:8765/pdf.html'); await p.waitForTimeout(1500);
  const cases = [
    { id: 'clean300', fam: 'Amiri', px: 54, deg: 0, noise: 0, blur: 0, jpeg: 0.95, light: 0, scale: 1 },
    { id: 'cairo200', fam: 'Cairo', px: 36, deg: 1.2, noise: 10, blur: 0.6, jpeg: 0.6, light: 0.25, scale: 1 },
    { id: 'naskh150', fam: 'Noto Naskh Arabic', px: 27, deg: 2.2, noise: 16, blur: 0.8, jpeg: 0.5, light: 0.35, scale: 1 },
    { id: 'kufi_hard', fam: 'Noto Kufi Arabic', px: 24, deg: -2.8, noise: 22, blur: 1.0, jpeg: 0.4, light: 0.45, scale: 1 },
    { id: 'amiri_mid', fam: 'Amiri', px: 32, deg: -1.0, noise: 12, blur: 0.7, jpeg: 0.55, light: 0.3, scale: 1 }
  ];
  let n = 0;
  for (const c of cases) for (const k of ['p5', 'p6']) {
    const lines = corpus[k];
    const url = await p.evaluate(async ([c, lines]) => {
      await document.fonts.load('40px "' + c.fam + '"');
      const lh = Math.round(c.px * 1.9), W = 1100, H = lh * (lines.length + 1) + 80;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#111'; g.font = c.px + 'px "' + c.fam + '", serif'; g.direction = 'rtl'; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
      lines.forEach((t, i) => { g.fillText(t, W - 60, 60 + lh * (i + 1)); });
      // rotate
      const cv2 = document.createElement('canvas'); cv2.width = W; cv2.height = H; const g2 = cv2.getContext('2d'); g2.fillStyle = '#fff'; g2.fillRect(0, 0, W, H);
      g2.translate(W / 2, H / 2); g2.rotate(c.deg * Math.PI / 180); g2.translate(-W / 2, -H / 2); if (c.blur) g2.filter = 'blur(' + c.blur + 'px)'; g2.drawImage(cv, 0, 0); g2.filter = 'none';
      const d = g2.getImageData(0, 0, W, H), a = d.data; let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4; const shade = 1 - c.light * (0.5 * x / W + 0.5 * y / H) * (0.6 + 0.4 * Math.sin(x / 90));
        const nz = c.noise ? (rnd() + rnd() + rnd() - 1.5) * c.noise * 2 : 0;
        for (let q = 0; q < 3; q++) a[i + q] = Math.max(0, Math.min(255, a[i + q] * shade + nz));
      }
      g2.putImageData(d, 0, 0);
      return cv2.toDataURL('image/jpeg', c.jpeg);
    }, [c, lines]);
    fs.writeFileSync('ocr/' + c.id + '_' + k + '.jpg', Buffer.from(url.split(',')[1], 'base64'));
    fs.writeFileSync('ocr/' + c.id + '_' + k + '.txt', lines.join('\n')); n++;
  }
  console.log('generated', n); await b.close();
})();
