/* Formula library (مكتبة القوانين) — ready-made laws by subject, in Arabic notation */
(function (global) {
  'use strict';
  var LIB = [
    { c: 'الجبر', e: 'Algebra', items: [
      ['القانون العام', 'Quadratic formula', 'س = \\frac{-ب \\pm \\sqrt{ب^2 - 4 أ جـ}}{2 أ}'],
      ['المميز', 'Discriminant', '\\Delta = ب^2 - 4 أ جـ'],
      ['مربع مجموع', 'Square of a sum', '(أ + ب)^2 = أ^2 + 2 أ ب + ب^2'],
      ['فرق مربعين', 'Difference of squares', 'أ^2 - ب^2 = (أ - ب)(أ + ب)'],
      ['قوانين الأسس', 'Exponent laws', 'س^م \\times س^ن = س^{م + ن}'],
      ['اللوغاريتم', 'Log of a product', 'لو_{أ}(س ص) = لو_{أ} س + لو_{أ} ص'],
      ['مجموع متتابعة حسابية', 'Arithmetic series', 'جـ_ن = \\frac{ن}{2}\\left(2 أ + (ن - 1) د\\right)'],
      ['مجموع متتابعة هندسية', 'Geometric series', 'جـ_ن = \\frac{أ(1 - ر^ن)}{1 - ر}']
    ]},
    { c: 'حساب المثلثات', e: 'Trigonometry', items: [
      ['متطابقة فيثاغورس', 'Pythagorean identity', 'جا^2 س + جتا^2 س = 1'],
      ['الظل', 'Tangent', 'طا س = \\frac{جا س}{جتا س}'],
      ['جيب مجموع زاويتين', 'Sine of a sum', 'جا(أ + ب) = جا أ \\, جتا ب + جتا أ \\, جا ب'],
      ['ضعف الزاوية', 'Double angle', 'جا 2س = 2 \\, جا س \\, جتا س'],
      ['قانون الجيوب', 'Law of sines', '\\frac{أ}{جا أ} = \\frac{ب}{جا ب} = \\frac{جـ}{جا جـ}'],
      ['قانون جيب التمام', 'Law of cosines', 'أ^2 = ب^2 + جـ^2 - 2 ب جـ \\, جتا أ']
    ]},
    { c: 'الهندسة', e: 'Geometry', items: [
      ['نظرية فيثاغورس', 'Pythagoras', 'أ^2 + ب^2 = جـ^2'],
      ['مساحة الدائرة', 'Circle area', 'م = \\pi \\, نق^2'],
      ['محيط الدائرة', 'Circumference', 'ح = 2 \\pi \\, نق'],
      ['مساحة المثلث', 'Triangle area', 'م = \\frac{1}{2} \\times ق \\times ع'],
      ['حجم الكرة', 'Sphere volume', 'ح = \\frac{4}{3} \\pi \\, نق^3'],
      ['البعد بين نقطتين', 'Distance', 'ف = \\sqrt{(س_2 - س_1)^2 + (ص_2 - ص_1)^2}'],
      ['ميل المستقيم', 'Slope', 'م = \\frac{ص_2 - ص_1}{س_2 - س_1}']
    ]},
    { c: 'التفاضل والتكامل', e: 'Calculus', items: [
      ['نهاية شهيرة', 'Famous limit', 'نها_{س \\to 0} \\frac{جا س}{س} = 1'],
      ['تعريف المشتقة', 'Derivative definition', 'د\'(س) = نها_{هـ \\to 0} \\frac{د(س + هـ) - د(س)}{هـ}'],
      ['مشتقة القوة', 'Power rule', '\\frac{ء}{ءس} س^ن = ن \\, س^{ن - 1}'],
      ['مشتقة الضرب', 'Product rule', '(ع \\, ل)\' = ع\' \\, ل + ع \\, ل\''],
      ['تكامل القوة', 'Power integral', '\\int س^ن \\, ءس = \\frac{س^{ن + 1}}{ن + 1} + ث'],
      ['التكامل المحدد', 'Definite integral', '\\int_{أ}^{ب} د(س) \\, ءس = ق(ب) - ق(أ)']
    ]},
    { c: 'الإحصاء والاحتمال', e: 'Statistics', items: [
      ['الوسط الحسابي', 'Mean', '\\bar{س} = \\frac{\\sum س}{ن}'],
      ['الانحراف المعياري', 'Standard deviation', 'ع = \\sqrt{\\frac{\\sum (س - \\bar{س})^2}{ن}}'],
      ['التباديل', 'Permutations', 'ل(ن، ر) = \\frac{ن!}{(ن - ر)!}'],
      ['التوافيق', 'Combinations', '\\binom{ن}{ر} = \\frac{ن!}{ر! \\, (ن - ر)!}'],
      ['الاحتمال', 'Probability', 'ل(أ) = \\frac{ن(أ)}{ن(\\Omega)}']
    ]},
    { c: 'الفيزياء', e: 'Physics', items: [
      ['قانون نيوتن الثاني', "Newton's 2nd law", 'ق = ك \\times ت'],
      ['السرعة المتوسطة', 'Average speed', 'ع = \\frac{ف}{ز}'],
      ['معادلة الحركة', 'Motion equation', 'ف = ع_0 \\, ز + \\frac{1}{2} \\, ت \\, ز^2'],
      ['طاقة الحركة', 'Kinetic energy', 'ط_ح = \\frac{1}{2} ك \\, ع^2'],
      ['قانون أوم', "Ohm's law", 'جـ = ت \\times م'],
      ['طاقة أينشتاين', 'Mass–energy', 'ط = ك \\, س^2']
    ]},
    { c: 'الميكانيكا', e: 'Mechanics', items: [
      ['المعادلة الأولى للحركة', 'First equation of motion', 'ع = ع_0 + ت \\, ز'],
      ['المعادلة الثالثة للحركة', 'Third equation of motion', 'ع^2 = ع_0^2 + 2 \\, ت \\, ف'],
      ['السقوط الحر', 'Free fall', 'ف = \\frac{1}{2} \\, جـ \\, ز^2'],
      ['الوزن', 'Weight', 'و = ك \\, جـ'],
      ['قوة الاحتكاك', 'Friction', 'ح = \\mu \\, ر'],
      ['كمية الحركة', 'Momentum', 'كح = ك \\, ع'],
      ['الدفع', 'Impulse', 'ق \\, \\Delta ز = \\Delta (ك \\, ع)'],
      ['الشغل', 'Work', 'شغ = ق \\, ف \\, جتا \\theta'],
      ['القدرة', 'Power', 'قد = \\frac{شغ}{ز}'],
      ['طاقة الوضع', 'Potential energy', 'ط_و = ك \\, جـ \\, ف'],
      ['العزم', 'Torque', '\\tau = ق \\, ف \\, جا \\theta'],
      ['القوة المركزية', 'Centripetal force', 'ق_م = \\frac{ك \\, ع^2}{نق}'],
      ['المدى الأفقي للمقذوف', 'Projectile range', 'مد = \\frac{ع_0^2 \\, جا 2\\theta}{جـ}'],
      ['أقصى ارتفاع', 'Maximum height', 'ف = \\frac{ع_0^2 \\, جا^2 \\theta}{2 \\, جـ}'],
      ['قانون هوك', "Hooke's law", 'ق = -ك \\, س'],
      ['زمن البندول', 'Pendulum period', 'ن = 2\\pi \\sqrt{\\frac{ل}{جـ}}'],
      ['الجذب العام', 'Gravitation', 'ق = ثج \\, \\frac{ك_1 \\, ك_2}{ف^2}']
    ]},
    { c: 'الكهرباء والمغناطيسية', e: 'Electricity', items: [
      ['قانون كولوم', "Coulomb's law", 'ق = \\frac{1}{4\\pi\\varepsilon_0} \\cdot \\frac{ش_1 \\, ش_2}{ف^2}'],
      ['المجال الكهربائي', 'Electric field', 'مج = \\frac{ق}{ش}'],
      ['التوصيل على التوالي', 'Series resistors', 'م_{ك} = م_1 + م_2 + م_3'],
      ['التوصيل على التوازي', 'Parallel resistors', '\\frac{1}{م_{ك}} = \\frac{1}{م_1} + \\frac{1}{م_2} + \\frac{1}{م_3}'],
      ['القدرة الكهربائية', 'Electric power', 'قد = جـ \\, ت = ت^2 \\, م'],
      ['سعة المكثف', 'Capacitance', 'س = \\frac{ش}{جـ}'],
      ['قوة لورنتز', 'Lorentz force', 'ق = ش \\, ع \\, غ \\, جا \\theta'],
      ['قانون فاراداي', "Faraday's law", 'ق.د.ك = -ن \\, \\frac{\\Delta \\phi}{\\Delta ز}'],
      ['العدسات', 'Lens equation', '\\frac{1}{ع} = \\frac{1}{س} + \\frac{1}{ص}'],
      ['قانون سنل', "Snell's law", 'ن_1 \\, جا \\theta_1 = ن_2 \\, جا \\theta_2']
    ]},
    { c: 'الكيمياء', e: 'Chemistry', items: [
      ['عدد المولات', 'Moles', 'ن = \\frac{ك}{ك_م}'],
      ['التركيز المولاري', 'Molarity', 'م = \\frac{ن}{ح}'],
      ['قانون الغاز المثالي', 'Ideal gas law', 'ض \\, ح = ن \\, ر \\, د'],
      ['الرقم الهيدروجيني', 'pH', '\\mathrm{pH} = -\\log [\\mathrm{H^+}]'],
      ['التخفيف', 'Dilution', 'م_1 \\, ح_1 = م_2 \\, ح_2'],
      ['ثابت الاتزان', 'Equilibrium constant', 'ث_{اتزان} = \\frac{[\\mathrm{C}]^{جـ} \\, [\\mathrm{D}]^{د}}{[\\mathrm{A}]^{أ} \\, [\\mathrm{B}]^{ب}}'],
      ['احتراق الميثان', 'Methane combustion', '\\ce{CH4 + 2O2 -> CO2 + 2H2O}'],
      ['التعادل', 'Neutralisation', '\\ce{HCl + NaOH -> NaCl + H2O}']
    ]},
    { c: 'الإحصاء المتقدم', e: 'More statistics', items: [
      ['التباين', 'Variance', 'ع^2 = \\frac{\\sum (س - \\bar{س})^2}{ن}'],
      ['الوسط لجدول تكراري', 'Weighted mean', '\\bar{س} = \\frac{\\sum ت \\, س}{\\sum ت}'],
      ['الدرجة المعيارية', 'z-score', 'ز = \\frac{س - \\bar{س}}{ع}'],
      ['معامل الاختلاف', 'Coefficient of variation', 'م.خ = \\frac{ع}{\\bar{س}} \\times 100\\%'],
      ['معامل ارتباط بيرسون', "Pearson's r", 'ر = \\frac{ن \\sum س ص - \\sum س \\sum ص}{\\sqrt{\\left(ن \\sum س^2 - (\\sum س)^2\\right)\\left(ن \\sum ص^2 - (\\sum ص)^2\\right)}}'],
      ['التوزيع ذو الحدين', 'Binomial distribution', 'ل(س = ر) = \\binom{ن}{ر} \\, ل^ر \\, (1 - ل)^{ن - ر}']
    ]}
  ];
  global.FORMULA_LIBRARY = LIB;
})(window);
