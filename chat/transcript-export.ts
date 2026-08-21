/**
 * @module chat-ui/transcript-export
 * Builds the JSON a student or operator copies when reporting a bad answer.
 *
 * A screenshot shows the reply but not the request it belongs to or the sources
 * behind it, which is what turns "this looks wrong" into a reproducible case.
 */

export interface ExportableMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  requestId?: string;
  citations?: Array<{ title: string; url: string }>;
  suggestedQuestions?: string[];
  isError?: boolean;
  isTyping?: boolean;
}

export interface TranscriptMeta {
  conversationId?: string | null;
  timezone?: string;
  rockyMode?: boolean;
  exportedAt?: string;
}

export function buildTranscriptExport(
  messages: readonly ExportableMessage[],
  meta: TranscriptMeta = {}
) {
  // A turn still streaming has no answer yet, and exporting it would report an
  // empty assistant reply as though that were the result.
  const settled = messages.filter((message) => !message.isTyping);

  return {
    exportedAt: meta.exportedAt ?? new Date().toISOString(),
    conversationId: meta.conversationId ?? null,
    timezone: meta.timezone ?? null,
    rockyMode: meta.rockyMode ?? false,
    turns: settled.map((message) => ({
      role: message.role,
      content: message.content,
      at: new Date(message.timestamp).toISOString(),
      ...(message.role === 'assistant'
        ? {
            requestId: message.requestId ?? null,
            isError: message.isError ?? false,
            citations:
              message.citations?.map((citation) => ({
                title: citation.title,
                url: citation.url,
              })) ?? [],
            suggestedQuestions: message.suggestedQuestions ?? [],
          }
        : {}),
    })),
  };
}

/**
 * The name an exported transcript is saved under, used for both the file the
 * browser downloads and the copy kept on the server, so the two match.
 *
 * Four fields separated by double underscores, so each reads apart from the
 * next instead of running together as one string of hyphens:
 *
 *   rockygpt-transcript__2026-08-21__12-37-36AM__8d4f1985.json
 *   name                 date        time        conversation
 *
 * Written in the reader's own local time rather than UTC — an export made at
 * half past midnight should not be filed under the previous afternoon — with
 * the date largest unit first so a directory of them still sorts by day.
 */
export function transcriptFileName(
  exportedAt: string,
  timeZone?: string | null,
  conversationId?: string | null
): string {
  const when = new Date(exportedAt);
  const moment = Number.isNaN(when.getTime()) ? new Date() : when;

  const parts = new Intl.DateTimeFormat('en-US', {
    ...(timeZone ? { timeZone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(moment);

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const date = `${value('year')}-${value('month')}-${value('day')}`;
  const meridiem = (value('dayPeriod') || 'AM').toUpperCase().replace(/[^AP M]/g, '').trim();
  const time = `${value('hour')}-${value('minute')}-${value('second')}${meridiem}`;

  const tag = (conversationId ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
  return ['rockygpt-transcript', date, time, tag].filter(Boolean).join('__') + '.json';
}
