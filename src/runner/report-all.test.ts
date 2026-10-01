import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { releaseDecision, formatRelease } from './report-all.ts';

const row = (caseId: string, completed: number, passes: number) => ({ caseId, k: 5, completed, passes });

test('every case passing all k runs is released', () => {
  const d = releaseDecision([row('a', 5, 5), row('b', 5, 5)]);
  assert.equal(d.release, true);
  assert.deepEqual(d.passed, ['a', 'b']);
  assert.deepEqual(d.failed, []);
  assert.deepEqual(d.incomplete, []);
});

test('one failed run anywhere blocks the release', () => {
  const d = releaseDecision([row('a', 5, 5), row('b', 5, 4)]);
  assert.equal(d.release, false);
  assert.deepEqual(d.failed, ['b']);
});

test('a missing run with no failure is incomplete, kept apart from failed, and still blocks', () => {
  const d = releaseDecision([row('a', 5, 5), row('b', 4, 4)]);
  assert.equal(d.release, false);
  assert.deepEqual(d.incomplete, ['b']);
  assert.deepEqual(d.failed, []);
});

test('a case that failed a finished run counts as failed even if runs are missing', () => {
  const d = releaseDecision([row('a', 3, 2)]);
  assert.deepEqual(d.failed, ['a']);
  assert.deepEqual(d.incomplete, []);
});

test('the printed verdict names the threshold and the count', () => {
  const blocked = formatRelease(releaseDecision([row('a', 5, 5), row('b', 5, 0), row('c', 4, 4)]));
  assert.match(blocked, /擋下/);
  assert.match(blocked, /pass\^5\s*1\/3/);
  assert.match(blocked, /判定失敗 1 筆/);
  assert.match(blocked, /評估未完成 1 筆/);

  assert.match(formatRelease(releaseDecision([row('a', 5, 5)])), /放行/);
});
