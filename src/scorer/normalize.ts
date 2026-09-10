/**
 * The only tolerance the scorer is allowed to have.
 * Anything beyond these three transforms belongs in the dataset,
 * as a field downgraded to must_include with a visible diff.
 */
export function normalize(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, ' ').trim();
}
