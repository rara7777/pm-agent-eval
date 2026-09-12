import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { issueToTicket, type RedmineIssue } from '../store/redmine-mapping.ts';
import type { Ticket } from '../store/ticket-store.ts';

/**
 * A ticket file is whatever Claude Code dumped out of the Redmine MCP: either
 * the issue object itself, or the `{ issue: {...} }` envelope the REST API
 * uses. YAML parses JSON too, so one reader covers both spellings.
 *
 * This agent never talks to Redmine. Somebody else fetches the card, this reads
 * the file, and the two halves meet nowhere else.
 */
export function loadTicketFile(path: string): Ticket {
  const doc = parse(readFileSync(path, 'utf8')) as Record<string, unknown> | null;
  if (!doc || typeof doc !== 'object') throw new Error(`${path} 讀不出一張卡`);

  const raw = ('issue' in doc ? doc.issue : doc) as Partial<RedmineIssue>;
  if (raw?.subject === undefined) throw new Error(`${path} 少了 subject，這不像一張 Redmine 卡`);
  if (raw.id === undefined) throw new Error(`${path} 少了 id`);

  return issueToTicket({
    id: raw.id,
    subject: String(raw.subject),
    ...(raw.description === undefined ? {} : { description: String(raw.description) }),
    ...(raw.custom_fields === undefined ? {} : { custom_fields: raw.custom_fields }),
  });
}
