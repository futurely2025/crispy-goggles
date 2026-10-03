import onnx, numpy as np, sys
from onnx import numpy_helper, TensorProto, helper
def fp16_store(src, dst, min_elems=512):
    m = onnx.load(src, load_external_data=True); g = m.graph; new_init = []; casts = []
    used = {i for n in g.node for i in n.input}
    for t in g.initializer:
        if t.data_type == TensorProto.FLOAT and int(np.prod(t.dims) if len(t.dims) else 1) >= min_elems and t.name in used:
            a = numpy_helper.to_array(t).astype(np.float16); h = numpy_helper.from_array(a, t.name + '__h'); new_init.append(h)
            casts.append(helper.make_node('Cast', [t.name + '__h'], [t.name], to=TensorProto.FLOAT, name='cast_' + t.name))
        else: new_init.append(t)
    del g.initializer[:]; g.initializer.extend(new_init)
    nodes = list(g.node); del g.node[:]; g.node.extend(casts + nodes)
    onnx.checker.check_model(m); onnx.save(m, dst)   # self-contained (no external data)
for n in ('encoder', 'resizer', 'decoder'): fp16_store(n + '.onnx', n + '_h.onnx')
import os; [print(f, os.path.getsize(f) // 1024, 'KB') for f in ('encoder_h.onnx', 'decoder_h.onnx', 'resizer_h.onnx')]
