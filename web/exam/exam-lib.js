/*
 * exam-lib.js — local storage for the template library (IndexedDB) and the usage history (localStorage).
 * Everything stays on this computer.
 */
(function (root) {
  'use strict';
  var DB = 'exam-lib', STORE = 'templates', mem = {}, useMem = false, dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      try {
        var r = indexedDB.open(DB, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = r.onblocked = function () { useMem = true; resolve(null); };
      } catch (e) { useMem = true; resolve(null); }
    });
    return dbp;
  }
  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode), rq = fn(t.objectStore(STORE));
        t.oncomplete = function () { resolve(rq && rq.result); };
        t.onerror = t.onabort = function () { reject(t.error || new Error('تعذر الحفظ')); };
      });
    });
  }

  // ---- file backend: real .docx files in Documents\نموذج الأسئلة\القوالب, served by the local server
  var files = false, filesDir = '';
  function api(path, opt) {
    opt = opt || {}; opt.headers = { 'X-Exam': '1' }; opt.cache = 'no-store';
    return fetch(path, opt);
  }
  // names travel as base64url(UTF-8): the Windows server would mangle Arabic characters in a plain query string
  function enc(n) {
    var b = btoa(unescape(encodeURIComponent(n)));
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function stem(n) { return n.replace(/\.docx$/i, ''); }
  function fileSafe(n) { return (String(n || 'قالب').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '') || 'قالب'); }
  async function fileList() {
    var r = await api('/api/templates');
    if (!r.ok) throw new Error('تعذر قراءة مجلد القوالب');
    return (await r.json()).map(function (f) { return { id: f.name, name: stem(f.name), size: f.size, updated: f.modified, open: !!f.open, file: true }; });
  }
  async function filePut(rec) {
    var cur = await fileList(), taken = {};
    cur.forEach(function (x) { taken[x.id.toLowerCase()] = 1; });
    var want = fileSafe(rec.name) + '.docx', old = /\.docx$/i.test(rec.id || '') ? rec.id : null;
    var target = want;
    if (!old || want.toLowerCase() !== old.toLowerCase()) {          // new file, or renamed: never overwrite another template
      for (var i = 2; taken[target.toLowerCase()]; i++) target = fileSafe(rec.name) + ' (' + i + ').docx';
    } else target = old;
    var r = await api('/api/template?n=' + enc(target), { method: 'PUT', body: rec.bytes });
    if (!r.ok) { var e = {}; try { e = await r.json(); } catch (x) { /* ignore */ } throw new Error(e.error || 'تعذر حفظ الملف'); }
    if (old && old !== target) await api('/api/template?n=' + enc(old), { method: 'DELETE' });
    rec.id = target; rec.name = stem(target); rec.updated = Date.now();
    return rec;
  }

  var Lib = {
    /** true when the local server (with the templates folder) answers; then templates are real files */
    detect: function () {
      return api('/api/ping').then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { files = !!(j && j.ok && j.exam === 1); filesDir = files ? j.dir : ''; return files; })
        .catch(function () { files = false; return false; });
    },
    /** templates saved by earlier versions inside the browser storage */
    idbList: function () {
      return open().then(function (db) { return db ? run('readonly', function (st) { return st.getAll(); }) : []; }).then(function (a) { return a || []; });
    },
    filesMode: function () { return files; },
    folder: function () { return filesDir; },
    openInWord: async function (id) {
      var r = await api('/api/template?n=' + enc(id), { method: 'POST' });
      if (!r.ok) throw new Error('تعذر فتح الملف في Word');
    },
    revealFolder: function () { return api('/api/reveal', { method: 'POST' }); },

    persistent: function () { return files ? Promise.resolve(true) : open().then(function (db) { return !!db; }); },
    uid: function () { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    list: function () {
      if (files) return fileList().then(function (a) { return a.sort(function (x, y) { return (y.updated || 0) - (x.updated || 0); }); });
      return open().then(function (db) {
        if (!db) return Object.keys(mem).map(function (k) { return mem[k]; });
        return run('readonly', function (s) { return s.getAll(); });
      }).then(function (a) { return (a || []).map(function (r) { r.size = r.bytes.length; return r; }).sort(function (x, y) { return (y.updated || 0) - (x.updated || 0); }); });
    },
    /** full record including bytes */
    get: function (id) {
      if (files) {
        return api('/api/template?n=' + enc(id)).then(async function (r) {
          if (!r.ok) return undefined;
          var meta = (await fileList().catch(function () { return []; })).filter(function (x) { return x.id === id; })[0] || {};
          return { id: id, name: stem(id), bytes: new Uint8Array(await r.arrayBuffer()), updated: meta.updated || Date.now(), open: !!meta.open };
        });
      }
      return open().then(function (db) { return db ? run('readonly', function (s) { return s.get(id); }) : mem[id]; });
    },
    put: function (rec) {
      if (files) return filePut(rec);
      rec.updated = Date.now();
      return open().then(function (db) { if (!db) { mem[rec.id] = rec; return rec; } return run('readwrite', function (s) { return s.put(rec); }).then(function () { return rec; }); });
    },
    remove: function (id) {
      if (files) return api('/api/template?n=' + enc(id), { method: 'DELETE' }).then(function (r) { if (!r.ok) throw new Error('تعذر حذف الملف (ربما هو مفتوح في Word)'); });
      return open().then(function (db) { if (!db) { delete mem[id]; return; } return run('readwrite', function (s) { return s.delete(id); }); });
    },
    activeId: function () { try { return localStorage.getItem('exam.activeTpl') || 'builtin'; } catch (e) { return 'builtin'; } },
    setActive: function (id) { try { localStorage.setItem('exam.activeTpl', id); } catch (e) { /* ignore */ } },

    history: function () { try { return JSON.parse(localStorage.getItem('exam.history') || '[]'); } catch (e) { return []; } },
    addHistory: function (h) {
      try { var a = Lib.history(); a.unshift(h); localStorage.setItem('exam.history', JSON.stringify(a.slice(0, 200))); } catch (e) { /* ignore */ }
    },
    clearHistory: function () { try { localStorage.removeItem('exam.history'); } catch (e) { /* ignore */ } }
  };
  root.ExamLib = Lib;
})(typeof self !== 'undefined' ? self : this);
