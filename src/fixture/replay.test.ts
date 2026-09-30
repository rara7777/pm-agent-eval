import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runAgent } from '../agent/loop.ts';
import { FakeStore } from '../store/fake-store.ts';
import type { LlmClient, LlmReply } from '../llm/client.ts';
import type { Ticket } from '../store/ticket-store.ts';
import {
  FillingSource,
  MissingFixtureError,
  RecordingSource,
  ReplayingSource,
  formatFixture,
  parseFixture,
} from './fixture.ts';

const seed = (): Ticket => ({
  id: 'ac-conflict-001',
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
    return this.#script.shift() ?? { text: '寫完了', toolCalls: [] };
  }
}

const asksTwice = (): LlmReply[] => [
  {
    text: null,
    toolCalls: [
      { id: 'a', name: 'search_repo', args: { query: 'promo' } },
      { id: 'b', name: 'query_db', args: { sql: 'select * from coupons limit 5' } },
    ],
  },
  { text: null, toolCalls: [{ id: 'c', name: 'update_ticket', args: { ticket_id: 'ac-conflict-001', goal: '優惠碼' } }] },
];

test('a whole run records what it asked, and a second run replays it', async () => {
  const recorder = new RecordingSource('ac-conflict-001');
  await runAgent({
    ticketId: 'ac-conflict-001',
    store: FakeStore.fromTicket(seed()),
    llm: new ScriptedLlm(asksTwice()),
    source: recorder,
  });
  assert.deepEqual(
    recorder.calls.map((c) => c.tool),
    ['search_repo', 'query_db'],
  );

  const replay = new ReplayingSource(parseFixture(formatFixture(recorder.toFixture())));
  const trajectory = await runAgent({
    ticketId: 'ac-conflict-001',
    store: FakeStore.fromTicket(seed()),
    llm: new ScriptedLlm(asksTwice()),
    source: replay,
  });

  const asked = trajectory.steps
    .filter((s) => s.kind === 'tool_result')
    .filter((s) => s.name !== 'update_ticket');
  assert.equal(asked.length, 2);
  assert.equal(asked[0]?.result, recorder.calls[0]?.response);
  assert.equal(asked[1]?.result, recorder.calls[1]?.response);
});

test('asking the same two things in the other order still replays', async () => {
  const recorder = new RecordingSource('ac-conflict-001');
  await runAgent({
    ticketId: 'ac-conflict-001',
    store: FakeStore.fromTicket(seed()),
    llm: new ScriptedLlm(asksTwice()),
    source: recorder,
  });

  const replay = new ReplayingSource(recorder.toFixture());
  const reversed: LlmReply[] = [
    {
      text: null,
      toolCalls: [
        { id: 'a', name: 'query_db', args: { sql: 'select * from coupons limit 5' } },
        { id: 'b', name: 'search_repo', args: { query: 'promo' } },
      ],
    },
  ];
  const trajectory = await runAgent({
    ticketId: 'ac-conflict-001',
    store: FakeStore.fromTicket(seed()),
    llm: new ScriptedLlm(reversed),
    source: replay,
  });

  const results = trajectory.steps.filter((s) => s.kind === 'tool_result');
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.result.length > 0));
});

test('a run that asks something new fails instead of quietly connecting out', async () => {
  const recorder = new RecordingSource('ac-conflict-001');
  await runAgent({
    ticketId: 'ac-conflict-001',
    store: FakeStore.fromTicket(seed()),
    llm: new ScriptedLlm(asksTwice()),
    source: recorder,
  });

  const replay = new ReplayingSource(recorder.toFixture());
  await assert.rejects(
    () =>
      runAgent({
        ticketId: 'ac-conflict-001',
        store: FakeStore.fromTicket(seed()),
        llm: new ScriptedLlm([
          { text: null, toolCalls: [{ id: 'a', name: 'search_web', args: { query: '沒錄過的問題' } }] },
        ]),
        source: replay,
      }),
    (err: unknown) => {
      assert.ok(err instanceof MissingFixtureError);
      assert.equal(err.tool, 'search_web');
      return true;
    },
  );
});

test('filling answers an unrecorded request from the stub and writes it down', async () => {
  const fixture = { caseId: 'ac-conflict-001', recordedAt: '2026-09-16T00:00:00.000Z', calls: [] };
  const source = new FillingSource(fixture);
  const answer = await source.fetch('read_docs', { query: '優惠碼' });
  assert.equal(answer, '內部文件沒有優惠碼相關章節。');
  assert.deepEqual(source.filled, [{ tool: 'read_docs', args: { query: '優惠碼' }, response: answer }]);
});

test('filling still replays what was recorded and fills nothing', async () => {
  const fixture = {
    caseId: 'ac-conflict-001',
    recordedAt: '2026-09-16T00:00:00.000Z',
    calls: [{ tool: 'read_docs', args: { query: '優惠碼' }, response: '錄下來的回答' }],
  };
  const source = new FillingSource(fixture);
  assert.equal(await source.fetch('read_docs', { query: '優惠碼' }), '錄下來的回答');
  assert.deepEqual(source.filled, []);
});
