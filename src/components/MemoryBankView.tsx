import React, { useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  EyeOff,
  Lock,
  Mic,
  Pencil,
  Pin,
  PinOff,
  Search,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  ContinuousSessionState,
  FaceBiometricProfile,
  GwenSettings,
  IdentityCoreProfile,
  MemoryCategory,
  MemoryItem,
  VoiceprintProfile,
} from '../types/gwen';
import { describeGwenAppearance } from '../services/gwenClientApi';
import { IMMUTABLE_DEVELOPER_NAME, IMMUTABLE_ORIGIN_STORY } from '../shared/gwenSystemPrompt';
import { computeSpectralSignature, extractFaceHistogram } from '../utils/biometrics';

interface MemoryBankViewProps {
  memories: MemoryItem[];
  identityCore: IdentityCoreProfile;
  sessionState: ContinuousSessionState;
  settings: GwenSettings;
  onUpdateSettings: (patch: Partial<GwenSettings>) => void;
  onUpdateIdentityCore: (patch: Partial<IdentityCoreProfile>) => void;
  onSetVoiceprint: (profile: VoiceprintProfile | null) => void;
  onSetFaceProfile: (profile: FaceBiometricProfile | null) => void;
  onAddMemory: (
    content: string,
    category: MemoryCategory,
    source?: MemoryItem['source'],
    pinned?: boolean,
    isPermanent?: boolean
  ) => void;
  onUpdateMemory: (
    id: string,
    patch: Partial<Pick<MemoryItem, 'content' | 'category' | 'pinned' | 'isPermanent'>>
  ) => void;
  onDeleteMemory: (id: string) => void;
}

const CATEGORIES: MemoryCategory[] = [
  'Preferences',
  'Personal Context',
  'Routines',
  'Projects',
  'Micro-Detail',
  'Custom Notes',
];

const CATEGORY_CHIP_LABELS: Record<'All' | MemoryCategory, string> = {
  All: 'All',
  Preferences: 'Preferences',
  'Personal Context': 'Personal',
  Routines: 'Routines',
  Projects: 'Projects',
  'Micro-Detail': 'Details',
  'Custom Notes': 'Notes',
};

const CATEGORY_DOT_COLORS: Record<MemoryCategory, string> = {
  Preferences: '#22d3ee',
  'Personal Context': '#a78bfa',
  Routines: '#34d399',
  Projects: '#fbbf24',
  'Micro-Detail': '#38bdf8',
  'Custom Notes': '#f472b6',
};

export const MemoryBankView: React.FC<MemoryBankViewProps> = ({
  memories,
  identityCore,
  sessionState,
  settings,
  onUpdateSettings,
  onUpdateIdentityCore,
  onSetVoiceprint,
  onSetFaceProfile,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | MemoryCategory>('All');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('Preferences');
  const [newPermanent, setNewPermanent] = useState(true);

  const [identityExpanded, setIdentityExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState<MemoryCategory>('Preferences');

  // Voiceprint Enrollment state
  const [enrollingVoice, setEnrollingVoice] = useState(false);
  const [voiceEnrollStatus, setVoiceEnrollStatus] = useState<string | null>(null);

  // Face Profile Enrollment state
  const [enrollingFace, setEnrollingFace] = useState(false);
  const [faceEnrollBusy, setFaceEnrollBusy] = useState(false);
  const [faceEnrollStatus, setFaceEnrollStatus] = useState<string | null>(null);
  const faceVideoRef = useRef<HTMLVideoElement | null>(null);
  const faceStreamRef = useRef<MediaStream | null>(null);

  const filteredMemories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...memories]
      .filter((m) => {
        if (selectedCategory !== 'All' && m.category !== selectedCategory) return false;
        if (
          q &&
          !m.content.toLowerCase().includes(q) &&
          !m.category.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isPermanent !== b.isPermanent) return a.isPermanent ? -1 : 1;
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [memories, search, selectedCategory]);

  // On-Device Voiceprint Enrollment
  const startVoiceEnrollment = async () => {
    setEnrollingVoice(true);
    setVoiceEnrollStatus('Listening 3s — say: "Hey Gwen, it’s me — remember my voice."');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const bins = new Float32Array(analyser.frequencyBinCount);
      const acc = new Array<number>(16).fill(0);
      let frames = 0;

      const sampleTimer = window.setInterval(() => {
        analyser.getFloatFrequencyData(bins);
        const sig = computeSpectralSignature(bins, 16);
        for (let i = 0; i < sig.length; i++) acc[i] += sig[i];
        frames += 1;
      }, 120);

      await new Promise((r) => setTimeout(r, 3000));
      window.clearInterval(sampleTimer);
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();

      const averaged = acc.map((v) => Number((v / Math.max(1, frames)).toFixed(4)));
      const mag = Math.sqrt(averaged.reduce((s, x) => s + x * x, 0)) || 1;
      const normalized = averaged.map((v) => Number((v / mag).toFixed(4)));

      onSetVoiceprint({
        enrolled: true,
        enrolledAt: new Date().toISOString(),
        spectralVector: normalized,
        samplePhrase: "Hey Gwen, it's me — remember my voice.",
      });
      setVoiceEnrollStatus('Voiceprint saved securely on this device.');
    } catch {
      setVoiceEnrollStatus('Microphone permission required to enroll voiceprint.');
    } finally {
      setEnrollingVoice(false);
    }
  };

  const openFaceCamera = async () => {
    setFaceEnrollStatus(null);
    setEnrollingFace(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } },
        audio: false,
      });
      faceStreamRef.current = stream;
      window.setTimeout(() => {
        if (faceVideoRef.current) {
          faceVideoRef.current.srcObject = stream;
          void faceVideoRef.current.play();
        }
      }, 80);
    } catch {
      setEnrollingFace(false);
      setFaceEnrollStatus('Camera permission required to enroll face profile.');
    }
  };

  const closeFaceCamera = () => {
    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach((t) => t.stop());
      faceStreamRef.current = null;
    }
    setEnrollingFace(false);
  };

  const captureFaceEnrollment = async () => {
    const video = faceVideoRef.current;
    if (!video || video.videoWidth === 0) return;
    setFaceEnrollBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = Math.round((video.videoHeight / video.videoWidth) * 320);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      const histogram = extractFaceHistogram(canvas);

      let visualSummary = identityCore.visualTraits || 'Primary user enrolled on-device.';
      try {
        const desc = await describeGwenAppearance(dataUrl);
        if (desc) visualSummary = desc;
      } catch {
        // Keep local descriptor
      }

      onSetFaceProfile({
        enrolled: true,
        enrolledAt: new Date().toISOString(),
        thumbnailDataUrl: dataUrl,
        histogramVector: histogram,
        visualSummary,
      });

      if (!identityCore.visualTraits) {
        onUpdateIdentityCore({ visualTraits: visualSummary });
      }
      setFaceEnrollStatus('Face profile saved on-device.');
      closeFaceCamera();
    } finally {
      setFaceEnrollBusy(false);
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    onAddMemory(newContent.trim(), newCategory, 'manual', false, newPermanent);
    setNewContent('');
  };

  const beginEdit = (item: MemoryItem) => {
    setEditingId(item.id);
    setEditContent(item.content);
    setEditCategory(item.category);
  };

  const commitEdit = () => {
    if (!editingId || !editContent.trim()) return;
    onUpdateMemory(editingId, {
      content: editContent.trim(),
      category: editCategory,
    });
    setEditingId(null);
  };

  const userNameLabel =
    identityCore.displayName || settings.deviceUserName || IMMUTABLE_DEVELOPER_NAME;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pt-5 pb-6 space-y-3.5">
      {/* Focused Header: Memory Core + Incognito & Auto-Capture Status Pills */}
      <header className="flex flex-wrap items-center justify-between gap-2.5">
        <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Memory Core
        </h1>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onUpdateSettings({ incognitoMode: !settings.incognitoMode })}
            className={`h-8 px-3 rounded-full text-[11px] font-medium flex items-center gap-1.5 border transition-colors whitespace-nowrap cursor-pointer ${
              settings.incognitoMode
                ? 'bg-amber-400/15 border-amber-400/35 text-amber-300'
                : 'glass-pill text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <EyeOff className="h-3.5 w-3.5" />
            <span>Incognito</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateSettings({ autoExtractMemories: !settings.autoExtractMemories })
            }
            className={`h-8 px-3 rounded-full text-[11px] font-medium flex items-center gap-1.5 border transition-colors whitespace-nowrap cursor-pointer ${
              settings.autoExtractMemories
                ? 'bg-cyan-400/14 border-cyan-400/35 text-[var(--accent)]'
                : 'glass-pill text-[var(--text-secondary)]'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                settings.autoExtractMemories ? 'bg-cyan-400' : 'bg-white/25'
              }`}
            />
            <span>Auto-Capture</span>
          </button>
        </div>
      </header>

      {/* Search + Horizontally Scrollable Filter Chips */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="h-4 w-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories..."
            className="w-full h-10 rounded-full pl-10 pr-4 text-xs sm:text-[13px] glass-card text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-cyan-400/45"
          />
        </div>

        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar pr-6">
          {(['All', ...CATEGORIES] as const).map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`h-8 px-3.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer border ${
                  active
                    ? 'bg-cyan-400/15 border-cyan-400/40 text-[var(--text-primary)]'
                    : 'glass-card text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>{CATEGORY_CHIP_LABELS[cat]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Compact Core Cards (Creator · Current User & Biometrics · Last-Left Context) */}
      <div className="space-y-2.5">
        {/* 1. Creator Card — Locked Syed Farhan · Ben 10 Origin */}
        <section className="rounded-2xl p-3.5 glass-card flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="h-9 w-9 rounded-xl bg-cyan-400/12 border border-cyan-400/25 flex items-center justify-center text-[var(--accent)] shrink-0 mt-0.5">
              <Lock className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
                  {IMMUTABLE_DEVELOPER_NAME} · Ben 10 Origin
                </h2>
                <span className="text-[10px] font-mono-tabular text-[var(--accent)]">
                  Immutable Creator
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed line-clamp-2 mt-0.5">
                {IMMUTABLE_ORIGIN_STORY}
              </p>
            </div>
          </div>
        </section>

        {/* 2. Current User & Biometrics Card (Expandable on tap) */}
        <section className="rounded-2xl glass-card overflow-hidden">
          <button
            type="button"
            onClick={() => setIdentityExpanded((v) => !v)}
            className="w-full p-3.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="h-9 w-9 rounded-xl bg-violet-500/14 border border-violet-400/25 flex items-center justify-center text-violet-300 shrink-0">
                <UserCheck className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                  {userNameLabel}
                  {identityCore.nickname ? ` (${identityCore.nickname})` : ''}
                </h2>
                <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                  {identityCore.birthday ? `Bday: ${identityCore.birthday} · ` : ''}
                  {identityCore.voiceprint?.enrolled ? 'Voice enrolled' : 'Voiceprint'} ·{' '}
                  {identityCore.faceProfile?.enrolled ? 'Face enrolled' : 'Face Profile'}
                </p>
              </div>
            </div>
            {identityExpanded ? (
              <ChevronUp className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
            )}
          </button>

          {identityExpanded && (
            <div className="px-3.5 pb-4 pt-1 border-t border-white/[0.08] space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2">
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={identityCore.displayName}
                    onChange={(e) => onUpdateIdentityCore({ displayName: e.target.value })}
                    placeholder="e.g. Syed Farhan"
                    className="w-full h-9 rounded-xl px-3 text-xs bg-white/[0.05] text-[var(--text-primary)] border border-white/[0.1] focus:outline-none focus:border-cyan-400/45"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                    Nickname
                  </label>
                  <input
                    type="text"
                    value={identityCore.nickname}
                    onChange={(e) => onUpdateIdentityCore({ nickname: e.target.value })}
                    placeholder="What Gwen calls you"
                    className="w-full h-9 rounded-xl px-3 text-xs bg-white/[0.05] text-[var(--text-primary)] border border-white/[0.1] focus:outline-none focus:border-cyan-400/45"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                    Birthday
                  </label>
                  <input
                    type="text"
                    value={identityCore.birthday}
                    onChange={(e) => onUpdateIdentityCore({ birthday: e.target.value })}
                    placeholder="e.g. October 14"
                    className="w-full h-9 rounded-xl px-3 text-xs bg-white/[0.05] text-[var(--text-primary)] border border-white/[0.1] focus:outline-none focus:border-cyan-400/45"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1">
                    Visual Traits
                  </label>
                  <input
                    type="text"
                    value={identityCore.visualTraits}
                    onChange={(e) => onUpdateIdentityCore({ visualTraits: e.target.value })}
                    placeholder="e.g. Glasses, dark hoodie"
                    className="w-full h-9 rounded-xl px-3 text-xs bg-white/[0.05] text-[var(--text-primary)] border border-white/[0.1] focus:outline-none focus:border-cyan-400/45"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {/* Voiceprint */}
                <div className="rounded-xl p-3 bg-white/[0.035] border border-white/[0.08] space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                        <Mic className="h-3.5 w-3.5 text-[var(--accent)]" />
                        <span>Voiceprint Profile</span>
                      </h3>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {identityCore.voiceprint?.enrolled
                          ? `Enrolled ${new Date(identityCore.voiceprint.enrolledAt).toLocaleDateString()}`
                          : '3-second local acoustic signature'}
                      </p>
                    </div>
                    {identityCore.voiceprint?.enrolled && (
                      <button
                        type="button"
                        onClick={() => {
                          onSetVoiceprint(null);
                          setVoiceEnrollStatus('Voiceprint wiped.');
                        }}
                        className="text-[11px] text-[var(--danger)] hover:underline cursor-pointer"
                      >
                        Wipe
                      </button>
                    )}
                  </div>
                  {voiceEnrollStatus && (
                    <p className="text-[11px] text-[var(--accent)]">{voiceEnrollStatus}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => void startVoiceEnrollment()}
                    disabled={enrollingVoice}
                    className="h-9 px-3.5 rounded-full glass-pill text-xs font-medium text-[var(--text-primary)] hover:bg-white/[0.12] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Mic className="h-3.5 w-3.5 text-[var(--accent)]" />
                    <span>
                      {enrollingVoice
                        ? 'Sampling (3s)...'
                        : identityCore.voiceprint?.enrolled
                          ? 'Re-Enroll Voice'
                          : 'Enroll Voiceprint'}
                    </span>
                  </button>
                </div>

                {/* Face Profile */}
                <div className="rounded-xl p-3 bg-white/[0.035] border border-white/[0.08] space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {identityCore.faceProfile?.thumbnailDataUrl && (
                        <img
                          src={identityCore.faceProfile.thumbnailDataUrl}
                          alt="Enrolled face"
                          className="h-10 w-10 rounded-xl object-cover border border-cyan-400/40 shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                          <Camera className="h-3.5 w-3.5 text-violet-400" />
                          <span>Face Profile</span>
                        </h3>
                        <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                          {identityCore.faceProfile?.enrolled
                            ? identityCore.faceProfile.visualSummary
                            : 'Recognize you on Camera Vision'}
                        </p>
                      </div>
                    </div>
                    {identityCore.faceProfile?.enrolled && (
                      <button
                        type="button"
                        onClick={() => {
                          onSetFaceProfile(null);
                          setFaceEnrollStatus('Face profile wiped.');
                        }}
                        className="text-[11px] text-[var(--danger)] hover:underline shrink-0 cursor-pointer"
                      >
                        Wipe
                      </button>
                    )}
                  </div>

                  {enrollingFace && (
                    <div className="space-y-2">
                      <video
                        ref={faceVideoRef}
                        muted
                        playsInline
                        className="w-full h-36 rounded-xl object-cover bg-black border border-cyan-400/40"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void captureFaceEnrollment()}
                          disabled={faceEnrollBusy}
                          className="flex-1 h-9 rounded-full cta-aurora text-xs font-semibold cursor-pointer"
                        >
                          {faceEnrollBusy ? 'Analyzing...' : 'Capture & Save'}
                        </button>
                        <button
                          type="button"
                          onClick={closeFaceCamera}
                          className="h-9 px-3 rounded-full glass-pill text-xs text-[var(--text-secondary)] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {faceEnrollStatus && (
                    <p className="text-[11px] text-[var(--accent)]">{faceEnrollStatus}</p>
                  )}

                  {!enrollingFace && (
                    <button
                      type="button"
                      onClick={() => void openFaceCamera()}
                      className="h-9 px-3.5 rounded-full glass-pill text-xs font-medium text-[var(--text-primary)] hover:bg-white/[0.12] flex items-center gap-1.5 cursor-pointer"
                    >
                      <Camera className="h-3.5 w-3.5 text-violet-400" />
                      <span>
                        {identityCore.faceProfile?.enrolled
                          ? 'Re-Enroll Face'
                          : 'Enroll Face Profile'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 3. Last-Left Context Card */}
        <section className="rounded-2xl p-3.5 glass-card flex items-start gap-3">
          <span className="h-9 w-9 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-[var(--accent)] shrink-0 mt-0.5">
            <Clock className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                Last-Left Context · {sessionState.lastLeftTopic}
              </h2>
              <span className="text-[10px] font-mono-tabular text-[var(--text-muted)] shrink-0">
                {sessionState.totalArchivedTurns} turns
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed line-clamp-2 mt-0.5">
              {sessionState.lastSummary}
            </p>
          </div>
        </section>
      </div>

      {/* 4. Saved Memories List */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold text-[var(--text-secondary)]">Saved Memories</h2>
          <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
            {filteredMemories.length} {filteredMemories.length === 1 ? 'fact' : 'facts'}
          </span>
        </div>

        {filteredMemories.length === 0 ? (
          <div className="rounded-2xl p-7 text-center glass-card">
            <p className="text-sm font-medium text-[var(--text-primary)]">No matching memories</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Add a fact below or tell Gwen &ldquo;Remember that...&rdquo; during a voice chat.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {filteredMemories.map((item) => {
              const isEditing = editingId === item.id;
              const dateStr = new Date(item.updatedAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
              });
              const dotColor = CATEGORY_DOT_COLORS[item.category] || '#22d3ee';

              return (
                <article
                  key={item.id}
                  className="rounded-2xl p-3.5 glass-card flex flex-col justify-between gap-2.5 transition-colors hover:bg-white/[0.075]"
                >
                  {isEditing ? (
                    <div className="space-y-2.5">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={2}
                        className="w-full rounded-xl p-2.5 text-xs sm:text-[13px] bg-white/[0.06] text-[var(--text-primary)] border border-white/[0.11] focus:outline-none focus:border-cyan-400/45"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value as MemoryCategory)}
                          className="h-8 rounded-full px-3 text-xs bg-white/[0.06] text-[var(--text-primary)] border border-white/[0.1]"
                        >
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="h-8 w-8 rounded-full glass-pill flex items-center justify-center text-[var(--text-secondary)] cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={commitEdit}
                            className="h-8 px-3 rounded-full cta-aurora text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>Save</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-[13px] leading-relaxed text-[var(--text-primary)]">
                        {item.content}
                      </p>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.07]">
                        <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5 truncate">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: dotColor }}
                          />
                          <span className="text-[var(--text-secondary)] font-medium truncate">
                            {CATEGORY_CHIP_LABELS[item.category] || item.category}
                          </span>
                          {item.isPermanent && (
                            <span className="text-[var(--accent)] font-medium">· Permanent</span>
                          )}
                          <span className="font-mono-tabular">· {dateStr}</span>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => beginEdit(item)}
                            aria-label="Edit memory"
                            className="h-7 w-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/[0.08] cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateMemory(item.id, {
                                isPermanent: !item.isPermanent,
                                pinned: !item.isPermanent,
                              })
                            }
                            aria-label={item.isPermanent ? 'Unpin permanent memory' : 'Pin as permanent'}
                            className={`h-7 w-7 rounded-full flex items-center justify-center hover:bg-white/[0.08] transition-colors cursor-pointer ${
                              item.isPermanent || item.pinned
                                ? 'text-[var(--accent)]'
                                : 'text-[var(--text-muted)]'
                            }`}
                          >
                            {item.isPermanent || item.pinned ? (
                              <PinOff className="h-3.5 w-3.5" />
                            ) : (
                              <Pin className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteMemory(item.id)}
                            aria-label="Delete memory"
                            className="h-7 w-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-white/[0.08] cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Inline Add-Memory Box: Describe something to remember... + Permanent 🔒 & Gradient Save pills */}
      <form onSubmit={handleAdd} className="rounded-2xl p-3.5 glass-card space-y-2.5">
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          rows={2}
          placeholder="Describe something to remember..."
          className="w-full rounded-xl px-3.5 py-2.5 text-xs sm:text-[13px] bg-white/[0.05] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-white/[0.09] focus:outline-none focus:border-cyan-400/45 resize-none"
        />

        <div className="flex items-center justify-between gap-2">
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
            aria-label="Memory category"
            className="flex-1 min-w-0 h-9 rounded-full px-3 text-xs bg-white/[0.06] text-[var(--text-primary)] border border-white/[0.1] focus:outline-none focus:border-cyan-400/45 cursor-pointer"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_CHIP_LABELS[cat]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setNewPermanent((p) => !p)}
            className={`h-9 px-3 rounded-full text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              newPermanent
                ? 'bg-cyan-400/14 border-cyan-400/35 text-[var(--accent)]'
                : 'glass-pill text-[var(--text-secondary)]'
            }`}
          >
            <span>Permanent</span>
            <Lock className="h-3 w-3" />
          </button>

          <button
            type="submit"
            disabled={!newContent.trim()}
            className="h-9 px-4 rounded-full cta-aurora text-xs font-semibold flex items-center justify-center transition-all disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
};
