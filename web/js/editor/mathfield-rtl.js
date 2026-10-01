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


  // ------------------------------------------------------------ pointer (click / drag / double-click) in RTL
  // MathLive finds the caret position under the mouse from the *drawn* rectangles of the atoms, then picks "before" or
  // "after" an atom by the left/right half, "start" when the click is left of the formula and "end" when it is right of
  // it. All of that assumes left-to-right. In the mirrored (RTL) formula it was backwards: clicking the right half of a
  // digit put the caret after it, a drag selected the wrong characters, and clicking the empty space left of the
  // formula moved the caret to the start. So in RTL mode the pointer is handled here and only the "which atom is
  // under this point" lookup is delegated to MathLive (mf.getOffsetFromPoint), with the point mirrored inside the atom.
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function atomUnder(sr, x, y) {
    var els = sr.elementsFromPoint ? sr.elementsFromPoint(x, y) : [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.hasAttribute || !el.hasAttribute('data-atom-id')) continue;
      if (el.querySelector('[data-atom-id]')) return null;   // a container (fraction, root…): use MathLive's own lookup
      return el;
    }
    return null;
  }

  // logical offset (0…lastOffset) the caret should take for a pointer at screen point (x, y) in a mirrored formula
  function offsetAt(mf, x, y) {
    var sr = mf.shadowRoot, latex = sr.querySelector('.ML__latex');
    if (!latex) return mf.position;
    var n = latex.getBoundingClientRect();
    if (n.width === 0) return mf.position;
    y = clamp(y, n.top + 2, Math.max(n.top + 2, n.bottom - 2));
    // the formula starts at its right end: the empty space to the right is "before everything", to the left "after"
    if (x >= n.right) return 0;
    if (x <= n.left) return mf.lastOffset;
    var el = atomUnder(sr, x, y);
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.width > 0) x = r.left + r.right - x;     // swap the halves of this atom
    }
    var off = mf.getOffsetFromPoint(x, y, { bias: 0 });
    return off < 0 ? mf.position : off;
  }

  function setRange(mf, anchor, focus) {
    mf.selection = anchor === focus ? { ranges: [[focus, focus]] }
      : { ranges: [[Math.min(anchor, focus), Math.max(anchor, focus)]], direction: focus < anchor ? 'backward' : 'forward' };
  }

  function attachPointer(mf) {
    var last = { t: 0, x: 0, y: 0, n: 0 };
    mf.addEventListener('pointerdown', function (e) {
      if (mf.dataset.rtl !== '1' || e.button !== 0 || e.defaultPrevented) return;
      var path = e.composedPath ? e.composedPath() : [];
      var inContent = false;
      for (var i = 0; i < path.length; i++) {
        var c = path[i], cl = c && c.classList;
        if (!cl) continue;
        if (cl.contains('ML__content') || cl.contains('ML__latex')) { inContent = true; break; }
        if (cl.contains('ML__keyboard') || (c.getAttribute && c.getAttribute('part') && /toggle|menu/.test(c.getAttribute('part')))) return;
      }
      if (!inContent && !(path[0] === mf || (path[0] && path[0].classList && /ML__(container|field)/.test(path[0].className)))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!mf.hasFocus()) mf.focus();

      var now = Date.now();
      last.n = (now - last.t < 450 && Math.abs(e.clientX - last.x) < 6 && Math.abs(e.clientY - last.y) < 6) ? last.n + 1 : 1;
      last.t = now; last.x = e.clientX; last.y = e.clientY;

      var sel = mf.selection, rg = sel.ranges && sel.ranges[0];
      var anchor;
      var hit = offsetAt(mf, e.clientX, e.clientY);
      if (e.shiftKey && rg) anchor = sel.direction === 'backward' ? rg[1] : rg[0];
      else anchor = hit;
      setRange(mf, anchor, hit);

      if (last.n === 2 && !e.shiftKey) { mf.executeCommand('selectGroup'); return; }
      if (last.n >= 3 && !e.shiftKey) { mf.executeCommand('selectAll'); return; }

      try { mf.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
      var moved = false;
      function move(ev) {
        if (ev.pointerId !== e.pointerId) return;
        if (!moved && Math.abs(ev.clientX - e.clientX) < 3 && Math.abs(ev.clientY - e.clientY) < 3) return;
        moved = true;
        ev.preventDefault();
        setRange(mf, anchor, offsetAt(mf, ev.clientX, ev.clientY));
      }
      function up(ev) {
        if (ev.pointerId !== e.pointerId) return;
        mf.removeEventListener('pointermove', move, true);
        mf.removeEventListener('pointerup', up, true);
        mf.removeEventListener('pointercancel', up, true);
        try { mf.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
      }
      mf.addEventListener('pointermove', move, true);
      mf.addEventListener('pointerup', up, true);
      mf.addEventListener('pointercancel', up, true);
    }, true);
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
      attachPointer(mf);
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
