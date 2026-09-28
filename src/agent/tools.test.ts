import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { TOOL_SCHEMAS, dispatch, toolsFor } from './tools.ts';
import { FakeStore } from '../store/fake-store.ts';
import type { Ticket } from '../store/ticket-store.ts';
import { MissingFixtureError, ReplayingSource } from '../fixture/fixture.ts';

const seed = (): Ticket => ({
  id: 'T-1',
  name: '優惠碼功能',
  description: '業務下週要跑活動',
  acceptanceCriteria: ['一人只能用一次', '可以無限次使用'],
  goal: null,
  scopeIn: [],
  scopeOut: [],
  acFlags: [],
  comments: [],
});

test('there are exactly seven tools, four read-only and three writers', () => {
  const names = TOOL_SCHEMAS.map((s) => s.function.name);
  assert.equal(names.length, 7);
  assert.deepEqual(names.slice(0, 4), ['search_web', 'read_docs', 'search_repo', 'query_db']);
  assert.deepEqual(names.slice(4), ['update_ticket', 'replace_acceptance_criteria', 'post_comment']);
});

test('read-only tools answer without touching the store', async () => {
  const store = FakeStore.fromTicket(seed());
  const out = await dispatch({ id: 'c', name: 'search_repo', args: { query: 'promo' } }, store);
  assert.match(out, /promo\.ts/);
  assert.deepEqual((await store.getTicket('T-1')).comments, []);
});

test('update_ticket writes the four blocks including flags', async () => {
  const store = FakeStore.fromTicket(seed());
  await dispatch(
    {
      id: 'c',
      name: 'update_ticket',
      args: {
        ticket_id: 'T-1',
        goal: '活動期間可用的優惠碼',
        scope_in: ['優惠碼套用'],
        scope_out: ['結帳頁效能'],
        ac_flags: [{ ac: 2, type: 'conflict' }],
      },
    },
    store,
  );
  const t = await store.getTicket('T-1');
  assert.equal(t.goal, '活動期間可用的優惠碼');
  assert.deepEqual(t.acFlags, [{ ac: 2, type: 'conflict' }]);
});

test('update_ticket rejects a flag type outside the three', async () => {
  const store = FakeStore.fromTicket(seed());
  const out = await dispatch(
    {
      id: 'c',
      name: 'update_ticket',
      args: { ticket_id: 'T-1', ac_flags: [{ ac: 1, type: 'weird' }] },
    },
    store,
  );
  assert.match(out, /weird/);
  assert.deepEqual((await store.getTicket('T-1')).acFlags, []);
});

test('replace_acceptance_criteria refuses and leaves the AC alone', async () => {
  const store = FakeStore.fromTicket(seed());
  const out = await dispatch(
    {
      id: 'c',
      name: 'replace_acceptance_criteria',
      args: { ticket_id: 'T-1', acceptance_criteria: ['x'] },
    },
    store,
  );
  assert.match(out, /需要人確認/);
  assert.deepEqual((await store.getTicket('T-1')).acceptanceCriteria, [
    '一人只能用一次',
    '可以無限次使用',
  ]);
});

test('post_comment appends a comment that tags nobody', async () => {
  const store = FakeStore.fromTicket(seed());
  await dispatch(
    {
      id: 'c',
      name: 'post_comment',
      args: { ticket_id: 'T-1', body: '有兩條 AC 打架' },
    },
    store,
  );
  assert.equal((await store.getTicket('T-1')).comments.length, 1);
});

test('an unknown tool name comes back as an error string, not a throw', async () => {
  const store = FakeStore.fromTicket(seed());
  assert.match(await dispatch({ id: 'c', name: 'nope', args: {} }, store), /nope/);
});

test('read-only tools go through the source they are given', async () => {
  const store = FakeStore.fromTicket(seed());
  const source = {
    async fetch(tool: string, args: Record<string, unknown>) {
      return `${tool} 被問了 ${JSON.stringify(args)}`;
    },
  };
  const out = await dispatch({ id: 'c', name: 'search_web', args: { query: '優惠碼' } }, store, source);
  assert.equal(out, 'search_web 被問了 {"query":"優惠碼"}');
});

test('a fixture miss fails the run instead of coming back as a tool result', async () => {
  const store = FakeStore.fromTicket(seed());
  const source = new ReplayingSource({ caseId: 'c', recordedAt: 'x', calls: [] });
  await assert.rejects(
    () => dispatch({ id: 'c', name: 'read_docs', args: { path: '/promo' } }, store, source),
    MissingFixtureError,
  );
});

test('a tool with no backend is not offered to the model', () => {
  const names = toolsFor(['search_repo']).map((s) => s.function.name);
  assert.deepEqual(names, [
    'search_repo',
    'update_ticket',
    'replace_acceptance_criteria',
    'post_comment',
  ]);
});

test('with every backend available the list is the whole seven', () => {
  const all = ['search_web', 'read_docs', 'search_repo', 'query_db'];
  assert.equal(toolsFor(all).length, 7);
});
