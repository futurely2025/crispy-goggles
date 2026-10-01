const H = require('./th.js'); const fs = require('fs');
(async () => {
  let { b, p } = await H.open('protect.html');
  await p.setInputFiles('input[type=file]', 'fx/b.pdf'); await p.waitForSelector('input[type=password]');
  const pws = p.locator('input[type=password]');
  await pws.nth(0).fill('Secret#2026'); await pws.nth(1).fill('different'); await p.locator('.tl-btn.block').click(); console.log('mismatch msg:', await p.locator('.tl-err').first().innerText());
  await pws.nth(1).fill('Secret#2026'); await pws.nth(2).fill('OwnerPass1');
  await p.locator('select').nth(0).selectOption('none'); // no printing
  let d = await H.download(p, async () => { await p.locator('.tl-btn.block').click(); await p.waitForSelector('.tl-result', { timeout: 60000 }); await p.locator('.tl-result .tl-btn.primary').click(); });
  console.log(d.name, d.bytes.length, 'has /Encrypt:', Buffer.from(d.bytes).toString('latin1').includes('/Encrypt'));
  fs.writeFileSync('fx/b_prot.pdf', d.bytes); await b.close();
  // unlock with wrong then right password
  ({ b, p } = await H.open('unlock.html'));
  p.setDefaultTimeout(60000);
  await p.setInputFiles('input[type=file]', 'fx/b_prot.pdf'); await p.waitForSelector('.tl-pw');
  await p.locator('.tl-pw input').fill('wrong'); await p.locator('.tl-pw .tl-btn.primary').click(); await p.waitForTimeout(800);
  console.log('wrong pw ->', await p.locator('.tl-pw .tl-err').innerText().catch(() => 'no msg'));
  await p.locator('.tl-pw input').fill('Secret#2026'); 
  d = await H.download(p, async () => { await p.locator('.tl-pw .tl-btn.primary').click(); await p.waitForSelector('.tl-result'); await p.locator('.tl-result .tl-btn.primary').click(); });
  console.log(d.name, d.bytes.length, 'has /Encrypt:', Buffer.from(d.bytes).toString('latin1').includes('/Encrypt'), JSON.stringify(await H.pdfInfo(d.bytes)).slice(0, 40));
  await p.screenshot({ path: 'u1.png' });
  await b.close();
})();
