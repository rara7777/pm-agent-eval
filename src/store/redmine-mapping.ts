import type { Ticket } from './ticket-store.ts';

/**
 * A Redmine issue keeps the AC inside the description, while this agent's
 * `Ticket` keeps them apart. Cutting them apart is guesswork on someone else's
 * formatting, so the rule here is deliberately narrow: find a heading that says
 * "acceptance criteria" in one of the few spellings people actually use, take
 * the list items under it, and stop at the next heading. Anything it does not
 * recognise stays in the description untouched — a card with no AC is a real
 * result, and inventing AC out of prose would be worse than reporting none.
 */

const LABELS = ['ac', 'acceptance criteria', '驗收條件', '驗收標準', '完成條件', '驗收項目'];

/** `## AC`, `h2. Acceptance Criteria`, `**驗收條件**`, `AC：` — all the same thing. */
const HEADING = new RegExp(
  String.raw`^\s*(?:#{1,6}\s*|h[1-6]\.\s*|\*\*\s*)?(${LABELS.join('|')})\s*(?:\*\*)?\s*[:：]?\s*$`,
  'i',
);

/** Any heading at all, used only to find where the AC block ends. */
const ANY_HEADING = /^\s*(?:#{1,6}\s+|h[1-6]\.\s+)/;

// `#` is deliberately absent: it is a heading in markdown and a numbered list
// item in textile, and one line cannot say which.
const LIST_ITEM = /^\s*(?:[-*+]\s*(?:\[[ xX]\]\s*)?|\(?\d+[.)）]\s*|（\d+）\s*)(.+)$/;

export type SplitResult = { description: string; acceptanceCriteria: string[] };

export function splitAcceptanceCriteria(body: string): SplitResult {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((l) => HEADING.test(l));
  if (start === -1) return { description: body, acceptanceCriteria: [] };

  const items: string[] = [];
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (ANY_HEADING.test(line) || HEADING.test(line)) {
      end = i;
      break;
    }
    const m = LIST_ITEM.exec(line);
    if (m?.[1]) items.push(m[1].trim());
  }

  // Nothing recognised under the heading: leave the card exactly as it came.
  if (items.length === 0) return { description: body, acceptanceCriteria: [] };

  const kept = [...lines.slice(0, start), ...lines.slice(end)];
  return { description: trimBlankEdges(kept).join('\n'), acceptanceCriteria: items };
}

function trimBlankEdges(lines: string[]): string[] {
  const out = [...lines];
  while (out.length > 0 && (out[0] ?? '').trim() === '') out.shift();
  while (out.length > 0 && (out[out.length - 1] ?? '').trim() === '') out.pop();
  return out;
}

/** The shape this code reads off a Redmine issue. Everything else is ignored. */
export type RedmineIssue = {
  id: number | string;
  subject: string;
  description?: string;
  custom_fields?: { id?: number; name?: string; value?: unknown }[];
};

/**
 * A ticket as it arrives, before the agent has written anything. The four
 * blocks it produces start empty, exactly as they do for a case from the
 * dataset, so the same loop cannot tell the two apart.
 */
export function issueToTicket(issue: RedmineIssue): Ticket {
  const body = typeof issue.description === 'string' ? issue.description : '';
  const fromField = acFromCustomField(issue.custom_fields);
  const split = splitAcceptanceCriteria(body);

  return {
    id: String(issue.id),
    name: issue.subject,
    description: fromField.length > 0 ? body : split.description,
    acceptanceCriteria: fromField.length > 0 ? fromField : split.acceptanceCriteria,
    goal: null,
    scopeIn: [],
    scopeOut: [],
    acFlags: [],
    comments: [],
  };
}

function acFromCustomField(fields: RedmineIssue['custom_fields']): string[] {
  const hit = (fields ?? []).find((f) => LABELS.includes((f.name ?? '').trim().toLowerCase()));
  const raw = typeof hit?.value === 'string' ? hit.value : '';
  if (raw.trim() === '') return [];

  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const items = lines.map((l) => LIST_ITEM.exec(l)?.[1]?.trim()).filter((v): v is string => !!v);
  // A field holding one criterion per line, with no markers at all, is still a list.
  return items.length > 0 ? items : lines.map((l) => l.trim()).filter((l) => l.length > 0);
}
