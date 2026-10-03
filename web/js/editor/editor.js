/* Equation editor (MathType-like): visual MathLive field with RTL layer, LaTeX mode, chemistry mode. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var T = function (k) { return I18N.t(k); };

  // ------------------------------------------------------------ incoming data
  function parseHash() {
    var h = location.hash || '';
    var m = h.match(/[#&]d=([^&]*)/);
    if (!m) return {};
    try { return JSON.parse(decodeURIComponent(m[1])) || {}; } catch (e) { return {}; }
  }
  var init = parseHash();
  var host = init.host || (new URLSearchParams(location.search).get('host')) || (window.parent !== window ? 'frame' : 'web');

  // an equation captured from a PDF / scan: show the original next to the editor so it can be compared while editing
  (function () {
    if (!init.ref) return;
    var box = document.getElementById('refBox'); if (!box) return;
    document.getElementById('refImg').src = init.ref; box.hidden = false;
    var w = document.getElementById('refWarn'); if (w) { w.textContent = init.warn || ''; if (init.bad) w.className = 'bad'; }
    var x = document.getElementById('refX'); if (x) x.onclick = function () { box.hidden = true; };
  })();

  var saved = Settings.load();
  I18N.setLang(saved.lang);
  RenderHost.lang = saved.lang;

  var st = {
    mode: init.mode === 'chem' ? 'chem' : 'math',
    input: saved.lastInput === 'latex' ? 'latex' : 'visual',
    rtl: saved.rtl, digits: saved.digits, arabicFunctions: saved.arabicFunctions, arabicComma: saved.arabicComma,
    sumStyle: saved.sumStyle, font: saved.font, mathFont: saved.mathFont, fontSize: saved.fontSize,
    color: saved.color, textColor: saved.textColor || '', bold: saved.bold, display: saved.display,
    numbered: !!saved.numbered, bg: saved.bg || '', alignEq: saved.alignEq !== false, latinFont: !!saved.latinFont,
    names: Object.assign({}, saved.names || {}),
    layout: saved.layout || 'stack', sep: saved.sep || 'space', textBold: !!saved.textBold,
    tab: null
  };
  if (init.opts) {
    ['rtl', 'digits', 'arabicFunctions', 'arabicComma', 'sumStyle', 'font', 'mathFont', 'fontSize', 'color', 'textColor', 'bold', 'display', 'bg', 'latinFont'].forEach(function (k) {
      if (init.opts[k] !== undefined) st[k] = init.opts[k];
    });
    if (init.opts.names) st.names = Object.assign({}, st.names, init.opts.names);
  }
  var DEFAULT_NAMES = { sin: 'جا', cos: 'جتا', tan: 'طا', cot: 'طتا', sec: 'قا', csc: 'قتا', log: 'لو', ln: 'لط', lim: 'نها' };
  st.names = Object.assign({}, DEFAULT_NAMES, st.names);
  var editing = !!init.editId;

  function opts() {
    return {
      mode: st.mode, rtl: st.rtl, digits: st.digits, arabicFunctions: st.arabicFunctions, arabicComma: st.arabicComma,
      sumStyle: st.sumStyle, font: st.font, mathFont: st.mathFont, fontSize: st.fontSize, color: st.color,
      textColor: st.textColor || '', bold: st.bold, display: st.display, names: st.names, bg: st.bg || '', alignEq: !!st.alignEq, latinFont: !!st.latinFont
    };
  }

  // ------------------------------------------------------------ toast
  var toastTimer;
  function toast(msg, err) {
    if (err && window.ArLog) ArLog.add('error', msg, { feature: 'toast' });
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast' + (err ? ' err' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, err ? 5000 : 2200);
  }

  // ------------------------------------------------------------ MathLive
  var mf = $('mf');
  var mfReady = false;
  if (window.MathfieldElement) {
    MathfieldElement.fontsDirectory = 'fonts';
    MathfieldElement.soundsDirectory = null;
  }
  function arabicShortcuts() {
    var s = {};
    var list = ['جا', 'جتا', 'طا', 'ظا', 'طتا', 'ظتا', 'قا', 'قتا', 'لو', 'لط'];
    Object.keys(st.names).forEach(function (k) { if (list.indexOf(st.names[k]) < 0 && k !== 'lim') list.push(st.names[k]); });
    list.forEach(function (n) { s[n] = '\\operatorname{' + n + '}'; });
    s['نها'] = '\\operatorname*{نها}';
    return s;
  }
  // typing جا / جتا / طا / لو ... turns them into function names (MathLive shortcuts ignore Arabic)
  var AR_LETTER = /^[\u0621-\u064A\u0671-\u06D3]$/;
  var converting = false;
  function arabicAutoFunction(e) {
    if (converting || !e || e.inputType !== 'insertText' || !e.data || !AR_LETTER.test(e.data)) return;
    if (!st.arabicFunctions && !st.rtl) return;
    var names = Object.keys(arabicShortcuts()).sort(function (a, b) { return b.length - a.length; });
    var pos = mf.position;
    for (var i = 0; i < names.length; i++) {
      var n = names[i], L = n.length;
      if (pos < L) continue;
      var got = '';
      try { got = mf.getValue(pos - L, pos, 'latex'); } catch (err) { return; }
      if (got !== n) continue;
      var before = pos - L > 0 ? mf.getValue(pos - L - 1, pos - L, 'latex') : '';
      if (AR_LETTER.test(before)) return;          // inside a longer Arabic word
      converting = true;
      try {
        mf.selection = { ranges: [[pos - L, pos]], direction: 'forward' };
        mf.insert(arabicShortcuts()[n], { insertionMode: 'replaceSelection', selectionMode: 'after', format: 'latex' });
      } catch (err2) { /* ignore */ }
      converting = false;
      return;
    }
  }

  function setupMathfield() {
    try {
      mf.mathVirtualKeyboardPolicy = 'manual';
      mf.smartFence = true;
      mf.menuItems = [];
      mf.inlineShortcuts = Object.assign({}, mf.inlineShortcuts || {}, arabicShortcuts());
    } catch (e) { /* older API */ }
    MathFieldRTL.attach(mf);
    // Space in the visual field (5.8.2): MathLive ignores it in math mode, so a typed space vanished.
    // Space = normal word space (\ ), Shift+Space = wide space (\quad). Inside \text{…} MathLive already keeps spaces.
    mf.addEventListener('keydown', function (e) {
      if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (mf.mode === 'text') return;
      e.preventDefault(); e.stopPropagation();
      mf.insert(e.shiftKey ? '\\quad ' : '\\ ', { format: 'latex', selectionMode: 'after' });
    }, true);
    MathFieldRTL.set(mf, st.rtl && st.mode === 'math');
    mf.style.setProperty('--armath-ar-font', "'" + st.font + "'");
    mf.addEventListener('input', function (e) { arabicAutoFunction(e); schedulePreview(); });
    mf.addEventListener('paste', function (e) {
      var t = e.clipboardData && e.clipboardData.getData('text/plain');
      if (!t || !/\n/.test(t.trim())) return;
      e.preventDefault(); e.stopPropagation();
      $('latexInp').value = window.AIFormat ? AIFormat.clean(t) : t;
      st.input = 'latex';
      note('');
      syncHeader(); schedulePreview(); focusInput();
    }, true);
    mfReady = true;
    if (st.mode === 'math' && init.tex && st.input === 'visual') mf.value = init.tex;
    schedulePreview();
    if (st.mode === 'math' && st.input === 'visual') setTimeout(function () { mf.focus(); }, 60);
  }
  if (window.customElements) customElements.whenDefined('math-field').then(setupMathfield);

  // ------------------------------------------------------------ header controls
  function fillSizes() {
    var sel = $('sizeSel');
    [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 60, 72].forEach(function (n) {
      var o = document.createElement('option'); o.value = n; o.textContent = n + ' pt'; sel.appendChild(o);
    });
  }
  function syncHeader() {
    Array.prototype.forEach.call(document.querySelectorAll('#modeSeg button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === st.mode));
    });
    Array.prototype.forEach.call(document.querySelectorAll('#inputSeg button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-input') === st.input));
    });
    Array.prototype.forEach.call(document.querySelectorAll('#displaySeg button'), function (b) {
      b.setAttribute('aria-pressed', String((b.getAttribute('data-display') === '1') === !!st.display));
    });
    Array.prototype.forEach.call(document.querySelectorAll('#layoutSeg button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-layout') === st.layout));
    });
    $('textBoldBtn').setAttribute('aria-pressed', String(!!st.textBold));
    var chem = st.mode === 'chem';
    $('notationBtn').dataset.n = st.rtl ? 'ar' : 'en';
    $('notationBtn').disabled = chem;
    $('digitsBtn').textContent = st.digits === 'eastern' ? '١٢٣' : '123';
    $('digitsBtn').setAttribute('aria-pressed', String(st.digits === 'eastern'));
    $('digitsBtn').disabled = chem;
    $('mathFontSel').value = st.mathFont;
    $('arFontSel').value = st.font;
    $('sizeSel').value = String(st.fontSize);
    if ($('sizeSel').value !== String(st.fontSize)) {
      var o = document.createElement('option'); o.value = st.fontSize; o.textContent = st.fontSize + ' pt'; $('sizeSel').appendChild(o); $('sizeSel').value = String(st.fontSize);
    }
    $('boldBtn').setAttribute('aria-pressed', String(!!st.bold));
    $('colorSwatch').style.background = st.color;
    $('numberBtn').setAttribute('aria-pressed', String(!!st.numbered));
    $('numberBtn').hidden = chem && false;
    var pc = $('pvColors');
    pc.innerHTML = '';
    if (st.mode === 'math') {
      pc.innerHTML = '<span>' + T('colorEquation') + '<i style="background:' + st.color + '"></i></span>' +
        '<span>' + T('colorText') + '<i style="background:' + (st.textColor || st.color) + '"></i></span>';
    }
    $('inputSeg').hidden = chem;
    $('visualWrap').hidden = chem || st.input !== 'visual';
    $('latexWrap').hidden = chem || st.input !== 'latex';
    $('chemWrap').hidden = !chem;
    $('okBtn').textContent = editing ? T('update') : T('insert');
    if (mfReady) {
      MathFieldRTL.set(mf, st.rtl && !chem);
      mf.style.setProperty('--armath-ar-font', "'" + st.font + "'");
    }
  }

  $('modeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var m = b.getAttribute('data-mode');
    if (m === st.mode) return;
    st.mode = m; st.tab = null;
    syncHeader(); buildTabs(); schedulePreview();
    focusInput();
  });
  $('inputSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    setInput(b.getAttribute('data-input'));
  });
  $('displaySeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    st.display = b.getAttribute('data-display') === '1';
    syncHeader(); schedulePreview();
  });
  $('textBoldBtn').onclick = function () { st.textBold = !st.textBold; syncHeader(); schedulePreview(); };
  $('layoutSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    st.layout = b.getAttribute('data-layout');
    syncHeader(); schedulePreview();
  });
  $('notationBtn').onclick = function () {
    var ar = !st.rtl;
    st.rtl = ar; st.arabicFunctions = ar; st.arabicComma = ar;
    if (!ar) st.digits = 'western';
    syncHeader(); iconCacheReset(); buildTabs(); schedulePreview();
    toast(ar ? T('notationAr') + ' ← ع' : 'English notation →');
  };
  $('digitsBtn').onclick = function () { st.digits = st.digits === 'eastern' ? 'western' : 'eastern'; syncHeader(); schedulePreview(); };
  $('mathFontSel').onchange = function () { st.mathFont = this.value; RenderHost.warm(st.mathFont); schedulePreview(); };
  $('arFontSel').onchange = function () { st.font = this.value; syncHeader(); schedulePreview(); };
  $('sizeSel').onchange = function () { st.fontSize = +this.value; schedulePreview(); };
  $('boldBtn').onclick = function () { st.bold = !st.bold; syncHeader(); schedulePreview(); };
  $('numberBtn').onclick = function () {
    st.numbered = !st.numbered;
    if (st.numbered) st.display = true;
    syncHeader(); schedulePreview();
    toast(st.numbered ? T('numberOn') : T('numberOff'));
  };
  $('undoBtn').onclick = function () { undoRedo('undo'); };
  $('redoBtn').onclick = function () { undoRedo('redo'); };

  function undoRedo(what) {
    if (st.mode === 'math' && st.input === 'visual' && mfReady) { mf.executeCommand(what); schedulePreview(); return; }
    var ta = st.mode === 'chem' ? $('chemInp') : $('latexInp');
    ta.focus();
    try { document.execCommand(what); } catch (e) { /* ignore */ }
    schedulePreview();
  }

  function setInput(mode) {
    if (mode === st.input) return;
    if (mode === 'latex') {
      if (mfReady) $('latexInp').value = mf.value;
      st.input = 'latex';
    } else {
      var eqs = splitEquations($('latexInp').value, st.layout);
      if (eqs.length > 1 || (eqs[0] && eqs[0].kind === 'text')) { note(T('multiInVisual')); return; }
      if (mfReady) mf.value = eqs.length ? eqs[0].tex : '';
      st.input = 'visual';
    }
    note('');
    syncHeader(); schedulePreview(); focusInput();
  }
  function note(msg) { $('note').textContent = msg; $('note').hidden = !msg; }
  function focusInput() {
    setTimeout(function () {
      if (st.mode === 'chem') $('chemInp').focus();
      else if (st.input === 'visual' && mfReady) mf.focus();
      else $('latexInp').focus();
    }, 30);
  }

  // ------------------------------------------------------------ icons (rendered with MathJax)
  var iconCache = {};
  var iconQueue = Promise.resolve();
  var iconGen = 0;
  function iconCacheReset() { iconGen++; }
  function iconOpts(rtl) {
    return { mathFont: 'stix2', rtl: rtl, arabicFunctions: true, arabicComma: true, fontSize: 14, color: 'currentColor', digits: 'western', font: 'Amiri' };
  }
  function renderIcon(el, tex, rtl) {
    var key = tex + '|' + (rtl ? 1 : 0);
    if (iconCache[key]) { el.innerHTML = iconCache[key]; return; }
    var gen = iconGen;
    iconQueue = iconQueue.then(function () {
      if (!el.isConnected || gen !== iconGen) return;
      return RenderHost.preview(tex, iconOpts(rtl)).then(function (r) {
        if (r.errors && r.errors.length) return;
        iconCache[key] = r.svgString.replace(/\scolor="currentColor"/g, '').replace(/style="color:\s*currentColor;?"/g, '');
        if (el.isConnected) el.innerHTML = iconCache[key];
      }).catch(function () {});
    });
  }

  // ------------------------------------------------------------ toolbar
  var LIB_TAB = { id: 'library', icon: '\\boxed{\\text{ق}}', t: 'مكتبة القوانين', e: 'Formula library', library: true, groups: [] };
  function tabs() { return st.mode === 'chem' ? TOOLBARS.chem : TOOLBARS.math.concat([LIB_TAB]); }
  function tip(item) { return I18N.lang === 'en' ? (item.e || item.t || '') : (item.t || '') + (item.e ? ' — ' + item.e : ''); }

  function buildTabs() {
    var nav = $('tbTabs');
    nav.innerHTML = '';
    var list = tabs();
    if (!st.tab || !list.some(function (t) { return t.id === st.tab; })) st.tab = list[0].id;
    list.forEach(function (tab) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tb-tab';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(tab.id === st.tab));
      b.title = I18N.lang === 'en' ? tab.e : tab.t;
      var ti = document.createElement('span'); ti.className = 'ti';
      var tl = document.createElement('span'); tl.className = 'tl'; tl.textContent = I18N.lang === 'en' ? tab.e : tab.t;
      b.appendChild(ti); b.appendChild(tl);
      renderIcon(ti, tab.icon, false);
      b.onclick = function () { st.tab = tab.id; buildTabs(); };
      nav.appendChild(b);
    });
    buildPanel();
  }

  function fnItem(item) {
    var n = st.names[item.fn] || item.fn;
    var latin = '\\' + item.fn;
    var face, vis, lat;
    if (item.lim) {
      face = '\\operatorname*{' + n + '}\\limits_{' + TOOLBARS.slot + '}';
      vis = '\\operatorname*{' + n + '}_{#?\\to #?}';
      lat = n + '_{ \\to }';
    } else if (item.base) {
      face = '\\operatorname{' + n + '}_{' + TOOLBARS.slot + '}';
      vis = '\\operatorname{' + n + '}_{#?}';
      lat = n + '_{} ';
    } else if (item.inv) {
      face = '\\operatorname{' + n + '}^{-1}';
      vis = '\\operatorname{' + n + '}^{-1}';
      lat = n + '^{-1} ';
    } else {
      face = '\\operatorname{' + n + '}';
      vis = '\\operatorname{' + n + '}';
      lat = n + ' ';
    }
    return { d: face, vis: vis, lat: lat, t: n + (item.inv ? '⁻¹' : ''), e: latin.slice(1) + (item.inv ? '⁻¹' : '') };
  }

  function buildLibrary(panel) {
    (window.FORMULA_LIBRARY || []).forEach(function (cat) {
      var g = document.createElement('div');
      g.className = 'tb-group wide';
      var h = document.createElement('div');
      h.className = 'lib-cat';
      h.textContent = I18N.lang === 'en' ? cat.e : cat.c;
      g.appendChild(h);
      cat.items.forEach(function (it) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tb-btn txt lib-item';
        b.title = it[2];
        var ln = document.createElement('span'); ln.className = 'ln'; ln.textContent = I18N.lang === 'en' ? it[1] : it[0];
        var lf = document.createElement('span'); lf.className = 'lf';
        b.appendChild(ln); b.appendChild(lf);
        renderIcon(lf, it[2], st.rtl);
        b.onmousedown = function (e) { e.preventDefault(); };
        b.onclick = function () { insertFormula(it[2]); };
        g.appendChild(b);
      });
      panel.appendChild(g);
    });
  }
  function insertFormula(tex) {
    if (/\\ce\s*\{|\\qty|\\SI\b/.test(tex) && st.input === 'visual') {           // the visual editor cannot show these: use LaTeX mode
      var cur = mfReady ? mf.value.trim() : '';
      st.input = 'latex'; $('latexInp').value = cur; syncHeader();
    }
    if (st.input === 'visual' && mfReady) {
      mf.focus();
      if (!mf.value.trim()) mf.value = tex; else mf.insert(tex, { format: 'latex', selectionMode: 'after' });
    } else {
      var ta = $('latexInp');
      ta.value = ta.value.trim() ? ta.value.replace(/\s*$/, '') + '\n' + tex : tex;
    }
    schedulePreview();
  }

  function buildPanel() {
    var panel = $('tbPanel');
    panel.innerHTML = '';
    var tab = tabs().filter(function (t) { return t.id === st.tab; })[0];
    if (tab.library) { buildLibrary(panel); return; }
    var rtlIcons = st.rtl && st.mode === 'math';
    tab.groups.forEach(function (group) {
      var g = document.createElement('div');
      g.className = 'tb-group' + (tab.wide ? ' wide' : '');
      group.forEach(function (raw) {
        var item = raw.fn ? Object.assign({}, raw, fnItem(raw)) : raw;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tb-btn' + (item.w ? ' w' : '') + (item.set ? ' txt' : '');
        b.title = tip(item);
        b.onmousedown = function (e) { e.preventDefault(); };
        if (item.set) {
          b.textContent = I18N.lang === 'en' ? item.e : item.t;
        } else {
          var fb = document.createElement('span'); fb.className = 'fb'; fb.textContent = '…';
          b.appendChild(fb);
          renderIcon(b, item.d, tab.arabic ? true : rtlIcons);
        }
        b.onclick = function (e) { onItem(item, b, e); };
        g.appendChild(b);
      });
      panel.appendChild(g);
    });
  }

  function onItem(item, btn) {
    if (item.cmd) return runCmd(item.cmd, btn);
    if (st.mode === 'chem') {
      if (item.set) { $('chemInp').value = item.set; schedulePreview(); focusInput(); return; }
      return taInsert($('chemInp'), item.i);
    }
    if (st.input === 'visual') {
      var s = item.vis || item.i;
      if (!mfReady) return;
      mf.focus();
      try { mf.insert(s, { selectionMode: 'placeholder', format: 'latex', focus: true }); }
      catch (e) { mf.executeCommand(['insert', s]); }
      schedulePreview();
    } else {
      taInsert($('latexInp'), item.lat || item.i);
    }
  }

  function taInsert(ta, snip) {
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    var sel = v.slice(s, e);
    var text = snip.replace(/#@/g, '');
    var first = text.search(/#0|#\?/);
    var caretOff;
    if (first >= 0) {
      var before = text.slice(0, first).replace(/#0/g, sel).replace(/#\?/g, '');
      var usedSel = text.slice(first, first + 2) === '#0';
      caretOff = before.length + (usedSel ? sel.length : 0);
      text = text.replace(/#0/, sel).replace(/#0/g, '').replace(/#\?/g, '');
    } else {
      caretOff = text.length;
    }
    ta.value = v.slice(0, s) + text + v.slice(e);
    ta.focus();
    ta.setSelectionRange(s + caretOff, s + caretOff);
    schedulePreview();
  }

  function runCmd(cmd, btn) {
    if (cmd === 'matrixPicker') return openMatrix(btn);
    if (cmd === 'periodicTable') return openPeriodic(btn);
    if (st.input !== 'visual' || !mfReady) { toast(I18N.lang === 'en' ? 'Available in visual mode' : 'متاح في الوضع المرئي'); return; }
    mf.focus();
    mf.executeCommand(cmd);
    schedulePreview();
  }

  // ------------------------------------------------------------ popups
  var openPop = null;
  function place(pop, btn) {
    pop.hidden = false;
    var r = btn.getBoundingClientRect();
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = document.documentElement.dir === 'rtl' ? r.right - pw : r.left;
    left = Math.max(6, Math.min(left, window.innerWidth - pw - 6));
    var top = r.bottom + 4;
    if (top + ph > window.innerHeight - 6) top = Math.max(6, r.top - ph - 4);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    openPop = pop;
  }
  function closePop() { if (openPop) { openPop.hidden = true; openPop = null; } }
  document.addEventListener('mousedown', function (e) {
    if (openPop && !openPop.contains(e.target) && !e.target.closest('.tb-btn, .tool, .fbtn')) closePop();
  });

  // colour: selection / whole equation / text
  var PALETTE = ['#000000', '#0e9f9a', '#0a7c78', '#1f5fbf', '#c2352b', '#e07a00', '#2e8b3a', '#7b3fb3', '#6b7c85', '#b8860b'];
  function hasSelection() {
    if (st.mode === 'math' && st.input === 'visual' && mfReady) {
      try { var sel = mf.selection; return !!(sel && sel.ranges && sel.ranges.some(function (r) { return r[0] !== r[1]; })); } catch (e) { return false; }
    }
    var ta = st.mode === 'chem' ? $('chemInp') : $('latexInp');
    return ta.selectionEnd > ta.selectionStart;
  }
  function buildColorPop() {
    Array.prototype.forEach.call(document.querySelectorAll('#colorPop .swatches'), function (box) {
      var target = box.getAttribute('data-target');
      box.innerHTML = '';
      if (target === 'text') {
        var same = document.createElement('button');
        same.type = 'button'; same.title = T('sameAsEq'); same.textContent = '='; same.style.background = '#fff';
        same.dataset.c = ''; same.onclick = function () { applyColor('text', ''); };
        box.appendChild(same);
      }
      PALETTE.forEach(function (c) {
        var b = document.createElement('button');
        b.type = 'button'; b.style.background = c; b.title = c; b.dataset.c = c;
        b.onmousedown = function (e) { e.preventDefault(); };
        b.onclick = function () { applyColor(target, c); };
        box.appendChild(b);
      });
      var lab = document.createElement('label');
      lab.title = T('custom'); lab.textContent = '+';
      var inp = document.createElement('input'); inp.type = 'color';
      inp.onchange = function () { applyColor(target, inp.value); };
      lab.appendChild(inp);
      box.appendChild(lab);
    });
    markSwatches();
  }
  function markSwatches() {
    Array.prototype.forEach.call(document.querySelectorAll('#colorPop .swatches'), function (box) {
      var target = box.getAttribute('data-target');
      var cur = target === 'eq' ? st.color : target === 'text' ? (st.textColor || '') : null;
      Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) { b.classList.toggle('on', cur !== null && b.dataset.c === cur); });
    });
  }
  function applyColor(target, c) {
    if (target === 'sel') {
      if (st.mode === 'math' && st.input === 'visual' && mfReady) {
        try { mf.applyStyle({ color: c }); } catch (e) { /* ignore */ }
      } else {
        var ta = st.mode === 'chem' ? $('chemInp') : $('latexInp');
        var a = ta.selectionStart, z = ta.selectionEnd;
        if (z > a) {
          ta.value = ta.value.slice(0, a) + '\\textcolor{' + c + '}{' + ta.value.slice(a, z) + '}' + ta.value.slice(z);
        }
      }
      closePop(); schedulePreview(); focusInput();
      return;
    }
    if (target === 'eq') st.color = c; else st.textColor = c;
    syncHeader(); markSwatches(); schedulePreview();
  }
  $('colorBtn').onmousedown = function (e) { e.preventDefault(); };
  $('colorBtn').onclick = function () {
    $('cSelSec').classList.toggle('off', !hasSelection());
    markSwatches();
    place($('colorPop'), $('colorBtn'));
  };

  // history of recent equations
  var HKEY = 'armath.v2.history';
  function loadHist() { try { return JSON.parse(localStorage.getItem(HKEY) || '[]') || []; } catch (e) { return []; } }
  function pushHist(entry) {
    try {
      var h = loadHist().filter(function (x) { return !(x.tex === entry.tex && x.mode === entry.mode); });
      h.unshift(entry);
      localStorage.setItem(HKEY, JSON.stringify(h.slice(0, 30)));
    } catch (e) { /* ignore */ }
  }
  function sourceText() {
    if (st.mode === 'chem') return $('chemInp').value;
    if (st.input === 'visual') return mfReady ? mf.value : '';
    return $('latexInp').value;
  }
  $('historyBtn').onmousedown = function (e) { e.preventDefault(); };
  $('historyBtn').onclick = function () {
    var list = $('histList');
    list.innerHTML = '';
    var h = loadHist();
    if (!h.length) { list.innerHTML = '<div class="empty">' + T('historyEmpty') + '</div>'; }
    h.forEach(function (x) {
      var b = document.createElement('button');
      b.type = 'button';
      b.title = x.tex;
      var first = x.mode === 'chem' ? chemLines(x.tex).filter(function (e) { return e.kind !== 'text'; })[0]
        : (x.input === 'visual' ? { tex: x.tex } : onlyMath(splitEquations(x.tex, 'stack'))[0]);
      b.textContent = (x.tex || '').slice(0, 40);
      if (first) {
        var o = Object.assign(opts(), { mode: x.mode, fontSize: 12, color: '#1b2a30', display: false });
        RenderHost.preview(first.tex, o).then(function (r) { if (!r.errors.length) b.innerHTML = r.svgString; }).catch(function () {});
      }
      b.onclick = function () { loadEntry(x); closePop(); };
      list.appendChild(b);
    });
    place($('historyPop'), $('historyBtn'));
  };
  function loadEntry(x) {
    if (x.mode !== st.mode) { st.mode = x.mode; st.tab = null; buildTabs(); }
    if (x.mode === 'chem') $('chemInp').value = x.tex;
    else if (x.input === 'visual' && mfReady) { st.input = 'visual'; mf.value = x.tex; }
    else { st.input = 'latex'; $('latexInp').value = x.tex; }
    syncHeader(); schedulePreview(); focusInput();
  }

  // export
  function combinedTex() {
    var eqs = onlyMath(currentEquations());
    if (!eqs.length) return null;
    if (st.mode === 'chem') {
      if (eqs.length === 1) return { tex: eqs[0].tex, mode: 'chem' };
      return { tex: '\\begin{gathered}' + eqs.map(function (e) { return '\\ce{' + e.tex + '}'; }).join('\\\\[6pt]') + '\\end{gathered}', mode: 'math' };
    }
    return { tex: eqs.length === 1 ? eqs[0].tex : '\\begin{gathered}' + eqs.map(function (e) { return e.tex; }).join('\\\\[6pt]') + '\\end{gathered}', mode: 'math' };
  }
  function copyText(t) {
    var done = function () { toast(T('copied')); };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(done, function () { legacyCopy(t); done(); });
    legacyCopy(t); done();
  }
  function legacyCopy(t) {
    var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
  }
  function download(name, url) {
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  $('exportBtn').onmousedown = function (e) { e.preventDefault(); };
  $('exportBtn').onclick = function () { place($('exportPop'), $('exportBtn')); };
  $('exportPop').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-exp]'); if (!b) return;
    var kind = b.getAttribute('data-exp');
    closePop();
    var c = combinedTex();
    if (!c) { toast(T('emptyPreview'), true); return; }
    var o = Object.assign(opts(), { mode: c.mode });
    if (kind === 'latex') return copyText(st.mode === 'chem' ? '\\ce{' + onlyMath(currentEquations()).map(function (x) { return x.tex; }).join('}\n\\ce{') + '}' : sourceText());
    if (kind === 'mathml') { RenderHost.mathml(c.tex, o).then(copyText).catch(function (er) { toast(er.message, true); }); return; }
    RenderHost.render(c.tex, o, kind === 'png' ? 300 : 600).then(function (r) {
      if (kind === 'svg') {
        var url = URL.createObjectURL(new Blob([r.svgString], { type: 'image/svg+xml' }));
        download('equation.svg', url); setTimeout(function () { URL.revokeObjectURL(url); }, 3000); return;
      }
      if (kind === 'pngfile') { download('equation.png', r.dataUrl); return; }
      return fetch(r.dataUrl).then(function (x) { return x.blob(); }).then(function (blob) {
        if (navigator.clipboard && window.ClipboardItem) return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function () { toast(T('copied')); });
        throw new Error('clipboard');
      }).catch(function () { download('equation.png', r.dataUrl); });
    }).catch(function (er) { toast(T('error') + ': ' + er.message, true); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (openPop) { closePop(); e.preventDefault(); } }
  });

  var mEnv = 'pmatrix';
  function buildMatrixGrid() {
    var g = $('mGrid');
    g.innerHTML = '';
    for (var r = 1; r <= 8; r++) for (var c = 1; c <= 10; c++) {
      var s = document.createElement('span');
      s.dataset.r = r; s.dataset.c = c;
      g.appendChild(s);
    }
    g.onmouseover = function (e) {
      var s = e.target.closest('span'); if (!s) return;
      var R = +s.dataset.r, C = +s.dataset.c;
      $('mSize').textContent = R + ' × ' + C;
      Array.prototype.forEach.call(g.children, function (x) { x.classList.toggle('on', +x.dataset.r <= R && +x.dataset.c <= C); });
    };
    g.onclick = function (e) {
      var s = e.target.closest('span'); if (!s) return;
      insertMatrix(+s.dataset.r, +s.dataset.c);
      closePop();
    };
    $('mBr').onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      mEnv = b.getAttribute('data-br');
      syncBr();
    };
    syncBr();
  }
  function syncBr() {
    Array.prototype.forEach.call(document.querySelectorAll('#mBr button'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-br') === mEnv));
    });
  }
  function openMatrix(btn) {
    $('mGrid').classList.toggle('rtl', st.rtl);
    place($('matrixPop'), btn);
  }
  function insertMatrix(R, C) {
    var rows = [];
    for (var i = 0; i < R; i++) {
      var cells = [];
      for (var j = 0; j < C; j++) cells.push(i === 0 && j === 0 ? '#0' : '#?');
      rows.push(cells.join(' & '));
    }
    var s = '\\begin{' + mEnv + '}' + rows.join('\\\\ ') + '\\end{' + mEnv + '}';
    onItem({ i: s });
  }

  function buildPeriodic() {
    var g = $('ptGrid');
    g.innerHTML = '';
    var pos = TOOLBARS.elementPositions, els = TOOLBARS.elements, names = TOOLBARS.elementNamesAr;
    var nonmetals = 'H C N O P S Se'.split(' '), noble = 'He Ne Ar Kr Xe Rn Og'.split(' ');
    for (var z = 1; z <= 118; z++) {
      var p = pos[z]; if (!p) continue;
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = els[z - 1];
      var row = p[0] <= 7 ? p[0] : p[0] + 0.5;
      b.style.gridRow = p[0] <= 7 ? String(p[0]) : String(p[0] + 1);
      b.style.gridColumn = String(p[1]);
      if (p[0] >= 8) b.className = 'f';
      else if (nonmetals.indexOf(els[z - 1]) >= 0) b.className = 'nm';
      else if (noble.indexOf(els[z - 1]) >= 0) b.className = 'ng';
      b.dataset.z = z;
      b.title = z + ' — ' + els[z - 1] + (names[els[z - 1]] ? ' — ' + names[els[z - 1]] : '');
      g.appendChild(b);
    }
    var gap = document.createElement('div'); gap.className = 'gap'; gap.style.gridRow = '8'; g.appendChild(gap);
    g.onmouseover = function (e) { var b = e.target.closest('button'); if (b) $('ptName').textContent = b.title; };
    g.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      taInsert($('chemInp'), b.textContent);
      closePop();
    };
  }
  function openPeriodic(btn) { place($('ptPop'), btn); }

  // ------------------------------------------------------------ equations & preview
  function stripComment(line) {
    for (var i = 0; i < line.length; i++) {
      if (line[i] === '\\') { i++; continue; }
      if (line[i] === '%') return { code: line.slice(0, i), comment: line.slice(i + 1).trim() };
    }
    return { code: line, comment: null };
  }
  function countBraces(code) {
    var n = 0;
    for (var i = 0; i < code.length; i++) {
      if (code[i] === '\\') { i++; continue; }
      if (code[i] === '{') n++; else if (code[i] === '}') n--;
    }
    return n;
  }
  // A line of ordinary words (a title or a sentence) is inserted as real, editable Word text.
  var AR_CH = /[\u0621-\u064A\u0671-\u06D3]/;
  function isProse(line) {
    var t = line.trim();
    if (!t || /\\|[\^_=+*\/<>{}&|~]/.test(t)) return false;
    var words = t.split(/\s+/).filter(function (w) { return AR_CH.test(w) || /^[A-Za-z]{3,}[.,:!?]?$/.test(w); });
    if (!words.length) return false;
    var longW = words.filter(function (w) { return w.replace(/[^\u0621-\u064A\u0671-\u06D3A-Za-z]/g, '').length >= 4; }).length;
    if (/[:؟?!.]$/.test(t) && longW >= 1) return true;
    return words.length >= 2 && longW >= 1;
  }
  // "text $math$ text" -> parts on one line
  function splitMixed(line) {
    var out = [], buf = '', math = '', inMath = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '\\' && line[i + 1] === '$') { if (inMath) math += '\\$'; else buf += '$'; i++; continue; }
      if (ch === '$') {
        if (!inMath) { if (buf.trim()) out.push({ kind: 'text', text: buf.trim(), inline: true }); buf = ''; math = ''; inMath = true; }
        else {
          var mt = math.trim(), ce = mt.match(/^\\ce\s*\{([\s\S]*)\}$/);
          if (mt) out.push(ce ? { tex: ce[1], mode: 'chem' } : { tex: mt });
          inMath = false;
        }
        continue;
      }
      if (inMath) math += ch; else buf += ch;
    }
    if (inMath) buf += '$' + math;
    if (buf.trim()) out.push({ kind: 'text', text: buf.trim(), inline: true });
    return out;
  }
  function hasDollar(t) { return /(^|[^\\])\$/.test(t); }

  function splitEquations(src, layout) {
    var sc = window.Figures && Figures.hasBlocks(src) ? Figures.scan(src) : null;
    if (sc) src = sc.text;
    var lines = String(src || '').replace(/\r/g, '').split('\n');
    var out = [], buf = [], env = 0, braces = 0, brk = true, line = -1;
    function flush() {
      var t = buf.join('\n').trim();
      if (t) {
        if (layout === 'stack' || line < 0 || (layout === 'auto' && brk)) line++;
        var ce = t.match(/^\\ce\s*\{([\s\S]*)\}$/);
        out.push(ce ? { tex: ce[1], mode: 'chem', line: line } : { tex: t, line: line });
        brk = false;
      }
      buf = []; env = 0; braces = 0;
    }
    function text(t, title) {
      flush();
      if (title || layout === 'stack') {
        line++;
        out.push({ kind: 'text', text: t, line: line });
        brk = true;
        if (layout === 'inline') line++;
        return;
      }
      if (line < 0 || (layout === 'auto' && brk)) line++;       // same line as the equations around it
      out.push({ kind: 'text', text: t, line: line, inline: true });
      brk = false;
    }
    function mixed(parts) {
      flush();
      line++;
      parts.forEach(function (p) { p.line = line; out.push(p); });
      brk = true;
      if (layout === 'inline') line++;
    }
    lines.forEach(function (ln) {
      var inBlock = env > 0 || braces > 0;
      var trimmed = ln.trim();
      if (!inBlock && /^%%/.test(trimmed)) return;                 // %% = hidden comment
      if (!inBlock && /^%/.test(trimmed)) { var ct = trimmed.replace(/^%\s*/, ''); if (ct) text(ct, true); return; }
      if (!inBlock && hasDollar(trimmed)) { var parts = splitMixed(trimmed); if (parts.length) mixed(parts); return; }
      if (!inBlock && isProse(trimmed)) { text(trimmed, false); return; }
      var c = stripComment(ln);
      var code = c.code;
      if (!code.trim()) {
        if (inBlock) return;
        flush(); brk = true;
        if (c.comment) text(c.comment, true);
        return;
      }
      buf.push(code);
      env += (code.match(/\\begin\s*\{/g) || []).length - (code.match(/\\end\s*\{/g) || []).length;
      braces += countBraces(code);
      if (env <= 0 && braces <= 0 && !/\\\\\s*$/.test(code)) {
        flush();
        if (c.comment) text(c.comment, false);
      }
    });
    flush();
    // figure / table blocks (graphs, geometry, charts, tables …) always sit on their own line
    if (sc) out = out.map(function (e) {
      var m = e.kind !== 'text' && /^\\armathobj\{(\d+)\}$/.exec(String(e.tex || '').trim());
      if (!m) return e;
      var b = sc.blocks[+m[1]];
      return { kind: b.type === 'table' ? 'table' : 'figure', block: b, line: e.line };
    });
    var cur = -1, prevOld = null, forceNew = false;
    out.forEach(function (e) {
      var isB = !!e.block;
      if (isB || forceNew || e.line !== prevOld) cur++;
      prevOld = e.line; forceNew = isB; e.line = cur;
    });
    return out;
  }
  // prepared (parsed + rendered) blocks, cached by their source
  var blockCache = {};
  function prepareBlock(b) {
    var k = b.type + '|' + b.code;
    if (!blockCache[k]) {
      blockCache[k] = Figures.prepare(b).then(function (m) {
        if (m.type !== 'figure') return m;
        return Figures.render(m.kind, m.data).then(function (r) { m.svg = r.svg; m.w = r.w; m.h = r.h; return m; });
      });
      blockCache[k].catch(function () { setTimeout(function () { delete blockCache[k]; }, 50); });
    }
    return blockCache[k];
  }
  function tableHtml(t) {
    var h = '<table class="pv-tbl" dir="auto">';
    t.rows.forEach(function (r, i) {
      h += '<tr class="' + (i === 0 && t.header ? 'h' : '') + '">';
      r.cells.forEach(function (c) {
        h += '<td' + (c.span > 1 ? ' colspan="' + c.span + '"' : '') + '>' + c.segs.map(function (sg) {
          return sg.t === 'math' ? '<span class="tm" data-tex="' + Raster.esc(sg.v) + '" data-mode="' + (sg.mode || 'math') + '">' + Raster.esc(sg.v) + '</span>' : Raster.esc(sg.v);
        }).join(' ') + '</td>';
      });
      h += '</tr>';
    });
    return h + '</table>';
  }
  // a line written as LaTeX (\ce{…} or $\ce{…}$) is the same reaction as the plain one
  function unCe(t) {
    var m = /^\$*\s*\\ce\s*\{([\s\S]*)\}\s*\$*$/.exec(t); if (!m) return t;
    for (var d = 0, k = 0; k < m[1].length; k++) { d += m[1][k] === '{' ? 1 : m[1][k] === '}' ? -1 : 0; if (d < 0) return t; }
    return d === 0 ? m[1].trim() : t;
  }
  function chemLines(src) {
    var out = [], line = 0;
    String(src || '').replace(/\r/g, '').split('\n').forEach(function (l) {
      var t = l.trim();
      if (!t || /^%%/.test(t)) return;
      if (/^%/.test(t)) { t = t.replace(/^%\s*/, ''); if (t) out.push({ kind: 'text', text: t, line: line++ }); return; }
      if (isProse(t) && /[\u0621-\u064A]/.test(t) && !/->|<-|=/.test(t)) { out.push({ kind: 'text', text: t, line: line++ }); return; }
      out.push({ tex: unCe(t), line: line++ });
    });
    return out;
  }
  function currentEquations() {
    if (st.mode === 'chem') return chemLines($('chemInp').value);
    if (st.input === 'visual') {
      var v = mfReady ? mf.value.trim() : '';
      return v ? [{ tex: v, line: 0 }] : [];
    }
    return splitEquations($('latexInp').value, st.layout);
  }
  function onlyMath(items) { return items.filter(function (e) { return e.kind !== 'text'; }); }

  var pvTimer = null, pvSeq = 0, lastErrors = [];
  function schedulePreview() { clearTimeout(pvTimer); pvTimer = setTimeout(updatePreview, 160); }
  function updatePreview() {
    var eqs = currentEquations();
    var done = Promise.resolve();
    $('layoutRow').hidden = !(st.mode === 'math' && st.input === 'latex' && (onlyMath(eqs).length > 1 || eqs.some(function (e) { return e.kind === 'text'; })));
    var pv = $('pv'), err = $('err');
    var seq = ++pvSeq;
    pv.classList.toggle('rtl', st.rtl && st.mode === 'math');
    pv.classList.toggle('ltr', !(st.rtl && st.mode === 'math'));
    $('pvScroll').dir = st.rtl && st.mode === 'math' ? 'rtl' : 'ltr';
    if (!eqs.length) {
      pv.innerHTML = '<span class="pv-empty">' + T('emptyPreview') + '</span>';
      err.hidden = true; lastErrors = [];
      return done;
    }
    var o = opts();
    var results = [];
    var chain = Promise.resolve();
    eqs.forEach(function (eq) {
      chain = chain.then(function () {
        if (seq !== pvSeq) return;
        if (eq.kind === 'text') { results.push({ eq: eq, r: null }); return; }
        if (eq.block) {
          return prepareBlock(eq.block).then(function (m) { results.push({ eq: eq, block: m }); },
            function (e) { results.push({ eq: eq, blockErr: e && e.message ? e.message : String(e) }); });
        }
        var oi = eq.mode ? Object.assign({}, o, { mode: eq.mode }) : o;
        return RenderHost.preview(eq.tex, oi).then(function (r) { results.push({ eq: eq, r: r }); });
      });
    });
    return chain.then(function () {
      if (seq !== pvSeq) return;
      var bad = [], k = 0, nEq = onlyMath(eqs).length;
      results.forEach(function (x) {
        if (x.blockErr) { bad.push(Figures.label(x.eq.block.kind, I18N.lang) + ': ' + x.blockErr); return; }
        if (!x.r) return;
        k++;
        if (x.r.errors.length) bad.push((nEq > 1 ? '(' + k + ') ' : '') + x.r.errors.join(' — '));
      });
      lastErrors = bad;
      if (bad.length) {
        err.textContent = T('error') + ': ' + bad.join(' | ');
        err.hidden = false;
        pv.classList.add('stale');
        return;
      }
      err.hidden = true;
      pv.classList.remove('stale');
      pv.innerHTML = '';
      var rows = {};
      var numbered = st.numbered && st.mode === 'math', num = 0;
      results.forEach(function (x) {
        var key = x.eq.line;
        if (x.block) {
          var box = document.createElement('div');
          if (x.block.type === 'figure') {
            box.className = 'pv-fig'; box.innerHTML = x.block.svg;
            var fsvg = box.firstChild;
            if (fsvg && fsvg.setAttribute) { fsvg.setAttribute('width', (x.block.w * 0.8 * (+(pv.style.fontSize || '22px').replace('px', '') / 22)).toFixed(1)); fsvg.removeAttribute('height'); fsvg.style.height = 'auto'; }
          } else {
            box.className = 'pv-fig'; box.innerHTML = tableHtml(x.block.table);
            Array.prototype.forEach.call(box.querySelectorAll('.tm'), function (sp) {
              RenderHost.preview(sp.getAttribute('data-tex'), Object.assign({}, o, { mode: sp.getAttribute('data-mode'), display: false })).then(function (rr) {
                if (!rr.errors.length) { sp.innerHTML = rr.svgString; var s2 = sp.firstChild; s2.setAttribute('width', (rr.width * 0.8).toFixed(2) + 'em'); s2.setAttribute('height', (rr.total * 0.8).toFixed(2) + 'em'); s2.style.verticalAlign = (-rr.depth * 0.8).toFixed(2) + 'em'; }
              }).catch(function () { /* keep text */ });
            });
          }
          pv.appendChild(box);
          return;
        }
        if (!x.r && !x.eq.inline) {
          var tx = document.createElement('div');
          tx.className = 'pv-text' + (st.textBold ? ' bold' : '');
          tx.dir = 'auto';
          tx.textContent = x.eq.text;
          if (st.textColor) tx.style.color = st.textColor;
          pv.appendChild(tx);
          return;
        }
        if (!rows[key]) { rows[key] = document.createElement('div'); rows[key].className = 'row'; pv.appendChild(rows[key]); }
        if (!x.r) {
          var sp = document.createElement('span');
          sp.className = 'tx' + (st.textBold ? ' bold' : '');
          sp.textContent = x.eq.text;
          sp.style.color = st.textColor || '#1b2a30';
          rows[key].appendChild(sp);
          return;
        }
        if (numbered && !rows[key].querySelector('.num')) {
          var nm = document.createElement('span'); nm.className = 'num'; nm.textContent = '(' + (++num) + ')';
          rows[key].appendChild(nm);
        }
        var span = document.createElement('span');
        span.innerHTML = x.r.svgString;
        var svg = span.firstChild;
        var scale = Math.min(1.6, Math.max(1, 14 / (+o.fontSize || 14))) * (o.fontSize / 14);
        svg.setAttribute('width', (x.r.width * scale).toFixed(3) + 'em');
        svg.setAttribute('height', (x.r.total * scale).toFixed(3) + 'em');
        svg.style.verticalAlign = (-x.r.depth * scale).toFixed(3) + 'em';
        var numEl = rows[key].querySelector('.num');
        if (numEl) rows[key].insertBefore(svg, numEl); else rows[key].appendChild(svg);
        x.r.svgEl = svg; x.r.scale = scale;
      });
      alignPreview(results, o);
      if (numbered) {                                    // lines that mix text and math are not numbered
        var n2 = 0;
        Array.prototype.forEach.call(pv.querySelectorAll('.row'), function (row) {
          var nm2 = row.querySelector('.num');
          if (!nm2) return;
          if (row.querySelector('.tx')) nm2.remove(); else nm2.textContent = '(' + (++n2) + ')';
        });
      }
    }).catch(function (e) {
      if (seq !== pvSeq) return;
      lastErrors = [String(e && e.message ? e.message : e)];
      err.textContent = T('error') + ': ' + lastErrors[0];
      err.hidden = false;
    });
  }
  $('latexInp').addEventListener('input', schedulePreview);
  // «محاذاة =»: the same empty space Word will get (EqAlign), shown as margins around each picture
  function alignPreview(results, o) {
    if (!st.alignEq || !window.EqAlign) return;
    var eqs = results.map(function (x) { return x.eq; }), idx = EqAlign.eligible(eqs);
    if (idx.length < 2) return;
    var list = idx.map(function (i) { var r = results[i].r; return r && r.svgEl ? { w: r.width, rel: r.rel } : null; });
    var pads = EqAlign.pads(list, 414 / (+o.fontSize || 14));
    pads.forEach(function (p, k) {
      var r = results[idx[k]].r, s = r && r.svgEl;
      if (!s || !p) return;
      s.style.marginLeft = (p.padL * r.scale).toFixed(3) + 'em';
      s.style.marginRight = (p.padR * r.scale).toFixed(3) + 'em';
    });
  }

  // preview tools: zoom / fit width / expand; toolbar collapse
  var PVKEY = 'armath.v4.view', view = { z: 1, fit: true, tb: false };
  try { Object.assign(view, JSON.parse(localStorage.getItem(PVKEY) || '{}')); } catch (e) { /* ignore */ }
  function saveView() { try { localStorage.setItem(PVKEY, JSON.stringify(view)); } catch (e) { /* ignore */ } }
  function applyView() {
    $('pv').style.fontSize = (22 * view.z).toFixed(1) + 'px';
    $('pv').classList.toggle('fit', !!view.fit);
    $('pvFit').setAttribute('aria-pressed', String(!!view.fit));
    document.querySelector('.tb').classList.toggle('collapsed', !!view.tb);
  }
  $('pvZoomIn').onclick = function () { view.z = Math.min(3, +(view.z * 1.2).toFixed(2)); applyView(); saveView(); };
  $('pvZoomOut').onclick = function () { view.z = Math.max(0.5, +(view.z / 1.2).toFixed(2)); applyView(); saveView(); };
  $('pvFit').onclick = function () { view.fit = !view.fit; applyView(); saveView(); };
  $('pvMax').onclick = function () { $('pvBox').classList.toggle('max'); this.textContent = $('pvBox').classList.contains('max') ? '✕' : '⤢'; };
  $('tbToggle').onclick = function () { view.tb = !view.tb; applyView(); saveView(); };
  applyView();
  function insertCleaned(ta, text) {
    var a = ta.selectionStart, z = ta.selectionEnd;
    ta.value = ta.value.slice(0, a) + text + ta.value.slice(z);
    ta.setSelectionRange(a + text.length, a + text.length);
    schedulePreview();
  }
  $('latexInp').addEventListener('paste', function (e) {
    var t = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!t || !window.AIFormat || !AIFormat.looksLikeAI(t)) return;
    e.preventDefault();
    insertCleaned(this, AIFormat.clean(t));
    toast(T('aiCleaned'));
  });
  $('aiCopyBtn').onclick = function () {
    var p = I18N.lang === 'en' ? AIFormat.PROMPT_EN : AIFormat.PROMPT_AR;
    var ok = function () { toast(T('aiCopied')); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(p).then(ok, function () { legacyCopy(p); ok(); });
    else { legacyCopy(p); ok(); }
  };
  $('aiPasteBtn').onclick = function () {
    var ta = $('latexInp');
    var fail = function () { ta.focus(); toast(T('aiPasteHint')); };
    if (!navigator.clipboard || !navigator.clipboard.readText) return fail();
    navigator.clipboard.readText().then(function (t) {
      if (!t) return fail();
      ta.focus();
      insertCleaned(ta, AIFormat.clean(t));
      toast(T('aiCleaned'));
    }, fail);
  };
  $('chemInp').addEventListener('input', schedulePreview);
  function keyOk(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ok(); }
  }
  $('latexInp').addEventListener('keydown', keyOk);
  $('chemInp').addEventListener('keydown', keyOk);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ok(); }
    else if (e.key === 'Escape' && $('pvBox').classList.contains('max')) { $('pvMax').click(); }
    else if (e.key === 'Escape' && !openPop) { cancel(); }
  });

  // ------------------------------------------------------------ result
  function persist() {
    var s = Settings.load();
    s.lastInput = st.input;
    s.layout = st.layout;
    s.textBold = !!st.textBold;
    s.numbered = !!st.numbered;
    s.alignEq = !!st.alignEq;
    if ($('saveDefault').checked) {
      ['rtl', 'digits', 'arabicFunctions', 'arabicComma', 'font', 'mathFont', 'fontSize', 'color', 'textColor', 'bold', 'display', 'bg', 'latinFont'].forEach(function (k) { s[k] = st[k]; });
    }
    Settings.save(s);
  }

  var officeReady = new Promise(function (res) {
    if (window.Office && Office.onReady) Office.onReady(function () { res(true); }); else res(false);
    setTimeout(function () { res(false); }, 8000);
  });
  function sdkPost(msg) {
    var payload = { armath: msg };
    try {
      if (window.parent !== window) { window.parent.postMessage(payload, init.origin || '*'); return true; }
      if (window.ArMath && window.ArMath.postMessage) { window.ArMath.postMessage(JSON.stringify(msg)); return true; }          // Flutter JavascriptChannel
      if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); return true; }              // React Native
      if (window.chrome && window.chrome.webview) { window.chrome.webview.postMessage(msg); return true; }                     // WebView2
    } catch (e) { /* ignore */ }
    return false;
  }
  function sdkResult(msg) {
    var math = onlyMath(msg.equations);
    var c = combinedTex();
    if (!c) return;
    var o = Object.assign(opts(), { mode: c.mode });
    RenderHost.render(c.tex, o, init.dpi || 300).then(function (r) {
      return RenderHost.mathml(c.tex, o).catch(function () { return ''; }).then(function (mml) {
        sdkPost({
          type: 'result', mode: st.mode, latex: sourceText(), equations: msg.equations, opts: o,
          svg: r.svgString, png: r.dataUrl, mathml: mml, widthPt: r.widthPt, heightPt: r.heightPt, depthPt: r.depthPt,
          count: math.length
        });
      });
    }).catch(function (e) { toast(T('error') + ': ' + e.message, true); });
  }
  function send(msg) {
    if (host === 'sdk') {
      if (msg.type === 'cancel') return sdkPost({ type: 'cancel' });
      sdkResult(msg);
      return true;
    }
    if (host === 'dialog' && window.Office) {
      officeReady.then(function () {
        try { Office.context.ui.messageParent(JSON.stringify(msg)); }
        catch (e) { toast(T('error') + ': ' + e.message, true); }
      });
      return true;
    }
    if (host === 'frame' && window.parent !== window) {
      window.parent.postMessage({ armath: msg }, location.origin);
      return true;
    }
    return false;
  }

  function ok() {
    var eqs = currentEquations();
    if (!eqs.length) { toast(T('emptyPreview'), true); focusInput(); return; }
    $('okBtn').disabled = true;
    clearTimeout(pvTimer);
    updatePreview().then(function () {
      if (lastErrors.length) { toast(T('error') + ': ' + lastErrors[0], true); return; }
      persist();
      pushHist({ mode: st.mode, input: st.mode === 'chem' ? 'chem' : st.input, tex: sourceText(), t: Date.now() });
      return Promise.all(eqs.map(function (e) {
        if (!e.block) return e;
        return prepareBlock(e.block).then(function (m) {
          return m.type === 'table' ? { kind: 'table', table: m.table, line: e.line } : { kind: 'figure', fig: m.kind, data: m.data, line: e.line };
        });
      })).then(function (items) { finishInsert(items); });
    }).then(function () { $('okBtn').disabled = false; }, function (e) { $('okBtn').disabled = false; if (e) toast(T('error') + ': ' + (e.message || e), true); });
  }
  function finishInsert(eqs) {
    {
      var msg = {
        type: 'insert', mode: st.mode, equations: eqs, opts: opts(),
        layout: st.layout, sep: st.sep, textBold: !!st.textBold, textColor: st.textColor || '',
        numbered: !!st.numbered && st.mode === 'math', editId: init.editId || null,
        source: sourceText()                     // the text as written (used by the PDF studio to edit again)
      };
      if (!send(msg)) webResult(eqs);
    }
  }
  // insert a ready list of items (used by the step-by-step solver, balancer …)
  function insertItems(eqs, extra) {
    if (!eqs || !eqs.length) return;
    persist();
    var msg = Object.assign({
      type: 'insert', mode: 'math', equations: eqs, opts: opts(),
      layout: 'stack', sep: st.sep, textBold: !!st.textBold, textColor: st.textColor || '',
      numbered: false, editId: null
    }, extra || {});
    if (!send(msg)) webResult(eqs);
  }
  function setLatexSource(text) {
    if (st.mode !== 'math') { st.mode = 'math'; st.tab = null; buildTabs(); }
    st.input = 'latex';
    $('latexInp').value = text;
    syncHeader();
    schedulePreview();
  }
  function cancel() {
    if (!send({ type: 'cancel' })) {
      if (st.mode === 'chem') $('chemInp').value = ''; else if (st.input === 'visual' && mfReady) mf.value = ''; else $('latexInp').value = '';
      schedulePreview();
    }
  }
  $('okBtn').onclick = ok;
  $('cancelBtn').onclick = cancel;

  // Browser mode: copy image to clipboard
  function webResult(eqs) {
    eqs = onlyMath(eqs);
    if (!eqs.length) return;
    var o = opts();
    var tex = eqs.length === 1 ? eqs[0].tex : '\\begin{gathered}' + eqs.map(function (e) { return e.tex; }).join('\\\\[6pt]') + '\\end{gathered}';
    if (o.mode === 'chem' && eqs.length > 1) { o.mode = 'math'; tex = '\\begin{gathered}' + eqs.map(function (e) { return '\\ce{' + e.tex + '}'; }).join('\\\\[6pt]') + '\\end{gathered}'; }
    return RenderHost.render(tex, o, 300).then(function (r) {
      return fetch(r.dataUrl).then(function (x) { return x.blob(); }).then(function (blob) {
        if (navigator.clipboard && window.ClipboardItem) return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        throw new Error('clipboard');
      }).then(function () { toast(T('copied')); }, function () {
        var a = document.createElement('a'); a.href = r.dataUrl; a.download = 'equation.png'; document.body.appendChild(a); a.click(); a.remove();
      });
    }).catch(function (e) { toast(T('error') + ': ' + e.message, true); });
  }

  // ------------------------------------------------------------ copy the final preview as one picture
  // (for pasting straight into another app's dashboard, e.g. «راجع», without saving and uploading a file)
  function loadOnce(src) {
    if (document.querySelector('script[data-src="' + src + '"]')) return Promise.resolve();
    return new Promise(function (res, rej) { var sc = document.createElement('script'); sc.src = src; sc.dataset.src = src; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
  }
  function copyImage(transparent) {
    transparent = transparent === true;
    var eqs = currentEquations();
    if (!eqs.length) { toast(T('emptyPreview'), true); return; }
    var btn = $(transparent ? 'copyTrBtn' : 'copyImgBtn') || $('copyImgBtn'); btn.disabled = true;
    clearTimeout(pvTimer);
    updatePreview().then(function () {
      if (lastErrors.length) throw new Error(lastErrors[0]);
      return Promise.all(eqs.map(function (e) {
        if (!e.block) return e;
        return prepareBlock(e.block).then(function (m) { return m.type === 'table' ? { kind: 'table', table: m.table, line: e.line } : { kind: 'figure', fig: m.kind, data: m.data, line: e.line }; });
      }));
    }).then(function (items) {
      return Promise.all([loadOnce('js/core/vector.js?v=5.7.0'), loadOnce('js/pdf/compose.js?v=5.7.0')]).then(function () {
        var mo = opts(); if (transparent) mo.bg = '';
        var msg = { mode: st.mode, equations: items, opts: mo, textBold: !!st.textBold, textColor: st.textColor || '' };
        return window.Compose.compose(msg, 760);
      });
    }).then(function (c) {
      // text as outlines first: the picture must not depend on fonts
      return window.Vector.fromSVG(c.svg).catch(function () { return c.svg; }).then(function (svg) {
        return new Promise(function (res, rej) {
          // ≈ 600 dpi (sharp when pasted and enlarged), within a safe canvas size
          var img = new Image(), k = Math.max(2, Math.min(6.25, 9000 / (c.w + 16), 9000 / (c.h + 16)));
          img.onload = function () {
            var cv = document.createElement('canvas'), pad = Math.round(8 * k);
            cv.width = Math.ceil(c.w * k + 2 * pad); cv.height = Math.ceil(c.h * k + 2 * pad);
            var cx = cv.getContext('2d');
            if (!transparent) { cx.fillStyle = st.bg || '#fff'; cx.fillRect(0, 0, cv.width, cv.height); }
            cx.drawImage(img, pad, pad, c.w * k, c.h * k);
            cv.toBlob(function (b) { res({ blob: b, url: cv.toDataURL('image/png') }); }, 'image/png');
          };
          img.onerror = function () { rej(new Error('image')); };
          img.src = 'data:image/svg+xml;base64,' + window.Vector.toBase64(svg);
        });
      });
    }).then(function (r) {
      var fallback = function () { var a = document.createElement('a'); a.href = r.url; a.download = transparent ? 'equation-transparent.png' : 'equation.png'; document.body.appendChild(a); a.click(); a.remove(); };
      if (navigator.clipboard && window.ClipboardItem) return navigator.clipboard.write([new ClipboardItem({ 'image/png': r.blob })]).then(function () { toast(transparent ? (I18N.lang === 'en' ? 'Copied as a transparent image' : 'نُسخت صورة شفافة — الصقها في أي مكان') : T('imageCopied')); }, fallback);
      fallback();
    }).catch(function (e) { toast(T('error') + ': ' + (e.message || e), true); })
      .then(function () { btn.disabled = false; });
  }
  $('copyImgBtn').onclick = function () { copyImage(false); };
  // physical key (e.code): works with the Arabic and the English keyboard layout alike
  document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyC') { e.preventDefault(); copyImage(!!e.altKey); } });

  // ------------------------------------------------------------ boot
  I18N.apply();
  fillSizes();
  buildMatrixGrid();
  buildPeriodic();
  if (st.mode === 'chem' && init.tex) $('chemInp').value = init.tex;
  if (st.mode === 'math' && init.tex && st.input === 'latex') $('latexInp').value = init.tex;
  if (st.mode === 'math' && init.tex && /\n/.test(init.tex)) { st.input = 'latex'; $('latexInp').value = init.tex; }
  syncHeader();
  buildColorPop();
  buildTabs();
  var hideLoader = function () { var l = $('loader'); if (l && !l.hidden) { l.classList.add('done'); setTimeout(function () { l.hidden = true; }, 400); } };
  RenderHost.warm(st.mathFont).then(function () { schedulePreview(); setTimeout(hideLoader, 250); }, hideLoader);
  setTimeout(hideLoader, 5000);
  window.__editor = { init: init, st: st, currentEquations: currentEquations, ok: ok, opts: opts, insertItems: insertItems, setLatexSource: setLatexSource,
    toast: toast, schedulePreview: schedulePreview, copyImage: copyImage, onlyMath: onlyMath, sourceText: sourceText, host: host, send: send, copyText: copyText, mf: mf };
  document.dispatchEvent(new CustomEvent('armath:editor-ready'));
})();
