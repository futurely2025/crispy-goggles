/* PDF tools hub: search + categories */
(function () {
  'use strict';
  var h = T.h;
  document.documentElement.lang = 'ar'; document.documentElement.dir = 'rtl';
  document.title = 'أدوات PDF — معادلات عربية';
  var search = h('input', { class: 'tl-in', type: 'search', placeholder: 'ابحث عن أداة: دمج، ضغط، Word، حماية…', 'aria-label': 'بحث عن أداة' });
  var out = h('div', { id: 'tiles' });
  document.body.className = 'tl-page';
  var head = h('header', { class: 'tl-head' }, [
    h('a', { class: 'tl-brand', href: 'index.html' }, [h('span', { class: 'tl-logo', text: 'م' }), h('b', { text: 'أدوات PDF' }), h('small', { text: 'معادلات عربية' })]),
    h('nav', { class: 'tl-nav' }, [h('a', { href: '../pdf.html', text: 'استوديو تحرير PDF' }), h('a', { href: '../taskpane.html', text: 'إضافة Word' })])]);
  var main = h('main', { class: 'tl-main', id: 'main' }, [
    h('section', { class: 'hub-hero' }, [h('h1', { text: 'كل أدوات PDF في مكان واحد' }),
      h('p', { text: 'دمج وتقسيم وضغط وتحويل وحماية ومقارنة — بدقة عالية ودعم كامل للعربية. تعمل على جهازك مباشرة دون رفع الملفات.' }),
      h('div', { class: 'hub-search' }, search)]),
    out]);
  document.body.appendChild(head); document.body.appendChild(main);
  document.body.appendChild(h('footer', { class: 'tl-foot' }, [h('span', { text: '🔐 تتم المعالجة كلها على جهازك — لا يُرفع أي ملف إلى أي خادم.' })]));

  function tile(t) {
    var href = t.href || (t.id + '.html');
    return h('a', { class: 'hub-tile', href: href, style: '--c:' + t.col, 'data-s': (t.ar + ' ' + t.en + ' ' + t.d).toLowerCase() }, [
      h('span', { class: 'ic', text: t.ico }), h('div', null, [h('b', { text: t.ar }), h('small', { text: t.en }), h('p', { text: t.d })])]);
  }
  var cat = 'all';
  var chips = h('div', { class: 'tl-seg', style: 'margin:16px 0 4px;max-width:100%;overflow-x:auto;flex-wrap:nowrap' }, [['all', 'الكل']].concat(T.CATS.map(function (c) { return [c[0], c[1]]; })).map(function (c) {
    return h('button', { type: 'button', class: c[0] === 'all' ? 'on' : '', 'data-v': c[0], text: c[1], style: 'flex:none', onclick: function () { cat = c[0]; [].forEach.call(chips.children, function (b) { b.classList.toggle('on', b.getAttribute('data-v') === cat); }); draw(search.value); } });
  }));
  main.insertBefore(chips, out);
  function draw(q) {
    out.innerHTML = '';
    q = (q || '').trim().toLowerCase();
    var list = T.TOOLS.filter(function (t) { return (cat === 'all' || t.cat === cat) && (!q || (t.ar + ' ' + t.en + ' ' + t.d).toLowerCase().indexOf(q) >= 0); });
    if (!list.length) { out.appendChild(h('div', { class: 'hub-empty', text: 'لا توجد أداة بهذا الاسم' })); return; }
    out.appendChild(h('div', { class: 'hub-grid' }, list.map(tile)));
  }
  search.oninput = function () { draw(search.value); };
  draw('');
})();
