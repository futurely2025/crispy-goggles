/*
 * AI format: the exact input format the add-in expects, as a ready prompt for ChatGPT / Claude / Gemini /
 * your own model — plus a cleaner that converts typical AI output (\[ \], \( \), $$, Markdown) to this format.
 */
(function (global) {
  'use strict';

  var PROMPT_AR = [
    'أنت تكتب محتوى تعليمياً (رياضيات، إحصاء، فيزياء، ميكانيكا، كيمياء) سيُلصق في إضافة «معادلات عربية» داخل Microsoft Word.',
    'الإضافة تحوّل ما تكتبه إلى نصوص ومعادلات ورسوم وجداول في المستند بنفس الترتيب. التزم بالصيغة التالية حرفياً،',
    'وأخرج المحتوى فقط في كتلة نص واحدة بدون شرح قبله أو بعده، وبدون Markdown.',
    '',
    '== أولاً: النصوص والمعادلات ==',
    '1) كل معادلة في سطر مستقل بصيغة LaTeX بدون $ حولها.',
    '2) العنوان أو الشرح: سطر يبدأ بـ % ثم النص.  مثال: % 1. القانون العام',
    '3) نص ومعادلة في سطر واحد: النص عادي وكل معادلة بين $...$.  مثال: مساحة الدائرة: $م = \\pi نق^2$',
    '4) الترميز العربي: المتغيرات س ص ع ل م ن ك، الثوابت أ ب جـ د، الدوال جا جتا طا طتا قا قتا لو لط مع مسافة (جا س)،',
    '   النهاية نها_{س \\to 0}، التفاضل \\frac{ءص}{ءس}، التكامل ... \\, ءس، العدد النيبيري هـ، والكلمات داخل المعادلة في \\text{...}.',
    '5) المعادلة متعددة الأسطر في \\begin{cases}...\\end{cases} أو \\begin{aligned}...\\end{aligned} والأسطر تفصلها \\\\',
    '6) الوحدات الفيزيائية: \\qty{9.8}{m/s^2} أو \\qty{220}{\\volt}، والأعداد العلمية \\num{6.02e23}.',
    '7) الكيمياء: \\ce{2H2 + O2 -> 2H2O}، الاتزان <=>، شرط فوق السهم ->[\\Delta]، الشحنات Fe^{3+}.',
    '8) لا تستخدم \\( \\) ولا \\[ \\] ولا $$ ولا ** ولا # ولا \\begin{equation}.',
    '',
    '== ثانياً: الرسوم والجداول (كل كتلة تبدأ بسطر \\begin وتنتهي بسطر \\end) ==',
    '• رسم الدوال:',
    '\\begin{graph}[x=-4:4, y=-5:6, pi, extrema]',
    '  \\plot{س^2 - 4}',
    '  \\plot[color=red, dashed, name=د(س)]{جا س}',
    '  \\point[label=أ]{(2, 0)}',
    '  \\area[of=1, from=-2, to=2]',
    '\\end{graph}',
    '• الأشكال الهندسية (الأطوال بالسنتيمتر والزوايا بالدرجات):',
    '\\begin{geometry}[sides=values, angles=values]',
    '  \\triangle{أ,ب,جـ}[sides=5,6,7]        % أو [right=ب, legs=3,4] أو [base=6, angles=50,60] أو [sides=5,7, angle=60]',
    '  \\midpoint{د}{ب,جـ}   \\segment[dashed]{أ,د}   \\angle[label=α]{ب,أ,د}',
    '\\end{geometry}',
    '   أشكال أخرى: \\square{…}[side=4] \\rectangle{…}[width=6, height=3] \\parallelogram{…}[base=5, side=3, angle=60]',
    '   \\rhombus{…}[side=4, angle=60] \\trapezoid{…}[bottom=6, top=3, height=3] \\regular{أ,ب,جـ,د,هـ}[side=3] \\circle{م}[radius=3]',
    '   \\point{هـ}{(1, 2)} \\foot{هـ}{أ}{ب,جـ} \\intersection{ن}{أ,جـ}{ب,د} \\line{أ,ب} \\ray{أ,ب} \\vector{أ,ب}',
    '• الإحصاء: رسم بياني بأنواعه bar hbar line pie histogram polygon ogive scatter box:',
    '\\begin{chart}[type=bar, title=درجات الطلاب, xlabel=المادة, ylabel=الدرجة]',
    '  \\data{الرياضيات:85, الفيزياء:78, الكيمياء:90}',
    '\\end{chart}',
    '   تكراري: \\begin{chart}[type=histogram, polygon] \\classes{10-20:4, 20-30:7} \\end{chart}',
    '   انتشار: \\begin{chart}[type=scatter, regression] \\points{(1,2) (2,4) (3,5)} \\end{chart}',
    '   جدول تكراري جاهز: \\freqtable{2:3, 4:5, 6:2}   وجدول المقاييس: \\statstable{12, 15, 18, 20}',
    '• الفيزياء والميكانيكا (الزوايا بالدرجات، 0 يمين و90 أعلى):',
    '\\begin{physics}',
    '  \\incline[angle=30, base=6, name=م]{(0,0)}',
    '  \\block[on=م, at=0.5, name=ج]{ك}',
    '  \\force[from=ج, angle=-90, len=1.6]{و}',
    '  \\force[from=ج, dir=normal, len=1.7, color=blue]{ر}',
    '  \\force[from=ج, dir=along, len=1.3, color=orange]{ح}',
    '\\end{physics}',
    '   عناصر أخرى: \\ground{(0,0)}{(8,0)} \\wall \\ceiling \\block[at=(3,0)]{ك} \\block[hang=(5,3)]{ك} \\ball{(2,3)} \\pulley{(6,4)}',
    '   \\rope{(1,2) (6,4)} \\spring{(0,1)}{(3,1)} \\arc[label=θ]{(0,0)}{0}{30} \\dim[label=ف]{(0,0)}{(6,0)} \\velocity \\vector',
    '   \\projectile[v=20, angle=45]{(0,0)} \\lens[type=convex, f=2, object=5]{(0,0)} \\mirror[type=concave, f=2, object=5]{(0,0)}',
    '   \\charge[q=+]{(0,0)} \\field[angle=0, len=4, n=5]{(0,0)}{(0,3)} \\pivot{(3,0)} \\beam{(0,0.3)}{(6,0.3)}',
    '   موضع تسمية القوة: pos=end (افتراضي) أو above أو below أو start — مثل \\force[from=ج, angle=180, pos=above]{ق}',
    '• الدوائر الكهربائية:',
    '\\begin{circuit}',
    '  \\battery{(0,0)}{(0,3)}   \\resistor[label=م₁]{(0,3)}{(4,3)}   \\lamp{(4,3)}{(4,0)}   \\switch{(4,0)}{(0,0)}',
    '\\end{circuit}',
    '   عناصر أخرى: \\ammeter \\voltmeter \\capacitor \\inductor \\diode \\led \\fuse \\rheostat \\cell \\ac \\wire \\junction{(x,y)} \\current[label=ت]{…}{…}',
    '• جدول التغيرات (يُحسب تلقائياً من الدالة):  \\begin{vartable}\\auto{س^3 - 3س}\\end{vartable}',
    '   أو يدوياً: \\begin{vartable} \\x{-\\infty, -1, 1, +\\infty} \\sign[name=د\'(س)]{+, 0, -, 0, +} \\var[name=د(س)]{-/-\\infty, +/2, -/-2, +/+\\infty} \\end{vartable}',
    '   جدول الإشارة: \\begin{signtable} \\x{…} \\sign[name=…]{…} \\end{signtable}',
    '• خط الأعداد: \\begin{numberline} \\solution{-2 < س \\le 3} \\interval{(-\\infty, 1]} \\end{numberline}',
    '• أشكال فن: \\begin{venn}[sets={أ,ب}, shade={أ∩ب}] \\region[أ]{1, 2} \\region[أ∩ب]{3} \\region[ب]{4} \\end{venn}',
    '• شجرة الاحتمالات (كل فرع في سطر، والمسافة في أوله تعني فرعاً داخلياً):',
    '\\begin{tree}[products]',
    '- أحمر [0.3]',
    '  - أزرق [0.5]',
    '\\end{tree}',
    '• الصيغ البنائية: \\chemfig[name=الإيثانول]{CH_3-CH_2-OH} أو \\chemfig{*6(=-=-=-)} أو \\smiles[name=الأسبرين]{CC(=O)Oc1ccccc1C(=O)O} أو \\molecule{الكافيين}',
    '• إنشاءات هندسية (داخل geometry): \\perpbisector{أ,ب} (العمود المنصف)، \\bisector{ب,أ,جـ} (منصف الزاوية عند أ)، \\median[name=د]{أ}{ب,جـ}،',
    '   \\circumcircle[center=م]{أ,ب,جـ} (الدائرة المارة بالرؤوس)، \\incircle[center=و]{أ,ب,جـ} (الدائرة الداخلية)، \\tangent{م}{أ}، \\tangents[names={ل,ك}]{ن}{م}',
    '• التحويلات الهندسية (الصورة تُسمّى أ′ ب′ … تلقائياً): \\reflect[over=س]{أ,ب,جـ} أو [over=ص] أو [over={أ,ب}] أو [center=م]،',
    '   \\rotate[center=م, angle=90]{أ,ب,جـ}، \\translate[by=(3,1)]{…}، \\dilate[center=م, k=2]{…}',
    '• التوزيعات الاحتمالية: \\begin{chart}[type=normal, mean=50, sd=10, from=40, to=60]\\end{chart} (المساحة مظللة)،',
    '   \\begin{chart}[type=binomial, n=10, p=0.3, from=2, to=4]\\end{chart}، وجدول Z: \\ztable[from=0, to=1]، وجدول ذي الحدين: \\binomtable[n=5, p=0.4]',
    '• منحنيات الحركة والموجات (داخل physics): \\motion[type=vt, area, slopes]{(0,0) (2,10) (5,10) (7,0)} (vt سرعة–زمن، xt إزاحة–زمن)،',
    '   \\wave[amplitude=1, wavelength=4, length=10]{(0,0)} وللموجة الطولية type=long',
    '• الذرة والجدول الدوري: \\element{Fe} بطاقة العنصر، \\bohr{Na} نموذج بور، \\lewis{Cl} أو \\lewis{Na+} أو \\lewis{O2-} رمز لويس،',
    '   \\orbital[short]{Fe} مربعات الأوربيتالات، \\ptable[highlight={Na,K}, names] الجدول الدوري، وداخل المعادلة: $\\econfig{Fe}$ التوزيع الإلكتروني',
    '• أدوات المختبر (الموضع (x,y) بالسنتيمتر = منتصف القاعدة):',
    '\\begin{lab}',
    '  \\stand[h=8, clamp=6.4]{(-2.2,0)}',
    '  \\burette[fill=0.75, h=6, drops, label=محلول قياسي]{(0,3.6)}',
    '  \\flask[fill=0.35, color=pink, label=المحلول المجهول]{(0,0)}',
    '\\end{lab}',
    '   أدوات أخرى: \\beaker \\roundflask \\testtube \\cylinder \\pipette \\dropper \\funnel[paper] \\burner \\tripod[gauze] \\thermometer \\condenser \\tube',
    '   الخيارات: fill مستوى السائل 0–1، color لونه، ppt راسب، bubbles فقاعات، label تسمية',
    '• الجداول: \\begin{tabular}{|c|c|} \\hline س & ص \\\\ \\hline 1 & $س^2$ \\\\ \\hline \\end{tabular}  (تُدرج جدولاً حقيقياً في Word)',
    '',
    '== مثال على ناتج صحيح ==',
    '% الدالة التربيعية',
    'د(س) = س^2 - 4',
    '\\begin{graph}[x=-4:4]',
    '  \\plot{س^2 - 4}',
    '\\end{graph}',
    '% جدول قيم الدالة',
    '\\begin{tabular}{|c|c|c|c|}',
    '\\hline',
    'س & -2 & 0 & 2 \\\\ \\hline',
    '$د(س)$ & 0 & -4 & 0 \\\\ \\hline',
    '\\end{tabular}'
  ].join('\n');

  var PROMPT_EN = [
    'You write teaching content (math, statistics, physics, mechanics, chemistry) that will be pasted into the "Arabic Math" add-in for Microsoft Word.',
    'The add-in turns it into text, equations, figures and tables in the same order. Output only the content, one plain-text block, no Markdown.',
    '',
    'TEXT & EQUATIONS: one LaTeX equation per line without $; a line starting with % is a title; text with inline math uses $...$;',
    'multi-line math inside \\begin{cases} or \\begin{aligned}; units \\qty{9.8}{m/s^2}; chemistry \\ce{2H2 + O2 -> 2H2O}.',
    'Never use \\( \\), \\[ \\], $$, **, # or \\begin{equation}.',
    '',
    'FIGURES & TABLES (each block starts with a \\begin line and ends with an \\end line):',
    '\\begin{graph}[x=-4:4, y=-5:6, pi, extrema] \\plot{x^2 - 4} \\plot[color=red, dashed]{\\sin x} \\point[label=A]{(2,0)} \\area[of=1, from=-2, to=2] \\end{graph}',
    '(pgfplots \\begin{axis} … \\addplot{…}; is also accepted)',
    '\\begin{geometry}[sides=values, angles=values] \\triangle{A,B,C}[sides=5,6,7] \\midpoint{D}{B,C} \\segment[dashed]{A,D} \\angle[label=α]{B,A,D} \\end{geometry}',
    '  triangles: [right=B, legs=3,4] [base=6, angles=50,60] [sides=5,7, angle=60] [equilateral, side=4] [isosceles, base=4, legs=5];',
    '  \\square \\rectangle[width,height] \\parallelogram[base,side,angle] \\rhombus \\trapezoid[bottom,top,height] \\regular \\circle{O}[radius=3] \\point{E}{(1,2)} \\foot \\intersection \\line \\ray \\vector',
    '\\begin{chart}[type=bar|hbar|line|pie|histogram|polygon|ogive|scatter|box, title=…, xlabel=…, ylabel=…] \\data{A:5, B:8} | \\classes{10-20:4, 20-30:7} | \\points{(1,2) (2,4)} | \\box[name=…]{…} \\end{chart}',
    '\\freqtable{2:3, 4:5, 6:2}   \\statstable{12, 15, 18, 20}',
    '\\begin{physics} \\incline[angle=30, base=6, name=m]{(0,0)} \\block[on=m, at=0.5, name=b]{m} \\force[from=b, angle=-90, len=1.6]{W} \\force[from=b, dir=normal]{N} \\end{physics}',
    '  also \\ground \\wall \\ceiling \\ball \\pulley \\rope \\spring \\arc \\dim \\velocity \\vector \\projectile[v, angle] \\lens[type=convex, f, object] \\mirror \\charge \\field \\pivot \\beam; force label position pos=end|above|below|start',
    '\\begin{circuit} \\battery{(0,0)}{(0,3)} \\resistor[label=R_1]{(0,3)}{(4,3)} \\lamp{(4,3)}{(4,0)} \\switch{(4,0)}{(0,0)} \\end{circuit}  (circuitikz \\draw … to[R] … ; also accepted)',
    '\\begin{vartable}\\auto{x^3 - 3x}\\end{vartable}  or manual \\x{…} \\sign[name=…]{…} \\var[name=…]{-/-\\infty, +/2, …}; tkz-tab is accepted',
    '\\begin{numberline} \\solution{-2 < x \\le 3} \\end{numberline}   \\begin{venn}[sets={A,B}, shade={A∩B}] \\region[A]{1,2} \\end{venn}',
    '\\begin{tree}[products]\\n- Red [0.3]\\n  - Blue [0.5]\\n\\end{tree}',
    '\\chemfig{CH_3-CH_2-OH}  \\smiles[name=Aspirin]{CC(=O)Oc1ccccc1C(=O)O}  \\molecule{caffeine}',
    'Geometry constructions: \\perpbisector{A,B} \\bisector{B,A,C} \\median[name=D]{A}{B,C} \\circumcircle[center=O]{A,B,C} \\incircle[center=I]{A,B,C} \\tangent{O}{A} \\tangents[names={P,Q}]{N}{O}',
    'Transformations (images are named A′ B′ …): \\reflect[over=x | over=y | over={A,B} | center=O]{A,B,C} \\rotate[center=O, angle=90]{…} \\translate[by=(3,1)]{…} \\dilate[center=O, k=2]{…}',
    'Distributions: \\begin{chart}[type=normal, mean=50, sd=10, from=40, to=60]\\end{chart}  \\begin{chart}[type=binomial, n=10, p=0.3, from=2, to=4]\\end{chart}  \\ztable[from=0, to=1]  \\binomtable[n=5, p=0.4]',
    'Motion graphs and waves (inside physics): \\motion[type=vt, area, slopes]{(0,0) (2,10) (5,10) (7,0)} (vt or xt)  \\wave[amplitude=1, wavelength=4, length=10]{(0,0)} (type=long for longitudinal)',
    'Atoms: \\element{Fe} \\bohr{Na} \\lewis{Cl} \\lewis{Na+} \\orbital[short]{Fe} \\ptable[highlight={Na,K}, names], and in an equation $\\econfig{Fe}$',
    'Lab apparatus (x,y in cm = bottom centre): \\begin{lab} \\beaker[fill=0.5, label=Water]{(0,0)} \\flask \\roundflask \\testtube \\cylinder \\burette[drops] \\pipette \\dropper \\funnel[paper] \\burner \\tripod[gauze] \\stand[clamp=5] \\thermometer \\condenser \\tube \\end{lab}  options: fill, color, ppt, bubbles, label',
    '\\begin{tabular}{|c|c|} \\hline x & y \\\\ \\hline 1 & $x^2$ \\\\ \\hline \\end{tabular}  (becomes a real Word table)'
  ].join('\n');

  // ---------------------------------------------------------------- cleaner
  function looksLikeAI(t) {
    return /```|\\\[|\\\(|\$\$|^\s*#{1,6}\s|\*\*|\\begin\{(equation|align|gather|graph|geometry|chart|physics|circuit|tabular|vartable)\*?\}/m.test(t);
  }
  function oneLine(m) {
    m = m.trim();
    if (/\\begin\{/.test(m) || /\\\\/.test(m)) return m.replace(/\s*\n\s*/g, ' ');
    return m.replace(/\s*\n\s*/g, ' ');
  }
  var BLOCK_RE = /\\begin\{(graph|geometry|chart|physics|circuit|circuitikz|numberline|venn|tree|vartable|signtable|tikzpicture|lab|tabular\*?)\}[\s\S]*?\\end\{\1\}/g;
  // Markdown table (| a | b | / |---|---| / rows) → \begin{tabular}: becomes a real Word table
  function mdTables(t) {
    var lines = t.split('\n'), out = [], i = 0;
    var isRow = function (l) { return /^\s*\|.*\|\s*$/.test(l); };
    var isSep = function (l) { return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l); };
    var cells = function (l) { return l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(function (c) { return c.trim().replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1'); }); };
    while (i < lines.length) {
      if (isRow(lines[i]) && i + 1 < lines.length && isSep(lines[i + 1])) {
        var head = cells(lines[i]), rows = [];
        i += 2;
        while (i < lines.length && isRow(lines[i])) { rows.push(cells(lines[i])); i++; }
        var n = Math.max(head.length, rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0));
        var fill = function (r) { while (r.length < n) r.push(''); return r.slice(0, n).map(function (c) { return c.replace(/&/g, '\\&'); }).join(' & ') + ' \\\\ \\hline'; };
        out.push('\\begin{tabular}[header]{|' + new Array(n + 1).join('c|') + '}', '\\hline', fill(head));
        rows.forEach(function (r) { out.push(fill(r)); });
        out.push('\\end{tabular}');
        continue;
      }
      out.push(lines[i]); i++;
    }
    return out.join('\n');
  }
  // apply fn only to the parts of a line that are outside $…$
  function outsideMath(l, fn) {
    return l.split(/(\$[^$]*\$)/).map(function (part, k) { return k % 2 ? part : fn(part); }).join('');
  }

  function clean(text) {
    var t = String(text || '').replace(/\r/g, '').replace(/\u00A0/g, ' ');
    t = t.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?(p|div|span|b|strong|i|em)[^>]*>/gi, '');   // stray HTML
    t = t.replace(/^\s*```[a-zA-Z]*\s*$/gm, '');                                   // code fences
    // figure / table blocks are kept exactly as written (their lines may start with "-" or contain $…$)
    var kept = [];
    t = t.replace(BLOCK_RE, function (m0) { kept.push(m0); return '\n\u0000' + (kept.length - 1) + '\u0000\n'; });
    t = t.replace(/\\begin\{(equation|gather|displaymath)\*?\}([\s\S]*?)\\end\{\1\*?\}/g, function (m0, e, b) { return '\n' + oneLine(b) + '\n'; });
    t = t.replace(/\\begin\{(align|alignat|eqnarray)\*?\}([\s\S]*?)\\end\{\1\*?\}/g, function (m0, e, b) {
      return '\n\\begin{aligned}' + oneLine(b) + '\\end{aligned}\n';
    });
    t = t.replace(/\$\$([\s\S]+?)\$\$/g, function (m0, b) { return '\n' + oneLine(b) + '\n'; });       // $$ … $$
    t = t.replace(/\\\[([\s\S]+?)\\\]/g, function (m0, b) { return '\n' + oneLine(b) + '\n'; });       // \[ … \]
    t = t.replace(/\\\(([\s\S]+?)\\\)/g, function (m0, b) { return '$' + b.trim() + '$'; });          // \( … \) -> $…$
    t = t.replace(/\\tag\*?\{[^}]*\}/g, '').replace(/\\label\{[^}]*\}/g, '').replace(/\\nonumber/g, '');
    t = mdTables(t);
    t = t.replace(BLOCK_RE, function (m0) { kept.push(m0); return '\n\u0000' + (kept.length - 1) + '\u0000\n'; });
    var out = t.split('\n').map(function (line) {
      var l = line.replace(/\s+$/, '');
      var h = l.match(/^\s*#{1,6}\s+(.*)$/);
      if (h) return '% ' + h[1].replace(/\*\*|__/g, '').trim();                  // Markdown heading -> title
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) return '';                        // horizontal rule
      l = l.replace(/^\s*[-*•●▪]\s+/, '');                                        // bullets
      l = l.replace(/^\s*>\s?/, '');                                               // quotes
      l = outsideMath(l, function (x) {
        return x.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1')      // bold
          .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,،:؛]|$)/g, '$1$2')             // italic
          .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')                          // links
          .replace(/`([^`]+)`/g, function (m0, c) { return /[\\^_=]/.test(c) ? '$' + c + '$' : c; });   // `x^2` → $x^2$
      });
      var only = l.trim().match(/^\$([^$]+)\$[.,،:؛]?$/);                          // a line that is only $…$
      if (only) return only[1].trim();
      return l;
    });
    // titles made of a bold/heading line that ends with ':' stay as text; collapse blank lines
    return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\u0000(\d+)\u0000/g, function (m0, i) { return kept[+i]; }).trim();
  }

  global.AIFormat = { PROMPT_AR: PROMPT_AR, PROMPT_EN: PROMPT_EN, clean: clean, looksLikeAI: looksLikeAI, mdTables: mdTables };
})(window);
