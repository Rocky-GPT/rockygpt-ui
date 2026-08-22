import { createHmac } from 'node:crypto';
import { expect, test } from 'playwright/test';

const ABUSE_HASH_KEY = 'playwright-only-abuse-hash-key-00000001';

test.skip(
  Boolean(process.env.PLAYWRIGHT_BASE_URL),
  'chat route tests require the local deterministic brain stub'
);

function sourceAddress(projectName: string, finalOctet: number): string {
  const projectOffset = projectName.includes('mobile') ? 1 : 0;
  return `203.0.${finalOctet}.${10 + projectOffset}`;
}

test('chat validates payloads before forwarding them', async ({ request }, testInfo) => {
  const headers = { 'x-forwarded-for': sourceAddress(testInfo.project.name, 30) };

  const nonObject = await request.post('/api/chat', { data: [], headers });
  expect(nonObject.status()).toBe(400);
  await expect(nonObject.json()).resolves.toMatchObject({
    error: { code: 'INVALID_REQUEST', retryable: false },
  });

  const tooLong = await request.post('/api/chat', {
    data: { message: 'x'.repeat(2_001) },
    headers,
  });
  expect(tooLong.status()).toBe(413);
  await expect(tooLong.json()).resolves.toMatchObject({
    error: { code: 'MESSAGE_TOO_LONG', retryable: false },
  });

  const bodyTooLarge = await request.post('/api/chat', {
    data: { message: 'Hello', ignoredPadding: 'x'.repeat(70_000) },
    headers,
  });
  expect(bodyTooLarge.status()).toBe(413);
  await expect(bodyTooLarge.json()).resolves.toMatchObject({
    error: { code: 'PAYLOAD_TOO_LARGE', retryable: false },
  });

  const invalidIdentifier = await request.post('/api/chat', {
    data: { message: 'Hello', conversationId: 'contains spaces' },
    headers,
  });
  expect(invalidIdentifier.status()).toBe(400);
});

test('chat safely replaces a malformed visitor cookie', async ({ request }, testInfo) => {
  const response = await request.post('/api/chat', {
    data: { message: 'Hello' },
    headers: {
      cookie: 'rockygpt_visitor_id=%E0%A4%A',
      'x-forwarded-for': sourceAddress(testInfo.project.name, 40),
    },
  });

  expect(response.status()).toBe(200);
  expect(response.headers()['set-cookie']).toContain('rockygpt_visitor_id=visitor_');
  expect(response.headers()['set-cookie']).toContain('HttpOnly');
  expect(response.headers()['set-cookie']).toContain('Max-Age=2592000');
});

test('chat sends only a signed pseudonymous client key to the brain', async ({
  request,
}, testInfo) => {
  const address = sourceAddress(testInfo.project.name, 50);
  const response = await request.post('/api/chat', {
    data: { message: 'Hello' },
    headers: {
      'x-forwarded-for': address,
      'x-rockygpt-environment-token': 'browser-forged-token',
    },
  });

  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    abuseIdentity: {
      key: string;
      signature: string;
      forwardedAddress: string | null;
      environmentToken: string | null;
    };
  };
  const expectedKey = createHmac('sha256', ABUSE_HASH_KEY).update(address).digest('hex');
  const expectedSignature = createHmac('sha256', ABUSE_HASH_KEY)
    .update(expectedKey)
    .digest('hex');
  expect(body.abuseIdentity).toEqual({
    key: expectedKey,
    signature: expectedSignature,
    forwardedAddress: null,
    environmentToken: 'playwright-server-only-staging-token',
  });
});

test('chat preserves an upstream error status, body, request id, and retry delay', async ({
  request,
}, testInfo) => {
  const response = await request.post('/api/chat', {
    data: { message: '__mock_upstream_rate_limit__' },
    headers: { 'x-forwarded-for': sourceAddress(testInfo.project.name, 60) },
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

test('chat enforces its bounded per-client request window', async ({ request }, testInfo) => {
  const headers = { 'x-forwarded-for': sourceAddress(testInfo.project.name, 70) };

  for (let index = 0; index < 12; index += 1) {
    const allowed = await request.post('/api/chat', {
      data: { message: `Allowed request ${index}` },
      headers,
    });
    expect(allowed.status()).toBe(200);
  }

  const denied = await request.post('/api/chat', { data: { message: 'One too many' }, headers });
  expect(denied.status()).toBe(429);
  expect(Number(denied.headers()['retry-after'])).toBeGreaterThan(0);
  await expect(denied.json()).resolves.toMatchObject({
    error: { code: 'RATE_LIMITED', retryable: true },
  });
});
