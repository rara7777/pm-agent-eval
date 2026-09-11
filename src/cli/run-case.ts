import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runOnce, fixturePathFor } from '../runner/run-once.ts';
import { MissingFixtureError } from '../fixture/fixture.ts';
import { loadCase } from '../dataset/case.ts';
import { formatScore } from './report.ts';

const argv = process.argv.slice(2);
const rerecord = argv.includes('--rerecord');
const casePath = argv.find((a) => !a.startsWith('--'));
if (!casePath) throw new Error('usage: npm run run-case -- <case.yaml> [--rerecord]');

try {
  const run = await runOnce({ casePath, rerecord });
  console.log(`fixture: ${run.fixtureMode}   prompt: ${run.promptVersion}\n`);
  console.log(formatScore(run.score));
  console.log(`\nrun 寫到 ${run.dir}`);
  process.exitCode = run.score.pass ? 0 : 1;
} catch (err) {
  if (!(err instanceof MissingFixtureError)) throw err;
  // A run stopped by the fixture is a result too, and the request it stopped on
  // is the only record of what the agent newly asked. Keep it.
  const caseId = loadCase(casePath).id;
  const dir = join('runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-${caseId}-fixture-miss`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'fixture-miss.json'),
    JSON.stringify(
      {
        caseId,
        tool: err.tool,
        args: err.args,
        model: process.env.LLM_MODEL,
        fixture: fixturePathFor(caseId),
        at: new Date().toISOString(),
        message: err.message,
      },
      null,
      2,
    ),
  );
  console.error(err.message);
  console.error(`\n寫到 ${dir}`);
  console.error(`補錄：npm run run-case -- ${casePath} --rerecord`);
  process.exit(1);
}
