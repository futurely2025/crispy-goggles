/*
 * Right-to-left layer for the MathLive visual editor.
 * Mirrors the whole formula (so superscripts go left, √ ∑ ∫ → are mirrored, matrices run RTL)
 * and flips letters/numbers back so they stay readable — the same idea as the output engine.
 * Arabic letters that sit in separate atoms are joined with ZWJ so words look connected.
 */
(function (global) {
  'use strict';
  var AR = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
  var DUAL = /[ئبت-خس-غـ-هىيپچڤکگی]/;
  var RIGHT = /[آ-إاةد-زوٱ]/;
  var KEEP = '()[]{}<>⟨⟩∑∫∬∭∮√∛∜→←↔⇒⇐⇔↦⟶⟵⟷⟹⟸⟺↗↘↙↖⇌≤≥⊂⊃⊆⊇⊄∈∉∋∂∠∃∄∁⌊⌋⌈⌉≪≫≺≻⊢⊣∕∖≮≯≰≱∡';
  var ZW = /[​‌‍﻿\s]/g;

  var CSS =
    '.ML__content.rtl-mirror{transform:scaleX(-1);unicode-bidi:bidi-override;direction:ltr;}' +
    '.ML__content.rtl-mirror .rtlflip{display:inline-block;transform:scaleX(-1);}' +
    '.ML__content.rtl-mirror .rtlar{direction:rtl;unicode-bidi:bidi-override;}' +
    '.rtlar{font-family:var(--armath-ar-font, Amiri), Amiri, "Traditional Arabic", serif !important;}';

  function leafs(root) {
    var out = [];
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    var n;
    while ((n = w.nextNode())) {
      if (n.childElementCount === 0 && !/vlist-s|ML__caret|ML__contains-highlight|ML__selection/.test(n.className) &&
          n.textContent.replace(ZW, '')) out.push(n);
    }
    return out;
  }
  function canJoinNext(ch) { return !!ch && DUAL.test(ch); }
  function canJoinPrev(ch) { return !!ch && (DUAL.test(ch) || RIGHT.test(ch)); }

  function apply(mf) {
    var sr = mf.shadowRoot;
    if (!sr) return;
    var content = sr.querySelector('.ML__content');
    if (!content) return;
    var on = mf.dataset.rtl === '1';
    content.classList.toggle('rtl-mirror', on);
    var ls = leafs(content);
    ls.forEach(function (el, i) {
      var raw = el.textContent.replace(/‍/g, '');
      var isAr = AR.test(raw);
      el.classList.toggle('rtlar', isAr);
      if (!on) {
        el.classList.remove('rtlflip');
        if (el.textContent !== raw) el.textContent = raw;
        return;
      }
      var t = raw;
      if (isAr) {
        el.classList.add('rtlflip');
        var prev = ls[i - 1], next = ls[i + 1];
        var og = el.closest('.ML__op-group');
        var same = function (o) { return o && o.parentNode === el.parentNode && o.closest('.ML__op-group') === og && o.className.split(' ')[0] === el.className.split(' ')[0]; };
        var pt = same(prev) ? prev.textContent.replace(/\u200D/g, '') : '';
        var nt = same(next) ? next.textContent.replace(/\u200D/g, '') : '';
        if (pt && AR.test(pt) && canJoinNext(pt[pt.length - 1]) && canJoinPrev(t[0])) t = '‍' + t;
        if (nt && AR.test(nt) && canJoinNext(t[t.length - 1]) && canJoinPrev(nt[0])) t = t + '‍';
      } else if (!(raw.length === 1 && KEEP.indexOf(raw) >= 0)) {
        el.classList.add('rtlflip');
      } else {
        el.classList.remove('rtlflip');
      }
      if (el.textContent !== t) el.textContent = t;
    });
    // selection / highlight overlays are positioned in unmirrored coordinates: mirror them
    var w = content.offsetWidth;
    Array.prototype.forEach.call(content.querySelectorAll('.ML__contains-highlight, .ML__selection'), function (el) {
      if (!on) return;
      var left = parseFloat(el.style.left), width = parseFloat(el.style.width);
      if (isNaN(left) || isNaN(width)) return;
      var key = left + '|' + width + '|' + w;
      if (el.dataset.rtlKey === key) return;
      var nl = w - left - width;
      el.style.left = nl + 'px';
      el.dataset.rtlKey = nl + '|' + width + '|' + w;
    });
  }

  var MathFieldRTL = {
    attach: function (mf) {
      var sr = mf.shadowRoot;
      if (!sr || mf.__rtlAttached) return;
      mf.__rtlAttached = true;
      var st = document.createElement('style');
      st.textContent = CSS;
      sr.appendChild(st);
      // mirror right away (a microtask, before the browser paints): waiting for the next animation frame let one
      // unmirrored frame show after every key press, which made the formula tremble while typing
      var OPTS = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style'] };
      var obs = new MutationObserver(function () {
        obs.disconnect();
        try { apply(mf); } finally { obs.takeRecords(); obs.observe(sr, OPTS); }
      });
      obs.observe(sr, OPTS);
      mf.addEventListener('keydown', function (e) {
        if (mf.dataset.rtl !== '1' || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          var fwd = e.key === 'ArrowLeft';
          e.preventDefault();
          e.stopPropagation();
          mf.executeCommand(e.shiftKey ? (fwd ? 'extendSelectionForward' : 'extendSelectionBackward')
                                       : (fwd ? 'moveToNextChar' : 'moveToPreviousChar'));
        }
      }, true);
      apply(mf);
    },
    set: function (mf, on) {
      mf.dataset.rtl = on ? '1' : '0';
      apply(mf);
    },
    refresh: apply
  };
  global.MathFieldRTL = MathFieldRTL;
})(window);
