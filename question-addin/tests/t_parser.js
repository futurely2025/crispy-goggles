// node tests/t_parser.js  — unit tests for web/js/questions/parser.js (no browser needed)
const assert = require('assert');
const Q = require('../web/qparser-assets/js/qparser-core.js');

const p = (...runs) => ({ k: 'p', runs });
const blocks = [
  p('أولا: أسئلة الصواب والخطأ:'),
  p('س 1) بدأت الحرب العالمية الأولى عام 1914م.'), p('الإجابة: صح'), p('الشرح: "…"'),
  p('توضيح:'), p('سطر: ..'), p('المصدر: الباب الأول'),
  p('الوقت المثالي لحل السؤال: دقيقة واحدة.'), p('صعوبة السؤال: سهل.'), p(''),
  p('س 2) انتهت الحرب عام', ': ', '1918م', ' ', '1917م', ' ', '1919م', ' ', '1910م'),
  p('الإجابة: 1918م'), p('الشرح: "…"'), p('توضيح: ..'), p('المصدر: ..'),
  p('الوقت المثالي لحل السؤال: دقيقتان.'), p('صعوبة السؤال: متوسط.'),
  p('س 3) سؤال ناقص'), p('الإجابة: خطأ'),
  { k: 't', rows: [['الرقم', 'السؤال', 'الحرف', 'الإجابة الصحيحة'], ['س 51', 'مجلة الفنون', '(هـ)', 'عام 1898م.']] }
];
const r = Q.analyze(blocks, 'امتحان تجريبي');
assert.strictEqual(r.tf.length, 1);
assert.strictEqual(r.errors.length, 1);                       // س3 is missing fields
assert.deepStrictEqual(r.mcq[0].options.slice(0, 4), ['1918م', '1917م', '1919م', '1910م']);
assert.strictEqual(r.mcq[1].options[4], 'عام 1898م');         // table row -> letter هـ
assert.ok(r.mcq[1].warn.length);

assert.deepStrictEqual(
  Q.splitInlineOptions('18 نوفمبر 1918م 18 نوفمبر 1920م 20 نوفمبر 1917م جميع الإجابات السابقة خاطئة', '18 نوفمبر 1918م').options,
  ['18 نوفمبر 1918م', '18 نوفمبر 1920م', '20 نوفمبر 1917م', 'جميع الإجابات السابقة خاطئة']);
assert.deepStrictEqual(
  Q.splitInlineOptions('جميع الإجابات السابقة صحيحة الاعتراف بالسيد إدريس أميراً على برقة استقلال الأجزاء الجنوبية من برقة تحديد إجدابيا عاصمة للإمارة', 'جميع الإجابات السابقة صحيحة').options.slice(1),
  ['الاعتراف بالسيد إدريس أميراً على برقة', 'استقلال الأجزاء الجنوبية من برقة', 'تحديد إجدابيا عاصمة للإمارة']);
assert.strictEqual(Q.examNameFromFilename('C:\\Users\\a\\الدور الثاني 2017 - 2016.docx'), 'الدور الثاني 2017 - 2016');
assert.strictEqual(Q.categoryFromName('الدور الأول 2013'), 'امتحان الدور الأول 2013');

// --- matching group ("جدول المزاوجة") + stray letter before a field name + DONE marker
const m = Q.analyze([
  p('س1) سؤال عادي.'), p('الإجابة: صح'), p('الشرح: x'), p('التوضيح: y'), p('المصدر: z'),
  p('الوقت المثالي لحل السؤال: 30 ثانية'), p('ص صعوبة السؤال: سهل'),
  p('--------------------------------------------------------------------------------'),
  p('جدول المزاوجة والتوصيل (س 51 - س52):'),
  p('س51) مجلة الفنون أول مجلة ليبية -> أصدرها محمد داوود عام 1898م.'),
  p('س52) مشروع بيفن -> بموجبه تم تقسيم ليبيا.'),
  p('الشرح:'),
  p('أصدرها محمد داوود عام 1898م:'), p('شرح الأولى.'),
  p('بموجبه تم تقسيم ليبيا:'), p('شرح الثانية.'),
  p('التوضيح: عام'), p('المصدر: م'), p('الوقت المثالي لحل السؤال: 90 ثانية'), p('صعوبة السؤال: متوسط'),
  p('DONE')
], 'x');
assert.strictEqual(m.errors.length, 0);
assert.strictEqual(m.tf[0].difficulty, 'سهل');
assert.strictEqual(m.mcq.length, 0);
assert.strictEqual(m.match.length, 1);
assert.strictEqual(m.match[0].pairs.length, 2);
assert.strictEqual(m.match[0].pairs[1].value, 'بموجبه تم تقسيم ليبيا');
assert.strictEqual(m.match[0].time, '90 ثانية');
assert.ok(Q.csvFiles(m, 'x').match.split('\r\n')[0].indexOf('pairs_key_5') > 0);

// flattened single-line paste with "←" and "o" bullets
const flat = Q.analyze(Q.blocksFromText('أسئلة الوصل (المزاوجة) س51) أ ← ب س52) ج ← د الشرح: o   أ: شرح أ. o   ج: شرح ج. التوضيح: ت المصدر المجمع: م الوقت المثالي لحل السؤال: 60 ثانية صعوبة السؤال: سهل'), 'x');
assert.strictEqual(flat.match.length, 1);
assert.strictEqual(flat.match[0].pairs.length, 2);
assert.strictEqual(flat.match[0].src, 'م');
assert.strictEqual(flat.match[0].difficulty, 'سهل');
assert.ok(Q.csvFiles(r, 'امتحان تجريبي').all.startsWith('\ufeffmark,question'));
console.log('questions parser: all tests passed');

// --- subjects: math / english (multi-line and flattened into one line) + xlsx
(function () {
  const fs = require('fs'), path = require('path');
  const fx = n => fs.readFileSync(path.join(__dirname, 'fixtures', n + '.txt'), 'utf8');
  [false, true].forEach(function (flat) {
    const m = Q.analyze(Q.blocksFromText(flat ? fx('math').replace(/\r?\n/g, ' ') : fx('math')), 'x');
    assert.strictEqual(m.profile.key, 'math');
    assert.strictEqual(m.errors.length, 0);
    assert.strictEqual(m.tf.length, 2); assert.strictEqual(m.mcq.length, 1);
    assert.deepStrictEqual(m.mcq[0].options.slice(0, 4), ['120°', '135°', '150°', '160°']);
    assert.ok(m.tf[0].steps && m.tf[0].idea);
    assert.ok(Q.csvFiles(m, 'x').tf.split('\r\n')[0].endsWith('mark,type'));
    const e = Q.analyze(Q.blocksFromText(flat ? fx('english').replace(/\r?\n/g, ' ') : fx('english')), 'x');
    assert.strictEqual(e.profile.key, 'english');
    assert.strictEqual(e.errors.length, 0);
    assert.strictEqual(e.tf.length, 2); assert.strictEqual(e.mcq.length, 1); assert.strictEqual(e.match.length, 1);
    assert.strictEqual(e.tf[1].correct_answer, 'صح');            // True -> صح
    assert.strictEqual(e.tf[0].correct_answer, 'خطأ');           // False -> خطأ
    assert.ok(e.tf[0].rule && e.tf[0].examples && e.tf[0].trans);
    assert.strictEqual(e.match[0].pairs.length, 2);
    assert.strictEqual(e.match[0].time, '40 ثانية');
    assert.strictEqual(Q.csvFiles(e, 'x').tf.split('\r\n')[0].indexOf('mark,question,correct_answer,category'), 1);
  });
  const e = Q.analyze(Q.blocksFromText(fx('english')), 'x');
  const JSZip = require('../web/qparser-assets/vendor/qparser-jszip.min.js');
  const t = Q.csvFiles(e, 'x').matchTable;
  Q.makeXlsx(JSZip, t.cols, t.rows, 'match', 'nodebuffer').then(function (buf) {
    assert.ok(buf.length > 1000);
    return JSZip.loadAsync(buf);
  }).then(function (z) { assert.ok(z.file('xl/worksheets/sheet1.xml')); console.log('subjects + xlsx: ok'); });
})();
