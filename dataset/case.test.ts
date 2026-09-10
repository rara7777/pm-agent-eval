import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

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
