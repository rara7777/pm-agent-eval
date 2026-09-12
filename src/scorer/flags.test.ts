import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compareFlags, precisionRecall, sumCounts } from './flags.ts';

test('the unit is one AC number plus one category, not one AC', () => {
  const c = compareFlags(['3:conflict', '3:mismatch'], ['3:conflict']);
  assert.equal(c.truePositives, 1);
  assert.equal(c.falseNegatives, 1);
  assert.deepEqual(c.missed, ['3:mismatch']);
});

test('the right AC with the wrong category counts as both a miss and an extra', () => {
  const c = compareFlags(['4:unverifiable'], ['4:mismatch']);
  assert.equal(c.truePositives, 0);
  assert.equal(c.falsePositives, 1);
  assert.equal(c.falseNegatives, 1);
  assert.deepEqual(c.missed, ['4:unverifiable']);
  assert.deepEqual(c.extra, ['4:mismatch']);
});

test('the same flag twice is still one flag', () => {
  const c = compareFlags(['3:conflict'], ['3:conflict', '3:conflict']);
  assert.equal(c.truePositives, 1);
  assert.equal(c.falsePositives, 0);
});

test('the first real run: two right, two missed, four extra', () => {
  const expected = ['3:conflict', '3:mismatch', '4:unverifiable', '7:unverifiable'];
  const actual = [
    '2:mismatch',
    '3:conflict',
    '4:mismatch',
    '5:unverifiable',
    '6:mismatch',
    '7:unverifiable',
  ];
  const c = compareFlags(expected, actual);
  assert.equal(c.truePositives, 2);
  assert.equal(c.falseNegatives, 2);
  assert.equal(c.falsePositives, 4);

  const pr = precisionRecall(c);
  assert.ok(Math.abs((pr.precision ?? 0) - 2 / 6) < 1e-9);
  assert.ok(Math.abs((pr.recall ?? 0) - 2 / 4) < 1e-9);
});

test('flagging nothing leaves precision undefined rather than zero', () => {
  const pr = precisionRecall(compareFlags(['3:conflict'], []));
  assert.equal(pr.precision, null);
  assert.equal(pr.recall, 0);
});

test('a case with nothing to find leaves recall undefined', () => {
  const pr = precisionRecall(compareFlags([], ['3:conflict']));
  assert.equal(pr.precision, 0);
  assert.equal(pr.recall, null);
});

test('perfect agreement is 1 and 1', () => {
  const pr = precisionRecall(compareFlags(['3:conflict'], ['3:conflict']));
  assert.equal(pr.precision, 1);
  assert.equal(pr.recall, 1);
  assert.equal(pr.f1, 1);
});

test('the dataset number adds the counts up, it does not average the rates', () => {
  const a = compareFlags(['1:conflict'], ['1:conflict']);
  const b = compareFlags(['2:conflict', '3:conflict'], ['9:mismatch']);
  const total = sumCounts([a, b]);
  assert.equal(total.truePositives, 1);
  assert.equal(total.falsePositives, 1);
  assert.equal(total.falseNegatives, 2);

  const pr = precisionRecall(total);
  assert.equal(pr.precision, 0.5);
  assert.ok(Math.abs((pr.recall ?? 0) - 1 / 3) < 1e-9);
});
