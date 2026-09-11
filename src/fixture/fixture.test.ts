import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  MissingFixtureError,
  RecordingSource,
  ReplayingSource,
  fixtureKey,
  formatFixture,
  parseFixture,
  type ReadonlySource,
} from './fixture.ts';

class CountingSource implements ReadonlySource {
  calls = 0;
  #answers: string[];
  constructor(answers: string[]) {
    this.#answers = [...answers];
  }
  async fetch(): Promise<string> {
    this.calls += 1;
    return this.#answers.shift() ?? '沒有更多答案';
  }
}

test('the key is tool name plus arguments, not the order of the call', () => {
  assert.equal(
    fixtureKey('search_repo', { query: 'promo' }),
    fixtureKey('search_repo', { query: 'promo' }),
  );
  assert.notEqual(
    fixtureKey('search_repo', { query: 'promo' }),
    fixtureKey('read_docs', { query: 'promo' }),
  );
  assert.notEqual(
    fixtureKey('search_repo', { query: 'promo' }),
    fixtureKey('search_repo', { query: 'coupon' }),
  );
});

test('argument order inside the object does not change the key', () => {
  assert.equal(
    fixtureKey('query_db', { sql: 'select 1', limit: 5 }),
    fixtureKey('query_db', { limit: 5, sql: 'select 1' }),
  );
});

test('replay answers a recorded request with the recorded response', async () => {
  const source = new ReplayingSource({
    caseId: 'ac-conflict-001',
    recordedAt: '2026-09-11T00:00:00.000Z',
    calls: [{ tool: 'search_repo', args: { query: 'promo' }, response: 'promo.ts 三個月前' }],
  });
  assert.equal(await source.fetch('search_repo', { query: 'promo' }), 'promo.ts 三個月前');
});

test('replay answers regardless of the order the calls come in', async () => {
  const source = new ReplayingSource({
    caseId: 'c',
    recordedAt: '2026-09-11T00:00:00.000Z',
    calls: [
      { tool: 'search_repo', args: { query: 'promo' }, response: '第一份' },
      { tool: 'read_docs', args: { path: '/promo' }, response: '第二份' },
    ],
  });
  assert.equal(await source.fetch('read_docs', { path: '/promo' }), '第二份');
  assert.equal(await source.fetch('search_repo', { query: 'promo' }), '第一份');
});

test('replay is strict: a request that was never recorded fails and names itself', async () => {
  const source = new ReplayingSource({
    caseId: 'c',
    recordedAt: '2026-09-11T00:00:00.000Z',
    calls: [{ tool: 'search_repo', args: { query: 'promo' }, response: '錄過的' }],
  });

  await assert.rejects(
    () => source.fetch('search_web', { query: '沒錄過' }),
    (err: unknown) => {
      assert.ok(err instanceof MissingFixtureError);
      assert.equal(err.tool, 'search_web');
      assert.deepEqual(err.args, { query: '沒錄過' });
      assert.match(err.message, /search_web/);
      assert.match(err.message, /沒錄過/);
      return true;
    },
  );
});

test('recording asks the outside world once per distinct request', async () => {
  const upstream = new CountingSource(['第一份', '第二份']);
  const rec = new RecordingSource('ac-conflict-001', upstream);

  assert.equal(await rec.fetch('search_repo', { query: 'promo' }), '第一份');
  assert.equal(await rec.fetch('search_repo', { query: 'promo' }), '第一份');
  assert.equal(await rec.fetch('read_docs', { path: '/promo' }), '第二份');

  assert.equal(upstream.calls, 2);
  assert.equal(rec.calls.length, 2);
});

test('a recording carries the case id and the date it was recorded', () => {
  const rec = new RecordingSource('ac-conflict-001', new CountingSource([]));
  const fixture = rec.toFixture(new Date('2026-09-11T01:47:45.125Z'));
  assert.equal(fixture.caseId, 'ac-conflict-001');
  assert.equal(fixture.recordedAt, '2026-09-11T01:47:45.125Z');
});

test('a recording written out and read back replays the same answers', async () => {
  const rec = new RecordingSource('ac-conflict-001', new CountingSource(['原封不動的回應']));
  await rec.fetch('query_db', { sql: 'select * from coupons limit 5' });

  const text = formatFixture(rec.toFixture(new Date('2026-09-11T01:47:45.125Z')));
  const replay = new ReplayingSource(parseFixture(text));

  assert.equal(
    await replay.fetch('query_db', { sql: 'select * from coupons limit 5' }),
    '原封不動的回應',
  );
});

test('the written file keeps the case, the recording date and the calls', () => {
  const rec = new RecordingSource('ac-conflict-001', new CountingSource(['回應']));
  const text = formatFixture({
    caseId: 'ac-conflict-001',
    recordedAt: '2026-09-11T01:47:45.125Z',
    calls: [{ tool: 'search_repo', args: { query: 'promo' }, response: '回應' }],
  });
  assert.match(text, /case: ac-conflict-001/);
  assert.match(text, /recorded_at: /);
  assert.match(text, /tool: search_repo/);
  assert.equal(rec.calls.length, 0);
});
