/*
 * exam-core.js — reads a Word file of past-year exam questions and rebuilds it
 * inside the unified exam template (cover page, instructions, running header,
 * "س N)" questions with أ) ب) ج) د) options).
 *
 * Works in the browser (task pane) and in Node (tests / command line):
 *   const exam = ExamCore.parseExam(lines);
 *   const bytes = await ExamCore.buildDocx(JSZip, templateBytes, exam, options);
 *
 * Output is a regular .docx made from the template package itself, so Word
 * shows exactly the template formatting and Word's own "save as PDF" gives a
 * PDF identical to the Word file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ExamCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'];

  // ------------------------------------------------------------------ reading
  function decodeXml(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); })
      .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); })
      .replace(/&amp;/g, '&');
  }

  /** Paragraph texts of a .docx (JSZip instance already loaded) plus feature flags. */
  async function readDocxParagraphs(zip) {
    var f = zip.file('word/document.xml');
    if (!f) throw new Error('الملف ليس مستند Word صالحاً');
    var xml = await f.async('string');
    var body = xml.slice(xml.indexOf('<w:body'));
    var paras = body.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
    var lines = paras.map(function (p) {
      var out = '';
      var lv = /<w:ilvl w:val="(\d+)"/.exec(p), isList = /<w:numPr>/.test(p), ind = /<w:ind [^>]*?w:(?:left|start)="(\d+)"/.exec(p);
      var depth = Math.max(lv ? +lv[1] : 0, ind ? Math.round(+ind[1] / 720) : 0, isList ? 0 : 0);
      var lead = depth ? new Array(depth * 3 + 1).join(' ') : '';
      p.replace(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g, function (m, t) {
        out += t === undefined ? ' ' : decodeXml(t);
        return m;
      });
      if (isList && out.trim() && !/^\s*[•▪●◦o*\-–]\s/.test(out)) out = '• ' + out.trim();   // Word list bullets carry no text marker
      return out.trim() ? lead + out : out;
    });
    // pictures per paragraph (so a picture under a question is placed under it in the new paper)
    var rels = {}, relFile = zip.file('word/_rels/document.xml.rels');
    if (relFile) (await relFile.async('string')).replace(/<Relationship\b[^>]*>/g, function (r) {
      var id = /\bId="([^"]+)"/.exec(r), tg = /\bTarget="([^"]+)"/.exec(r);
      if (id && tg && /image/i.test(r)) rels[id[1]] = tg[1].replace(/^\//, '').replace(/^word\//, '');
      return r;
    });
    var images = [];
    for (var pi = 0; pi < paras.length; pi++) {
      var found = [], px = paras[pi], mm, reB = /<a:blip\b[^>]*?r:embed="([^"]+)"|<v:imagedata\b[^>]*?r:id="([^"]+)"/g;
      var ext = /<wp:extent\b[^>]*?cx="(\d+)"[^>]*?cy="(\d+)"/.exec(px);
      while ((mm = reB.exec(px))) {
        var tg2 = rels[mm[1] || mm[2]], fl = tg2 && zip.file('word/' + tg2);
        if (!fl) continue;
        found.push({ data: await fl.async('uint8array'), ext: (/\.([A-Za-z0-9]+)$/.exec(tg2) || [0, 'png'])[1].toLowerCase(), cx: ext ? +ext[1] : 0, cy: ext ? +ext[2] : 0 });
      }
      images.push(found.length ? found : null);
    }
    return {
      lines: lines,
      images: images,
      hasImages: /<w:drawing|<w:pict/.test(body),
      hasMath: /<m:oMath/.test(body),
      hasTables: /<w:tbl>/.test(body)
    };
  }

  // ------------------------------------------------------------------ parsing
  var RE_SEP = /^[-–—_=*\s]{6,}$/;
  var RE_Q = /^س\s*(\d+)\s*[\)\-.:]\s*(.*)$/;
  var RE_GROUP = /^(?:جدول\s+)?المزاوجة.*?س\s*(\d+)\s*[-–—]\s*س?\s*(\d+)|^س\s*(\d+)\s*(?:إلى|الى|[-–—])\s*س?\s*(\d+)\s*[\)\:](?!.*(?:⟵|⟶|←|→|⇒|⇐|⟸|⟹|↔|->|=>|<-))/;   // any heading "س51 - س55) صل كل مصطلح بما يناسبه:" (no arrow in it)
  var RE_OPT = /^\(?\s*(أ|ا|ب|ج|د|هـ|ه|و|[A-F])\s*[\)\.\-]\s*(.*)$/;
  var RE_META = /^(الإجابة|الاجابة|الشرح|التوضيح|المصدر|الوقت المثالي[^:]*|صعوبة السؤال|تصحيح الخطأ|خطوات الحل|الفكرة الأساسية|ترجمة السؤال|ترجمة|ملاحظة إضافية|ملاحظة تعليمية|ملاحظة|ملاحظات)\s*[:：]\s*(.*)$/;
  var META_KEYS = { 'الإجابة': 'answerText', 'الاجابة': 'answerText', 'الشرح': 'explanation', 'التوضيح': 'clarification',
    'المصدر': 'source', 'الوقت': 'time', 'صعوبة السؤال': 'difficulty', 'تصحيح الخطأ': 'correction', 'ملاحظة': 'note', 'ملاحظات': 'note',
    'خطوات الحل': 'steps', 'الفكرة الأساسية': 'idea', 'ترجمة السؤال': 'translation', 'ترجمة': 'translation', 'ملاحظة إضافية': 'note', 'ملاحظة تعليمية': 'note' };
  var RE_NOTE = /\s*\(([^()]*(?:غير موجود|خارج المنهج)[^()]*)\)\s*/g;

  function norm(s) {
    return String(s || '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه').replace(/[\s ]+/g, ' ').replace(/[()\[\].،,:؛؟?!"«»]/g, '').trim();
  }

  function stripNotes(text, n, warnings) {
    return text.replace(RE_NOTE, function (m, note) {
      warnings.push('س' + n + ': حُذفت ملاحظة المراجع من النص: (' + note.trim() + ')');
      return ' ';
    }).replace(/\s{2,}/g, ' ').trim();
  }

  function letterIndex(l) {
    var map = { 'أ': 0, 'ا': 0, 'ب': 1, 'ج': 2, 'د': 3, 'هـ': 4, 'ه': 4, 'و': 5, 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5, 'a': 0, 'b': 1, 'c': 2, 'd': 3 };
    return Object.prototype.hasOwnProperty.call(map, l) ? map[l] : -1;
  }

  /**
   * lines → { questions: [{n,type,text,options,answerIndex,answerText}], warnings }
   * type: 'tf' | 'mcq' | 'match' (one entry per group, with pairs) | 'open'
   */
  function decodeEntities(t) {                          // text copied from a web page: &#39; &quot; &amp; …
    if (t.indexOf('&') < 0) return t;
    return t.replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); })
      .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCharCode(parseInt(n, 16)); })
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  }

  /** "text (أ) a (ب) b (ج) c" on one line → ["text", "(أ) a", "(ب) b", "(ج) c"] */
  function splitInline(line) {
    var re = /\(\s*(أ|ب|ج|د|هـ|[A-E])\s*\)/g, ms = [], m;
    while ((m = re.exec(line))) ms.push({ i: m.index, l: m[1] });
    if (ms.length < 2) return [line];
    var seqA = ['أ', 'ب', 'ج', 'د', 'هـ'], seqL = ['A', 'B', 'C', 'D', 'E'];
    var seq = ms[0].l === 'أ' ? seqA : ms[0].l === 'A' ? seqL : null;
    if (!seq || ms[1].l !== seq[1]) return [line];
    var cuts = [], k = 0;
    ms.forEach(function (x) { if (x.l === seq[k]) { cuts.push(x.i); k++; } });
    var out = [line.slice(0, cuts[0]).trim()];
    cuts.forEach(function (c, i) { out.push(line.slice(c, i + 1 < cuts.length ? cuts[i + 1] : undefined).trim()); });
    return out.filter(function (x) { return x; });
  }

  function parseExam(lines, imgs) {
    var warnings = [];
    var items = [];       // in source order
    var cur = null;       // question or group being read
    var afterMeta = false;
    var curLi = 0;
    var metaKey = '', indent = 0;     // last meta field, so wrapped lines of الشرح/التوضيح continue it

    function finish() {
      if (!cur) return;
      ['explanation', 'clarification', 'steps', 'idea', 'translation', 'correction', 'note', 'source'].forEach(function (k) { if (typeof cur[k] === 'string') cur[k] = cur[k].replace(/^[\s\n]+|[\s\n]+$/g, ''); });
      ['time', 'difficulty'].forEach(function (k) { if (typeof cur[k] === 'string') cur[k] = cur[k].replace(/[\s.。]+$/, ''); });
      items.push(cur);
      cur = null;
      afterMeta = false;
      metaKey = '';
    }

    function addImages(list, li) {
      if (!list || !list.length) return;
      if (!cur) { warnings.push('صورة قبل أول سؤال تم تجاهلها.'); return; }
      if (afterMeta) { warnings.push('صورة داخل الحل/الشرح تم تجاهلها (تُنقل الصور التي تحت نص السؤال فقط).'); return; }
      cur.images = (cur.images || []).concat(list);
    }
    lines.forEach(function (raw, li) {
      curLi = li;
      var line = decodeEntities(String(raw)).replace(/[‎‏‪-‮]/g, '').replace(/\s+/g, ' ').trim();
      indent = (/^[\s‎‏]*/.exec(String(raw))[0].replace(/\t/g, '    ')).length;
      if (imgs && imgs[li]) addImages(imgs[li], li);
      if (!line) return;
      var stripped = line.replace(/^[*•▪●\-–]\s+/, '');           // "* الإجابة: …" / "* (أ) …" at the left margin are plain lines
      if (/^الدفعة\s/.test(line) && !/[:：]\s*\S/.test(line.replace(/\([^)]*\)/g, ''))) { finish(); return; }   // "الدفعة الأولى (س 51 إلى س 55):" batch caption
      if (stripped !== line && cur && cur.type === 'match' && RE_Q.test(stripped)) line = stripped;      // indented "* س 51) a ⟵ b" pair lines
      if (stripped !== line && indent < 2 && (RE_META.test(stripped) || RE_OPT.test(stripped) || RE_Q.test(stripped) || RE_GROUP.test(stripped) || /^DONE$/i.test(stripped))) line = stripped;
      if (RE_SEP.test(line) || /^DONE$/i.test(line)) { finish(); return; }
      if ((RE_Q.test(line) || !afterMeta) && !(cur && cur.type === 'match')) {
        var parts = splitInline(line);
        if (parts.length > 1) { parts.forEach(function (x) { feed(x); }); return; }
      }
      feed(line);
    });
    finish();
    function bodyFollows() {                             // a skipped number ("س3" after "س1") still starts a question when options or an answer line come next
      for (var j = curLi + 1; j < lines.length; j++) {
        var t = decodeEntities(String(lines[j])).replace(/\s+/g, ' ').trim().replace(/^[*•▪●\-–]\s+/, '');
        if (!t) continue;
        var mm = RE_META.exec(t);
        return RE_OPT.test(t) || !!(mm && META_KEYS[mm[1]] === 'answerText');
      }
      return false;
    }
    function nextIsPair() {                              // "->" is also ordinary text, so it only starts a group when the next line is a pair too
      for (var j = curLi + 1; j < lines.length; j++) {
        var t = decodeEntities(String(lines[j])).replace(/\s+/g, ' ').trim().replace(/^[*•▪●\-–]\s+/, '');
        if (!t) continue;
        var m = RE_Q.exec(t);
        return !!m && /(?:->|→|⟶|⟵|←|⇒|⇐|⟸|⟹|↔|—>|=>|<-)/.test(m[2]);
      }
      return false;
    }
    function feed(line) {

      var g = RE_GROUP.exec(line);
      if (g) {
        finish();
        cur = { type: 'match', from: +(g[1] || g[3]), to: +(g[2] || g[4]), pairs: [], title: line, explanation: '', clarification: '', source: '', time: '', difficulty: '', note: '', steps: '', idea: '', translation: '' };
        return;
      }
      var q = RE_Q.exec(line);
      if (q) {                                           // a matching group whose heading line is missing: recognised from the "س56) a ⟵ b" lines themselves
        var ARR = /\s*(?:->|→|⟶|⟵|←|⇒|⇐|⟸|⟹|↔|—>|=>|<-)\s*/, hasArrow = ARR.test(q[2]), uni = /[⟶⟵←→⇒⇐⟸⟹↔]/.test(q[2]) || (hasArrow && nextIsPair());
        var sides = q[2].split(ARR), bothSides = sides.length >= 2 && sides[0].trim() && sides.slice(1).join('').trim();      // "…مع كبريتات النحاس ←" ends in an arrow but is a question, not a pair
        if (hasArrow && bothSides && ((cur && cur.type === 'match' && afterMeta) || (uni && (!cur || cur.type !== 'match')))) {
          finish();
          cur = { type: 'match', implicit: true, from: +q[1], to: +q[1], pairs: [], title: '(مجموعة وصل بلا سطر عنوان)', explanation: '', clarification: '', source: '', time: '', difficulty: '', note: '', steps: '', idea: '', translation: '' };
          var pr = q[2].split(ARR);
          cur.pairs.push({ n: +q[1], left: pr[0].trim(), right: pr.slice(1).join(' -> ').trim() });
          return;
        }
      }
      var lastPair = cur && cur.type === 'match' && cur.pairs.length ? cur.pairs[cur.pairs.length - 1].n : -1;
      if (q && (!afterMeta || (cur && cur.type !== 'match' && (+q[1] === cur.n + 1 || (+q[1] > cur.n && bodyFollows()))) || (cur && cur.type === 'match' && +q[1] === lastPair + 1))) {   // the next number starts a new question even without a separator line
        var num = +q[1];
        var body = q[2];
        if (cur && cur.type === 'match') {
          var arrow = body.split(/\s*(?:->|→|⟶|⟵|←|⇒|⇐|⟸|⟹|↔|—>|=>|<-)\s*/);
          if (arrow.length >= 2 && arrow[0].trim() && arrow.slice(1).join('').trim()) {
            cur.pairs.push({ n: num, left: arrow[0].trim(), right: arrow.slice(1).join(' -> ').trim() });
            return;
          }
          if (afterMeta || (cur.pairs.length && num === lastPair + 1)) { /* not a pair: the next question after the group */ }
          else { warnings.push('س' + num + ': سطر مزاوجة بلا سهم (->) وتم تجاهله.'); return; }
        }
        finish();
        cur = { type: 'open', n: num, text: body, options: [], answerText: '', correction: '',
          explanation: '', clarification: '', source: '', time: '', difficulty: '', note: '', steps: '', idea: '', translation: '' };
        return;
      }
      if (!cur) return;
      var m = RE_META.exec(line);
      if (m) {
        afterMeta = true;
        var key = META_KEYS[/^الوقت/.test(m[1]) ? 'الوقت' : m[1]];
        metaKey = key || '';
        var val = m[2].trim();
        if (key === 'time') {                                // "الوقت … 15 ثانية. صعوبة السؤال: متوسط" on one line
          var dm = /\s+صعوبة السؤال\s*[:：]\s*(.*)$/.exec(val);
          if (dm) { val = val.slice(0, dm.index).trim(); cur.difficulty = dm[1].trim(); }
        }
        if (key && (cur.type !== 'match' || key !== 'answerText')) cur[key] = (key === 'note' && cur.note) ? cur.note + ' ' + val : val;
        return;
      }
      if (afterMeta && metaKey && metaKey !== 'answerText') {   // wrapped explanation lines
        var bm = /^(?:[oO•▪●◦\-–*]\s+)(.*)$/.exec(line), nm = /^\d+\s*[\.\)]\s*\S/.test(line);
        var LIST = { steps: 1, idea: 1, explanation: 1, clarification: 1, correction: 0 };
        var deep = indent >= 5, pre = deep ? '\u00A0\u00A0\u00A0\u00A0' : '';     // second-level bullets are indented
        cur[metaKey] = LIST[metaKey] && (bm || nm) ? cur[metaKey] + '\n' + pre + (bm ? (deep ? '◦ ' : '• ') + bm[1] : line) : (cur[metaKey] + ' ' + line).trim();
        return;
      }
      if (afterMeta || cur.type === 'match') return;
      var o = RE_OPT.exec(line);
      if (o) { cur.options.push({ letter: o[1], text: o[2].trim() }); return; }
      if (!cur.options.length) cur.text += ' ' + line;       // wrapped question text
      else cur.options[cur.options.length - 1].text += ' ' + line;
    }

    var questions = [];
    items.forEach(function (it) {
      if (it.type === 'match') {
        if (!it.pairs.length) { warnings.push('مجموعة مزاوجة بلا أزواج: ' + it.title); return; }
        var nums = it.pairs.map(function (p) { return p.n; }), lo = nums[0], hi = nums[nums.length - 1];
        var tag = 'مزاوجة س' + lo + '–س' + hi;
        if (it.implicit) warnings.push(tag + ': لا يوجد سطر عنوان قبلها («س ' + lo + ' إلى س ' + hi + ') أسئلة المزاوجة»)، فاعتُبرت الأسطر مجموعة وصل تلقائياً؛ راجع الحدود.');
        else if (it.to - it.from + 1 !== it.pairs.length) warnings.push(tag + ': العنوان يذكر ' + (it.to - it.from + 1) + ' أسئلة (س' + it.from + '–س' + it.to + ') لكن وُجد ' + it.pairs.length + ' أزواج؛ راجع الأسطر الناقصة أو الزائدة.');
        nums.forEach(function (n, i) { if (i && n !== nums[i - 1] + 1) warnings.push(tag + ': ترقيم غير متسلسل عند س' + n + '.'); });
        var seenR = {};
        it.pairs.forEach(function (p) {
          if (!p.left || !p.right) warnings.push(tag + ': س' + p.n + ' ينقصه أحد الطرفين.');
          var kR = norm(p.right); if (kR && seenR[kR]) warnings.push(tag + ': س' + p.n + ' و س' + seenR[kR] + ' لهما الإجابة نفسها.'); else if (kR) seenR[kR] = p.n;
        });
        it.from = lo; it.to = hi;
        it.pairs.forEach(function (p) {
          p.left = stripNotes(p.left, p.n, warnings);
          p.right = stripNotes(p.right, p.n, warnings);
        });
        questions.push(it);
        return;
      }
      it.text = stripNotes(it.text, it.n, warnings);
      it.options.forEach(function (op) { op.text = stripNotes(op.text, it.n, warnings); });
      var ans = norm(it.answerText);
      if (it.options.length >= 2) {
        it.type = 'mcq';
        it.answerIndex = -1;
        var lm = /^\(?\s*(أ|ا|ب|ج|د|هـ|ه|و|[A-Fa-f])\s*[\)\.]?$/.exec(it.answerText.trim());
        if (lm) it.answerIndex = letterIndex(lm[1]);
        if (it.answerIndex < 0) {
          for (var k = 0; k < it.options.length; k++) {
            if (norm(it.options[k].text) === ans) { it.answerIndex = k; break; }
          }
        }
        if (it.answerIndex < 0 && it.answerText) warnings.push('س' + it.n + ': تعذّر ربط الإجابة بأحد الخيارات.');
      } else if (/^(صح|صحيح|خطأ|خطا|true|false)$/i.test(ans) || (!it.options.length && /^(صح|خطأ|true|false)\b/i.test(it.answerText))) {
        it.type = 'tf';
        it.tfEn = /^(true|false)/i.test(ans) || /^(true|false)\b/i.test(it.answerText);
        it.answerIndex = /^(صح|صحيح|true)/i.test(ans) || /^true\b/i.test(it.answerText) ? 0 : 1;
      } else if (!it.options.length && !it.answerText) {
        it.type = 'tf';              // no answer given: assume true/false only when it reads like a statement
        it.answerIndex = -1;
        warnings.push('س' + it.n + ': لا توجد إجابة في الملف فاعتُبر السؤال صح/خطأ.');
      } else {
        it.type = 'open';
      }
      questions.push(it);
    });
    return { questions: questions, warnings: warnings };
  }

  // ------------------------------------------------------------------ writing
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function rpr(bold, rtl) {
    return '<w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Times New Roman" w:hAnsi="Arial" w:cs="Fanan"/>' +
      (bold ? '<w:b/><w:bCs/>' : '') + '<w:kern w:val="0"/><w:sz w:val="22"/><w:szCs w:val="22"/>' +
      (rtl ? '<w:rtl/>' : '') + '<w14:ligatures w14:val="none"/></w:rPr>';
  }

  /** Text → runs: Latin/digit sequences are LTR runs, everything else RTL (as Word does). */
  function runs(text, bold, ltr) {
    if (ltr) return '<w:r>' + rpr(bold, false) + '<w:t xml:space="preserve">' + esc(String(text)) + '</w:t></w:r>';
    var out = '';
    var parts = String(text).split(/([A-Za-z0-9][A-Za-z0-9.,%+\-=×÷/^_ '’]*[A-Za-z0-9%][.?!]*|[A-Za-z0-9])/);
    parts.forEach(function (p, i) {
      if (!p) return;
      var ltr = i % 2 === 1;
      out += '<w:r>' + rpr(bold, !ltr) + '<w:t xml:space="preserve">' + esc(p) + '</w:t></w:r>';
    });
    return out;
  }

  function para(inner, opts) {
    opts = opts || {};
    return '<w:p><w:pPr>' + (opts.keepNext ? '<w:keepNext/>' : '') + (opts.ltr ? '' : '<w:bidi/>') +
      '<w:spacing w:after="100" w:afterAutospacing="1" w:line="' + (opts.line || 240) + '" w:lineRule="auto"/>' +
      (opts.jc ? '<w:jc w:val="' + opts.jc + '"/>' : '') + rpr(!!opts.bold, false).replace('<w:rtl/>', '') +
      '</w:pPr>' + inner + '</w:p>';
  }

  function heading(text) {
    return '<w:p><w:pPr><w:keepNext/><w:bidi/><w:spacing w:before="120" w:line="360" w:lineRule="auto"/>' +
      rpr(true, false).replace('<w:rtl/>', '') + '</w:pPr>' + runs(text + ':', true) + '</w:p>';
  }

  function questionPara(n, text, ltr) {
    return para(runs((ltr ? 'Q ' : 'س ') + n + ') ' + text, true, ltr), { keepNext: true, bold: true, ltr: ltr });
  }

  function optionPara(numId, text, last, ltr) {
    return '<w:p><w:pPr><w:pStyle w:val="ListParagraph"/>' + (last ? '' : '<w:keepNext/>') +
      '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="' + numId + '"/></w:numPr>' + (ltr ? '' : '<w:bidi/>') +
      '<w:spacing w:after="100" w:afterAutospacing="1" w:line="' + (last ? 240 : 360) + '" w:lineRule="auto"/>' +
      (last ? '' : '<w:contextualSpacing w:val="0"/>') + rpr(false, false).replace('<w:rtl/>', '') +
      '</w:pPr>' + runs(text + ' ', false, ltr) + '</w:p>';
  }

  function cell(inner, w, fill) {
    return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + fill + '"/>' : '') + '</w:tcPr>' + inner + '</w:tc>';
  }

  function rng(seed) {                 // mulberry32 — same input, same shuffle
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(n, seed) {
    var idx = [], r = rng(seed), i, j, t;
    for (i = 0; i < n; i++) idx.push(i);
    for (var tries = 0; tries < 20; tries++) {
      for (i = n - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
      if (n < 2 || idx.some(function (v, k) { return v !== k; })) break;
    }
    return idx;
  }

  var SOFT = ['D9EEFA', 'FADCE7', 'DDF3E4', 'E7E0F6', 'FDEBD3'];
  function matchBlock(group, firstNo, seed, soft, en, ltr) {
    var pairs = group.pairs;
    var order = shuffled(pairs.length, seed);          // order[k] = which pair's answer sits at slot k
    var rows = '';
    var border = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (s) {
      return '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="auto"/>';
    }).join('') + '</w:tblBorders>';
    var W = 3400;
    // "keep with next" on every paragraph but the last row's chains heading + all rows together,
    // so the group is never split: if it does not fit in the rest of the page it starts on a new page.
    rows += '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + cell(para(runs(en ? 'Column 1' : 'العمود الأول', true, ltr), { bold: true, jc: 'center', keepNext: true, ltr: ltr }), W) +
      cell(para(runs(en ? 'Column 2' : 'العمود الثاني', true, ltr), { bold: true, jc: 'center', keepNext: true, ltr: ltr }), W) + '</w:tr>';
    for (var k = 0; k < pairs.length; k++) {
      var kn = k < pairs.length - 1;
      rows += '<w:tr><w:trPr><w:cantSplit/></w:trPr>' +
        cell(para(runs((ltr ? 'Q ' : 'س ') + (firstNo + k) + ') ' + pairs[k].left, false, ltr), { keepNext: kn, ltr: ltr }), W, soft && soft[k % soft.length]) +
        cell(para(runs((ltr ? 'ABCDEF'.charAt(k) : LETTERS[k]) + ') ' + pairs[order[k]].right, false, ltr), { keepNext: kn, ltr: ltr }), W, soft && soft[order[k] % soft.length]) + '</w:tr>';
    }
    var answers = pairs.map(function (p, i) { return order.indexOf(i); });   // question i → slot letter
    return {
      xml: para(runs(en ? 'Match the items in Column 1 with Column 2 (write the correct letter):' : 'صل بين عبارات العمود الأول وما يناسبها من العمود الثاني (اكتب الحرف المناسب):', true, ltr),
        { keepNext: true, bold: true, ltr: ltr }) +
        '<w:tbl><w:tblPr>' + (ltr ? '' : '<w:bidiVisual/>') + '<w:tblW w:w="' + (W * 2) + '" w:type="dxa"/><w:jc w:val="center"/>' + border +
        '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>' +
        '<w:bottom w:w="40" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
        '<w:tblGrid><w:gridCol w:w="' + W + '"/><w:gridCol w:w="' + W + '"/></w:tblGrid>' + rows + '</w:tbl>' +
        para(''),
      answers: answers
    };
  }

  /** Word may split a {{TOKEN}} over several runs after the user edits near it; glue them back. */
  function normalizeTokens(xml) {
    var re = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g, items = [], m;
    while ((m = re.exec(xml))) items.push({ start: m.index, end: re.lastIndex, text: m[1] });
    var out = xml, edits = [];
    for (var i = 0; i < items.length; i++) {
      var t = items[i].text, o = t.lastIndexOf('{{');
      if (o < 0 || t.indexOf('}}', o) >= 0) continue;
      var joined = t, j = i + 1;
      while (j < items.length && joined.indexOf('}}', o) < 0 && j - i < 12) { joined += items[j].text; j++; }
      if (joined.indexOf('}}', o) < 0) continue;
      edits.push({ from: i, to: j - 1, text: joined });
      i = j - 1;
    }
    for (var k = edits.length - 1; k >= 0; k--) {          // right to left keeps offsets valid
      var e = edits[k];
      for (var n = e.to; n >= e.from; n--) {
        out = out.slice(0, items[n].start) + (n === e.from ? '<w:t xml:space="preserve">' + e.text + '</w:t>' : '<w:t></w:t>') + out.slice(items[n].end);
      }
    }
    return out;
  }

  var BODY_PARA = /<w:p(?: [^>]*)?>(?:(?!<\/w:p>)[\s\S])*?\{\{BODY\}\}[\s\S]*?<\/w:p>/;


  // ------------------------------------------------------------ block templates
  // A template may carry its own layout for each kind of item, designed in Word:
  //   [[DEFINITIONS]] ... [[BLOCK MCQ]] paragraphs with {{Q_NO}} {{Q_TEXT}} ... [[END]] ... [[/DEFINITIONS]]
  // The region is removed from the output; its paragraphs are filled and repeated per question.
  var P_ALL = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g;
  var OPTIONAL_TOKENS = { ANSWER: 1, ANSWER_TEXT: 1, ANSWER_FULL: 1, CORRECTION: 1, EXPLANATION: 1, CLARIFICATION: 1, SOURCE: 1, TIME: 1, DIFFICULTY: 1, NOTE: 1, MATCH_KEY: 1, STEPS: 1, IDEA: 1, TRANSLATION: 1, Q_IMAGE: 1 };
  var BLOCK_NAMES = ['HEADING', 'TF', 'MCQ', 'OPEN', 'MATCH_KEY'];

  function paraText(p) {
    var t = p.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) || [];
    return decodeXml(t.map(function (x) { return x.replace(/<[^>]+>/g, ''); }).join(''));
  }

  function extractBlocks(doc) {
    var paras = [], m, warnings = [], blocks = {};
    P_ALL.lastIndex = 0;
    while ((m = P_ALL.exec(doc))) paras.push({ s: m.index, e: P_ALL.lastIndex, x: m[0], t: paraText(m[0]).trim() });
    var a = -1, b = -1;
    paras.forEach(function (p, i) { if (a < 0 && /^\[\[DEFINITIONS\]\]$/.test(p.t)) a = i; if (/^\[\[\/DEFINITIONS\]\]$/.test(p.t)) b = i; });
    if (a < 0) return { doc: doc, blocks: blocks, warnings: warnings };
    if (b < a) { b = paras.length - 1; warnings.push('لم يُغلق [[/DEFINITIONS]]'); }
    var cur = null;
    for (var i = a + 1; i < b; i++) {
      var bm = /^\[\[BLOCK\s+([A-Z_]+)\]\]$/.exec(paras[i].t);
      if (bm) {
        if (BLOCK_NAMES.indexOf(bm[1]) < 0) warnings.push('اسم كتلة غير معروف: ' + bm[1]);
        cur = bm[1]; blocks[cur] = []; continue;
      }
      if (/^\[\[END\]\]$/.test(paras[i].t)) { cur = null; continue; }
      if (cur) blocks[cur].push(paras[i].x);
    }
    var out = doc.slice(0, paras[a].s) + doc.slice(paras[b].e);
    return { doc: out, blocks: blocks, warnings: warnings };
  }

  function insertAt(xml, names, add) {
    var best = -1;
    names.forEach(function (n) { var i = xml.indexOf(n); if (i >= 0 && (best < 0 || i < best)) best = i; });
    return best < 0 ? xml + add : xml.slice(0, best) + add + xml.slice(best);
  }
  function ensureRtl(rPr) {
    if (/<w:rtl\/>/.test(rPr)) return rPr;
    if (!rPr) return '<w:rPr><w:rtl/></w:rPr>';
    var inner = rPr.replace(/^<w:rPr>|<\/w:rPr>$/g, '');
    return '<w:rPr>' + insertAt(inner, ['<w:cs/>', '<w:em ', '<w:lang', '<w:eastAsianLayout', '<w:specVanish', '<w:oMath', '<w14:'], '<w:rtl/>') + '</w:rPr>';
  }
  function valueRuns(open, rPr, value) {
    var out = '';
    if (/\n/.test(value)) {
      String(value).split('\n').forEach(function (ln, i) {
        if (i) out += open + rPr + '<w:br/></w:r>';
        out += valueRuns(open, rPr, ln);
      });
      return out;
    }
    String(value).split(/([A-Za-z0-9][A-Za-z0-9.,%+\-=×÷/^_ '’]*[A-Za-z0-9%][.?!]*|[A-Za-z0-9])/).forEach(function (seg, i) {
      if (!seg) return;
      var ltr = i % 2 === 1, rp = ltr ? rPr.replace(/<w:rtl\/>/g, '') : ensureRtl(rPr);
      out += open + rp + '<w:t xml:space="preserve">' + esc(seg) + '</w:t></w:r>';
    });
    return out;
  }
  function addKeepNext(p) {
    if (/<w:keepNext\/>/.test(p)) return p;
    if (/<w:pPr>/.test(p)) {
      if (/<w:pPr><w:pStyle [^>]*\/>/.test(p)) return p.replace(/(<w:pPr><w:pStyle [^>]*\/>)/, '$1<w:keepNext/>');
      return p.replace('<w:pPr>', '<w:pPr><w:keepNext/>');
    }
    return p.replace(/^(<w:p(?: [^>]*)?>)/, '$1<w:pPr><w:keepNext/></w:pPr>');
  }

  /** Fills one template paragraph; '' when it only carries optional fields that are all empty. */
  function fillBlockPara(p, map) {
    var toks = paraText(p).match(/\{\{[A-Z_]+\}\}/g) || [];
    if (!toks.length) return p;
    var opt = toks.map(function (t) { return t.slice(2, -2); }).filter(function (k) { return OPTIONAL_TOKENS[k]; });
    if (opt.length && opt.every(function (k) { return !map[k]; })) return '';
    return p.replace(/<w:r(?: [^>]*)?>[\s\S]*?<\/w:r>/g, function (r) {
      if (r.indexOf('{{') < 0) return r;
      var m = /^(<w:r(?: [^>]*)?>)(<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?: [^>]*)?>([^<]*)<\/w:t><\/w:r>$/.exec(r);
      if (!m) return r.replace(/\{\{([A-Z_]+)\}\}/g, function (x, k) { return Object.prototype.hasOwnProperty.call(map, k) ? esc(map[k]) : x; });
      var open = m[1], rPr = m[2] || '', out = '';
      decodeXml(m[3]).split(/(\{\{[A-Z_]+\}\})/).forEach(function (piece, i) {
        if (!piece) return;
        var k = piece.slice(2, -2);
        if (i % 2 === 1 && Object.prototype.hasOwnProperty.call(map, k)) out += valueRuns(open, rPr, map[k]);
        else out += open + rPr + '<w:t xml:space="preserve">' + esc(piece) + '</w:t></w:r>';
      });
      return out;
    });
  }

  /** One item (heading, question, key line) from its template paragraphs. */
  function ltrify(p) {                                  // question / option lines of an English paper read left to right
    return p.replace(/<w:bidi\/>/g, '').replace(/<w:rtl\/>/g, '').replace(/(<w:t(?: [^>]*)?>)س(\s)/, '$1Q$2');
  }
  var ovalSeq = 0;
  /** Replaces the oval marker run with a hand-drawn-looking ellipse anchored around the option text. */
  function ovalize(p, op, ltr) {
    return p.replace(/<w:r(?: [^>]*)?>(?:(?!<\/w:r>)[\s\S])*?◌OVAL([^◌]*)◌[\s\S]*?<\/w:r>/, function (r, prm) {
      var q = String(prm || '').replace(/^:/, '').split(',').map(Number), up = q[0] || 0, side = q[1] || 0, sw = (q[2] || 100) / 100, sh = (q[3] || 100) / 100;
      var col = (/<w:color w:val="([0-9A-Fa-f]{6})"/.exec(r) || [0, '1A7F4B'])[1];
      var sz = +((/<w:sz w:val="(\d+)"/.exec(r) || [0, 24])[1]) / 2;
      var em = 0, s = (op.letter || '') + ' ' + (op.text || '');
      for (var i = 0; i < s.length; i++) {
        var c = s.charAt(i);
        em += c === ' ' ? 0.28 : /[A-Z0-9]/.test(c) ? 0.62 : /[.,;:!?()\[\]'"،؛؟\-]/.test(c) ? 0.35 : /[a-z]/.test(c) ? 0.56 : 0.5;
      }
      var padH = 13, padV = 3;
      var w = (em * sz + padH * 2) * sw, h = (sz * 1.25 + padV * 2) * sh;
      var E = function (pt) { return Math.round(pt * 12700); };
      var offH = (ltr ? -padH : -(em * sz + padH)) - (w - ((em * sz + padH * 2))) / 2 + side;
      var id = 9000 + (++ovalSeq);
      var shape =
        '<w:r><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><mc:Choice Requires="wps">' +
        '<w:drawing><wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="' + (250000 + id) + '" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">' +
        '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="character"><wp:posOffset>' + E(offH) + '</wp:posOffset></wp:positionH>' +
        '<wp:positionV relativeFrom="line"><wp:posOffset>' + E(sz * 0.12 - padV - 2.5 - up - (h - (sz * 1.25 + padV * 2)) / 2) + '</wp:posOffset></wp:positionV>' +
        '<wp:extent cx="' + E(w) + '" cy="' + E(h) + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>' +
        '<wp:docPr id="' + id + '" name="Oval ' + id + '"/><wp:cNvGraphicFramePr/>' +
        '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">' +
        '<wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:cNvSpPr/>' +
        '<wps:spPr><a:xfrm rot="-60000"><a:off x="0" y="0"/><a:ext cx="' + E(w) + '" cy="' + E(h) + '"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:noFill/>' +
        '<a:ln w="22225" cap="rnd"><a:solidFill><a:srgbClr val="' + col + '"/></a:solidFill><a:round/></a:ln></wps:spPr>' +
        '<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" upright="1"/></wps:wsp>' +
        '</a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>' +
        '<mc:Fallback><w:t></w:t></mc:Fallback></mc:AlternateContent></w:r>';
      return shape;
    });
  }
  function renderBlock(paras, map, options, showSolutions, ltr) {
    var idx = { n: -1, ok: -1, bad: -1, yes: -1, no: -1 };
    paras.forEach(function (p, i) {
      var t = paraText(p);
      if (/\{\{OPT_OK_(?:LETTER|TEXT)\}\}/.test(t)) idx.ok = i;
      else if (/\{\{OPT_BAD_(?:LETTER|TEXT)\}\}/.test(t)) idx.bad = i;
      else if (/\{\{OPT_YES_(?:LETTER|TEXT)\}\}/.test(t)) idx.yes = i;
      else if (/\{\{OPT_NO_(?:LETTER|TEXT)\}\}/.test(t)) idx.no = i;
      else if (/\{\{OPT_(?:LETTER|TEXT)\}\}/.test(t)) idx.n = i;
    });
    var out = [], stop = -1;
    paras.forEach(function (p, i) {
      if (i === idx.ok || i === idx.bad || i === idx.yes || i === idx.no) return;
      if (i === idx.n) {
        (options || []).forEach(function (op) {
          var use = p;
          if (op.tf === 'yes' && idx.yes >= 0) use = paras[idx.yes];
          if (op.tf === 'no' && idx.no >= 0) use = paras[idx.no];
          if (op.correct && showSolutions) use = (op.bad && idx.bad >= 0) ? paras[idx.bad] : idx.ok >= 0 ? paras[idx.ok] : p;
          var m2 = {};
          Object.keys(map).forEach(function (k) { m2[k] = map[k]; });
          ['OPT', 'OPT_OK', 'OPT_BAD', 'OPT_YES', 'OPT_NO'].forEach(function (pre) { m2[pre + '_LETTER'] = op.letter; m2[pre + '_TEXT'] = op.text; });
          var f = fillBlockPara(use, m2);
          if (f && f.indexOf('◌OVAL') >= 0) f = ovalize(f, op, ltr);
          if (f) out.push(ltr ? ltrify(f) : f);
        });
        return;
      }
      var f2 = fillBlockPara(p, map);
      if (!f2) return;
      if (ltr && /\{\{(?:Q_TEXT|OPT_[A-Z_]+)\}\}/.test(paraText(p))) f2 = ltrify(f2);
      if (stop < 0 && /\{\{(?:ANSWER(?:_TEXT|_FULL)?|MATCH_KEY)\}\}/.test(paraText(p))) stop = out.length;
      out.push(f2);
    });
    // keep question + options + answer line together; the explanation lines below may flow onto the next page
    return out.map(function (p, i) { return (stop >= 0 ? i < stop : i < out.length - 1) ? addKeepNext(p) : p; }).join('');
  }


  // ------------------------------------------------- custom solution layout (the "designer")
  var FIELD_DEFS = [
    { key: 'ANSWER_FULL', label: 'الإجابة الصحيحة', sz: 22, color: '1A7F4B', bold: true },
    { key: 'CORRECTION', label: 'تصحيح الخطأ', sz: 20, color: 'C0392B', bold: true },
    { key: 'STEPS', label: 'خطوات الحل', sz: 20, color: '1F2328', bold: true },
    { key: 'IDEA', label: 'الفكرة الأساسية', sz: 20, color: '1F2328', bold: true },
    { key: 'EXPLANATION', label: 'الشرح', sz: 20, color: '1F2328', bold: true },
    { key: 'CLARIFICATION', label: 'التوضيح', sz: 20, color: '1F2328', bold: true },
    { key: 'TRANSLATION', label: 'ترجمة السؤال', sz: 20, color: '1F2328', bold: true },
    { key: 'SOURCE', label: 'المصدر', sz: 18, color: '5F6B7A', bold: true },
    { key: 'TIME', label: 'الوقت المثالي', sz: 18, color: '5F6B7A', bold: true },
    { key: 'DIFFICULTY', label: 'الصعوبة', sz: 18, color: '5F6B7A', bold: true },
    { key: 'NOTE', label: 'ملاحظة', sz: 18, color: '5F6B7A', bold: true }
  ];

  function layoutPreset(name) {
    var show = { none: [], answer: ['ANSWER_FULL'], explain: ['ANSWER_FULL', 'CORRECTION', 'EXPLANATION'],
      full: ['ANSWER_FULL', 'CORRECTION', 'STEPS', 'IDEA', 'EXPLANATION', 'CLARIFICATION', 'TRANSLATION', 'SOURCE', 'TIME', 'DIFFICULTY'] }[name] || [];
    return {
      circles: name === 'none' ? 'none' : 'ring', okColor: '1A7F4B', badColor: 'C0392B', qSize: 22, separator: name === 'full' || name === 'explain',
      matchKey: name !== 'none', matchTint: name !== 'none',
      numFormat: 'س {n})', numGap: 1, numColor: '', numBold: true, numSize: 0,
      qColor: '', qBold: true, spaceBefore: 140, spaceAfter: 80, optGap: 40, optSize: 0, optColor: '',
      ovalUp: 0, ovalSide: 0, ovalW: 100, ovalH: 100, ovalBadUp: 0, ovalBadSide: 0, ovalBadW: 100, ovalBadH: 100,
      numFont: '', qFont: '', optFont: '', fieldFont: '', numItalic: false, qItalic: false, optItalic: false, optBold: false,
      tfColors: false, tfYesColor: '1A7F4B', tfNoColor: 'C0392B',
      fields: FIELD_DEFS.map(function (d) { return { key: d.key, label: d.label, show: show.indexOf(d.key) >= 0, sz: d.sz, color: d.color, bold: d.bold }; })
    };
  }

  function xa(t) { return String(t).replace(/["<>&]/g, ''); }
  function lrPr(o) {
    o = o || {};
    return '<w:rPr><w:rFonts w:ascii="' + xa(o.font || 'Arial') + '" w:eastAsia="Times New Roman" w:hAnsi="' + xa(o.font || 'Arial') + '" w:cs="' + xa(o.cs || 'Fanan') + '"/>' +
      (o.bold ? '<w:b/><w:bCs/>' : '') + (o.italic ? '<w:i/><w:iCs/>' : '') + (o.color ? '<w:color w:val="' + o.color + '"/>' : '') + '<w:kern w:val="0"/>' +
      '<w:sz w:val="' + (o.sz || 22) + '"/><w:szCs w:val="' + (o.sz || 22) + '"/>' +
      (o.highlight ? '<w:highlight w:val="' + o.highlight + '"/>' : '') +
      (o.u ? '<w:u w:val="double" w:color="' + o.u + '"/>' : '') +
      (o.bdr ? '<w:bdr w:val="single" w:sz="10" w:space="2" w:color="' + o.bdr + '"/>' : '') +
      (o.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>' : '') + '<w:rtl/><w14:ligatures w14:val="none"/></w:rPr>';
  }
  function lrun(text, o) { return '<w:r>' + lrPr(o) + '<w:t xml:space="preserve">' + esc(text) + '</w:t></w:r>'; }
  function lpara(parts, o) {
    o = o || {};
    return '<w:p><w:pPr>' + (o.keepNext ? '<w:keepNext/>' : '') +
      (o.border ? '<w:pBdr><w:bottom w:val="' + o.border[0] + '" w:sz="4" w:space="1" w:color="' + o.border[1] + '"/></w:pBdr>' : '') +
      '<w:bidi/><w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after == null ? 60 : o.after) + '" w:line="' + (o.line || 276) + '" w:lineRule="auto"/>' +
      (o.ind ? '<w:ind w:left="' + o.ind + '"/>' : '') + lrPr({ sz: o.sz }).replace('<w:rtl/>', '') + '</w:pPr>' + parts.join('') + '</w:p>';
  }
  function hex(c, d) { return /^[0-9A-Fa-f]{6}$/.test(String(c || '').replace('#', '')) ? String(c).replace('#', '').toUpperCase() : d; }
  function tint(c) {            // light background for a highlight colour
    var n = parseInt(c, 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return [r, g, b].map(function (v) { return ('0' + Math.round(v + (255 - v) * 0.88).toString(16)).slice(-2); }).join('').toUpperCase();
  }

  /** Paragraphs (with {{tokens}}) for every question kind, from the designer's layout. iconRun(field) → picture run or ''. */
  function layoutBlocks(L, iconRun) {
    var ok = hex(L.okColor, '1A7F4B'), bad = hex(L.badColor, 'C0392B'), qs = +L.qSize || 22, style = L.circles || 'ring';
    var SYM = { font: 'Segoe UI Symbol', cs: 'Segoe UI Symbol' };
    var qColor = hex(L.qColor, ''), numColor = hex(L.numColor, qColor), numSz = +L.numSize || qs, os = +L.optSize || qs, oc = hex(L.optColor, '');
    var before = L.spaceBefore == null ? 140 : +L.spaceBefore, after = L.spaceAfter == null ? 80 : +L.spaceAfter, gap = L.optGap == null ? 40 : +L.optGap;
    var fmt = String(L.numFormat || 'س {n})'), spaces = new Array(Math.max(0, L.numGap == null ? 1 : +L.numGap) + 1).join(' ') || ' ';
    var FN = function (n) { n = String(n || '').trim(); return n ? { font: n, cs: n } : {}; };
    var OF = FN(L.optFont), FF = FN(L.fieldFont);
    function question(withOptions, tf) {
      var out = [lpara([lrun(fmt.replace(/\{n\}/g, '{{Q_NO}}'), Object.assign({ bold: L.numBold !== false, italic: !!L.numItalic, color: numColor || undefined, sz: numSz }, FN(L.numFont))),
        lrun(spaces, Object.assign({ sz: qs }, FN(L.qFont))), lrun('{{Q_TEXT}}', Object.assign({ bold: L.qBold !== false, italic: !!L.qItalic, color: qColor || undefined, sz: qs }, FN(L.qFont)))],
        { keepNext: true, before: before, after: after, sz: qs })];
      out.push(lpara([lrun('{{Q_IMAGE}}', { sz: 4 })], { keepNext: true, after: 0, sz: 4 }));
      if (withOptions) {
        var MARK = { ring: '◉', bubble: '●', check: '✔', star: '★', arrow: '➤' };
        var pre = function (sym, color) { return MARK[style] ? [lrun(MARK[style] + ' ', Object.assign({ color: color, bold: true, sz: os }, SYM))] : []; };
        var ring = function () { return style === 'ring' || style === 'bubble' ? [lrun('○ ', Object.assign({ color: 'A0A8B3', sz: os }, SYM))] : []; };
        var optPara = function (parts) { return lpara(parts, { ind: 400, after: gap, sz: os }); };
        // how the correct option's text is dressed
        var dress = function (color) {
          var d = Object.assign({ bold: true, italic: !!L.optItalic, color: color, sz: os }, OF);
          if (style === 'ring' || style === 'check' || style === 'shade') d.fill = tint(color);
          if (style === 'highlight') d.highlight = 'yellow';
          if (style === 'box') d.bdr = color;
          if (style === 'underline') d.u = color;
          return d;
        };
        var okLine = function (letTok, txtTok, color) {
          var parts = style === 'oval' ? [lrun('◌OVAL:' + (color === bad ? [L.ovalBadUp, L.ovalBadSide, L.ovalBadW, L.ovalBadH] : [L.ovalUp, L.ovalSide, L.ovalW, L.ovalH]).map(function (v) { return +v || 0; }).join(',') + '◌', { color: color, sz: os })] : pre('◉', color);
          parts.push(lrun('{{' + letTok + '}} {{' + txtTok + '}}', dress(color)));
          if (style === 'tickEnd') parts.push(lrun(' ✔', Object.assign({ color: color, bold: true, sz: os }, SYM)));
          return optPara(parts);
        };
        out.push(optPara(ring().concat([lrun('{{OPT_LETTER}} {{OPT_TEXT}}', Object.assign({ sz: os, color: oc || undefined, bold: !!L.optBold, italic: !!L.optItalic }, OF))])));
        if (tf && L.tfColors) {
          var yc = hex(L.tfYesColor, ok), nc = hex(L.tfNoColor, bad);
          out.push(optPara(ring().concat([lrun('{{OPT_YES_LETTER}} {{OPT_YES_TEXT}}', Object.assign({ sz: os, color: yc, bold: true, italic: !!L.optItalic }, OF))])));
          out.push(optPara(ring().concat([lrun('{{OPT_NO_LETTER}} {{OPT_NO_TEXT}}', Object.assign({ sz: os, color: nc, bold: true, italic: !!L.optItalic }, OF))])));
        }
        if (style !== 'none') {
          out.push(okLine('OPT_OK_LETTER', 'OPT_OK_TEXT', ok));
          out.push(okLine('OPT_BAD_LETTER', 'OPT_BAD_TEXT', bad));
        }
      }
      (L.fields || []).forEach(function (f) {
        if (!f.show) return;
        var color = hex(f.color, '1F2328'), lcolor = hex(f.labelColor, color), sz = +f.sz || 20;
        var ft = f.font ? FN(f.font) : FF, tb = f.textBold !== undefined ? !!f.textBold : (!!f.bold && f.key === 'ANSWER_FULL');
        var head = (iconRun ? iconRun(f) : '') + (f.label ? lrun(f.label + (f.noColon ? ' ' : ': '), Object.assign({ bold: f.labelBold !== false, italic: !!f.italic, color: lcolor, sz: sz }, ft)) : '');
        out.push(lpara([head, lrun('{{' + f.key + '}}', Object.assign({ bold: tb, italic: !!f.italic, color: color, sz: sz }, ft))], { before: f.key === 'ANSWER_FULL' ? 60 : 0, sz: sz }));
      });
      if (L.separator) out.push(lpara([], { border: ['dotted', 'C3C9D1'], after: 100, line: 120, sz: 8 }));
      return out;
    }
    var MF = { EXPLANATION: 1, CLARIFICATION: 1, SOURCE: 1, TIME: 1, DIFFICULTY: 1, NOTE: 1, STEPS: 1, IDEA: 1, TRANSLATION: 1 };
    var mk = [];
    if (L.matchKey !== false) mk.push(lpara([lrun('الحل: {{MATCH_KEY}}', { bold: true, color: ok, sz: 20 })], { before: 60 }));
    (L.fields || []).forEach(function (f) {
      if (!f.show || !MF[f.key]) return;
      var color = hex(f.color, '1F2328'), lcolor = hex(f.labelColor, color), sz = +f.sz || 20;
      var ft = f.font ? FN(f.font) : FF;
      mk.push(lpara([(iconRun ? iconRun(f) : '') + (f.label ? lrun(f.label + (f.noColon ? ' ' : ': '), Object.assign({ bold: f.labelBold !== false, italic: !!f.italic, color: lcolor, sz: sz }, ft)) : ''), lrun('{{' + f.key + '}}', Object.assign({ bold: !!f.textBold, italic: !!f.italic, color: color, sz: sz }, ft))], { sz: sz }));
    });
    if (mk.length && L.separator) mk.push(lpara([], { border: ['dotted', 'C3C9D1'], after: 100, line: 120, sz: 8 }));
    return { TF: question(true, true), MCQ: question(true), OPEN: question(false), MATCH_KEY: mk };
  }

  function greenPara(text) {
    return '<w:p><w:pPr><w:keepLines/><w:bidi/><w:spacing w:before="60" w:after="100"/></w:pPr>' +
      '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Fanan"/><w:b/><w:bCs/><w:color w:val="1A7F4B"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:rtl/></w:rPr>' +
      '<w:t xml:space="preserve">' + esc(text) + '</w:t></w:r></w:p>';
  }


  // ------------------------------------------------------------ template wizard
  /** Top-level body children as [{kind:'p'|'tbl'|'sect', xml}] and the text before/after. */
  function splitBody(doc) {
    var a = doc.indexOf('<w:body>') + 8, b = doc.lastIndexOf('</w:body>');
    var inner = doc.slice(a, b), out = [], re = /<(\/?)(w:p|w:tbl|w:sectPr)(?=[ >\/])/g, m, d = 0, st = -1, nm = '';
    while ((m = re.exec(inner))) {
      var tagEnd = inner.indexOf('>', m.index), selfClose = inner.charAt(tagEnd - 1) === '/';
      if (m[1] === '') {
        if (d === 0) { st = m.index; nm = m[2]; }
        if (selfClose) { if (d === 0) { out.push({ kind: nm, xml: inner.slice(st, tagEnd + 1) }); } } else d++;
      } else {
        d--;
        if (d === 0) { var e = inner.indexOf('>', m.index) + 1; out.push({ kind: nm, xml: inner.slice(st, e) }); }
      }
    }
    return { head: doc.slice(0, a), tail: doc.slice(b), items: out };
  }
  var COVER_ROWS = [['STUDENT_NAME', 'اسم الطالب'], ['AREA', 'المنطقة ورمز الطباعة'], ['COMMITTEE', 'اللجنة'], ['SCHOOL', 'المدرسة'],
    ['SECTION', 'القسم'], ['SUBJECT', 'المادة'], ['DURATION', 'الزمن'], ['SEAT', 'رقم الجلوس ورمز الامتحان والتسلسل']];

  /**
   * Builds a new template from a built-in one.
   * spec = { header: bool (ministry header + subject title), rows: [token…] (student-data lines to keep),
   *          instructions: bool, fields: [key…] (solution fields kept in the question blocks) }
   */
  async function makeTemplate(JSZip, baseBytes, spec) {
    var zip = await JSZip.loadAsync(baseBytes), f = zip.file('word/document.xml');
    var doc = normalizeTokens(await f.async('string'));
    var sp = splitBody(doc), it = sp.items;
    var txt = function (x) { return paraText(x.xml); };
    var bodyAt = -1, i;
    for (i = 0; i < it.length; i++) if (txt(it[i]).indexOf('{{BODY}}') >= 0) { bodyAt = i; break; }
    if (bodyAt < 0) throw new Error('القالب الأساسي لا يحتوي {{BODY}}');
    var firstRow = -1, lastRow = -1;
    for (i = 0; i < bodyAt; i++) {
      if (firstRow < 0 && txt(it[i]).indexOf('{{STUDENT_NAME}}') >= 0) firstRow = i;
      if (lastRow < 0 && txt(it[i]).indexOf('{{SEAT}}') >= 0) lastRow = i;
    }
    var rows = spec.rows || [], keep = [];
    it.forEach(function (x, idx) {
      var t = txt(x);
      if (idx >= bodyAt) { keep.push(x); return; }
      if (firstRow >= 0 && idx >= firstRow && idx <= lastRow) {          // student-data lines
        if (rows.some(function (r) { return t.indexOf('{{' + r + '}}') >= 0; })) keep.push(x);
        return;
      }
      if (firstRow >= 0 && idx > lastRow) { if (spec.instructions !== false) keep.push(x); return; }   // instructions and bubbles
      if (idx < firstRow || firstRow < 0) { if (spec.header !== false || x.xml.indexOf('<w:sectPr') >= 0) keep.push(x); }
    });
    var res = keep.map(function (x) { return x.xml; }).join('');
    // solution fields inside the definitions region
    var FIELD_OF = { CORRECTION: 'CORRECTION', STEPS: 'STEPS', IDEA: 'IDEA', TRANSLATION: 'TRANSLATION', EXPLANATION: 'EXPLANATION', CLARIFICATION: 'CLARIFICATION', SOURCE: 'SOURCE', TIME: 'TIME', DIFFICULTY: 'TIME', NOTE: 'NOTE' };
    if (spec.fields) {
      var sp2 = splitBody('<w:body>' + res + '</w:body>'), inBlock = false, out2 = [];
      sp2.items.forEach(function (x) {
        var t = txt(x);
        if (/\[\[BLOCK /.test(t)) inBlock = true;
        if (/\[\[END\]\]/.test(t)) inBlock = false;
        if (inBlock) {
          var toks = (t.match(/\{\{([A-Z_]+)\}\}/g) || []).map(function (k) { return k.slice(2, -2); });
          var fk = toks.filter(function (k) { return FIELD_OF[k]; }).map(function (k) { return FIELD_OF[k]; });
          if (fk.length && !fk.some(function (k) { return spec.fields.indexOf(k) >= 0; })) return;
        }
        out2.push(x.xml);
      });
      res = out2.join('');
    }
    zip.file('word/document.xml', sp.head + res + sp.tail);
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  /** Checks that a .docx can be used as the template (has the questions marker). */
  async function inspectTemplate(JSZip, bytes) {
    try {
      var z = await JSZip.loadAsync(bytes);
      var f = z.file('word/document.xml');
      if (!f) return { ok: false, error: 'الملف ليس مستند Word صالحاً' };
      var d = normalizeTokens(await f.async('string'));
      if (d.indexOf('{{BODY}}') < 0 && d.indexOf('<!--{{BODY}}-->') < 0)
        return { ok: false, error: 'لا يوجد في القالب السطر {{BODY}} الذي توضع مكانه الأسئلة. أعد تنزيل القالب الأصلي وعدّل عليه دون حذف هذا السطر.' };
      var info = extractBlocks(d);
      return { ok: true, tokens: (d.match(/\{\{[A-Z_]+\}\}/g) || []), blocks: Object.keys(info.blocks), warnings: info.warnings };
    } catch (e) { return { ok: false, error: 'تعذرت قراءة القالب: ' + e.message }; }
  }

  // ------------------------------------------------------------ smart cover (stage / round / inside or outside Libya)
  var STAGES = {
    secondary: { name: 'الثانوية', certificate: 'شهادة إتمام مرحلة التعليم الثانوي' },
    basic: { name: 'الإعدادية (الأساسي)', certificate: 'شهادة إتمام مرحلة التعليم الأساسي' }
  };
  /** sel = {stage, branch, round:'first'|'second', place:'in'|'out', city, country} → the cover values it decides. */
  function smartCover(sel) {
    sel = sel || {};
    var st = STAGES[sel.stage] || STAGES.secondary, out = sel.place === 'out';
    var r = { certificate: st.certificate, round: sel.round === 'second' ? 'الدور الثاني' : 'الدور الأول' };
    if (out) r.round += ' - خارجية';
    if (sel.stage === 'basic') { r.section = ''; r.hideSection = true; }
    else r.section = sel.branch === 'أدبي' ? 'القسم الأدبي' : sel.branch === 'علمي' ? 'القسم العلمي' : (sel.branch === '' ? '' : (sel.branch || 'القسم العلمي'));
    if (out) {
      var loc = [sel.city, sel.country].map(function (x) { return String(x || '').trim(); }).filter(Boolean).join(' - ');
      r.area = 'خارج ليبيا';
      if (loc) { r.committee = 'الليبية / ' + loc; r.school = 'الليبية / ' + loc; }
    }
    return r;
  }
  /** Reads the cover values already typed and works out what they mean (the inverse of smartCover). */
  function inferCover(v) {
    v = v || {};
    var all = [v.certificate, v.round, v.area, v.committee, v.school].join(' ');
    var r = {};
    if (/الأساسي|الاساسي|الإعدادي|الاعدادي|إعدادية|اعدادية/.test(v.certificate || '')) r.stage = 'basic';
    else if (/الثانوي|ثانوية/.test(v.certificate || '')) r.stage = 'secondary';
    if (/الأدبي|الادبي|أدبي/.test(v.section || '')) r.branch = 'أدبي'; else if (/العلمي|علمي/.test(v.section || '')) r.branch = 'علمي';
    if (/الثاني|ثاني/.test(v.round || '')) r.round = 'second'; else if (/الأول|الاول|أول/.test(v.round || '')) r.round = 'first';
    if (/خارج/.test(v.area || '') || /خارجية/.test(v.round || '')) {
      r.place = 'out';
      var m = /الليبية\s*\/\s*([^\-–]+?)\s*[-–]\s*(.+)$/.exec(v.committee || v.school || '');
      if (m) { r.city = m[1].trim(); r.country = m[2].trim(); }
    } else if ((v.area || v.round || v.committee) && all.trim()) r.place = 'in';
    return r;
  }
  function dropSectionRow(xml) {                          // basic-stage covers have no "القسم" line
    return xml.replace(/<w:p[ >](?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, function (p) {
      var t = paraText(p), toks = t.match(/\{\{[A-Z_]+\}\}/g) || [];
      return toks.length === 1 && toks[0] === '{{SECTION}}' ? '' : p;
    });
  }
  function fillTokens(xml, map) {
    return xml.replace(/\{\{([A-Z_]+)\}\}/g, function (m, k) {
      return Object.prototype.hasOwnProperty.call(map, k) ? esc(map[k]) : m;
    });
  }

  /**
   * Build the exam .docx.
   * @param JSZip        the JSZip constructor
   * @param template     ArrayBuffer/Uint8Array of exam-template.docx
   * @param exam         result of parseExam()
   * @param options      {subject, subjectCode, certificate, round, year, section, duration, paperNo,
   *                      includeKey, renumber, seed}
   * @returns {Promise<{bytes:Uint8Array, count:number, key:Array}>}
   */

  /** Joins exams read from several files into one, in the given order; warnings are tagged with the file name. */
  function mergeExams(exams, names) {
    var out = { questions: [], warnings: [], merged: exams.length > 1, names: names || [] };
    exams.forEach(function (e, i) {
      var tag = exams.length > 1 ? '[' + (names && names[i] || 'ملف ' + (i + 1)) + '] ' : '';
      e.questions.forEach(function (q) { q._file = i; out.questions.push(q); });
      e.warnings.forEach(function (w) { out.warnings.push(tag + w); });
    });
    return out;
  }

  /** Quality checks on what was read (not errors in the parser): numbering gaps, repeated questions, odd option counts, missing explanations. */
  function audit(exam) {
    var out = [], qs = exam.questions;
    var norm = function (t) { return String(t || '').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase(); };
    var groups = {};
    qs.forEach(function (q) {
      var g = groups[q._file || 0] = groups[q._file || 0] || [];
      if (q.type === 'match') q.pairs.forEach(function (p) { g.push(p.n); }); else g.push(q.n);
    });
    Object.keys(groups).forEach(function (gi) {
      var nums = groups[gi], tag = exam.merged ? '[' + (exam.names && exam.names[gi] || 'ملف ' + (+gi + 1)) + '] ' : '';
      if (nums.length < 2) return;
      var seen = {}, dup = [], gaps = [];
      nums.forEach(function (n, i) {
        if (seen[n]) dup.push(n); seen[n] = 1;
        if (i && n > nums[i - 1] + 1) gaps.push('س' + nums[i - 1] + ' و س' + n);
      });
      if (dup.length) out.push(tag + 'رقم مكرر في المصدر: س' + dup.slice(0, 6).join('، س') + (dup.length > 6 ? ' …' : '') + '.');
      if (gaps.length) out.push(tag + 'ينقص الترقيم بين ' + gaps.slice(0, 5).join('، ') + (gaps.length > 5 ? ' …' : '') + ' (قد يكون سؤالاً ضاع من الملف).');
    });
    var stems = {};
    qs.forEach(function (q) {
      if (q.type === 'match') return;
      var k = norm(q.text);
      if (k.length < 4) { out.push('س' + q.n + ': نص السؤال فارغ أو قصير جداً.'); return; }
      if (stems[k]) out.push('س' + q.n + ' نصه مطابق لـ س' + stems[k] + ' (سؤال مكرر؟).'); else stems[k] = q.n;
      if (q.type === 'mcq') {
        var c = q.options.length, ks = {};
        if (c < 3) out.push('س' + q.n + ': عدد الخيارات ' + c + ' فقط.');
        else if (c > 6) out.push('س' + q.n + ': عدد الخيارات ' + c + ' (أكثر من 6؟).');
        q.options.forEach(function (op) { var o = norm(op.text); if (o && ks[o]) out.push('س' + q.n + ': خياران متطابقان («' + String(op.text).slice(0, 20) + '»).'); ks[o] = 1; });
      }
    });
    var plain = qs.filter(function (q) { return q.type === 'mcq' || q.type === 'tf'; });
    var withEx = plain.filter(function (q) { return (q.explanation || q.clarification || q.steps || q.idea).toString().trim(); });
    if (plain.length >= 4 && withEx.length >= plain.length * 0.6 && withEx.length < plain.length) {
      var miss = plain.filter(function (q) { return withEx.indexOf(q) < 0; }).map(function (q) { return 'س' + q.n; });
      out.push('بلا شرح أو توضيح بينما لبقية الأسئلة شرح: ' + miss.slice(0, 8).join('، ') + (miss.length > 8 ? ' … (' + miss.length + ')' : '') + '.');
    }
    return out.map(function (m) { return '⚑ ' + m; });
  }

  /** Last look at the finished document.xml before it is zipped: reports what would make Word complain or show raw markers. */
  function selfCheck(xml) {
    var out = [];
    var left = xml.match(/\{\{[A-Z_]+\}\}/g);
    if (left) out.push('بقيت حقول غير مملوءة في القالب: ' + left.filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 5).join('، '));
    if (/\[\[\/?(?:BLOCK|DEFINITIONS)/.test(xml)) out.push('بقيت علامات تصميم [[…]] داخل المستند.');
    if (/◌OVAL/.test(xml)) out.push('بقي رمز بيضاوي غير محوَّل.');
    var tcs = xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
    for (var i = 0; i < tcs.length; i++) if (!/<w:p[ >\/]/.test(tcs[i])) { out.push('خلية جدول فارغة بلا فقرة (قد يرفضها Word).'); break; }
    if (typeof DOMParser !== 'undefined') {
      try { var d = new DOMParser().parseFromString(xml, 'application/xml'); if (d.getElementsByTagName('parsererror').length) out.push('ملف المستند غير سليم البنية (XML).'); } catch (e) { }
    }
    return out;
  }

  async function buildDocx(JSZip, template, exam, options) {
    var o = options || {};
    var zip = await JSZip.loadAsync(template);
    var docFile = zip.file('word/document.xml');
    if (!docFile) throw new Error('القالب ليس مستند Word صالحاً');
    var doc = normalizeTokens(await docFile.async('string'));
    var defs = extractBlocks(doc);                       // layouts designed inside the template (optional)
    doc = defs.doc;
    var B = defs.blocks, sol = o.showSolutions !== false, ltr = o.dir === 'ltr';
    var L = o.solutionLayout || null;

    // --- pictures (under questions, and small label icons from the designer)
    var mediaN = 0, relAdd = '', typeAdd = {}, drawId = 500;
    var MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', emf: 'image/x-emf', wmf: 'image/x-wmf', tif: 'image/tiff', tiff: 'image/tiff' };
    function addMedia(img) {
      var ext = String(img.ext || 'png').toLowerCase(); if (!MIME[ext]) ext = 'png';
      mediaN++;
      var nm = 'examimg' + mediaN + '.' + ext;
      zip.file('word/media/' + nm, img.data);
      typeAdd[ext] = MIME[ext];
      relAdd += '<Relationship Id="rIdExamImg' + mediaN + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + nm + '"/>';
      return 'rIdExamImg' + mediaN;
    }
    function drawingRun(img, maxW, maxH) {
      var cx = img.cx > 0 ? img.cx : 3600000, cy = img.cy > 0 ? img.cy : 2700000;
      var k = Math.min(1, maxW / cx, maxH / cy); cx = Math.round(cx * k); cy = Math.round(cy * k);
      var rid = addMedia(img), id = ++drawId;
      return '<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0">' +
        '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + id + '" name="Picture ' + id + '"/>' +
        '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
        '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
        '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + id + '" name="img' + id + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
        '<pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
        '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
    }
    function imagesXml(list) {
      if (!list || !list.length || o.includeImages === false) return '';
      return list.map(function (im) {
        return '<w:p><w:pPr><w:keepNext/><w:bidi/><w:spacing w:before="60" w:after="120"/><w:jc w:val="center"/></w:pPr>' + drawingRun(im, 5400000, 3600000) + '</w:p>';
      }).join('');
    }
    function iconRun(f) {                               // label picture chosen in the designer
      if (!f.icon || !f.icon.dataUrl) return '';
      var m = /^data:image\/(\w+);base64,(.*)$/.exec(f.icon.dataUrl);
      if (!m) return '';
      var bin = typeof atob === 'function' ? atob(m[2]) : Buffer.from(m[2], 'base64').toString('binary'), u = new Uint8Array(bin.length);
      for (var bi = 0; bi < bin.length; bi++) u[bi] = bin.charCodeAt(bi);
      var h = (+f.iconSize || 20) * 12700;
      return drawingRun({ data: u, ext: m[1], cx: h, cy: h }, 2000000, h) + '<w:r><w:t xml:space="preserve"> </w:t></w:r>';
    }
    if (L) {                                            // layout designed in the add-in overrides the template's own blocks
      var lb = layoutBlocks(L, iconRun);
      B.TF = lb.TF; B.MCQ = lb.MCQ; B.OPEN = lb.OPEN;
      if (lb.MATCH_KEY.length) B.MATCH_KEY = lb.MATCH_KEY; else delete B.MATCH_KEY;
    }
    var numFile = zip.file('word/numbering.xml');
    var numbering = numFile ? await numFile.async('string')
      : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:numbering>';

    // --- numbering: one abjad list (أ) ب) ج) د)) per question so every question restarts at أ).
    // The list definition is added by us (same as the template's), so edited templates can't break it.
    var abstractId = 9000;
    var absXml = '<w:abstractNum w:abstractNumId="9000"><w:multiLevelType w:val="hybridMultilevel"/>' +
      '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="' + (ltr || o.letters === 'en' ? 'upperLetter' : 'arabicAbjad') + '"/><w:lvlText w:val="%1)"/><w:lvlJc w:val="left"/>' +
      '<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:hint="default"/></w:rPr></w:lvl></w:abstractNum>';
    var nextNum = 1000;
    var numXml = '';
    function newList() {
      var id = nextNum++;
      numXml += '<w:num w:numId="' + id + '"><w:abstractNumId w:val="' + abstractId + '"/>' +
        '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>';
      return id;
    }

    // --- cover / header fields
    var tokens = {
      SUBJECT: o.subject || '',
      SUBJECT_CODE: o.subjectCode ? '(' + o.subjectCode + ')' : '',
      PAPER_NO: o.paperNo || '',
      CERT: o.certificate || 'شهادة إتمام مرحلة التعليم الثانوي',
      ROUND_LINE: (o.round || '') + (o.year ? ' للعام الدراسي ' + o.year : ''),
      SECTION: o.section || '',
      DURATION: o.duration || '',
      STUDENT_NAME: o.studentName || '',
      AREA: o.area || '',
      COMMITTEE: o.committee || '',
      SCHOOL: o.school || '',
      SEAT: o.seat || '',
      PRINT_CODE: o.printCode || '',
      EXAM_CODE: o.examCode || '',
      SERIAL: o.serial || '',
      EXTRA: o.regNo ? '    رقم القيد: ' + o.regNo : ''
    };
    var qs = exam.questions;
    var tf = qs.filter(function (q) { return q.type === 'tf'; });
    var mcq = qs.filter(function (q) { return q.type === 'mcq'; });
    var match = qs.filter(function (q) { return q.type === 'match'; });
    var open = qs.filter(function (q) { return q.type === 'open'; });

    function letterOf(q, i) {                           // English questions keep their A) B) C) D) letters
      var l = q.options && q.options[i] && q.options[i].letter;
      return o.letters === 'ar' ? LETTERS[i] : o.letters === 'en' ? 'ABCDEF'.charAt(i) : /^[A-F]$/.test(l || '') ? l : LETTERS[i];
    }
    var LBL = { tf: 'صح / خطأ', mcq: 'اختيار من متعدد', open: 'سؤال مقالي' };
    function qMap(q, n, opts) {
      var m = {};
      Object.keys(tokens).forEach(function (k) { m[k] = tokens[k]; });
      var ans = '', ansText = '';
      if (q.type === 'tf') { var tfw = q.tfEn ? ['True', 'False'] : ['صح', 'خطأ']; ans = q.answerIndex === 0 ? tfw[0] : q.answerIndex === 1 ? tfw[1] : ''; ansText = ans; }
      else if (q.type === 'mcq') {
        if (q.answerIndex >= 0) { ans = letterOf(q, q.answerIndex); ansText = q.options[q.answerIndex].text; }
      } else { ans = ansText = q.answerText || ''; }
      var full = q.type === 'mcq' && q.answerIndex >= 0 ? ans + ') ' + ansText : ans;
      m.Q_NO = String(n); m.Q_TEXT = q.text; m.QTYPE = LBL[q.type] || '';
      m.ANSWER = sol ? ans : ''; m.ANSWER_TEXT = sol ? ansText : ''; m.ANSWER_FULL = sol ? full : '';
      m.CORRECTION = sol ? (q.correction || '') : ''; m.EXPLANATION = sol ? (q.explanation || '') : '';
      m.CLARIFICATION = sol ? (q.clarification || '') : ''; m.SOURCE = sol ? (q.source || '') : '';
      m.TIME = sol ? (q.time || '') : ''; m.DIFFICULTY = sol ? (q.difficulty || '') : ''; m.NOTE = sol ? (q.note || '') : '';
      m.STEPS = sol ? (q.steps || '') : ''; m.IDEA = sol ? (q.idea || '') : ''; m.TRANSLATION = sol ? (q.translation || '') : '';
      m.Q_IMAGE = q.images && q.images.length ? '◈◈صورة◈◈' : '';
      return m;
    }
    function qOptions(q) {
      if (q.type === 'tf') return (q.tfEn ? ['True', 'False'] : ['صح', 'خطأ']).map(function (t, i) {
        return { letter: (q.tfEn ? 'AB'.charAt(i) : LETTERS[i]) + ')', text: t, correct: q.answerIndex === i, bad: q.answerIndex === i && i === 1, tf: i === 0 ? 'yes' : 'no' };
      });
      if (q.type === 'mcq') return q.options.map(function (op, i) { return { letter: letterOf(q, i) + ')', text: op.text, correct: q.answerIndex === i }; });
      return [];
    }
    var EN_HEAD = { 'أسئلة الصواب أو الخطأ': 'True or False', 'أسئلة الاختيار من متعدد': 'Multiple Choice', 'أسئلة المزاوجة والتوصيل': 'Matching', 'أسئلة أخرى': 'Other Questions' };
    function head(title) {
      if (o.lang === 'en') title = EN_HEAD[title] || title;
      if (B.HEADING) { var m = {}; Object.keys(tokens).forEach(function (k) { m[k] = tokens[k]; }); m.TITLE = title; return renderBlock(B.HEADING, m, null, sol); }
      return heading(title);
    }
    function blockQ(kind, q, n) {
      var x = renderBlock(B[kind], qMap(q, n), qOptions(q), sol, ltr), img = imagesXml(q.images);
      if (x.indexOf('◈◈صورة◈◈') >= 0) return x.replace(P_ALL, function (p) { return p.indexOf('◈◈صورة◈◈') >= 0 ? img : p; });
      if (!img) return x;
      var cut = x.indexOf('</w:p>') + 6;
      return x.slice(0, cut) + img + x.slice(cut);
    }

    var no = 0;
    var body = '';
    var key = [];
    var renumber = o.renumber !== false;
    function numberFor(q) { no++; return renumber ? no : q.n; }

    if (tf.length) {
      body += head('أسئلة الصواب أو الخطأ');
      tf.forEach(function (q) {
        var n = numberFor(q);
        if (B.TF) { body += blockQ('TF', q, n); } else {
        body += questionPara(n, q.text, ltr) + imagesXml(q.images);
        var id = newList();
        body += optionPara(id, q.tfEn ? 'True' : 'صح', false, ltr) + optionPara(id, q.tfEn ? 'False' : 'خطأ', true, ltr); }
        key.push({ n: n, answer: q.answerIndex === 0 ? (q.tfEn ? 'True' : 'صح') : q.answerIndex === 1 ? (q.tfEn ? 'False' : 'خطأ') : '' });
      });
    }
    if (mcq.length) {
      body += head('أسئلة الاختيار من متعدد');
      mcq.forEach(function (q) {
        var n = numberFor(q);
        if (B.MCQ) { body += blockQ('MCQ', q, n); } else {
        body += questionPara(n, q.text, ltr) + imagesXml(q.images);
        var id = newList();
        q.options.forEach(function (op, i) { body += optionPara(id, op.text, i === q.options.length - 1, ltr); }); }
        key.push({ n: n, answer: q.answerIndex >= 0 ? letterOf(q, q.answerIndex) + ') ' + q.options[q.answerIndex].text : '' });
      });
    }
    match.forEach(function (g, gi) {
      if (gi === 0) body += head('أسئلة المزاوجة والتوصيل');
      var first = no + 1;
      var soft = null;
      if (sol && (L ? L.matchTint !== false : Object.keys(B).length)) {
        soft = (L && L.matchColors && L.matchColors.length ? L.matchColors.map(function (c) { return hex(c, 'D9EEFA'); }) : SOFT);
      }
      var blk = matchBlock(g, renumber ? first : g.pairs[0].n, (o.seed || 7) + gi, soft, o.lang === 'en', ltr);
      body += imagesXml(g.images) + blk.xml;
      if (Object.keys(B).length && sol && !(L && !B.MATCH_KEY)) {
        var keyText = g.pairs.map(function (p, i) { return (renumber ? first + i : p.n) + (ltr ? '-' : ' ← ') + (ltr ? 'ABCDEF'.charAt(blk.answers[i]) : LETTERS[blk.answers[i]]); }).join(ltr ? '  ،  ' : '   ،   ');
        if (B.MATCH_KEY) { var km = {}; Object.keys(tokens).forEach(function (k) { km[k] = tokens[k]; }); km.MATCH_KEY = keyText; ['EXPLANATION', 'CLARIFICATION', 'SOURCE', 'TIME', 'DIFFICULTY', 'NOTE', 'STEPS', 'IDEA', 'TRANSLATION'].forEach(function (f) { km[f] = g[f.toLowerCase()] || ''; }); body += renderBlock(B.MATCH_KEY, km, null, sol); }
        else body += greenPara('الحل: ' + keyText);
      }
      g.pairs.forEach(function (p, i) {
        no++;
        key.push({ n: renumber ? no : p.n, answer: (ltr ? 'ABCDEF'.charAt(blk.answers[i]) : LETTERS[blk.answers[i]]) + ') ' + p.right });
      });
    });
    open.forEach(function (q, i) {
      if (i === 0) body += head('أسئلة أخرى');
      var n = numberFor(q);
      if (B.OPEN) { body += blockQ('OPEN', q, n); } else {
      body += questionPara(n, q.text, ltr) + imagesXml(q.images);
      body += para('', { line: 360 }) + para('', { line: 360 }); }
      key.push({ n: n, answer: q.answerText });
    });

    if (o.endMarker) body += para(runs(o.endMarkerText || '***** انتهت الأسئلة *****', true), { jc: 'center', bold: true });

    if (o.includeKey) {
      body += '<w:p><w:pPr><w:bidi/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>';
      body += heading(o.lang === 'en' ? 'Answer Key' : 'نموذج الإجابة');
      key.forEach(function (k) { body += para(runs('س ' + k.n + ') ' + k.answer, false)); });
    }

    var HOLD = '@@EXAM_BODY_HERE@@';
    if (doc.indexOf('<!--{{BODY}}-->') >= 0) doc = doc.replace('<!--{{BODY}}-->', HOLD);
    else if (BODY_PARA.test(doc)) doc = doc.replace(BODY_PARA, HOLD);
    else throw new Error('لا يوجد في القالب السطر {{BODY}} الذي توضع مكانه الأسئلة.');
    if (o.hideSection) doc = dropSectionRow(doc);
    doc = fillTokens(doc, tokens);                      // cover page fields first, so question text is never re-scanned
    doc = doc.replace(HOLD, function () { return body; });
    var firstNum = numbering.search(/<w:num [^>]*>/);
    if (firstNum < 0) firstNum = numbering.indexOf('<w:numIdMacAtCleanup');
    if (firstNum < 0) firstNum = numbering.lastIndexOf('</w:numbering>');
    numbering = numbering.slice(0, firstNum) + absXml + numbering.slice(firstNum);
    var tail = numbering.indexOf('<w:numIdMacAtCleanup');
    if (tail < 0) tail = numbering.lastIndexOf('</w:numbering>');
    numbering = numbering.slice(0, tail) + numXml + numbering.slice(tail);

    var problems = selfCheck(doc);
    zip.file('word/document.xml', doc);
    var hdrFiles = zip.file(/^word\/(?:header|footer)\d*\.xml$/);
    for (var h = 0; h < hdrFiles.length; h++) {
      var hx = normalizeTokens(await hdrFiles[h].async('string'));
      zip.file(hdrFiles[h].name, fillTokens(hx, tokens));
    }
    zip.file('word/numbering.xml', numbering);
    if (mediaN) {
      var rf = zip.file('word/_rels/document.xml.rels');
      var rx = rf ? await rf.async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
      zip.file('word/_rels/document.xml.rels', rx.replace('</Relationships>', relAdd + '</Relationships>'));
      var ctf = zip.file('[Content_Types].xml'), ct = await ctf.async('string');
      Object.keys(typeAdd).forEach(function (e) {
        if (!new RegExp('<Default [^>]*Extension="' + e + '"', 'i').test(ct)) ct = ct.replace(/(<Types[^>]*>)/, '$1<Default Extension="' + e + '" ContentType="' + typeAdd[e] + '"/>');
      });
      zip.file('[Content_Types].xml', ct);
    }
    var bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    return { bytes: bytes, count: no, key: key, problems: problems };
  }

  /** 'en' when the questions are written in English, 'math' when they carry worked steps, else 'other'. */
  function detectKind(exam) {
    var qs = (exam && exam.questions || []).map(function (q) { return q.type === 'match' ? (q.pairs[0] ? q.pairs[0].left : '') : q.text; }).filter(Boolean);
    if (!qs.length) return 'other';
    var latin = qs.filter(function (t) { var l = (t.match(/[A-Za-z]/g) || []).length, a = (t.match(/[؀-ۿ]/g) || []).length; return l > a * 2 && l > 8; }).length;
    if (latin / qs.length > 0.5) return 'en';
    var steps = exam.questions.filter(function (q) { return q.steps || q.idea; }).length;
    return steps / exam.questions.length > 0.3 ? 'math' : 'other';
  }

  return {
    detectKind: detectKind,
    readDocxParagraphs: readDocxParagraphs,
    parseExam: parseExam,
    inspectTemplate: inspectTemplate,
    buildDocx: buildDocx,
    mergeExams: mergeExams,
    audit: audit,
    _blocks: extractBlocks,
    layoutPreset: layoutPreset,
    fieldDefs: FIELD_DEFS, softColors: SOFT, smartCover: smartCover, inferCover: inferCover, stages: STAGES, makeTemplate: makeTemplate, coverRows: COVER_ROWS,
    _norm: norm,
    _normalizeTokens: normalizeTokens,
    _decode: decodeXml,
    _esc: esc
  };
});
