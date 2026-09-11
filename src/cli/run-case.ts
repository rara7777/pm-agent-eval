import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCase, toTicket } from '../dataset/case.ts';
import { FakeStore } from '../store/fake-store.ts';
import { OpenAiCompatClient } from '../llm/openai-compat.ts';
import { runAgent } from '../agent/loop.ts';
import { actualFields } from '../scorer/from-ticket.ts';
import { scoreCase } from '../scorer/goal-state.ts';
import { formatScore } from './report.ts';
import {
  MissingFixtureError,
  RecordingSource,
  ReplayingSource,
  formatFixture,
  parseFixture,
  type ReadonlySource,
} from '../fixture/fixture.ts';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var: ${name} (see .env.example)`);
  return v;
}

const argv = process.argv.slice(2);
const rerecord = argv.includes('--rerecord');
const casePath = argv.find((a) => !a.startsWith('--'));
if (!casePath) throw new Error('usage: npm run run-case -- <case.yaml> [--rerecord]');

const testCase = loadCase(casePath);
// A fresh store per run: a run must never start from a ticket a previous run tidied up.
const store = FakeStore.fromTicket(toTicket(testCase));

// Re-recording is a deliberate act, never the fallback for a run that went red.
const fixturePath = join('fixtures', `${testCase.id}.yaml`);
const recorded = existsSync(fixturePath);
let source: ReadonlySource;
let recorder: RecordingSource | null = null;

if (recorded && !rerecord) {
  const fixture = parseFixture(readFileSync(fixturePath, 'utf8'));
  source = new ReplayingSource(fixture);
  console.log(`fixture: replay ${fixturePath}（錄於 ${fixture.recordedAt}）\n`);
} else {
  recorder = new RecordingSource(testCase.id);
  source = recorder;
  console.log(`fixture: record ${fixturePath}${recorded ? '（重錄，覆蓋舊的）' : '（第一次）'}\n`);
}

const llm = new OpenAiCompatClient({
  baseUrl: required('LLM_BASE_URL'),
  apiKey: required('LLM_API_KEY'),
  model: required('LLM_MODEL'),
});

let trajectory;
try {
  trajectory = await runAgent({ ticketId: testCase.id, store, llm, source });
} catch (err) {
  if (err instanceof MissingFixtureError) {
    console.error(err.message);
    console.error(`\n補錄：npm run run-case -- ${casePath} --rerecord`);
    process.exit(1);
  }
  throw err;
}

if (recorder) {
  mkdirSync('fixtures', { recursive: true });
  writeFileSync(fixturePath, formatFixture(recorder.toFixture()));
}

const finalTicket = await store.getTicket(testCase.id);
const score = scoreCase(testCase.id, testCase.goalState, actualFields(finalTicket));

console.log(formatScore(score));

const dir = join('runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-${testCase.id}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'trajectory.json'), JSON.stringify(trajectory, null, 2));
writeFileSync(join(dir, 'score.json'), JSON.stringify(score, null, 2));
writeFileSync(join(dir, 'final-ticket.json'), JSON.stringify(finalTicket, null, 2));
writeFileSync(
  join(dir, 'model.json'),
  JSON.stringify(
    { model: process.env.LLM_MODEL, fixture: fixturePath, fixtureMode: recorder ? 'record' : 'replay' },
    null,
    2,
  ),
);
console.log(`\nrun 寫到 ${dir}`);

process.exitCode = score.pass ? 0 : 1;
