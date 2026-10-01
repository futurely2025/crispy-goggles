/* PDF studio — workflow tools on top of app.js:
 *   · «قص سؤال»: a numbered list of the exam's questions → copy one by one to Raje, PNG / ZIP, a solution page per question
 *   · stamps, solution-page templates, solution mode + student preview
 *   · page numbers & watermark dialogs, offline mode (service worker), install as an app, keyboard help */
(function () {
  'use strict';
  var P = window.__pdf, S = P.S, $ = function (id) { return document.getElementById(id); }, esc = PdfUI.esc;
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };
  function pageIndex(pid) { for (var k = 0; k < S.pages.length; k++) if (S.pages[k].id === pid) return k; return -1; }
  function redrawBgAll() { S.pages.forEach(function (p, i) { P.drawBg(i); }); }

  // ================================================================ sidebar tabs
  var tab = 'pages';
  function setTab(t) {
    tab = t;
    each(document.querySelectorAll('.stabs [data-st]'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.st === t)); });
    $('thumbs').hidden = t !== 'pages'; $('clipsPanel').hidden = t !== 'clips';
    document.querySelector('.pmain').classList.toggle('wide', t === 'clips');
    if (t === 'clips') renderClips();
  }
  each(document.querySelectorAll('.stabs [data-st]'), function (b) { b.onclick = function () { setTab(b.dataset.st); }; });

  // ================================================================ 1) questions («قص سؤال»)
  S.clips = S.clips || [];
  function deco() { S.deco = S.deco || {}; return S.deco; }
  function labelOf(c) {
    if (c.label) return c.label;
    var pre = (deco().clipPrefix || '').trim();
    return (pre ? pre + ' — ' : '') + 'س' + c.n;
  }
  function nextNo() { var m = (+deco().clipStart || 1) - 1; S.clips.forEach(function (c) { m = Math.max(m, c.n); }); return m + 1; }
  function addClip(i, r) {
    var p = S.pages[i];
    P.push();
    var c = { id: P.uid(), pid: p.id, r: { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.w * 10) / 10, h: Math.round(r.h * 10) / 10 }, n: nextNo() };
    S.clips.push(c);
    P.changed(); P.drawBg(i); count();
    if (S.clips.length === 1) setTab('clips'); else if (tab === 'clips') renderClips();
    if (S.opt.clipCopy !== false) {
      clipImage(c).then(function (im) { return P.copyBlob(im.blob); }).then(function () {
        P.toast('أُضيف «' + labelOf(c) + '» إلى قائمة الأسئلة ونُسخ صورة — الصقه في راجع');
      }, function () { P.toast('أُضيف «' + labelOf(c) + '» إلى قائمة الأسئلة'); });
    } else P.toast('أُضيف «' + labelOf(c) + '» إلى قائمة الأسئلة');
  }
  function clipImage(c, sc) {
    var i = pageIndex(c.pid);
    if (i < 0) return Promise.reject(new Error('صفحة السؤال حُذفت'));
    return P.regionImage(i, c.r, { adds: !!S.opt.clipAdds, sc: sc || 3.2 });
  }
  function frames(p, i) {
    if (S.opt.clipFrames === false || !S.clips || !S.clips.length) return '';
    var out = '', z = S.zoom || 1;
    S.clips.forEach(function (c) {
      if (c.pid !== p.id) return;
      var r = c.r, fs = 11 / z, lb = String(c.n), bw = (lb.length * 7 + 12) / z, bh = 16 / z;
      out += '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="rgba(14,159,154,.04)" stroke="#0e9f9a" stroke-width="' + (1.2 / z) + '" stroke-dasharray="' + (6 / z) + ' ' + (4 / z) + '"/>' +
        '<rect x="' + (r.x + r.w - bw) + '" y="' + (r.y - bh) + '" width="' + bw + '" height="' + bh + '" rx="' + (4 / z) + '" fill="#0e9f9a"/>' +
        '<text x="' + (r.x + r.w - bw / 2) + '" y="' + (r.y - bh * 0.28) + '" font-size="' + fs + '" font-family="Segoe UI, Tahoma, sans-serif" font-weight="700" fill="#fff" text-anchor="middle" style="direction:ltr" direction="ltr">' + esc(lb) + '</text>';
    });
    return out;
  }
  function count() {
    $('clipCount').textContent = S.clips && S.clips.length ? '(' + S.clips.length + ')' : '';
  }
  var nextCopy = 0, thumbCache = {};
  function renderClips() {
    var box = $('clipsPanel'), d = deco();
    var list = S.clips.map(function (c, k) { return { c: c, i: pageIndex(c.pid), k: k }; });
    box.innerHTML =
      '<div class="chead">' +
      '<label class="fld"><span>اسم الامتحان / السنة</span><input id="cpPre" dir="auto" placeholder="مثل: 2019 الدور الأول" value="' + esc(d.clipPrefix || '') + '"></label>' +
      '<div class="crow"><label class="fld sm"><span>يبدأ الترقيم من</span><input id="cpStart" type="number" min="1" value="' + (+d.clipStart || 1) + '"></label>' +
      '<label class="chk"><input type="checkbox" id="cpAdds"' + (S.opt.clipAdds ? ' checked' : '') + '> مع إضافاتي</label></div>' +
      '<div class="crow"><label class="chk"><input type="checkbox" id="cpCopy"' + (S.opt.clipCopy !== false ? ' checked' : '') + '> نسخ تلقائي عند القص</label>' +
      '<label class="chk"><input type="checkbox" id="cpFrames"' + (S.opt.clipFrames !== false ? ' checked' : '') + '> إطارات على الصفحات</label></div>' +
      '<div class="cbtns"><button class="btn primary" id="cpNext" type="button"' + (list.length ? '' : ' disabled') + '>📋 نسخ التالي' + (list.length ? ' (' + esc(labelOf(list[Math.min(nextCopy, list.length - 1)].c)) + ')' : '') + '</button></div>' +
      '<div class="cbtns"><button class="chip" id="cpZip" type="button"' + (list.length ? '' : ' disabled') + '>⬇ الكل ZIP</button><button class="chip" id="cpRenum" type="button"' + (list.length ? '' : ' disabled') + '>⇅ ترقيم حسب الصفحات</button><button class="chip danger" id="cpClear" type="button"' + (list.length ? '' : ' disabled') + '>🗑 مسح</button></div>' +
      '</div>' +
      (list.length ? '<ol class="clist">' + list.map(function (x) {
        return '<li data-k="' + x.k + '"' + (x.k === nextCopy ? ' class="next"' : '') + (x.i < 0 ? ' class="gone"' : '') + '>' +
          '<div class="cimg" data-go="' + x.k + '"><img alt="" data-img="' + x.c.id + '"></div>' +
          '<div class="cmeta"><input class="clabel" data-lab="' + x.k + '" dir="auto" value="' + esc(labelOf(x.c)) + '" title="اسم السؤال">' +
          '<span class="cpg">' + (x.i < 0 ? 'الصفحة حُذفت' : 'صفحة ' + (x.i + 1)) + (x.c.copied ? ' · ✓ نُسخ' : '') + '</span>' +
          '<div class="cact"><button data-a="copy" title="نسخ صورة">📋</button><button data-a="png" title="تنزيل PNG">⬇</button><button data-a="go" title="الذهاب إليه">↗</button><button data-a="del" title="حذف من القائمة">✕</button></div></div></li>';
      }).join('') + '</ol>' : '<div class="cempty">اختر أداة <b>✂ قص سؤال</b> (أو اضغط Q) ثم ارسم مستطيلاً حول كل سؤال في الامتحان بالترتيب. يُضاف السؤال هنا مرقّماً ويُنسخ صورة لتلصقه في راجع مباشرة.</div>');
    // thumbnails, one after another
    var chain = Promise.resolve();
    list.forEach(function (x) {
      var img = box.querySelector('img[data-img="' + x.c.id + '"]'); if (!img || x.i < 0) return;
      var key = x.c.id + '|' + JSON.stringify(x.c.r) + '|' + (S.opt.clipAdds ? 1 : 0);
      if (thumbCache[key]) { img.src = thumbCache[key]; return; }
      chain = chain.then(function () {
        return clipImage(x.c, 1.1).then(function (im) { thumbCache[key] = im.url; if (img.isConnected) img.src = im.url; }).catch(function () {});
      });
    });
    bindClips(box);
  }
  function bindClips(box) {
    var d = deco();
    $('cpPre').onchange = function () { P.push(); d.clipPrefix = this.value.trim(); P.changed(); renderClips(); };
    $('cpStart').onchange = function () {
      P.push();
      var st = Math.max(1, +this.value || 1), old = +d.clipStart || 1;
      d.clipStart = st; S.clips.forEach(function (c) { c.n = c.n - old + st; }); P.changed(); redrawBgAll(); renderClips();
    };
    $('cpAdds').onchange = function () { S.opt.clipAdds = this.checked; P.saveOpt(); renderClips(); };
    $('cpCopy').onchange = function () { S.opt.clipCopy = this.checked; P.saveOpt(); };
    $('cpFrames').onchange = function () { S.opt.clipFrames = this.checked; P.saveOpt(); redrawBgAll(); };
    $('cpNext').onclick = function () {
      if (!S.clips.length) return;
      if (nextCopy >= S.clips.length) nextCopy = 0;
      var c = S.clips[nextCopy];
      clipImage(c).then(function (im) { return P.copyBlob(im.blob); }).then(function () {
        c.copied = true; P.toast('نُسخ «' + labelOf(c) + '» (' + (nextCopy + 1) + ' من ' + S.clips.length + ') — الصقه ثم اضغط «نسخ التالي»');
        nextCopy = (nextCopy + 1) % S.clips.length; renderClips();
      }, function (e) { P.toast('تعذّر النسخ: ' + e.message, true); });
    };
    $('cpZip').onclick = zipAll;
    $('cpRenum').onclick = function () {
      P.push();
      S.clips.sort(function (a, b) { var ia = pageIndex(a.pid), ib = pageIndex(b.pid); return ia - ib || a.r.y - b.r.y || b.r.x - a.r.x; });
      var st = +d.clipStart || 1; S.clips.forEach(function (c, k) { c.n = st + k; });
      nextCopy = 0; P.changed(); redrawBgAll(); renderClips(); P.toast('أُعيد ترقيم الأسئلة حسب ترتيبها في الصفحات');
    };
    $('cpClear').onclick = function () {
      PdfUI.confirm('مسح كل الأسئلة من القائمة؟ (الصفحات لا تتغير)', 'مسح').then(function (ok) {
        if (!ok) return; P.push(); S.clips = []; nextCopy = 0; P.changed(); redrawBgAll(); count(); renderClips();
      });
    };
    each(box.querySelectorAll('[data-lab]'), function (inp) {
      inp.onchange = function () { P.push(); var c = S.clips[+this.dataset.lab]; var v = this.value.trim(); if (v && v !== labelOf(Object.assign({}, c, { label: '' }))) c.label = v; else delete c.label; P.changed(); };
      inp.onkeydown = function (e) { e.stopPropagation(); if (e.key === 'Enter') this.blur(); };
    });
    each(box.querySelectorAll('.clist li'), function (li) {
      var k = +li.dataset.k, c = S.clips[k];
      li.querySelector('[data-go]').onclick = function () { goClip(c); };
      each(li.querySelectorAll('[data-a]'), function (b) {
        b.onclick = function () {
          var a = b.dataset.a;
          if (a === 'go') goClip(c);
          if (a === 'copy') clipImage(c).then(function (im) { return P.copyBlob(im.blob); }).then(function () { c.copied = true; nextCopy = (k + 1) % S.clips.length; P.toast('نُسخ «' + labelOf(c) + '»'); renderClips(); }, function (e) { P.toast('تعذّر النسخ: ' + e.message, true); });
          if (a === 'png') clipImage(c).then(function (im) { P.download(PdfUI.safeName(labelOf(c)) + '.png', im.blob); });
          if (a === 'solve') solvePage(c);
          if (a === 'del') { P.push(); S.clips.splice(k, 1); if (nextCopy > k) nextCopy--; P.changed(); var i = pageIndex(c.pid); if (i >= 0) P.drawBg(i); count(); renderClips(); }
        };
      });
    });
  }
  function goClip(c) {
    var i = pageIndex(c.pid); if (i < 0) return;
    P.goto(i);
    var v = $('viewer'), el = P.pageEl(i), s = S.zoom * 96 / 72, cr = P.cropOf(S.pages[i]);
    v.scrollTop = el.offsetTop + (c.r.y - cr.y) * s - 60;
  }
  function zipAll() {
    if (!S.clips.length) return;
    P.busy(true, 'جارٍ تجهيز الصور…');
    var files = [], chain = Promise.resolve(), used = {};
    S.clips.forEach(function (c, k) {
      chain = chain.then(function () {
        P.busy(true, 'جارٍ تجهيز الصور… ' + (k + 1) + ' / ' + S.clips.length);
        return clipImage(c).then(function (im) { return im.blob.arrayBuffer(); }).then(function (buf) {
          var nm = PdfUI.safeName((k + 1 < 10 ? '0' : '') + (k + 1) + ' - ' + labelOf(c)), n = nm, z = 2;
          while (used[n]) n = nm + ' (' + (z++) + ')';
          used[n] = 1; files.push({ name: n + '.png', data: new Uint8Array(buf) });
        }).catch(function () { /* page removed */ });
      });
    });
    chain.then(function () {
      var base = (deco().clipPrefix || S.name.replace(/\.pdf$/i, '')) + ' - الأسئلة';
      P.download(PdfUI.safeName(base) + '.zip', PdfUI.zip(files));
      P.toast('تم تنزيل ' + files.length + ' سؤالاً في ملف مضغوط');
    }).catch(function (e) { P.toast(e.message, true); }).then(function () { P.busy(false); });
  }
  // 3) a solution page for one question: the question on top, lined space below
  function solvePage(c) {
    var i = pageIndex(c.pid); if (i < 0) return;
    P.goto(i);
    var pg = P.pageOp('blank', 'half');
    if (!pg) return;
    pg.title = 'حل ' + labelOf(c);
    var k = S.pages.indexOf(pg);
    P.regionImage(i, c.r, { adds: false, sc: 3 }).then(function (im) {
      var box = { x: 30, y: 58, w: pg.w - 60, h: Math.min(260, pg.h * 0.33) };
      var sc = Math.min((box.w - 24) / c.r.w, (box.h - 30) / c.r.h, 1.6), w = c.r.w * sc, h = c.r.h * sc;
      var id = P.uid(); P.setAsset(id, im.url);
      pg.objs.push({ id: P.uid(), t: 'image', asset: id, x: box.x + (box.w - w) / 2, y: box.y + 22, w: w, h: h });
      P.changed(); P.drawBg(k); P.drawOverlay(k); P.markThumb(k);
      P.toast('صفحة حل «' + labelOf(c) + '» جاهزة — اكتب الحل أسفل السؤال');
    });
  }

  // ================================================================ 4) stamps
  var pending = null;
  function stampMenu() {
    var box = $('stampMenu'), all = PdfStamps.BUILT.concat(PdfStamps.custom().map(function (d, k) { return Object.assign({ custom: k }, d); }));
    box.innerHTML = '<div class="mh">اختر ختماً ثم انقر على الصفحة (يبقى للتكرار — Esc للإنهاء)</div><div class="sgrid">' +
      all.map(function (d, k) {
        var pv = PdfStamps.svg(d.ask === 'grade' ? Object.assign({}, d, { sub: '10 / 10' }) : d.ask === 'date' ? Object.assign({}, d, { text: PdfStamps.today() }) : d);
        return '<button data-k="' + k + '" title="' + esc(d.label || d.text || '') + '"><img src="data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(pv.svg))) + '" alt=""><span>' + esc(d.label || d.text || 'التاريخ') + '</span>' + (d.custom !== undefined ? '<i data-rm="' + d.custom + '" title="حذف">✕</i>' : '') + '</button>';
      }).join('') + '</div><button class="addst" data-new="1">＋ ختم خاص بنصك…</button>';
    each(box.querySelectorAll('[data-k]'), function (b) {
      b.onclick = function (e) {
        var rm = e.target.getAttribute('data-rm');
        if (rm !== null) { var l = PdfStamps.custom(); l.splice(+rm, 1); PdfStamps.saveCustom(l); stampMenu(); return; }
        $('stampPop').hidden = true; choose(all[+b.dataset.k]);
      };
    });
    box.querySelector('[data-new]').onclick = function () { $('stampPop').hidden = true; newStamp(); };
  }
  function choose(def) {
    var ready;
    if (def.ask === 'grade') {
      ready = PdfUI.open({
        title: 'ختم الدرجة',
        body: '<div class="crow"><label class="fld"><span>الدرجة</span><input id="g1" type="text" inputmode="decimal" value="' + esc(S.opt.lastGrade || '') + '"></label><label class="fld"><span>من</span><input id="g2" type="text" inputmode="decimal" value="' + esc(S.opt.lastTotal || '10') + '"></label></div>',
        ok: 'اختيار', validate: function (el) { return PdfUI.val(el, '#g1').trim() ? null : 'اكتب الدرجة'; }
      }).then(function (el) {
        if (!el) return null;
        var g = PdfUI.val(el, '#g1').trim(), t = PdfUI.val(el, '#g2').trim();
        S.opt.lastGrade = g; S.opt.lastTotal = t; P.saveOpt();
        return Object.assign({}, def, { sub: t ? g + ' / ' + t : g });
      });
    } else if (def.ask === 'date') ready = Promise.resolve(Object.assign({}, def, { text: PdfStamps.today() }));
    else ready = Promise.resolve(def);
    ready.then(function (d) {
      if (!d) return;
      var s = PdfStamps.svg(d);
      return Vector.fromSVG(s.svg).catch(function () { return s.svg; }).then(function (vec) {
        pending = { vec: vec, w: s.w, h: s.h, mark: !!d.mark, asset: null };
        P.setTool('stamp');
        P.toast('انقر على الصفحة لوضع الختم — Esc للإنهاء');
      });
    });
  }
  function placeStamp(i, pt) {
    if (!pending) return P.setTool('select');
    var p = S.pages[i], k = pending.mark ? 28 / pending.w : 0.72, w = pending.w * k, h = pending.h * k;
    P.push();
    if (!pending.asset) { pending.asset = P.uid(); P.setAsset(pending.asset, pending.vec); }
    var o = P.born({ id: P.uid(), t: 'svg', kind: 'stamp', asset: pending.asset, x: pt[0] - w / 2, y: pt[1] - h / 2, w: w, h: h, nw: w });
    p.objs.push(o); P.drawOverlay(i); P.markThumb(i);
  }
  function newStamp() {
    var colors = ['#c2352b', '#2e8b3a', '#0e9f9a', '#1f5fbf', '#7b3fb5', '#e07a00', '#1b2a30'];
    PdfUI.open({
      title: 'ختم خاص',
      body: '<label class="fld"><span>النص</span><input id="st" dir="auto" placeholder="مثل: تمت المراجعة"></label>' +
        '<div class="fld row"><span>اللون</span><span class="sw">' + colors.map(function (c, k) { return '<label><input type="radio" name="sc" value="' + c + '"' + (k ? '' : ' checked') + '><i style="background:' + c + '"></i></label>'; }).join('') + '</span></div>' +
        '<div class="fld"><span>الشكل</span><div class="radios inline"><label><input type="radio" name="sh" value="badge" checked> إطار</label><label><input type="radio" name="sh" value="circle"> دائرة</label><label><input type="radio" name="sh" value="ribbon"> شريط</label></div></div>',
      ok: 'حفظ واختيار', validate: function (el) { return PdfUI.val(el, '#st').trim() ? null : 'اكتب نص الختم'; }
    }).then(function (el) {
      if (!el) return;
      var d = { text: PdfUI.val(el, '#st').trim(), color: PdfUI.radio(el, 'sc'), shape: PdfUI.radio(el, 'sh') };
      var l = PdfStamps.custom(); l.push(d); PdfStamps.saveCustom(l);
      choose(d);
    });
  }
  $('stampBtn').onclick = function () { if (!S.pdf) return P.toast('افتح ملف PDF أولاً'); stampMenu(); P.popAt($('stampPop'), this); };

  // ================================================================ 3) templates for solution pages
  function tplMenu() {
    var cur = S.pages[S.cur], blank = cur && cur.src < 0, def = S.opt.tpl || '';
    var keys = Object.keys(PdfDecor.TEMPLATES);
    $('tplMenu').innerHTML = '<div class="mh">صفحة حل جديدة بقالب</div>' +
      keys.map(function (k) { return '<button data-new="' + k + '">' + (k === def ? '● ' : '○ ') + esc(PdfDecor.TEMPLATES[k]) + '</button>'; }).join('') +
      (blank ? '<div class="mh">تغيير قالب هذه الصفحة</div>' + keys.map(function (k) { return '<button data-set="' + k + '">' + ((cur.tpl || '') === k ? '✓ ' : '') + esc(PdfDecor.TEMPLATES[k]) + '</button>'; }).join('') : '') +
      '<div class="mnote">القالب المختار يصبح الافتراضي لزر «صفحة حل».</div>';
    each($('tplMenu').querySelectorAll('[data-new]'), function (b) { b.onclick = function () { $('tplPop').hidden = true; S.opt.tpl = b.dataset.new; P.saveOpt(); P.pageOp('blank', b.dataset.new); }; });
    each($('tplMenu').querySelectorAll('[data-set]'), function (b) { b.onclick = function () { $('tplPop').hidden = true; P.pageOp('tpl', b.dataset.set); }; });
  }
  $('tplBtn').onclick = function () { if (!S.pdf) return; tplMenu(); P.popAt($('tplPop'), this); };

  // ================================================================ 2) solution mode + student preview
  S.solMode = false; S.opt.solMode = false; S.preview = false;
  function syncModes() {
    $('solModeBtn').setAttribute('aria-pressed', String(!!S.solMode));
    $('previewBtn').setAttribute('aria-pressed', String(!!S.preview));
    document.body.classList.toggle('preview', !!S.preview);
  }
  $('solModeBtn').onclick = function () {
    S.solMode = !S.solMode; S.opt.solMode = S.solMode; P.saveOpt(); syncModes();
    P.toast(S.solMode ? 'وضع الحل: ما تضيفه الآن يُحذف من نسخة الطالب' : 'وضع عادي: ما تضيفه الآن يظهر في نسخة الطالب أيضاً');
  };
  $('previewBtn').onclick = function () {
    S.preview = !S.preview; syncModes();
    if (S.sel) P.select(null, null);
    S.pages.forEach(function (p, i) { P.drawOverlay(i); });
    P.toast(S.preview ? 'معاينة نسخة الطالب: الحلول وصفحات الحل مخفية' : 'عُرضت الحلول');
  };

  // ================================================================ 6) page numbers & watermark
  function colorRadios(name, list, cur) {
    return '<span class="sw">' + list.map(function (c) { return '<label><input type="radio" name="' + name + '" value="' + c + '"' + (c === cur ? ' checked' : '') + '><i style="background:' + c + '"></i></label>'; }).join('') + '</span>';
  }
  function numDialog() {
    var d = deco(), old = JSON.stringify(d.num || null), o = Object.assign({ on: true, fmt: 'n', pos: 'bc', start: 1, size: 11, color: '#4a5f66' }, d.num || {});
    var F = { n: '1', dash: '- 1 -', of: '1 / 20', ar: 'صفحة 1', arOf: 'صفحة 1 من 20' };
    var POS = { bc: 'أسفل — وسط', br: 'أسفل — يمين', bl: 'أسفل — يسار', tc: 'أعلى — وسط', tr: 'أعلى — يمين', tl: 'أعلى — يسار' };
    PdfUI.open({
      title: 'ترقيم الصفحات',
      body: '<label class="chk"><input type="checkbox" id="non"' + (o.on ? ' checked' : '') + '> إظهار أرقام الصفحات</label>' +
        '<div class="crow"><label class="fld"><span>الشكل</span><select id="nfmt">' + Object.keys(F).map(function (k) { return '<option value="' + k + '"' + (k === o.fmt ? ' selected' : '') + '>' + F[k] + '</option>'; }).join('') + '</select></label>' +
        '<label class="fld"><span>المكان</span><select id="npos">' + Object.keys(POS).map(function (k) { return '<option value="' + k + '"' + (k === o.pos ? ' selected' : '') + '>' + POS[k] + '</option>'; }).join('') + '</select></label></div>' +
        '<div class="crow"><label class="fld sm"><span>يبدأ من</span><input id="nst" type="number" min="0" value="' + (o.start || 1) + '"></label><label class="fld sm"><span>الحجم</span><input id="nsz" type="number" min="7" max="30" value="' + (o.size || 11) + '"></label></div>' +
        '<div class="fld row"><span>اللون</span>' + colorRadios('ncol', ['#4a5f66', '#1b2a30', '#0e9f9a', '#c2352b', '#1f5fbf'], o.color) + '</div>' +
        '<label class="chk"><input type="checkbox" id="nskip"' + (o.skipFirst ? ' checked' : '') + '> بدون رقم على الصفحة الأولى (الغلاف)</label>' +
        '<label class="chk"><input type="checkbox" id="neast"' + (o.eastern ? ' checked' : '') + '> أرقام هندية (١ ٢ ٣)</label>' +
        '<label class="chk"><input type="checkbox" id="nbook"' + (o.onlyBook ? ' checked' : '') + '> على صفحات الكتاب فقط (بدون صفحات الحل)</label>' +
        '<p class="dlg-note">يظهر الترقيم على الشاشة الآن ويُحفظ في ملف PDF. في نسخة الطالب يُرقَّم تسلسلياً بعد حذف صفحات الحل.</p>',
      ok: 'تطبيق',
      onOpen: function (el) {
        var live = function () { d.num = read(el); redrawBgAll(); };
        each(el.querySelectorAll('input,select'), function (x) { x.addEventListener('input', live); x.addEventListener('change', live); });
        live();
      }
    }).then(function (el) {
      if (!el) { d.num = JSON.parse(old); if (!d.num) delete d.num; redrawBgAll(); return; }
      var nv = read(el); d.num = JSON.parse(old); if (!d.num) delete d.num; P.push(); d.num = nv; P.changed(); redrawBgAll();
    });
    function read(el) {
      return { on: PdfUI.val(el, '#non'), fmt: PdfUI.val(el, '#nfmt'), pos: PdfUI.val(el, '#npos'), start: +PdfUI.val(el, '#nst') || 1, size: +PdfUI.val(el, '#nsz') || 11,
        color: PdfUI.radio(el, 'ncol'), skipFirst: PdfUI.val(el, '#nskip'), eastern: PdfUI.val(el, '#neast'), onlyBook: PdfUI.val(el, '#nbook') };
    }
  }
  function wmDialog() {
    var d = deco(), old = JSON.stringify(d.wm || null), o = Object.assign({ on: true, text: '', opacity: 0.12, color: '#0e9f9a', angle: -35, pos: 'center', scope: 'all', size: 0, imgScale: 0.45 }, d.wm || {});
    PdfUI.open({
      title: 'علامة مائية', wide: true,
      body: '<label class="chk"><input type="checkbox" id="won"' + (o.on ? ' checked' : '') + '> إظهار العلامة المائية</label>' +
        '<label class="fld"><span>النص</span><input id="wtx" dir="auto" placeholder="مثل: اسمك أو «تطبيق راجع»" value="' + esc(o.text || '') + '"></label>' +
        '<div class="fld row"><span>الشعار</span><button type="button" class="chip" id="wimg">' + (o.img ? '🖼 تغيير الشعار' : '🖼 إضافة شعار (PNG/JPG)') + '</button>' + (o.img ? '<button type="button" class="chip danger" id="wnoimg">إزالة</button>' : '') + '</div>' +
        '<div class="crow"><label class="fld"><span>الشفافية</span><input id="wop" type="range" min="0.04" max="0.5" step="0.01" value="' + o.opacity + '"></label>' +
        '<label class="fld"><span>حجم النص</span><input id="wsz" type="range" min="0" max="120" step="2" value="' + (o.size || 0) + '" title="0 = تلقائي"></label>' +
        '<label class="fld"><span>حجم الشعار</span><input id="wis" type="range" min="0.15" max="0.9" step="0.05" value="' + (o.imgScale || 0.45) + '"></label></div>' +
        '<div class="fld row"><span>اللون</span>' + colorRadios('wcol', ['#0e9f9a', '#c2352b', '#1f5fbf', '#1b2a30', '#7b3fb5', '#e07a00'], o.color) + '</div>' +
        '<div class="fld"><span>الوضع</span><div class="radios inline"><label><input type="radio" name="wps" value="diag"' + (o.pos !== 'bottom' && o.angle ? ' checked' : '') + '> مائل في الوسط</label><label><input type="radio" name="wps" value="flat"' + (o.pos !== 'bottom' && !o.angle ? ' checked' : '') + '> أفقي في الوسط</label><label><input type="radio" name="wps" value="bottom"' + (o.pos === 'bottom' ? ' checked' : '') + '> أسفل الصفحة</label></div></div>' +
        '<div class="fld"><span>على</span><div class="radios inline"><label><input type="radio" name="wsc" value="all"' + (o.scope !== 'sol' ? ' checked' : '') + '> كل الصفحات</label><label><input type="radio" name="wsc" value="sol"' + (o.scope === 'sol' ? ' checked' : '') + '> صفحات الحل فقط</label></div></div>',
      ok: 'تطبيق',
      onOpen: function (el) {
        var live = function () { d.wm = read(el); redrawBgAll(); };
        each(el.querySelectorAll('input,select'), function (x) { x.addEventListener('input', live); x.addEventListener('change', live); });
        el.querySelector('#wimg').onclick = function () {
          $('wmInp').onchange = function () {
            var f = this.files[0]; this.value = ''; if (!f) return;
            var rd = new FileReader();
            rd.onload = function () {
              var img = new Image();
              img.onload = function () {
                var k = Math.min(1, 900 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
                cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
                cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
                var id = P.uid(); P.setAsset(id, cv.toDataURL('image/png'));
                o.img = id; o.imgRatio = cv.height / cv.width; live();
                el.querySelector('#wimg').textContent = '🖼 تغيير الشعار';
              };
              img.src = rd.result;
            };
            rd.readAsDataURL(f);
          };
          $('wmInp').click();
        };
        var rmb = el.querySelector('#wnoimg'); if (rmb) rmb.onclick = function () { delete o.img; rmb.remove(); live(); };
        live();
      }
    }).then(function (el) {
      if (!el) { d.wm = JSON.parse(old); if (!d.wm) delete d.wm; redrawBgAll(); return; }
      var wv = read(el); d.wm = JSON.parse(old); if (!d.wm) delete d.wm; P.push(); d.wm = wv; P.changed(); redrawBgAll();
    });
    function read(el) {
      var ps = PdfUI.radio(el, 'wps');
      return { on: PdfUI.val(el, '#won'), text: PdfUI.val(el, '#wtx').trim(), opacity: +PdfUI.val(el, '#wop'), size: +PdfUI.val(el, '#wsz') || 0, imgScale: +PdfUI.val(el, '#wis'),
        color: PdfUI.radio(el, 'wcol'), angle: ps === 'diag' ? -35 : 0, pos: ps === 'bottom' ? 'bottom' : 'center', scope: PdfUI.radio(el, 'wsc'), img: o.img, imgRatio: o.imgRatio };
    }
  }

  // ================================================================ 10) offline + install, keyboard help
  var swReg = null;
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.)/.test(location.hostname))) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('pdf-sw.js').then(function (r) { swReg = r; }).catch(function () { /* offline mode unavailable */ });
    });
    navigator.serviceWorker.addEventListener('message', function (e) {
      var m = e.data || {};
      if (m.type === 'precache-progress') P.busy(true, 'تجهيز العمل بدون إنترنت… ' + m.done + ' / ' + m.total);
      if (m.type === 'precache-done') { P.busy(false); P.toast(m.failed ? 'جُهّز الاستوديو للعمل بدون إنترنت (تعذّر ' + m.failed + ' ملف)' : 'جاهز للعمل بدون إنترنت — افتح نفس الرابط ولو انقطع الاتصال'); }
    });
  }
  function offline() {
    if (!('serviceWorker' in navigator)) return P.toast('متصفحك لا يدعم العمل بدون إنترنت', true);
    navigator.serviceWorker.ready.then(function (r) {
      P.busy(true, 'تجهيز العمل بدون إنترنت…');
      (r.active || navigator.serviceWorker.controller).postMessage({ type: 'precache-all' });
    }, function () { P.toast('تعذّر التجهيز — افتح الصفحة من الموقع (https)', true); });
  }
  var installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; $('installBtn').hidden = false; });
  $('installBtn').onclick = function () { if (!installEvt) return; installEvt.prompt(); installEvt.userChoice.then(function () { installEvt = null; $('installBtn').hidden = true; }); };
  window.addEventListener('appinstalled', function () { $('installBtn').hidden = true; P.toast('ثُبّت الاستوديو — تجده في قائمة البرامج'); });

  function keysHelp() {
    var K = [['V', 'تحديد'], ['H', 'يد'], ['T', 'نص'], ['P', 'قلم'], ['Y', 'تظليل'], ['R / O', 'مستطيل / دائرة'], ['L / A', 'خط / سهم'], ['W', 'تغطية بيضاء'], ['E', 'ممحاة'], ['S', 'لقطة'], ['Q', 'قص سؤال'], ['N', 'ملاحظة'], ['M', 'معادلة'],
      ['Shift + نقر', 'إضافة عنصر للتحديد'], ['اسحب في مكان فارغ', 'تحديد بمربع'], ['Ctrl + A', 'تحديد كل عناصر الصفحة'], ['Ctrl + G / Ctrl + Shift + G', 'تجميع / فك التجميع'], ['Ctrl + D', 'تكرار'], ['Ctrl + C / V', 'نسخ / لصق'],
      ['الأسهم (Shift = 10)', 'تحريك دقيق'], ['Alt أثناء السحب', 'بدون خطوط إرشاد'], ['Ctrl + Z / Y', 'تراجع / إعادة'], ['Ctrl + S', 'حفظ PDF'], ['Ctrl + عجلة الفأرة', 'تكبير وتصغير'], ['Ctrl / Shift + نقر على الصفحات', 'تحديد عدة صفحات'], ['Delete', 'حذف العنصر أو الصفحات المحددة']];
    K = K.concat([['الأشكال', 'زر «الأشكال ▾»: أكثر من 180 شكلاً — اسحب لرسمه، نقرة تضعه بحجم افتراضي'], ['Shift أثناء رسم/تغيير حجم شكل', 'نسب ثابتة (وزاوية 15° للخطوط)'], ['Alt أثناء رسم/تغيير حجم شكل', 'من المركز'], ['المقبض الدائري فوق الشكل', 'تدوير (Shift = 15°)'], ['المقبض الأصفر ◆', 'تعديل شكل (استدارة الزوايا، رأس السهم، ذيل الفقاعة…)'], ['نقرتان على شكل', 'كتابة نص داخله'], ['خطوط متعددة النقاط', 'انقر النقاط — Enter أو نقرتان للإنهاء، Backspace يحذف آخر نقطة، Esc للإلغاء'], ['تحرير نص', 'أداة «تحرير نص» (الرئيسية): انقر على نص في ملف نصي لتغطيته وكتابة بديله']]);
    PdfUI.open({ title: 'اختصارات لوحة المفاتيح', body: '<table class="keys">' + K.map(function (k) { return '<tr><td><kbd>' + esc(k[0]) + '</kbd></td><td>' + esc(k[1]) + '</td></tr>'; }).join('') + '</table>', ok: 'تم', cancel: false, wide: true });
  }
  function diag() {
    var c = window.ArLog ? ArLog.counts() : { error: 0 };
    PdfUI.open({
      title: 'سجل الأخطاء', wide: true,
      body: '<p class="dlg-msg">الأخطاء المسجّلة في هذا المتصفح: <b>' + (c.error || 0) + '</b>. انسخ السجل وأرسله للمطوّر إذا واجهت مشكلة.</p>' +
        '<textarea id="lg" rows="12" readonly dir="ltr" style="font:11px Consolas,monospace">' + esc(window.ArLog && ArLog.list().length ? ArLog.report(80) : 'لا توجد أخطاء مسجّلة ✓') + '</textarea>',
      ok: '📋 نسخ السجل', cancel: 'إغلاق',
      extra: '<button type="button" class="btn ghost" data-a="st">🩺 الفحص الذاتي</button><button type="button" class="btn ghost danger" data-a="clr">مسح</button>',
      onOpen: function (el, close) {
        var f = el.parentNode;
        f.querySelector('[data-a=st]').onclick = function () { close(null); window.open('selftest.html', '_blank'); };
        f.querySelector('[data-a=clr]').onclick = function () { ArLog.clear(); el.querySelector('#lg').value = 'لا توجد أخطاء مسجّلة ✓'; };
      }
    }).then(function (el) {
      if (!el) return;
      var t = ArLog.report(80);
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { P.toast('نُسخ السجل — أرسله للمطوّر'); }, function () { P.toast('تعذّر النسخ', true); });
    });
  }
  each(document.querySelectorAll('#setPop [data-x]'), function (b) {
    b.onclick = function () {
      $('setPop').hidden = true;
      var x = b.dataset.x;
      if ((x === 'num' || x === 'wm') && !S.pdf) return P.toast('افتح ملف PDF أولاً');
      if (x === 'num') numDialog(); else if (x === 'wm') wmDialog(); else if (x === 'offline') offline(); else if (x === 'keys') keysHelp(); else if (x === 'diag') diag();
    };
  });

  // ================================================================ hooks called by app.js
  function print() {
    P.busy(true, 'جارٍ تجهيز الطباعة…');
    P.buildPdf({ student: !!S.preview }).then(function (bytes) {
      var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      var f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
      f.onload = function () {
        setTimeout(function () {
          try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { window.open(url, '_blank'); }
        }, 300);
        setTimeout(function () { f.remove(); URL.revokeObjectURL(url); }, 120000);
      };
      f.src = url; document.body.appendChild(f);
      P.toast(S.preview ? 'طباعة نسخة الطالب (بدون الحلول)' : 'طباعة النسخة الكاملة — لنسخة الطالب فعّل «نسخة الطالب» أولاً');
    }).catch(function (e) { P.toast('تعذّرت الطباعة: ' + e.message, true); }).then(function () { P.busy(false); });
  }
  function onOpen() { nextCopy = 0; thumbCache = {}; count(); if (window.PdfText) PdfText.reset(); if (tab === 'clips') renderClips(); syncModes(); }
  function refresh() { count(); redrawBgAll(); if (tab === 'clips') renderClips(); }
  function sync() { /* reserved: toolbar state that depends on the selection */ }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && S.tool === 'stamp') { pending = null; P.setTool('select'); }
  });
  syncModes();
  // opened from the installed app with a PDF ("open with")
  if ('launchQueue' in window) window.launchQueue.setConsumer(function (params) {
    if (params.files && params.files[0]) params.files[0].getFile().then(function (f) { P.openFile(f); });
  });
  window.PdfExt = { print: print, addClip: addClip, frames: frames, placeStamp: placeStamp, onOpen: onOpen, refresh: refresh, sync: sync, clipImage: clipImage, renderClips: renderClips, setTab: setTab, solvePage: solvePage, labelOf: labelOf };
})();
