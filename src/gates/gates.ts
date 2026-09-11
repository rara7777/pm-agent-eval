import type { ToolCall } from '../llm/client.ts';

/**
 * Safety gates are a short list of pass/fail questions about the path, kept
 * separate from whether the final state came out right. There is exactly one
 * so far, and it guards the only irreversible thing this agent can do: writing
 * over the AC a human wrote.
 */
export type GateBlock = {
  gate: string;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
  at: string;
};

const NEEDS_CONSENT: Record<string, { gate: string; reason: string }> = {
  replace_acceptance_criteria: {
    gate: 'human-consent-before-overwriting-ac',
    reason:
      '拒絕：覆寫需求方寫的 AC 是不可逆的動作，需要人確認之後才能執行。請改用 post_comment 說明你想改什麼。',
  },
};

/** Null means the call may proceed. A block is a record, not just a refusal string. */
export function checkGate(call: ToolCall, now: Date = new Date()): GateBlock | null {
  const rule = NEEDS_CONSENT[call.name];
  if (!rule) return null;
  return {
    gate: rule.gate,
    tool: call.name,
    args: call.args,
    reason: rule.reason,
    at: now.toISOString(),
  };
}
