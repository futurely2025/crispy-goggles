import sys, types, yaml, torch, torch.nn as nn, numpy as np
sys.path.insert(0, 'p2t')
from munch import Munch
import importlib.util
# import package modules without pix2tex/__init__ side effects
import pix2tex.models.hybrid as hybrid, pix2tex.models.transformer as transformer
from timm.models.resnetv2 import ResNetV2
from timm.models.layers import StdConv2dSame
from einops import repeat
cfg = Munch(yaml.safe_load(open('p2t/pix2tex/model/settings/config.yaml')))
cfg.decoder_args = Munch(cfg.decoder_args)
enc = hybrid.get_encoder(cfg); dec = transformer.get_decoder(cfg)
sd = torch.load('weights.pth', map_location='cpu')
enc.load_state_dict({k[8:]: v for k, v in sd.items() if k.startswith('encoder.')}); dec.load_state_dict({k[8:]: v for k, v in sd.items() if k.startswith('decoder.')})
enc.eval(); dec.eval()
print('loaded', sum(p.numel() for p in enc.parameters())/1e6, sum(p.numel() for p in dec.parameters())/1e6)

# traceable encoder forward (pos-embedding index built from the input size)
class Enc(nn.Module):
    def __init__(s, e): super().__init__(); s.e = e
    def forward(s, x):
        e = s.e; B, c, h, w = x.shape
        x = e.patch_embed(x)
        cls = e.cls_token.expand(B, -1, -1); x = torch.cat((cls, x), dim=1)
        ph = torch.div(h, e.patch_size, rounding_mode='floor'); pw = torch.div(w, e.patch_size, rounding_mode='floor')
        rows = torch.arange(ph).unsqueeze(1) * ((e.width // e.patch_size) - pw) + torch.arange(ph * pw).view(ph, pw)  # (h,w) index = r*(W-w) + r*w + c
        idx = (torch.arange(ph).unsqueeze(1) * ((e.width // e.patch_size) - pw)).expand(ph, pw).reshape(-1) + torch.arange(ph * pw)
        idx = torch.cat((torch.zeros(1, dtype=torch.long), idx + 1), 0)
        x = x + e.pos_embed[:, idx]
        for blk in e.blocks: x = blk(x)
        return e.norm(x)
E1 = Enc(enc).eval()
# reference check against the original forward
x = torch.randn(1, 1, 64, 256)
with torch.no_grad():
    a = enc(x); b = E1(x)
print('enc diff', (a - b).abs().max().item(), a.shape)
torch.onnx.export(E1, x, 'encoder.onnx', input_names=['img'], output_names=['ctx'], dynamic_axes={'img': {2: 'h', 3: 'w'}, 'ctx': {1: 'n'}}, opset_version=17, do_constant_folding=True)
class Dec(nn.Module):
    def __init__(s, d): super().__init__(); s.n = d.net
    def forward(s, tokens, ctx): return s.n(tokens, context=ctx)[:, -1, :]
D1 = Dec(dec).eval(); tk = torch.tensor([[1, 5, 9]]); ctx = torch.randn(1, 40, 256)
with torch.no_grad(): print('dec', D1(tk, ctx).shape)
torch.onnx.export(D1, (tk, ctx), 'decoder.onnx', input_names=['tokens', 'ctx'], output_names=['logits'], dynamic_axes={'tokens': {1: 't'}, 'ctx': {1: 'n'}}, opset_version=17, do_constant_folding=True)
rs = ResNetV2(layers=[2, 3, 3], num_classes=672 // 32, global_pool='avg', in_chans=1, drop_rate=.05, preact=True, stem_type='same', conv_layer=StdConv2dSame)
rs.load_state_dict(torch.load('image_resizer.pth', map_location='cpu')); rs.eval()
torch.onnx.export(rs, torch.randn(1, 1, 64, 256), 'resizer.onnx', input_names=['img'], output_names=['cls'], dynamic_axes={'img': {2: 'h', 3: 'w'}}, opset_version=17, do_constant_folding=True)
print('exported')
