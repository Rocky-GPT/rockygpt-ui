/**
 * @module components/PanelUnavailable
 * What a campus panel shows when its data could not be loaded.
 *
 * Every panel used to turn a failed request into its empty state: "No Menu
 * Published Today", "0 organizations" with a Clear filters button, a blank
 * schedule under "Showing Today's Schedule". Each of those is a claim about
 * campus, and none of them was true. A failure says it is a failure, offers
 * another try, and points at the official page the data is collected from.
 */

'use client';

interface PanelUnavailableProps {
  /** What could not be loaded, read after "Couldn't load": "the menu". */
  what: string;
  /** Ramapo's own page for the same information. */
  officialUrl: string;
  /** Link text naming that page: "Open Ramapo Dining". */
  officialLabel: string;
  onRetry?: () => void;
  className?: string;
}

export function PanelUnavailable({
  what,
  officialUrl,
  officialLabel,
  onRetry,
  className = '',
}: PanelUnavailableProps) {
  return (
    <div
      role="alert"
      className={`mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-5 text-center ${className}`}
    >
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Couldn&rsquo;t load {what} right now</p>
        <p className="text-xs leading-5 text-muted-foreground">
          This is a problem on our side, not missing campus information.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 rounded-xl border border-foreground/30 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/10"
          >
            Try again
          </button>
        )}
        <a
          href={officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-foreground underline underline-offset-4"
        >
          {officialLabel}
        </a>
      </div>
    </div>
  );
}
