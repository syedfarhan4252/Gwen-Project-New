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
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
      onClick={onDismiss}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl glass-sheet sm:border sm:border-white/[0.12] p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center -mt-1 pb-0.5">
          <span className="h-1 w-9 rounded-full bg-white/20" />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl aurora-badge flex items-center justify-center shrink-0">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                {reason === 'mic'
                  ? 'Add Gemini API Key to Talk'
                  : 'Connect Personal Gemini Key'}
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Stored privately on this device · free Google AI Studio key
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close API key prompt"
            className="h-8 w-8 rounded-full glass-pill flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
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
              placeholder="Paste Google AI Studio key (AIza...)"
              aria-label="Google AI Studio API Key"
              className="w-full h-11 rounded-xl pl-3.5 pr-20 text-xs font-mono-tabular bg-white/[0.05] text-[var(--text-primary)] border border-white/[0.1] focus:outline-none focus:border-cyan-400/50"
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? 'Hide key' : 'Show key'}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => void handlePaste()}
                aria-label="Paste key"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {errorText && (
            <div className="rounded-xl p-3 bg-rose-500/12 border border-rose-400/30 text-xs text-rose-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorText}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={testing || !keyInput.trim()}
              className="flex-1 h-10 px-4 rounded-full cta-aurora text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-45"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Verifying...' : 'Test & Save Key'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="h-10 px-3.5 rounded-full glass-pill text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Settings</span>
            </button>
          </div>
        </form>

        <div className="pt-2.5 border-t border-white/[0.08] flex items-center justify-between gap-3 text-xs">
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-[var(--accent)] hover:underline"
          >
            <span>Get free key</span>
            <ExternalLink className="h-3 w-3" />
          </a>

          <button
            type="button"
            onClick={onDismiss}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] font-medium cursor-pointer"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
};
