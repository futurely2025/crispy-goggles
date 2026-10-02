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
  var BULLET = /^[•·▪●◦*\-–]+\s*/;
  var FIELDS = [
    ['ans', /^(?:ال)?[إا]جابة(?:\s+الصحيحة)?\s*[:：]\s*/],
    ['corr', /^تصحيح\s+الخطأ\s*[:：]\s*/],
    ['shrah', /^(?:ال)?شرح\s*[:：]\s*/],
    ['expl', /^(?:ال)?توضيح(?:\s+العلمي)?\s*[:：]\s*/],
    ['src', /^(?:ال)?مصدر\s*[:：]\s*/],
    ['time', /^الوقت[^:：]*[:：]\s*/],
    ['diff', /^صعوبة[^:：]*[:：]\s*/]
  ];
  var OPT_LINE = /^\(?\s*(أ|ب|ج|د|هـ|ه)\s*[)\-.ـ]+\s*([\s\S]*)$/;
  var TF_ANS = /^\(?\s*(صح|صحيحة|صحيح|خطأ|خطا|خاطئة|خاطئ)\s*\)?\s*\.?$/;

  function fieldOf(line) {
    for (var i = 0; i < FIELDS.length; i++) {
      var m = FIELDS[i][1].exec(line);
      if (m) return [FIELDS[i][0], line.slice(m[0].length).trim()];
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

  function collectGroups(blocks) {
    var items = [], cur = null;
    function flush() { if (cur) { items.push({ k: 'q', g: cur }); cur = null; } }
    blocks.forEach(function (b) {
      if (b.k === 't') { flush(); items.push({ k: 't', rows: b.rows }); return; }
      var full = b.runs.join('');
      var lines = full.split('\n');
      lines.forEach(function (raw) {
        var line = cleanWs(raw), runs = lines.length === 1 ? b.runs : [raw];
        if (!line || SEP.test(line) || SECTION.test(line)) return;
        var m = Q_START.exec(line);
        if (m && !fieldOf(line.replace(BULLET, ''))[0]) {
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
      q.ans = norm(ans).indexOf('صح') === 0 ? 'صح' : 'خطأ';
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
  function buildResults(qs, category) {
    var tf = [], mcq = [], errors = [];
    qs.forEach(function (q) {
      var f = q.f;
      if (q.kind === 'tf') {
        var missing = [];
        if (!q.stem) missing.push('نص السؤال');
        if (!q.ans) missing.push('الإجابة');
        if (!f.shrah) missing.push('الشرح');
        if (!f.expl) missing.push('التوضيح العلمي');
        if (!f.src) missing.push('المصدر');
        if (!f.time) missing.push('الوقت المثالي');
        if (!f.diff) missing.push('صعوبة السؤال');
        if (q.ans === 'خطأ' && !f.corr) missing.push('تصحيح الخطأ (مطلوب لأن الإجابة خطأ)');
        if (missing.length) {
          errors.push({ num: q.num, q: q.stem.length > 80 ? q.stem.slice(0, 80) + '...' : q.stem, missing: missing });
          return;
        }
        var dm = /(سهل|متوسط|صعب)/.exec(f.diff);
        tf.push({
          type: 'tf', num: q.num, question: q.stem, correct_answer: q.ans, shrah: cleanWs(f.shrah), src: cleanWs(f.src),
          time: trimDot(f.time), corr: q.ans === 'خطأ' ? cleanWs(f.corr) : '', explanation: cleanWs(f.expl),
          difficulty: dm ? dm[1] : trimDot(f.diff), category: category, warn: q.warn
        });
      } else {
        mcq.push({
          type: 'mcq', num: q.num, question: q.stem, correct_answer: q.ans,
          options: [0, 1, 2, 3, 4].map(function (i) {
            var at = q.letters ? q.letters.indexOf(LETTERS[i]) : i;
            return at >= 0 && q.options[at] ? trimDot(q.options[at]) : '';
          }),
          shrah: cleanWs(f.shrah || ''), src: cleanWs(f.src || ''), time: trimDot(f.time || ''),
          explanation: cleanWs(f.expl || ''), difficulty: f.diff ? trimDot(f.diff).split(/\s+/)[0] : 'غير محدد',
          category: category, warn: q.warn, conf: q.conf
        });
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
  function analyze(blocks, category) {
    var items = collectGroups(blocks), qs = [];
    items.forEach(function (it) {
      if (it.k === 'q') qs.push(convertGroup(it.g));
      else convertTable(it.rows).forEach(function (q) { qs.push(q); });
    });
    var res = buildResults(qs, category || 'امتحان غير محدد');
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
  function tfRow(r) {
    return { mark: 1, question: r.question, correct_answer: r.correct_answer, description: '● الشرح 🎯: ' + r.shrah + '\n   ',
      correction: r.corr, explanation: r.explanation, perfect_time: '⏰ ' + r.time, lesson: 'المصدر 🔍📚: ' + r.src,
      category: r.category, difficulty: r.difficulty };
  }
  function mcqRow(r) {
    return { question: r.question, correct_answer: r.correct_answer, option_1: r.options[0], option_2: r.options[1],
      option_3: r.options[2], option_4: r.options[3], option_5: r.options[4], description: '● الشرح 🎯: ' + r.shrah + '\n     ',
      correction: '', explanation: r.explanation, perfect_time: '⏰ ' + r.time, lesson: 'المصدر 🔍📚: ' + r.src,
      category: r.category, difficulty: r.difficulty };
  }
  var TF_COLS = ['mark', 'question', 'correct_answer', 'description', 'correction', 'explanation', 'perfect_time', 'lesson', 'category', 'difficulty'];
  var MCQ_COLS = ['question', 'correct_answer', 'option_1', 'option_2', 'option_3', 'option_4', 'option_5', 'description', 'correction', 'explanation', 'perfect_time', 'lesson', 'category', 'difficulty'];
  var ALL_COLS = TF_COLS.concat(['option_1', 'option_2', 'option_3', 'option_4', 'option_5']);

  function csvFiles(res, category) {
    function setCat(r) { r.category = category; return r; }
    var tf = res.tf.map(function (r) { return tfRow(setCat(r)); });
    var mcq = res.mcq.map(function (r) { return mcqRow(setCat(r)); });
    var nTf = res.tf.length, keptTf = [], keptMcq = [];
    res.kept.forEach(function (i) { if (i < nTf) keptTf.push(tf[i]); else keptMcq.push(mcq[i - nTf]); });
    return {
      tf: toCsv(TF_COLS, tf), mcq: toCsv(MCQ_COLS, mcq),
      all: toCsv(ALL_COLS, tf.concat(mcq)), clean: toCsv(ALL_COLS, keptTf.concat(keptMcq))
    };
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
    analyze: analyze, splitInlineOptions: splitInlineOptions, csvFiles: csvFiles, similarity: similarity,
    blocksFromXml: blocksFromXml, blocksFromText: blocksFromText, examNameFromFilename: examNameFromFilename,
    categoryFromName: categoryFromName, LETTERS: LETTERS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QParser = api;
})(typeof window !== 'undefined' ? window : this);
