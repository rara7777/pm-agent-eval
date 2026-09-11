import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCase, toTicket, type Case } from '../dataset/case.ts';
import { FakeStore } from '../store/fake-store.ts';
import { OpenAiCompatClient } from '../llm/openai-compat.ts';
import { runAgent, type Trajectory } from '../agent/loop.ts';
import { SYSTEM_PROMPT } from '../agent/prompt.ts';
import { actualFields } from '../scorer/from-ticket.ts';
import { scoreCase, type CaseScore } from '../scorer/goal-state.ts';
import {
  RecordingSource,
  ReplayingSource,
  formatFixture,
  parseFixture,
  type ReadonlySource,
} from '../fixture/fixture.ts';

export type RunResult = {
  score: CaseScore;
  trajectory: Trajectory;
  dir: string;
  fixtureMode: 'record' | 'replay';
  promptVersion: string;
};

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var: ${name} (see .env.example)`);
  return v;
}

/**
 * Which prompt produced a run. A score history is only readable if a batch can
 * be told apart from the batch on the other side of a prompt change.
 */
export function promptVersion(prompt: string = SYSTEM_PROMPT): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 12);
}

export function fixturePathFor(caseId: string): string {
  return join('fixtures', `${caseId}.yaml`);
}

/** Replay unless there is nothing recorded yet, or a re-record was asked for. */
export function openFixture(
  testCase: Case,
  rerecord: boolean,
): { source: ReadonlySource; recorder: RecordingSource | null; recordedAt: string | null } {
  const path = fixturePathFor(testCase.id);
  if (existsSync(path) && !rerecord) {
    const fixture = parseFixture(readFileSync(path, 'utf8'));
    return { source: new ReplayingSource(fixture), recorder: null, recordedAt: fixture.recordedAt };
  }
  const recorder = new RecordingSource(testCase.id);
  return { source: recorder, recorder, recordedAt: null };
}

export function writeFixture(recorder: RecordingSource, caseId: string): void {
  mkdirSync('fixtures', { recursive: true });
  writeFileSync(fixturePathFor(caseId), formatFixture(recorder.toFixture()));
}

export async function runOnce(opts: {
  casePath: string;
  rerecord?: boolean;
  /** Where the run lands. Defaults to a timestamped directory under runs/. */
  outDir?: string;
}): Promise<RunResult> {
  const testCase = loadCase(opts.casePath);
  // A fresh store per run: a run must never start from a ticket a previous run tidied up.
  const store = FakeStore.fromTicket(toTicket(testCase));
  const { source, recorder } = openFixture(testCase, opts.rerecord ?? false);

  const llm = new OpenAiCompatClient({
    baseUrl: required('LLM_BASE_URL'),
    apiKey: required('LLM_API_KEY'),
    model: required('LLM_MODEL'),
  });

  const startedAt = new Date();
  const trajectory = await runAgent({ ticketId: testCase.id, store, llm, source });
  if (recorder) writeFixture(recorder, testCase.id);

  const finalTicket = await store.getTicket(testCase.id);
  const score = scoreCase(testCase.id, testCase.goalState, actualFields(finalTicket));

  const dir =
    opts.outDir ??
    join('runs', `${startedAt.toISOString().replace(/[:.]/g, '-')}-${testCase.id}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'trajectory.json'), JSON.stringify(trajectory, null, 2));
  writeFileSync(join(dir, 'score.json'), JSON.stringify(score, null, 2));
  writeFileSync(join(dir, 'final-ticket.json'), JSON.stringify(finalTicket, null, 2));
  // Written every run, empty or not: "no gate fired" is also a result worth keeping.
  writeFileSync(join(dir, 'gate-blocks.json'), JSON.stringify(trajectory.blocks, null, 2));
  writeFileSync(
    join(dir, 'model.json'),
    JSON.stringify(
      {
        model: process.env.LLM_MODEL,
        promptVersion: promptVersion(),
        fixture: fixturePathFor(testCase.id),
        fixtureMode: recorder ? 'record' : 'replay',
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  return {
    score,
    trajectory,
    dir,
    fixtureMode: recorder ? 'record' : 'replay',
    promptVersion: promptVersion(),
  };
}
