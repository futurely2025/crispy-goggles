/* Document index & check (task pane): lists every equation and figure the add-in inserted, counts the formulas
 * still written as text, and flags what needs attention. Rows select the item in the document; ✎ opens its editor.
 * Self-contained: it only reads the document and reuses WordBridge.parseMeta / DocScan / window.__home. */
(function (global) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function en() { return !!(global.I18N && I18N.lang === 'en'); }
  function L(ar, e) { return en() ? e : ar; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function toast(msg, err) { if (err && window.ArLog) ArLog.add('error', msg, { feature: 'docindex' }); var t = $('toast'); if (!t) return; t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(toast.tm); toast.tm = setTimeout(function () { t.hidden = true; }, err ? 5000 : 2400); }

  var last = null, filter = 'all';

  /** read the document → { items:[{n, meta, kind, label, text}], others, formulas:[…], numbered, old } */
  function scan() {
    return Word.run(function (ctx) {
      var pics = ctx.document.body.inlinePictures, paras = ctx.document.body.paragraphs;
      pics.load('items/altTextDescription');
      paras.load('items/text');
      return ctx.sync().then(function () {
        var items = [], others = 0, numbered = 0, old = 0, eqN = 0, figN = 0;
        pics.items.forEach(function (p, i) {
          var m = global.WordBridge.parseMeta(p.altTextDescription);
          if (!m) { others++; return; }
          var fig = !!m.k;
          if (fig) figN++; else eqN++;
          if (m.o && m.o.numbered) numbered++;
          if (!fig && !(m.v >= 2)) old++;
          var label = fig ? (global.Figures ? Figures.label(m.k, en() ? 'en' : 'ar') : m.k) : (m.m === 'chem' ? L('معادلة كيميائية', 'Chemical equation') : L('معادلة', 'Equation'));
          var text = fig ? figText(m) : (m.m === 'chem' ? '\\ce{' + m.t + '}' : m.t);
          items.push({ n: i, meta: m, fig: fig, label: label, num: fig ? figN : eqN, text: String(text || '').replace(/\s+/g, ' ').trim() });
        });
        var texts = paras.items.map(function (p) { return p.text; });
        var formulas = global.DocScan ? DocScan.find(texts) : [];
        return { items: items, others: others, numbered: numbered, old: old, eq: eqN, figs: figN, formulas: formulas };
      });
    });
  }
  function figText(m) {
    var d = m.d || {};
    if (d.code) return d.code.split('\n').slice(0, 2).join(' ');
    if (d.what) return '\\' + d.what + (d.q ? '{' + d.q + '}' : '');
    if (d.smiles) return d.name || d.smiles;
    if (d.type) return d.type;
    return '';
  }

  // ------------------------------------------------------------ UI
  function render() {
    var r = last, box = $('diOut');
    if (!r) return;
    var chips = '<div class="di-sum">' +
      '<span><b>' + r.eq + '</b> ' + L('معادلة', 'equations') + '</span>' +
      '<span><b>' + r.figs + '</b> ' + L('رسم', 'figures') + '</span>' +
      (r.numbered ? '<span><b>' + r.numbered + '</b> ' + L('مرقّمة', 'numbered') + '</span>' : '') +
      '<span' + (r.formulas.length ? ' class="warn"' : '') + '><b>' + r.formulas.length + '</b> ' + L('صيغة غير محوّلة', 'unconverted') + '</span></div>';
    var checks = [];
    if (r.formulas.length) checks.push('<div class="di-check warn">⚠ ' + L('صيغ مكتوبة كنص لم تُحوَّل بعد: ' + r.formulas.length, 'Formulas still written as text: ' + r.formulas.length) +
      ' <button type="button" class="link" data-a="convert">' + L('تحويلها الآن', 'Convert now') + '</button></div>');
    if (r.old) checks.push('<div class="di-check">ℹ ' + L('معادلات من إصدار قديم: ' + r.old + ' — زر «تطبيق الإعدادات على كل المعادلات» يحدّثها.', 'Equations from an older version: ' + r.old + ' — "Apply settings to all" updates them.') + '</div>');
    if (r.others) checks.push('<div class="di-check">ℹ ' + L('صور أخرى ليست من الإضافة: ' + r.others, 'Other pictures (not from the add-in): ' + r.others) + '</div>');
    if (!checks.length && (r.eq || r.figs)) checks.push('<div class="di-check ok">✓ ' + L('لا توجد مشاكل — كل الصيغ محوّلة.', 'No issues — everything is converted.') + '</div>');
    var tabs = '<div class="di-tabs">' + [['all', L('الكل', 'All')], ['eq', L('المعادلات', 'Equations')], ['fig', L('الرسوم', 'Figures')], ['todo', L('غير المحوّلة', 'Unconverted')]].map(function (t) {
      return '<button type="button" data-f="' + t[0] + '" aria-pressed="' + (filter === t[0]) + '">' + t[1] + '</button>';
    }).join('') + '</div>';
    var rows = [];
    if (filter !== 'todo') r.items.forEach(function (it, k) {
      if ((filter === 'eq' && it.fig) || (filter === 'fig' && !it.fig)) return;
      rows.push('<div class="di-row" data-i="' + k + '"><span class="di-k' + (it.fig ? ' fig' : '') + '">' + esc(it.label) + ' ' + it.num + '</span>' +
        '<span class="di-t" dir="ltr">' + esc(it.text.slice(0, 70)) + (it.text.length > 70 ? '…' : '') + '</span>' +
        '<button type="button" class="di-e" data-e="' + k + '" title="' + L('تحرير', 'Edit') + '">✎</button></div>');
    });
    if (filter === 'all' || filter === 'todo') r.formulas.forEach(function (f, k) {
      rows.push('<div class="di-row todo" data-f="' + k + '"><span class="di-k">' + L('غير محوّلة', 'Text') + '</span><span class="di-t" dir="ltr">' + esc(f.code.replace(/\s+/g, ' ').slice(0, 70)) + '</span></div>');
    });
    if (!rows.length) rows.push('<div class="di-empty">' + L('لا يوجد شيء هنا.', 'Nothing here.') + '</div>');
    box.innerHTML = chips + checks.join('') + tabs + '<div class="di-list">' + rows.join('') + '</div>';
  }

  function run() {
    var btn = $('diScan'); btn.disabled = true;
    scan().then(function (r) { last = r; render(); })
      .catch(function (e) { toast(String((e && e.message) || e), true); })
      .then(function () { btn.disabled = false; });
  }
  function selectItem(it) {
    return Word.run(function (ctx) {
      var pics = ctx.document.body.inlinePictures;
      pics.load('items/altTextDescription');
      return ctx.sync().then(function () {
        var target = null;
        pics.items.forEach(function (p) { var m = global.WordBridge.parseMeta(p.altTextDescription); if (m && it.meta.id && m.id === it.meta.id) target = p; });
        if (!target && pics.items[it.n]) target = pics.items[it.n];
        if (!target) throw new Error(L('لم أجد العنصر — أعد الفحص', 'Item not found — scan again'));
        target.select();
        return ctx.sync();
      });
    });
  }
  function selectText(f) {
    var needle = f.code.split('\n')[0].slice(0, 200);
    return Word.run(function (ctx) {
      var res = ctx.document.body.search(DocScan.wordEscape(needle), { matchCase: true });
      res.load('items');
      return ctx.sync().then(function () {
        if (!res.items.length) throw new Error(L('لم أجد الصيغة — أعد الفحص', 'Formula not found — scan again'));
        res.items[0].select();
        return ctx.sync();
      });
    });
  }

  function init() {
    if (!$('diScan')) return;
    $('diScan').onclick = run;
    $('docIndex').addEventListener('toggle', function () { if ($('docIndex').open && !last && global.Word) run(); });
    $('diOut').addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-a="convert"]')) { var cb = $('convertBtn'); if (cb) { cb.click(); setTimeout(function () { last = null; }, 0); } return; }
      var tab = t.closest('button[data-f]');
      if (tab && tab.parentNode.classList.contains('di-tabs')) { filter = tab.getAttribute('data-f'); render(); return; }
      var ed = t.closest('[data-e]');
      if (ed) {
        var it = last.items[+ed.getAttribute('data-e')], h = global.__home;
        selectItem(it).catch(function () { /* edit by id still works */ });
        if (h) { if (it.fig) h.openStudio(it.meta.k, it.meta); else h.openEditor(it.meta.m, it.meta); }
        return;
      }
      var row = t.closest('.di-row');
      if (!row) return;
      var p = row.hasAttribute('data-i') ? selectItem(last.items[+row.getAttribute('data-i')]) : selectText(last.formulas[+row.getAttribute('data-f')]);
      p.catch(function (x) { toast(String((x && x.message) || x), true); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  global.DocIndex = { scan: scan, run: run, get last() { return last; } };
})(window);
