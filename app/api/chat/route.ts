import { NextResponse } from 'next/server';
import {
  askBrain,
  BrainUnreachableError,
  detectQuestionOrigin,
  MAX_HISTORY_TURNS,
  MAX_MESSAGE_LENGTH,
  type ChatRequest,
  type ChatTurnV2,
} from '@/lib/brain-api';
import {
  checkChatRateLimit,
  rateLimitHeaders,
  type AllowedRateLimit,
} from '@/lib/chat-rate-limit';

export const runtime = 'nodejs';

const MAX_CHAT_BODY_BYTES = 64 * 1_024;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_OPTION_LENGTH = 32;
const MAX_TIMEZONE_LENGTH = 100;
const VISITOR_COOKIE = 'rockygpt_visitor_id';
const VISITOR_COOKIE_AGE_SECONDS = 60 * 60 * 24 * 30;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const OPTION_PATTERN = /^[A-Za-z0-9_-]+$/;
const TIMEZONE_PATTERN = /^[A-Za-z0-9_+./:-]+$/;

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

interface ParsedChatRequest {
  brainRequest: ChatRequest;
  sourcePayload: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function boundedOptionalText(
  payload: Record<string, unknown>,
  key: string,
  maxLength: number,
  pattern?: RegExp
): string | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new RequestValidationError(`${key} must be a string`);
  }

  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength || (pattern && !pattern.test(normalized))) {
    throw new RequestValidationError(`${key} is invalid`);
  }
  return normalized;
}

function readHistory(value: unknown): ChatTurnV2[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new RequestValidationError('history must be an array');
  }
  if (value.length > MAX_HISTORY_TURNS) {
    throw new RequestValidationError(`history may contain at most ${MAX_HISTORY_TURNS} turns`);
  }

  return value.map((turn, index) => {
    if (!isRecord(turn) || (turn.role !== 'user' && turn.role !== 'assistant')) {
      throw new RequestValidationError(`history[${index}] has an invalid role`);
    }
    if (typeof turn.content !== 'string' || !turn.content.trim()) {
      throw new RequestValidationError(`history[${index}].content is required`);
    }
    if (turn.content.length > MAX_MESSAGE_LENGTH) {
      throw new RequestValidationError(
        `history[${index}].content may contain at most ${MAX_MESSAGE_LENGTH} characters`
      );
    }
    return { role: turn.role, content: turn.content.trim() };
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

async function parseChatRequest(request: Request): Promise<ParsedChatRequest> {
  const rawBody = await readBoundedBody(request);

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new RequestValidationError('invalid JSON body');
  }
  if (!isRecord(body)) {
    throw new RequestValidationError('request body must be a JSON object');
  }

  if (typeof body.message !== 'string' || !body.message.trim()) {
    throw new RequestValidationError('message is required');
  }
  if (body.message.length > MAX_MESSAGE_LENGTH) {
    throw new RequestValidationError(
      `message may contain at most ${MAX_MESSAGE_LENGTH} characters`,
      413,
      'MESSAGE_TOO_LONG'
    );
  }

  const conversationId =
    boundedOptionalText(body, 'conversationId', MAX_IDENTIFIER_LENGTH, IDENTIFIER_PATTERN) ??
    boundedOptionalText(body, 'sessionId', MAX_IDENTIFIER_LENGTH, IDENTIFIER_PATTERN) ??
    `session_${crypto.randomUUID().slice(0, 12)}`;

  // Accepted only for compatibility with older clients. The server owns the
  // visitor cookie and never lets a body value replace it.
  boundedOptionalText(body, 'visitorId', MAX_IDENTIFIER_LENGTH, IDENTIFIER_PATTERN);
  boundedOptionalText(body, 'locale', 35, /^[A-Za-z0-9_-]+$/);
  boundedOptionalText(body, 'origin', 16, OPTION_PATTERN);

  return {
    sourcePayload: body,
    brainRequest: {
      message: body.message.trim(),
      history: readHistory(body.history),
      styleMode: boundedOptionalText(body, 'styleMode', MAX_OPTION_LENGTH, OPTION_PATTERN),
      responseMode: boundedOptionalText(body, 'responseMode', MAX_OPTION_LENGTH, OPTION_PATTERN),
      timezone: boundedOptionalText(
        body,
        'timezone',
        MAX_TIMEZONE_LENGTH,
        TIMEZONE_PATTERN
      ),
      conversationId,
    },
  };
}

function validVisitorId(value: string): boolean {
  return value.length <= MAX_IDENTIFIER_LENGTH && IDENTIFIER_PATTERN.test(value);
}

/** Returns undefined for malformed percent escapes or invalid cookie values. */
function readVisitorCookie(request: Request): string | undefined {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== VISITOR_COOKIE) continue;
    try {
      const decoded = decodeURIComponent(part.slice(separator + 1).trim());
      return validVisitorId(decoded) ? decoded : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function withVisitorCookie(response: NextResponse, visitorId: string): NextResponse {
  response.cookies.set(VISITOR_COOKIE, visitorId, {
    path: '/',
    maxAge: VISITOR_COOKIE_AGE_SECONDS,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
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

/**
 * The browser edge validates and bounds client input, adds a server-owned
 * pseudonymous visitor token, and otherwise passes the brain response through
 * unchanged. Answering and durable logging remain brain responsibilities.
 */
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

  let parsed: ParsedChatRequest;
  try {
    parsed = await parseChatRequest(request);
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

  const visitorId =
    readVisitorCookie(request) ?? `visitor_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;

  try {
    const upstream = await askBrain(
      {
        ...parsed.brainRequest,
        visitorId,
        questionOrigin: detectQuestionOrigin(request, parsed.sourcePayload),
      },
      rateLimit.clientIdentity
    );
    const hasBody = upstream.status !== 204 && upstream.status !== 304;
    const response = new NextResponse(hasBody ? await upstream.arrayBuffer() : null, {
      status: upstream.status,
      headers: forwardedHeaders(upstream, rateLimit),
    });
    return withVisitorCookie(response, visitorId);
  } catch (error) {
    console.error('Chat turn failed:', error);
    const message =
      error instanceof BrainUnreachableError
        ? 'RockyGPT is starting up.'
        : 'RockyGPT is unavailable.';
    return withVisitorCookie(
      errorResponse(
        requestId,
        503,
        'SERVICE_UNAVAILABLE',
        message,
        true,
        rateLimitHeaders(rateLimit)
      ),
      visitorId
    );
  }
}
