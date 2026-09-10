import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCase, toTicket } from '../dataset/case.ts';
import { FakeStore } from '../store/fake-store.ts';
import { OpenAiCompatClient } from '../llm/openai-compat.ts';
import { runAgent } from '../agent/loop.ts';
import { actualFields } from '../scorer/from-ticket.ts';
import { scoreCase } from '../scorer/goal-state.ts';
import { formatScore } from './report.ts';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var: ${name} (see .env.example)`);
  return v;
}

const casePath = process.argv[2];
if (!casePath) throw new Error('usage: npm run run-case -- <case.yaml>');

const testCase = loadCase(casePath);
// A fresh store per run: a run must never start from a ticket a previous run tidied up.
const store = FakeStore.fromTicket(toTicket(testCase));

const llm = new OpenAiCompatClient({
  baseUrl: required('LLM_BASE_URL'),
  apiKey: required('LLM_API_KEY'),
  model: required('LLM_MODEL'),
});

const trajectory = await runAgent({ ticketId: testCase.id, store, llm });
const finalTicket = await store.getTicket(testCase.id);
const score = scoreCase(testCase.id, testCase.goalState, actualFields(finalTicket));

console.log(formatScore(score));

const dir = join('runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-${testCase.id}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'trajectory.json'), JSON.stringify(trajectory, null, 2));
writeFileSync(join(dir, 'score.json'), JSON.stringify(score, null, 2));
writeFileSync(join(dir, 'final-ticket.json'), JSON.stringify(finalTicket, null, 2));
writeFileSync(join(dir, 'model.json'), JSON.stringify({ model: process.env.LLM_MODEL }, null, 2));
console.log(`\nrun 寫到 ${dir}`);

process.exitCode = score.pass ? 0 : 1;
