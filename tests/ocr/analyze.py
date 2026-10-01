import json,re,difflib,collections,sys
d=json.load(open(sys.argv[1]))
def norm(s): return re.sub(r'\s+',' ',re.sub(r'[ً-ْـ‎‏]','',s)).strip()
cat=collections.Counter(); pairs=collections.Counter()
tot=0
for f,hyp in d.items():
    ref=norm(open('ocr/'+f.replace('.jpg','.txt'),encoding='utf-8').read()).split(); hw=norm(hyp).split()
    tot+=len(ref)
    sm=difflib.SequenceMatcher(None,ref,hw,autojunk=False)
    for op,i1,i2,j1,j2 in sm.get_opcodes():
        if op=='equal': continue
        R=' '.join(ref[i1:i2]); H=' '.join(hw[j1:j2])
        if R.replace(' ','')==H.replace(' ',''): cat['space']+=1
        elif op=='delete': cat['dropword']+=1
        elif op=='insert': cat['extraword']+=1
        elif i2-i1==1 and j2-j1==1:
            cat['char1' if sum(1 for a,b in zip(R,H) if a!=b)+abs(len(R)-len(H))<=1 else 'wordsub']+=1
        else: cat['multi']+=1
        pairs[(R,H)]+=1
print('ref words',tot, dict(cat))
for (r,h),n in pairs.most_common(40): print(n,r,'→',h)
