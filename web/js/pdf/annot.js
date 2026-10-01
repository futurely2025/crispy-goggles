/* PdfAnnot — Acrobat-class tools on top of the studio (5.9):
 *   · text markup: highlight / underline / strikeout / squiggly on the selected text (with a floating bar + comments)
 *   · redaction: boxes + "redact by search" (email, phone, numbers, any text or RegExp); at save the page is re-drawn as a picture
 *     with the boxes burned in, so the text under them is gone for good
 *   · links (web page, page of the file, e-mail) saved as real PDF link annotations
 *   · form fields (text, check box, radio, drop-down, list, button) saved as a real AcroForm
 *   · signatures & initials (draw / type / picture), saved on this device
 *   · comments panel, bookmarks (outline) panel, document properties
 *   · a ribbon with tabs (Home · Comment · Forms & sign · Protect) */
(function () {
  'use strict';
  var P = window.__pdf, S = P.S, $ = function (id) { return document.getElementById(id); };
  var UI = window.PdfUI, esc = UI.esc;
  function f2(n) { return Math.round(n * 100) / 100; }
  function each(l, fn) { Array.prototype.forEach.call(l, fn); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  var SVGNS = 'http://www.w3.org/2000/svg';
  S.deco = S.deco || {};
  function deco() { S.deco = S.deco || {}; return S.deco; }

  // ================================================================ object rendering
  var REGION = { ocr: 1, edittext: 1, redact: 1, link: 1, ftext: 1, fcheck: 1, fradio: 1, fcombo: 1, flist: 1, fbtn: 1, fsig: 1 };
  var FIELD_LABEL = { text: 'حقل نص', check: 'مربع اختيار', radio: 'زر خيار', combo: 'قائمة منسدلة', list: 'قائمة', button: 'زر', sig: 'حقل توقيع' };
  var FIELD_ICON = { text: 'Aa', check: '☑', radio: '◉', combo: '▾', list: '☰', button: '▭', sig: '✍' };
  function inner(o, data, exporting) {
    var out = '', export_ = data || exporting;
    switch (o.t) {
      case 'mark':
        (o.rects || []).forEach(function (r) {
          if (o.mk === 'hl') out += '<rect x="' + f2(r.x) + '" y="' + f2(r.y) + '" width="' + f2(r.w) + '" height="' + f2(r.h) + '" fill="' + o.color + '" fill-opacity="0.38" rx="1.5"/>';
          else if (o.mk === 'ul') out += '<line x1="' + f2(r.x) + '" y1="' + f2(r.y + r.h * 0.94) + '" x2="' + f2(r.x + r.w) + '" y2="' + f2(r.y + r.h * 0.94) + '" stroke="' + o.color + '" stroke-width="1.3" stroke-linecap="round"/>';
          else if (o.mk === 'st') out += '<line x1="' + f2(r.x) + '" y1="' + f2(r.y + r.h * 0.55) + '" x2="' + f2(r.x + r.w) + '" y2="' + f2(r.y + r.h * 0.55) + '" stroke="' + o.color + '" stroke-width="1.3" stroke-linecap="round"/>';
          else if (o.mk === 'sq') { var y = r.y + r.h * 0.94, d = 'M' + f2(r.x) + ' ' + f2(y); for (var x = r.x, k = 0; x < r.x + r.w; x += 2.2, k++) d += 'L' + f2(Math.min(x + 2.2, r.x + r.w)) + ' ' + f2(y + (k % 2 ? 0 : 2.4)); out += '<path d="' + d + '" fill="none" stroke="' + o.color + '" stroke-width="1" stroke-linejoin="round"/>'; }
        });
        if (!export_) { (o.rects || []).forEach(function (r) { out += '<rect x="' + f2(r.x) + '" y="' + f2(r.y) + '" width="' + f2(r.w) + '" height="' + f2(r.h) + '" fill="transparent"/>'; }); }
        if (!export_ && o.c) out = '<g><title>' + esc(o.c) + '</title>' + out + '</g>';
        return out;
      case 'redact':
        if (export_) return o.soft ? '<rect x="' + f2(o.x) + '" y="' + f2(o.y) + '" width="' + f2(o.w) + '" height="' + f2(o.h) + '" fill="' + (o.fc || '#fff') + '"/>' : '';
        var solid = S.redPrev || o.cover;
        out = '<rect x="' + f2(o.x) + '" y="' + f2(o.y) + '" width="' + f2(o.w) + '" height="' + f2(o.h) + '" fill="' + (o.fc || '#000') + '" fill-opacity="' + (solid ? 1 : 0.34) + '"' + (o.cover ? '' : ' stroke="#c2352b" stroke-width="1.2" stroke-dasharray="' + (solid ? '0' : '5 3') + '"') + '/>';
        if (o.label) out += '<text x="' + f2(o.x + o.w / 2) + '" y="' + f2(o.y + o.h / 2 + 4) + '" text-anchor="middle" font-size="' + f2(Math.max(7, Math.min(14, o.h * 0.6))) + '" fill="#fff" font-family="Amiri, serif">' + esc(o.label) + '</text>';
        return out;
      case 'link':
        if (export_) return '';
        return '<rect x="' + f2(o.x) + '" y="' + f2(o.y) + '" width="' + f2(o.w) + '" height="' + f2(o.h) + '" fill="#1f5fbf" fill-opacity="0.08" stroke="#1f5fbf" stroke-width="1" stroke-dasharray="4 3"/>' +
          '<text x="' + f2(o.x + 3) + '" y="' + f2(o.y + Math.min(o.h - 2, 11)) + '" font-size="9" fill="#1f5fbf">🔗 ' + esc(o.kind === 'url' ? (o.url || '').slice(0, 30) : o.kind === 'mail' ? o.url : 'صفحة ' + ((pageIndex(o.pid) + 1) || '?')) + '</text>';
      case 'field':
        if (export_) return '';
        var ic = FIELD_ICON[o.fk] || '▭';
        return '<rect x="' + f2(o.x) + '" y="' + f2(o.y) + '" width="' + f2(o.w) + '" height="' + f2(o.h) + '" rx="' + (o.fk === 'radio' ? f2(Math.min(o.w, o.h) / 2) : 2) + '" fill="#e8f1ff" fill-opacity="0.85" stroke="#5b8def" stroke-width="1"/>' +
          '<text x="' + f2(o.x + 4) + '" y="' + f2(o.y + Math.min(o.h - 3, 12)) + '" font-size="' + f2(Math.max(6, Math.min(11, o.h * 0.5))) + '" fill="#2a4f9a" font-family="Tahoma, sans-serif">' + ic + ' ' + esc(o.name || '') + (o.value ? ' = ' + esc(String(o.value).slice(0, 20)) : '') + (o.req ? ' *' : '') + '</text>';
    }
    return null;
  }
  function bbox(o) {
    if (o.t === 'mark') {
      var xs = [], ys = [], x1 = [], y1 = [];
      (o.rects || []).forEach(function (r) { xs.push(r.x); ys.push(r.y); x1.push(r.x + r.w); y1.push(r.y + r.h); });
      if (!xs.length) return { x: 0, y: 0, w: 0, h: 0 };
      var a = Math.min.apply(null, xs), b = Math.min.apply(null, ys);
      return { x: a, y: b, w: Math.max.apply(null, x1) - a, h: Math.max.apply(null, y1) - b };
    }
    return null;
  }
  function move(o, g, dx, dy) { if (o.t === 'mark') o.rects = g.rects.map(function (r) { return { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }; }); }
  function pageIndex(pid) { for (var k = 0; k < S.pages.length; k++) if (S.pages[k].id === pid) return k; return -1; }

  // ================================================================ region tools (redact, link, form fields)
  function isTool(t) { return !!REGION[t]; }
  var seq = { ftext: 0, fcheck: 0, fradio: 0, fcombo: 0, flist: 0, fbtn: 0, fsig: 0 };
  function nextName(prefix, fk) { var all = []; S.pages.forEach(function (p) { p.objs.forEach(function (o) { if (o.t === 'field') all.push(o.name); }); }); var n = 1; while (all.indexOf(prefix + n) >= 0) n++; return prefix + n; }
  function region(tool, i, r) {
    var p = S.pages[i], click = r.w < 5 && r.h < 5;
    var o;
    if (tool === 'ocr') { if (window.PdfOcr) PdfOcr.run(i, r); return; }
    if (tool === 'edittext') { editTextRegion(i, r); return; }
    if (tool === 'redact') { if (click) return; o = { id: P.uid(), t: 'redact', x: r.x, y: r.y, w: r.w, h: r.h, fc: '#000000', label: '' }; }
    else if (tool === 'link') { if (click) { r = { x: r.x - 60, y: r.y - 8, w: 120, h: 18 }; } o = { id: P.uid(), t: 'link', x: r.x, y: r.y, w: Math.max(12, r.w), h: Math.max(10, r.h), kind: 'url', url: '', pid: p.id }; }
    else {
      var fk = { ftext: 'text', fcheck: 'check', fradio: 'radio', fcombo: 'combo', flist: 'list', fbtn: 'button', fsig: 'sig' }[tool];
      var sq = fk === 'check' || fk === 'radio';
      var w = click ? (sq ? 16 : fk === 'list' ? 140 : fk === 'sig' ? 180 : 150) : r.w, h = click ? (sq ? 16 : fk === 'list' ? 70 : fk === 'sig' ? 50 : fk === 'button' ? 26 : 22) : r.h;
      if (sq) { var m = Math.max(12, Math.min(w, h)); w = h = m; }
      var px = click ? r.x - w / 2 : r.x, py = click ? r.y - h / 2 : r.y;
      o = { id: P.uid(), t: 'field', fk: fk, x: px, y: py, w: w, h: h, name: nextName({ text: 'نص', check: 'اختيار', radio: 'خيار', combo: 'قائمة', list: 'سرد', button: 'زر', sig: 'توقيع' }[fk] + '_', fk), value: fk === 'button' ? 'زر' : '', opts: fk === 'combo' || fk === 'list' ? ['الخيار 1', 'الخيار 2', 'الخيار 3'] : [], size: 12, req: false, ro: false, ml: fk === 'text' && h > 40, grp: fk === 'radio' ? 'المجموعة_1' : '' };
    }
    P.push(); p.objs.push(o); P.setTool('select'); P.select(i, o.id); P.changed(); P.markThumb(i);
    if (o.t === 'link') editLink(i, o, true); else if (o.t === 'field') editField(i, o, true);
    else if (o.t === 'redact') editRedact(i, o, true);
  }
  function dbl(i, o) {
    if (o.t === 'link') editLink(i, o); else if (o.t === 'field') editField(i, o); else if (o.t === 'redact') editRedact(i, o); else if (o.t === 'mark') editMark(i, o);
  }
  function opt(v, label, sel) { return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(label) + '</option>'; }
  function editLink(i, o, isNew) {
    var pages = S.pages.map(function (p, k) { return opt(p.id, 'صفحة ' + (k + 1), p.id === o.pid); }).join('');
    UI.open({
      title: 'رابط', body:
        '<div class="fld"><span>نوع الرابط</span><select id="lk"><option value="url"' + (o.kind === 'url' ? ' selected' : '') + '>صفحة ويب (URL)</option><option value="page"' + (o.kind === 'page' ? ' selected' : '') + '>صفحة داخل هذا الملف</option><option value="mail"' + (o.kind === 'mail' ? ' selected' : '') + '>بريد إلكتروني</option></select></div>' +
        '<label class="fld" id="lkUrlF"><span id="lkUrlL">العنوان</span><input id="lkUrl" dir="ltr" value="' + esc(o.url || '') + '" placeholder="https://"></label>' +
        '<label class="fld" id="lkPgF"><span>الانتقال إلى</span><select id="lkPg">' + pages + '</select></label>',
      ok: 'حفظ', extra: isNew ? '' : '<button type="button" class="btn ghost danger" data-a="del">حذف الرابط</button>',
      onOpen: function (el, close) {
        var sync = function () { var k = el.querySelector('#lk').value; el.querySelector('#lkUrlF').style.display = k === 'page' ? 'none' : ''; el.querySelector('#lkPgF').style.display = k === 'page' ? '' : 'none'; el.querySelector('#lkUrlL').textContent = k === 'mail' ? 'البريد' : 'العنوان'; el.querySelector('#lkUrl').placeholder = k === 'mail' ? 'name@example.com' : 'https://'; };
        el.querySelector('#lk').onchange = sync; sync();
        var d = el.parentNode.querySelector('[data-a=del]'); if (d) d.onclick = function () { close(null); remove(i, o); };
      },
      validate: function (el) { var k = el.querySelector('#lk').value, u = el.querySelector('#lkUrl').value.trim(); if (k === 'url' && !/^[a-z][a-z0-9+.-]*:\/\//i.test(u) && u) return 'اكتب العنوان كاملاً مع https://'; if (k !== 'page' && !u) return 'اكتب العنوان'; return null; }
    }).then(function (el) {
      if (!el) { if (isNew && !o.url && o.kind !== 'page') remove(i, o, true); return; }
      if (!isNew) P.push();
      o.kind = el.querySelector('#lk').value; o.url = el.querySelector('#lkUrl').value.trim(); o.pid = el.querySelector('#lkPg').value;
      P.changed(); P.drawOverlay(i);
    });
  }
  function editRedact(i, o, isNew) {
    UI.open({ title: 'منطقة تنقيح', body: '<label class="fld"><span>نص يظهر داخل المربع الأسود (اختياري)</span><input id="rl" value="' + esc(o.label || '') + '" placeholder="مثال: محجوب"></label>' +
      '<div class="fld row"><span>لون المربع</span><span class="sw"><label><input type="radio" name="rc" value="#000000"' + (o.fc !== '#ffffff' ? ' checked' : '') + '><i style="background:#000"></i></label><label><input type="radio" name="rc" value="#ffffff"' + (o.fc === '#ffffff' ? ' checked' : '') + '><i style="background:#fff;border:1px solid #999"></i></label></span></div>' +
      '<p class="dlg-note">عند «حفظ PDF» تُحوَّل الصفحة التي فيها تنقيح إلى صورة تُطمَس فيها هذه المناطق نهائياً، فلا يمكن استرجاع النص تحتها.</p>',
      ok: 'حفظ', extra: '<button type="button" class="btn ghost danger" data-a="del">حذف</button>',
      onOpen: function (el, close) { var d = el.parentNode.querySelector('[data-a=del]'); d.onclick = function () { close(null); remove(i, o); }; }
    }).then(function (el) { if (!el) return; if (!isNew) P.push(); o.label = el.querySelector('#rl').value.trim(); o.fc = UI.radio(el, 'rc') || '#000000'; P.changed(); P.drawOverlay(i); });
  }
  function remove(i, o, silent) { var p = S.pages[i]; if (!silent) P.push(); else S.undo.pop(); p.objs = p.objs.filter(function (x) { return x !== o; }); S.sel = null; P.drawOverlay(i); P.markThumb(i); P.changed(); }
  function editField(i, o, isNew) {
    var fk = o.fk, hasOpts = fk === 'combo' || fk === 'list';
    UI.open({
      title: FIELD_LABEL[fk], body:
        '<label class="fld"><span>اسم الحقل (فريد)</span><input id="fn" dir="auto" value="' + esc(o.name) + '"></label>' +
        (fk === 'radio' ? '<label class="fld"><span>المجموعة (أزرار الخيار بنفس الاسم يختار منها واحد فقط)</span><input id="fg" dir="auto" value="' + esc(o.grp || '') + '"></label>' : '') +
        (fk === 'button' ? '<label class="fld"><span>نص الزر</span><input id="fv" dir="auto" value="' + esc(o.value || '') + '"></label>' :
          fk === 'check' || fk === 'radio' ? '<label class="chk"><input type="checkbox" id="fv"' + (o.value ? ' checked' : '') + '> محدد افتراضياً</label>' :
            '<label class="fld"><span>القيمة الافتراضية</span><input id="fv" dir="auto" value="' + esc(o.value || '') + '"></label>') +
        (hasOpts ? '<label class="fld"><span>الخيارات — واحد في كل سطر</span><textarea id="fo" rows="4" dir="auto">' + esc((o.opts || []).join('\n')) + '</textarea></label>' : '') +
        (fk === 'text' || hasOpts ? '<label class="fld"><span>حجم الخط (0 = تلقائي)</span><input id="fs" type="number" min="0" max="48" value="' + (o.size || 12) + '"></label>' : '') +
        (fk === 'text' ? '<label class="chk"><input type="checkbox" id="fm"' + (o.ml ? ' checked' : '') + '> أسطر متعددة</label>' : '') +
        '<label class="chk"><input type="checkbox" id="fr"' + (o.req ? ' checked' : '') + '> مطلوب</label><label class="chk"><input type="checkbox" id="fz"' + (o.ro ? ' checked' : '') + '> للقراءة فقط</label>' +
        '<p class="dlg-note">تُحفظ الحقول حقولاً تفاعلية حقيقية في ملف PDF تُملأ في Acrobat وأي قارئ.</p>',
      ok: 'حفظ', extra: '<button type="button" class="btn ghost danger" data-a="del">حذف الحقل</button>',
      onOpen: function (el, close) { el.parentNode.querySelector('[data-a=del]').onclick = function () { close(null); remove(i, o); }; },
      validate: function (el) { var n = el.querySelector('#fn').value.trim(); if (!n) return 'اكتب اسماً للحقل'; var dup = false; S.pages.forEach(function (p) { p.objs.forEach(function (x) { if (x !== o && x.t === 'field' && x.name === n && !(x.fk === 'radio' && o.fk === 'radio')) dup = true; }); }); return dup ? 'يوجد حقل بنفس الاسم' : null; }
    }).then(function (el) {
      if (!el) return;
      if (!isNew) P.push();
      o.name = el.querySelector('#fn').value.trim();
      var v = el.querySelector('#fv'); if (v) o.value = v.type === 'checkbox' ? v.checked : v.value;
      if (el.querySelector('#fg')) o.grp = el.querySelector('#fg').value.trim();
      if (el.querySelector('#fo')) o.opts = el.querySelector('#fo').value.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (el.querySelector('#fs')) o.size = +el.querySelector('#fs').value || 0;
      if (el.querySelector('#fm')) o.ml = el.querySelector('#fm').checked;
      o.req = el.querySelector('#fr').checked; o.ro = el.querySelector('#fz').checked;
      P.changed(); P.drawOverlay(i);
    });
  }


  // ================================================================ edit existing text (cover + retype)
  function pageCanvas(i) { var el = P.pageEl(i); return el && el.querySelector('canvas.pdf, canvas'); }
  function sampleColors(i, r) {
    var cv = pageCanvas(i), p = S.pages[i]; if (!cv || !cv.width) return { bg: '#ffffff', ink: '#000000' };
    var k = cv.width / (P.cropOf(p).w ? p.w : p.w), g = cv.getContext('2d'); if (!g) return { bg: '#ffffff', ink: '#000000' };
    try {
      var x0 = Math.max(0, Math.round(r.x * k)), y0 = Math.max(0, Math.round(r.y * k)), w = Math.max(2, Math.min(cv.width - x0, Math.round(r.w * k))), h = Math.max(2, Math.min(cv.height - y0, Math.round(r.h * k)));
      var d = g.getImageData(x0, y0, w, h).data, hist = {}, best = null, dark = null, dl = 999;
      for (var q = 0; q < d.length; q += 4) { var key = d[q] + ',' + d[q + 1] + ',' + d[q + 2]; hist[key] = (hist[key] || 0) + 1; var lum = d[q] * 0.3 + d[q + 1] * 0.59 + d[q + 2] * 0.11; if (lum < dl) { dl = lum; dark = [d[q], d[q + 1], d[q + 2]]; } }
      var bk = Object.keys(hist).sort(function (a, b) { return hist[b] - hist[a]; })[0].split(',').map(Number);
      var hex = function (a) { return '#' + a.map(function (v) { return ('0' + Math.max(0, Math.min(255, v)).toString(16)).slice(-2); }).join(''); };
      return { bg: hex(bk), ink: dl < 120 ? hex(dark) : '#000000' };
    } catch (e) { return { bg: '#ffffff', ink: '#000000' }; }
  }
  function editTextRegion(i, r) {
    var p = S.pages[i];
    if (p.src < 0) return P.toast('هذه صفحة فارغة — استخدم أداة النص لإضافة نص');
    if (r.w < 4 && r.h < 4) { r = { x: r.x - 3, y: r.y - 6, w: 6, h: 12 }; var click = true; }
    P.toast('جارٍ قراءة النص…');
    PdfText.pageText(p).then(function (t) {
      return P.loadSrc(p).then(function (pg) {
        var vp = pg.getViewport({ scale: 1, rotation: (pg.rotate + p.rot) % 360 }), items = [];
        t.items.forEach(function (it, idx) {
          if (!it.str || !it.str.trim()) return;
          var tr = it.transform, fh = Math.hypot(tr[2], tr[3]) || 10, w = it.width || fh * it.str.length * 0.5;
          var q = vp.convertToViewportRectangle([tr[4], tr[5] - fh * 0.25, tr[4] + w, tr[5] + fh * 0.95]);
          var b = { x: Math.min(q[0], q[2]), y: Math.min(q[1], q[3]), w: Math.abs(q[2] - q[0]), h: Math.abs(q[3] - q[1]), s: it.str, idx: idx, fh: fh };
          var ox = Math.max(0, Math.min(b.x + b.w, r.x + r.w) - Math.max(b.x, r.x)), oy = Math.max(0, Math.min(b.y + b.h, r.y + r.h) - Math.max(b.y, r.y));
          if (ox * oy > 0.35 * b.w * b.h || (click && ox > 0 && oy > 0)) items.push(b);
        });
        if (!items.length) { P.toast('لا يوجد نص قابل للتحرير هنا — الصفحة مصوّرة؟ استخدم «تغطية» ثم «نص»', true); return; }
        // lines top → bottom; inside a line in reading order (right → left for Arabic)
        items.sort(function (a, b) { return a.y - b.y; });
        var lines = [];
        items.forEach(function (b) { var l = lines.filter(function (L) { return Math.abs(L.cy - (b.y + b.h / 2)) < Math.max(L.h, b.h) * 0.5; })[0]; if (l) { l.items.push(b); l.cy = (l.cy * (l.items.length - 1) + b.y + b.h / 2) / l.items.length; l.h = Math.max(l.h, b.h); } else lines.push({ cy: b.y + b.h / 2, h: b.h, items: [b] }); });
        var ar = items.filter(function (b) { return /[؀-ۿ]/.test(b.s); }).length > items.length / 2;
        var text = lines.map(function (L) { L.items.sort(function (a, b) { return ar ? b.x - a.x : a.x - b.x; }); var s = ''; L.items.forEach(function (b, k) { s += (k && !/\s$/.test(s) ? ' ' : '') + b.s; }); return s.trim(); }).join('\n');
        var x0 = Math.min.apply(null, items.map(function (b) { return b.x; })), y0 = Math.min.apply(null, items.map(function (b) { return b.y; })), x1 = Math.max.apply(null, items.map(function (b) { return b.x + b.w; })), y1 = Math.max.apply(null, items.map(function (b) { return b.y + b.h; }));
        var pad = 1.5, box = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
        var size = Math.max(7, Math.round(items.reduce(function (a, b) { return a + b.fh; }, 0) / items.length * 0.95));
        var col = sampleColors(i, box);
        return UI.open({ title: 'تحرير النص الموجود', body: '<p class="dlg-note">سيُغطّى النص الأصلي بلون الخلفية ويُكتب نص جديد مكانه. اختر كيف يُعامل الأصل:</p><div class="radios"><label><input type="radio" name="em" value="cover" checked> تغطية فقط (سريع، يبقى النص الأصلي مخفياً داخل الملف)</label><label><input type="radio" name="em" value="burn"> حذف نهائي (تُحوَّل الصفحة عند الحفظ إلى صورة 200 dpi)</label></div>', ok: 'تحرير' }).then(function (el) {
          if (!el) return;
          P.push();
          var burn = UI.radio(el, 'em') === 'burn';
          var cover = { id: P.uid(), t: 'redact', x: box.x, y: box.y, w: box.w, h: box.h, fc: col.bg, label: '', cover: true, soft: !burn };
          if (!burn) P.born(cover);
          var o = P.born({ id: P.uid(), t: 'text', x: box.x - 2, y: box.y - 1, w: Math.max(40, box.w + 8), text: text, size: size, color: col.ink, bold: false, align: ar ? 'right' : 'left', bg: 'none', font: ar ? 'Amiri' : 'Times New Roman', lh: 1.25 });
          o.h = P.textHeight(o);
          p.objs.push(cover, o); P.changed(); P.markThumb(i); P.drawOverlay(i); P.setTool('select'); P.select(i, o.id);
          setTimeout(function () { P.editText(i, o); }, 60);
        });
      });
    }).catch(function (e) { P.toast('تعذّر قراءة النص: ' + (e && e.message), true); });
  }

  // ================================================================ text markup (floating bar over a text selection)
  var HLC = [['#ffe066', 'أصفر'], ['#b2f2bb', 'أخضر'], ['#a5d8ff', 'أزرق'], ['#ffc9c9', 'وردي'], ['#e599f7', 'بنفسجي']];
  var mkBar = null;
  function selRects() {
    var sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    var rg = sel.getRangeAt(0), raw = Array.prototype.slice.call(rg.getClientRects()).filter(function (r) { return r.width > 1.5 && r.height > 3; });
    if (!raw.length) return null;
    var pages = {};
    raw.forEach(function (r) {
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2, el = document.elementFromPoint(cx, cy), pg = null;
      var all = document.querySelectorAll('.page');
      for (var k = 0; k < all.length; k++) { var b = all[k].getBoundingClientRect(); if (cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) { pg = all[k]; break; } }
      if (!pg) return;
      var i = +pg.dataset.i, sv = pg.querySelector('svg.ov'), m = sv.getScreenCTM(); if (!m) return;
      var inv = m.inverse(), a = sv.createSVGPoint(), b = sv.createSVGPoint(); a.x = r.left; a.y = r.top; b.x = r.right; b.y = r.bottom;
      var A = a.matrixTransform(inv), B = b.matrixTransform(inv);
      (pages[i] = pages[i] || []).push({ x: Math.min(A.x, B.x), y: Math.min(A.y, B.y), w: Math.abs(B.x - A.x), h: Math.abs(B.y - A.y) });
    });
    Object.keys(pages).forEach(function (i) {                       // merge neighbouring boxes of one line
      var l = pages[i].sort(function (p, q) { return p.y - q.y || p.x - q.x; }), out = [];
      l.forEach(function (r) {
        var last = out[out.length - 1];
        if (last && Math.abs(last.y - r.y) < Math.max(last.h, r.h) * 0.5 && r.x <= last.x + last.w + 3 && r.x + r.w >= last.x - 3) { var x0 = Math.min(last.x, r.x), x1 = Math.max(last.x + last.w, r.x + r.w), y0 = Math.min(last.y, r.y), y1 = Math.max(last.y + last.h, r.y + r.h); last.x = x0; last.w = x1 - x0; last.y = y0; last.h = y1 - y0; }
        else out.push({ x: r.x, y: r.y, w: r.w, h: r.h });
      });
      pages[i] = out;
    });
    return pages;
  }
  function applyMark(mk, color) {
    var pages = selRects();
    if (!pages) { P.toast('حدّد نصاً أولاً بأداة «تحديد نص» (يعمل في الملفات النصية)', true); return false; }
    P.push();
    var first = null;
    Object.keys(pages).forEach(function (i) {
      var o = P.born({ id: P.uid(), t: 'mark', mk: mk, rects: pages[i], color: color || '#ffe066', c: '' });
      S.pages[+i].objs.push(o); P.markThumb(+i); P.drawOverlay(+i); if (!first) first = [+i, o];
    });
    window.getSelection().removeAllRanges(); hideBar(); P.changed();
    return first;
  }
  function showBar() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || S.tool !== 'textsel' || !sel.rangeCount) { hideBar(); return; }
    var rg = sel.getRangeAt(0), rs = rg.getClientRects(); if (!rs.length) return;
    var last = rs[rs.length - 1];
    if (!mkBar) {
      mkBar = document.createElement('div'); mkBar.className = 'mkbar'; mkBar.setAttribute('role', 'toolbar');
      mkBar.innerHTML = HLC.map(function (c) { return '<button type="button" class="mk-c" data-mk="hl" data-c="' + c[0] + '" title="تظليل ' + c[1] + '" style="background:' + c[0] + '"></button>'; }).join('') +
        '<span class="sp"></span><button type="button" data-mk="ul" title="تسطير"><u>U</u></button><button type="button" data-mk="st" title="شطب"><s>S</s></button><button type="button" data-mk="sq" title="خط متموج">≈</button>' +
        '<span class="sp"></span><button type="button" data-mk="copy" title="نسخ النص">⧉</button>';
      document.body.appendChild(mkBar);
      mkBar.addEventListener('mousedown', function (e) { e.preventDefault(); });
      mkBar.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return; var k = b.dataset.mk;
        if (k === 'copy') { document.execCommand('copy'); P.toast('نُسخ النص'); return; }
        var col = b.dataset.c || (k === 'ul' ? '#1f5fbf' : k === 'st' ? '#c2352b' : '#c2352b');
        var r = applyMark(k, col); if (r) { P.select(r[0], r[1].id); }
      });
    }
    mkBar.hidden = false; mkBar.style.left = Math.max(8, Math.min(window.innerWidth - 270, last.left - 90)) + 'px'; mkBar.style.top = Math.min(window.innerHeight - 50, last.bottom + 8) + 'px';
  }
  function hideBar() { if (mkBar) mkBar.hidden = true; }
  document.addEventListener('mouseup', function () { setTimeout(showBar, 10); });
  document.addEventListener('mousedown', function (e) { if (mkBar && !mkBar.hidden && !mkBar.contains(e.target)) hideBar(); });
  function editMark(i, o) {
    UI.open({ title: 'تعليق على التحديد', body: '<textarea id="mc" rows="4" dir="auto" placeholder="اكتب تعليقاً (يظهر عند المرور بالمؤشر وفي قائمة التعليقات)">' + esc(o.c || '') + '</textarea>', ok: 'حفظ',
      extra: '<button type="button" class="btn ghost danger" data-a="del">حذف التحديد</button>', onOpen: function (el, close) { el.parentNode.querySelector('[data-a=del]').onclick = function () { close(null); remove(i, o); }; } })
      .then(function (el) { if (!el) return; P.push(); o.c = el.querySelector('#mc').value.trim(); P.changed(); P.drawOverlay(i); renderComments(); });
  }

  // ================================================================ signatures & initials
  var SIGKEY = 'armath.pdf.sigs';
  function loadSigs() { try { return JSON.parse(localStorage.getItem(SIGKEY) || '[]') || []; } catch (e) { return []; } }
  function saveSigs(l) { try { localStorage.setItem(SIGKEY, JSON.stringify(l.slice(0, 8))); } catch (e) { P.toast('تعذّر حفظ التوقيع على هذا الجهاز', true); } }
  function trim(cv) {
    var g = cv.getContext('2d'), w = cv.width, h = cv.height, d = g.getImageData(0, 0, w, h).data, x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0 || y1 <= y0) return null;
    var pad = 6, out = document.createElement('canvas'); out.width = x1 - x0 + 1 + pad * 2; out.height = y1 - y0 + 1 + pad * 2;
    out.getContext('2d').drawImage(cv, x0, y0, x1 - x0 + 1, y1 - y0 + 1, pad, pad, x1 - x0 + 1, y1 - y0 + 1);
    return out;
  }
  function signDialog(kind) {
    if (!S.pdf) return P.toast('افتح ملف PDF أولاً');
    var label = kind === 'init' ? 'الأحرف الأولى' : 'التوقيع', saved = loadSigs().filter(function (s) { return (s.kind || 'sig') === kind; });
    var mode = 'draw', strokes = [], color = '#0b2a6f', drawing = null, cv, cx;
    UI.open({
      title: label, wide: true, ok: 'إدراج في الصفحة', body:
        (saved.length ? '<div class="fld"><span>المحفوظة على هذا الجهاز</span><div class="sigsaved" id="sgSaved">' + saved.map(function (s) { return '<button type="button" class="sgs" data-id="' + s.id + '" title="استخدام"><img src="' + s.data + '" alt=""><i data-del="' + s.id + '" title="حذف">✕</i></button>'; }).join('') + '</div></div>' : '') +
        '<div class="sgtabs" id="sgTabs"><button type="button" data-m="draw" aria-pressed="true">✍ رسم</button><button type="button" data-m="type" aria-pressed="false">Aa كتابة</button><button type="button" data-m="img" aria-pressed="false">🖼 صورة</button></div>' +
        '<div id="sgDraw"><canvas id="sgCv" width="640" height="200" class="sgcv"></canvas><div class="sgbar"><span>اللون</span>' + ['#0b2a6f', '#000000', '#c2352b', '#1f8a4c'].map(function (c) { return '<button type="button" class="sgcol" data-c="' + c + '" style="background:' + c + '" aria-pressed="' + (c === color) + '"></button>'; }).join('') + '<button type="button" class="btn ghost" id="sgClear">مسح</button></div></div>' +
        '<div id="sgType" hidden><input id="sgText" dir="auto" placeholder="اكتب اسمك" style="font-size:22px"><div class="sgfonts" id="sgFonts">' + [['Amiri', 'أميري'], ['Scheherazade New', 'شهرزاد'], ['Noto Naskh Arabic', 'نسخ'], ['Noto Kufi Arabic', 'كوفي'], ['Cairo', 'القاهرة'], ['Times New Roman', 'Times']].map(function (f, k) { return '<button type="button" data-f="' + f[0] + '" aria-pressed="' + (k === 0) + '" style="font-family:\'' + f[0] + '\';font-style:italic">' + f[1] + '</button>'; }).join('') + '</div><canvas id="sgTv" width="640" height="140" class="sgcv"></canvas></div>' +
        '<div id="sgImg" hidden><input type="file" id="sgFile" accept="image/*"><p class="dlg-note">يُحوَّل لون الخلفية الفاتح إلى شفاف تلقائياً.</p><canvas id="sgIv" width="640" height="200" class="sgcv"></canvas></div>' +
        '<label class="chk"><input type="checkbox" id="sgSave" checked> احفظ على هذا الجهاز لاستخدامه لاحقاً</label>',
      onOpen: function (el, close) {
        cv = el.querySelector('#sgCv'); cx = cv.getContext('2d');
        var fontSel = 'Amiri', typed = null, imgc = null;
        function redraw() { cx.clearRect(0, 0, cv.width, cv.height); cx.lineCap = cx.lineJoin = 'round'; cx.strokeStyle = color; cx.lineWidth = 3.4; strokes.forEach(function (s) { cx.beginPath(); s.forEach(function (p, k) { if (k === 0) cx.moveTo(p[0], p[1]); else { var q = s[k - 1]; cx.quadraticCurveTo(q[0], q[1], (q[0] + p[0]) / 2, (q[1] + p[1]) / 2); } }); if (s.length === 1) cx.lineTo(s[0][0] + 0.1, s[0][1]); cx.stroke(); }); }
        function pos(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; }
        cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); drawing = [pos(e)]; strokes.push(drawing); redraw(); });
        cv.addEventListener('pointermove', function (e) { if (!drawing) return; drawing.push(pos(e)); redraw(); });
        cv.addEventListener('pointerup', function () { drawing = null; });
        el.querySelector('#sgClear').onclick = function () { strokes = []; redraw(); };
        each(el.querySelectorAll('.sgcol'), function (b) { b.onclick = function () { color = b.dataset.c; each(el.querySelectorAll('.sgcol'), function (x) { x.setAttribute('aria-pressed', String(x === b)); }); redraw(); }; });
        function drawTyped() { var tv = el.querySelector('#sgTv'), g = tv.getContext('2d'); g.clearRect(0, 0, tv.width, tv.height); var t = el.querySelector('#sgText').value; if (!t) return; var size = 76; g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'center'; do { g.font = 'italic ' + size + 'px "' + fontSel + '"'; size -= 4; } while (g.measureText(t).width > tv.width - 30 && size > 18); g.fillText(t, tv.width / 2, tv.height / 2); }
        el.querySelector('#sgText').oninput = drawTyped;
        each(el.querySelectorAll('#sgFonts button'), function (b) { b.onclick = function () { fontSel = b.dataset.f; each(el.querySelectorAll('#sgFonts button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); }); drawTyped(); }; });
        each(el.querySelectorAll('#sgTabs button'), function (b) { b.onclick = function () { mode = b.dataset.m; each(el.querySelectorAll('#sgTabs button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); }); el.querySelector('#sgDraw').hidden = mode !== 'draw'; el.querySelector('#sgType').hidden = mode !== 'type'; el.querySelector('#sgImg').hidden = mode !== 'img'; if (mode === 'type') { drawTyped(); el.querySelector('#sgText').focus(); } }; });
        el.querySelector('#sgFile').onchange = function () {
          var f = this.files[0]; if (!f) return; var rd = new FileReader();
          rd.onload = function () { var im = new Image(); im.onload = function () { var iv = el.querySelector('#sgIv'), g = iv.getContext('2d'), k = Math.min(iv.width / im.width, iv.height / im.height); g.clearRect(0, 0, iv.width, iv.height); var w = im.width * k, h = im.height * k; g.drawImage(im, (iv.width - w) / 2, (iv.height - h) / 2, w, h); var d = g.getImageData(0, 0, iv.width, iv.height), a = d.data; for (var q = 0; q < a.length; q += 4) { var lum = a[q] * 0.3 + a[q + 1] * 0.59 + a[q + 2] * 0.11; if (lum > 225) a[q + 3] = 0; else if (lum > 170) a[q + 3] = Math.round(a[q + 3] * (225 - lum) / 55); } g.putImageData(d, 0, 0); }; im.src = rd.result; };
          rd.readAsDataURL(f);
        };
        each(el.querySelectorAll('#sgSaved .sgs'), function (b) { b.onclick = function (e) {
          var id = b.dataset.id; if (e.target.dataset.del) { var l = loadSigs().filter(function (s) { return s.id !== e.target.dataset.del; }); saveSigs(l); b.remove(); return; }
          var s = loadSigs().filter(function (x) { return x.id === id; })[0]; if (s) { close(null); place(s.data, s.w, s.h); }
        }; });
        el._get = function () { var src = mode === 'draw' ? cv : mode === 'type' ? el.querySelector('#sgTv') : el.querySelector('#sgIv'); return trim(src); };
      },
      validate: function (el) { return el._get() ? null : 'ارسم أو اكتب التوقيع أولاً'; }
    }).then(function (el) {
      if (!el) return;
      var out = el._get(); if (!out) return;
      var data = out.toDataURL('image/png');
      if (el.querySelector('#sgSave').checked) { var l = loadSigs(); l.unshift({ id: 's' + Date.now().toString(36), kind: kind, data: data, w: out.width, h: out.height }); saveSigs(l); }
      place(data, out.width, out.height);
    });
  }
  function place(data, w, h) { var k = Math.min(1, 150 / (w * 0.5)); P.addImage(data, w * 0.5 * k, h * 0.5 * k); }

  // ================================================================ redact by search
  var PATTERNS = [['email', 'عناوين البريد الإلكتروني', /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi], ['phone', 'أرقام الهاتف', /\+?\d[\d\s().-]{7,}\d/g], ['digits', 'كل الأرقام الطويلة (6 أرقام فأكثر)', /\d{6,}/g], ['id', 'أرقام الهوية (10–12 رقماً)', /\b\d{10,12}\b/g], ['date', 'التواريخ', /\b\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}\b/g], ['url', 'الروابط', /https?:\/\/[^\s]+/gi]];
  function redactSearch() {
    if (!S.pdf) return P.toast('افتح ملف PDF أولاً');
    var found = [];
    UI.open({
      title: 'تنقيح بالبحث', wide: true, ok: 'إضافة مناطق التنقيح', body:
        '<label class="fld"><span>نص للبحث عنه (كلمة أو جملة)</span><input id="rsT" dir="auto" placeholder="مثال: اسم الطالب"></label>' +
        '<div class="fld"><span>أنماط جاهزة</span><div class="radios">' + PATTERNS.map(function (p) { return '<label class="chk"><input type="checkbox" class="rsP" value="' + p[0] + '"> ' + p[1] + '</label>'; }).join('') + '</div></div>' +
        '<label class="fld"><span>تعبير نمطي مخصص (RegExp) — اختياري</span><input id="rsR" dir="ltr" placeholder="\\b[A-Z]{2}\\d{6}\\b"></label>' +
        '<div class="rsbar"><button type="button" class="btn" id="rsGo">🔍 بحث</button><span id="rsRes" class="rs-res"></span></div>',
      onOpen: function (el) {
        var run = el.querySelector('#rsGo');
        run.onclick = function () {
          var res = el.querySelector('#rsRes'); res.textContent = 'جارٍ البحث…'; found = [];
          var jobs = [], t = el.querySelector('#rsT').value.trim(), rx = el.querySelector('#rsR').value.trim();
          if (t) jobs.push(PdfText.findAll(t));
          each(el.querySelectorAll('.rsP:checked'), function (c) { var pat = PATTERNS.filter(function (p) { return p[0] === c.value; })[0]; if (pat) jobs.push(PdfText.findAll(pat[2])); });
          if (rx) { try { jobs.push(PdfText.findAll(new RegExp(rx, 'gi'))); } catch (e) { res.textContent = 'تعبير نمطي غير صالح'; return; } }
          if (!jobs.length) { res.textContent = 'اكتب نصاً أو اختر نمطاً'; return; }
          Promise.all(jobs).then(function (all) {
            all.forEach(function (l) { found = found.concat(l); });
            var pgs = {}; found.forEach(function (f) { pgs[f.i + 1] = (pgs[f.i + 1] || 0) + 1; });
            res.textContent = found.length ? 'وُجد ' + found.length + ' موضع في ' + Object.keys(pgs).length + ' صفحة (' + Object.keys(pgs).slice(0, 12).join('، ') + (Object.keys(pgs).length > 12 ? '…' : '') + ')' : 'لا توجد نتائج — الملفات المصوّرة (سكانر) لا يمكن البحث فيها';
          });
        };
      },
      validate: function () { return found.length ? null : 'اضغط «بحث» أولاً حتى تظهر نتائج'; }
    }).then(function (el) {
      if (!el || !found.length) return;
      P.push(); var n = 0;
      found.forEach(function (f) {
        f.rects.forEach(function (r) { S.pages[f.i].objs.push({ id: P.uid(), t: 'redact', x: r.x - 1.5, y: r.y - 1, w: r.w + 3, h: r.h + 2, fc: '#000000', label: '' }); n++; });
      });
      S.pages.forEach(function (p, i) { P.drawOverlay(i); P.markThumb(i); }); P.changed();
      P.toast('أُضيفت ' + n + ' منطقة تنقيح — راجعها ثم احفظ PDF لتطبيقها نهائياً');
    });
  }

  // ================================================================ export hooks
  var REDACT_Q = { dpi: 200, q: 0.92 };
  function needsRaster(objs) { return objs.some(function (o) { return o.t === 'redact' && !o.soft; }); }
  function burn(cx, k, objs, p) {
    objs.forEach(function (o) {
      if (o.t !== 'redact' || o.soft) return;
      cx.fillStyle = o.fc || '#000'; cx.fillRect(o.x * k, o.y * k, o.w * k, o.h * k);
      if (o.label) { cx.fillStyle = (o.fc === '#ffffff') ? '#000' : '#fff'; cx.font = Math.max(8, Math.min(14, o.h * 0.6)) * k + 'px Amiri, serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(o.label, (o.x + o.w / 2) * k, (o.y + o.h / 2) * k); }
    });
  }
  var pend = null;
  function begin() { pend = { pages: {}, links: [] }; }
  function rectPdf(toPdf, o) { var a = apply(toPdf, o.x, o.y), b = apply(toPdf, o.x + o.w, o.y + o.h); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; }
  function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  function exportPage(out, page, p, toPdf, objs, n) {
    if (!pend) begin();
    pend.pages[p.id] = out.getPageCount() - 1;
    var L = window.PDFLib, ctx = out.context;
    objs.forEach(function (o) {
      if (o.t === 'link') pend.links.push({ page: page, o: o, rect: rectPdf(toPdf, o) });
      else if (o.t === 'field') addField(out, page, o, rectPdf(toPdf, o), L);
    });
  }
  function addField(out, page, o, r, L) {
    var form = out.getForm(), box = { x: r[0], y: r[1], width: r[2] - r[0], height: r[3] - r[1], borderWidth: o.fk === 'button' ? 1 : 1, borderColor: L.rgb(0.36, 0.55, 0.94), backgroundColor: L.rgb(0.94, 0.96, 1) };
    try {
      var f, hx = function (v) { return L.PDFHexString.fromText(String(v)); };
      // (the default appearance exists only after addToPage; values are written without pdf-lib's WinAnsi-only appearance step,
      //  so Arabic text is kept and the viewer draws it: NeedAppearances is set at the end)
      if (o.fk === 'text') { f = form.createTextField(o.name); if (o.ml) f.enableMultiline(); f.addToPage(page, box); if (o.size) f.setFontSize(o.size); if (o.value) f.acroField.setValue(hx(o.value)); }
      else if (o.fk === 'check') { f = form.createCheckBox(o.name); f.addToPage(page, box); if (o.value) f.check(); }
      else if (o.fk === 'radio') { var g = form.getFieldMaybe(o.grp || o.name) || form.createRadioGroup(o.grp || o.name); g.addOptionToPage(o.name, page, box); if (o.value) g.select(o.name); f = g; }
      else if (o.fk === 'combo') { f = form.createDropdown(o.name); f.addOptions(o.opts && o.opts.length ? o.opts : ['']); f.addToPage(page, box); if (o.size) f.setFontSize(o.size); if (o.value && o.opts.indexOf(o.value) >= 0) f.acroField.setValues([hx(o.value)]); }
      else if (o.fk === 'list') { f = form.createOptionList(o.name); f.addOptions(o.opts && o.opts.length ? o.opts : ['']); f.addToPage(page, box); if (o.size) f.setFontSize(o.size); }
      else if (o.fk === 'sig') {
        // an empty signature field: Acrobat and other readers offer "Sign here" and apply a real digital signature
        var ctx = out.context, N = L.PDFName, d = ctx.obj({ Type: 'Annot', Subtype: 'Widget', FT: 'Sig', T: hx(o.name), F: 4, Rect: [box.x, box.y, box.x + box.width, box.y + box.height],
          MK: ctx.obj({ BC: [0.36, 0.55, 0.94], BG: [0.94, 0.96, 1] }), BS: ctx.obj({ W: 1, S: 'D', D: [3, 2] }), TU: hx('وقّع هنا: ' + o.name) }), ref = ctx.register(d);
        page.node.addAnnot(ref);
        var af = out.catalog.lookup(N.of('AcroForm')) || form.acroForm.dict; var fl = af.lookup(N.of('Fields')); if (fl && fl.push) fl.push(ref);
        var sf = af.get(N.of('SigFlags')); if (!sf) af.set(N.of('SigFlags'), L.PDFNumber.of(1));
        return;
      }
      else if (o.fk === 'button') { f = form.createButton(o.name); f.addToPage(o.value || o.name, page, box); }
      if (f && o.req && f.enableRequired) f.enableRequired(); if (f && o.ro && f.enableReadOnly) f.enableReadOnly();
    } catch (e) { if (window.ArLog) ArLog.error('field', e); }
  }
  function finish(out, opts) {
    var L = window.PDFLib, ctx = out.context, pages = out.getPages();
    // links
    (pend ? pend.links : []).forEach(function (l) {
      var o = l.o, act;
      if (o.kind === 'page') { var idx = pend.pages[o.pid]; if (idx === undefined || !pages[idx]) return; act = { Dest: [pages[idx].ref, 'Fit'] }; }
      else { var uri = o.kind === 'mail' ? 'mailto:' + o.url : o.url; act = { A: { Type: 'Action', S: 'URI', URI: L.PDFString.of(uri) } }; }
      var d = ctx.obj(Object.assign({ Type: 'Annot', Subtype: 'Link', Rect: l.rect, Border: [0, 0, 0], F: 4 }, act));
      var arr = l.page.node.Annots(); if (!arr) { arr = ctx.obj([]); l.page.node.set(L.PDFName.of('Annots'), arr); } arr.push(ctx.register(d));
    });
    // form: let the viewer build the appearances (Arabic text needs the viewer's fonts)
    var hasFields = pend && Object.keys(pend.pages).length && out.getForm().getFields().length;
    if (hasFields) { try { out.getForm().acroForm.dict.set(L.PDFName.of('NeedAppearances'), L.PDFBool.True); } catch (e) { /* ignore */ } }
    // bookmarks
    var bm = (deco().bookmarks || []).filter(function (b) { return pend && pend.pages[b.pid] !== undefined; });
    if (bm.length) {
      var root = ctx.register(ctx.obj({ Type: 'Outlines' })), items = [], stack = [{ ref: root, kids: [] }];
      bm.forEach(function (b) {
        var ref = ctx.nextRef(); var lvl = Math.min(b.lvl || 0, stack.length - 1);
        stack.length = lvl + 1;
        var parent = stack[lvl], node = { ref: ref, b: b, parent: parent, kids: [] }; parent.kids.push(node); stack.push(node); items.push(node);
      });
      var rootKids = stack[0].kids;
      var fill = function (kids, parentRef) { kids.forEach(function (n, k) {
        var d = { Title: L.PDFHexString.fromText(n.b.title), Parent: parentRef, Dest: [pages[pend.pages[n.b.pid]].ref, 'Fit'] };
        if (k > 0) d.Prev = kids[k - 1].ref; if (k < kids.length - 1) d.Next = kids[k + 1].ref;
        if (n.kids.length) { d.First = n.kids[0].ref; d.Last = n.kids[n.kids.length - 1].ref; d.Count = n.kids.length; }
        ctx.assign(n.ref, ctx.obj(d)); fill(n.kids, n.ref); }); };
      fill(rootKids, root);
      var rd = ctx.lookup(root); rd.set(L.PDFName.of('First'), rootKids[0].ref); rd.set(L.PDFName.of('Last'), rootKids[rootKids.length - 1].ref); rd.set(L.PDFName.of('Count'), L.PDFNumber.of(items.length));
      out.catalog.set(L.PDFName.of('Outlines'), root);
    }
    // document properties
    var m = deco().meta || {};
    if (m.title) out.setTitle(m.title); if (m.author) out.setAuthor(m.author); if (m.subject) out.setSubject(m.subject);
    if (m.keywords) out.setKeywords(String(m.keywords).split(/[,،]\s*/).filter(Boolean));
    pend = null;
  }

  // ================================================================ document properties
  function docProps() {
    if (!S.pdf) return P.toast('افتح ملف PDF أولاً');
    var m = deco().meta || {};
    UI.open({ title: 'خصائص المستند', body:
      '<label class="fld"><span>العنوان</span><input id="dpT" dir="auto" value="' + esc(m.title || S.name.replace(/\.pdf$/i, '')) + '"></label>' +
      '<label class="fld"><span>المؤلف</span><input id="dpA" dir="auto" value="' + esc(m.author || S.opt.author || '') + '"></label>' +
      '<label class="fld"><span>الموضوع</span><input id="dpS" dir="auto" value="' + esc(m.subject || '') + '"></label>' +
      '<label class="fld"><span>كلمات مفتاحية (مفصولة بفاصلة)</span><input id="dpK" dir="auto" value="' + esc(m.keywords || '') + '"></label>', ok: 'حفظ' })
      .then(function (el) { if (!el) return; deco().meta = { title: el.querySelector('#dpT').value.trim(), author: el.querySelector('#dpA').value.trim(), subject: el.querySelector('#dpS').value.trim(), keywords: el.querySelector('#dpK').value.trim() }; P.changed(); P.toast('تُطبَّق الخصائص عند حفظ PDF'); });
  }

  // ================================================================ sidebar: comments & bookmarks
  var panels = {};
  function makePanel(id, title) {
    var side = document.querySelector('.side'), tabs = side.querySelector('.stabs');
    var b = document.createElement('button'); b.type = 'button'; b.dataset.st = id; b.setAttribute('aria-pressed', 'false'); b.innerHTML = title; tabs.appendChild(b);
    var d = document.createElement('div'); d.className = 'apanel'; d.id = id + 'Panel'; d.hidden = true; side.appendChild(d);
    panels[id] = { tab: b, el: d };
    b.onclick = function () { openPanel(id); };
    each(tabs.querySelectorAll('[data-st]'), function (t) { if (!panels[t.dataset.st]) t.addEventListener('click', function () { document.querySelector('.pmain').classList.remove('wide2'); each(Object.keys(panels), function (k) { panels[k].el.hidden = true; panels[k].tab.setAttribute('aria-pressed', 'false'); }); }, true); });
    return d;
  }
  function openPanel(id) {
    each(document.querySelectorAll('.stabs [data-st]'), function (t) { t.setAttribute('aria-pressed', String(t.dataset.st === id)); });
    $('thumbs').hidden = true; $('clipsPanel').hidden = true; document.querySelector('.pmain').classList.remove('wide'); document.querySelector('.pmain').classList.add('wide2');
    Object.keys(panels).forEach(function (k) { panels[k].el.hidden = k !== id; });
    if (id === 'comments') renderComments(); else if (id === 'bmarks') renderBookmarks(); else if (id === 'layers') renderLayers();
  }
  function renderComments() {
    var el = panels.comments && panels.comments.el; if (!el) return;
    var rows = [];
    S.pages.forEach(function (p, i) { p.objs.forEach(function (o) {
      var kind = null, txt = '';
      if (o.t === 'note') { kind = '🗒'; txt = o.text; } else if (o.t === 'mark') { kind = o.mk === 'hl' ? '▬' : o.mk === 'ul' ? 'U̲' : o.mk === 'st' ? 'S̶' : '≈'; txt = o.c || '(تحديد بلا تعليق)'; }
      else if (o.t === 'shape' && o.text && o.text.s) { kind = '◇'; txt = o.text.s; } else if (o.t === 'text') { kind = 'T'; txt = o.text; } else if (o.t === 'link') { kind = '🔗'; txt = o.url || ('صفحة ' + (pageIndex(o.pid) + 1)); }
      else if (o.t === 'field') { kind = '▭'; txt = o.name; } else if (o.t === 'redact') { kind = '■'; txt = o.label || 'تنقيح'; }
      if (kind) rows.push({ i: i, o: o, kind: kind, txt: txt });
    }); });
    el.innerHTML = '<div class="aph">التعليقات والتعليقات التوضيحية <b>' + rows.length + '</b></div>' + (rows.length ? '' : '<p class="apn">لا توجد تعليقات بعد. حدّد نصاً وظلّله، أو أضف ملاحظة أو شكلاً.</p>');
    rows.forEach(function (r) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'apr'; b.innerHTML = '<i>' + r.kind + '</i><span><b>صفحة ' + (r.i + 1) + '</b>' + esc(String(r.txt || '').slice(0, 90)) + '</span>';
      b.onclick = function () { P.goto(r.i); P.setTool('select'); P.select(r.i, r.o.id); };
      b.ondblclick = function () { dbl(r.i, r.o); };
      el.appendChild(b);
    });
  }
  var LN = { text: 'نص', ink: 'رسم حر', rect: 'مستطيل', ellipse: 'بيضاوي', line: 'خط', arrow: 'سهم', white: 'تغطية', svg: 'معادلة/شكل', image: 'صورة', note: 'ملاحظة', shape: 'شكل', mark: 'تظليل', redact: 'تنقيح', link: 'رابط', field: 'حقل' };
  function renderLayers() {
    var el = panels.layers && panels.layers.el; if (!el || !S.pdf) return;
    var p = S.pages[S.cur], list = p.objs;
    el.innerHTML = '<div class="aph">طبقات الصفحة ' + (S.cur + 1) + ' <b>' + list.length + '</b></div>' + (list.length ? '' : '<p class="apn">لا توجد عناصر في هذه الصفحة.</p>');
    list.slice().reverse().forEach(function (o) {
      var k = list.indexOf(o), row = document.createElement('div'); row.className = 'apr bm lyr' + (S.sel && S.sel.ids && S.sel.ids.indexOf(o.id) >= 0 ? ' on' : '') + (o.hide ? ' off' : '');
      var nm = o.name || (o.t === 'shape' ? (o.text && o.text.s ? o.text.s.slice(0, 24) : (o.kind || 'شكل')) : o.t === 'text' ? String(o.text || '').slice(0, 24) : (LN[o.t] || o.t));
      row.innerHTML = '<span class="bmt"><b>' + esc(nm) + '</b><small>' + (LN[o.t] || o.t) + '</small></span><span class="bmc"><button type="button" data-a="eye" title="إظهار/إخفاء">' + (o.hide ? '🚫' : '👁') + '</button><button type="button" data-a="lock" title="قفل">' + (o.lock ? '🔒' : '🔓') + '</button><button type="button" data-a="up" title="للأمام">▲</button><button type="button" data-a="dn" title="للخلف">▼</button><button type="button" data-a="ren" title="تسمية">✎</button></span>';
      row.querySelector('.bmt').onclick = function () { if (!o.hide) { P.setTool('select'); P.select(S.cur, o.id); } };
      row.querySelector('.bmc').onclick = function (e) {
        var a = e.target.dataset.a; if (!a) return;
        if (a === 'ren') { UI.open({ title: 'اسم الطبقة', body: '<input id="ln" dir="auto" value="' + esc(nm) + '">', ok: 'حفظ' }).then(function (d) { if (d) { P.push(); o.name = d.querySelector('#ln').value.trim(); P.changed(); renderLayers(); } }); return; }
        P.push();
        if (a === 'eye') { if (o.hide) delete o.hide; else o.hide = true; } else if (a === 'lock') { if (o.lock) delete o.lock; else o.lock = true; }
        else if (a === 'up' && k < list.length - 1) { list.splice(k, 1); list.splice(k + 1, 0, o); } else if (a === 'dn' && k > 0) { list.splice(k, 1); list.splice(k - 1, 0, o); }
        P.changed(); P.drawOverlay(S.cur); renderLayers();
      };
      el.appendChild(row);
    });
  }
  function bms() { deco().bookmarks = deco().bookmarks || []; return deco().bookmarks; }
  function renderBookmarks() {
    var el = panels.bmarks && panels.bmarks.el; if (!el) return;
    var list = bms();
    el.innerHTML = '<div class="aph">الإشارات المرجعية <b>' + list.length + '</b><button type="button" class="apadd" id="bmAdd">＋ إضافة للصفحة الحالية</button></div>' + (list.length ? '' : '<p class="apn">الإشارات تظهر في لوحة الإشارات في Acrobat وتُسهّل التنقل في الكتب الطويلة.</p>');
    list.forEach(function (b, k) {
      var row = document.createElement('div'); row.className = 'apr bm'; row.style.paddingInlineStart = (8 + (b.lvl || 0) * 16) + 'px';
      var pi = pageIndex(b.pid);
      row.innerHTML = '<span class="bmt"><b>' + esc(b.title) + '</b><small>صفحة ' + (pi + 1 || '؟') + '</small></span><span class="bmc"><button type="button" data-a="in" title="إزاحة للداخل">⇥</button><button type="button" data-a="out" title="إزاحة للخارج">⇤</button><button type="button" data-a="ren" title="إعادة تسمية">✎</button><button type="button" data-a="up" title="للأعلى">▲</button><button type="button" data-a="del" title="حذف">✕</button></span>';
      row.querySelector('.bmt').onclick = function () { if (pi >= 0) P.goto(pi); };
      row.querySelector('.bmc').onclick = function (e) {
        var a = e.target.dataset.a; if (!a) return;
        if (a === 'in') b.lvl = Math.min(3, (b.lvl || 0) + 1); else if (a === 'out') b.lvl = Math.max(0, (b.lvl || 0) - 1);
        else if (a === 'del') list.splice(k, 1); else if (a === 'up' && k > 0) { var t = list[k]; list[k] = list[k - 1]; list[k - 1] = t; }
        else if (a === 'ren') { UI.open({ title: 'اسم الإشارة', body: '<input id="bn" dir="auto" value="' + esc(b.title) + '">', ok: 'حفظ' }).then(function (d) { if (d) { b.title = d.querySelector('#bn').value.trim() || b.title; P.changed(); renderBookmarks(); } }); return; }
        P.changed(); renderBookmarks();
      };
      el.appendChild(row);
    });
    var add = el.querySelector('#bmAdd'); if (add) add.onclick = addBookmark;
  }
  function addBookmark() {
    if (!S.pdf) return;
    var p = S.pages[S.cur];
    UI.open({ title: 'إشارة مرجعية', body: '<label class="fld"><span>الاسم</span><input id="bn" dir="auto" value="صفحة ' + (S.cur + 1) + '"></label>', ok: 'إضافة' }).then(function (el) {
      if (!el) return; bms().push({ id: P.uid(), title: el.querySelector('#bn').value.trim() || 'صفحة ' + (S.cur + 1), pid: p.id, lvl: 0 });
      bms().sort(function (a, b) { return pageIndex(a.pid) - pageIndex(b.pid); }); P.changed(); openPanel('bmarks');
    });
  }

  // ================================================================ ribbon
  function build() {
    var host = $('tools'); if (!host) return;
    var tabs = document.createElement('div'); tabs.className = 'rtabs'; tabs.id = 'rtabs';
    tabs.innerHTML = '<button type="button" data-rt="base" aria-pressed="true">الرئيسية</button><button type="button" data-rt="comment" aria-pressed="false">تعليق وتحديد</button><button type="button" data-rt="forms" aria-pressed="false">نماذج وتوقيع</button><button type="button" data-rt="protect" aria-pressed="false">حماية وتنقيح</button><button type="button" data-rt="measure" aria-pressed="false">قياس</button><span class="grow"></span><a class="rt-link" href="tools/index.html" title="دمج وتقسيم وضغط وتحويل وحماية ومقارنة">🧰 أدوات PDF الكاملة</a>';
    host.parentNode.insertBefore(tabs, host);
    host.dataset.rt = 'base';
    function nav(id, html) { var n = document.createElement('nav'); n.className = 'tools rib'; n.id = id; n.hidden = true; n.innerHTML = html; host.parentNode.insertBefore(n, $('props')); return n; }
    function btn(attrs, ico, label, title) { return '<button ' + attrs + ' title="' + esc(title || label) + '"><i>' + ico + '</i><b>' + label + '</b></button>'; }
    var sep = '<span class="sep"></span>';
    var comment = nav('toolsComment',
      btn('data-tool="select"', '⬚', 'تحديد') + btn('data-tool="hand"', '✋', 'يد') + btn('data-tool="textsel"', '𝐀', 'تحديد نص', 'حدّد النص ثم اختر التظليل أو التسطير من الشريط الذي يظهر') + sep +
      HLC.map(function (c) { return '<button class="mkb" data-act="hl" data-c="' + c[0] + '" title="تظليل ' + c[1] + ' للنص المحدد"><i style="color:#000;background:' + c[0] + ';border-radius:3px;padding:0 5px">A</i><b>تظليل</b></button>'; }).slice(0, 3).join('') +
      '<button class="mkb" data-act="ul" title="تسطير النص المحدد"><i><u>U</u></i><b>تسطير</b></button><button class="mkb" data-act="st" title="شطب النص المحدد"><i><s>S</s></i><b>شطب</b></button><button class="mkb" data-act="sq" title="خط متموج تحت النص المحدد"><i>≈</i><b>متموج</b></button>' + sep +
      btn('data-tool="note"', '🗒', 'ملاحظة') + btn('data-tool="text"', 'T', 'نص') + btn('id="shapeBtn2"', '◇', 'الأشكال ▾', 'معرض الأشكال') + btn('data-tool="pen"', '✎', 'قلم') + btn('data-tool="hl"', '▬', 'قلم تظليل') + btn('data-tool="arrow"', '➚', 'سهم') + btn('id="stampBtn2"', '🏷', 'ختم ▾') + sep +
      btn('id="cmtBtn"', '💬', 'قائمة التعليقات', 'اعرض كل التعليقات في الشريط الجانبي') + btn('data-tool="erase"', '⌫', 'ممحاة'));
    var forms = nav('toolsForms',
      btn('data-tool="select"', '⬚', 'تحديد') + sep + btn('id="signBtn"', '✍', 'توقيع', 'ارسم توقيعك أو اكتبه أو ارفع صورته') + btn('id="initBtn"', 'AB', 'الأحرف الأولى') + sep +
      btn('data-tool="ftext"', 'Aa', 'حقل نص', 'اسحب لرسم حقل نص تفاعلي') + btn('data-tool="fcheck"', '☑', 'مربع اختيار') + btn('data-tool="fradio"', '◉', 'زر خيار') + btn('data-tool="fcombo"', '▾', 'قائمة منسدلة') + btn('data-tool="flist"', '☰', 'قائمة') + btn('data-tool="fbtn"', '▭', 'زر') + btn('data-tool="fsig"', '✍', 'حقل توقيع رقمي', 'حقل فارغ يوقّعه القارئ بتوقيع رقمي في Acrobat') + sep +
      btn('data-tool="link"', '🔗', 'رابط', 'اسحب مستطيلاً: رابط لموقع أو صفحة أو بريد') + btn('data-tool="text"', 'T', 'نص (تعبئة)') + btn('data-tool="stamp"', '✓', 'علامة', 'أختام ✓ ✗ التاريخ…'));
    var prot = nav('toolsProtect',
      btn('data-tool="select"', '⬚', 'تحديد') + sep + btn('data-tool="redact"', '■', 'تنقيح', 'اسحب مستطيلاً فوق ما تريد إخفاءه نهائياً') + btn('id="redSearchBtn"', '🔍', 'تنقيح بالبحث', 'ابحث عن نص أو بريد أو أرقام وأخفِها كلها') +
      '<button id="redPrevBtn" aria-pressed="false" title="معاينة التنقيح كما سيُحفظ (أسود كامل)"><i>👁</i><b>معاينة</b></button>' + sep +
      btn('id="propsBtn"', 'ⓘ', 'خصائص المستند') + btn('id="bmBtn"', '🔖', 'الإشارات المرجعية') + btn('id="wmBtn"', '💧', 'علامة مائية') + btn('id="numBtn"', '🔢', 'ترقيم الصفحات') + sep +
      '<a class="rtlink" href="tools/protect.html" title="تشفير الملف بكلمة مرور"><i>🔒</i><b>حماية بكلمة مرور</b></a><a class="rtlink" href="tools/compress.html"><i>⇲</i><b>ضغط</b></a><a class="rtlink" href="tools/compare.html"><i>⇆</i><b>مقارنة</b></a>');
    var meas = nav('toolsMeasure',
      btn('data-tool="select"', '⬚', 'تحديد') + sep + btn('data-meas="measureDist"', '📏', 'قياس مسافة', 'اسحب بين نقطتين') + btn('data-meas="measurePoly"', '⌇', 'قياس محيط', 'انقر نقاطاً، نقرتان للإنهاء') + btn('data-meas="measureArea"', '⬠', 'قياس مساحة', 'انقر رؤوس المضلع، نقرتان للإنهاء') + sep + btn('id="calBtn"', '⚖', 'معايرة المقياس', 'اضبط وحدة وقيمة المقياس') + sep +
      '<button id="gridBtn" aria-pressed="false" title="إظهار الشبكة والمحاذاة إليها"><i>▦</i><b>شبكة</b></button>' + btn('id="gridStepBtn"', '⌗', 'حجم الشبكة', 'المسافة بين خطوط الشبكة') + btn('id="layersBtn"', '☰', 'لوحة الطبقات', 'إظهار/إخفاء/قفل/ترتيب عناصر الصفحة'));
    // tab switching
    var navs = { base: host, comment: comment, forms: forms, protect: prot, measure: meas };
    function rtab(t) { each(tabs.querySelectorAll('[data-rt]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.rt === t)); }); Object.keys(navs).forEach(function (k) { navs[k].hidden = k !== t; }); try { localStorage.setItem('armath.pdf.rt', t); } catch (e) { /* ignore */ } }
    each(tabs.querySelectorAll('[data-rt]'), function (b) { b.onclick = function () { rtab(b.dataset.rt); }; });
    // wire the new tool buttons (the studio's setTool/aria-pressed code covers every `.tools [data-tool]`)
    each(document.querySelectorAll('.tools.rib [data-tool]'), function (b) { b.onclick = function () { P.setTool(b.dataset.tool); }; });
    each(document.querySelectorAll('.mkb'), function (b) { b.onclick = function () { var a = b.dataset.act; var r = applyMark(a, b.dataset.c || (a === 'ul' ? '#1f5fbf' : '#c2352b')); if (r) P.select(r[0], r[1].id); else P.setTool('textsel'); }; });
    $('shapeBtn2').onclick = function () { if (!S.pdf) return P.toast('افتح ملف PDF أولاً'); PdfShapes.openGallery(this, null); };
    $('stampBtn2').onclick = function () { $('stampBtn').click(); };
    $('cmtBtn').onclick = function () { openPanel('comments'); };
    $('signBtn').onclick = function () { signDialog('sig'); }; $('initBtn').onclick = function () { signDialog('init'); };
    $('redSearchBtn').onclick = redactSearch;
    $('redPrevBtn').onclick = function () { S.redPrev = !S.redPrev; this.setAttribute('aria-pressed', String(S.redPrev)); S.pages.forEach(function (p, i) { P.drawOverlay(i); }); };
    $('propsBtn').onclick = docProps; $('bmBtn').onclick = function () { openPanel('bmarks'); };
    $('wmBtn').onclick = function () { var b = document.querySelector('#setPop [data-x="wm"]'); b && b.click(); }; $('numBtn').onclick = function () { var b = document.querySelector('#setPop [data-x="num"]'); b && b.click(); };
    each(document.querySelectorAll('[data-meas]'), function (b) { b.onclick = function () { if (!S.pdf) return P.toast('افتح ملف PDF أولاً'); S.shapeKind = b.dataset.meas; P.setTool('shape'); P.toast('ارسم على الصفحة' + (/Poly|Area/.test(b.dataset.meas) ? ' — انقر لإضافة نقاط ونقرتان للإنهاء' : '')); }; });
    $('calBtn').onclick = calibrate;
    document.addEventListener('pointerup', function () { setTimeout(function () { if (panels.layers && !panels.layers.el.hidden) renderLayers(); }, 60); }); document.addEventListener('keyup', function () { if (panels.layers && !panels.layers.el.hidden) renderLayers(); });
    $('layersBtn').onclick = function () { openPanel('layers'); };
    var gb = $('gridBtn'); gb.setAttribute('aria-pressed', String(!!S.opt.grid));
    gb.onclick = function () { S.opt.grid = !S.opt.grid; this.setAttribute('aria-pressed', String(!!S.opt.grid)); try { localStorage.setItem('armath.pdf.look', JSON.stringify(S.opt)); } catch (e) { /* ignore */ } S.pages.forEach(function (p, i) { P.drawOverlay(i); }); P.toast(S.opt.grid ? 'الشبكة مفعّلة — تُحاذى العناصر أثناء السحب' : 'الشبكة متوقفة'); };
    $('gridStepBtn').onclick = function () {
      UI.open({ title: 'الشبكة', body: '<label class="fld"><span>المسافة بين الخطوط (نقطة)</span><input id="gs" type="number" min="2" max="200" dir="ltr" value="' + (S.opt.gridStep || 10) + '"></label><label class="fld row"><span>المحاذاة للشبكة أثناء السحب</span><input id="gn" type="checkbox"' + (S.opt.gridSnap !== false ? ' checked' : '') + '></label>', ok: 'حفظ' }).then(function (el) {
        if (!el) return; S.opt.gridStep = Math.max(2, +el.querySelector('#gs').value || 10); S.opt.gridSnap = el.querySelector('#gn').checked; S.opt.grid = true; gb.setAttribute('aria-pressed', 'true');
        try { localStorage.setItem('armath.pdf.look', JSON.stringify(S.opt)); } catch (e) { /* ignore */ } S.pages.forEach(function (p, i) { P.drawOverlay(i); });
      });
    };
    makePanel('comments', 'التعليقات <span class="cnt" id="cmtCount"></span>'); makePanel('bmarks', 'الإشارات'); makePanel('layers', 'الطبقات');
    var saved = null; try { saved = localStorage.getItem('armath.pdf.rt'); } catch (e) { /* ignore */ }
    if (saved && navs[saved]) rtab(saved);
  }
  function calibrate() {
    var m = S.opt.measure || { unit: 'سم', per: 0.03528 };
    UI.open({ title: 'معايرة المقياس', body: '<p class="dlg-note">القياسات تُحسب من الصفحة. الافتراضي: الحجم الحقيقي عند الطباعة. لمقياس رسم مخصص، اكتب كم تساوي النقطة الواحدة (1 نقطة = 0.3528 مم).</p>' +
      '<label class="fld"><span>الوحدة المعروضة</span><input id="cu" dir="auto" value="' + esc(m.unit) + '"></label><label class="fld"><span>قيمة النقطة الواحدة (1/72 إنش) بهذه الوحدة</span><input id="cp" type="number" step="any" dir="ltr" value="' + m.per + '"></label>' +
      '<div class="fld"><span>أو اضبطه بقياس معروف</span><div class="rsbar"><input id="ck" type="number" step="any" dir="ltr" placeholder="الطول الحقيقي" style="width:110px"> <span>للخط المحدد حالياً</span></div></div>', ok: 'حفظ' })
      .then(function (el) {
        if (!el) return; var u = el.querySelector('#cu').value.trim() || 'سم', per = parseFloat(el.querySelector('#cp').value), known = parseFloat(el.querySelector('#ck').value);
        var o = P.selObjs()[0];
        if (known > 0 && o && o.t === 'shape' && (o.x2 !== undefined || o.pts)) { var pts = o.pts || [[o.x1, o.y1], [o.x2, o.y2]], L = 0; for (var k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); if (L > 0) per = known / L; }
        if (!(per > 0)) return; S.opt.measure = { unit: u, per: per }; P.saveOpt(); S.pages.forEach(function (p, i) { P.drawOverlay(i); }); P.toast('المقياس: 1 نقطة = ' + per + ' ' + u);
      });
  }

  function coverRegion(i, r) { var col = sampleColors(i, r); S.pages[i].objs.push(P.born({ id: P.uid(), t: 'redact', x: r.x, y: r.y, w: r.w, h: r.h, fc: col.bg, label: '', cover: true, soft: true })); }
  window.PdfAnnot = { coverRegion: coverRegion, inner: inner, bbox: bbox, move: move, isTool: isTool, region: region, dbl: dbl, needsRaster: needsRaster, REDACT_Q: REDACT_Q, burn: burn, begin: begin, exportPage: exportPage, finish: finish,
    signDialog: signDialog, redactSearch: redactSearch, docProps: docProps, applyMark: applyMark, openPanel: openPanel, renderComments: renderComments, addBookmark: addBookmark };
  build();
  var rc = null; document.addEventListener('pdf-opened', function () { renderComments(); }); setInterval(function () { var c = $('cmtCount'); if (c && S.pages) { var n = 0; S.pages.forEach(function (p) { p.objs.forEach(function (o) { if (o.t === 'note' || (o.t === 'mark' && o.c)) n++; }); }); c.textContent = n || ''; } }, 2500);
})();
