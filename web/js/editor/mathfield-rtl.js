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
    // MathLive draws the selection box from rectangles it measured *before* this layer joined the Arabic letters and
    // flipped them (the widths change), so in text such as \text{مجموع} the box landed elsewhere. Draw our own box from
    // what is actually on screen instead; the container highlight is only mirrored.
    Array.prototype.forEach.call(content.querySelectorAll('.rtl-sel'), function (el) { el.remove(); });
    var w = content.offsetWidth;
    var mlSel = content.querySelectorAll('.ML__selection');
    Array.prototype.forEach.call(mlSel, function (el) { el.style.visibility = on ? 'hidden' : ''; });
    Array.prototype.forEach.call(content.querySelectorAll('.ML__contains-highlight'), function (el) {
      if (!on) return;
      var left = parseFloat(el.style.left), width = parseFloat(el.style.width);
      if (isNaN(left) || isNaN(width)) return;
      var key = left + '|' + width + '|' + w;
      if (el.dataset.rtlKey === key) return;
      var nl = w - left - width;
      el.style.left = nl + 'px';
      el.dataset.rtlKey = nl + '|' + width + '|' + w;
    });
    if (on && mlSel.length) drawSelection(content, mlSel[0]);
  }

  // one box per row (and per run of neighbouring atoms) over the atoms MathLive marked as selected
  function drawSelection(content, model) {
    var all = content.querySelectorAll('.ML__selected'), els = [], i;
    for (i = 0; i < all.length; i++) {
      var up = all[i].parentElement, nested = false;
      while (up && up !== content) { if (up.classList && up.classList.contains('ML__selected')) { nested = true; break; } up = up.parentElement; }
      if (!nested) els.push(all[i]);
    }
    var cr = content.getBoundingClientRect(), cw = content.offsetWidth;
    var rects = els.map(function (e) { return e.getBoundingClientRect(); }).filter(function (r) { return r.width > 0 && r.height > 0; });
    if (!rects.length) return;
    rects.sort(function (a, b) { return a.left - b.left; });
    var boxes = [];
    rects.forEach(function (r) {
      for (var j = 0; j < boxes.length; j++) {
        var q = boxes[j], mid = (r.top + r.bottom) / 2;
        if (mid > q.t && mid < q.b && r.left - q.r < 14) {   // same row, neighbouring: grow the box
          q.r = Math.max(q.r, r.right); q.t = Math.min(q.t, r.top); q.b = Math.max(q.b, r.bottom);
          return;
        }
      }
      boxes.push({ l: r.left, r: r.right, t: r.top, b: r.bottom });
    });
    var color = getComputedStyle(model).backgroundColor;
    boxes.forEach(function (q) {
      var d = document.createElement('div');
      d.className = 'rtl-sel';
      // the content is mirrored about its own centre: screen x → local x = right edge - x
      var localLeft = (cr.left + cw) - q.r;
      d.style.cssText = 'position:absolute;pointer-events:none;z-index:-1;left:' + localLeft + 'px;top:' + (q.t - cr.top - 1) +
        'px;width:' + (q.r - q.l) + 'px;height:' + (q.b - q.t + 2) + 'px;background:' + color + ';';
      content.insertBefore(d, content.firstChild);
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

  function isLeaf(el) {
    return !el.childElementCount && el.textContent.replace(ZW, '') && !/vlist-s|ML__caret|ML__selection|ML__contains-highlight/.test(el.className);
  }
  // the leaf atom (a digit, a letter, an operator…) that is drawn under the point, or else the nearest one:
  // MathLive answers "start of the formula" for a point in the gap between two atoms (operator spacing, fraction bar…)
  function leafNear(sr, x, y) {
    var els = sr.elementsFromPoint ? sr.elementsFromPoint(x, y) : [], i;
    for (i = 0; i < els.length; i++) {
      if (els[i].hasAttribute && els[i].hasAttribute('data-atom-id') && isLeaf(els[i])) return els[i];
    }
    var all = sr.querySelectorAll('.ML__content [data-atom-id]'), best = null, bd = Infinity;
    for (i = 0; i < all.length; i++) {
      if (!isLeaf(all[i])) continue;
      var r = all[i].getBoundingClientRect();
      if (!r.width) continue;
      var dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      var dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      var d = dx * dx + 4 * dy * dy;
      if (d < bd) { bd = d; best = all[i]; }
    }
    return best;
  }

  // drawn boxes of all atoms by model offset: atom k sits between caret positions k-1 and k
  function atomBoxes(mf) {
    var out = [], last = mf.lastOffset;
    for (var k = 1; k <= last; k++) {
      var info = mf.getElementInfo(k), b = info && info.bounds;
      if (b && b.width > 0 && b.height > 0) out.push({ k: k, l: b.left, r: b.right, t: b.top, b: b.bottom });
    }
    return out;
  }
  function modelOffsetOf(boxes, r) {
    // MathLive reports boxes a pixel or two off the DOM rectangles (more when an atom is selected), so match loosely
    var best = -1, bd = 1e9, cy = (r.top + r.bottom) / 2;
    for (var i = 0; i < boxes.length; i++) {
      var q = boxes[i];
      if (Math.abs((q.r - q.l) - r.width) > 5 || Math.abs((q.b - q.t) - r.height) > 8) continue;
      var d = Math.abs(q.l - r.left) + Math.abs(q.r - r.right) + Math.abs((q.t + q.b) / 2 - cy);
      if (d < bd) { bd = d; best = q.k; }
    }
    return bd <= 8 ? best : -1;
  }

  // logical offset (0…lastOffset) the caret should take for a pointer at screen point (x, y) in a mirrored formula.
  // ctx caches the atom boxes while a drag is in progress. MathLive's getOffsetFromPoint is not used for the answer:
  // it returns the end of the selection when a selection already exists, which broke dragging.
  function offsetAt(mf, x, y, ctx) {
    var sr = mf.shadowRoot, latex = sr.querySelector('.ML__latex');
    if (!latex) return mf.position;
    var n = latex.getBoundingClientRect();
    if (n.width === 0) return mf.position;
    y = clamp(y, n.top + 2, Math.max(n.top + 2, n.bottom - 2));
    // the formula starts at its right end: the empty space to the right is "before everything", to the left "after"
    if (x >= n.right) return 0;
    if (x <= n.left) return mf.lastOffset;
    var el = leafNear(sr, x, y);
    if (!el) return mf.position;
    var r = el.getBoundingClientRect();
    var boxes = (ctx && ctx.boxes) || atomBoxes(mf);
    if (ctx) ctx.boxes = boxes;
    var k = modelOffsetOf(boxes, r);
    if (k < 0) {
      // not a plain atom (e.g. the big bracket of a matrix): let MathLive look it up, aiming at the wanted half
      var wx = r.left + r.width * (clamp(x, r.left, r.right) > (r.left + r.right) / 2 ? 0.25 : 0.75);
      var o = mf.getOffsetFromPoint(wx, clamp(y, r.top + 0.5, r.bottom - 0.5), { bias: 0 });
      return o < 0 ? mf.position : o;
    }
    // in the mirrored formula the right half of an atom is its "before" side
    return clamp(x, r.left, r.right) > (r.left + r.right) / 2 ? k - 1 : k;
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
      var ctx = {};
      var hit = offsetAt(mf, e.clientX, e.clientY, ctx);
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
        setRange(mf, anchor, offsetAt(mf, ev.clientX, ev.clientY, ctx));
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
    refresh: apply,
    offsetAt: offsetAt
  };
  global.MathFieldRTL = MathFieldRTL;
})(window);
