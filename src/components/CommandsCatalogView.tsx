import React, { useMemo, useState } from 'react';
import { Play, Plus, Search, Trash2 } from 'lucide-react';
import { BUILT_IN_VOICE_COMMANDS } from '../data/defaults';
import type { CommandCategory, CustomShortcut, Persona } from '../types/gwen';

interface CommandsCatalogViewProps {
  personas: Persona[];
  shortcuts: CustomShortcut[];
  onRunCommandPhrase: (phrase: string) => void;
  onRunShortcut: (shortcut: CustomShortcut) => void;
  onAddShortcut: (shortcut: Omit<CustomShortcut, 'id' | 'createdAt'>) => void;
  onDeleteShortcut: (id: string) => void;
}

const CATEGORIES: CommandCategory[] = [
  'Google Workspace',
  'Search & Downloads',
  'Home Teacher & Kids',
  'Media & Web Studio',
  'Companion Care & Weather',
  'System Settings',
  'Camera & Screen Vision',
  'Productivity & Messaging',
  'Memory Core',
  'App & Device Control',
];

export const CommandsCatalogView: React.FC<CommandsCatalogViewProps> = ({
  personas,
  shortcuts,
  onRunCommandPhrase,
  onRunShortcut,
  onAddShortcut,
  onDeleteShortcut,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | CommandCategory>('All');

  const [showBuilder, setShowBuilder] = useState(false);
  const [label, setLabel] = useState('');
  const [triggerPhrase, setTriggerPhrase] = useState('');
  const [switchPersonaId, setSwitchPersonaId] = useState('');
  const [enableScreenShare, setEnableScreenShare] = useState(false);
  const [enableCameraVision, setEnableCameraVision] = useState(false);
  const [promptToSend, setPromptToSend] = useState('');

  const filteredCommands = useMemo(() => {
    const q = search.trim().toLowerCase();
    return BUILT_IN_VOICE_COMMANDS.filter((cmd) => {
      if (selectedCategory !== 'All' && cmd.category !== selectedCategory) return false;
      if (
        q &&
        !cmd.phrase.toLowerCase().includes(q) &&
        !cmd.description.toLowerCase().includes(q) &&
        !cmd.category.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [search, selectedCategory]);

  const handleCreateShortcut = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !triggerPhrase.trim() || !promptToSend.trim()) return;
    onAddShortcut({
      label: label.trim(),
      triggerPhrase: triggerPhrase.trim(),
      switchPersonaId: switchPersonaId || undefined,
      enableScreenShare,
      enableCameraVision,
      promptToSend: promptToSend.trim(),
    });
    setLabel('');
    setTriggerPhrase('');
    setSwitchPersonaId('');
    setEnableScreenShare(false);
    setEnableCameraVision(false);
    setPromptToSend('');
    setShowBuilder(false);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            Voice Commands &amp; Actions
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Hands-free system settings, camera vision, calendar, maps, messaging, timers, and sleep commands.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowBuilder((v) => !v)}
          className="min-h-[44px] px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 whitespace-nowrap cursor-pointer"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-contrast)',
          }}
        >
          <Plus className="h-4 w-4" />
          <span>{showBuilder ? 'Close Macro Builder' : 'New Voice Shortcut'}</span>
        </button>
      </div>

      {showBuilder && (
        <form
          onSubmit={handleCreateShortcut}
          className="rounded-3xl p-5 sm:p-6 border space-y-4"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--accent-ring)',
          }}
        >
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              Create Custom Voice Shortcut
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Chain a spoken phrase to switch persona, enable Camera Vision or Screen Share, and run an instruction.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Shortcut Name
              </label>
              <input
                type="text"
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Outfit Check"
                className="w-full h-11 rounded-xl px-3.5 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Spoken Trigger Phrase
              </label>
              <input
                type="text"
                required
                value={triggerPhrase}
                onChange={(e) => setTriggerPhrase(e.target.value)}
                placeholder='e.g. "Check my outfit Gwen"'
                className="w-full h-11 rounded-xl px-3.5 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Switch Persona (Optional)
              </label>
              <select
                value={switchPersonaId}
                onChange={(e) => setSwitchPersonaId(e.target.value)}
                className="w-full h-11 rounded-xl px-3.5 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">Keep current persona</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 h-11 px-3 rounded-xl flex-1 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] cursor-pointer text-xs text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={enableCameraVision}
                  onChange={(e) => setEnableCameraVision(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span>Camera Vision</span>
              </label>
              <label className="flex items-center gap-2 h-11 px-3 rounded-xl flex-1 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] cursor-pointer text-xs text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={enableScreenShare}
                  onChange={(e) => setEnableScreenShare(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span>Screen Share</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Action Prompt for Gwen
            </label>
            <textarea
              required
              rows={2}
              value={promptToSend}
              onChange={(e) => setPromptToSend(e.target.value)}
              placeholder="What should Gwen say or do when this shortcut fires?"
              className="w-full rounded-xl p-3.5 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowBuilder(false)}
              className="min-h-[42px] px-4 rounded-xl text-sm font-medium bg-[var(--bg-elevated)] text-[var(--text-secondary)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[42px] px-5 rounded-xl text-sm font-semibold cursor-pointer"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              Save Shortcut
            </button>
          </div>
        </form>
      )}

      {/* Custom Shortcuts */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
            Custom Voice Shortcuts
          </h2>
          <span className="text-xs text-[var(--text-muted)] font-mono-tabular">
            {shortcuts.length} saved
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {shortcuts.map((shortcut) => {
            const targetPersona = personas.find((p) => p.id === shortcut.switchPersonaId);
            return (
              <div
                key={shortcut.id}
                className="rounded-2xl p-5 border flex flex-col justify-between gap-4"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-hairline)',
                }}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-base font-semibold text-[var(--text-primary)]">
                        {shortcut.label}
                      </h3>
                      <p className="mt-0.5 text-xs font-medium text-[var(--accent)]">
                        &ldquo;{shortcut.triggerPhrase}&rdquo;
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteShortcut(shortcut.id)}
                      aria-label={`Delete shortcut ${shortcut.label}`}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--bg-elevated)] cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                    {shortcut.promptToSend}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border-hairline)]">
                  <div className="text-xs text-[var(--text-muted)] truncate">
                    {targetPersona ? `Persona: ${targetPersona.name}` : 'Active persona'}
                    {shortcut.enableCameraVision ? ' · Camera Vision' : ''}
                    {shortcut.enableScreenShare ? ' · Screen Share' : ''}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRunShortcut(shortcut)}
                    className="min-h-[40px] px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    style={{
                      backgroundColor: 'var(--accent-soft)',
                      color: 'var(--accent)',
                    }}
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>Run Macro</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Built-in Command Directory */}
      <section className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
            Built-in Command Directory
          </h2>

          <div className="relative w-full lg:max-w-xs">
            <Search className="h-4 w-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter voice commands..."
              className="w-full h-11 rounded-xl pl-10 pr-4 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(['All', ...CATEGORIES] as const).map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className="min-h-[40px] px-3.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  backgroundColor: active ? 'var(--accent)' : 'var(--bg-surface)',
                  color: active ? 'var(--accent-contrast)' : 'var(--text-secondary)',
                  border: active ? '1px solid transparent' : '1px solid var(--border-hairline)',
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCommands.map((cmd) => (
            <article
              key={cmd.id}
              className="rounded-2xl p-5 border flex flex-col justify-between gap-4"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-hairline)',
              }}
            >
              <div>
                <p className="text-xs text-[var(--text-muted)]">{cmd.category}</p>
                <h3 className="mt-1 font-display text-base font-semibold text-[var(--text-primary)]">
                  &ldquo;{cmd.phrase}&rdquo;
                </h3>
                <p className="mt-1.5 text-sm text-[var(--text-secondary)] leading-relaxed">
                  {cmd.description}
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--border-hairline)]">
                <span className="text-xs text-[var(--text-muted)] truncate">
                  {cmd.exampleAction}
                </span>
                <button
                  type="button"
                  onClick={() => onRunCommandPhrase(cmd.phrase)}
                  className="min-h-[40px] px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Run</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
