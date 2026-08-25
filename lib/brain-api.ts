/** UI-owned wire client for rockygpt-brain. */

export type QuestionOrigin = 'client' | 'dev' | 'bot';

export interface ChatTurnV2 {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  history?: ChatTurnV2[];
  styleMode?: string;
  responseMode?: string;
  timezone?: string;
  conversationId?: string;
  visitorId?: string;
  now?: string;
  questionOrigin?: QuestionOrigin;
}

export interface ChatResult {
  requestId: string;
  answer?: string;
  route?: string;
  citations?: Array<{ sourceId: string; title: string; url: string; collectedAt?: string }>;
  uiActions?: Array<{ type: string; payload?: Record<string, string> }>;
  isError?: false;
  suggestedQuestions?: string[];
  brainTrace?: {
    question: Record<string, unknown>;
    context: Record<string, unknown>;
    plan: Record<string, unknown>;
    execution: Record<string, unknown>;
    answer: Record<string, unknown>;
  };
  error?: { code: string; message: string; retryable: boolean };
}

export interface ClientAbuseIdentity {
  key: string;
  signature?: string;
}

export const MAX_MESSAGE_LENGTH = 2_000;
/**
 * How much of the conversation travels with a question, counted in exchanges —
 * a question and the answer to it. That is the unit worth reasoning about; the
 * wire carries one entry per speaker, hence the doubling below.
 *
 * The brain's own memory keeps the same depth, so a client that sends history
 * and one that omits it see the same distance back.
 */
export const MAX_HISTORY_EXCHANGES = 10;
export const MAX_HISTORY_MESSAGES = MAX_HISTORY_EXCHANGES * 2;

export class BrainUnreachableError extends Error {
  constructor(cause: unknown) {
    super(`the brain service could not be reached: ${cause instanceof Error ? cause.message : cause}`);
    this.name = 'BrainUnreachableError';
  }
}

export function brainUrl(): string {
  return (process.env.BRAIN_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
}

export async function askBrain(
  request: ChatRequest,
  clientIdentity?: ClientAbuseIdentity
): Promise<Response> {
  try {
    const headers = new Headers({ accept: 'application/json', 'content-type': 'application/json' });
    const environmentToken = process.env.STAGING_SERVICE_TOKEN?.trim();
    if (environmentToken) headers.set('x-rockygpt-environment-token', environmentToken);
    if (clientIdentity?.signature) {
      headers.set('x-rockygpt-client-key', clientIdentity.key);
      headers.set('x-rockygpt-client-signature', clientIdentity.signature);
    }
    return await fetch(`${brainUrl()}/v1/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new BrainUnreachableError(error);
  }
}

export function detectQuestionOrigin(
  request: Request,
  payload?: Record<string, unknown>
): QuestionOrigin {
  const headers = request.headers;
  const explicit = headers.get('x-rockygpt-origin')?.toLowerCase();
  if (explicit === 'bot' || explicit === 'test') return 'bot';
  if (explicit === 'dev' || explicit === 'internal') return 'dev';
  if (explicit === 'client' || explicit === 'student') return 'client';

  const payloadOrigin = typeof payload?.origin === 'string' ? payload.origin.toLowerCase() : '';
  if (payloadOrigin === 'bot' || payloadOrigin === 'test') return 'bot';
  if (payloadOrigin === 'dev' || payloadOrigin === 'internal') return 'dev';
  if (payloadOrigin === 'client') return 'client';

  const userAgent = (headers.get('user-agent') || '').toLowerCase();
  if (!userAgent || ['curl', 'python', 'postman', 'playwright', 'bot'].some((part) => userAgent.includes(part))) {
    return 'bot';
  }
  const host = (headers.get('host') || headers.get('x-forwarded-host') || '').toLowerCase();
  const referer = (headers.get('referer') || '').toLowerCase();
  if (host.includes('localhost') || host.includes('127.0.0.1') || referer.includes('localhost')) {
    return 'dev';
  }
  return 'client';
}
