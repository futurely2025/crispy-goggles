/*
 * Physics markup: the data of a physics figure is its code, so parse/serialize are thin.
 * Also holds the ready-made templates used by the physics studio (each builds code from a few parameters).
 */
(function (global) {
  'use strict';
  function parse(opts, body) {
    var code = '\\begin{physics}' + (opts ? '[' + opts + ']' : '') + '\n' + String(body || '').replace(/^\n+|\s+$/g, '') + '\n\\end{physics}';
    PhysicsRender.scene(code);                       // validate now so errors show up early
    return { v: 1, code: code };
  }
  function serialize(d) { return String(d && d.code || '').trim(); }

  function n(v) { return String(+(+v).toFixed(3)); }
  var T = {
    incline: { t: 'جسم على مستوى مائل|Block on an incline', p: [['angle', 'زاوية الميل|Angle', 30], ['friction', 'الاحتكاك (1 نعم)|Friction (1 = yes)', 1], ['pull', 'قوة شد (1 نعم)|Pulling force', 0]],
      code: function (p) {
        var L = ['\\begin{physics}', '  \\incline[angle=' + n(p.angle) + ', base=7, name=م]{(0,0)}', '  \\block[on=م, at=0.55, w=1.5, h=1, name=ج]{ك}',
          '  \\force[from=ج, angle=-90, len=2.2]{و}', '  \\force[from=ج, dir=normal, len=1.9, color=blue]{ر}'];
        if (+p.friction) L.push('  \\force[from=ج, dir=' + (+p.pull ? 'against' : 'along') + ', len=1.4, color=orange]{ح}');
        if (+p.pull) L.push('  \\force[from=ج, dir=along, len=2, color=green]{ق}');
        L.push('\\end{physics}'); return L.join('\n');
      } },
    inclineComp: { t: 'تحليل الوزن على مستوى مائل|Weight components on an incline', p: [['angle', 'زاوية الميل|Angle', 30]],
      code: function (p) {
        return ['\\begin{physics}', '  \\incline[angle=' + n(p.angle) + ', base=7, name=م]{(0,0)}', '  \\block[on=م, at=0.55, w=1.5, h=1, name=ج]{ك}',
          '  \\force[from=ج, angle=-90, len=2.4]{و}', '  \\force[from=ج, dir=normal, angle=180, len=' + n(2.4 * Math.cos(p.angle * Math.PI / 180)) + ', dashed, color=purple]{و جتا θ}',
          '  \\force[from=ج, dir=against, len=' + n(2.4 * Math.sin(p.angle * Math.PI / 180)) + ', dashed, color=purple]{و جا θ}', '  \\force[from=ج, dir=normal, len=2, color=blue]{ر}', '\\end{physics}'].join('\n');
      } },
    ground: { t: 'جسم على سطح أفقي|Block on a horizontal surface', p: [['angle', 'زاوية قوة الشد|Pull angle', 30], ['friction', 'الاحتكاك (1 نعم)|Friction', 1]],
      code: function (p) {
        var L = ['\\begin{physics}', '  \\ground{(-1,0)}{(7,0)}', '  \\block[at=(3,0), w=1.8, h=1.1, name=ج]{ك}', '  \\force[from=ج, angle=-90, len=2]{و}', '  \\force[from=ج, angle=90, len=2, color=blue]{ر}',
          '  \\force[from=ج, angle=' + n(p.angle) + ', len=2.4, color=green]{ق}'];
        if (+p.angle) L.push('  \\arc[label=θ, r=0.9]{(3,0.55)}{0}{' + n(p.angle) + '}');
        if (+p.friction) L.push('  \\force[from=ج, angle=180, len=1.5, color=orange]{ح}');
        L.push('\\end{physics}'); return L.join('\n');
      } },
    hanging: { t: 'جسم معلّق بحبلين|Mass hung by two ropes', p: [['a1', 'زاوية الحبل الأول|Rope 1 angle', 40], ['a2', 'زاوية الحبل الثاني|Rope 2 angle', 55]],
      code: function (p) {
        var r = Math.PI / 180, x1 = -3, x2 = 3, y = 0;
        // knot K below the ceiling so that the ropes make the given angles with the ceiling
        var t1 = Math.tan(p.a1 * r), t2 = Math.tan(p.a2 * r), kx = (x1 * t1 + x2 * t2) / (t1 + t2), ky = y - (kx - x1) * t1;
        return ['\\begin{physics}', '  \\ceiling{(-3.8,0)}{(3.8,0)}', '  \\rope{(' + x1 + ',0) (' + n(kx) + ',' + n(ky) + ') (' + x2 + ',0)}', '  \\rope{(' + n(kx) + ',' + n(ky) + ') (' + n(kx) + ',' + n(ky - 1.2) + ')}',
          '  \\block[hang=(' + n(kx) + ',' + n(ky - 1.2) + '), w=1.2, h=1]{ك}', '  \\force[at=(' + n(kx) + ',' + n(ky) + '), to=(' + n(kx + (x1 - kx) * 0.45) + ',' + n(ky + (0 - ky) * 0.45) + '), color=blue]{ش₁}',
          '  \\force[at=(' + n(kx) + ',' + n(ky) + '), to=(' + n(kx + (x2 - kx) * 0.45) + ',' + n(ky + (0 - ky) * 0.45) + '), color=blue]{ش₂}', '  \\force[at=(' + n(kx) + ',' + n(ky - 1.7) + '), angle=-90, len=1.6]{و}',
          '  \\arc[label=' + n(p.a1) + '°, r=0.8]{(' + x1 + ',0)}{-' + n(p.a1) + '}{0}', '  \\arc[label=' + n(p.a2) + '°, r=0.8]{(' + x2 + ',0)}{180}{' + n(180 + +p.a2) + '}', '\\end{physics}'].join('\n');
      } },
    atwood: { t: 'آلة أتوود (بكرة وجسمان)|Atwood machine', p: [['h1', 'ارتفاع الجسم الأول|Height 1', 1.5], ['h2', 'ارتفاع الجسم الثاني|Height 2', 3]],
      code: function (p) {
        return ['\\begin{physics}', '  \\pulley[r=0.7]{(0,5)}', '  \\rope{(-0.7,5) (-0.7,' + n(+p.h1 + 1) + ')}', '  \\rope{(0.7,5) (0.7,' + n(+p.h2 + 1) + ')}',
          '  \\block[hang=(-0.7,' + n(+p.h1 + 1) + '), w=1, h=1, name=أ]{ك₁}', '  \\block[hang=(0.7,' + n(+p.h2 + 1) + '), w=1, h=0.8, name=ب]{ك₂}',
          '  \\force[from=أ, angle=-90, len=1.4]{و₁}', '  \\force[from=ب, angle=-90, len=1.1]{و₂}', '  \\force[from=أ.top, angle=90, len=' + n(Math.max(0.5, Math.min(1, (4 - p.h1) * 0.55))) + ', color=blue, pos=left]{ش}', '  \\force[from=ب.top, angle=90, len=' + n(Math.max(0.5, Math.min(1, (4 - p.h2) * 0.55))) + ', color=blue, pos=right]{ش}', '\\end{physics}'].join('\n');
      } },
    tablePulley: { t: 'جسم على طاولة مع بكرة|Table with a pulley', p: [['friction', 'الاحتكاك (1 نعم)|Friction', 1]],
      code: function (p) {
        var L = ['\\begin{physics}', '  \\ground{(-1,3)}{(5.4,3)}', '  \\line{(5.4,3)}{(5.4,0)}', '  \\pulley[r=0.4, mount=none]{(5.8,3.4)}', '  \\block[at=(2,3), w=1.6, h=1, name=أ]{ك₁}',
          '  \\rope{(2.8,3.5) (5.8,3.8)}', '  \\rope{(6.2,3.4) (6.2,1.6)}', '  \\block[hang=(6.2,1.6), w=0.9, h=0.9, name=ب]{ك₂}',
          '  \\force[from=أ.right, angle=0, len=1.3, color=blue]{ش}', '  \\force[from=ب, angle=-90, len=1.4]{و₂}', '  \\force[from=ب.top, angle=90, len=0.85, color=blue, pos=right]{ش}'];
        if (+p.friction) L.push('  \\force[from=أ.left, angle=180, len=1.2, color=orange]{ح}');
        L.push('\\end{physics}'); return L.join('\n');
      } },
    spring: { t: 'نابض وجسم|Spring and mass', p: [['x', 'الاستطالة|Extension', 1]],
      code: function (p) {
        return ['\\begin{physics}', '  \\wall{(0,0)}{(0,2.2)}', '  \\ground{(0,0)}{(8,0)}', '  \\spring[coils=9]{(0,0.6)}{(' + n(3 + +p.x) + ',0.6)}',
          '  \\block[at=(' + n(3.7 + +p.x) + ',0), w=1.4, h=1.2, name=ج]{ك}', '  \\force[from=ج.right, angle=0, len=1.5, color=green]{ق}', '  \\force[at=(' + n(3 + +p.x) + ',1.02), angle=180, len=1.1, color=blue, pos=above]{ق ن}',
          '  \\dashed{(3,0)}{(3,2)}', '  \\dim[label=س, offset=0]{(3,1.9)}{(' + n(3 + +p.x) + ',1.9)}', '\\end{physics}'].join('\n');
      } },
    projectile: { t: 'حركة المقذوفات|Projectile motion', p: [['v', 'السرعة الابتدائية (م/ث)|Speed (m/s)', 20], ['angle', 'زاوية الإطلاق|Angle', 45]],
      code: function (p) { return ['\\begin{physics}', '  \\projectile[v=' + n(p.v) + ', angle=' + n(p.angle) + ', g=9.8, marks]{(0,0)}', '\\end{physics}'].join('\n'); } },
    pendulum: { t: 'البندول البسيط|Simple pendulum', p: [['angle', 'زاوية الإزاحة|Angle', 25]],
      code: function (p) {
        var r = p.angle * Math.PI / 180, L = 4, bx = L * Math.sin(r), by = -L * Math.cos(r);
        return ['\\begin{physics}', '  \\ceiling{(-2,0)}{(2,0)}', '  \\dashed{(0,0)}{(0,-4.3)}', '  \\rope{(0,0) (' + n(bx) + ',' + n(by) + ')}', '  \\ball[r=0.35, name=ك]{(' + n(bx) + ',' + n(by) + ')}',
          '  \\arc[label=θ, r=1.3]{(0,0)}{-90}{' + n(-90 + +p.angle) + '}', '  \\force[from=ك, angle=-90, len=1.6]{و}', '  \\force[from=ك, to=(' + n(bx * 0.62) + ',' + n(by * 0.62) + '), color=blue]{ش}', '\\end{physics}'].join('\n');
      } },
    lever: { t: 'الرافعة والعزوم|Lever and moments', p: [['d1', 'ذراع القوة الأولى|Arm 1', 3], ['d2', 'ذراع القوة الثانية|Arm 2', 2]],
      code: function (p) {
        return ['\\begin{physics}', '  \\beam{(-' + n(p.d1) + ',0.5)}{(' + n(p.d2) + ',0.5)}', '  \\pivot{(0,0.39)}', '  \\ground{(-' + n(+p.d1 + 0.5) + ',0)}{(' + n(+p.d2 + 0.5) + ',0)}',
          '  \\force[at=(-' + n(p.d1) + ',2.4), to=(-' + n(p.d1) + ',0.62), pos=left]{ق₁}', '  \\force[at=(' + n(p.d2) + ',2.4), to=(' + n(p.d2) + ',0.62), pos=right]{ق₂}',
          '  \\dim[label=ف₁, offset=-0.9]{(-' + n(p.d1) + ',0.3)}{(0,0.3)}', '  \\dim[label=ف₂, offset=-0.9]{(0,0.3)}{(' + n(p.d2) + ',0.3)}', '\\end{physics}'].join('\n');
      } },
    vectors: { t: 'جمع متجهين (متوازي الأضلاع)|Adding two vectors', p: [['a', 'مقدار الأول||A|', 3], ['b', 'مقدار الثاني|B', 2.5], ['angle', 'الزاوية بينهما|Angle', 50]],
      code: function (p) {
        var r = p.angle * Math.PI / 180, bx = p.b * Math.cos(r), by = p.b * Math.sin(r);
        return ['\\begin{physics}', '  \\vector[at=(0,0), to=(' + n(p.a) + ',0)]{$\\vec{أ}$}', '  \\vector[at=(0,0), to=(' + n(bx) + ',' + n(by) + '), color=green]{$\\vec{ب}$}',
          '  \\dashed{(' + n(p.a) + ',0)}{(' + n(+p.a + bx) + ',' + n(by) + ')}', '  \\dashed{(' + n(bx) + ',' + n(by) + ')}{(' + n(+p.a + bx) + ',' + n(by) + ')}',
          '  \\vector[at=(0,0), to=(' + n(+p.a + bx) + ',' + n(by) + '), color=red, width=2.8]{$\\vec{ح}$}', '  \\arc[label=θ, r=0.8]{(0,0)}{0}{' + n(p.angle) + '}', '\\end{physics}'].join('\n');
      } },
    components: { t: 'تحليل متجه إلى مركبتين|Vector components', p: [['v', 'المقدار|Magnitude', 4], ['angle', 'الزاوية|Angle', 35]],
      code: function (p) {
        var r = p.angle * Math.PI / 180, x = p.v * Math.cos(r), y = p.v * Math.sin(r);
        return ['\\begin{physics}', '  \\axes[x=س, y=ص, len=' + n(Math.max(x, y) + 1) + ']{(0,0)}', '  \\vector[at=(0,0), to=(' + n(x) + ',' + n(y) + '), color=red, width=2.8]{ق}',
          '  \\vector[at=(0,0), to=(' + n(x) + ',0), dashed, pos=below]{ق جتا θ}', '  \\vector[at=(0,0), to=(0,' + n(y) + '), dashed, pos=left]{ق جا θ}', '  \\dashed{(' + n(x) + ',0)}{(' + n(x) + ',' + n(y) + ')}', '  \\dashed{(0,' + n(y) + ')}{(' + n(x) + ',' + n(y) + ')}',
          '  \\arc[label=θ, r=0.9]{(0,0)}{0}{' + n(p.angle) + '}', '\\end{physics}'].join('\n');
      } },
    circular: { t: 'الحركة الدائرية|Circular motion', p: [['r', 'نصف القطر|Radius', 2.5]],
      code: function (p) {
        return ['\\begin{physics}', '  \\circle[r=' + n(p.r) + ', dashed]{(0,0)}', '  \\point[label=م]{(0,0)}', '  \\ball[r=0.3, name=ك]{(' + n(p.r) + ',0)}', '  \\line{(0,0)}{(' + n(p.r) + ',0)}',
          '  \\force[from=ك, angle=180, len=1.3, pos=below]{ق م}', '  \\velocity[from=ك, angle=90, len=1.6]{ع}', '\\end{physics}'].join('\n');
      } },
    convexLens: { t: 'عدسة محدبة (تكوين الصورة)|Convex lens ray diagram', p: [['f', 'البعد البؤري|Focal length', 2], ['u', 'بعد الجسم|Object distance', 5], ['h', 'طول الجسم|Object height', 1.2]],
      code: function (p) { return ['\\begin{physics}', '  \\lens[type=convex, f=' + n(p.f) + ', object=' + n(p.u) + ', height=' + n(p.h) + ']{(0,0)}', '\\end{physics}'].join('\n'); } },
    concaveLens: { t: 'عدسة مقعرة|Concave lens', p: [['f', 'البعد البؤري|Focal length', 2], ['u', 'بعد الجسم|Object distance', 4], ['h', 'طول الجسم|Object height', 1.2]],
      code: function (p) { return ['\\begin{physics}', '  \\lens[type=concave, f=' + n(p.f) + ', object=' + n(p.u) + ', height=' + n(p.h) + ']{(0,0)}', '\\end{physics}'].join('\n'); } },
    concaveMirror: { t: 'مرآة مقعرة|Concave mirror', p: [['f', 'البعد البؤري|Focal length', 2], ['u', 'بعد الجسم|Object distance', 5], ['h', 'طول الجسم|Object height', 1.2]],
      code: function (p) { return ['\\begin{physics}', '  \\mirror[type=concave, f=' + n(p.f) + ', object=' + n(p.u) + ', height=' + n(p.h) + ']{(0,0)}', '\\end{physics}'].join('\n'); } },
    convexMirror: { t: 'مرآة محدبة|Convex mirror', p: [['f', 'البعد البؤري|Focal length', 2], ['u', 'بعد الجسم|Object distance', 4], ['h', 'طول الجسم|Object height', 1.2]],
      code: function (p) { return ['\\begin{physics}', '  \\mirror[type=convex, f=' + n(p.f) + ', object=' + n(p.u) + ', height=' + n(p.h) + ']{(0,0)}', '\\end{physics}'].join('\n'); } },
    charges: { t: 'شحنتان نقطيتان (قانون كولوم)|Two point charges', p: [['d', 'المسافة|Distance', 5]],
      code: function (p) {
        return ['\\begin{physics}', '  \\charge[q=+, label=ش₁]{(0,0)}', '  \\charge[q=-, label=ش₂]{(' + n(p.d) + ',0)}', '  \\force[at=(0.4,0), angle=0, len=1.4]{ق}', '  \\force[at=(' + n(p.d - 0.4) + ',0), angle=180, len=1.4]{ق}',
          '  \\dim[label=ف, offset=-0.9]{(0,0)}{(' + n(p.d) + ',0)}', '\\end{physics}'].join('\n');
      } },
    motionVT: { t: 'منحنى (السرعة – الزمن)|Velocity–time graph', p: [['v', 'السرعة العظمى|Top speed', 10], ['t1', 'زمن التسارع|Accelerating for', 2], ['t2', 'زمن الحركة المنتظمة|Constant for', 3], ['t3', 'زمن التباطؤ|Slowing for', 2]],
      code: function (p) { var a = +p.t1, b = a + +p.t2, c = b + +p.t3; return ['\\begin{physics}', '  \\motion[type=vt, area, slopes, names={أ,ب,جـ,د}]{(0,0) (' + n(a) + ',' + n(p.v) + ') (' + n(b) + ',' + n(p.v) + ') (' + n(c) + ',0)}', '\\end{physics}'].join('\n'); } },
    motionXT: { t: 'منحنى (الإزاحة – الزمن)|Displacement–time graph', p: [['x', 'أقصى إزاحة|Max displacement', 15], ['t1', 'زمن الذهاب|Going for', 3], ['t2', 'زمن التوقف|Stopped for', 2], ['t3', 'زمن العودة|Returning for', 3]],
      code: function (p) { var a = +p.t1, b = a + +p.t2, c = b + +p.t3; return ['\\begin{physics}', '  \\motion[type=xt, slopes]{(0,0) (' + n(a) + ',' + n(p.x) + ') (' + n(b) + ',' + n(p.x) + ') (' + n(c) + ',0)}', '\\end{physics}'].join('\n'); } },
    wave: { t: 'موجة مستعرضة|Transverse wave', p: [['a', 'السعة|Amplitude', 1], ['l', 'الطول الموجي|Wavelength', 4]],
      code: function (p) { return ['\\begin{physics}', '  \\wave[amplitude=' + n(p.a) + ', wavelength=' + n(p.l) + ', length=' + n(2.5 * p.l) + ']{(0,0)}', '\\end{physics}'].join('\n'); } },
    longWave: { t: 'موجة طولية (تضاغط وتخلخل)|Longitudinal wave', p: [['l', 'الطول الموجي|Wavelength', 3]],
      code: function (p) { return ['\\begin{physics}', '  \\wave[amplitude=1, wavelength=' + n(p.l) + ', length=' + n(3 * p.l) + ', type=long]{(0,0)}', '\\end{physics}'].join('\n'); } },
    capacitor: { t: 'مجال كهربائي بين لوحين|Field between plates', p: [['n', 'عدد خطوط المجال|Field lines', 5]],
      code: function (p) {
        return ['\\begin{physics}', '  \\plate[sign=+]{(0,0)}{(0,3)}', '  \\plate[sign=−]{(4,0)}{(4,3)}', '  \\field[angle=0, len=3.6, n=' + (+p.n | 0) + ', label=مج]{(0.2,0.3)}{(0.2,2.7)}', '\\end{physics}'].join('\n');
      } }
  };
  global.PhysicsMarkup = { parse: parse, serialize: serialize, TEMPLATES: T };
})(window);
