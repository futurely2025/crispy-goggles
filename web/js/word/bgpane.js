/* Word pane: background of the selected equation / figure (transparent, white or any colour) — 5.4.
 * Select one equation (or a range with several) and pick a background; nothing selected = every equation. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function en() { return !!(window.I18N && I18N.lang === 'en'); }
  function L(a, e) { return en() ? e : a; }
  function init() {
    var card = $('selCard'), H = window.__home;
    if (!card || !window.BgPick || !window.WordBridge || !WordBridge.setBackground || $('selBgRow')) return;
    var row = document.createElement('div');
    row.id = 'selBgRow';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px dashed #d7e3e6';
    row.innerHTML = '<span style="font-size:12.5px;font-weight:700;color:#3d5560">' + L('الخلفية:', 'Background:') + '</span>';
    var pick = BgPick.el({
      value: '', onChange: function (v) {
        if (!H) return;
        H.busy && H.busy(true);
        WordBridge.setBackground(v, +(H.settings && H.settings.dpi) || 600).then(function (n) {
          H.toast && H.toast(en() ? 'Background changed (' + n + ')' : (v ? 'تم تغيير الخلفية' : 'أصبحت الخلفية شفافة') + (n > 1 ? ' — ' + n : ''));
        }).catch(function (e) {
          if (window.ArLog) ArLog.error('bg', e);
          H.toast && H.toast((en() ? 'Error: ' : 'خطأ: ') + (e && e.message || e), true);
        }).then(function () { H.busy && H.busy(false); setTimeout(function () { H.checkSelection && H.checkSelection(); }, 250); });
      }
    });
    row.appendChild(pick);
    card.appendChild(row);
    // «نسخ كصورة شفافة» next to «نسخ كصورة» (5.7)
    var cp = $('copyPicBtn');
    if (cp && !$('copyTrBtn') && H && H.copyPic) {
      var tb = document.createElement('button');
      tb.className = 'btn'; tb.type = 'button'; tb.id = 'copyTrBtn';
      tb.title = L('نسخ المعادلة صورة بلا خلفية لتلصقها فوق أي لون', 'Copy as a picture without background');
      tb.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border-radius:3px;border:1px solid #9fb3b8;vertical-align:-1px;background:repeating-conic-gradient(#d9e2e4 0 25%,#fff 0 50%) 0 0/6px 6px"></span> ' + L('نسخ شفافة', 'Copy transparent');
      tb.onclick = function () { H.copyPic(true); };
      cp.parentNode.insertBefore(tb, cp.nextSibling);
    }
    // follow the selected equation
    function sync() {
      var m = H && H.selected;
      if (!m) return;
      pick.setValue(m.k ? (m.bg && m.bg !== 'none' ? m.bg : '') : (m.o && m.o.bg) || '');
    }
    new MutationObserver(sync).observe(card, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(sync).observe($('selPreview'), { childList: true });
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);
})();
