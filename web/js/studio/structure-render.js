/*
 * StructureRender — structural (skeletal) formulas from SMILES with SmilesDrawer (MIT), plus Arabic caption.
 *   StructureRender.render(data) -> Promise<{svg, w, h, formula}>
 */
(function (global) {
  'use strict';
  function defaults() {
    return { v: 1, smiles: 'CCO', name: 'الإيثانول', showName: true, showFormula: true, theme: 'light', terminalCarbons: false,
      explicitHydrogens: true, bondThickness: 1.1, scale: 1.5, font: 'Amiri', fontSize: 12, digits: 'western' };
  }
  var THEMES = {
    tq: { FOREGROUND: '#1b2a30', BACKGROUND: '#ffffff', C: '#1b2a30', O: '#c2352b', N: '#1f5fbf', F: '#2e8b3a', CL: '#0e9f9a', BR: '#a0522d', I: '#7b3fb3', P: '#e07a00', S: '#b8860b', B: '#e07a00', SI: '#8a6d3b', H: '#5f7179' }
  };
  var host = null;
  function holder() {
    if (host) return host;
    host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-5000px;top:0;width:800px;height:800px;overflow:hidden;visibility:hidden';
    document.body.appendChild(host);
    return host;
  }
  function formulaSvg(f, x, y, fs) {          // C2H6O with real subscripts
    var parts = String(f).match(/[A-Z][a-z]?|\d+|[+-]/g) || [];
    var out = parts.map(function (p) {
      return /^\d+$/.test(p) ? '<tspan baseline-shift="sub" font-size="' + (fs * 0.72).toFixed(1) + 'px">' + p + '</tspan>' : '<tspan>' + p + '</tspan>';
    }).join('');
    return '<text x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" text-anchor="middle" direction="ltr" class="fm">' + out + '</text>';
  }

  function render(data) {
    data = Object.assign(defaults(), data || {});
    return new Promise(function (resolve, reject) {
      var opts = {
        width: 700, height: 700, bondThickness: +data.bondThickness || 1.1, terminalCarbons: !!data.terminalCarbons,
        explicitHydrogens: data.explicitHydrogens !== false, compactDrawing: false, padding: 6,
        themes: { tq: THEMES.tq }
      };
      var drawer;
      try { drawer = new SmilesDrawer.SvgDrawer(opts); } catch (e) { return reject(e); }
      var el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      holder().innerHTML = ''; holder().appendChild(el);
      SmilesDrawer.parse(String(data.smiles || '').trim(), function (tree) {
        try { drawer.draw(tree, el, data.theme === 'mono' ? 'oldschool' : data.theme === 'tq' ? 'tq' : 'light'); }
        catch (e) { return reject(new Error('تعذّر رسم الصيغة: ' + (e.message || e))); }
        var formula = '';
        try { formula = drawer.getMolecularFormula(); } catch (e) { /* ignore */ }
        var vb = (el.getAttribute('viewBox') || '0 0 100 100').split(/[\s,]+/).map(Number);
        var k = +data.scale || 1.5;
        var W = Math.max(60, vb[2] * k), H = Math.max(40, vb[3] * k);
        var fs = (data.fontSize || 12) * 96 / 72;
        var cap = 0, capSvg = '';
        var eastern = data.digits === 'eastern';
        if (data.showName && data.name) { cap += fs * 1.6; }
        if (data.showFormula && formula) { cap += fs * 1.5; }
        var CW = Math.max(W, data.showName && data.name ? String(data.name).length * fs * 0.55 + 20 : 0);
        var ox = (CW - W) / 2;
        var y = H + 4;
        if (data.showName && data.name) { y += fs * 1.2; capSvg += Raster.words(CW / 2, y, eastern ? Raster.digits(data.name, true) : data.name, ' class="nm"', fs * 1.1, /[؀-ۿ]/.test(data.name)); y += fs * 0.4; }
        if (data.showFormula && formula) { y += fs * 1.25; capSvg += formulaSvg(formula, CW / 2, y, fs); }
        var inner = new XMLSerializer().serializeToString(el)
          .replace(/^<svg\b[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" x="' + ox.toFixed(2) + '" y="0" width="' + W.toFixed(2) + '" height="' + H.toFixed(2) + '" viewBox="' + vb.join(' ') + '" overflow="visible">');
        var totalH = H + (cap ? cap + 10 : 0);
        Raster.fontCss([data.font || 'Amiri'], true).then(function (css) {
          var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + CW.toFixed(2) + '" height="' + totalH.toFixed(2) + '" viewBox="0 0 ' + CW.toFixed(2) + ' ' + totalH.toFixed(2) + '">' +
            '<defs><style>' + css + ' .nm{font-family:"' + (data.font || 'Amiri') + '",serif;font-size:' + (fs * 1.1).toFixed(1) + 'px;font-weight:700;fill:#1b2a30} .fm{font-family:"Times New Roman",serif;font-size:' + fs.toFixed(1) + 'px;fill:#3d5560}</style></defs>' +
            '<rect width="100%" height="100%" fill="#fff"/>' + inner + capSvg + '</svg>';
          resolve({ svg: svg, w: CW, h: totalH, formula: formula });
        });
      }, function (err) {
        reject(new Error((/[؀-ۿ]/.test(String(err)) ? '' : 'صيغة SMILES غير صحيحة: ') + String(err && err.message || err).slice(0, 140)));
      });
    });
  }
  global.StructureRender = { render: render, defaults: defaults };
})(window);
