/*!
 * ArabicMath SDK 3.0 — use the Arabic equation editor inside your own apps (كشكول، راجع، …)
 *
 *   <script src="https://wazni.ly/sdk/armath-sdk.js"></script>
 *
 *   // 1) open the full editor in a pop-up and get the equation back
 *   ArabicMath.openEditor({ mode: 'math', tex: 'جا^2 س + جتا^2 س = 1' }).then(function (res) {
 *     // res.latex  res.svg (string)  res.png (data URL)  res.mathml  res.widthPt/heightPt/depthPt
 *   });
 *
 *   // 2) render LaTeX to SVG / PNG without showing the editor
 *   ArabicMath.render('\\frac{-ب \\pm \\sqrt{ب^2-4أجـ}}{2أ}', { fontSize: 18 }).then(function (r) { el.innerHTML = r.svg; });
 *
 *   // 3) figure studios (v3): graphs, geometry, structural formulas — result: { svg, png, data, widthPt, heightPt }
 *   ArabicMath.openGraph({ data: { fns: [{ expr: 'س^2 - 4' }] } });
 *   ArabicMath.openGeometry({ tpl: 'right' });
 *   ArabicMath.openStructure({ smiles: 'CCO', name: 'الإيثانول' });
 *   // pass back res.data later to re-open the same figure for editing
 *
 * Mobile (Flutter / React Native): load  https://wazni.ly/editor.html?host=sdk  in a WebView.
 * The result is sent as JSON to a JavaScript channel named "ArMath" (Flutter) or ReactNativeWebView.postMessage.
 */
(function (global) {
  'use strict';
  var script = document.currentScript;
  var BASE = (script && script.src ? script.src.replace(/sdk\/armath-sdk\.js.*$/, '') : 'https://wazni.ly/');
  var ORIGIN = BASE.replace(/^(https?:\/\/[^/]+).*$/, '$1');

  function css() {
    if (document.getElementById('armath-sdk-css')) return;
    var st = document.createElement('style');
    st.id = 'armath-sdk-css';
    st.textContent =
      '.armath-ov{position:fixed;inset:0;background:rgba(10,40,40,.45);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:12px}' +
      '.armath-box{width:min(920px,100%);height:min(700px,100%);background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);display:flex;flex-direction:column}' +
      '.armath-box iframe{flex:1;border:0;width:100%}';
    document.head.appendChild(st);
  }

  function openPage(page, data) {
    css();
    return new Promise(function (resolve, reject) {
      var ov = document.createElement('div');
      ov.className = 'armath-ov';
      var box = document.createElement('div');
      box.className = 'armath-box';
      var fr = document.createElement('iframe');
      fr.title = 'Arabic Math';
      fr.allow = 'clipboard-write';
      fr.src = BASE + page + '.html?host=sdk#d=' + encodeURIComponent(JSON.stringify(data));
      box.appendChild(fr); ov.appendChild(box); document.body.appendChild(ov);
      function done() { window.removeEventListener('message', onMsg); ov.remove(); }
      function onMsg(e) {
        if (e.origin !== ORIGIN || e.source !== fr.contentWindow || !e.data || !e.data.armath) return;
        var m = e.data.armath;
        if (m.type === 'result') { done(); resolve(m); }
        else if (m.type === 'cancel') { done(); reject(new Error('cancelled')); }
      }
      window.addEventListener('message', onMsg);
      ov.addEventListener('mousedown', function (e) { if (e.target === ov) { done(); reject(new Error('cancelled')); } });
    });
  }
  function base(options) { return { host: 'sdk', lang: options.lang || null, origin: location.origin, dpi: options.dpi || 300 }; }
  function openEditor(options) {
    options = options || {};
    return openPage('editor', Object.assign(base(options), { mode: options.mode === 'chem' ? 'chem' : 'math', tex: options.tex || '', opts: options.opts || null, solve: !!options.solve }));
  }
  function openGraph(options) {
    options = options || {};
    return openPage('graph', Object.assign(base(options), { data: options.data || null, expr: options.expr || null }));
  }
  function openGeometry(options) {
    options = options || {};
    return openPage('geometry', Object.assign(base(options), { data: options.data || null, tpl: options.tpl || null }));
  }
  function openStructure(options) {
    options = options || {};
    return openPage('structure', Object.assign(base(options), { data: options.data || null, smiles: options.smiles || null, name: options.name || null }));
  }

  // hidden renderer frame
  var rframe = null, rready = null, seq = 0, waiting = {};
  function renderer() {
    if (rready) return rready;
    rready = new Promise(function (resolve) {
      rframe = document.createElement('iframe');
      rframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:300px;border:0;visibility:hidden';
      rframe.src = BASE + 'sdk/render.html';
      window.addEventListener('message', function (e) {
        if (e.origin !== ORIGIN || !e.data || !e.data.armathRender) return;
        var m = e.data.armathRender;
        if (m.ready) return resolve();
        var w = waiting[m.id]; if (!w) return;
        delete waiting[m.id];
        if (m.error) w.reject(new Error(m.error)); else w.resolve(m.result);
      });
      document.body.appendChild(rframe);
    });
    return rready;
  }
  function render(tex, opts) {
    return renderer().then(function () {
      return new Promise(function (resolve, reject) {
        var id = ++seq;
        waiting[id] = { resolve: resolve, reject: reject };
        rframe.contentWindow.postMessage({ armathRender: { id: id, tex: tex, opts: opts || {} } }, ORIGIN);
      });
    });
  }

  global.ArabicMath = { version: '3.0.0', base: BASE, openEditor: openEditor, openGraph: openGraph, openGeometry: openGeometry, openStructure: openStructure, render: render };
})(window);
