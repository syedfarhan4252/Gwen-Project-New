import React, { useState } from 'react';
import { Download, Share, Smartphone, WifiOff, X } from 'lucide-react';

interface InstallAppProps {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  bannerDismissed?: boolean;
  onDismissBanner?: () => void;
  onPromptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  onNotify?: (msg: string) => void;
}

export const InstallGuideModal: React.FC<{
  open: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  onClose: () => void;
}> = ({ open, isIOS, isAndroid, onClose }) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Install Gwen on your device"
      className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/65 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border shadow-2xl p-6 space-y-5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--accent-soft)',
                color: 'var(--accent)',
              }}
            >
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Install Gwen App
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Run Gwen full-screen from your home screen
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close install instructions"
            className="h-9 w-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isIOS ? (
          <ol className="space-y-3 text-sm text-[var(--text-secondary)]">
            <li className="rounded-2xl p-3.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-start gap-3">
              <span
                className="h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
              >
                1
              </span>
              <div>
                <p className="font-medium text-[var(--text-primary)]">
                  Tap the Share icon in Safari
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
                  <Share className="h-3.5 w-3.5" /> Look at the bottom toolbar of Safari.
                </p>
              </div>
            </li>
            <li className="rounded-2xl p-3.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-start gap-3">
              <span
                className="h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
              >
                2
              </span>
              <div>
                <p className="font-medium text-[var(--text-primary)]">
                  Choose &ldquo;Add to Home Screen&rdquo;
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Tap Add in the top-right corner to install Gwen as a standalone app.
                </p>
              </div>
            </li>
          </ol>
        ) : (
          <ol className="space-y-3 text-sm text-[var(--text-secondary)]">
            <li className="rounded-2xl p-3.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-start gap-3">
              <span
                className="h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
              >
                1
              </span>
              <div>
                <p className="font-medium text-[var(--text-primary)]">
                  Open your browser menu ({isAndroid ? 'Chrome ⋮' : 'Address Bar Install icon'})
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {isAndroid
                    ? 'Tap the three dots in the top-right of Chrome.'
                    : 'Click the install icon on the right side of the browser address bar.'}
                </p>
              </div>
            </li>
            <li className="rounded-2xl p-3.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-start gap-3">
              <span
                className="h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
              >
                2
              </span>
              <div>
                <p className="font-medium text-[var(--text-primary)]">
                  Select &ldquo;Install Gwen&rdquo; or &ldquo;Add to Home Screen&rdquo;
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Gwen will appear on your home screen with full offline shell support.
                </p>
              </div>
            </li>
          </ol>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] rounded-xl text-sm font-semibold cursor-pointer"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-contrast)',
          }}
        >
          Got It
        </button>
      </div>
    </div>
  );
};

export const InstallAppButton: React.FC<
  InstallAppProps & { compact?: boolean; className?: string }
> = ({
  isInstallable,
  isInstalled,
  isIOS,
  isAndroid,
  onPromptInstall,
  onNotify,
  compact = false,
  className = '',
}) => {
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (isInstallable) {
      const outcome = await onPromptInstall();
      if (outcome === 'accepted') {
        onNotify?.('Installing Gwen on your device...');
      }
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        className={`${compact ? 'min-h-[38px] px-3 text-xs' : 'min-h-[44px] px-4 text-sm'} rounded-xl font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer border transition-colors ${className}`}
        style={{
          backgroundColor: compact ? 'var(--bg-elevated)' : 'var(--accent)',
          borderColor: compact ? 'var(--border-hairline)' : 'transparent',
          color: compact ? 'var(--text-primary)' : 'var(--accent-contrast)',
        }}
      >
        <Download className="h-3.5 w-3.5" />
        <span>{compact ? 'Install App' : 'Install Gwen App'}</span>
      </button>

      <InstallGuideModal
        open={showGuide}
        isIOS={isIOS}
        isAndroid={isAndroid}
        onClose={() => setShowGuide(false)}
      />
    </>
  );
};

export const InstallAppBanner: React.FC<InstallAppProps> = ({
  isInstallable,
  isInstalled,
  isIOS,
  isAndroid,
  bannerDismissed,
  onDismissBanner,
  onPromptInstall,
  onNotify,
}) => {
  const [showGuide, setShowGuide] = useState(false);

  // Auto-hide once installed as standalone app or dismissed
  if (isInstalled || bannerDismissed) return null;
  // Show when browser offers native prompt OR on mobile web (iOS/Android)
  if (!isInstallable && !isIOS && !isAndroid) return null;

  const handleInstall = async () => {
    if (isInstallable) {
      const outcome = await onPromptInstall();
      if (outcome === 'accepted') {
        onNotify?.('Gwen is being installed to your home screen!');
      }
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <div
        className="mx-4 sm:mx-6 lg:mx-8 mt-3 rounded-2xl px-4 py-3 border flex items-center justify-between gap-3"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--accent-ring)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              backgroundColor: 'var(--accent-soft)',
              color: 'var(--accent)',
            }}
          >
            <Download className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-[var(--text-primary)] truncate">
              Install Gwen as a Standalone App
            </p>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              One-tap home screen launch with offline shell support
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="min-h-[38px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-contrast)',
            }}
          >
            Install App
          </button>
          {onDismissBanner && (
            <button
              type="button"
              onClick={onDismissBanner}
              aria-label="Dismiss install banner"
              className="h-9 w-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <InstallGuideModal
        open={showGuide}
        isIOS={isIOS}
        isAndroid={isAndroid}
        onClose={() => setShowGuide(false)}
      />
    </>
  );
};

export const OfflineIndicator: React.FC<{ isOnline: boolean }> = ({ isOnline }) => {
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 lg:bottom-6 right-4 z-[60] px-4 py-2.5 rounded-xl border shadow-xl flex items-center gap-2 text-xs font-medium"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        borderColor: 'var(--danger)',
        color: 'var(--text-primary)',
      }}
    >
      <WifiOff className="h-4 w-4 text-[var(--danger)] shrink-0" />
      <span>Offline mode — local memories &amp; kid study records remain available</span>
    </div>
  );
};
