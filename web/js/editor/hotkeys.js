/* Editor keyboard (5.7): the same shortcuts with the Arabic AND the English keyboard layout.
 *  · Ctrl + key shortcuts read the PHYSICAL key (e.code), so Ctrl+F is a fraction whether the keyboard is on العربية or English
 *      Ctrl+F كسر · Ctrl+R جذر · Ctrl+Shift+R جذر نوني · Ctrl+H أس · Ctrl+L دليل سفلي · Ctrl+J أس ودليل · Ctrl+9 أقواس
 *      Ctrl+[ أقواس مربعة · Ctrl+I تكامل · Ctrl+Shift+S مجموع · Ctrl+Shift+L نهاية · Ctrl+M مصفوفة 2×2 · Ctrl+Shift+P π
 *  · words become math in BOTH languages: كسر جذر تكامل مجموع باي مالانهاية دلتا ثيتا … / frac sqrt int sum pi …
 *    and with Arabic notation the English function names become Arabic: sin → جا، cos → جتا، log → لو، lim → نها …
 *  · «ع⌨»: type Arabic letters with the English keyboard (each key gives the letter of the Arabic layout: s → س …) */
(function () {
  'use strict';
  var E = window.__editor; if (!E) return;
  var $ = function (id) { return document.getElementById(id); };
  function en() { return !!(window.I18N && I18N.lang === 'en'); }
  function L(a, e) { return en() ? e : a; }
  function arabicNotation() { return !!(E.st.rtl && E.st.arabicFunctions !== false); }

  // ------------------------------------------------------------ inserting
  function taInsert(ta, snip) {
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, sel = v.slice(s, e);
    var text = snip.replace(/#0/, sel), caret = text.indexOf('#?');
    text = text.replace(/#0/g, '').replace(/#\?/g, '');
    if (caret < 0) caret = text.length;
    ta.value = v.slice(0, s) + text + v.slice(e);
    ta.focus(); ta.setSelectionRange(s + caret, s + caret);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function insert(snip) {
    var mf = $('mf');
    if (E.st.mode === 'chem') return taInsert($('chemInp'), snip.replace(/\\left|\\right/g, ''));
    if (E.st.input === 'visual' && mf) {
      mf.focus();
      // scripts attach to what is before the caret (س then Ctrl+H → س²)
      if (/^#0\^/.test(snip)) { mf.executeCommand('moveToSuperscript'); E.schedulePreview(); return; }
      if (/^#0_/.test(snip)) { mf.executeCommand('moveToSubscript'); E.schedulePreview(); return; }
      try { mf.insert(snip.replace(/#\?/g, '#?'), { selectionMode: 'placeholder', format: 'latex', focus: true }); } catch (e) { mf.executeCommand(['insert', snip]); }
      E.schedulePreview();
    } else taInsert($('latexInp'), snip);
  }
  function dx() { return arabicNotation() ? '\\, ءس' : '\\, dx'; }
  var KEYS = [
    // [code, shift, snippet or fn, Arabic label, English label]
    ['KeyF', false, '\\frac{#0}{#?}', 'كسر', 'Fraction'],
    ['KeyR', false, '\\sqrt{#0}', 'جذر تربيعي', 'Square root'],
    ['KeyR', true, '\\sqrt[#?]{#0}', 'جذر نوني', 'n-th root'],
    ['KeyH', false, '#0^{#?}', 'أس (مرفوع)', 'Superscript'],
    ['KeyL', false, '#0_{#?}', 'دليل سفلي', 'Subscript'],
    ['KeyJ', false, '#0_{#?}^{#?}', 'أس ودليل', 'Sub + superscript'],
    ['Digit9', false, '\\left(#0\\right)', 'أقواس ( )', 'Parentheses'],
    ['Digit0', false, '\\left(#0\\right)', 'أقواس ( )', 'Parentheses'],
    ['BracketLeft', false, '\\left[#0\\right]', 'أقواس [ ]', 'Brackets'],
    ['KeyI', false, function () { return '\\int_{#?}^{#?} #0' + dx(); }, 'تكامل', 'Integral'],
    ['KeyS', true, '\\sum_{#?}^{#?} #0', 'مجموع ∑', 'Sum'],
    ['KeyL', true, function () { return arabicNotation() ? '\\operatorname*{نها}_{س\\to #?} #0' : '\\lim_{x\\to #?} #0'; }, 'نهاية', 'Limit'],
    ['KeyM', false, '\\begin{pmatrix} #? & #? \\\\ #? & #? \\end{pmatrix}', 'مصفوفة 2×2', '2×2 matrix'],
    ['KeyP', true, '\\pi', 'π', 'π']
  ];
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    var t = e.target, inEditor = t && (t.id === 'mf' || t.id === 'latexInp' || t.id === 'chemInp' || (t.closest && t.closest('#mf')));
    if (!inEditor) return;
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      if (k[0] === e.code && k[1] === !!e.shiftKey) {
        e.preventDefault(); e.stopPropagation();
        insert(typeof k[2] === 'function' ? k[2]() : k[2]);
        return;
      }
    }
  }, true);

  // ------------------------------------------------------------ words → math (both languages)
  var AR_WORDS = {
    'كسر': '\\frac{#0}{#?}', 'جذر': '\\sqrt{#0}', 'تكامل': function () { return '\\int_{#?}^{#?} #0' + dx(); }, 'مجموع': '\\sum_{#?}^{#?}',
    'باي': '\\pi', 'مالانهاية': '\\infty', 'لانهاية': '\\infty', 'دلتا': '\\Delta', 'ثيتا': '\\theta', 'الفا': '\\alpha', 'ألفا': '\\alpha',
    'بيتا': '\\beta', 'غاما': '\\gamma', 'لامدا': '\\lambda', 'سيجما': '\\sigma', 'اوميغا': '\\omega', 'أوميغا': '\\omega', 'ميو': '\\mu',
    'زائدناقص': '\\pm', 'ضرب': '\\times', 'قسمة': '\\div', 'لايساوي': '\\neq', 'تقريبا': '\\approx', 'يؤول': '\\to', 'زاوية': '\\angle',
    'متجه': '\\vec{#0}', 'مصفوفة': '\\begin{pmatrix} #? & #? \\\\ #? & #? \\end{pmatrix}', 'نظام': '\\begin{cases} #? \\\\ #? \\end{cases}'
  };
  var EN_TO_AR = { sin: 'جا', cos: 'جتا', tan: 'طا', cot: 'طتا', sec: 'قا', csc: 'قتا', log: 'لو', ln: 'لط' };
  function arabicFunctionShortcuts() {
    var s = {};
    if (!arabicNotation()) return s;
    Object.keys(EN_TO_AR).forEach(function (k) { s[k] = '\\operatorname{' + EN_TO_AR[k] + '}'; });
    s.lim = '\\operatorname*{نها}_{س\\to #?}';
    return s;
  }
  function hookField() {
    var mf = $('mf');
    if (!mf || mf.__hk) return;
    mf.__hk = true;
    var base = Object.assign({}, mf.inlineShortcuts || {});
    function sync() { try { mf.inlineShortcuts = Object.assign({}, base, arabicFunctionShortcuts()); } catch (e) { /* ignore */ } }
    sync();
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#notationBtn,#modeSeg')) setTimeout(sync, 50); });
    // Arabic words (MathLive's own shortcuts ignore Arabic letters)
    var AR = /^[ء-ي]$/, busy = false, words = Object.keys(AR_WORDS).sort(function (a, b) { return b.length - a.length; });
    mf.addEventListener('input', function (e) {
      if (busy || !e || e.inputType !== 'insertText' || !e.data || !AR.test(e.data)) return;
      setTimeout(checkWord, 0);                      // after MathLive has settled the new letter
    });
    function checkWord() {
      if (busy) return;
      var pos = mf.position;
      for (var i = 0; i < words.length; i++) {
        var w = words[i], n = w.length;
        if (pos < n) continue;
        var got = ''; try { got = mf.getValue(pos - n, pos, 'latex'); } catch (x) { return; }
        if (got !== w) continue;
        var before = pos - n > 0 ? mf.getValue(pos - n - 1, pos - n, 'latex') : '';
        if (/^[ء-ي]$/.test(before)) return;                   // part of a longer word
        busy = true;
        try {
          mf.selection = { ranges: [[pos - n, pos]], direction: 'forward' };
          var sn = AR_WORDS[w]; sn = typeof sn === 'function' ? sn() : sn;
          mf.insert(sn.replace(/#0/g, '#?'), { insertionMode: 'replaceSelection', selectionMode: 'placeholder', format: 'latex' });
        } catch (x) { /* ignore */ }
        busy = false;
        E.schedulePreview();
        return;
      }
    }
    // ع⌨ : Arabic letters with the English keyboard
    var MAP = { KeyQ: 'ض', KeyW: 'ص', KeyE: 'ث', KeyR: 'ق', KeyT: 'ف', KeyY: 'غ', KeyU: 'ع', KeyI: 'ه', KeyO: 'خ', KeyP: 'ح', BracketLeft: 'ج', BracketRight: 'د',
      KeyA: 'ش', KeyS: 'س', KeyD: 'ي', KeyF: 'ب', KeyG: 'ل', KeyH: 'ا', KeyJ: 'ت', KeyK: 'ن', KeyL: 'م', Semicolon: 'ك', Quote: 'ط',
      KeyZ: 'ئ', KeyX: 'ء', KeyC: 'ؤ', KeyV: 'ر', KeyB: 'لا', KeyN: 'ى', KeyM: 'ة', Comma: 'و', Period: 'ز', Slash: 'ظ', Backquote: 'ذ' };
    var SHIFT = { KeyH: 'أ', KeyY: 'إ', KeyN: 'آ', KeyB: 'لآ', KeyT: 'لإ', KeyG: 'لأ' };
    mf.addEventListener('keydown', function (e) {
      if (!arKbd || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key && /[؀-ۿ]/.test(e.key)) return;                   // the keyboard is already Arabic
      var ch = (e.shiftKey ? SHIFT[e.code] : null) || (!e.shiftKey ? MAP[e.code] : null);
      // MathLive ignores text typed from inside its own key handler: queue it (keeping the order of the other keys)
      if (!ch && !(queue.length && e.key && e.key.length === 1)) return;
      e.preventDefault(); e.stopPropagation();
      queue.push(ch || e.key);
      if (queue.length === 1) setTimeout(function () {
        var q = queue.splice(0);
        q.forEach(function (c) { try { mf.executeCommand(['typedText', c]); } catch (x) { mf.insert(c, { format: 'latex' }); } });
        E.schedulePreview();
      }, 0);
    }, true);
    var queue = [];
  }
  if (window.customElements) customElements.whenDefined('math-field').then(function () { setTimeout(hookField, 0); });

  // ------------------------------------------------------------ ع⌨ toggle + shortcuts help
  var arKbd = false;
  try { arKbd = localStorage.getItem('armath.arKbd') === '1'; } catch (e) { /* ignore */ }
  function ui() {
    var fr = document.querySelector('.tb-format .fr');
    if (!fr || $('arKbdBtn')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'fbtn arkbd'; b.id = 'arKbdBtn';
    b.title = L('كتابة الحروف العربية بلوحة المفاتيح الإنجليزية (s ← س) في المحرر المرئي', 'Type Arabic letters with the English keyboard');
    b.innerHTML = 'ع<small>⌨</small>';
    function sync() { b.setAttribute('aria-pressed', String(arKbd)); }
    b.onclick = function () { arKbd = !arKbd; try { localStorage.setItem('armath.arKbd', arKbd ? '1' : '0'); } catch (e) { /* ignore */ } sync(); var mf = $('mf'); if (mf) mf.focus(); E.toast(arKbd ? L('الحروف عربية الآن حتى مع لوحة المفاتيح الإنجليزية', 'Arabic letters on') : L('عادت الحروف كما في لوحة المفاتيح', 'Arabic letters off')); };
    fr.appendChild(b); sync();
    var tools = document.querySelector('.bar-tools');
    if (tools && !$('keysBtn')) {
      var k = document.createElement('button');
      k.type = 'button'; k.className = 'tool'; k.id = 'keysBtn'; k.title = L('اختصارات لوحة المفاتيح', 'Keyboard shortcuts'); k.textContent = '⌨';
      k.onclick = help;
      tools.appendChild(k);
    }
    var s = document.createElement('style');
    s.textContent = '.fbtn.arkbd{width:auto;padding:0 4px;font-weight:700;font-size:13px}.fbtn.arkbd small{font-size:10px;margin-inline-start:1px}' +
      '.kh-back{position:fixed;inset:0;background:rgba(12,30,34,.4);z-index:90;display:flex;align-items:center;justify-content:center;padding:10px}' +
      '.kh{background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:100%;overflow:auto;padding:14px 16px;box-shadow:0 20px 50px rgba(0,0,0,.3)}' +
      '.kh h3{margin:0 0 8px;font-size:15px;display:flex;justify-content:space-between}.kh h3 button{border:0;background:none;font-size:17px;cursor:pointer}' +
      '.kh table{width:100%;border-collapse:collapse;font-size:13px}.kh td{border-bottom:1px solid #eef3f4;padding:4px 6px}.kh kbd{font:12px Consolas,monospace;background:#eef4f5;border:1px solid #cfdcdf;border-radius:4px;padding:1px 5px;direction:ltr;display:inline-block}' +
      '.kh .sub{font-weight:700;color:#0a7c78;padding-top:10px}';
    document.head.appendChild(s);
  }
  function help() {
    var rows = KEYS.filter(function (k, i) { return k[0] !== 'Digit0'; }).map(function (k) {
      return '<tr><td><kbd>Ctrl' + (k[1] ? '+Shift' : '') + '+' + k[0].replace(/^Key|^Digit/, '').replace('BracketLeft', '[') + '</kbd></td><td>' + (en() ? k[4] : k[3]) + '</td></tr>';
    }).join('');
    var words = '<tr><td colspan="2">' + Object.keys(AR_WORDS).slice(0, 18).join('، ') + ' …</td></tr><tr><td colspan="2" dir="ltr" style="text-align:left">frac sqrt int sum pi infty alpha theta lim … / sin cos tan log ln → جا جتا طا لو لط</td></tr>';
    var back = document.createElement('div'); back.className = 'kh-back';
    back.innerHTML = '<div class="kh" dir="' + (en() ? 'ltr' : 'rtl') + '"><h3><span>⌨ ' + L('اختصارات لوحة المفاتيح — تعمل بالعربية والإنجليزية', 'Keyboard shortcuts') + '</span><button type="button">✕</button></h3><table>' +
      '<tr><td class="sub" colspan="2">' + L('مفاتيح (نفس المفتاح في أي لغة)', 'Keys (same key in any layout)') + '</td></tr>' + rows +
      '<tr><td><kbd>Enter</kbd></td><td>' + L('سطر جديد', 'New line') + '</td></tr><tr><td><kbd>Ctrl+Enter</kbd></td><td>' + L('إدراج', 'Insert') + '</td></tr>' +
      '<tr><td><kbd>Ctrl+Shift+C</kbd></td><td>' + L('نسخ كصورة', 'Copy as image') + '</td></tr><tr><td><kbd>Ctrl+Shift+Alt+C</kbd></td><td>' + L('نسخ صورة شفافة', 'Copy transparent image') + '</td></tr>' +
      '<tr><td class="sub" colspan="2">' + L('اكتب الكلمة فتتحول (في المحرر المرئي)', 'Type a word (visual editor)') + '</td></tr>' + words +
      '<tr><td class="sub" colspan="2">ع⌨</td></tr><tr><td colspan="2">' + L('زر «ع⌨» بجانب B: الحروف العربية بلوحة المفاتيح الإنجليزية (s ← س، f ← ب، j ← ت …)', 'The «ع⌨» button types Arabic letters with the English keyboard') + '</td></tr>' +
      '</table></div>';
    document.body.appendChild(back);
    function close() { back.remove(); }
    back.querySelector('h3 button').onclick = close;
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape' && back.isConnected) { e.stopPropagation(); close(); document.removeEventListener('keydown', esc, true); } }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui); else ui();
  window.EditorHotkeys = { insert: insert, KEYS: KEYS, help: help };
})();
