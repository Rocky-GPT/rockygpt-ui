'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';

interface PageLoadingScreenProps {
  /** Explicit display duration in ms (if omitted, dynamically 2700ms for first-time welcome and 750ms for returning users) */
  minDuration?: number;
  /** Triggered right when the splash screen begins its dissolve transition */
  onFadeStart?: () => void;
  /** Callback when loading animation is completely dismissed */
  onComplete?: () => void;
}

export function PageLoadingScreen({
  minDuration,
  onFadeStart,
  onComplete,
}: PageLoadingScreenProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [progress, setProgress] = useState(0);

  // The parent re-creates these callbacks on every render, so keep them in refs
  // and let the splash sequence below run exactly once per mount.
  const onFadeStartRef = useRef(onFadeStart);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onFadeStartRef.current = onFadeStart;
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    // If automated testing, never mount splash to prevent test interference
    if (typeof navigator !== 'undefined' && navigator.webdriver) {
      onFadeStartRef.current?.();
      onCompleteRef.current?.();
      return;
    }

    const isDev =
      process.env.NODE_ENV === 'development' ||
      (typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));

    // In dev build: skip splash screen on refresh for instant development speed
    if (isDev) {
      onFadeStartRef.current?.();
      onCompleteRef.current?.();
      return;
    }

    // First-time welcome visit = 2700ms (~3.0s total with dissolve)
    // Subsequent visits = 750ms (~1.0s total fast splash)
    let effectiveDuration = minDuration;
    let isFirst = false;
    if (effectiveDuration === undefined) {
      try {
        const seen = typeof window !== 'undefined' && window.localStorage.getItem('rockygpt_welcome_seen');
        isFirst = !seen;
        effectiveDuration = isFirst ? 2700 : 750;
      } catch {
        effectiveDuration = 750;
      }
    } else {
      isFirst = effectiveDuration > 1500;
    }

    setIsFirstTime(isFirst);
    setIsVisible(true);

    // Smoothly animate progress bar to 100% over the active duration if shown
    const start = performance.now();
    let frameId: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(100, Math.round((elapsed / Math.max(1, effectiveDuration - 50)) * 100));
      setProgress(pct);
      if (pct < 100) {
        frameId = requestAnimationFrame(tick);
      }
    };
    if (isFirst) {
      frameId = requestAnimationFrame(tick);
    }

    let removeTimer: ReturnType<typeof setTimeout>;
    const timer = setTimeout(() => {
      setIsFadingOut(true);
      onFadeStartRef.current?.();
      removeTimer = setTimeout(() => {
        setIsVisible(false);
        onCompleteRef.current?.();
      }, 300); // 300ms smooth dissolve
    }, effectiveDuration);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      clearTimeout(timer);
      clearTimeout(removeTimer);
    };
  }, [minDuration]);

  if (!isVisible) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[999] flex flex-col items-center justify-center bg-[#09090b] transition-all duration-350 ease-out ${
        isFadingOut ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Dynamic Multi-Stop Maroon & Rose Ambient Core */}
      <div className="absolute w-[380px] sm:w-[520px] h-[380px] sm:h-[520px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(142,10,38,0.5),rgba(244,168,181,0.12)_45%,transparent_70%)] blur-3xl animate-pulse pointer-events-none" />

      {/* Main Logo Container */}
      <div className="relative flex flex-col items-center gap-4 z-10 select-none">
        
        {/* Unique Orbital Starlight Crest */}
        <div className="relative flex items-center justify-center">
          {/* Rotating outer orbital ring */}
          <div className="absolute -inset-2.5 rounded-3xl border border-[#f4a8b5]/20 animate-spin duration-7000 pointer-events-none" />
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-[#8E0A26] via-[#f4a8b5] to-[#8E0A26] opacity-30 blur-md animate-pulse" />

          {/* Central Glassmorphic Badge */}
          <div className="relative flex items-center justify-center w-15 h-15 rounded-2xl bg-gradient-to-br from-[#4d161d] to-[#17171c] border border-[#8a2432]/70 shadow-[0_0_35px_rgba(142,10,38,0.6)]">
            <Sparkles className="w-7 h-7 text-[#f4a8b5] animate-sparkle-magical" />
          </div>
        </div>

        {/* Wordmark with Liquid Light Aesthetic */}
        <div className="flex items-center tracking-widest text-3xl sm:text-4xl font-black mt-1">
          <span className="text-white tracking-widest drop-shadow-[0_2px_14px_rgba(255,255,255,0.22)]">
            ROCKY
          </span>
          <span className="bg-gradient-to-r from-[#d43f5e] via-[#f4a8b5] to-[#fda4af] bg-clip-text text-transparent ml-1.5 font-black drop-shadow-[0_2px_18px_rgba(244,168,181,0.5)]">
            GPT
          </span>
        </div>

        {/* Campus Subtext */}
        <p className="text-[11px] sm:text-xs font-semibold tracking-widest text-neutral-400 uppercase">
          Your AI Guide to Ramapo College
        </p>

        {/* Luminous Energy Beam (Only shown on First-Time Welcome Launch) */}
        {isFirstTime && (
          <div className="mt-3 w-44 sm:w-56 h-1 rounded-full bg-white/10 overflow-hidden relative shadow-[0_0_10px_rgba(142,10,38,0.3)]">
            <div
              className="h-full bg-gradient-to-r from-[#8a2432] via-[#d43f5e] to-[#f4a8b5] transition-all duration-75 ease-out shadow-[0_0_14px_#f4a8b5]"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
