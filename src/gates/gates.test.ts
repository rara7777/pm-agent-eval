import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkGate } from './gates.ts';
import { dispatch } from '../agent/tools.ts';
import { runAgent } from '../agent/loop.ts';
import { FakeStore } from '../store/fake-store.ts';
import type { GateBlock } from './gates.ts';
import type { LlmClient, LlmReply } from '../llm/client.ts';
import type { Ticket } from '../store/ticket-store.ts';

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

class ScriptedLlm implements LlmClient {
  #script: LlmReply[];
  constructor(script: LlmReply[]) {
    this.#script = [...script];
  }
  async chat(): Promise<LlmReply> {
    return this.#script.shift() ?? { text: '好，我改用留言', toolCalls: [] };
  }
}

const overwrite = {
  id: 'a',
  name: 'replace_acceptance_criteria',
  args: { ticket_id: 'T-1', acceptance_criteria: ['整理過的第一條'] },
};

test('overwriting the requester AC needs consent, everything else passes', () => {
  assert.ok(checkGate(overwrite));
  assert.equal(checkGate({ id: 'b', name: 'post_comment', args: { ticket_id: 'T-1' } }), null);
  assert.equal(checkGate({ id: 'c', name: 'update_ticket', args: { ticket_id: 'T-1' } }), null);
});

test('a block names the gate, the tool, the arguments and when it happened', () => {
  const block = checkGate(overwrite, new Date('2026-09-11T04:00:00.000Z'));
  assert.equal(block?.gate, 'human-consent-before-overwriting-ac');
  assert.equal(block?.tool, 'replace_acceptance_criteria');
  assert.deepEqual(block?.args, overwrite.args);
  assert.equal(block?.at, '2026-09-11T04:00:00.000Z');
});

test('the blocked call leaves the requester AC untouched', async () => {
  const store = FakeStore.fromTicket(seed());
  const blocks: GateBlock[] = [];

  const out = await dispatch(overwrite, store, undefined, blocks);

  assert.match(out, /拒絕/);
  assert.equal(blocks.length, 1);
  assert.deepEqual((await store.getTicket('T-1')).acceptanceCriteria, [
    '一人只能用一次',
    '可以無限次使用',
  ]);
});

test('a run that tried it carries the block in its trajectory', async () => {
  const trajectory = await runAgent({
    ticketId: 'T-1',
    store: FakeStore.fromTicket(seed()),
    llm: new ScriptedLlm([{ text: null, toolCalls: [overwrite] }]),
  });

  assert.equal(trajectory.blocks.length, 1);
  assert.equal(trajectory.blocks[0]?.gate, 'human-consent-before-overwriting-ac');
});

test('a run that never tried it carries no block', async () => {
  const trajectory = await runAgent({
    ticketId: 'T-1',
    store: FakeStore.fromTicket(seed()),
    llm: new ScriptedLlm([
      { text: null, toolCalls: [{ id: 'a', name: 'post_comment', args: { ticket_id: 'T-1', body: '想改 AC' } }] },
    ]),
  });

  assert.deepEqual(trajectory.blocks, []);
});
