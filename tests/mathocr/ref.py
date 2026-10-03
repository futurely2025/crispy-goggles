import sys, json, numpy as np, onnxruntime as ort, re
from PIL import Image
import cv2
tok = json.load(open('p2t/pix2tex/model/dataset/tokenizer.json'))
vocab = tok['model']['vocab']; inv = {v: k for k, v in vocab.items()}
print('vocab', len(vocab), tok['model'].get('type'), list(tok.keys()), tok.get('pre_tokenizer'), tok.get('decoder'))
import os; SUF = os.environ.get('SUF', ''); DS = os.environ.get('DEC', 'decoder'); enc = ort.InferenceSession('encoder' + SUF + '.onnx'); dec = ort.InferenceSession(DS + '.onnx'); rs = ort.InferenceSession('resizer' + SUF + '.onnx')
def pad(img, div=32):
    data = np.array(img.convert('LA'))
    data = data[..., 0].astype(np.uint8) if data[..., -1].var() == 0 else (255 - data[..., -1]).astype(np.uint8)
    data = (data - data.min()) / (data.max() - data.min()) * 255
    if data.mean() > 128: gray = 255 * (data < 128).astype(np.uint8)
    else: gray = 255 * (data > 128).astype(np.uint8); data = 255 - data
    a, b, w, h = cv2.boundingRect(cv2.findNonZero(gray)); rect = data[b:b + h, a:a + w]
    im = Image.fromarray(rect).convert('L'); dims = [div * ((x + div - 1) // div) for x in (w, h)]
    out = Image.new('L', dims, 255); out.paste(im, (0, 0)); return out
def minmax(img, mx=(672, 192), mn=(32, 32)):
    r = [a / b for a, b in zip(img.size, mx)]
    if any(x > 1 for x in r): img = img.resize(tuple((np.array(img.size) // max(r)).astype(int)), Image.BILINEAR)
    ps = [max(a, b) for a, b in zip(img.size, mn)]
    if ps != list(img.size): p = Image.new('L', ps, 255); p.paste(img, img.getbbox()); img = p
    return img
def tens(img): a = (np.array(img.convert('L')).astype(np.float32) / 255 - 0.7931) / 0.1738; return a[None, None]
def run(path):
    inp = Image.open(path).convert('RGB'); img = minmax(pad(inp)); r, w, h = 1, inp.size[0], inp.size[1]; inp = img.convert('RGB').copy(); w, h = inp.size
    for _ in range(10):
        h = int(h * r); im2 = pad(minmax(inp.resize((w, h), Image.BILINEAR if r > 1 else Image.LANCZOS))); t = tens(im2)
        w2 = (int(rs.run(None, {'img': t})[0].argmax()) + 1) * 32
        w = w2
        if w2 == im2.size[0]: break
        r = w2 / im2.size[0]
    ctx = enc.run(None, {'img': t})[0]; toks = [1]
    for _ in range(200):
        lg = dec.run(None, {'tokens': np.array([toks], dtype=np.int64), 'ctx': ctx})[0][0]; n = int(lg.argmax())
        if n == 2: break
        toks.append(n)
    s = ''.join(inv[x] for x in toks[1:]).replace('Ġ', ' ')
    return s
truth = open('eq/truth.txt').read().split('\n')
for i, tr in enumerate(truth): print(i, '|', tr, '|', run('eq/e%02d.png' % i))
