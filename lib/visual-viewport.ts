'use client';

/**
 * @module lib/visual-viewport
 * How much of the page the on-screen keyboard is standing on.
 *
 * Two viewports exist on a phone and they disagree while the keyboard is up.
 * The *layout* viewport is what CSS lays out against and what `fixed` anchors
 * to; it does not move. The *visual* viewport is the part you can still see.
 * `documentElement.clientHeight` reports the first, so a composer pinned to
 * `bottom-0` is pinned underneath the keyboard: at 375x812 it sat at 694-812
 * with roughly 340px of that covered, and nothing could scroll it into view
 * because it is fixed and there is no overflow to scroll.
 *
 * The instinct is to make the keyboard resize the layout, which fixes the
 * composer by moving the entire page — every fixed thing, the scroll position,
 * the modal you were reading. Safari's own address bar does not do that. It
 * leaves the page exactly where it was and floats one bar above the keyboard.
 *
 * So this measures the disagreement and publishes it, once, as
 * `--keyboard-inset` on the document element. Anything that needs to sit above
 * the keyboard reads that variable and moves itself. Nothing else moves.
 *
 * One listener serves every reader: the measurement is a property of the
 * window, so a second subscriber is a second consumer of one number, never a
 * second `resize` handler.
 */

import { useSyncExternalStore } from 'react';

/** Published on `document.documentElement` for CSS to read. */
export const KEYBOARD_INSET_PROPERTY = '--keyboard-inset';

/** Sub-pixel drift is not a keyboard; below this the inset reads as zero. */
const NOISE_FLOOR = 1;

let inset = 0;
let listening = false;
const readers = new Set<() => void>();

/**
 * The height the keyboard covers, in CSS pixels.
 *
 * `offsetTop` matters as much as `height`: iOS scrolls the visual viewport
 * within the layout viewport to keep a focused field visible, so the covered
 * strip is what remains below the visible band, not simply the height lost.
 *
 * Measured against `documentElement.clientHeight` rather than
 * `window.innerHeight`, because only the first is the box a `fixed` element is
 * positioned inside. On iOS Safari `innerHeight` also counts the strip behind
 * the collapsed bottom toolbar, which `visualViewport.height` does not, so
 * subtracting one from the other charged the keyboard for the toolbar too —
 * about seventy pixels of dead space between a panel and the keys it was
 * supposed to be sitting on.
 */
function measure(): number {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  const layout = document.documentElement.clientHeight || window.innerHeight;
  const covered = layout - (viewport.height + viewport.offsetTop);
  return covered > NOISE_FLOOR ? Math.round(covered) : 0;
}

function publish(): void {
  const next = measure();
  if (next === inset) return;
  inset = next;
  document.documentElement.style.setProperty(KEYBOARD_INSET_PROPERTY, `${next}px`);
  for (const reader of readers) reader();
}

function subscribe(onChange: () => void): () => void {
  readers.add(onChange);
  const viewport = window.visualViewport;
  if (viewport && !listening) {
    listening = true;
    // `scroll` as well as `resize`: iOS reports the keyboard by moving the
    // visual viewport as often as by shrinking it.
    viewport.addEventListener('resize', publish);
    viewport.addEventListener('scroll', publish);
    window.addEventListener('orientationchange', publish);
    publish();
  }
  return () => {
    readers.delete(onChange);
    if (readers.size > 0 || !viewport) return;
    listening = false;
    viewport.removeEventListener('resize', publish);
    viewport.removeEventListener('scroll', publish);
    window.removeEventListener('orientationchange', publish);
    // Leave nothing behind claiming a keyboard is up.
    document.documentElement.style.removeProperty(KEYBOARD_INSET_PROPERTY);
    inset = 0;
  };
}

const read = (): number => inset;
/** Zero on the server, where there is no keyboard and no viewport to ask. */
const readOnServer = (): number => 0;

/**
 * Subscribe to the keyboard inset, and keep `--keyboard-inset` published while
 * anything is subscribed.
 *
 * Call it once somewhere that outlives the keyboard — the page shell — and CSS
 * anywhere below can use the variable without subscribing to anything. The
 * returned number is for the cases that need it in JavaScript.
 */
export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribe, read, readOnServer);
}
