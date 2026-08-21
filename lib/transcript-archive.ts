import fs from 'node:fs';
import path from 'node:path';
import { transcriptFileName } from '../chat/transcript-export';

/**
 * @module lib/transcript-archive
 * Keeps a copy of every transcript a user downloads, as a file in the repo.
 *
 * The download itself lands in the user's Downloads folder and nowhere else,
 * so the moment someone exports a conversation to report a bad answer, the
 * only record of what they saw is on their machine. Writing the same payload
 * beside the project means the report can be opened, diffed, and grepped later
 * without asking them to send the file back.
 *
 * Unlike generated data, this directory is committed: the exports are
 * kept deliberately as a record. They contain the full text of a conversation,
 * so what lands here goes into the repository history.
 */

/**
 * Where the files land. Relative to the web app's own root, which is the cwd
 * Next runs with; `ROCKY_TRANSCRIPT_DIR` overrides it for a deployment whose
 * working directory is somewhere else.
 */
const ARCHIVE_DIR = ['transcripts'];

/** A whole conversation of JSON, with room to spare; larger than this is junk. */
export const MAX_TRANSCRIPT_BYTES = 1_000_000;

function archiveDirectory(): string {
  if (process.env.ROCKY_TRANSCRIPT_DIR) return path.resolve(process.env.ROCKY_TRANSCRIPT_DIR);
  return path.join(/*turbopackIgnore: true*/ process.cwd(), ...ARCHIVE_DIR);
}

/**
 * A free name, suffixed only if one is already taken. Two exports of the same
 * conversation within the same second would otherwise land on the same name,
 * and the second would quietly replace the first — which is exactly what an
 * archive must not do.
 */
function uniqueName(directory: string, preferred: string): string {
  if (!fs.existsSync(path.join(directory, preferred))) return preferred;

  const base = preferred.replace(/\.json$/, '');
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base}-${suffix}.json`;
    if (!fs.existsSync(path.join(directory, candidate))) return candidate;
  }
  return `${base}-${Date.now()}.json`;
}

export interface ArchivedTranscript {
  /** Path relative to the project root, for reporting back to the caller. */
  file: string;
  bytes: number;
}

/**
 * Writes one exported transcript. Returns null when it could not be written,
 * so the caller can answer honestly rather than reporting a copy that does not
 * exist — the user's own download has already happened either way.
 */
export function archiveTranscript(
  transcript: unknown,
  exportedAt: string,
  conversationId: string | null,
  timeZone?: string | null
): ArchivedTranscript | null {
  try {
    const directory = archiveDirectory();
    fs.mkdirSync(directory, { recursive: true });

    const name = uniqueName(directory, transcriptFileName(exportedAt, timeZone, conversationId));
    const contents = `${JSON.stringify(transcript, null, 2)}\n`;
    fs.writeFileSync(path.join(directory, name), contents, 'utf-8');

    return { file: path.join(...ARCHIVE_DIR, name), bytes: Buffer.byteLength(contents) };
  } catch (error) {
    console.error('Failed to archive the exported transcript:', error);
    return null;
  }
}
