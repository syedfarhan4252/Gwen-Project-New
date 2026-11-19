import React, { useEffect, useState } from 'react';
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  GraduationCap,
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
import {
  getGeminiRequestHeaders,
  type StoredApiKeyState,
} from '../services/apiKeyStorage';
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
  // Google Workspace
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
  // Isolated Multi-Kid Study Hub
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
  // PWA Install
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  onPromptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  onNotify?: (msg: string) => void;
  // Core Settings
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

const SECTION_LINKS = [
  { id: 'sec-apikey', label: 'Gemini API Key' },
  { id: 'sec-companion', label: 'Persona & Voice' },
  { id: 'sec-kids', label: 'Kids Study Hub' },
  { id: 'sec-google', label: 'Google Account' },
  { id: 'sec-memory', label: 'Memory & Care' },
  { id: 'sec-device', label: 'Permissions' },
  { id: 'sec-appearance', label: 'Themes & Install' },
  { id: 'sec-about', label: 'About Gwen' },
];

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
      const res = await fetch('/api/gwen/health', {
        headers: getGeminiRequestHeaders(),
      });
      const data = (await res.json()) as HealthCheckResult;
      setHealth(data);
    } catch {
      setHealth({
        ok: false,
        statusLabel: 'Unavailable',
        latencyMs: 0,
        models: [],
        error: 'Unable to contact Gwen backend.',
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
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Cohesive Companion Profile Header Card */}
      <section
        className="rounded-3xl p-5 sm:p-6 border flex flex-col md:flex-row md:items-center justify-between gap-5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        <div className="flex items-center gap-4 min-w-0">
          {googleAccount?.photoURL ? (
            <img
              src={googleAccount.photoURL}
              alt={googleAccount.displayName}
              referrerPolicy="no-referrer"
              className="h-14 w-14 rounded-2xl object-cover border border-[var(--border-hairline)] shrink-0"
            />
          ) : (
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center font-display text-xl font-bold shrink-0"
              style={{
                backgroundColor: 'var(--accent-soft)',
                color: 'var(--accent)',
              }}
            >
              {(settings.deviceUserName || 'G').slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="min-w-0 space-y-1">
            <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)] truncate">
              {settings.deviceUserName
                ? `${settings.deviceUserName}'s Gwen Companion`
                : 'Gwen Companion Settings'}
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] truncate">
              {activePersona?.name || 'Gwen'} ·{' '}
              {apiKeyState.status === 'verified'
                ? 'Gemini Key Verified'
                : apiKeyState.status === 'invalid'
                  ? 'Gemini Key Needs Attention'
                  : 'Gemini Key Not Configured'}{' '}
              · {googleAccount ? `Linked: ${googleAccount.email}` : 'Google Not Linked'} ·{' '}
              {memoriesCount} memories
            </p>
            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 font-mono-tabular">
              <Clock className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>{clockLabel} ({settings.timezone})</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <InstallAppButton
            isInstallable={isInstallable}
            isInstalled={isInstalled}
            isIOS={isIOS}
            isAndroid={isAndroid}
            onPromptInstall={onPromptInstall}
            onNotify={onNotify}
          />
          <button
            type="button"
            onClick={onSleepGwen}
            className="min-h-[44px] px-4 rounded-xl text-xs font-semibold flex items-center gap-2 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-primary)] hover:border-[var(--accent)] whitespace-nowrap cursor-pointer"
          >
            <Moon className="h-4 w-4 text-[var(--accent)]" />
            <span>Sleep Gwen</span>
          </button>
        </div>
      </section>

      {/* Smooth Quick Jump Section Strip */}
      <nav
        aria-label="Settings sections"
        className="flex items-center gap-2 overflow-x-auto pb-1"
      >
        {SECTION_LINKS.map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => scrollToSection(sec.id)}
            className="min-h-[40px] px-3.5 rounded-xl text-xs font-medium bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            {sec.label}
          </button>
        ))}
      </nav>

      {/* SECTION 1: Companion & AI Personas + Voice & Language */}
      <section
        id="sec-companion"
        className="rounded-3xl p-5 sm:p-6 border space-y-6 scroll-mt-6"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                1. Companion &amp; AI Persona
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Switch immediately between Home Teacher, GF, BF, Best Friend, Funny / Witty, or custom personas.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowPersonaForm((v) => !v)}
            className="min-h-[42px] px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-contrast)',
            }}
          >
            <Plus className="h-4 w-4" />
            <span>{showPersonaForm ? 'Cancel' : 'Create Custom Persona'}</span>
          </button>
        </div>

        {showPersonaForm && (
          <form
            onSubmit={handleCreatePersona}
            className="rounded-2xl p-4 border space-y-3"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--accent-ring)',
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                placeholder="Persona Name (e.g. Exam Tutor)"
                className="h-11 rounded-xl px-3.5 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
              />
              <input
                type="text"
                value={pTone}
                onChange={(e) => setPTone(e.target.value)}
                placeholder="Tone (e.g. Warm & encouraging)"
                className="h-11 rounded-xl px-3.5 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
              />
              <select
                value={pLength}
                onChange={(e) => setPLength(e.target.value as ResponseLength)}
                className="h-11 rounded-xl px-3.5 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)]"
              >
                <option value="concise">Concise replies</option>
                <option value="balanced">Balanced replies</option>
                <option value="detailed">Detailed replies</option>
              </select>
            </div>
            <input
              type="text"
              value={pTagline}
              onChange={(e) => setPTagline(e.target.value)}
              placeholder="Short subtitle (optional)"
              className="w-full h-11 rounded-xl px-3.5 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
            />
            <textarea
              required
              rows={3}
              value={pPrompt}
              onChange={(e) => setPPrompt(e.target.value)}
              placeholder="Describe how Gwen should speak, guide, and assist in this persona..."
              className="w-full rounded-xl p-3.5 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="min-h-[42px] px-5 rounded-xl text-sm font-semibold cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
              >
                Save &amp; Activate Persona
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {personas.map((persona) => {
            const active = settings.activePersonaId === persona.id;
            return (
              <div
                key={persona.id}
                className="rounded-2xl p-4 border flex flex-col justify-between gap-3 transition-colors"
                style={{
                  backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                  borderColor: active ? 'var(--accent)' : 'var(--border-hairline)',
                }}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onUpdateSettings({ activePersonaId: persona.id })}
                      className="text-left flex-1 cursor-pointer"
                    >
                      <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                        {persona.name}
                      </h3>
                      <p className="text-xs text-[var(--text-muted)]">
                        {persona.tagline} · {persona.responseLength}
                      </p>
                    </button>
                    {!persona.isBuiltIn && (
                      <button
                        type="button"
                        onClick={() => onDeleteCustomPersona(persona.id)}
                        aria-label={`Delete ${persona.name}`}
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                    {persona.systemPrompt}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onUpdateSettings({ activePersonaId: persona.id })}
                  className="min-h-[38px] w-full rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                  style={{
                    backgroundColor: active ? 'var(--accent)' : 'var(--bg-surface)',
                    color: active ? 'var(--accent-contrast)' : 'var(--text-primary)',
                  }}
                >
                  {active ? 'Active Persona' : 'Activate'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Voice Profile, Speaking Speed & Language Row */}
        <div className="pt-5 border-t border-[var(--border-hairline)] grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-2.5">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              Voice Profile
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {VOICE_PROFILES.map((v) => {
                const active = settings.voiceName === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onUpdateSettings({ voiceName: v.id })}
                    className="min-h-[52px] px-3.5 py-2.5 rounded-2xl text-left border transition-colors cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                      borderColor: active ? 'var(--accent)' : 'var(--border-hairline)',
                    }}
                  >
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{v.label}</div>
                    <div className="text-xs text-[var(--text-muted)]">{v.character}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--text-secondary)]">Speaking Speed</span>
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
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                Conversation Language
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    { id: 'auto', label: 'Auto-Detect' },
                    { id: 'en', label: 'English' },
                    { id: 'hi', label: 'Hindi' },
                    { id: 'hinglish', label: 'Hinglish' },
                  ] as { id: LanguageMode; label: string }[]
                ).map((lang) => {
                  const active = settings.languageMode === lang.id;
                  return (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => onUpdateSettings({ languageMode: lang.id })}
                      className="min-h-[42px] px-3 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
                      style={{
                        backgroundColor: active ? 'var(--accent)' : 'var(--bg-elevated)',
                        color: active ? 'var(--accent-contrast)' : 'var(--text-secondary)',
                      }}
                    >
                      {lang.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: Kids Study Hub (Home Teacher Multi-Child Profiles) */}
      <section
        id="sec-kids"
        className="rounded-3xl p-5 sm:p-6 border space-y-4 scroll-mt-6"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              2. Kids Study Hub (Home Teacher)
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Separate, private learning vaults for every child at home — lessons, gentle corrections, quizzes &amp; parent reports.
            </p>
          </div>
        </div>

        <KidsStudyHubPanel
          kidBundles={kidBundles}
          activeKidId={activeKidId}
          onSelectKid={onSelectKid}
          onAddKidProfile={onAddKidProfile}
          onDeleteKidProfile={onDeleteKidProfile}
          onStartLessonWithKid={onStartLessonWithKid}
          onAskParentReport={onAskParentReport}
        />
      </section>

      {/* SECTION 3: Connected Google Account & Gemini Engine Status */}
      <section
        id="sec-google"
        className="rounded-3xl p-5 sm:p-6 border space-y-6 scroll-mt-6"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Link2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              3. Connected Google Account &amp; AI Engine
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Link this device user&rsquo;s unique Gmail / Google Account for Workspace tools, and verify Gwen&rsquo;s Gemini AI connection.
            </p>
          </div>
        </div>

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

        {/* Per-Device Personal Gemini / Google AI Studio API Key Management */}
        <div
          id="sec-apikey"
          className="pt-5 border-t border-[var(--border-hairline)] space-y-5 scroll-mt-6"
        >
          <GeminiApiKeyPanel
            apiKeyState={apiKeyState}
            onApiKeyStateChange={onApiKeyStateChange}
            onNotify={onNotify}
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Gemini Intelligence Engine
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Powered dynamically by your personal Google AI Studio API key for Live Voice, Vision &amp; Search.
              </p>
            </div>
            <button
              type="button"
              onClick={runHealthCheck}
              disabled={checkingHealth}
              className="min-h-[40px] px-3.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors whitespace-nowrap cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-hairline)',
                color: 'var(--text-primary)',
              }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${checkingHealth ? 'animate-spin' : ''}`} />
              <span>{checkingHealth ? 'Verifying...' : 'Test & Verify Engine'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(
              [
                {
                  id: 'gemini-4-hydrogen' as TextModelId,
                  name: 'Gemini 4 Hydrogen (Flash)',
                  detail: 'Recommended · High intelligence with automatic Flash Lite fallback',
                },
                {
                  id: 'gemini-3.1-flash-lite' as TextModelId,
                  name: 'Gemini 3.1 Flash Lite',
                  detail: 'Ultra-fast lightweight responses for instant replies',
                },
              ]
            ).map((m) => {
              const active = settings.textModel === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onUpdateSettings({ textModel: m.id })}
                  className="p-3.5 rounded-2xl text-left border transition-colors cursor-pointer"
                  style={{
                    backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                    borderColor: active ? 'var(--accent)' : 'var(--border-hairline)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{m.name}</span>
                    <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">{m.id}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{m.detail}</p>
                </button>
              );
            })}
          </div>

          {health && (
            <div
              className="rounded-2xl p-3.5 border text-xs space-y-2"
              style={{
                backgroundColor: health.ok ? 'var(--success-soft)' : 'var(--danger-soft)',
                borderColor: health.ok ? 'var(--success)' : 'var(--danger)',
              }}
            >
              <div className="flex items-center justify-between font-semibold text-[var(--text-primary)]">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  {health.statusLabel || (health.ok ? 'Verified' : 'Unavailable')}
                </span>
                {health.ok && <span className="font-mono-tabular">{health.latencyMs} ms</span>}
              </div>
              {health.error && <p className="text-[var(--text-primary)]">{health.error}</p>}
              {health.models.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                  {health.models.map((mod) => (
                    <div
                      key={mod.id}
                      className="flex items-center justify-between gap-2 text-[var(--text-secondary)]"
                    >
                      <span className="truncate">{mod.label}</span>
                      <span className="font-mono-tabular text-[11px] shrink-0">{mod.id}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 4: Memory Core, User Personalization, IST Timezone & Privacy */}
      <section
        id="sec-memory"
        className="rounded-3xl p-5 sm:p-6 border space-y-5 scroll-mt-6"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              4. Memory Core, Timezone &amp; Privacy
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Personalize how Gwen addresses you on this device, control IST timezone, and manage continuous memory privacy.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--text-primary)]">
              Current Device User Name
            </label>
            <input
              type="text"
              value={settings.deviceUserName}
              onChange={(e) => onUpdateSettings({ deviceUserName: e.target.value })}
              placeholder="What Gwen calls you on this device"
              className="w-full h-11 rounded-xl px-3.5 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
            />
            <p className="text-[11px] text-[var(--text-muted)]">
              Stored locally per device. Developer attribution stays permanently locked to {IMMUTABLE_DEVELOPER_NAME}.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--text-primary)]">
              System Timezone (Permanent IST Default)
            </label>
            <select
              value={settings.timezone}
              onChange={(e) => onUpdateSettings({ timezone: e.target.value })}
              className="w-full h-11 rounded-xl px-3 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)]"
            >
              {SUPPORTED_TIMEZONES.map((tz) => (
                <option key={tz.id} value={tz.id}>
                  {tz.label} ({tz.offset})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-[var(--text-muted)]">
              Defaults permanently to Indian Standard Time (Asia/Kolkata) for greetings, alarms, and Google Calendar.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              title: 'Auto-Extract Permanent Memories',
              desc: 'Automatically save personal preferences and context locally.',
              active: settings.autoExtractMemories,
              onToggle: () =>
                onUpdateSettings({ autoExtractMemories: !settings.autoExtractMemories }),
            },
            {
              title: 'Incognito Privacy Mode',
              desc: 'Pause saving memories and hide personal memory context temporarily.',
              active: settings.incognitoMode,
              onToggle: () => onUpdateSettings({ incognitoMode: !settings.incognitoMode }),
            },
            {
              title: 'Proactive Multimodal Empathy',
              desc: 'Check in gently when cough, fatigue, or mood cues are detected.',
              active: settings.proactiveEmpathyEnabled,
              onToggle: () =>
                onUpdateSettings({
                  proactiveEmpathyEnabled: !settings.proactiveEmpathyEnabled,
                }),
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl p-4 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex flex-col justify-between gap-3"
            >
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">{item.title}</div>
                <p className="text-xs text-[var(--text-muted)] mt-1">{item.desc}</p>
              </div>
              <button
                type="button"
                onClick={item.onToggle}
                className="min-h-[38px] w-full rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                style={{
                  backgroundColor: item.active ? 'var(--accent)' : 'var(--bg-surface)',
                  color: item.active ? 'var(--accent-contrast)' : 'var(--text-secondary)',
                }}
              >
                {item.active ? 'Active' : 'Off'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 5: Device, Always-Active Mode & Permissions Dashboard */}
      <section
        id="sec-device"
        className="rounded-3xl p-5 sm:p-6 border space-y-5 scroll-mt-6"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
                5. Device &amp; System Permissions
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Control Always-Active Wake Lock, hands-free device settings, camera, microphone, and downloads.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                keepActiveInBackground: !settings.keepActiveInBackground,
              })
            }
            className="min-h-[40px] px-4 rounded-xl text-xs font-semibold shrink-0 whitespace-nowrap cursor-pointer"
            style={{
              backgroundColor: settings.keepActiveInBackground
                ? 'var(--accent)'
                : 'var(--bg-elevated)',
              color: settings.keepActiveInBackground
                ? 'var(--accent-contrast)'
                : 'var(--text-secondary)',
            }}
          >
            {settings.keepActiveInBackground
              ? `Keep Active: On (${wakeLockActive ? 'Locked' : 'Standby'})`
              : 'Keep Active: Off'}
          </button>
        </div>

        <div className="divide-y divide-[var(--border-hairline)]">
          {[
            {
              name: 'Microphone',
              why: 'Real-time 1-on-1 voice & local voiceprint enrollment.',
              status: micPerm === 'granted' ? 'Granted' : micPerm === 'denied' ? 'Blocked' : 'Required',
              isGranted: micPerm === 'granted',
              actionLabel: micPerm === 'granted' ? 'Granted' : 'Grant',
              onAction: requestMicrophonePermission,
            },
            {
              name: 'Camera Vision (CAMERA)',
              why: 'Lets Gwen see you & your surroundings + local face profile.',
              status: isCameraActive ? 'Active' : camPerm === 'granted' ? 'Granted' : 'Required',
              isGranted: isCameraActive || camPerm === 'granted',
              actionLabel: isCameraActive ? 'Turn Off' : camPerm === 'granted' ? 'Start' : 'Grant',
              onAction: camPerm === 'granted' ? onToggleCameraVision : requestCameraPermission,
            },
            {
              name: 'Modify System Settings (WRITE_SETTINGS)',
              why: 'Hands-free brightness, volume, Wi-Fi, Bluetooth & torch control.',
              status: settings.writeSettingsGranted ? 'Granted' : 'Required',
              isGranted: settings.writeSettingsGranted,
              actionLabel: settings.writeSettingsGranted ? 'Granted' : 'Grant',
              onAction: () =>
                onUpdateSettings({ writeSettingsGranted: !settings.writeSettingsGranted }),
            },
            {
              name: 'Do Not Disturb Access (NOTIFICATION_POLICY)',
              why: 'Toggle Do Not Disturb and mute notifications hands-free.',
              status: settings.dndPolicyGranted ? 'Granted' : 'Required',
              isGranted: settings.dndPolicyGranted,
              actionLabel: settings.dndPolicyGranted ? 'Granted' : 'Grant',
              onAction: () => onUpdateSettings({ dndPolicyGranted: !settings.dndPolicyGranted }),
            },
            {
              name: 'Calendar, Alarms & Reminders',
              why: 'Schedule events, set alarms/timers, and check off tasks.',
              status: settings.calendarPermissionGranted ? 'Granted' : 'Required',
              isGranted: settings.calendarPermissionGranted,
              actionLabel: settings.calendarPermissionGranted ? 'Granted' : 'Grant',
              onAction: () =>
                onUpdateSettings({
                  calendarPermissionGranted: !settings.calendarPermissionGranted,
                }),
            },
            {
              name: 'Screen Capture (MediaProjection)',
              why: 'Live screen sharing so Gwen can explain or draft replies.',
              status: isScreenSharing ? 'Active' : 'Ready',
              isGranted: isScreenSharing,
              actionLabel: isScreenSharing ? 'Stop' : 'Start',
              onAction: onToggleScreenShare,
            },
            {
              name: 'Notifications',
              why: 'Foreground service status & reminder alerts.',
              status: notifPerm === 'granted' ? 'Granted' : notifPerm === 'denied' ? 'Blocked' : 'Required',
              isGranted: notifPerm === 'granted',
              actionLabel: notifPerm === 'granted' ? 'Granted' : 'Grant',
              onAction: requestNotificationPermission,
            },
            {
              name: 'Location & Weather (ACCESS_FINE_LOCATION)',
              why: 'Live local weather updates, rain alerts & navigation.',
              status: settings.locationPermissionGranted ? 'Granted' : 'Tap to grant',
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
              name: 'Gallery MediaStore & Browser Downloads',
              why: 'Auto-saves AI creations & confirmed web images/files to Pictures/GwenDownloads.',
              status: settings.mediaGalleryPermissionGranted ? 'Granted' : 'Required',
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
              className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                  {perm.name}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{perm.why}</p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span
                  className="text-xs font-medium"
                  style={{
                    color: perm.isGranted ? 'var(--success)' : 'var(--text-muted)',
                  }}
                >
                  {perm.status}
                </span>
                <button
                  type="button"
                  onClick={perm.onAction}
                  className="min-h-[36px] px-3 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer"
                  style={{
                    backgroundColor: perm.isGranted ? 'var(--bg-elevated)' : 'var(--accent)',
                    borderColor: perm.isGranted ? 'var(--border-hairline)' : 'transparent',
                    color: perm.isGranted ? 'var(--text-primary)' : 'var(--accent-contrast)',
                  }}
                >
                  {perm.actionLabel}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-[var(--border-hairline)]">
          <button
            type="button"
            onClick={() => setShowAndroidSpec((v) => !v)}
            className="w-full min-h-[40px] flex items-center justify-between text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <span>Android Manifest Native Permissions Reference ({ANDROID_NATIVE_PERMISSIONS_SPEC.length})</span>
            {showAndroidSpec ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {showAndroidSpec && (
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs max-h-64 overflow-y-auto pr-1">
              {ANDROID_NATIVE_PERMISSIONS_SPEC.map((item) => (
                <div
                  key={item.permission}
                  className="rounded-xl p-2.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)]"
                >
                  <div className="font-mono-tabular text-[11px] text-[var(--accent)] break-all">
                    {item.permission}
                  </div>
                  <div className="text-[var(--text-secondary)] mt-0.5">{item.purpose}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 6: Appearance, Themes, Floating Avatar & Install Gwen App */}
      <section
        id="sec-appearance"
        className="rounded-3xl p-5 sm:p-6 border space-y-6 scroll-mt-6"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
              6. Appearance, Floating Avatar &amp; Install App
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Customize themes &amp; accent colors, configure the draggable overlay bubble, or install Gwen on your device.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {THEME_PRESETS.map((theme) => {
                const active = settings.themeId === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => onUpdateSettings({ themeId: theme.id, customAccent: null })}
                    className="p-3.5 rounded-2xl text-left border transition-colors cursor-pointer flex items-center gap-3"
                    style={{
                      backgroundColor: active ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                      borderColor: active ? 'var(--accent)' : 'var(--border-hairline)',
                    }}
                  >
                    <span
                      className="h-9 w-9 rounded-full shrink-0 border border-white/15 flex items-center justify-center"
                      style={{ backgroundColor: theme.previewBg }}
                    >
                      <span
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: theme.defaultAccent }}
                      />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {theme.name}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] truncate">
                        {theme.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Custom Accent Color
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
                      className="h-9 w-9 rounded-full border-2 transition-transform hover:scale-105 cursor-pointer"
                      style={{
                        backgroundColor: swatch.value,
                        borderColor: isSelected ? 'var(--text-primary)' : 'transparent',
                      }}
                    />
                  );
                })}
                <label className="min-h-[36px] px-3 rounded-xl text-xs font-medium bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-secondary)] flex items-center gap-2 cursor-pointer">
                  <span>Custom</span>
                  <input
                    type="color"
                    value={settings.customAccent || '#2dd4bf'}
                    onChange={(e) => onUpdateSettings({ customAccent: e.target.value })}
                    className="h-5 w-5 bg-transparent border-0 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl p-4 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    Floating Overlay Avatar
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Draggable live Gwen bubble accessible on every screen.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ overlayEnabled: !settings.overlayEnabled })}
                  className="min-h-[38px] px-3.5 rounded-xl text-xs font-semibold cursor-pointer"
                  style={{
                    backgroundColor: settings.overlayEnabled ? 'var(--accent)' : 'var(--bg-surface)',
                    color: settings.overlayEnabled
                      ? 'var(--accent-contrast)'
                      : 'var(--text-secondary)',
                  }}
                >
                  {settings.overlayEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <span className="block text-xs text-[var(--text-muted)] mb-1">Style</span>
                  <div className="flex gap-1">
                    {(['orb', 'ring', 'halo'] as OverlayStyle[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => onUpdateSettings({ overlayStyle: st })}
                        className="flex-1 h-9 rounded-lg text-xs font-medium capitalize cursor-pointer"
                        style={{
                          backgroundColor:
                            settings.overlayStyle === st ? 'var(--accent-soft)' : 'var(--bg-surface)',
                          color:
                            settings.overlayStyle === st ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs text-[var(--text-muted)] mb-1">Size</span>
                  <div className="flex gap-1">
                    {(['compact', 'standard', 'large'] as OverlaySize[]).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => onUpdateSettings({ overlaySize: sz })}
                        className="flex-1 h-9 rounded-lg text-xs font-medium capitalize cursor-pointer"
                        style={{
                          backgroundColor:
                            settings.overlaySize === sz ? 'var(--accent-soft)' : 'var(--bg-surface)',
                          color:
                            settings.overlaySize === sz ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Dedicated Standalone PWA Install Card */}
            <div
              className="rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--accent-ring)',
              }}
            >
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {isInstalled ? 'Gwen Installed as Standalone App' : 'Install Gwen on This Device'}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {isInstalled
                    ? 'You are running Gwen directly from your home screen with offline shell support.'
                    : 'Download Gwen directly from the browser as a full-screen standalone mobile or desktop app.'}
                </p>
              </div>
              {!isInstalled && (
                <InstallAppButton
                  isInstallable={isInstallable}
                  isInstalled={isInstalled}
                  isIOS={isIOS}
                  isAndroid={isAndroid}
                  onPromptInstall={onPromptInstall}
                  onNotify={onNotify}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7: About Gwen & Immutable Developer Attribution */}
      <section
        id="sec-about"
        className="rounded-3xl p-5 sm:p-6 border flex flex-col md:flex-row md:items-center justify-between gap-5 scroll-mt-6"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--accent-ring)',
        }}
      >
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent)]">
            <ShieldCheck className="h-4 w-4" />
            <span>7. About Gwen · Immutable Creator &amp; Origin</span>
          </div>
          <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">
            Created and developed by {IMMUTABLE_DEVELOPER_NAME}
          </h2>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {IMMUTABLE_ORIGIN_STORY}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Developer identity is permanently locked to {IMMUTABLE_DEVELOPER_NAME} across all devices, personas, and memory states.
          </p>
        </div>

        <button
          type="button"
          onClick={onAskGwenAboutCreator}
          className="min-h-[44px] px-5 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--accent-contrast)',
          }}
        >
          Ask Gwen About Her Creator
        </button>
      </section>
    </div>
  );
};
