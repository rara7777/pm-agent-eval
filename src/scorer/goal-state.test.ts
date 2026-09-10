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

const include = (keywords: string[]): FieldSpec => ({ mode: 'must_include', keywords });

test('must_include passes when every keyword is hit', () => {
  const v = compareField('scope_in', include(['優惠碼套用', '後台建立']), [
    '優惠碼套用',
    '後台建立折扣設定',
  ]);
  assert.equal(v.pass, true);
});

test('must_include reports the keyword that is missing', () => {
  const v = compareField('scope_in', include(['優惠碼套用', '過期處理']), ['優惠碼套用']);
  assert.equal(v.pass, false);
  assert.deepEqual(v.missing, ['過期處理']);
});

test('must_include accepts a substring hit', () => {
  // 這正是 Day 10 那個「結帳頁效能」對「結帳頁效能問題」的問題：
  // 降到 must_include 之後它該過，而降檔是 dataset 的一次變更、留 diff。
  const v = compareField('scope_out', include(['結帳頁效能']), ['結帳頁效能問題']);
  assert.equal(v.pass, true);
});

test('must_include with no keywords only checks non-empty', () => {
  assert.equal(compareField('goal', include([]), ['活動期間可用的優惠碼']).pass, true);
  assert.equal(compareField('goal', include([]), []).pass, false);
  assert.equal(compareField('goal', include([]), ['   ']).pass, false);
});

test('must_include never reports unexpected elements', () => {
  const v = compareField('scope_in', include(['優惠碼套用']), ['優惠碼套用', '寄送通知信']);
  assert.equal(v.pass, true);
  assert.deepEqual(v.unexpected, []);
});
