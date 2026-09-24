import type { ChatMessageInput } from './brain-api';

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
 * every question failing and no way back but a new tab. Recent turns carry
 * the follow-ups people actually make; the budget below is half the Brain's,
 * so a limit is never what ends a conversation.
 */
export const MAX_HISTORY_MESSAGES = 40;
export const MAX_HISTORY_CHARACTERS = 24_000;
/** An old answer is clipped, not dropped: its opening is what later turns refer to. */
export const MAX_HISTORY_MESSAGE_CHARACTERS = 4_000;

function clip(content: string): string {
  if (content.length <= MAX_HISTORY_MESSAGE_CHARACTERS) return content;
  return `${content.slice(0, MAX_HISTORY_MESSAGE_CHARACTERS - 1).trimEnd()}…`;
}

export function buildRequestMessages(
  messages: readonly HistoryMessage[],
  currentUserMessage: ChatMessageInput
): ChatMessageInput[] {
  const history = messages.flatMap<ChatMessageInput>((message) => {
    // Keep the failed turn's place without replaying support IDs or error details
    // as model instructions. Its user question remains available for follow-ups.
    if (message.isError) return [{ role: 'assistant', content: FAILED_TURN_MESSAGE }];
    if (!message.content) return [];
    return [{ role: message.role, content: clip(message.content) }];
  });

  const kept: ChatMessageInput[] = [];
  let budget = MAX_HISTORY_CHARACTERS - currentUserMessage.content.length;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (kept.length >= MAX_HISTORY_MESSAGES - 1 || message.content.length > budget) break;
    kept.unshift(message);
    budget -= message.content.length;
  }
  // The Brain requires a conversation to open with a question, so a window
  // that starts mid-exchange drops the orphaned answer.
  while (kept.length > 0 && kept[0].role !== 'user') kept.shift();

  kept.push({ role: currentUserMessage.role, content: currentUserMessage.content });
  return kept;
}
