/* Protect PDF — AES-256 encryption with an open password and an owner password + permissions (qpdf, in the browser). */
(function () {
  'use strict';
  var h = T.h, main = T.shell('protect');
  var doc = null;
  var zone = T.dropzone({ accept: '.pdf,application/pdf', label: 'اختر ملف PDF لحمايته', hint: 'أو اسحب الملف وأفلته هنا', test: T.isPdf, onFiles: function (fs) { open(fs[0]); } });
  function pw(label, ph) { return h('input', { class: 'tl-in', type: 'password', autocomplete: 'new-password', dir: 'ltr', placeholder: ph || '', 'aria-label': label }); }
  var user = pw('كلمة مرور الفتح'), user2 = pw('تأكيد كلمة المرور'), owner = pw('كلمة مرور المالك', 'اختياري — تُولَّد تلقائياً إن تُركت فارغة');
  var meter = h('div', { class: 'tl-bar', style: 'height:6px' }, h('i')), meterT = h('small', { class: 'tl-muted' });
  var show = h('input', { type: 'checkbox' });
  var perm = {
    print: T.select([['full', 'مسموحة بجودة كاملة'], ['low', 'مسموحة بجودة منخفضة'], ['none', 'ممنوعة']], 'full'),
    modify: T.select([['all', 'مسموح'], ['annotate', 'التعليقات وتعبئة النماذج فقط'], ['form', 'تعبئة النماذج فقط'], ['assembly', 'تجميع الصفحات فقط'], ['none', 'ممنوع']], 'none'),
    extract: T.select([['y', 'مسموح'], ['n', 'ممنوع']], 'y')
  };
  var info = h('div'), resultHost = h('div'), err = h('p', { class: 'tl-err' });
  var go = h('button', { class: 'tl-btn primary big block', type: 'button', text: '🔒 حماية الملف', onclick: run });
  var card = h('div', { class: 'tl-card', hidden: true, style: 'max-width:640px;margin:0 auto;width:100%' }, [info,
    h('h2', { text: 'كلمة المرور' }), T.field('كلمة مرور فتح الملف', user), meter, meterT, h('div', { style: 'height:10px' }), T.field('تأكيد كلمة المرور', user2),
    h('label', { class: 'tl-check' }, [show, h('span', { text: 'إظهار كلمات المرور' })]),
    h('h2', { text: 'الصلاحيات', style: 'margin-top:14px' }), h('p', { class: 'tl-muted', text: 'تُطبَّق هذه القيود في برامج PDF الملتزمة بالمعيار. كلمة مرور المالك تتيح تغييرها لاحقاً.' }),
    T.field('الطباعة', perm.print), T.field('التعديل', perm.modify), T.field('نسخ النص والصور', perm.extract), T.field('كلمة مرور المالك', owner), err, go]);
  main.appendChild(zone); main.appendChild(card); main.appendChild(resultHost);
  show.onchange = function () { [user, user2, owner].forEach(function (i) { i.type = show.checked ? 'text' : 'password'; }); };

  function strength(s) {
    var sc = 0; if (s.length >= 8) sc++; if (s.length >= 12) sc++; if (/[a-z]/.test(s) && /[A-Z]/.test(s)) sc++; if (/\d/.test(s)) sc++; if (/[^A-Za-z0-9]/.test(s)) sc++;
    return Math.min(4, sc);
  }
  user.oninput = function () {
    var s = strength(user.value), c = ['#c2352b', '#c2352b', '#e08a1e', '#7aa81f', '#1f8a4c'][s], t = ['ضعيفة جداً', 'ضعيفة', 'متوسطة', 'جيدة', 'قوية'][s];
    meter.firstChild.style.width = user.value ? (s + 1) * 20 + '%' : '0'; meter.firstChild.style.background = c; meterT.textContent = user.value ? 'قوة كلمة المرور: ' + t : '';
  };
  function open(file) {
    T.task('جارٍ فتح الملف…', function () { return T.openPdf(file); }).then(function (d) {
      doc = d; zone.hidden = true; card.hidden = false; resultHost.innerHTML = '';
      info.innerHTML = ''; info.appendChild(h('div', { class: 'tl-row wrap', style: 'margin-bottom:10px' }, [h('b', { text: d.name }), h('span', { class: 'tl-muted', text: d.pages + ' صفحة · ' + T.fmtSize(d.bytes.length) }), h('span', { style: 'flex:1' }),
        h('button', { class: 'tl-btn sm', type: 'button', text: 'ملف آخر', onclick: function () { doc = null; zone.hidden = false; card.hidden = true; } })]));
    }, function (e) { T.fail(e, 'تعذّر فتح الملف'); });
  }
  function rnd() { var a = new Uint8Array(18); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (x) { return 'abcdefghjkmnpqrstuvwxyz23456789'[x % 31]; }).join(''); }

  function run() {
    err.textContent = '';
    if (!user.value) { err.textContent = 'اكتب كلمة مرور لفتح الملف'; user.focus(); return; }
    if (user.value !== user2.value) { err.textContent = 'كلمتا المرور غير متطابقتين'; user2.focus(); return; }
    var ownerPw = owner.value || rnd();
    var args = [];
    if (doc.password) args.push('--password=' + doc.password);
    args.push('--encrypt', user.value, ownerPw, '256', '--print=' + perm.print.value, '--modify=' + perm.modify.value, '--extract=' + perm.extract.value, '--accessibility=y', '--', '$IN', '$OUT');
    T.task('جارٍ التشفير…', function () { return T.qpdf(doc.bytes, args); }).then(function (r) {
      if (!r.bytes) throw new Error('فشل التشفير (رمز ' + r.code + ') ' + (r.log || '').slice(0, 160));
      var name = T.baseName(doc.name) + '_protected.pdf';
      resultHost.innerHTML = '';
      var card2 = T.resultCard('تمت حماية الملف', 'تشفير AES-256 · ' + T.fmtSize(r.bytes.length), [{ label: 'تنزيل ' + name, name: name, data: r.bytes, mime: 'application/pdf' }]);
      if (!owner.value) card2.appendChild(h('p', { class: 'tl-muted', text: 'لم تحدد كلمة مرور مالك، فولّدنا واحدة عشوائية لا يعرفها أحد: لن تستطيع تغيير الصلاحيات لاحقاً، لكن الفتح بكلمة مرور المستخدم يعمل.' }));
      card2.appendChild(h('p', { class: 'tl-muted', text: 'احتفظ بكلمة المرور: لا يمكن استرجاعها إن نُسيت.' }));
      resultHost.appendChild(card2);
    }, function (e) { T.fail(e, 'تعذّرت الحماية'); });
  }
})();
