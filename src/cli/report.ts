import type { CaseScore } from '../scorer/goal-state.ts';

/** `-` is what the goal state expected and did not get, `+` is what showed up uninvited. */
export function formatScore(score: CaseScore): string {
  const lines = [`${score.pass ? 'PASS' : 'FAIL'}  ${score.caseId}`];

  for (const f of score.fields) {
    const mark = f.pass === null ? '·' : f.pass ? '✓' : '✗';
    lines.push(`  ${mark} ${f.field} (${f.mode})${f.note ? `  ${f.note}` : ''}`);
    for (const m of f.missing) lines.push(`      - ${m}`);
    for (const u of f.unexpected) lines.push(`      + ${u}`);
  }

  return lines.join('\n');
}
