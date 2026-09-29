import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChatRequest,
  FAILED_TURN_MESSAGE,
  MAX_HISTORY_CHARACTERS,
  MAX_HISTORY_MESSAGE_CHARACTERS,
  MAX_HISTORY_MESSAGES,
  MAX_LATEST_ANSWER_CHARACTERS,
  MAX_REQUEST_BYTES,
  requestBytes,
} from './chat-conversation.ts';

const dinner = { role: 'user', content: 'what is for dinner today' };
const failure = {
  role: 'assistant',
  content: 'Timeout: private diagnostic details and support ID',
  isError: true,
};
const MARKER = /… \[rest of this earlier answer not sent\]$/;
// The chat route's own cap (app/api/chat/route.ts).
const ROUTE_BODY_BYTES = 64 * 1_024;

test('failed dinner keeps its failure boundary when the next request changes topic', () => {
  const shuttle = { role: 'user', content: 'when is next shuttle' };
  const result = buildChatRequest([dinner, failure], shuttle);
  assert.deepEqual(result, {
    messages: [dinner, { role: 'assistant', content: FAILED_TURN_MESSAGE }, shuttle],
  });
  assert.equal(JSON.stringify(result).includes('private diagnostic'), false);
});

test('references and explicit retries retain earlier questions and successful answers', () => {
  const earlier = [
    { role: 'user', content: 'I need vegan food.' },
    { role: 'assistant', content: 'Which meal?' },
    dinner, failure,
  ];
  for (const content of ['what about tomorrow?', 'try dinner again', 'both dinner and the shuttle']) {
    const { messages } = buildChatRequest(earlier, { role: 'user', content });
    assert.deepEqual(messages.slice(0, 3), earlier.slice(0, 3));
    assert.deepEqual(messages.at(-1), { role: 'user', content });
    assert.equal(messages.length, 5);
  }
  assert.equal(earlier[3].content, failure.content);
});

test('empty placeholders are omitted; repeated failures keep their turn boundaries', () => {
  const result = buildChatRequest([
    dinner, failure,
    { role: 'user', content: 'tomorrow instead' }, failure,
    { role: 'assistant', content: '' },
  ], { role: 'user', content: 'when is next shuttle' });
  assert.deepEqual(result.messages.map(message => message.role),
    ['user', 'assistant', 'user', 'assistant', 'user']);
  assert.equal(result.messages.filter(message => message.content === FAILED_TURN_MESSAGE).length, 2);
  // Nothing visible was left out, so an older Brain still gets exactly { messages }.
  assert.deepEqual(Object.keys(result), ['messages']);
});

test('Q29: a 57-message conversation that fits goes whole, with its first departure time', () => {
  // 09-29: the 40-message window sent Q10–Q28 and the Brain denied Q4's 7:00 AM answer.
  const thread = [];
  for (let turn = 1; turn <= 28; turn += 1) {
    thread.push({ role: 'user', content: `question ${turn} about the shuttle` });
    thread.push({ role: 'assistant', content: turn === 4
      ? 'The first published campus departure is at 7:00 AM for both routes.'
      : `answer ${turn} `.repeat(20) });
  }
  const q29 = { role: 'user', content: 'what time did you say the first one leaves?' };
  const result = buildChatRequest(thread, q29);
  assert.equal(result.messages.length, 57);
  assert.deepEqual(Object.keys(result), ['messages']);
  assert.match(result.messages[7].content, /7:00 AM/);
});

test('a long session keeps its recent turns inside the limits and counts what it left out', () => {
  const thread = [];
  for (let turn = 0; turn < 100; turn += 1) {
    thread.push({ role: 'user', content: `question ${turn}` });
    thread.push({ role: 'assistant', content: `answer ${turn} `.repeat(40) });
  }
  const current = { role: 'user', content: 'and tomorrow?' };
  const { messages, omittedMessages } = buildChatRequest(thread, current);
  assert.ok(messages.length <= MAX_HISTORY_MESSAGES);
  assert.ok(messages.reduce((total, message) => total + message.content.length, 0) <= MAX_HISTORY_CHARACTERS);
  assert.equal(messages[0].role, 'user');
  assert.deepEqual(messages.at(-1), current);
  // The newest exchange survives the trim.
  assert.equal(messages.at(-3).content, 'question 99');
  assert.equal(omittedMessages, thread.length - (messages.length - 1));
});

test('a message-count window counts every earlier message it leaves out', () => {
  const thread = [];
  for (let turn = 0; turn < 60; turn += 1) {
    thread.push({ role: 'user', content: `q${turn}` }, { role: 'assistant', content: `a${turn}` });
  }
  const { messages, omittedMessages } = buildChatRequest(thread, { role: 'user', content: 'next' });
  // 79 fit; the orphaned answer at the front is dropped too, and counted.
  assert.equal(messages.length, 79);
  assert.equal(messages[0].content, 'q21');
  assert.equal(omittedMessages, 42);
});

test('the latest answer goes whole, so a follow-up can reach its last lines', () => {
  const long = `${'Dinner at Birch: pasta, salad. '.repeat(370)}Correction: Birch closes at 8 PM tonight.`;
  assert.ok(long.length > 11_000 && long.length < 12_000);
  const { messages } = buildChatRequest([dinner, { role: 'assistant', content: long }],
    { role: 'user', content: 'when does it close?' });
  assert.equal(messages[1].content, long);
});

test('an older long answer is clipped with a marker saying text is missing', () => {
  const menu = { role: 'assistant', content: `Dinner at Birch: ${'x'.repeat(6_000)} End note.` };
  const { messages } = buildChatRequest(
    [dinner, menu, { role: 'user', content: 'thanks' }, { role: 'assistant', content: 'You are welcome.' }],
    { role: 'user', content: 'any vegan?' },
  );
  assert.equal(messages.length, 5);
  assert.ok(messages[1].content.length <= MAX_HISTORY_MESSAGE_CHARACTERS);
  assert.ok(messages[1].content.startsWith('Dinner at Birch: '));
  assert.match(messages[1].content, MARKER);
  assert.equal(messages[3].content, 'You are welcome.');
});

test('a latest answer beyond what the Brain accepts in one message is clipped to that cap', () => {
  const menu = { role: 'assistant', content: 'Dinner at Birch: '.padEnd(20_000, 'x') };
  const { messages } = buildChatRequest([dinner, menu], { role: 'user', content: 'any vegan?' });
  assert.equal(messages.length, 3);
  assert.ok(messages[1].content.length <= MAX_LATEST_ANSWER_CHARACTERS);
  assert.match(messages[1].content, MARKER);
});

test('a window that would open on an answer drops that answer and counts it', () => {
  const big = 'y'.repeat(MAX_HISTORY_MESSAGE_CHARACTERS);
  const thread = [
    { role: 'user', content: big }, { role: 'assistant', content: big },
    { role: 'user', content: big }, { role: 'assistant', content: big },
    { role: 'user', content: big }, { role: 'assistant', content: big },
    { role: 'user', content: 'short' }, { role: 'assistant', content: big },
  ];
  const { messages, omittedMessages } = buildChatRequest(thread, { role: 'user', content: 'next' });
  assert.equal(messages[0].role, 'user');
  assert.equal(messages.at(-1).content, 'next');
  assert.equal(omittedMessages, thread.length - (messages.length - 1));
  assert.ok(omittedMessages > 0);
});

test('multibyte history stays under the route byte cap by dropping the oldest turns', () => {
  // 09-29 (C03): 22,505 characters of Chinese passed both character budgets
  // and serialized to 67,873 bytes, which the route refuses with 413.
  const thread = [];
  for (let turn = 0; turn < 5; turn += 1) {
    thread.push({ role: 'user', content: '问'.repeat(500) });
    thread.push({ role: 'assistant', content: '答'.repeat(4_000) });
  }
  const result = buildChatRequest(thread, { role: 'user', content: '明天呢？' });
  const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
  assert.equal(bytes, requestBytes(result));
  assert.ok(bytes <= MAX_REQUEST_BYTES && MAX_REQUEST_BYTES < ROUTE_BODY_BYTES);
  assert.equal(result.messages[0].role, 'user');
  assert.equal(result.messages.at(-2).content, '答'.repeat(4_000));
  assert.equal(result.omittedMessages, thread.length - (result.messages.length - 1));
  assert.equal(result.omittedMessages, 2);
});
