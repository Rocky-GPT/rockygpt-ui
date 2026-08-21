'use client';

import { useEffect, useRef } from 'react';

/**
 * Shared accessible-dialog contract (PROB-021). Every modal overlay applies
 * this hook to its dialog root so behavior stays consistent instead of
 * drifting per modal:
 *
 * - Escape closes the dialog.
 * - Focus moves into the dialog on open and is restored to the previously
 *   focused element on close.
 * - Tab and Shift+Tab cycle within the dialog (focus trap).
 *
 * The returned ref goes on the dialog container, which should also carry
 * `role="dialog"`, `aria-modal="true"`, and an `aria-label` (or
 * `aria-labelledby`). Visuals and pointer behavior are untouched.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.closest('[hidden], [aria-hidden="true"]')
  );
}

// Stack of currently open dialogs so nested overlays behave correctly: only
// the topmost dialog responds to Escape and owns the focus trap.
const dialogStack: HTMLElement[] = [];

export function useAccessibleDialog(
  isOpen: boolean,
  onClose: () => void
): React.RefObject<HTMLDivElement | null> {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // Callers commonly pass an inline state setter. Keep the latest callback
  // without making its identity part of the dialog lifecycle: otherwise an
  // unrelated parent render tears down the focus trap, restores outside
  // focus, and then moves focus back to the first control in the dialog.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialogStack.push(dialog);
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Move focus into the dialog without scrolling the page around.
    const firstFocusable = getFocusableElements(dialog)[0];
    (firstFocusable ?? dialog).focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const index = dialogStack.indexOf(dialog);
      if (index >= 0) dialogStack.splice(index, 1);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  return dialogRef;
}
