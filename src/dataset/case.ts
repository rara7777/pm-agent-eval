import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { CATEGORIES, type CategoryId } from './categories.ts';
import type { FieldSpec, GoalState } from '../scorer/goal-state.ts';
import type { Ticket } from '../store/ticket-store.ts';

export type Case = {
  id: string;
  source: string;
  category: CategoryId;
  input: { name: string; description: string; acceptanceCriteria: string[] };
  goalState: GoalState;
};

export function loadCase(path: string): Case {
  const doc = parse(readFileSync(path, 'utf8')) as Record<string, any>;

  const category = String(doc.category);
  if (!(category in CATEGORIES)) throw new Error(`unknown category: ${category}`);

  const goalState: GoalState = {};
  for (const [field, raw] of Object.entries(doc.goal_state ?? {})) {
    goalState[field] = parseFieldSpec(field, raw);
  }

  return {
    id: String(doc.id),
    source: String(doc.source),
    category: category as CategoryId,
    input: {
      name: String(doc.input.name),
      description: String(doc.input.description),
      acceptanceCriteria: (doc.input.acceptance_criteria as unknown[]).map(String),
    },
    goalState,
  };
}

function parseFieldSpec(field: string, raw: unknown): FieldSpec {
  const spec = raw as Record<string, unknown>;
  switch (spec?.mode) {
    case 'exact_set':
      return { mode: 'exact_set', values: (spec.values as unknown[]).map(String) };
    case 'must_include':
      return { mode: 'must_include', keywords: (spec.keywords as unknown[]).map(String) };
    case 'ignore':
      return { mode: 'ignore', note: String(spec.note) };
    default:
      throw new Error(`unknown mode on field ${field}: ${String(spec?.mode)}`);
  }
}

export function toTicket(c: Case): Ticket {
  return {
    id: c.id,
    name: c.input.name,
    description: c.input.description,
    acceptanceCriteria: [...c.input.acceptanceCriteria],
    goal: null,
    scopeIn: [],
    scopeOut: [],
    acFlags: [],
    comments: [],
  };
}
