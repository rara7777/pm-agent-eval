import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { issueToTicket, splitAcceptanceCriteria } from './redmine-mapping.ts';

test('no AC heading means no AC, and the description is left alone', () => {
  const body = '退貨流程要重做。\n下週要上線。';
  const out = splitAcceptanceCriteria(body);
  assert.deepEqual(out.acceptanceCriteria, []);
  assert.equal(out.description, body);
});

test('a markdown heading starts the AC block', () => {
  const out = splitAcceptanceCriteria(
    '退貨流程要重做。\n\n## 驗收條件\n\n- 可以在訂單頁申請退貨\n- 退貨運費自動判斷',
  );
  assert.deepEqual(out.acceptanceCriteria, ['可以在訂單頁申請退貨', '退貨運費自動判斷']);
  assert.equal(out.description, '退貨流程要重做。');
});

test('Redmine textile headings count too', () => {
  const out = splitAcceptanceCriteria('要重做。\n\nh2. Acceptance Criteria\n\n* 第一條\n* 第二條');
  assert.deepEqual(out.acceptanceCriteria, ['第一條', '第二條']);
});

test('a bare labelled line with a colon counts as the heading', () => {
  const out = splitAcceptanceCriteria('要重做。\n\nAC：\n1. 第一條\n2. 第二條');
  assert.deepEqual(out.acceptanceCriteria, ['第一條', '第二條']);
  assert.equal(out.description, '要重做。');
});

test('numbered, bulleted and checkbox markers all yield the text', () => {
  const out = splitAcceptanceCriteria(
    '前言\n\n驗收標準:\n- [ ] 勾選框那條\n1) 圓括號那條\n（2）全形括號那條\n* 星號那條',
  );
  assert.deepEqual(out.acceptanceCriteria, [
    '勾選框那條',
    '圓括號那條',
    '全形括號那條',
    '星號那條',
  ]);
});

// `#` is a numbered list item in textile and a heading in markdown, and one line
// cannot say which. It is read as a heading, so a textile numbered list ends the
// block instead of filling it. Revisit when a real card turns up using one.
test('a leading # ends the block rather than being read as a list item', () => {
  const out = splitAcceptanceCriteria('前言\n\n驗收標準:\n- 甲\n# 這行被當成標題');
  assert.deepEqual(out.acceptanceCriteria, ['甲']);
  assert.match(out.description, /這行被當成標題/);
});

test('the AC block stops at the next heading, and what follows stays in the description', () => {
  const out = splitAcceptanceCriteria(
    '前言\n\n## AC\n- 第一條\n\n## 備註\n這段不是 AC，要留在 description。',
  );
  assert.deepEqual(out.acceptanceCriteria, ['第一條']);
  assert.equal(out.description, '前言\n\n## 備註\n這段不是 AC，要留在 description。');
});

test('a heading with nothing listed under it yields no AC rather than a guess', () => {
  const out = splitAcceptanceCriteria('前言\n\n## 驗收條件\n\n還沒想好，之後補。');
  assert.deepEqual(out.acceptanceCriteria, []);
  // Nothing was recognised, so nothing is removed either.
  assert.match(out.description, /還沒想好/);
  assert.match(out.description, /驗收條件/);
});

test('the first AC heading wins when the card repeats itself', () => {
  const out = splitAcceptanceCriteria('前言\n\n## AC\n- 甲\n\n## 驗收條件\n- 乙');
  assert.deepEqual(out.acceptanceCriteria, ['甲']);
});

test('carriage returns and full-width colons do not break the match', () => {
  const out = splitAcceptanceCriteria('前言\r\n\r\n驗收條件：\r\n- 甲\r\n- 乙');
  assert.deepEqual(out.acceptanceCriteria, ['甲', '乙']);
});

test('an empty description is not an error', () => {
  const out = splitAcceptanceCriteria('');
  assert.deepEqual(out.acceptanceCriteria, []);
  assert.equal(out.description, '');
});

test('an issue becomes a ticket the agent has not touched yet', () => {
  const t = issueToTicket({
    id: 4821,
    subject: '退貨流程',
    description: '要重做。\n\n## AC\n- 甲\n- 乙',
  });
  assert.equal(t.id, '4821');
  assert.equal(t.name, '退貨流程');
  assert.equal(t.description, '要重做。');
  assert.deepEqual(t.acceptanceCriteria, ['甲', '乙']);
  assert.equal(t.goal, null);
  assert.deepEqual(t.scopeIn, []);
  assert.deepEqual(t.scopeOut, []);
  assert.deepEqual(t.acFlags, []);
  assert.deepEqual(t.comments, []);
});

test('a custom field holding the AC wins over cutting the description', () => {
  const t = issueToTicket({
    id: 1,
    subject: 'x',
    description: '前言\n\n## AC\n- 從 description 切出來的',
    custom_fields: [{ id: 7, name: '驗收條件', value: '- 從欄位來的甲\n- 從欄位來的乙' }],
  });
  assert.deepEqual(t.acceptanceCriteria, ['從欄位來的甲', '從欄位來的乙']);
  // The description keeps its own AC block: only one of the two was consumed.
  assert.match(t.description, /從 description 切出來的/);
});

test('an empty custom field falls back to the description', () => {
  const t = issueToTicket({
    id: 1,
    subject: 'x',
    description: '前言\n\n## AC\n- 甲',
    custom_fields: [{ id: 7, name: 'Acceptance Criteria', value: '' }],
  });
  assert.deepEqual(t.acceptanceCriteria, ['甲']);
});

test('a missing description is not an error', () => {
  const t = issueToTicket({ id: 9, subject: '只有標題' });
  assert.equal(t.description, '');
  assert.deepEqual(t.acceptanceCriteria, []);
});
