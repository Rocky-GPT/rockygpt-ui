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
import { useState } from 'react';
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

type JsonTab = 'inout' | 'debug';

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function MessageJsonModal({
  isOpen,
  onClose,
  question,
  requestId,
  timestamp,
  payload,
}: MessageJsonModalProps) {
  const [activeTab, setActiveTab] = useState<JsonTab>('inout');
  const handleClose = () => {
    setActiveTab('inout');
    onClose();
  };
  const dialogRef = useAccessibleDialog(isOpen, handleClose);

  if (!isOpen) return null;

  const trace = recordValue(payload?.brainTrace);
  const debugData = {
    question: question ?? null,
    receivedAt: timestamp ? new Date(timestamp).toISOString() : null,
    // Absent on error turns, which never parse a body — null says "the UI
    // never held one", which a `{}` placeholder would hide.
    response: payload ?? null,
  };
  return (
    <div className={MODAL_OVERLAY} onClick={handleClose}>
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
            onClick={handleClose}
            aria-label="Close message JSON"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Message JSON views"
          className="flex gap-6 border-b border-border px-5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'inout'}
            onClick={() => setActiveTab('inout')}
            className={`border-b-2 px-1 py-3 text-xs font-semibold transition-colors ${
              activeTab === 'inout'
                ? 'border-sky-400 text-sky-300'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            IN/OUT
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'debug'}
            onClick={() => setActiveTab('debug')}
            className={`border-b-2 px-1 py-3 text-xs font-semibold transition-colors ${
              activeTab === 'debug'
                ? 'border-sky-400 text-sky-300'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Debug
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {activeTab === 'inout' ? (
            <>
              <JsonViewer
                data={trace?.in ?? null}
                title="IN"
                alwaysOpen
                className="border-t-0"
              />
              <JsonViewer data={trace?.out ?? null} title="OUT" alwaysOpen />
            </>
          ) : (
            <JsonViewer
              data={debugData}
              title="Telemetry Trace"
              alwaysOpen
              className="border-t-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
