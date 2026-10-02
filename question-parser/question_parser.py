"""
╔══════════════════════════════════════════════════════════════════════════════╗
║         🧠  UNIFIED ARABIC QUESTION PARSER  v5.0                           ║
║   ملف Word / نص → فرز تلقائي TF + MCQ → تقرير موحد + كاشف التكرار         ║
╚══════════════════════════════════════════════════════════════════════════════╝

الاستخدام:
    python question_parser.py                       ← تفتح نافذة لاختيار ملف/ملفات Word
    python question_parser.py "الدور الثاني 2017 - 2016.docx"
    python question_parser.py a.docx b.docx --no-gui --no-browser
    python question_parser.py exam.txt -c "امتحان الدور الأول 2013"

اسم الامتحان يُستخرج تلقائياً من اسم الملف (مثلاً «الدور الثاني 2017 - 2016»)
ويظهر في نافذة التأكيد جاهزاً — اضغط Enter فقط، أو عدّله.
"""

import argparse
import base64
import os
import re
import sys
import webbrowser
from difflib import SequenceMatcher
from itertools import combinations

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from docx_reader import docx_to_canonical  # noqa: E402

# ══════════════════════════════════════════════════════════════════════════════
#  ⚙️  الإعدادات الثابتة
# ══════════════════════════════════════════════════════════════════════════════

DEDUP_THRESHOLD  = 0.75              # عتبة اعتبار السؤالين متكررَين
TF_STRICT        = True              # صارم في محلل صح/خطأ (يرفض الناقص)


# ══════════════════════════════════════════════════════════════════════════════
#  🔧  أدوات مشتركة
# ══════════════════════════════════════════════════════════════════════════════

def _normalize(text):
    if not isinstance(text, str): return ""
    t = text.lower().strip()
    t = re.sub(r'[ً-ٰٟ]', '', t)
    t = re.sub(r'[أإآ]', 'ا', t)
    t = re.sub(r'[^\w\s]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()

def _similarity(a, b):
    na, nb = _normalize(a), _normalize(b)
    if not na or not nb: return 0.0
    seq = SequenceMatcher(None, na, nb).ratio()
    wa, wb = set(na.split()), set(nb.split())
    tok = len(wa & wb) / max(len(wa), len(wb)) if (wa or wb) else 0.0
    return 0.6 * seq + 0.4 * tok

def _detect_duplicates(questions, threshold=DEDUP_THRESHOLD):
    n = len(questions)
    sim_matrix = {}
    for i, j in combinations(range(n), 2):
        s = _similarity(questions[i], questions[j])
        if s >= threshold:
            sim_matrix[(i, j)] = s

    parent = list(range(n))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    def union(x, y):
        px, py = find(x), find(y)
        if px != py: parent[py] = px

    for (i, j) in sim_matrix: union(i, j)
    groups_map = {}
    for idx in range(n):
        groups_map.setdefault(find(idx), []).append(idx)
    dup_groups = [g for g in groups_map.values() if len(g) > 1]
    removed    = set()
    for g in dup_groups:
        for idx in sorted(g)[1:]: removed.add(idx)
    kept  = sorted(set(range(n)) - removed)
    pairs = [{'idx_a':i,'idx_b':j,'q_a':questions[i],'q_b':questions[j],'sim':s}
             for (i,j),s in sorted(sim_matrix.items(), key=lambda x:-x[1])]
    return dup_groups, kept, sorted(removed), pairs

def _pct_bar(pct):
    c = "#22c55e" if pct < 0.85 else ("#f59e0b" if pct < 0.92 else "#ef4444")
    return (f'<div class="bar-wrap"><div class="bar-track">'
            f'<div class="bar-fill" style="width:{int(pct*100)}%;background:{c}"></div>'
            f'</div><span class="bar-label">{pct*100:.1f}%</span></div>')


# ══════════════════════════════════════════════════════════════════════════════
#  📂  اسم الامتحان من اسم الملف + قراءة المصدر (Word / نص)
# ══════════════════════════════════════════════════════════════════════════════

def exam_name_from_filename(path):
    """
    «الدور الثاني 2017 - 2016.docx»  →  «الدور الثاني 2017 - 2016»
    يتجاهل بادئات الرفع (b981078d-)، والشرطات السفلية، ورقم النسخة (1).
    يرجع '' إن لم يجد في الاسم عربي أو سنة.
    """
    stem = os.path.splitext(os.path.basename(path))[0]
    stem = re.sub(r'^[0-9a-fA-F]{8}[-_]', '', stem)
    stem = re.sub(r'\s*\(\d+\)\s*$', '', stem)
    stem = stem.replace('_', ' ')
    stem = re.sub(r'\s*[-–—]\s*', ' - ', stem)
    stem = re.sub(r'\s+', ' ', stem).strip(' -')
    if not re.search(r'[؀-ۿ]|\d{4}', stem):
        return ''
    return stem

def category_from_name(name):
    name = (name or '').strip()
    if not name:
        return "امتحان غير محدد"
    return name if name.startswith("امتحان") else f"امتحان {name}"

def load_source(path):
    """يرجع (النص القياسي, meta) من .docx أو .txt"""
    ext = os.path.splitext(path)[1].lower()
    if ext == '.docx':
        return docx_to_canonical(path)
    if ext in ('.txt', '.md'):
        with open(path, encoding='utf-8-sig') as f:
            return f.read(), {}
    raise ValueError(f"نوع الملف غير مدعوم: {ext} (المدعوم: docx / txt)")


# ══════════════════════════════════════════════════════════════════════════════
#  ✂️  فرز الأسئلة: TF أم MCQ؟
# ══════════════════════════════════════════════════════════════════════════════

def _split_blocks(raw_text):
    text   = re.sub(r'_{3,}|-{3,}', '', raw_text)
    parts  = re.split(r'\n\s*(?:[•\-\*]\s*)?س\s*(\d+)[\)\-\.\s]*', '\n' + text)
    tf_blocks, mcq_blocks = [], []
    i = 1
    while i < len(parts) - 1:
        num     = parts[i].strip()
        content = parts[i + 1].strip() if (i + 1) < len(parts) else ""
        if content:
            is_mcq = bool(re.search(r'\((?:أ|ب|ج|د|هـ)\)', content))
            if is_mcq:
                mcq_blocks.append((int(num) if num.isdigit() else len(mcq_blocks)+1, content))
            else:
                tf_blocks.append((int(num) if num.isdigit() else len(tf_blocks)+1, content))
        i += 2
    return tf_blocks, mcq_blocks


# ══════════════════════════════════════════════════════════════════════════════
#  📖  محلل الصح والخطأ
# ══════════════════════════════════════════════════════════════════════════════

_TF_PATS = {
    'ans':   r'^(?:[•\-\*]\s*)?الإجابة\s*:',
    'corr':  r'^(?:[•\-\*]\s*)?تصحيح الخطأ\s*:',
    'shrah': r'^(?:[•\-\*]\s*)?الشرح\s*:',
    'expl':  r'^(?:[•\-\*]\s*)?التوضيح\s*:',
    'src':   r'^(?:[•\-\*]\s*)?المصدر\s*:',
    'time':  r'^(?:[•\-\*]\s*)?الوقت المثالي لحل السؤال\s*:',
    'diff':  r'^(?:[•\-\*]\s*)?صعوبة السؤال\s*:'
}

def _parse_tf_block(num, block):
    lines   = block.split('\n')
    data    = {'q':[],'ans':'','corr':'','shrah':'','expl':'','src':'','time':'','diff':''}
    current = 'q'
    for line in lines:
        cl = line.strip()
        if not cl: continue
        matched = False
        for key, pat in _TF_PATS.items():
            if re.search(pat, cl):
                data[key] = re.sub(pat, '', cl).strip()
                current   = key; matched = True; break
        if not matched:
            if current == 'q': data['q'].append(cl)
            elif current in data: data[current] = (data[current]+" "+cl).strip()
    return data

def _validate_tf(num, data):
    q_text  = " ".join(data['q']).strip()
    missing = []
    if not q_text:        missing.append("نص السؤال")
    if not data['ans']:   missing.append("الإجابة")
    if not data['shrah']: missing.append("الشرح")
    if not data['expl']:  missing.append("التوضيح العلمي")
    if not data['src']:   missing.append("المصدر")
    if not data['time']:  missing.append("الوقت المثالي")
    if not data['diff']:  missing.append("صعوبة السؤال")
    if "خطأ" in data['ans'] and not data['corr']:
        missing.append("تصحيح الخطأ (مطلوب لأن الإجابة خطأ)")
    return missing

def parse_all_tf(tf_blocks, category_name):
    errors, results = [], []
    for num, block in tf_blocks:
        data    = _parse_tf_block(num, block)
        missing = _validate_tf(num, data)
        q_text  = " ".join(data['q']).strip()
        if missing:
            errors.append({"idx": num,
                           "q": q_text[:80]+("..." if len(q_text)>80 else ""),
                           "missing": missing})
            continue
        sh   = re.sub(r'^[\.·•]\s*','', data['shrah'])
        src  = re.sub(r'^[\.·•]\s*','', data['src'])
        t    = re.sub(r'⏰|الوقت|المثالي|لحُلُّ?|السؤال|:','', data['time']).strip()
        m    = re.search(r'(سهل|متوسط|صعب)', data['diff'])
        diff = m.group(1) if m else data['diff'].strip()
        ans  = data['ans'].replace('.','').strip()
        results.append({
            'mark':1,'question':q_text,'correct_answer':ans,
            'description':f"● الشرح 🎯: {sh}\n   ",
            'correction': data['corr'] if "خطأ" in data['ans'] else "",
            'explanation':data['expl'],
            'perfect_time':f"⏰ {t}",
            'lesson':f"المصدر 🔍📚: {src}",
            'category':category_name,
            'difficulty':diff,
            '_num':num,'_q':q_text,'_shrah':sh,'_src':src,
            '_time':t,'_corr':data['corr'],'_ans':ans,'_type':'tf'
        })
    return results, errors


# ══════════════════════════════════════════════════════════════════════════════
#  📝  محلل الاختيار المتعدد
# ══════════════════════════════════════════════════════════════════════════════

_MCQ_PATS = {
    'ans':   r'الإجابة\s*:',
    'shrah': r'الشرح\s*:',
    'expl':  r'التوضيح\s*:',
    'src':   r'المصدر\s*:',
    'time':  r'الوقت\s*.*?\s*:',
    'diff':  r'صعوبة السؤال\s*:',
    'opt_a': r'\(أ\)', 'opt_b': r'\(ب\)',
    'opt_g': r'\(ج\)', 'opt_d': r'\(د\)' ,
    'opt_h': r'\(هـ\)'
}
_OPT_MAP = {'opt_a':'opt1','opt_b':'opt2','opt_g':'opt3','opt_d':'opt4','opt_h':'opt5'}

def parse_all_mcq(mcq_blocks, category_name):
    results = []
    for num, block in mcq_blocks:
        lines   = block.split('\n')
        data    = {k:'' for k in ['ans','shrah','expl','src','time','diff',
                                   'opt1','opt2','opt3','opt4','opt5']}
        data['q'] = []; current = 'q'
        for line in lines:
            cl = re.sub(r'^[•\-\*\s]+','', line.strip())
            if not cl: continue
            if re.search(r'\(أ\)', cl) and re.search(r'\(ب\)', cl):
                parts = re.split(r'(\(ب\)|\(ج\)|\(د\)|\(هـ\))', cl)
                subs  = [parts[0]] + [parts[p]+parts[p+1] for p in range(1,len(parts),2)]
            else:
                subs = [cl]
            for sub in subs:
                sub = sub.strip(); matched = False
                for key, pat in _MCQ_PATS.items():
                    if re.search(pat, sub):
                        content = re.sub(pat,'',sub).strip()
                        if key.startswith('opt_'):
                            data[_OPT_MAP[key]] = content; current = _OPT_MAP[key]
                        else:
                            data[key] = content; current = key
                        matched = True; break
                if not matched:
                    if current == 'q': data['q'].append(sub)
                    else: data[current] = (data[current]+" "+sub).strip()

        q = " ".join(data['q']).strip() or (lines[0].strip() if lines else "")
        t   = re.sub(r'(الوقت|المثالي|لحُلُّ?|السؤال|:)','', data['time']).strip()
        ans = re.sub(r'^\s*(\([أبجد]\)|[أبجد][\)\-\.\s]+)\s*','', data['ans']).strip().rstrip('.')
        results.append({
            'question':q,'correct_answer':ans,
            'option_1':data['opt1'].strip().rstrip('.'),
            'option_2':data['opt2'].strip().rstrip('.'),
            'option_3':data['opt3'].strip().rstrip('.'),
            'option_4':data['opt4'].strip().rstrip('.'),
            'option_5': data['opt5'].strip().rstrip('.'),
            'description':f"● الشرح 🎯: {data['shrah'].strip()}\n     ",
            'correction':'',
            'explanation':data['expl'].strip(),
            'perfect_time':f"⏰ {t}",
            'lesson':f"المصدر 🔍📚: {data['src'].strip()}",
            'category':category_name,
            'difficulty': data['diff'].split()[0].rstrip('.') if data['diff'] else "غير محدد",
            '_num':num,'_shrah':data['shrah'].strip(),'_src':data['src'].strip(),
            '_time':t,'_type':'mcq'
        })
    return results


# ══════════════════════════════════════════════════════════════════════════════
#  🎨  CSS مشترك
# ══════════════════════════════════════════════════════════════════════════════

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Cairo',sans-serif;background:#0f172a;color:#e2e8f0;direction:rtl;min-height:100vh}
.topbar{background:#1e293b;border-bottom:1px solid #334155;padding:0 24px;height:68px;
        display:flex;align-items:center;justify-content:space-between;
        position:sticky;top:0;z-index:100;box-shadow:0 2px 20px rgba(0,0,0,.6)}
.logo{display:flex;align-items:center;gap:10px}
.logo-icon{width:44px;height:44px;border-radius:12px;font-size:22px;
           background:linear-gradient(135deg,#1e3a5f,#1d4ed8);
           display:flex;align-items:center;justify-content:center}
.logo h1{font-size:15px;font-weight:900;color:#f8fafc;line-height:1.25}
.logo p{font-size:11px;color:#64748b;margin-top:1px}
.topbar-btns{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.btn{font-family:'Cairo',sans-serif;font-weight:700;font-size:12px;padding:7px 15px;
     border-radius:10px;border:none;cursor:pointer;
     display:inline-flex;align-items:center;gap:5px;transition:all .2s;text-decoration:none}
.btn:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,.45)}
.btn-green{background:linear-gradient(135deg,#10b981,#059669);color:#fff}
.btn-blue {background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff}
.btn-violet{background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff}
.btn-amber{background:linear-gradient(135deg,#f59e0b,#d97706);color:#1e293b}
.btn-lg{font-size:14px;padding:12px 28px;border-radius:13px}
.tabs{background:#1e293b;border-bottom:2px solid #334155;
      display:flex;position:sticky;top:68px;z-index:99;overflow-x:auto}
.tab{font-family:'Cairo',sans-serif;font-size:13px;font-weight:700;
     padding:13px 20px;border:none;background:transparent;color:#64748b;
     cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px;
     transition:all .2s;display:flex;align-items:center;gap:7px;white-space:nowrap}
.tab:hover{color:#f1f5f9;background:rgba(255,255,255,.04)}
.tab.tf-tab.active{color:#c4b5fd;border-bottom-color:#7c3aed}
.tab.mcq-tab.active{color:#fde68a;border-bottom-color:#f59e0b}
.tab.dedup-tab.active{color:#6ee7b7;border-bottom-color:#10b981}
.tab-badge{background:#334155;color:#94a3b8;font-size:11px;font-weight:800;
           padding:2px 8px;border-radius:99px;transition:all .2s}
.tab.tf-tab.active .tab-badge{background:#7c3aed;color:#fff}
.tab.mcq-tab.active .tab-badge{background:#f59e0b;color:#1e293b}
.tab.dedup-tab.active .tab-badge{background:#10b981;color:#fff}
.tab-badge-warn{background:#dc2626!important;color:#fff!important}
.main{max-width:960px;margin:0 auto;padding:28px 20px 60px}
.tab-panel{display:none}.tab-panel.active{display:block}
.section-banner{border-radius:14px;padding:14px 20px;margin-bottom:22px;
                display:flex;align-items:center;gap:12px}
.tf-banner{background:linear-gradient(135deg,#1a0a40,#1e1040);border:1.5px solid #6d28d9}
.mcq-banner{background:linear-gradient(135deg,#1c1200,#1f1400);border:1.5px solid #d97706}
.banner-icon{font-size:2rem}
.banner-text h2{font-size:16px;font-weight:900}
.banner-text p{font-size:12px;color:#94a3b8;margin-top:2px}
.stats-grid{display:grid;gap:10px;margin-bottom:20px}
.g6{grid-template-columns:repeat(6,1fr)}
.g4{grid-template-columns:repeat(4,1fr)}
.g3{grid-template-columns:repeat(3,1fr)}
.stat-card{background:#1e293b;border:1px solid #334155;border-radius:14px;
           padding:14px 8px;text-align:center;transition:transform .2s}
.stat-card:hover{transform:translateY(-3px)}
.stat-icon{font-size:1.3rem;margin-bottom:3px}
.stat-num{font-size:1.75rem;font-weight:900;line-height:1}
.stat-label{font-size:11px;color:#64748b;margin-top:3px}
.filters{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:16px}
.filter-btn{font-family:'Cairo',sans-serif;font-size:12px;font-weight:700;
            padding:6px 15px;border-radius:99px;border:1.5px solid #334155;
            background:#1e293b;color:#94a3b8;cursor:pointer;transition:all .2s}
.filter-btn.active{border-color:#f59e0b;background:#1c1200;color:#fbbf24}
.card{background:#1e293b;border:1px solid #334155;border-radius:16px;
      margin-bottom:11px;overflow:hidden;transition:box-shadow .2s}
.card:hover{box-shadow:0 4px 22px rgba(0,0,0,.45)}
.card.is-dup{border-color:#7c3aed55;background:#130d2a}
.card-header{display:flex;align-items:flex-start;gap:11px;padding:15px 17px;
             cursor:pointer;user-select:none}
.card-header:hover{background:rgba(255,255,255,.03)}
.q-num{min-width:34px;height:34px;border-radius:50%;
       display:flex;align-items:center;justify-content:center;
       font-weight:900;font-size:13px;flex-shrink:0}
.tf-num{background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff}
.mcq-num{background:linear-gradient(135deg,#f1c553,#f59e0b);color:#1e293b}
.q-text{flex:1;font-weight:700;font-size:14px;color:#f1f5f9;line-height:1.75}
.card-meta{display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}
.arrow{color:#475569;font-size:18px;transition:transform .3s;flex-shrink:0}
.card.open .arrow{transform:rotate(180deg)}
.time-tag{font-size:11px;color:#475569;white-space:nowrap}
.card-body{padding:0 17px;max-height:0;overflow:hidden;transition:max-height .45s ease,padding .3s}
.card.open .card-body{max-height:3000px;padding:0 17px 17px}
.ans-sah{background:#052e16;border:1.5px solid #16a34a;color:#86efac}
.ans-kht{background:#1f0000;border:1.5px solid #dc2626;color:#fca5a5}
.ans-box-tf{border-radius:12px;padding:11px 15px;font-size:14px;margin-bottom:12px;font-weight:700}
.ans-box-mcq{background:#052e16;border:1.5px solid #16a34a;border-radius:12px;
             padding:11px 15px;color:#86efac;font-size:14px;margin-bottom:12px;font-weight:700}
.ans-sah-badge{background:#052e16;color:#4ade80;border:1px solid #16a34a;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:700}
.ans-kht-badge{background:#1f0000;color:#f87171;border:1px solid #dc2626;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:700}
.opts-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:13px}
.opt{display:flex;align-items:flex-start;gap:9px;background:#0f172a;
     border:1.5px solid #334155;border-radius:10px;padding:9px 13px}
.opt.correct{background:#052e16;border-color:#16a34a}
.opt-label{min-width:26px;height:26px;border-radius:50%;background:#334155;color:#94a3b8;
           display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0}
.opt.correct .opt-label{background:#16a34a;color:#fff}
.opt-text{font-size:13px;color:#cbd5e1;line-height:1.5}
.opt.correct .opt-text{color:#86efac;font-weight:700}
.info-box{border-radius:12px;padding:11px 15px;margin-bottom:10px}
.info-box.blue  {background:#0c1a3a;border:1px solid #1d4ed8}
.info-box.yellow{background:#1c1200;border:1px solid #ca8a04}
.info-box.orange{background:#1f0e00;border:1px solid #ea580c}
.info-title{font-weight:800;font-size:12px;margin-bottom:4px}
.info-box.blue   .info-title{color:#60a5fa}
.info-box.yellow .info-title{color:#fbbf24}
.info-box.orange .info-title{color:#fb923c}
.info-body{font-size:13px;line-height:1.8}
.info-box.blue   .info-body{color:#bfdbfe}
.info-box.yellow .info-body{color:#fef08a}
.info-box.orange .info-body{color:#fdba74}
.src-row{color:#475569;font-size:12px;margin-top:3px}
.badge-easy{background:#052e16;color:#4ade80;border:1px solid #16a34a;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:700}
.badge-mid {background:#1c1200;color:#fbbf24;border:1px solid #ca8a04;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:700}
.badge-hard{background:#1f0000;color:#f87171;border:1px solid #dc2626;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:700}
.badge-def {background:#1e293b;color:#94a3b8;border:1px solid #475569;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:700}
.dup-warn-badge{background:#4c1d95;color:#c4b5fd;border:1px solid #7c3aed;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:700}
.chk-badge{background:#422006;color:#fdba74;border:1px solid #ea580c;padding:3px 9px;border-radius:99px;font-size:11px;font-weight:700}
.dup-card{background:#1e293b;border:1.5px solid #334155;border-radius:16px;margin-bottom:13px;overflow:hidden}
.dup-card:hover{box-shadow:0 4px 20px rgba(0,0,0,.4)}
.dup-header{background:#160d30;padding:13px 18px;display:flex;align-items:center;
            gap:11px;flex-wrap:wrap;border-bottom:1px solid #334155}
.dup-num{background:#7c3aed;color:#fff;font-size:12px;font-weight:900;padding:4px 14px;border-radius:99px;white-space:nowrap}
.dup-type{font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px}
.dup-type-tf {background:#4c1d95;color:#c4b5fd;border:1px solid #7c3aed}
.dup-type-mcq{background:#1c1200;color:#fbbf24;border:1px solid #ca8a04}
.dup-count{color:#a78bfa;font-size:13px;font-weight:700}
.bar-wrap{flex:1;min-width:120px;display:flex;align-items:center;gap:8px}
.bar-track{flex:1;background:#0f172a;border-radius:99px;height:8px;overflow:hidden}
.bar-fill{height:100%;border-radius:99px}
.bar-label{font-size:12px;font-weight:800;color:#f1f5f9;white-space:nowrap}
.dup-items{padding:11px 15px;display:flex;flex-direction:column;gap:8px}
.kept-item,.rem-item{border-radius:11px;padding:12px 14px}
.kept-item{background:rgba(5,46,22,.35);border:1.5px solid rgba(22,163,74,.5)}
.rem-item {background:rgba(31,0,0,.35);border:1.5px solid rgba(220,38,38,.5);opacity:.9}
.item-header{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap}
.item-num{background:#334155;color:#94a3b8;font-size:12px;font-weight:700;padding:3px 10px;border-radius:99px}
.item-status{font-size:12px;font-weight:700;margin-right:auto}
.kept-item .item-status{color:#4ade80}
.rem-item  .item-status{color:#f87171}
.item-q{font-size:13px;line-height:1.9;color:#cbd5e1;margin-bottom:3px}
.item-ans{font-size:12px;color:#64748b}
.no-dup{background:#052e16;border:2px solid #16a34a;border-radius:16px;
        padding:30px;text-align:center;font-size:16px;font-weight:900;color:#4ade80}
.info-note{background:#1c1040;border:1px solid #7c3aed44;border-radius:11px;
           padding:11px 15px;font-size:13px;color:#a78bfa;margin-bottom:18px;
           display:flex;align-items:flex-start;gap:8px;line-height:1.8}
.section-title{font-size:14px;font-weight:900;color:#f1f5f9;margin-bottom:12px;
               display:flex;align-items:center;gap:9px;padding-bottom:10px;border-bottom:1px solid #334155}
.pill{background:#7c3aed;color:#fff;font-size:11px;font-weight:700;padding:3px 11px;border-radius:99px}
.err-card{background:#1e293b;border:1.5px solid #dc2626;border-radius:14px;margin-bottom:12px;overflow:hidden}
.err-header{background:#2d1a1a;display:flex;align-items:flex-start;gap:13px;padding:14px 18px}
.err-num{min-width:34px;height:34px;border-radius:50%;background:#dc2626;color:#fff;
         font-weight:900;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.err-q{flex:1;font-weight:700;font-size:13px;color:#fca5a5;line-height:1.7}
.err-body{padding:12px 18px}
.miss-label{color:#f87171;font-weight:800;font-size:12px;margin-bottom:8px}
.miss-item{background:#1f0000;border:1px solid #991b1b;border-radius:8px;
           padding:7px 13px;color:#fca5a5;font-size:12px;margin-bottom:5px}
.dedup-banner{border-radius:16px;padding:18px 22px;margin-bottom:20px;
              display:flex;align-items:center;justify-content:space-between;gap:12px}
.footer{text-align:center;margin-top:32px;padding-top:20px;border-top:1px solid #334155}
.footer-btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
@media(max-width:640px){
  .g6,.g4{grid-template-columns:repeat(3,1fr)}
  .g3{grid-template-columns:repeat(2,1fr)}
  .opts-grid{grid-template-columns:1fr}
  .topbar{height:auto;padding:10px 14px;flex-wrap:wrap;gap:7px}
  .tabs .tab{font-size:12px;padding:10px 13px}
  .dedup-banner{flex-direction:column;text-align:center}
}
"""


# ══════════════════════════════════════════════════════════════════════════════
#  🏗️  بناء قسم بطاقات الأسئلة
# ══════════════════════════════════════════════════════════════════════════════

def _build_cards(results, removed_set, mode):
    html = ""
    for item in results:
        diff     = item['difficulty']
        diff_cls = {'سهل':'badge-easy','متوسط':'badge-mid','صعب':'badge-hard'}.get(diff,'badge-def')
        idx      = item['_idx']          # الموضع العام (TF أولاً ثم MCQ) — يطابق كاشف التكرار

        if mode == 'tf':
            is_sah   = 'صح' in item['_ans']
            ans_cls  = "ans-sah" if is_sah else "ans-kht"
            ans_icon = "✅" if is_sah else "❌"
            abadge   = (f'<span class="ans-sah-badge">{item["_ans"]}</span>' if is_sah
                        else f'<span class="ans-kht-badge">{item["_ans"]}</span>')
            ans_blk  = f'<div class="ans-box-tf {ans_cls}">{ans_icon} <strong>الإجابة:</strong> {item["_ans"]}</div>'
            opts_blk = ''
            corr_blk = (f'<div class="info-box orange"><div class="info-title">📝 تصحيح الخطأ</div>'
                        f'<div class="info-body">{item["_corr"]}</div></div>' if item.get('_corr') else '')
            q_num    = item['_num']
            q_txt    = item['_q']
            num_cls  = "tf-num"
        else:
            abadge   = ''
            opts     = [("أ",item.get('option_1','')),("ب",item.get('option_2','')),
                        ("ج",item.get('option_3','')),("د",item.get('option_4','')),  ("هـ", item.get('option_5',''))]
            opts_blk = '<div class="opts-grid">'
            for lbl, txt in opts:
                if txt:
                    is_c = txt.strip() == item['correct_answer'].strip()
                    cls  = "opt correct" if is_c else "opt"
                    opts_blk += (f'<div class="{cls}"><span class="opt-label">{lbl}</span>'
                                 f'<span class="opt-text">{txt}</span></div>')
            opts_blk += '</div>'
            ans_blk  = f'<div class="ans-box-mcq">✅ <strong>الإجابة الصحيحة:</strong> {item["correct_answer"]}</div>'
            corr_blk = ''
            q_num    = item['_num']
            q_txt    = item['question']
            num_cls  = "mcq-num"

        shrah_blk = (f'<div class="info-box blue"><div class="info-title">🎯 الشرح</div>'
                     f'<div class="info-body">{item["_shrah"]}</div></div>' if item.get('_shrah') else '')
        expl_blk  = (f'<div class="info-box yellow"><div class="info-title">💡 التوضيح العلمي</div>'
                     f'<div class="info-body">{item["explanation"]}</div></div>' if item.get('explanation') else '')
        src_blk   = f'<div class="src-row">📚 {item["_src"]}</div>' if item.get('_src') else ''
        time_tag  = f'<span class="time-tag">⏰ {item["_time"]}</span>' if item.get('_time') else ''
        dup_badge = '<span class="dup-warn-badge">🔁 مكرر</span>' if idx in removed_set else ''
        warns     = item.get('_warn') or []
        chk_badge = '<span class="chk-badge">⚠️ راجع</span>' if warns else ''
        warn_blk  = (f'<div class="info-box orange"><div class="info-title">⚠️ تنبيه من القارئ الآلي</div>'
                     f'<div class="info-body">{"<br>".join(warns)}</div></div>' if warns else '')

        html += f"""
        <div class="card" data-diff="{diff}" data-idx="{idx}" data-type="{mode}">
          <div class="card-header" onclick="toggle(this)">
            <span class="q-num {num_cls}">{q_num}</span>
            <span class="q-text">{q_txt}</span>
            <div class="card-meta">{abadge}
              <span class="{diff_cls}">{diff}</span>
              {chk_badge}{dup_badge}{time_tag}<span class="arrow">▾</span>
            </div>
          </div>
          <div class="card-body">
            {opts_blk}{ans_blk}{corr_blk}{warn_blk}{shrah_blk}{expl_blk}{src_blk}
          </div>
        </div>"""
    return html


# ══════════════════════════════════════════════════════════════════════════════
#  🏗️  بناء قسم التكرار
# ══════════════════════════════════════════════════════════════════════════════

def _build_dedup_section(dup_groups, pairs, all_questions, all_answers,
                          type_labels, n_kept, n_rem, threshold):
    if n_rem == 0:
        return '<div class="no-dup">🎉 لا توجد أسئلة مكررة — جميع الأسئلة فريدة!</div>'

    html = ""
    for g_i, group in enumerate(dup_groups, 1):
        g_sorted = sorted(group)
        max_sim  = max((p['sim'] for p in pairs
                        if p['idx_a'] in group and p['idx_b'] in group), default=0.0)
        gtype    = type_labels.get(g_sorted[0], 'tf')
        type_cls = "dup-type-tf" if gtype=='tf' else "dup-type-mcq"
        type_ar  = "صح/خطأ" if gtype=='tf' else "اختيار متعدد"
        items_html = ""
        for idx in g_sorted:
            is_kept = (idx == g_sorted[0])
            status  = "✅ محتفظ به" if is_kept else "🗑️ محذوف"
            cls     = "kept-item" if is_kept else "rem-item"
            ans     = str(all_answers.get(idx, '')).strip()[:50]
            items_html += f"""
            <div class="{cls}">
              <div class="item-header">
                <span class="item-num">س {idx+1}</span>
                <span class="item-status">{status}</span>
              </div>
              <div class="item-q">{all_questions.get(idx,'')}</div>
              <div class="item-ans">الإجابة: {ans}</div>
            </div>"""
        html += f"""
        <div class="dup-card">
          <div class="dup-header">
            <span class="dup-num">مجموعة {g_i}</span>
            <span class="dup-type {type_cls}">{type_ar}</span>
            <span class="dup-count">{len(group)} أسئلة متشابهة</span>
            {_pct_bar(max_sim)}
          </div>
          <div class="dup-items">{items_html}</div>
        </div>"""
    return html


# ══════════════════════════════════════════════════════════════════════════════
#  🏗️  HTML الموحد الكامل
# ══════════════════════════════════════════════════════════════════════════════

def _build_html(tf_results, mcq_results, tf_errors,
                dup_groups, kept, removed, pairs,
                all_questions, all_answers, type_labels,
                csv_tf, csv_mcq, csv_all, csv_clean, threshold, category=""):

    n_tf    = len(tf_results)
    n_mcq   = len(mcq_results)
    total   = n_tf + n_mcq
    n_kept  = len(kept)
    n_rem   = len(removed)
    has_dup = n_rem > 0

    tf_sah  = sum(1 for r in tf_results if 'صح'  in r['_ans'])
    tf_kht  = sum(1 for r in tf_results if 'خطأ' in r['_ans'])
    tf_shl  = sum(1 for r in tf_results if r['difficulty']=='سهل')
    tf_mid  = sum(1 for r in tf_results if r['difficulty']=='متوسط')
    tf_hrd  = sum(1 for r in tf_results if r['difficulty']=='صعب')

    mc_shl  = sum(1 for r in mcq_results if r['difficulty']=='سهل')
    mc_mid  = sum(1 for r in mcq_results if r['difficulty']=='متوسط')
    mc_hrd  = sum(1 for r in mcq_results if r['difficulty']=='صعب')
    n_chk   = sum(1 for r in mcq_results if r.get('_warn'))

    removed_set = set(removed)

    tf_cards  = _build_cards(tf_results,  removed_set, 'tf')
    mcq_cards = _build_cards(mcq_results, removed_set, 'mcq')

    dedup_sec = _build_dedup_section(dup_groups, pairs, all_questions, all_answers,
                                      type_labels, n_kept, n_rem, threshold)

    err_cards_html = ""
    for e in tf_errors:
        items = "".join(f'<div class="miss-item">✗  {m}</div>' for m in e["missing"])
        err_cards_html += f"""
        <div class="err-card">
          <div class="err-header">
            <span class="err-num">{e["idx"]}</span>
            <span class="err-q">{e["q"] or "— لا يوجد نص —"}</span>
          </div>
          <div class="err-body"><div class="miss-label">الحقول المفقودة:</div>{items}</div>
        </div>"""

    def b64(p):
        with open(p,'rb') as f: return base64.b64encode(f.read()).decode()
    b_tf    = b64(csv_tf)
    b_mcq   = b64(csv_mcq)
    b_all   = b64(csv_all)
    b_clean = b64(csv_clean)

    removed_js    = str(sorted(removed))
    dedup_clr     = "#dc2626" if has_dup else "#16a34a"
    dedup_ttl     = f"تم اكتشاف {n_rem} مكرر في {len(dup_groups)} مجموعة" if has_dup else "لا توجد تكرارات — الملف نظيف"
    dedup_ico     = "⚠️" if has_dup else "✅"
    err_tab_badge = f'<span class="tab-badge tab-badge-warn">{len(tf_errors)}</span>' if tf_errors else ''
    err_panel     = f"""
    <div id="tab-errors" class="tab-panel">
      <div style="background:#1f0000;border:1.5px solid #dc2626;border-radius:14px;
                  padding:18px 22px;margin-bottom:22px;display:flex;
                  align-items:center;justify-content:space-between">
        <div>
          <div style="color:#f87171;font-size:17px;font-weight:900">
            🛑 {len(tf_errors)} سؤال (صح/خطأ) يحتوي بيانات ناقصة — لم يُضَف للنتائج
          </div>
          <div style="color:#fca5a5;font-size:12px;margin-top:4px">
            صحح الحقول أدناه وأعد التشغيل ليظهر في التقرير
          </div>
        </div>
        <div style="background:#dc2626;color:#fff;width:50px;height:50px;border-radius:50%;
                    display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900">
          {len(tf_errors)}
        </div>
      </div>
      {err_cards_html}
    </div>""" if tf_errors else ""

    errors_tab = (f'<button class="tab" onclick="switchTab(\'errors\',this)">'
                  f'🛑 أخطاء TF {err_tab_badge}</button>') if tf_errors else ""

    tf_dup_filter   = (f'<button class="filter-btn" onclick="filterCards(\'مكرر\',this,\'tf\')">'
                       f'🔁 مكررة ({n_rem})</button>' if has_dup else '')
    mcq_dup_filter  = (f'<button class="filter-btn" onclick="filterCards(\'مكرر\',this,\'mcq\')">'
                       f'🔁 مكررة ({n_rem})</button>' if has_dup else '')
    mcq_chk_filter  = (f'<button class="filter-btn" onclick="filterCards(\'راجع\',this,\'mcq\')">'
                       f'⚠️ تحتاج مراجعة ({n_chk})</button>' if n_chk else '')

    return f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{category or 'محلل الأسئلة الموحد'} — TF + MCQ</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>{CSS}</style>
</head>
<body>

<!-- ══ Topbar ══ -->
<div class="topbar">
  <div class="logo">
    <div class="logo-icon">🧠</div>
    <div>
      <h1>{category or 'محلل الأسئلة الموحد'}
        <span style="background:#334155;color:#94a3b8;font-size:10px;font-weight:700;
               padding:2px 8px;border-radius:99px;margin-right:6px">v5.0</span>
      </h1>
      <p>ملف Word / نص → فرز تلقائي TF + MCQ → تقرير موحد</p>
    </div>
  </div>
  <div class="topbar-btns">
    <a href="data:text/csv;charset=utf-8;base64,{b_tf}"
       download="{os.path.basename(csv_tf)}" style="text-decoration:none">
      <button class="btn btn-violet">⬇️ TF ({n_tf})</button>
    </a>
    <a href="data:text/csv;charset=utf-8;base64,{b_mcq}"
       download="{os.path.basename(csv_mcq)}" style="text-decoration:none">
      <button class="btn btn-amber">⬇️ MCQ ({n_mcq})</button>
    </a>
    <a href="data:text/csv;charset=utf-8;base64,{b_all}"
       download="{os.path.basename(csv_all)}" style="text-decoration:none">
      <button class="btn btn-blue">⬇️ الكل ({total})</button>
    </a>
    <a href="data:text/csv;charset=utf-8;base64,{b_clean}"
       download="{os.path.basename(csv_clean)}" style="text-decoration:none">
      <button class="btn btn-green">⬇️ المُنقَّى ({n_kept})</button>
    </a>
  </div>
</div>

<!-- ══ Tabs ══ -->
<div class="tabs">
  <button class="tab tf-tab active" onclick="switchTab('tf',this)">
    ✅ صح / خطأ <span class="tab-badge">{n_tf}</span>
  </button>
  <button class="tab mcq-tab" onclick="switchTab('mcq',this)">
    🧩 اختيار متعدد <span class="tab-badge">{n_mcq}</span>
  </button>
  <button class="tab dedup-tab" onclick="switchTab('dedup',this)">
    🔍 التكرار <span class="tab-badge {'tab-badge-warn' if has_dup else ''}">{n_rem if has_dup else '✓'}</span>
  </button>
  {errors_tab}
</div>

<div class="main">

<!-- ══════ تاب TF ══════ -->
<div id="tab-tf" class="tab-panel active">
  <div class="section-banner tf-banner">
    <div class="banner-icon">✅</div>
    <div class="banner-text">
      <h2 style="color:#c4b5fd">أسئلة صح / خطأ</h2>
      <p>{n_tf} سؤال محلل — {'صارم: جميع الحقول مكتملة' if TF_STRICT else 'مرن'}</p>
    </div>
  </div>
  <div class="stats-grid g6">
    <div class="stat-card"><div class="stat-icon">📊</div><div class="stat-num" style="color:#c4b5fd">{n_tf}</div><div class="stat-label">إجمالي</div></div>
    <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-num" style="color:#4ade80">{tf_sah}</div><div class="stat-label">صح</div></div>
    <div class="stat-card"><div class="stat-icon">❌</div><div class="stat-num" style="color:#f87171">{tf_kht}</div><div class="stat-label">خطأ</div></div>
    <div class="stat-card"><div class="stat-icon">🟢</div><div class="stat-num" style="color:#4ade80">{tf_shl}</div><div class="stat-label">سهل</div></div>
    <div class="stat-card"><div class="stat-icon">🟡</div><div class="stat-num" style="color:#fbbf24">{tf_mid}</div><div class="stat-label">متوسط</div></div>
    <div class="stat-card"><div class="stat-icon">🔴</div><div class="stat-num" style="color:#f87171">{tf_hrd}</div><div class="stat-label">صعب</div></div>
  </div>
  <div class="filters">
    <button class="filter-btn active" onclick="filterCards('الكل',this,'tf')">الكل ({n_tf})</button>
    <button class="filter-btn" onclick="filterCards('صح',this,'tf')">✅ صح ({tf_sah})</button>
    <button class="filter-btn" onclick="filterCards('خطأ',this,'tf')">❌ خطأ ({tf_kht})</button>
    <button class="filter-btn" onclick="filterCards('سهل',this,'tf')">🟢 سهل ({tf_shl})</button>
    <button class="filter-btn" onclick="filterCards('متوسط',this,'tf')">🟡 متوسط ({tf_mid})</button>
    <button class="filter-btn" onclick="filterCards('صعب',this,'tf')">🔴 صعب ({tf_hrd})</button>
    {tf_dup_filter}
  </div>
  <div id="cards-tf">{tf_cards}</div>
  <div class="footer"><div class="footer-btns">
    <a href="data:text/csv;charset=utf-8;base64,{b_tf}" download="{os.path.basename(csv_tf)}" style="text-decoration:none">
      <button class="btn btn-violet btn-lg">⬇️ CSV صح/خطأ — {n_tf} سؤال</button>
    </a>
  </div></div>
</div>

<!-- ══════ تاب MCQ ══════ -->
<div id="tab-mcq" class="tab-panel">
  <div class="section-banner mcq-banner">
    <div class="banner-icon">🧩</div>
    <div class="banner-text">
      <h2 style="color:#fde68a">أسئلة الاختيار المتعدد</h2>
      <p>{n_mcq} سؤال محلل — مرن: يعمل مع بيانات ناقصة</p>
    </div>
  </div>
  <div class="stats-grid g4">
    <div class="stat-card"><div class="stat-icon">📊</div><div class="stat-num" style="color:#fde68a">{n_mcq}</div><div class="stat-label">إجمالي</div></div>
    <div class="stat-card"><div class="stat-icon">🟢</div><div class="stat-num" style="color:#4ade80">{mc_shl}</div><div class="stat-label">سهل</div></div>
    <div class="stat-card"><div class="stat-icon">🟡</div><div class="stat-num" style="color:#fbbf24">{mc_mid}</div><div class="stat-label">متوسط</div></div>
    <div class="stat-card"><div class="stat-icon">🔴</div><div class="stat-num" style="color:#f87171">{mc_hrd}</div><div class="stat-label">صعب</div></div>
  </div>
  <div class="filters">
    <button class="filter-btn active" onclick="filterCards('الكل',this,'mcq')">الكل ({n_mcq})</button>
    <button class="filter-btn" onclick="filterCards('سهل',this,'mcq')">🟢 سهل ({mc_shl})</button>
    <button class="filter-btn" onclick="filterCards('متوسط',this,'mcq')">🟡 متوسط ({mc_mid})</button>
    <button class="filter-btn" onclick="filterCards('صعب',this,'mcq')">🔴 صعب ({mc_hrd})</button>
    {mcq_chk_filter}
    {mcq_dup_filter}
  </div>
  <div id="cards-mcq">{mcq_cards}</div>
  <div class="footer"><div class="footer-btns">
    <a href="data:text/csv;charset=utf-8;base64,{b_mcq}" download="{os.path.basename(csv_mcq)}" style="text-decoration:none">
      <button class="btn btn-amber btn-lg">⬇️ CSV الاختيار المتعدد — {n_mcq} سؤال</button>
    </a>
  </div></div>
</div>

<!-- ══════ تاب التكرار ══════ -->
<div id="tab-dedup" class="tab-panel">
  <div class="dedup-banner" style="border:2px solid {dedup_clr}44;
       background:linear-gradient(135deg,{dedup_clr}18,{dedup_clr}06)">
    <div>
      <h2 style="color:{dedup_clr};font-size:17px;font-weight:900">{dedup_ico} {dedup_ttl}</h2>
      <p style="font-size:12px;color:#94a3b8;margin-top:3px">
        يشمل TF + MCQ معاً — عتبة التشابه: {int(threshold*100)}%
        &nbsp;|&nbsp; 60% نصي + 40% كلمات
      </p>
    </div>
    <div style="font-size:2.5rem">{'⚠️' if has_dup else '🎉'}</div>
  </div>
  <div class="stats-grid g4">
    <div class="stat-card"><div class="stat-icon">📊</div><div class="stat-num" style="color:#f1c553">{total}</div><div class="stat-label">إجمالي</div></div>
    <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-num" style="color:#4ade80">{n_kept}</div><div class="stat-label">محتفظ بها</div></div>
    <div class="stat-card"><div class="stat-icon">🗑️</div><div class="stat-num" style="color:#f87171">{n_rem}</div><div class="stat-label">محذوفة</div></div>
    <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-num" style="color:#a78bfa">{len(dup_groups)}</div><div class="stat-label">مجموعات</div></div>
  </div>
  <div class="info-note">💡&nbsp;
    <span><strong>الفرز الذكي:</strong> يكشف التكرار عبر جميع الأسئلة (TF + MCQ) في آنٍ واحد.
    كل مجموعة تُظهر نوع السؤال، ويُحتفظ دائماً بأول نسخة ويُحذف المكرر.</span>
  </div>
  <div class="section-title">🔁 مجموعات التكرار <span class="pill">{len(dup_groups)} مجموعة</span></div>
  {dedup_sec}
  <div class="footer"><div class="footer-btns">
    <a href="data:text/csv;charset=utf-8;base64,{b_clean}" download="{os.path.basename(csv_clean)}" style="text-decoration:none">
      <button class="btn btn-green btn-lg">⬇️ CSV المُنقَّى الكامل — {n_kept} سؤال</button>
    </a>
    <a href="data:text/csv;charset=utf-8;base64,{b_all}" download="{os.path.basename(csv_all)}" style="text-decoration:none">
      <button class="btn btn-blue btn-lg">⬇️ CSV الكامل — {total} سؤال</button>
    </a>
  </div></div>
</div>

{err_panel}

</div><!-- /main -->

<script>
function switchTab(name, btn) {{
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
}}
function toggle(h) {{ h.parentElement.classList.toggle('open'); }}
const removedSet = new Set({removed_js});

function filterCards(val, btn, type) {{
  const container = document.getElementById('cards-' + type);
  if (!container) return;
  btn.parentElement.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  container.querySelectorAll('.card').forEach(c => {{
    const diff = c.dataset.diff;
    const idx  = parseInt(c.dataset.idx);
    const ans  = (c.querySelector('.ans-box-tf')?.textContent||'') +
                 (c.querySelector('.ans-box-mcq')?.textContent||'');
    let show = false;
    if      (val==='الكل')  show = true;
    else if (val==='صح')    show = ans.includes('صح');
    else if (val==='خطأ')   show = ans.includes('خطأ');
    else if (val==='مكرر')  show = removedSet.has(idx);
    else if (val==='راجع')  show = !!c.querySelector('.chk-badge');
    else                    show = (diff===val);
    c.style.display = show ? '' : 'none';
  }});
}}

document.querySelector('#cards-tf  .card')?.classList.add('open');
document.querySelector('#cards-mcq .card')?.classList.add('open');

removedSet.forEach(idx => {{
  document.querySelectorAll(`.card[data-idx="${{idx}}"]`)
    .forEach(c => c.classList.add('is-dup'));
}});
</script>
</body></html>"""


# ══════════════════════════════════════════════════════════════════════════════
#  🏗️  بناء الواجهة الرسومية الحديثة (GUI)
# ══════════════════════════════════════════════════════════════════════════════

class ModernCategoryDialog:
    def __init__(self, initial="", file_label=""):
        self.result = None
        self.initial = (initial or "").strip()

        try:
            import tkinter as tk
            self.tk = tk
            self.win = tk.Tk()
            self.win.title("🧠 إعدادات الفرز الذكي")
            self.win.geometry("520x270")
            self.win.resizable(False, False)
            self.win.configure(bg="#0f172a")

            # توسيط النافذة
            self.win.update_idletasks()
            width = self.win.winfo_width()
            height = self.win.winfo_height()
            x = (self.win.winfo_screenwidth() // 2) - (width // 2)
            y = (self.win.winfo_screenheight() // 2) - (height // 2)
            self.win.geometry(f'+{x}+{y}')
            self.win.attributes("-topmost", True)

            lbl_title = tk.Label(
                self.win,
                text="🧠 إعداد تصنيف الامتحان الموحد",
                font=("Cairo", 14, "bold"),
                bg="#1e293b",
                fg="#f8fafc",
                pady=10
            )
            lbl_title.pack(fill=tk.X, side=tk.TOP)

            content_frame = tk.Frame(self.win, bg="#0f172a", padx=25, pady=15)
            content_frame.pack(fill=tk.BOTH, expand=True)

            if file_label:
                tk.Label(content_frame, text=f"📄 {file_label}", font=("Cairo", 9),
                         bg="#0f172a", fg="#38bdf8", anchor="w", justify=tk.LEFT
                         ).pack(fill=tk.X, pady=(0, 4))

            desc = ("تم التعرف على الاسم من اسم الملف — اضغط Enter للمتابعة أو عدّله:"
                    if self.initial else
                    "الرجاء كتابة تفاصيل الامتحان المُراد فرزه (سيتم إضافة كلمة 'امتحان' تلقائياً):")
            lbl_desc = tk.Label(
                content_frame,
                text=desc,
                font=("Cairo", 10),
                bg="#0f172a",
                fg="#94a3b8",
                anchor="w",
                justify=tk.LEFT
            )
            lbl_desc.pack(fill=tk.X, pady=(0, 8))

            self.entry_var = tk.StringVar()
            self.entry = tk.Entry(
                content_frame,
                textvariable=self.entry_var,
                font=("Cairo", 12),
                bg="#1e293b",
                fg="#f1f5f9",
                insertbackground="#7c3aed",
                bd=0,
                highlightthickness=1,
                highlightbackground="#334155",
                highlightcolor="#7c3aed",
                justify=tk.CENTER
            )
            self.entry.pack(fill=tk.X, ipady=8, pady=(0, 15))

            self.placeholder = "مثال: الدور الأول 2013 أو الشهادة الثانوية"
            if self.initial:
                self.entry_var.set(self.initial)
            else:
                self.entry_var.set(self.placeholder)
                self.entry.config(fg="#475569")

            self.entry.bind("<FocusIn>", self._clear_placeholder)
            self.entry.bind("<FocusOut>", self._add_placeholder)
            self.entry.bind("<Button-3>", self._show_context_menu)

            btn_frame = tk.Frame(content_frame, bg="#0f172a")
            btn_frame.pack(fill=tk.X)

            btn_paste = tk.Button(
                btn_frame,
                text="📋 لصق من الحافظة",
                font=("Cairo", 10, "bold"),
                bg="#334155",
                fg="#cbd5e1",
                activebackground="#475569",
                activeforeground="#f1f5f9",
                bd=0,
                padx=15,
                pady=4,
                cursor="hand2",
                command=self._paste_clipboard
            )
            btn_paste.pack(side=tk.LEFT)

            btn_submit = tk.Button(
                btn_frame,
                text="✅ اعتماد ومتابعة",
                font=("Cairo", 10, "bold"),
                bg="#7c3aed",
                fg="#ffffff",
                activebackground="#6d28d9",
                activeforeground="#ffffff",
                bd=0,
                padx=25,
                pady=4,
                cursor="hand2",
                command=self._validate_and_close
            )
            btn_submit.pack(side=tk.RIGHT)

            self.win.bind("<Return>", lambda e: self._validate_and_close())

            self.context_menu = tk.Menu(self.win, tearoff=0, bg="#1e293b", fg="#cbd5e1", font=("Cairo", 9))
            self.context_menu.add_command(label="قص", command=lambda: self.entry.event_generate("<<Cut>>"))
            self.context_menu.add_command(label="نسخ", command=lambda: self.entry.event_generate("<<Copy>>"))
            self.context_menu.add_command(label="لصق", command=self._paste_clipboard)

            self.entry.focus_set()
            if self.initial:
                self.entry.select_range(0, "end")
            self.win.mainloop()
        except Exception:
            self.result = None # حدوث مشكلة بيئية في تشغيل الواجهة

    def _clear_placeholder(self, event):
        if self.entry_var.get() == self.placeholder:
            self.entry_var.set("")
            self.entry.config(fg="#f1f5f9")

    def _add_placeholder(self, event):
        if not self.entry_var.get().strip():
            self.entry_var.set(self.placeholder)
            self.entry.config(fg="#475569")

    def _paste_clipboard(self):
        tk = self.tk
        try:
            clipboard_text = self.win.clipboard_get()
            if clipboard_text:
                self._clear_placeholder(None)
                try:
                    if self.entry.selection_get():
                        self.entry.delete(tk.SEL_FIRST, tk.SEL_LAST)
                except tk.TclError:
                    pass
                self.entry.insert(tk.INSERT, clipboard_text)
        except tk.TclError:
            pass

    def _show_context_menu(self, event):
        self.context_menu.tk_popup(event.x_root, event.y_root)

    def _validate_and_close(self):
        val = self.entry_var.get().strip()
        if not val or val == self.placeholder:
            self.result = "امتحان غير محدد"
        else:
            self.result = category_from_name(val)
        self.win.destroy()


def ask_category(detected_name, use_gui=True, file_label=""):
    """يعرض الاسم المكتشف للتأكيد؛ وعند غياب الواجهة يستخدمه مباشرة (أو يسأل في الـ Terminal)."""
    if use_gui:
        dialog = ModernCategoryDialog(initial=detected_name, file_label=file_label)
        if dialog.result is not None:
            return dialog.result
        print("⚠️ تعذر فتح النافذة الرسومية — الانتقال للوضع النصي...")
    if detected_name and not (sys.stdin and sys.stdin.isatty()):
        return category_from_name(detected_name)
    if sys.stdin and sys.stdin.isatty():
        hint = f" [{detected_name}]" if detected_name else ""
        typed = input(f"📝 تفاصيل الاختبار{hint}: ").strip() or detected_name
        return category_from_name(typed)
    return category_from_name(detected_name)


# ══════════════════════════════════════════════════════════════════════════════
#  🚀  نقطة التشغيل
# ══════════════════════════════════════════════════════════════════════════════

def run(raw_text, output_prefix="results", open_browser=True, category=None, meta=None):
    meta = meta or {}
    print("╔══════════════════════════════════════════════════╗")
    print("║  🧠  Unified Arabic Parser  v5.0                 ║")
    print("║  Word / نص → TF + MCQ + كاشف التكرار             ║")
    print("╚══════════════════════════════════════════════════╝\n")

    CATEGORY = category or ask_category("")
    print(f"📌 تم اعتماد الفئة والمزامنة بنجاح: {CATEGORY}\n")

    # ── 1. فرز البلوكات ──
    tf_blocks, mcq_blocks = _split_blocks(raw_text)
    print(f"  ✂️  فرز الأسئلة: {len(tf_blocks)} صح/خطأ | {len(mcq_blocks)} اختيار متعدد")

    # ── 2. تحليل TF ──
    tf_results, tf_errors = parse_all_tf(tf_blocks, CATEGORY)
    if tf_errors and TF_STRICT:
        print(f"  ⚠️  {len(tf_errors)} سؤال صح/خطأ ناقص (سيظهر في تاب الأخطاء)")
    print(f"  ✅  TF: {len(tf_results)} سؤال صالح | ⚠️ {len(tf_errors)} ناقص")

    # ── 3. تحليل MCQ ──
    mcq_results = parse_all_mcq(mcq_blocks, CATEGORY)
    print(f"  ✅  MCQ: {len(mcq_results)} سؤال")

    total = len(tf_results) + len(mcq_results)
    if total == 0:
        print("\n❌ لم يتم العثور على أي أسئلة صالحة!")
        return None

    # ── 3.5 الموضع العام لكل سؤال + تنبيهات القارئ الآلي ──
    for i, r in enumerate(tf_results):
        r['_idx'] = i
    for i, r in enumerate(mcq_results):
        r['_idx'] = len(tf_results) + i
    review = []
    for r in tf_results + mcq_results:
        warns = (meta.get(r['_num']) or {}).get('warn') or []
        if warns:
            r['_warn'] = warns
            review.append((r['_num'], warns))

    # ── 4. إنشاء CSVs ──
    csv_tf    = f"{output_prefix}_tf.csv"
    csv_mcq   = f"{output_prefix}_mcq.csv"
    csv_all   = f"{output_prefix}_all.csv"
    csv_clean = f"{output_prefix}_clean.csv"

    df_tf  = pd.DataFrame([{k:v for k,v in r.items() if not k.startswith('_')}
                            for r in tf_results])
    df_mcq = pd.DataFrame([{k:v for k,v in r.items() if not k.startswith('_')}
                            for r in mcq_results])

    tf_qs  = [r['_q']       for r in tf_results]
    mcq_qs = [r['question'] for r in mcq_results]
    all_qs = tf_qs + mcq_qs

    tf_ans  = {i: r['_ans']           for i,r in enumerate(tf_results)}
    mcq_ans = {i+len(tf_results): r['correct_answer'] for i,r in enumerate(mcq_results)}
    all_answers  = {**tf_ans, **mcq_ans}
    all_questions= {i: q for i,q in enumerate(all_qs)}
    type_labels  = {i: 'tf'  for i in range(len(tf_results))}
    type_labels.update({i+len(tf_results): 'mcq' for i in range(len(mcq_results))})

    # ── 5. كشف التكرار ──
    print("\n🔍 جاري فحص التكرار على جميع الأسئلة...")
    # في الاختيار المتعدد نضمّ الإجابة الصحيحة لنص المقارنة حتى لا يُعدّ سؤالان
    # بنفس الصياغة وإجابتين مختلفتين (تونس 1881 / الجزائر 1830) مكررَين.
    dedup_texts = tf_qs + [f"{r['question']} {r['correct_answer']}" for r in mcq_results]
    dup_groups, kept, removed, pairs = _detect_duplicates(dedup_texts, DEDUP_THRESHOLD)
    print(f"  {'⚠️ ' + str(len(removed)) + ' مكرر في ' + str(len(dup_groups)) + ' مجموعة' if removed else '✅  لا توجد تكرارات'}")

    # ── 6. تصدير CSVs ──
    df_tf.to_csv(csv_tf, index=False, encoding='utf-8-sig')
    df_mcq.to_csv(csv_mcq, index=False, encoding='utf-8-sig')

    df_all = pd.concat([df_tf, df_mcq], ignore_index=True)
    df_all.to_csv(csv_all, index=False, encoding='utf-8-sig')

    tf_kept  = [i for i in kept if i < len(tf_results)]
    mcq_kept = [i-len(tf_results) for i in kept if i >= len(tf_results)]
    df_clean_tf  = df_tf.iloc[tf_kept]  if tf_kept  else pd.DataFrame(columns=df_tf.columns)
    df_clean_mcq = df_mcq.iloc[mcq_kept] if mcq_kept else pd.DataFrame(columns=df_mcq.columns)
    pd.concat([df_clean_tf, df_clean_mcq], ignore_index=True).to_csv(csv_clean, index=False, encoding='utf-8-sig')

    # ── 7. توليد HTML ──
    print("\n🌐 جاري توليد التقرير الموحد...")
    html = _build_html(
        tf_results, mcq_results, tf_errors,
        dup_groups, kept, removed, pairs,
        all_questions, all_answers, type_labels,
        csv_tf, csv_mcq, csv_all, csv_clean, DEDUP_THRESHOLD, CATEGORY
    )
    html_path = f"{output_prefix}_report.html"
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"\n{'═'*52}")
    print(f"  ✅  اكتمل بنجاح!")
    print(f"  📊  إجمالي: {total} سؤال  (TF: {len(tf_results)} | MCQ: {len(mcq_results)})")
    print(f"  ⚠️   أخطاء TF: {len(tf_errors)} سؤال ناقص")
    print(f"  🗑️   مكررة محذوفة: {len(removed)}")
    print(f"  ✨  نظيف: {len(kept)} سؤال")
    print(f"  📄  {csv_tf}  |  {csv_mcq}")
    print(f"  📄  {csv_all}  |  {csv_clean}")
    print(f"  🌐  {html_path}")
    if review:
        print(f"  🔎  تحتاج مراجعة ({len(review)}):")
        for num, warns in review:
            print(f"        س{num}: {warns[0]}")
    print(f"{'═'*52}\n")

    if open_browser:
        webbrowser.open(f"file://{os.path.abspath(html_path)}")
        print("✅  تم فتح التقرير في المتصفح!")

    return {'tf': tf_results, 'mcq': mcq_results, 'errors': tf_errors,
            'html': html_path, 'category': CATEGORY, 'review': review}


def process_file(path, category=None, use_gui=True, open_browser=True, out_dir=None):
    """ملف واحد: يقرأ → يتعرف على الاسم → يحلل → يصدّر."""
    print(f"\n📂 الملف: {path}")
    raw_text, meta = load_source(path)
    detected = exam_name_from_filename(path)
    if category is None:
        category = ask_category(detected, use_gui, file_label=os.path.basename(path))
    out_dir = out_dir or os.path.dirname(os.path.abspath(path))
    os.makedirs(out_dir, exist_ok=True)
    stem = os.path.splitext(os.path.basename(path))[0]
    stem = re.sub(r'^[0-9a-fA-F]{8}[-_]', '', stem).strip(' _-') or "results"
    prefix = os.path.join(out_dir, re.sub(r'[\\/:*?"<>|]', '_', stem))
    return run(raw_text, output_prefix=prefix, open_browser=open_browser,
               category=category, meta=meta)


def pick_files():
    """نافذة اختيار ملفات؛ وإن لم تتوفر الواجهة يسأل عن المسار في الـ Terminal."""
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk(); root.withdraw(); root.attributes("-topmost", True)
        files = filedialog.askopenfilenames(
            title="اختر ملف الأسئلة (Word)",
            filetypes=[("Word / نص", "*.docx *.txt"), ("Word", "*.docx"), ("نص", "*.txt")])
        root.destroy()
        return list(files)
    except Exception:
        p = input("📂 مسار ملف Word (.docx): ").strip().strip('"').strip("'")
        return [p] if p else []


def main(argv=None):
    ap = argparse.ArgumentParser(description="محلل الأسئلة الموحد: Word/نص → TF + MCQ + تقرير")
    ap.add_argument("files", nargs="*", help="ملفات .docx أو .txt (بدونها تُفتح نافذة الاختيار)")
    ap.add_argument("-c", "--category", help="اسم الامتحان (يتخطى الاستخراج من اسم الملف)")
    ap.add_argument("-o", "--out", help="مجلد المخرجات (الافتراضي: بجانب كل ملف)")
    ap.add_argument("--no-gui", action="store_true", help="بدون نوافذ: استخدم الاسم المكتشف مباشرة")
    ap.add_argument("--no-browser", action="store_true", help="لا تفتح التقرير في المتصفح")
    args = ap.parse_args(argv)

    files = args.files or pick_files()
    if not files:
        print("لم يتم اختيار أي ملف.")
        return 1
    status = 0
    for f in files:
        try:
            category = category_from_name(args.category) if args.category else None
            process_file(f, category=category, use_gui=not args.no_gui,
                         open_browser=not args.no_browser, out_dir=args.out)
        except Exception as e:
            status = 1
            print(f"❌ تعذرت معالجة {f}: {e}")
    return status


if __name__ == "__main__":
    sys.exit(main())
