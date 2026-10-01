/* Appearance for the PDF studio: theme (light/dark/auto), accent colour, page tone, density, focus mode, status-bar zoom. */
(function () {
  'use strict';
  var P = window.__pdf, $ = function (id) { return document.getElementById(id); };
  var KEY = 'armath.pdf.skin', ACC = { 'فيروزي': ['#0e9f9a', '#0a7c78', '#075e5b', '#e2f5f3', '#f1fbfa', '#c9ece6'], 'أزرق': ['#2f6fed', '#2159c7', '#17408f', '#e3ecff', '#f1f5ff', '#c9d9fb'], 'بنفسجي': ['#7a4fc2', '#6239a6', '#4a2a82', '#eee6fb', '#f7f2fd', '#dccdf3'], 'أخضر': ['#2e9a57', '#237a44', '#185a31', '#e2f5e9', '#f1fbf4', '#c7e9d3'], 'برتقالي': ['#e2791c', '#bd6212', '#8d4809', '#fdeedd', '#fff8f1', '#f7d9b8'], 'وردي': ['#d1478f', '#aa3472', '#7c2554', '#fbe5f0', '#fef3f8', '#f3c7de'] };
  var st = { theme: 'auto', acc: 'فيروزي', tone: '', dense: false };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* ignore */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } }
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function apply() {
    var dark = st.theme === 'dark' || (st.theme === 'auto' && mq && mq.matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var a = ACC[st.acc] || ACC['فيروزي'], r = document.documentElement.style;
    ['--tq', '--tq-2', '--tq-3', '--tq-soft', '--tq-softer', '--mint'].forEach(function (k, i) { r.setProperty(k, a[i]); });
    document.body.classList.toggle('tone-sepia', st.tone === 'sepia'); document.body.classList.toggle('tone-night', st.tone === 'night'); document.body.classList.toggle('dense', !!st.dense);
    var tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = dark ? '#0d1417' : a[0];
    var b = $('themeBtn'); if (b) b.textContent = dark ? '☾' : '☀';
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (st.theme === 'auto') apply(); });

  // header buttons
  var grp = document.querySelector('.pgroup');
  function hb(id, txt, title) { var b = document.createElement('button'); b.className = 'tb'; b.id = id; b.type = 'button'; b.textContent = txt; b.title = title; return b; }
  var theme = hb('themeBtn', '☀', 'المظهر: ثيم، لون التمييز، لون الصفحة'), focus = hb('focusBtn', '⛶', 'وضع التركيز: إخفاء الأشرطة وإبقاء الصفحة فقط (F)');
  var after = $('findBtn'); if (grp && after) { grp.insertBefore(theme, after); grp.insertBefore(focus, after); }

  // appearance popover
  var pop = document.createElement('div'); pop.className = 'mapp'; pop.hidden = true; document.body.appendChild(pop);
  function seg(key, items) { return '<div class="seg">' + items.map(function (i) { return '<button type="button" data-k="' + key + '" data-v="' + i[0] + '" aria-pressed="' + (String(st[key]) === String(i[0])) + '">' + i[1] + '</button>'; }).join('') + '</div>'; }
  function draw() {
    pop.innerHTML = '<h4>الثيم</h4>' + seg('theme', [['light', '☀ فاتح'], ['dark', '☾ داكن'], ['auto', '◐ تلقائي']]) +
      '<h4>لون التمييز</h4><div class="acc">' + Object.keys(ACC).map(function (n) { return '<button type="button" data-k="acc" data-v="' + n + '" title="' + n + '" style="background:' + ACC[n][0] + '" aria-pressed="' + (st.acc === n) + '"></button>'; }).join('') + '</div>' +
      '<h4>لون الصفحة (للعرض فقط — لا يؤثر في الملف)</h4>' + seg('tone', [['', 'عادي'], ['sepia', 'ورقي'], ['night', 'ليلي']]) +
      '<h4>كثافة الأزرار</h4>' + seg('dense', [['false', 'مريح'], ['true', 'مدمج']]);
    [].forEach.call(pop.querySelectorAll('button[data-k]'), function (b) { b.onclick = function () { var v = b.dataset.v; st[b.dataset.k] = b.dataset.k === 'dense' ? v === 'true' : v; save(); apply(); draw(); }; });
  }
  theme.onclick = function (e) { e.stopPropagation(); if (!pop.hidden) { pop.hidden = true; return; } draw(); var r = theme.getBoundingClientRect(); pop.hidden = false; pop.style.top = (r.bottom + 8) + 'px'; pop.style.left = Math.max(8, Math.min(innerWidth - 300, r.left - 120)) + 'px'; };
  document.addEventListener('pointerdown', function (e) { if (!pop.hidden && !pop.contains(e.target) && e.target !== theme) pop.hidden = true; }, true);
  function toggleFocus() { document.body.classList.toggle('focus'); focus.setAttribute('aria-pressed', String(document.body.classList.contains('focus'))); }
  focus.onclick = toggleFocus;
  document.addEventListener('keydown', function (e) {
    var t = e.target, typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'f' || e.key === 'F') && P.S.pdf) { e.preventDefault(); toggleFocus(); }
    else if (e.key === 'Escape' && document.body.classList.contains('focus') && !document.querySelector('.dlg')) toggleFocus();
  });

  // status bar: zoom slider + live info
  var sb = document.querySelector('.pstatus');
  if (sb) {
    var z = document.createElement('span'); z.className = 'mz';
    z.innerHTML = '<button type="button" id="szOut" title="تصغير">−</button><input type="range" id="szR" min="25" max="400" step="5" value="100" aria-label="التكبير"><button type="button" id="szIn" title="تكبير">+</button><output id="szV">100%</output>';
    sb.appendChild(z);
    var r = $('szR'), o = $('szV');
    r.oninput = function () { P.setZoom(r.value / 100); };
    $('szOut').onclick = function () { $('zoomOut').click(); }; $('szIn').onclick = function () { $('zoomIn').click(); };
    setInterval(function () { var v = Math.round(P.S.zoom * 100); if (+r.value !== v && document.activeElement !== r) r.value = v; o.textContent = v + '%'; }, 250);
    var info = document.createElement('span'); info.id = 'selInfo'; sb.insertBefore(info, $('saveState'));
    setInterval(function () {
      var s = P.S, n = s.sel && s.sel.ids ? s.sel.ids.length : 0, cnt = s.pages.reduce(function (a, p) { return a + p.objs.length; }, 0);
      info.textContent = s.pdf ? (n ? 'محدد: ' + n + ' عنصر · ' : '') + cnt + ' عنصر في الملف' : '';
    }, 400);
  }
  apply();
  window.PdfSkin = { state: st, apply: apply };
})();
