/* Arabic question parser (TF + MCQ) — JavaScript port of question-parser/*.py
 *
 * Input : "blocks" read from a Word document:
 *           [{ k: 'p', runs: ['text', ...] }, { k: 't', rows: [[cell, ...], ...] }]
 * Output: { tf, mcq, errors, dups, meta } — see QParser.analyze().
 * Works in the browser (window.QParser) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  var LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ'];
  var DEDUP_THRESHOLD = 0.75;

  // ───────────────────────────────────────────── text helpers
  function norm(t) {
    t = String(t || '').toLowerCase().trim();
    t = t.replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
    t = t.replace(/[^\p{L}\p{N}\p{M}_\s]/gu, ' ');
    return t.replace(/\s+/g, ' ').trim();
  }
  function normDup(t) {                       // same as the Python duplicate detector's _normalize
    t = String(t || '').toLowerCase().trim();
    t = t.replace(/[ً-ٰٟ]/g, '').replace(/[أإآ]/g, 'ا');
    t = t.replace(/[^\p{L}\p{N}\p{M}_\s]/gu, ' ');
    return t.replace(/\s+/g, ' ').trim();
  }
  function cleanWs(s) { return String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim(); }
  function letter(s) {
    s = String(s || '').replace(/[()\sـ]/g, '');
    return { 'ا': 'أ', 'أ': 'أ', 'ب': 'ب', 'ج': 'ج', 'د': 'د', 'ه': 'هـ' }[s] || '';
  }

  // difflib.SequenceMatcher.ratio() equivalent
  function matchCount(a, b) {
    if (!a.length || !b.length) return 0;
    var best = 0, ai = 0, bi = 0, prev = new Array(b.length + 1).fill(0);
    for (var i = 1; i <= a.length; i++) {
      var cur = new Array(b.length + 1).fill(0);
      for (var j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          cur[j] = prev[j - 1] + 1;
          if (cur[j] > best) { best = cur[j]; ai = i - best; bi = j - best; }
        }
      }
      prev = cur;
    }
    if (!best) return 0;
    return best + matchCount(a.slice(0, ai), b.slice(0, bi)) + matchCount(a.slice(ai + best), b.slice(bi + best));
  }
  function ratio(a, b) {
    if (!a.length && !b.length) return 1;
    return 2 * matchCount(a, b) / (a.length + b.length);
  }
  function sim(a, b) { var x = norm(a), y = norm(b); return x && y ? ratio(x, y) : 0; }
  function similarity(a, b) {                 // 60% sequence + 40% shared words (duplicate detector)
    var na = normDup(a), nb = normDup(b);
    if (!na || !nb) return 0;
    var seq = ratio(na, nb);
    var wa = {}, wb = {}, la = 0, lb = 0, inter = 0;
    na.split(' ').forEach(function (w) { if (!wa[w]) { wa[w] = 1; la++; } });
    nb.split(' ').forEach(function (w) { if (!wb[w]) { wb[w] = 1; lb++; } });
    Object.keys(wa).forEach(function (w) { if (wb[w]) inter++; });
    return 0.6 * seq + 0.4 * (inter / Math.max(la, lb));
  }

  // ───────────────────────────────────────────── inline-option splitting
  var ALL_RE = /جميع\s+الإجابات\s+السابقة\s+\S+|جميع\s+الاجابات\s+السابقة\s+\S+|كل\s+ما\s+سبق(?:\s+صحيح)?|جميع\s+ما\s+سبق|لا\s+شيء\s+مما\s+سبق/;
  var STOP_END = {};
  ['من', 'في', 'على', 'إلى', 'عن', 'بين', 'و', 'مع', 'ثم', 'حتى', 'أن', 'الذي', 'التي', 'ل', 'ب', 'قبل', 'بعد', 'عند', 'أو']
    .forEach(function (w) { STOP_END[norm(w)] = 1; });

  function findSpans(tokens, words) {
    var nt = tokens.map(norm), nw = words.map(norm), out = [];
    if (!nw.length) return out;
    for (var i = 0; i + nw.length <= nt.length; i++) {
      var ok = true;
      for (var j = 0; j < nw.length; j++) if (nt[i + j] !== nw[j]) { ok = false; break; }
      if (ok) out.push([i, i + nw.length]);
    }
    return out;
  }
  function fixedSpan(tokens) {
    var text = '', pos = [];
    tokens.forEach(function (t) { pos.push(text.length); text += t + ' '; });
    var m = ALL_RE.exec(text);
    if (!m) return null;
    var a = 0, b = 0;
    pos.forEach(function (p, i) { if (p <= m.index) a = i; if (p < m.index + m[0].length) b = i + 1; });
    return [a, b];
  }
  function pvariance(xs) {
    if (xs.length < 2) return 0;
    var m = xs.reduce(function (s, x) { return s + x; }, 0) / xs.length;
    return xs.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / xs.length;
  }
  function spanEq(a, b) { return a[0] === b[0] && a[1] === b[1]; }

  function scoreSeg(tokens, spans, fixed, labels) {
    var free = spans.filter(function (s) { return !(fixed && spanEq(s, fixed)); });
    var sc = pvariance(free.map(function (s) { return s[1] - s[0]; }));
    var shapes = {}, nShapes = 0, evidence = 0, sizes = {}, nSizes = 0;
    free.forEach(function (s) {
      var ch = tokens.slice(s[0], s[1]), txt = ch.join(' ');
      var last = norm(ch[ch.length - 1]), first = norm(ch[0]);
      if (STOP_END[last]) sc += 2.5;
      if (first === 'و' || ch[0] === '-' || ch[0] === '–' || ch[ch.length - 1] === '-' || ch[ch.length - 1] === '–') sc += 3;
      else if (STOP_END[first]) sc += 1.5;
      if ((txt.match(/\(/g) || []).length !== (txt.match(/\)/g) || []).length) sc += 6;
      var hasD = /[\d٠-٩]/.test(txt) ? 1 : 0;
      if (!(hasD in shapes)) { shapes[hasD] = 1; nShapes++; }
      var k = s[1] - s[0];
      if (!(k in sizes)) { sizes[k] = 1; nSizes++; }
      for (var i = 0; i < labels.length; i++) {
        var nl = norm(labels[i]), nc = norm(txt);
        if (nc && (nl.indexOf(nc) === 0 || sim(labels[i], txt) >= 0.8)) { sc -= 1.5; evidence++; break; }
      }
    });
    if (nShapes > 1) sc += 3;
    return { sc: sc, ev: evidence, same: nSizes === 1 };
  }

  function combinations(arr, k, cb) {
    (function rec(start, picked) {
      if (picked.length === k) { cb(picked); return; }
      for (var i = start; i < arr.length; i++) { picked.push(arr[i]); rec(i + 1, picked); picked.pop(); }
    })(0, []);
  }

  // → { options: [...], conf: 'exact'|'high'|'medium'|'low' }
  function splitInlineOptions(text, answer, runChunks, labels, k) {
    k = k || 4; labels = labels || []; answer = answer || '';
    text = cleanWs(text);
    var ansN = norm(answer);
    if (runChunks) {
      var chunks = runChunks.map(cleanWs).filter(Boolean);
      var hits = chunks.filter(function (c) { return norm(c) === ansN; }).length;
      if (chunks.length >= 3 && chunks.length <= 5 && hits === 1) return { options: chunks, conf: 'exact' };
    }
    var tokens = text.split(' ').filter(Boolean);
    if (tokens.length <= k) return { options: tokens, conf: 'medium' };
    if (tokens.length > 45) return { options: [text], conf: 'low' };

    var fixed = fixedSpan(tokens);
    var ansSpans = answer ? findSpans(tokens, answer.split(/\s+/)) : [];
    if (fixed && ansSpans.some(function (s) { return spanEq(s, fixed); })) ansSpans = [fixed];
    var candidates = ansSpans.length ? ansSpans : [null];
    var best = null;
    candidates.forEach(function (cand) {
      var req = [];
      if (fixed) req.push(fixed);
      if (cand && !(fixed && spanEq(cand, fixed))) req.push(cand);
      var forcedSet = {}, forced = [];
      req.forEach(function (s) {
        [s[0], s[1]].forEach(function (p) { if (p > 0 && p < tokens.length && !forcedSet[p]) { forcedSet[p] = 1; forced.push(p); } });
      });
      if (forced.length > k - 1) return;
      var freePos = [];
      for (var p = 1; p < tokens.length; p++) if (!forcedSet[p]) freePos.push(p);
      combinations(freePos, k - 1 - forced.length, function (extra) {
        var cuts = forced.concat(extra).sort(function (a, b) { return a - b; });
        var bounds = [0].concat(cuts, [tokens.length]), spans = [];
        for (var i = 0; i < bounds.length - 1; i++) spans.push([bounds[i], bounds[i + 1]]);
        for (var r = 0; r < req.length; r++) if (!spans.some(function (s) { return spanEq(s, req[r]); })) return;
        var res = scoreSeg(tokens, spans, fixed, labels);
        if (!best || res.sc < best.sc) best = { sc: res.sc, spans: spans, ev: res.ev, same: res.same };
      });
    });
    if (!best) return { options: [text], conf: 'low' };
    var opts = best.spans.map(function (s) { return tokens.slice(s[0], s[1]).join(' '); });
    var conf = best.ev >= Math.max(1, k - 2) ? 'high' : (best.same ? 'medium' : 'low');
    if (!ansSpans.length && answer) conf = 'low';
    return { options: opts, conf: conf };
  }

  // ───────────────────────────────────────────── blocks → question groups
  var Q_START = /^[•\-*\s]*س\s*(\d+)\s*[)\-.:：]?\s*([\s\S]*)$/;
  var SECTION = /^(?:أولا|أولاً|ثانيا|ثانياً|ثالثا|ثالثاً|رابعا|رابعاً|خامسا|خامساً)\s*[:：\-]/;
  var SEP = /^[\s_\-–—=*]{3,}$/;
  var BULLET = /^(?:o\s+|[•·▪●◦*\-–]+\s*)/;
  var FIELDS = [
    ['ans',      /^(?:ال)?[إا]جابة(?:\s+الصحيحة)?\s*[:：]\s*/],
    ['corr',     /^تصحيح\s+الخطأ\s*[:：]\s*/],
    ['trans',    /^ترجمة\s+السؤال\s*[:：]\s*/],
    ['steps',    /^خطوات\s+الحل\s*[:：]\s*/],
    ['idea',     /^الفكرة\s+الأساسية\s*[:：]\s*/],
    ['rule',     /^(?:ال)?قاعدة\s*[:：]\s*/],
    ['examples', /^أمثلة\s+إضافية\s*[:：]\s*/],
    ['shrah',    /^(?:ال)?شرح\s*[:：]\s*/],
    ['expl',     /^(?:ال)?(?:توضيح(?:\s+العلمي)?|تحليل)\s*[:：]\s*/],
    ['src',      /^(?:ال)?مصدر(?:\s+المجمع)?\s*[:：]\s*/],
    ['time',     /^الوقت[^:：]*[:：]\s*/],
    ['diff',     /^صعوبة[^:：]*[:：]\s*/]
  ];
  var MATCH_ITEM = /^[•\-*\s]*س\s*(\d+)\s*[)\-.:：]?\s*(.+?)\s*(?:->|=>|—>|–>|←|⟵)\s*(.+)$/;
  var DONE_LINE = /^(?:DONE|END|انتهى)$/i;
  function isMatchHead(line) {
    if (line.length > 80) return false;
    if (/^[•\-*\s]*س\s*\d+\s*\)/.test(line)) return false;
    return /^(?:[•\-*]\s*)?(?:جدول\s+)?(?:أسئلة\s+)?(?:ال)?(?:وصل|مزاوجة|توصيل|مطابقة)/.test(line) ||
      /^(?:[•\-*]\s*)?[^:：]{0,40}س\s*\d+\s*[-–]\s*س?\s*\d+\s*\)?\s*[:：]?\s*$/.test(line);
  }
  var OPT_LINE = /^\(?\s*(أ|ب|ج|د|هـ|ه)\s*[)\-.ـ]+\s*([\s\S]*)$/;
  var TF_ANS = /^\(?\s*(صح|صحيحة|صحيح|خطأ|خطا|خاطئة|خاطئ|true|false)\s*\)?\s*\.?$/i;

  function fieldOf(line, retry) {
    for (var i = 0; i < FIELDS.length; i++) {
      var m = FIELDS[i][1].exec(line);
      if (m) return [FIELDS[i][0], line.slice(m[0].length).trim()];
    }
    // a stray single letter before the field name (e.g. "ص صعوبة السؤال: متوسط") is a typo — tolerate it
    if (!retry && /^[\u0621-\u064A]\s+\S/.test(line)) {
      var r = fieldOf(line.replace(/^[\u0621-\u064A]\s+/, ''), true);
      if (r[0]) return r;
    }
    return [null, line];
  }
  function stripPrefixRuns(runs, rest) {
    var joined = runs.join(''), idx = rest ? joined.indexOf(rest) : joined.length, out = [], pos = 0;
    runs.forEach(function (r) {
      var end = pos + r.length;
      if (end > idx) out.push(r.slice(Math.max(0, idx - pos)));
      pos = end;
    });
    return out;
  }

  // a pasted block may be flattened into one line: split it back at the question / field markers
  var LABELS_SRC = 'الإجابة|تصحيح\\s+الخطأ|ترجمة\\s+السؤال|خطوات\\s+الحل|الفكرة\\s+الأساسية|الشرح|التوضيح(?:\\s+العلمي)?|التحليل|المصدر(?:\\s+المجمع)?|الوقت\\s+المثالي[^:：]*|صعوبة\\s+السؤال';
  var LABEL_ANY = new RegExp('(?:^|\\s)(?:' + LABELS_SRC + ')\\s*[:：]', 'g');
  var LABEL_SPLIT = new RegExp('\\s+(?=(?:' + LABELS_SRC + ')\\s*[:：])', 'g');
  function explode(line) {
    var parts = [line];
    var nAns = (line.match(/الإجابة\s*[:：]/g) || []).length;
    if (nAns >= 2) {                                      // a whole pasted document flattened into one line
      parts = [];
      line.split(/\s*[-_=]{5,}\s*/).forEach(function (seg) {
        seg.split(/\s+(?=س\s*\d+\s*\))/).forEach(function (x) { if (x.trim()) parts.push(x); });
      });
    } else if ((line.match(/(?:^|\s)س\s*\d+\s*\)/g) || []).length >= 2 && MATCH_ARROW.test(line)) {
      parts = line.split(/\s+(?=س\s*\d+\s*\))/);
    }
    var out = [];
    parts.forEach(function (ln) {
      var nl = (ln.match(LABEL_ANY) || []).length;
      var startsQ = /^\s*[•\-*]?\s*س\s*\d+\s*\)/.test(ln);
      if (nl >= 2 || (nl >= 1 && startsQ)) ln = ln.replace(LABEL_SPLIT, '\n');
      ln.split('\n').forEach(function (x) {
        if (/\s+o\s{2,}\S/.test(x)) x.split(/\s+o\s{2,}(?=\S)/).forEach(function (y) { out.push(y); });
        else out.push(x);
      });
    });
    return out;
  }
  var MATCH_ARROW = /->|=>|—>|–>|←|⟵/;

  function collectGroups(blocks) {
    var items = [], cur = null;
    function flush() { if (cur) { items.push({ k: cur.match ? 'm' : 'q', g: cur }); cur = null; } }
    function newMatch() { return { match: true, items: [], f: {}, shrTxt: [], mode: 'f', last: null }; }

    // matching block: "س51) key ← value" lines, then one shared "الشرح:" with a paragraph per pair
    function matchLine(line) {
      var m = MATCH_ITEM.exec(line);
      if (m) { cur.items.push({ num: parseInt(m[1], 10), key: cleanWs(m[2]), value: trimDot(m[3]) }); cur.mode = 'f'; cur.last = null; return true; }
      var fr = fieldOf(line.replace(BULLET, ''));
      if (fr[0] === 'shrah') { cur.mode = 'shr'; if (fr[1]) cur.shrTxt.push(fr[1]); return true; }
      if (fr[0]) { cur.f[fr[0]] = fr[1]; cur.last = fr[0]; cur.mode = 'f'; return true; }
      if (cur.mode === 'shr') { cur.shrTxt.push(line.replace(/^(?:o|[•·▪●◦*\-–])\s+/, '')); return true; }
      if (cur.last) cur.f[cur.last] = (cur.f[cur.last] + '\n' + line).trim();
      return true;
    }

    blocks.forEach(function (b) {
      if (b.k === 't') { flush(); items.push({ k: 't', rows: b.rows }); return; }
      var full = b.runs.join('');
      var lines = [];
      full.split('\n').forEach(function (l) { explode(l).forEach(function (x) { lines.push(x); }); });
      var single = full.indexOf('\n') < 0 && lines.length === 1;
      lines.forEach(function (raw) {
        var line = cleanWs(raw), runs = single ? b.runs : [raw];
        if (!line) return;
        if (SEP.test(line) || SECTION.test(line) || DONE_LINE.test(line.replace(BULLET, ''))) { flush(); return; }
        if (isMatchHead(line)) { flush(); cur = newMatch(); return; }
        if (MATCH_ITEM.test(line) && !(cur && !cur.match && cur.last)) {   // an arrow line starts / continues a matching block
          if (!cur || !cur.match) { flush(); cur = newMatch(); }
          matchLine(line); return;
        }
        var m = Q_START.exec(line);
        var hasField = !!fieldOf(line.replace(BULLET, ''))[0];
        if (cur && cur.match && (!m || hasField || cur.mode === 'shr')) { matchLine(line); return; }
        if (m && !hasField) {
          flush();
          cur = { num: parseInt(m[1], 10), first: m[2].trim(), runs: stripPrefixRuns(runs, m[2]), extra: [], f: {}, last: null };
          return;
        }
        if (!cur) return;
        line = line.replace(BULLET, '');
        var fr = fieldOf(line);
        if (fr[0]) { cur.f[fr[0]] = fr[1]; cur.last = fr[0]; }
        else if (cur.last === null) cur.extra.push(line);
        else cur.f[cur.last] = (cur.f[cur.last] + '\n' + line).trim();
      });
    });
    flush();
    return items;
  }

  // matching block -> ONE record (like the matching engine): pairs_key_N / pairs_value_N
  function convertMatch(g, category) {
    var f = g.f, di = f.diff || '', ti = (f.time || '').replace(/[^\d\sء-ي]/g, '').trim();
    var nums = g.items.map(function (i) { return i.num; });
    return {
      type: 'match', num: nums[0], numTo: nums[nums.length - 1],
      question: 'أسئلة الوصل (المزاوجة)',
      pairs: g.items.map(function (i) { return { num: i.num, key: i.key, value: i.value }; }),
      shrah: cleanWs(g.shrTxt.join(' ')), trans: cleanWs(f.trans || ''), explanation: cleanWs(f.expl || ''), src: cleanWs(f.src || ''),
      time: ti, difficulty: /سهل/.test(di) ? 'سهل' : (/صعب/.test(di) ? 'صعب' : 'متوسط'), category: category, warn: []
    };
  }

  function splitStem(full) {
    var m = /[:：]/.exec(full);
    if (!m) return [cleanWs(full), ''];
    return [cleanWs(full.slice(0, m.index + 1)), cleanWs(full.slice(m.index + 1))];
  }
  function runChunks(runs) {
    var chunks = [], started = false, cur = '';
    runs.forEach(function (r) {
      if (!started) {
        var m = /[:：]/.exec(r);
        if (!m) return;
        started = true; r = r.slice(m.index + 1);
      }
      if (r !== '' && r.trim() === '') { if (cur.trim()) chunks.push(cur); cur = ''; }
      else cur += r;
    });
    if (cur.trim()) chunks.push(cur);
    return chunks;
  }
  function distractorLabels(expl) {
    var labels = [];
    (expl || '').split('\n').slice(1).forEach(function (ln) {
      var m = /^(.{2,60}?)\s*[:：]\s*\S/.exec(ln.trim());
      if (m) labels.push(m[1].trim());
    });
    return labels;
  }
  function trimDot(s) { return cleanWs(s).replace(/\.+$/, '').trim(); }

  // group → { kind:'tf'|'mcq', num, stem, ans, options[], f, warn[] }
  function convertGroup(g) {
    var f = g.f, ans = trimDot(f.ans || ''), body = (g.first ? [g.first] : []).concat(g.extra), warn = [];
    var q = { num: g.num, ans: ans, f: f, options: [], warn: warn };
    if (TF_ANS.test(ans)) {
      q.kind = 'tf'; q.stem = cleanWs(body.join(' '));
      var na = norm(ans);
      q.ans = (na.indexOf('صح') === 0 || na === 'true') ? 'صح' : 'خطأ';
      return q;
    }
    q.kind = 'mcq';
    var full = body.join(' ');
    var hasMarkers = /\(أ\)/.test(full) || body.slice(1).some(function (l) { return OPT_LINE.test(l); });
    if (hasMarkers) {
      var stemLines = [], opts = [];
      body.forEach(function (l) {
        var m = OPT_LINE.exec(l);
        if (m) opts.push({ l: letter(m[1]), t: cleanWs(m[2]) });
        else if (opts.length) opts[opts.length - 1].t += ' ' + l;
        else stemLines.push(l);
      });
      var stem = cleanWs(stemLines.join(' '));
      if (!opts.length) {                                  // (أ) … (ب) … on one line
        var parts = stem.split(/(\((?:أ|ب|ج|د|هـ)\))/);
        stem = cleanWs(parts[0]);
        for (var i = 1; i < parts.length; i += 2) opts.push({ l: letter(parts[i]), t: cleanWs(parts[i + 1] || '') });
      }
      q.stem = stem;
      q.options = opts.map(function (o) { return o.t; });
      q.letters = opts.map(function (o) { return o.l; });
    } else {
      var sp = splitStem(full), res;
      q.stem = sp[0];
      if (sp[1]) {
        res = splitInlineOptions(sp[1], ans, runChunks(g.runs), distractorLabels(f.expl || ''));
        q.options = res.options; q.conf = res.conf;
        if (res.conf === 'low') warn.push('تم تقسيم الخيارات تلقائياً بثقة منخفضة — راجعها');
      } else {
        q.options = ans ? [ans] : [];
        warn.push('لم يُعثر على الخيارات في السؤال — أُضيفت الإجابة فقط');
      }
    }
    return q;
  }

  function convertTable(rows) {
    var out = [];
    if (!rows.length) return out;
    var head = rows[0].map(norm);
    function col(keys, def) {
      for (var i = 0; i < head.length; i++) for (var k = 0; k < keys.length; k++) if (head[i].indexOf(keys[k]) >= 0) return i;
      return def;
    }
    var cNum = col(['رقم'], 0), cQ = col(['سوال', 'السوال'], 1), cL = col(['حرف'], 2), cA = col(['اجابه'], 3);
    var need = Math.max(cNum, cQ, cL, cA);
    rows.slice(1).forEach(function (r) {
      if (r.length <= need) return;
      var m = /\d+/.exec(r[cNum]);
      if (!m) return;
      var lt = letter(r[cL]), ans = trimDot(r[cA]);
      var options = [], letters = [];
      if (lt && ans) { options = [ans]; letters = [lt]; }
      out.push({
        kind: 'mcq', num: parseInt(m[0], 10), stem: cleanWs(r[cQ]), ans: ans, f: {}, options: options, letters: letters,
        warn: ['من جدول: الخيارات الأخرى غير مكتوبة في الملف (الموجود فقط الإجابة الصحيحة وحرفها)']
      });
    });
    return out;
  }

  // ───────────────────────────────────────────── questions → report records
  // ───────────────────────────────────────────── subject profiles
  var FIELD_AR = { shrah: 'الشرح', steps: 'خطوات الحل', idea: 'الفكرة الأساسية', expl: 'التوضيح العلمي', src: 'المصدر', time: 'الوقت المثالي', diff: 'صعوبة السؤال' };
  var PROFILES = {
    general: { key: 'general', label: 'عام (تاريخ / دين / …)', tfReq: ['shrah', 'expl', 'src', 'time', 'diff'], strictMcq: false },
    math:    { key: 'math', label: 'رياضيات', tfReq: ['steps', 'idea', 'expl', 'src', 'time', 'diff'], strictMcq: false },
    english: { key: 'english', label: 'إنجليزي', tfReq: ['shrah', 'expl', 'src', 'time', 'diff'], strictMcq: true }
  };
  function detectProfile(fieldSets) {
    var has = {};
    fieldSets.forEach(function (f) { Object.keys(f || {}).forEach(function (k) { if (f[k]) has[k] = 1; }); });
    if (has.steps || has.idea) return 'math';
    if (has.trans || has.rule || has.examples) return 'english';
    return 'general';
  }
  function diffOf(d, strictFirst) {
    d = trimDot(d || '');
    var m = /(سهل|متوسط|صعب)/.exec(d);
    return m ? m[1] : (d ? d.split(/\s+/)[0] : 'غير محدد');
  }
  function extra(f) {
    return { steps: cleanWs(f.steps || ''), idea: cleanWs(f.idea || ''), trans: cleanWs(f.trans || ''),
      rule: cleanWs(f.rule || ''), examples: cleanWs(f.examples || '') };
  }

  function buildResults(qs, category, prof) {
    var tf = [], mcq = [], errors = [];
    qs.forEach(function (q) {
      var f = q.f, missing = [];
      var short = q.stem.length > 80 ? q.stem.slice(0, 80) + '...' : q.stem;
      if (q.kind === 'tf') {
        if (!q.stem) missing.push('نص السؤال');
        if (!q.ans) missing.push('الإجابة');
        prof.tfReq.forEach(function (k) { if (!f[k]) missing.push(FIELD_AR[k]); });
        if (q.ans === 'خطأ' && !f.corr) missing.push('تصحيح الخطأ (مطلوب لأن الإجابة خطأ)');
        if (missing.length) { errors.push({ num: q.num, type: 'صح / خطأ', q: short, missing: missing }); return; }
        var rec = {
          type: 'tf', num: q.num, question: q.stem, correct_answer: q.ans, shrah: cleanWs(f.shrah || ''), src: cleanWs(f.src),
          time: trimDot(f.time), corr: q.ans === 'خطأ' ? cleanWs(f.corr) : '', explanation: cleanWs(f.expl),
          difficulty: diffOf(f.diff), category: category, warn: q.warn
        };
        var x = extra(f); Object.keys(x).forEach(function (k) { rec[k] = x[k]; });
        tf.push(rec);
      } else {
        var opts = [0, 1, 2, 3, 4].map(function (i) {
          var at = q.letters ? q.letters.indexOf(LETTERS[i]) : i;
          return at >= 0 && q.options[at] ? trimDot(q.options[at]) : '';
        });
        if (prof.strictMcq && !q.table) {
          if (!q.stem) missing.push('نص السؤال');
          if (opts.filter(Boolean).length < 2) missing.push('يجب أن يحتوي السؤال على خيارين على الأقل');
          if (!q.ans) missing.push('الإجابة الصحيحة');
          ['shrah', 'expl', 'src', 'time', 'diff'].forEach(function (k) { if (!f[k]) missing.push(FIELD_AR[k]); });
          if (missing.length) { errors.push({ num: q.num, type: 'اختيار متعدد', q: short, missing: missing }); return; }
        }
        var m = {
          type: 'mcq', num: q.num, question: q.stem, correct_answer: q.ans, options: opts,
          shrah: cleanWs(f.shrah || ''), src: cleanWs(f.src || ''), time: trimDot(f.time || ''),
          explanation: cleanWs(f.expl || ''), difficulty: f.diff ? diffOf(f.diff) : 'غير محدد',
          category: category, warn: q.warn, conf: q.conf
        };
        var y = extra(f); Object.keys(y).forEach(function (k) { m[k] = y[k]; });
        mcq.push(m);
      }
    });
    return { tf: tf, mcq: mcq, errors: errors };
  }

  function detectDuplicates(texts, threshold) {
    threshold = threshold || DEDUP_THRESHOLD;
    var n = texts.length, parent = [], i, j, pairs = [];
    for (i = 0; i < n; i++) parent.push(i);
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
      var s = similarity(texts[i], texts[j]);
      if (s >= threshold) { pairs.push({ a: i, b: j, sim: s }); var pi = find(i), pj = find(j); if (pi !== pj) parent[pj] = pi; }
    }
    var groups = {};
    for (i = 0; i < n; i++) (groups[find(i)] = groups[find(i)] || []).push(i);
    var dup = Object.keys(groups).map(function (k) { return groups[k]; }).filter(function (g) { return g.length > 1; });
    var removed = [];
    dup.forEach(function (g) { g.slice(1).forEach(function (x) { removed.push(x); }); });
    return { groups: dup, removed: removed.sort(function (a, b) { return a - b; }), pairs: pairs };
  }

  // blocks → full analysis
  // opts.subject: 'auto' | 'general' | 'math' | 'english'
  function analyze(blocks, category, opts) {
    opts = opts || {};
    var items = collectGroups(blocks), qs = [], groups = [];
    items.forEach(function (it) {
      if (it.k === 'q') qs.push(convertGroup(it.g));
      else if (it.k === 'm') { if (it.g.items.length) groups.push(it.g); }
      else convertTable(it.rows).forEach(function (q) { q.table = true; qs.push(q); });
    });
    var key = opts.subject && opts.subject !== 'auto' ? opts.subject
      : detectProfile(qs.map(function (q) { return q.f; }).concat(groups.map(function (g) { return g.f; })));
    var prof = PROFILES[key] || PROFILES.general;
    var cat = category || 'امتحان غير محدد';
    var res = buildResults(qs, cat, prof);
    res.match = groups.map(function (g) { return convertMatch(g, cat); });
    res.profile = prof;
    res.tf.concat(res.mcq).forEach(function (r, i) { r.idx = i; });
    var texts = res.tf.map(function (r) { return r.question; })
      .concat(res.mcq.map(function (r) { return r.question + ' ' + r.correct_answer; }));
    res.dups = detectDuplicates(texts);
    res.kept = texts.map(function (_, i) { return i; }).filter(function (i) { return res.dups.removed.indexOf(i) < 0; });
    return res;
  }

  // ───────────────────────────────────────────── CSV
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCsv(cols, rows) {
    return '﻿' + [cols.join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return csvCell(r[c]); }).join(','); })).join('\r\n') + '\r\n';
  }
  function descOf(r, key, tf) {
    if (key === 'math') return '● خطوات الحل 🎯: ' + (r.steps || '') + '\n● الفكرة الأساسية 💡: ' + (r.idea || '') + '\n   ';
    if (key === 'english') {
      var p = [];
      if (r.trans) p.push(' ترجمة السؤال 🌐: ' + r.trans);
      p.push(' الشرح 🎯: ' + (r.shrah || ''));
      if (r.rule) p.push('     ●️ القاعدة 📐: ' + r.rule);
      if (r.examples) p.push('     ● أمثلة إضافية ✏️: ' + r.examples);
      p.push(' المصدر 🔍📚: ' + (r.src || ''));
      return p.join('\n');
    }
    return '● الشرح 🎯: ' + (r.shrah || '') + (tf ? '\n   ' : '\n     ');
  }
  function row(r, key, tf) {
    var o = {
      mark: 1, question: r.question, correct_answer: r.correct_answer, description: descOf(r, key, tf),
      correction: tf ? r.corr : '', explanation: r.explanation, perfect_time: '⏰ ' + r.time,
      lesson: 'المصدر 🔍📚' + (key === 'english' ? ' : ' : ': ') + (r.src || ''), category: r.category, difficulty: r.difficulty,
      type: tf ? 'tf' : 'mcq'
    };
    if (!tf) for (var i = 0; i < 5; i++) o['option_' + (i + 1)] = r.options[i];
    return o;
  }
  var OPT4 = ['option_1', 'option_2', 'option_3', 'option_4'], OPT5 = OPT4.concat(['option_5']);
  var COLS = {
    general: {
      tf: ['mark', 'question', 'correct_answer', 'description', 'correction', 'explanation', 'perfect_time', 'lesson', 'category', 'difficulty'],
      mcq: ['question', 'correct_answer'].concat(OPT5, ['description', 'correction', 'explanation', 'perfect_time', 'lesson', 'category', 'difficulty'])
    },
    math: {
      tf: ['question', 'correct_answer', 'description', 'correction', 'explanation', 'perfect_time', 'lesson', 'category', 'difficulty', 'mark', 'type'],
      mcq: ['question', 'correct_answer', 'description', 'correction', 'explanation', 'perfect_time', 'lesson', 'category', 'difficulty', 'mark'].concat(OPT4, ['type'])
    },
    english: {
      tf: ['mark', 'question', 'correct_answer', 'category', 'description', 'correction', 'explanation', 'perfect_time', 'lesson', 'difficulty'],
      mcq: ['mark', 'question', 'correct_answer'].concat(OPT4, ['category', 'description', 'correction', 'explanation', 'perfect_time', 'lesson', 'difficulty'])
    }
  };
  function allCols(c, key) { return c.tf.concat(c.mcq.filter(function (x) { return c.tf.indexOf(x) < 0; })); }

  // matching blocks → rows of at most 5 pairs (one row per 5 pairs, shared explanation)
  function matchRows(matches, category, key) {
    var rows = [];
    matches.forEach(function (m) {
      for (var s0 = 0; s0 < Math.max(m.pairs.length, 1); s0 += 5) {
        var chunk = m.pairs.slice(s0, s0 + 5), r = { mark: 1, question: m.question };
        for (var i = 0; i < 5; i++) { r['pairs_key_' + (i + 1)] = chunk[i] ? chunk[i].key : ''; r['pairs_value_' + (i + 1)] = chunk[i] ? chunk[i].value : ''; }
        r.description = key === 'english' ? descOf({ trans: m.trans, shrah: m.shrah, src: '' }, 'english').replace(/\n? المصدر 🔍📚: $/, '')
                                          : '● الشرح 🎯: ' + m.shrah + '\n   ';
        r.correction = ''; r.explanation = m.explanation;
        r.perfect_time = (key === 'english' || m.time) ? '⏰ ' + m.time : '';
        r.lesson = key === 'english' ? 'المصدر 🔍📚 : ' + m.src : (m.src ? 'المصدر 🔍📚: ' + m.src : '');
        r.category = category; r.difficulty = m.difficulty;
        rows.push(r);
      }
    });
    var cols = (key === 'english' ? [] : ['mark']).concat(['question']);
    for (var i = 1; i <= 5; i++) cols.push('pairs_key_' + i, 'pairs_value_' + i);
    cols = cols.concat(['description', 'correction', 'explanation', 'perfect_time', 'lesson', 'category', 'difficulty']);
    return { cols: cols, rows: rows };
  }

  function csvFiles(res, category) {
    var key = res.profile ? res.profile.key : 'general', c = COLS[key];
    function setCat(r) { r.category = category; return r; }
    var tf = res.tf.map(function (r) { return row(setCat(r), key, true); });
    var mcq = res.mcq.map(function (r) { return row(setCat(r), key, false); });
    var nTf = res.tf.length, keptTf = [], keptMcq = [];
    res.kept.forEach(function (i) { if (i < nTf) keptTf.push(tf[i]); else keptMcq.push(mcq[i - nTf]); });
    var ac = allCols(c);
    var mr = matchRows(res.match || [], category, key);
    return {
      tf: toCsv(c.tf, tf), mcq: toCsv(c.mcq, mcq),
      all: toCsv(ac, tf.concat(mcq)), clean: toCsv(ac, keptTf.concat(keptMcq)),
      match: toCsv(mr.cols, mr.rows), matchTable: mr
    };
  }

  // minimal .xlsx writer (JSZip is passed in) — used for the matching sheet
  function colLetter(i) { var s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; }
  function xesc(v) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function makeXlsx(JSZipCtor, cols, rows, sheetName, type) {
    var z = new JSZipCtor();
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    z.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + xesc(sheetName).slice(0, 31) + '" sheetId="1" r:id="rId1"/></sheets></workbook>');
    z.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
    var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews><sheetData>';
    function cell(ci, ri, v) {
      var ref = colLetter(ci) + ri;
      if (typeof v === 'number') return '<c r="' + ref + '"><v>' + v + '</v></c>';
      return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xesc(v) + '</t></is></c>';
    }
    xml += '<row r="1">' + cols.map(function (c, i) { return cell(i, 1, c); }).join('') + '</row>';
    rows.forEach(function (r, ri) { xml += '<row r="' + (ri + 2) + '">' + cols.map(function (c, i) { return cell(i, ri + 2, r[c]); }).join('') + '</row>'; });
    z.file('xl/worksheets/sheet1.xml', xml + '</sheetData></worksheet>');
    return z.generateAsync({ type: type || 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  // ───────────────────────────────────────────── OOXML / document.xml → blocks
  var W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  function runText(r) {
    var out = '';
    for (var c = r.firstElementChild; c; c = c.nextElementSibling) {
      if (c.namespaceURI !== W_NS) continue;
      if (c.localName === 't') out += c.textContent;
      else if (c.localName === 'tab') out += '\t';
      else if (c.localName === 'br' || c.localName === 'cr') out += '\n';
    }
    return out;
  }
  function paraRuns(p) {
    var rs = p.getElementsByTagNameNS(W_NS, 'r'), out = [];
    for (var i = 0; i < rs.length; i++) out.push(runText(rs[i]));
    return out;
  }
  function* iterBody(parent) {
    for (var ch = parent.firstElementChild; ch; ch = ch.nextElementSibling) {
      if (ch.namespaceURI === W_NS && ch.localName === 'sdt') {
        var content = null;
        for (var c = ch.firstElementChild; c; c = c.nextElementSibling) if (c.localName === 'sdtContent') content = c;
        if (content) yield* iterBody(content);
      } else yield ch;
    }
  }
  // xml: string of a <w:document> or a flat-OPC package (Word's body.getOoxml())
  function blocksFromXml(xml) {
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    var bodies = doc.getElementsByTagNameNS(W_NS, 'body');
    if (!bodies.length) throw new Error('لم يُعثر على نص المستند');
    var blocks = [];
    for (var el of iterBody(bodies[0])) {
      if (el.namespaceURI !== W_NS) continue;
      if (el.localName === 'p') blocks.push({ k: 'p', runs: paraRuns(el) });
      else if (el.localName === 'tbl') {
        var rows = [], trs = el.getElementsByTagNameNS(W_NS, 'tr');
        for (var i = 0; i < trs.length; i++) {
          var cells = [];
          for (var tc = trs[i].firstElementChild; tc; tc = tc.nextElementSibling) {
            if (tc.localName !== 'tc') continue;
            var ps = tc.getElementsByTagNameNS(W_NS, 'p'), txt = [];
            for (var j = 0; j < ps.length; j++) txt.push(paraRuns(ps[j]).join('').trim());
            cells.push(txt.join(' ').trim());
          }
          rows.push(cells);
        }
        blocks.push({ k: 't', rows: rows });
      }
    }
    return blocks;
  }
  // plain text (pasted) → blocks, one paragraph per line
  function blocksFromText(text) {
    return String(text || '').split(/\r?\n/).map(function (l) { return { k: 'p', runs: [l] }; });
  }

  // "الدور الثاني 2017 - 2016.docx" → "الدور الثاني 2017 - 2016"
  function examNameFromFilename(path) {
    var stem = String(path || '').split(/[\\/]/).pop().replace(/\.[A-Za-z0-9]+$/, '');
    try { stem = decodeURIComponent(stem); } catch (e) { /* keep */ }
    stem = stem.replace(/^[0-9a-fA-F]{8}[-_]/, '').replace(/\s*\(\d+\)\s*$/, '').replace(/_/g, ' ')
      .replace(/\s*[-–—]\s*/g, ' - ').replace(/\s+/g, ' ').replace(/^[\s-]+|[\s-]+$/g, '');
    return /[؀-ۿ]|\d{4}/.test(stem) ? stem : '';
  }
  function categoryFromName(name) {
    name = String(name || '').trim();
    if (!name) return 'امتحان غير محدد';
    return name.indexOf('امتحان') === 0 ? name : 'امتحان ' + name;
  }

  var api = {
    analyze: analyze, splitInlineOptions: splitInlineOptions, csvFiles: csvFiles, similarity: similarity, makeXlsx: makeXlsx, PROFILES: PROFILES,
    blocksFromXml: blocksFromXml, blocksFromText: blocksFromText, examNameFromFilename: examNameFromFilename,
    categoryFromName: categoryFromName, LETTERS: LETTERS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QParser = api;
})(typeof window !== 'undefined' ? window : this);
