/** Public operation labels, not model reasoning or an estimated timer sequence. */
export const CHAT_PROGRESS_LABELS: Record<string, string> = {
  connecting: 'Connecting to RockyGPT…',
  understanding: 'Understanding your question…',
  retrieving: 'Fetching campus data…',
  calculating: 'Calculating…',
  composing: 'Preparing the answer…',
  reviewing: 'Checking the answer…',
};

const TOPICS: Record<string, string> = {
  documents: 'campus policies and guidance', critical_facts: 'published campus facts',
  contacts: 'campus contact details', campus_hours: 'campus opening hours',
  dining_hours: 'dining hours', menu: 'menu items', calendar: 'academic dates',
  events: 'campus events', clubs: 'student organizations', programs: 'academic programs',
  program_requirements: 'program requirements', courses: 'course information',
  faculty: 'faculty information', shuttle: 'shuttle schedules',
};
const MEALS: Record<string, string> = {
  breakfast: 'breakfast', brunch: 'brunch', lunch: 'lunch', dinner: 'dinner', latenight: 'late-night',
};
const OPERATIONS: Record<string, string> = {
  sum: 'Adding the selected values.', difference: 'Finding the difference between the selected values.',
  mean: 'Finding the average of the selected values.', minimum: 'Finding the lowest selected value.',
  maximum: 'Finding the highest selected value.', sort: 'Putting the selected values in order.',
  count: 'Counting the matching records.', duration: 'Calculating the time between the selected times.',
  compare_times: 'Comparing the selected times.', departures: 'Comparing scheduled departures with the requested time.',
};

function displayDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** Render only known operation metadata, never server-supplied prose or draft text. */
export function progressDetail(payload: Record<string, unknown>): string {
  if (payload.stage === 'connecting') return 'Sending your question to RockyGPT.';
  if (payload.stage === 'understanding') return 'Reading your question and the conversation so far.';
  if (payload.stage === 'calculating') {
    return typeof payload.operation === 'string' && Object.hasOwn(OPERATIONS, payload.operation)
      ? OPERATIONS[payload.operation] : 'Working through the selected numbers and times.';
  }
  const subjects = Array.isArray(payload.subjects) ? payload.subjects : [];
  const descriptions = subjects.slice(0, 8).flatMap((subject: unknown) => {
    if (!subject || typeof subject !== 'object') return [];
    const item = subject as Record<string, unknown>;
    if (typeof item.topic !== 'string' || !Object.hasOwn(TOPICS, item.topic)) return [];
    let name = TOPICS[item.topic];
    if (item.topic === 'menu' && typeof item.meal === 'string' && Object.hasOwn(MEALS, item.meal)) {
      name = `${MEALS[item.meal]} ${name}`;
    }
    const from = displayDate(item.date_from);
    const to = displayDate(item.date_to);
    if (from) name += ` (${from}${to && to !== from ? ` – ${to}` : ''})`;
    return [name];
  });
  const unique = [...new Set(descriptions)];
  const subject = unique.slice(0, 2).join(' and ') + (unique.length > 2 ? ' and related information' : '');
  if (payload.stage === 'retrieving') return subject ? `Looking up ${subject}.` : 'Reading the selected campus sources.';
  if (payload.stage === 'composing') return subject ? `Putting together the response about ${subject}.` : 'Putting together a response to your question.';
  if (payload.stage === 'reviewing') return subject ? `Checking claims about ${subject} against the retrieved sources.` : 'Checking the response against the available information.';
  return '';
}

export class ChatStreamError extends Error {
  constructor() {
    super('The connection ended before an answer arrived. Please try again.');
    this.name = 'ChatStreamError';
  }
}

/** Draft previews are separate from the final response and only appear during review. */
export async function readChatStream(
  response: Response,
  onProgress: (label: string, detail: string, draft: string) => void
): Promise<Response> {
  if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
    return response;
  }
  if (!response.body) throw new ChatStreamError();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 1_000_000) throw new ChatStreamError();
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        let event = '';
        const lines: string[] = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          if (line.startsWith('data:')) lines.push(line.slice(5).trimStart());
        }
        if (!lines.length || (event !== 'progress' && event !== 'result')) continue;
        const data: unknown = JSON.parse(lines.join('\n'));
        if (!data || typeof data !== 'object') throw new ChatStreamError();
        const payload = data as Record<string, unknown>;
        if (event === 'progress') {
          if (typeof payload.stage === 'string' && Object.hasOwn(CHAT_PROGRESS_LABELS, payload.stage)) {
            const draft = payload.stage === 'reviewing' && typeof payload.draft === 'string'
              ? payload.draft.slice(0, 72000).trim() : '';
            onProgress(CHAT_PROGRESS_LABELS[payload.stage], progressDetail(payload), draft);
          }
        } else {
          if (
            typeof payload.status !== 'number' || !Number.isInteger(payload.status) ||
            payload.status < 200 || payload.status > 599 ||
            payload.status === 204 || payload.status === 205 || payload.status === 304 ||
            !payload.body || typeof payload.body !== 'object'
          ) throw new ChatStreamError();
          const headers = new Headers({ 'content-type': 'application/json' });
          const requestId = response.headers.get('x-request-id');
          if (requestId) headers.set('x-request-id', requestId);
          return new Response(JSON.stringify(payload.body), { status: payload.status, headers });
        }
      }
      if (done) throw new ChatStreamError();
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ChatStreamError();
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
