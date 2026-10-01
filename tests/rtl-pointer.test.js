// Regression test for click / drag / double-click selection in the RTL formula editor.
// Usage: serve web/ (python3 -m http.server 8765 -d web), then: node tests/rtl-pointer.test.js rtl   (needs playwright)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const FORMULAS = process.argv[3] ? [process.argv[3]] : ['123+x^{2}-\\frac{45}{67}', 'ab=\\sqrt{x+1}', 'س^{2}+ع_{1}=\\frac{جا س}{2}', '\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}'];
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.route(/appsforoffice|googleapis|gstatic/, r => r.abort());
  await p.goto('http://localhost:8765/editor.html', { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  if (process.argv[2]==='ltr') await p.evaluate(()=>MathFieldRTL.set(document.getElementById('mf'),false));
  let bad = 0, tot = 0;
  for (const f of FORMULAS) {
    await p.evaluate(f => { const m = document.getElementById('mf'); m.setValue(f); m.focus(); }, f);
    await p.waitForTimeout(700);
    const leaves = await p.evaluate(() => { const c = document.getElementById('mf').shadowRoot.querySelector('.ML__content');
      return [...c.querySelectorAll('[data-atom-id]')].filter(e => !e.childElementCount && e.textContent.trim() && !/vlist-s/.test(e.className)).map(e => { const r = e.getBoundingClientRect(); return {t: e.textContent, l: r.left, r: r.right, y: r.top + r.height/2}; }); });
    console.log('FORMULA', f, 'leaves', leaves.length);
    for (const a of leaves) {
      for (const fr of [0.25, 0.75]) {
        const x = a.l + (a.r - a.l) * fr;
        await p.mouse.click(x, a.y); await p.waitForTimeout(520);
        const caret = await p.evaluate(() => { const c = document.getElementById('mf').shadowRoot.querySelector('.ML__caret'); if (!c) return null; const r = c.getBoundingClientRect(); return r.left + r.width/2; });
        const want = fr < 0.5 ? a.l : a.r;   // screen-nearest boundary of the atom
        const other = fr < 0.5 ? a.r : a.l; const ok = caret !== null && Math.abs(caret - want) < Math.abs(caret - other);
        tot++; if (!ok) { bad++; console.log('  BAD', JSON.stringify(a.t), 'click', Math.round(x), 'caret', caret && Math.round(caret), 'wanted ~', Math.round(want)); }
      }
    }
  }
  // blank-area clicks
  await p.evaluate(() => { const m = document.getElementById('mf'); m.setValue('123+x'); m.focus(); });
  await p.waitForTimeout(600);
  const pos = async (x) => { await p.mouse.click(x, 240); await p.waitForTimeout(520); return p.evaluate(() => document.getElementById('mf').position + '/' + document.getElementById('mf').lastOffset); };
  console.log('blank far-left click ->', await pos(100), ' blank far-right ->', await pos(893));
  // drag select: from right edge of first char to left edge of third char
  await p.evaluate(() => { const m = document.getElementById('mf'); m.setValue('12345+x'); m.focus(); });
  await p.waitForTimeout(600);
  const lv = await p.evaluate(() => [...document.getElementById('mf').shadowRoot.querySelector('.ML__content').querySelectorAll('[data-atom-id]')].filter(e => !e.childElementCount && e.textContent.trim()).map(e => { const r = e.getBoundingClientRect(); return {t: e.textContent, l: r.left, r: r.right, y: r.top + r.height/2}; }));
  const drag = async (x1, x2, y) => { await p.mouse.move(x1, y); await p.mouse.down(); await p.mouse.move((x1+x2)/2, y, {steps: 4}); await p.mouse.move(x2, y, {steps: 4}); await p.mouse.up(); await p.waitForTimeout(100); return p.evaluate(() => { const m = document.getElementById('mf'); return '"' + m.getValue(m.selection) + '"'; }); };
  console.log('drag screen-right->left  1st digit(mid) to 3rd digit(mid) (want 12 or 123 per half rule):', await drag((lv[0].l+lv[0].r)/2 + 3, (lv[2].l+lv[2].r)/2 - 3, lv[0].y));
  await p.waitForTimeout(600);
  console.log('drag from 1 start(right edge) to 3 end(left edge) (want 123):', await drag(lv[0].r - 1, lv[2].l + 1, lv[0].y));
  await p.waitForTimeout(600);
  console.log('drag reverse 3rd end -> 1st start (want 123):', await drag(lv[2].l + 1, lv[0].r - 1, lv[0].y));
  await p.waitForTimeout(600);
  console.log('drag in blank right to left over whole (want all):', await drag(890, 50, lv[0].y));
  await p.waitForTimeout(600);
  await p.mouse.dblclick((lv[1].l+lv[1].r)/2, lv[1].y); await p.waitForTimeout(100);
  console.log('dblclick on digit:', await p.evaluate(() => { const m = document.getElementById('mf'); return '"' + m.getValue(m.selection) + '"'; }));
  console.log('RESULT', bad + '/' + tot, 'bad');
  await b.close();
})();
