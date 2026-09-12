import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatProposal } from './proposal.ts';
import type { Ticket } from '../store/ticket-store.ts';

const meta = {
  issueId: '4821',
  model: 'gpt-5.4-mini',
  promptVersion: 'cd590b9ba593',
  at: '2026-09-13T00:00:00.000Z',
};

const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: '4821',
  name: '退貨流程',
  description: '要重做。',
  acceptanceCriteria: ['退貨體驗要好', '退貨一定要在當天處理完'],
  goal: '讓使用者能自助申請退貨',
  scopeIn: ['訂單頁的申請入口'],
  scopeOut: ['退款金流'],
  acFlags: [{ ac: 1, type: 'unverifiable', note: '沒寫怎樣算好' }],
  comments: [{ body: '整理如下⋯⋯', mentions: ['老王'], at: meta.at }],
  ...over,
});

test('the proposal says up front that nothing was written', () => {
  const md = formatProposal(ticket(), meta);
  assert.match(md, /Redmine 目前一個字都沒有被動過/);
  assert.match(md, /#4821 退貨流程/);
});

test('the flag table shows the AC it points at, not just the number', () => {
  const md = formatProposal(ticket(), meta);
  assert.match(md, /\| 1 \| 退貨體驗要好 \| 無法驗證 \| 沒寫怎樣算好 \|/);
});

test('a flag pointing at an AC that does not exist says so instead of throwing', () => {
  const md = formatProposal(ticket({ acFlags: [{ ac: 9, type: 'conflict' }] }), meta);
  assert.match(md, /找不到這一條/);
});

test('a pipe or a newline inside an AC does not break the table', () => {
  const md = formatProposal(
    ticket({ acceptanceCriteria: ['前面 | 後面\n第二行'], acFlags: [{ ac: 1, type: 'conflict' }] }),
    meta,
  );
  const row = md.split('\n').find((l) => l.startsWith('| 1 |')) ?? '';
  assert.equal(row.split('\\|').length, 2);
  assert.ok(!row.includes('\n'));
});

test('the suggested comment appears in full, with who it would tag', () => {
  const md = formatProposal(ticket(), meta);
  assert.match(md, /整理如下⋯⋯/);
  assert.match(md, /tag：老王/);
});

test('empty blocks say so rather than leaving a blank', () => {
  const md = formatProposal(
    ticket({ goal: null, scopeIn: [], scopeOut: [], acFlags: [], comments: [] }),
    meta,
  );
  assert.equal(md.match(/（沒有寫）/g)?.length, 3);
  assert.match(md, /沒有標出任何問題/);
  assert.match(md, /agent 沒有寫留言/);
});

test('a blocked overwrite is listed, with the promise that it never applies', () => {
  const md = formatProposal(ticket(), meta, [
    {
      gate: 'human-consent-before-overwriting-ac',
      tool: 'replace_acceptance_criteria',
      args: {},
      reason: '拒絕',
      at: meta.at,
    },
  ]);
  assert.match(md, /被 gate 擋下的動作/);
  assert.match(md, /replace_acceptance_criteria/);
  assert.match(md, /永遠不會被套用/);
});

test('elapsed time is shown when it was measured', () => {
  assert.match(formatProposal(ticket(), { ...meta, elapsedMs: 8400 }, []), /8\.4s/);
  assert.ok(!formatProposal(ticket(), meta, []).includes('s\n'.repeat(2)));
});
