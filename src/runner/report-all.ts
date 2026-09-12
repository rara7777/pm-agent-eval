import type { FlagCounts } from '../scorer/flags.ts';
import { precisionRecall, sumCounts } from '../scorer/flags.ts';

export type CaseRow = {
  caseId: string;
  category: string;
  k: number;
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
