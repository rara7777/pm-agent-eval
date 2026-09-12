import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTicketFile } from './load-ticket.ts';

const write = (name: string, body: string): string => {
  const path = join(mkdtempSync(join(tmpdir(), 'ticket-')), name);
  writeFileSync(path, body);
  return path;
};

test('a bare JSON issue loads', () => {
  const t = loadTicketFile(
    write('a.json', JSON.stringify({ id: 4821, subject: '退貨流程', description: '要重做。' })),
  );
  assert.equal(t.id, '4821');
  assert.equal(t.name, '退貨流程');
});

test('the REST envelope loads the same way', () => {
  const t = loadTicketFile(
    write('b.json', JSON.stringify({ issue: { id: 7, subject: '優惠券', description: 'x' } })),
  );
  assert.equal(t.id, '7');
  assert.equal(t.name, '優惠券');
});

test('YAML works too, and the AC comes out split', () => {
  const t = loadTicketFile(
    write('c.yaml', 'id: 12\nsubject: 退貨\ndescription: |\n  要重做。\n\n  ## AC\n  - 甲\n  - 乙\n'),
  );
  assert.deepEqual(t.acceptanceCriteria, ['甲', '乙']);
  assert.equal(t.description, '要重做。');
});

test('the four blocks start empty no matter what the file said', () => {
  const t = loadTicketFile(
    write('d.json', JSON.stringify({ id: 1, subject: 'x', goal: '不該被讀進來' })),
  );
  assert.equal(t.goal, null);
  assert.deepEqual(t.acFlags, []);
});

test('a file with no subject is rejected by name', () => {
  const path = write('e.json', JSON.stringify({ id: 1 }));
  assert.throws(() => loadTicketFile(path), /subject/);
});

test('a file with no id is rejected by name', () => {
  const path = write('f.json', JSON.stringify({ subject: 'x' }));
  assert.throws(() => loadTicketFile(path), /id/);
});
