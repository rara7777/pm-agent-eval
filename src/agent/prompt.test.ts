import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SYSTEM_PROMPT } from './prompt.ts';

const DAY3_LINE = '每一條 AC 對三類問題各檢查一次';

test('the Day 3 line is a whole line, nothing else on it', () => {
  // Day 12 刪掉這一行再跑，Day 28 把它收短前後各跑 k 次。
  // 兩天都要求它在 diff 裡是單獨一行的變更，所以它不能被折進別的句子裡。
  const lines = SYSTEM_PROMPT.split('\n').map((l) => l.trim());
  assert.ok(lines.includes(DAY3_LINE), 'the line must exist verbatim, alone on its line');
});

test('the Day 3 line appears exactly once, so deleting one line removes it', () => {
  const hits = SYSTEM_PROMPT.split('\n').filter((l) => l.includes('三類問題各檢查一次'));
  assert.equal(hits.length, 1);
  assert.equal(hits[0]!.trim(), DAY3_LINE);
});

test('the prompt names the three flag types by their enum values', () => {
  for (const t of ['conflict', 'unverifiable', 'mismatch']) {
    assert.match(SYSTEM_PROMPT, new RegExp(t));
  }
});
