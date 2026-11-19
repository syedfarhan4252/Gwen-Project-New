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
      onNotify?.('Clipboard access blocked — paste directly into the field (Ctrl/Cmd+V)');
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
          label: 'Connected (Verified)',
          color: '#10b981',
          bg: 'rgba(16, 185, 129, 0.14)',
        }
      : apiKeyState.status === 'invalid'
        ? {
            label: 'Invalid / Expired',
            color: '#ef4444',
            bg: 'rgba(239, 68, 68, 0.14)',
          }
        : {
            label: 'Not Configured',
            color: '#f59e0b',
            bg: 'rgba(245, 158, 11, 0.14)',
          };

  return (
    <div
      className="rounded-2xl p-4 sm:p-5 border space-y-4"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        borderColor:
          apiKeyState.status === 'verified'
            ? 'rgba(16, 185, 129, 0.35)'
            : apiKeyState.status === 'invalid'
              ? 'rgba(239, 68, 68, 0.4)'
              : 'rgba(245, 158, 11, 0.35)',
      }}
    >
      {/* Header + Live Status Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: statusMeta.bg, color: statusMeta.color }}
          >
            <KeyRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Personal Gemini / Google AI Studio API Key
              </h3>
              <span
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-md"
                style={{ backgroundColor: statusMeta.bg, color: statusMeta.color }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: statusMeta.color }}
                />
                {statusMeta.label}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Stored privately on this device only. Reinitializes Voice &amp; Chat instantly without reload.
            </p>
          </div>
        </div>

        {apiKeyState.hasKey && !isEditing && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsEditing(true);
                setConfirmClear(false);
                setFeedback(null);
              }}
              className="min-h-[38px] px-3.5 rounded-xl text-xs font-semibold bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
            >
              Change Key
            </button>

            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="min-h-[38px] px-3.5 rounded-xl text-xs font-semibold bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--danger)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Remove Key</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleClearKey}
                  className="min-h-[38px] px-3 rounded-xl text-xs font-semibold bg-[var(--danger)] text-white whitespace-nowrap cursor-pointer"
                >
                  Confirm Remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="min-h-[38px] px-2.5 rounded-xl text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-secondary)] whitespace-nowrap cursor-pointer"
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
        <div className="rounded-xl px-3.5 py-2.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-mono-tabular text-[var(--text-primary)]">
            <ShieldCheck className="h-4 w-4 text-[var(--success)] shrink-0" />
            <span>Saved Key: {apiKeyState.maskedKey}</span>
          </div>
          {apiKeyState.verifiedAt && (
            <span className="text-[var(--text-muted)]">
              Verified {new Date(apiKeyState.verifiedAt).toLocaleDateString()}
              {apiKeyState.modelCount ? ` · ${apiKeyState.modelCount} models ready` : ''}
            </span>
          )}
        </div>
      )}

      {apiKeyState.status === 'invalid' && apiKeyState.lastError && !feedback && (
        <div
          className="rounded-xl p-3 border text-xs flex items-start gap-2"
          style={{
            backgroundColor: 'var(--danger-soft)',
            borderColor: 'var(--danger)',
            color: 'var(--text-primary)',
          }}
        >
          <AlertTriangle className="h-4 w-4 text-[var(--danger)] shrink-0 mt-0.5" />
          <span>{apiKeyState.lastError}</span>
        </div>
      )}

      {/* Masked Key Input Form */}
      {isEditing && (
        <form onSubmit={(e) => void handleTestAndSave(e)} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setFeedback(null);
                }}
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste your Google AI Studio API key (AIza...)"
                aria-label="Gemini API Key"
                className="w-full h-11 rounded-xl pl-3.5 pr-20 text-sm font-mono-tabular bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] cursor-pointer"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => void handlePaste()}
                  aria-label="Paste API key from clipboard"
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] cursor-pointer"
                >
                  <ClipboardPaste className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="submit"
                disabled={testing || !inputValue.trim()}
                className="flex-1 sm:flex-none min-h-[44px] px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-55"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
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
                  className="min-h-[44px] px-3 rounded-xl text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          <p className="text-[11px] text-[var(--text-muted)]">
            Note: Your key is verified directly against <span className="font-mono-tabular">generativelanguage.googleapis.com</span> and saved locally on this device (never hardcoded or sent to third-party servers). Avoid sharing unlocked devices where local browser storage is accessible.
          </p>
        </form>
      )}

      {/* Verification Feedback */}
      {feedback && (
        <div
          className="rounded-xl p-3 border text-xs flex items-start gap-2"
          style={{
            backgroundColor:
              feedback.kind === 'success' ? 'var(--success-soft)' : 'var(--danger-soft)',
            borderColor: feedback.kind === 'success' ? 'var(--success)' : 'var(--danger)',
            color: 'var(--text-primary)',
          }}
        >
          {feedback.kind === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-[var(--success)] shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-[var(--danger)] shrink-0 mt-0.5" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Collapsible Quick Setup Guide */}
      <div className="pt-2 border-t border-[var(--border-hairline)]">
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="w-full min-h-[38px] flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
        >
          <span>How to get a free Gemini API Key (30 seconds)</span>
          {showGuide ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showGuide && (
          <div className="mt-2 rounded-xl p-3.5 bg-[var(--bg-surface)] border border-[var(--border-hairline)] space-y-3 text-xs text-[var(--text-secondary)]">
            <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
              <li>
                Open Google AI Studio and sign in with your Google account.
              </li>
              <li>
                Click <strong className="text-[var(--text-primary)]">Create API Key</strong> and copy the key starting with <span className="font-mono-tabular">AIza...</span>.
              </li>
              <li>
                Paste it above and tap <strong className="text-[var(--text-primary)]">Test &amp; Save Key</strong>. Gwen activates immediately!
              </li>
            </ol>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[38px] px-3.5 rounded-xl text-xs font-semibold items-center gap-1.5 border transition-colors"
              style={{
                backgroundColor: 'var(--accent-soft)',
                borderColor: 'var(--accent-ring)',
                color: 'var(--accent)',
              }}
            >
              <span>Get Free Key at Google AI Studio</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
