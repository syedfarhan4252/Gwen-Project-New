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
      className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl glass-sheet sm:border sm:border-white/[0.12] p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center -mt-1 pb-1">
          <span className="h-1 w-9 rounded-full bg-white/20" />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl aurora-badge flex items-center justify-center shrink-0">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                Install Gwen App
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Launch full-screen right from your home screen
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close install instructions"
            className="h-8 w-8 rounded-full glass-pill flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isIOS ? (
          <ol className="space-y-2.5 text-xs text-[var(--text-secondary)]">
            <li className="rounded-2xl p-3.5 glass-card flex items-start gap-3">
              <span className="h-6 w-6 rounded-full aurora-badge text-[11px] font-bold flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">
                  Tap the Share icon in Safari
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
                  <Share className="h-3 w-3" /> Look at the bottom toolbar of Safari.
                </p>
              </div>
            </li>
            <li className="rounded-2xl p-3.5 glass-card flex items-start gap-3">
              <span className="h-6 w-6 rounded-full aurora-badge text-[11px] font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">
                  Choose &ldquo;Add to Home Screen&rdquo;
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Tap Add in the top-right corner to install Gwen standalone.
                </p>
              </div>
            </li>
          </ol>
        ) : (
          <ol className="space-y-2.5 text-xs text-[var(--text-secondary)]">
            <li className="rounded-2xl p-3.5 glass-card flex items-start gap-3">
              <span className="h-6 w-6 rounded-full aurora-badge text-[11px] font-bold flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">
                  Open browser menu ({isAndroid ? 'Chrome ⋮' : 'Address Bar Install'})
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  {isAndroid
                    ? 'Tap the three dots in the top-right of Chrome.'
                    : 'Click the install icon on the right side of the address bar.'}
                </p>
              </div>
            </li>
            <li className="rounded-2xl p-3.5 glass-card flex items-start gap-3">
              <span className="h-6 w-6 rounded-full aurora-badge text-[11px] font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <p className="font-semibold text-[var(--text-primary)]">
                  Select &ldquo;Install Gwen&rdquo; or &ldquo;Add to Home Screen&rdquo;
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Gwen launches full-screen with offline shell support.
                </p>
              </div>
            </li>
          </ol>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full h-11 rounded-2xl text-xs font-semibold cta-aurora cursor-pointer transition-transform"
        >
          Got It
        </button>
      </div>
    </div>
  );
};

export const InstallAppButton: React.FC<
  InstallAppProps & {
    compact?: boolean;
    iconOnly?: boolean;
    label?: string;
    className?: string;
  }
> = ({
  isInstallable,
  isInstalled,
  isIOS,
  isAndroid,
  onPromptInstall,
  onNotify,
  compact = false,
  iconOnly = false,
  label,
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
        aria-label="Install Gwen App"
        title="Install Gwen App"
        className={
          iconOnly
            ? `h-9 w-9 rounded-full glass-pill flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0 cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/50 ${className}`
            : compact
              ? `h-8 px-3 rounded-full glass-pill text-[11px] font-medium text-[var(--text-primary)] hover:bg-white/[0.11] flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/50 ${className}`
              : `h-10 px-4 rounded-xl glass-pill text-xs font-semibold text-[var(--text-primary)] hover:bg-white/[0.12] flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/50 ${className}`
        }
      >
        <Download className="h-3.5 w-3.5 text-[var(--accent)]" />
        {!iconOnly && <span>{label || (compact ? 'Install' : 'Install App')}</span>}
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

  if (isInstalled || bannerDismissed) return null;
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
      <div className="mx-4 sm:mx-6 lg:mx-8 mt-3 rounded-2xl px-3.5 py-2.5 glass-card flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-xl aurora-badge flex items-center justify-center shrink-0">
            <Download className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
              Install Gwen Standalone
            </p>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              Full-screen home screen app · offline ready
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="h-8 px-3 rounded-full glass-pill text-[11px] font-semibold text-[var(--accent)] hover:bg-white/[0.12] whitespace-nowrap cursor-pointer"
          >
            Install
          </button>
          {onDismissBanner && (
            <button
              type="button"
              onClick={onDismissBanner}
              aria-label="Dismiss install banner"
              className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
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
      className="fixed bottom-16 lg:bottom-6 right-4 z-[60] px-3.5 py-2 rounded-full glass-dock flex items-center gap-2 text-[11px] font-medium text-[var(--text-primary)]"
    >
      <WifiOff className="h-3.5 w-3.5 text-[var(--danger)] shrink-0" />
      <span>Offline — local memories &amp; study vault ready</span>
    </div>
  );
};
