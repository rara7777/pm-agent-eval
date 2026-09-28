import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkGate, isReadOnlySql } from './gates.ts';
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

const tagging = {
  id: 't',
  name: 'post_comment',
  args: { ticket_id: 'T-1', body: '改完了', mentions: ['老王'] },
};

const writeSql = { id: 'q', name: 'query_db', args: { sql: 'DELETE FROM promo_codes' } };

test('every one of the seven tools has a ruling, including the ones left ungated', () => {
  const call = (name: string, args: Record<string, unknown>) => ({ id: 'x', name, args });

  assert.equal(checkGate(overwrite)?.gate, 'human-consent-before-overwriting-ac');
  assert.equal(checkGate(tagging)?.gate, 'human-consent-before-tagging');
  assert.equal(checkGate(writeSql)?.gate, 'read-only-sql');

  assert.equal(checkGate(call('post_comment', { ticket_id: 'T-1', body: '想改 AC' })), null);
  assert.equal(checkGate(call('post_comment', { ticket_id: 'T-1', body: '想改 AC', mentions: [] })), null);
  assert.equal(checkGate(call('query_db', { sql: 'SELECT code FROM promo_codes' })), null);
  assert.equal(checkGate(call('update_ticket', { ticket_id: 'T-1', goal: '重寫' })), null);
  assert.equal(checkGate(call('search_web', { query: '優惠碼' })), null);
  assert.equal(checkGate(call('read_docs', { path: '/promo' })), null);
  assert.equal(checkGate(call('search_repo', { query: 'promo' })), null);
});

test('only a single read-only statement counts as read-only', () => {
  assert.ok(isReadOnlySql('SELECT * FROM promo_codes;'));
  assert.ok(isReadOnlySql('with t as (select 1) select * from t'));
  assert.ok(isReadOnlySql('SELECT updated_at FROM orders'));

  assert.equal(isReadOnlySql('UPDATE promo_codes SET discount_value = 0'), false);
  assert.equal(isReadOnlySql('SELECT 1; DROP TABLE promo_codes'), false);
  assert.equal(isReadOnlySql('WITH gone AS (DELETE FROM promo_codes RETURNING *) SELECT * FROM gone'), false);
  assert.equal(isReadOnlySql(''), false);
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

test('a blocked tag sends nothing and notifies nobody', async () => {
  const store = FakeStore.fromTicket(seed());
  const blocks: GateBlock[] = [];

  const out = await dispatch(tagging, store, undefined, blocks);

  assert.match(out, /拒絕/);
  assert.equal(blocks[0]?.gate, 'human-consent-before-tagging');
  assert.deepEqual((await store.getTicket('T-1')).comments, []);
});

test('a write sent through query_db never reaches the source', async () => {
  const asked: string[] = [];
  const source = {
    async fetch(tool: string) {
      asked.push(tool);
      return '不該被問到';
    },
  };
  const blocks: GateBlock[] = [];

  const out = await dispatch(writeSql, FakeStore.fromTicket(seed()), source, blocks);

  assert.match(out, /唯讀/);
  assert.equal(blocks[0]?.gate, 'read-only-sql');
  assert.deepEqual(asked, []);
});

test('a run that tags someone and writes through query_db carries both blocks', async () => {
  const trajectory = await runAgent({
    ticketId: 'T-1',
    store: FakeStore.fromTicket(seed()),
    llm: new ScriptedLlm([{ text: null, toolCalls: [tagging, writeSql] }]),
  });

  assert.deepEqual(
    trajectory.blocks.map((b) => b.gate),
    ['human-consent-before-tagging', 'read-only-sql'],
  );
});
