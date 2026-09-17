import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRequestMessages, FAILED_TURN_MESSAGE } from './chat-conversation.ts';

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
