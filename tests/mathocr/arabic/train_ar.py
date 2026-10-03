import time, math, os, random, torch
from ar_lib import *
torch.set_num_threads(4); random.seed(1); torch.manual_seed(1)
EPOCHS = float(os.environ.get('EPOCHS', 2)); BS = 8
enc, dec = build()
for p in enc.patch_embed.backbone.parameters(): p.requires_grad = False       # the ResNet stem keeps its generic features
params = [p for p in list(enc.parameters()) + list(dec.parameters()) if p.requires_grad]
opt = torch.optim.AdamW(params, lr=2e-4, weight_decay=0.01)
rows = [l.rstrip('\n').split('\t') for l in open('labels.tsv')]; val = rows[-300:]; rows = rows[:-300]
total = int(EPOCHS * len(rows) / BS); step = 0
if os.path.exists('ckpt.pt'):
    c = torch.load('ckpt.pt'); enc.load_state_dict(c['enc']); dec.load_state_dict(c['dec']); opt.load_state_dict(c['opt']); step = c['step']; print('resumed', step, flush=True)
def batch(rs, aug=True):
    ims = [prep(white('data/%s.png' % r[0]), random.uniform(0.8, 1.25) if aug else 1.0) for r in rs]; W = max(i.width for i in ims); H = max(i.height for i in ims)
    x = torch.ones(len(ims), 1, H, W) * ((1 - 0.7931) / 0.1738)
    for k, i in enumerate(ims): t = tensor(i); x[k, :, :t.shape[1], :t.shape[2]] = t
    ids = [encode(r[2]) for r in rs]; L = max(len(i) for i in ids); y = torch.zeros(len(ids), L, dtype=torch.long)
    for k, i in enumerate(ids): y[k, :len(i)] = torch.tensor(i)
    return x, y
@torch.no_grad()
def greedy(x):
    enc.eval(); ctx = enc(x); toks = torch.ones(x.shape[0], 1, dtype=torch.long); done = torch.zeros(x.shape[0], dtype=torch.bool)
    for _ in range(120):
        nxt = dec.net(toks, context=ctx)[:, -1].argmax(-1); nxt[done] = 0; toks = torch.cat([toks, nxt[:, None]], 1); done |= nxt == 2
        if done.all(): break
    enc.train(); return toks[:, 1:]
def evaluate(n=60):
    ok = 0; chars = 0; err = 0
    for k in range(0, n, 10):
        rs = val[k:k + 10]; x, y = batch(rs, aug=False); out = greedy(x)
        for i in range(len(rs)):
            ref = y[i, 1:].tolist(); ref = ref[:ref.index(2)] if 2 in ref else ref; hyp = out[i].tolist(); hyp = hyp[:hyp.index(2)] if 2 in hyp else hyp
            ok += hyp == ref
            import difflib; sm = difflib.SequenceMatcher(None, ref, hyp); err += len(ref) + len(hyp) - 2 * sum(b.size for b in sm.get_matching_blocks()); chars += len(ref)
    return ok / n, 1 - err / max(1, 2 * chars) * 2 if False else err / max(1, chars)
enc.train(); dec.train(); t0 = time.time(); ema = None
while step < total:
    lr = 2e-4 * (0.5 * (1 + math.cos(math.pi * step / total))) * min(1, (step + 1) / 100) + 1e-5
    for g in opt.param_groups: g['lr'] = lr
    x, y = batch(random.sample(rows, BS))
    logits = dec.net(y[:, :-1], context=enc(x)); loss = F.cross_entropy(logits.reshape(-1, logits.shape[-1]), y[:, 1:].reshape(-1), ignore_index=0)
    opt.zero_grad(); loss.backward(); torch.nn.utils.clip_grad_norm_(params, 1.0); opt.step(); step += 1
    ema = loss.item() if ema is None else 0.98 * ema + 0.02 * loss.item()
    if step % 20 == 0: print('step %d/%d loss %.3f lr %.1e %.0fs' % (step, total, ema, lr, time.time() - t0), flush=True)
    if step % 150 == 0:
        torch.save({'enc': enc.state_dict(), 'dec': dec.state_dict(), 'opt': opt.state_dict(), 'step': step}, 'ckpt.pt')
    if step % 600 == 0:
        em, ter = evaluate(); print('VAL step %d exact %.2f token-error %.3f' % (step, em, ter), flush=True)
torch.save({'enc': enc.state_dict(), 'dec': dec.state_dict(), 'opt': opt.state_dict(), 'step': step}, 'ckpt.pt'); em, ter = evaluate(120); print('FINAL exact %.2f token-error %.3f' % (em, ter), flush=True)
