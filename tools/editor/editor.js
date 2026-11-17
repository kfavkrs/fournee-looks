/* Look editor: labeled controls for type/recipe.json, a live preview of the sample page, and Fournée's checks.
   Changes apply to the preview at once (the preview's generated stylesheets are swapped for live ones);
   Save writes the recipe, rebuilds src/theme/ and reloads the preview from the real files. */
(function () {
  'use strict';
  var FT = window.FrostingTokens, FC = window.FrostingColor, TT = window.FontdantTokens, LIB = window.FontdantLibrary,
      FF = window.FontdantFonts, CHK = window.FontdantCheck, EMIT = window.FontdantEmit, PASS = window.KitchenPass, KR = window.KitchenRecipe;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var SLOTS = ['display', 'text', 'mono'];
  var SLOT_LABEL = { display: 'Display font', text: 'Text font', mono: 'Mono font' };
  var FONT_BASE = '/fournee/fontdant/fonts';

  var STYLE_LABEL = {
    display: 'Display (hero line)', heading: 'Heading, base', 'heading-xl': 'Heading extra large', 'heading-lg': 'Heading large',
    'heading-md': 'Heading medium', 'heading-sm': 'Heading small', body: 'Body', 'body-sm': 'Small body', ui: 'Labels',
    'ui-sm': 'Small labels', 'ui-button': 'Button text', 'ui-nav': 'Navigation links', 'ui-input': 'Text in input boxes',
    caption: 'Caption', eyebrow: 'Eyebrow', 'eyebrow-upper': 'Eyebrow, capitals', 'eyebrow-lower': 'Eyebrow, lowercase',
    mono: 'Code', 'mono-block': 'Code block', 'mono-inline': 'Code in a sentence', metric: 'Big number'
  };
  var BASE_NOTE = { heading: 'heading sizes', body: 'Small body', ui: 'the label, button, nav and input styles', eyebrow: 'the eyebrow variants', mono: 'the code styles' };
  var STYLE_NOTE = { eyebrow: 'Its plum colour comes from the sample page (Accent text), not from this style.' };
  var WEIGHT_NAME = { 100: 'Thin', 200: 'Extra light', 250: 'Extra light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' };
  // Fournée's checks in plain words
  var PLAIN = {
    T1: 'Sizes need relative units (rem or em).', T2: 'Line spacing must be a plain number and letter spacing in em.',
    T3: 'Body line spacing is outside the readable range.', T4: 'Line length is outside the readable range.',
    T5: 'Text is below its minimum size.', T6: 'Sizes are out of order: a smaller style is bigger than a larger one.',
    T7: 'A thin weight at a small size is hard to read.', T8: 'ALL CAPS text needs letter spacing of 0.05em or more.',
    T9: 'Tight (negative) letter spacing on small text.', T10: 'Line spacing is outside the usual range for this style.',
    T11: 'The fonts don’t line up in size when swapped.', T12: 'The code font doesn’t match the text font’s size.',
    T13: 'Rendered size check.', T14: 'That weight doesn’t exist in this font.', T15: 'Typing text is below its minimum size.',
    T16: 'Paragraph spacing.', T17: 'Long reading text shouldn’t be italic or all caps.',
    X2: 'Small text doesn’t have enough contrast.', X3: 'Thin small text needs more contrast (7:1).',
    X4: 'Quiet text at a small size doesn’t have enough contrast.', X5: 'Accent text used as reading text needs 7:1.',
    X6: 'Button text should be weight 500 or more, 14px or more, with enough contrast.', X7: 'Thin text on a dark background.',
    X8: 'Disabled and placeholder text need 3:1.'
  };

  var spacing = {}, savedSpacing = {}, spacingFields = [], spacingRows = {};
  var SLUG = (location.pathname.match(/^\/look\/([^/]+)\//) || [])[1];
  var API = '/api/look/' + SLUG;
  var saved = null, recipe = null, hasPrev = false, accepted = new Set(), issues = [], R = null, R0 = null;
  var frame = $('#frame');

  // ── helpers ───────────────────────────────────────────────────────────────
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function sig(r) { var fd = Object.assign({}, r.fontdant); delete fd.fonts; return JSON.stringify([r.frosting.colors, fd]); }
  function spacingDirty() { return JSON.stringify(spacing) !== JSON.stringify(savedSpacing); }
  function dirty() { return saved && (sig(recipe) !== sig(saved) || spacingDirty()); }
  function fd() { return recipe.fontdant; }
  function roles() { return fd().roles || (fd().roles = {}); }
  function over(name) { return roles()[name] || (roles()[name] = {}); }
  function entry(id) { FF.use(fd().fonts || {}); return FF.entryOf(id); }
  function fontName(id) { var e = entry(id); return e ? e.family : id; }
  function isOwn(id) { return !!(fd().fonts && fd().fonts[id]); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function px(n) { return r2(n) + 'px'; }
  function colourLabel(n) { var r = FT.roles.filter(function (x) { return x.name === n; })[0]; return r ? r.label : n; }
  function classOf(s) {
    return s.kind === 'variant' ? 'fd-' + s.role + '--' + s.name.slice(s.role.length + 1) : 'fd-' + s.name;
  }
  function message(html, kind) {
    var m = $('#message');
    if (!html) { m.hidden = true; m.innerHTML = ''; return; }
    m.hidden = false; m.innerHTML = ''; m.appendChild(typeof html === 'string' ? document.createTextNode(html) : html);
  }

  function resolveAll() {
    FF.use(fd().fonts || {});
    R = CHK.resolve(fd());
    var bare = Object.assign({}, fd(), { roles: {} });
    R0 = CHK.resolve(bare);
  }
  function styleOf(name, from) { return (from || R).styles.filter(function (s) { return s.name === name; })[0]; }

  function weightsOf(id, current) {
    var e = entry(id), out = [];
    if (!e) return [current];
    if (e.weights.kind === 'variable') { for (var w = Math.ceil(e.weights.min / 100) * 100; w <= e.weights.max; w += 100) out.push(w); }
    else out = e.weights.available.slice();
    if (out.indexOf(current) < 0) out.push(current);
    return out.filter(function (v, i) { return out.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
  }

  // ── preview ───────────────────────────────────────────────────────────────
  var facesKey = null;
  function applyPreview() {
    var doc = frame.contentDocument; if (!doc || !doc.head) return;
    var links = Array.prototype.slice.call(doc.querySelectorAll('link[rel=stylesheet]')).filter(function (l) {
      return /(mise-type|mise-color)\.css/.test(l.getAttribute('href'));
    });
    var faces = doc.getElementById('ed-faces'), vars = doc.getElementById('ed-vars'), space = doc.getElementById('ed-space');
    if (!dirty()) {   // saved: show the real built files
      links.forEach(function (l) { l.disabled = false; });
      if (faces) faces.remove(); if (vars) vars.remove(); if (space) space.remove(); facesKey = null; return;
    }
    if (!space) { space = doc.createElement('style'); space.id = 'ed-space'; doc.head.appendChild(space); }
    space.textContent = ':root {\n' + spacingFields.map(function (f) { return '  --sp-' + f.key + ': ' + spacing[f.key] + 'rem;'; }).join('\n') + '\n}\n';
    if (!faces) { faces = doc.createElement('style'); faces.id = 'ed-faces'; doc.head.appendChild(faces); }
    if (!vars) { vars = doc.createElement('style'); vars.id = 'ed-vars'; doc.head.appendChild(vars); }
    var look = KR.clean(recipe).fontdant;
    // Fontdant's own emitter, exactly what the build writes to mise-type.css: the @font-face rules, then :root
    var opts = { baseUrl: FONT_BASE, display: 'swap' };
    var text = EMIT.css(look, opts), faceText = FF.faceCss(look, opts).css;
    var out = { text: text, fonts: { css: faceText } };
    var key = JSON.stringify(fd().faces);
    if (key !== facesKey) { faces.textContent = faceText; facesKey = key; }
    var colours = recipe.frosting.colors;
    vars.textContent = out.text.slice(out.fonts.css.length) +
      '\n:root:root:root {\n' +
      Object.keys(colours).map(function (k) { return '  --fr-' + k + ': ' + colours[k] + ';'; }).join('\n') + '\n  color-scheme: light;\n}\n';
    links.forEach(function (l) { l.disabled = true; });
  }
  frame.addEventListener('load', function () { facesKey = null; applyPreview(); });

  // ── checks ────────────────────────────────────────────────────────────────
  var checkTimer = null;
  function scheduleCheck() { clearTimeout(checkTimer); checkTimer = setTimeout(runCheck, 150); }
  function humanize(seg) {
    return seg
      .replace(/\b([a-z][a-z0-9-]*) on ([a-z][a-z0-9-]*)\b/g, function (m, a, b) { return FT.roles.some(function (r) { return r.name === a; }) ? colourLabel(a) + ' on ' + colourLabel(b) : m; })
      .replace(/\(min ([\d.]+)\)/, '(needs $1:1)').replace(/ < ([\d.]+)$/, ', needs $1:1')
      .replace(/\bleading\b/g, 'line spacing').replace(/\btracking\b/g, 'letter spacing')
      .replace(/^([a-z][a-z0-9-]*)/, function (m) { return STYLE_LABEL[m] || m; });
  }
  function runCheck() {
    resolveAll();
    var res = PASS.run(KR.clean(recipe, { colors: FT.light, scheme: 'Light' }));
    var styleNames = {}; R.styles.forEach(function (s) { styleNames[s.name] = 1; });
    var colourNames = {}; FT.roles.forEach(function (r) { colourNames[r.name] = 1; });
    issues = [];
    res.results.filter(function (r) { return !r.ok && !r.pending && (r.level === 'hard' || r.level === 'warn'); }).forEach(function (r) {
      var segs = String(r.detail || '').split('; ').filter(Boolean); if (!segs.length) segs = [''];
      segs.forEach(function (seg) {
        var targets = [], w0 = seg.split(' ')[0];
        if ((r.id === 'T11' || r.id === 'T12') && SLOTS.indexOf(w0) >= 0) targets.push({ kind: 'font', name: w0 });
        else {
          if (styleNames[w0]) targets.push({ kind: 'style', name: w0 });
          var m = /\b([a-z][a-z0-9-]*) on ([a-z][a-z0-9-]*)\b/.exec(seg);
          if (m && colourNames[m[1]]) targets.push({ kind: 'colour', name: m[1] });
        }
        if (!targets.length && r.where) {
          if (r.where.style && styleNames[r.where.style]) targets.push({ kind: 'style', name: r.where.style });
          if (r.where.role && colourNames[r.where.role]) targets.push({ kind: 'colour', name: r.where.role });
        }
        if (!targets.length) targets.push({ kind: 'general', name: 'general' });
        var key = r.id + ':' + targets[0].name, uid = r.id + '|' + seg;   // one key per finding, shown beside each control it involves
        targets.forEach(function (t, n) {
          issues.push({ key: key, uid: uid, primary: n === 0, id: r.id, level: r.level, target: t, plain: PLAIN[r.id] || (r.source === 'frosting' && /:1/.test(seg) ? 'Not enough contrast.' : r.label + '.'), detail: humanize(seg),
            accepted: r.level === 'warn' && accepted.has(key) });
        });
      });
    });
    renderIssues();
  }
  function issueLine(i, withLink) {
    var cls = 'issue fd-body-sm issue--' + (i.accepted ? 'accepted' : i.level);
    var words = el('span', {}, [i.plain + (i.detail ? ' ' : ''), i.detail ? el('span', { class: 'muted', text: i.detail }) : null,
      i.accepted ? el('span', { class: 'muted', text: ' (accepted)' }) : null]);
    if (withLink && i.target.kind !== 'general') {
      var where = i.target.kind === 'style' ? (STYLE_LABEL[i.target.name] || i.target.name) : i.target.kind === 'colour' ? colourLabel(i.target.name) : SLOT_LABEL[i.target.name];
      words.insertBefore(el('a', { href: '#' + i.target.kind + '-' + i.target.name, text: where, onclick: function (e) { e.preventDefault(); reveal(i.target); } }), words.firstChild);
      words.insertBefore(document.createTextNode(': '), words.childNodes[1]);
    }
    var btn = i.level === 'warn' ? el('button', { class: 'btn btn--ghost btn--small fd-ui-sm', type: 'button', text: i.accepted ? 'Undo' : 'Accept',
      title: i.accepted ? 'Show this warning again' : 'I know, keep it this way', onclick: function () { toggleAccept(i.key); } }) : el('span');
    return el('div', { class: cls, role: 'listitem' }, [words, btn]);
  }
  function renderIssues() {
    var list = $('#problem-list'); list.innerHTML = '';
    var top = issues.filter(function (i) { return i.primary; });
    var hard = top.filter(function (i) { return i.level === 'hard'; }), warn = top.filter(function (i) { return i.level === 'warn' && !i.accepted; }),
        acc = top.filter(function (i) { return i.accepted; });
    if (!hard.length && !warn.length) list.appendChild(el('p', { class: 'fd-body-sm allclear', text: 'No problems. ' + (acc.length ? acc.length + ' accepted warning' + (acc.length > 1 ? 's' : '') + ' below.' : '') }));
    if (hard.length) { list.appendChild(el('p', { class: 'fd-ui-sm pill pill--hard', text: hard.length + ' problem' + (hard.length > 1 ? 's' : '') + ' (must fix before this look is accessible)' })); list.appendChild(el('div', { class: 'issues', role: 'list' }, hard.map(function (i) { return issueLine(i, true); }))); }
    if (warn.length) { list.appendChild(el('p', { class: 'fd-ui-sm pill pill--warn', text: warn.length + ' warning' + (warn.length > 1 ? 's' : '') + ' (worth a look; accept if it’s on purpose)' })); list.appendChild(el('div', { class: 'issues', role: 'list' }, warn.map(function (i) { return issueLine(i, true); }))); }
    if (acc.length) list.appendChild(el('details', { class: 'accepted-list' }, [el('summary', { class: 'fd-ui-sm', text: 'Accepted warnings (' + acc.length + ')' }),
      el('div', { class: 'issues', role: 'list' }, acc.map(function (i) { return issueLine(i, true); }))]));
    var t = $('#tally'); t.innerHTML = '';
    if (hard.length) t.appendChild(el('span', { class: 'pill pill--hard', text: hard.length + ' problem' + (hard.length > 1 ? 's' : '') }));
    if (warn.length) t.appendChild(el('span', { class: 'pill pill--warn', text: ' ' + warn.length + ' warning' + (warn.length > 1 ? 's' : '') }));
    if (!hard.length && !warn.length) t.appendChild(el('span', { class: 'allclear', text: 'Checks pass' }));
    // beside each control
    document.querySelectorAll('[data-issues]').forEach(function (box) {
      var k = box.getAttribute('data-issues').split(':'), mine = issues.filter(function (i) { return i.target.kind === k[0] && i.target.name === k[1]; });
      box.innerHTML = ''; mine.forEach(function (i) { box.appendChild(issueLine(i, false)); });
    });
    document.querySelectorAll('[data-pills]').forEach(function (box) {
      var n = box.getAttribute('data-pills'), mine = issues.filter(function (i) { return i.target.kind === 'style' && i.target.name === n && !i.accepted; });
      var h = mine.filter(function (i) { return i.level === 'hard'; }).length, w = mine.length - h;
      box.innerHTML = '';
      if (h) box.appendChild(el('span', { class: 'pill pill--hard fd-caption', text: h + ' problem' + (h > 1 ? 's' : '') }));
      if (w) box.appendChild(el('span', { class: 'pill pill--warn fd-caption', text: ' ' + w + ' warning' + (w > 1 ? 's' : '') }));
    });
  }
  function reveal(t) {
    var target = document.getElementById(t.kind + '-' + t.name); if (!target) return;
    var sec = target.closest('details.section'); if (sec) sec.open = true;
    if (target.tagName === 'DETAILS') target.open = true;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var f = target.querySelector('select, input'); if (f) f.focus({ preventScroll: true });
  }
  function toggleAccept(key) {
    if (accepted.has(key)) accepted.delete(key); else accepted.add(key);
    issues.forEach(function (i) { if (i.key === key) i.accepted = i.level === 'warn' && accepted.has(key); });
    renderIssues();
    fetch(API + '/accepted', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Array.from(accepted)) });
  }

  // ── fonts ─────────────────────────────────────────────────────────────────
  function renderFonts() {
    var box = $('#fonts'); box.innerHTML = '';
    SLOTS.forEach(function (slot) {
      var sel = el('select', { id: 'font-' + slot + '-select', class: 'fd-ui-input', onchange: function () { fd().faces[slot] = sel.value; changed(); } });
      var own = Object.keys(fd().fonts || {}).filter(function (id) { var e = fd().fonts[id]; return !e.slots || e.slots.indexOf(slot) >= 0; });
      var lib = Object.keys(LIB.fonts).filter(function (id) { return LIB.fonts[id].slots.indexOf(slot) >= 0; })
        .sort(function (a, b) { return LIB.fonts[a].family.localeCompare(LIB.fonts[b].family); });
      if (own.length) sel.appendChild(el('optgroup', { label: 'Your fonts' }, own.map(function (id) { return el('option', { value: id, text: fd().fonts[id].family }); })));
      sel.appendChild(el('optgroup', { label: 'Fournée library' }, lib.map(function (id) { return el('option', { value: id, text: LIB.fonts[id].family + ' (' + LIB.fonts[id].category + ')' }); })));
      sel.value = fd().faces[slot];
      box.appendChild(el('div', { class: 'ctl', id: 'font-' + slot }, [el('label', { class: 'fd-ui-sm', for: sel.id, text: SLOT_LABEL[slot] }), sel,
        el('span'), el('span', { class: 'fd-caption muted', 'data-used': slot }), el('span'), el('div', { class: 'issues', 'data-issues': 'font:' + slot })]));
    });
  }
  function refreshFonts() {
    SLOTS.forEach(function (slot) {
      $('#font-' + slot + '-select').value = fd().faces[slot];
      var used = R.styles.filter(function (s) { return s.face === slot; }).map(function (s) { return STYLE_LABEL[s.name] || s.name; });
      $('[data-used=' + slot + ']').textContent = used.length ? 'Used by: ' + used.join(', ') : 'Not used by any style';
    });
  }

  // ── text styles ───────────────────────────────────────────────────────────
  function slider(id, min, max, step, fmt, onInput) {
    var out = el('output', { class: 'fd-ui-sm', for: id });
    var inp = el('input', { type: 'range', id: id, min: min, max: max, step: step });
    inp.addEventListener('input', function () { out.textContent = fmt(+inp.value); onInput(+inp.value); });
    inp.addEventListener('change', function () { refreshStyles(); });
    return { wrap: el('div', { class: 'slider' }, [inp, out]), input: inp, out: out, fmt: fmt };
  }
  var rows = {};
  function renderStyles() {
    var box = $('#styles'); box.innerHTML = ''; rows = {};
    R.styles.forEach(function (s) {
      var n = s.name, id = 'st-' + n, row = {};
      row.face = el('select', { id: id + '-face', onchange: function () { over(n).face = row.face.value; changed(); } },
        SLOTS.map(function (slot) { return el('option', { value: slot }); }));
      row.weight = el('select', { id: id + '-weight', onchange: function () { over(n).weight = +row.weight.value; changed(); } });
      row.size = el('select', { id: id + '-size', onchange: function () {
        if (row.size.value === 'custom') { over(n).size = r2(styleOf(n).sizePx / 16) + 'rem'; } else over(n).size = row.size.value;
        changed();
      } }, TT.stepOrder.map(function (st) { return el('option', { value: st }); }).concat([el('option', { value: 'custom', text: 'Custom size' })]));
      row.custom = slider(id + '-custom', 0.75, 4.5, 0.0625, function (v) { return px(v * 16) + ' (' + v + 'rem)'; }, function (v) { over(n).size = v + 'rem'; changed(true); });
      row.leading = slider(id + '-leading', 1, 2.5, 0.05, function (v) { return v.toFixed(2).replace(/0$/, ''); }, function (v) { over(n).leading = v; changed(true); });
      row.tracking = slider(id + '-tracking', -0.05, 0.25, 0.005, function (v) { return r2(v * 1000) / 1000 + 'em'; }, function (v) { over(n).tracking = v === 0 ? '0' : String(Math.round(v * 1000) / 1000) + 'em'; changed(true); });
      row.caps = el('input', { type: 'checkbox', id: id + '-caps', onchange: function () {
        var d = styleOf(n, R0); over(n).case = row.caps.checked ? 'upper' : (d && d.case !== 'upper' ? d.case : 'none'); changed();
      } });
      row.italic = el('input', { type: 'checkbox', id: id + '-italic', onchange: function () { over(n).italic = row.italic.checked; changed(); } });
      row.customRow = el('div', { class: 'ctl' }, [el('span', { class: 'lbl fd-ui-sm', text: 'Custom size' }), row.custom.wrap]);
      row.reset = el('button', { class: 'reset fd-ui-sm', type: 'button', text: 'Reset this style to Fournée’s default', onclick: function () { delete roles()[n]; changed(); } });
      row.meta = el('span', { class: 'fd-caption muted' });
      row.changedMark = el('span', { class: 'fd-caption changed' });
      var ctl = function (label, forId, input) { return el('div', { class: 'ctl' }, [el('label', { class: 'fd-ui-sm', for: forId, text: label }), input]); };
      var body = el('div', { class: 'body' }, [
        el('div', { class: 'issues', 'data-issues': 'style:' + n }),
        BASE_NOTE[n] ? el('p', { class: 'fd-caption note', text: 'Changes here only change this style on the page. Set ' + BASE_NOTE[n] + ' separately. (Fournée’s check assumes they follow this one; that’s a Fournée bug.)' }) : null,
        STYLE_NOTE[n] ? el('p', { class: 'fd-caption note', text: STYLE_NOTE[n] }) : null,
        ctl('Font', row.face.id, row.face), ctl('Weight', row.weight.id, row.weight), ctl('Size', row.size.id, row.size), row.customRow,
        ctl('Line spacing', row.leading.input.id, row.leading.wrap), ctl('Letter spacing', row.tracking.input.id, row.tracking.wrap),
        el('div', { class: 'ctl' }, [el('span', { class: 'lbl fd-ui-sm', text: 'Options' }), el('div', { class: 'toggles fd-ui-sm' }, [
          el('label', {}, [row.caps, 'ALL CAPS']), el('label', {}, [row.italic, 'Italic'])])]),
        row.reset
      ]);
      var summary = el('summary', {}, [
        el('span', { class: 'fd-ui' }, [el('span', { class: 'chev', 'aria-hidden': 'true', text: '▸' }), STYLE_LABEL[n] || n, el('span', { class: 'muted', text: ' · ' + classOf(s) }), ' ', row.changedMark]),
        el('span', { 'data-pills': n }), row.meta]);
      var det = el('details', { class: 'style', id: 'style-' + n }, [summary, body]);
      rows[n] = row; box.appendChild(det);
    });
  }
  function refreshStyles() {
    R.styles.forEach(function (s) {
      var row = rows[s.name]; if (!row) return;
      SLOTS.forEach(function (slot, i) { row.face.options[i].textContent = SLOT_LABEL[slot] + ' (' + fontName(R.faces[slot]) + ')'; });
      row.face.value = s.face;
      var ws = weightsOf(s.faceId, s.weight);
      row.weight.innerHTML = ''; ws.forEach(function (w) { row.weight.appendChild(el('option', { value: w, text: w + ' ' + (WEIGHT_NAME[w] || '') })); });
      row.weight.value = s.weight;
      TT.stepOrder.forEach(function (st, i) { row.size.options[i].textContent = 'Step ' + st + ' (' + px(R.stepPx[st]) + ')'; });
      row.size.value = s.step || 'custom';
      row.customRow.hidden = !!s.step;
      if (!s.step) { row.custom.input.value = r2(s.sizePx / 16); row.custom.out.textContent = row.custom.fmt(+row.custom.input.value); }
      row.leading.input.value = s.leading; row.leading.out.textContent = row.leading.fmt(s.leading);
      row.tracking.input.value = s.trackingEm || 0; row.tracking.out.textContent = row.tracking.fmt(s.trackingEm || 0);
      row.caps.checked = s.case === 'upper'; row.italic.checked = !!s.italic;
      var hasOver = !!(roles()[s.name] && Object.keys(roles()[s.name]).length);
      row.reset.hidden = !hasOver;
      row.changedMark.textContent = hasOver ? '· yours' : '';
      row.meta.textContent = fontName(s.faceId) + ' ' + s.weight + ' · ' + px(s.sizePx) + ' · line ' + s.leading + (s.trackingEm ? ' · ' + s.tracking : '') + (s.case === 'upper' ? ' · CAPS' : '') + (s.italic ? ' · italic' : '');
    });
  }

  // ── colours ───────────────────────────────────────────────────────────────
  var PAIRS = { bg: [['text', 'Text on it']], surface: [['text', 'Text on it']], button: [['button-text', 'Button text on it']], 'button-text': [['button', 'On button']] };
  var colourRows = {};
  function renderColours() {
    var box = $('#colours'); box.innerHTML = ''; colourRows = {};
    FT.roles.forEach(function (r) {
      var n = r.name, id = 'col-' + n;
      var pick = el('input', { type: 'color', id: id + '-pick', 'aria-label': r.label + ' colour picker' });
      var hex = el('input', { type: 'text', id: id + '-hex', class: 'fd-mono', maxlength: 7, spellcheck: 'false', 'aria-label': r.label + ' hex value' });
      var ratio = el('span', { class: 'fd-caption muted ratio' });
      pick.addEventListener('input', function () { recipe.frosting.colors[n] = pick.value.toUpperCase(); hex.value = recipe.frosting.colors[n]; hex.removeAttribute('aria-invalid'); changed(true); });
      pick.addEventListener('change', function () { refreshColours(); });
      hex.addEventListener('input', function () {
        var v = hex.value.trim(); if (v[0] !== '#') v = '#' + v;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) { hex.removeAttribute('aria-invalid'); recipe.frosting.colors[n] = v.toUpperCase(); pick.value = v; changed(); }
        else hex.setAttribute('aria-invalid', 'true');
      });
      hex.addEventListener('blur', function () { hex.value = recipe.frosting.colors[n]; hex.removeAttribute('aria-invalid'); });
      var row = el('div', { class: 'colour', id: 'colour-' + n }, [pick,
        el('label', { class: 'fd-ui', for: hex.id }, [r.label, el('span', { class: 'muted fd-caption', text: ' · --fr-' + n })]), hex,
        el('span', { class: 'fd-caption muted', text: r.use + (r.group !== 'core' ? ' For shapes, not text.' : '') }), ratio,
        el('div', { class: 'issues', 'data-issues': 'colour:' + n })]);
      colourRows[n] = { pick: pick, hex: hex, ratio: ratio };
      box.appendChild(row);
    });
  }
  function refreshColours() {
    var c = recipe.frosting.colors;
    FT.roles.forEach(function (r) {
      var n = r.name, row = colourRows[n], v = c[n] || FT.light[n];
      row.pick.value = v; if (document.activeElement !== row.hex) row.hex.value = v;
      var pairs = PAIRS[n] || [['bg', 'background'], ['surface', 'surface']];
      row.ratio.textContent = pairs.map(function (p) { return r2(FC.contrast(v, c[p[0]] || FT.light[p[0]])) + ':1 ' + (PAIRS[n] ? p[1].toLowerCase() : 'on ' + p[1]); }).join('\n');
    });
  }

  // ── spacing (page layout, not Fournée) ────────────────────────────────────
  function renderSpacing() {
    var box = $('#spacing'); box.innerHTML = ''; spacingRows = {};
    spacingFields.forEach(function (f) {
      var id = 'sp-' + f.key;
      var sl = slider(id, f.min, f.max, 0.25, function (v) { return px(v * 16) + ' (' + v + 'rem)'; }, function (v) { spacing[f.key] = v; applyPreview(); refreshBar(); });
      sl.input.addEventListener('change', function () { refreshSpacing(); });
      var reset = el('button', { class: 'reset fd-ui-sm', type: 'button', text: 'Back to ' + f.def + 'rem', onclick: function () { spacing[f.key] = f.def; refreshSpacing(); applyPreview(); refreshBar(); } });
      spacingRows[f.key] = { sl: sl, reset: reset, def: f.def };
      box.appendChild(el('div', { class: 'spacing-row', id: 'spacing-' + f.key }, [
        el('div', { class: 'ctl' }, [el('label', { class: 'fd-ui-sm', for: id, text: f.label }), sl.wrap]),
        el('p', { class: 'fd-caption muted', text: f.help }), reset]));
    });
  }
  function refreshSpacing() {
    spacingFields.forEach(function (f) {
      var r = spacingRows[f.key]; if (!r) return;
      r.sl.input.value = spacing[f.key]; r.sl.out.textContent = r.sl.fmt(spacing[f.key]);
      r.reset.hidden = spacing[f.key] === f.def;
    });
  }

  // ── change, save, revert ──────────────────────────────────────────────────
  function changed(live) {
    resolveAll();
    if (!live) { refreshStyles(); refreshFonts(); }
    else { R.styles.forEach(function (s) { var row = rows[s.name]; if (row) row.meta.textContent = fontName(s.faceId) + ' ' + s.weight + ' · ' + px(s.sizePx) + ' · line ' + s.leading + (s.trackingEm ? ' · ' + s.tracking : ''); }); }
    refreshColours();
    applyPreview(); scheduleCheck(); refreshBar();
  }
  function refreshBar() {
    var d = dirty();
    $('#save').disabled = !d; $('#discard').disabled = !d; $('#revert').disabled = !hasPrev;
    $('#state').textContent = d ? 'Unsaved changes (preview only)' : 'Saved';
  }
  function loadState(data) {
    saved = data.recipe; recipe = clone(saved); hasPrev = data.hasPrev;
    $('#look-name').textContent = saved.name || SLUG; document.title = (saved.name || SLUG) + ' · Look editor';
    if (data.spacingFields) spacingFields = data.spacingFields;
    if (data.spacing) savedSpacing = data.spacing;
    spacing = clone(savedSpacing);
    if (!fd().faces) fd().faces = {};
    SLOTS.forEach(function (s) { if (!fd().faces[s]) fd().faces[s] = FF.facesOf(fd())[s]; });
    if (data.accepted) accepted = new Set(data.accepted);
    resolveAll(); renderFonts(); renderStyles(); renderColours(); renderSpacing(); refreshSpacing();
    refreshFonts(); refreshStyles(); refreshColours(); refreshBar(); runCheck();
  }
  function reloadSaved() {
    // the editor wears the saved look: refresh its own stylesheets, then the preview from the rebuilt files
    var v = Date.now();
    document.querySelectorAll('link[href^="src/"]').forEach(function (l) { l.href = l.getAttribute('href').split('?')[0] + '?v=' + v; });
    frame.contentWindow.location.reload();
  }
  function post(path, body, busyText) {
    $('#save').disabled = $('#revert').disabled = $('#discard').disabled = true; $('#state').textContent = busyText;
    return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.recipe) { loadState(data); reloadSaved(); }
      if (!data.ok) {
        var box = el('div', {}, [el('strong', { class: 'fd-ui', text: data.error || 'Something went wrong.' }), data.log ? el('pre', { class: 'fd-mono-block', text: data.log }) : null]);
        message(box); refreshBar(); return false;
      }
      return true;
    }).catch(function (e) { message('Couldn’t reach the editor server. Is it still running? (' + e.message + ')'); refreshBar(); return false; });
  }
  $('#save').addEventListener('click', function () {
    var hard = issues.filter(function (i) { return i.level === 'hard' && i.primary; }).length;
    post(API + '/save', JSON.stringify({ recipe: recipe, spacing: spacing }), 'Saving and rebuilding…').then(function (ok) {
      if (ok) message('Saved and rebuilt (looks/' + SLUG + '/). The previous version is kept: Revert goes back to it.' + (hard ? ' Note: ' + hard + ' problem' + (hard > 1 ? 's are' : ' is') + ' still showing in Checks.' : ''));
    });
  });
  $('#revert').addEventListener('click', function () {
    post(API + '/revert', '{}', 'Going back…').then(function (ok) {
      if (ok) message('Back to the version before your last save, and rebuilt. Press Revert again to undo this.');
    });
  });
  $('#discard').addEventListener('click', function () { recipe = clone(saved); message(''); loadState({ recipe: saved, spacing: savedSpacing, hasPrev: hasPrev }); applyPreview(); });
  window.addEventListener('beforeunload', function (e) { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

  // Show labels: the sample page's "Style:" labels on or off (remembered on this computer)
  var showLabels = $('#show-labels');
  try { showLabels.checked = localStorage.getItem('editor.showLabels') !== '0'; } catch (e) {}
  function labelsSrc() { return 'index.html' + (showLabels.checked ? '' : '?clean'); }
  if (!showLabels.checked) frame.setAttribute('src', labelsSrc());
  showLabels.addEventListener('change', function () {
    try { localStorage.setItem('editor.showLabels', showLabels.checked ? '1' : '0'); } catch (e) {}
    frame.setAttribute('src', labelsSrc());
  });

  // Panel sections fold open and shut. First time: only Checks open. After that, remembered on this computer.
  var sections = Array.prototype.slice.call(document.querySelectorAll('details.section')), sectionState = null;
  try { sectionState = JSON.parse(localStorage.getItem('editor.sections') || 'null'); } catch (e) {}
  sections.forEach(function (d) {
    var k = d.getAttribute('data-section');
    d.open = sectionState && k in sectionState ? !!sectionState[k] : k === 'problems';
    d.addEventListener('toggle', saveSections);
  });
  function saveSections() {
    var st = {}; sections.forEach(function (d) { st[d.getAttribute('data-section')] = d.open; });
    try { localStorage.setItem('editor.sections', JSON.stringify(st)); } catch (e) {}
  }
  $('#open-all').addEventListener('click', function () { sections.forEach(function (d) { d.open = true; }); });
  $('#close-all').addEventListener('click', function () { sections.forEach(function (d) { d.open = false; }); });

  fetch(API).then(function (r) { return r.json(); }).then(function (data) { loadState(data); applyPreview(); })
    .catch(function (e) { message('Couldn’t load the recipe: ' + e.message); });
})();
