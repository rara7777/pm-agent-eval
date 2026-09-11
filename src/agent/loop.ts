import type { LlmClient, LlmMessage, ToolCall } from '../llm/client.ts';
import type { Ticket, TicketStore } from '../store/ticket-store.ts';
import { SYSTEM_PROMPT } from './prompt.ts';
import { TOOL_SCHEMAS, dispatch } from './tools.ts';
import type { ReadonlySource } from '../fixture/fixture.ts';

export type TrajectoryStep =
  | { kind: 'assistant'; text: string | null; toolCalls: ToolCall[] }
  | { kind: 'tool_result'; name: string; args: Record<string, unknown>; result: string };

export type Trajectory = {
  ticketId: string;
  steps: TrajectoryStep[];
  stoppedBy: 'no_tool_calls' | 'max_turns';
};

export async function runAgent(opts: {
  ticketId: string;
  store: TicketStore;
  llm: LlmClient;
  source?: ReadonlySource;
  maxTurns?: number;
}): Promise<Trajectory> {
  const maxTurns = opts.maxTurns ?? 12;
  const ticket = await opts.store.getTicket(opts.ticketId);

  const messages: LlmMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: renderTicket(ticket) },
  ];
  const steps: TrajectoryStep[] = [];

  for (let turn = 0; turn < maxTurns; turn++) {
    const reply = await opts.llm.chat(messages, TOOL_SCHEMAS);
    steps.push({ kind: 'assistant', text: reply.text, toolCalls: reply.toolCalls });

    if (reply.toolCalls.length === 0) {
      return { ticketId: opts.ticketId, steps, stoppedBy: 'no_tool_calls' };
    }

    messages.push({ role: 'assistant', content: reply.text, toolCalls: reply.toolCalls });

    for (const call of reply.toolCalls) {
      const result = await dispatch(call, opts.store, opts.source);
      steps.push({ kind: 'tool_result', name: call.name, args: call.args, result });
      messages.push({ role: 'tool', toolCallId: call.id, content: result });
    }
  }

  return { ticketId: opts.ticketId, steps, stoppedBy: 'max_turns' };
}

function renderTicket(t: Ticket): string {
  const ac = t.acceptanceCriteria.map((line, i) => `${i + 1}. ${line}`).join('\n');
  return `ticket_id: ${t.id}
name: ${t.name}
description:
${t.description}
AC:
${ac}`;
}
