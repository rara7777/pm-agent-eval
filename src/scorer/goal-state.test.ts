import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compareField, flagKey, type FieldSpec } from './goal-state.ts';

const exact = (values: string[]): FieldSpec => ({ mode: 'exact_set', values });

test('exact_set passes on identical sets', () => {
  const v = compareField('scope_out', exact(['結帳頁效能']), ['結帳頁效能']);
  assert.equal(v.pass, true);
  assert.deepEqual(v.missing, []);
  assert.deepEqual(v.unexpected, []);
});

test('exact_set reports a missing element', () => {
  const v = compareField('ac_flags', exact(['3:conflict', '3:mismatch']), ['3:conflict']);
  assert.equal(v.pass, false);
  assert.deepEqual(v.missing, ['3:mismatch']);
  assert.deepEqual(v.unexpected, []);
});

test('exact_set reports an unexpected element', () => {
  const v = compareField('ac_flags', exact(['3:conflict']), ['3:conflict', '5:unverifiable']);
  assert.equal(v.pass, false);
  assert.deepEqual(v.missing, []);
  assert.deepEqual(v.unexpected, ['5:unverifiable']);
});

test('exact_set ignores order and duplicates', () => {
  const v = compareField('scope_in', exact(['a', 'b']), ['b', 'a', 'a']);
  assert.equal(v.pass, true);
});

test('exact_set normalizes before comparing', () => {
  const v = compareField('scope_out', exact(['結帳頁效能']), ['  結帳頁效能 ']);
  assert.equal(v.pass, true);
});

test('flagKey keeps two flags on the same AC apart', () => {
  // Day 2 的「4 個標註」就靠這條：第 3 條掛兩個標註是集合裡兩個元素，不是一個。
  const keys = [flagKey({ ac: 3, type: 'conflict' }), flagKey({ ac: 3, type: 'mismatch' })];
  assert.deepEqual(keys, ['3:conflict', '3:mismatch']);
  assert.equal(new Set(keys).size, 2);
});
