import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.rcParams['mathtext.fontset']='cm'
F = [r"x^2+y^2=z^2", r"\frac{a+b}{c-d}=\sqrt{x^2+1}", r"\int_0^1 x^2\,dx=\frac{1}{3}", r"\sum_{i=1}^{n} i=\frac{n(n+1)}{2}", r"\alpha+\beta=\gamma", r"f(x)=\frac{1}{\sqrt{2\pi}}e^{-x^2/2}", r"\lim_{x\to 0}\frac{\sin x}{x}=1", r"a_1+a_2+\cdots+a_n", r"\frac{d}{dx}x^3=3x^2", r"E=mc^2", r"\sqrt[3]{27}=3", r"(a+b)^2=a^2+2ab+b^2"]
for i, f in enumerate(F):
    fig = plt.figure(figsize=(0.1, 0.1), dpi=200); fig.text(0, 0, '$' + f + '$', fontsize=22); fig.savefig('eq/e%02d.png' % i, bbox_inches='tight', pad_inches=0.15, facecolor='white'); plt.close(fig)
open('eq/truth.txt', 'w').write('\n'.join(F))
