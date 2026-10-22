import type { ChatMessageInput, ChatRequest } from './brain-api';

interface HistoryMessage extends ChatMessageInput {
  isError?: boolean;
}

export const FAILED_TURN_MESSAGE = 'The previous request failed. No answer was delivered.';

/**
 * How much earlier conversation travels with each question.
 *
 * The whole thread used to go every time. The Brain refuses more than 80
 * messages or 48,000 characters in total (and 16,000 in any one), and this
 * app's own route refuses bodies over 64 KB, so a long session ended with
 * every question failing and no way back but a new tab.
 *
 * A 40-message window then cut Q29's request to Q10–Q28 although the whole
 * 57-message conversation fit, and the Brain denied an answer it had given
 * (09-29). The count now matches the Brain's own cap. Characters stay at half
 * the Brain's, because history competes with retrieved evidence for the
 * model's input.
 */
export const MAX_HISTORY_MESSAGES = 80;
export const MAX_HISTORY_CHARACTERS = 24_000;
/** An old answer is clipped, not dropped: its opening is what later turns refer to. */
export const MAX_HISTORY_MESSAGE_CHARACTERS = 4_000;
/**
 * The latest answer goes whole: follow-ups point at its last lines ("the
 * exception at the end"), and final answers stay under 12,000 characters.
 * This is only the Brain's per-message ceiling, so nothing it would refuse is sent.
 */
export const MAX_LATEST_ANSWER_CHARACTERS = 16_000;
/**
 * The chat route refuses bodies over 64 KiB, measured in bytes. 24,000
 * characters of Chinese text serialize to about 68 KB, so the character budget
 * alone let a conversation end in 413 (09-29). This leaves headroom under it.
 */
export const MAX_REQUEST_BYTES = 60 * 1_024;

const encoder = new TextEncoder();

function clip(message: ChatMessageInput, limit: number): ChatMessageInput {
  if (message.content.length <= limit) return message;
  // A bare ellipsis read as a complete answer, so the model could deny what
  // the missing part said. The marker tells it text is missing.
  const marker = `… [rest of this earlier ${message.role === 'assistant' ? 'answer' : 'message'} not sent]`;
  return {
    role: message.role,
    content: `${message.content.slice(0, limit - marker.length).trimEnd()}${marker}`,
  };
}

/** The exact body the page posts: omittedMessages only when something was left out. */
function requestBody(messages: ChatMessageInput[], omittedMessages: number): ChatRequest {
  // An older Brain refuses unknown fields with 422, so a conversation that
  // fits whole keeps sending exactly { messages }.
  return omittedMessages > 0 ? { messages, omittedMessages } : { messages };
}

export function requestBytes(request: ChatRequest): number {
  return encoder.encode(JSON.stringify(request)).byteLength;
}

/**
 * Builds the chat request for a new question. Earlier messages that do not fit
 * are dropped oldest first and counted in omittedMessages, so the Brain knows
 * the conversation it sees is not the whole one the student can see.
 */
export function buildChatRequest(
  messages: readonly HistoryMessage[],
  currentUserMessage: ChatMessageInput
): ChatRequest {
  let latestAnswer = -1;
  messages.forEach((message, index) => {
    if (message.role === 'assistant' && !message.isError && message.content) latestAnswer = index;
  });
  const history = messages.flatMap<ChatMessageInput>((message, index) => {
    // Keep the failed turn's place without replaying support IDs or error details
    // as model instructions. Its user question remains available for follow-ups.
    if (message.isError) return [{ role: 'assistant', content: FAILED_TURN_MESSAGE }];
    if (!message.content) return [];
    const limit = index === latestAnswer ? MAX_LATEST_ANSWER_CHARACTERS : MAX_HISTORY_MESSAGE_CHARACTERS;
    return [clip({ role: message.role, content: message.content }, limit)];
  });

  const current: ChatMessageInput = { role: currentUserMessage.role, content: currentUserMessage.content };
  let kept: ChatMessageInput[] = [];
  let budget = MAX_HISTORY_CHARACTERS - current.content.length;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (kept.length >= MAX_HISTORY_MESSAGES - 1 || message.content.length > budget) break;
    kept.unshift(message);
    budget -= message.content.length;
  }

  // The Brain requires a conversation to open with a question, so a window
  // that starts mid-exchange drops the orphaned answer.
  const dropOrphan = () => {
    while (kept.length > 0 && kept[0].role !== 'user') kept = kept.slice(1);
  };
  dropOrphan();
  let request = requestBody([...kept, current], history.length - kept.length);
  while (kept.length > 0 && requestBytes(request) > MAX_REQUEST_BYTES) {
    kept = kept.slice(1);
    dropOrphan();
    request = requestBody([...kept, current], history.length - kept.length);
  }
  return request;
}
