import { NextResponse } from 'next/server';
import {
  askBrain,
  BrainUnreachableError,
  type ChatMessageInput,
  type ChatRequest,
} from '@/lib/brain-api';
import {
  checkChatRateLimit,
  rateLimitHeaders,
  type AllowedRateLimit,
} from '@/lib/chat-rate-limit';

export const runtime = 'nodejs';

const MAX_CHAT_BODY_BYTES = 64 * 1_024;

class RequestValidationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'INVALID_REQUEST'
  ) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readMessages(value: unknown): ChatMessageInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new RequestValidationError('messages must be a non-empty array');
  }

  return value.map((message, index) => {
    if (!isRecord(message)) {
      throw new RequestValidationError(`messages[${index}] must be an object`);
    }
    if (Object.keys(message).some((key) => key !== 'role' && key !== 'content')) {
      throw new RequestValidationError(`messages[${index}] has unsupported fields`);
    }
    if (message.role !== 'user' && message.role !== 'assistant') {
      throw new RequestValidationError(`messages[${index}].role is invalid`);
    }
    if (typeof message.content !== 'string' || !message.content.trim()) {
      throw new RequestValidationError(`messages[${index}].content is required`);
    }
    return { role: message.role, content: message.content };
  });
}

async function readBoundedBody(request: Request): Promise<string> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CHAT_BODY_BYTES) {
    throw new RequestValidationError('request body is too large', 413, 'PAYLOAD_TOO_LARGE');
  }

  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_CHAT_BODY_BYTES) {
      await reader.cancel();
      throw new RequestValidationError('request body is too large', 413, 'PAYLOAD_TOO_LARGE');
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

async function parseChatRequest(request: Request): Promise<ChatRequest> {
  const rawBody = await readBoundedBody(request);
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new RequestValidationError('invalid JSON body');
  }
  if (!isRecord(body) || Object.keys(body).some((key) => key !== 'messages')) {
    throw new RequestValidationError('request must contain only messages');
  }
  return { messages: readMessages(body.messages) };
}

function errorResponse(
  requestId: string,
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  headers?: HeadersInit,
  retryAfterSeconds?: number
): NextResponse {
  return NextResponse.json(
    {
      requestId,
      error: {
        code,
        message,
        retryable,
        ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
      },
    },
    { status, headers }
  );
}

function forwardedHeaders(upstream: Response, rateLimit: AllowedRateLimit): Headers {
  const headers = new Headers(rateLimitHeaders(rateLimit));
  for (const name of ['content-type', 'retry-after', 'x-request-id']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const rateLimit = checkChatRateLimit(request);
  if (!rateLimit.allowed) {
    return errorResponse(
      requestId,
      429,
      'RATE_LIMITED',
      'Too many chat requests. Please wait before trying again.',
      true,
      rateLimitHeaders(rateLimit),
      rateLimit.retryAfterSeconds
    );
  }

  let chatRequest: ChatRequest;
  try {
    chatRequest = await parseChatRequest(request);
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return errorResponse(
        requestId,
        error.status,
        error.code,
        error.message,
        false,
        rateLimitHeaders(rateLimit)
      );
    }
    return errorResponse(
      requestId,
      400,
      'INVALID_REQUEST',
      'Unable to read request body.',
      false,
      rateLimitHeaders(rateLimit)
    );
  }

  try {
    const upstream = await askBrain(chatRequest, rateLimit.clientIdentity);
    const hasBody = upstream.status !== 204 && upstream.status !== 304;
    return new NextResponse(hasBody ? await upstream.arrayBuffer() : null, {
      status: upstream.status,
      headers: forwardedHeaders(upstream, rateLimit),
    });
  } catch (error) {
    console.error('Chat turn failed:', error);
    return errorResponse(
      requestId,
      503,
      'SERVICE_UNAVAILABLE',
      error instanceof BrainUnreachableError
        ? 'RockyGPT is starting up.'
        : 'RockyGPT is unavailable.',
      true,
      rateLimitHeaders(rateLimit)
    );
  }
}
