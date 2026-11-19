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
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
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
      detail: 'Read unread mail & send emails with confirmation',
      icon: <Mail className="h-4 w-4 text-cyan-400" />,
    },
    {
      key: 'calendar',
      label: 'Google Calendar (IST)',
      detail: 'Check daily agenda & schedule meetings',
      icon: <Calendar className="h-4 w-4 text-violet-400" />,
    },
    {
      key: 'tasksAndNotes',
      label: 'Google Tasks & Notes',
      detail: 'Sync checklists & Keep-style notes',
      icon: <ListTodo className="h-4 w-4 text-emerald-400" />,
    },
    {
      key: 'drive',
      label: 'Google Drive',
      detail: 'Find documents & back up notes',
      icon: <FolderOpen className="h-4 w-4 text-sky-400" />,
    },
    {
      key: 'contacts',
      label: 'Google Contacts',
      detail: 'Look up emails & phone numbers by name',
      icon: <Users className="h-4 w-4 text-amber-400" />,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Account Status */}
      <div className="rounded-2xl p-3.5 bg-white/[0.03] border border-white/[0.08] space-y-3">
        {googleAccount ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {googleAccount.photoURL ? (
                <img
                  src={googleAccount.photoURL}
                  alt={googleAccount.displayName}
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 rounded-full object-cover border border-white/[0.12] shrink-0"
                />
              ) : (
                <div className="h-10 w-10 rounded-full aurora-badge font-display text-sm font-bold flex items-center justify-center shrink-0">
                  {(googleAccount.displayName || 'G').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {googleAccount.displayName}
                  </span>
                  {googleTokenReady && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-[var(--text-secondary)] truncate">
                  {googleAccount.email}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {!googleTokenReady && (
                <button
                  type="button"
                  disabled={connecting}
                  onClick={() => void handleConnect(false)}
                  className="h-8 px-3 rounded-full cta-aurora text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${connecting ? 'animate-spin' : ''}`} />
                  <span>Reconnect</span>
                </button>
              )}
              <button
                type="button"
                disabled={connecting}
                onClick={() => void handleConnect(true)}
                className="h-8 px-3 rounded-full glass-pill text-xs font-medium text-[var(--text-primary)] cursor-pointer"
              >
                Switch
              </button>
              <button
                type="button"
                onClick={() => void onDisconnectGoogle()}
                className="h-8 px-3 rounded-full glass-pill text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--danger)] flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                Link Personal Google Account
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Manage Gmail, Calendar, Tasks, Drive &amp; Contacts privately on this device.
              </p>
            </div>

            <button
              type="button"
              disabled={connecting}
              onClick={() => void handleConnect(true)}
              className="h-10 px-4 rounded-full bg-white text-[#111827] hover:bg-white/90 text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <GoogleGIcon />
              <span>{connecting ? 'Connecting...' : 'Sign in with Google'}</span>
            </button>
          </div>
        )}

        {errorMsg && (
          <p className="text-xs text-rose-200 bg-rose-500/15 border border-rose-400/25 rounded-xl px-3 py-2">
            {errorMsg}
          </p>
        )}

        {googleAccount && googleTokenReady && (
          <div className="pt-2.5 border-t border-white/[0.06] flex flex-wrap gap-1.5">
            {[
              { label: 'Unread Gmail', cmd: 'Check my unread Gmail messages' },
              { label: 'Calendar', cmd: 'What is on my Google Calendar?' },
              { label: 'Tasks', cmd: 'List my Google Tasks and notes' },
              { label: 'Drive', cmd: 'Search my Google Drive files' },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => onQuickWorkspaceAction(item.cmd)}
                className="h-8 px-3 rounded-full glass-pill text-[11px] font-medium text-[var(--text-primary)] hover:bg-white/[0.12] cursor-pointer"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Granular Workspace Services */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] divide-y divide-white/[0.06] px-3.5">
        {scopeRows.map((row) => {
          const enabled = workspaceScopes[row.key];
          return (
            <div key={row.key} className="py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="shrink-0">{row.icon}</span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {row.label}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">{row.detail}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUpdateWorkspaceScopes({ [row.key]: !enabled })}
                className={`h-7 px-3 rounded-full text-[11px] font-semibold border shrink-0 cursor-pointer transition-colors ${
                  enabled
                    ? 'bg-cyan-400/15 border-cyan-400/35 text-[var(--accent)]'
                    : 'glass-pill text-[var(--text-muted)]'
                }`}
              >
                {enabled ? 'On' : 'Off'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Keep-Style Local-Synced Notes */}
      <div className="rounded-2xl p-3.5 bg-white/[0.03] border border-white/[0.07] space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[var(--text-primary)]">
            Keep-Style Quick Notes
          </h3>
          <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
            {keepNotes.length} notes
          </span>
        </div>

        <form onSubmit={handleAddNote} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            placeholder="Title"
            className="sm:w-36 h-9 rounded-xl px-3 text-xs bg-white/[0.05] text-[var(--text-primary)] border border-white/[0.08] focus:outline-none focus:border-cyan-400/45"
          />
          <input
            type="text"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="Write a quick note..."
            className="flex-1 h-9 rounded-xl px-3 text-xs bg-white/[0.05] text-[var(--text-primary)] border border-white/[0.08] focus:outline-none focus:border-cyan-400/45"
          />
          <button
            type="submit"
            className="h-9 px-3.5 rounded-full glass-pill text-xs font-semibold text-[var(--accent)] hover:bg-white/[0.12] flex items-center justify-center gap-1 shrink-0 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add</span>
          </button>
        </form>

        {keepNotes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pt-1">
            {keepNotes.slice(0, 6).map((note) => (
              <div
                key={note.id}
                className="rounded-xl p-2.5 bg-white/[0.04] border border-white/[0.07] flex items-start justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {note.title}
                  </div>
                  {note.content && (
                    <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mt-0.5">
                      {note.content}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteKeepNote(note.id)}
                  aria-label={`Delete note ${note.title}`}
                  className="h-7 w-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--danger)] shrink-0 cursor-pointer"
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
