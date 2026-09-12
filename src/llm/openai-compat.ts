import type { LlmClient, LlmMessage, LlmReply, ToolSchema } from './client.ts';

type Options = {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
};

/** Works against OpenAI and against ollama's OpenAI-compatible endpoint. */
export class OpenAiCompatClient implements LlmClient {
  #o: Options;

  constructor(options: Options) {
    this.#o = options;
  }

  async chat(messages: LlmMessage[], tools: ToolSchema[]): Promise<LlmReply> {
    const body = {
      model: this.#o.model,
      messages: messages.map(toWire),
      ...(tools.length > 0 ? { tools } : {}),
    };

    const doFetch = this.#o.fetchImpl ?? fetch;
    const res = await doFetch(`${this.#o.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.#o.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`llm request failed: ${res.status} ${await res.text()}`);
    }

    const json = (await res.json()) as any;
    const message = json.choices?.[0]?.message ?? {};
    const toolCalls = (message.tool_calls ?? []).map((c: any) => ({
      id: String(c.id),
      name: String(c.function.name),
      args: JSON.parse(c.function.arguments || '{}') as Record<string, unknown>,
    }));

    const u = json.usage;
    const usage =
      u && typeof u.prompt_tokens === 'number' && typeof u.completion_tokens === 'number'
        ? { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens }
        : undefined;

    return { text: message.content ?? null, toolCalls, ...(usage ? { usage } : {}) };
  }
}

function toWire(m: LlmMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  }
  if (m.role === 'assistant') {
    return {
      role: 'assistant',
      content: m.content,
      ...(m.toolCalls?.length
        ? {
            tool_calls: m.toolCalls.map((c) => ({
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: JSON.stringify(c.args) },
            })),
          }
        : {}),
    };
  }
  return { role: m.role, content: m.content };
}
