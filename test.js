// Quick e1RM sanity checks: node test.js
var C = require('./calc.js'), assert = require('assert');
function near(a, b, msg) { assert.ok(Math.abs(a - b) < 0.15, msg + ': got ' + a + ', want ' + b); }
near(C.epley(100, 4), 113.33, 'Epley 100x4');
near(C.epley(100, 1), 100, 'Epley single');
near(C.brzycki(100, 4), 109.09, 'Brzycki 100x4');
near(C.rpeE1rm(100, 4, 9.5), 113.9, 'RPE 100x4 @9.5');
near(C.rpeE1rm(100, 1, 10), 100, 'RPE single @10');
assert.strictEqual(C.epley(0, 5), null);
assert.strictEqual(C.suggestNext([{ w: 100, r: 5, rpe: 8 }, { w: 100, r: 5, rpe: 7.5 }]).weight, 102.5);
console.log('all e1RM checks passed');
// v2 coach metrics
assert.strictEqual(C.mondayOf('2026-11-15'), '2026-11-09');
assert.strictEqual(C.mondayOf('2026-11-09'), '2026-11-09');
assert.strictEqual(C.liftCat('Squat (paused)'), 'squat');
assert.ok(C.isMain('Bench Press') && !C.isMain('Bench Press (pin)') && !C.isMain('DB Bench press'));
assert.deepStrictEqual(C.parseRange('6.5-8.5'), { lo: 6.5, hi: 8.5, mid: 7.5 });
var ws = C.weeklyStats([
  { date: '2026-11-09', ex: 'Squat', kg: 100, reps: 5, rpe: 8, trpe: '7-8' },
  { date: '2026-11-10', ex: 'Squat (paused)', kg: 90, reps: 5 },
  { date: '2026-11-16', ex: 'Squat', kg: 105, reps: 5, rpe: 8.5, trpe: '7-8' }
], { '2026-11-09': { sleep: 7, stress: 4, bw: 82 }, '2026-11-11': { sleep: 6, bw: 82.4 } });
assert.strictEqual(ws.length, 2);
assert.strictEqual(ws[0].lifts.squat.sets, 2);
assert.strictEqual(ws[0].lifts.squat.tonnage, 950);
near(ws[0].lifts.squat.rpeDelta, 0.5, 'RPE delta');
near(ws[0].well.sleep, 6.5, 'sleep avg');
near(ws[1].lifts.squat.acwr, 525 / ((950 + 525) / 2), 'ACWR');
console.log('all v2 checks passed');
// cardio: ACSM + heart-rate reserve VO2max estimate
near(C.acsmVo2(10, 1, true), 3.5 + 0.2 * 166.67 + 0.9 * 166.67 * 0.01, 'ACSM run 10 km/h 1%');
near(C.hrMax({ age: 32 }), 185.6, 'Tanaka');
var est = C.vo2maxEstimate({ type: 'Treadmill run', speed: 10, incline: 1, hr: 150 }, { age: 32, restHr: 55 });
near(est, 3.5 + (C.acsmVo2(10, 1, true) - 3.5) / ((150 - 55) / (185.6 - 55)), 'VO2max est');
assert.strictEqual(C.vo2maxEstimate({ type: 'Bike', speed: 25, hr: 150 }, { age: 32, restHr: 55 }), null);
assert.strictEqual(C.vo2maxEstimate({ type: 'Treadmill run', speed: 10, hr: 80 }, { age: 32, restHr: 55 }), null);
near(C.cardioSpeed({ km: 5, min: 30 }), 10, 'speed from distance');
console.log('all cardio checks passed');
