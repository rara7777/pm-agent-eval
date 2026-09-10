import type { Ticket, TicketPatch, TicketStore } from './ticket-store.ts';

/**
 * In-memory ticket store. Build one per run and throw it away:
 * a run must never start from a ticket a previous run already tidied up.
 */
export class FakeStore implements TicketStore {
  #tickets = new Map<string, Ticket>();

  static fromTicket(ticket: Ticket): FakeStore {
    const store = new FakeStore();
    store.#tickets.set(ticket.id, structuredClone(ticket));
    return store;
  }

  async getTicket(id: string): Promise<Ticket> {
    return structuredClone(this.#must(id));
  }

  async updateTicket(id: string, patch: TicketPatch): Promise<void> {
    Object.assign(this.#must(id), structuredClone(patch));
  }

  async replaceAcceptanceCriteria(id: string, next: string[]): Promise<void> {
    this.#must(id).acceptanceCriteria = [...next];
  }

  async postComment(id: string, body: string, mentions: string[]): Promise<void> {
    this.#must(id).comments.push({ body, mentions: [...mentions], at: new Date().toISOString() });
  }

  #must(id: string): Ticket {
    const t = this.#tickets.get(id);
    if (!t) throw new Error(`no such ticket: ${id}`);
    return t;
  }
}
