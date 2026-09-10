import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadCase, toTicket } from './case.ts';

function write(yaml: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'case-')), 'c.yaml');
  writeFileSync(path, yaml, 'utf8');
  return path;
}

const full = `
id: demo-001
source: 手寫的
category: conflicting-truth
input:
  name: 優惠碼功能
  description: |
    業務下週要跑活動
  acceptance_criteria:
    - 一人只能用一次
    - 可以無限次使用
goal_state:
  goal: { mode: must_include, keywords: [] }
  ac_flags:
    mode: exact_set
    values: [2:conflict]
  tool_calls: { mode: ignore, note: 查了幾次不比 }
`;

test('loadCase reads input and goal state', () => {
  const c = loadCase(write(full));
  assert.equal(c.id, 'demo-001');
  assert.equal(c.category, 'conflicting-truth');
  assert.equal(c.input.acceptanceCriteria.length, 2);
  assert.deepEqual(c.goalState.ac_flags, { mode: 'exact_set', values: ['2:conflict'] });
  assert.deepEqual(c.goalState.tool_calls, { mode: 'ignore', note: '查了幾次不比' });
});

test('a case without goal_state loads with an empty goal state', () => {
  // Day 9 先進 input-only 的版本，Day 10 才補 goal_state。
  const c = loadCase(write(full.split('goal_state:')[0]!));
  assert.deepEqual(c.goalState, {});
});

test('an unknown category is rejected', () => {
  assert.throws(() => loadCase(write(full.replace('conflicting-truth', 'nope'))), /nope/);
});

test('an unknown mode is rejected', () => {
  assert.throws(() => loadCase(write(full.replace('exact_set', 'roughly_equal'))), /roughly_equal/);
});

test('toTicket seeds an untouched ticket', () => {
  const t = toTicket(loadCase(write(full)));
  assert.equal(t.id, 'demo-001');
  assert.equal(t.goal, null);
  assert.deepEqual(t.scopeIn, []);
  assert.deepEqual(t.acFlags, []);
  assert.deepEqual(t.comments, []);
  assert.equal(t.acceptanceCriteria.length, 2);
});
