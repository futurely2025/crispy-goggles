/* PDF studio — small UI kit: modal dialogs (forms), page-range parsing, a tiny ZIP writer, and helpers shared by the
 * studio modules. No dependencies. */
(function (global) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // ------------------------------------------------------------ dialog
  /** Dlg.open({ title, body (html), ok: 'نص', cancel: 'نص'|false, wide, onOpen(el), validate(el) → string|null })
   *  → Promise<el|null>  (el = the dialog body, so the caller reads its inputs) */
  function open(o) {
    return new Promise(function (resolve) {
      var back = document.createElement('div');
      back.className = 'dlg-back';
      back.innerHTML = '<div class="dlg' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
        '<div class="dlg-h">' + esc(o.title || '') + '<button type="button" class="dlg-x" title="إغلاق">✕</button></div>' +
        '<div class="dlg-b">' + (o.body || '') + '</div><div class="dlg-err" hidden></div>' +
        '<div class="dlg-f">' + (o.extra || '') + '<span class="grow"></span>' +
        (o.cancel === false ? '' : '<button type="button" class="btn ghost" data-a="cancel">' + esc(o.cancel || 'إلغاء') + '</button>') +
        (o.ok === false ? '' : '<button type="button" class="btn primary" data-a="ok">' + esc(o.ok || 'تم') + '</button>') + '</div></div>';
      document.body.appendChild(back);
      var box = back.querySelector('.dlg-b'), err = back.querySelector('.dlg-err'), done = false;
      function close(v) {
        if (done) return; done = true;
        document.removeEventListener('keydown', key, true);
        back.remove(); resolve(v);
      }
      function ok() {
        var m = o.validate ? o.validate(box) : null;
        if (m) { err.textContent = m; err.hidden = false; return; }
        close(box);
      }
      function key(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
        else if (e.key === 'Enter' && !/TEXTAREA|SELECT|BUTTON/.test(e.target.tagName) && back.contains(e.target)) { e.preventDefault(); e.stopPropagation(); ok(); }
        else e.stopPropagation();
      }
      document.addEventListener('keydown', key, true);
      back.querySelector('.dlg-x').onclick = function () { close(null); };
      var c = back.querySelector('[data-a=cancel]'); if (c) c.onclick = function () { close(null); };
      var k = back.querySelector('[data-a=ok]'); if (k) k.onclick = ok;
      back.addEventListener('pointerdown', function (e) { if (e.target === back) close(null); });
      if (o.onOpen) o.onOpen(box, close);
      var first = box.querySelector('input:not([type=checkbox]):not([type=radio]):not([type=color]), textarea, select');
      if (first && o.focus !== false) setTimeout(function () { first.focus(); if (first.select) first.select(); }, 30);
    });
  }
  function confirmBox(msg, okText, danger) {
    return open({ title: 'تأكيد', body: '<p class="dlg-msg">' + esc(msg) + '</p>', ok: okText || 'نعم', focus: false }).then(function (el) { return !!el; });
  }
  function val(el, sel) { var x = el.querySelector(sel); return x ? (x.type === 'checkbox' ? x.checked : x.value) : null; }
  function radio(el, name) { var x = el.querySelector('input[name="' + name + '"]:checked'); return x ? x.value : null; }

  // ------------------------------------------------------------ page ranges: "1-3, 5, 8-" (1-based) → [0,1,2,4,7…]
  function parseRange(txt, max) {
    var s = String(txt || '').replace(/[٠-٩]/g, function (c) { return String(c.charCodeAt(0) - 0x660); }).replace(/[،؛\s]+/g, ',').replace(/[–—]/g, '-').trim();
    if (!s || /^(الكل|all|\*)$/i.test(s)) { var all = []; for (var i = 0; i < max; i++) all.push(i); return all; }
    var out = [], bad = null;
    s.split(',').filter(Boolean).forEach(function (part) {
      var m = part.match(/^(\d*)-(\d*)$/), a, b;
      if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : max; }
      else if (/^\d+$/.test(part)) a = b = +part;
      else { bad = part; return; }
      if (a < 1 || b > max || a > b) { bad = part; return; }
      for (var k = a; k <= b; k++) if (out.indexOf(k - 1) < 0) out.push(k - 1);
    });
    if (bad) throw new Error('نطاق غير صحيح: «' + bad + '» — الصفحات من 1 إلى ' + max);
    return out;
  }

  // ------------------------------------------------------------ ZIP (store, no compression — images are already compressed)
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  /** files: [{ name, data: Uint8Array }] → Blob (application/zip). Names are UTF-8 (flag bit 11). */
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], off = 0;
    var d = new Date(), dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.data, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, tm, true); h.setUint16(12, dt, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, tm, true); c.setUint16(14, dt, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true);
      c.setUint32(38, 0, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    var csize = central.reduce(function (a, u) { return a + u.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/zip' });
  }

  // file name safe for Windows
  function safeName(s) { return String(s || 'ملف').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'ملف'; }
  function fmtSize(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' م.ب' : Math.max(1, Math.round(n / 1024)) + ' ك.ب'; }
  function b64(u8) { var s = '', CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

  global.PdfUI = { open: open, confirm: confirmBox, val: val, radio: radio, parseRange: parseRange, zip: zip, crc32: crc32, esc: esc, safeName: safeName, fmtSize: fmtSize, b64: b64, unb64: unb64 };
})(window);
