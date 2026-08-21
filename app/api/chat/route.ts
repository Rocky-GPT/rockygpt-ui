import { NextResponse } from 'next/server';
import { detectQuestionOrigin } from '@rockygpt/brain/src/detect-origin';
import { ask, BrainUnreachableError } from '@rockygpt/brain/api/client';
import {
  MAX_HISTORY_TURNS,
  MAX_MESSAGE_LENGTH,
  type ChatTurnV2,
} from '@rockygpt/brain/api/contract';

export const runtime = 'nodejs';

/**
 * The browser's edge of the chat.
 *
 * Answering happens in the brain service; what stays here is everything that
 * is only true of a browser request — the visitor cookie this app issues, and
 * where the question came from, which needs the original headers. The turn
 * itself, and the record of it, belong to the service.
 */

/** Reads the conversation so far, ignoring anything malformed. */
function readHistory(value: unknown): ChatTurnV2[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (turn): turn is ChatTurnV2 =>
        !!turn &&
        typeof turn === 'object' &&
        ((turn as ChatTurnV2).role === 'user' || (turn as ChatTurnV2).role === 'assistant') &&
        typeof (turn as ChatTurnV2).content === 'string'
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, MAX_MESSAGE_LENGTH) }));
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const payload = (body ?? {}) as Record<string, unknown>;
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  const questionOrigin = detectQuestionOrigin(request, payload);

  // The browser sends `conversationId` — a UUID held in sessionStorage and
  // reused for every turn of a conversation. `sessionId` is still accepted for
  // any client that sends it instead.
  const conversationId =
    optionalText(payload.conversationId) ??
    optionalText(payload.sessionId) ??
    `session_${crypto.randomUUID().slice(0, 12)}`;

  // Extract or assign device visitor cookie token
  const cookieHeader = request.headers.get('cookie') || '';
  const cookieVisitorMatch = cookieHeader.match(/rockygpt_visitor_id=([^;]+)/);
  const visitorId =
    optionalText(payload.visitorId) ??
    (cookieVisitorMatch
      ? decodeURIComponent(cookieVisitorMatch[1].trim())
      : `visitor_${conversationId.replace(/^session_/, '')}`);

  // Retained evidence is scoped by the cookie this route issued, not by the
  // visitor id in the request body. Both identifiers are client-supplied, but
  // the cookie is the one this app hands out and the browser returns, so it is
  // the better of the two to key another visitor's evidence away from.
  const stateVisitorId = cookieVisitorMatch
    ? decodeURIComponent(cookieVisitorMatch[1].trim())
    : visitorId;

  const withVisitorCookie = (response: NextResponse) => {
    response.cookies.set('rockygpt_visitor_id', visitorId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: 'lax',
    });
    return response;
  };

  try {
    const result = await ask({
      message,
      history: readHistory(payload.history),
      styleMode: optionalText(payload.styleMode),
      responseMode: optionalText(payload.responseMode),
      timezone: optionalText(payload.timezone),
      conversationId,
      visitorId: stateVisitorId,
      questionOrigin,
    });
    // A refusal is the service's own body and carries its own requestId, so it
    // is passed through rather than rewritten.
    const status = 'error' in result ? 503 : 200;
    return withVisitorCookie(NextResponse.json(result, { status }));
  } catch (error) {
    // Fail closed: an unreachable brain is reported as unavailable rather than
    // answered from anything this process happens to know about campus.
    console.error('Chat turn failed:', error);
    const unreachable = error instanceof BrainUnreachableError;
    return withVisitorCookie(
      NextResponse.json(
        {
          requestId: crypto.randomUUID(),
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: unreachable ? 'RockyGPT is starting up.' : 'RockyGPT is unavailable.',
            retryable: true,
          },
        },
        { status: 503 }
      )
    );
  }
}
