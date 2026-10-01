import type { FlagCounts } from '../scorer/flags.ts';
import { precisionRecall, sumCounts } from '../scorer/flags.ts';

export type CaseRow = {
  caseId: string;
  category: string;
  k: number;
  /** Runs that produced a verdict; a run stopped on a fixture miss does not count. */
  completed: number;
  passes: number;
  /** Summed over the k runs of this case. */
  counts: FlagCounts;
  annotation: string[];
  /** The flags from the last run, so the table shows a concrete set, not a union. */
  flagged: string[];
};

const pct = (v: number | null): string => (v === null ? '—' : `${(v * 100).toFixed(0)}%`);
const list = (xs: string[]): string => (xs.length === 0 ? '—' : xs.join('、'));

/** The Day 17 table: what the author marked, what the agent flagged, and the gap. */
export function formatAll(rows: CaseRow[], meta: { model: string; promptVersion: string }): string {
  const total = sumCounts(rows.map((r) => r.counts));
  const pr = precisionRecall(total);

  const out = [
    `# dataset 全跑 —— AC 標註的 precision／recall`,
    ``,
    `model \`${meta.model}\`　prompt \`${meta.promptVersion}\`　${rows.length} 筆　每筆 k=${rows[0]?.k ?? 0}`,
    ``,
    `整體 precision ${pct(pr.precision)}　recall ${pct(pr.recall)}　F1 ${pct(pr.f1)}`,
    `（單位是「條號＋類別」：對 ${total.truePositives}、漏 ${total.falseNegatives}、多 ${total.falsePositives}）`,
    ``,
    `| case | 類別 | 過/次 | 作者標的 | agent 標的（最後一次） | 漏報 | 多報 | P | R |`,
    `|---|---|---|---|---|---|---|---|---|`,
  ];

  for (const r of rows) {
    const p = precisionRecall(r.counts);
    out.push(
      `| \`${r.caseId}\` | ${r.category} | ${r.passes}/${r.k} | ${list(r.annotation)} | ` +
        `${list(r.flagged)} | ${list(r.counts.missed)} | ${list(r.counts.extra)} | ` +
        `${pct(p.precision)} | ${pct(p.recall)} |`,
    );
  }

  out.push(
    ``,
    `漏報是作者標了而 agent 沒標，多報是 agent 標了而作者沒標。`,
    `每一列的漏報與多報是 k 次的總和，所以同一格可能出現不只一次。`,
  );

  return out.join('\n');
}

export type Release = { release: boolean; k: number; passed: string[]; failed: string[]; incomplete: string[] };

/**
 * The Day 27 threshold: every case passes all k runs. A case missing runs is
 * "incomplete", not failed, and blocks the release on its own line.
 */
export function releaseDecision(rows: Pick<CaseRow, 'caseId' | 'k' | 'completed' | 'passes'>[]): Release {
  const passed: string[] = [];
  const failed: string[] = [];
  const incomplete: string[] = [];
  for (const r of rows) {
    if (r.passes < r.completed) failed.push(r.caseId);
    else if (r.completed < r.k) incomplete.push(r.caseId);
    else passed.push(r.caseId);
  }
  return {
    release: failed.length === 0 && incomplete.length === 0,
    k: rows[0]?.k ?? 0,
    passed,
    failed,
    incomplete,
  };
}

export function formatRelease(d: Release): string {
  const total = d.passed.length + d.failed.length + d.incomplete.length;
  return [
    `${d.release ? '放行' : '擋下'}　門檻 pass^${d.k} ${total}/${total}，這批 pass^${d.k} ${d.passed.length}/${total}`,
    `判定失敗 ${d.failed.length} 筆　評估未完成 ${d.incomplete.length} 筆`,
  ].join('\n');
}

/** The sheet the author fills in by hand: one row per case still missing its goal state. */
export function formatChecklist(
  cases: { id: string; category: string; name: string; description: string; acCount: number }[],
): string {
  const out = [
    `# 待手標的 case`,
    ``,
    `這 ${cases.length} 筆的 \`goal_state\` 還空著。每一筆要填的是這筆通過的條件 ——`,
    `goal／scope_in／scope_out 的 must_include 關鍵字，以及 \`ac_flags\` 的 exact_set。`,
    `\`ac_flags\` 的值寫成「條號:類別」，類別只有 \`conflict\`、\`unverifiable\`、\`mismatch\` 三種。`,
    `同一條 AC 可以有兩個標註，那是兩個值。`,
    ``,
  ];

  for (const c of cases) {
    const firstLine = c.description.trim().split('\n')[0]?.trim() ?? '';
    out.push(
      `## \`${c.id}\``,
      ``,
      `- 類別：${c.category}`,
      `- 卡名：${c.name}`,
      `- description 第一句：${firstLine}`,
      `- AC ${c.acCount} 條`,
      `- [ ] 填完 \`goal_state\``,
      ``,
    );
  }

  out.push(`填完之後跑 \`npm run run-all -- --k 3\`，總表會寫進 \`runs/<ts>-all.md\`。`);
  return out.join('\n');
}
