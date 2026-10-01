/* «تحويل كل LaTeX في المستند» with a preview first (5.7): the pane lists everything that will change — each formula drawn
 * as it will look, its kind (رياضيات / كيمياء / رسم / جدول / مسافة), and the text it replaces. Untick what must stay text,
 * press 🔍 to see it in the document, then convert only what is ticked. Nothing in the document changes before that. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function en() { return !!(window.I18N && I18N.lang === 'en'); }
  function L(a, e) { return en() ? e : a; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var KIND = {
    math: ['رياضيات', 'Math', '#0e9f9a'], chem: ['كيمياء', 'Chemistry', '#7b3fb3'], block: ['رسم / جدول', 'Figure / table', '#1f5fbf'],
    space: ['مسافة', 'Space', '#8a9aa0']
  };
  var CSS = '.cvp{position:fixed;inset:0;z-index:70;background:#fff;display:flex;flex-direction:column;font:13px "Segoe UI",Tahoma,sans-serif;color:#1b2a30}' +
    '.cvp header{padding:10px 12px;border-bottom:1px solid #e3ecee;display:flex;align-items:center;gap:8px}.cvp header b{flex:1;font-size:14px}' +
    '.cvp header button{border:0;background:none;font-size:18px;cursor:pointer;color:#6b7f86}' +
    '.cvp .sum{display:flex;flex-wrap:wrap;gap:5px;padding:8px 12px 4px}.cvp .chip{border:1px solid #d7e3e6;border-radius:999px;padding:2px 9px;font-size:12px;cursor:pointer;background:#fff}' +
    '.cvp .chip[aria-pressed=false]{opacity:.45;text-decoration:line-through}.cvp .chip i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-inline-end:4px}' +
    '.cvp .tools{display:flex;gap:6px;padding:4px 12px 8px;border-bottom:1px solid #e3ecee}.cvp .tools button{border:1px solid #d7e3e6;background:#fff;border-radius:7px;padding:3px 9px;font-size:12px;cursor:pointer}' +
    '.cvp .list{flex:1;overflow:auto;padding:6px 8px}.cvp .it{display:grid;grid-template-columns:22px 1fr auto;gap:6px;align-items:start;border:1px solid #e8eff1;border-radius:10px;padding:7px;margin-bottom:6px}' +
    '.cvp .it.off{opacity:.45}.cvp .it input{margin-top:3px;width:16px;height:16px}.cvp .tag{font-size:11px;font-weight:700;color:#fff;border-radius:6px;padding:0 6px;display:inline-block}' +
    '.cvp .pv{margin-top:4px;min-height:22px;overflow-x:auto;direction:ltr;text-align:right}.cvp .pv svg{max-width:100%;height:auto;vertical-align:middle}' +
    '.cvp .code{margin-top:4px;font:11.5px Consolas,monospace;color:#5f7179;direction:ltr;text-align:left;white-space:pre-wrap;word-break:break-all;max-height:3.2em;overflow:hidden;background:#f6fafb;border-radius:6px;padding:2px 6px}' +
    '.cvp .err{color:#c2352b;font-size:12px}.cvp .go{border:1px solid #d7e3e6;background:#fff;border-radius:7px;width:28px;height:26px;cursor:pointer}' +
    '.cvp footer{padding:10px 12px;border-top:1px solid #e3ecee;display:flex;gap:8px;align-items:center}.cvp footer .n{flex:1;font-size:12px;color:#6b7f86}' +
    '.cvp footer button{border-radius:9px;padding:7px 14px;font-weight:700;cursor:pointer;border:1.5px solid #0e9f9a;background:#fff;color:#0a7c78}.cvp footer button.p{background:#0e9f9a;color:#fff}' +
    '.cvp .empty{padding:30px 16px;text-align:center;color:#6b7f86;line-height:1.8}';

  function open() {
    var H = window.__home;
    if (!H || !window.WordBridge || !WordBridge.scanDoc) return;
    if (!$('cvpCss')) { var s = document.createElement('style'); s.id = 'cvpCss'; s.textContent = CSS; document.head.appendChild(s); }
    H.busy(true, L('جارٍ قراءة المستند…', 'Reading the document…'));
    WordBridge.scanDoc().then(function (res) { H.busy(false); show(res); }, function (e) { H.busy(false); H.toast((e && e.message) || String(e), true); });
  }
  function show(res) {
    var H = window.__home, items = res.items, on = {}, hide = {};
    items.forEach(function (it) { on[it.key] = true; });
    var old = document.querySelector('.cvp'); if (old) old.remove();
    var box = document.createElement('div'); box.className = 'cvp'; box.dir = en() ? 'ltr' : 'rtl';
    box.innerHTML = '<header><b>🔎 ' + L('معاينة التحويل', 'Conversion preview') + (res.scope === 'sel' ? ' — ' + L('التحديد فقط', 'selection only') : '') + '</b><button type="button" data-x>✕</button></header>' +
      '<div class="sum"></div><div class="tools"><button type="button" data-all>' + L('تحديد الكل', 'All') + '</button><button type="button" data-none>' + L('إلغاء الكل', 'None') + '</button></div>' +
      '<div class="list"></div><footer><span class="n"></span><button type="button" data-cancel>' + L('إلغاء', 'Cancel') + '</button><button type="button" class="p" data-go></button></footer>';
    document.body.appendChild(box);
    var list = box.querySelector('.list');
    function kindOf(it) { return it.type === 'space' ? 'space' : it.mode === 'block' ? 'block' : it.mode === 'chem' ? 'chem' : 'math'; }
    if (!items.length) {
      list.innerHTML = '<div class="empty">' + L('لم أجد LaTeX في ' + (res.scope === 'sel' ? 'التحديد' : 'المستند') + '.<br>أمثلة تُفهم: $س^2$ أو \\frac{1}{2} أو \\ce{H2O} أو \\begin{graph} …', 'No LaTeX found.') + '</div>';
    }
    // kinds summary (click to include / exclude a whole kind)
    var counts = {};
    items.forEach(function (it) { var k = kindOf(it); counts[k] = (counts[k] || 0) + 1; });
    var sum = box.querySelector('.sum');
    Object.keys(KIND).forEach(function (k) {
      if (!counts[k]) return;
      var c = document.createElement('button'); c.type = 'button'; c.className = 'chip'; c.setAttribute('aria-pressed', 'true');
      c.innerHTML = '<i style="background:' + KIND[k][2] + '"></i>' + (en() ? KIND[k][1] : KIND[k][0]) + ' ' + counts[k];
      c.onclick = function () {
        var p = c.getAttribute('aria-pressed') !== 'true'; c.setAttribute('aria-pressed', String(p));
        items.forEach(function (it) { if (kindOf(it) === k) on[it.key] = p; }); sync();
      };
      sum.appendChild(c);
    });
    // one row per formula; drawn when it scrolls into view
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); draw(e.target); } }); }, { root: list }) : null;
    var rows = items.map(function (it, i) {
      var k = kindOf(it), r = document.createElement('div');
      r.className = 'it';
      r.innerHTML = '<input type="checkbox" checked><div><span class="tag" style="background:' + KIND[k][2] + '">' + (en() ? KIND[k][1] : KIND[k][0]) + '</span>' +
        (it.type === 'space' ? ' <span style="color:#6b7f86">' + (it.text === '\t' ? L('مسافة Tab', 'Tab') : L('مسافة', 'space')) + '</span>' : (it.whole ? ' <span style="color:#6b7f86;font-size:11px">' + L('سطر مستقل', 'own line') + '</span>' : '')) +
        '<div class="pv"></div>' + (it.type === 'space' ? '' : '<div class="code">' + esc(it.code) + '</div>') + '</div><button type="button" class="go" title="' + L('عرضها في المستند', 'Show in document') + '">🔍</button>';
      r.__it = it;
      r.querySelector('input').onchange = function () { on[it.key] = this.checked; sync(); };
      r.querySelector('.go').onclick = function () { WordBridge.selectMatch(it.key).then(function (ok) { if (!ok) H.toast(L('لم أعد أجدها — ربما تغيّر النص', 'Not found any more'), true); }); };
      list.appendChild(r);
      if (io) io.observe(r); else draw(r);
      return r;
    });
    function draw(r) {
      var it = r.__it, pv = r.querySelector('.pv');
      if (it.type === 'space') { pv.innerHTML = '<span style="font:12px Consolas,monospace;color:#8a9aa0">' + esc(it.code) + ' → ' + (it.text === '\t' ? '⇥' : '␣') + '</span>'; return; }
      pv.textContent = '…';
      var job;
      if (it.mode === 'block') {
        var b = window.Figures && Figures.scan(it.code).blocks[0];
        job = !b ? Promise.reject(new Error('?')) : Figures.prepare(b).then(function (m) {
          if (m.type === 'table') return '<span style="font-size:12px">▦ ' + L('جدول Word', 'Word table') + ' — ' + m.table.rows.length + ' × ' + (m.table.rows[0] ? m.table.rows[0].cells.length : 0) + '</span>';
          return Figures.render(m.kind, m.data).then(function (x) { return x.svg; });
        });
      } else {
        var o = Object.assign({}, H.curOpts(), { mode: it.mode, display: false, fontSize: 14 });
        job = RenderHost.preview(it.tex, o).then(function (x) {
          if (x.errors && x.errors.length) throw new Error(x.errors.join(' — '));
          return x.svgString.replace(/<svg/, '<svg width="' + (x.width * 18).toFixed(0) + '" height="' + (x.total * 18).toFixed(0) + '"');
        });
      }
      job.then(function (h) { pv.innerHTML = h; var s = pv.querySelector('svg'); if (s && it.mode === 'block') { s.setAttribute('width', '220'); s.removeAttribute('height'); } },
        function (e) { pv.innerHTML = '<span class="err">⚠ ' + esc(e.message || e) + ' — ' + L('ستُظلَّل بالأصفر مع تعليق', 'will be highlighted') + '</span>'; });
    }
    function sync() {
      var n = 0;
      rows.forEach(function (r) { var v = !!on[r.__it.key]; r.querySelector('input').checked = v; r.classList.toggle('off', !v); if (v) n++; });
      box.querySelector('.n').textContent = n + ' / ' + items.length;
      var go = box.querySelector('[data-go]'); go.disabled = !n; go.textContent = L('تحويل المحدد', 'Convert') + ' (' + n + ')';
    }
    box.querySelector('[data-all]').onclick = function () { items.forEach(function (it) { on[it.key] = true; }); sum.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', 'true'); }); sync(); };
    box.querySelector('[data-none]').onclick = function () { items.forEach(function (it) { on[it.key] = false; }); sum.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); }); sync(); };
    function close() { if (io) io.disconnect(); box.remove(); }
    box.querySelector('[data-x]').onclick = close;
    box.querySelector('[data-cancel]').onclick = close;
    box.querySelector('[data-go]').onclick = function () {
      var only = {}; items.forEach(function (it) { if (on[it.key]) only[it.key] = true; });
      close();
      convert(only);
    };
    sync();
  }
  function convert(only) {
    var H = window.__home, s = H.settings || {};
    H.busy(true);
    WordBridge.convertDollars(H.curOpts(), +s.dpi || 600, function (i, n) {
      var t = $('busyText'); if (t) t.textContent = L('جارٍ التحويل ', 'Converting ') + i + ' / ' + n;
    }, only).then(function (r) {
      if (r.failed && window.ArLog) ArLog.warn('convert', (r.errors || []).slice(0, 12).map(function (x) { return typeof x === 'string' ? x : JSON.stringify(x); }).join(' | '));
      H.toast(L('تم تحويل: ', 'Converted: ') + r.done + (r.spaces ? L(' — مسافات: ', ' — spaces: ') + r.spaces : '') +
        (r.failed ? L(' — تعذّر: ' + r.failed + ' (مظللة بالأصفر مع تعليق يوضح السبب)', ' — not converted: ' + r.failed) : ''), r.failed > 0);
    }).catch(function (e) { H.toast((e && e.message) || String(e), true); }).then(function () { H.busy(false); });
  }
  function init() { var b = $('convertBtn'); if (b && window.__home) b.onclick = open; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);
  window.ConvertPreview = { open: open, show: show };
})();
