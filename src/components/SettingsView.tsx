import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  GraduationCap,
  KeyRound,
  Link2,
  Moon,
  Palette,
  Plus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  ACCENT_SWATCHES,
  ANDROID_NATIVE_PERMISSIONS_SPEC,
  THEME_PRESETS,
  VOICE_PROFILES,
} from '../data/defaults';
import { IMMUTABLE_DEVELOPER_NAME, IMMUTABLE_ORIGIN_STORY } from '../shared/gwenSystemPrompt';
import type {
  GoogleAccountProfile,
  GoogleWorkspaceScopesConfig,
  GwenSettings,
  HealthCheckResult,
  KeepStyleNote,
  KidStudyBundle,
  LanguageMode,
  OverlaySize,
  OverlayStyle,
  Persona,
  ResponseLength,
  TextModelId,
} from '../types/gwen';
import type { StoredApiKeyState } from '../services/apiKeyStorage';
import { runGwenHealthCheck } from '../services/gwenClientApi';
import { formatTimeInZone, SUPPORTED_TIMEZONES } from '../utils/timeIst';
import { ConnectedAccountPanel } from './ConnectedAccountPanel';
import { GeminiApiKeyPanel } from './GeminiApiKeyPanel';
import { InstallAppButton } from './InstallAppBanner';
import { KidsStudyHubPanel } from './KidsStudyHubPanel';

interface SettingsViewProps {
  settings: GwenSettings;
  personas: Persona[];
  memoriesCount: number;
  apiKeyState: StoredApiKeyState;
  onApiKeyStateChange: (next: StoredApiKeyState) => void;
  isScreenSharing: boolean;
  isCameraActive: boolean;
  wakeLockActive: boolean;
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
  kidBundles: KidStudyBundle[];
  activeKidId: string | null;
  onSelectKid: (kidId: string | null) => void;
  onAddKidProfile: (
    name: string,
    age: number,
    grade: string,
    subjects: string[]
  ) => Promise<void>;
  onDeleteKidProfile: (kidId: string) => Promise<void>;
  onStartLessonWithKid: (kidName: string, subject?: string) => void;
  onAskParentReport: (kidName: string) => void;
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  onPromptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  onNotify?: (msg: string) => void;
  onUpdateSettings: (patch: Partial<GwenSettings>) => void;
  onSaveCustomPersona: (
    persona: Omit<Persona, 'id' | 'isBuiltIn'> & { id?: string }
  ) => string;
  onDeleteCustomPersona: (id: string) => void;
  onToggleScreenShare: () => void;
  onToggleCameraVision: () => void;
  onSleepGwen: () => void;
  onAskGwenAboutCreator: () => void;
}

type BrowserPermState = 'granted' | 'prompt' | 'denied' | 'unsupported';

type SettingsSectionId =
  | 'apikey'
  | 'persona'
  | 'kids'
  | 'google'
  | 'device'
  | 'appearance'
  | 'about';

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  personas,
  memoriesCount,
  apiKeyState,
  onApiKeyStateChange,
  isScreenSharing,
  isCameraActive,
  wakeLockActive,
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
  kidBundles,
  activeKidId,
  onSelectKid,
  onAddKidProfile,
  onDeleteKidProfile,
  onStartLessonWithKid,
  onAskParentReport,
  isInstallable,
  isInstalled,
  isIOS,
  isAndroid,
  onPromptInstall,
  onNotify,
  onUpdateSettings,
  onSaveCustomPersona,
  onDeleteCustomPersona,
  onToggleScreenShare,
  onToggleCameraVision,
  onSleepGwen,
  onAskGwenAboutCreator,
}) => {
  // Mobile drill-in state: null shows the vertical grouped menu; non-null shows detail screen with < Back
  const [activeSection, setActiveSection] = useState<SettingsSectionId | null>(null);
  // Desktop active detail section (defaults to apikey)
  const [desktopSection, setDesktopSection] = useState<SettingsSectionId>('apikey');

  useEffect(() => {
    const onOpenApiKey = () => {
      setActiveSection('apikey');
      setDesktopSection('apikey');
    };
    window.addEventListener('gwen:open-apikey-settings', onOpenApiKey);
    return () => window.removeEventListener('gwen:open-apikey-settings', onOpenApiKey);
  }, []);

  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const [micPerm, setMicPerm] = useState<BrowserPermState>('prompt');
  const [camPerm, setCamPerm] = useState<BrowserPermState>('prompt');
  const [notifPerm, setNotifPerm] = useState<BrowserPermState>('prompt');
  const [showAndroidSpec, setShowAndroidSpec] = useState(false);

  const [showPersonaForm, setShowPersonaForm] = useState(false);
  const [pName, setPName] = useState('');
  const [pTagline, setPTagline] = useState('');
  const [pTone, setPTone] = useState('');
  const [pLength, setPLength] = useState<ResponseLength>('balanced');
  const [pPrompt, setPPrompt] = useState('');

  const [clockLabel, setClockLabel] = useState(() =>
    formatTimeInZone(new Date(), settings.timezone)
  );

  useEffect(() => {
    setClockLabel(formatTimeInZone(new Date(), settings.timezone));
    const timer = window.setInterval(() => {
      setClockLabel(formatTimeInZone(new Date(), settings.timezone));
    }, 30000);
    return () => window.clearInterval(timer);
  }, [settings.timezone]);

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      const n = Notification.permission;
      setNotifPerm(n === 'granted' ? 'granted' : n === 'denied' ? 'denied' : 'prompt');
    } else {
      setNotifPerm('unsupported');
    }

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((status) => {
          setMicPerm(status.state as BrowserPermState);
          status.onchange = () => setMicPerm(status.state as BrowserPermState);
        })
        .catch(() => setMicPerm('prompt'));

      navigator.permissions
        .query({ name: 'camera' as PermissionName })
        .then((status) => {
          setCamPerm(status.state as BrowserPermState);
          status.onchange = () => setCamPerm(status.state as BrowserPermState);
        })
        .catch(() => setCamPerm('prompt'));
    }
  }, []);

  const runHealthCheck = async () => {
    setCheckingHealth(true);
    try {
      const data = await runGwenHealthCheck();
      setHealth(data as HealthCheckResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach Google Gemini API.';
      setHealth({
        ok: false,
        statusLabel: 'Unavailable',
        latencyMs: 0,
        models: [],
        error: msg,
      });
    } finally {
      setCheckingHealth(false);
    }
  };

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPerm('granted');
    } catch {
      setMicPerm('denied');
    }
  };

  const requestCameraPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      setCamPerm('granted');
    } catch {
      setCamPerm('denied');
    }
  };

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setNotifPerm(result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'prompt');
  };

  const handleCreatePersona = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim() || !pPrompt.trim()) return;
    const id = onSaveCustomPersona({
      name: pName.trim(),
      tagline: pTagline.trim() || 'Custom Persona',
      tone: pTone.trim() || 'Personalized',
      responseLength: pLength,
      systemPrompt: pPrompt.trim(),
    });
    onUpdateSettings({ activePersonaId: id });
    setPName('');
    setPTagline('');
    setPTone('');
    setPLength('balanced');
    setPPrompt('');
    setShowPersonaForm(false);
  };

  const activePersona = personas.find((p) => p.id === settings.activePersonaId) || personas[0];
  const currentTheme = THEME_PRESETS.find((t) => t.id === settings.themeId) || THEME_PRESETS[0];
  const profileName = settings.deviceUserName?.trim() || IMMUTABLE_DEVELOPER_NAME;

  const profileInitials = profileName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'SF';

  const menuGroups: Array<{
    groupLabel: string;
    items: Array<{
      id: SettingsSectionId;
      title: string;
      subtitle: string;
      icon: React.ReactNode;
      dotColor?: string;
    }>;
  }> = [
    {
      groupLabel: 'Intelligence & Voice',
      items: [
        {
          id: 'apikey',
          title: 'Gemini API Key',
          subtitle:
            apiKeyState.status === 'verified'
              ? `Verified · ${apiKeyState.maskedKey || 'Ready'}`
              : apiKeyState.status === 'invalid'
                ? 'Key needs attention'
                : 'Add, test & save your Google AI Studio key',
          icon: <KeyRound className="h-4 w-4 text-cyan-400" />,
          dotColor:
            apiKeyState.status === 'verified'
              ? '#34d399'
              : apiKeyState.status === 'invalid'
                ? '#f87171'
                : '#fbbf24',
        },
        {
          id: 'persona',
          title: 'Persona, Voice & 3D Avatar',
          subtitle: `${activePersona?.name || 'Default'} · ${settings.voiceName} · ${settings.avatarMode === '3d' ? '3D Anime' : 'Voice Orb'}`,
          icon: <Sparkles className="h-4 w-4 text-violet-400" />,
        },
      ],
    },
    {
      groupLabel: 'Home & Accounts',
      items: [
        {
          id: 'kids',
          title: 'Kids Study Hub (Teacher Mode)',
          subtitle:
            kidBundles.length > 0
              ? `${kidBundles.length} separate child ${kidBundles.length === 1 ? 'profile' : 'profiles'}`
              : 'Separate per-child study profiles & quizzes',
          icon: <GraduationCap className="h-4 w-4 text-sky-400" />,
        },
        {
          id: 'google',
          title: 'Connected Google Account',
          subtitle: googleAccount
            ? `${googleAccount.email} · ${googleTokenReady ? 'Active' : 'Reconnect'}`
            : 'Gmail, Calendar, Keep/Tasks, Drive & Contacts',
          icon: <Link2 className="h-4 w-4 text-emerald-400" />,
          dotColor: googleAccount && googleTokenReady ? '#34d399' : undefined,
        },
      ],
    },
    {
      groupLabel: 'Device & Appearance',
      items: [
        {
          id: 'device',
          title: 'Permissions & Device Control',
          subtitle: `Mic, Camera, Screen, Overlay & Background Lock`,
          icon: <Smartphone className="h-4 w-4 text-amber-400" />,
        },
        {
          id: 'appearance',
          title: 'Themes & Aurora Glow',
          subtitle: `${currentTheme.name} · Custom accent colors & PWA`,
          icon: <Palette className="h-4 w-4 text-pink-400" />,
        },
        {
          id: 'about',
          title: `About Gwen (by ${IMMUTABLE_DEVELOPER_NAME})`,
          subtitle: 'Immutable developer credit & Ben 10 origin story',
          icon: <ShieldCheck className="h-4 w-4 text-cyan-400" />,
        },
      ],
    },
  ];

  const allMenuItems = menuGroups.flatMap((g) => g.items);

  const openSection = (id: SettingsSectionId) => {
    setActiveSection(id);
    setDesktopSection(id);
  };

  // Renders the selected section's detail view
  const renderSectionDetail = (sectionId: SettingsSectionId) => {
    switch (sectionId) {
      case 'apikey':
        return (
          <div id="sec-apikey" className="space-y-4">
            <GeminiApiKeyPanel
              apiKeyState={apiKeyState}
              onApiKeyStateChange={onApiKeyStateChange}
              onNotify={onNotify}
            />

            <div className="rounded-2xl p-4 glass-card space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Text Intelligence Model
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Runs directly from your device using your personal key.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runHealthCheck}
                  disabled={checkingHealth}
                  className="h-8 px-3 rounded-full glass-pill text-xs font-medium text-[var(--text-primary)] hover:bg-white/[0.11] flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-[var(--accent)] ${checkingHealth ? 'animate-spin' : ''}`} />
                  <span>{checkingHealth ? 'Checking...' : 'Verify Engine'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(
                  [
                    {
                      id: 'gemini-4-hydrogen' as TextModelId,
                      name: 'Gemini 4 Hydrogen',
                      detail: 'High intelligence + automatic Flash Lite fallback',
                    },
                    {
                      id: 'gemini-3.1-flash-lite' as TextModelId,
                      name: 'Gemini 3.1 Flash Lite',
                      detail: 'Ultra-fast lightweight instant responses',
                    },
                  ] as const
                ).map((m) => {
                  const active = settings.textModel === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onUpdateSettings({ textModel: m.id })}
                      className={`p-3 rounded-2xl text-left border transition-all cursor-pointer ${
                        active
                          ? 'bg-cyan-400/12 border-cyan-400/35'
                          : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)]">
                          {m.name}
                        </span>
                        {active && <span className="h-2 w-2 rounded-full bg-cyan-400" />}
                      </div>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">{m.detail}</p>
                    </button>
                  );
                })}
              </div>

              {health && (
                <div
                  className={`rounded-xl p-3 border text-xs space-y-1.5 ${
                    health.ok
                      ? 'bg-emerald-500/10 border-emerald-400/30'
                      : 'bg-rose-500/10 border-rose-400/30'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold text-[var(--text-primary)]">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)]" />
                      {health.statusLabel || (health.ok ? 'Verified' : 'Unavailable')}
                    </span>
                    {health.ok && (
                      <span className="font-mono-tabular text-[11px]">{health.latencyMs} ms</span>
                    )}
                  </div>
                  {health.error && <p className="text-[var(--text-secondary)]">{health.error}</p>}
                </div>
              )}
            </div>
          </div>
        );

      case 'persona':
        return (
          <div className="space-y-4">
            {/* Avatar Visual Mode & Voice Controls */}
            <div className="rounded-2xl p-4 glass-card space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Companion Display
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Switch between live 3D Anime Avatar and minimal Voice Orb
                  </p>
                </div>
                <div className="h-8 p-0.5 rounded-full glass-pill flex items-center shrink-0">
                  {(['3d', 'orb'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onUpdateSettings({ avatarMode: mode })}
                      className={`h-7 px-3 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                        settings.avatarMode === mode
                          ? 'bg-white/[0.15] text-[var(--text-primary)]'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {mode === '3d' ? '3D' : 'Orb'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-white/[0.06] space-y-2">
                <span className="text-xs font-semibold text-[var(--text-secondary)]">
                  Voice Profile
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {VOICE_PROFILES.map((v) => {
                    const active = settings.voiceName === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => onUpdateSettings({ voiceName: v.id })}
                        className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                          active
                            ? 'bg-cyan-400/12 border-cyan-400/35'
                            : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className="text-xs font-semibold text-[var(--text-primary)]">
                          {v.label}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          {v.character}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[var(--text-secondary)]">Speaking Speed</span>
                    <span className="font-mono-tabular text-[var(--text-primary)]">
                      {settings.speakingRate.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.85}
                    max={1.25}
                    step={0.05}
                    value={settings.speakingRate}
                    onChange={(e) => onUpdateSettings({ speakingRate: Number(e.target.value) })}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-[var(--text-secondary)]">
                    Language
                  </span>
                  <div className="grid grid-cols-4 gap-1">
                    {(
                      [
                        { id: 'auto', label: 'Auto' },
                        { id: 'en', label: 'EN' },
                        { id: 'hi', label: 'HI' },
                        { id: 'hinglish', label: 'Hing' },
                      ] as { id: LanguageMode; label: string }[]
                    ).map((lang) => {
                      const active = settings.languageMode === lang.id;
                      return (
                        <button
                          key={lang.id}
                          type="button"
                          onClick={() => onUpdateSettings({ languageMode: lang.id })}
                          className={`h-8 rounded-full text-[11px] font-semibold cursor-pointer border transition-colors ${
                            active
                              ? 'bg-cyan-400/15 border-cyan-400/35 text-[var(--accent)]'
                              : 'bg-white/[0.04] border-white/[0.07] text-[var(--text-secondary)]'
                          }`}
                        >
                          {lang.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Personas List + Custom Creator */}
            <div className="rounded-2xl p-4 glass-card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">AI Personas</h3>
                <button
                  type="button"
                  onClick={() => setShowPersonaForm((v) => !v)}
                  className="h-8 px-3 rounded-full glass-pill text-xs font-medium text-[var(--text-primary)] hover:bg-white/[0.11] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>{showPersonaForm ? 'Cancel' : 'Custom'}</span>
                </button>
              </div>

              {showPersonaForm && (
                <form
                  onSubmit={handleCreatePersona}
                  className="rounded-2xl p-3.5 bg-white/[0.04] border border-cyan-400/25 space-y-2.5"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      value={pName}
                      onChange={(e) => setPName(e.target.value)}
                      placeholder="Persona Name"
                      className="h-9 rounded-xl px-3 text-xs bg-white/[0.06] text-[var(--text-primary)] border border-white/[0.08] focus:outline-none focus:border-cyan-400/45"
                    />
                    <input
                      type="text"
                      value={pTone}
                      onChange={(e) => setPTone(e.target.value)}
                      placeholder="Tone (e.g. Warm & witty)"
                      className="h-9 rounded-xl px-3 text-xs bg-white/[0.06] text-[var(--text-primary)] border border-white/[0.08] focus:outline-none focus:border-cyan-400/45"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={pTagline}
                      onChange={(e) => setPTagline(e.target.value)}
                      placeholder="Short subtitle"
                      className="h-9 rounded-xl px-3 text-xs bg-white/[0.06] text-[var(--text-primary)] border border-white/[0.08] focus:outline-none focus:border-cyan-400/45"
                    />
                    <select
                      value={pLength}
                      onChange={(e) => setPLength(e.target.value as ResponseLength)}
                      className="h-9 rounded-xl px-3 text-xs bg-white/[0.06] text-[var(--text-primary)] border border-white/[0.08]"
                    >
                      <option value="concise">Concise replies</option>
                      <option value="balanced">Balanced replies</option>
                      <option value="detailed">Detailed replies</option>
                    </select>
                  </div>
                  <textarea
                    required
                    rows={2}
                    value={pPrompt}
                    onChange={(e) => setPPrompt(e.target.value)}
                    placeholder="How should Gwen speak and guide in this persona?"
                    className="w-full rounded-xl p-2.5 text-xs bg-white/[0.06] text-[var(--text-primary)] border border-white/[0.08] focus:outline-none focus:border-cyan-400/45"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="h-8 px-4 rounded-full cta-aurora text-xs font-semibold cursor-pointer"
                    >
                      Save &amp; Activate
                    </button>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {personas.map((persona) => {
                  const active = settings.activePersonaId === persona.id;
                  return (
                    <div
                      key={persona.id}
                      className={`rounded-xl p-3 border flex items-center justify-between gap-2.5 transition-all ${
                        active
                          ? 'bg-cyan-400/12 border-cyan-400/35'
                          : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onUpdateSettings({ activePersonaId: persona.id })}
                        className="text-left min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {persona.name}
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                          {persona.tagline}
                        </p>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        {active ? (
                          <span className="h-2 w-2 rounded-full bg-cyan-400 mr-1" />
                        ) : (
                          <button
                            type="button"
                            onClick={() => onUpdateSettings({ activePersonaId: persona.id })}
                            className="h-7 px-2.5 rounded-full glass-pill text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                          >
                            Use
                          </button>
                        )}
                        {!persona.isBuiltIn && (
                          <button
                            type="button"
                            onClick={() => onDeleteCustomPersona(persona.id)}
                            aria-label={`Delete ${persona.name}`}
                            className="h-7 w-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'kids':
        return (
          <div className="rounded-2xl p-4 glass-card">
            <KidsStudyHubPanel
              kidBundles={kidBundles}
              activeKidId={activeKidId}
              onSelectKid={onSelectKid}
              onAddKidProfile={onAddKidProfile}
              onDeleteKidProfile={onDeleteKidProfile}
              onStartLessonWithKid={onStartLessonWithKid}
              onAskParentReport={onAskParentReport}
            />
          </div>
        );

      case 'google':
        return (
          <div className="rounded-2xl p-4 glass-card">
            <ConnectedAccountPanel
              googleAccount={googleAccount}
              googleTokenReady={googleTokenReady}
              workspaceScopes={workspaceScopes}
              keepNotes={keepNotes}
              onUpdateWorkspaceScopes={onUpdateWorkspaceScopes}
              onConnectGoogle={onConnectGoogle}
              onDisconnectGoogle={onDisconnectGoogle}
              onAddKeepNote={onAddKeepNote}
              onDeleteKeepNote={onDeleteKeepNote}
              onQuickWorkspaceAction={onQuickWorkspaceAction}
            />
          </div>
        );

      case 'device':
        return (
          <div className="space-y-4">
            {/* Personalization, IST Timezone & Privacy */}
            <div className="rounded-2xl p-4 glass-card space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[var(--text-secondary)]">
                    Device User Name
                  </label>
                  <input
                    type="text"
                    value={settings.deviceUserName}
                    onChange={(e) => onUpdateSettings({ deviceUserName: e.target.value })}
                    placeholder="What Gwen calls you"
                    className="w-full h-9 rounded-xl px-3 text-xs bg-white/[0.05] text-[var(--text-primary)] border border-white/[0.08] focus:outline-none focus:border-cyan-400/45"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[var(--text-secondary)]">
                    System Timezone (IST Default)
                  </label>
                  <select
                    value={settings.timezone}
                    onChange={(e) => onUpdateSettings({ timezone: e.target.value })}
                    className="w-full h-9 rounded-xl px-3 text-xs bg-white/[0.05] text-[var(--text-primary)] border border-white/[0.08]"
                  >
                    {SUPPORTED_TIMEZONES.map((tz) => (
                      <option key={tz.id} value={tz.id}>
                        {tz.label} ({tz.offset})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="divide-y divide-white/[0.06] pt-1">
                {[
                  {
                    title: 'Keep Active in Background',
                    desc: wakeLockActive ? 'Screen wake lock active' : 'Prevent sleep during live voice',
                    active: settings.keepActiveInBackground,
                    onToggle: () =>
                      onUpdateSettings({ keepActiveInBackground: !settings.keepActiveInBackground }),
                  },
                  {
                    title: 'Auto-Extract Memories',
                    desc: 'Save personal context locally on this device',
                    active: settings.autoExtractMemories,
                    onToggle: () =>
                      onUpdateSettings({ autoExtractMemories: !settings.autoExtractMemories }),
                  },
                  {
                    title: 'Incognito Privacy Mode',
                    desc: 'Pause saving memories temporarily',
                    active: settings.incognitoMode,
                    onToggle: () => onUpdateSettings({ incognitoMode: !settings.incognitoMode }),
                  },
                  {
                    title: 'Proactive Empathy Cues',
                    desc: 'Gentle check-ins for fatigue, cough, or stress',
                    active: settings.proactiveEmpathyEnabled,
                    onToggle: () =>
                      onUpdateSettings({
                        proactiveEmpathyEnabled: !settings.proactiveEmpathyEnabled,
                      }),
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="py-2.5 first:pt-1 last:pb-0 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        {item.title}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] truncate">{item.desc}</p>
                    </div>
                    <button
                      type="button"
                      onClick={item.onToggle}
                      className={`h-7 px-3 rounded-full text-[11px] font-semibold border transition-colors shrink-0 cursor-pointer ${
                        item.active
                          ? 'bg-cyan-400/15 border-cyan-400/35 text-[var(--accent)]'
                          : 'glass-pill text-[var(--text-muted)]'
                      }`}
                    >
                      {item.active ? 'On' : 'Off'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Hardware & System Permissions */}
            <div className="rounded-2xl p-4 glass-card space-y-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Device Permissions
              </h3>
              <div className="divide-y divide-white/[0.06]">
                {[
                  {
                    name: 'Microphone',
                    why: 'Live voice & local voiceprint',
                    isGranted: micPerm === 'granted',
                    actionLabel: micPerm === 'granted' ? 'Granted' : 'Grant',
                    onAction: requestMicrophonePermission,
                  },
                  {
                    name: 'Camera Vision',
                    why: 'Live visual context & face recognition',
                    isGranted: isCameraActive || camPerm === 'granted',
                    actionLabel: isCameraActive ? 'Off' : camPerm === 'granted' ? 'Start' : 'Grant',
                    onAction: camPerm === 'granted' ? onToggleCameraVision : requestCameraPermission,
                  },
                  {
                    name: 'Screen Capture',
                    why: 'Live screen assistance & reply drafting',
                    isGranted: isScreenSharing,
                    actionLabel: isScreenSharing ? 'Stop' : 'Start',
                    onAction: onToggleScreenShare,
                  },
                  {
                    name: 'System Controls (Brightness, DND, Torch)',
                    why: 'Hands-free device control toggles',
                    isGranted: settings.writeSettingsGranted,
                    actionLabel: settings.writeSettingsGranted ? 'Granted' : 'Grant',
                    onAction: () =>
                      onUpdateSettings({
                        writeSettingsGranted: !settings.writeSettingsGranted,
                        dndPolicyGranted: !settings.writeSettingsGranted,
                      }),
                  },
                  {
                    name: 'Notifications',
                    why: 'Alarms, reminders & hydration nudges',
                    isGranted: notifPerm === 'granted',
                    actionLabel: notifPerm === 'granted' ? 'Granted' : 'Grant',
                    onAction: requestNotificationPermission,
                  },
                  {
                    name: 'Location & Weather',
                    why: 'Live local temperature & rain alerts',
                    isGranted: settings.locationPermissionGranted,
                    actionLabel: settings.locationPermissionGranted ? 'Granted' : 'Grant',
                    onAction: () => {
                      if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                          () => onUpdateSettings({ locationPermissionGranted: true }),
                          () => onUpdateSettings({ locationPermissionGranted: false })
                        );
                      }
                    },
                  },
                  {
                    name: 'Gallery & Downloads',
                    why: 'Save AI media & confirmed browser downloads',
                    isGranted: settings.mediaGalleryPermissionGranted,
                    actionLabel: settings.mediaGalleryPermissionGranted ? 'Granted' : 'Grant',
                    onAction: () =>
                      onUpdateSettings({
                        mediaGalleryPermissionGranted: !settings.mediaGalleryPermissionGranted,
                      }),
                  },
                ].map((perm) => (
                  <div
                    key={perm.name}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {perm.name}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] truncate">{perm.why}</p>
                    </div>
                    <button
                      type="button"
                      onClick={perm.onAction}
                      className={`h-7 px-3 rounded-full text-[11px] font-semibold border shrink-0 cursor-pointer transition-colors ${
                        perm.isGranted
                          ? 'bg-emerald-500/12 border-emerald-400/30 text-emerald-300'
                          : 'glass-pill text-[var(--text-primary)] hover:bg-white/[0.12]'
                      }`}
                    >
                      {perm.actionLabel}
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setShowAndroidSpec((v) => !v)}
                  className="w-full h-8 flex items-center justify-between text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <span>
                    Android Manifest Spec ({ANDROID_NATIVE_PERMISSIONS_SPEC.length})
                  </span>
                  {showAndroidSpec ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
                {showAndroidSpec && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-1">
                    {ANDROID_NATIVE_PERMISSIONS_SPEC.map((item) => (
                      <div
                        key={item.permission}
                        className="rounded-xl p-2 bg-white/[0.03] border border-white/[0.06] text-[11px]"
                      >
                        <div className="font-mono-tabular text-[10px] text-[var(--accent)] break-all">
                          {item.permission}
                        </div>
                        <div className="text-[var(--text-muted)] mt-0.5">{item.purpose}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-4">
            {/* Theme Presets */}
            <div className="rounded-2xl p-4 glass-card space-y-3.5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Theme Palette</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {THEME_PRESETS.map((theme) => {
                  const active = settings.themeId === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => onUpdateSettings({ themeId: theme.id, customAccent: null })}
                      className={`p-3 rounded-2xl text-left border flex items-center gap-3 cursor-pointer transition-all ${
                        active
                          ? 'bg-cyan-400/12 border-cyan-400/35'
                          : 'bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.06]'
                      }`}
                    >
                      <span
                        className="h-8 w-8 rounded-full shrink-0 border border-white/15 flex items-center justify-center"
                        style={{ backgroundColor: theme.previewBg }}
                      >
                        <span
                          className="h-3.5 w-3.5 rounded-full"
                          style={{ backgroundColor: theme.defaultAccent }}
                        />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {theme.name}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] truncate">
                          {theme.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  Accent Tint
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {ACCENT_SWATCHES.map((swatch) => {
                    const isSelected = settings.customAccent === swatch.value;
                    return (
                      <button
                        key={swatch.value}
                        type="button"
                        onClick={() => onUpdateSettings({ customAccent: swatch.value })}
                        aria-label={`Set accent color to ${swatch.name}`}
                        className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-105 cursor-pointer ${
                          isSelected ? 'border-white scale-105' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: swatch.value }}
                      />
                    );
                  })}
                  <label className="h-8 px-3 rounded-full glass-pill text-[11px] font-medium text-[var(--text-secondary)] flex items-center gap-1.5 cursor-pointer">
                    <span>Custom</span>
                    <input
                      type="color"
                      value={settings.customAccent || '#22d3ee'}
                      onChange={(e) => onUpdateSettings({ customAccent: e.target.value })}
                      className="h-4 w-4 bg-transparent border-0 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Floating Overlay Avatar & Standalone PWA Install */}
            <div className="rounded-2xl p-4 glass-card space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    Floating Overlay Bubble
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Draggable live Gwen shortcut across screens
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ overlayEnabled: !settings.overlayEnabled })}
                  className={`h-8 px-3 rounded-full text-xs font-semibold border cursor-pointer ${
                    settings.overlayEnabled
                      ? 'bg-cyan-400/15 border-cyan-400/35 text-[var(--accent)]'
                      : 'glass-pill text-[var(--text-secondary)]'
                  }`}
                >
                  {settings.overlayEnabled ? 'Enabled' : 'Off'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <span className="block text-[11px] text-[var(--text-muted)] mb-1">Style</span>
                  <div className="flex gap-1">
                    {(['orb', 'ring', 'halo'] as OverlayStyle[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => onUpdateSettings({ overlayStyle: st })}
                        className={`flex-1 h-8 rounded-full text-[11px] font-medium capitalize cursor-pointer border ${
                          settings.overlayStyle === st
                            ? 'bg-cyan-400/15 border-cyan-400/35 text-[var(--accent)]'
                            : 'bg-white/[0.04] border-white/[0.07] text-[var(--text-secondary)]'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-[11px] text-[var(--text-muted)] mb-1">Size</span>
                  <div className="flex gap-1">
                    {(['compact', 'standard', 'large'] as OverlaySize[]).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => onUpdateSettings({ overlaySize: sz })}
                        className={`flex-1 h-8 rounded-full text-[11px] font-medium capitalize cursor-pointer border ${
                          settings.overlaySize === sz
                            ? 'bg-cyan-400/15 border-cyan-400/35 text-[var(--accent)]'
                            : 'bg-white/[0.04] border-white/[0.07] text-[var(--text-secondary)]'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {!isInstalled && (
                <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      Install Standalone App
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      Add Gwen directly to your home screen
                    </p>
                  </div>
                  <InstallAppButton
                    compact
                    label="Install App"
                    isInstallable={isInstallable}
                    isInstalled={isInstalled}
                    isIOS={isIOS}
                    isAndroid={isAndroid}
                    onPromptInstall={onPromptInstall}
                    onNotify={onNotify}
                  />
                </div>
              )}
            </div>
          </div>
        );

      case 'about':
        return (
          <div className="rounded-2xl p-5 glass-card space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl aurora-badge font-display text-lg font-bold flex items-center justify-center shrink-0">
                G
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                  Immutable Creator Attribution
                </div>
                <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                  Created &amp; Developed by {IMMUTABLE_DEVELOPER_NAME}
                </h2>
              </div>
            </div>

            <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] leading-relaxed">
              {IMMUTABLE_ORIGIN_STORY}
            </p>

            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              Developer identity is permanently locked to {IMMUTABLE_DEVELOPER_NAME} across all devices, personas, and memory states. Default system timezone stays locked to IST (Asia/Kolkata).
            </p>

            <button
              type="button"
              onClick={onAskGwenAboutCreator}
              className="h-10 px-4 rounded-full glass-pill text-xs font-semibold text-[var(--text-primary)] hover:bg-white/[0.12] flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Ask Gwen About Her Creator</span>
            </button>
          </div>
        );
    }
  };

  const activeMobileMeta = activeSection
    ? allMenuItems.find((i) => i.id === activeSection)
    : null;
  const activeDesktopMeta = allMenuItems.find((i) => i.id === desktopSection);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pt-5 pb-6 space-y-4">
      {/* Compact Profile Header: Gradient Initial Avatar · Name + Gwen Companion · IST · Compact Sleep Button */}
      <section className="rounded-2xl p-4 glass-card flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {googleAccount?.photoURL ? (
            <img
              src={googleAccount.photoURL}
              alt={googleAccount.displayName}
              referrerPolicy="no-referrer"
              className="h-12 w-12 rounded-2xl object-cover border border-white/[0.14] shrink-0"
            />
          ) : (
            <div className="h-12 w-12 rounded-2xl aurora-badge font-display text-base font-bold flex items-center justify-center shrink-0">
              {profileInitials}
            </div>
          )}

          <div className="min-w-0">
            <h1 className="font-display text-[17px] font-semibold tracking-tight text-[var(--text-primary)] leading-tight truncate">
              {profileName}
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-tight flex items-center gap-1.5">
              <span>Gwen Companion · IST</span>
              <span className="font-mono-tabular text-[11px] text-[var(--accent)]">
                ({clockLabel})
              </span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onSleepGwen}
          aria-label="Put Gwen to sleep"
          title="Sleep Gwen"
          className="h-10 w-10 rounded-full glass-pill flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors shrink-0 cursor-pointer"
        >
          <Moon className="h-4 w-4" />
        </button>
      </section>

      {/* MOBILE / TABLET (< lg): Native iOS/Android Vertical Grouped Menu + Slide-in Detail with < Back */}
      <div className="lg:hidden">
        {activeSection === null ? (
          <div className="space-y-4">
            {menuGroups.map((group) => (
              <div key={group.groupLabel} className="space-y-1.5">
                <h2 className="px-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {group.groupLabel}
                </h2>
                <div className="rounded-2xl glass-card divide-y divide-white/[0.06] overflow-hidden">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openSection(item.id)}
                      className="w-full px-3.5 py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.04] active:bg-white/[0.07] transition-colors cursor-pointer outline-none"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="h-9 w-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
                          {item.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                            <span className="truncate">{item.title}</span>
                            {item.dotColor && (
                              <span
                                className="h-1.5 w-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: item.dotColor }}
                              />
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                            {item.subtitle}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {/* < Back Navigation Header */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSection(null)}
                className="h-9 pl-2 pr-3 rounded-full glass-pill text-xs font-semibold text-[var(--text-primary)] hover:bg-white/[0.11] flex items-center gap-1 cursor-pointer shrink-0"
              >
                <ChevronLeft className="h-4 w-4 text-[var(--accent)]" />
                <span>Settings</span>
              </button>
              <h2 className="font-display text-sm font-semibold text-[var(--text-primary)] truncate">
                {activeMobileMeta?.title}
              </h2>
            </div>

            {renderSectionDetail(activeSection)}
          </div>
        )}
      </div>

      {/* DESKTOP (>= lg): Clean Master-Detail Grouped Menu + Active Section */}
      <div className="hidden lg:grid lg:grid-cols-12 gap-5 items-start">
        <aside className="lg:col-span-4 space-y-3.5 sticky top-4">
          {menuGroups.map((group) => (
            <div key={group.groupLabel} className="space-y-1.5">
              <h2 className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {group.groupLabel}
              </h2>
              <div className="rounded-2xl glass-card divide-y divide-white/[0.06] overflow-hidden">
                {group.items.map((item) => {
                  const active = desktopSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openSection(item.id)}
                      className={`w-full px-3 py-2.5 flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer outline-none ${
                        active
                          ? 'bg-white/[0.09] text-[var(--text-primary)]'
                          : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="h-8 w-8 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
                          {item.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                            <span className="truncate">{item.title}</span>
                            {item.dotColor && (
                              <span
                                className="h-1.5 w-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: item.dotColor }}
                              />
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] truncate">
                            {item.subtitle}
                          </p>
                        </div>
                      </div>
                      <ChevronRight
                        className={`h-3.5 w-3.5 shrink-0 ${
                          active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        <section className="lg:col-span-8 space-y-3">
          <div className="flex items-center gap-2.5 px-1">
            <span className="h-8 w-8 rounded-xl glass-pill flex items-center justify-center">
              {activeDesktopMeta?.icon}
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                {activeDesktopMeta?.title}
              </h2>
              <p className="text-xs text-[var(--text-muted)]">{activeDesktopMeta?.subtitle}</p>
            </div>
          </div>

          {renderSectionDetail(desktopSection)}
        </section>
      </div>
    </div>
  );
};
