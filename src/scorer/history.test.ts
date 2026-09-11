import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { aggregate } from './history.ts';

test('one pass out of three is pass@k but not pass^k', () => {
  const a = aggregate([false, true, false]);
  assert.equal(a.k, 3);
  assert.equal(a.passes, 1);
  assert.equal(a.passAtK, true);
  assert.equal(a.passHatK, false);
  assert.ok(Math.abs(a.passRate - 1 / 3) < 1e-9);
});

test('three out of three is both', () => {
  const a = aggregate([true, true, true]);
  assert.equal(a.passAtK, true);
  assert.equal(a.passHatK, true);
  assert.equal(a.passRate, 1);
});

test('none out of three is neither', () => {
  const a = aggregate([false, false, false]);
  assert.equal(a.passAtK, false);
  assert.equal(a.passHatK, false);
  assert.equal(a.passRate, 0);
});

test('a single run that passed is pass^1 too', () => {
  assert.equal(aggregate([true]).passHatK, true);
});

test('no runs at all is an error, not a silent zero', () => {
  assert.throws(() => aggregate([]), /pass@k/);
});
