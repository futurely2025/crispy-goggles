/* Editor extras (5.4):
 *   · Enter in the visual editor starts a new line (a new row in matrices / systems), like MathType
 *   · «الخلفية» — background of THIS equation: transparent, white or any colour (kept with the equation,
 *     so editing it later shows the same choice) */
(function () {
  'use strict';
  var E = window.__editor; if (!E) return;
  var $ = function (id) { return document.getElementById(id); };
  function en() { return !!(window.I18N && I18N.lang === 'en'); }
  function L(a, e) { return en() ? e : a; }

  // ------------------------------------------------------------ Enter = new line
  function newLine(mf) {
    var before = mf.value;
    if (!before.trim()) return false;
    // inside a fraction, root, script … a row cannot start there: step out of the parent until it can
    for (var k = 0; k < 8; k++) {
      mf.executeCommand('addRowAfter');
      if (mf.value !== before) return true;
      if (!mf.executeCommand('moveAfterParent')) break;
    }
    mf.executeCommand('moveToMathfieldEnd');
    mf.executeCommand('addRowAfter');
    return mf.value !== before;
  }
  function hookEnter() {
    var mf = $('mf');
    if (!mf || mf.__enterHook) return;
    mf.__enterHook = true;
    mf.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey) return;       // Ctrl+Enter = insert
      e.preventDefault(); e.stopPropagation();
      try { if (newLine(mf)) E.schedulePreview(); } catch (x) { if (window.ArLog) ArLog.warn('newline', String(x && x.message || x)); }
    }, true);
  }
  if (window.customElements) customElements.whenDefined('math-field').then(function () { setTimeout(hookEnter, 0); });

  // ------------------------------------------------------------ background of this equation
  function bgButton() {
    if (!window.BgPick || $('bgBtn')) return;
    var fr = document.querySelector('.tb-format .fr');
    if (!fr) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'fbtn bgbtn'; b.id = 'bgBtn';
    b.title = L('خلفية المعادلة: شفافة أو بيضاء أو أي لون', 'Equation background: none, white or any colour');
    b.innerHTML = '<span class="bgsw" id="bgSwatch"></span>';
    fr.appendChild(b);
    var pop = document.createElement('div');
    pop.className = 'pop bgpop'; pop.id = 'bgPop'; pop.hidden = true;
    pop.innerHTML = '<div class="pop-title">' + L('خلفية هذه المعادلة', 'Background of this equation') + '</div>';
    var pick = BgPick.el({ value: E.st.bg || '', onChange: function (v) { E.st.bg = v; sync(); E.schedulePreview(); } });
    pop.appendChild(pick);
    var hint = document.createElement('p');
    hint.className = 'c-hint';
    hint.textContent = L('تُحفظ مع المعادلة: معادلة شفافة وأخرى بيضاء كما تشاء. ولجعلها الافتراضية فعّل «استخدام هذا الخط والحجم افتراضياً».', 'Saved with the equation. Tick "use as default" to make it the default.');
    pop.appendChild(hint);
    document.body.appendChild(pop);
    function sync() { $('bgSwatch').setAttribute('style', BgPick.swatchStyle(E.st.bg)); b.setAttribute('aria-pressed', String(!!E.st.bg)); }
    function place() {
      var r = b.getBoundingClientRect(), w = Math.min(300, window.innerWidth - 12);
      pop.style.width = w + 'px';
      pop.style.top = (r.bottom + 6) + 'px';
      pop.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + 'px';
    }
    b.addEventListener('click', function (e) { e.stopPropagation(); pop.hidden = !pop.hidden; if (!pop.hidden) { pick.setValue(E.st.bg || ''); place(); } });
    document.addEventListener('mousedown', function (e) { if (!pop.hidden && !pop.contains(e.target) && e.target !== b && !b.contains(e.target)) pop.hidden = true; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.hidden) { pop.hidden = true; e.stopPropagation(); } }, true);
    window.addEventListener('resize', function () { if (!pop.hidden) place(); });
    sync();
  }
  var css = document.createElement('style');
  css.textContent = '.fbtn.bgbtn{display:inline-flex;align-items:center;justify-content:center}.fbtn.bgbtn .bgsw{width:16px;height:16px;border-radius:4px;border:1px solid #9fb3b8;display:inline-block}' +
    '.pop.bgpop{position:fixed;z-index:60;padding:10px 12px}.pop.bgpop .c-hint{margin:8px 0 0;font-size:11.5px;color:#6b7f86;line-height:1.6}';
  document.head.appendChild(css);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bgButton); else bgButton();
  // ------------------------------------------------------------ fold the preview (more room to write, like MathType)
  function foldButton() {
    var tools = document.querySelector('.pv-tools');
    if (!tools || $('pvFold')) return;
    var KEY = 'armath.pvFold', b = document.createElement('button');
    b.type = 'button'; b.id = 'pvFold'; b.className = 'pv-fold';
    function get() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
    function set(on) {
      document.body.classList.toggle('pv-folded', on);
      b.textContent = on ? '▴' : '▾';
      b.title = on ? L('إظهار المعاينة', 'Show preview') : L('إخفاء المعاينة (مساحة أكبر للكتابة)', 'Hide preview (more room)');
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
    }
    b.onclick = function () { set(!document.body.classList.contains('pv-folded')); };
    tools.insertBefore(b, tools.firstChild);
    set(get());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', foldButton); else foldButton();

  // ------------------------------------------------------------ font list: keep the equation's font even if it is not in the list
  (function () {
    var sel = $('arFontSel');
    if (!sel || !E.st.font) return;
    if (sel.value !== E.st.font) {
      var o = document.createElement('option'); o.value = E.st.font; o.textContent = E.st.font;
      sel.insertBefore(o, sel.firstChild); sel.value = E.st.font;
    }
  })();

  // ------------------------------------------------------------ «محاذاة =» toggle (several equations lined up on '=')
  function alignButton() {
    var row = $('layoutRow');
    if (!row || $('alignEqBtn')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'alignEqBtn'; b.className = 'tool txtb';
    b.title = L('محاذاة المعادلات على علامة = (مثل خطوات الحل في الكتاب): كل معادلة بنفس العرض و= في نفس المكان', 'Line equations up on "="');
    b.innerHTML = '<b style="font-family:Times New Roman,serif">=</b>&nbsp;' + L('محاذاة', 'Align');
    function sync() { b.setAttribute('aria-pressed', String(!!E.st.alignEq)); }
    b.onclick = function () { E.st.alignEq = !E.st.alignEq; sync(); E.schedulePreview(); };
    var ref = $('textBoldBtn');
    row.insertBefore(b, ref || null);
    sync();
    // «Aa بخط النص» (5.7): digits, Latin letters and chemical symbols follow the chosen font as well
    if (!$('latinFontBtn')) {
      var a = document.createElement('button');
      a.type = 'button'; a.id = 'latinFontBtn'; a.className = 'tool txtb';
      a.title = L('الأرقام والحروف اللاتينية والرموز الكيميائية بالخط المختار (بدل خط الرياضيات الافتراضي)',
        'Digits, Latin letters and chemical symbols in the chosen font');
      a.innerHTML = '<b>Aa</b>&nbsp;' + L('بالخط', 'Font');
      var s2 = function () { a.setAttribute('aria-pressed', String(!!E.st.latinFont)); };
      a.onclick = function () { E.st.latinFont = !E.st.latinFont; s2(); E.schedulePreview(); };
      row.insertBefore(a, b.nextSibling);
      s2();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alignButton); else alignButton();

  // ------------------------------------------------------------ «نسخ شفافة» (copy the preview as a picture without background)
  (function () {
    var c = $('copyImgBtn');
    if (!c || $('copyTrBtn') || !E.copyImage) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn ghost'; b.id = 'copyTrBtn';
    b.title = L('نسخ كصورة بلا خلفية (شفافة) — Ctrl+Shift+Alt+C', 'Copy as a transparent image — Ctrl+Shift+Alt+C');
    b.innerHTML = '<span class="trsw"></span> <span>' + L('شفافة', 'Transparent') + '</span>';
    b.onclick = function () { E.copyImage(true); };
    c.parentNode.insertBefore(b, c.nextSibling);
    var s = document.createElement('style');
    s.textContent = '.trsw{display:inline-block;width:13px;height:13px;border-radius:3px;border:1px solid #9fb3b8;vertical-align:-2px;background:repeating-conic-gradient(#d9e2e4 0 25%,#fff 0 50%) 0 0/6px 6px}' +
      '#copyTrBtn{min-width:0;padding-inline:12px}@media (max-width:620px){#copyTrBtn span:last-child{display:none}}';
    document.head.appendChild(s);
  })();

  window.EditorExtras = { newLine: newLine };
})();
