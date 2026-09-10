import { flagKey } from './goal-state.ts';
import type { Ticket } from '../store/ticket-store.ts';

/**
 * The final state, projected onto the fields a goal state can talk about.
 * Fields with mode `ignore` (comment wording, tool calls) map to nothing here
 * on purpose — there is nothing for the scorer to read.
 */
export function actualFields(t: Ticket): Record<string, string[]> {
  return {
    goal: t.goal && t.goal.trim().length > 0 ? [t.goal] : [],
    scope_in: [...t.scopeIn],
    scope_out: [...t.scopeOut],
    ac_flags: t.acFlags.map(flagKey),
  };
}
