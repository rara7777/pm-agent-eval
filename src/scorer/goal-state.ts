import { normalize } from './normalize.ts';

export type Mode = 'exact_set' | 'must_include' | 'ignore';

export type FieldSpec =
  | { mode: 'exact_set'; values: string[] }
  | { mode: 'must_include'; keywords: string[] }
  | { mode: 'ignore'; note: string };

export type FieldVerdict = {
  field: string;
  mode: Mode;
  /** null means "not graded" — an ignored field never contributes a green light. */
  pass: boolean | null;
  missing: string[];
  unexpected: string[];
  note?: string;
};

export function flagKey(flag: { ac: number; type: string }): string {
  return `${flag.ac}:${flag.type}`;
}

export function compareField(field: string, spec: FieldSpec, actual: string[]): FieldVerdict {
  if (spec.mode === 'exact_set') {
    const expected = new Set(spec.values.map(normalize));
    const got = new Set(actual.map(normalize));
    const missing = [...expected].filter((v) => !got.has(v));
    const unexpected = [...got].filter((v) => !expected.has(v));
    return {
      field,
      mode: 'exact_set',
      pass: missing.length === 0 && unexpected.length === 0,
      missing,
      unexpected,
    };
  }
  if (spec.mode === 'must_include') {
    const got = actual.map(normalize).filter((v) => v.length > 0);
    if (spec.keywords.length === 0) {
      return { field, mode: 'must_include', pass: got.length > 0, missing: [], unexpected: [] };
    }
    const missing = spec.keywords
      .map(normalize)
      .filter((kw) => !got.some((v) => v.includes(kw)));
    return { field, mode: 'must_include', pass: missing.length === 0, missing, unexpected: [] };
  }

  return { field, mode: 'ignore', pass: null, missing: [], unexpected: [], note: spec.note };
}

export type GoalState = Record<string, FieldSpec>;
export type CaseScore = { caseId: string; pass: boolean; fields: FieldVerdict[] };

export function scoreCase(
  caseId: string,
  goalState: GoalState,
  actual: Record<string, string[]>,
): CaseScore {
  const fields = Object.entries(goalState).map(([field, spec]) =>
    compareField(field, spec, actual[field] ?? []),
  );
  const graded = fields.filter((f) => f.pass !== null);
  // No graded field means nothing was checked — that is not a pass.
  const pass = graded.length > 0 && graded.every((f) => f.pass === true);
  return { caseId, pass, fields };
}

/** The author's annotation for a case: the AC flags its goal state expects. */
export function expectedFlags(goalState: GoalState): string[] {
  const spec = goalState.ac_flags;
  return spec?.mode === 'exact_set' ? [...spec.values] : [];
}
