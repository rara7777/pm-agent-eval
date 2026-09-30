import { parse, stringify } from 'yaml';
import { READONLY_STUB } from '../agent/readonly-stub.ts';

/** One recorded external call: what was asked, and what came back, verbatim. */
export type FixtureCall = { tool: string; args: Record<string, unknown>; response: string };

export type Fixture = { caseId: string; recordedAt: string; calls: FixtureCall[] };

/**
 * The key is the tool name plus its arguments, never the position in the run.
 * The same card asked twice can ask a different number of questions in a
 * different order, and both are correct; keying on order would compare paths.
 */
export function fixtureKey(tool: string, args: Record<string, unknown>): string {
  return `${tool} ${JSON.stringify(canonical(args))}`;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}

export function parseFixture(text: string): Fixture {
  const doc = parse(text) as Record<string, any>;
  return {
    caseId: String(doc.case),
    recordedAt: String(doc.recorded_at),
    calls: ((doc.calls ?? []) as any[]).map((c) => ({
      tool: String(c.tool),
      args: (c.args ?? {}) as Record<string, unknown>,
      response: String(c.response),
    })),
  };
}

export function formatFixture(f: Fixture): string {
  return stringify({
    case: f.caseId,
    recorded_at: f.recordedAt,
    calls: f.calls.map((c) => ({ tool: c.tool, args: c.args, response: c.response })),
  });
}

/** What the four read-only tools ask the outside world. */
export interface ReadonlySource {
  fetch(tool: string, args: Record<string, unknown>): Promise<string>;
}

/**
 * Today's outside world: the four read-only tools still answer from a canned
 * table. Recording against it exercises the mechanism; swapping in a source
 * that really connects changes nothing above this interface.
 */
export const STUB_SOURCE: ReadonlySource = {
  async fetch(tool) {
    const answer = READONLY_STUB[tool];
    if (answer === undefined) throw new Error(`不是對外查資料的工具：${tool}`);
    return answer;
  },
};

export class MissingFixtureError extends Error {
  readonly tool: string;
  readonly args: Record<string, unknown>;

  constructor(tool: string, args: Record<string, unknown>) {
    super(
      `fixture 對不上，這次問了沒錄過的東西，該補錄了：\n` +
        `  tool: ${tool}\n  參數: ${JSON.stringify(args)}`,
    );
    this.name = 'MissingFixtureError';
    this.tool = tool;
    this.args = args;
  }
}

/** Replay, strict: a request that was never recorded fails the whole run. */
export class ReplayingSource implements ReadonlySource {
  #byKey: Map<string, string>;

  constructor(fixture: Fixture) {
    this.#byKey = new Map(fixture.calls.map((c) => [fixtureKey(c.tool, c.args), c.response]));
  }

  async fetch(tool: string, args: Record<string, unknown>): Promise<string> {
    const hit = this.#byKey.get(fixtureKey(tool, args));
    if (hit === undefined) throw new MissingFixtureError(tool, args);
    return hit;
  }
}

/** Record: ask the real source once per distinct request, keep the answer verbatim. */
export class RecordingSource implements ReadonlySource {
  readonly calls: FixtureCall[] = [];
  #caseId: string;
  #upstream: ReadonlySource;
  #seen = new Set<string>();

  constructor(caseId: string, upstream: ReadonlySource = STUB_SOURCE) {
    this.#caseId = caseId;
    this.#upstream = upstream;
  }

  async fetch(tool: string, args: Record<string, unknown>): Promise<string> {
    const key = fixtureKey(tool, args);
    if (this.#seen.has(key)) {
      return this.calls.find((c) => fixtureKey(c.tool, c.args) === key)!.response;
    }
    const response = await this.#upstream.fetch(tool, args);
    this.#seen.add(key);
    this.calls.push({ tool, args, response });
    return response;
  }

  toFixture(now: Date = new Date()): Fixture {
    return { caseId: this.#caseId, recordedAt: now.toISOString(), calls: [...this.calls] };
  }
}

/**
 * Replay, but a request that was never recorded is answered from a source whose
 * answer cannot depend on the request, and written down. Only sound while that
 * upstream is STUB_SOURCE, which ignores the arguments: the outside world is
 * constant by construction, so filling a gap changes no answer the agent sees.
 * Every filled call lands in the run directory, so nothing is filled silently.
 */
export class FillingSource implements ReadonlySource {
  readonly filled: FixtureCall[] = [];
  #replay: ReplayingSource;
  #upstream: ReadonlySource;

  constructor(fixture: Fixture, upstream: ReadonlySource = STUB_SOURCE) {
    this.#replay = new ReplayingSource(fixture);
    this.#upstream = upstream;
  }

  async fetch(tool: string, args: Record<string, unknown>): Promise<string> {
    try {
      return await this.#replay.fetch(tool, args);
    } catch (err) {
      if (!(err instanceof MissingFixtureError)) throw err;
      const response = await this.#upstream.fetch(tool, args);
      this.filled.push({ tool, args, response });
      return response;
    }
  }
}
