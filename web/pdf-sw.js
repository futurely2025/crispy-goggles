/* Service worker for the PDF studio: works offline.
 * Strategy: network first (so an update on the site is used at once), the cache is only the fallback when offline.
 * Only same-origin GET requests are handled; everything else goes to the network untouched. */
'use strict';
var VERSION = 'armath-pdf-5.11.3';
var CORE = [
  'pdf.html', 'pdf-manifest.json', 'js/core/logger.js', 'css/fonts.css', 'css/brand.css', 'css/studio.css', 'css/pdf.css', 'css/shapes.css', 'js/pdf/shapes-lib.js', 'js/pdf/shapes.js', 'js/pdf/annot.js', 'js/pdf/cmdk.js', 'js/pdf/ocr-engine.js', 'js/pdf/ocr-layer.js', 'js/pdf/modern.js', 'css/modern.css', 'js/pdf/ocr.js',
  'js/i18n.js', 'js/core/render-host.js', 'js/core/vector.js', 'js/studio/raster.js', 'js/figures/util.js', 'js/figures/registry.js',
  'js/pdf/compose.js', 'js/pdf/svg2pdf.js', 'js/pdf/ui.js', 'js/pdf/decor.js', 'js/pdf/stamps.js', 'js/pdf/app.js', 'js/pdf/ext.js', 'js/pdf/textfind.js', 'js/core/userfonts.js', 'js/core/fontselects.js',
  'vendor/pdf-lib/pdf-lib.min.js', 'vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js',
  'fonts/arabic/Amiri-400.woff2', 'fonts/arabic/Amiri-700.woff2', 'icons/icon-32.png', 'icons/pdf-192.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    // one failing file must not stop the install
    return Promise.all(CORE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return /^armath-pdf-/.test(k) && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (/\/api\//.test(url.pathname)) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) {
      return hit || caches.match(req, { ignoreSearch: true }).then(function (h2) {
        if (h2) return h2;
        if (req.mode === 'navigate') return caches.match('pdf.html', { ignoreSearch: true });
        return new Response('', { status: 504, statusText: 'offline' });
      });
    });
  }));
});
// "prepare for offline": every file of the add-in (editors, studios, fonts) listed in pdf-offline.json
self.addEventListener('message', function (e) {
  var m = e.data || {}, who = e.source;
  if (m.type !== 'precache-all') return;
  e.waitUntil(fetch('pdf-offline.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (list) {
    return caches.open(VERSION).then(function (c) {
      var done = 0, failed = 0, i = 0;
      function next() {
        if (i >= list.length) return Promise.resolve();
        var u = list[i++];
        return c.add(u).catch(function () { failed++; }).then(function () {
          done++;
          if (who && (done % 10 === 0 || done === list.length)) who.postMessage({ type: 'precache-progress', done: done, total: list.length });
          return next();
        });
      }
      return Promise.all([next(), next(), next(), next()]).then(function () { if (who) who.postMessage({ type: 'precache-done', total: list.length, failed: failed }); });
    });
  }).catch(function () { if (who) who.postMessage({ type: 'precache-done', total: 0, failed: 1 }); }));
});
