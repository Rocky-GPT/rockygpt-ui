import { expect, test } from 'playwright/test';

test.skip(
  Boolean(process.env.PLAYWRIGHT_BASE_URL),
  'chat route tests require the local deterministic brain stub'
);

function sourceAddress(projectName: string, finalOctet: number): string {
  const projectOffset = projectName.includes('mobile') ? 1 : 0;
  return `203.0.${finalOctet}.${10 + projectOffset}`;
}

test('chat accepts only the canonical messages request', async ({ request }, testInfo) => {
  const headers = { 'x-forwarded-for': sourceAddress(testInfo.project.name, 30) };
  const invalidPayloads = [
    [],
    { message: 'legacy shape' },
    { messages: [] },
    { messages: [{ role: 'system', content: 'not allowed' }] },
    { messages: [{ role: 'user', content: 'Hello', extra: true }] },
    { messages: [{ role: 'user', content: 'Hello' }], stream: true },
  ];

  for (const data of invalidPayloads) {
    const response = await request.post('/api/chat', { data, headers });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_REQUEST', retryable: false },
    });
  }

  const bodyTooLarge = await request.post('/api/chat', {
    data: { messages: [{ role: 'user', content: 'x'.repeat(70_000) }] },
    headers,
  });
  expect(bodyTooLarge.status()).toBe(413);
  await expect(bodyTooLarge.json()).resolves.toMatchObject({
    error: { code: 'PAYLOAD_TOO_LARGE', retryable: false },
  });
});

test('chat forwards messages with exact shape and order', async ({ request }, testInfo) => {
  const messages = [
    { role: 'user', content: 'My favorite color is teal.' },
    { role: 'assistant', content: 'I will remember that in this request.' },
    { role: 'user', content: 'What is my favorite color?' },
  ];
  const response = await request.post('/api/chat', {
    data: { messages },
    headers: { 'x-forwarded-for': sourceAddress(testInfo.project.name, 40) },
  });

  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    answer: 'Answer for: What is my favorite color?',
    model: 'mock-model',
    receivedRequest: { messages },
  });
});

test('chat forwards how many earlier messages the page left out', async ({ request }, testInfo) => {
  // 09-29: a shortened history reached the Brain as if it were the whole
  // conversation, and it denied an answer it had given.
  const headers = { 'x-forwarded-for': sourceAddress(testInfo.project.name, 41) };
  const messages = [{ role: 'user', content: 'What did you say first?' }];
  const counted = await request.post('/api/chat', { data: { messages, omittedMessages: 12 }, headers });
  expect(counted.status()).toBe(200);
  await expect(counted.json()).resolves.toMatchObject({
    receivedRequest: { messages, omittedMessages: 12 },
  });

  // Zero is not forwarded, so an older Brain that refuses unknown fields still answers.
  const whole = await request.post('/api/chat', { data: { messages, omittedMessages: 0 }, headers });
  expect(whole.status()).toBe(200);
  expect((await whole.json()).receivedRequest).toEqual({ messages });

  for (const omittedMessages of [-1, 1.5, '3', null, true, [2], 100_001, 2 ** 53]) {
    const invalid = await request.post('/api/chat', { data: { messages, omittedMessages }, headers });
    expect(invalid.status()).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: 'INVALID_REQUEST', retryable: false },
    });
  }
});

test('a Brain without omittedMessages still answers a long chat', async ({ request }, testInfo) => {
  // The UI can deploy before the Brain; that Brain refuses the field with 422.
  const headers = { 'x-forwarded-for': sourceAddress(testInfo.project.name, 42) };
  const messages = [{ role: 'user', content: '__mock_old_brain__' }];
  const retried = await request.post('/api/chat', { data: { messages, omittedMessages: 100_000 }, headers });
  expect(retried.status()).toBe(200);
  expect((await retried.json()).receivedRequest).toEqual({ messages });

  // Any other 422 goes back to the page as the Brain sent it, without a second ask.
  const invalid = [{ role: 'user', content: '__mock_invalid_conversation__' }];
  const refused = await request.post('/api/chat', { data: { messages: invalid, omittedMessages: 4 }, headers });
  expect(refused.status()).toBe(422);
  await expect(refused.json()).resolves.toMatchObject({
    detail: [{ type: 'value_error', loc: ['body'] }],
  });
});

test('chat preserves an upstream error response', async ({ request }, testInfo) => {
  const response = await request.post('/api/chat', {
    data: { messages: [{ role: 'user', content: '__mock_upstream_rate_limit__' }] },
    headers: { 'x-forwarded-for': sourceAddress(testInfo.project.name, 50) },
  });

  expect(response.status()).toBe(429);
  expect(response.headers()['retry-after']).toBe('17');
  expect(response.headers()['x-request-id']).toBe('mock-rate-limited');
  await expect(response.json()).resolves.toEqual({
    requestId: 'mock-rate-limited',
    error: {
      code: 'RATE_LIMITED',
      message: 'Mock brain quota reached.',
      retryable: true,
    },
  });
});

test('chat keeps its bounded per-client request window', async ({ request }, testInfo) => {
  const headers = { 'x-forwarded-for': sourceAddress(testInfo.project.name, 60) };

  for (let index = 0; index < 12; index += 1) {
    const allowed = await request.post('/api/chat', {
      data: { messages: [{ role: 'user', content: `Allowed request ${index}` }] },
      headers,
    });
    expect(allowed.status()).toBe(200);
  }

  const denied = await request.post('/api/chat', {
    data: { messages: [{ role: 'user', content: 'One too many' }] },
    headers,
  });
  expect(denied.status()).toBe(429);
  expect(Number(denied.headers()['retry-after'])).toBeGreaterThan(0);
});

test('students sharing one network each get their own chat window', async ({ request }, testInfo) => {
  const address = sourceAddress(testInfo.project.name, 61);
  const tab = (token: string) => ({ 'x-forwarded-for': address, 'x-rockygpt-client': token });
  const first = tab('a'.repeat(32));
  const second = tab('b'.repeat(32));

  for (let index = 0; index < 12; index += 1) {
    const allowed = await request.post('/api/chat', {
      data: { messages: [{ role: 'user', content: `First tab ${index}` }] },
      headers: first,
    });
    expect(allowed.status()).toBe(200);
  }
  const firstDenied = await request.post('/api/chat', {
    data: { messages: [{ role: 'user', content: 'First tab, one too many' }] },
    headers: first,
  });
  expect(firstDenied.status()).toBe(429);

  const secondAllowed = await request.post('/api/chat', {
    data: { messages: [{ role: 'user', content: 'Second tab on the same network' }] },
    headers: second,
  });
  expect(secondAllowed.status()).toBe(200);
});
