export type ToolSchema = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

export type LlmMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

/** Token usage as the endpoint reported it, absent when it reported none. */
export type LlmUsage = { promptTokens: number; completionTokens: number };

export type LlmReply = { text: string | null; toolCalls: ToolCall[]; usage?: LlmUsage };

export interface LlmClient {
  chat(messages: LlmMessage[], tools: ToolSchema[]): Promise<LlmReply>;
}
