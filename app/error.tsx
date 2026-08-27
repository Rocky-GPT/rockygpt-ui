'use client';

/**
 * @module app/error
 * What the page becomes when a render throws.
 *
 * There was no boundary here, so one unguarded read took the whole document
 * down: opening Majors & Courses while the data service was out stored the
 * `{ error }` body as the programs payload, read `schools` off it, and the tab
 * went to the browser's own "This page couldn't load" — no chat, no history,
 * nothing to go back to but a reload.
 *
 * A boundary does not make the bug acceptable; it makes one broken panel cost
 * one panel. The conversation above it is the part worth not losing.
 */

import { useEffect } from 'react';

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error('RockyGPT page error:', error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <h1 className="text-xl font-semibold text-foreground">Something went wrong on this page</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        RockyGPT hit an unexpected problem. Trying again usually works — campus data may have been
        briefly unavailable.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Try again
        </button>
        <button
          type="button"
          // A hard navigation, not a client-side one: whatever state got the
          // page here is exactly what should not survive starting over.
          onClick={() => window.location.assign('/')}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        >
          Start over
        </button>
      </div>
      {error.digest ? (
        <p className="text-xs text-muted-foreground/70">Reference: {error.digest}</p>
      ) : null}
    </main>
  );
}
