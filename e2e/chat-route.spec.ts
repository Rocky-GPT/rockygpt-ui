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
