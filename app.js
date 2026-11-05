/* Gym Tracker - painted-door v0: log single sets to localStorage, show Epley e1RM. */
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
      var n = el('span', 'num'); var b = el('b', null, s.kg + ' x ' + s.reps);
      n.appendChild(b); n.appendChild(document.createTextNode('  e1RM ' + fmt(C.epley(s.kg, s.reps))));
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
      var k = C.normName(s.ex), v = C.epley(s.kg, s.reps);
      if (v !== null && (!best[k] || v > best[k].v)) best[k] = { v: v, s: s };
    });
    var bl = $('bestList'); bl.textContent = '';
    Object.keys(best).sort(function (a, b) { return best[b].v - best[a].v; }).forEach(function (k) {
      var li = el('li'); var b = best[k];
      li.appendChild(el('span', 'name', b.s.ex));
      var n = el('span', 'num'); n.appendChild(el('b', null, fmt(b.v)));
      n.appendChild(document.createTextNode('  ' + b.s.kg + ' x ' + b.s.reps + ', ' + b.s.date));
      li.appendChild(n); bl.appendChild(li);
    });
    $('emptyBest').hidden = Object.keys(best).length > 0;
  }

  function updateLive() { $('e1rmLive').textContent = fmt(C.epley($('kg').value, $('reps').value)); }
  $('kg').addEventListener('input', updateLive);
  $('reps').addEventListener('input', updateLive);

  // Prefill weight/reps from the last set of a chosen exercise
  $('exName').addEventListener('change', function () {
    var k = C.normName(this.value);
    for (var i = sets.length - 1; i >= 0; i--) {
      if (C.normName(sets[i].ex) === k) { $('kg').value = sets[i].kg; $('reps').value = sets[i].reps; updateLive(); break; }
    }
  });

  $('setForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var ex = $('exName').value.trim(), kg = parseFloat($('kg').value), reps = parseInt($('reps').value, 10);
    if (!ex || !(kg >= 0) || !(reps > 0)) return;
    sets.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: todayStr(), ex: ex, kg: kg, reps: reps });
    if (save(sets)) { render(); if (navigator.vibrate) navigator.vibrate(30); $('reps').focus(); }
  });

  // Install prompt (Android Chrome)
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; $('installBtn').hidden = false; });
  $('installBtn').addEventListener('click', function () {
    if (!deferred) return; deferred.prompt(); deferred.userChoice.finally(function () { deferred = null; $('installBtn').hidden = true; });
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  render();
})();
