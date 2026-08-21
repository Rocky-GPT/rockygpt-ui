import { NextResponse } from 'next/server';
import { MAX_TRANSCRIPT_BYTES, archiveTranscript } from '../../../lib/transcript-archive';

/**
 * @module api/transcripts/route
 * Receives a transcript the browser has just downloaded and writes a copy into
 * the project's `data/transcripts` directory.
 *
 * The download happens in the browser and is already finished by the time this
 * is called, so nothing here can prevent it and a failure is never fatal — the
 * user still has their file. The response says whether a copy was kept, and
 * where.
 */

export const runtime = 'nodejs';

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const payload = (body ?? {}) as { transcript?: unknown };
  const transcript = payload.transcript;
  if (!transcript || typeof transcript !== 'object') {
    return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
  }

  if (JSON.stringify(transcript).length > MAX_TRANSCRIPT_BYTES) {
    return NextResponse.json({ error: 'transcript too large' }, { status: 413 });
  }

  const record = transcript as {
    conversationId?: unknown;
    turns?: unknown;
    exportedAt?: unknown;
    timezone?: unknown;
  };
  const turns = Array.isArray(record.turns) ? record.turns : [];
  const exportedAt = optionalText(record.exportedAt) ?? new Date().toISOString();

  const archived = archiveTranscript(
    transcript,
    exportedAt,
    optionalText(record.conversationId),
    optionalText(record.timezone)
  );

  return NextResponse.json(
    { stored: Boolean(archived), file: archived?.file ?? null, turnCount: turns.length },
    { status: archived ? 200 : 202 }
  );
}
