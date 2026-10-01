import { globSync } from 'node:fs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCase } from '../dataset/case.ts';
import { runOnce, promptVersion } from '../runner/run-once.ts';
import { formatAll, formatChecklist, formatRelease, releaseDecision, type CaseRow } from '../runner/report-all.ts';
import { MissingFixtureError } from '../fixture/fixture.ts';
import { compareFlags, sumCounts } from '../scorer/flags.ts';
import { expectedFlags } from '../scorer/goal-state.ts';
import { SYSTEM_PROMPT } from '../agent/prompt.ts';

const argv = process.argv.slice(2);
const kFlag = argv.indexOf('--k');
const k = kFlag === -1 ? 3 : Number(argv[kFlag + 1]);
if (!Number.isInteger(k) || k < 1) throw new Error(`--k 要是正整數，收到 ${String(argv[kFlag + 1])}`);

// Same flag as run-k: a before/after over the whole dataset without editing prompt.ts.
const promptFlag = argv.indexOf('--prompt');
const systemPrompt =
  promptFlag === -1 ? undefined : readFileSync(String(argv[promptFlag + 1]), 'utf8');
const version = promptVersion(systemPrompt);
// Unrecorded lookups get the stub's constant answer instead of ending the run.
const fillMissing = argv.includes('--fill-missing');

const paths = globSync('dataset/*.yaml').sort();
const cases = paths.map((p) => ({ path: p, case: loadCase(p) }));
const ready = cases.filter((c) => Object.keys(c.case.goalState).length > 0);
const waiting = cases.filter((c) => Object.keys(c.case.goalState).length === 0);

const startedAt = new Date();
const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
const batchDir = join('runs', `${stamp}-all`);
mkdirSync(batchDir, { recursive: true });
writeFileSync(join(batchDir, 'prompt.txt'), systemPrompt ?? SYSTEM_PROMPT);

if (waiting.length > 0) {
  const checklist = join(batchDir, 'to-annotate.md');
  writeFileSync(
    checklist,
    formatChecklist(
      waiting.map((c) => ({
        id: c.case.id,
        category: c.case.category,
        name: c.case.input.name,
        description: c.case.input.description,
        acCount: c.case.input.acceptanceCriteria.length,
      })),
    ),
  );
  console.log(`${waiting.length} 筆還沒手標，檢查表寫到 ${checklist}\n`);
}

if (ready.length === 0) {
  console.log('沒有一筆 case 填好 goal_state，沒得跑。');
  process.exit(0);
}

console.log(`${ready.length} 筆 × k=${k}   prompt ${version}${fillMissing ? '   補齊 fixture' : ''}\n`);

const rows: CaseRow[] = [];
for (const { path, case: testCase } of ready) {
  const annotation = expectedFlags(testCase.goalState);
  const counts = [];
  let passes = 0;
  let completed = 0;
  let flagged: string[] = [];

  for (let i = 1; i <= k; i++) {
    try {
      const run = await runOnce({ casePath: path, systemPrompt, fillMissing, outDir: join(batchDir, testCase.id, `run-${i}`) });
      flagged = run.actual.ac_flags ?? [];
      counts.push(compareFlags(annotation, flagged));
      completed += 1;
      if (run.score.pass) passes += 1;
    } catch (err) {
      if (!(err instanceof MissingFixtureError)) throw err;
      console.error(`  ${testCase.id} run ${i} 停在 fixture 對不上：${err.tool}`);
      // The stopped run leaves no directory, so its reason is kept beside the ones that finished.
      mkdirSync(join(batchDir, testCase.id), { recursive: true });
      writeFileSync(
        join(batchDir, testCase.id, `run-${i}.fixture-miss.json`),
        JSON.stringify({ tool: err.tool, args: err.args, message: err.message }, null, 2),
      );
    }
  }

  rows.push({
    caseId: testCase.id,
    category: testCase.category,
    k,
    completed,
    passes,
    counts: sumCounts(counts),
    annotation,
    flagged,
  });
  console.log(`  ${testCase.id}  ${passes}/${k} 過`);
}

const report = formatAll(rows, {
  model: process.env.LLM_MODEL ?? '(未設定)',
  promptVersion: version,
});
const decision = releaseDecision(rows);
const verdict = formatRelease(decision);
const reportPath = join('runs', `${stamp}-all.md`);
writeFileSync(reportPath, `${report}\n\n## 放行判定\n\n${verdict.replace('\n', '\n\n')}\n`);
writeFileSync(join(batchDir, 'all.json'), JSON.stringify({ k, rows, release: decision }, null, 2));

console.log(`\n${verdict}`);
console.log(`\n總表寫到 ${reportPath}`);
