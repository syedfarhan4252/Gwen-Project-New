import React, { useMemo, useState } from 'react';
import {
  Brain,
  Camera,
  CloudSun,
  Globe,
  GraduationCap,
  Mail,
  MessageCircle,
  Play,
  Plus,
  Search,
  Sliders,
  Smartphone,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
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

type FilterChipId = 'All' | 'Apps' | 'System' | 'Care' | 'Study' | 'Workspace' | 'Studio';

const FILTER_CHIPS: Array<{ id: FilterChipId; label: string; categories?: CommandCategory[] }> = [
  { id: 'All', label: 'All' },
  {
    id: 'Apps',
    label: 'Apps',
    categories: ['App & Device Control', 'Productivity & Messaging', 'Search & Downloads'],
  },
  {
    id: 'System',
    label: 'System',
    categories: ['System Settings', 'Camera & Screen Vision'],
  },
  {
    id: 'Care',
    label: 'Care',
    categories: ['Companion Care & Weather', 'Memory Core'],
  },
  {
    id: 'Study',
    label: 'Study',
    categories: ['Home Teacher & Kids'],
  },
  {
    id: 'Workspace',
    label: 'Google',
    categories: ['Google Workspace'],
  },
  {
    id: 'Studio',
    label: 'Studio',
    categories: ['Media & Web Studio'],
  },
];

function getCommandIcon(category: CommandCategory): React.ReactNode {
  switch (category) {
    case 'Google Workspace':
      return <Mail className="h-4 w-4 text-emerald-400" />;
    case 'Home Teacher & Kids':
      return <GraduationCap className="h-4 w-4 text-sky-400" />;
    case 'Search & Downloads':
      return <Globe className="h-4 w-4 text-cyan-400" />;
    case 'App & Device Control':
      return <Smartphone className="h-4 w-4 text-violet-400" />;
    case 'System Settings':
      return <Sliders className="h-4 w-4 text-amber-400" />;
    case 'Camera & Screen Vision':
      return <Camera className="h-4 w-4 text-cyan-300" />;
    case 'Media & Web Studio':
      return <Sparkles className="h-4 w-4 text-pink-400" />;
    case 'Companion Care & Weather':
      return <CloudSun className="h-4 w-4 text-teal-300" />;
    case 'Memory Core':
      return <Brain className="h-4 w-4 text-purple-300" />;
    case 'Productivity & Messaging':
      return <MessageCircle className="h-4 w-4 text-emerald-300" />;
    default:
      return <Zap className="h-4 w-4 text-[var(--accent)]" />;
  }
}

export const CommandsCatalogView: React.FC<CommandsCatalogViewProps> = ({
  personas,
  shortcuts,
  onRunCommandPhrase,
  onRunShortcut,
  onAddShortcut,
  onDeleteShortcut,
}) => {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterChipId>('All');
  const [modalOpen, setModalOpen] = useState(false);

  const [label, setLabel] = useState('');
  const [triggerPhrase, setTriggerPhrase] = useState('');
  const [promptToSend, setPromptToSend] = useState('');
  const [switchPersonaId, setSwitchPersonaId] = useState('');
  const [enableScreenShare, setEnableScreenShare] = useState(false);

  const filteredCommands = useMemo(() => {
    const q = search.trim().toLowerCase();
    const chip = FILTER_CHIPS.find((c) => c.id === activeFilter);
    return BUILT_IN_VOICE_COMMANDS.filter((cmd) => {
      if (chip?.categories && !chip.categories.includes(cmd.category)) {
        return false;
      }
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
  }, [search, activeFilter]);

  const filteredShortcuts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shortcuts;
    return shortcuts.filter(
      (sc) =>
        sc.label.toLowerCase().includes(q) ||
        sc.triggerPhrase.toLowerCase().includes(q) ||
        sc.promptToSend.toLowerCase().includes(q)
    );
  }, [shortcuts, search]);

  const handleCreateShortcut = (e: React.FormEvent) => {
    e.preventDefault();
    if (!triggerPhrase.trim() || !promptToSend.trim()) return;
    onAddShortcut({
      label: label.trim() || triggerPhrase.trim(),
      triggerPhrase: triggerPhrase.trim(),
      promptToSend: promptToSend.trim(),
      switchPersonaId: switchPersonaId || undefined,
      enableScreenShare,
    });
    setLabel('');
    setTriggerPhrase('');
    setPromptToSend('');
    setSwitchPersonaId('');
    setEnableScreenShare(false);
    setModalOpen(false);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pt-5 pb-6 space-y-3.5">
      {/* Focused Header */}
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Voice Commands
        </h1>
        <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
          {filteredCommands.length + filteredShortcuts.length} actions
        </span>
      </header>

      {/* Frosted Search + Category Chips (All, Apps, System, Care, Study...) */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="h-4 w-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commands..."
            className="w-full h-10 rounded-full pl-10 pr-4 text-xs sm:text-[13px] glass-card text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-cyan-400/45"
          />
        </div>

        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar pr-6">
          {FILTER_CHIPS.map((chip) => {
            const active = activeFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => setActiveFilter(chip.id)}
                className={`h-8 px-3.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer border transition-all ${
                  active
                    ? 'bg-cyan-400/15 border-cyan-400/40 text-[var(--text-primary)]'
                    : 'glass-card text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Shortcuts (Preserved with circular gradient ▶ Play + Delete) */}
      {filteredShortcuts.length > 0 && activeFilter === 'All' && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-[var(--text-secondary)] px-1">
            Custom Shortcuts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {filteredShortcuts.map((sc) => (
              <div
                key={sc.id}
                className="rounded-2xl p-3.5 glass-card hover:bg-white/[0.075] flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="h-9 w-9 rounded-xl bg-cyan-400/12 border border-cyan-400/25 flex items-center justify-center text-[var(--accent)] shrink-0">
                    <Zap className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                      {sc.label}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                      &ldquo;{sc.triggerPhrase}&rdquo;
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onDeleteShortcut(sc.id)}
                    aria-label={`Delete shortcut ${sc.label}`}
                    className="h-8 w-8 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-white/[0.08] cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRunShortcut(sc)}
                    aria-label={`Run shortcut ${sc.label}`}
                    className="h-9 w-9 rounded-full cta-aurora flex items-center justify-center shrink-0 cursor-pointer transition-transform active:scale-95"
                  >
                    <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sleek Command Rows with Left Icon + Circular Gradient ▶ Play Button */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {filteredCommands.map((cmd) => (
          <article
            key={cmd.id}
            className="rounded-2xl p-3.5 glass-card hover:bg-white/[0.075] flex items-center justify-between gap-3 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="h-9 w-9 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center shrink-0">
                {getCommandIcon(cmd.category)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                  {cmd.phrase}
                </p>
                <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                  {cmd.description}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onRunCommandPhrase(cmd.phrase)}
              aria-label={`Run command: ${cmd.phrase}`}
              title={`Run "${cmd.phrase}"`}
              className="h-9 w-9 rounded-full cta-aurora flex items-center justify-center shrink-0 cursor-pointer transition-transform active:scale-95"
            >
              <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
            </button>
          </article>
        ))}
      </div>

      {/* Bottom Action: Slim + New Shortcut Pill */}
      <div className="pt-2 flex justify-center">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="h-10 px-5 rounded-full glass-pill hover:bg-white/[0.12] border border-white/[0.14] text-xs font-semibold text-[var(--text-primary)] flex items-center gap-2 cursor-pointer transition-all"
        >
          <Plus className="h-4 w-4 text-[var(--accent)]" />
          <span>New Shortcut</span>
        </button>
      </div>

      {/* Custom Macro Creator Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create custom voice shortcut"
          className="fixed inset-0 z-[75] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setModalOpen(false)}
        >
          <form
            onSubmit={handleCreateShortcut}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl glass-sheet sm:border sm:border-white/[0.12] p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                  New Voice Shortcut
                </h2>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Trigger a custom command, persona, or screen share with one tap or phrase.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="h-8 w-8 rounded-full glass-pill flex items-center justify-center text-[var(--text-secondary)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Shortcut title (e.g. Morning Briefing)"
                className="w-full h-10 rounded-xl px-3.5 text-xs bg-white/[0.06] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-white/[0.1] focus:outline-none focus:border-cyan-400/45"
              />
              <input
                type="text"
                required
                value={triggerPhrase}
                onChange={(e) => setTriggerPhrase(e.target.value)}
                placeholder='Voice trigger (e.g. "Start morning routine")'
                className="w-full h-10 rounded-xl px-3.5 text-xs bg-white/[0.06] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-white/[0.1] focus:outline-none focus:border-cyan-400/45"
              />
              <textarea
                required
                rows={2}
                value={promptToSend}
                onChange={(e) => setPromptToSend(e.target.value)}
                placeholder="Action or prompt Gwen should run..."
                className="w-full rounded-xl px-3.5 py-2.5 text-xs bg-white/[0.06] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-white/[0.1] focus:outline-none focus:border-cyan-400/45 resize-none"
              />

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={switchPersonaId}
                  onChange={(e) => setSwitchPersonaId(e.target.value)}
                  aria-label="Optional persona switch"
                  className="flex-1 min-w-[140px] h-9 rounded-full px-3 text-xs bg-white/[0.06] text-[var(--text-primary)] border border-white/[0.1]"
                >
                  <option value="">Keep current persona</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      Switch to {p.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setEnableScreenShare((v) => !v)}
                  className={`h-9 px-3 rounded-full text-xs border transition-colors cursor-pointer ${
                    enableScreenShare
                      ? 'bg-cyan-400/14 border-cyan-400/35 text-[var(--accent)]'
                      : 'glass-pill text-[var(--text-secondary)]'
                  }`}
                >
                  Screen: {enableScreenShare ? 'On' : 'Off'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="h-9 px-4 rounded-full glass-pill text-xs font-medium text-[var(--text-secondary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-9 px-5 rounded-full cta-aurora text-xs font-semibold cursor-pointer"
              >
                Save Shortcut
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
