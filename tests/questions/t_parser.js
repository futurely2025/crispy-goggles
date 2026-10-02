// node tests/questions/t_parser.js  — unit tests for web/js/questions/parser.js (no browser needed)
const assert = require('assert');
const Q = require('../../web/js/questions/parser.js');

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
assert.ok(Q.csvFiles(r, 'امتحان تجريبي').all.startsWith('\ufeffmark,question'));
console.log('questions parser: all tests passed');
