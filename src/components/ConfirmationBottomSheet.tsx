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
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/65 p-0 sm:p-4"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile grab handle */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <span
            className="h-1 w-10 rounded-full"
            style={{ backgroundColor: 'var(--border-strong)' }}
          />
        </div>

        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b border-[var(--border-hairline)]">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: isDestructive ? 'var(--danger-soft)' : 'var(--accent-soft)',
                color: isDestructive ? 'var(--danger)' : 'var(--accent)',
              }}
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
              <p className="text-xs text-[var(--text-muted)]">
                Confirm before Gwen completes this action
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label="Cancel action"
            className="h-9 w-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {action.kind === 'gmail_send' && (
            <div className="space-y-3 text-sm">
              <div className="rounded-2xl p-3.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-[var(--text-muted)]">To</span>
                  <span className="font-medium text-[var(--text-primary)] truncate">
                    {action.to}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-xs border-t border-[var(--border-hairline)] pt-2">
                  <span className="text-[var(--text-muted)]">Subject</span>
                  <span className="font-medium text-[var(--text-primary)] truncate">
                    {action.subject}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl p-3.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
                <p className="text-xs text-[var(--text-muted)] mb-1">Message Body</p>
                <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                  {action.body}
                </p>
              </div>
            </div>
          )}

          {action.kind === 'calendar_create' && (
            <div className="rounded-2xl p-4 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2 text-xs">
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
                <p className="pt-1 border-t border-[var(--border-hairline)] text-[var(--text-secondary)]">
                  {action.description}
                </p>
              )}
            </div>
          )}

          {action.kind === 'calendar_delete' && (
            <div className="rounded-2xl p-4 border space-y-2" style={{ backgroundColor: 'var(--danger-soft)', borderColor: 'var(--danger)' }}>
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--danger)]">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Remove event from Google Calendar</span>
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)]">{action.summary}</p>
            </div>
          )}

          {action.kind === 'playstore_install' && (
            <div className="space-y-3">
              <div className="rounded-2xl p-4 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-1.5">
                <div className="text-base font-display font-semibold text-[var(--text-primary)]">
                  {action.app.appName}
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {action.app.developer} · {action.app.packageId}
                </p>
                {action.app.summary && (
                  <p className="text-xs text-[var(--text-secondary)] pt-1 leading-relaxed">
                    {action.app.summary}
                  </p>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Gwen will open the official Google Play Store listing so you can review permissions and tap Install.
              </p>
            </div>
          )}

          {action.kind === 'browser_download' && (
            <div className="space-y-3">
              {action.media.kind === 'image' && action.media.imageUrl && !imgFailed ? (
                <div className="rounded-2xl overflow-hidden border border-[var(--border-hairline)] bg-[var(--bg-elevated)] max-h-56 flex items-center justify-center">
                  <img
                    src={action.media.imageUrl}
                    alt={action.media.title}
                    referrerPolicy="no-referrer"
                    onError={() => setImgFailed(true)}
                    className="w-full max-h-56 object-contain"
                  />
                </div>
              ) : (
                <div className="rounded-2xl p-5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-center gap-3">
                  <Download className="h-6 w-6 text-[var(--accent)] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                      {action.media.suggestedFilename}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] truncate">
                      {action.media.sourceDomain} · {action.media.mimeType}
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-2xl p-3.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-xs space-y-1">
                <div className="font-semibold text-[var(--text-primary)] truncate">
                  {action.media.title}
                </div>
                <div className="text-[var(--text-muted)]">
                  Source: {action.media.sourceDomain} · Save to Pictures/GwenDownloads/{action.media.suggestedFilename}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="min-h-[44px] px-4 rounded-xl text-sm font-medium bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-hairline)] hover:text-[var(--text-primary)] whitespace-nowrap cursor-pointer"
            >
              Cancel
            </button>

            {action.kind === 'playstore_install' ? (
              <a
                href={isAndroid ? action.app.marketUri : action.app.playStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onConfirm(action)}
                className="min-h-[44px] px-5 rounded-xl text-sm font-semibold flex items-center gap-2 whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
              >
                <ExternalLink className="h-4 w-4" />
                <span>Open Play Store</span>
              </a>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => onConfirm(action)}
                className="min-h-[44px] px-5 rounded-xl text-sm font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-60"
                style={{
                  backgroundColor: isDestructive ? 'var(--danger)' : 'var(--accent)',
                  color: isDestructive ? '#ffffff' : 'var(--accent-contrast)',
                }}
              >
                {busy ? (
                  <span>Working...</span>
                ) : (
                  <span>
                    {action.kind === 'gmail_send'
                      ? 'Confirm & Send Email'
                      : action.kind === 'calendar_create'
                        ? 'Add to Calendar'
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
