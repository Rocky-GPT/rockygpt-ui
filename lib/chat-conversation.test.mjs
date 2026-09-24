import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRequestMessages,
  FAILED_TURN_MESSAGE,
  MAX_HISTORY_CHARACTERS,
  MAX_HISTORY_MESSAGE_CHARACTERS,
  MAX_HISTORY_MESSAGES,
} from './chat-conversation.ts';

const dinner = { role: 'user', content: 'what is for dinner today' };
const failure = {
  role: 'assistant',
  content: 'Timeout: private diagnostic details and support ID',
  isError: true,
};

test('failed dinner keeps its failure boundary when the next request changes topic', () => {
  const shuttle = { role: 'user', content: 'when is next shuttle' };
  const result = buildRequestMessages([dinner, failure], shuttle);
  assert.deepEqual(result, [
    dinner,
    { role: 'assistant', content: FAILED_TURN_MESSAGE },
    shuttle,
  ]);
  assert.equal(JSON.stringify(result).includes('private diagnostic'), false);
});

test('references and explicit retries retain earlier questions and successful answers', () => {
  const earlier = [
    { role: 'user', content: 'I need vegan food.' },
    { role: 'assistant', content: 'Which meal?' },
    dinner, failure,
  ];
  for (const content of ['what about tomorrow?', 'try dinner again', 'both dinner and the shuttle']) {
    const result = buildRequestMessages(earlier, { role: 'user', content });
    assert.deepEqual(result.slice(0, 3), earlier.slice(0, 3));
    assert.deepEqual(result.at(-1), { role: 'user', content });
    assert.equal(result.length, 5);
  }
  assert.equal(earlier[3].content, failure.content);
});

test('empty placeholders are omitted; repeated failures keep their turn boundaries', () => {
  const result = buildRequestMessages([
    dinner, failure,
    { role: 'user', content: 'tomorrow instead' }, failure,
    { role: 'assistant', content: '' },
  ], { role: 'user', content: 'when is next shuttle' });
  assert.deepEqual(result.map(message => message.role),
    ['user', 'assistant', 'user', 'assistant', 'user']);
  assert.equal(result.filter(message => message.content === FAILED_TURN_MESSAGE).length, 2);
});

test('a long session keeps its recent turns inside the limits the Brain accepts', () => {
  const thread = [];
  for (let turn = 0; turn < 100; turn += 1) {
    thread.push({ role: 'user', content: `question ${turn}` });
    thread.push({ role: 'assistant', content: `answer ${turn} `.repeat(40) });
  }
  const current = { role: 'user', content: 'and tomorrow?' };
  const result = buildRequestMessages(thread, current);
  assert.ok(result.length <= MAX_HISTORY_MESSAGES);
  assert.ok(result.reduce((total, message) => total + message.content.length, 0) <= MAX_HISTORY_CHARACTERS);
  assert.equal(result[0].role, 'user');
  assert.deepEqual(result.at(-1), current);
  // The newest exchange survives the trim.
  assert.equal(result.at(-3).content, 'question 99');
});

test('an oversized old answer is clipped instead of breaking the next question', () => {
  const menu = { role: 'assistant', content: 'Dinner at Birch: '.padEnd(20_000, 'x') };
  const result = buildRequestMessages([dinner, menu], { role: 'user', content: 'any vegan?' });
  assert.equal(result.length, 3);
  assert.ok(result[1].content.length <= MAX_HISTORY_MESSAGE_CHARACTERS);
  assert.ok(result[1].content.startsWith('Dinner at Birch: '));
});

test('a window that would open on an answer drops that answer', () => {
  const big = 'y'.repeat(MAX_HISTORY_MESSAGE_CHARACTERS);
  const thread = [
    { role: 'user', content: big }, { role: 'assistant', content: big },
    { role: 'user', content: big }, { role: 'assistant', content: big },
    { role: 'user', content: big }, { role: 'assistant', content: big },
    { role: 'user', content: 'short' }, { role: 'assistant', content: big },
  ];
  const result = buildRequestMessages(thread, { role: 'user', content: 'next' });
  assert.equal(result[0].role, 'user');
  assert.equal(result.at(-1).content, 'next');
});
