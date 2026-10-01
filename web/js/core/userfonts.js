/* UserFonts — the user's own fonts (5.4): add a font file (.ttf / .otf), delete it, and pin favourites to the top of
 * every font list (editor, studios, PDF studio). The fonts that ship with the add-in always stay.
 *   · files are kept in this browser (IndexedDB, same site = shared by the Word pane, dialogs and studios)
 *   · each page that loads this script registers them (FontFace) so previews use them
 *   · the equation engine, the vector converter (HarfBuzz → outlines in Word) and the PNG fallback read the same bytes,
 *     so what Word shows is exactly the font you chose
 * API: list(), families(), isCustom(f), add(file, name), remove(f), rename(f, name), toggleFav(f), isFav(f),
 *      bytes(f), css(f), ready, fill(select), openManager(), onChange(fn) */
(function (global) {
  'use strict';
  if (global.UserFonts) return;
  var DB = 'armath-fonts', STORE = 'fonts', META = 'armath.fonts.v1';
  var BUNDLED = ['amiri', 'noto naskh arabic', 'scheherazade new', 'noto kufi arabic', 'cairo'];
  var SAMPLE = 'أبجد هوز ١٢٣ — س² + ص = ٥';
  function en() { return !!(global.I18N && I18N.lang === 'en'); }
  function L(a, e) { return en() ? e : a; }

  // ------------------------------------------------------------ meta (sync, localStorage)
  function meta() {
    var m = null;
    try { m = JSON.parse(localStorage.getItem(META)); } catch (e) { /* ignore */ }
    m = m || {};
    m.custom = Array.isArray(m.custom) ? m.custom : [];
    m.fav = Array.isArray(m.fav) ? m.fav : [];
    return m;
  }
  function saveMeta(m) { try { localStorage.setItem(META, JSON.stringify(m)); } catch (e) { /* ignore */ } changed(); }
  function isCustom(f) { f = String(f || '').toLowerCase(); return meta().custom.some(function (c) { return c.family.toLowerCase() === f; }); }
  function customOf(f) { f = String(f || '').toLowerCase(); return meta().custom.filter(function (c) { return c.family.toLowerCase() === f; })[0] || null; }
  function isFav(f) { return meta().fav.indexOf(f) >= 0; }
  function families() { return meta().custom.map(function (c) { return c.family; }); }

  // ------------------------------------------------------------ IndexedDB
  var dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise(function (res, rej) {
      if (!global.indexedDB) return rej(new Error('IndexedDB'));
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE, { keyPath: 'family' }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    dbP.catch(function () { dbP = null; });
    return dbP;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(STORE, mode), s = t.objectStore(STORE), out;
        var r = fn(s);
        if (r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { res(out); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }
  var byteCache = {};
  function bytes(f) {
    var c = customOf(f); if (!c) return Promise.resolve(null);
    if (!byteCache[c.family]) {
      byteCache[c.family] = tx('readonly', function (s) { return s.get(c.family); }).then(function (rec) { return rec ? rec.data : null; });
      byteCache[c.family].catch(function () { delete byteCache[c.family]; });
    }
    return byteCache[c.family];
  }
  function b64(buf) {
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function isOtf(buf) { var v = new DataView(buf); return v.byteLength > 4 && v.getUint32(0) === 0x4F54544F; }
  /** @font-face rule with the font embedded (for self-contained SVG / PNG) */
  var cssCache = {};
  function css(f) {
    var c = customOf(f); if (!c) return Promise.resolve('');
    if (!cssCache[c.family]) cssCache[c.family] = bytes(c.family).then(function (buf) {
      if (!buf) return '';
      var otf = isOtf(buf);
      return '@font-face{font-family:"' + c.family + '";src:url(data:font/' + (otf ? 'otf' : 'ttf') + ';base64,' + b64(buf) + ') format("' + (otf ? 'opentype' : 'truetype') + '");}';
    }).catch(function () { return ''; });
    return cssCache[c.family];
  }

  // ------------------------------------------------------------ register in this page
  var loaded = {};
  function load(f, doc) {
    var c = customOf(f); if (!c) return Promise.resolve(false);
    doc = doc || document;
    var key = c.family;
    if (doc === document && loaded[key]) return loaded[key];
    var p = bytes(key).then(function (buf) {
      if (!buf || !global.FontFace || !doc.fonts) return false;
      var ff = new (doc.defaultView || global).FontFace(key, buf.slice(0));
      doc.fonts.add(ff);
      return ff.load().then(function () { return true; });
    }).catch(function (e) { if (global.ArLog) ArLog.warn('userfonts', 'load ' + key + ': ' + (e && e.message || e)); return false; });
    if (doc === document) loaded[key] = p;
    return p;
  }
  function loadAll() { return Promise.all(families().map(function (f) { return load(f); })); }

  // ------------------------------------------------------------ font name from the file (OpenType 'name' table)
  function fontName(buf) {
    try {
      var v = new DataView(buf), n = v.getUint16(4), off = 12, name = null;
      for (var i = 0; i < n; i++, off += 16) {
        var tag = String.fromCharCode(v.getUint8(off), v.getUint8(off + 1), v.getUint8(off + 2), v.getUint8(off + 3));
        if (tag === 'name') { name = v.getUint32(off + 8); break; }
      }
      if (name === null) return '';
      var count = v.getUint16(name + 2), strOff = name + v.getUint16(name + 4), best = '', score = -1;
      for (var k = 0; k < count; k++) {
        var r = name + 6 + k * 12, pid = v.getUint16(r), lang = v.getUint16(r + 4), nid = v.getUint16(r + 6), len = v.getUint16(r + 8), o = v.getUint16(r + 10);
        if (nid !== 1 && nid !== 16) continue;
        var s = '';
        if (pid === 3 || pid === 0) { for (var j = 0; j < len; j += 2) s += String.fromCharCode(v.getUint16(strOff + o + j)); }
        else if (pid === 1) { for (var j2 = 0; j2 < len; j2++) s += String.fromCharCode(v.getUint8(strOff + o + j2)); }
        var sc = (nid === 16 ? 4 : 2) + (pid === 3 ? 2 : 0) + (lang === 0x409 || lang === 0 ? 1 : 0);
        if (s.trim() && sc > score) { score = sc; best = s.trim(); }
      }
      return best;
    } catch (e) { return ''; }
  }

  // ------------------------------------------------------------ many fonts at once: a ZIP of font files (5.7)
  function unzipFonts(buf) {
    var v = new DataView(buf), n = buf.byteLength, eocd = -1;
    for (var i = n - 22; i >= Math.max(0, n - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) return Promise.reject(new Error(L('ملف ZIP غير صالح', 'Bad ZIP file')));
    var count = v.getUint16(eocd + 10, true), off = v.getUint32(eocd + 16, true), jobs = [];
    for (var k = 0; k < count; k++) {
      if (v.getUint32(off, true) !== 0x02014b50) break;
      var method = v.getUint16(off + 10, true), csize = v.getUint32(off + 20, true), nlen = v.getUint16(off + 28, true),
        xlen = v.getUint16(off + 30, true), clen = v.getUint16(off + 32, true), lho = v.getUint32(off + 42, true);
      var name = new TextDecoder().decode(new Uint8Array(buf, off + 46, nlen));
      off += 46 + nlen + xlen + clen;
      if (!/\.(ttf|otf)$/i.test(name) || /(^|\/)__MACOSX\//.test(name)) continue;
      var start = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true), data = new Uint8Array(buf, start, csize);
      jobs.push((function (name, method, data) {
        if (method === 0) return Promise.resolve({ name: name.split('/').pop(), buf: data.slice().buffer });
        if (method !== 8 || typeof DecompressionStream !== 'function') return Promise.resolve(null);
        var ds = new DecompressionStream('deflate-raw');
        return new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer().then(function (b) { return { name: name.split('/').pop(), buf: b }; }, function () { return null; });
      })(name, method, data));
    }
    return Promise.all(jobs).then(function (a) { return a.filter(Boolean); });
  }
  function readFile(file) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsArrayBuffer(file); });
  }
  /** files: FileList / array of File (.ttf .otf .zip) → Promise<{added:[], failed:[]}> */
  // regular styles first, so a family keeps its normal face when Bold / Italic files come with it
  function styleRank(name) { return /bold|italic|oblique|light|black|medium|semi|thin|heavy|condensed|extra|ultra|demi/i.test(name || '') ? 1 : 0; }
  function addMany(files) {
    var list = Array.prototype.slice.call(files || []).sort(function (a, b) { return styleRank(a.name) - styleRank(b.name); }), added = [], failed = [], skipped = 0, chain = Promise.resolve();
    function bad(name, e) { if (e && e.dup) skipped++; else failed.push(name + ': ' + (e && e.message || e)); }
    list.forEach(function (f) {
      chain = chain.then(function () {
        if (/\.zip$/i.test(f.name || '')) {
          return readFile(f).then(unzipFonts).then(function (fonts) {
            if (!fonts.length) failed.push(f.name + ': ' + L('لا خطوط TTF/OTF داخله', 'no TTF/OTF inside'));
            var c2 = Promise.resolve();
            fonts.sort(function (a, b) { return styleRank(a.name) - styleRank(b.name); });
            fonts.forEach(function (x) { c2 = c2.then(function () { return addBytes(x.buf, x.name).then(function (fam) { added.push(fam); }, function (e) { bad(x.name, e); }); }); });
            return c2;
          }, function (e) { failed.push(f.name + ': ' + e.message); });
        }
        return add(f).then(function (fam) { added.push(fam); }, function (e) { bad(f.name || '?', e); });
      });
    });
    return chain.then(function () { return { added: added, failed: failed, skipped: skipped }; });
  }
  /** the fonts installed on this computer — the same ones Word lists (Chrome / Edge «Local Font Access», asks permission) */
  function systemFonts() {
    if (typeof global.queryLocalFonts !== 'function') return Promise.reject(new Error('unsupported'));
    return global.queryLocalFonts().then(function (list) {
      var fam = {};
      list.forEach(function (f) {
        var cur = fam[f.family], reg = /^(regular|normal|book|roman)$/i.test(f.style || '');
        if (!cur || (reg && !cur.reg)) fam[f.family] = { family: f.family, data: f, reg: reg };
      });
      return Object.keys(fam).sort(function (a, b) { return a.localeCompare(b); }).map(function (k) { return fam[k]; });
    });
  }
  function addSystem(entries) {
    var added = [], failed = [], skipped = 0, chain = Promise.resolve();
    entries.forEach(function (x) {
      chain = chain.then(function () {
        return x.data.blob().then(function (b) { return b.arrayBuffer(); }).then(function (buf) { return addBytes(buf, x.family + '.ttf', x.family); })
          .then(function (fam) { added.push(fam); }, function (e) { if (e && e.dup) skipped++; else failed.push(x.family + ': ' + (e && e.message || e)); });
      });
    });
    return chain.then(function () { return { added: added, failed: failed, skipped: skipped }; });
  }

  // ------------------------------------------------------------ add / remove / rename / favourites
  function add(file, wanted) {
    return new Promise(function (res, rej) {
      if (!file) return rej(new Error(L('لم يُختر ملف', 'No file')));
      if (!/\.(ttf|otf)$/i.test(file.name || '')) return rej(new Error(L('اختر ملف خط بصيغة TTF أو OTF (خطوط Windows موجودة في C:\\Windows\\Fonts)', 'Choose a .ttf or .otf font file')));
      if (file.size > 25 * 1024 * 1024) return rej(new Error(L('الملف كبير جداً (أكثر من 25 م.ب)', 'File too large')));
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.readAsArrayBuffer(file);
    }).then(function (buf) { return addBytes(buf, file.name, wanted); });
  }
  function addBytes(buf, fileName, wanted) {
    return Promise.resolve().then(function () {
      var file = { name: fileName || 'Font.ttf' };
      if (!buf || buf.byteLength < 12) throw new Error(L('ملف فارغ', 'Empty file'));
      var sig = new DataView(buf).getUint32(0);
      if (sig === 0x74746366) throw new Error(L('ملف TTC (مجموعة خطوط) غير مدعوم — اختر ملف TTF أو OTF', 'TTC collections are not supported'));
      if (sig !== 0x00010000 && sig !== 0x4F54544F && sig !== 0x74727565) throw new Error(L('هذا ليس ملف خط صالحاً', 'Not a valid font file'));
      var fam = String(wanted || fontName(buf) || (file.name || 'Font').replace(/\.[^.]+$/, '')).replace(/["';{}<>\\]/g, '').trim() || 'Font';
      // the same family again (its Bold / Italic file …): keep the first one — bold and italic are drawn from it
      if (!wanted && isCustom(fam)) { var dup = new Error(L('موجود مسبقاً', 'already added')); dup.dup = true; throw dup; }
      if (BUNDLED.indexOf(fam.toLowerCase()) >= 0) fam += ' ' + L('(خاص)', '(own)');
      var m = meta(), base = fam, k = 2;
      while (m.custom.some(function (c) { return c.family.toLowerCase() === fam.toLowerCase(); })) fam = base + ' ' + (k++);
      // check the browser accepts it before keeping it
      var test = global.FontFace ? new FontFace('armath-test-' + Date.now(), buf.slice(0)).load() : Promise.resolve();
      return test.then(function () {
        return tx('readwrite', function (s) { return s.put({ family: fam, data: buf, name: file.name, size: buf.byteLength, added: Date.now() }); });
      }, function () { throw new Error(L('المتصفح لم يقبل هذا الخط', 'The browser rejected this font')); }).then(function () {
        var m2 = meta(); m2.custom.push({ family: fam, file: file.name, size: buf.byteLength, added: Date.now() });
        delete byteCache[fam]; delete cssCache[fam]; delete loaded[fam];
        saveMeta(m2);
        return load(fam).then(function () { return fam; });
      });
    });
  }
  function remove(f) {
    var c = customOf(f); if (!c) return Promise.resolve(false);
    return tx('readwrite', function (s) { return s.delete(c.family); }).then(function () {
      var m = meta();
      m.custom = m.custom.filter(function (x) { return x.family !== c.family; });
      m.fav = m.fav.filter(function (x) { return x !== c.family; });
      delete byteCache[c.family]; delete cssCache[c.family];
      saveMeta(m);
      return true;
    });
  }
  function rename(f, name) {
    var c = customOf(f); name = String(name || '').replace(/["';{}<>\\]/g, '').trim();
    if (!c || !name || name === c.family) return Promise.resolve(c ? c.family : null);
    if (BUNDLED.indexOf(name.toLowerCase()) >= 0 || isCustom(name)) return Promise.reject(new Error(L('هذا الاسم مستخدم', 'Name already used')));
    return bytes(c.family).then(function (buf) {
      return tx('readwrite', function (s) { s.delete(c.family); return s.put({ family: name, data: buf, name: c.file, size: c.size, added: c.added }); });
    }).then(function () {
      var m = meta();
      m.custom.forEach(function (x) { if (x.family === c.family) x.family = name; });
      m.fav = m.fav.map(function (x) { return x === c.family ? name : x; });
      delete byteCache[c.family]; delete cssCache[c.family];
      saveMeta(m);
      return load(name).then(function () { return name; });
    });
  }
  function toggleFav(f) {
    var m = meta(), i = m.fav.indexOf(f);
    if (i >= 0) m.fav.splice(i, 1); else m.fav.push(f);
    saveMeta(m);
    return i < 0;
  }
  function moveFav(f, d) {
    var m = meta(), i = m.fav.indexOf(f), j = i + d;
    if (i < 0 || j < 0 || j >= m.fav.length) return;
    m.fav.splice(i, 1); m.fav.splice(j, 0, f);
    saveMeta(m);
  }

  // ------------------------------------------------------------ change notification (all open pages / frames)
  var subs = [], bc = null;
  try { bc = new BroadcastChannel('armath-fonts'); bc.onmessage = function () { fire(true); }; } catch (e) { /* ignore */ }
  global.addEventListener('storage', function (e) { if (e.key === META) fire(true); });
  function fire(remote) {
    if (remote) { byteCache = {}; cssCache = {}; loadAll(); }
    subs.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
  }
  function changed() { if (bc) try { bc.postMessage(1); } catch (e) { /* ignore */ } fire(false); }
  function onChange(fn) { subs.push(fn); }

  // ------------------------------------------------------------ font lists (<select>)
  var MANAGE = '__manage_fonts__';
  var selects = [];
  function fill(sel) {
    if (!sel) return;
    if (!sel.__orig) {
      sel.__orig = Array.prototype.map.call(sel.options, function (o) { return { v: o.value, t: o.textContent }; });
      selects.push(sel);
      sel.addEventListener('change', function (e) {
        if (sel.value !== MANAGE) { sel.__last = sel.value; return; }
        e.stopImmediatePropagation();
        sel.value = sel.__last || sel.__orig[0].v;
        openManager();
      }, true);
      sel.__last = sel.value;
    }
    var cur = sel.value && sel.value !== MANAGE ? sel.value : sel.__last, m = meta();
    var all = sel.__orig.concat(m.custom.map(function (c) { return { v: c.family, t: c.family, custom: true }; }));
    var byV = {}; all.forEach(function (o) { byV[o.v] = o; });
    function opt(o, star) { return '<option value="' + esc(o.v) + '"' + (o.custom ? ' style="font-family:\'' + esc(o.v) + '\'"' : '') + '>' + (star ? '★ ' : '') + esc(o.t) + '</option>'; }
    var favs = m.fav.filter(function (f) { return byV[f]; }), html = '';
    if (favs.length) html += '<optgroup label="' + L('المفضلة', 'Favourites') + '">' + favs.map(function (f) { return opt(byV[f], true); }).join('') + '</optgroup>';
    var rest = sel.__orig.filter(function (o) { return favs.indexOf(o.v) < 0; });
    html += (favs.length || m.custom.length ? '<optgroup label="' + L('الخطوط', 'Fonts') + '">' : '') + rest.map(function (o) { return opt(o); }).join('') + (favs.length || m.custom.length ? '</optgroup>' : '');
    var mine = m.custom.filter(function (c) { return favs.indexOf(c.family) < 0; });
    if (mine.length) html += '<optgroup label="' + L('خطوطي', 'My fonts') + '">' + mine.map(function (c) { return opt(byV[c.family]); }).join('') + '</optgroup>';
    html += '<option value="' + MANAGE + '">⚙ ' + L('إدارة الخطوط (إضافة، حذف، مفضلة)…', 'Manage fonts…') + '</option>';
    sel.innerHTML = html;
    if (cur && !byV[cur]) {                        // a font from an equation made elsewhere: keep it selectable
      var o = document.createElement('option'); o.value = cur; o.textContent = cur; sel.insertBefore(o, sel.lastChild);
    }
    sel.value = cur || sel.__orig[0].v;
    sel.__last = sel.value;
  }
  onChange(function () { selects.forEach(function (s) { if (s.isConnected) fill(s); }); });
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ------------------------------------------------------------ manager dialog
  var MCSS = '.ufm-back{position:fixed;inset:0;background:rgba(12,30,34,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:10px}' +
    '.ufm{background:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.3);width:min(560px,100%);max-height:min(640px,100%);display:flex;flex-direction:column;font:14px "Segoe UI",Tahoma,sans-serif;color:#1b2a30;direction:rtl}' +
    '.ufm[dir=ltr]{direction:ltr}.ufm h3{margin:0;padding:12px 16px;font-size:15px;border-bottom:1px solid #e3ecee;display:flex;align-items:center;gap:8px}.ufm h3 span{flex:1}' +
    '.ufm h3 button{border:0;background:none;font-size:18px;cursor:pointer;color:#6b7f86}' +
    '.ufm .add{padding:10px 16px;border-bottom:1px solid #e3ecee;display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
    '.ufm .add label.btn{background:#0e9f9a;color:#fff;border-radius:9px;padding:7px 14px;font-weight:700;cursor:pointer}.ufm .add input[type=file]{display:none}' +
    '.ufm .add .hint{font-size:12px;color:#6b7f86;flex:1;min-width:180px;line-height:1.6}' +
    '.ufm .list{overflow:auto;padding:6px 10px 12px;flex:1}' +
    '.ufm .grp{font-size:12px;font-weight:700;color:#3d5560;margin:10px 6px 4px}' +
    '.ufm .it{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:10px;border:1px solid transparent}.ufm .it:hover{background:#f4f9f9;border-color:#e3ecee}' +
    '.ufm .it .nm{min-width:0;flex:1;display:flex;flex-direction:column}.ufm .it .nm b{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.ufm .it .nm span{font-size:19px;line-height:1.5;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}' +
    '.ufm .it button{border:1px solid #d7e3e6;background:#fff;border-radius:8px;min-width:30px;height:30px;cursor:pointer;font-size:14px;color:#3d5560}' +
    '.ufm .it button.fav[aria-pressed=true]{color:#e0a100;border-color:#f2d27a;background:#fff8e1}.ufm .it button.del{color:#c2352b}' +
    '.ufm .msg{padding:0 16px 10px;font-size:12.5px;color:#c2352b}.ufm .msg.ok{color:#1f7a3a}' +
    '.ufm.drop{outline:3px dashed #0e9f9a;outline-offset:-8px}.ufm .btn2{border:1.5px solid #0e9f9a;background:#fff;color:#0a7c78;border-radius:9px;padding:6px 12px;font-weight:700;cursor:pointer}' +
    '.ufm .sys{border-bottom:1px solid #e3ecee;padding:8px 16px;max-height:260px;display:flex;flex-direction:column;gap:6px}' +
    '.ufm .sysbar{display:flex;gap:6px}.ufm .sysbar input{flex:1;border:1px solid #c9d7db;border-radius:7px;padding:4px 8px}.ufm .sysbar button{border:1px solid #c9d7db;background:#fff;border-radius:7px;padding:3px 9px;cursor:pointer}' +
    '.ufm .sysbar button[aria-pressed=true]{background:#e2f5f3;border-color:#0e9f9a}.ufm .sysbar .btn{background:#0e9f9a;color:#fff;border-color:#0e9f9a;font-weight:700}' +
    '.ufm .syslist{overflow:auto;display:flex;flex-direction:column;gap:2px}.ufm .sf{display:flex;gap:8px;align-items:center;padding:2px 4px;font-size:15px}';
  function openManager() {
    if (!document.getElementById('ufmCss')) { var s = document.createElement('style'); s.id = 'ufmCss'; s.textContent = MCSS; document.head.appendChild(s); }
    var old = document.querySelector('.ufm-back'); if (old) old.remove();
    var back = document.createElement('div'); back.className = 'ufm-back';
    back.innerHTML = '<div class="ufm" dir="' + (en() ? 'ltr' : 'rtl') + '" role="dialog"><h3><span>🔤 ' + L('إدارة الخطوط', 'Manage fonts') + '</span><button type="button" data-x title="' + L('إغلاق', 'Close') + '">✕</button></h3>' +
      '<div class="add"><label class="btn">＋ ' + L('إضافة خطوط…', 'Add fonts…') + '<input type="file" accept=".ttf,.otf,.zip,font/ttf,font/otf,application/zip" multiple></label>' +
      (typeof global.queryLocalFonts === 'function' ? '<button type="button" class="btn2" data-sys>🖥 ' + L('خطوط جهازي (مثل Word)', 'My computer\'s fonts') + '</button>' : '') +
      '<span class="hint">' + L('اختر عدة ملفات TTF / OTF معاً، أو ملف ZIP فيه خطوطك كلها، أو اسحبها وأفلتها هنا. خطوط Windows التي يعرضها Word موجودة في C:\\Windows\\Fonts (مثل Traditional Arabic: trado.ttf). يُحفظ كل خط في هذا الجهاز ويظهر في كل القوائم، وفي Word تُرسم الحروف بنفس الخط تماماً.', 'Pick several .ttf/.otf files, a .zip, or drop them here. Windows fonts are in C:\\Windows\\Fonts.') + '</span></div>' +
      '<div class="sys" hidden></div>' +
      '<div class="msg" hidden></div><div class="list"></div></div>';
    document.body.appendChild(back);
    var box = back.querySelector('.list'), msg = back.querySelector('.msg');
    function say(t, ok) { msg.hidden = !t; msg.textContent = t || ''; msg.className = 'msg' + (ok ? ' ok' : ''); }
    function close() { back.remove(); }
    back.querySelector('[data-x]').onclick = close;
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    back.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    function report(r) {
      var t = (r.added.length ? L('أُضيف ' + r.added.length + ': ', 'Added ' + r.added.length + ': ') + r.added.slice(0, 8).join('، ') + (r.added.length > 8 ? ' …' : '') : '') +
        (r.skipped ? L(' — تُرك ' + r.skipped + ' ملف لنفس الخط (عريض/مائل)', ' — skipped ' + r.skipped + ' style files') : '') +
        (r.failed.length ? L(' — تعذّر: ', ' — failed: ') + r.failed.slice(0, 4).join(' | ') : '');
      say(t || L('لم يُضف شيء', 'Nothing added'), !r.failed.length);
      render();
    }
    function addFiles(files) { say(L('جارٍ الإضافة…', 'Adding…'), true); addMany(files).then(report, function (e) { say(e.message || String(e)); }); }
    back.querySelector('input[type=file]').onchange = function () { addFiles(this.files); this.value = ''; };
    var dlg = back.querySelector('.ufm');
    dlg.addEventListener('dragover', function (e) { e.preventDefault(); dlg.classList.add('drop'); });
    dlg.addEventListener('dragleave', function () { dlg.classList.remove('drop'); });
    dlg.addEventListener('drop', function (e) { e.preventDefault(); dlg.classList.remove('drop'); if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
    var sysBtn = back.querySelector('[data-sys]');
    if (sysBtn) sysBtn.onclick = function () {
      var box = back.querySelector('.sys');
      say(L('جارٍ قراءة خطوط الجهاز… (اسمح بالوصول إن سُئلت)', 'Reading your fonts… (allow access if asked)'), true);
      systemFonts().then(function (fams) {
        say('', true);
        box.hidden = false;
        box.innerHTML = '<div class="sysbar"><input type="search" placeholder="' + L('ابحث عن خط…', 'Search…') + '"><button type="button" data-ar>' + L('العربية فقط', 'Arabic only') + '</button><button type="button" data-allv>' + L('تحديد الظاهر', 'Tick shown') + '</button><button type="button" data-add class="btn">' + L('إضافة المحدد', 'Add selected') + '</button></div><div class="syslist"></div>';
        var lst = box.querySelector('.syslist'), q = box.querySelector('input'), arOnly = false;
        var AR_HINT = /arab|naskh|kufi|amiri|scheherazade|sakkal|majalla|traditional|simplified|andalus|aldhabi|urdu|diwani|thuluth|ruqaa|nastaliq|dubai|tahoma|segoe|arial|times|courier|calibri|cairo|tajawal|almarai|lateef|harmattan|mada|changa|lalezar|reem|marhey/i;
        function draw() {
          var f = q.value.trim().toLowerCase();
          lst.innerHTML = fams.filter(function (x) { return (!f || x.family.toLowerCase().indexOf(f) >= 0) && (!arOnly || AR_HINT.test(x.family)); }).map(function (x) {
            var have = isCustom(x.family);
            return '<label class="sf"><input type="checkbox" value="' + esc(x.family) + '"' + (have ? ' disabled checked' : '') + '><span style="font-family:\'' + esc(x.family) + '\'">' + esc(x.family) + ' — أبجد ١٢٣</span></label>';
          }).join('') || '<div class="grp">' + L('لا نتائج', 'No results') + '</div>';
        }
        q.oninput = draw;
        box.querySelector('[data-allv]').onclick = function () { Array.prototype.forEach.call(lst.querySelectorAll('input:not([disabled])'), function (i) { i.checked = true; }); };
        box.querySelector('[data-ar]').onclick = function () { arOnly = !arOnly; this.setAttribute('aria-pressed', String(arOnly)); draw(); };
        box.querySelector('[data-add]').onclick = function () {
          var pick = Array.prototype.filter.call(lst.querySelectorAll('input:checked:not([disabled])'), function () { return true; }).map(function (i) { return i.value; });
          var ents = fams.filter(function (x) { return pick.indexOf(x.family) >= 0; });
          if (!ents.length) return;
          say(L('جارٍ إضافة ' + ents.length + ' خط…', 'Adding…'), true);
          addSystem(ents).then(function (r) { report(r); draw(); });
        };
        draw();
      }, function () {
        say(L('هذا البرنامج لا يسمح بقراءة خطوط الجهاز مباشرة. البديل: افتح C:\\Windows\\Fonts، انسخ الخطوط التي تريدها إلى مجلد، ثم اختر ملفاتها كلها معاً (أو اضغط المجلد ZIP) بزر «إضافة خطوط».', 'Your app does not allow reading installed fonts. Copy them from C:\\Windows\\Fonts and add the files (or a ZIP).'));
      });
    };
    function row(f, label, custom) {
      var it = document.createElement('div'); it.className = 'it';
      it.innerHTML = '<div class="nm"><b></b><span></span></div>' +
        (isFav(f) ? '<button type="button" data-up title="' + L('أعلى', 'Up') + '">▲</button>' : '') +
        '<button type="button" class="fav" aria-pressed="' + isFav(f) + '" title="' + L('مفضل — يظهر أولاً في القوائم', 'Favourite — shown first') + '">★</button>' +
        (custom ? '<button type="button" data-ren title="' + L('إعادة التسمية', 'Rename') + '">✎</button><button type="button" class="del" title="' + L('حذف', 'Delete') + '">🗑</button>' : '');
      it.querySelector('b').textContent = label + (custom ? '' : '');
      var sp = it.querySelector('span'); sp.textContent = SAMPLE; sp.style.fontFamily = '"' + f + '", serif';
      it.querySelector('.fav').onclick = function () { toggleFav(f); render(); };
      var up = it.querySelector('[data-up]'); if (up) up.onclick = function () { moveFav(f, -1); render(); };
      var del = it.querySelector('.del');
      if (del) del.onclick = function () {
        if (!confirm(L('حذف الخط «' + f + '»؟ المعادلات التي أُدرجت به في Word تبقى كما هي.', 'Delete «' + f + '»? Equations already in Word keep their look.'))) return;
        remove(f).then(function () { say(L('حُذف الخط', 'Deleted'), true); render(); }).catch(function (e) { say(e.message); });
      };
      var ren = it.querySelector('[data-ren]');
      if (ren) ren.onclick = function () {
        var n = prompt(L('الاسم الجديد للخط:', 'New name:'), f); if (!n) return;
        rename(f, n).then(function () { render(); }).catch(function (e) { say(e.message); });
      };
      return it;
    }
    function render() {
      box.innerHTML = '';
      var m = meta(), base = [['Amiri', 'أميري'], ['Noto Naskh Arabic', 'نوتو نسخ'], ['Scheherazade New', 'شهرزاد'], ['Noto Kufi Arabic', 'نوتو كوفي'], ['Cairo', 'القاهرة'],
        ['Traditional Arabic', 'Traditional Arabic'], ['Simplified Arabic', 'Simplified Arabic'], ['Sakkal Majalla', 'Sakkal Majalla'], ['Times New Roman', 'Times New Roman']];
      var label = {}; base.forEach(function (b) { label[b[0]] = b[1]; }); m.custom.forEach(function (c) { label[c.family] = c.family; });
      function grp(t) { var g = document.createElement('div'); g.className = 'grp'; g.textContent = t; box.appendChild(g); }
      if (m.fav.length) { grp('★ ' + L('المفضلة (تظهر أولاً)', 'Favourites (shown first)')); m.fav.forEach(function (f) { box.appendChild(row(f, label[f] || f, isCustom(f))); }); }
      grp(L('خطوطي', 'My fonts') + ' (' + m.custom.length + ')');
      if (!m.custom.length) { var e = document.createElement('div'); e.className = 'grp'; e.style.fontWeight = '400'; e.textContent = L('لم تُضف خطوطاً بعد — اضغط «إضافة خط».', 'No fonts yet.'); box.appendChild(e); }
      m.custom.forEach(function (c) { if (!isFav(c.family)) box.appendChild(row(c.family, c.family + '  · ' + Math.round((c.size || 0) / 1024) + ' KB', true)); });
      grp(L('خطوط الإضافة', 'Built-in fonts'));
      base.forEach(function (b) { if (!isFav(b[0])) box.appendChild(row(b[0], b[1], false)); });
    }
    loadAll().then(render); render();
  }

  var ready = loadAll();
  global.UserFonts = {
    list: function () { return meta().custom.slice(); }, families: families, isCustom: isCustom, isFav: isFav,
    add: add, addMany: addMany, addBytes: addBytes, systemFonts: systemFonts, unzip: unzipFonts, remove: remove, rename: rename, toggleFav: toggleFav, bytes: bytes, css: css, load: load, loadAll: loadAll,
    ready: ready, fill: fill, openManager: openManager, onChange: onChange, fontName: fontName, MANAGE: MANAGE
  };
})(window);
