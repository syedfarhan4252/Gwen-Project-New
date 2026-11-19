import React, { useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  EyeOff,
  Lock,
  Mic,
  Pencil,
  Pin,
  PinOff,
  Plus,
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
  const [newPinned, setNewPinned] = useState(false);
  const [newPermanent, setNewPermanent] = useState(true);

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

  // On-Device Voiceprint Enrollment (3-second local spectral signature)
  const startVoiceEnrollment = async () => {
    setEnrollingVoice(true);
    setVoiceEnrollStatus('Listening for 3 seconds — say: "Hey Gwen, it’s me — remember my voice."');
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
      setVoiceEnrollStatus('Microphone permission is required to enroll your voiceprint.');
    } finally {
      setEnrollingVoice(false);
    }
  };

  // On-Device Face Enrollment (Camera capture + local histogram + visual descriptor)
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
      setFaceEnrollStatus('Camera permission is required to enroll your face profile.');
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

      // Extract concise visual trait summary via Gemini Vision
      let visualSummary = identityCore.visualTraits || 'Primary user enrolled on-device.';
      try {
        const res = await fetch('/api/gwen/describe-appearance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: dataUrl }),
        });
        if (res.ok) {
          const data = (await res.json()) as { visualSummary?: string };
          if (data.visualSummary) visualSummary = data.visualSummary;
        }
      } catch {
        // Keep local descriptor if offline
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
      setFaceEnrollStatus('Face profile & visual descriptors saved on-device.');
      closeFaceCamera();
    } finally {
      setFaceEnrollBusy(false);
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    onAddMemory(newContent.trim(), newCategory, 'manual', newPinned, newPermanent);
    setNewContent('');
    setNewPinned(false);
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

  const permanentCount = memories.filter((m) => m.isPermanent).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header & Privacy Controls */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            Permanent Memory Core
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            <span className="font-mono-tabular">{memories.length}</span> facts
            <span className="mx-2" aria-hidden="true">·</span>
            <span className="font-mono-tabular">{permanentCount}</span> permanent
            <span className="mx-2" aria-hidden="true">·</span>
            <span>
              {settings.incognitoMode
                ? 'Incognito active (memory core paused)'
                : 'Stored locally & injected into every session'}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onUpdateSettings({ incognitoMode: !settings.incognitoMode })}
            className="min-h-[44px] px-4 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-colors whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: settings.incognitoMode ? 'var(--warning-soft)' : 'var(--bg-surface)',
              borderColor: settings.incognitoMode ? 'var(--warning)' : 'var(--border-hairline)',
              color: settings.incognitoMode ? 'var(--warning)' : 'var(--text-primary)',
            }}
          >
            <EyeOff className="h-4 w-4" />
            <span>{settings.incognitoMode ? 'Incognito On' : 'Incognito Off'}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdateSettings({ autoExtractMemories: !settings.autoExtractMemories })
            }
            className="min-h-[44px] px-4 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-colors whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: settings.autoExtractMemories
                ? 'var(--accent-soft)'
                : 'var(--bg-surface)',
              borderColor: settings.autoExtractMemories
                ? 'var(--accent)'
                : 'var(--border-hairline)',
              color: settings.autoExtractMemories ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            <span>Auto-Capture: {settings.autoExtractMemories ? 'Enabled' : 'Paused'}</span>
          </button>
        </div>
      </div>

      {/* Immutable Developer Core + Continuous Local Session Continuity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section
          className="rounded-3xl p-5 border space-y-2.5"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--accent-ring)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Lock className="h-4 w-4 text-[var(--accent)]" />
              <span>Immutable Creator &amp; Origin Story</span>
            </h2>
            <span className="text-[11px] font-mono-tabular text-[var(--accent)]">LOCKED</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            Sole Developer &amp; Main User: <strong className="text-[var(--text-primary)]">{IMMUTABLE_DEVELOPER_NAME}</strong> (permanently locked across all devices).
          </p>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            {IMMUTABLE_ORIGIN_STORY}
          </p>
        </section>

        <section
          className="rounded-3xl p-5 border space-y-2.5"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-hairline)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
              Zero-Forgetfulness Session Continuity
            </h2>
            <span className="text-[11px] font-mono-tabular text-[var(--text-muted)]">
              {sessionState.totalArchivedTurns} turns stored
            </span>
          </div>
          <p className="text-xs text-[var(--text-primary)] font-medium">
            Last-Left Topic: <span className="text-[var(--accent)]">{sessionState.lastLeftTopic}</span>
          </p>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {sessionState.lastSummary}
          </p>
          {sessionState.unfinishedThreads.length > 0 && (
            <p className="text-[11px] text-[var(--text-muted)]">
              Open threads: {sessionState.unfinishedThreads.join(' · ')}
            </p>
          )}
        </section>
      </div>

      {/* Permanent Identity Core: Personal Profile + Voiceprint + Face Biometrics */}
      <section
        className="rounded-3xl p-5 sm:p-6 border space-y-5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--accent-ring)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-[var(--accent)]" />
              <span>Current Device User &amp; Identity Core (On-Device)</span>
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Personalize how Gwen addresses you on this device, plus on-device Voiceprint &amp; Face recognition.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={settings.deviceUserName}
              onChange={(e) => onUpdateSettings({ deviceUserName: e.target.value })}
              placeholder="Current device user name"
              className="h-10 rounded-xl px-3 text-xs bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>

        {/* Personal Identity Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Your Name
            </label>
            <input
              type="text"
              value={identityCore.displayName}
              onChange={(e) => onUpdateIdentityCore({ displayName: e.target.value })}
              placeholder="e.g. Syed Farhan"
              className="w-full h-11 rounded-xl px-3.5 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Preferred Nickname
            </label>
            <input
              type="text"
              value={identityCore.nickname}
              onChange={(e) => onUpdateIdentityCore({ nickname: e.target.value })}
              placeholder="What Gwen calls you"
              className="w-full h-11 rounded-xl px-3.5 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Birthday
            </label>
            <input
              type="text"
              value={identityCore.birthday}
              onChange={(e) => onUpdateIdentityCore({ birthday: e.target.value })}
              placeholder="e.g. October 14"
              className="w-full h-11 rounded-xl px-3.5 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Visual Traits &amp; Style
            </label>
            <input
              type="text"
              value={identityCore.visualTraits}
              onChange={(e) => onUpdateIdentityCore({ visualTraits: e.target.value })}
              placeholder="e.g. Glasses, dark hoodie"
              className="w-full h-11 rounded-xl px-3.5 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>

        {/* Voiceprint & Face Enrollment Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Voiceprint Card */}
          <div className="rounded-2xl p-4 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Mic className="h-4 w-4 text-[var(--accent)]" />
                  <span>Voiceprint Profile</span>
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {identityCore.voiceprint?.enrolled
                    ? `Enrolled on-device · ${new Date(identityCore.voiceprint.enrolledAt).toLocaleDateString()}`
                    : 'Not enrolled yet — capture a 3s local acoustic signature.'}
                </p>
              </div>
              {identityCore.voiceprint?.enrolled && (
                <button
                  type="button"
                  onClick={() => {
                    onSetVoiceprint(null);
                    setVoiceEnrollStatus('Voiceprint wiped from device.');
                  }}
                  className="min-h-[34px] px-2.5 rounded-lg text-xs text-[var(--danger)] hover:bg-black/10 cursor-pointer"
                >
                  Wipe
                </button>
              )}
            </div>

            {voiceEnrollStatus && (
              <p className="text-xs text-[var(--accent)]">{voiceEnrollStatus}</p>
            )}

            <button
              type="button"
              onClick={() => void startVoiceEnrollment()}
              disabled={enrollingVoice}
              className="min-h-[42px] px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
              style={{
                backgroundColor: identityCore.voiceprint?.enrolled
                  ? 'var(--bg-surface)'
                  : 'var(--accent)',
                color: identityCore.voiceprint?.enrolled
                  ? 'var(--text-primary)'
                  : 'var(--accent-contrast)',
                border: '1px solid var(--border-hairline)',
              }}
            >
              <Mic className="h-3.5 w-3.5" />
              <span>
                {enrollingVoice
                  ? 'Sampling Voice (3s)...'
                  : identityCore.voiceprint?.enrolled
                    ? 'Re-Enroll My Voice'
                    : 'Enroll My Voice'}
              </span>
            </button>
          </div>

          {/* Face Profile Card */}
          <div className="rounded-2xl p-4 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex flex-col justify-between gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {identityCore.faceProfile?.thumbnailDataUrl && (
                  <img
                    src={identityCore.faceProfile.thumbnailDataUrl}
                    alt="Enrolled face profile"
                    className="h-12 w-12 rounded-xl object-cover border border-[var(--accent)] shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                    <Camera className="h-4 w-4 text-[var(--accent)]" />
                    <span>Face &amp; Visual Profile</span>
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                    {identityCore.faceProfile?.enrolled
                      ? identityCore.faceProfile.visualSummary
                      : 'Not enrolled yet — lets Gwen recognize you on Camera Vision.'}
                  </p>
                </div>
              </div>
              {identityCore.faceProfile?.enrolled && (
                <button
                  type="button"
                  onClick={() => {
                    onSetFaceProfile(null);
                    setFaceEnrollStatus('Face profile wiped from device.');
                  }}
                  className="min-h-[34px] px-2.5 rounded-lg text-xs text-[var(--danger)] hover:bg-black/10 shrink-0 cursor-pointer"
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
                  className="w-full h-40 rounded-xl object-cover bg-black border border-[var(--accent)]"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void captureFaceEnrollment()}
                    disabled={faceEnrollBusy}
                    className="flex-1 min-h-[40px] rounded-xl text-xs font-semibold cursor-pointer"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: 'var(--accent-contrast)',
                    }}
                  >
                    {faceEnrollBusy ? 'Analyzing Features...' : 'Capture & Save Face'}
                  </button>
                  <button
                    type="button"
                    onClick={closeFaceCamera}
                    className="min-h-[40px] px-3 rounded-xl text-xs bg-[var(--bg-surface)] text-[var(--text-secondary)] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {faceEnrollStatus && (
              <p className="text-xs text-[var(--accent)]">{faceEnrollStatus}</p>
            )}

            {!enrollingFace && (
              <button
                type="button"
                onClick={() => void openFaceCamera()}
                className="min-h-[42px] px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 cursor-pointer"
                style={{
                  backgroundColor: identityCore.faceProfile?.enrolled
                    ? 'var(--bg-surface)'
                    : 'var(--accent)',
                  color: identityCore.faceProfile?.enrolled
                    ? 'var(--text-primary)'
                    : 'var(--accent-contrast)',
                  border: '1px solid var(--border-hairline)',
                }}
              >
                <Camera className="h-3.5 w-3.5" />
                <span>
                  {identityCore.faceProfile?.enrolled ? 'Re-Enroll My Face' : 'Enroll My Face'}
                </span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Add Permanent Memory Composer */}
      <form
        onSubmit={handleAdd}
        className="rounded-3xl p-5 border space-y-3"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder='Add a permanent memory (or tell Gwen "Remember permanently that...")'
            className="flex-1 h-12 rounded-2xl px-4 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
            aria-label="Memory category"
            className="h-12 rounded-2xl px-3.5 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setNewPermanent((p) => !p)}
            className="h-12 px-3.5 rounded-2xl text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: newPermanent ? 'var(--accent-soft)' : 'var(--bg-elevated)',
              borderColor: newPermanent ? 'var(--accent)' : 'var(--border-hairline)',
              color: newPermanent ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            <Lock className="h-3.5 w-3.5" />
            <span>{newPermanent ? 'Permanent' : 'Standard'}</span>
          </button>
          <button
            type="submit"
            disabled={!newContent.trim()}
            className="h-12 px-5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-45 whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-contrast)',
            }}
          >
            <Plus className="h-4 w-4" />
            <span>Save</span>
          </button>
        </div>
      </form>

      {/* Search & Category Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative w-full lg:max-w-sm">
          <Search className="h-4 w-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Permanent Memory Core..."
            className="w-full h-11 rounded-xl pl-10 pr-4 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
          />
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
      </div>

      {/* Memory Cards List */}
      {filteredMemories.length === 0 ? (
        <div
          className="rounded-3xl p-10 text-center border"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-hairline)',
          }}
        >
          <p className="text-base font-medium text-[var(--text-primary)]">
            No matching memories found
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Add a permanent fact above or tell Gwen &ldquo;Remember that...&rdquo; during a conversation.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMemories.map((item) => {
            const isEditing = editingId === item.id;
            const dateStr = new Date(item.updatedAt).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            });

            return (
              <article
                key={item.id}
                className="rounded-2xl p-5 border flex flex-col justify-between gap-4 transition-colors"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: item.isPermanent
                    ? 'var(--accent-ring)'
                    : 'var(--border-hairline)',
                }}
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl p-3 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as MemoryCategory)}
                        className="h-10 rounded-xl px-3 text-xs bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)]"
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
                          className="h-10 px-3 rounded-xl text-xs font-medium bg-[var(--bg-elevated)] text-[var(--text-secondary)] cursor-pointer"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={commitEdit}
                          className="h-10 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          style={{
                            backgroundColor: 'var(--accent)',
                            color: 'var(--accent-contrast)',
                          }}
                        >
                          <Check className="h-4 w-4" />
                          <span>Save</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm sm:text-[15px] leading-relaxed text-[var(--text-primary)]">
                      {item.content}
                    </p>

                    <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--border-hairline)]">
                      <div className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 truncate">
                        <span className="text-[var(--text-secondary)] font-medium">
                          {item.category}
                        </span>
                        {item.isPermanent && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[var(--accent)] font-medium">Permanent</span>
                          </>
                        )}
                        {item.pinned && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Pinned</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{dateStr}</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateMemory(item.id, { isPermanent: !item.isPermanent })
                          }
                          aria-label={item.isPermanent ? 'Mark non-permanent' : 'Mark permanent'}
                          title={item.isPermanent ? 'Permanent Core Fact' : 'Promote to Permanent Core'}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                          style={{
                            color: item.isPermanent ? 'var(--accent)' : 'var(--text-muted)',
                          }}
                        >
                          <Lock className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateMemory(item.id, { pinned: !item.pinned })}
                          aria-label={item.pinned ? 'Unpin memory' : 'Pin memory'}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                        >
                          {item.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => beginEdit(item)}
                          aria-label="Edit memory"
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteMemory(item.id)}
                          aria-label="Delete memory"
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
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
    </div>
  );
};
