/**
 * @module components/SafetyModal
 * Public Safety, emergency and student support numbers and links. Static: it
 * needs no campus data, so it works even when the Brain does not.
 */

'use client';

import { useEffect } from 'react';
import { AlertTriangle, ExternalLink, Phone, Shield, X } from 'lucide-react';
import { useAccessibleDialog } from '@/components/useAccessibleDialog';
import { MODAL_OVERLAY, MODAL_PANEL_SHORT } from '@/components/modalShell';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal for public safety, emergency, and student support information.
 */
export function SafetyModal({ isOpen, onClose }: ModalProps) {
  const dialogRef = useAccessibleDialog(isOpen, onClose);
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={MODAL_OVERLAY}>
      <div className="absolute inset-0" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Public Safety information"
        tabIndex={-1}
        className={MODAL_PANEL_SHORT}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-500/10 rounded-xl">
              <Shield className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-none mb-1">Campus Safety</h2>
              <p className="text-xs text-muted-foreground font-medium">Emergency contacts</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors opacity-70 hover:opacity-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          {/* Emergency Call */}
          <a
            href="tel:2016846666"
            className="flex items-center gap-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-colors"
          >
            <div className="p-3 bg-red-500 rounded-full shrink-0">
              <Phone className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums whitespace-nowrap">
                201-684-6666
              </p>
              <p className="text-sm text-muted-foreground">Emergency · Public Safety 24/7</p>
            </div>
          </a>

          {/* Non-Emergency */}
          <a
            href="tel:2016847432"
            className="flex items-center gap-4 p-4 bg-muted/50 border border-border rounded-xl hover:bg-muted transition-colors"
          >
            <div className="p-3 bg-primary/10 rounded-full shrink-0">
              <Phone className="w-6 h-6 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold tabular-nums whitespace-nowrap">201-684-7432</p>
              <p className="text-sm text-muted-foreground">Non-emergency · Inquiries &amp; escorts</p>
            </div>
          </a>

          {/* Quick Links */}
          <div className="pt-2 space-y-2">
            <h3 className="text-xs font-bold uppercase text-muted-foreground">Quick Links</h3>
            <a
              href="https://www.ramapo.edu/publicsafety/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-sm"
            >
              <span>Public Safety Website</span>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </a>
            <a
              href="https://www.ramapo.edu/alert/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-sm"
            >
              <span>Emergency Alerts Sign-up</span>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </a>
          </div>

          {/* SafeWalk */}
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">SafeWalk Program</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Request a safety escort anywhere on campus. Call Public Safety at 201-684-7432.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
