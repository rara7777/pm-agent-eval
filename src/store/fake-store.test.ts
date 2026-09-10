import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FakeStore } from './fake-store.ts';
import type { Ticket } from './ticket-store.ts';

const seed = (): Ticket => ({
  id: 'T-1',
  name: '優惠碼功能',
  description: '業務下週要跑活動',
  acceptanceCriteria: ['a', 'b'],
  goal: null,
  scopeIn: [],
  scopeOut: [],
  acFlags: [],
  comments: [],
});

test('updateTicket writes the four blocks and can be rewritten', async () => {
  const store = FakeStore.fromTicket(seed());
  await store.updateTicket('T-1', { goal: 'g1', scopeIn: ['in'] });
  await store.updateTicket('T-1', { goal: 'g2', acFlags: [{ ac: 3, type: 'conflict' }] });

  const t = await store.getTicket('T-1');
  assert.equal(t.goal, 'g2');
  assert.deepEqual(t.scopeIn, ['in']);
  assert.deepEqual(t.acFlags, [{ ac: 3, type: 'conflict' }]);
});

test('updateTicket never touches the requester original text', async () => {
  const store = FakeStore.fromTicket(seed());
  await store.updateTicket('T-1', { goal: 'g' });
  const t = await store.getTicket('T-1');
  assert.deepEqual(t.acceptanceCriteria, ['a', 'b']);
  assert.equal(t.description, '業務下週要跑活動');
});

test('replaceAcceptanceCriteria overwrites the original AC', async () => {
  const store = FakeStore.fromTicket(seed());
  await store.replaceAcceptanceCriteria('T-1', ['x']);
  assert.deepEqual((await store.getTicket('T-1')).acceptanceCriteria, ['x']);
});

test('postComment appends with mentions', async () => {
  const store = FakeStore.fromTicket(seed());
  await store.postComment('T-1', 'AC 3 有兩個問題', ['@pm']);
  const [c] = (await store.getTicket('T-1')).comments;
  assert.equal(c!.body, 'AC 3 有兩個問題');
  assert.deepEqual(c!.mentions, ['@pm']);
});

test('getTicket hands back a copy, not the live object', async () => {
  const store = FakeStore.fromTicket(seed());
  const t = await store.getTicket('T-1');
  t.scopeOut.push('偷改');
  assert.deepEqual((await store.getTicket('T-1')).scopeOut, []);
});

test('an unknown id throws', async () => {
  const store = FakeStore.fromTicket(seed());
  await assert.rejects(() => store.getTicket('T-404'), /T-404/);
});
