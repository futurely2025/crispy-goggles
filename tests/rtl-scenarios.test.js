const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.route(/appsforoffice|googleapis|gstatic/, r => r.abort());
  await p.goto('http://localhost:8765/editor.html', { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  const W = ms => p.waitForTimeout(ms);
  const set = async f => { await p.evaluate(f => { const m = document.getElementById('mf'); m.setValue(f); m.focus(); }, f); await W(600); };
  const leaves = () => p.evaluate(() => [...document.getElementById('mf').shadowRoot.querySelectorAll('.ML__content [data-atom-id]')].filter(e=>!e.childElementCount&&e.textContent.trim()&&!/vlist-s/.test(e.className)).map(e=>{const r=e.getBoundingClientRect();return {t:e.textContent.replace(/‍/g,''),l:r.left,r:r.right,y:r.top+r.height/2}}));
  const st = () => p.evaluate(() => { const m = document.getElementById('mf'); return 'val="'+m.getValue()+'" pos='+m.position+' sel="'+m.getValue(m.selection)+'"'; });
  const drag = async (x1,y1,x2,y2) => { await p.mouse.move(x1,y1); await p.mouse.down(); await p.mouse.move((x1+x2)/2,(y1+y2)/2,{steps:4}); await p.mouse.move(x2,y2,{steps:4}); await p.mouse.up(); await W(520); };

  // 1. fraction: select numerator digits by drag, then replace
  await set('\\frac{45}{67}+x');
  let L = await leaves(); console.log('leaves', L.map(a=>a.t).join(','));
  const n4 = L.find(a=>a.t==='4'), n5 = L.find(a=>a.t==='5');
  await drag(n4.r-1, n4.y, n5.l+1, n5.y); console.log('1 drag numerator 45:', await st());
  await p.keyboard.type('9'); console.log('  type 9:', await st());
  // 2. click inside denominator digit then arrows
  L = await leaves(); const d6 = L.find(a=>a.t==='6'); await p.mouse.click(d6.r-2, d6.y); await W(500);
  console.log('2 click right half of 6 (denominator):', await st());
  await p.keyboard.press('ArrowLeft'); console.log('  ArrowLeft:', await st());
  await p.keyboard.press('Backspace'); console.log('  Backspace:', await st());
  // 3. superscript
  await set('x^{23}+y_{4}');
  L = await leaves(); const s2 = L.find(a=>a.t==='2'); await p.mouse.click(s2.r-1, s2.y); await W(500); console.log('3 click right half of exponent 2:', await st());
  await p.keyboard.type('7'); console.log('  type 7:', await st());
  // 4. Arabic text
  await set('س+ص=\\text{الجواب}');
  L = await leaves(); console.log('4 leaves', L.map(a=>a.t).join('|'));
  const sad = L.find(a=>a.t==='ص'); await p.mouse.click(sad.r-1, sad.y); await W(500); console.log('  click right half of ص:', await st());
  await drag(L[0].r-1, L[0].y, L[1].l+1, L[1].y); console.log('  drag first..second:', await st());
  // 5. double click on an Arabic word / on x in sum, triple
  await set('12+x=5');
  L = await leaves(); const x = L.find(a=>a.t==='x'); await p.mouse.dblclick((x.l+x.r)/2, x.y); await W(300); console.log('5 dblclick x:', await st());
  await p.mouse.click(50, 300); await W(500); await p.mouse.click(x.l+2,x.y); await W(100); await p.mouse.click(x.l+2,x.y); await W(100); await p.mouse.click(x.l+2,x.y); await W(300); console.log('  tripleclick x:', await st());
  // 6. shift-click extend + shift arrows
  await set('12345'); L = await leaves();
  await p.mouse.click(L[0].r-2, L[0].y); await W(520); await p.keyboard.down('Shift'); await p.mouse.click(L[2].l+2, L[2].y); await p.keyboard.up('Shift'); await W(300);
  console.log('6 click start then shift+click end of 3rd:', await st());
  await p.keyboard.press('Shift+ArrowLeft'); console.log('  Shift+Left extends:', await st());
  // 7. wide formula + drag to the far edge (auto-scroll)
  await set('1234567890+'.repeat(8)+'x'); L = await leaves();
  const sc = await p.evaluate(()=>{const m=document.getElementById('mf');const f=m.shadowRoot.querySelector('.ML__content').parentElement;return [m.scrollWidth,m.clientWidth, f.scrollWidth, f.clientWidth]});
  console.log('7 wide formula scroll dims', sc);
  await p.screenshot({path:'wide.png',clip:{x:0,y:200,width:900,height:130}});
  // 8. undo after selection replace
  await set('123'); L = await leaves(); await p.mouse.click(L[0].r-2,L[0].y); await W(520); await p.keyboard.type('9'); await p.keyboard.press('Control+z'); console.log('8 undo:', await st());
  await b.close();
})();
