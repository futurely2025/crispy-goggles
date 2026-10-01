/* Chemistry mode: «مبسّط | LaTeX» switch.
 *   مبسّط  : 2H2 + O2 -> 2H2O           (what the chemistry buttons type)
 *   LaTeX  : \ce{2H2 + O2 -> 2H2O}      (mhchem — the same code the AI guide, Word «إلى LaTeX» and «نسخ كود LaTeX» use)
 * Both are read by the editor (a \ce{…} line is the same reaction), so switching only rewrites the text in the box. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'armath.chemView';
  var ta = $('chemInp'), wrap = $('chemWrap'), tools = document.querySelector('.bar-tools');
  if (!ta || !wrap || !tools) return;
  function en() { return !!(window.I18N && I18N.lang === 'en'); }
  function L(ar, e) { return en() ? e : ar; }
  function pref() { try { return localStorage.getItem(KEY) === 'latex' ? 'latex' : 'plain'; } catch (e) { return 'plain'; } }
  function savePref(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* ignore */ } }

  var AR = /[ء-ي]/;
  function isText(t) { return AR.test(t) && !/->|<-|<=>|=|\\ce/.test(t); }
  function inner(t) {
    var m = /^\$*\s*\\ce\s*\{([\s\S]*)\}\s*\$*$/.exec(t); if (!m) return null;
    for (var d = 0, k = 0; k < m[1].length; k++) { d += m[1][k] === '{' ? 1 : m[1][k] === '}' ? -1 : 0; if (d < 0) return null; }
    return d === 0 ? m[1].trim() : null;
  }
  function toLatex(src) {
    return String(src).split('\n').map(function (l) {
      var t = l.trim();
      if (!t || /^%/.test(t) || inner(t) !== null) return l;
      if (isText(t)) return '% ' + t;                         // a title / sentence between reactions
      return '\\ce{' + t + '}';
    }).join('\n');
  }
  function toPlain(src) {
    return String(src).split('\n').map(function (l) { var i = inner(l.trim()); return i === null ? l : i; }).join('\n');
  }

  // ---- the switch, next to «داخل السطر / سطر مستقل»
  var seg = document.createElement('div');
  seg.className = 'seg small'; seg.id = 'chemViewSeg'; seg.hidden = true;
  seg.innerHTML = '<button type="button" data-cv="plain" title="' + L('كتابة مبسّطة: 2H2 + O2 -> 2H2O', 'Plain: 2H2 + O2 -> 2H2O') + '">' + L('مبسّط', 'Plain') + '</button>' +
    '<button type="button" data-cv="latex" title="' + L('كود LaTeX (mhchem): \\ce{2H2 + O2 -> 2H2O}', 'LaTeX (mhchem): \\ce{2H2 + O2 -> 2H2O}') + '">LaTeX</button>';
  tools.insertBefore(seg, tools.firstChild);
  var view = pref();
  function mark() { Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-cv') === view)); }); }
  function apply(v, keepPref) {
    view = v; if (!keepPref) savePref(v); mark();
    var before = ta.value, after = v === 'latex' ? toLatex(before) : toPlain(before);
    if (after !== before) {
      ta.value = after;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  seg.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-cv]'); if (!b) return;
    apply(b.getAttribute('data-cv'));
    ta.focus();
  });
  // show it only in chemistry mode; entering the mode (or opening a saved reaction) shows the text in the chosen form
  function syncVis() {
    var on = !wrap.hidden;
    if (on && seg.hidden) { seg.hidden = false; apply(view, true); }
    else if (!on) seg.hidden = true;
  }
  new MutationObserver(syncVis).observe(wrap, { attributes: true, attributeFilter: ['hidden'] });
  mark(); syncVis();
  setTimeout(function () { if (!seg.hidden) apply(view, true); else syncVis(); }, 600);          // a reaction opened for editing is placed in the box after start-up
  window.ChemLatex = { toLatex: toLatex, toPlain: toPlain, set: apply, get view() { return view; } };
})();
