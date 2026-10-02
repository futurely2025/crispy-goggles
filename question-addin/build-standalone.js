// node build-standalone.js  -> QuestionParser.html (ملف واحد يعمل بالنقر المزدوج بدون أي تثبيت)
const fs = require('fs'), path = require('path');
const W = path.join(__dirname, 'web');
const rd = p => fs.readFileSync(path.join(W, p), 'utf8');
let html = rd('qparser.html');
html = html.replace(/<script src="https:\/\/appsforoffice[^>]*><\/script>\s*/, '');           // office.js غير لازم هنا
html = html.replace(/<link rel="icon"[^>]*>\s*/, '');
html = html.replace(/<link rel="stylesheet" href="([^"?]+)[^"]*">/, (_, p) => '<style>\n' + rd(p) + '\n</style>');
html = html.replace(/<script src="([^"?]+)[^"]*"><\/script>/g, (_, p) => '<script>\n' + rd(p).replace(/<\/script/gi, '<\\/script') + '\n</script>');
html = html.replace('<title>محلل الأسئلة</title>', '<title>محلل الأسئلة</title>\n  <!-- ملف واحد مستقل: يعمل بالنقر المزدوج في أي متصفح، بدون إنترنت وبدون تثبيت -->');
fs.writeFileSync(path.join(__dirname, 'QuestionParser.html'), html);
console.log('QuestionParser.html', (html.length / 1024).toFixed(0) + ' KB');
