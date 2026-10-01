/* Unlock PDF — remove the open password and the usage restrictions (needs the password if the file asks for one). */
(function () {
  'use strict';
  var h = T.h, main = T.shell('unlock');
  var zone = T.dropzone({ accept: '.pdf,application/pdf', label: 'اختر ملف PDF المحمي', hint: 'أو اسحب الملف وأفلته هنا', test: T.isPdf, onFiles: function (fs) { run(fs[0]); } });
  var resultHost = h('div');
  main.appendChild(zone); main.appendChild(h('p', { class: 'tl-muted', style: 'text-align:center', text: 'استخدم هذه الأداة لملفاتك أو للملفات التي تملك حق فتحها. إن كان الملف يطلب كلمة مرور للفتح فستحتاجها.' })); main.appendChild(resultHost);

  function run(file) {
    resultHost.innerHTML = '';
    T.task('جارٍ فتح الملف…', function () { return T.openPdf(file); }).then(function (d) {
      var args = []; if (d.password) args.push('--password=' + d.password);
      args.push('--decrypt', '$IN', '$OUT');
      return T.task('جارٍ فك الحماية…', function () { return T.qpdf(d.bytes, args); }).then(function (r) {
        if (!r.bytes) throw new Error('تعذّر فك الحماية: ' + (r.log || '').slice(0, 160));
        var wasLocked = !!d.password;
        // was the file restricted (owner password) even though it opened freely?
        return T.pdfLib().then(function (L) { return L.PDFDocument.load(d.bytes, { ignoreEncryption: true }).then(function (x) { return !!x.isEncrypted; }, function () { return wasLocked; }); }).then(function (enc) {
          var name = T.baseName(d.name) + '_unlocked.pdf';
          resultHost.appendChild(T.resultCard(enc || wasLocked ? 'تم فك الحماية' : 'الملف غير محمي أصلاً', d.pages + ' صفحة · ' + T.fmtSize(r.bytes.length), [{ label: 'تنزيل ' + name, name: name, data: r.bytes, mime: 'application/pdf' }]));
        });
      });
    }, function (e) { T.fail(e, 'تعذّر فك الحماية'); });
  }
})();
