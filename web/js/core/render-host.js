/* RenderHost — one hidden renderer frame per math font, same origin, called directly. */
(function (global) {
  'use strict';
  var frames = {};
  var FONTS = ['stix2', 'newcm', 'fira'];
  var base = '';

  function frameFor(font) {
    if (FONTS.indexOf(font) < 0) font = 'stix2';
    if (frames[font]) return frames[font];
    frames[font] = new Promise(function (resolve, reject) {
      var f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true');
      f.setAttribute('tabindex', '-1');
      f.title = 'renderer';
      f.style.cssText = 'position:fixed;left:-12000px;top:0;width:1200px;height:400px;border:0;visibility:hidden;';
      f.src = base + 'renderer.html?font=' + font + '&v=5.7.0';
      f.onload = function () {
        var w = f.contentWindow;
        var t0 = Date.now();
        (function wait() {
          if (w.ArabicMath) {
            return w.ArabicMath.init({ base: '', lang: RenderHost.lang }).then(function () { resolve(w.ArabicMath); }, reject);
          }
          if (Date.now() - t0 > 30000) return reject(new Error('renderer failed to load'));
          setTimeout(wait, 30);
        })();
      };
      document.body.appendChild(f);
    });
    return frames[font];
  }

  var RenderHost = {
    lang: 'ar',
    FONTS: FONTS,
    setBase: function (b) { base = b || ''; },
    warm: function (font) { return frameFor(font || 'stix2'); },
    preview: function (tex, opts, embed) {
      return frameFor(opts && opts.mathFont).then(function (am) { am.setLang(RenderHost.lang); return am.preview(tex, opts, embed); });
    },
    render: function (tex, opts, dpi) {
      return frameFor(opts && opts.mathFont).then(function (am) { am.setLang(RenderHost.lang); return am.render(tex, opts, dpi); });
    },
    mathml: function (tex, opts) {
      return frameFor(opts && opts.mathFont).then(function (am) { return am.toMathML(tex, opts); });
    },
    preprocess: function (tex, opts) {
      return frameFor(opts && opts.mathFont).then(function (am) { return am.preprocess(tex, opts); });
    }
  };
  global.RenderHost = RenderHost;
})(window);
