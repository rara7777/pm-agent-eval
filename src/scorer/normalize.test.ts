import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalize } from './normalize.ts';

test('trims and collapses whitespace', () => {
  assert.equal(normalize('  優惠碼  套用 '), '優惠碼 套用');
  assert.equal(normalize('後台\n\t建立'), '後台 建立');
});

test('folds fullwidth characters to halfwidth', () => {
  assert.equal(normalize('ＡＢＣ１２３'), 'ABC123');
});

test('does NOT tolerate different wording', () => {
  // 這條是反向測試：容忍度永遠不進 scorer。
  // 要容忍措辭，作法是把那一格降到 must_include，並在 dataset 留下 diff。
  assert.notEqual(normalize('結帳頁效能問題'), normalize('結帳頁效能'));
  assert.notEqual(normalize('優惠券套用'), normalize('優惠碼套用'));
});
