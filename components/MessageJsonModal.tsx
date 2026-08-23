/**
 * @module components/MessageJsonModal
 * Dev-only inspector for a single assistant message: the exact JSON the
 * brain returned for that turn, alongside the question that produced it.
 *
 * The transcript renders an answer after the UI has picked it apart into
 * content, citations, and actions. When a turn looks wrong, the question is
 * almost always which of those fields the brain actually sent — so this
 * shows the untouched response body rather than a re-serialization of the
 * component state built from it.
 */

'use client';

import { X } from 'lucide-react';
import { useAccessibleDialog } from '@/components/useAccessibleDialog';
import { MODAL_OVERLAY, MODAL_PANEL_SHORT } from '@/components/modalShell';
import { JsonViewer } from '@/components/JsonViewer';

interface MessageJsonModalProps {
  isOpen: boolean;
  onClose: () => void;
  question?: string;
  requestId?: string;
  timestamp?: number;
  /** The response body as received, before the UI destructured it. */
  payload?: Record<string, unknown>;
}

export function MessageJsonModal({
  isOpen,
  onClose,
  question,
  requestId,
  timestamp,
  payload,
}: MessageJsonModalProps) {
  const dialogRef = useAccessibleDialog(isOpen, onClose);

  if (!isOpen) return null;

  const data = {
    question: question ?? null,
    receivedAt: timestamp ? new Date(timestamp).toISOString() : null,
    // Absent on error turns, which never parse a body — null says "the UI
    // never held one", which a `{}` placeholder would hide.
    response: payload ?? null,
  };

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Message JSON"
        tabIndex={-1}
        className={MODAL_PANEL_SHORT}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Message JSON</h2>
            {requestId ? (
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {requestId}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close message JSON"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <JsonViewer data={data} alwaysOpen className="border-t-0" />
        </div>
      </div>
    </div>
  );
}
