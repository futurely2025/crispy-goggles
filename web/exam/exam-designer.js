/*
 * exam-designer.js — "مصمم الحل والشرح": choose which solution fields appear, their labels, size, colour and order,
 * how the correct answer is marked, with a live preview. Works with any template; saved presets stay on this PC.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'exam.designer';
  var PRESETS = [['none', 'بدون حل'], ['answer', 'الإجابة فقط'], ['explain', 'إجابة + تصحيح + شرح'], ['full', 'كامل']];
  var SAMPLE = { ANSWER_FULL: 'أ) طرابلس', CORRECTION: 'العبارة الصحيحة تُكتب هنا', EXPLANATION: 'ورد في الكتاب (الباب الأول) ما نصّه: …', CLARIFICATION: 'توضيح مختصر للفكرة …',
    STEPS: '• الخطوة الأولى • الخطوة الثانية', IDEA: 'الفكرة التي يقوم عليها السؤال', TRANSLATION: 'ترجمة نص السؤال', SOURCE: 'الباب الأول / الدرس الثالث / الصفحة 15', TIME: '30 ثانية', DIFFICULTY: 'متوسط', NOTE: 'ملاحظة إضافية' };
  var CIRCLES = [['ring', 'دائرة ملوّنة على الصحيح (◉)'], ['oval', 'بيضاوي مرسوم حول الإجابة (كخط اليد)'], ['bubble', 'نقطة ● مقابل ○'], ['check', 'علامة ✔ وتظليل'], ['tickEnd', 'علامة ✔ في آخر السطر'], ['star', 'نجمة ★'], ['arrow', 'سهم ➤'], ['shade', 'تظليل ملوّن فقط'], ['highlight', 'تحديد أصفر (هايلايتر)'], ['box', 'إطار حول الإجابة'], ['underline', 'خط مزدوج تحت الإجابة'], ['bold', 'خط عريض ملوّن فقط'], ['none', 'بدون تمييز']];

  var st = { mode: 'template', layout: null, presets: [], sel: '' }, selPreset = -1, selT = '';

  function load() {
    try { var j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j) st = Object.assign(st, j); } catch (e) { /* ignore */ }
    if (!st.layout) st.layout = ExamCore.layoutPreset('full');
    st.layout = fix(st.layout); st.presets = (st.presets || []).map(function (p) { return { name: p.name, layout: fix(p.layout) }; });
    selPreset = -1;
    st.presets.forEach(function (p, i) { if (p.name === st.sel) selPreset = i; });
    if (st.mode === 'custom' && selPreset < 0) {                  // older versions kept one unnamed custom design: give it a name
      st.presets.push({ name: uniqueName('تصميمي'), layout: clone(st.layout) }); selPreset = st.presets.length - 1; st.sel = st.presets[selPreset].name;
    }
    if (selPreset < 0) st.mode = 'template'; else { st.mode = 'custom'; st.layout = clone(st.presets[selPreset].layout); }
  }
  function uniqueName(base) {
    var n = base, k = 2, has = function (x) { return st.presets.some(function (p) { return p.name === x; }); };
    while (has(n)) n = base + ' ' + (k++);
    return n;
  }
  function fix(L) {                                   // layouts saved by older versions get the newer options and fields
    var d = ExamCore.layoutPreset('none');
    Object.keys(d).forEach(function (k) { if (k !== 'fields' && L[k] === undefined) L[k] = d[k]; });
    var have = {}; (L.fields || []).forEach(function (f) { have[f.key] = 1; });
    d.fields.forEach(function (f) { if (!have[f.key]) { f.show = false; (L.fields = L.fields || []).push(f); } });
    return L;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function hash(c) { return '#' + String(c || '000000').replace('#', ''); }

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'on') Object.keys(attrs.on).forEach(function (ev) { e.addEventListener(ev, attrs.on[ev]); });
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function changed() {                                 // every edit is saved under the selected design's name
    if (selPreset >= 0 && st.presets[selPreset]) { st.presets[selPreset].layout = clone(st.layout); st.sel = st.presets[selPreset].name; }
    save(); preview();
  }

  var PV = [['mcq', 'اختيار من متعدد'], ['tf', 'صح وخطأ'], ['match', 'وصل']];
  var MATCH_FIELDS = { EXPLANATION: 1, CLARIFICATION: 1, SOURCE: 1, TIME: 1, DIFFICULTY: 1, NOTE: 1, STEPS: 1, IDEA: 1, TRANSLATION: 1 };
  function fieldsFor(pv) {                              // fields that can appear under this kind of question
    return st.layout.fields.filter(function (f) { return pv === 'match' ? MATCH_FIELDS[f.key] : (pv === 'mcq' ? f.key !== 'CORRECTION' : true); });
  }
  function preview() {
    var L = st.layout, box = $('dsPreview'); box.innerHTML = '';
    var pv = st.pv || 'mcq';
    var sz = function (n) { return (n / 2) + 'pt'; }, tw = function (n) { return (n / 20) + 'pt'; };
    var tag = function (e, t) { e.setAttribute('data-t', t); e.classList.add('ds-hit'); if (t === selT) e.classList.add('ds-sel'); return e; };
    var line = function (txt, css, t) { var d = el('div', { text: txt }); d.style.cssText = css; if (t) tag(d, t); box.appendChild(d); return d; };
    var qs = +L.qSize || 22, os = +L.optSize || qs;
    var ok = hash(L.okColor), bad = hash(L.badColor), style = L.circles;
    var stem = { mcq: 'ما عاصمة ليبيا؟', tf: 'مدينة بنغازي هي عاصمة ليبيا.', match: 'س 1 إلى س 3) أسئلة المزاوجة (التوصيل):' }[pv];
    var q = el('div', {});
    var num = el('span', { text: pv === 'match' ? '' : String(L.numFormat || 'س {n})').replace(/\{n\}/g, '1') + new Array((+L.numGap || 0) + 1).join(' ') + ' ' });
    var tx = el('span', { text: stem });
    num.style.cssText = 'color:' + (L.numColor ? hash(L.numColor) : L.qColor ? hash(L.qColor) : 'inherit') + ';font-weight:' + (L.numBold !== false ? 700 : 400) + ';font-size:' + sz(+L.numSize || qs) + (L.numFont ? ';font-family:"' + L.numFont + '",sans-serif' : '') + (L.numItalic ? ';font-style:italic' : '');
    tx.style.cssText = 'color:' + (L.qColor ? hash(L.qColor) : 'inherit') + ';font-weight:' + (L.qBold !== false ? 700 : 400) + (L.qFont ? ';font-family:"' + L.qFont + '",sans-serif' : '') + (L.qItalic ? ';font-style:italic' : '');
    q.style.cssText = 'font-size:' + sz(qs) + ';margin:' + tw(+L.spaceBefore || 0) + ' 0 ' + tw(+L.spaceAfter || 0);
    if (pv !== 'match') tag(num, 'num');
    tag(tx, 'q'); q.appendChild(num); q.appendChild(tx); box.appendChild(q);

    var ovalCss = function (bad) {
      var k = bad ? 'ovalBad' : 'oval', n = function (x, d) { return L[k + x] == null || L[k + x] === '' ? d : +L[k + x]; };
      var w = n('W', 100) / 100, h = n('H', 100) / 100;
      return 'position:relative;padding:' + (2 * h).toFixed(1) + 'px ' + (16 * w).toFixed(1) + 'px;transform:translate(' + n('Side', 0) + 'px,' + (-n('Up', 0)) + 'px) rotate(-1.5deg);';
    };
    var optCss = function (correct, isBad) {
      var css = 'margin:' + tw(+L.optGap || 0) + ' 18px;font-size:' + sz(os) + ';';
      if (correct && style !== 'none') {
        var ck = isBad ? bad : ok;
        css += 'font-weight:700;color:' + ck + ';display:inline-block;';
        if (style === 'ring' || style === 'check' || style === 'shade') css += 'background:' + ck + '1f;border-radius:4px;padding:0 4px;';
        if (style === 'highlight') css += 'background:#ffff00;padding:0 4px;';
        if (style === 'box') css += 'border:1.5px solid ' + ck + ';padding:0 4px;';
        if (style === 'underline') css += 'border-bottom:3px double ' + ck + ';';
        if (style === 'oval') css += 'border:2px solid ' + ck + ';border-radius:50%;' + ovalCss(isBad);
      } else css += 'color:' + (L.optColor ? hash(L.optColor) : '#222') + ';' + (L.optBold ? 'font-weight:700;' : '');
      if (L.optFont) css += 'font-family:"' + L.optFont + '",sans-serif;';
      if (L.optItalic) css += 'font-style:italic;';
      return css;
    };
    var MK = { ring: '◉ ', bubble: '● ', check: '✔ ', star: '★ ', arrow: '➤ ' };
    var mkOf = function (correct) { return correct ? (MK[style] || '') : (style === 'ring' || style === 'bubble' ? '○ ' : ''); };
    if (pv === 'mcq') {
      [['أ) طرابلس', true], ['ب) بنغازي', false], ['ج) سبها', false]].forEach(function (o) {
        line(mkOf(o[1]) + o[0] + (o[1] && style === 'tickEnd' ? ' ✔' : ''), optCss(o[1]), o[1] ? 'ok' : 'opt');
      });
    } else if (pv === 'tf') {
      var y = line(mkOf(false) + 'أ) صح', optCss(false) + (L.tfColors ? 'font-weight:700;color:' + hash(L.tfYesColor) + ';' : ''), L.tfColors ? 'tf' : 'opt');
      line(mkOf(true) + 'ب) خطأ' + (style === 'tickEnd' ? ' ✔' : ''), optCss(true, true), 'bad');
    } else {
      var soft = (L.matchColors && L.matchColors.length ? L.matchColors : ExamCore.softColors).map(function (c) { return hash(c); });
      var tbl = el('table', {}); tbl.style.cssText = 'border-collapse:collapse;width:100%;margin:6px 0;font-size:' + sz(os) + (L.optFont ? ';font-family:"' + L.optFont + '"' : '');
      [['الانكسار', 'تغير اتجاه الضوء بين وسطين'], ['وات', 'وحدة قياس القدرة'], ['زيجوت', 'بويضة ملقحة']].forEach(function (r, i) {
        var tr = el('tr', {}), c = L.matchTint !== false ? soft[i % soft.length] : '#fff';
        r.forEach(function (t) { var td = el('td', { text: t }); td.style.cssText = 'border:1px solid #c3c9d1;padding:3px 8px;background:' + c + ';color:' + (L.optColor ? hash(L.optColor) : '#222'); tr.appendChild(td); });
        tbl.appendChild(tr);
      });
      tag(tbl, 'match'); box.appendChild(tbl);
      if (L.matchKey !== false) { var kd = line('الحل: 1-ب، 2-أ، 3-ج', 'color:' + ok + ';font-weight:700;font-size:10pt;margin:4px 0', 'mk'); }
    }

    var any = false, shown = 0;
    fieldsFor(pv).forEach(function (f) {
      if (!f.show) return; any = true;
      var d = el('div', {}), a = el('b', { text: f.label ? f.label + (f.noColon ? ' ' : ': ') : '' }), b = el('span', { text: pv === 'tf' && f.key === 'ANSWER_FULL' ? 'ب) خطأ' : pv === 'tf' && f.key === 'CORRECTION' ? 'مدينة طرابلس هي عاصمة ليبيا.' : SAMPLE[f.key] || '' });
      if (f.icon && f.icon.dataUrl) { var im = el('img', { src: f.icon.dataUrl }); im.style.cssText = 'height:' + (+f.iconSize || 20) + 'px;vertical-align:middle;margin-inline-end:4px'; d.appendChild(im); }
      b.style.fontWeight = (f.textBold !== undefined ? f.textBold : f.key === 'ANSWER_FULL' && f.bold) ? '700' : '400';
      a.style.fontWeight = f.labelBold === false ? '400' : '700';
      a.style.color = hash(f.labelColor || f.color);
      d.style.cssText = 'color:' + hash(f.color) + ';font-size:' + sz(+f.sz || 20) + ';margin:2px 0;';
      var ff = f.font || L.fieldFont; if (ff) d.style.fontFamily = '"' + ff + '",sans-serif';
      if (f.italic) d.style.fontStyle = 'italic';
      tag(d, 'f:' + f.key);
      d.appendChild(a); d.appendChild(b); box.appendChild(d); shown++;
    });
    if (L.separator) line('', 'border-bottom:1px dotted #c3c9d1;margin:6px 0');
    if (!shown && style === 'none' && pv !== 'match') line('(لن يظهر أي حل أو شرح)', 'color:#8a94a3;font-size:12px');
    syncTabs(); syncChips();
  }
  function syncTabs() {
    var t = $('dsTabs'); if (!t) return;
    Array.prototype.forEach.call(t.children, function (b) { b.classList.toggle('on', b.getAttribute('data-pv') === (st.pv || 'mcq')); });
  }
  function syncChips() {                                // one chip per field: tap to show / hide it (the preview shows the result)
    var c = $('dsChips'); if (!c) return; c.innerHTML = '';
    var L = st.layout, pv = st.pv || 'mcq';
    var chip = function (label, on, fn) {
      var b = el('button', { type: 'button', class: 'ds-chip' + (on ? ' on' : ''), text: (on ? '✓ ' : '＋ ') + label, 'aria-pressed': String(!!on) });
      b.addEventListener('click', function () { fn(!on); changed(); render(); });
      c.appendChild(b);
    };
    fieldsFor(pv).forEach(function (f) {
      var def = ExamCore.fieldDefs.filter(function (d) { return d.key === f.key; })[0];
      chip(f.label || (def && def.label) || f.key, f.show, function (v) { f.show = v; if (v) selT = 'f:' + f.key; });
    });
    if (pv === 'match') chip('سطر «الحل»', L.matchKey !== false, function (v) { L.matchKey = v; });
    if (pv === 'match') chip('تلوين الأزواج', L.matchTint !== false, function (v) { L.matchTint = v; });
    if (pv === 'tf') chip('تلوين صح / خطأ', !!L.tfColors, function (v) { L.tfColors = v; });
    chip('فاصل بين الأسئلة', !!L.separator, function (v) { L.separator = v; });
  }

  // ---- click an element in the live preview to edit its size, colour, weight, slant and font right there
  function targetOf(t) {
    var L = st.layout, f;
    if (t === 'num') return { name: 'رقم السؤال', o: L, size: 'numSize', sizeAuto: function () { return +L.qSize || 22; }, color: 'numColor', colorAuto: true, bold: 'numBold', boldDef: true, italic: 'numItalic', font: 'numFont' };
    if (t === 'q') return { name: 'نص السؤال', o: L, size: 'qSize', color: 'qColor', colorAuto: true, bold: 'qBold', boldDef: true, italic: 'qItalic', font: 'qFont', nums: [['spaceBefore', 'مسافة فوق السؤال (نقطة)', 20, 0, 60], ['spaceAfter', 'مسافة تحت السؤال (نقطة)', 20, 0, 40]] };
    if (t === 'opt') return { name: 'الخيارات', o: L, size: 'optSize', sizeAuto: function () { return +L.qSize || 22; }, color: 'optColor', colorAuto: true, bold: 'optBold', boldDef: false, italic: 'optItalic', font: 'optFont', nums: [['optGap', 'مسافة بين الخيارات (نقطة)', 20, 0, 20]] };
    if (t === 'tf') return { name: 'كلمتا صح / خطأ', o: L, tfTargets: true };
    if (t === 'match') return { name: 'جدول الوصل', o: L, matchTargets: true };
    if (t === 'mk') return { name: 'سطر «الحل» (أسئلة الوصل)', o: L, color: 'okColor', hideKey: 'matchKey' };
    if (t === 'ok') return { name: 'الإجابة الصحيحة', o: L, color: 'okColor', styleSel: true, nums: L.circles === 'oval' ? [['ovalUp', 'رفع (+) أو خفض (−) البيضاوي، نصف نقطة', 0.5, -20, 20], ['ovalSide', 'إزاحة يمين (+) أو يسار (−)', 0.5, -40, 40], ['ovalW', 'العرض %', 1, 50, 200, 100], ['ovalH', 'الارتفاع %', 1, 50, 250, 100]] : null };
    if (t === 'bad') return { name: 'الإجابة «خطأ» في أسئلة صح وخطأ', o: L, color: 'badColor', nums: L.circles === 'oval' ? [['ovalBadUp', 'رفع (+) أو خفض (−) البيضاوي، نصف نقطة', 0.5, -20, 20], ['ovalBadSide', 'إزاحة يمين (+) أو يسار (−)', 0.5, -40, 40], ['ovalBadW', 'العرض %', 1, 50, 200, 100], ['ovalBadH', 'الارتفاع %', 1, 50, 250, 100]] : null };
    if (t.indexOf('f:') === 0) {
      f = L.fields.filter(function (x) { return 'f:' + x.key === t; })[0]; if (!f) return null;
      var def = ExamCore.fieldDefs.filter(function (d) { return d.key === f.key; })[0];
      return { name: 'حقل «' + (def ? def.label : f.key) + '»', o: f, hideField: f, size: 'sz', color: 'color', bold: 'textBold', boldDef: !!(f.bold && f.key === 'ANSWER_FULL'), italic: 'italic', font: 'font', labelColor: 'labelColor', labelBold: 'labelBold' };
    }
    return null;
  }
  function inspect() {
    var box = $('dsInspect'); if (!box) return; box.innerHTML = '';
    var T = selT && targetOf(selT);
    if (!T) { box.appendChild(el('p', { class: 'hint', text: 'اضغط على أي عنصر في المعاينة (رقم السؤال، نص السؤال، الخيارات، الإجابة الصحيحة، أو أي حقل) لتعديل حجمه ولونه وخطه هنا مباشرة.' })); return; }
    var o = T.o, sync = function () { render(); };            // keep the controls on the left in step
    var bar = el('div', { class: 'ds-bar' });
    bar.appendChild(el('b', { class: 'ds-name', text: T.name }));
    if (T.size) {
      var cur = function () { return (+o[T.size] || (T.sizeAuto ? T.sizeAuto() : 22)) / 2; };
      var si = el('input', { type: 'number', min: '4', max: '40', step: '0.5', value: String(cur()), 'aria-label': 'الحجم بالنقطة' });
      var setSize = function (v) { o[T.size] = Math.max(8, Math.min(80, Math.round(v * 2))); si.value = String(o[T.size] / 2); changed(); };
      si.addEventListener('input', function () { if (+si.value > 0) setSize(+si.value); }); si.addEventListener('change', sync);
      var stp = function (d) { return el('button', { type: 'button', class: 'btn sm', text: d > 0 ? '＋' : '－', title: d > 0 ? 'أكبر' : 'أصغر', on: { click: function () { setSize(cur() + d * 0.5); sync(); } } }); };
      bar.appendChild(el('span', { class: 'ds-grp' }, [el('span', { text: 'الحجم' }), stp(-1), si, stp(1), el('span', { text: 'نقطة' })]));
      if (T.sizeAuto) bar.appendChild(el('button', { type: 'button', class: 'btn sm', text: 'مثل السؤال', title: 'حجم تلقائي', on: { click: function () { o[T.size] = 0; si.value = String(cur()); changed(); sync(); } } }));
    }
    var colorCtl = function (key, label, auto) {
      var c = el('input', { type: 'color', value: hash(o[key] || (key === 'labelColor' ? o.color : '222222')), 'aria-label': label });
      c.addEventListener('input', function () { o[key] = c.value.replace('#', '').toUpperCase(); changed(); }); c.addEventListener('change', sync);
      var kids = [el('span', { text: label }), c];
      if (auto) kids.push(el('button', { type: 'button', class: 'btn sm', text: 'تلقائي', on: { click: function () { o[key] = ''; changed(); inspect(); sync(); } } }));
      return el('span', { class: 'ds-grp' }, kids);
    };
    if (T.color) bar.appendChild(colorCtl(T.color, T.labelColor ? 'لون النص' : 'اللون', T.colorAuto));
    if (T.labelColor) bar.appendChild(colorCtl(T.labelColor, 'لون العنوان'));
    var toggle = function (key, label, title, isOn, set) {
      var b = el('button', { type: 'button', class: 'btn sm ds-tg', text: label, title: title, 'aria-pressed': String(isOn()) });
      b.classList.toggle('on', isOn());
      b.addEventListener('click', function () { set(!isOn()); b.classList.toggle('on', isOn()); b.setAttribute('aria-pressed', String(isOn())); changed(); sync(); });
      return b;
    };
    var tg = [];
    if (T.bold) tg.push(toggle(T.bold, 'B', 'عريض', function () { return o[T.bold] === undefined ? !!T.boldDef : !!o[T.bold]; }, function (v) { o[T.bold] = v; }));
    if (T.italic) tg.push(toggle(T.italic, 'I', 'مائل', function () { return !!o[T.italic]; }, function (v) { o[T.italic] = v; }));
    if (T.labelBold) tg.push(toggle(T.labelBold, 'عنوان B', 'عنوان عريض', function () { return o[T.labelBold] !== false; }, function (v) { o[T.labelBold] = v; }));
    if (tg.length) bar.appendChild(el('span', { class: 'ds-grp' }, tg));
    if (T.font) {
      var fi = el('input', { type: 'text', list: 'dsFonts', placeholder: 'الخط (تلقائي)', value: o[T.font] || '', 'aria-label': 'الخط' });
      fi.addEventListener('input', function () { o[T.font] = fi.value.trim(); changed(); }); fi.addEventListener('change', sync);
      bar.appendChild(el('span', { class: 'ds-grp' }, [el('span', { text: 'الخط' }), fi]));
    }
    (T.nums || []).forEach(function (n) {
      var ni = el('input', { type: 'number', min: String(n[3]), max: String(n[4]), value: String(Math.round((o[n[0]] == null ? (n[5] || 0) : +o[n[0]] || 0) / n[2])), 'aria-label': n[1] });
      ni.addEventListener('input', function () { o[n[0]] = (+ni.value || 0) * n[2]; changed(); }); ni.addEventListener('change', sync);
      bar.appendChild(el('span', { class: 'ds-grp' }, [el('span', { text: n[1] }), ni]));
    });
    if (T.styleSel) {
      var cs2 = el('select', { 'aria-label': 'شكل التمييز' }, CIRCLES.map(function (c) { return el('option', { value: c[0], text: c[1] }); })); cs2.value = o.circles;
      cs2.addEventListener('change', function () { o.circles = cs2.value; changed(); inspect(); });
      bar.appendChild(el('span', { class: 'ds-grp' }, [el('span', { text: 'الشكل' }), cs2]));
    }
    var plain = function (text, cls, fn) { return el('button', { type: 'button', class: 'btn sm ' + cls, text: text, on: { click: fn } }); };
    if (T.hideField) bar.appendChild(plain('إخفاء هذا الحقل', 'danger', function () { T.hideField.show = false; selT = ''; changed(); render(); inspect(); }));
    if (T.hideKey) bar.appendChild(plain('إخفاء السطر', 'danger', function () { L2().matchKey = false; selT = ''; changed(); render(); inspect(); }));
    if (T.tfTargets) {
      bar.appendChild(toggle('tfColors', 'تلوين الكلمتين', 'تلوين صح وخطأ', function () { return !!o.tfColors; }, function (v) { o.tfColors = v; }));
      bar.appendChild(colorCtl('tfYesColor', 'لون صح')); bar.appendChild(colorCtl('tfNoColor', 'لون خطأ'));
    }
    if (T.matchTargets) {
      bar.appendChild(toggle('matchTint', 'تلوين الأزواج', 'تلوين كل زوج بلون خافت', function () { return o.matchTint !== false; }, function (v) { o.matchTint = v; }));
      bar.appendChild(toggle('matchKey', 'سطر «الحل»', 'إظهار سطر الحل تحت الجدول', function () { return o.matchKey !== false; }, function (v) { o.matchKey = v; }));
    }
    box.appendChild(bar);
  }
  function L2() { return st.layout; }
  function wirePreview() {
    var box = $('dsPreview');
    var tabs = $('dsTabs');
    if (tabs) PV.forEach(function (x) {
      tabs.appendChild(el('button', { type: 'button', class: 'ds-tab', 'data-pv': x[0], text: x[1], on: { click: function () { st.pv = x[0]; selT = ''; save(); preview(); inspect(); } } }));
    });
    var adv = $('dsAdv');
    if (adv) adv.addEventListener('click', function () { st.advanced = !st.advanced; save(); syncAdv(); });
    // mousedown (not click): a pending 'change' from an inspector field re-renders the preview between mousedown and mouseup
    box.addEventListener('mousedown', function (e) {
      var t = e.target.closest && e.target.closest('[data-t]'); if (!t) return;
      selT = t.getAttribute('data-t'); preview(); inspect();
    });
  }

  var EMOJIS = ['', '⏰', '🎯', '💡', '🔍', '📚', '📖', '✅', '❌', '⭐', '📝', '🧠', '⚠️', '📌', '🔑', '🕒', '🔥', '📎'];

  function shrink(file, cb) {                          // keep icons small so they fit in browser storage
    var rd = new FileReader();
    rd.onload = function () {
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, 96 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        cb({ dataUrl: c.toDataURL('image/png'), ext: 'png' });
      };
      img.onerror = function () { cb(null); };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  }

  function row(f, i, L) {
    var show = el('input', { type: 'checkbox' }); show.checked = !!f.show;
    show.addEventListener('change', function () { f.show = show.checked; changed(); });
    var label = el('input', { type: 'text', value: f.label, 'aria-label': 'عنوان الحقل', placeholder: 'العنوان' });
    label.addEventListener('input', function () { f.label = label.value; changed(); });
    var sz = el('input', { type: 'number', min: '12', max: '48', step: '1', value: String(f.sz), 'aria-label': 'الحجم' });
    sz.addEventListener('input', function () { f.sz = +sz.value || 20; changed(); });
    var col = el('input', { type: 'color', value: hash(f.color), 'aria-label': 'لون النص' });
    col.addEventListener('input', function () { f.color = col.value.replace('#', '').toUpperCase(); changed(); });
    var lcol = el('input', { type: 'color', value: hash(f.labelColor || f.color), 'aria-label': 'لون العنوان' });
    lcol.addEventListener('input', function () { f.labelColor = lcol.value.replace('#', '').toUpperCase(); changed(); });
    var emo = el('select', { 'aria-label': 'إيموجي', title: 'أضف إيموجي إلى العنوان' }, EMOJIS.map(function (e) { return el('option', { value: e, text: e || 'إيموجي…' }); }));
    emo.addEventListener('change', function () { if (!emo.value) return; label.value = emo.value + ' ' + label.value.replace(/^\S+\s/, function (m) { return EMOJIS.indexOf(m.trim()) > 0 ? '' : m; }); f.label = label.value; emo.value = ''; changed(); });
    var up = el('input', { type: 'file', accept: 'image/*', hidden: 'hidden' });
    up.addEventListener('change', function () { var fl = up.files[0]; if (fl) shrink(fl, function (ic) { if (ic) { f.icon = ic; changed(); render(); } }); });
    var icoBtn = el('button', { type: 'button', class: 'btn sm', text: f.icon ? 'تغيير الصورة' : 'صورة بدل الإيموجي', on: { click: function () { up.click(); } } });
    var kids = [emo, icoBtn, up];
    if (f.icon) {
      var isz = el('input', { type: 'number', min: '10', max: '60', value: String(f.iconSize || 20), 'aria-label': 'حجم الصورة' });
      isz.addEventListener('input', function () { f.iconSize = +isz.value || 20; changed(); });
      kids.push(el('label', { text: 'حجمها' }, [isz]), el('button', { type: 'button', class: 'btn sm danger', text: 'إزالة الصورة', on: { click: function () { delete f.icon; changed(); render(); } } }));
    }
    var ffont = el('input', { type: 'text', value: f.font || '', placeholder: 'خط', list: 'dsFonts', 'aria-label': 'خط الحقل' });
    ffont.addEventListener('input', function () { f.font = ffont.value.trim(); changed(); });
    var tbold = el('input', { type: 'checkbox' }); tbold.checked = f.textBold !== undefined ? !!f.textBold : (!!f.bold && f.key === 'ANSWER_FULL');
    tbold.addEventListener('change', function () { f.textBold = tbold.checked; changed(); });
    var lbold = el('input', { type: 'checkbox' }); lbold.checked = f.labelBold !== false;
    lbold.addEventListener('change', function () { f.labelBold = lbold.checked; changed(); });
    var ital = el('input', { type: 'checkbox' }); ital.checked = !!f.italic;
    ital.addEventListener('change', function () { f.italic = ital.checked; changed(); });
    var mv = function (d) { return function () { var j = i + d; if (j < 0 || j >= L.fields.length) return; var t = L.fields[i]; L.fields[i] = L.fields[j]; L.fields[j] = t; changed(); render(); }; };
    var def = ExamCore.fieldDefs.filter(function (d) { return d.key === f.key; })[0];
    return el('div', { class: 'ds-row' }, [
      el('label', { class: 'ds-show' }, [show, el('span', { text: def ? def.label : f.key })]),
      label, el('label', { text: 'الحجم' }, [sz]), el('label', { text: 'لون النص' }, [col]), el('label', { text: 'لون العنوان' }, [lcol]),
      el('label', { text: 'الخط' }, [ffont]), el('label', { class: 'chk' }, [lbold, el('span', { text: ' عنوان عريض' })]), el('label', { class: 'chk' }, [tbold, el('span', { text: ' نص عريض' })]), el('label', { class: 'chk' }, [ital, el('span', { text: ' مائل' })]),
      el('span', { class: 'ds-mv' }, [el('button', { type: 'button', class: 'btn sm', text: '↑', title: 'أعلى', on: { click: mv(-1) } }), el('button', { type: 'button', class: 'btn sm', text: '↓', title: 'أسفل', on: { click: mv(1) } })]),
      el('div', { class: 'ds-icons' }, kids)
    ]);
  }

  function render() {
    var L = st.layout, body = $('dsBody'); body.innerHTML = '';
    // answer marking
    var cs = el('select', {}, CIRCLES.map(function (c) { return el('option', { value: c[0], text: c[1] }); })); cs.value = L.circles;
    cs.addEventListener('change', function () { L.circles = cs.value; changed(); });
    var okc = el('input', { type: 'color', value: hash(L.okColor) }); okc.addEventListener('input', function () { L.okColor = okc.value.replace('#', '').toUpperCase(); changed(); });
    var badc = el('input', { type: 'color', value: hash(L.badColor) }); badc.addEventListener('input', function () { L.badColor = badc.value.replace('#', '').toUpperCase(); changed(); });
    var qs = el('input', { type: 'number', min: '16', max: '40', value: String(L.qSize) }); qs.addEventListener('input', function () { L.qSize = +qs.value || 22; changed(); });
    body.appendChild(el('div', { class: 'ds-grid' }, [
      el('label', { text: 'تمييز الإجابة الصحيحة' }, [cs]), el('label', { text: 'لون الصحيح' }, [okc]), el('label', { text: 'لون «خطأ» الصحيح' }, [badc]), el('label', { text: 'حجم نص السؤال (نصف نقطة: 22 = 11)' }, [qs])]));
    // numbering, spacing, colours
    function num(key, label, min, max, scale) {
      var i = el('input', { type: 'number', min: String(min), max: String(max), step: '1', value: String(Math.round((+L[key] || 0) / (scale || 1))) });
      i.addEventListener('input', function () { L[key] = (+i.value || 0) * (scale || 1); changed(); });
      return el('label', { text: label }, [i]);
    }
    function colour(key, label) {
      var on = el('input', { type: 'checkbox' }); on.checked = !L[key];
      var c = el('input', { type: 'color', value: hash(L[key] || '222222') });
      c.disabled = on.checked;
      on.addEventListener('change', function () { c.disabled = on.checked; L[key] = on.checked ? '' : c.value.replace('#', '').toUpperCase(); changed(); });
      c.addEventListener('input', function () { L[key] = c.value.replace('#', '').toUpperCase(); changed(); });
      return el('label', { text: label }, [c, el('span', { class: 'ds-auto' }, [on, el('span', { text: ' تلقائي' })])]);
    }
    var fm = el('input', { type: 'text', value: L.numFormat || 'س {n})', placeholder: 'س {n})' });
    fm.addEventListener('input', function () { L.numFormat = fm.value || 'س {n})'; changed(); });
    var fmSel = el('select', {}, [['', 'أنماط جاهزة…'], ['س {n})', 'س 1)'], ['س{n}-', 'س1-'], ['س {n}:', 'س 1:'], ['{n}.', '1.'], ['{n})', '1)'], ['Q{n}.', 'Q1.'], ['Q{n})', 'Q1)'], ['السؤال {n}:', 'السؤال 1:']].map(function (x) { return el('option', { value: x[0], text: x[1] }); }));
    fmSel.addEventListener('change', function () { if (!fmSel.value) return; L.numFormat = fm.value = fmSel.value; fmSel.value = ''; changed(); });
    var qb = el('input', { type: 'checkbox' }); qb.checked = L.qBold !== false; qb.addEventListener('change', function () { L.qBold = qb.checked; changed(); });
    var nb = el('input', { type: 'checkbox' }); nb.checked = L.numBold !== false; nb.addEventListener('change', function () { L.numBold = nb.checked; changed(); });
    body.appendChild(el('p', { class: 'hint', text: 'شكل رقم السؤال والمسافات والألوان:' }));
    body.appendChild(el('div', { class: 'ds-grid' }, [
      el('label', { text: 'شكل الرقم ({n} = رقم السؤال)' }, [fm]), el('label', { text: 'نمط جاهز' }, [fmSel]),
      num('numGap', 'مسافة بين الرقم والسؤال (عدد مسافات)', 0, 12), colour('numColor', 'لون الرقم'),
      colour('qColor', 'لون نص السؤال'), num('numSize', 'حجم الرقم (0 = مثل السؤال)', 0, 48),
      num('spaceBefore', 'مسافة فوق السؤال (نقطة)', 0, 60, 20), num('spaceAfter', 'مسافة بين السؤال وخياراته (نقطة)', 0, 40, 20),
      num('optGap', 'مسافة بين الخيارات (نقطة)', 0, 20, 20), num('optSize', 'حجم الخيارات (0 = مثل السؤال)', 0, 48), colour('optColor', 'لون الخيارات')]));
    function flag(key, label, dflt) {
      var c = el('input', { type: 'checkbox' }); c.checked = L[key] === undefined ? !!dflt : !!L[key];
      c.addEventListener('change', function () { L[key] = c.checked; changed(); });
      return el('label', { class: 'chk' }, [c, el('span', { text: ' ' + label })]);
    }
    function font(key, label) {
      var i = el('input', { type: 'text', value: L[key] || '', placeholder: 'تلقائي', list: 'dsFonts', 'aria-label': label });
      i.addEventListener('input', function () { L[key] = i.value.trim(); changed(); });
      return el('label', { text: label }, [i]);
    }
    body.appendChild(el('p', { class: 'hint', text: 'الخطوط (اتركها فارغة للخط التلقائي، أو اختر من القائمة أو اكتب اسم أي خط مثبّت على جهازك):' }));
    body.appendChild(el('div', { class: 'ds-grid' }, [font('numFont', 'خط رقم السؤال'), font('qFont', 'خط نص السؤال'), font('optFont', 'خط الخيارات'), font('fieldFont', 'خط الحقول (الشرح…)')]));
    var dl = el('datalist', { id: 'dsFonts' }, ['Fanan', 'KufiLT', 'Arial', 'Tahoma', 'Times New Roman', 'Traditional Arabic', 'Simplified Arabic', 'Sakkal Majalla', 'Calibri', 'Segoe UI', 'Courier New'].map(function (f) { return el('option', { value: f }); }));
    body.appendChild(dl);
    body.appendChild(el('div', { class: 'row' }, [
      el('label', { class: 'chk' }, [qb, el('span', { text: ' نص السؤال عريض' })]), flag('qItalic', 'نص السؤال مائل'),
      el('label', { class: 'chk' }, [nb, el('span', { text: ' رقم السؤال عريض' })]), flag('numItalic', 'رقم السؤال مائل'),
      flag('optBold', 'الخيارات عريضة'), flag('optItalic', 'الخيارات مائلة')]));
    var tfc = el('input', { type: 'checkbox' }); tfc.checked = !!L.tfColors; tfc.addEventListener('change', function () { L.tfColors = tfc.checked; changed(); });
    var yc = el('input', { type: 'color', value: hash(L.tfYesColor) }); yc.addEventListener('input', function () { L.tfYesColor = yc.value.replace('#', '').toUpperCase(); changed(); });
    var nc = el('input', { type: 'color', value: hash(L.tfNoColor) }); nc.addEventListener('input', function () { L.tfNoColor = nc.value.replace('#', '').toUpperCase(); changed(); });
    body.appendChild(el('div', { class: 'row' }, [el('label', { class: 'chk' }, [tfc, el('span', { text: ' تلوين كلمتي «صح» و«خطأ» في أسئلة الصواب والخطأ' })]), el('label', { text: 'لون صح' }, [yc]), el('label', { text: 'لون خطأ' }, [nc])]));
    // fields
    body.appendChild(el('p', { class: 'hint', text: 'الحقول التي تظهر تحت كل سؤال (علّم ما تريد، وغيّر العنوان والحجم واللون، ورتّبها بالأسهم):' }));
    L.fields.forEach(function (f, i) { body.appendChild(row(f, i, L)); });
    var mk = el('input', { type: 'checkbox' }); mk.checked = L.matchKey !== false; mk.addEventListener('change', function () { L.matchKey = mk.checked; changed(); });
    var sp = el('input', { type: 'checkbox' }); sp.checked = !!L.separator; sp.addEventListener('change', function () { L.separator = sp.checked; changed(); });
    body.appendChild(el('label', { class: 'chk' }, [mk, el('span', { text: ' سطر «الحل» تحت أسئلة الوصل (والشرح والتوضيح والمصدر… تظهر للوصل حسب الحقول المعلَّمة أعلاه)' })]));
    body.appendChild(el('label', { class: 'chk' }, [sp, el('span', { text: ' خط فاصل بين الأسئلة' })]));
    var mt = el('input', { type: 'checkbox' }); mt.checked = L.matchTint !== false; mt.addEventListener('change', function () { L.matchTint = mt.checked; changed(); });
    body.appendChild(el('label', { class: 'chk' }, [mt, el('span', { text: ' تلوين أزواج الوصل بألوان خافتة (كل زوج بلون)' })]));
    var cols = L.matchColors && L.matchColors.length ? L.matchColors : ExamCore.softColors.slice();
    body.appendChild(el('div', { class: 'row' }, cols.map(function (c, i) {
      var inp = el('input', { type: 'color', value: hash(c) });
      inp.addEventListener('input', function () { var a = cols.slice(); a[i] = inp.value.replace('#', '').toUpperCase(); L.matchColors = a; changed(); });
      return inp; })));
    preview();
  }

  function syncAdv() {                                // one button: detailed settings on / off
    var b = $('dsAdv'), body = $('dsBody'); if (!b || !body) return;
    body.hidden = !st.advanced; b.setAttribute('aria-pressed', String(!!st.advanced)); b.classList.toggle('on', !!st.advanced);
    b.textContent = st.advanced ? 'إخفاء الإعدادات المفصلة ▲' : 'إعدادات مفصلة (ترتيب، تسميات، أيقونات، أنماط الرقم…) ▼';
  }
  function applyMode() {
    st.mode = selPreset >= 0 ? 'custom' : 'template'; save();
    $('dsCustom').hidden = st.mode !== 'custom';
    pickUI();
    if (st.mode === 'custom') { render(); inspect(); syncAdv(); }
  }
  function choose(i) {                                 // i = -1 → the template's own design
    selPreset = i; st.sel = i >= 0 ? st.presets[i].name : '';
    if (i >= 0) st.layout = clone(st.presets[i].layout);
    selT = ''; applyMode();
  }
  function newDesign(base, name) {
    var layout = base ? clone(base) : ExamCore.layoutPreset('full');
    st.presets.push({ name: uniqueName(name || 'تصميمي'), layout: layout });
    choose(st.presets.length - 1);
    var ni = $('dsName'); if (ni) { ni.focus(); ni.select(); }
  }
  function pickUI() {
    var box = $('dsPickBox'); if (!box) return; box.innerHTML = '';
    var opts = [el('option', { value: '', text: 'حسب القالب المختار (كما صُمّم داخله)' })]
      .concat(st.presets.map(function (p, i) { return el('option', { value: String(i), text: '🎨 ' + p.name }); }))
      .concat([el('option', { value: '__new', text: '＋ تصميم جديد…' })]);
    var sel = el('select', { id: 'dsPick', 'aria-label': 'التصميم' }, opts);
    sel.value = selPreset >= 0 ? String(selPreset) : '';
    sel.addEventListener('change', function () { if (sel.value === '__new') newDesign(); else choose(sel.value === '' ? -1 : +sel.value); });
    box.appendChild(el('label', { text: 'تصميم الحل والشرح' }, [sel]));
    if (selPreset < 0) {
      box.appendChild(el('p', { class: 'hint', text: 'يُستعمل شكل الحل كما هو داخل القالب. اختر «تصميم جديد» أو أحد تصاميمك المحفوظة لتتحكم بكل شيء من المعاينة؛ وكل تعديل يُحفظ تلقائياً باسم التصميم.' }));
      return;
    }
    var nm = el('input', { id: 'dsName', type: 'text', value: st.presets[selPreset].name, 'aria-label': 'اسم التصميم', placeholder: 'اسم التصميم' });
    nm.addEventListener('input', function () {
      var v = nm.value.trim(); if (!v) return;
      st.presets[selPreset].name = v; st.sel = v; save();
      sel.options[selPreset + 1].textContent = '🎨 ' + v;
    });
    var dup = el('button', { type: 'button', class: 'btn sm', text: 'نسخ', title: 'نسخة جديدة من هذا التصميم', on: { click: function () { newDesign(st.layout, st.presets[selPreset].name + ' (نسخة)'); } } });
    var del = el('button', { type: 'button', class: 'btn sm danger', text: 'حذف', on: { click: function () {
      if (!window.confirm('حذف التصميم «' + st.presets[selPreset].name + '»؟')) return;
      st.presets.splice(selPreset, 1); choose(-1);
    } } });
    box.appendChild(el('div', { class: 'row ds-namerow' }, [el('label', { text: 'اسمه' }, [nm]), dup, del]));
    var start = el('div', { class: 'ds-start' }, [el('span', { text: 'ابدأ من:' })].concat(PRESETS.map(function (x) {
      return el('button', { type: 'button', class: 'btn sm', text: x[1], on: { click: function () { st.layout = ExamCore.layoutPreset(x[0]); changed(); render(); inspect(); } } });
    })));
    box.appendChild(start);
    box.appendChild(el('p', { class: 'hint', text: 'يُحفظ كل تعديل تلقائياً. غيّر الاسم من الخانة أعلاه.' }));
  }

  window.ExamDesigner = {
    /** layout object for buildDocx, or null to use the template's own blocks */
    get: function () { return st.mode === 'custom' ? st.layout : null; },
    /** names of saved designs (for tests / other panels) */
    names: function () { return st.presets.map(function (p) { return p.name; }); },
    init: function () {
      load(); wirePreview();
      applyMode();
    }
  };
})();
