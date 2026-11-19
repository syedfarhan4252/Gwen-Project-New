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
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(4, 8, 15, 0.86)' }}
    >
      <div
        className="w-full max-w-md rounded-3xl border p-6 sm:p-7 space-y-5 shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-strong)',
        }}
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h1
              id="gwen-welcome-title"
              className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)]"
            >
              Welcome to Gwen
            </h1>
            <span
              className="inline-flex items-center gap-1 text-[11px] font-mono-tabular px-2.5 py-1 rounded-lg border"
              style={{
                borderColor: 'var(--border-hairline)',
                color: 'var(--accent)',
              }}
            >
              IST · UTC+5:30
            </span>
          </div>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Your 1-on-1 AI voice companion, camera-aware assistant, and creative studio.
          </p>
        </div>

        {/* Locked Developer Attribution & Ben 10 Origin Card */}
        <div
          className="rounded-2xl border p-4 space-y-2"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-hairline)',
          }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent)]">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>Created & Developed by {IMMUTABLE_DEVELOPER_NAME}</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {IMMUTABLE_ORIGIN_STORY}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              placeholder="Enter your name (stored locally on this device)"
              className="w-full min-h-[46px] px-3.5 rounded-xl border text-sm outline-none focus:ring-2"
              style={{
                backgroundColor: 'var(--bg-canvas)',
                borderColor: 'var(--border-strong)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onComplete(IMMUTABLE_DEVELOPER_NAME)}
              className="min-h-[44px] px-3.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors hover:bg-white/5"
              style={{
                borderColor: 'var(--border-hairline)',
                color: 'var(--text-secondary)',
              }}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>I am {IMMUTABLE_DEVELOPER_NAME}</span>
            </button>

            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 min-h-[44px] px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-45"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
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
