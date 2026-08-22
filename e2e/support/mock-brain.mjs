import { createServer } from 'node:http';

const port = Number(process.env.MOCK_BRAIN_PORT || 4000);

function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/readiness') {
    json(response, 200, { status: 'ready' });
    return;
  }

  if (request.method !== 'POST' || request.url !== '/v1/chat') {
    json(response, 404, { error: 'not found' });
    return;
  }

  let rawBody = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => {
    rawBody += chunk;
  });
  request.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      json(response, 400, { error: { code: 'INVALID_REQUEST', message: 'invalid JSON' } });
      return;
    }

    if (payload.message === '__mock_upstream_rate_limit__') {
      json(
        response,
        429,
        {
          requestId: 'mock-rate-limited',
          error: {
            code: 'RATE_LIMITED',
            message: 'Mock brain quota reached.',
            retryable: true,
          },
        },
        { 'retry-after': '17', 'x-request-id': 'mock-rate-limited' }
      );
      return;
    }

    json(response, 200, {
      requestId: 'mock-success',
      answer: `Answer for: ${payload.message}`,
      citations: [],
      route: 'standard',
      uiActions: [],
      suggestedQuestions: [],
      abuseIdentity: {
        key: request.headers['x-rockygpt-client-key'] ?? null,
        signature: request.headers['x-rockygpt-client-signature'] ?? null,
        forwardedAddress: request.headers['x-forwarded-for'] ?? null,
      },
    });
  });
});

server.listen(port, '127.0.0.1');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
