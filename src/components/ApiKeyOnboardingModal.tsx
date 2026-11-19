import React, { useState } from 'react';
import {
  AlertTriangle,
  ClipboardPaste,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  saveVerifiedGeminiApiKey,
  validateGeminiApiKey,
  type StoredApiKeyState,
} from '../services/apiKeyStorage';

interface ApiKeyOnboardingModalProps {
  visible: boolean;
  reason?: 'launch' | 'mic';
  onVerified: (nextState: StoredApiKeyState) => void;
  onOpenSettings: () => void;
  onDismiss: () => void;
}

export const ApiKeyOnboardingModal: React.FC<ApiKeyOnboardingModalProps> = ({
  visible,
  reason = 'launch',
  onVerified,
  onOpenSettings,
  onDismiss,
}) => {
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  if (!visible) return null;

  const handlePaste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip?.trim()) {
        setKeyInput(clip.trim());
        setErrorText(null);
      }
    } catch {
      setErrorText('Paste directly into the field using Ctrl+V / Cmd+V.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim() || testing) return;
    setTesting(true);
    setErrorText(null);
    try {
      const result = await validateGeminiApiKey(keyInput.trim());
      if (result.ok) {
        const nextState = saveVerifiedGeminiApiKey(keyInput.trim(), result.modelCount);
        setKeyInput('');
        onVerified(nextState);
      } else {
        setErrorText(result.message);
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connect your Gemini API Key"
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4"
      onClick={onDismiss}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border shadow-2xl p-6 space-y-5"
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
                backgroundColor: 'rgba(245, 158, 11, 0.16)',
                color: '#f59e0b',
              }}
            >
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                {reason === 'mic'
                  ? 'Add Your Gemini API Key to Talk Live'
                  : 'Connect Your Personal Gemini API Key'}
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Each device uses its own free Google AI Studio key — saved privately on this device.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close API key prompt"
            className="h-9 w-9 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value);
                setErrorText(null);
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste your Google AI Studio key (AIza...)"
              aria-label="Google AI Studio API Key"
              className="w-full h-12 rounded-xl pl-3.5 pr-20 text-sm font-mono-tabular bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? 'Hide key' : 'Show key'}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => void handlePaste()}
                aria-label="Paste key"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <ClipboardPaste className="h-4 w-4" />
              </button>
            </div>
          </div>

          {errorText && (
            <div
              className="rounded-xl p-3 border text-xs flex items-start gap-2"
              style={{
                backgroundColor: 'var(--danger-soft)',
                borderColor: 'var(--danger)',
                color: 'var(--text-primary)',
              }}
            >
              <AlertTriangle className="h-4 w-4 text-[var(--danger)] shrink-0 mt-0.5" />
              <span>{errorText}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              type="submit"
              disabled={testing || !keyInput.trim()}
              className="flex-1 min-h-[44px] px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-55"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              <RefreshCw className={`h-4 w-4 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Verifying Key...' : 'Test & Save Key'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="min-h-[44px] px-4 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] hover:border-[var(--accent)] flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <SlidersHorizontal className="h-4 w-4 text-[var(--accent)]" />
              <span>Open Settings</span>
            </button>
          </div>
        </form>

        <div className="pt-3 border-t border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3 text-xs">
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold text-[var(--accent)] hover:underline"
          >
            <span>Get a free key at Google AI Studio</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <button
            type="button"
            onClick={onDismiss}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium cursor-pointer"
          >
            Continue for now
          </button>
        </div>
      </div>
    </div>
  );
};
