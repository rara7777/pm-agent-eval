import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runOnce, promptVersion, fixturePathFor } from '../runner/run-once.ts';
import { MissingFixtureError } from '../fixture/fixture.ts';
import { SYSTEM_PROMPT } from '../agent/prompt.ts';
import { aggregate } from '../scorer/history.ts';
import { loadCase } from '../dataset/case.ts';

const argv = process.argv.slice(2);
const casePath = argv.find((a) => !a.startsWith('--'));
if (!casePath) throw new Error('usage: npm run run-k -- <case.yaml> [--k 5]');

const kFlag = argv.indexOf('--k');
const k = kFlag === -1 ? 3 : Number(argv[kFlag + 1]);
if (!Number.isInteger(k) || k < 1) throw new Error(`--k 要是正整數，收到 ${String(argv[kFlag + 1])}`);

const caseId = loadCase(casePath).id;
const version = promptVersion();
const startedAt = new Date();
const batchDir = join(
  'runs',
  `${startedAt.toISOString().replace(/[:.]/g, '-')}-${caseId}-k${k}-${version}`,
);
mkdirSync(batchDir, { recursive: true });
// The prompt goes in beside the scores: a later before/after needs both halves.
writeFileSync(join(batchDir, 'prompt.txt'), SYSTEM_PROMPT);

console.log(`${caseId} × ${k}   prompt ${version}   → ${batchDir}\n`);

const runs: { dir: string; pass: boolean }[] = [];
for (let i = 1; i <= k; i++) {
  try {
    const run = await runOnce({ casePath, outDir: join(batchDir, `run-${i}`) });
    runs.push({ dir: run.dir, pass: run.score.pass });
    console.log(`  run ${i}/${k}  ${run.score.pass ? 'PASS' : 'FAIL'}`);
  } catch (err) {
    if (!(err instanceof MissingFixtureError)) throw err;
    console.error(`\n  run ${i}/${k} 停在 fixture 對不上：\n${err.message}`);
    console.error(`\n補錄：npm run run-case -- ${casePath} --rerecord`);
    process.exit(1);
  }
}

const summary = aggregate(runs.map((r) => r.pass));
const batch = {
  caseId,
  model: process.env.LLM_MODEL,
  promptVersion: version,
  fixture: fixturePathFor(caseId),
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  runs,
  ...summary,
};
writeFileSync(join(batchDir, 'batch.json'), JSON.stringify(batch, null, 2));

console.log(
  `\n${summary.passes}/${summary.k} 過   pass@${k} ${summary.passAtK ? '✓' : '✗'}   ` +
    `pass^${k} ${summary.passHatK ? '✓' : '✗'}`,
);
console.log(`\nbatch 寫到 ${batchDir}`);

process.exitCode = summary.passHatK ? 0 : 1;
