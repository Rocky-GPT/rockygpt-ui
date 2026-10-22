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

    const lastMessage = Array.isArray(payload.messages) ? payload.messages.at(-1) : undefined;

    if (lastMessage?.content === '__mock_upstream_rate_limit__') {
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

    if (lastMessage?.content === '__mock_old_brain__' && 'omittedMessages' in payload) {
      // A Brain from before 09-29 refuses omittedMessages as FastAPI does.
      json(response, 422, {
        detail: [
          {
            type: 'extra_forbidden',
            loc: ['body', 'omittedMessages'],
            msg: 'Extra inputs are not permitted',
            input: payload.omittedMessages,
          },
        ],
      });
      return;
    }

    if (lastMessage?.content === '__mock_invalid_conversation__') {
      json(response, 422, {
        detail: [
          {
            type: 'value_error',
            loc: ['body'],
            msg: 'Value error, Conversation is too long; start a new conversation',
          },
        ],
      });
      return;
    }

    if (lastMessage?.content === '__mock_budget_exhausted__') {
      // The month's AI allowance is spent: the Brain answers every question this way,
      // with Public Safety's numbers read from their verified records.
      json(response, 429, {
        requestId: 'mock-budget-exhausted',
        error: {
          code: 'budget_exhausted',
          message: "RockyGPT has used this month's AI allowance.",
          retryable: false,
          resetAt: '2026-10-01T00:00:00-04:00',
          emergency: {
            text:
              'If you or someone else is in danger, call 911. If you might hurt yourself, ' +
              'call or text 988. Ramapo College Public Safety: emergency 201-684-6666; ' +
              'non-emergency 201-684-7432.',
            sources: [{ title: 'Public Safety', url: 'https://www.ramapo.edu/publicsafety/' }],
          },
        },
      });
      return;
    }

    if (
      lastMessage?.content === '__mock_safety_stream__' &&
      String(request.headers.accept).includes('text/event-stream')
    ) {
      // The Brain sends its code-written safety block as soon as it detects
      // danger, and the final answer opens with the same block (09-29).
      const safety = {
        answer:
          'If you or someone else is in danger, call 911. Ramapo College Public Safety: ' +
          'emergency 201-684-6666.',
        citations: [
          { id: 'critical_facts:public-safety', title: 'Public Safety', url: 'https://www.ramapo.edu/publicsafety/' },
        ],
      };
      const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'x-request-id': 'mock-safety',
      });
      response.write(frame('progress', { stage: 'understanding', safety }));
      setTimeout(() => {
        response.write(frame('progress', { stage: 'reviewing', draft: 'Stay with them.' }));
      }, 500);
      setTimeout(() => {
        response.end(frame('result', {
          status: 200,
          body: {
            requestId: 'mock-safety',
            answer: `${safety.answer}\n\nStay with them until help arrives.`,
            citations: safety.citations,
            uiActions: [],
            suggestedQuestions: [],
          },
        }));
      }, 2_500);
      return;
    }

    json(response, 200, {
      requestId: 'mock-success',
      answer: `Answer for: ${lastMessage?.content ?? ''}`,
      model: 'mock-model',
      receivedRequest: payload,
      citations: [],
      route: 'standard',
      uiActions: [],
      suggestedQuestions: [],
      abuseIdentity: {
        key: request.headers['x-rockygpt-client-key'] ?? null,
        signature: request.headers['x-rockygpt-client-signature'] ?? null,
        forwardedAddress: request.headers['x-forwarded-for'] ?? null,
        environmentToken: request.headers['x-rockygpt-environment-token'] ?? null,
      },
    });
  });
});

server.listen(port, '127.0.0.1');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
