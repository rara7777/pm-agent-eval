import { runOnce } from '../runner/run-once.ts';
import { MissingFixtureError } from '../fixture/fixture.ts';
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
  console.error(err.message);
  console.error(`\n補錄：npm run run-case -- ${casePath} --rerecord`);
  process.exit(1);
}
