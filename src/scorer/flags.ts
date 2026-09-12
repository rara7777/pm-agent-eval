/**
 * How close the agent's flags came to the ones the author marked by hand.
 *
 * Two different things share the word 標註 in this project: the flag the agent
 * hangs on one AC, and the annotation the author wrote into a goal state. This
 * module compares one against the other, and the unit is a single AC number
 * plus a single category — the same AC flagged for two different problems is
 * two units, because missing the second one is exactly the failure worth
 * measuring.
 */
export type FlagCounts = {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  /** Annotations the agent did not flag. */
  missed: string[];
  /** Flags the agent invented. */
  extra: string[];
};

export function compareFlags(annotation: string[], flagged: string[]): FlagCounts {
  const expected = new Set(annotation);
  const actual = new Set(flagged);

  const missed = [...expected].filter((k) => !actual.has(k));
  const extra = [...actual].filter((k) => !expected.has(k));

  return {
    truePositives: [...actual].filter((k) => expected.has(k)).length,
    falsePositives: extra.length,
    falseNegatives: missed.length,
    missed,
    extra,
  };
}

export function sumCounts(all: FlagCounts[]): FlagCounts {
  return all.reduce<FlagCounts>(
    (acc, c) => ({
      truePositives: acc.truePositives + c.truePositives,
      falsePositives: acc.falsePositives + c.falsePositives,
      falseNegatives: acc.falseNegatives + c.falseNegatives,
      missed: [...acc.missed, ...c.missed],
      extra: [...acc.extra, ...c.extra],
    }),
    { truePositives: 0, falsePositives: 0, falseNegatives: 0, missed: [], extra: [] },
  );
}

/**
 * `null` means the question was never asked: precision has no value when the
 * agent flagged nothing, recall has none when there was nothing to find.
 * Reporting those as 0 would read as a failure that did not happen.
 */
export type PrecisionRecall = { precision: number | null; recall: number | null; f1: number | null };

export function precisionRecall(c: FlagCounts): PrecisionRecall {
  const predicted = c.truePositives + c.falsePositives;
  const relevant = c.truePositives + c.falseNegatives;

  const precision = predicted === 0 ? null : c.truePositives / predicted;
  const recall = relevant === 0 ? null : c.truePositives / relevant;
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);

  return { precision, recall, f1 };
}
