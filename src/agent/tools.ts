import type { ToolCall, ToolSchema } from '../llm/client.ts';
import type { AcFlag, FlagType, TicketStore } from '../store/ticket-store.ts';
import { READONLY_STUB } from './readonly-stub.ts';
import { STUB_SOURCE, type ReadonlySource } from '../fixture/fixture.ts';

const READONLY_TOOLS = new Set(Object.keys(READONLY_STUB));

const FLAG_TYPES: FlagType[] = ['conflict', 'unverifiable', 'mismatch'];

const stringList = { type: 'array', items: { type: 'string' } };

const readOnly = (name: string, description: string, argName: string): ToolSchema => ({
  type: 'function',
  function: {
    name,
    description,
    parameters: {
      type: 'object',
      properties: { [argName]: { type: 'string' } },
      required: [argName],
    },
  },
});

export const TOOL_SCHEMAS: ToolSchema[] = [
  readOnly('search_web', '搜尋網路上的公開資料。', 'query'),
  readOnly('read_docs', '讀內部文件。', 'path'),
  readOnly('search_repo', '搜尋 codebase。', 'query'),
  readOnly('query_db', '對資料庫下唯讀查詢。', 'sql'),
  {
    type: 'function',
    function: {
      name: 'update_ticket',
      description:
        '寫回整理後的卡：Goal、Scope in、Scope out、AC 標註。可以重複呼叫覆寫自己寫過的內容。',
      parameters: {
        type: 'object',
        properties: {
          ticket_id: { type: 'string' },
          goal: { type: 'string' },
          scope_in: stringList,
          scope_out: stringList,
          ac_flags: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ac: { type: 'integer', description: 'AC 條號，從 1 開始' },
                type: { type: 'string', enum: FLAG_TYPES },
                note: { type: 'string' },
              },
              required: ['ac', 'type'],
            },
          },
        },
        required: ['ticket_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_acceptance_criteria',
      description: '覆寫需求方親手寫的 AC 原文。破壞性、不可逆，必須先得到人的同意。',
      parameters: {
        type: 'object',
        properties: { ticket_id: { type: 'string' }, acceptance_criteria: stringList },
        required: ['ticket_id', 'acceptance_criteria'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'post_comment',
      description: '在卡上留言。tag 到的人會立刻收到通知，送出後收不回。',
      parameters: {
        type: 'object',
        properties: {
          ticket_id: { type: 'string' },
          body: { type: 'string' },
          mentions: stringList,
        },
        required: ['ticket_id', 'body'],
      },
    },
  },
];

export async function dispatch(
  call: ToolCall,
  store: TicketStore,
  source: ReadonlySource = STUB_SOURCE,
): Promise<string> {
  // A missing fixture must fail the whole run, so this sits outside the catch below.
  if (READONLY_TOOLS.has(call.name)) return source.fetch(call.name, call.args);

  const args = call.args as Record<string, any>;
  const ticketId = String(args.ticket_id ?? '');

  try {
    switch (call.name) {
      case 'update_ticket': {
        const flags = args.ac_flags as AcFlag[] | undefined;
        if (flags) {
          for (const f of flags) {
            if (!FLAG_TYPES.includes(f.type)) {
              return `錯誤：標註類別只能是 ${FLAG_TYPES.join('、')}，收到 ${String(f.type)}`;
            }
          }
        }
        await store.updateTicket(ticketId, {
          ...(args.goal !== undefined ? { goal: String(args.goal) } : {}),
          ...(args.scope_in !== undefined
            ? { scopeIn: (args.scope_in as unknown[]).map(String) }
            : {}),
          ...(args.scope_out !== undefined
            ? { scopeOut: (args.scope_out as unknown[]).map(String) }
            : {}),
          ...(flags !== undefined ? { acFlags: flags } : {}),
        });
        return '已寫回卡上。';
      }

      case 'replace_acceptance_criteria':
        // Day 22 會把這條抽成 src/gates/。最小版就先拒絕，
        // 不能推一個預設會覆寫需求方 AC 的東西到公開 repo。
        return '拒絕：覆寫需求方寫的 AC 是不可逆的動作，需要人確認之後才能執行。請改用 post_comment 說明你想改什麼。';

      case 'post_comment':
        await store.postComment(ticketId, String(args.body), (args.mentions ?? []).map(String));
        return '留言已送出，tag 到的人已經收到通知。';

      default:
        return `錯誤：沒有這個工具 ${call.name}`;
    }
  } catch (err) {
    return `錯誤：${err instanceof Error ? err.message : String(err)}`;
  }
}
