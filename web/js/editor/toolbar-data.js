/*
 * Toolbar definitions (MathType-like tabs).
 * Each button: { i: insert (MathLive syntax: #0 = selection / first slot, #? = empty slot, #@ = previous atom),
 *                d: LaTeX for the icon (optional, defaults to i), t: Arabic tooltip, e: English tooltip,
 *                cmd: special command, w: wide button }
 * Groups are separated visually like MathType.
 */
(function (global) {
  'use strict';
  var S = '\\color{#94a3b8}{\\square}';          // slot box in icons
  function ic(tex) { return tex.replace(/#0|#\?|#@/g, S); }
  function b(i, t, e, d, extra) {
    var o = { i: i, t: t, e: e, d: d || ic(i) };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  function sym(latex, t, e) { return { i: latex, t: t || '', e: e || '', d: latex }; }

  var MATH_TABS = [
    { id: 'general', icon: '\\sqrt{' + S + '}\\,\\frac{' + S + '}{' + S + '}', t: 'عام', e: 'General', groups: [
      [b('\\frac{#0}{#?}', 'كسر', 'Fraction'), b('#0/#?', 'كسر مائل', 'Slash fraction'),
       b('\\sqrt{#0}', 'جذر تربيعي', 'Square root'), b('\\sqrt[#?]{#0}', 'جذر نوني', 'n-th root')],
      [b('#@^{#?}', 'أس', 'Superscript', S + '^{' + S + '}'), b('#@_{#?}', 'دليل سفلي', 'Subscript', S + '_{' + S + '}'),
       b('#@_{#?}^{#?}', 'دليل وأس', 'Sub & superscript', S + '_{' + S + '}^{' + S + '}')],
      [b('\\left(#0\\right)', 'أقواس', 'Parentheses'), b('\\left[#0\\right]', 'أقواس مربعة', 'Brackets'),
       b('\\left|#0\\right|', 'قيمة مطلقة', 'Absolute value'), b('\\left\\{#0\\right\\}', 'أقواس معقوفة', 'Braces')],
      [sym('+', 'زائد', 'Plus'), sym('-', 'ناقص', 'Minus'), sym('\\times', 'ضرب', 'Times'), sym('\\div', 'قسمة', 'Divide'),
       sym('\\pm', 'زائد أو ناقص', 'Plus-minus'), sym('\\cdot', 'نقطة ضرب', 'Dot'), sym('=', 'يساوي', 'Equals'), sym('\\neq', 'لا يساوي', 'Not equal')],
      [sym('\\leq', 'أصغر من أو يساوي', 'Less or equal'), sym('\\geq', 'أكبر من أو يساوي', 'Greater or equal'),
       sym('<', 'أصغر من', 'Less than'), sym('>', 'أكبر من', 'Greater than'), sym('\\approx', 'يقارب', 'Approximately'),
       sym('\\in', 'ينتمي', 'Element of'), sym('\\subset', 'مجموعة جزئية', 'Subset'), sym('\\cup', 'اتحاد', 'Union'),
       sym('\\cap', 'تقاطع', 'Intersection'), sym('\\emptyset', 'المجموعة الخالية', 'Empty set'),
       sym('\\infty', 'ما لا نهاية', 'Infinity'), sym('\\pi', 'باي', 'Pi')]
    ]},
    { id: 'symbols', icon: '\\in\\infty', t: 'رموز', e: 'Symbols', groups: [
      [sym('\\forall', 'لكل', 'For all'), sym('\\exists', 'يوجد', 'Exists'), sym('\\nexists', 'لا يوجد', 'Not exists'),
       sym('\\neg', 'نفي', 'Not'), sym('\\land', 'و', 'And'), sym('\\lor', 'أو', 'Or'), sym('\\Rightarrow', 'يؤدي إلى', 'Implies'),
       sym('\\Leftrightarrow', 'إذا وفقط إذا', 'Iff'), sym('\\therefore', 'إذن', 'Therefore'), sym('\\because', 'لأن', 'Because')],
      [sym('\\in', 'ينتمي', 'In'), sym('\\notin', 'لا ينتمي', 'Not in'), sym('\\ni', 'يحتوي', 'Contains'),
       sym('\\subset', 'جزئية', 'Subset'), sym('\\supset', 'تحتوي', 'Superset'), sym('\\subseteq', 'جزئية أو تساوي', 'Subset eq'),
       sym('\\supseteq', 'تحتوي أو تساوي', 'Superset eq'), sym('\\not\\subset', 'ليست جزئية', 'Not subset'),
       sym('\\cup', 'اتحاد', 'Union'), sym('\\cap', 'تقاطع', 'Intersection'), sym('\\setminus', 'فرق', 'Set minus'),
       sym('\\emptyset', 'خالية', 'Empty'), sym("#@'", 'متممة/شرطة', 'Prime')],
      [sym('\\mathbb{N}', 'الأعداد الطبيعية', 'Naturals'), sym('\\mathbb{Z}', 'الأعداد الصحيحة', 'Integers'),
       sym('\\mathbb{Q}', 'الأعداد النسبية', 'Rationals'), sym('\\mathbb{R}', 'الأعداد الحقيقية', 'Reals'),
       sym('\\mathbb{C}', 'الأعداد المركبة', 'Complex')],
      [sym('\\equiv', 'يطابق', 'Equivalent'), sym('\\not\\equiv', 'لا يطابق', 'Not equivalent'), sym('\\cong', 'يطابق (هندسة)', 'Congruent'),
       sym('\\sim', 'يشابه', 'Similar'), sym('\\simeq', 'يساوي تقريباً', 'Asymptotic'), sym('\\propto', 'يتناسب', 'Proportional'),
       sym('\\ll', 'أصغر بكثير', 'Much less'), sym('\\gg', 'أكبر بكثير', 'Much greater'), sym('\\mp', 'ناقص أو زائد', 'Minus-plus'),
       sym('\\ast', 'نجمة', 'Asterisk'), sym('\\circ', 'تركيب', 'Composition'), sym('\\bullet', 'نقطة', 'Bullet'),
       sym('\\oplus', 'جمع دائري', 'Oplus'), sym('\\otimes', 'ضرب دائري', 'Otimes')],
      [sym('^{\\circ}', 'درجة', 'Degree'), sym('\\angle', 'زاوية', 'Angle'), sym('\\measuredangle', 'قياس زاوية', 'Measured angle'),
       sym('\\triangle', 'مثلث', 'Triangle'), sym('\\perp', 'عمودي', 'Perpendicular'), sym('\\parallel', 'يوازي', 'Parallel'),
       sym('\\overline{#0}', 'قطعة مستقيمة', 'Segment', '\\overline{AB}'), sym('\\overleftrightarrow{#0}', 'مستقيم', 'Line', '\\overleftrightarrow{AB}'),
       sym('\\%', 'بالمئة', 'Percent'), sym('\\partial', 'تفاضل جزئي', 'Partial'), sym('\\nabla', 'نابلا', 'Nabla'),
       sym('\\hbar', 'ثابت بلانك', 'h-bar'), sym('\\ell', 'إل', 'ell'), sym('\\aleph', 'ألف', 'Aleph')],
      [sym('\\ldots', 'نقاط أفقية', 'Dots'), sym('\\cdots', 'نقاط وسطى', 'Center dots'), sym('\\vdots', 'نقاط رأسية', 'Vertical dots'),
       sym('\\ddots', 'نقاط مائلة', 'Diagonal dots')]
    ]},
    { id: 'arrows', icon: '\\rightarrow\\leftarrow', t: 'أسهم', e: 'Arrows', groups: [
      [sym('\\rightarrow', 'سهم', 'Right arrow'), sym('\\leftarrow', 'سهم', 'Left arrow'), sym('\\leftrightarrow', 'سهم باتجاهين', 'Both'),
       sym('\\uparrow', 'أعلى', 'Up'), sym('\\downarrow', 'أسفل', 'Down'), sym('\\updownarrow', 'أعلى وأسفل', 'Up-down'),
       sym('\\nearrow', 'مائل', 'NE'), sym('\\searrow', 'مائل', 'SE'), sym('\\swarrow', 'مائل', 'SW'), sym('\\nwarrow', 'مائل', 'NW')],
      [sym('\\Rightarrow', 'يؤدي', 'Implies'), sym('\\Leftarrow', 'ينتج من', 'Implied by'), sym('\\Leftrightarrow', 'تكافؤ', 'Equivalent'),
       sym('\\Uparrow', 'أعلى', 'Up'), sym('\\Downarrow', 'أسفل', 'Down'), sym('\\longrightarrow', 'سهم طويل', 'Long right'),
       sym('\\longleftarrow', 'سهم طويل', 'Long left'), sym('\\longleftrightarrow', 'سهم طويل', 'Long both'),
       sym('\\Longrightarrow', 'سهم طويل مزدوج', 'Long implies'), sym('\\Longleftrightarrow', 'تكافؤ طويل', 'Long iff'), sym('\\mapsto', 'يرسل إلى', 'Maps to')],
      [sym('\\rightleftharpoons', 'تفاعل عكسي', 'Equilibrium'), sym('\\rightharpoonup', 'نصف سهم', 'Harpoon'),
       sym('\\leftharpoondown', 'نصف سهم', 'Harpoon'), sym('\\hookrightarrow', 'سهم معقوف', 'Hook')],
      [b('\\xrightarrow{#?}', 'سهم فوقه نص', 'Arrow with text above'), b('\\xleftarrow{#?}', 'سهم فوقه نص', 'Arrow with text above'),
       b('\\xrightarrow[#?]{#?}', 'سهم فوقه وتحته نص', 'Arrow with text above & below'),
       b('\\overset{#?}{\\rightarrow}', 'سهم فوقه رمز', 'Symbol over arrow')]
    ]},
    { id: 'greek', icon: '\\Omega\\alpha', t: 'يونانية', e: 'Greek', groups: [
      'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega'
        .split(' ').map(function (n) { return sym('\\' + n, n, n); }),
      'Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega'
        .split(' ').map(function (n) { return sym('\\' + n, n, n); })
    ]},
    { id: 'matrix', icon: '\\begin{bmatrix}' + S + '&' + S + '\\\\' + S + '&' + S + '\\end{bmatrix}', t: 'مصفوفات', e: 'Matrices', groups: [
      [{ cmd: 'matrixPicker', t: 'مصفوفة بعدد صفوف وأعمدة تختاره', e: 'Matrix of any size', d: '\\begin{matrix}\\square&\\square&\\square\\\\\\square&\\square&\\square\\end{matrix}', w: 1 }],
      [b('\\begin{pmatrix}#0 & #?\\\\ #? & #?\\end{pmatrix}', 'مصفوفة ٢×٢ بأقواس', '2×2 matrix ()'),
       b('\\begin{bmatrix}#0 & #?\\\\ #? & #?\\end{bmatrix}', 'مصفوفة ٢×٢ بأقواس مربعة', '2×2 matrix []'),
       b('\\begin{vmatrix}#0 & #?\\\\ #? & #?\\end{vmatrix}', 'محدد ٢×٢', '2×2 determinant'),
       b('\\begin{pmatrix}#0 & #? & #?\\\\ #? & #? & #?\\\\ #? & #? & #?\\end{pmatrix}', 'مصفوفة ٣×٣', '3×3 matrix'),
       b('\\begin{vmatrix}#0 & #? & #?\\\\ #? & #? & #?\\\\ #? & #? & #?\\end{vmatrix}', 'محدد ٣×٣', '3×3 determinant'),
       b('\\begin{pmatrix}#0\\\\ #?\\end{pmatrix}', 'متجه عمودي', 'Column vector'),
       b('\\begin{pmatrix}#0 & #? & #?\\end{pmatrix}', 'متجه صفي', 'Row vector')],
      [b('\\begin{cases}#0 \\\\ #?\\end{cases}', 'نظام معادلتين', 'System of equations'),
       b('\\begin{cases}#0 & #? \\\\ #? & #?\\end{cases}', 'دالة متعددة التعريف', 'Piecewise function'),
       b('\\begin{cases}#0 \\\\ #? \\\\ #?\\end{cases}', 'نظام ثلاث معادلات', '3 equations'),
       b('\\begin{aligned}#0 &= #? \\\\ &= #?\\end{aligned}', 'خطوات حل بمحاذاة =', 'Aligned steps'),
       b('\\left[\\begin{array}{cc|c}#0 & #? & #?\\\\ #? & #? & #?\\end{array}\\right]', 'مصفوفة موسعة', 'Augmented matrix')],
      [{ cmd: 'addRowAfter', t: 'إضافة صف', e: 'Add row', d: '\\begin{matrix}' + S + '\\\\ \\color{#2b579a}{+}\\end{matrix}' },
       { cmd: 'addColumnAfter', t: 'إضافة عمود', e: 'Add column', d: S + '\\;\\color{#2b579a}{+}' },
       { cmd: 'removeRow', t: 'حذف الصف', e: 'Delete row', d: '\\begin{matrix}' + S + '\\\\ \\color{#b42318}{-}\\end{matrix}' },
       { cmd: 'removeColumn', t: 'حذف العمود', e: 'Delete column', d: S + '\\;\\color{#b42318}{-}' }],
      [sym('\\cdots', 'نقاط أفقية', 'cdots'), sym('\\vdots', 'نقاط رأسية', 'vdots'), sym('\\ddots', 'نقاط مائلة', 'ddots')]
    ]},
    { id: 'layout', icon: S + '_{' + S + '}^{' + S + '}', t: 'قوالب', e: 'Templates', groups: [
      [b('\\frac{#0}{#?}', 'كسر', 'Fraction'), b('\\dfrac{#0}{#?}', 'كسر كبير', 'Display fraction'), b('\\tfrac{#0}{#?}', 'كسر صغير', 'Small fraction'),
       b('\\cfrac{#0}{#?+\\cfrac{#?}{#?}}', 'كسر مستمر', 'Continued fraction'), b('\\binom{#0}{#?}', 'توافيق', 'Binomial')],
      [b('#@^{#?}', 'أس', 'Superscript', S + '^{' + S + '}'), b('#@_{#?}', 'دليل', 'Subscript', S + '_{' + S + '}'),
       b('#@_{#?}^{#?}', 'دليل وأس', 'Both', S + '_{' + S + '}^{' + S + '}'), b('{}_{#?}^{#?}#0', 'دليل وأس قبلي', 'Pre-scripts'),
       b('\\overset{#?}{#0}', 'رمز فوق', 'Over'), b('\\underset{#?}{#0}', 'رمز تحت', 'Under'),
       b('\\overset{#?}{\\underset{#?}{#0}}', 'فوق وتحت', 'Over & under')],
      [b('\\sqrt{#0}', 'جذر', 'Root'), b('\\sqrt[3]{#0}', 'جذر تكعيبي', 'Cube root'), b('\\sqrt[#?]{#0}', 'جذر نوني', 'n-th root')],
      [{ i: '\\ ', t: 'مسافة عادية (Space)', e: 'Normal space (Space key)', d: '\\text{a}\\ \\text{b}' },
       { i: '\\,', t: 'مسافة صغيرة', e: 'Thin space', d: '\\text{a}\\,\\text{b}' },
       { i: '\\;', t: 'مسافة متوسطة', e: 'Medium space', d: '\\text{a}\\;\\text{b}' },
       { i: '\\quad', t: 'مسافة كبيرة', e: 'Quad', d: '\\text{a}\\quad\\text{b}' },
       b('\\text{#0}', 'نص عادي', 'Text', '\\text{abc}')]
    ]},
    { id: 'decor', icon: '\\hat{' + S + '}\\,(' + S + ')', t: 'زخارف', e: 'Decorations', groups: [
      [b('\\vec{#0}', 'متجه', 'Vector'), b('\\overrightarrow{#0}', 'متجه طويل', 'Long vector'), b('\\overleftarrow{#0}', 'سهم علوي', 'Left arrow over'),
       b('\\overleftrightarrow{#0}', 'مستقيم', 'Line'), b('\\hat{#0}', 'قبعة', 'Hat'), b('\\widehat{#0}', 'قبعة عريضة', 'Wide hat'),
       b('\\bar{#0}', 'شرطة', 'Bar'), b('\\overline{#0}', 'خط علوي', 'Overline'), b('\\underline{#0}', 'خط سفلي', 'Underline'),
       b('\\tilde{#0}', 'تيلدا', 'Tilde'), b('\\widetilde{#0}', 'تيلدا عريضة', 'Wide tilde'), b('\\dot{#0}', 'نقطة', 'Dot'),
       b('\\ddot{#0}', 'نقطتان', 'Double dot'), b('\\check{#0}', 'علامة', 'Check'), b('\\breve{#0}', 'قوس', 'Breve'),
       b('\\acute{#0}', 'حادة', 'Acute'), b('\\grave{#0}', 'ثقيلة', 'Grave')],
      [b('\\overbrace{#0}^{#?}', 'قوس علوي', 'Overbrace'), b('\\underbrace{#0}_{#?}', 'قوس سفلي', 'Underbrace'),
       b('\\boxed{#0}', 'إطار', 'Box'), b('\\cancel{#0}', 'شطب', 'Cancel'), b('\\bcancel{#0}', 'شطب عكسي', 'Back cancel'),
       b('\\xcancel{#0}', 'شطب متقاطع', 'Cross out')],
      [b('\\left(#0\\right)', 'أقواس', 'Parentheses'), b('\\left[#0\\right]', 'أقواس مربعة', 'Brackets'),
       b('\\left\\{#0\\right\\}', 'أقواس معقوفة', 'Braces'), b('\\left\\langle#0\\right\\rangle', 'أقواس زاوية', 'Angle brackets'),
       b('\\left|#0\\right|', 'قيمة مطلقة', 'Abs'), b('\\left\\|#0\\right\\|', 'معيار', 'Norm'),
       b('\\left\\lfloor#0\\right\\rfloor', 'الجزء الصحيح', 'Floor'), b('\\left\\lceil#0\\right\\rceil', 'السقف', 'Ceiling'),
       b('\\left[#0\\right)', 'فترة نصف مغلقة', 'Half-open'), b('\\left(#0\\right]', 'فترة نصف مغلقة', 'Half-open'),
       b('\\left.#0\\right|_{#?}', 'تعويض', 'Evaluate at')]
    ]},
    { id: 'bigops', icon: '\\sum\\bigcup', t: 'مؤثرات كبيرة', e: 'Big operators', groups: [
      [b('\\sum_{#?}^{#?}#0', 'مجموع بحدود', 'Sum with limits'), b('\\sum_{#?}#0', 'مجموع', 'Sum'), b('\\sum #0', 'مجموع بسيط', 'Sum'),
       b('\\prod_{#?}^{#?}#0', 'جداء', 'Product'), b('\\coprod_{#?}^{#?}#0', 'جداء مرافق', 'Coproduct')],
      [b('\\bigcup_{#?}^{#?}#0', 'اتحاد', 'Union'), b('\\bigcap_{#?}^{#?}#0', 'تقاطع', 'Intersection'),
       b('\\bigvee_{#?}#0', 'أو كبيرة', 'Big or'), b('\\bigwedge_{#?}#0', 'و كبيرة', 'Big and'),
       b('\\bigoplus_{#?}#0', 'جمع مباشر', 'Direct sum'), b('\\bigotimes_{#?}#0', 'ضرب موتر', 'Tensor')],
      [b('\\int #0\\,d#?', 'تكامل', 'Integral'), b('\\int_{#?}^{#?}#0\\,d#?', 'تكامل محدد', 'Definite integral'),
       b('\\iint #0', 'تكامل ثنائي', 'Double integral'), b('\\iiint #0', 'تكامل ثلاثي', 'Triple integral'),
       b('\\oint #0', 'تكامل مغلق', 'Contour integral')]
    ]},
    { id: 'calculus', icon: '\\lim\\int', t: 'تفاضل وتكامل', e: 'Calculus', groups: [
      [b('\\lim_{#?\\to #?}#0', 'نهاية', 'Limit'), b('\\lim_{#?\\to\\infty}#0', 'نهاية عند ما لا نهاية', 'Limit at infinity'),
       b('\\lim_{#?\\to #?^{+}}#0', 'نهاية من اليمين', 'Right limit'), b('\\lim_{#?\\to #?^{-}}#0', 'نهاية من اليسار', 'Left limit'),
       b('\\limsup_{#?}#0', 'نهاية عليا', 'Lim sup'), b('\\liminf_{#?}#0', 'نهاية دنيا', 'Lim inf')],
      [b('\\frac{d}{d#?}#0', 'مشتقة', 'Derivative d/dx'), b('\\frac{d#0}{d#?}', 'مشتقة', 'dy/dx'),
       b('\\frac{d^{2}#0}{d#?^{2}}', 'مشتقة ثانية', 'Second derivative'), b('\\frac{\\partial #0}{\\partial #?}', 'مشتقة جزئية', 'Partial'),
       b('\\frac{\\partial^{2} #0}{\\partial #?^{2}}', 'مشتقة جزئية ثانية', 'Second partial'),
       b("#@'", 'مشتقة أولى', 'Prime', S + "'"), b("#@''", 'مشتقة ثانية', 'Double prime', S + "''"),
       b('\\dot{#0}', 'مشتقة زمنية', 'Time derivative')],
      [b('\\int #0\\,d#?', 'تكامل غير محدد', 'Indefinite integral'), b('\\int_{#?}^{#?}#0\\,d#?', 'تكامل محدد', 'Definite integral'),
       b('\\iint_{#?}#0\\,dA', 'تكامل ثنائي', 'Double integral'), b('\\oint_{#?}#0', 'تكامل مغلق', 'Contour integral'),
       b('\\left.#0\\right|_{#?}^{#?}', 'التعويض بالحدود', 'Evaluate')],
      [sym('\\nabla', 'تدرج', 'Gradient'), b('\\nabla\\cdot #0', 'تباعد', 'Divergence'), b('\\nabla\\times #0', 'دوران', 'Curl'),
       sym('\\Delta', 'تغير', 'Delta'), sym('\\partial', 'جزئي', 'Partial'), sym('\\infty', 'ما لا نهاية', 'Infinity'),
       sym('dx', 'تفاضل', 'dx')]
    ]},
    { id: 'arabic', icon: '\\text{جا}', t: 'عربي', e: 'Arabic', arabic: true, groups: [
      [{ fn: 'sin' }, { fn: 'cos' }, { fn: 'tan' }, { fn: 'cot' }, { fn: 'sec' }, { fn: 'csc' },
       { fn: 'sin', inv: 1 }, { fn: 'cos', inv: 1 }, { fn: 'tan', inv: 1 }],
      [{ fn: 'log' }, { fn: 'log', base: 1 }, { fn: 'ln' }, b('\\text{هـ}^{#?}', 'الدالة الأسية هـ', 'Exponential e', '\\text{هـ}^{' + S + '}'),
       { fn: 'lim', lim: 1 }, b('\\operatorname*{مجـ}\\limits_{#?}^{#?}#0', 'مجموع عربي مجـ', 'Arabic sum', '\\operatorname*{مجـ}\\limits_{' + S + '}^{' + S + '}')],
      ['س', 'ص', 'ع', 'ل', 'م', 'ن', 'ك', 'هـ', 'أ', 'ب', 'جـ', 'د', 'ر', 'ق', 'ف', 'ت', 'ح', 'ط', 'ي', 'و', 'نق', 'ء']
        .map(function (l) { return { i: l, t: l, e: 'Arabic letter', d: '\\text{' + l + '}' }; }),
      [b('ءس', 'تفاضل عربي (ءس)', 'Arabic differential', '\\text{ء}\\text{س}'),
       b('\\frac{\\text{ء}#0}{\\text{ء}#?}', 'مشتقة بالترميز العربي', 'Arabic derivative', '\\frac{\\text{ءص}}{\\text{ءس}}'),
       { i: '\\text{،}', t: 'فاصلة عربية', e: 'Arabic comma', d: '\\text{،}' },
       { i: '\\%', t: 'بالمئة', e: 'Percent', d: '\\%' }]
    ]}
  ];

  // ------------------------------------------------------------ chemistry (mhchem syntax, typed as text)
  function c(i, t, e, d) { return { i: i, t: t, e: e, d: d || i, chem: true }; }
  var CHEM_TABS = [
    { id: 'elements', icon: '\\ce{H2O}', t: 'العناصر', e: 'Elements', groups: [
      [{ cmd: 'periodicTable', t: 'الجدول الدوري', e: 'Periodic table', d: '\\begin{matrix}\\text{H}&&\\text{He}\\\\\\text{Li}&\\cdots&\\text{Ne}\\end{matrix}', w: 1 }],
      'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Fe Cu Zn Ag Au Mn Cr Br I Pb Hg Ba Sn Ni Co Pt U'
        .split(' ').map(function (s) { return c(s, s, s, '\\mathrm{' + s + '}'); })
    ]},
    { id: 'formula', icon: '\\ce{SO4^2-}', t: 'الصيغ والشحنات', e: 'Formulas', groups: [
      [c('_{#?}', 'رقم سفلي (عدد الذرات)', 'Subscript', '\\mathrm{X}_{' + S + '}'), c('^{+}', 'شحنة موجبة', 'Positive charge', '\\mathrm{X}^{+}'),
       c('^{-}', 'شحنة سالبة', 'Negative charge', '\\mathrm{X}^{-}'), c('^{2+}', 'شحنة +2', '2+', '\\mathrm{X}^{2+}'),
       c('^{2-}', 'شحنة -2', '2-', '\\mathrm{X}^{2-}'), c('^{3+}', 'شحنة +3', '3+', '\\mathrm{X}^{3+}'),
       c('^{3-}', 'شحنة -3', '3-', '\\mathrm{X}^{3-}'), c('^{.}', 'جذر حر', 'Radical', '\\mathrm{X}^{\\bullet}')],
      [c('^{14}_{6}C', 'نظير (عدد كتلي وذري)', 'Isotope', '{}^{14}_{6}\\mathrm{C}'), c('*', 'ماء التبلور', 'Hydrate dot', '\\mathrm{CuSO_4\\cdot 5H_2O}'),
       c('^{II}', 'عدد التأكسد', 'Oxidation state', '\\mathrm{Fe}^{\\mathrm{II}}'), c('( )', 'أقواس', 'Parentheses', '(\\;)'),
       c('[ ]', 'أقواس مربعة', 'Brackets', '[\\;]'), c('e-', 'إلكترون', 'Electron', '\\mathrm{e}^{-}'), c('hv', 'فوتون', 'Photon', 'h\\nu')],
      [c(' ', 'مسافة (Space)', 'Space', '\\ce{A\\ B}'), c('~~', 'مسافة أوسع', 'Wide space', '\\ce{A~~B}')],
      [c('H2O', 'ماء', 'Water', '\\ce{H2O}'), c('CO2', 'ثاني أكسيد الكربون', 'CO2', '\\ce{CO2}'), c('H2SO4', 'حمض الكبريتيك', 'Sulfuric acid', '\\ce{H2SO4}'),
       c('NaCl', 'ملح الطعام', 'NaCl', '\\ce{NaCl}'), c('NH3', 'الأمونيا', 'Ammonia', '\\ce{NH3}'), c('CH4', 'الميثان', 'Methane', '\\ce{CH4}'),
       c('OH-', 'الهيدروكسيد', 'Hydroxide', '\\ce{OH-}'), c('H3O+', 'الهيدرونيوم', 'Hydronium', '\\ce{H3O+}'),
       c('SO4^2-', 'الكبريتات', 'Sulfate', '\\ce{SO4^2-}'), c('NO3-', 'النترات', 'Nitrate', '\\ce{NO3-}'),
       c('CO3^2-', 'الكربونات', 'Carbonate', '\\ce{CO3^2-}'), c('NH4+', 'الأمونيوم', 'Ammonium', '\\ce{NH4+}')]
    ]},
    { id: 'reactions', icon: '\\ce{->}', t: 'التفاعلات', e: 'Reactions', groups: [
      [c(' -> ', 'ينتج', 'Yields', '\\ce{->}'), c(' <- ', 'سهم عكسي', 'Reverse', '\\ce{<-}'), c(' <=> ', 'تفاعل منعكس (اتزان)', 'Equilibrium', '\\ce{<=>}'),
       c(' <=>> ', 'اتزان نحو النواتج', 'Equilibrium right', '\\ce{<=>>}'), c(' <<=> ', 'اتزان نحو المتفاعلات', 'Equilibrium left', '\\ce{<<=>}'),
       c(' <-> ', 'رنين', 'Resonance', '\\ce{<->}'), c(' + ', 'زائد', 'Plus', '+')],
      [c(' ->[#?] ', 'سهم فوقه شرط', 'Arrow with condition', '\\ce{->[\\Delta]}'), c(' ->[#?][#?] ', 'سهم فوقه وتحته', 'Arrow above & below', '\\ce{->[\\text{أ}][\\text{ب}]}'),
       c(' ->[\\Delta] ', 'تسخين', 'Heat', '\\ce{->[\\Delta]}'), c(' ->[تسخين] ', 'تسخين (عربي)', 'Heat (Arabic)', '\\ce{->[تسخين]}'),
       c(' ->[عامل حفاز] ', 'عامل حفاز', 'Catalyst', '\\ce{->[حفاز]}'), c(' ->[h\\nu] ', 'ضوء', 'Light', '\\ce{->[h\\nu]}')],
      [c(' ^', 'غاز متصاعد ↑', 'Gas', '\\ce{ ^}'), c(' v', 'راسب ↓', 'Precipitate', '\\ce{ v}'), c('(s)', 'صلب', 'Solid', '\\ce{(s)}'),
       c('(l)', 'سائل', 'Liquid', '\\ce{(l)}'), c('(g)', 'غاز', 'Gas', '\\ce{(g)}'), c('(aq)', 'محلول مائي', 'Aqueous', '\\ce{(aq)}'),
       c(' + \\Delta', 'حرارة', 'Heat', '\\Delta')]
    ]},
    { id: 'chemexamples', icon: '\\ce{A + B}', t: 'أمثلة', e: 'Examples', wide: true, groups: [
      [{ set: '2H2 + O2 -> 2H2O', t: 'تكوين الماء', e: 'Water formation' },
       { set: 'CH4 + 2O2 -> CO2 + 2H2O', t: 'احتراق الميثان', e: 'Methane combustion' },
       { set: '6CO2 + 6H2O ->[ضوء][كلوروفيل] C6H12O6 + 6O2', t: 'البناء الضوئي', e: 'Photosynthesis' },
       { set: 'HCl + NaOH -> NaCl + H2O', t: 'تعادل حمض وقاعدة', e: 'Neutralization' },
       { set: 'N2 + 3H2 <=> 2NH3', t: 'تحضير الأمونيا (هابر)', e: 'Haber process' },
       { set: 'Ag+ + Cl- -> AgCl v', t: 'ترسيب كلوريد الفضة', e: 'Precipitation' },
       { set: 'CaCO3 ->[\\Delta] CaO + CO2 ^', t: 'تفكك كربونات الكالسيوم', e: 'Decomposition' },
       { set: 'Zn + CuSO4 -> ZnSO4 + Cu', t: 'إحلال بسيط', e: 'Single displacement' },
       { set: 'Fe^{3+} + 3OH- -> Fe(OH)3 v', t: 'هيدروكسيد الحديد', e: 'Iron hydroxide' },
       { set: 'CuSO4*5H2O', t: 'كبريتات النحاس المائية', e: 'Hydrate' }]
    ]}
  ];

  // Periodic table: symbol list 1..118 with Arabic names for the common ones
  var ELEMENTS = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' ');
  var AR_NAMES = {
    H: 'هيدروجين', He: 'هيليوم', Li: 'ليثيوم', Be: 'بيريليوم', B: 'بورون', C: 'كربون', N: 'نيتروجين', O: 'أكسجين', F: 'فلور',
    Ne: 'نيون', Na: 'صوديوم', Mg: 'مغنيسيوم', Al: 'ألومنيوم', Si: 'سيليكون', P: 'فوسفور', S: 'كبريت', Cl: 'كلور', Ar: 'أرجون',
    K: 'بوتاسيوم', Ca: 'كالسيوم', Sc: 'سكانديوم', Ti: 'تيتانيوم', V: 'فاناديوم', Cr: 'كروم', Mn: 'منغنيز', Fe: 'حديد',
    Co: 'كوبالت', Ni: 'نيكل', Cu: 'نحاس', Zn: 'خارصين', Ga: 'غاليوم', Ge: 'جرمانيوم', As: 'زرنيخ', Se: 'سيلينيوم', Br: 'بروم',
    Kr: 'كريبتون', Rb: 'روبيديوم', Sr: 'سترونشيوم', Ag: 'فضة', Sn: 'قصدير', I: 'يود', Xe: 'زينون', Cs: 'سيزيوم', Ba: 'باريوم',
    Pt: 'بلاتين', Au: 'ذهب', Hg: 'زئبق', Pb: 'رصاص', Ra: 'راديوم', U: 'يورانيوم', Rn: 'رادون', Sb: 'أنتيمون', Cd: 'كادميوم',
    W: 'تنغستن', Bi: 'بزموت', Pu: 'بلوتونيوم', Mo: 'موليبدنوم', Zr: 'زركونيوم', Pd: 'بالاديوم', Te: 'تيلوريوم'
  };
  // position [row, col] (rows 8,9 = lanthanides/actinides)
  function elementPositions() {
    var pos = [];
    var z = 1;
    function put(row, cols) { cols.forEach(function (col) { pos[z++] = [row, col]; }); }
    function range(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
    put(1, [1, 18]);
    put(2, [1, 2].concat(range(13, 18)));
    put(3, [1, 2].concat(range(13, 18)));
    put(4, range(1, 18));
    put(5, range(1, 18));
    put(6, [1, 2]); put(8, range(3, 17)); put(6, range(4, 18));
    put(7, [1, 2]); put(9, range(3, 17)); put(7, range(4, 18));
    return pos;
  }

  global.TOOLBARS = {
    math: MATH_TABS, chem: CHEM_TABS, slot: S,
    elements: ELEMENTS, elementNamesAr: AR_NAMES, elementPositions: elementPositions()
  };
})(window);
