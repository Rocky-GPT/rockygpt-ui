/**
 * One shell for every campus hub modal (Dining, Shuttle, Map, Print, Events,
 * Directory, Safety, Clubs, Calendar, Majors).
 *
 * These had drifted to seven different widths (max-w-md through max-w-6xl) and
 * five different heights, so each card in the quick actions menu opened a panel
 * of a different shape. The size lives here now: change it once and every
 * modal follows.
 */

export const MODAL_OVERLAY =
  'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200';

/**
 * Standard panel: every top-level modal is this exact box.
 *
 * `dvh`, not `vh`: `vh` measures the viewport with the browser chrome hidden
 * and the keyboard away, which is not a size any phone actually shows. At
 * 375x812 that put the panel's own search field at 692-738 — under the
 * keyboard the moment it was tapped, on a fixed panel that cannot scroll to
 * reveal it.
 */
export const MODAL_PANEL =
  'relative w-full max-w-4xl h-[85dvh] flex flex-col bg-background rounded-2xl border border-border shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden';

/**
 * Variant for modals whose content is genuinely short (Campus Safety is the
 * only one today). Same width as MODAL_PANEL so the set still reads as one
 * family, but the height hugs the content instead of being pinned to 85dvh —
 * a fixed height on a few phone numbers leaves half the panel empty.
 */
export const MODAL_PANEL_SHORT =
  'relative w-full max-w-4xl max-h-[85dvh] flex flex-col bg-background rounded-2xl border border-border shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden';
