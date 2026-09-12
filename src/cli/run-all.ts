import { globSync } from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCase } from '../dataset/case.ts';
import { runOnce, promptVersion } from '../runner/run-once.ts';
import { formatAll, formatChecklist, type CaseRow } from '../runner/report-all.ts';
import { MissingFixtureError } from '../fixture/fixture.ts';
import { compareFlags, sumCounts } from '../scorer/flags.ts';
import { expectedFlags } from '../scorer/goal-state.ts';

const argv = process.argv.slice(2);
const kFlag = argv.indexOf('--k');
const k = kFlag === -1 ? 3 : Number(argv[kFlag + 1]);
if (!Number.isInteger(k) || k < 1) throw new Error(`--k 要是正整數，收到 ${String(argv[kFlag + 1])}`);

const paths = globSync('dataset/*.yaml').sort();
const cases = paths.map((p) => ({ path: p, case: loadCase(p) }));
const ready = cases.filter((c) => Object.keys(c.case.goalState).length > 0);
const waiting = cases.filter((c) => Object.keys(c.case.goalState).length === 0);

const startedAt = new Date();
const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
const batchDir = join('runs', `${stamp}-all`);
mkdirSync(batchDir, { recursive: true });

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

console.log(`${ready.length} 筆 × k=${k}   prompt ${promptVersion()}\n`);

const rows: CaseRow[] = [];
for (const { path, case: testCase } of ready) {
  const annotation = expectedFlags(testCase.goalState);
  const counts = [];
  let passes = 0;
  let flagged: string[] = [];

  for (let i = 1; i <= k; i++) {
    try {
      const run = await runOnce({ casePath: path, outDir: join(batchDir, testCase.id, `run-${i}`) });
      flagged = run.actual.ac_flags ?? [];
      counts.push(compareFlags(annotation, flagged));
      if (run.score.pass) passes += 1;
    } catch (err) {
      if (!(err instanceof MissingFixtureError)) throw err;
      console.error(`  ${testCase.id} run ${i} 停在 fixture 對不上：${err.tool}`);
    }
  }

  rows.push({
    caseId: testCase.id,
    category: testCase.category,
    k,
    passes,
    counts: sumCounts(counts),
    annotation,
    flagged,
  });
  console.log(`  ${testCase.id}  ${passes}/${k} 過`);
}

const report = formatAll(rows, {
  model: process.env.LLM_MODEL ?? '(未設定)',
  promptVersion: promptVersion(),
});
const reportPath = join('runs', `${stamp}-all.md`);
writeFileSync(reportPath, report + '\n');
writeFileSync(join(batchDir, 'all.json'), JSON.stringify({ k, rows }, null, 2));

console.log(`\n總表寫到 ${reportPath}`);
