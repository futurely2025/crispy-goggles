/*
 * exam-tpl.js — structured editor for the exam template (.docx).
 *
 *   const info   = await TemplateEditor.list(JSZip, bytes);          // paragraphs with text + formatting
 *   const bytes2 = await TemplateEditor.apply(JSZip, bytes, edits);  // edits = { id: {text,sz,bold,font,before,after,line,del,dup} }
 *
 * Text edits are applied as a minimal change inside the existing runs, so the formatting
 * (Fanan / KufiLT, sizes, colours) of the untouched text is never disturbed.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./exam-core.js'));
  else root.TemplateEditor = factory(root.ExamCore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';
  var P_RE = /<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g;
  var AFTER_SZ = ['szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'];
  var AFTER_SZCS = AFTER_SZ.slice(1);
  var AFTER_B = ['bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof',
    'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz'].concat(AFTER_SZ);
  var AFTER_BCS = AFTER_B.slice(1);
  var PPR_AFTER_SPACING = ['ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment',
    'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'];

  function parts(zip) {
    var names = ['word/document.xml'];
    zip.file(/^word\/(?:header|footer)\d*\.xml$/).forEach(function (f) { names.push(f.name); });
    return names.filter(function (n) { return zip.file(n); });
  }

  // insert `add` into `xml` before the first of the named elements (or at the end)
  function insertBefore(xml, names, add) {
    var best = -1;
    names.forEach(function (n) {
      var m = new RegExp('<w:' + n + '(?=[ />])').exec(xml);
      if (m && (best < 0 || m.index < best)) best = m.index;
    });
    if (best < 0) best = xml.length;
    return xml.slice(0, best) + add + xml.slice(best);
  }

  function segments(p) {
    var out = [], re = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g, m, pos = 0;
    while ((m = re.exec(p))) {
      var tab = m[0] === '<w:tab/>', br = m[0] === '<w:br/>';
      var text = tab ? '\t' : br ? '\n' : Core._decode(m[1] || '');
      out.push({ s: m.index, e: re.lastIndex, kind: tab || br ? 'x' : 't', text: text, cs: pos, ce: pos + text.length });
      pos += text.length;
    }
    return out;
  }
  function textOf(p) { return segments(p).map(function (s) { return s.text; }).join(''); }
  function attr(tag, name) { var m = new RegExp(' ' + name + '="([^"]*)"').exec(tag || ''); return m ? m[1] : null; }

  function pPrOf(p) { var m = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(p); return m ? m[0] : ''; }

  function props(p) {
    var runsOnly = p.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, '');
    var sz = /<w:sz w:val="(\d+)"/.exec(runsOnly) || /<w:sz w:val="(\d+)"/.exec(p);
    var sp = /<w:spacing [^>]*\/>/.exec(pPrOf(p));
    var fonts = {}, fm, fre = /<w:rFonts [^>]*\/>/g;
    while ((fm = fre.exec(p))) ['w:ascii', 'w:hAnsi', 'w:cs'].forEach(function (a) { var v = attr(fm[0], a); if (v) fonts[v] = 1; });
    return {
      sz: sz ? +sz[1] / 2 : null,
      bold: /<w:b(?: w:val="(?:1|true|on)")?\/>/.test(runsOnly),
      before: sp && attr(sp[0], 'w:before') != null ? +attr(sp[0], 'w:before') / 20 : null,
      after: sp && attr(sp[0], 'w:after') != null ? +attr(sp[0], 'w:after') / 20 : null,
      line: sp && attr(sp[0], 'w:line') != null && (attr(sp[0], 'w:lineRule') || 'auto') === 'auto' ? +attr(sp[0], 'w:line') / 240 : null,
      fonts: Object.keys(fonts)
    };
  }

  function insideTable(before) {
    var open = Math.max(before.lastIndexOf('<w:tc>'), before.lastIndexOf('<w:tc '));
    return open >= 0 && open > before.lastIndexOf('</w:tc>');
  }

  /** Lists every paragraph of the template that the editor can touch. */
  async function list(JSZip, bytes) {
    var zip = await JSZip.loadAsync(bytes), items = [], fonts = {}, tokens = {};
    var names = parts(zip);
    for (var i = 0; i < names.length; i++) {
      var xml = Core._normalizeTokens(await zip.file(names[i]).async('string'));
      var idx = 0, m, re = new RegExp(P_RE.source, 'g');
      while ((m = re.exec(xml))) {
        var p = m[0], text = textOf(p), pr = props(p);
        var tk = text.match(/\{\{[A-Z_]+\}\}/g) || [];
        tk.forEach(function (t) { tokens[t] = 1; });
        pr.fonts.forEach(function (f) { fonts[f] = 1; });
        items.push({
          id: names[i] + '#' + idx, part: names[i], idx: idx, text: text, empty: !text.trim(),
          locked: /<w:fldChar|<w:fldSimple|<w:drawing|<w:pict|<mc:AlternateContent/.test(p),
          inTable: insideTable(xml.slice(0, m.index)), isBody: text.indexOf('{{BODY}}') >= 0, tokens: tk,
          sz: pr.sz, bold: pr.bold, before: pr.before, after: pr.after, line: pr.line, fonts: pr.fonts
        });
        idx++;
      }
    }
    return { paragraphs: items, fonts: Object.keys(fonts), tokens: Object.keys(tokens) };
  }

  // --------------------------------------------------------------- text edit
  function editText(p, newText) {
    var segs = segments(p), old = segs.map(function (s) { return s.text; }).join('');
    newText = String(newText).replace(/[\r\n]+/g, ' ');
    if (newText === old) return p;
    var a = 0, max = Math.min(old.length, newText.length);
    while (a < max && old.charAt(a) === newText.charAt(a)) a++;
    var b = 0;
    while (b < max - a && old.charAt(old.length - 1 - b) === newText.charAt(newText.length - 1 - b)) b++;
    var delStart = a, delEnd = old.length - b, mid = newText.slice(a, newText.length - b).replace(/\t+/g, ' ');
    var ins = null;
    for (var i = 0; i < segs.length; i++) if (segs[i].kind === 't' && segs[i].cs <= delStart && delStart <= segs[i].ce) { ins = segs[i]; break; }
    var out = p;
    if (!ins) {                                              // paragraph without text runs: add one
      var mark = /<w:pPr>[\s\S]*?<w:rPr>([\s\S]*?)<\/w:rPr>[\s\S]*?<\/w:pPr>/.exec(p);
      var run = '<w:r>' + (mark ? '<w:rPr>' + mark[1] + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + Core._esc(mid) + '</w:t></w:r>';
      var at = p.lastIndexOf('</w:p>');
      return p.slice(0, at) + run + p.slice(at);
    }
    for (var k = segs.length - 1; k >= 0; k--) {
      var s = segs[k], rep = null;
      if (s.kind === 't') {
        var ls = Math.max(0, Math.min(s.text.length, delStart - s.cs)), le = Math.max(0, Math.min(s.text.length, delEnd - s.cs));
        var nt = s.text.slice(0, ls) + (s === ins ? mid : '') + s.text.slice(le);
        if (nt !== s.text) rep = '<w:t xml:space="preserve">' + Core._esc(nt) + '</w:t>';
      } else if (s.cs >= delStart && s.ce <= delEnd) rep = '';
      if (rep !== null) out = out.slice(0, s.s) + rep + out.slice(s.e);
    }
    return out;
  }

  // ------------------------------------------------------------ formatting
  function eachRun(p, fn) {
    return p.replace(/<w:r(?: [^>]*)?>[\s\S]*?<\/w:r>/g, function (r) {
      return (r.indexOf('<w:t') < 0 && r.indexOf('<w:tab') < 0) ? r : fn(r);
    });
  }
  function setRunProp(r, name, val, after) {      // val: element xml, or '' to remove
    if (!/<w:rPr>/.test(r)) { if (!val) return r; r = r.replace(/^(<w:r(?: [^>]*)?>)/, '$1<w:rPr></w:rPr>'); }
    var re = new RegExp('<w:' + name + '(?: [^>]*)?/>');
    if (re.test(r)) return r.replace(re, val);
    if (!val) return r;
    return r.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/, function (m, inner) { return '<w:rPr>' + insertBefore(inner, after, val) + '</w:rPr>'; });
  }
  function setSize(p, pt) {
    var h = Math.round(pt * 2);
    return eachRun(p, function (r) {
      r = setRunProp(r, 'sz', '<w:sz w:val="' + h + '"/>', AFTER_SZ);
      return setRunProp(r, 'szCs', '<w:szCs w:val="' + h + '"/>', AFTER_SZCS);
    });
  }
  function setBold(p, on) {
    return eachRun(p, function (r) {
      r = setRunProp(r, 'b', on ? '<w:b/>' : '', AFTER_B);
      return setRunProp(r, 'bCs', on ? '<w:bCs/>' : '', AFTER_BCS);
    });
  }
  function setFont(p, name) {
    var n = Core._esc(name);
    return p.replace(/<w:rFonts [^>]*\/>/g, function (t) {
      return t.replace(/ w:(ascii|hAnsi|cs|eastAsia)="[^"]*"/g, function (m, a) { return ' w:' + a + '="' + n + '"'; });
    });
  }
  function setSpacing(p, o) {
    if (p.indexOf('<w:pPr>') < 0) p = p.replace(/^(<w:p(?: [^>]*)?>)/, '$1<w:pPr></w:pPr>');
    return p.replace(/<w:pPr>([\s\S]*?)<\/w:pPr>/, function (m, inner) {
      var sp = /<w:spacing [^>]*\/>/.exec(inner), at = sp ? sp[0] : '<w:spacing/>';
      function set(name, v) {
        at = at.replace(new RegExp(' w:' + name + '="[^"]*"'), '');
        at = at.replace(/^<w:spacing/, '<w:spacing w:' + name + '="' + v + '"');
      }
      if (o.before != null) { set('before', Math.round(o.before * 20)); at = at.replace(/ w:beforeAutospacing="[^"]*"| w:beforeLines="[^"]*"/g, ''); }
      if (o.after != null) { set('after', Math.round(o.after * 20)); at = at.replace(/ w:afterAutospacing="[^"]*"| w:afterLines="[^"]*"/g, ''); }
      if (o.line != null) { set('line', Math.round(o.line * 240)); if (!/w:lineRule=/.test(at)) at = at.replace(/^<w:spacing/, '<w:spacing w:lineRule="auto"'); }
      inner = sp ? inner.replace(sp[0], function () { return at; }) : insertBefore(inner, PPR_AFTER_SPACING, at);
      return '<w:pPr>' + inner + '</w:pPr>';
    });
  }
  function blankCopy(p) {                             // same paragraph properties, no text
    var ppr = pPrOf(p);
    return '<w:p>' + ppr.replace(/<w:sectPr[\s\S]*?<\/w:sectPr>/, '') + '</w:p>';
  }

  /** Applies edits (see header). Returns the new .docx bytes. */
  async function apply(JSZip, bytes, edits) {
    var zip = await JSZip.loadAsync(bytes), names = parts(zip);
    for (var i = 0; i < names.length; i++) {
      var xml = Core._normalizeTokens(await zip.file(names[i]).async('string'));
      var idx = 0, changed = false, name = names[i];
      xml = xml.replace(new RegExp(P_RE.source, 'g'), function (p) {
        var e = edits[name + '#' + (idx++)];
        if (!e) return p;
        changed = true;
        if (e.del) return '';
        if (e.text != null) p = editText(p, e.text);
        if (e.font) p = setFont(p, e.font);
        if (e.sz != null) p = setSize(p, e.sz);
        if (e.bold != null) p = setBold(p, !!e.bold);
        if (e.before != null || e.after != null || e.line != null) p = setSpacing(p, e);
        return e.dup ? p + blankCopy(p) : p;
      });
      if (changed) zip.file(name, xml);
    }
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  // ------------------------------------------- "edit in Word" draft marker
  // The template is opened in a real Word window; a custom document property tells the task pane
  // (opened in that window) which library template the document belongs to.
  var CT = 'application/vnd.openxmlformats-officedocument.custom-properties+xml';
  var REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties';
  var NS = 'xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"';
  var FMT = '{D5CDD505-2E9C-101B-9397-08002B2CF9AE}';

  async function setDraft(JSZip, bytes, id, name) {
    var zip = await JSZip.loadAsync(bytes);
    var prop = function (pid, n, v) { return '<property fmtid="' + FMT + '" pid="' + pid + '" name="' + n + '"><vt:lpwstr>' + Core._esc(v) + '</vt:lpwstr></property>'; };
    zip.file('docProps/custom.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties ' + NS + '>' +
      prop(2, 'ExamTemplateId', id) + prop(3, 'ExamTemplateName', name) + '</Properties>');
    var ct = await zip.file('[Content_Types].xml').async('string');
    if (ct.indexOf('/docProps/custom.xml') < 0) zip.file('[Content_Types].xml', ct.replace('</Types>', '<Override PartName="/docProps/custom.xml" ContentType="' + CT + '"/></Types>'));
    var rels = await zip.file('_rels/.rels').async('string');
    if (rels.indexOf(REL) < 0) zip.file('_rels/.rels', rels.replace('</Relationships>', '<Relationship Id="rIdExamCustom" Type="' + REL + '" Target="docProps/custom.xml"/></Relationships>'));
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  /** Removes the draft marker (so exams built from the template never carry it). */
  async function clearDraft(JSZip, bytes) {
    var zip = await JSZip.loadAsync(bytes), f = zip.file('docProps/custom.xml');
    if (!f) return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var x = await f.async('string');
    x = x.replace(/<property [^>]*name="ExamTemplate(?:Id|Name)"[^>]*>[\s\S]*?<\/property>/g, '');
    if (/<property /.test(x)) zip.file('docProps/custom.xml', x);
    else {
      zip.remove('docProps/custom.xml');
      var ct = await zip.file('[Content_Types].xml').async('string');
      zip.file('[Content_Types].xml', ct.replace(/<Override PartName="\/docProps\/custom\.xml"[^>]*\/>/, ''));
      var rels = await zip.file('_rels/.rels').async('string');
      zip.file('_rels/.rels', rels.replace(/<Relationship [^>]*custom-properties[^>]*\/>/, ''));
    }
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  async function readDraft(JSZip, bytes) {
    var zip = await JSZip.loadAsync(bytes), f = zip.file('docProps/custom.xml');
    if (!f) return null;
    var x = await f.async('string'), g = function (n) {
      var m = new RegExp('name="' + n + '"[^>]*><vt:lpwstr>([^<]*)</vt:lpwstr>').exec(x); return m ? Core._decode(m[1]) : null; };
    var id = g('ExamTemplateId');
    return id ? { id: id, name: g('ExamTemplateName') || '' } : null;
  }

  return { list: list, apply: apply, setDraft: setDraft, clearDraft: clearDraft, readDraft: readDraft };
});
