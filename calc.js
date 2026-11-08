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

    var cap = num(opts.maxRpe) || 8;
    if (allHit && (maxRpe === null || maxRpe <= cap)) {
      return { weight: round1(top + inc), reps: target, action: 'up',
        reason: 'All ' + work.length + ' sets hit ' + target + ' reps' + (maxRpe === null ? '' : ' at RPE ' + maxRpe + (maxRpe < cap ? ' (target ' + cap + ')' : '')) + '.' };
    }
    if (!allHit && missedBy >= 2 && maxRpe !== null && maxRpe >= 9.5) {
      var down = Math.round(top * 0.95 / inc) * inc;
      return { weight: round1(down), reps: target, action: 'down',
        reason: 'Missed target by ' + missedBy + ' reps at RPE ' + maxRpe + ': back off ~5%.' };
    }
    return { weight: top, reps: target, action: 'hold',
      reason: allHit ? 'Target hit but RPE ' + maxRpe + ' > ' + cap + ': repeat the weight.' : 'Not all sets hit ' + target + ' reps: repeat the weight.' };
  }

  // ---- Block / coach metrics (v2) ----

  function addDays(date, n) {
    var d = new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000);
    return d.toISOString().slice(0, 10);
  }
  // Monday of the week containing date (YYYY-MM-DD).
  function mondayOf(date) {
    var dow = new Date(Date.parse(date + 'T00:00:00Z')).getUTCDay(); // 0 = Sunday
    return addDays(date, -((dow + 6) % 7));
  }
  // The three competition lifts. Variants ("Squat (paused)") count towards the
  // lift's volume but not its e1RM.
  var MAIN = { squat: 'Squat', bench: 'Bench Press', deadlift: 'Deadlift' };
  function liftCat(name) {
    var n = normName(name);
    if (/^squat\b/.test(n)) return 'squat';
    if (/^bench press\b/.test(n)) return 'bench';
    if (/^deadlift\b/.test(n)) return 'deadlift';
    return null;
  }
  function isMain(name) {
    var c = liftCat(name);
    return !!c && normName(name) === normName(MAIN[c]);
  }
  // "6.5-8.5" -> {lo: 6.5, hi: 8.5, mid: 7.5}; "8" -> {lo: 8, hi: 8, mid: 8}
  function parseRange(x) {
    var m = String(x == null ? '' : x).match(/(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/);
    if (!m) return null;
    var lo = parseFloat(m[1]), hi = m[2] ? parseFloat(m[2]) : lo;
    return { lo: lo, hi: hi, mid: (lo + hi) / 2 };
  }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }

  // Weekly coach metrics. sets: [{date, ex, kg, reps, rpe, trpe}] (trpe = target RPE string),
  // well: {date: {sleep, stress, bw}}. Returns weeks oldest first:
  // {week, lifts: {squat|bench|deadlift: {sets, reps, tonnage, rpe, rpeDelta, intensity, best, acwr}},
  //  total: {sets, reps, tonnage, acwr}, well: {sleep, stress, bw, days}}
  function weeklyStats(sets, well) {
    var weeks = {};
    function wk(date) {
      var k = mondayOf(date);
      return weeks[k] || (weeks[k] = { week: k, lifts: {}, total: { sets: 0, reps: 0, tonnage: 0 }, _well: [] });
    }
    var sorted = (sets || []).filter(function (s) { return num(s.kg) >= 0 && num(s.reps) > 0 && s.date; })
      .slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var running = {}; // best e1RM of each main lift so far, for relative intensity
    sorted.forEach(function (s) {
      var w = wk(s.date), kg = num(s.kg), r = num(s.reps), cat = liftCat(s.ex);
      w.total.sets++; w.total.reps += r; w.total.tonnage += kg * r;
      if (!cat) return;
      var L = w.lifts[cat] || (w.lifts[cat] = { sets: 0, reps: 0, tonnage: 0, _rpe: [], _d: [], _int: [], best: null });
      L.sets++; L.reps += r; L.tonnage += kg * r;
      if (num(s.rpe) !== null) {
        L._rpe.push(num(s.rpe));
        var t = parseRange(s.trpe);
        if (t) L._d.push(num(s.rpe) - t.mid);
      }
      if (isMain(s.ex)) {
        var e = e1rm({ w: kg, r: r, rpe: s.rpe }, 'rpe');
        if (e !== null) {
          if (L.best === null || e > L.best) L.best = e;
          if (!running[cat] || e > running[cat]) running[cat] = e;
        }
      }
      if (running[cat]) L._int.push(kg / running[cat]);
    });
    Object.keys(well || {}).forEach(function (d) { var x = well[d]; if (x) wk(d)._well.push(x); });
    var list = Object.keys(weeks).sort().map(function (k) { return weeks[k]; });
    list.forEach(function (w, i) {
      Object.keys(w.lifts).forEach(function (c) {
        var L = w.lifts[c];
        L.rpe = mean(L._rpe); L.rpeDelta = mean(L._d); L.intensity = mean(L._int);
        delete L._rpe; delete L._d; delete L._int;
      });
      var pick = function (f) { return mean(w._well.map(function (x) { return num(x[f]); }).filter(function (v) { return v !== null; })); };
      w.well = { sleep: pick('sleep'), stress: pick('stress'), bw: pick('bw'), days: w._well.length };
      delete w._well;
      // ACWR: this week's tonnage / mean weekly tonnage over the last 4 weeks (incl. this one).
      var win = list.slice(Math.max(0, i - 3), i + 1);
      var acwr = function (get) {
        if (win.length < 2) return null;
        var c = mean(win.map(get)); return c ? get(w) / c : null;
      };
      w.total.acwr = acwr(function (x) { return x.total.tonnage; });
      Object.keys(w.lifts).forEach(function (c) {
        w.lifts[c].acwr = acwr(function (x) { return x.lifts[c] ? x.lifts[c].tonnage : 0; });
      });
    });
    return list;
  }

  // Best e1RM of a main lift within [from, to] (inclusive dates), or null.
  function bestE1rmBetween(sets, cat, from, to) {
    var b = null;
    (sets || []).forEach(function (s) {
      if (!isMain(s.ex) || liftCat(s.ex) !== cat || s.date < from || s.date > to) return;
      var e = e1rm({ w: s.kg, r: s.reps, rpe: s.rpe }, 'rpe');
      if (e !== null && (b === null || e > b)) b = e;
    });
    return b;
  }

  // Plain-English coach signals from weekly stats (latest week vs earlier).
  function signals(weeks, sets, today) {
    var out = [], last = weeks[weeks.length - 1];
    if (!last) return out;
    ['squat', 'bench', 'deadlift'].forEach(function (c) {
      var now = bestE1rmBetween(sets, c, addDays(today, -27), today);
      var before = bestE1rmBetween(sets, c, addDays(today, -55), addDays(today, -28));
      if (now !== null && before !== null) {
        var d = now - before, name = MAIN[c];
        out.push({ kind: d > 1 ? 'good' : d < -1 ? 'bad' : 'flat',
          text: name + ' e1RM ' + (d >= 0 ? '+' : '') + round1(d) + ' kg vs the 4 weeks before (' + round1(now) + ' kg)' });
      }
      var L = last.lifts[c];
      if (L && L.rpeDelta !== null && Math.abs(L.rpeDelta) >= 0.75) {
        out.push({ kind: L.rpeDelta > 0 ? 'bad' : 'good',
          text: MAIN[c] + ' felt ' + (L.rpeDelta > 0 ? 'harder' : 'easier') + ' than planned this week (RPE ' +
            (L.rpeDelta > 0 ? '+' : '') + round1(L.rpeDelta) + ' vs target)' });
      }
    });
    if (last.total.acwr !== null && last.total.acwr > 1.3) out.push({ kind: 'bad', text: 'Workload spike: this week is ' + round1(last.total.acwr) + 'x your 4-week average (ACWR)' });
    if (last.well.sleep !== null && last.well.sleep < 7) out.push({ kind: 'bad', text: 'Sleep averaging ' + round1(last.well.sleep) + ' h this week' });
    if (last.well.stress !== null && last.well.stress >= 7) out.push({ kind: 'bad', text: 'Stress averaging ' + round1(last.well.stress) + '/10 this week' });
    return out;
  }

  var api = { epley: epley, brzycki: brzycki, rpePercent: rpePercent, rpeE1rm: rpeE1rm, e1rm: e1rm,
    sessionVolume: sessionVolume, sessionBest: sessionBest, exerciseHistory: exerciseHistory,
    plateau: plateau, suggestNext: suggestNext, normName: normName, daysBetween: daysBetween, round1: round1,
    addDays: addDays, mondayOf: mondayOf, liftCat: liftCat, isMain: isMain, MAIN: MAIN, parseRange: parseRange,
    mean: mean, weeklyStats: weeklyStats, bestE1rmBetween: bestE1rmBetween, signals: signals };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GymCalc = api;
})(this);
