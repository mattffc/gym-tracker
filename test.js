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
