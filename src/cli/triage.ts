import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadTicketFile } from '../runner/load-ticket.ts';
import { formatProposal } from '../runner/proposal.ts';
import { promptVersion } from '../runner/run-once.ts';
import { FakeStore } from '../store/fake-store.ts';
import { OpenAiCompatClient } from '../llm/openai-compat.ts';
import { runAgent } from '../agent/loop.ts';
import { toolsFor } from '../agent/tools.ts';
import { LiveSource, type LiveConfig } from '../fixture/live-source.ts';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var: ${name} (see .env.example)`);
  return v;
}

function readConfig(path: string, key: 'roots'): string[] {
  if (!existsSync(path)) return [];
  const doc = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  return Array.isArray(doc[key]) ? (doc[key] as unknown[]).map(String) : [];
}

const argv = process.argv.slice(2);
const ticketFlag = argv.indexOf('--ticket');
const ticketPath = ticketFlag === -1 ? undefined : argv[ticketFlag + 1];
if (!ticketPath) throw new Error('usage: npm run triage -- --ticket <file>');

const ticket = loadTicketFile(ticketPath);

const config: LiveConfig = {
  repoRoots: readConfig('config/repos.json', 'roots'),
  docsRoots: readConfig('config/docs-roots.json', 'roots'),
};
const source = new LiveSource(config);
const available = source.availableTools();

// Redmine is not reachable from this process at all. The run happens against an
// in-memory store, so "nothing was written back" is a property of the wiring,
// not a check that could be forgotten.
const store = FakeStore.fromTicket(ticket);
const llm = new OpenAiCompatClient({
  baseUrl: required('LLM_BASE_URL'),
  apiKey: required('LLM_API_KEY'),
  model: required('LLM_MODEL'),
});

console.log(`#${ticket.id} ${ticket.name}`);
console.log(`AC ${ticket.acceptanceCriteria.length} 條　可用的查資料工具：${available.join('、') || '（沒有）'}\n`);

const startedAt = Date.now();
const trajectory = await runAgent({
  ticketId: ticket.id,
  store,
  llm,
  source,
  tools: toolsFor(available),
});
const elapsedMs = Date.now() - startedAt;

const finalTicket = await store.getTicket(ticket.id);
const meta = {
  issueId: ticket.id,
  model: required('LLM_MODEL'),
  promptVersion: promptVersion(),
  at: new Date().toISOString(),
  elapsedMs,
  tokens: { prompt: trajectory.usage.promptTokens, completion: trajectory.usage.completionTokens },
};

// runs-private/ is gitignored: everything under it carries real card content.
const dir = join('runs-private', `${new Date().toISOString().replace(/[:.]/g, '-')}-${ticket.id}`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'proposal.md'), formatProposal(finalTicket, meta, trajectory.blocks) + '\n');
writeFileSync(join(dir, 'trajectory.json'), JSON.stringify(trajectory, null, 2));
writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));

console.log(
  `${(elapsedMs / 1000).toFixed(1)}s　token ${meta.tokens.prompt}+${meta.tokens.completion}　` +
    `標了 ${finalTicket.acFlags.length} 個問題`,
);
console.log(`\n提案寫到 ${join(dir, 'proposal.md')}`);
console.log('Redmine 沒有被動過。要貼 comment 請人看過提案之後自己決定。');
