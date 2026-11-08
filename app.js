/* Gym Tracker v2: 4-week blocks with a row per prescribed set (target vs actual RPE), daily check-ins
   (sleep, stress, bodyweight), a coach dashboard, and a block report to hand to Claude for the next block. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var C = window.GymCalc;
  var K = { sets: 'gymtracker.sets.v1', well: 'gymtracker.well.v1', blocks: 'gymtracker.blocks.v1',
    settings: 'gymtracker.settings.v1', notes: 'gymtracker.daynotes.v1', sel: 'gymtracker.sel.v2', stat: 'gymtracker.stat.v1' };

  function get(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function put(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { alert('Could not save: storage is unavailable in this browser mode.'); return false; }
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmt(n) { return n == null ? '--' : C.round1(n) + ' kg'; }
  function r1(n) { return n == null ? '' : C.round1(n); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function round25(x) { return Math.round(x / 2.5) * 2.5; }
  function firstNum(x) { var m = String(x == null ? '' : x).match(/\d+/); return m ? parseInt(m[0], 10) : null; }
  function shortDate(d) { return new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
  function nextMonday(d) { var m = C.mondayOf(d); return m === d ? d : C.addDays(m, 7); }

  // ---------- state ----------
  var sets = get(K.sets, []);
  var well = get(K.well, {});
  var settings = get(K.settings, {});
  settings.oneRM = settings.oneRM || {};
  var blocks = get(K.blocks, null);
  if (!blocks || !blocks.length) {
    // First run: block 1 = weeks 13-16 of the built-in template, starting Mon 9 Nov 2026.
    var tpl = (window.GYM_PROGRAMME || []).filter(function (w) { return w.week >= 13 && w.week <= 16; });
    blocks = [{ id: 'b1', name: 'Block 1: weeks 13–16 of the current plan', start: '2026-11-09', active: true,
      weeks: tpl.map(function (w, i) { return { week: i + 1, phase: w.phase, days: w.days }; }) }];
    put(K.blocks, blocks);
  }
  function activeBlock() { return blocks.filter(function (b) { return b.active; })[0] || blocks[blocks.length - 1]; }
  var sel = get(K.sel, {});
  var notes = get(K.notes, {}); // 'blockId|week|day' -> {text, updated}

  function saveSets() { return put(K.sets, sets); }
  function setKey(b, wi, di, ei, si) { return b.id + '|' + wi + '|' + di + '|' + ei + '|' + si; }
  function byKey() { var m = {}; sets.forEach(function (s) { if (s.k) m[s.k] = s; }); return m; }
  function setE1rm(s) { return C.e1rm({ w: s.kg, r: s.reps, rpe: s.rpe }, 'rpe'); }

  // ---------- theme ----------
  function applyTheme() {
    var t = settings.theme || 'light';
    if (t === 'system') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === 'dark' ? '#111318' : '#f6f5f2';
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (settings.theme === 'system') applyTheme(); });

  // ---------- tabs ----------
  var VIEWS = ['viewTrain', 'viewBody', 'viewStats', 'viewData'];
  function showView(id) {
    VIEWS.forEach(function (v) { $(v).hidden = v !== id; });
    document.querySelectorAll('.tab').forEach(function (t) { var on = t.dataset.view === id; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
    ({ viewTrain: renderTrain, viewBody: renderBody, viewStats: renderStats, viewData: renderData })[id]();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach(function (t) { t.onclick = function () { showView(t.dataset.view); }; });

  // ---------- suggested weights ----------
  // Reference 1RM for a lift: best RPE-based e1RM of the competition lift in the last 6 weeks,
  // else all time, else the training 1RM in Settings.
  function refOneRm(name) {
    var cat = C.liftCat(name), today = todayStr();
    if (cat) {
      var e = C.bestE1rmBetween(sets, cat, C.addDays(today, -42), today) || C.bestE1rmBetween(sets, cat, '0000', '9999');
      return e || num(settings.oneRM[cat]);
    }
    var b = null, k = C.normName(name);
    sets.forEach(function (s) { if (C.normName(s.ex) === k) { var v = setE1rm(s); if (v && (!b || v > b)) b = v; } });
    return b;
  }
  function num(x) { var n = parseFloat(x); return isFinite(n) ? n : null; }
  function lastLogged(name, before) {
    var k = C.normName(name);
    for (var i = sets.length - 1; i >= 0; i--) if (C.normName(sets[i].ex) === k && (!before || sets[i].date < before)) return sets[i];
    return null;
  }

  // ---------- TRAIN ----------
  function dayDone(b, wi, di, logged) {
    var d = b.weeks[wi].days[di], tot = 0, got = 0;
    d.ex.forEach(function (x, ei) {
      var n = firstNum(x.sets) || 1;
      for (var si = 0; si < n; si++) { tot++; if (logged[setKey(b, wi, di, ei, si)]) got++; }
    });
    return { tot: tot, got: got };
  }
  function firstOpenDay(b) {
    var logged = byKey();
    for (var wi = 0; wi < b.weeks.length; wi++)
      for (var di = 0; di < b.weeks[wi].days.length; di++) {
        var p = dayDone(b, wi, di, logged); if (p.got < p.tot) return { w: wi, d: di };
      }
    return { w: b.weeks.length - 1, d: 0 };
  }
  function curSel(b) {
    if (sel.blk !== b.id || !b.weeks[sel.w] || !b.weeks[sel.w].days[sel.d]) { var f = firstOpenDay(b); sel = { blk: b.id, w: f.w, d: f.d }; }
    return sel;
  }
  function renderTrain() {
    var b = activeBlock(), s = curSel(b), logged = byKey();
    $('blockName').textContent = b.name;
    var ws = $('selWeek'), ds = $('selDay');
    ws.textContent = ''; ds.textContent = '';
    b.weeks.forEach(function (w, i) {
      var a = C.addDays(b.start, i * 7), z = C.addDays(a, 6);
      var o = el('option', null, 'Week ' + (i + 1) + ' · ' + shortDate(a) + '–' + shortDate(z)); o.value = i; ws.appendChild(o);
    });
    ws.value = s.w;
    b.weeks[s.w].days.forEach(function (d, i) {
      var p = dayDone(b, s.w, i, logged);
      var o = el('option', null, d.day + (p.got >= p.tot ? ' ✓' : p.got ? ' (' + p.got + '/' + p.tot + ')' : '')); o.value = i; ds.appendChild(o);
    });
    ds.value = s.d;
    $('phase').textContent = b.weeks[s.w].phase || '';
    var prog = dayDone(b, s.w, s.d, logged);
    $('dayProgress').textContent = prog.got + ' / ' + prog.tot + ' sets logged';

    var box = $('dayPlan'); box.textContent = '';
    var missing = ['squat', 'bench', 'deadlift'].filter(function (c) { return !num(settings.oneRM[c]) && !C.bestE1rmBetween(sets, c, '0000', '9999'); });
    if (missing.length) box.appendChild(oneRmCard());
    b.weeks[s.w].days[s.d].ex.forEach(function (x, ei) { box.appendChild(exCard(b, s.w, s.d, x, ei, logged)); });
    var nk = b.id + '|' + s.w + '|' + s.d, nt = notes[nk];
    $('dayNote').value = nt ? nt.text : '';
    $('dayNote').dataset.key = nk;
    $('dayNoteSaved').textContent = nt ? 'Saved ' + shortDate(nt.updated) + '.' : '';
    renderExtra();
  }
  // Shown on Train until squat, bench and deadlift each have a 1RM (typed in, or from logged sets).
  function oneRmCard() {
    var card = el('section', 'card setup');
    card.appendChild(el('h2', null, 'Your 1RMs'));
    card.appendChild(el('p', 'muted', 'Enter your current 1RMs (or training maxes) so every % 1RM lift shows the kg to put on the bar.'));
    var row = el('div', 'row'), inputs = {};
    [['squat', 'Squat'], ['bench', 'Bench'], ['deadlift', 'Deadlift']].forEach(function (p) {
      var f = el('label', 'field'); f.appendChild(el('span', null, p[1] + ' kg'));
      var i = el('input'); i.type = 'number'; i.inputMode = 'decimal'; i.step = '2.5'; i.value = settings.oneRM[p[0]] || '';
      inputs[p[0]] = i; f.appendChild(i); row.appendChild(f);
    });
    card.appendChild(row);
    var go = el('button', 'primary', 'Save and show weights');
    go.onclick = function () {
      Object.keys(inputs).forEach(function (k) { var v = num(inputs[k].value); if (v) settings.oneRM[k] = v; });
      put(K.settings, settings); renderTrain();
    };
    card.appendChild(go);
    return card;
  }
  // Working weight to put on the bar for a prescribed exercise: {kg, why, lo?, hi?} or null.
  // 1) % of 1RM x reference 1RM; 2) progression from the last session of this exercise;
  // 3) for lift variants with an RPE target, the RPE chart x the lift's 1RM.
  function suggestKg(x, last) {
    var ref, reps = firstNum(x.reps), t = C.parseRange(x.rpe);
    if (x.pct && (ref = refOneRm(x.name))) {
      var kg = round25(ref * x.pct / 100);
      return { kg: kg, lo: kg - 5, hi: kg, why: x.pct + '% of ' + C.round1(ref) + ' kg 1RM' + (x.rpe ? '. Adjust within the range to land on RPE ' + x.rpe : '') };
    }
    if (last) {
      var day = sets.filter(function (s) { return C.normName(s.ex) === C.normName(x.name) && s.date === last.date; })
        .map(function (s) { return { w: s.kg, r: s.reps, rpe: s.rpe }; });
      var inc = /\bdb\b|dumbbell/i.test(x.name) ? 2 : last.kg < 20 ? 1 : 2.5;
      var rr = C.parseRange(x.reps); // double progression: add weight once the top of a rep range is hit
      var n = C.suggestNext(day, { increment: inc, targetReps: rr ? rr.hi : null, maxRpe: t ? t.hi : 8 });
      if (n) return { kg: n.weight, why: (n.action === 'up' ? '▲ ' : n.action === 'down' ? '▼ ' : '= ') + 'last time ' + shortDate(last.date) + ': ' + n.reason };
    }
    if (C.liftCat(x.name) && t && reps && (ref = refOneRm(x.name))) {
      var pct = C.rpePercent(reps, t.mid);
      if (pct) return { kg: round25(ref * pct / 100), why: reps + ' reps @ RPE ' + t.mid + ' ≈ ' + C.round1(pct) + '% of ' + C.round1(ref) + ' kg' };
    }
    return null;
  }
  function exCard(b, wi, di, x, ei, logged) {
    var card = el('section', 'ex'), n = firstNum(x.sets) || 1, done = 0;
    var h = el('div', 'ex-h'); h.appendChild(el('b', null, x.name)); h.appendChild(el('span', 'tgt', (x.sets || '?') + ' × ' + (x.reps || '?')));
    card.appendChild(h);
    var last = lastLogged(x.name, todayStr()) || lastLogged(x.name);
    var sug = suggestKg(x, last);
    if (sug) {
      var sb = el('div', 'sugbox');
      sb.appendChild(el('span', 'sl', 'Suggested'));
      sb.appendChild(el('strong', null, sug.kg + ' kg'));
      sb.appendChild(el('span', 'sw', sug.why));
      card.appendChild(sb);
    }
    var chips = el('div', 'chips');
    if (x.pct) chips.appendChild(el('span', 'chip', x.pct + '% 1RM'));
    if (sug && sug.lo) chips.appendChild(el('span', 'chip', 'range ' + sug.lo + '–' + sug.hi + ' kg'));
    if (x.rpe) chips.appendChild(el('span', 'chip k', 'RPE ' + x.rpe));
    if (x.rest) chips.appendChild(el('span', 'chip', 'rest ' + x.rest));
    if (x.tempo) chips.appendChild(el('span', 'chip', String(x.tempo).toLowerCase()));
    card.appendChild(chips);
    var hint = [];
    if (x.note) hint.push(x.note);
    if (x.pct && !sug) hint.push('Enter your 1RMs above to see the kg.');
    if (!sug && !x.pct) hint.push('Pick a weight you can do for ' + (x.reps || 'the reps') + (x.rpe ? ' at RPE ' + x.rpe : '') + '. The app suggests from it next time.');
    if (last) hint.push('Last: ' + last.kg + ' kg × ' + last.reps + (last.rpe ? ' @' + last.rpe : '') + ' (' + shortDate(last.date) + ')');
    if (hint.length) card.appendChild(el('p', 'hint', hint.join(' · ')));
    var hdr = el('div', 'srow hdr');
    ['', 'kg', 'reps', 'RPE', ''].forEach(function (t) { hdr.appendChild(el('span', null, t)); });
    card.appendChild(hdr);
    var tR = C.parseRange(x.rpe), prevKg = null;
    for (var si = 0; si < n; si++) {
      var key = setKey(b, wi, di, ei, si), got = logged[key];
      if (got) done++;
      var row = el('div', 'srow' + (got ? ' logged' : ''));
      row.appendChild(el('span', 'n', String(si + 1)));
      var kg = el('input'); kg.type = 'number'; kg.inputMode = 'decimal'; kg.step = '0.5'; kg.min = '0'; kg.setAttribute('aria-label', 'kg set ' + (si + 1));
      var rp = el('input'); rp.type = 'number'; rp.inputMode = 'numeric'; rp.step = '1'; rp.min = '0'; rp.setAttribute('aria-label', 'reps set ' + (si + 1));
      var rr = el('input'); rr.type = 'number'; rr.inputMode = 'decimal'; rr.step = '0.5'; rr.min = '5'; rr.max = '10'; rr.setAttribute('aria-label', 'actual RPE set ' + (si + 1));
      if (got) { kg.value = got.kg; rp.value = got.reps; rr.value = got.rpe || ''; prevKg = got.kg; }
      else {
        kg.value = prevKg != null ? prevKg : sug ? sug.kg : last ? last.kg : '';
        if (kg.value === '') kg.placeholder = 'kg';
        var tr = firstNum(x.reps); rp.value = /max/i.test(String(x.reps)) ? '' : tr != null ? tr : '';
      }
      rr.placeholder = tR ? String(tR.mid) : 'RPE';
      var ok = el('button', 'ok', '✓'); ok.setAttribute('aria-label', got ? 'Update or remove set ' + (si + 1) : 'Log set ' + (si + 1));
      ok.onclick = logRow.bind(null, b, wi, di, ei, si, x, kg, rp, rr);
      [kg, rp, rr, ok].forEach(function (e) { row.appendChild(e); });
      card.appendChild(row);
    }
    if (done >= n) card.classList.add('done');
    return card;
  }
  function logRow(b, wi, di, ei, si, x, kgEl, repsEl, rpeEl) {
    var key = setKey(b, wi, di, ei, si), existing = byKey()[key];
    var kg = parseFloat(kgEl.value), reps = parseInt(repsEl.value, 10), rpe = parseFloat(rpeEl.value);
    rpe = rpe >= 5 && rpe <= 10 ? Math.round(rpe * 2) / 2 : null;
    if (existing && existing.kg === kg && existing.reps === reps && (existing.rpe || null) === rpe) {
      if (!confirm('Remove this logged set?')) return;
      sets = sets.filter(function (s) { return s.k !== key; });
    } else {
      if (!(kg >= 0) || !(reps > 0)) { (kgEl.value === '' ? kgEl : repsEl).focus(); return; }
      var s = existing || { id: uid(), date: todayStr(), k: key, blk: b.id, wk: wi + 1, day: b.weeks[wi].days[di].day };
      s.ex = x.name; s.kg = kg; s.reps = reps;
      if (rpe !== null) s.rpe = rpe; else delete s.rpe;
      s.trpe = x.rpe != null ? String(x.rpe) : ''; s.treps = x.reps != null ? String(x.reps) : '';
      if (x.pct) s.pct = x.pct;
      if (!existing) sets.push(s);
      if (navigator.vibrate) navigator.vibrate(30);
    }
    saveSets(); var y = window.scrollY; renderTrain(); window.scrollTo(0, y);
  }
  var noteTimer = null;
  function saveNote() {
    var ta = $('dayNote'), k = ta.dataset.key, t = ta.value.trim();
    if (!k) return;
    if (t) notes[k] = { text: t, updated: todayStr() }; else delete notes[k];
    put(K.notes, notes);
    $('dayNoteSaved').textContent = t ? 'Saved.' : '';
  }
  $('dayNote').addEventListener('input', function () { clearTimeout(noteTimer); $('dayNoteSaved').textContent = 'Saving…'; noteTimer = setTimeout(saveNote, 600); });
  $('dayNote').addEventListener('blur', function () { clearTimeout(noteTimer); saveNote(); });
  $('selWeek').addEventListener('change', function () { sel = { blk: activeBlock().id, w: +this.value, d: 0 }; put(K.sel, sel); renderTrain(); });
  $('selDay').addEventListener('change', function () { sel.d = +this.value; put(K.sel, sel); renderTrain(); });

  // Extra (unplanned) sets
  function renderExtra() {
    var names = {};
    sets.forEach(function (s) { names[C.normName(s.ex)] = s.ex; });
    activeBlock().weeks.forEach(function (w) { w.days.forEach(function (d) { d.ex.forEach(function (x) { names[C.normName(x.name)] = names[C.normName(x.name)] || x.name; }); }); });
    var dl = $('exList'); dl.textContent = '';
    Object.keys(names).sort().forEach(function (k) { var o = el('option'); o.value = names[k]; dl.appendChild(o); });
    var ul = $('extraList'); ul.textContent = '';
    sets.filter(function (s) { return !s.k && s.date === todayStr(); }).reverse().forEach(function (s) {
      var li = el('li'); li.appendChild(el('span', 'name', s.ex));
      li.appendChild(el('span', 'num', s.kg + ' × ' + s.reps + (s.rpe ? ' @' + s.rpe : '')));
      var del = el('button', 'del', '×'); del.setAttribute('aria-label', 'Delete set');
      del.onclick = function () { if (confirm('Delete this set?')) { sets = sets.filter(function (x) { return x.id !== s.id; }); saveSets(); renderExtra(); } };
      li.appendChild(del); ul.appendChild(li);
    });
  }
  function updateLive() {
    var rpe = parseFloat($('rpe').value);
    $('e1rmLabel').textContent = rpe ? 'Estimated 1RM (RPE-adjusted)' : 'Estimated 1RM (Epley)';
    $('e1rmLive').textContent = fmt(setE1rm({ kg: $('kg').value, reps: $('reps').value, rpe: rpe || null }));
  }
  ['kg', 'reps', 'rpe'].forEach(function (id) { $(id).addEventListener('input', updateLive); });
  $('exName').addEventListener('change', function () {
    var l = lastLogged(this.value);
    if (l) { $('kg').value = l.kg; $('reps').value = l.reps; $('rpe').value = l.rpe || ''; updateLive(); }
  });
  $('setForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var ex = $('exName').value.trim(), kg = parseFloat($('kg').value), reps = parseInt($('reps').value, 10), rpe = parseFloat($('rpe').value);
    if (!ex || !(kg >= 0) || !(reps > 0)) return;
    var s = { id: uid(), date: todayStr(), ex: ex, kg: kg, reps: reps };
    if (rpe >= 5 && rpe <= 10) s.rpe = Math.round(rpe * 2) / 2;
    sets.push(s);
    if (saveSets()) { renderExtra(); if (navigator.vibrate) navigator.vibrate(30); $('reps').focus(); }
  });

  // ---------- charts ----------
  function svg(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  // pts: [{date, v, pr}] oldest first
  function lineChart(box, pts, unit) {
    box.textContent = '';
    if (pts.length < 2) return false;
    var W = 520, H = 230, L = 46, R = 12, T = 12, B = 26;
    var t0 = Date.parse(pts[0].date), t1 = Date.parse(pts[pts.length - 1].date), span = Math.max(t1 - t0, 1);
    var vals = pts.map(function (p) { return p.v; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = Math.max((hi - lo) * 0.15, unit === 'kg' ? 2.5 : 0.5);
    lo -= pad; hi += pad;
    var x = function (d) { return L + (Date.parse(d) - t0) / span * (W - L - R); };
    var y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };
    var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Trend chart' });
    [lo + pad, (lo + hi) / 2, hi - pad].forEach(function (v) {
      g.appendChild(svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }));
      var t = svg('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'ax' }); t.textContent = Math.round(v * 10) / 10; g.appendChild(t);
    });
    [pts[0], pts[pts.length - 1]].forEach(function (p, i) {
      var t = svg('text', { x: x(p.date), y: H - 6, 'text-anchor': i ? 'end' : 'start', class: 'ax' }); t.textContent = shortDate(p.date); g.appendChild(t);
    });
    g.appendChild(svg('polyline', { points: pts.map(function (p) { return x(p.date) + ',' + y(p.v); }).join(' '), class: 'ln' }));
    pts.forEach(function (p) {
      var c = svg('circle', { cx: x(p.date), cy: y(p.v), r: p.pr ? 5 : 3.5, class: p.pr ? 'pr' : 'pt' });
      var tt = svg('title', {}); tt.textContent = p.date + ': ' + C.round1(p.v) + ' ' + unit + (p.pr ? ' (PR)' : ''); c.appendChild(tt);
      g.appendChild(c);
    });
    box.appendChild(g);
    return true;
  }

  // ---------- BODY ----------
  function fillWellForm(d) {
    var w = well[d] || {};
    $('wDate').value = d; $('wSleep').value = w.sleep != null ? w.sleep : ''; $('wStress').value = w.stress != null ? w.stress : '';
    $('wBw').value = w.bw != null ? w.bw : ''; $('wNote').value = w.note || '';
  }
  function renderBody() {
    if (!$('wDate').value) fillWellForm(todayStr());
    var days = Object.keys(well).sort().reverse();
    var ul = $('wellList'); ul.textContent = '';
    days.slice(0, 21).forEach(function (d) {
      var w = well[d], li = el('li');
      li.appendChild(el('span', 'name', shortDate(d) + (w.note ? ' · ' + w.note : '')));
      var bits = [];
      if (w.sleep != null) bits.push(w.sleep + ' h'); if (w.stress != null) bits.push('stress ' + w.stress); if (w.bw != null) bits.push(w.bw + ' kg');
      li.appendChild(el('span', 'num', bits.join(' · ')));
      li.onclick = function () { fillWellForm(d); window.scrollTo(0, 0); };
      ul.appendChild(li);
    });
    $('emptyWell').hidden = days.length > 0;
    var m = $('wellMetric').value, unit = m === 'bw' ? 'kg' : m === 'sleep' ? 'h' : '/10';
    var pts = Object.keys(well).sort().filter(function (d) { return well[d][m] != null; }).map(function (d) { return { date: d, v: well[d][m] }; });
    var ok = lineChart($('wellChart'), pts, unit);
    var wk = C.weeklyStats([], well).slice(-4).map(function (w) { return w.well[m]; }).filter(function (v) { return v != null; });
    $('wellChartNote').textContent = ok ? (wk.length ? 'Weekly averages, last ' + wk.length + ' wk: ' + wk.map(r1).join(' → ') + ' ' + unit : '') : 'Log two or more days to see a trend.';
  }
  $('wDate').addEventListener('change', function () { if (this.value) fillWellForm(this.value); });
  $('wellMetric').addEventListener('change', renderBody);
  $('wellForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var d = $('wDate').value; if (!d) return;
    var w = {}, sl = num($('wSleep').value), st = num($('wStress').value), bw = num($('wBw').value), note = $('wNote').value.trim();
    if (sl != null) w.sleep = sl; if (st != null) w.stress = Math.max(1, Math.min(10, Math.round(st))); if (bw != null) w.bw = bw; if (note) w.note = note;
    if (Object.keys(w).length) well[d] = w; else delete well[d];
    put(K.well, well);
    $('wellSaved').textContent = 'Saved ' + shortDate(d) + '.';
    if (navigator.vibrate) navigator.vibrate(30);
    renderBody();
  });

  // ---------- PROGRESS ----------
  function exNames() {
    var last = {};
    sets.forEach(function (s) { last[C.normName(s.ex)] = s; });
    var keys = Object.keys(last).sort(function (a, b) {
      var ma = C.isMain(last[a].ex) ? 0 : 1, mb = C.isMain(last[b].ex) ? 0 : 1;
      if (ma !== mb) return ma - mb;
      return last[a].date < last[b].date ? 1 : last[a].date > last[b].date ? -1 : a < b ? -1 : 1;
    });
    return keys.map(function (k) { return last[k].ex; });
  }
  function workouts() {
    var byDate = {};
    sets.forEach(function (s) {
      var d = byDate[s.date] || (byDate[s.date] = {}), k = C.normName(s.ex);
      (d[k] || (d[k] = { name: s.ex, sets: [] })).sets.push({ w: s.kg, r: s.reps, rpe: s.rpe });
    });
    return Object.keys(byDate).map(function (date) {
      return { date: date, exercises: Object.keys(byDate[date]).map(function (k) { return byDate[date][k]; }) };
    });
  }
  function latestBw() { var d = Object.keys(well).sort().reverse().filter(function (k) { return well[k].bw != null; })[0]; return d ? well[d].bw : null; }
  function renderStats() {
    var today = todayStr(), names = exNames();
    $('emptyStats').hidden = sets.length > 0;
    // KPIs: best e1RM in the last 4 weeks vs the 4 before
    var kp = $('kpis'); kp.textContent = ''; var total = 0, have = 0;
    ['squat', 'bench', 'deadlift'].forEach(function (c) {
      var now = C.bestE1rmBetween(sets, c, C.addDays(today, -27), today);
      var all = C.bestE1rmBetween(sets, c, '0000', '9999');
      var before = C.bestE1rmBetween(sets, c, C.addDays(today, -55), C.addDays(today, -28));
      var shown = now != null ? now : all;
      var box = el('div', 'kpi');
      box.appendChild(el('div', 'l', c === 'bench' ? 'Bench' : c[0].toUpperCase() + c.slice(1)));
      box.appendChild(el('div', 'v', shown != null ? String(C.round1(shown)) : '--'));
      var d = now != null && before != null ? now - before : null;
      box.appendChild(el('div', 'd ' + (d == null ? '' : d > 0.5 ? 'up' : d < -0.5 ? 'down' : ''),
        d == null ? (now == null && all != null ? 'none in 4 wk' : '') : (d >= 0 ? '+' : '') + C.round1(d) + ' kg / 4 wk'));
      kp.appendChild(box);
      if (shown != null) { total += shown; have++; }
    });
    var bw = latestBw();
    $('kpiNote').textContent = have === 3 ? 'Total ' + C.round1(total) + ' kg' + (bw ? ' · ' + C.round1(total / bw) + '× bodyweight (' + bw + ' kg)' : '') +
      '. RPE-based e1RM from the competition lifts, best of the last 4 weeks.' : 'Log squat, bench and deadlift with an RPE to see your e1RMs.';

    var weeks = C.weeklyStats(sets, well);
    var sig = C.signals(weeks, sets, today), sl = $('sigList'); sl.textContent = '';
    sig.forEach(function (s) { sl.appendChild(el('li', s.kind, s.text)); });
    $('sigCard').hidden = !sig.length;

    // e1RM chart for the chosen exercise
    var selEx = $('statEx'), keep = selEx.value || get(K.stat, null);
    selEx.textContent = '';
    names.forEach(function (n) { var o = el('option', null, n); o.value = n; selEx.appendChild(o); });
    if (keep && names.indexOf(keep) >= 0) selEx.value = keep;
    var name = selEx.value, wk = workouts();
    var hist = name ? C.exerciseHistory(wk, name, 'rpe') : [];
    var drawn = lineChart($('chart'), hist.map(function (h) { return { date: h.date, v: h.best, pr: h.pr }; }), 'kg');
    $('chartNote').textContent = drawn ? 'Best e1RM per session (RPE-adjusted where you logged RPE). Filled dots are PRs.' : hist.length ? 'Log this lift on another day to see a trend.' : '';
    var lastH = hist[hist.length - 1], sug = lastH ? C.suggestNext(lastH.sets, { increment: 2.5 }) : null;
    $('nextBox').hidden = !sug;
    if (sug) {
      $('nextText').textContent = 'Next: ' + (sug.action === 'up' ? '▲ ' : sug.action === 'down' ? '▼ ' : '= ') + sug.weight + ' kg × ' + sug.reps;
      $('nextWhy').textContent = 'Last time (' + shortDate(lastH.date) + '): ' + sug.reason;
    }

    // Weekly table, newest first, last 8 weeks
    var tb = $('weekTable'); tb.textContent = '';
    var th = el('thead'), hr = el('tr');
    ['', 'Sets', 'Tonnage', 'RPE (Δ)', 'Int.', 'e1RM', 'ACWR'].forEach(function (t) { hr.appendChild(el('th', null, t)); });
    th.appendChild(hr); tb.appendChild(th);
    var body = el('tbody');
    weeks.slice(-8).reverse().forEach(function (w) {
      var tr = el('tr', 'wk'), wl = w.well, bits = [];
      if (wl.sleep != null) bits.push(r1(wl.sleep) + 'h'); if (wl.stress != null) bits.push('stress ' + r1(wl.stress)); if (wl.bw != null) bits.push(r1(wl.bw) + 'kg');
      var td = el('td', null, 'w/c ' + shortDate(w.week) + (bits.length ? '  ·  ' + bits.join(' · ') : '')); td.colSpan = 7; tr.appendChild(td); body.appendChild(tr);
      ['squat', 'bench', 'deadlift'].forEach(function (c) {
        var L = w.lifts[c]; if (!L) return;
        var r = el('tr');
        [C.MAIN[c], L.sets, Math.round(L.tonnage), L.rpe == null ? '–' : r1(L.rpe) + (L.rpeDelta == null ? '' : ' (' + (L.rpeDelta >= 0 ? '+' : '') + r1(L.rpeDelta) + ')'),
          L.intensity == null ? '–' : Math.round(L.intensity * 100) + '%', L.best == null ? '–' : r1(L.best), L.acwr == null ? '–' : r1(L.acwr)]
          .forEach(function (v) { r.appendChild(el('td', null, String(v))); });
        body.appendChild(r);
      });
      var t = el('tr');
      ['All lifts', w.total.sets, Math.round(w.total.tonnage), '', '', '', w.total.acwr == null ? '–' : r1(w.total.acwr)].forEach(function (v) { t.appendChild(el('td', null, String(v))); });
      body.appendChild(t);
    });
    tb.appendChild(body);

    // Plateaus
    var pl = $('plateauList'); pl.textContent = '';
    names.forEach(function (n) {
      var p = C.plateau(C.exerciseHistory(wk, n, 'rpe'), today, 28);
      if (!p.flag) return;
      var li = el('li'); li.appendChild(el('span', 'name', n));
      li.appendChild(el('span', 'num', 'no PR for ' + Math.floor(p.daysSincePr / 7) + ' wk (best ' + fmt(p.best) + ')'));
      pl.appendChild(li);
    });
    $('plateauCard').hidden = !pl.children.length;

    var hl = $('histList'); hl.textContent = '';
    hist.slice().reverse().forEach(function (h) {
      var li = el('li', 'hist'), top = el('div', 'hrow');
      top.appendChild(el('span', 'name', shortDate(h.date) + (h.pr ? ' · PR' : '')));
      top.appendChild(el('b', 'num', fmt(h.best)));
      li.appendChild(top);
      li.appendChild(el('span', 'muted', h.sets.map(function (s) { return s.w + '×' + s.r + (s.rpe ? '@' + s.rpe : ''); }).join(', ')));
      hl.appendChild(li);
    });
  }
  $('statEx').addEventListener('change', function () { put(K.stat, this.value); renderStats(); });

  // ---------- DATA ----------
  function download(name, text, type) {
    var a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function csv(rows) {
    var q = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return rows.map(function (r) { return r.map(q).join(','); }).join('\n');
  }
  var FORMAT = {
    note: 'A programme is JSON: {"app":"gym-tracker","type":"programme","name":"...","start":"YYYY-MM-DD (a Monday)","weeks":[{"week":1,"phase":"...","days":[{"day":"Day 1","ex":[{"name":"Squat","sets":4,"reps":5,"pct":80,"rpe":"7-8","rest":"3-5 min","tempo":"POWER","note":"optional"}]}]}]}. ' +
      'sets: number. reps: number or text like "8-10" or "MAX". pct: % of 1RM for the competition lifts and their variants (optional). rpe: target, a number or a range like "6.5-8.5". ' +
      'Use the exact names "Squat", "Bench Press", "Deadlift" for the competition lifts so e1RM tracking works; variants start with the lift name, e.g. "Squat (paused)".'
  };
  function blockReport() {
    var b = activeBlock(), from = b.start, to = C.addDays(b.start, b.weeks.length * 7 - 1);
    var inBlock = sets.filter(function (s) { return s.blk === b.id || (s.date >= from && s.date <= to); })
      .sort(function (a, z) { return a.date < z.date ? -1 : a.date > z.date ? 1 : 0; })
      .map(function (s) {
        var o = { date: s.date, exercise: s.ex, kg: s.kg, reps: s.reps, rpe: s.rpe == null ? null : s.rpe };
        if (s.k) { o.week = s.wk; o.day = s.day; o.target_reps = s.treps; o.target_rpe = s.trpe; if (s.pct) o.pct = s.pct; } else o.unplanned = true;
        var e = setE1rm(s); if (e) o.e1rm = C.round1(e);
        return o;
      });
    var wellIn = Object.keys(well).filter(function (d) { return d >= C.addDays(from, -28) && d <= to; }).sort()
      .map(function (d) { var w = well[d]; return { date: d, sleep_h: w.sleep == null ? null : w.sleep, stress_10: w.stress == null ? null : w.stress, bodyweight_kg: w.bw == null ? null : w.bw, note: w.note || '' }; });
    var logged = byKey(), adherence = { prescribed: 0, logged: 0 };
    b.weeks.forEach(function (w, wi) { w.days.forEach(function (d, di) { var p = dayDone(b, wi, di, logged); adherence.prescribed += p.tot; adherence.logged += p.got; }); });
    var trend = {};
    ['squat', 'bench', 'deadlift'].forEach(function (c) {
      trend[C.MAIN[c]] = C.exerciseHistory(workouts(), C.MAIN[c], 'rpe').map(function (h) { return { date: h.date, e1rm: C.round1(h.best) }; });
    });
    var weekly = C.weeklyStats(sets, well).filter(function (w) { return w.week >= C.addDays(from, -28) && w.week <= to; }).map(function (w) {
      var o = { week_commencing: w.week, total: { sets: w.total.sets, reps: w.total.reps, tonnage_kg: Math.round(w.total.tonnage), acwr: w.total.acwr == null ? null : C.round1(w.total.acwr) },
        sleep_h_avg: w.well.sleep == null ? null : C.round1(w.well.sleep), stress_avg: w.well.stress == null ? null : C.round1(w.well.stress), bodyweight_avg: w.well.bw == null ? null : C.round1(w.well.bw), lifts: {} };
      Object.keys(w.lifts).forEach(function (c) {
        var L = w.lifts[c];
        o.lifts[C.MAIN[c]] = { sets: L.sets, reps: L.reps, tonnage_kg: Math.round(L.tonnage), avg_rpe: L.rpe == null ? null : C.round1(L.rpe),
          rpe_vs_target: L.rpeDelta == null ? null : C.round1(L.rpeDelta), avg_intensity_pct: L.intensity == null ? null : Math.round(L.intensity * 100),
          best_e1rm: L.best == null ? null : C.round1(L.best), acwr: L.acwr == null ? null : C.round1(L.acwr) };
      });
      return o;
    });
    return {
      app: 'gym-tracker', type: 'block-report', version: 2, exported: new Date().toISOString(),
      for_claude: 'This is my last training block from my Gym Tracker app: the plan, every set I logged (target vs actual RPE), my notes on days I changed the plan (day_notes: injuries, swapped exercises, missing equipment), my daily sleep, stress and bodyweight, and weekly coach metrics. ' +
        'Please review how it went (strength trend, fatigue, adherence, recovery) and write my next 4-week block as a JSON file in the programme format below, starting the Monday after this block ends, so I can import it into the app.',
      athlete: { training_1rm_kg: { squat: num(settings.oneRM.squat), bench: num(settings.oneRM.bench), deadlift: num(settings.oneRM.deadlift) }, latest_bodyweight_kg: latestBw() },
      block: { name: b.name, start: from, end: to, weeks: b.weeks },
      adherence: adherence,
      sets: inBlock, checkins: wellIn, weekly: weekly, e1rm_trend: trend,
      day_notes: b.weeks.reduce(function (acc, w, wi) {
        w.days.forEach(function (d, di) {
          var n = notes[b.id + '|' + wi + '|' + di];
          if (n) acc.push({ week: wi + 1, day: d.day, week_of: C.addDays(from, wi * 7), written: n.updated, note: n.text });
        });
        return acc;
      }, []),
      signals_now: C.signals(C.weeklyStats(sets, well), sets, todayStr()).map(function (s) { return s.text; }),
      programme_format: FORMAT.note
    };
  }
  function reportFile() {
    var r = blockReport(), name = 'gym-block-report-' + r.block.start + '.json';
    return { name: name, text: JSON.stringify(r, null, 1), n: r.sets.length };
  }
  $('expReport').onclick = function () {
    var f = reportFile(); download(f.name, f.text, 'application/json');
    $('reportNote').textContent = 'Saved ' + f.name + ' (' + f.n + ' sets). Attach it in Claude and ask for the next block.';
  };
  if (navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.json', { type: 'application/json' })] })) {
    $('shareReport').hidden = false;
    $('shareReport').onclick = function () {
      var f = reportFile();
      navigator.share({ files: [new File([f.text], f.name, { type: 'application/json' })], title: 'Gym block report' }).catch(function () {});
    };
  }

  function normaliseProgramme(p) {
    if (!p || !Array.isArray(p.weeks) || !p.weeks.length) throw new Error('no weeks');
    var weeks = p.weeks.map(function (w, i) {
      if (!Array.isArray(w.days) || !w.days.length) throw new Error('week ' + (i + 1) + ' has no days');
      return { week: i + 1, phase: String(w.phase || ''), days: w.days.map(function (d, j) {
        if (!Array.isArray(d.ex)) throw new Error('day without ex');
        return { day: String(d.day || 'Day ' + (j + 1)), ex: d.ex.filter(function (x) { return x && x.name; }).map(function (x) {
          var o = { name: String(x.name), sets: firstNum(x.sets) || 1, reps: x.reps == null ? '' : x.reps };
          ['pct'].forEach(function (k) { if (num(x[k]) != null) o[k] = num(x[k]); });
          ['rpe', 'rest', 'tempo', 'note'].forEach(function (k) { if (x[k] != null && x[k] !== '') o[k] = String(x[k]); });
          return o;
        }) };
      }) };
    });
    return weeks;
  }
  function renderData() {
    var bs = $('blockSel'); bs.textContent = '';
    blocks.forEach(function (b) { var o = el('option', null, b.name + ' (' + shortDate(b.start) + ')'); o.value = b.id; bs.appendChild(o); });
    bs.value = activeBlock().id;
    $('blockStart').value = activeBlock().start;
    $('s1rmSquat').value = settings.oneRM.squat || ''; $('s1rmBench').value = settings.oneRM.bench || ''; $('s1rmDead').value = settings.oneRM.deadlift || '';
    $('theme').value = settings.theme || 'light';
  }
  $('impProg').onclick = function () { $('impProgFile').click(); };
  $('impProgFile').onchange = function () {
    var f = this.files[0]; if (!f) return; var input = this;
    f.text().then(function (txt) {
      var p = JSON.parse(txt), weeks = normaliseProgramme(p.programme || p);
      var last = blocks[blocks.length - 1], defStart = nextMonday(todayStr());
      if (last) { var after = C.addDays(last.start, last.weeks.length * 7); if (after > defStart) defStart = after; }
      var start = /^\d{4}-\d{2}-\d{2}$/.test(p.start || '') ? C.mondayOf(p.start) : defStart;
      blocks.forEach(function (b) { b.active = false; });
      var nb = { id: 'b' + uid(), name: String(p.name || 'Block ' + (blocks.length + 1)), start: start, active: true, weeks: weeks };
      blocks.push(nb); put(K.blocks, blocks); sel = {}; put(K.sel, sel);
      $('progNote').textContent = 'Imported "' + nb.name + '": ' + weeks.length + ' weeks from ' + shortDate(start) + '. It is now the active block.';
      renderData();
    }).catch(function (e) { $('progNote').textContent = 'Could not import that file (' + e.message + '). It should be a programme JSON.'; });
    input.value = '';
  };
  $('blockSel').addEventListener('change', function () {
    var id = this.value; blocks.forEach(function (b) { b.active = b.id === id; }); put(K.blocks, blocks); sel = {}; put(K.sel, sel); renderData();
  });
  $('blockStart').addEventListener('change', function () {
    if (!this.value) return; var b = activeBlock(); b.start = C.mondayOf(this.value); put(K.blocks, blocks);
    $('progNote').textContent = 'Block now starts Monday ' + shortDate(b.start) + '.'; renderData();
  });
  [['s1rmSquat', 'squat'], ['s1rmBench', 'bench'], ['s1rmDead', 'deadlift']].forEach(function (p) {
    $(p[0]).addEventListener('change', function () { var v = num(this.value); if (v) settings.oneRM[p[1]] = v; else delete settings.oneRM[p[1]]; put(K.settings, settings); });
  });
  $('theme').addEventListener('change', function () { settings.theme = this.value; put(K.settings, settings); applyTheme(); });

  $('expJson').onclick = function () {
    download('gym-tracker-backup-' + todayStr() + '.json',
      JSON.stringify({ app: 'gym-tracker', version: 2, exported: new Date().toISOString(), sets: sets, well: well, blocks: blocks, notes: notes, settings: settings }, null, 1), 'application/json');
    $('backupNote').textContent = 'Saved ' + sets.length + ' sets, ' + Object.keys(well).length + ' check-ins, ' + blocks.length + ' blocks.';
  };
  $('expCsv').onclick = function () {
    var rows = [['date', 'week', 'day', 'exercise', 'kg', 'reps', 'rpe_actual', 'rpe_target', 'reps_target', 'pct_1rm', 'e1rm']].concat(sets.map(function (s) {
      var e = setE1rm(s); return [s.date, s.wk || '', s.day || '', s.ex, s.kg, s.reps, s.rpe || '', s.trpe || '', s.treps || '', s.pct || '', e == null ? '' : C.round1(e)];
    }));
    download('gym-sets-' + todayStr() + '.csv', csv(rows), 'text/csv');
  };
  $('expWellCsv').onclick = function () {
    var rows = [['date', 'sleep_h', 'stress_10', 'bodyweight_kg', 'note']].concat(Object.keys(well).sort().map(function (d) {
      var w = well[d]; return [d, w.sleep == null ? '' : w.sleep, w.stress == null ? '' : w.stress, w.bw == null ? '' : w.bw, w.note || ''];
    }));
    download('gym-checkins-' + todayStr() + '.csv', csv(rows), 'text/csv');
  };
  $('impJson').onclick = function () { $('impFile').click(); };
  $('impFile').onchange = function () {
    var f = this.files[0]; if (!f) return; var input = this;
    f.text().then(function (txt) {
      var data = JSON.parse(txt), inc = Array.isArray(data) ? data : data.sets;
      if (!Array.isArray(inc)) throw new Error('not a backup');
      var have = {}; sets.forEach(function (s) { have[s.id] = 1; });
      var add = inc.filter(function (s) { return s && s.id && s.date && s.ex && !have[s.id]; });
      sets = sets.concat(add).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      saveSets();
      var nw = 0; Object.keys(data.well || {}).forEach(function (d) { if (!well[d]) { well[d] = data.well[d]; nw++; } }); put(K.well, well);
      var nn = 0; Object.keys(data.notes || {}).forEach(function (k) { if (!notes[k]) { notes[k] = data.notes[k]; nn++; } }); put(K.notes, notes);
      var nb = 0, ids = {}; blocks.forEach(function (b) { ids[b.id] = 1; });
      (data.blocks || []).forEach(function (b) { if (b && b.id && !ids[b.id] && Array.isArray(b.weeks)) { b.active = false; blocks.push(b); nb++; } }); put(K.blocks, blocks);
      $('backupNote').textContent = 'Restored ' + add.length + ' new sets, ' + nw + ' check-ins, ' + nn + ' day notes, ' + nb + ' blocks.';
    }).catch(function () { $('backupNote').textContent = 'That file is not a Gym Tracker backup.'; });
    input.value = '';
  };

  // ---------- boot ----------
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; $('installBtn').hidden = false; });
  $('installBtn').addEventListener('click', function () {
    if (!deferred) return; deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; $('installBtn').hidden = true; });
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  $('today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  applyTheme();
  renderTrain();
})();
