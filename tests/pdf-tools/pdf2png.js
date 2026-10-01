// usage: node pdf2png.js file.pdf outPrefix page1 page2 ... [--w 900]
const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs');
(async () => {
  const args = process.argv.slice(2); const file = args[0], pre = args[1]; const pages = args.slice(2).map(Number).filter(Boolean);
  const b = await chromium.launch(); const p = await b.newPage(); await p.goto('http://localhost:8765/tools/index.html');
  const bytes = [...fs.readFileSync(file)];
  const out = await p.evaluate(async ([bytes, pages]) => {
    const d = await T.openPdf(new Uint8Array(bytes), 'x.pdf'); const res = [];
    for (const n of pages) { const c = await T.renderPage(d.pdf, n, { width: 900 }); res.push(c.toDataURL('image/png').split(',')[1]); }
    return { n: d.pages, res };
  }, [bytes, pages]);
  pages.forEach((n, i) => fs.writeFileSync(pre + n + '.png', Buffer.from(out.res[i], 'base64'))); console.log('pages', out.n);
  await b.close();
})();
