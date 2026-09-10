import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runAgent } from './loop.ts';
import { FakeStore } from '../store/fake-store.ts';
import type { LlmClient, LlmMessage, LlmReply } from '../llm/client.ts';
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
  seen: LlmMessage[][] = [];
  #script: LlmReply[];
  constructor(script: LlmReply[]) {
    this.#script = [...script];
  }
  async chat(messages: LlmMessage[]): Promise<LlmReply> {
    this.seen.push([...messages]);
    return this.#script.shift() ?? { text: '沒話說了', toolCalls: [] };
  }
}

test('runs until the model stops calling tools', async () => {
  const llm = new ScriptedLlm([
    { text: null, toolCalls: [{ id: 'a', name: 'search_repo', args: { query: 'promo' } }] },
    {
      text: null,
      toolCalls: [
        {
          id: 'b',
          name: 'update_ticket',
          args: { ticket_id: 'T-1', goal: '優惠碼', ac_flags: [{ ac: 2, type: 'conflict' }] },
        },
      ],
    },
    { text: '整理完了', toolCalls: [] },
  ]);
  const store = FakeStore.fromTicket(seed());

  const traj = await runAgent({ ticketId: 'T-1', store, llm });

  assert.equal(traj.stoppedBy, 'no_tool_calls');
  assert.equal((await store.getTicket('T-1')).goal, '優惠碼');
  assert.deepEqual(
    traj.steps.filter((s) => s.kind === 'tool_result').map((s) => s.name),
    ['search_repo', 'update_ticket'],
  );
});

test('the ticket body reaches the model in the first user message', async () => {
  const llm = new ScriptedLlm([{ text: 'done', toolCalls: [] }]);
  await runAgent({ ticketId: 'T-1', store: FakeStore.fromTicket(seed()), llm });

  const first = llm.seen[0]!;
  assert.equal(first[0]!.role, 'system');
  const user = first[1] as { role: 'user'; content: string };
  assert.match(user.content, /優惠碼功能/);
  assert.match(user.content, /2\. 可以無限次使用/);
});

test('stops at maxTurns instead of looping forever', async () => {
  const forever = new ScriptedLlm(
    Array.from({ length: 20 }, () => ({
      text: null,
      toolCalls: [{ id: 'x', name: 'search_web', args: { query: 'q' } }],
    })),
  );
  const traj = await runAgent({
    ticketId: 'T-1',
    store: FakeStore.fromTicket(seed()),
    llm: forever,
    maxTurns: 3,
  });
  assert.equal(traj.stoppedBy, 'max_turns');
  assert.equal(traj.steps.filter((s) => s.kind === 'assistant').length, 3);
});

test('a tool error is fed back to the model instead of crashing the run', async () => {
  const llm = new ScriptedLlm([
    { text: null, toolCalls: [{ id: 'a', name: 'nope', args: {} }] },
    { text: 'ok', toolCalls: [] },
  ]);
  const traj = await runAgent({ ticketId: 'T-1', store: FakeStore.fromTicket(seed()), llm });
  const result = traj.steps.find((s) => s.kind === 'tool_result')!;
  assert.match(result.result, /nope/);
  assert.equal(traj.stoppedBy, 'no_tool_calls');
});
