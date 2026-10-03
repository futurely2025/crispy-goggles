import sys, json, re, random, numpy as np, torch, torch.nn as nn, torch.nn.functional as F, cv2, yaml
sys.path.insert(0, '../mx/p2t')
from PIL import Image
from munch import Munch
from tokenizers import Tokenizer
import pix2tex.models.hybrid as hybrid, pix2tex.models.transformer as transformer
AR = 'ءآأؤإئابةتثجحخدذرزسشصضطظعغفقكلمنهوىيـ،؟'
BASE = 1175
AR_ID = {c: BASE + i for i, c in enumerate(AR)}
tok = Tokenizer.from_file('../mx/p2t/pix2tex/model/dataset/tokenizer.json')
def encode(label):
    ids = [1]
    for seg in re.split('([' + AR + '])', label):
        if not seg: continue
        if seg in AR_ID: ids.append(AR_ID[seg])
        else: ids.extend(tok.encode(seg.replace(' ', '')).ids)  # the model writes tokens without LaTeX spaces
    ids.append(2); return ids
def build(device='cpu'):
    cfg = Munch(yaml.safe_load(open('../mx/p2t/pix2tex/model/settings/config.yaml'))); cfg.decoder_args = Munch(cfg.decoder_args)
    enc = hybrid.get_encoder(cfg); dec = transformer.get_decoder(cfg)
    sd = torch.load('../mx/weights.pth', map_location='cpu')
    enc.load_state_dict({k[8:]: v for k, v in sd.items() if k.startswith('encoder.')}); dec.load_state_dict({k[8:]: v for k, v in sd.items() if k.startswith('decoder.')})
    # new Arabic tokens start as copies of existing letter embeddings (+ noise)
    with torch.no_grad():
        emb = dec.net.token_emb.weight; lin = dec.net.to_logits.weight if hasattr(dec.net, 'to_logits') and hasattr(dec.net.to_logits, 'weight') else None
        src = [tok.token_to_id(c) for c in 'abcdefghijklmnopqrstuvwxyz']
        for i in range(len(AR)):
            j = src[i % len(src)]
            if j is None: continue
            emb[BASE + i] = emb[j] + 0.02 * torch.randn_like(emb[j])
            if lin is not None: lin[BASE + i] = lin[j] + 0.02 * torch.randn_like(lin[j])
    return enc.to(device), dec.to(device)
def white(path):
    im = Image.open(path).convert('RGBA'); bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im); return bg.convert('L')
def crop_ink(im):
    a = np.array(im).astype(np.float32); mn, mx = a.min(), a.max()
    if mx - mn < 1: return im
    a = (a - mn) / (mx - mn) * 255; ys, xs = np.where(a < 128)
    if len(xs) == 0: return im
    return Image.fromarray(a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.uint8))
def median_cc_height(im):
    b = (np.array(im) < 128).astype(np.uint8); n, lab, st, _ = cv2.connectedComponentsWithStats(b, 8)
    hs = [st[i, cv2.CC_STAT_HEIGHT] for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 6]
    return float(np.median(hs)) if hs else 20.0
TARGET = 26.0
def prep(im, jitter=1.0):
    im = crop_ink(im); k = TARGET / max(4.0, median_cc_height(im)) * jitter
    W, H = max(8, int(im.width * k)), max(8, int(im.height * k)); im = im.resize((W, H), Image.LANCZOS if k < 1 else Image.BILINEAR)
    r = max(W / 672, H / 192)
    if r > 1: im = im.resize((max(8, int(W / r)), max(8, int(H / r))), Image.BILINEAR)
    W, H = im.size; PW, PH = max(32, -(-W // 32) * 32), max(32, -(-H // 32) * 32)
    out = Image.new('L', (PW, PH), 255); out.paste(im, (0, 0)); return out
def tensor(im): return torch.from_numpy((np.array(im).astype(np.float32) / 255 - 0.7931) / 0.1738)[None]
