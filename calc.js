/* Gym Tracker - pure calculation helpers (no DOM). Shared by the app and test.js. */
(function (root) {
  'use strict';

  // Standard RPE chart (RTS / Tuchscherer). Each half-RPE step below 10, or each
  // extra rep, moves one position down this sequence (% of 1RM).
  var RPE_SEQ = [100, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7, 82.4,
    81.1, 79.9, 78.6, 77.4, 76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68.0, 66.7, 65.3, 64.0,
    62.6, 61.3, 59.9, 58.6];

  function num(x) { var n = parseFloat(x); return isFinite(n) ? n : null; }
  function round1(x) { return Math.round(x * 10) / 10; }

  function epley(w, r) {
    w = num(w); r = num(r);
    if (!w || !r || w <= 0 || r <= 0) return null;
    if (r === 1) return w;
    return w * (1 + r / 30);
  }

  function brzycki(w, r) {
    w = num(w); r = num(r);
    if (!w || !r || w <= 0 || r <= 0 || r >= 37) return null;
    return w * 36 / (37 - r);
  }

  // Percentage of 1RM for a given reps @ RPE, or null if outside the chart
  // (reps 1-12, RPE 6.5-10 in 0.5 steps; other RPEs are rounded to the nearest 0.5).
  function rpePercent(r, rpe) {
    r = num(r); rpe = num(rpe);
    if (!r || rpe === null) return null;
    rpe = Math.round(rpe * 2) / 2;
    if (r < 1 || r > 12 || r !== Math.floor(r) || rpe < 6.5 || rpe > 10) return null;
    var idx = (r - 1) * 2 + (10 - rpe) * 2;
    return RPE_SEQ[idx];
  }

  // RPE-adjusted e1RM. Uses the chart; outside it, falls back to Epley on
  // reps + reps-in-reserve. Without RPE returns null.
  function rpeE1rm(w, r, rpe) {
    w = num(w); r = num(r); rpe = num(rpe);
    if (!w || !r || rpe === null || w <= 0 || r <= 0) return null;
    var pct = rpePercent(r, rpe);
    if (pct) return w / (pct / 100);
    var rir = Math.max(0, 10 - rpe);
    return epley(w, r + rir);
  }

  // e1RM for a set under the chosen method: 'epley' | 'brzycki' | 'rpe'.
  // 'rpe' falls back to Epley when the set has no RPE.
  function e1rm(set, method) {
    if (!set) return null;
    if (method === 'brzycki') return brzycki(set.w, set.r);
    if (method === 'rpe') {
      var v = rpeE1rm(set.w, set.r, set.rpe);
      return v !== null ? v : epley(set.w, set.r);
    }
    return epley(set.w, set.r);
  }

  function validSets(ex) {
    return (ex && ex.sets || []).filter(function (s) { return num(s.w) > 0 && num(s.r) > 0; });
  }

  function sessionVolume(ex) {
    return validSets(ex).reduce(function (a, s) { return a + num(s.w) * num(s.r); }, 0);
  }

  function sessionBest(ex, method) {
    var best = null;
    validSets(ex).forEach(function (s) {
      var v = e1rm(s, method);
      if (v !== null && (best === null || v > best)) best = v;
    });
    return best;
  }

  function normName(n) { return String(n || '').trim().toLowerCase().replace(/\s+/g, ' '); }

  // History for one exercise, oldest first: [{date, best, volume, sets, pr}]
  function exerciseHistory(workouts, name, method) {
    var key = normName(name), rows = [];
    (workouts || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; })
      .forEach(function (w) {
        (w.exercises || []).forEach(function (ex) {
          if (normName(ex.name) !== key) return;
          var best = sessionBest(ex, method);
          if (best === null) return;
          rows.push({ date: w.date, best: best, volume: sessionVolume(ex), sets: validSets(ex), pr: false });
        });
      });
    var max = -Infinity;
    rows.forEach(function (row) { if (row.best > max + 1e-9) { row.pr = true; max = row.best; } });
    return rows;
  }

  function daysBetween(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }

  // Plateau: logged at least twice, no e1RM PR for 28+ days, still being trained
  // (a session after the last PR).
  function plateau(history, today, days) {
    days = days || 28;
    if (!history || history.length < 2) return { flag: false };
    var lastPr = null;
    history.forEach(function (h) { if (h.pr) lastPr = h; });
    var last = history[history.length - 1];
    var since = daysBetween(lastPr.date, today);
    var flag = since >= days && last.date > lastPr.date;
    return { flag: flag, daysSincePr: since, lastPrDate: lastPr.date, best: lastPr.best };
  }

  // Progression helper. Looks at the heaviest working sets of the last session.
  // opts: {increment (kg), targetReps (optional)}
  function suggestNext(lastSets, opts) {
    opts = opts || {};
    var inc = num(opts.increment) || 2.5;
    var sets = (lastSets || []).filter(function (s) { return num(s.w) > 0 && num(s.r) > 0; });
    if (!sets.length) return null;
    var top = Math.max.apply(null, sets.map(function (s) { return num(s.w); }));
    var work = sets.filter(function (s) { return num(s.w) === top; });
    var target = num(opts.targetReps);
    if (!target) {
      // default target: most common rep count among the working sets
      var counts = {};
      work.forEach(function (s) { counts[num(s.r)] = (counts[num(s.r)] || 0) + 1; });
      target = +Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || b - a; })[0];
    }
    var allHit = work.every(function (s) { return num(s.r) >= target; });
    var rpes = work.map(function (s) { return num(s.rpe); }).filter(function (x) { return x !== null; });
    var maxRpe = rpes.length ? Math.max.apply(null, rpes) : null;
    var missedBy = Math.max.apply(null, work.map(function (s) { return target - num(s.r); }));

    if (allHit && (maxRpe === null || maxRpe <= 8)) {
      return { weight: round1(top + inc), reps: target, action: 'up',
        reason: 'All ' + work.length + ' sets hit ' + target + ' reps' + (maxRpe === null ? '' : ' at RPE ' + maxRpe + ' or less') + '.' };
    }
    if (!allHit && missedBy >= 2 && maxRpe !== null && maxRpe >= 9.5) {
      var down = Math.round(top * 0.95 / inc) * inc;
      return { weight: round1(down), reps: target, action: 'down',
        reason: 'Missed target by ' + missedBy + ' reps at RPE ' + maxRpe + ': back off ~5%.' };
    }
    return { weight: top, reps: target, action: 'hold',
      reason: allHit ? 'Target hit but RPE ' + maxRpe + ' > 8: repeat the weight.' : 'Not all sets hit ' + target + ' reps: repeat the weight.' };
  }

  var api = { epley: epley, brzycki: brzycki, rpePercent: rpePercent, rpeE1rm: rpeE1rm, e1rm: e1rm,
    sessionVolume: sessionVolume, sessionBest: sessionBest, exerciseHistory: exerciseHistory,
    plateau: plateau, suggestNext: suggestNext, normName: normName, daysBetween: daysBetween, round1: round1 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GymCalc = api;
})(this);
