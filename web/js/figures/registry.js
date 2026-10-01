/*
 * Figures — one registry for every non-equation object the add-in can produce from text:
 *   graph, geometry, structure (SMILES), chart (statistics), physics, circuit, diagram (number line / Venn / tree)
 * and the scanner that finds these blocks (plus tables) inside a LaTeX source.
 * Modules are loaded lazily, only when a block of that kind is used.
 */
(function (global) {
  'use strict';
  var BASE = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/js\/figures\/registry\.js.*$/, '') : '';
  })();
  var V = '?v=5.0.0';
  var CORE = ['js/studio/raster.js' + V, 'js/figures/util.js' + V];
  var CAS = ['vendor/nerdamer/all.min.js?v=1.1.13', 'js/math/cas.js' + V];

  var KINDS = {
    graph: {
      envs: ['graph'], studio: 'graph', label: ['رسم بياني', 'Graph'],
      scripts: CAS.concat(['js/studio/graph-render.js' + V, 'js/figures/graph-markup.js' + V]),
      parse: function (b) { return /\\begin\{axis\}/.test(b.code) ? GraphMarkup.fromPgf(b.code) : GraphMarkup.parse(b.opts, b.body); },
      serialize: function (d) { return GraphMarkup.serialize(d); },
      render: function (d) { return GraphRender.render(d); }
    },
    geometry: {
      envs: ['geometry'], studio: 'geometry', label: ['شكل هندسي', 'Geometry'],
      scripts: ['js/studio/geometry-render.js' + V, 'js/studio/geometry-templates.js' + V, 'js/figures/geometry-markup.js' + V],
      parse: function (b) { return b.env === 'tikzpicture' || /\\tkz/.test(b.code) ? GeometryMarkup.fromTikz(b.code) : GeometryMarkup.parse(b.opts, b.body); },
      serialize: function (d) { return GeometryMarkup.serialize(d); },
      render: function (d) { return GeometryRender.render(d); }
    },
    structure: {
      cmds: ['smiles'], studio: 'structure', label: ['صيغة بنائية', 'Structure'],
      scripts: ['vendor/smiles-drawer/smiles-drawer.min.js?v=2.4.1', 'js/chem/molecules.js' + V, 'js/studio/structure-render.js' + V],
      parse: function (b) {
        var o = Mk.options(b.opts), d = StructureRender.defaults();
        d.smiles = Mk.unbrace(b.body).trim(); d.name = o.name || '';
        if (b.env === 'molecule') {
          var hit = findMolecule(d.smiles);
          if (!hit) throw new Error('لا يوجد مركب باسم «' + d.smiles + '» في المكتبة — استخدم \\smiles{…}');
          d.name = o.name || hit[0]; d.smiles = hit[2];
        }
        d.showName = !!d.name; d.showFormula = Mk.bool(o, 'formula', true);
        if (o.theme) d.theme = /mono|black|أسود/.test(o.theme) ? 'mono' : /tq|turq|فيروز/.test(o.theme) ? 'tq' : 'light';
        if (o.hydrogens || o.carbons) d.terminalCarbons = !!o.carbons;
        if (o.size) d.scale = Mk.evalNum(o.size, d.scale);
        if (o.digits === 'eastern') d.digits = 'eastern';
        if (!d.smiles) throw new Error('اكتب صيغة SMILES داخل \\smiles{…}');
        return d;
      },
      serialize: function (d) {
        return '\\smiles' + Mk.optStr([['name', d.name], d.showFormula === false ? 'noformula' : null, d.theme !== 'light' ? ['theme', d.theme] : null, d.scale !== 1.5 ? ['size', d.scale] : null]) + '{' + d.smiles + '}';
      },
      render: function (d) { return StructureRender.render(d); }
    },
    chemfig: {
      cmds: ['chemfig'], studio: 'structure', label: ['صيغة بنائية', 'Structure'],
      scripts: ['js/chem/chemfig.js' + V],
      parse: function (b) { return ChemFig.parse(b.opts, b.body); },
      serialize: function (d) { return ChemFig.serialize(d); },
      render: function (d) { return ChemFig.render(d); }
    },
    chart: {
      envs: ['chart'], studio: 'chart', label: ['رسم إحصائي', 'Chart'],
      scripts: ['js/math/stats.js' + V, 'js/math/prob.js' + V, 'js/studio/chart-render.js' + V, 'js/figures/chart-markup.js' + V],
      parse: function (b) { return ChartMarkup.parse(b.opts, b.body); },
      serialize: function (d) { return ChartMarkup.serialize(d); },
      render: function (d) { return ChartRender.render(d); }
    },
    physics: {
      envs: ['physics'], studio: 'physics', label: ['رسم فيزيائي', 'Physics'],
      scripts: ['js/studio/physics-render.js' + V, 'js/figures/physics-markup.js' + V],
      parse: function (b) { return PhysicsMarkup.parse(b.opts, b.body); },
      serialize: function (d) { return PhysicsMarkup.serialize(d); },
      render: function (d) { return PhysicsRender.render(d); }
    },
    circuit: {
      envs: ['circuit', 'circuitikz'], studio: 'physics', label: ['دائرة كهربائية', 'Circuit'],
      scripts: ['js/studio/circuit-render.js' + V],
      parse: function (b) { return b.env === 'circuitikz' ? (CircuitRender.scene(b.code), { v: 1, code: b.code }) : CircuitRender.parse(b.opts, b.body); },
      serialize: function (d) { return CircuitRender.serialize(d); },
      render: function (d) { return CircuitRender.render(d); }
    },
    vartable: {
      envs: ['vartable', 'signtable'], studio: 'diagram', label: ['جدول تغيرات', 'Variation table'],
      scripts: CAS.concat(['js/studio/vartable-render.js' + V]),
      parse: function (b) { return VarTable.parse(b.env === 'tikzpicture' ? '' : b.opts, b.env === 'tikzpicture' ? b.body : b.body, b.env); },
      serialize: function (d) { return VarTable.serialize(d); },
      render: function (d) { return VarTable.render(d); }
    },
    diagram: {
      envs: ['numberline', 'venn', 'tree'], studio: 'diagram', label: ['مخطط', 'Diagram'],
      scripts: ['js/studio/diagram-render.js' + V],
      parse: function (b) { return DiagramRender.parse(b.env, b.opts, b.body); },
      serialize: function (d) { return DiagramRender.serialize(d); },
      render: function (d) { return DiagramRender.render(d); }
    }
  };
  // chemistry tools: element card, Bohr model, Lewis symbol, orbital diagram, periodic table — and lab apparatus
  KINDS.atom = {
    cmds: ['element', 'bohr', 'lewis', 'orbital', 'ptable'], studio: 'chem', label: ['ذرة وعنصر', 'Atom / element'],
    scripts: ['js/chem/elements.js' + V, 'js/chem/atom-render.js' + V],
    parse: function (b) { return AtomRender.parse(b); },
    serialize: function (d) { return AtomRender.serialize(d); },
    render: function (d) { return AtomRender.render(d); }
  };
  KINDS.lab = {
    envs: ['lab'], studio: 'chem', label: ['أدوات المختبر', 'Lab apparatus'],
    scripts: ['js/chem/lab-render.js' + V],
    parse: function (b) { return { v: 1, code: '\\begin{lab}' + (b.opts ? '[' + b.opts + ']' : '') + b.body + '\\end{lab}' }; },
    serialize: function (d) { return d.code; },
    render: function (d) { return LabRender.render(d); }
  };
  function findMolecule(name) {
    var norm = function (x) { return String(x).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/\([^)]*\)/g, '').replace(/^ال/, '').replace(/\s+/g, ' ').trim(); };
    var q = norm(name), best = null;
    (global.MOLECULES || []).forEach(function (c) { c.items.forEach(function (it) {
      if (best) return;
      var names = [it[0], it[1]].concat((it[0].match(/\(([^)]*)\)/) || [, ''])[1] ? [(it[0].match(/\(([^)]*)\)/) || [])[1]] : []);
      if (names.some(function (n) { return norm(n) === q || norm(n).replace(/^ال/, '') === q.replace(/^ال/, ''); })) best = it;
    }); });
    return best;
  }
  var ENV2KIND = {};
  Object.keys(KINDS).forEach(function (k) { (KINDS[k].envs || []).forEach(function (e) { ENV2KIND[e] = k; }); });
  var TABLE_CMDS = ['freqtable', 'statstable', 'ztable', 'binomtable'];

  var loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    var abs = new URL(BASE + src, location.href).href;
    if (Array.prototype.some.call(document.scripts, function (x) { return x.src === abs; })) { loaded[src] = Promise.resolve(); return loaded[src]; }
    loaded[src] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = BASE + src; s.onload = res; s.onerror = function () { delete loaded[src]; rej(new Error('تعذّر تحميل ' + src)); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  function loadAll(list) { return list.reduce(function (p, src) { return p.then(function () { return loadScript(src); }); }, Promise.resolve()); }
  function load(kind) {
    var k = KINDS[kind];
    if (!k) return Promise.reject(new Error('نوع غير معروف: ' + kind));
    return loadAll(CORE.concat(k.scripts));
  }
  function loadTables() { return loadAll(CORE.concat(['js/figures/table-markup.js' + V])); }

  // ------------------------------------------------------------ scanning a LaTeX source
  /** find \begin{env}…\end{env} honouring nesting of the same env */
  function findEnd(src, env, from) {
    var re = new RegExp('\\\\(begin|end)\\s*\\{' + env.replace('*', '\\*') + '\\}', 'g'), depth = 1, m;
    re.lastIndex = from;
    while ((m = re.exec(src))) {
      depth += m[1] === 'begin' ? 1 : -1;
      if (depth === 0) return { start: m.index, end: m.index + m[0].length };
    }
    return null;
  }
  function readOpts(src, i) {
    var j = i; while (src[j] === ' ' || src[j] === '\t') j++;
    if (src[j] === '[') { var g = Mk.group(src, j); return { opts: g.content, end: g.end }; }
    return { opts: '', end: i };
  }
  /**
   * returns { text: source with each block replaced by a line "\armathobj{n}", blocks: [{type:'figure'|'table', kind, env, opts, body, code}] }
   */
  function scan(src) {
    src = String(src || '');
    var out = '', blocks = [], i = 0;
    var re = /\\begin\s*\{(graph|geometry|chart|physics|circuit|circuitikz|numberline|venn|tree|vartable|signtable|tikzpicture|tabular\*?|table|center|figure|lab)\}|\\(smiles|molecule|chemfig|freqtable|statstable|ztable|binomtable|element|bohr|lewis|orbital|ptable)\b/g, m;
    while ((m = re.exec(src))) {
      if (m.index < i) continue;
      var env = m[1], start = m.index;
      if (env === 'table' || env === 'center' || env === 'figure') {       // wrappers: keep their content, drop the wrapper
        var we = findEnd(src, env, m.index + m[0].length);
        if (!we) continue;
        var inner = src.slice(m.index + m[0].length, we.start).replace(/^\s*\[[^\]]*\]/, '').replace(/\\(centering|caption\s*\{[^}]*\}|label\s*\{[^}]*\})/g, '');
        var cap = src.slice(m.index, we.end).match(/\\caption\s*\{([^}]*)\}/);
        src = src.slice(0, m.index) + (cap ? '% ' + cap[1] + '\n' : '') + inner + src.slice(we.end);
        re.lastIndex = m.index;
        continue;
      }
      if (env) {
        var e = findEnd(src, env.replace('*', '\\*'), m.index + m[0].length);
        if (!e) continue;
        var head = m.index + m[0].length, o = readOpts(src, head), body, spec = '';
        if (/^tabular/.test(env)) {
          var j = o.end; while (src[j] === ' ') j++;
          if (env === 'tabular*' && src[j] === '{') { j = Mk.group(src, j).end; while (src[j] === ' ') j++; }
          if (src[j] === '{') { var g = Mk.group(src, j); spec = g.content; j = g.end; }
          body = src.slice(j, e.start);
          blocks.push({ type: 'table', kind: 'table', env: 'tabular', opts: o.opts, spec: spec, body: body, code: src.slice(start, e.end) });
        } else {
          body = src.slice(o.end, e.start);
          var kind = env === 'tikzpicture' ? (/\\begin\s*\{axis\}/.test(body) ? 'graph' : /\\tkzTab/.test(body) ? 'vartable' : 'geometry') : ENV2KIND[env];
          blocks.push({ type: 'figure', kind: kind, env: env, opts: o.opts, body: body, code: src.slice(start, e.end) });
        }
        out += src.slice(i, start) + '\n\\armathobj{' + (blocks.length - 1) + '}\n';
        i = e.end;
        re.lastIndex = e.end;
        continue;
      }
      // single commands: \smiles[..]{..}  \freqtable[..]{..}
      var cmd = m[2], p = m.index + m[0].length, oo = readOpts(src, p), k2 = oo.end;
      while (src[k2] === ' ') k2++;
      if (src[k2] !== '{' && (cmd === 'ztable' || cmd === 'binomtable' || cmd === 'ptable')) {          // no argument needed
        if (cmd === 'ptable') blocks.push({ type: 'figure', kind: 'atom', env: 'ptable', opts: oo.opts, body: '', code: src.slice(start, oo.end) });
        else blocks.push({ type: 'table', kind: cmd, env: cmd, opts: oo.opts, body: '', code: src.slice(start, oo.end) });
        out += src.slice(i, start) + '\n\\armathobj{' + (blocks.length - 1) + '}\n';
        i = oo.end; re.lastIndex = oo.end; continue;
      }
      if (src[k2] !== '{') continue;
      var gg = Mk.group(src, k2);
      if (cmd === 'smiles' || cmd === 'molecule') blocks.push({ type: 'figure', kind: 'structure', env: cmd, opts: oo.opts, body: gg.content, code: src.slice(start, gg.end) });
      else if (cmd === 'chemfig') blocks.push({ type: 'figure', kind: 'chemfig', env: 'chemfig', opts: oo.opts, body: gg.content, code: src.slice(start, gg.end) });
      else if (/^(element|bohr|lewis|orbital|ptable)$/.test(cmd)) blocks.push({ type: 'figure', kind: 'atom', env: cmd, opts: oo.opts, body: gg.content, code: src.slice(start, gg.end) });
      else blocks.push({ type: 'table', kind: cmd, env: cmd, opts: oo.opts, body: gg.content, code: src.slice(start, gg.end) });
      out += src.slice(i, start) + '\n\\armathobj{' + (blocks.length - 1) + '}\n';
      i = gg.end;
      re.lastIndex = gg.end;
    }
    out += src.slice(i);
    return { text: out.replace(/\n{3,}(\\armathobj)/g, '\n\n$1'), blocks: blocks };
  }
  function hasBlocks(src) { return /\\begin\s*\{(graph|geometry|chart|physics|circuit|circuitikz|numberline|venn|tree|vartable|signtable|tikzpicture|tabular|lab)|\\(smiles|molecule|chemfig|freqtable|statstable|ztable|binomtable|element|bohr|lewis|orbital|ptable)\b/.test(String(src || '')); }

  /** parse one block into a model: {type:'figure', kind, data} | {type:'table', table} */
  function prepare(b) {
    if (b.type === 'table') {
      if (b.kind === 'ztable' || b.kind === 'binomtable') {
        return loadAll(CORE.concat(['js/math/prob.js' + V])).then(function () {
          var o = Mk.options(b.opts || '');
          return { type: 'table', table: b.kind === 'ztable' ? Prob.ztable(o) : Prob.binomTable(o) };
        });
      }
      if (b.kind === 'freqtable' || b.kind === 'statstable') {
        return loadAll(CORE.concat(['js/figures/table-markup.js' + V, 'js/math/stats.js' + V])).then(function () {
          return { type: 'table', table: b.kind === 'freqtable' ? StatsEngine.freqTable(b.opts, b.body) : StatsEngine.summaryTable(b.opts, b.body) };
        });
      }
      return loadTables().then(function () { return { type: 'table', table: TableMarkup.parse(b.spec, b.body, b.opts) }; });
    }
    return load(b.kind).then(function () {
      var data = KINDS[b.kind].parse(b);
      return { type: 'figure', kind: b.kind, data: data };
    });
  }
  function render(kind, data) {
    return load(kind).then(function () { return KINDS[kind].render(JSON.parse(JSON.stringify(data))); });
  }
  function serialize(kind, data) {
    return load(kind).then(function () { return KINDS[kind].serialize(data); });
  }
  function label(kind, lang) { var k = KINDS[kind]; return k ? k.label[lang === 'en' ? 1 : 0] : kind; }

  global.Figures = { KINDS: KINDS, BASE: BASE, load: load, loadAll: loadAll, scan: scan, hasBlocks: hasBlocks, prepare: prepare, render: render, serialize: serialize, label: label };
})(window);
