import assert from 'node:assert/strict';
import test from 'node:test';
import { checkChatRateLimit } from './chat-rate-limit.ts';

const ask = (address, tab) =>
  new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'x-forwarded-for': address, ...(tab ? { 'x-rockygpt-client': tab } : {}) },
  });

const tab = (n) => `tab-${String(n).padStart(4, '0')}-abcdefghijkl`;

test('students on one network each get their own twelve a minute', () => {
  const now = 1_000_000;
  for (const student of [1, 2, 3]) {
    for (let i = 0; i < 12; i += 1) assert.equal(checkChatRateLimit(ask('10.0.0.1', tab(student)), now).allowed, true);
    const denied = checkChatRateLimit(ask('10.0.0.1', tab(student)), now);
    assert.equal(denied.allowed, false);
    assert.ok(denied.retryAfterSeconds > 0);
  }
});

test('one network address is capped at 120 a minute however many tabs it claims', () => {
  const now = 2_000_000;
  let allowed = 0;
  for (let n = 0; n < 40; n += 1) {
    for (let i = 0; i < 12; i += 1) if (checkChatRateLimit(ask('10.0.0.2', tab(n)), now).allowed) allowed += 1;
  }
  assert.equal(allowed, 120);
  const denied = checkChatRateLimit(ask('10.0.0.2', tab(999)), now);
  assert.equal(denied.allowed, false);
  assert.equal(denied.limit, 120);
});

test('without a tab value the address is the client, as before', () => {
  const now = 3_000_000;
  for (let i = 0; i < 12; i += 1) assert.equal(checkChatRateLimit(ask('10.0.0.3'), now).allowed, true);
  assert.equal(checkChatRateLimit(ask('10.0.0.3'), now).allowed, false);
  // A malformed value is ignored rather than trusted.
  assert.equal(checkChatRateLimit(ask('10.0.0.3', 'x'), now).allowed, false);
});

test('a window resets after a minute', () => {
  const now = 4_000_000;
  for (let i = 0; i < 12; i += 1) checkChatRateLimit(ask('10.0.0.4', tab(1)), now);
  assert.equal(checkChatRateLimit(ask('10.0.0.4', tab(1)), now).allowed, false);
  assert.equal(checkChatRateLimit(ask('10.0.0.4', tab(1)), now + 60_001).allowed, true);
});

test('a made-up CF-Connecting-IP header does not buy a fresh limit', () => {
  // Vercel replaces X-Real-IP and X-Forwarded-For with the visitor's address but passes a
  // visitor's own CF-Connecting-IP through untouched. Trusted first, a new value on each request
  // let 200 of 200 questions from one address through on November 17, 2026 (12 normally).
  const now = 6_000_000;
  let allowed = 0;
  for (let n = 0; n < 200; n += 1) {
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'x-real-ip': '10.0.0.6', 'x-forwarded-for': '10.0.0.6', 'cf-connecting-ip': `203.0.113.${n % 250}` },
    });
    if (checkChatRateLimit(request, now).allowed) allowed += 1;
  }
  assert.equal(allowed, 12);
});
