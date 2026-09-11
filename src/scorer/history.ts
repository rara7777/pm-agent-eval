/**
 * What k runs of the same case add up to. k is the number of reruns.
 *
 * `pass@k` asks whether it managed it at least once, `pass^k` whether it
 * managed it every time. A dataset can look healthy on the first and still be
 * unusable on the second, which is the whole reason for keeping a history.
 */
export type Aggregate = {
  k: number;
  passes: number;
  passAtK: boolean;
  passHatK: boolean;
  passRate: number;
};

export function aggregate(results: boolean[]): Aggregate {
  const k = results.length;
  if (k === 0) throw new Error('沒有跑過任何一次，算不出 pass@k');
  const passes = results.filter(Boolean).length;
  return {
    k,
    passes,
    passAtK: passes > 0,
    passHatK: passes === k,
    passRate: passes / k,
  };
}
