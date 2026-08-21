import { normalizeMessage } from './normalize';

export type RockyModeCommand = 'enable' | 'disable';

const ENABLE_COMMAND = /^rocky[.!?]*$/i;
const DISABLE_COMMAND = /^rocky\s+off[.!?]*$/i;

/** Reads the typed easter-egg command, if the message is one. */
export function rockyModeCommandForMessage(message: string): RockyModeCommand | null {
  const normalized = normalizeMessage(message);
  if (DISABLE_COMMAND.test(normalized)) return 'disable';
  if (ENABLE_COMMAND.test(normalized)) return 'enable';
  return null;
}
