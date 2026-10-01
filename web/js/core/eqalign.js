/* EqAlign — lines several equations up on their '=' (or <, >, ≤, ≥ …), like the steps of a solution in a textbook (5.4.1).
 * Each equation stays its own picture (editable one by one), but gets empty space on its left / right so that all of them
 * have the same width and the relation sign at the same place: aligned whether Word centres them or aligns them right.
 *   EqAlign.eligible(items)          -> indices of equations that are alone on their line
 *   EqAlign.pads([{w, rel}], maxEm)  -> [{padL, padR} | null]   (em)
 *   EqAlign.measure(items, opts)     -> Promise<{index: {padL, padR}}>   (uses RenderHost.preview) */
(function (global) {
  'use strict';
  function eligible(items) {
    var perLine = {};
    items.forEach(function (e) { var l = e.line === undefined || e.line === null ? 0 : e.line; perLine[l] = (perLine[l] || 0) + 1; });
    var out = [];
    items.forEach(function (e, i) {
      if (e.kind || e.block || e.inline) return;
      var l = e.line === undefined || e.line === null ? 0 : e.line;
      if (perLine[l] === 1) out.push(i);
    });
    return out;
  }
  function pads(list, maxEm) {
    maxEm = maxEm || 30;
    var use = list.map(function (x) { return !!(x && x.rel !== null && x.rel !== undefined && x.w > 0); });
    for (var guard = 0; guard < list.length; guard++) {
      var L = 0, R = 0, n = 0;
      list.forEach(function (x, i) { if (!use[i]) return; n++; L = Math.max(L, x.rel); R = Math.max(R, x.w - x.rel); });
      if (n < 2) return list.map(function () { return null; });
      if (L + R <= maxEm) {
        return list.map(function (x, i) {
          if (!use[i]) return null;
          var pl = L - x.rel, pr = R - (x.w - x.rel);
          return pl < 0.01 && pr < 0.01 ? null : { padL: +pl.toFixed(3), padR: +pr.toFixed(3) };
        });
      }
      // too wide for the page: leave out the equation that stretches the group most
      var worst = -1, wv = -1;
      list.forEach(function (x, i) { if (!use[i]) return; var v = Math.max(x.rel, x.w - x.rel); if (v > wv) { wv = v; worst = i; } });
      use[worst] = false;
    }
    return list.map(function () { return null; });
  }
  function measure(items, opts) {
    var idx = eligible(items), res = {};
    if (idx.length < 2 || !global.RenderHost) return Promise.resolve(res);
    var list = [], chain = Promise.resolve();
    idx.forEach(function (i) {
      var e = items[i], o = Object.assign({}, opts, e.mode ? { mode: e.mode } : {}, { padL: 0, padR: 0, bg: '' });
      chain = chain.then(function () {
        return RenderHost.preview(e.tex, o).then(function (r) { list.push(r && !(r.errors && r.errors.length) ? { w: r.width, rel: r.rel } : null); },
          function () { list.push(null); });
      });
    });
    return chain.then(function () {
      pads(list, 414 / (+opts.fontSize || 14)).forEach(function (p, k) { if (p) res[idx[k]] = p; });
      return res;
    });
  }
  global.EqAlign = { eligible: eligible, pads: pads, measure: measure };
})(window);
