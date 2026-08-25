/**
 * @module api/remote
 * Drives the open chat page from a terminal.
 *
 * The point is that a command runs through the page rather than around it: a
 * remote `ask` calls the same `sendMessage` a keystroke does, so what happens
 * is what a student would have got, and it is visible in the browser while it
 * happens. Posting to `/api/chat` directly would answer the question without
 * the page ever knowing, which is a different thing being tested.
 *
 * Dev-only, single process, memory-only. The queue is a module-level array;
 * restarting the server forgets everything, which is correct for a tool whose
 * whole state is "what is that browser tab doing right now".
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Command =
  | { id: string; type: 'ask'; text: string }
  | { id: string; type: 'bulk'; questions: string[]; delayMs: number }
  | { id: string; type: 'clear' };

/** What the page reported back, keyed by command id. */
const results = new Map<string, unknown>();
const listeners = new Set<(command: Command) => void>();

/**
 * Results outlive the command that produced them only briefly. A CLI that
 * walks away should not leak the transcript into a long-lived process.
 */
const RESULT_TTL_MS = 5 * 60 * 1000;

function remember(id: string, value: unknown) {
  results.set(id, value);
  setTimeout(() => results.delete(id), RESULT_TTL_MS).unref?.();
}

/** The page subscribes here and stays subscribed. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const waitFor = url.searchParams.get('result');

  if (waitFor) {
    const value = results.get(waitFor);
    return NextResponse.json(value === undefined ? { pending: true } : { done: true, value });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (command: Command) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(command)}\n\n`));
      listeners.add(send);
      controller.enqueue(encoder.encode(': subscribed\n\n'));
      // A comment every 20s so proxies and the browser keep the socket open
      // through a quiet stretch.
      const beat = setInterval(() => controller.enqueue(encoder.encode(': beat\n\n')), 20_000);
      request.signal.addEventListener('abort', () => {
        clearInterval(beat);
        listeners.delete(send);
        controller.close();
      });
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;

  // The page reporting what a command produced.
  if (typeof body.resultFor === 'string') {
    remember(body.resultFor, body.value);
    return NextResponse.json({ ok: true });
  }

  if (listeners.size === 0) {
    return NextResponse.json(
      { error: 'No chat page is listening. Open the app and leave the tab open.' },
      { status: 409 }
    );
  }

  const id = crypto.randomUUID();
  const type = body.type;
  let command: Command;
  if (type === 'ask' && typeof body.text === 'string') {
    command = { id, type: 'ask', text: body.text };
  } else if (type === 'bulk' && Array.isArray(body.questions)) {
    command = {
      id,
      type: 'bulk',
      questions: body.questions.filter((q): q is string => typeof q === 'string'),
      delayMs: typeof body.delayMs === 'number' ? body.delayMs : 1500,
    };
  } else if (type === 'clear') {
    command = { id, type: 'clear' };
  } else {
    return NextResponse.json({ error: `unknown command ${String(type)}` }, { status: 400 });
  }

  for (const send of listeners) send(command);
  return NextResponse.json({ id, listeners: listeners.size });
}
