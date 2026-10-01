/* Chemistry studio: the LaTeX code of every tab, like the other studios.
 *   · «الجدول الدوري والذرة»: \element{Fe}  \bohr{Na}  \lewis{O2-}  \orbital[short]{Fe}  \ptable[highlight={Na,K}, names]  \econfig{Fe}
 *     — shown and editable (typing the code changes the drawing).
 *   · «الحسابات الكيميائية»: the steps as LaTeX (% text line, then the equation) — to copy or paste into «LaTeX» mode.
 * The lab tab already has its code panel. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var C = window.__chem, E = window.ChemElements;
  if (!C || !E || !window.Studio) return;
  var tr = Studio.tr;

  function section(forTab, title, id) {
    var d = document.createElement('details');
    d.className = 'st-sec'; d.open = true; d.setAttribute('data-for', forTab); d.hidden = C.tab !== forTab;
    d.innerHTML = '<summary>' + tr(title) + '</summary><div class="bd" id="' + id + '"></div>';
    var side = document.querySelector('.st-side'), after = side.querySelectorAll('[data-for="' + forTab + '"]');
    side.insertBefore(d, after.length ? after[after.length - 1].nextSibling : null);
    return d.querySelector('.bd');
  }
  function copy(t) {
    (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { Studio.toast(tr('تم النسخ|Copied')); }, function () {
      var x = document.createElement('textarea'); x.value = t; document.body.appendChild(x); x.select();
      try { document.execCommand('copy'); Studio.toast(tr('تم النسخ|Copied')); } catch (e) { /* ignore */ } x.remove();
    });
  }

  // ------------------------------------------------------------ atom tab
  var ab = section('atom', 'الكود (LaTeX)|Code (LaTeX)', 'atomCode');
  ab.innerHTML = '<textarea class="code" spellcheck="false" dir="ltr" style="min-height:58px"></textarea>' +
    '<div class="code-bar"><span class="code-msg"></span><button type="button" class="chip" data-a="copy">' + tr('نسخ|Copy') + '</button></div>' +
    '<p class="hint">' + tr('يمكنك كتابة الكود مباشرة، مثل: \\bohr{Fe} أو \\lewis{O2-} أو \\orbital[short]{Fe} أو \\ptable[highlight={Na,K}] أو \\econfig{Fe}. وهو نفسه الذي يُكتب في وضع LaTeX بالمحرر.|Type the code directly, e.g. \\bohr{Fe}, \\lewis{O2-}, \\orbital[short]{Fe}, \\ptable[highlight={Na,K}], \\econfig{Fe}.') + '</p>';
  var ta = ab.querySelector('textarea'), msg = ab.querySelector('.code-msg'), editing = false, timer = null, last = '';
  function codeOf() {
    var a = C.atom;
    if (a.what === 'config') return C.configTex();
    return AtomRender.serialize(C.atomData());
  }
  function refresh() { if (editing) return; last = codeOf(); ta.value = last; msg.textContent = ''; msg.className = 'code-msg'; }
  function sym(s) { var e = E.info(/^\d+$/.test(s) ? +s : s.length <= 2 ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s); return e.sym; }
  function apply() {
    var src = ta.value.trim();
    if (!src || src === last) return;
    var m = /^\\(element|bohr|lewis|orbital|ptable|econfig)\s*(?:\[([^\]]*)\])?\s*(?:\{([^}]*)\})?\s*$/.exec(src);
    try {
      if (!m) throw new Error(tr('اكتب أمراً واحداً مثل \\bohr{Fe}|Write one command such as \\bohr{Fe}'));
      var what = m[1] === 'econfig' ? 'config' : m[1], opts = window.Mk ? Mk.options(m[2] || '') : {}, q = (m[3] || '').trim(), a = C.atom;
      if (what !== 'ptable' && !q) throw new Error(tr('اكتب رمز العنصر بين { }|Put the element symbol in { }'));
      if (what === 'ptable') {
        var hl = String(opts.highlight || '').replace(/[{}]/g, '').split(/[,،\s]+/).filter(Boolean);
        if (hl.length) { a.sym = sym(hl[0]); a.hlSel = true; a.hlMore = hl.slice(1).join(', '); } else { a.hlSel = false; a.hlMore = ''; }
        var ltr = !!opts.ltr; a.names = !!opts.names;
        if (ltr !== a.ltr) { a.ltr = ltr; C.buildPick(); }
      } else {
        var mm = /^([A-Za-z]{1,2}|\d+|[^\d+-]+?)(\d*[+-])?$/.exec(q);
        a.sym = sym(mm ? mm[1] : q);
        a.ion = what === 'lewis' && mm && mm[2] ? mm[2].replace(/^1/, '') : '';
        a.short = !!opts.short || m[2] === 'short';
      }
      a.what = what;
      last = src; C.sync(); C.redraw(true);
      msg.textContent = tr('✓ تم التطبيق|✓ Applied'); msg.className = 'code-msg ok';
    } catch (e) { msg.textContent = e.message; msg.className = 'code-msg err'; }
  }
  ta.addEventListener('input', function () { editing = true; clearTimeout(timer); timer = setTimeout(apply, 650); });
  ta.addEventListener('blur', function () { clearTimeout(timer); apply(); editing = false; refresh(); });
  ta.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); apply(); } });
  ab.querySelector('[data-a=copy]').onclick = function () { copy(ta.value); };
  // the drawing is redrawn after every change → the status line changes → refresh the code
  new MutationObserver(function () { if (C.tab === 'atom') refresh(); }).observe($('status'), { childList: true, characterData: true, subtree: true });

  // ------------------------------------------------------------ calc tab
  var cb = section('calc', 'الكود (LaTeX)|Code (LaTeX)', 'calcCode');
  cb.innerHTML = '<textarea class="code" spellcheck="false" dir="auto" readonly style="min-height:120px"></textarea>' +
    '<div class="code-bar"><span class="code-msg"></span><button type="button" class="chip" data-a="copy">' + tr('نسخ|Copy') + '</button></div>' +
    '<p class="hint">' + tr('الحل بالخطوات بصيغة LaTeX: السطر الذي يبدأ بـ % نص، وتحته المعادلة. الصقه في وضع LaTeX بالمحرر أو أعطه للذكاء الاصطناعي.|The steps as LaTeX: a line starting with % is text, the equation follows.') + '</p>';
  var cta = cb.querySelector('textarea');
  function stepsTex() { return (C.steps || []).map(function (s) { return '% ' + s.t + (s.tex ? '\n' + s.tex : ''); }).join('\n'); }
  function refreshCalc() { cta.value = stepsTex() || tr('% اضغط «احسب بالخطوات» أولاً|% Press «Solve» first'); }
  cb.querySelector('[data-a=copy]').onclick = function () { var t = stepsTex(); if (t) copy(t); else Studio.toast(tr('احسب أولاً|Solve first')); };
  new MutationObserver(refreshCalc).observe($('calcOut'), { childList: true });

  refresh(); refreshCalc();
  window.ChemCode = { refresh: refresh, apply: apply, stepsTex: stepsTex };
})();
