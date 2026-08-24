/**
 * @module components/BulkQuestionModal
 * Modal allowing developers to paste multiple questions (one per line)
 * and run them in sequence in the RockyGPT chat UI.
 */

'use client';

import { useEffect, useState } from 'react';
import { useAccessibleDialog } from '@/components/useAccessibleDialog';
import {
  X,
  Play,
  Trash2,
  Sparkles,
  Layers,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { MODAL_OVERLAY } from '@/components/modalShell';
import capabilityTestQuestions from '@/lib/capability-test-questions.json';

interface BulkQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartSequence: (questions: string[], delayMs: number) => void;
}

/**
 * The capability suite, loaded verbatim from the checked-in question set.
 *
 * These are one ordered conversation rather than a list of independent
 * questions — "which one is cheapest", "does that place take flex", and
 * "where was the registrar again" only mean anything in sequence. The runner
 * sends them in order, so the order in the file is the test.
 */
const SAMPLE_QUESTIONS: string[] = capabilityTestQuestions;
const QUESTIONS_STORAGE_KEY = 'rockygpt_bulk_questions';

const DELAY_OPTIONS = [
  { label: '0.8s (Fast)', value: 800 },
  { label: '1.5s (Normal)', value: 1500 },
  { label: '2.5s (Relaxed)', value: 2500 },
  { label: '4.0s (Slow)', value: 4000 },
];

export function BulkQuestionModal({
  isOpen,
  onClose,
  onStartSequence,
}: BulkQuestionModalProps) {
  const [text, setText] = useState('');
  const [delayMs, setDelayMs] = useState(1500);
  const dialogRef = useAccessibleDialog(isOpen, onClose);

  useEffect(() => {
    try {
      const cachedQuestions = window.localStorage.getItem(QUESTIONS_STORAGE_KEY);
      if (cachedQuestions !== null) setText(cachedQuestions);
    } catch {
      // Keep the runner usable when browser storage is unavailable.
    }
  }, []);

  const updateText = (value: string) => {
    setText(value);
    try {
      if (value) {
        window.localStorage.setItem(QUESTIONS_STORAGE_KEY, value);
      } else {
        window.localStorage.removeItem(QUESTIONS_STORAGE_KEY);
      }
    } catch {
      // Keep the runner usable when browser storage is unavailable.
    }
  };

  if (!isOpen) return null;

  const parsedQuestions = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const handleStart = () => {
    if (parsedQuestions.length === 0) return;
    onStartSequence(parsedQuestions, delayMs);
    onClose();
  };

  const handleLoadSample = () => {
    updateText(SAMPLE_QUESTIONS.join('\n'));
  };

  const handleClear = () => {
    updateText('');
  };

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-question-title"
        className="relative flex w-full max-w-2xl max-h-[90vh] flex-col rounded-2xl border border-border bg-background shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-6 py-4 bg-muted/40">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="bulk-question-title"
                className="text-base font-semibold text-foreground flex items-center gap-2"
              >
                Bulk Question Runner
                <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-400 border border-sky-500/20">
                  Dev Mode
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Paste questions line by line to watch RockyGPT answer them sequentially.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label htmlFor="bulk-questions-input" className="text-xs font-semibold text-foreground">
              Questions (1 per line)
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadSample}
                className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors font-medium"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Load Sample
              </button>
              {text && (
                <>
                  <span className="text-muted-foreground/40 text-xs">•</span>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="relative">
            <textarea
              id="bulk-questions-input"
              value={text}
              onChange={(e) => updateText(e.target.value)}
              placeholder={`Where is the Potter Library?\nWhat time does the Atrium close?\nHow do I connect to campus Wi-Fi?\nWhere is the Bradley Center?`}
              rows={8}
              className="w-full resize-none rounded-xl border border-input bg-card p-3.5 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Configuration & Meta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="rounded-xl border border-border/70 bg-card/60 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-sky-400" />
                <span>Pause Between Questions</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {DELAY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDelayMs(opt.value)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium text-center transition-all ${
                      delayMs === opt.value
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-card/60 p-3 flex flex-col justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Queue Summary</span>
                </div>
                <div className="text-xl font-bold text-foreground">
                  {parsedQuestions.length}{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    {parsedQuestions.length === 1 ? 'question queued' : 'questions queued'}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground/80 mt-2">
                Questions will execute in order with live streaming answers in the chat.
              </p>
            </div>
          </div>

          {parsedQuestions.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                Preview Order:
              </span>
              <div className="max-h-28 overflow-y-auto rounded-lg border border-border/50 bg-muted/30 p-2 space-y-1">
                {parsedQuestions.map((q, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-xs text-muted-foreground truncate"
                  >
                    <span className="flex-shrink-0 font-mono text-[10px] w-4 text-sky-400">
                      {idx + 1}.
                    </span>
                    <span className="truncate">{q}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/80 px-6 py-4 bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={parsedQuestions.length === 0}
            className="flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black px-5 py-2.5 text-xs font-bold transition-all shadow-md hover:shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>
              Start Sequence {parsedQuestions.length > 0 && `(${parsedQuestions.length})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
