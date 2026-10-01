/*
 * AI format — the COMPLETE reference: every command and option of every tool (read from the parsers themselves),
 * with examples. One source for:
 *   · the full prompt for ChatGPT / Claude / Gemini (AIFormat.PROMPT_AR / PROMPT_EN now hold the full version;
 *     the short ones stay as AIFormat.PROMPT_AR_SHORT / PROMPT_EN_SHORT)
 *   · the guide page (ai-format.html): reference tables + examples rendered live.
 * Line format inside CMDS:  syntax :: description   (a line starting with "#" is a sub-heading)
 */
(function (global) {
  'use strict';
  var AF = global.AIFormat || (global.AIFormat = {});
  var R = String.raw;

  var GUIDE = [
    // ------------------------------------------------------------------ equations
    { id: 'eq', ic: '√', t: 'المعادلات والنصوص',
      note: 'كل معادلة في سطر، والعنوان سطر يبدأ بـ %، والنص مع المعادلة في سطر واحد بين $…$. الكيمياء بـ \\ce، والوحدات بـ \\qty.',
      cmds: R`
# تقسيم النص
% عنوان أو شرح :: سطر نصي يُدرج نصاً عادياً في Word (العناوين والشروح)
%% ملاحظة :: تعليق مخفي لا يُدرج
د(س) = س^2 + 1 :: سطر فيه معادلة واحدة فقط (بدون $ حولها)
المساحة: $م = \pi نق^2$ حيث $نق$ نصف القطر :: نص ومعادلات في سطر واحد: كل معادلة بين $…$
ص = 2س + 1   % معادلة خط :: تعليق بعد المعادلة يُدرج نصاً بعدها
(سطر فارغ) :: يفصل المعادلات؛ والمعادلة متعددة الأسطر تستمر حتى تُغلق \end أو الأقواس
# الترميز العربي
س ص ع ل م ن ك  و  أ ب جـ د هـ :: المتغيرات والثوابت (تُكتب كما هي)
جا جتا طا طتا قا قتا لو لط :: الدوال (مع مسافة: جا س، أو ملاصقة لحرف واحد: جاس). و\sin \cos \ln … تتحول للعربية تلقائياً
نها_{س \to 0} :: النهاية (والرمز يوضع تحتها). وأيضاً عظمى_{} صغرى_{} مجـ
\frac{ءص}{ءس}   \int_{0}^{1} س \, ءس :: التفاضل والتكامل
لو_2 س   لط س   هـ^{س} :: اللوغاريتمات والعدد النيبيري
\text{…} :: كلمات داخل المعادلة
\ltr{…} :: جزء يبقى من اليسار لليمين داخل معادلة عربية
# بيئات متعددة الأسطر
\begin{cases} … \\ … \end{cases} :: نظام معادلات أو دالة متعددة التعريف (الأسطر تفصلها \\ والشرط بعد &)
\begin{aligned} 2س + 3 &= 7 \\ س &= 2 \end{aligned} :: خطوات حل محاذاة على =
\begin{gathered} … \end{gathered} :: عدة معادلات تحت بعضها في كتلة واحدة
pmatrix bmatrix vmatrix Vmatrix Bmatrix matrix smallmatrix array :: المصفوفات والمحددات
# الوحدات والأعداد
\qty{9.8}{m/s^2}   \qty{220}{\volt} :: عدد مع وحدة (الوحدة مكتوبة m/s^2 أو kg.m/s^2 أو ohm، أو بأوامر \meter\per\second\squared)
\si{m/s}   \unit{\newton} :: الوحدة وحدها
\num{6.02e23}   \num{2+-0.1} :: عدد علمي (6.02×10^23) و ±
\ang{30} :: زاوية بالدرجات 30°
\meter \second \kilogram \gram \newton \joule \watt \volt \ampere \ohm \hertz \pascal \coulomb \farad \henry \tesla \weber \kelvin \celsius \mole \litre \hour \minute \electronvolt \percent \degree \radian :: الوحدات بالأوامر، مع البادئات \kilo \centi \milli \micro \mega \giga \nano \pico \deci و\per \squared \cubed
# الكيمياء داخل المعادلات
\ce{2H2 + O2 -> 2H2O} :: معادلة كيميائية (mhchem): -> سهم، <=> اتزان، ->[\Delta] شرط فوق السهم، ^ غاز، v راسب، Fe^{3+} شحنة، (aq) (s) (g) (l) الحالات
\econfig{Fe}   \econfig[short]{الحديد} :: التوزيع الإلكتروني (والمختصر بالغاز النبيل)
# أوامر مفيدة للمعلم
\boxed{…}  \cancel{…}  \bcancel{…}  \cancelto{0}{…} :: إطار حول الناتج، والشطب (الاختصار)
\underbrace{…}_{…}  \overbrace{…}^{…}  \overset{?}{=}  \underset{}{} :: الأقواس الموضحة والكتابة فوق/تحت الرموز
\textcolor{red}{…}  \color{blue}  \colorbox{yellow}{…} :: تلوين جزء من المعادلة
\vec{ق}  \overline{أب}  \overrightarrow{أب}  \hat{}  \dot{}  \bar{} :: المتجهات والقطع والعلامات
\xrightarrow{…}  \xleftarrow{…}  \Rightarrow  \iff :: أسهم مكتوب عليها ونتائج
\sum_{ر=1}^{ن}  \prod  \iint  \oint  \binom{ن}{ر} :: المجاميع والتوافيق
`,
      ex: [
        ['قوانين مع عناوين', '% 1. القانون العام\nس = \\frac{-ب \\pm \\sqrt{ب^2 - 4 أ جـ}}{2 أ}\n% 2. متطابقة\nجا^2 س + جتا^2 س = 1\nمساحة الدائرة: $م = \\pi نق^2$ حيث $نق$ نصف القطر'],
        ['نظام ونهاية وتكامل', '\\begin{cases} 2س + ص = 5 \\\\ س - ص = 1 \\end{cases}\nنها_{س \\to 0} \\frac{جا س}{س} = 1\n\\int_{0}^{\\pi} جا س \\, ءس = 2'],
        ['دالة متعددة التعريف وخطوات حل', 'د(س) = \\begin{cases} س^2 & س \\ge 0 \\\\ -س & س < 0 \\end{cases}\n\\begin{aligned} 2س + 3 &= 7 \\\\ 2س &= 4 \\\\ س &= 2 \\end{aligned}'],
        ['مصفوفة ومحدد', 'أ = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix} ، \\begin{vmatrix} 1 & 2 \\\\ 3 & 4 \\end{vmatrix} = -2'],
        ['الوحدات', 'ق = \\qty{2}{kg} \\times \\qty{9.8}{m/s^2} = \\qty{19.6}{N}\nع = \\qty{3e8}{\\meter\\per\\second} ، \\ang{30} ، \\num{6.02e23}'],
        ['أوامر المعلم', '\\frac{\\cancel{2}س}{\\cancel{2}} = \\boxed{س}\n\\underbrace{1 + 2 + 3}_{6} \\overset{?}{=} \\textcolor{red}{6}'],
        ['كيمياء داخل النص', '\\ce{2H2 + O2 -> 2H2O}\nيتفاعل الخارصين $\\ce{Zn + 2HCl -> ZnCl2 + H2 ^}$ وينتج غاز الهيدروجين\nالتوزيع الإلكتروني للحديد: $\\econfig[short]{Fe}$']
      ] },

    // ------------------------------------------------------------------ graph
    { id: 'graph', ic: '📈', t: 'رسم الدوال',
      note: 'المتغير س (أو x). الدوال المثلثية تُفعّل تدريج π تلقائياً. القطع والمقاطع والتقاطع تُحسب وتُكتب تلقائياً.',
      cmds: R`
# الكتلة وخياراتها
\begin{graph}[خيارات] … \end{graph} :: رسم دوال في مستوى إحداثي
x=-4:4   y=-5:6 :: مجال المحورين (أو xmin= xmax= ymin= ymax=). بدون y يُختار المجال تلقائياً
width=12cm   height=8cm :: مقاس الرسم (cm أو سم أو mm)
equal :: نفس المقياس على المحورين (1:1) — للدوائر والزوايا الحقيقية
pi   nopi :: تدريج المحور س بمضاعفات π (يُفعّل تلقائياً مع جا وجتا وطا)
extrema :: تعليم القيم العظمى والصغرى المحلية
roots  yint  intersections  coords :: مفعّلة افتراضياً: أصفار الدالة، المقطع الصادي، نقاط التقاطع، كتابة الإحداثيات. للإلغاء: noroots noyint nointersections nocoords
grid  minor  axes  arrows  ticks  axisnames :: مفعّلة افتراضياً (الشبكة، الشبكة الدقيقة، المحاور، الأسهم، التدريج، اسما المحورين). للإلغاء: nogrid nominor noaxes …
title={…}   font=Amiri   fontsize=12 :: عنوان الرسم والخط
digits=eastern   notation=en :: أرقام هندية، أو كتابة لاتينية (x و y)
# الأوامر
\plot[خيارات]{س^2 - 4} :: رسم دالة. الخيارات: color=red، width=thick، dashed أو dotted، name=د(س) (اسم يظهر بجانب المنحنى)، nolabel (بدون اسم)، domain=0:5 (جزء من المجال)
\plot{ص = 2س + 1}   \plot{د(س) = س^3} :: يمكن كتابة ص = أو د(س) = قبل الدالة
\plot{3} :: خط أفقي ص = 3
\plot{س = 2}   \vline[dashed]{2} :: خط رأسي س = 2 (للخطوط المقاربة)
\points[color=blue, line, nomarks]{(0,1) (1,3) (2,2)} :: نقاط بيانات (line يصلها بخط)
\point{أ}{(2, 0)}   \point[label=أ]{(2, 0)} :: نقطة مسمّاة مع إحداثياتها
\area[of=1, from=0, to=2] :: تظليل المساحة تحت المنحنى رقم 1 وكتابة قيمتها
\area[of=1, and=2, from=0, to=2, color=orange, novalue] :: المساحة بين منحنيين (الترقيم حسب ترتيب \plot و\points)
\title{…} :: عنوان الرسم
# كتابة الدالة
جا س  جتا 2س  طا س  قا س  لو س  لو_2 س  لط س  هـ^س  |س - 1| :: الدوال العربية والقيمة المطلقة
\sqrt{س}  \sqrt[3]{س}  \frac{1}{س - 2}  س^{12} :: الجذور والكسور والأسس (الأس أكثر من رقم بين { })
\sin x  \cos x  \ln x  e^x :: الإنجليزية بـ \ قبل اسم الدالة
دالة متعددة التعريف :: تُرسم بعدة \plot لكل منها domain=
color=red :: الألوان: red blue green teal orange purple brown gray black magenta cyan yellow olive violet pink أو أحمر أزرق أخضر فيروزي برتقالي بنفسجي بني رمادي أسود أصفر وردي أو #1f5fbf
width=thick :: السُمك: thin, semithick, thick, very thick, ultra thick أو رقم
pgfplots: \begin{tikzpicture}\begin{axis}[xmin=-3, xmax=3] \addplot[blue, domain=-3:3]{x^2}; \end{axis}\end{tikzpicture} :: يُقبل أيضاً (كل \addplot ينتهي بـ ;)
`,
      ex: [
        ['قطع مكافئ وقيم قصوى', '\\begin{graph}[x=-4:4, y=-5:6, extrema]\n  \\plot[name=د(س)]{س^2 - 2س - 3}\n  \\plot[red, dashed]{2س + 1}\n\\end{graph}'],
        ['دوال مثلثية (تدريج π)', '\\begin{graph}[x=-0.5:7, y=-2.5:2.5]\n  \\plot{جا س}\n  \\plot[color=red, dashed]{جتا س}\n  \\area[of=1, from=0, to=\\pi]\n\\end{graph}'],
        ['لوغاريتمية وأسية وجذرية', '\\begin{graph}[x=-3:6, y=-3:6, noroots, nointersections]\n  \\plot{لط س}\n  \\plot[color=أخضر]{هـ^س}\n  \\plot[color=purple, domain=0:6, width=very thick]{\\sqrt{س}}\n  \\plot[orange, dotted]{|س - 1|}\n\\end{graph}'],
        ['متعددة التعريف ونقاط', '\\begin{graph}[x=-4:4, y=-2:6, nocoords]\n  \\plot[domain=-4:0, name=د(س)]{س^2}\n  \\plot[domain=0:4, red, nolabel]{س + 1}\n  \\point{أ}{(0, 1)}\n\\end{graph}'],
        ['دالة كسرية وخطوط مقاربة', '\\begin{graph}[x=-5:5, y=-6:6]\n  \\plot{\\frac{1}{س - 2} + 1}\n  \\vline[dashed, gray, nolabel]{2}\n  \\plot[dotted, gray, nolabel]{1}\n\\end{graph}'],
        ['المساحة بين منحنيين', '\\begin{graph}[x=-1:3, y=-1:5]\n  \\plot{س^2}\n  \\plot[color=red]{2س}\n  \\area[of=1, and=2, from=0, to=2, color=orange]\n\\end{graph}'],
        ['نقاط بيانات', '\\begin{graph}[x=0:5, y=0:10, title={القياسات}]\n  \\points[color=blue, line]{(0,1) (1,3) (2,2) (3,6) (4,8)}\n  \\point[label=أ]{(3, 6)}\n\\end{graph}'],
        ['pgfplots', '\\begin{tikzpicture}\n\\begin{axis}[xmin=-3, xmax=3, grid=major]\n  \\addplot[blue, thick, domain=-3:3]{exp(-x^2)};\n\\end{axis}\n\\end{tikzpicture}']
      ] },

    // ------------------------------------------------------------------ geometry
    { id: 'geo', ic: '📐', t: 'الأشكال الهندسية',
      note: 'الأطوال بالسنتيمتر (يُدرج الشكل بمقاسه الحقيقي) والزوايا بالدرجات. الأضلاع والزوايا المتساوية تُعلَّم تلقائياً.',
      cmds: R`
# الكتلة وخياراتها
\begin{geometry}[خيارات] … \end{geometry} :: شكل هندسي
sides=values :: كتابة أطوال كل الأضلاع
angles=values   angles=marks   angles=none :: كتابة قياس كل الزوايا، أو أقواس الزوايا المتساوية فقط (الافتراضي)، أو بدون
unit=سم   decimals=1 :: الوحدة بعد الأطوال وعدد المنازل العشرية
noticks  noright  nonames  nodots :: إلغاء علامات تساوي الأضلاع، مربع الزاوية القائمة، أسماء النقاط، نقاط الرؤوس
fill=blue  nofill  opacity=0.12  stroke=black  accent=red  linewidth=2 :: ألوان التعبئة والخطوط وأقواس الزوايا
scale=1.5   fontsize=12   font=Amiri   digits=eastern   notation=en :: الحجم والخط والأرقام
# المثلثات  \triangle{أ,ب,جـ}[…]
\triangle{أ,ب,جـ}[sides=5,6,7] :: بأطوال الأضلاع الثلاثة أب، بجـ، جـأ
\triangle{أ,ب,جـ}[right=ب, legs=3,4] :: قائم الزاوية في ب بساقين (أو hyp=5 مع ساق)
\triangle{أ,ب,جـ}[base=6, angles=50,60] :: بضلع بجـ والزاويتين ب و جـ
\triangle{أ,ب,جـ}[sides=5,7, angle=60] :: بضلعين أب، أجـ والزاوية المحصورة أ
\triangle{أ,ب,جـ}[equilateral, side=4] :: متطابق الأضلاع
\triangle{أ,ب,جـ}[isosceles, base=6, legs=5] :: متطابق الضلعين (أو height= بدل legs)
# الأشكال الرباعية والمضلعات والدائرة
\square{أ,ب,جـ,د}[side=4] :: مربع
\rectangle{أ,ب,جـ,د}[width=6, height=3] :: مستطيل
\parallelogram{أ,ب,جـ,د}[base=5, side=3, angle=60] :: متوازي أضلاع
\rhombus{أ,ب,جـ,د}[side=4, angle=60] :: معيّن
\trapezoid{أ,ب,جـ,د}[bottom=6, top=3, height=3] :: شبه منحرف (متساوي الساقين؛ right للقائم، offset= للإزاحة)
\kite{أ,ب,جـ,د}[width=4, top=1.6, bottom=3.6] :: شكل الطائرة الورقية (دالتون)
\regular{أ,ب,جـ,د,هـ}[side=3]   \regular{أ,ب,جـ,د,هـ,و}[radius=2.5, center=م] :: مضلع منتظم (عدد الأسماء = عدد الأضلاع)
\polygon{أ,ب,جـ,د} :: مضلع من نقاط موجودة
\circle{م}[radius=3] :: دائرة مركزها م. الخيارات: radiuslabel (نصف قطر مكتوب نق)، showradius، nocenter، fill، dashed، color
\circle{م,أ} :: دائرة مركزها م وتمر بالنقطة أ
خيارات الأشكال :: fill=لون، nofill، color=، dashed، labels={٣,٤,س} (كتابة على كل ضلع بالترتيب، - للتخطي)، marks={1,2,1,2} (عدد علامات التساوي لكل ضلع)، anglelabels={α,-,β}
# النقاط
\point{هـ}{(1, 2)} :: نقطة بإحداثياتها (سم). pos=above|below|left|right لموضع الاسم، hidden بدون اسم، nodot بدون نقطة
\point[on=م, angle=30]{أ} :: نقطة على الدائرة التي مركزها م بزاوية 30°
\midpoint{د}{ب,جـ} :: منتصف القطعة
\foot{د}{أ}{ب,جـ} :: موقع العمود (الارتفاع) من أ على بجـ مع رسمه وعلامة القائمة (dashed، nodraw)
\intersection{ن}{أ,جـ}{ب,د} :: نقطة تقاطع المستقيمين أجـ و بد
# الخطوط والزوايا والكتابة
\segment{أ,ب}   \line{أ,ب}   \ray{أ,ب}   \vector{أ,ب} :: قطعة، مستقيم، شعاع، متجه. الخيارات: dashed، color=، label=نص، marks=2، parallel=1 (علامة التوازي)، nolength
\side[label=س]{أ,ب} :: كتابة على ضلع موجود بدون رسم خط جديد
\angle{ب,أ,جـ} :: زاوية رأسها أ (الحرف الأوسط). الخيارات: label=α، value (القياس بالدرجات)، arcs=2، right، fill، color=
\text{أ}{نص}   \text{(2,-1)}{شكل ١} :: كتابة بجانب نقطة أو عند إحداثيات
\name{أ}{أ₁} :: تغيير الاسم الظاهر لنقطة
`,
      ex: [
        ['مثلث بأطواله الثلاثة', '\\begin{geometry}[sides=values, angles=values]\n  \\triangle{أ,ب,جـ}[sides=5,6,7]\n\\end{geometry}'],
        ['مثلث قائم وارتفاع', '\\begin{geometry}[sides=values]\n  \\triangle{أ,ب,جـ}[right=ب, legs=3,4]\n  \\foot{د}{ب}{أ,جـ}\n\\end{geometry}'],
        ['مثلث بضلع وزاويتين', '\\begin{geometry}[angles=values]\n  \\triangle{أ,ب,جـ}[base=6, angles=50,60]\n\\end{geometry}'],
        ['متطابق الضلعين مع ارتفاع ومتوسط', '\\begin{geometry}\n  \\triangle{أ,ب,جـ}[isosceles, base=6, legs=5]\n  \\foot{د}{أ}{ب,جـ}\n  \\median[name=هـ, dashed]{ب}{أ,جـ}\n\\end{geometry}'],
        ['متوازي أضلاع بعلامات', '\\begin{geometry}[fill=blue, opacity=0.15]\n  \\parallelogram{أ,ب,جـ,د}[base=5, side=3, angle=60, marks={1,2,1,2}]\n  \\segment[parallel=1]{أ,ب}\n  \\segment[parallel=1]{د,جـ}\n\\end{geometry}'],
        ['شبه منحرف قائم', '\\begin{geometry}[sides=values]\n  \\trapezoid{أ,ب,جـ,د}[bottom=6, top=3, height=3, right]\n\\end{geometry}'],
        ['طائرة ورقية', '\\begin{geometry}\n  \\kite{أ,ب,جـ,د}[width=4, top=1.5, bottom=3.5]\n  \\segment[dashed]{أ,جـ}\n  \\segment[dashed]{ب,د}\n\\end{geometry}'],
        ['سداسي منتظم', '\\begin{geometry}\n  \\regular{أ,ب,جـ,د,هـ,و}[side=3, center=م]\n  \\segment[dashed, label=نق]{م,أ}\n\\end{geometry}'],
        ['دائرة ونقاط عليها', '\\begin{geometry}\n  \\circle{م}[radius=2.5]\n  \\point[on=م, angle=30]{أ}\n  \\point[on=م, angle=150]{ب}\n  \\point[on=م, angle=260]{جـ}\n  \\polygon{أ,ب,جـ}\n  \\angle[value]{أ,جـ,ب}\n\\end{geometry}'],
        ['نقاط ومستقيم وشعاع ومتجه', '\\begin{geometry}[nodots]\n  \\point{أ}{(0,0)}\n  \\point{ب}{(4,1)}\n  \\point[pos=below]{جـ}{(1,3)}\n  \\line{أ,ب}\n  \\ray[dashed]{أ,جـ}\n  \\vector[label=ع, color=red]{جـ,ب}\n\\end{geometry}']
      ] },

    // ------------------------------------------------------------------ constructions
    { id: 'constr', ic: '⌖', t: 'الإنشاءات والتحويلات الهندسية',
      note: 'داخل geometry. صور التحويلات تُسمّى أ′ ب′ جـ′ تلقائياً أو بـ names={…}. القيم التي فيها فواصل بين { }.',
      cmds: R`
# الإنشاءات
\perpbisector{أ,ب} :: العمود المنصف (name=م لتسمية المنتصف، solid، color=)
\bisector[name=د]{ب,أ,جـ} :: منصف الزاوية عند أ حتى الضلع المقابل
\median[name=د]{أ}{ب,جـ} :: المتوسط من أ إلى منتصف بجـ
\foot{د}{أ}{ب,جـ} :: الارتفاع من أ
\circumcircle[center=م, radii]{أ,ب,جـ} :: الدائرة المارة برؤوس المثلث (radii يرسم أنصاف الأقطار)
\incircle[center=و, touch]{أ,ب,جـ} :: الدائرة الداخلية (touch أو points={س,ص,ع} لنقاط التماس)
\tangent{م}{أ} :: المماس عند النقطة أ من الدائرة التي مركزها م (length=، noradius)
\tangents[names={ل,ك}]{ن}{م} :: المماسان من نقطة ن خارج الدائرة م
# التحويلات (خياراتها المشتركة: names={…}، color=، fill=، nofill، dashed، lines لخطوط الربط بين النقطة وصورتها)
\reflect[over=س]{أ,ب,جـ}   [over=ص]   [over={د,هـ}] :: انعكاس في محور السينات أو الصادات أو في المستقيم دهـ
\reflect[center=م]{أ,ب,جـ} :: انعكاس في نقطة
\rotate[center=م, angle=90]{أ,ب,جـ} :: دوران (عكس عقارب الساعة؛ cw مع عقارب الساعة)
\translate[by=(3,1)]{أ,ب,جـ}   [vector={أ,ب}] :: انسحاب بمتجه
\dilate[center=م, k=2]{أ,ب,جـ} :: تكبير (أو تصغير k=0.5)
`,
      ex: [
        ['الدائرة المارة بالرؤوس والعمود المنصف', '\\begin{geometry}\n  \\triangle{أ,ب,جـ}[sides=5,6,7]\n  \\circumcircle[center=م]{أ,ب,جـ}\n  \\perpbisector{أ,ب}\n\\end{geometry}'],
        ['الدائرة الداخلية ونقاط التماس', '\\begin{geometry}\n  \\triangle{أ,ب,جـ}[sides=5,6,7]\n  \\incircle[center=و, touch]{أ,ب,جـ}\n\\end{geometry}'],
        ['منصف زاوية', '\\begin{geometry}\n  \\triangle{أ,ب,جـ}\n  \\bisector[name=د, color=green]{ب,أ,جـ}\n\\end{geometry}'],
        ['مماس ومماسان من نقطة', '\\begin{geometry}\n  \\circle{م}[radius=2]\n  \\point{ن}{(5,0)}\n  \\tangents[names={ل,ك}]{ن}{م}\n\\end{geometry}'],
        ['انعكاس حول ضلع', '\\begin{geometry}\n  \\triangle{أ,ب,جـ}[sides=5,6,7]\n  \\reflect[over={أ,ب}]{أ,ب,جـ}\n\\end{geometry}'],
        ['دوران', '\\begin{geometry}\n  \\point{م}{(0,0)}\n  \\point{أ}{(1,0)}\n  \\point{ب}{(3,0)}\n  \\point{جـ}{(1,2)}\n  \\polygon{أ,ب,جـ}\n  \\rotate[center=م, angle=90]{أ,ب,جـ}\n\\end{geometry}'],
        ['انسحاب وتكبير', '\\begin{geometry}\n  \\point{أ}{(0,0)}\n  \\point{ب}{(2,0)}\n  \\point{جـ}{(1,2)}\n  \\polygon{أ,ب,جـ}\n  \\translate[by=(4,1), dashed]{أ,ب,جـ}\n  \\point{م}{(-1,-1)}\n  \\dilate[center=م, k=1.5, nofill, lines, names={د,هـ,و}]{أ,ب,جـ}\n\\end{geometry}']
      ] },

    // ------------------------------------------------------------------ charts
    { id: 'stats', ic: '📊', t: 'الإحصاء (الرسوم البيانية)',
      note: 'type= يحدد النوع. العنوان أو قائمة الألوان التي فيها فواصل توضع بين { }.',
      cmds: R`
# الكتلة وأنواعها
\begin{chart}[type=…, …] … \end{chart} :: رسم بياني
type=bar | hbar | line | pie | donut | histogram | polygon | ogive | scatter | box | normal | binomial :: أعمدة، أشرطة أفقية، خطي، دائري، حلقي، مدرج تكراري، مضلع تكراري، منحنى متجمع، انتشار، صندوقي، التوزيع الطبيعي، ذو الحدين
# الخيارات
title={…}   xlabel=…   ylabel=… :: العنوان واسما المحورين
values  legend  grid  percent :: مفعّلة افتراضياً (قيم على الأعمدة، مفتاح الألوان، الشبكة، النسبة في الدائري). للإلغاء: novalues nolegend nogrid nopercent
angles :: كتابة زاوية كل قطاع في الدائري
stacked :: أعمدة مكدسة (عند وجود أكثر من سلسلة)
polygon :: رسم المضلع التكراري فوق المدرج
more :: المنحنى المتجمع النازل (الافتراضي الصاعد)
regression :: خط الانحدار ومعادلته ومعامل الارتباط (في الانتشار)
colors={أحمر, أزرق, أخضر} :: ألوان القطاعات أو الأعمدة
ymin=0  ymax=100  ystep=10 :: مدى المحور الرأسي وخطوته
bins=5   classwidth=10   start=0 :: تكوين الفئات تلقائياً من بيانات خام (للمدرج والمضلع والمتجمع)
width=12cm   height=8cm   digits=eastern   notation=en   font=Amiri :: الحجم والأرقام والخط
# البيانات
\data{الرياضيات:85, الفيزياء:78} :: تسميات وقيم (سلسلة واحدة). name= color= لتسمية السلسلة ولونها
\data{12, 15, 22, 27, 31} :: بيانات خام (تُكوَّن منها الفئات في المدرج)
\labels{2022, 2023, 2024}  \series[name=ذكور, color=blue]{12, 15, 18}  \series[name=إناث]{10, 14, 20} :: عدة سلاسل (أعمدة متجاورة أو مكدسة أو عدة خطوط)
\classes{10-20:4, 20-30:7, 30-40:12} :: فئات وتكراراتها (المدرج، المضلع، المتجمع)
\points{(1,52) (2,58) (3,65)} :: نقاط الانتشار
\box[name=الشعبة أ]{12, 15, 17, 20, 22} :: صندوق لكل مجموعة (يمكن تكرار \box)
`,
      ex: [
        ['أعمدة بألوان', '\\begin{chart}[type=bar, title=درجات الطالب, xlabel=المادة, ylabel=الدرجة, colors={أحمر, أزرق, أخضر}]\n  \\data{الرياضيات:85, الفيزياء:78, الكيمياء:90}\n\\end{chart}'],
        ['أعمدة متجاورة لسلسلتين', '\\begin{chart}[type=bar, title=عدد الطلاب]\n  \\labels{2022, 2023, 2024}\n  \\series[name=ذكور, color=أزرق]{12, 15, 18}\n  \\series[name=إناث, color=وردي]{10, 14, 20}\n\\end{chart}'],
        ['أعمدة مكدسة أفقية', '\\begin{chart}[type=hbar, stacked]\n  \\labels{الشعبة أ, الشعبة ب}\n  \\series[name=ناجح]{20, 18}\n  \\series[name=راسب]{3, 5}\n\\end{chart}'],
        ['خطي لعدة سلاسل', '\\begin{chart}[type=line, title=درجات الحرارة, xlabel=الشهر, ylabel=الدرجة, ymin=0, ymax=40, ystep=10]\n  \\labels{يناير, فبراير, مارس, أبريل}\n  \\series[name=طرابلس]{14, 16, 19, 23}\n  \\series[name=سبها]{12, 15, 21, 27}\n\\end{chart}'],
        ['دائري وحلقي', '\\begin{chart}[type=pie, title=الرياضة المفضلة, angles]\n  \\data{كرة القدم:12, السلة:8, السباحة:5}\n\\end{chart}\n\\begin{chart}[type=donut, nolegend]\n  \\data{نعم:30, لا:10}\n\\end{chart}'],
        ['مدرج ومضلع تكراري', '\\begin{chart}[type=histogram, polygon, xlabel=الدرجات, ylabel=عدد الطلاب]\n  \\classes{10-20:4, 20-30:7, 30-40:12, 40-50:9}\n\\end{chart}'],
        ['مدرج من بيانات خام', '\\begin{chart}[type=histogram, bins=4]\n  \\data{12, 15, 22, 27, 31, 35, 38, 41, 44, 47}\n\\end{chart}'],
        ['المنحنى المتجمع الصاعد والنازل', '\\begin{chart}[type=ogive, title=المتجمع الصاعد]\n  \\classes{0-10:3, 10-20:8, 20-30:6}\n\\end{chart}\n\\begin{chart}[type=ogive, more, title=المتجمع النازل]\n  \\classes{0-10:3, 10-20:8, 20-30:6}\n\\end{chart}'],
        ['انتشار وخط انحدار', '\\begin{chart}[type=scatter, regression, xlabel=الساعات, ylabel=الدرجة]\n  \\points{(1,52) (2,58) (3,65) (4,70) (5,79)}\n\\end{chart}'],
        ['صندوقي لمجموعتين', '\\begin{chart}[type=box, title=مقارنة الشعب]\n  \\box[name=الشعبة أ]{12, 15, 17, 20, 22}\n  \\box[name=الشعبة ب]{10, 14, 18, 19, 25, 27}\n\\end{chart}']
      ] },

    // ------------------------------------------------------------------ stats tables
    { id: 'stabs', ic: '▤', t: 'الجداول الإحصائية',
      note: 'تُدرج جداول Word حقيقية قابلة للتعديل، في سطر مستقل.',
      cmds: R`
\freqtable{2:3, 4:5, 6:2} :: جدول تكراري لقيم وتكراراتها
\freqtable{10-20:4, 20-30:7} :: جدول تكراري بفئات (مع مركز الفئة)
\freqtable{3, 5, 7, 7, 9} :: من بيانات خام
\freqtable{أحمر:5, أزرق:3} :: بيانات وصفية
خيارات \freqtable :: percent (النسبة المئوية)، fx (عمود س×ت)، nomid، norelative، nocumulative، nototal، columns={relative, percent, cumulative, fx, mid}، xname=عدد الإخوة، color=لون الرأس
\statstable{12, 15, 18, 20} :: جدول المقاييس: العدد، الوسط، الوسيط، المنوال، المدى، الربيعيات، التباين، الانحراف المعياري، معامل الاختلاف. sample للعينة (ن−1)
\statstable{classes={10-20, 20-30}, freq={4, 7}} :: المقاييس لبيانات مبوبة
\ztable[from=0, to=1] :: جدول التوزيع الطبيعي المعياري Z
\binomtable[n=5, p=0.4] :: جدول توزيع ذي الحدين (الاحتمال والتجميعي)
`,
      ex: [
        ['جدول تكراري بفئات', '\\freqtable[percent, fx]{10-20:4, 20-30:7, 30-40:12, 40-50:5}'],
        ['جدول المقاييس', '\\statstable[sample]{3, 5, 7, 7, 9, 12}'],
        ['جدول ذي الحدين', '\\binomtable[n=4, p=0.5]']
      ] },

    // ------------------------------------------------------------------ probability
    { id: 'prob', ic: '🔔', t: 'التوزيعات الاحتمالية',
      note: 'المنحنى الطبيعي بالمساحة المظللة بين from وto، وذو الحدين بأعمدة ملونة. الكتلة بدون محتوى.',
      cmds: R`
\begin{chart}[type=normal, mean=50, sd=10, from=40, to=60]\end{chart} :: التوزيع الطبيعي مع تظليل الاحتمال وكتابته (from=-inf أو to=inf للطرف المفتوح)
\begin{chart}[type=normal, z, from=-1.96, to=1.96]\end{chart} :: التوزيع الطبيعي المعياري Z
\begin{chart}[type=binomial, n=10, p=0.3, from=2, to=4]\end{chart} :: توزيع ذي الحدين مع تلوين المدى المطلوب
xlabel=… :: اسم المحور الأفقي
`,
      ex: [
        ['التوزيع الطبيعي', '\\begin{chart}[type=normal, mean=50, sd=10, from=40, to=60]\n\\end{chart}'],
        ['الطبيعي المعياري', '\\begin{chart}[type=normal, z, from=-inf, to=1.96]\n\\end{chart}'],
        ['توزيع ذي الحدين', '\\begin{chart}[type=binomial, n=10, p=0.3, from=2, to=4]\n\\end{chart}'],
        ['جدول Z', '\\ztable[from=0, to=1]']
      ] },

    // ------------------------------------------------------------------ physics
    { id: 'phys', ic: '⚙', t: 'الفيزياء والميكانيكا',
      note: 'الإحداثيات بالسنتيمتر والمحور ص لأعلى. الزاوية بالدرجات: 0 يمين، 90 أعلى، −90 أسفل. التسمية التي فيها $ أو ^ أو _ تُكتب كمعادلة.',
      cmds: R`
# الكتلة
\begin{physics}[scale=1, digits=eastern, notation=en, fontsize=12] … \end{physics} :: رسم فيزيائي
# الأسطح والأجسام
\ground{(0,0)}{(8,0)}   \ceiling{…}{…}   \wall{…}{…}   \surface{…}{…} :: أرض، سقف، جدار (flip للجهة الأخرى)، سطح — بتخطيط
\incline[angle=30, base=6, name=م]{(0,0)} :: مستوى مائل (flip للميل لليسار، label=θ، noshowangle، nohatch)
\block[on=م, at=0.5, name=ج]{ك} :: جسم على المستوى المائل (at نسبة موقعه على المستوى)
\block[at=(3,0), name=ج]{ك}   \block[hang=(5,3)]{ك} :: جسم على سطح (الموضع منتصف القاعدة) أو معلّق بخيط. w= h= للمقاس، color=
\ball[r=0.4, label=ك, name=ك]{(2,3)}   \particle{(x,y)} :: كرة أو جسيم
# القوى والمتجهات
\force[from=ج, angle=-90, len=1.6]{و} :: قوة (حمراء) من الجسم ج. from=ج.top|bottom|left|right لنقطة البداية، at=(x,y) من نقطة
\force[from=ج, dir=normal]{ر}   dir=along   dir=against   dir=up|down|left|right :: عمودية على السطح، مع الميل، عكس الميل، أو باتجاه ثابت
\force[at=(0,2), to=(0,0)]{ق} :: قوة بين نقطتين
pos=end | above | below | start | left | right :: موضع تسمية القوة (الافتراضي عند رأس السهم)
color=blue   dashed   width=3   tail=0.3 :: لون وشكل السهم
\velocity[from=ج, angle=0]{ع}   \acc[from=ج, angle=0]{ت}   \vector[at=(4,0), to=(6,1.5)]{…} :: السرعة (أزرق)، التسارع (أخضر بسهم مزدوج)، متجه
# الأدوات
\pulley[r=0.5]{(6,4)} :: بكرة (nomount بدون تثبيت في السقف)
\rope{(1,2) (6,4)}   \string{…}   \curve{…} :: حبل عبر نقاط (arrow لسهم في آخره، dashed)
\spring[coils=8, label=ن]{(0,1)}{(3,1)} :: نابض
\pivot{(3,0)}   \beam{(0,0.3)}{(6,0.3)} :: نقطة ارتكاز، وعارضة (رافعة)
\line{(0,0)}{(3,0)}   \dashed{…}{…} :: خط مساعد
\circle[r=2.5, dashed]{(0,0)} :: دائرة (مسار حركة دائرية)
\axes[len=2, x=س, y=ص, angle=30]{(4,3)} :: محوران مائلان لتحليل القوى
# القياسات والتسميات
\arc[label=θ, r=0.9]{(0,0)}{0}{30} :: قوس زاوية من 0° إلى 30°
\dim[label=ف, offset=0.45]{(0,0)}{(6,0)} :: خط أبعاد بين نقطتين
\point[label=م]{(0,0)}   \text{(0,3)}{نص} :: نقطة مسمّاة، وكتابة حرة
# المقذوفات والبصريات والكهرباء
\projectile[v=20, angle=45, g=9.8, h=0, marks]{(0,0)} :: مسار المقذوف مع أقصى ارتفاع والمدى (novelocity، nolabels)
\lens[type=convex, f=2, object=5, height=1.2]{(0,0)} :: عدسة محدبة أو مقعرة (type=concave) مع الأشعة والصورة (norays)
\mirror[type=concave, f=2, object=5]{(0,0)} :: مرآة مقعرة أو محدبة
\charge[q=+, label=ش₁]{(0,0)} :: شحنة موجبة أو سالبة (q=-)
\field[angle=0, len=4, n=5, label=مج]{(0,0)}{(0,3)} :: خطوط مجال منتظم
\plate[sign=+]{(0,-4)}{(0,-1)} :: لوح مشحون (مكثف)
`,
      ex: [
        ['جسم على مستوى مائل', '\\begin{physics}\n  \\incline[angle=30, base=6, name=م]{(0,0)}\n  \\block[on=م, at=0.55, name=ج]{ك}\n  \\force[from=ج, angle=-90, len=1.6]{و}\n  \\force[from=ج, dir=normal, len=1.7, color=blue]{ر}\n  \\force[from=ج, dir=along, len=1.3, color=orange]{ح}\n\\end{physics}'],
        ['آلة أتوود', '\\begin{physics}\n  \\pulley[r=0.7]{(0,5)}\n  \\rope{(-0.7,5) (-0.7,2.5)}\n  \\rope{(0.7,5) (0.7,4)}\n  \\block[hang=(-0.7,2.5), w=1, h=1, name=أ]{م₁}\n  \\block[hang=(0.7,4), w=1, h=0.8, name=ب]{م₂}\n  \\force[from=أ, angle=-90, len=1.4]{و₁}\n  \\force[from=ب.top, angle=90, len=0.6, color=blue, pos=right]{ش}\n\\end{physics}'],
        ['نابض وجدار', '\\begin{physics}\n  \\wall{(0,0)}{(0,2.2)}\n  \\ground{(0,0)}{(8,0)}\n  \\spring[coils=9, label=ن]{(0,0.6)}{(4,0.6)}\n  \\block[at=(4.7,0), w=1.4, h=1.2, name=ج]{ك}\n  \\force[from=ج.right, angle=0, len=1.5, color=green]{ق}\n\\end{physics}'],
        ['رافعة', '\\begin{physics}\n  \\beam{(-3,0.5)}{(2,0.5)}\n  \\pivot{(0,0.39)}\n  \\ground{(-3.5,0)}{(2.5,0)}\n  \\force[at=(-3,2.4), to=(-3,0.62), pos=left]{ق₁}\n  \\force[at=(2,2.4), to=(2,0.62), pos=right]{ق₂}\n  \\dim[label=ف₁, offset=-0.9]{(-3,0.3)}{(0,0.3)}\n\\end{physics}'],
        ['حركة دائرية', '\\begin{physics}\n  \\circle[r=2.5, dashed]{(0,0)}\n  \\point[label=م]{(0,0)}\n  \\ball[r=0.3, name=ك, label=ك]{(2.5,0)}\n  \\line{(0,0)}{(2.5,0)}\n  \\force[from=ك, angle=180, len=1.3, pos=below]{ق م}\n  \\velocity[from=ك, angle=90, len=1.6]{ع}\n\\end{physics}'],
        ['مقذوف', '\\begin{physics}\n  \\projectile[v=20, angle=45, marks]{(0,0)}\n\\end{physics}'],
        ['عدسة محدبة ومرآة مقعرة', '\\begin{physics}\n  \\lens[type=convex, f=2, object=5, height=1.2]{(0,0)}\n\\end{physics}\n\\begin{physics}\n  \\mirror[type=concave, f=2, object=3, height=1]{(0,0)}\n\\end{physics}'],
        ['شحنات ومجال', '\\begin{physics}\n  \\charge[q=+, label=ش₁]{(0,0)}\n  \\charge[q=-, label=ش₂]{(5,0)}\n  \\force[at=(0.4,0), angle=0, len=1.4]{ق}\n  \\dim[label=ف, offset=-0.9]{(0,0)}{(5,0)}\n\\end{physics}']
      ] },

    // ------------------------------------------------------------------ motion & waves
    { id: 'motion', ic: '〰', t: 'منحنيات الحركة والموجات',
      note: 'داخل physics.',
      cmds: R`
\motion[type=vt]{(0,0) (2,10) (5,10) (7,0)} :: منحنى السرعة–الزمن (type=xt الإزاحة–الزمن، type=at التسارع–الزمن). أو \vt{…} و\xt{…}
area :: تظليل المساحة وكتابتها (الإزاحة)
slopes :: كتابة الميل لكل جزء (التسارع أو السرعة)
names={أ,ب,جـ,د} :: تسمية النقاط
xlabel=…  ylabel=…  w=7  h=4  at=(0,0)  color=… :: أسماء المحاور والمقاس والموضع
\wave[amplitude=1, wavelength=4, length=10]{(0,0)} :: موجة مستعرضة (phase= ، color= ، nolabels)
\wave[type=long, wavelength=3, length=9]{(0,0)} :: موجة طولية (تضاغطات وتخلخلات)
`,
      ex: [
        ['السرعة – الزمن', '\\begin{physics}\n  \\motion[type=vt, area, slopes, names={أ,ب,جـ,د}]{(0,0) (2,10) (5,10) (7,0)}\n\\end{physics}'],
        ['الإزاحة – الزمن', '\\begin{physics}\n  \\xt{(0,0) (3,15) (5,15) (8,0)}\n\\end{physics}'],
        ['موجة مستعرضة وطولية', '\\begin{physics}\n  \\wave[amplitude=1, wavelength=4, length=10]{(0,3)}\n  \\wave[wavelength=3, length=9, type=long]{(0,0)}\n\\end{physics}']
      ] },

    // ------------------------------------------------------------------ circuits
    { id: 'circ', ic: '⚡', t: 'الدوائر الكهربائية',
      note: 'كل عنصر بين نقطتين {(x1,y1)}{(x2,y2)}. label= تُكتب خارج الدائرة وvalue= داخلها.',
      cmds: R`
\begin{circuit}[style=american, scale=1.3, digits=eastern] … \end{circuit} :: دائرة كهربائية (style=american للمقاومة المتعرجة)
\battery[label=ق.د.ك, value=12 V, cells=3]{(0,0)}{(0,3)} :: بطارية (flip لعكس القطبين)
\cell{…}{…}   \source{…}{…}   \ac{…}{…}   \isource{…}{…} :: عمود، مصدر جهد، مصدر متردد، مصدر تيار
\resistor[label=م₁, value=4 Ω]{…}{…}   \rheostat{…}{…} :: مقاومة، ومقاومة متغيرة
\lamp{…}{…}   \capacitor{…}{…}   \inductor{…}{…} :: مصباح، مكثف، ملف
\diode{…}{…}   \led{…}{…} :: ثنائي وثنائي باعث للضوء (flip لعكس الاتجاه)
\ammeter{…}{…}   \voltmeter{…}{…}   \galvanometer{…}{…}   \ohmmeter{…}{…} :: أجهزة القياس
\switch{…}{…}   \switch[closed]{…}{…} :: مفتاح مفتوح أو مغلق
\fuse{…}{…}   \motor{…}{…}   \bell{…}{…}   \wire{…}{…} :: منصهر، محرك، جرس، سلك
current=ت :: سهم التيار على أي عنصر. أو \current[label=ت]{…}{…} على سلك
color=red :: لون العنصر
\junction{(3,3)}   \terminal[label=أ]{(x,y)}   \ground{(x,y)}   \text{(x,y)}{نص} :: نقطة توصيل، طرف، أرضي، كتابة
circuitikz: \begin{circuitikz}\draw (0,0) to[battery1] (0,3) to[R, l=$R_1$] (4,3) -- (4,0) -- (0,0);\end{circuitikz} :: يُقبل أيضاً: R C L D lamp V sV I ammeter voltmeter switch fuse … و -- و -| و node[circ]{}
`,
      ex: [
        ['توالٍ وأميتر وفولتميتر', '\\begin{circuit}\n  \\battery[label=ق.د.ك, value=12 V, cells=3]{(0,0)}{(0,3)}\n  \\ammeter{(0,3)}{(3,3)}\n  \\resistor[label=م₁, value=4 Ω]{(3,3)}{(6,3)}\n  \\wire{(3,3)}{(3,4.6)}\n  \\voltmeter{(3,4.6)}{(6,4.6)}\n  \\wire{(6,4.6)}{(6,3)}\n  \\lamp[label=م₂]{(6,3)}{(6,0)}\n  \\switch[closed]{(6,0)}{(0,0)}\n  \\junction{(3,3)}\n  \\junction{(6,3)}\n\\end{circuit}'],
        ['عناصر أخرى', '\\begin{circuit}[style=american]\n  \\ac[label=م.ت]{(0,0)}{(0,3)}\n  \\fuse{(0,3)}{(2,3)}\n  \\rheostat{(2,3)}{(5,3)}\n  \\inductor[label=ل]{(5,3)}{(8,3)}\n  \\capacitor[label=س]{(8,3)}{(8,0)}\n  \\diode{(8,0)}{(6,0)}\n  \\led{(6,0)}{(4,0)}\n  \\motor{(4,0)}{(2,0)}\n  \\bell{(2,0)}{(0,0)}\n\\end{circuit}'],
        ['circuitikz', '\\begin{circuitikz}\n\\draw (0,0) to[battery1] (0,3) to[R, l=$R_1$] (4,3) to[C] (4,0) -- (0,0);\n\\end{circuitikz}']
      ] },

    // ------------------------------------------------------------------ variation tables
    { id: 'tab', ic: '▦', t: 'جدول التغيرات والإشارة',
      note: '\\auto يحسب المشتقة والنقاط الحرجة والنهايات تلقائياً. ويُقبل tkz-tab أيضاً.',
      cmds: R`
\begin{vartable}[name=د, xname=س, digits=eastern] … \end{vartable} :: جدول التغيرات
\auto{س^3 - 3س} :: حساب الجدول كاملاً من الدالة (اكتب الدالة فقط بدون د(س) =)
\x{-\infty, -1, 1, +\infty} :: قيم س (يدوياً)
\sign[name=د'(س)]{+, 0, -, 0, +} :: صف الإشارة: 0 صفر، | خط، || قيمة غير معرّفة
\var[name=د(س)]{-/-\infty, +/2, -/-2, +/+\infty} :: صف التغير: +/قيمة في الأعلى، -/قيمة في الأسفل. غير معرّفة: -||+/-\infty/+\infty
\begin{signtable} \x{…} \sign[name=…]{…} … \end{signtable} :: جدول إشارة بعدة صفوف
tkz-tab: \begin{tikzpicture}\tkzTabInit{…}{…}\tkzTabLine{…}\tkzTabVar{…}\end{tikzpicture} :: يُقبل أيضاً
`,
      ex: [
        ['تلقائي', '\\begin{vartable}\n  \\auto{س^3 - 3س}\n\\end{vartable}'],
        ['يدوي', '\\begin{vartable}\n  \\x{-\\infty, -1, 1, +\\infty}\n  \\sign[name=د\'(س)]{+, 0, -, 0, +}\n  \\var[name=د(س)]{-/-\\infty, +/2, -/-2, +/+\\infty}\n\\end{vartable}'],
        ['قيمة غير معرّفة', '\\begin{vartable}\n  \\x{-\\infty, 1, +\\infty}\n  \\sign[name=د\'(س)]{-, ||, -}\n  \\var[name=د(س)]{+/0, -||+/-\\infty/+\\infty, -/0}\n\\end{vartable}'],
        ['جدول إشارة', '\\begin{signtable}\n  \\x{-\\infty, -2, 3, +\\infty}\n  \\sign[name=س + 2]{-, 0, +, |, +}\n  \\sign[name=س - 3]{-, |, -, 0, +}\n  \\sign[name=(س+2)(س-3)]{+, 0, -, 0, +}\n\\end{signtable}']
      ] },

    // ------------------------------------------------------------------ number line, venn, tree
    { id: 'diag', ic: '◔', t: 'خط الأعداد وأشكال فن والشجرة',
      note: 'المتباينات بـ \\solution، والمجموعات بـ ∩ ∪ − \' ، والشجرة سطر لكل فرع والمسافة في أوله تعني فرعاً داخلياً.',
      cmds: R`
# خط الأعداد
\begin{numberline}[min=-5, max=5, step=1, digits=eastern] … \end{numberline} :: خط الأعداد (المدى تلقائي بدون min/max)
\solution{-2 < س \le 3}   \solution{س \ge 2} :: حل متباينة (بسيطة أو مزدوجة)؛ color= label=
\interval{[-2, 3)}   \interval{(-\infty, 1]} :: فترة مغلقة [ ] أو مفتوحة ( )
\point{4}   \point[open, label=ب]{-1} :: نقطة مغلقة أو مفتوحة
# أشكال فن
\begin{venn}[sets={أ,ب}, shade={أ∩ب}, universe=ش] … \end{venn} :: مجموعتان أو ثلاث sets={أ,ب,جـ}
shade={(أ∪ب)'∩جـ} :: تظليل: ∩ تقاطع، ∪ اتحاد، − فرق، ' مكملة، والأقواس
\region[أ]{1, 2}   \region[أ∩ب]{3}   \region[out]{9} :: عناصر كل منطقة (أ = أ فقط، out خارج المجموعات). مع ثلاث مجموعات: a b c ab ac bc abc
color1=  color2=  color3=  shadecolor= :: ألوان الدوائر والتظليل
# شجرة الاحتمالات
\begin{tree}[products] … \end{tree} :: شجرة: كل سطر فرع يبدأ بـ - واحتماله بين [ ]، والإزاحة بمسافتين تعني فرعاً داخلياً
products   root=البداية   direction=ltr :: حاصل ضرب الاحتمالات عند الأطراف، اسم الجذر، الاتجاه من اليسار
`,
      ex: [
        ['خط الأعداد', '\\begin{numberline}[min=-5, max=5]\n  \\interval{[-2, 3)}\n  \\solution[color=أحمر]{س \\ge 4}\n  \\point[open, label=ب]{-4}\n\\end{numberline}'],
        ['متباينة مزدوجة', '\\begin{numberline}\n  \\solution{-2 < س \\le 3}\n\\end{numberline}'],
        ['فن لمجموعتين', '\\begin{venn}[sets={أ,ب}, shade={أ∩ب}]\n  \\region[أ]{1, 2, 3}\n  \\region[أ∩ب]{4}\n  \\region[ب]{5, 6}\n  \\region[out]{7}\n\\end{venn}'],
        ['فن لثلاث مجموعات', '\\begin{venn}[sets={أ,ب,جـ}, shade={(أ∪ب)\'∩جـ}]\n  \\region[a]{1}\n  \\region[ab]{2}\n  \\region[abc]{4}\n  \\region[c]{5}\n\\end{venn}'],
        ['شجرة احتمالات', '\\begin{tree}[products]\n- أحمر [0.3]\n  - أحمر [0.2]\n  - أزرق [0.8]\n- أزرق [0.7]\n  - أحمر [0.4]\n  - أزرق [0.6]\n\\end{tree}']
      ] },

    // ------------------------------------------------------------------ chemistry structures
    { id: 'chem', ic: '⚗', t: 'الكيمياء والصيغ البنائية',
      note: '\\ce للمعادلات، و\\chemfig أو \\smiles أو \\molecule{الاسم} للصيغ البنائية (كل منها في سطر).',
      cmds: R`
\ce{CaCO3 ->[\Delta] CaO + CO2 ^} :: معادلة كيميائية (انظر قسم المعادلات)
\chemfig[name=الإيثانول]{CH_3-CH_2-OH} :: صيغة بنائية: - أحادية، = ثنائية، ~ ثلاثية، > < أوتاد
\chemfig{CH_3-C(=[2]O)-[7]OH} :: الزاوية [n] = n×45°، والفروع بين ( )
\chemfig{*6(-=-=-=)}   \chemfig{**6(------)} :: حلقة سداسية (و** حلقة أروماتية بدائرة)
\chemfig{*6(-=-(-OH)=-=)} :: فرع على الحلقة
chemfig: SO_4^{2-}  NH_4^+ :: الأرقام السفلية والشحنات. الخيارات: name=، scale=، color=mono (أسود)
\smiles[name=الأسبرين]{CC(=O)Oc1ccccc1C(=O)O} :: من صيغة SMILES (noformula، theme=mono، carbons، size=)
\molecule{الكافيين} :: من مكتبة الإضافة (نحو 90 مركباً: الميثان، الإيثانول، البنزين، الجلوكوز، الأسبرين، الباراسيتامول، الكافيين…)
`,
      ex: [
        ['معادلات', '\\ce{CaCO3 ->[\\Delta] CaO + CO2 ^}\n\\ce{N2 + 3H2 <=> 2NH3}\n\\ce{Ag+ + Cl- -> AgCl v}'],
        ['chemfig', '\\chemfig[name=حمض الإيثانويك]{CH_3-C(=[1]O)-[7]OH}'],
        ['حلقة أروماتية', '\\chemfig[name=الفينول]{*6(-=-(-OH)=-=)}'],
        ['رابطة ثلاثية', '\\chemfig[name=الإيثاين]{H-C~C-H}'],
        ['SMILES ومن المكتبة', '\\smiles[name=الأسبرين]{CC(=O)Oc1ccccc1C(=O)O}\n\\molecule{الكافيين}']
      ] },

    // ------------------------------------------------------------------ atoms
    { id: 'atom', ic: '⚛', t: 'الذرة والجدول الدوري',
      note: 'بالرمز (Fe) أو الاسم العربي (الحديد). كل أمر في سطر.',
      cmds: R`
\element{Fe} :: بطاقة العنصر (العدد الذري، الرمز، الاسم، الكتلة). nolabels بدون التصنيف
\bohr{Na} :: نموذج بور بالمستويات والنواة
\lewis{Cl}   \lewis{Na+}   \lewis{O2-} :: رمز لويس للذرة أو الأيون (لعناصر المجموعات الرئيسية)
\orbital{O}   \orbital[short]{Fe} :: مربعات الأوربيتالات (short بالاختصار بالغاز النبيل)
\ptable   \ptable[highlight={Na,K}, names, ltr] :: الجدول الدوري: تمييز عناصر، الأسماء العربية، الاتجاه اللاتيني، title=
$\econfig{Fe}$ :: التوزيع الإلكتروني كمعادلة
`,
      ex: [
        ['بطاقة العنصر ونموذج بور', '\\element{Na}\n\\bohr{Na}'],
        ['رموز لويس', '\\lewis{Cl}\n\\lewis{O2-}'],
        ['الأوربيتالات والتوزيع الإلكتروني', '\\orbital[short]{Fe}\nالتوزيع الإلكتروني للحديد: $\\econfig[short]{Fe}$'],
        ['الجدول الدوري', '\\ptable[highlight={Li,Na,K}, names]']
      ] },

    // ------------------------------------------------------------------ lab
    { id: 'lab', ic: '🧪', t: 'أدوات المختبر',
      note: 'الموضع {(x,y)} بالسنتيمتر وهو منتصف قاعدة الأداة. لا تكتب نصاً عادياً داخل الكتلة.',
      cmds: R`
\begin{lab} … \end{lab} :: رسم أدوات مختبر
fill=0.5   color=blue   ppt   ppt=green   bubbles   label=…   scale=1.2 :: الخيارات: مستوى السائل 0–1، لونه (blue pink red green yellow orange purple colorless أو بالعربية)، راسب، فقاعات، تسمية، حجم الأداة
side=top|bottom|left|right :: موضع التسمية
\beaker[fill=0.5]{(0,0)}   \flask{…}   \roundflask{…} :: كأس، دورق مخروطي، دورق كروي
\testtube[fill=0.4, angle=30]{…}   \cylinder{…} :: أنبوب اختبار (مائل بـ angle)، مخبار مدرج
\burette[fill=0.75, h=6, drops]{(0,3.6)}   \pipette{…}   \dropper{…} :: سحاحة (drops قطرة)، ماصة، قطارة
\funnel[paper]{…} :: قمع (paper ورق ترشيح)
\burner{…}   \burner[off]{…}   \tripod[gauze]{…}   \stand[h=8, clamp=6.4]{…} :: موقد بنزن، حامل ثلاثي (gauze شبكة)، حامل بماسك
\thermometer[level=0.8, angle=0]{…}   \condenser[length=4, angle=-20]{…} :: ميزان حرارة، مكثف (مبرد)
\tube{(0,3) (2,3) (2,1)}   \bubbles{(x,y)}   \arrow[label=…]{(x1,y1)}{(x2,y2)}   \label[to=(x,y)]{(x,y)}{نص} :: أنبوب توصيل، فقاعات، سهم، تسمية حرة بخط
`,
      ex: [
        ['المعايرة', '\\begin{lab}\n  \\stand[h=8, clamp=6.4]{(-2.2,0)}\n  \\burette[fill=0.75, color=colorless, h=6, drops, label=محلول قياسي]{(0,3.6)}\n  \\flask[fill=0.35, color=pink, label=المحلول المجهول + دليل]{(0,0)}\n\\end{lab}'],
        ['التسخين', '\\begin{lab}\n  \\burner[label=موقد بنزن]{(0,0)}\n  \\tripod[gauze, h=3.3]{(0,0)}\n  \\beaker[fill=0.5, bubbles, label=ماء يغلي]{(0,3.45)}\n  \\thermometer[level=0.8, h=4]{(0.35,3.8)}\n\\end{lab}'],
        ['تفاعل وترشيح', '\\begin{lab}\n  \\testtube[fill=0.4, color=blue, ppt, label=راسب]{(0,0)}\n  \\dropper[label=محلول NaOH]{(0,3.6)}\n  \\funnel[paper, label=ورق ترشيح]{(4,2.8)}\n  \\beaker[fill=0.3, label=الراشح]{(4,0)}\n\\end{lab}']
      ] },

    // ------------------------------------------------------------------ word tables
    { id: 'tables', ic: '▤', t: 'جداول Word',
      note: 'tabular يتحول إلى جدول Word حقيقي قابل للتعديل، وخلاياه تقبل $…$ و\\ce.',
      cmds: R`
\begin{tabular}{|c|c|c|} … \end{tabular} :: جدول (الأعمدة c l r)، والصفوف تنتهي بـ \\ والخلايا تفصلها &
\hline :: خط أفقي (الصف الأول يصبح رأساً تلقائياً إذا تبعه \hline)
\begin{tabular}[header]{…}   [noheader]   [noborder]   [color=#FDEBD0] :: خيارات قبل الأعمدة: رأس الجدول، بدون حدود، لون الرأس
\multicolumn{2}{c}{نص} :: دمج خليتين
\textbf{…} :: خلية عريضة
$س^2$   \ce{H2O} :: معادلة أو صيغة كيميائية داخل الخلية
`,
      ex: [
        ['جدول قيم', '\\begin{tabular}{|c|c|c|c|}\n\\hline\nس & -2 & 0 & 2 \\\\ \\hline\n$د(س)$ & 0 & -4 & 0 \\\\ \\hline\n\\end{tabular}'],
        ['رأس ملون ودمج', '\\begin{tabular}[header, color=#FDEBD0]{|c|c|c|}\n\\hline\nالمادة & الصيغة & الحالة \\\\ \\hline\nماء & $\\ce{H2O}$ & سائل \\\\ \\hline\n\\multicolumn{2}{c}{المجموع} & 1 \\\\ \\hline\n\\end{tabular}']
      ] }
  ];

  // ---------------------------------------------------------------- parse the command lines
  GUIDE.forEach(function (s) {
    s.rows = [];
    String(s.cmds || '').split('\n').forEach(function (l) {
      if (!l.trim()) return;
      if (/^#\s/.test(l)) { s.rows.push({ h: l.replace(/^#\s*/, '').trim() }); return; }
      var k = l.indexOf(' :: ');
      s.rows.push(k < 0 ? { c: l.trim(), d: '' } : { c: l.slice(0, k).trim(), d: l.slice(k + 4).trim() });
    });
  });

  // ---------------------------------------------------------------- the full prompts
  var HEAD_AR = [
    'أنت تكتب محتوى تعليمياً (رياضيات، إحصاء، فيزياء، كيمياء) سيُلصق في إضافة «معادلات عربية» داخل Microsoft Word.',
    'الإضافة تحوّل ما تكتبه إلى نصوص ومعادلات ورسوم وجداول في المستند بنفس الترتيب. التزم بالصيغة التالية حرفياً،',
    'وأخرج المحتوى فقط في كتلة نص واحدة بدون شرح قبله أو بعده، وبدون Markdown.',
    '',
    '== القواعد العامة ==',
    '1) كل معادلة في سطر مستقل بصيغة LaTeX بدون $ حولها. العنوان أو الشرح سطر يبدأ بـ %. النص مع معادلة في سطر واحد: المعادلة بين $...$.',
    '2) لا تستخدم \\( \\) ولا \\[ \\] ولا $$ ولا ** ولا # ولا \\begin{equation}.',
    '3) كل رسم أو جدول كتلة تبدأ بسطر \\begin{…} وتنتهي بسطر \\end{…}، وداخلها أمر واحد في كل سطر، ولا تكتب نصاً عادياً داخل الكتلة (التعليق بـ %).',
    '4) الخيارات بين [ ] مفصولة بفواصل: key=value أو كلمة وحدها للتفعيل، وnoكلمة للإلغاء (nogrid، novalues).',
    '5) أي قيمة فيها فاصلة توضع بين { }: names={أ,ب}، sets={أ,ب}، colors={أحمر, أزرق}، title={…}، highlight={Na,K}.',
    '6) الألوان: red blue green teal orange purple brown gray black magenta cyan yellow olive violet pink، أو أحمر أزرق أخضر فيروزي برتقالي بنفسجي بني رمادي أسود أصفر وردي، أو #1f5fbf.',
    '7) digits=eastern للأرقام الهندية (١٢٣)، notation=en للكتابة اللاتينية. الأرقام في الخيارات تقبل \\frac و\\sqrt و\\pi.',
    '8) النقاط (x,y) بالسنتيمتر، والزوايا بالدرجات.',
    '',
    '== الأوامر المتاحة لكل أداة (الصيغة ← المعنى) =='
  ];
  function promptAr() {
    var out = HEAD_AR.slice();
    GUIDE.forEach(function (s) {
      out.push('', '### ' + s.t + (s.note ? ' — ' + s.note : ''));
      s.rows.forEach(function (r) { out.push(r.h ? '  [' + r.h + ']' : '• ' + r.c + (r.d ? '  ← ' + r.d : '')); });
      if (s.ex && s.ex[0] && s.id !== 'eq') out.push('مثال:', s.ex[0][1]);
    });
    out.push('', '== مثال على ناتج صحيح ==', '% الدالة التربيعية', 'د(س) = س^2 - 4', '\\begin{graph}[x=-4:4, extrema]', '  \\plot{س^2 - 4}', '\\end{graph}',
      '% جدول قيم الدالة', '\\begin{tabular}{|c|c|c|c|}', '\\hline', 'س & -2 & 0 & 2 \\\\ \\hline', '$د(س)$ & 0 & -4 & 0 \\\\ \\hline', '\\end{tabular}');
    return out.join('\n');
  }
  var HEAD_EN = [
    'You write teaching content (math, statistics, physics, chemistry) that will be pasted into the "Arabic Math" add-in for Microsoft Word.',
    'The add-in turns it into text, equations, figures and tables in the same order. Output only the content, one plain-text block, no Markdown.',
    '',
    'GENERAL RULES',
    '1) One LaTeX equation per line without $; a line starting with % is a title/text; text with inline math uses $...$.',
    '2) Never use \\( \\), \\[ \\], $$, **, # or \\begin{equation}.',
    '3) Every figure/table is a block: a \\begin{…} line, one command per line, an \\end{…} line. No plain text inside blocks (% for comments).',
    '4) Options in [ ]: key=value or a bare flag; noFLAG turns a flag off (nogrid, novalues).',
    '5) Any value containing commas goes in braces: names={A,B}, sets={A,B}, colors={red, blue}, title={…}.',
    '6) Colours: red blue green teal orange purple brown gray black magenta cyan yellow olive violet pink or #hex. digits=eastern, notation=en.',
    '7) Points (x,y) are in cm, angles in degrees. Arabic notation (س ص, جا جتا …) is used by default; Latin x, \\sin … also work.',
    '',
    'ALL COMMANDS (syntax — Arabic description)'
  ];
  function promptEn() {
    var out = HEAD_EN.slice();
    GUIDE.forEach(function (s) {
      out.push('', '### ' + s.id.toUpperCase() + ' (' + s.t + ')');
      s.rows.forEach(function (r) { if (!r.h) out.push('• ' + r.c + (r.d ? '  — ' + r.d : '')); });
    });
    return out.join('\n');
  }

  if (AF.PROMPT_AR && !AF.PROMPT_AR_SHORT) { AF.PROMPT_AR_SHORT = AF.PROMPT_AR; AF.PROMPT_EN_SHORT = AF.PROMPT_EN; }
  AF.GUIDE = GUIDE;
  AF.PROMPT_FULL_AR = promptAr();
  AF.PROMPT_FULL_EN = promptEn();
  AF.PROMPT_AR = AF.PROMPT_FULL_AR;          // the editor's «نسخ تعليمات الذكاء الاصطناعي» now copies the complete version
  AF.PROMPT_EN = AF.PROMPT_FULL_EN;
})(window);
