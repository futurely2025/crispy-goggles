const H = require('./th.js'); const fs = require('fs'); const JSZip = require('/home/user/crispy-goggles/web/vendor/jszip/jszip.min.js');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  // make an Arabic text PDF with chromium print
  const bb = await chromium.launch(); const pp = await bb.newPage();
  await pp.setContent('<html dir=rtl lang=ar><body style="font:16px sans-serif"><h1>عنوان المستند الرئيسي</h1><p>هذه فقرة عربية تحتوي على نص طويل نسبياً لاختبار استخراج النص من ملف بي دي إف مع الأرقام 12345 وكلمة English داخل الجملة.</p><p>الفقرة الثانية قصيرة.</p><div style="page-break-before:always"></div><p>الصفحة الثانية من الملف.</p></body></html>');
  fs.writeFileSync('fx/ar.pdf', await pp.pdf({ format: 'A4' })); await bb.close();
  let { b, p } = await H.open('pdf-to-word.html');
  await p.setInputFiles('input[type=file]', 'fx/ar.pdf'); await p.waitForSelector('.tl-btn.block');
  let d = await H.download(p, async () => { await p.locator('.tl-btn.block').click(); await p.waitForSelector('.tl-result'); await p.locator('.tl-result .tl-btn.primary').click(); });
  const z = await JSZip.loadAsync(d.bytes); const x = await z.file('word/document.xml').async('string');
  console.log(d.name, d.bytes.length, 'paras', (x.match(/<w:p>/g) || []).length, 'bidi', (x.match(/<w:bidi\/>/g) || []).length, 'pb', (x.match(/pageBreakBefore/g) || []).length);
  console.log(JSON.stringify(x.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').slice(0, 400))); fs.writeFileSync('fx/ar_out.docx', d.bytes); await b.close();
  for (const [page, setup] of [['watermark.html', async p => {}], ['page-numbers.html', async p => {}], ['rotate.html', async p => { }]]) {
    ({ b, p } = await H.open(page)); p.setDefaultTimeout(40000);
    await p.setInputFiles('input[type=file]', 'fx/b.pdf'); await p.waitForSelector('.tl-btn.block');
    d = await H.download(p, async () => { await p.locator('.tl-btn.block').click(); await p.waitForSelector('.tl-result'); await p.locator('.tl-result .tl-btn.primary').click(); });
    console.log(page, d.name, d.bytes.length, JSON.stringify(await H.pdfInfo(d.bytes)).slice(0, 60)); fs.writeFileSync('fx/' + page.replace('.html', '_out.pdf'), d.bytes); await b.close();
  }
})();
