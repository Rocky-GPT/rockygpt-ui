/**
 * @module haptics
 * Mobile haptic-feedback integration for the RockyGPT UI.
 *
 * Wraps the `web-haptics` library to provide preset-based vibration,
 * delegated click haptics, and a repeating typing-pulse controller
 * used during assistant streaming.
 */

import { WebHaptics } from 'web-haptics';

/** Named haptic presets supported by the application. */
type HapticPreset =
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'soft'
  | 'rigid'
  | 'success'
  | 'warning'
  | 'error'
  | 'nudge';

const INTERACTIVE_SELECTOR = 'button, a[href], [role="button"], summary, [data-haptic]';
const DEFAULT_INTENSITY: Record<HapticPreset, number> = {
  selection: 0.35,
  light: 0.35,
  medium: 0.6,
  heavy: 0.85,
  soft: 0.45,
  rigid: 1,
  success: 0.65,
  warning: 0.65,
  error: 0.8,
  nudge: 0.55,
};

const haptics = new WebHaptics({ showSwitch: true });

/** Hides the default web-haptics toggle so it does not interfere with the UI. */
function syncFallbackSwitch() {
  if (typeof document === 'undefined') return;

  const labels = document.querySelectorAll<HTMLElement>('label[for^="web-haptics-"]');
  const inputs = document.querySelectorAll<HTMLElement>('input[id^="web-haptics-"]');

  labels.forEach((label) => {
    label.style.display = 'block';
    label.style.position = 'fixed';
    label.style.left = '-9999px';
    label.style.bottom = 'auto';
    label.style.width = '1px';
    label.style.height = '1px';
    label.style.padding = '0';
    label.style.margin = '0';
    label.style.opacity = '0.01';
    label.style.pointerEvents = 'none';
    label.style.overflow = 'hidden';
    label.style.backgroundColor = 'transparent';
    label.style.color = 'transparent';
    label.style.borderRadius = '0';
    label.style.zIndex = '-1';
  });

  inputs.forEach((input) => {
    input.style.display = 'block';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.opacity = '0.01';
    input.style.pointerEvents = 'none';
  });
}

/** Returns `true` when the browser environment supports haptic feedback and the user has not requested reduced motion. */
function canUseHaptics() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Maps a dataset attribute value to a known preset, defaulting to `selection`. */
function resolvePreset(value?: string | null): HapticPreset {
  switch (value) {
    case 'light':
    case 'medium':
    case 'heavy':
    case 'soft':
    case 'rigid':
    case 'success':
    case 'warning':
    case 'error':
    case 'nudge':
      return value;
    default:
      return 'selection';
  }
}

/** Returns `true` when the target element is visually or semantically disabled. */
function isDisabledTarget(target: HTMLElement) {
  if ('disabled' in target && typeof target.disabled === 'boolean') {
    return target.disabled;
  }

  return target.getAttribute('aria-disabled') === 'true';
}

/**
 * Triggers a single haptic feedback preset when the browser and user settings allow it.
 */
export function triggerHaptic(preset: HapticPreset = 'selection', intensity = DEFAULT_INTENSITY[preset]) {
  if (!canUseHaptics() || document.hidden) return;

  void haptics.trigger(preset, { intensity }).catch(() => {
    // Ignore runtime haptics failures; feedback should never break the UI.
  });
  setTimeout(syncFallbackSwitch, 0);
}

/**
 * Attaches delegated click haptics to interactive elements and returns an unbind callback.
 */
export function bindGlobalTapHaptics() {
  if (typeof document === 'undefined') return () => {};

  const handleClick = (event: MouseEvent) => {
    if (!event.isTrusted || !(event.target instanceof Element)) return;

    const target = event.target.closest<HTMLElement>(INTERACTIVE_SELECTOR);
    if (!target || target.closest('[data-no-haptic="true"]')) return;
    if (isDisabledTarget(target)) return;

    triggerHaptic(resolvePreset(target.dataset.haptic));
  };

  document.addEventListener('click', handleClick, true);
  return () => {
    document.removeEventListener('click', handleClick, true);
  };
}

/**
 * Cancels active haptics and releases the shared WebHaptics instance.
 */
export function destroyHaptics() {
  haptics.cancel();
  haptics.destroy();
}
