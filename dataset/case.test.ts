import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { loadCase } from '../src/dataset/case.ts';

test('ac-conflict-001 carries the full original ticket', () => {
  const raw = readFileSync('dataset/ac-conflict-001.yaml', 'utf8');
  const doc = parse(raw) as {
    id: string;
    source: string;
    category: string;
    input: { name: string; description: string; acceptance_criteria: string[] };
  };

  assert.equal(doc.id, 'ac-conflict-001');
  assert.equal(doc.category, 'conflicting-truth');
  // 這行會逐字貼進 Day 9，且「那次漏標」是 facts.md 的禁用寫法。
  assert.equal(doc.source, 'Day 3 推演過的掉法，改一行 prompt 之後最先掉的那條');
  assert.equal(doc.input.acceptance_criteria.length, 7);
  assert.match(doc.input.description, /結帳頁很慢/);
  assert.match(doc.input.acceptance_criteria[2]!, /無限次/);
});

test('ac-conflict-001 pins the four flags as a set', () => {
  const c = loadCase('dataset/ac-conflict-001.yaml');
  assert.deepEqual(c.goalState.ac_flags, {
    mode: 'exact_set',
    values: ['3:conflict', '3:mismatch', '4:unverifiable', '7:unverifiable'],
  });
  // 釘的是集合不是總數：標對 4 個跟標錯 4 個分得出來。
  assert.equal(new Set((c.goalState.ac_flags as { values: string[] }).values).size, 4);
});

test('ac-conflict-001 keeps the ungradable cells written down', () => {
  const c = loadCase('dataset/ac-conflict-001.yaml');
  for (const field of ['comment_wording', 'tool_calls', 'goal_wording']) {
    assert.equal(c.goalState[field]!.mode, 'ignore', `${field} must stay written down`);
  }
});

test('scope_out is must_include, not exact_set', () => {
  // Day 10 的決定：exact_set 只留給 AC 標註集合。
  // 「結帳頁效能」對「結帳頁效能問題」不該紅，而降檔是 dataset 的一次變更、留 diff。
  const c = loadCase('dataset/ac-conflict-001.yaml');
  assert.equal(c.goalState.scope_out!.mode, 'must_include');
});
