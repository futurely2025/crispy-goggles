"""
قراءة ملفات Word (.docx) وتحويلها إلى النص القياسي الذي يفهمه المحلل.

لا تحتاج أي مكتبة خارجية (zipfile + xml فقط)، وتتعامل مع:
  • "س 1)" بمسافة، و"توضيح:" بدون "ال"، وتوضيح متعدد الأسطر
  • خيارات الاختيار من متعدد الملصوقة في سطر واحد بلا (أ)(ب)  ← فصل ذكي
  • جداول الأسئلة (رقم | السؤال | الحرف | الإجابة)
"""

import re
import zipfile
import xml.etree.ElementTree as ET
from itertools import combinations
from statistics import pvariance
from difflib import SequenceMatcher

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
LETTERS = ["أ", "ب", "ج", "د", "هـ"]


# ══════════════════════════════════════════════════════════════════════════════
#  📄  قراءة بنية الـ docx (فقرات + جداول بالترتيب)
# ══════════════════════════════════════════════════════════════════════════════

def _run_text(r):
    out = []
    for el in r:
        if el.tag == W + 't':
            out.append(el.text or '')
        elif el.tag == W + 'tab':
            out.append('\t')
        elif el.tag in (W + 'br', W + 'cr'):
            out.append('\n')
    return ''.join(out)


def _para_runs(p):
    return [_run_text(r) for r in p.iter(W + 'r')]


def _iter_body(parent):
    for ch in parent:
        if ch.tag == W + 'sdt':                      # content controls
            content = ch.find(W + 'sdtContent')
            if content is not None:
                yield from _iter_body(content)
        else:
            yield ch


def read_docx_blocks(path):
    """يرجع قائمة: ('p', [runs]) أو ('t', [[cell, ...], ...]) بترتيب المستند."""
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read('word/document.xml'))
    body = root.find(W + 'body')
    blocks = []
    for el in _iter_body(body):
        if el.tag == W + 'p':
            blocks.append(('p', _para_runs(el)))
        elif el.tag == W + 'tbl':
            rows = []
            for tr in el.iter(W + 'tr'):
                cells = []
                for tc in tr.findall(W + 'tc'):
                    cells.append(' '.join(''.join(_para_runs(p)).strip()
                                          for p in tc.iter(W + 'p')).strip())
                rows.append(cells)
            blocks.append(('t', rows))
    return blocks


# ══════════════════════════════════════════════════════════════════════════════
#  🔧  أدوات نصية
# ══════════════════════════════════════════════════════════════════════════════

def _norm(text):
    t = (text or '').lower().strip()
    t = re.sub(r'[ً-ٰٟـ]', '', t)
    t = re.sub(r'[أإآ]', 'ا', t)
    t = t.replace('ى', 'ي').replace('ة', 'ه')
    t = re.sub(r'[^\w\s]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def _sim(a, b):
    a, b = _norm(a), _norm(b)
    return SequenceMatcher(None, a, b).ratio() if a and b else 0.0


def _clean_ws(s):
    return re.sub(r'\s+', ' ', (s or '').replace(' ', ' ')).strip()


def _letter(s):
    s = re.sub(r'[()\s\u0640]', '', s or '')
    s = {'ا': 'أ', 'أ': 'أ', 'ب': 'ب', 'ج': 'ج', 'د': 'د', 'ه': 'هـ'}.get(s, '')
    return s


# ══════════════════════════════════════════════════════════════════════════════
#  ✂️  فصل الخيارات الملصوقة في سطر واحد
# ══════════════════════════════════════════════════════════════════════════════

_ALL_RE = re.compile(
    r'جميع\s+الإجابات\s+السابقة\s+\S+|جميع\s+الاجابات\s+السابقة\s+\S+|'
    r'كل\s+ما\s+سبق(?:\s+صحيح)?|جميع\s+ما\s+سبق|لا\s+شيء\s+مما\s+سبق')

_STOP_END = {_norm(w) for w in (
    'من', 'في', 'على', 'إلى', 'عن', 'بين', 'و', 'مع', 'ثم', 'حتى', 'أن', 'الذي',
    'التي', 'ل', 'ب', 'قبل', 'بعد', 'عند', 'أو')}


def _find_span(tokens, words):
    nt = [_norm(t) for t in tokens]
    nw = [_norm(w) for w in words]
    return [(i, i + len(nw)) for i in range(len(nt) - len(nw) + 1)
            if nt[i:i + len(nw)] == nw] if nw else []


def _fixed_span(tokens):
    text, pos = '', []
    for t in tokens:
        pos.append(len(text))
        text += t + ' '
    m = _ALL_RE.search(text)
    if not m:
        return None
    a = max(i for i, p in enumerate(pos) if p <= m.start())
    b = max(i for i, p in enumerate(pos) if p < m.end()) + 1
    return (a, b)


def _score(tokens, spans, fixed, labels):
    free = [s for s in spans if s != fixed]
    sizes = [b - a for a, b in free]
    sc = pvariance(sizes) if len(sizes) > 1 else 0.0
    shapes = set()
    evidence = 0
    for (a, b) in free:
        ch = tokens[a:b]
        txt = ' '.join(ch)
        last, first = _norm(ch[-1]), _norm(ch[0])
        if last in _STOP_END:
            sc += 2.5
        if first == 'و' or ch[0] in ('-', '–') or ch[-1] in ('-', '–'):
            sc += 3
        elif first in _STOP_END:
            sc += 1.5
        if txt.count('(') != txt.count(')'):
            sc += 6
        shapes.add(bool(re.search(r'\d', txt)))
        for lb in labels:
            nl, nc = _norm(lb), _norm(txt)
            if nc and (nl.startswith(nc) or _sim(lb, txt) >= 0.8):
                sc -= 1.5
                evidence += 1
                break
    if len(shapes) > 1:
        sc += 3
    return sc, evidence, len(set(sizes)) == 1


def split_inline_options(text, answer='', run_chunks=None, labels=(), k=4):
    """
    يفصل نص الخيارات الملصوق إلى قائمة خيارات.
    يرجع (options, confidence)  حيث confidence: exact | high | medium | low
    """
    text = _clean_ws(text)
    ans_n = _norm(answer)

    # 1) فواصل حقيقية موجودة في المستند (Runs منفصلة بمسافة)
    if run_chunks:
        chunks = [_clean_ws(c) for c in run_chunks if _clean_ws(c)]
        if 3 <= len(chunks) <= 5 and sum(_norm(c) == ans_n for c in chunks) == 1:
            return chunks, 'exact'

    tokens = text.split()
    if len(tokens) <= k:
        return tokens, 'medium'
    if len(tokens) > 45:
        return [text], 'low'

    fixed = _fixed_span(tokens)
    ans_spans = _find_span(tokens, answer.split()) if answer else []
    if fixed and ans_spans and fixed in ans_spans:      # الإجابة هي "جميع الإجابات..."
        ans_spans = [fixed]

    candidates = ans_spans or [None]
    best = None
    for cand in candidates:
        req = [s for s in {fixed, cand} if s]
        forced = set()
        for a, b in req:
            if a > 0:
                forced.add(a)
            if b < len(tokens):
                forced.add(b)
        if len(forced) > k - 1:
            continue
        free_pos = [p for p in range(1, len(tokens)) if p not in forced]
        for extra in combinations(free_pos, k - 1 - len(forced)):
            bounds = [0] + sorted(forced | set(extra)) + [len(tokens)]
            spans = list(zip(bounds[:-1], bounds[1:]))
            if any(s not in spans for s in req):
                continue
            sc, ev, same = _score(tokens, spans, fixed, labels)
            if best is None or sc < best[0]:
                best = (sc, spans, ev, same)
    if best is None:
        return [text], 'low'
    _, spans, ev, same = best
    opts = [' '.join(tokens[a:b]) for a, b in spans]
    conf = 'high' if ev >= max(1, k - 2) else ('medium' if same else 'low')
    if not ans_spans and answer:
        conf = 'low'
    return opts, conf


# ══════════════════════════════════════════════════════════════════════════════
#  🔁  تحويل المستند إلى النص القياسي
# ══════════════════════════════════════════════════════════════════════════════

_Q_START = re.compile(r'^[•\-\*\s]*س\s*(\d+)\s*[\)\-\.:：]?\s*(.*)$', re.S)
_SECTION = re.compile(r'^(?:أولا|أولاً|ثانيا|ثانياً|ثالثا|ثالثاً|رابعا|رابعاً|خامسا|خامساً)\s*[:：\-]')
_SEP = re.compile(r'^[\s_\-–—=*]{3,}$')
_BULLET = re.compile(r'^[•·▪●◦\*\-–]+\s*')

_FIELDS = [
    ('ans',   re.compile(r'^(?:ال)?[إا]جابة(?:\s+الصحيحة)?\s*[:：]\s*')),
    ('corr',  re.compile(r'^تصحيح\s+الخطأ\s*[:：]\s*')),
    ('shrah', re.compile(r'^(?:ال)?شرح\s*[:：]\s*')),
    ('expl',  re.compile(r'^(?:ال)?توضيح(?:\s+العلمي)?\s*[:：]\s*')),
    ('src',   re.compile(r'^(?:ال)?مصدر\s*[:：]\s*')),
    ('time',  re.compile(r'^الوقت[^:：]*[:：]\s*')),
    ('diff',  re.compile(r'^صعوبة[^:：]*[:：]\s*')),
]
_OPT_LINE = re.compile(r'^\(?\s*(أ|ب|ج|د|هـ|ه)\s*[\)\-\.ـ]+\s*(.*)$')
_TF_ANS = re.compile(r'^\(?\s*(صح|صحيحة|صحيح|خطأ|خطا|خاطئة|خاطئ)\s*\)?\s*\.?$')


def _field_of(line, retry=False):
    for key, pat in _FIELDS:
        m = pat.match(line)
        if m:
            return key, line[m.end():].strip()
    # حرف زائد قبل اسم الحقل (مثل «ص صعوبة السؤال: متوسط») خطأ إملائي نتسامح معه
    if not retry and re.match(r'^[\u0621-\u064A]\s+\S', line):
        key, rest = _field_of(re.sub(r'^[\u0621-\u064A]\s+', '', line), True)
        if key:
            return key, rest
    return None, line


_MATCH_ITEM = re.compile(r'^[•\-\*\s]*س\s*(\d+)\s*[\)\-\.:：]?\s*(.+?)\s*(?:->|=>|—>|–>|←|⟵)\s*(.+)$')
_DONE = re.compile(r'^(?:DONE|END|انتهى)$', re.I)


def _is_match_head(line):
    return (not re.match(r'^[•\-\*\s]*س\s*\d+\s*\)', line) and
            bool(re.search(r'المزاوجة|التوصيل|المطابقة', line) or
                 re.search(r'س\s*\d+\s*[-–]\s*س?\s*\d+', line)))


def _new_group(num, first, runs):
    return {'num': num, 'first': first, 'runs': runs, 'extra': [], 'fields': {}, 'order': [],
            'last': None}


def _collect_groups(blocks):
    """يرجع قائمة عناصر مرتبة: ('q', group) أو ('match', group) أو ('table', rows)."""
    items, cur = [], None

    def flush():
        nonlocal cur
        if cur:
            items.append(('match' if cur.get('match') else 'q', cur))
            cur = None

    def match_line(line):
        m = _MATCH_ITEM.match(line)
        if m:
            cur['items'].append({'num': int(m.group(1)), 'stem': _clean_ws(m.group(2)),
                                 'ans': _clean_ws(m.group(3)).rstrip('.').strip()})
            cur['mode'], cur['last'] = 'f', None
            return
        key, rest = _field_of(_BULLET.sub('', line))
        if key == 'shrah' and not rest:
            cur['mode'] = 'shr'
        elif key:
            cur['fields'][key] = rest
            cur['last'], cur['mode'] = key, 'f'
        elif cur['mode'] == 'shr':
            if re.search(r'[:：]\s*$', line):
                cur['shr'].append({'label': re.sub(r'[:：]\s*$', '', line), 'text': ''})
            elif cur['shr']:
                cur['shr'][-1]['text'] += ' ' + line
        elif cur['last']:
            cur['fields'][cur['last']] += '\n' + line

    for kind, data in blocks:
        if kind == 't':
            flush()
            items.append(('table', data))
            continue
        full = ''.join(data)
        lines = full.split('\n')
        for raw in lines:
            line = _clean_ws(raw)
            runs = data if len(lines) == 1 else [raw]
            if not line:
                continue
            if _SEP.match(line) or _SECTION.match(line) or _DONE.match(line):
                flush()
                continue
            if _is_match_head(line):
                flush()
                cur = {'match': True, 'items': [], 'fields': {}, 'shr': [], 'mode': 'f', 'last': None}
                continue
            m = _Q_START.match(line)
            has_field = bool(_field_of(_BULLET.sub('', line))[0])
            if cur and cur.get('match') and (_MATCH_ITEM.match(line) or not m or has_field or cur['mode'] == 'shr'):
                match_line(line)
                continue
            if m and not has_field:
                flush()
                cur = _new_group(int(m.group(1)), m.group(2).strip(), runs)
                cur['runs'] = _strip_prefix_runs(runs, m.group(2))
                continue
            if cur is None:
                continue
            line = _BULLET.sub('', line)
            key, rest = _field_of(line)
            if key:
                cur['fields'][key] = rest
                cur['order'].append(key)
                cur['last'] = key
            elif cur['last'] is None:
                cur['extra'].append(line)
            else:
                cur['fields'][cur['last']] = (cur['fields'][cur['last']] + '\n' + line).strip()
    flush()
    return items


def _convert_match(g, meta):
    answers = [i['ans'] for i in g['items']]
    f = g['fields']
    out = []
    for it in g['items']:
        sh = ''
        for e in g['shr']:
            if not sh and _sim(e['label'], it['ans']) >= 0.8:
                sh = _clean_ws(e['text'])
        block = [f"س{it['num']}) {it['stem']}"]
        block += [f"({lt}) {tx}" for lt, tx in zip(LETTERS, answers[:5])]
        block.append(f"الإجابة: {it['ans']}")
        if sh:
            block.append(f"الشرح: {sh}")
        if f.get('expl'):
            block.append("التوضيح: " + f['expl'].replace('\n', ' \n'))
        if f.get('src'):
            block.append(f"المصدر: {_clean_ws(f['src'])}")
        block.append(f"الوقت المثالي لحل السؤال: {_fmt_time_diff(f.get('time', ''))}")
        block.append(f"صعوبة السؤال: {_fmt_time_diff(f.get('diff', ''))}")
        meta[it['num']] = {'kind': 'mcq', 'warn': (['أكثر من 5 إجابات في جدول المزاوجة — اقتُصرت الخيارات على أول 5']
                                                  if len(answers) > 5 else [])}
        out.append('\n'.join(block))
    return out


def _strip_prefix_runs(runs, rest):
    """يُبقي الـ runs التي تخص نص السؤال فقط (بعد 'س N)')."""
    out, acc = [], ''
    joined = ''.join(runs)
    idx = joined.find(rest) if rest else len(joined)
    pos = 0
    for r in runs:
        end = pos + len(r)
        if end > idx:
            out.append(r[max(0, idx - pos):])
        pos = end
    return out


def _fmt_time_diff(s):
    return _clean_ws(s).rstrip('.').strip()


def _convert_question(g, meta):
    f, num = g['fields'], g['num']
    ans = _clean_ws(f.get('ans', '')).rstrip('.').strip()
    body_lines = ([g['first']] if g['first'] else []) + g['extra']
    warns = []
    is_tf = bool(_TF_ANS.match(ans))

    out = []
    if is_tf:
        a = 'صح' if _norm(ans).startswith('صح') else 'خطأ'
        out.append(f"س{num}) {_clean_ws(' '.join(body_lines))}")
        out.append(f"الإجابة: {a}")
        meta[num] = {'kind': 'tf', 'warn': []}
    else:
        full = ' '.join(body_lines)
        has_markers = bool(re.search(r'\(أ\)', full)) or any(_OPT_LINE.match(l) for l in body_lines[1:])
        if has_markers:
            stem_lines, opts = [], []
            for l in body_lines:
                m = _OPT_LINE.match(l)
                if m:
                    opts.append((_letter(m.group(1)), _clean_ws(m.group(2))))
                elif opts:
                    opts[-1] = (opts[-1][0], opts[-1][1] + ' ' + l)
                else:
                    stem_lines.append(l)
            stem = _clean_ws(' '.join(stem_lines))
            m_inline = re.search(r'\(أ\)', stem)
            if not opts and m_inline:                      # (أ) ... (ب) ... في سطر واحد
                out.append(f"س{num}) {stem}")
            else:
                out.append(f"س{num}) {stem}")
                for lt, tx in opts:
                    out.append(f"({lt}) {tx}")
            meta[num] = {'kind': 'mcq', 'warn': []}
        else:
            stem, opts_txt = _split_stem(full)
            labels = _distractor_labels(f.get('expl', ''))
            run_chunks = _run_chunks(g['runs'])
            if opts_txt:
                opts, conf = split_inline_options(opts_txt, ans, run_chunks, labels)
            else:
                opts, conf = [ans] if ans else [], 'low'
                warns.append('لم يُعثر على الخيارات في السؤال — أُضيفت الإجابة فقط')
            if conf == 'low' and not warns:
                warns.append('تم تقسيم الخيارات تلقائياً بثقة منخفضة — راجعها')
            out.append(f"س{num}) {stem}")
            for lt, tx in zip(LETTERS, opts):
                out.append(f"({lt}) {tx}")
            meta[num] = {'kind': 'mcq', 'warn': warns, 'conf': conf}
        if ans:
            out.append(f"الإجابة: {ans}")

    if f.get('corr'):
        out.append(f"تصحيح الخطأ: {f['corr']}")
    if f.get('shrah'):
        out.append(f"الشرح: {_clean_ws(f['shrah'])}")
    if f.get('expl'):
        out.append("التوضيح: " + f['expl'].replace('\n', ' \n'))
    if f.get('src'):
        out.append(f"المصدر: {_clean_ws(f['src'])}")
    out.append(f"الوقت المثالي لحل السؤال: {_fmt_time_diff(f.get('time', ''))}")
    out.append(f"صعوبة السؤال: {_fmt_time_diff(f.get('diff', ''))}")
    return '\n'.join(out)


def _split_stem(full):
    m = re.search(r'[:：]', full)
    if not m:
        return _clean_ws(full), ''
    return _clean_ws(full[:m.start() + 1]), _clean_ws(full[m.end():])


def _run_chunks(runs):
    """يقسم الـ runs (بعد النقطتين) على الـ runs المسافات فقط، إن وُجدت."""
    chunks, started, cur = [], False, ''
    for r in runs:
        if not started:
            if re.search(r'[:：]', r):
                started = True
                r = re.split(r'[:：]', r, 1)[1]
            else:
                continue
        if r.strip() == '' and r != '':
            if cur.strip():
                chunks.append(cur)
            cur = ''
        else:
            cur += r
    if cur.strip():
        chunks.append(cur)
    return chunks


def _distractor_labels(expl):
    labels = []
    for ln in expl.split('\n')[1:]:
        m = re.match(r'^(.{2,60}?)\s*[:：]\s*\S', ln.strip())
        if m:
            labels.append(m.group(1).strip())
    return labels


def _convert_table(rows, meta):
    if not rows:
        return []
    head = [_norm(c) for c in rows[0]]

    def col(*keys, default):
        for i, h in enumerate(head):
            if any(k in h for k in keys):
                return i
        return default

    c_num = col('رقم', default=0)
    c_q = col('سوال', 'السوال', default=1)
    c_l = col('حرف', default=2)
    c_a = col('اجابه', default=3)
    out = []
    for r in rows[1:]:
        if len(r) <= max(c_num, c_q, c_l, c_a):
            continue
        m = re.search(r'\d+', r[c_num])
        if not m:
            continue
        num = int(m.group())
        letter = _letter(re.sub(r'[()\s]', '', r[c_l]))
        ans = _clean_ws(r[c_a]).rstrip('.')
        block = [f"س{num}) {_clean_ws(r[c_q])}"]
        if letter and ans:
            block.append(f"({letter}) {ans}")
        block += [f"الإجابة: {ans}", "الوقت المثالي لحل السؤال: ", "صعوبة السؤال: "]
        meta[num] = {'kind': 'mcq', 'warn': ['من جدول: الخيارات الأخرى غير مكتوبة في الملف '
                                             '(الموجود فقط الإجابة الصحيحة وحرفها)']}
        out.append('\n'.join(block))
    return out


def docx_to_canonical(path):
    """يرجع (النص القياسي, meta) حيث meta[رقم_السؤال] = {'kind','warn':[...]}"""
    items = _collect_groups(read_docx_blocks(path))
    meta, parts = {}, []
    for kind, data in items:
        if kind == 'q':
            parts.append(_convert_question(data, meta))
        elif kind == 'match':
            parts += _convert_match(data, meta)
        else:
            parts += _convert_table(data, meta)
    return '\n________________________________________\n'.join(parts), meta
