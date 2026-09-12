import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LiveSource, NoBackendError, OutsideRootError } from './live-source.ts';

const noHits = async () => '';

test('a tool with no backend throws instead of making something up', async () => {
  const live = new LiveSource({ repoRoots: [], docsRoots: [] }, noHits);
  await assert.rejects(() => live.fetch('search_web', { query: 'x' }), NoBackendError);
  await assert.rejects(() => live.fetch('query_db', { sql: 'select 1' }), NoBackendError);
});

test('the config decides which tools may be offered to the model', () => {
  assert.deepEqual(new LiveSource({ repoRoots: [], docsRoots: [] }).availableTools(), []);
  assert.deepEqual(
    new LiveSource({ repoRoots: ['/a'], docsRoots: ['/b'] }).availableTools(),
    ['search_repo', 'read_docs'],
  );
});

test('grep hits come back with the file and the line number', async () => {
  const live = new LiveSource(
    { repoRoots: [process.cwd()], docsRoots: [] },
    async () => 'src/promo.ts:12:const applyPromoCode = () => {}\n',
  );
  const out = await live.fetch('search_repo', { query: 'promo' });
  assert.match(out, /src\/promo\.ts:12:/);
  assert.match(out, /applyPromoCode/);
});

test('no hits says so instead of coming back empty', async () => {
  const live = new LiveSource({ repoRoots: [process.cwd()], docsRoots: [] }, noHits);
  assert.match(await live.fetch('search_repo', { query: '找不到的東西' }), /找不到符合/);
});

test('the hit list is capped and says that it was', async () => {
  const many = Array.from({ length: 50 }, (_, i) => `f.ts:${i}:命中`).join('\n');
  const live = new LiveSource(
    { repoRoots: [process.cwd()], docsRoots: [], maxHits: 30 },
    async () => many,
  );
  const out = await live.fetch('search_repo', { query: '命中' });
  assert.equal(out.split('\n').filter((l) => l.includes('命中')).length, 30);
  assert.match(out, /只列前 30 筆/);
});

test('reading a doc outside the allowed roots is refused', async () => {
  const root = mkdtempSync(join(tmpdir(), 'docs-'));
  const live = new LiveSource({ repoRoots: [], docsRoots: [root] }, noHits);
  await assert.rejects(() => live.fetch('read_docs', { path: '/etc/hosts' }), OutsideRootError);
});

test('reading a doc inside an allowed root works', async () => {
  const root = mkdtempSync(join(tmpdir(), 'docs-'));
  writeFileSync(join(root, 'promo.md'), '優惠碼的內部文件');
  const live = new LiveSource({ repoRoots: [], docsRoots: [root] }, noHits);
  assert.equal(await live.fetch('read_docs', { path: join(root, 'promo.md') }), '優惠碼的內部文件');
});

test('the redmine wiki source is not wired yet and says so', async () => {
  const live = new LiveSource({ repoRoots: [], docsRoots: ['/tmp'] }, noHits);
  await assert.rejects(() => live.fetch('read_docs', { path: 'redmine://wiki/Promo' }), NoBackendError);
});
