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

import { scoreCase, type GoalState } from './goal-state.ts';

const promoGoalState: GoalState = {
  goal: { mode: 'must_include', keywords: [] },
  scope_in: { mode: 'must_include', keywords: ['優惠碼套用', '後台建立', '過期處理'] },
  scope_out: { mode: 'must_include', keywords: ['結帳頁效能'] },
  ac_flags: {
    mode: 'exact_set',
    values: ['3:conflict', '3:mismatch', '4:unverifiable', '7:unverifiable'],
  },
  comment_wording: { mode: 'ignore', note: '措辭不比' },
};

const promoActual = {
  goal: ['活動期間可用的優惠碼，前台可套用、後台可建立'],
  scope_in: ['優惠碼套用', '後台建立', '過期處理'],
  scope_out: ['結帳頁效能'],
  ac_flags: ['3:conflict', '3:mismatch', '4:unverifiable', '7:unverifiable'],
  comment_wording: ['隨便寫什麼都不影響'],
};

test('ignore is not graded and never contributes a green light', () => {
  const score = scoreCase('ac-conflict-001', promoGoalState, promoActual);
  const wording = score.fields.find((f) => f.field === 'comment_wording')!;
  assert.equal(wording.pass, null);
  assert.equal(wording.note, '措辭不比');
});

test('a fully correct run passes', () => {
  assert.equal(scoreCase('ac-conflict-001', promoGoalState, promoActual).pass, true);
});

test('an ignored field alone cannot make a case pass', () => {
  const score = scoreCase('x', { only: { mode: 'ignore', note: '判不到' } }, { only: [] });
  // 沒有任何一格被評分，就沒有任何依據說它通過。
  assert.equal(score.pass, false);
});

test('Day 3 的掉法：少掉 3:mismatch 必須紅，且 diff 指得出來', () => {
  const dropped = {
    ...promoActual,
    ac_flags: ['3:conflict', '4:unverifiable', '7:unverifiable'],
  };
  const score = scoreCase('ac-conflict-001', promoGoalState, dropped);
  assert.equal(score.pass, false);
  const flags = score.fields.find((f) => f.field === 'ac_flags')!;
  assert.deepEqual(flags.missing, ['3:mismatch']);
  assert.deepEqual(flags.unexpected, []);
});

test('a field present in actual but absent from the goal state is not graded', () => {
  const score = scoreCase('x', { a: { mode: 'must_include', keywords: [] } }, { a: ['v'], b: ['w'] });
  assert.deepEqual(score.fields.map((f) => f.field), ['a']);
});
