import React, { useState } from 'react';
import { Lock, ShieldCheck, UserCheck } from 'lucide-react';
import { IMMUTABLE_DEVELOPER_NAME, IMMUTABLE_ORIGIN_STORY } from '../shared/gwenSystemPrompt';

interface FirstLaunchModalProps {
  visible: boolean;
  onComplete: (userName: string) => void;
}

export const FirstLaunchModal: React.FC<FirstLaunchModalProps> = ({
  visible,
  onComplete,
}) => {
  const [name, setName] = useState('');

  if (!visible) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = name.trim();
    if (!cleaned) return;
    onComplete(cleaned);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gwen-welcome-title"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
    >
      <div className="w-full max-w-md rounded-3xl glass-sheet border border-white/[0.12] p-6 space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="h-9 w-9 rounded-2xl aurora-badge font-display text-base font-bold flex items-center justify-center shrink-0">
                G
              </span>
              <h1
                id="gwen-welcome-title"
                className="font-display text-xl font-bold tracking-tight text-[var(--text-primary)]"
              >
                Welcome to Gwen
              </h1>
            </div>
            <span className="inline-flex items-center text-[10px] font-mono-tabular px-2.5 py-1 rounded-full glass-pill text-[var(--accent)]">
              IST · UTC+5:30
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            Your 1-on-1 AI voice companion, camera-aware assistant, and creative studio.
          </p>
        </div>

        {/* Locked Developer Attribution & Ben 10 Origin Card */}
        <div className="rounded-2xl glass-card p-3.5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)]">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>Created &amp; Developed by {IMMUTABLE_DEVELOPER_NAME}</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {IMMUTABLE_ORIGIN_STORY}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <label
              htmlFor="gwen-device-user-input"
              className="text-xs font-semibold text-[var(--text-primary)] block"
            >
              What should Gwen call you on this device?
            </label>
            <input
              id="gwen-device-user-input"
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name (saved locally)"
              className="w-full h-11 px-3.5 rounded-xl bg-white/[0.06] border border-white/[0.1] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-cyan-400/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onComplete(IMMUTABLE_DEVELOPER_NAME)}
              className="h-10 px-3.5 rounded-full glass-pill text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>I am {IMMUTABLE_DEVELOPER_NAME}</span>
            </button>

            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 h-10 px-4 rounded-full cta-aurora text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-45"
            >
              <UserCheck className="h-4 w-4" />
              <span>Start with Gwen</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
