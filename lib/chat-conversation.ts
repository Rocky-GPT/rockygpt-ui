import type { ChatMessageInput } from './brain-api';

interface HistoryMessage extends ChatMessageInput {
  isError?: boolean;
}

export const FAILED_TURN_MESSAGE = 'The previous request failed. No answer was delivered.';

export function buildRequestMessages(
  messages: readonly HistoryMessage[],
  currentUserMessage: ChatMessageInput
): ChatMessageInput[] {
  const conversation = messages.flatMap<ChatMessageInput>((message) => {
    // Keep the failed turn's place without replaying support IDs or error details
    // as model instructions. Its user question remains available for follow-ups.
    if (message.isError) return [{ role: 'assistant', content: FAILED_TURN_MESSAGE }];
    if (!message.content) return [];
    return [{ role: message.role, content: message.content }];
  });
  conversation.push({ role: currentUserMessage.role, content: currentUserMessage.content });
  return conversation;
}
