/* BgPick — a small background chooser: transparent, white, a palette and any custom colour.
 *   BgPick.el({ value: '' | '#ffffff' | …, onChange: fn(value), compact: bool }) -> element (value '' = transparent)
 * Used by the equation editor (background of this equation) and the Word pane (selected equations / figures). */
(function (global) {
  'use strict';
  var KEY = 'armath.bg.recent';
  var PALETTE = ['#ffffff', '#fffde7', '#fff3e0', '#fce4ec', '#e8f5e9', '#e3f2fd', '#ede7f6', '#f5f5f5', '#e0f2f1', '#000000'];
  function en() { return !!(global.I18N && I18N.lang === 'en'); }
  function L(a, e) { return en() ? e : a; }
  function recent() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function remember(c) {
    if (!c || c === '#ffffff') return;
    var r = recent().filter(function (x) { return x !== c; }); r.unshift(c);
    try { localStorage.setItem(KEY, JSON.stringify(r.slice(0, 6))); } catch (e) { /* ignore */ }
  }
  function norm(v) { v = String(v || '').trim().toLowerCase(); if (v === 'none' || v === 'transparent') return ''; if (v === 'white' || v === '#fff') return '#ffffff'; return v; }
  var CSS = '.bgp{display:flex;flex-wrap:wrap;gap:5px;align-items:center}' +
    '.bgp button{width:24px;height:24px;border-radius:6px;border:1px solid #b9cbd0;cursor:pointer;padding:0;position:relative;flex:none}' +
    '.bgp button[aria-pressed="true"]{outline:2px solid #0e9f9a;outline-offset:1px}' +
    '.bgp button.tr{background:repeating-conic-gradient(#d9e2e4 0 25%,#fff 0 50%) 0 0/10px 10px}' +
    '.bgp button.wide{width:auto;padding:0 8px;font:600 12px "Segoe UI",Tahoma,sans-serif;color:#24363c;display:inline-flex;align-items:center;gap:5px}' +
    '.bgp button.wide i{display:inline-block;width:14px;height:14px;border-radius:3px;border:1px solid #b9cbd0}' +
    '.bgp label.cust{width:24px;height:24px;border-radius:6px;border:1px dashed #6b7f86;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;position:relative;overflow:hidden;flex:none}' +
    '.bgp label.cust input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}' +
    '.bgp .sep{width:1px;height:18px;background:#d7e3e6;margin:0 2px}';
  function injectCss() { if (document.getElementById('bgpCss')) return; var s = document.createElement('style'); s.id = 'bgpCss'; s.textContent = CSS; document.head.appendChild(s); }
  function el(o) {
    injectCss();
    o = o || {};
    var value = norm(o.value), box = document.createElement('div');
    box.className = 'bgp';
    function btn(v, cls, title, html) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = cls || ''; b.dataset.v = v; b.title = title;
      if (html) b.innerHTML = html; else if (v) b.style.background = v;
      box.appendChild(b); return b;
    }
    function build() {
      box.innerHTML = '';
      btn('', 'tr wide', L('شفافة — بدون خلفية', 'Transparent'), '<i style="background:repeating-conic-gradient(#d9e2e4 0 25%,#fff 0 50%) 0 0/8px 8px"></i>' + L('شفافة', 'None'));
      btn('#ffffff', 'wide', L('خلفية بيضاء', 'White background'), '<i style="background:#fff"></i>' + L('بيضاء', 'White'));
      var s = document.createElement('span'); s.className = 'sep'; box.appendChild(s);
      var list = recent().concat(PALETTE.slice(1)), seen = {};
      list.forEach(function (c) { if (seen[c]) return; seen[c] = 1; btn(c, '', c); });
      if (value && !seen[value] && value !== '#ffffff') btn(value, '', value);
      var lab = document.createElement('label'); lab.className = 'cust'; lab.title = L('لون آخر…', 'Other colour…');
      lab.innerHTML = '🎨<input type="color" value="' + (value && /^#[0-9a-f]{6}$/.test(value) ? value : '#fff8e1') + '">';
      box.appendChild(lab);
      lab.querySelector('input').addEventListener('change', function () { set(this.value, true); });
      mark();
    }
    function mark() { Array.prototype.forEach.call(box.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === value)); }); }
    function set(v, fromUser) {
      value = norm(v);
      if (fromUser) { remember(value); build(); }
      mark();
      if (fromUser && o.onChange) o.onChange(value);
    }
    box.addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (b) set(b.dataset.v, true); });
    build();
    box.setValue = function (v) { value = norm(v); build(); };
    box.getValue = function () { return value; };
    return box;
  }
  function swatchStyle(v) {
    v = norm(v);
    return v ? 'background:' + v : 'background:repeating-conic-gradient(#d9e2e4 0 25%,#fff 0 50%) 0 0/8px 8px';
  }
  global.BgPick = { el: el, norm: norm, swatchStyle: swatchStyle };
})(window);
