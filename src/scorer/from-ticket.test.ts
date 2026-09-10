import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { actualFields } from './from-ticket.ts';
import type { Ticket } from '../store/ticket-store.ts';

const ticket = (over: Partial<Ticket>): Ticket => ({
  id: 'T-1',
  name: 'n',
  description: 'd',
  acceptanceCriteria: [],
  goal: null,
  scopeIn: [],
  scopeOut: [],
  acFlags: [],
  comments: [],
  ...over,
});

test('a string goal folds into a single-element set', () => {
  assert.deepEqual(actualFields(ticket({ goal: '活動期間可用的優惠碼' })).goal, [
    '活動期間可用的優惠碼',
  ]);
});

test('a null or blank goal folds into an empty set', () => {
  assert.deepEqual(actualFields(ticket({ goal: null })).goal, []);
  assert.deepEqual(actualFields(ticket({ goal: '   ' })).goal, []);
});

test('flags become canonical keys, two on one AC stay apart', () => {
  const f = actualFields(
    ticket({
      acFlags: [
        { ac: 3, type: 'conflict' },
        { ac: 3, type: 'mismatch' },
      ],
    }),
  );
  assert.deepEqual(f.ac_flags, ['3:conflict', '3:mismatch']);
});

test('scope arrays pass through', () => {
  const f = actualFields(ticket({ scopeIn: ['優惠碼套用'], scopeOut: ['結帳頁效能'] }));
  assert.deepEqual(f.scope_in, ['優惠碼套用']);
  assert.deepEqual(f.scope_out, ['結帳頁效能']);
});
