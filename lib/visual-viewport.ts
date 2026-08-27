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

/**
 * Where the visible band starts, and how tall it is — both in the coordinates
 * a `fixed` element is positioned in.
 *
 * Published as a pair rather than as one "keyboard height" because every way
 * of computing that height needs a layout-viewport height to subtract from,
 * and on iOS there is no trustworthy one to use. `innerHeight` counts the
 * strip behind Safari's collapsed bottom toolbar; so does
 * `documentElement.clientHeight`. `visualViewport.height` does not. Subtract
 * either from the other and the keyboard is charged for the toolbar as well,
 * which is a toolbar's worth of dead space under anything meant to sit on the
 * keys — twice now.
 *
 * These two need no subtraction. `offsetTop` and `height` describe the visible
 * band directly, so an element given both is placed against what is actually
 * on screen and never against a number that might include chrome.
 */
export const VIEWPORT_TOP_PROPERTY = '--viewport-top';
export const VIEWPORT_HEIGHT_PROPERTY = '--viewport-height';

interface Band {
  top: number;
  height: number;
}

let band: Band = { top: 0, height: 0 };
let listening = false;
const readers = new Set<() => void>();

function measure(): Band {
  const viewport = window.visualViewport;
  if (!viewport) {
    return { top: 0, height: document.documentElement.clientHeight };
  }
  return { top: Math.round(viewport.offsetTop), height: Math.round(viewport.height) };
}

function publish(): void {
  const next = measure();
  if (next.top === band.top && next.height === band.height) return;
  band = next;
  const style = document.documentElement.style;
  style.setProperty(VIEWPORT_TOP_PROPERTY, `${next.top}px`);
  style.setProperty(VIEWPORT_HEIGHT_PROPERTY, `${next.height}px`);
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
    const style = document.documentElement.style;
    style.removeProperty(VIEWPORT_TOP_PROPERTY);
    style.removeProperty(VIEWPORT_HEIGHT_PROPERTY);
    band = { top: 0, height: 0 };
  };
}

const read = (): Band => band;
/** Nothing to measure on the server, where there is no viewport to ask. */
const SERVER_BAND: Band = { top: 0, height: 0 };
const readOnServer = (): Band => SERVER_BAND;

/**
 * Subscribe to the keyboard inset, and keep `--keyboard-inset` published while
 * anything is subscribed.
 *
 * Call it once somewhere that outlives the keyboard — the page shell — and CSS
 * anywhere below can use the variable without subscribing to anything. The
 * returned number is for the cases that need it in JavaScript.
 */
export function useViewportBand(): Band {
  return useSyncExternalStore(subscribe, read, readOnServer);
}
