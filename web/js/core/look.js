/* Look — removes the white background of a figure SVG (the full-size white rectangle each renderer paints),
 * keeping everything else: coloured fills, small white halos behind labels, borders. Used by the Word pane. */
(function (global) {
  'use strict';
  var WHITE = /^(rgb\(255, ?255, ?255\)|#fff|#ffffff|white)$/i;
  function stripBg(svg) {
    var vb = (String(svg).match(/viewBox="([^"]+)"/) || [])[1], v = vb ? vb.split(/[\s,]+/).map(Number) : null;
    if (!v) { var W = parseFloat((svg.match(/<svg[^>]*\swidth="([\d.]+)/) || [])[1]), H = parseFloat((svg.match(/<svg[^>]*\sheight="([\d.]+)/) || [])[1]); if (W && H) v = [0, 0, W, H]; }
    return String(svg).replace(/<rect\b[^>]*>/g, function (r) {
      var fill = (r.match(/\sfill="([^"]*)"/) || [])[1];
      if (!fill || !WHITE.test(fill.trim()) || /fill-opacity="0?\.\d/.test(r)) return r;
      var w = (r.match(/\swidth="([^"]*)"/) || [])[1], h = (r.match(/\sheight="([^"]*)"/) || [])[1];
      var full = w === '100%' || (v && parseFloat(w) >= v[2] * 0.85 && parseFloat(h) >= v[3] * 0.85);
      return full ? r.replace(/\sfill="[^"]*"/, ' fill="none"') : r;
    });
  }
  global.Look = { stripBg: stripBg };
})(window);
