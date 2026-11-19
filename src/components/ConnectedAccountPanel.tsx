import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  FolderOpen,
  ListTodo,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import type {
  GoogleAccountProfile,
  GoogleWorkspaceScopesConfig,
  KeepStyleNote,
} from '../types/gwen';

interface ConnectedAccountPanelProps {
  googleAccount: GoogleAccountProfile | null;
  googleTokenReady: boolean;
  workspaceScopes: GoogleWorkspaceScopesConfig;
  keepNotes: KeepStyleNote[];
  onUpdateWorkspaceScopes: (patch: Partial<GoogleWorkspaceScopesConfig>) => void;
  onConnectGoogle: (forceAccountSelect?: boolean) => Promise<void>;
  onDisconnectGoogle: () => Promise<void>;
  onAddKeepNote: (title: string, content: string) => void;
  onDeleteKeepNote: (id: string) => void;
  onQuickWorkspaceAction: (phrase: string) => void;
}

const GoogleGIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.56-5.16 3.56-8.65z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.29 14.29A7.18 7.18 0 0 1 4.91 12c0-.8.14-1.57.38-2.29V6.61H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.39l4-3.1z"
    />
    <path
      fill="#EA4335"
      d="M12 4.76c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.61l4 3.1c.94-2.84 3.59-4.95 6.71-4.95z"
    />
  </svg>
);

export const ConnectedAccountPanel: React.FC<ConnectedAccountPanelProps> = ({
  googleAccount,
  googleTokenReady,
  workspaceScopes,
  keepNotes,
  onUpdateWorkspaceScopes,
  onConnectGoogle,
  onDisconnectGoogle,
  onAddKeepNote,
  onDeleteKeepNote,
  onQuickWorkspaceAction,
}) => {
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  const handleConnect = async (forceSelect = false) => {
    setConnecting(true);
    setErrorMsg(null);
    try {
      await onConnectGoogle(forceSelect);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Google Sign-In did not complete. Please try again.'
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() && !noteContent.trim()) return;
    onAddKeepNote(noteTitle.trim() || 'Quick Note', noteContent.trim());
    setNoteTitle('');
    setNoteContent('');
  };

  const scopeRows: Array<{
    key: keyof GoogleWorkspaceScopesConfig;
    label: string;
    detail: string;
    icon: React.ReactNode;
  }> = [
    {
      key: 'gmail',
      label: 'Gmail',
      detail: 'Read unread mail, search threads & send emails with confirmation',
      icon: <Mail className="h-4 w-4 text-[var(--accent)]" />,
    },
    {
      key: 'calendar',
      label: 'Google Calendar (IST Default)',
      detail: 'Check daily agenda, schedule meetings & delete events with confirmation',
      icon: <Calendar className="h-4 w-4 text-[var(--accent)]" />,
    },
    {
      key: 'tasksAndNotes',
      label: 'Google Tasks & Keep-Style Notes',
      detail: 'Sync checklists, to-dos & local notes seamlessly',
      icon: <ListTodo className="h-4 w-4 text-[var(--accent)]" />,
    },
    {
      key: 'drive',
      label: 'Google Drive',
      detail: 'Find documents & back up notes directly to your Drive',
      icon: <FolderOpen className="h-4 w-4 text-[var(--accent)]" />,
    },
    {
      key: 'contacts',
      label: 'Google Contacts',
      detail: 'Look up email addresses & phone numbers by name',
      icon: <Users className="h-4 w-4 text-[var(--accent)]" />,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Account Status Card */}
      <div
        className="rounded-2xl p-4 sm:p-5 border space-y-4"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: googleAccount ? 'var(--accent-ring)' : 'var(--border-hairline)',
        }}
      >
        {googleAccount ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              {googleAccount.photoURL ? (
                <img
                  src={googleAccount.photoURL}
                  alt={googleAccount.displayName}
                  referrerPolicy="no-referrer"
                  className="h-12 w-12 rounded-full object-cover border border-[var(--border-hairline)] shrink-0"
                />
              ) : (
                <div
                  className="h-12 w-12 rounded-full flex items-center justify-center font-display text-base font-bold shrink-0"
                  style={{
                    backgroundColor: 'var(--accent-soft)',
                    color: 'var(--accent)',
                  }}
                >
                  {(googleAccount.displayName || 'G').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {googleAccount.displayName}
                  </span>
                  {googleTokenReady && (
                    <CheckCircle2 className="h-4 w-4 text-[var(--success)] shrink-0" />
                  )}
                </div>
                <p className="text-xs text-[var(--text-secondary)] truncate">
                  Linked as {googleAccount.email}
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  {googleTokenReady
                    ? 'Active Workspace session · Access token held securely in memory'
                    : 'Session needs a fresh Google sign-in tap to unlock live Workspace APIs'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!googleTokenReady && (
                <button
                  type="button"
                  disabled={connecting}
                  onClick={() => void handleConnect(false)}
                  className="min-h-[40px] px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-contrast)',
                  }}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${connecting ? 'animate-spin' : ''}`} />
                  <span>Reconnect Session</span>
                </button>
              )}
              <button
                type="button"
                disabled={connecting}
                onClick={() => void handleConnect(true)}
                className="min-h-[40px] px-3.5 rounded-xl text-xs font-semibold bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
              >
                Switch Account
              </button>
              <button
                type="button"
                onClick={() => void onDisconnectGoogle()}
                className="min-h-[40px] px-3.5 rounded-xl text-xs font-semibold bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--danger)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                Not Linked · Personal Google Workspace
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-xl">
                Link your own Gmail / Google account on this device so Gwen can read &amp; draft emails, check your Google Calendar, sync tasks, search Drive, and look up Contacts. Tokens stay strictly in memory.
              </p>
            </div>

            <button
              type="button"
              disabled={connecting}
              onClick={() => void handleConnect(true)}
              className="min-h-[44px] px-4 rounded-xl text-sm font-semibold bg-white text-[#1f1f1f] border border-[#dadce0] hover:bg-[#f8f9fa] shadow-sm flex items-center justify-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <GoogleGIcon />
              <span>{connecting ? 'Connecting...' : 'Sign in with Google'}</span>
            </button>
          </div>
        )}

        {errorMsg && (
          <p className="text-xs text-[var(--danger)] bg-[var(--danger-soft)] rounded-xl px-3.5 py-2.5">
            {errorMsg}
          </p>
        )}

        {googleAccount && googleTokenReady && (
          <div className="pt-3 border-t border-[var(--border-hairline)] flex flex-wrap gap-2">
            {[
              { label: 'Check Unread Gmail', cmd: 'Check my unread Gmail messages' },
              { label: 'Sync Calendar', cmd: 'What is on my Google Calendar?' },
              { label: 'View Tasks', cmd: 'List my Google Tasks and notes' },
              { label: 'Search Drive', cmd: 'Search my Google Drive files' },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => onQuickWorkspaceAction(item.cmd)}
                className="min-h-[38px] px-3 rounded-xl text-xs font-semibold bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Granular Workspace Permission Toggles */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
            Workspace Services Included on Sign-In
          </h3>
          <span className="text-[11px] text-[var(--text-muted)]">
            Confirmation required before sending emails or changing events
          </span>
        </div>

        <div className="divide-y divide-[var(--border-hairline)] rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-4">
          {scopeRows.map((row) => {
            const enabled = workspaceScopes[row.key];
            return (
              <div
                key={row.key}
                className="py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 shrink-0">{row.icon}</div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--text-primary)]">
                      {row.label}
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">{row.detail}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdateWorkspaceScopes({ [row.key]: !enabled })}
                  className="min-h-[36px] px-3.5 rounded-xl text-xs font-semibold shrink-0 cursor-pointer transition-colors"
                  style={{
                    backgroundColor: enabled ? 'var(--accent)' : 'var(--bg-surface)',
                    color: enabled ? 'var(--accent-contrast)' : 'var(--text-secondary)',
                  }}
                >
                  {enabled ? 'Enabled' : 'Off'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Keep-Style Local-Synced Notes Quick Pad */}
      <div className="rounded-2xl p-4 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Keep-Style Notes &amp; Checklists
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Stored privately on this device and synced with Google Tasks when linked.
            </p>
          </div>
          <span className="text-xs font-mono-tabular text-[var(--text-muted)]">
            {keepNotes.length} notes
          </span>
        </div>

        <form onSubmit={handleAddNote} className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          <input
            type="text"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            placeholder="Note title"
            className="sm:col-span-2 h-10 rounded-xl px-3 text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
          />
          <input
            type="text"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="Write a quick note or shopping item..."
            className="sm:col-span-2 h-10 rounded-xl px-3 text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            className="min-h-[40px] px-3.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-contrast)',
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Note</span>
          </button>
        </form>

        {keepNotes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 max-h-48 overflow-y-auto">
            {keepNotes.slice(0, 6).map((note) => (
              <div
                key={note.id}
                className="rounded-xl p-3 bg-[var(--bg-surface)] border border-[var(--border-hairline)] flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {note.title}
                  </div>
                  {note.content && (
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-0.5">
                      {note.content}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteKeepNote(note.id)}
                  aria-label={`Delete note ${note.title}`}
                  className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--danger)] shrink-0 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
