import React, { useState } from 'react';
import {
  Calendar,
  Download,
  ExternalLink,
  Mail,
  ShieldAlert,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import type { PendingConfirmationAction } from '../types/gwen';

interface ConfirmationBottomSheetProps {
  action: PendingConfirmationAction | null;
  busy?: boolean;
  isAndroid?: boolean;
  onConfirm: (action: PendingConfirmationAction) => void;
  onCancel: () => void;
}

export const ConfirmationBottomSheet: React.FC<ConfirmationBottomSheetProps> = ({
  action,
  busy = false,
  isAndroid = false,
  onConfirm,
  onCancel,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (!action) return null;

  const isDestructive = action.kind === 'calendar_delete';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={action.title}
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl glass-sheet sm:border sm:border-white/[0.12] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <span className="h-1 w-9 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3.5 pb-3 flex items-start justify-between gap-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 ${
                isDestructive
                  ? 'bg-rose-500/15 border border-rose-400/30 text-rose-300'
                  : 'aurora-badge'
              }`}
            >
              {action.kind === 'gmail_send' && <Mail className="h-5 w-5" />}
              {action.kind === 'calendar_create' && <Calendar className="h-5 w-5" />}
              {action.kind === 'calendar_delete' && <Trash2 className="h-5 w-5" />}
              {action.kind === 'playstore_install' && <Smartphone className="h-5 w-5" />}
              {action.kind === 'browser_download' && <Download className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)] truncate">
                {action.title}
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Review and confirm before Gwen executes
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label="Cancel action"
            className="h-8 w-8 rounded-full glass-pill flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {action.kind === 'gmail_send' && (
            <div className="space-y-2.5 text-xs">
              <div className="rounded-2xl p-3.5 glass-card space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[var(--text-muted)]">To</span>
                  <span className="font-medium text-[var(--text-primary)] truncate">
                    {action.to}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2 border-t border-white/[0.06] pt-2">
                  <span className="text-[var(--text-muted)]">Subject</span>
                  <span className="font-medium text-[var(--text-primary)] truncate">
                    {action.subject}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl p-3.5 glass-card">
                <p className="text-[11px] text-[var(--text-muted)] mb-1">Message</p>
                <p className="text-xs text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                  {action.body}
                </p>
              </div>
            </div>
          )}

          {action.kind === 'calendar_create' && (
            <div className="rounded-2xl p-4 glass-card space-y-1.5 text-xs">
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                {action.summary}
              </div>
              <div className="text-[var(--text-secondary)]">
                Start: <span className="font-mono-tabular text-[var(--text-primary)]">{action.startIso}</span>
              </div>
              <div className="text-[var(--text-secondary)]">
                End: <span className="font-mono-tabular text-[var(--text-primary)]">{action.endIso}</span>
              </div>
              {action.description && (
                <p className="pt-1.5 border-t border-white/[0.06] text-[var(--text-secondary)]">
                  {action.description}
                </p>
              )}
            </div>
          )}

          {action.kind === 'calendar_delete' && (
            <div className="rounded-2xl p-4 bg-rose-500/12 border border-rose-400/30 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-300">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Remove event from Google Calendar</span>
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)]">{action.summary}</p>
            </div>
          )}

          {action.kind === 'playstore_install' && (
            <div className="space-y-2.5">
              <div className="rounded-2xl p-4 glass-card space-y-1">
                <div className="text-sm font-display font-semibold text-[var(--text-primary)]">
                  {action.app.appName}
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {action.app.developer} · {action.app.packageId}
                </p>
                {action.app.summary && (
                  <p className="text-xs text-[var(--text-secondary)] pt-1 leading-relaxed">
                    {action.app.summary}
                  </p>
                )}
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                Opens the official Google Play Store listing so you can review and install.
              </p>
            </div>
          )}

          {action.kind === 'browser_download' && (
            <div className="space-y-2.5">
              {action.media.kind === 'image' && action.media.imageUrl && !imgFailed ? (
                <div className="rounded-2xl overflow-hidden glass-card max-h-52 flex items-center justify-center">
                  <img
                    src={action.media.imageUrl}
                    alt={action.media.title}
                    referrerPolicy="no-referrer"
                    onError={() => setImgFailed(true)}
                    className="w-full max-h-52 object-contain"
                  />
                </div>
              ) : (
                <div className="rounded-2xl p-4 glass-card flex items-center gap-3">
                  <Download className="h-5 w-5 text-[var(--accent)] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {action.media.suggestedFilename}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate">
                      {action.media.sourceDomain} · {action.media.mimeType}
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-2xl p-3 glass-card text-xs space-y-0.5">
                <div className="font-semibold text-[var(--text-primary)] truncate">
                  {action.media.title}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] truncate">
                  {action.media.sourceDomain} · {action.media.suggestedFilename}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="h-10 px-4 rounded-full glass-pill text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap cursor-pointer"
            >
              Cancel
            </button>

            {action.kind === 'playstore_install' ? (
              <a
                href={isAndroid ? action.app.marketUri : action.app.playStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onConfirm(action)}
                className="h-10 px-5 rounded-full cta-aurora text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Open Play Store</span>
              </a>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => onConfirm(action)}
                className={`h-10 px-5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-55 ${
                  isDestructive
                    ? 'bg-rose-500 text-white hover:bg-rose-600'
                    : 'cta-aurora'
                }`}
              >
                {busy ? (
                  <span>Working...</span>
                ) : (
                  <span>
                    {action.kind === 'gmail_send'
                      ? 'Confirm & Send'
                      : action.kind === 'calendar_create'
                        ? 'Add Event'
                        : action.kind === 'calendar_delete'
                          ? 'Delete Event'
                          : 'Confirm & Download'}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
