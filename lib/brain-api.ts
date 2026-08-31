/** UI-owned wire client for the clean-room Brain. */

export interface ChatMessageInput {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessageInput[];
}

export interface ClientAbuseIdentity {
  key: string;
  signature?: string;
}

export const MAX_MESSAGE_LENGTH = 2_000;

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
