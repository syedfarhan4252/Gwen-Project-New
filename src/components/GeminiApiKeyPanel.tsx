import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  clearStoredGeminiApiKey,
  saveVerifiedGeminiApiKey,
  validateGeminiApiKey,
  type StoredApiKeyState,
} from '../services/apiKeyStorage';

interface GeminiApiKeyPanelProps {
  apiKeyState: StoredApiKeyState;
  onApiKeyStateChange: (next: StoredApiKeyState) => void;
  onNotify?: (msg: string) => void;
}

export const GeminiApiKeyPanel: React.FC<GeminiApiKeyPanelProps> = ({
  apiKeyState,
  onApiKeyStateChange,
  onNotify,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isEditing, setIsEditing] = useState(!apiKeyState.hasKey);
  const [testing, setTesting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showGuide, setShowGuide] = useState(!apiKeyState.hasKey);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(
    null
  );

  const handlePaste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip?.trim()) {
        setInputValue(clip.trim());
        setFeedback(null);
        onNotify?.('Pasted key from clipboard');
      } else {
        onNotify?.('Clipboard is empty');
      }
    } catch {
      onNotify?.('Paste directly into the field (Ctrl/Cmd+V)');
    }
  };

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || testing) return;

    setTesting(true);
    setFeedback(null);
    try {
      const result = await validateGeminiApiKey(inputValue.trim());
      if (result.ok) {
        const nextState = saveVerifiedGeminiApiKey(inputValue.trim(), result.modelCount);
        onApiKeyStateChange(nextState);
        setInputValue('');
        setShowKey(false);
        setIsEditing(false);
        setConfirmClear(false);
        setFeedback({ kind: 'success', text: result.message });
        onNotify?.('Gemini API key verified & saved on this device!');
      } else {
        setFeedback({ kind: 'error', text: result.message });
      }
    } finally {
      setTesting(false);
    }
  };

  const handleClearKey = () => {
    const nextState = clearStoredGeminiApiKey();
    onApiKeyStateChange(nextState);
    setInputValue('');
    setIsEditing(true);
    setConfirmClear(false);
    setFeedback(null);
    onNotify?.('Personal Gemini API key removed from this device');
  };

  const statusMeta =
    apiKeyState.status === 'verified'
      ? {
          label: 'Verified',
          dot: '#34d399',
          pill: 'bg-emerald-500/12 border-emerald-400/30 text-emerald-300',
        }
      : apiKeyState.status === 'invalid'
        ? {
            label: 'Invalid',
            dot: '#f87171',
            pill: 'bg-rose-500/12 border-rose-400/30 text-rose-300',
          }
        : {
            label: 'Not Set',
            dot: '#fbbf24',
            pill: 'bg-amber-500/12 border-amber-400/30 text-amber-300',
          };

  return (
    <div className="rounded-2xl p-4 glass-card space-y-3.5">
      {/* Header + Status */}
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[var(--accent)] shrink-0">
            <KeyRound className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Personal Gemini API Key
              </h3>
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusMeta.pill}`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: statusMeta.dot }}
                />
                {statusMeta.label}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Saved privately on this device only. Updates Voice &amp; Chat immediately.
            </p>
          </div>
        </div>

        {apiKeyState.hasKey && !isEditing && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsEditing(true);
                setConfirmClear(false);
                setFeedback(null);
              }}
              className="h-8 px-3 rounded-full glass-pill text-xs font-medium text-[var(--text-primary)] hover:bg-white/[0.12] cursor-pointer"
            >
              Change
            </button>

            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="h-8 px-3 rounded-full glass-pill text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--danger)] flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Remove</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleClearKey}
                  className="h-8 px-3 rounded-full bg-rose-500/20 border border-rose-400/35 text-xs font-semibold text-rose-200 cursor-pointer"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="h-8 px-2.5 rounded-full glass-pill text-xs text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Saved Key Summary */}
      {apiKeyState.hasKey && !isEditing && (
        <div className="rounded-xl px-3 py-2.5 bg-white/[0.04] border border-white/[0.07] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-mono-tabular text-[var(--text-primary)]">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{apiKeyState.maskedKey}</span>
          </div>
          {apiKeyState.verifiedAt && (
            <span className="text-[11px] text-[var(--text-muted)]">
              Verified {new Date(apiKeyState.verifiedAt).toLocaleDateString()}
              {apiKeyState.modelCount ? ` · ${apiKeyState.modelCount} models` : ''}
            </span>
          )}
        </div>
      )}

      {apiKeyState.status === 'invalid' && apiKeyState.lastError && !feedback && (
        <div className="rounded-xl p-3 bg-rose-500/12 border border-rose-400/30 text-xs text-rose-200 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{apiKeyState.lastError}</span>
        </div>
      )}

      {/* Masked Key Input Form */}
      {isEditing && (
        <form onSubmit={(e) => void handleTestAndSave(e)} className="space-y-2.5">
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setFeedback(null);
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste Google AI Studio key (AIza...)"
              aria-label="Gemini API Key"
              className="w-full h-10 rounded-xl pl-3.5 pr-20 text-xs font-mono-tabular bg-white/[0.05] text-[var(--text-primary)] border border-white/[0.09] focus:outline-none focus:border-cyan-400/45"
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => void handlePaste()}
                aria-label="Paste API key from clipboard"
                className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={testing || !inputValue.trim()}
              className="h-9 px-4 rounded-full cta-aurora text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-45"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Verifying...' : 'Test & Save Key'}</span>
            </button>

            {apiKeyState.hasKey && (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setInputValue('');
                  setFeedback(null);
                }}
                className="h-9 px-3 rounded-full glass-pill text-xs text-[var(--text-secondary)] cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>

          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            Verified directly with <span className="font-mono-tabular">generativelanguage.googleapis.com</span> from your browser. Never sent to any third-party server.
          </p>
        </form>
      )}

      {feedback && (
        <div
          className={`rounded-xl p-3 border text-xs flex items-start gap-2 ${
            feedback.kind === 'success'
              ? 'bg-emerald-500/12 border-emerald-400/30 text-emerald-200'
              : 'bg-rose-500/12 border-rose-400/30 text-rose-200'
          }`}
        >
          {feedback.kind === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Collapsible Quick Setup Guide */}
      <div className="pt-2 border-t border-white/[0.06]">
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="w-full h-8 flex items-center justify-between text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <span>How to get a free Gemini API Key</span>
          {showGuide ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {showGuide && (
          <div className="mt-2 rounded-xl p-3 bg-white/[0.03] border border-white/[0.06] space-y-2.5 text-xs text-[var(--text-secondary)]">
            <ol className="list-decimal list-inside space-y-1 leading-relaxed text-[11px]">
              <li>Open Google AI Studio and sign in with Google.</li>
              <li>
                Click <strong className="text-[var(--text-primary)]">Create API Key</strong> and copy the key (<span className="font-mono-tabular">AIza...</span>).
              </li>
              <li>Paste above and tap Test &amp; Save.</li>
            </ol>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 px-3 rounded-full glass-pill text-[11px] font-semibold items-center gap-1.5 text-[var(--accent)] hover:bg-white/[0.11]"
            >
              <span>Open Google AI Studio</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
