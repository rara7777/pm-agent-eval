import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatScore } from './report.ts';

test('a failing field prints what is missing and what was unexpected', () => {
  const out = formatScore({
    caseId: 'ac-conflict-001',
    pass: false,
    fields: [
      {
        field: 'ac_flags',
        mode: 'exact_set',
        pass: false,
        missing: ['3:mismatch'],
        unexpected: ['5:conflict'],
      },
      { field: 'goal', mode: 'must_include', pass: true, missing: [], unexpected: [] },
      { field: 'tool_calls', mode: 'ignore', pass: null, missing: [], unexpected: [], note: '不比' },
    ],
  });

  assert.match(out, /FAIL\s+ac-conflict-001/);
  assert.match(out, /ac_flags/);
  assert.match(out, /-\s*3:mismatch/);
  assert.match(out, /\+\s*5:conflict/);
  assert.match(out, /tool_calls/);
  assert.match(out, /不比/);
});

test('an all-green case prints PASS', () => {
  const out = formatScore({
    caseId: 'x',
    pass: true,
    fields: [{ field: 'goal', mode: 'must_include', pass: true, missing: [], unexpected: [] }],
  });
  assert.match(out, /PASS\s+x/);
});
