/* Gym Tracker: log sets to localStorage; e1RM (RPE-adjusted when RPE is given, else Epley), programme, progress, backup. */
(function () {
  'use strict';
  var KEY = 'gymtracker.sets.v1';
  var $ = function (id) { return document.getElementById(id); };
  var C = window.GymCalc;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function save(sets) {
    try { localStorage.setItem(KEY, JSON.stringify(sets)); return true; }
    catch (e) { alert('Could not save: storage is unavailable in this browser mode.'); return false; }
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmt(n) { return n === null ? '--' : (Math.round(n * 10) / 10) + ' kg'; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  var sets = load();
  // e1RM for a stored set: RPE chart when the set has an RPE, otherwise Epley.
  function setE1rm(s) { return C.e1rm({ w: s.kg, r: s.reps, rpe: s.rpe }, 'rpe'); }

  function render() {
    var today = todayStr();
    $('today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

    // Exercise autocomplete from past entries
    var names = {};
    sets.forEach(function (s) { names[C.normName(s.ex)] = s.ex; });
    var dl = $('exList'); dl.textContent = '';
    Object.keys(names).sort().forEach(function (k) { var o = el('option'); o.value = names[k]; dl.appendChild(o); });

    // Today's sets, newest first
    var list = $('todayList'); list.textContent = '';
    var todays = sets.filter(function (s) { return s.date === today; }).reverse();
    todays.forEach(function (s) {
      var li = el('li');
      li.appendChild(el('span', 'name', s.ex));
      var n = el('span', 'num'); var b = el('b', null, s.kg + ' x ' + s.reps + (s.rpe ? ' @' + s.rpe : ''));
      n.appendChild(b); n.appendChild(document.createTextNode('  e1RM ' + fmt(setE1rm(s))));
      li.appendChild(n);
      var del = el('button', 'del', '×'); del.setAttribute('aria-label', 'Delete set');
      del.onclick = function () { if (confirm('Delete this set?')) { sets = sets.filter(function (x) { return x.id !== s.id; }); save(sets); render(); } };
      li.appendChild(del);
      list.appendChild(li);
    });
    $('emptyToday').hidden = todays.length > 0;
    $('todayCount').textContent = todays.length ? todays.length + ' set' + (todays.length > 1 ? 's' : '') : '';

    // Best e1RM per exercise
    var best = {};
    sets.forEach(function (s) {
      var k = C.normName(s.ex), v = setE1rm(s);
      if (v !== null && (!best[k] || v > best[k].v)) best[k] = { v: v, s: s };
    });
    var bl = $('bestList'); bl.textContent = '';
    Object.keys(best).sort(function (a, b) { return best[b].v - best[a].v; }).forEach(function (k) {
      var li = el('li'); var b = best[k];
      li.appendChild(el('span', 'name', b.s.ex));
      var n = el('span', 'num'); n.appendChild(el('b', null, fmt(b.v)));
      n.appendChild(document.createTextNode('  ' + b.s.kg + ' x ' + b.s.reps + (b.s.rpe ? ' @' + b.s.rpe : '') + ', ' + b.s.date));
      li.appendChild(n); bl.appendChild(li);
    });
    $('emptyBest').hidden = Object.keys(best).length > 0;
  }

  function updateLive() {
    var rpe = parseFloat($('rpe').value);
    $('e1rmLabel').textContent = rpe ? 'Estimated 1RM (RPE-adjusted)' : 'Estimated 1RM (Epley)';
    $('e1rmLive').textContent = fmt(setE1rm({ kg: $('kg').value, reps: $('reps').value, rpe: rpe || null }));
  }
  ['kg', 'reps', 'rpe'].forEach(function (id) { $(id).addEventListener('input', updateLive); });

  // Prefill weight/reps from the last set of a chosen exercise
  $('exName').addEventListener('change', function () {
    var k = C.normName(this.value);
    for (var i = sets.length - 1; i >= 0; i--) {
      if (C.normName(sets[i].ex) === k) { $('kg').value = sets[i].kg; $('reps').value = sets[i].reps; $('rpe').value = sets[i].rpe || ''; updateLive(); break; }
    }
  });

  $('setForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var ex = $('exName').value.trim(), kg = parseFloat($('kg').value), reps = parseInt($('reps').value, 10), rpe = parseFloat($('rpe').value);
    if (!ex || !(kg >= 0) || !(reps > 0)) return;
    var set = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: todayStr(), ex: ex, kg: kg, reps: reps };
    if (rpe >= 5 && rpe <= 10) set.rpe = Math.round(rpe * 2) / 2;
    sets.push(set);
    if (save(sets)) { render(); if (navigator.vibrate) navigator.vibrate(30); $('reps').focus(); }
  });

  // Install prompt (Android Chrome)
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; $('installBtn').hidden = false; });
  $('installBtn').addEventListener('click', function () {
    if (!deferred) return; deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; $('installBtn').hidden = true; });
  });

  // Programme tab: pick week/day, see targets, "Log this" pre-fills the logger.
  var PROG = window.GYM_PROGRAMME || [], PKEY = 'gymtracker.prog.v1';
  function showView(id) {
    ['viewLog', 'viewProg', 'viewStats'].forEach(function (v) { $(v).hidden = v !== id; });
    document.querySelectorAll('.tab').forEach(function (t) { var on = t.dataset.view === id; t.classList.toggle('on', on); t.setAttribute('aria-selected', on); });
    if (id === 'viewProg') renderProg();
    if (id === 'viewStats') renderStats();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach(function (t) { t.onclick = function () { showView(t.dataset.view); }; });
  function bestE1rm(name) {
    var k = C.normName(name), base = C.normName(String(name).replace(/\s*\(.*$/, '')), b = null;
    sets.forEach(function (s) { var n = C.normName(s.ex), v = setE1rm(s); if ((n === k || n === base) && v !== null && (b === null || v > b)) b = v; });
    return b;
  }
  function firstNum(x) { var m = String(x).match(/\d+/); return m ? parseInt(m[0], 10) : ''; }
  var progSel = (function () { try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch (e) { return {}; } })();
  function fillSelects() {
    var w = $('progWeek'), d = $('progDay');
    if (!w.options.length) PROG.forEach(function (wk, i) { var o = el('option', null, 'Week ' + wk.week); o.value = i; w.appendChild(o); });
    w.value = Math.min(progSel.w || 0, PROG.length - 1);
    var days = PROG[w.value] ? PROG[w.value].days : [];
    d.textContent = '';
    days.forEach(function (dy, i) { var o = el('option', null, dy.day); o.value = i; d.appendChild(o); });
    d.value = Math.min(progSel.d || 0, days.length - 1);
  }
  function renderProg() {
    if (!PROG.length) return;
    fillSelects();
    var wk = PROG[$('progWeek').value], day = wk.days[$('progDay').value];
    $('progPhase').textContent = wk.phase;
    var ul = $('progList'); ul.textContent = '';
    day.ex.forEach(function (x) {
      var li = el('li'), h = el('div', 'ph');
      h.appendChild(el('b', null, x.name));
      h.appendChild(el('span', 'tgt', (x.sets || '?') + ' x ' + (x.reps || '?')));
      li.appendChild(h);
      var bits = [];
      if (x.pct) bits.push(x.pct + '% 1RM');
      if (x.rpe) bits.push('RPE ' + x.rpe);
      if (x.rest) bits.push('rest ' + x.rest);
      if (x.tempo) bits.push(x.tempo.toLowerCase());
      if (x.note) bits.push(x.note);
      var meta = el('p', 'meta', bits.join(' · ')), kg = '';
      if (x.pct) {
        var e = bestE1rm(x.name);
        if (e) { kg = Math.round(e * x.pct / 100 / 2.5) * 2.5; meta.appendChild(document.createElement('br')); meta.appendChild(el('span', 'sug', 'Suggested: ' + kg + ' kg (e1RM ' + fmt(e) + ')')); }
      }
      li.appendChild(meta);
      var btn = el('button', 'ghost', 'Log this');
      btn.onclick = function () {
        showView('viewLog');
        $('exName').value = x.name;
        var last = null; for (var i = sets.length - 1; i >= 0; i--) if (C.normName(sets[i].ex) === C.normName(x.name)) { last = sets[i]; break; }
        $('kg').value = kg !== '' ? kg : (last ? last.kg : '');
        $('reps').value = firstNum(x.reps) || (last ? last.reps : '');
        $('rpe').value = '';
        updateLive(); $($('kg').value === '' ? 'kg' : 'reps').focus();
      };
      li.appendChild(btn); ul.appendChild(li);
    });
  }
  function saveSel() { progSel = { w: +$('progWeek').value, d: +$('progDay').value }; try { localStorage.setItem(PKEY, JSON.stringify(progSel)); } catch (e) {} }
  $('progWeek').addEventListener('change', function () { saveSel(); renderProg(); });
  $('progDay').addEventListener('change', function () { saveSel(); renderProg(); });

  // Progress tab: e1RM chart with PRs, next-session suggestion, plateau alerts.
  var SKEY = 'gymtracker.stat.v1';
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
  // Exercise names, most recently trained first
  function exNames() {
    var last = {};
    sets.forEach(function (s) { last[C.normName(s.ex)] = s; });
    return Object.keys(last).sort(function (a, b) {
      return last[a].date < last[b].date ? 1 : last[a].date > last[b].date ? -1 : a < b ? -1 : 1;
    }).map(function (k) { return last[k].ex; });
  }
  function svg(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function drawChart(hist) {
    var box = $('chart'); box.textContent = '';
    if (hist.length < 2) { $('chartNote').textContent = hist.length ? 'Log this lift on another day to see a trend.' : ''; return; }
    var W = 520, H = 240, L = 46, R = 12, T = 12, B = 26;
    var t0 = Date.parse(hist[0].date), t1 = Date.parse(hist[hist.length - 1].date), span = Math.max(t1 - t0, 1);
    var vals = hist.map(function (h) { return h.best; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = Math.max((hi - lo) * 0.15, 2.5);
    lo -= pad; hi += pad;
    var x = function (d) { return L + (Date.parse(d) - t0) / span * (W - L - R); };
    var y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };
    var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Best e1RM per session' });
    [lo + pad, (lo + hi) / 2, hi - pad].forEach(function (v) {
      g.appendChild(svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }));
      var t = svg('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'ax' }); t.textContent = Math.round(v); g.appendChild(t);
    });
    [hist[0], hist[hist.length - 1]].forEach(function (h, i) {
      var t = svg('text', { x: x(h.date), y: H - 6, 'text-anchor': i ? 'end' : 'start', class: 'ax' }); t.textContent = h.date.slice(5); g.appendChild(t);
    });
    g.appendChild(svg('polyline', { points: hist.map(function (h) { return x(h.date) + ',' + y(h.best); }).join(' '), class: 'ln' }));
    hist.forEach(function (h) {
      var c = svg('circle', { cx: x(h.date), cy: y(h.best), r: h.pr ? 5 : 3.5, class: h.pr ? 'pr' : 'pt' });
      var tt = svg('title', {}); tt.textContent = h.date + ': ' + fmt(h.best) + (h.pr ? ' (PR)' : ''); c.appendChild(tt);
      g.appendChild(c);
    });
    box.appendChild(g);
    $('chartNote').textContent = 'Best e1RM per session. Orange dots are PRs.';
  }
  function renderStats() {
    var names = exNames(), sel = $('statEx'), wk = workouts(), today = todayStr();
    $('emptyStats').hidden = names.length > 0;
    // Plateau alerts across all lifts
    var pl = $('plateauList'); pl.textContent = '';
    names.forEach(function (n) {
      var p = C.plateau(C.exerciseHistory(wk, n, 'rpe'), today, 28);
      if (!p.flag) return;
      var li = el('li'); li.appendChild(el('span', 'name', n));
      li.appendChild(el('span', 'num', 'no PR for ' + Math.floor(p.daysSincePr / 7) + ' wk (best ' + fmt(p.best) + ')'));
      pl.appendChild(li);
    });
    $('plateauCard').hidden = !pl.children.length;
    var keep = sel.value || (function () { try { return localStorage.getItem(SKEY); } catch (e) { return null; } })();
    sel.textContent = '';
    names.forEach(function (n) { var o = el('option', null, n); o.value = n; sel.appendChild(o); });
    if (keep && names.indexOf(keep) >= 0) sel.value = keep;
    var name = sel.value;
    var hist = name ? C.exerciseHistory(wk, name, 'rpe') : [];
    drawChart(hist);
    // Next session, from the last session of this lift
    var last = hist[hist.length - 1], sug = last ? C.suggestNext(last.sets, { increment: 2.5 }) : null;
    $('nextCard').hidden = !sug;
    if (sug) {
      $('nextText').textContent = (sug.action === 'up' ? '▲ ' : sug.action === 'down' ? '▼ ' : '= ') + sug.weight + ' kg x ' + sug.reps;
      $('nextWhy').textContent = 'Last time (' + last.date + '): ' + sug.reason;
    }
    var hl = $('histList'); hl.textContent = '';
    hist.slice().reverse().forEach(function (h) {
      var li = el('li', 'hist'), top = el('div', 'hrow');
      top.appendChild(el('span', 'name', h.date + (h.pr ? ' · PR' : '')));
      top.appendChild(el('b', 'num', fmt(h.best)));
      li.appendChild(top);
      li.appendChild(el('span', 'muted', h.sets.map(function (s) { return s.w + 'x' + s.r + (s.rpe ? '@' + s.rpe : ''); }).join(', ')));
      hl.appendChild(li);
    });
  }
  $('statEx').addEventListener('change', function () { try { localStorage.setItem(SKEY, this.value); } catch (e) {} renderStats(); });

  // Backup: JSON save/restore (restore merges by set id) and CSV export.
  function download(name, text, type) {
    var a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  $('expJson').onclick = function () {
    download('gym-tracker-backup-' + todayStr() + '.json',
      JSON.stringify({ app: 'gym-tracker', version: 1, exported: new Date().toISOString(), sets: sets }, null, 1), 'application/json');
    $('backupNote').textContent = 'Saved ' + sets.length + ' sets.';
  };
  $('expCsv').onclick = function () {
    var q = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var rows = [['date', 'exercise', 'kg', 'reps', 'rpe', 'e1rm']].concat(sets.map(function (s) {
      var e = setE1rm(s); return [s.date, s.ex, s.kg, s.reps, s.rpe || '', e === null ? '' : C.round1(e)];
    }));
    download('gym-tracker-' + todayStr() + '.csv', rows.map(function (r) { return r.map(q).join(','); }).join('\n'), 'text/csv');
  };
  $('impJson').onclick = function () { $('impFile').click(); };
  $('impFile').onchange = function () {
    var f = this.files[0]; if (!f) return;
    f.text().then(function (txt) {
      var data = JSON.parse(txt), inc = Array.isArray(data) ? data : data.sets;
      if (!Array.isArray(inc)) throw new Error('not a backup');
      var have = {}; sets.forEach(function (s) { have[s.id] = 1; });
      var add = inc.filter(function (s) { return s && s.id && s.date && s.ex && !have[s.id]; });
      sets = sets.concat(add).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      save(sets); render();
      $('backupNote').textContent = 'Restored ' + add.length + ' new sets (' + (inc.length - add.length) + ' already here).';
    }).catch(function () { $('backupNote').textContent = 'That file is not a Gym Tracker backup.'; });
    this.value = '';
  };

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  render();
})();
