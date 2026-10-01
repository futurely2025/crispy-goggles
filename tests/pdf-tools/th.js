// test harness for PDF tools pages
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { PDFDocument } = require('../../web/vendor/pdf-lib/pdf-lib.min.js');
const fs = require('fs');
exports.open = async (page, opts = {}) => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: opts.w || 1200, height: opts.h || 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) console.log('CONSOLE', m.text().slice(0, 300)); });
  await p.route(/appsforoffice|googleapis|gstatic/, r => r.abort());
  await p.goto('http://localhost:8765/tools/' + page, { waitUntil: 'load' });
  await p.waitForTimeout(400);
  return { b, p };
};
exports.download = async (p, clickFn) => {
  const [d] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), clickFn()]);
  const path = '/tmp/dl_' + Date.now() + '_' + d.suggestedFilename();
  await d.saveAs(path);
  return { name: d.suggestedFilename(), path, bytes: fs.readFileSync(path) };
};
exports.pdfInfo = async (bytes, pw) => { const d = await PDFDocument.load(bytes, { ignoreEncryption: true }); return { pages: d.getPageCount(), sizes: d.getPages().map(p => p.getSize()) }; };
