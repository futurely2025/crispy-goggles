/* ArLog — error log for every page of the add-in (task pane, editors, studios, PDF studio, renderer).
 * Records uncaught errors, rejected promises, console.error and every error message shown to the user, with the page,
 * version, host (Word / browser / embedded) and a short context. Kept in this browser (localStorage, last 300 entries,
 * repeated errors are counted instead of duplicated). Nothing is sent anywhere unless ArLog.endpoint is set
 * (reserved for a future server: the site's own /api/log.php). */
(function (global) {
  'use strict';
  if (global.ArLog) return;
  var KEY = 'armath.log', MAX = 300, VERSION = '5.7.0';
  var page = (location.pathname.split('/').pop() || 'index.html').replace(/\?.*$/, '');
  var q = location.search + location.hash;
  var host = /[?&]host=dialog/.test(q) ? 'word-dialog' : /embed=pdf/.test(q) ? 'pdf-modal' : /[?&]host=frame/.test(q) ? 'word-pane-frame' : /[?&]host=sdk/.test(q) ? 'sdk' : (global.parent !== global ? 'frame' : 'browser');
  var mem = [];                      // fallback when localStorage is not available

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return mem; } }
  function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch (e) { mem = list.slice(-MAX); } }
  function short(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; }
  function errText(e) {
    if (!e) return '';
    if (typeof e === 'string') return e;
    if (e.message) return e.message + (e.code ? ' [' + e.code + ']' : '') + (e.debugInfo && e.debugInfo.errorLocation ? ' @' + e.debugInfo.errorLocation : '');
    try { return JSON.stringify(e); } catch (x) { return String(e); }
  }

  /** add(level, message, { feature, error, ctx }) */
  function add(level, msg, extra) {
    extra = extra || {};
    var err = extra.error, text = short(msg || errText(err), 600);
    if (!text) return;
    var list = load(), last = list[list.length - 1];
    if (last && last.msg === text && last.page === page && last.feature === (extra.feature || '')) {
      last.n = (last.n || 1) + 1; last.t = new Date().toISOString(); save(list); return;
    }
    var entry = {
      t: new Date().toISOString(), lvl: level, page: page, host: host, v: VERSION, feature: extra.feature || '',
      msg: text, stack: short(err && err.stack ? err.stack : extra.stack || '', 1500), ctx: extra.ctx ? short(typeof extra.ctx === 'string' ? extra.ctx : JSON.stringify(extra.ctx), 800) : ''
    };
    list.push(entry); save(list);
    if (ArLog.endpoint && level !== 'info') send(entry);
  }
  function send(entry) {
    try {
      var body = JSON.stringify(Object.assign({ ua: navigator.userAgent, office: officeInfo() }, entry));
      if (navigator.sendBeacon) navigator.sendBeacon(ArLog.endpoint, new Blob([body], { type: 'application/json' }));
      else fetch(ArLog.endpoint, { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(function () {});
    } catch (e) { /* never break the page because of the log */ }
  }
  function officeInfo() {
    try {
      var d = global.Office && Office.context && Office.context.diagnostics;
      return d ? d.host + ' ' + d.platform + ' ' + d.version : '';
    } catch (e) { return ''; }
  }

  // ---- automatic capture
  global.addEventListener('error', function (e) {
    if (e && e.target && e.target !== global && (e.target.src || e.target.href)) {
      add('error', 'تعذّر تحميل ملف: ' + (e.target.src || e.target.href), { feature: 'load' });
      return;
    }
    add('error', e.message || 'خطأ غير معروف', { feature: 'uncaught', stack: e.error && e.error.stack, ctx: (e.filename || '').split('/').pop() + ':' + e.lineno + ':' + e.colno });
  }, true);
  global.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    add('error', errText(r) || 'Promise rejected', { feature: 'promise', error: r && r.stack ? r : null });
  });
  var cerr = global.console && console.error;
  if (cerr) console.error = function () {
    try {
      var parts = Array.prototype.map.call(arguments, function (a) { return a && a.message ? a.message : typeof a === 'string' ? a : (function () { try { return JSON.stringify(a); } catch (x) { return String(a); } })(); });
      var e0 = Array.prototype.filter.call(arguments, function (a) { return a && a.stack; })[0];
      add('error', parts.join(' '), { feature: 'console', error: e0 });
    } catch (x) { /* ignore */ }
    return cerr.apply(console, arguments);
  };

  // ---- reading
  function list() { return load(); }
  function clear() { save([]); mem = []; }
  function counts() { var l = load(), c = { error: 0, warn: 0, info: 0 }; l.forEach(function (e) { c[e.lvl] = (c[e.lvl] || 0) + (e.n || 1); }); return c; }
  /** plain-text report to paste into a message */
  function report(limit) {
    var l = load().slice(-(limit || 60)), c = counts();
    var head = ['معادلات عربية — سجل الأخطاء', 'الإصدار: ' + VERSION + ' | الصفحة: ' + page + ' | ' + new Date().toISOString(),
      'المتصفح: ' + navigator.userAgent, 'Office: ' + (officeInfo() || '—'), 'الأخطاء: ' + c.error + ' | التنبيهات: ' + (c.warn || 0), ''];
    return head.concat(l.map(function (e, k) {
      return (k + 1) + ') ' + e.t.replace('T', ' ').slice(0, 19) + ' [' + e.lvl + (e.n > 1 ? ' ×' + e.n : '') + '] ' + e.page + ' (' + e.host + ')' + (e.feature ? ' {' + e.feature + '}' : '') + '\n   ' + e.msg +
        (e.ctx ? '\n   ctx: ' + e.ctx : '') + (e.stack ? '\n   ' + e.stack.split('\n').slice(0, 4).join('\n   ') : '');
    })).join('\n');
  }

  var ArLog = global.ArLog = {
    version: VERSION, page: page, host: host, endpoint: global.ARMATH_LOG_ENDPOINT || null,
    add: add, error: function (feature, e, ctx) { add('error', errText(e), { feature: feature, error: e, ctx: ctx }); },
    warn: function (feature, msg, ctx) { add('warn', msg, { feature: feature, ctx: ctx }); },
    info: function (feature, msg, ctx) { add('info', msg, { feature: feature, ctx: ctx }); },
    list: list, clear: clear, counts: counts, report: report, officeInfo: officeInfo
  };
})(window);
