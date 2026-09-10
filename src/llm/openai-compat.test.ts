import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { OpenAiCompatClient } from './openai-compat.ts';
import type { LlmMessage } from './client.ts';

function stubFetch(payload: unknown, capture?: (body: any) => void): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    capture?.(JSON.parse(String(init.body)));
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

const client = (payload: unknown, capture?: (b: any) => void) =>
  new OpenAiCompatClient({
    baseUrl: 'http://x/v1',
    apiKey: 'k',
    model: 'm',
    fetchImpl: stubFetch(payload, capture),
  });

test('parses tool calls and decodes their arguments', async () => {
  const reply = await client({
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              id: 'c1',
              type: 'function',
              function: { name: 'update_ticket', arguments: '{"goal":"g"}' },
            },
          ],
        },
      },
    ],
  }).chat([{ role: 'user', content: 'hi' }], []);

  assert.equal(reply.text, null);
  assert.deepEqual(reply.toolCalls, [{ id: 'c1', name: 'update_ticket', args: { goal: 'g' } }]);
});

test('parses a plain text reply with no tool calls', async () => {
  const reply = await client({ choices: [{ message: { content: '整理完了' } }] }).chat(
    [{ role: 'user', content: 'hi' }],
    [],
  );
  assert.equal(reply.text, '整理完了');
  assert.deepEqual(reply.toolCalls, []);
});

test('sends assistant tool calls and tool results back in wire shape', async () => {
  let body: any;
  const messages: LlmMessage[] = [
    { role: 'assistant', content: null, toolCalls: [{ id: 'c1', name: 't', args: { a: 1 } }] },
    { role: 'tool', toolCallId: 'c1', content: 'ok' },
  ];
  await client({ choices: [{ message: { content: 'done' } }] }, (b) => (body = b)).chat(messages, []);

  assert.equal(body.model, 'm');
  assert.deepEqual(body.messages[0].tool_calls, [
    { id: 'c1', type: 'function', function: { name: 't', arguments: '{"a":1}' } },
  ]);
  assert.deepEqual(body.messages[1], { role: 'tool', tool_call_id: 'c1', content: 'ok' });
});

test('a non-200 response throws with the status', async () => {
  const failing = new OpenAiCompatClient({
    baseUrl: 'http://x/v1',
    apiKey: 'k',
    model: 'm',
    fetchImpl: (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch,
  });
  await assert.rejects(() => failing.chat([{ role: 'user', content: 'hi' }], []), /500/);
});
