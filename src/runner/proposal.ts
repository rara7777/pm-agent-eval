import type { Ticket } from '../store/ticket-store.ts';
import type { GateBlock } from '../gates/gates.ts';

/**
 * Production mode needs no interception layer: the run already happens against
 * the in-memory store, so Redmine is untouched by construction. What is missing
 * is a human-readable account of what the agent would have written, which is
 * this file. Nothing here reaches Redmine until a person runs the apply step.
 */
export type ProposalMeta = {
  issueId: string;
  model: string;
  promptVersion: string;
  at: string;
  elapsedMs?: number;
  tokens?: { prompt?: number; completion?: number };
};

const FLAG_LABEL: Record<string, string> = {
  conflict: '彼此衝突',
  unverifiable: '無法驗證',
  mismatch: '與描述不符',
};

export function formatProposal(t: Ticket, meta: ProposalMeta, blocks: GateBlock[] = []): string {
  const out = [
    `# 提案：#${meta.issueId} ${t.name}`,
    ``,
    `model \`${meta.model}\`　prompt \`${meta.promptVersion}\`　${meta.at}` +
      (meta.elapsedMs === undefined ? '' : `　${(meta.elapsedMs / 1000).toFixed(1)}s`),
    ``,
    `**Redmine 目前一個字都沒有被動過。** 下面是 agent 想寫回去的東西，`,
    `要套用才會真的寫上去，而且只會寫成一則 comment。`,
    ``,
    `## Goal`,
    ``,
    t.goal?.trim() ? t.goal.trim() : '（沒有寫）',
    ``,
    `## Scope in`,
    ``,
    ...bullets(t.scopeIn),
    ``,
    `## Scope out`,
    ``,
    ...bullets(t.scopeOut),
    ``,
    `## AC 標註`,
    ``,
  ];

  if (t.acFlags.length === 0) {
    out.push('（沒有標出任何問題）');
  } else {
    out.push('| AC | 原文 | 問題 | 說明 |', '|---|---|---|---|');
    for (const f of t.acFlags) {
      const original = t.acceptanceCriteria[f.ac - 1] ?? '（找不到這一條）';
      const label = FLAG_LABEL[f.type] ?? f.type;
      out.push(`| ${f.ac} | ${cell(original)} | ${label} | ${cell(f.note ?? '')} |`);
    }
  }

  out.push(``, `## 建議留言全文`, ``);
  if (t.comments.length === 0) {
    out.push('（agent 沒有寫留言）');
  } else {
    for (const c of t.comments) {
      out.push('```', c.body, '```');
      if (c.mentions.length > 0) out.push(`tag：${c.mentions.join('、')}`);
      out.push('');
    }
  }

  if (blocks.length > 0) {
    out.push(`## 被 gate 擋下的動作`, ``);
    for (const b of blocks) {
      out.push(`- \`${b.tool}\`（${b.gate}）`);
    }
    out.push(``, `需求方寫的 AC 原文永遠不會被套用，只會列在留言裡當建議。`, ``);
  }

  return out.join('\n');
}

const bullets = (xs: string[]): string[] => (xs.length === 0 ? ['（沒有寫）'] : xs.map((x) => `- ${x}`));

/** Keep a table cell on one line: a newline or a pipe inside it breaks the table. */
const cell = (s: string): string => s.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
