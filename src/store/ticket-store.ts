export type FlagType = 'conflict' | 'unverifiable' | 'mismatch';

export type AcFlag = { ac: number; type: FlagType; note?: string };

export type Comment = { body: string; mentions: string[]; at: string };

export type Ticket = {
  id: string;
  name: string;
  /** The requester's original words. The agent never rewrites this. */
  description: string;
  /** The requester's original AC. index + 1 is the number used in flags. */
  acceptanceCriteria: string[];
  goal: string | null;
  scopeIn: string[];
  scopeOut: string[];
  acFlags: AcFlag[];
  comments: Comment[];
};

export type TicketPatch = Partial<Pick<Ticket, 'goal' | 'scopeIn' | 'scopeOut' | 'acFlags'>>;

export interface TicketStore {
  getTicket(id: string): Promise<Ticket>;
  updateTicket(id: string, patch: TicketPatch): Promise<void>;
  replaceAcceptanceCriteria(id: string, next: string[]): Promise<void>;
  postComment(id: string, body: string, mentions: string[]): Promise<void>;
}

export class ReadOnlyStoreError extends Error {}
