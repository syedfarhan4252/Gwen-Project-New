import React, { useEffect, useRef, useState } from 'react';
import {
  AlarmClock,
  Bell,
  BellOff,
  Bluetooth,
  Calendar,
  Camera,
  Check,
  CheckSquare,
  Clock,
  CloudSun,
  Droplets,
  EyeOff,
  Flashlight,
  Hand,
  HeartPulse,
  ImagePlus,
  Layers,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Moon,
  Pause,
  PhoneOff,
  Play,
  Power,
  RefreshCw,
  Send,
  Sliders,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import type { ActiveCareNudge } from '../hooks/useGwenStore';
import type {
  AlarmItem,
  CalendarEventItem,
  CompanionCareState,
  DeviceSystemState,
  EmpathySignal,
  GeneratedMediaItem,
  GeneratedWebsiteItem,
  GwenSettings,
  GwenState,
  MediaAspectRatio,
  PendingMessageDraft,
  Persona,
  ReminderTaskItem,
  TimerItem,
  TranscriptMessage,
  WeatherSnapshot,
} from '../types/gwen';
import { formatCountdown } from '../utils/biometrics';
import { formatTimeInZone, getGreetingForZone } from '../utils/timeIst';
import { GwenAvatar3D } from './GwenAvatar3D';
import { StudioPanel } from './StudioPanel';
import { VoiceOrb } from './VoiceOrb';

interface CompanionViewProps {
  settings: GwenSettings;
  deviceState: DeviceSystemState;
  careState: CompanionCareState;
  weather: WeatherSnapshot | null;
  weatherLoading: boolean;
  activeCareNudge: ActiveCareNudge | null;
  activeWakeUpAlarm: { time: string; label: string; escalationLevel: number } | null;
  latestEmpathySignal: EmpathySignal | null;
  mediaCreations: GeneratedMediaItem[];
  websiteCreations: GeneratedWebsiteItem[];
  isGeneratingMedia: boolean;
  generationLabel: string;
  generationProgress: number;
  activePersona: Persona;
  personas: Persona[];
  gwenState: GwenState;
  isConnected: boolean;
  isMicMuted: boolean;
  isPttPressed: boolean;
  isScreenSharing: boolean;
  screenPreviewUrl: string | null;
  uploadedScreenImage: string | null;
  isCameraActive: boolean;
  cameraPreviewUrl: string | null;
  faceRecognized: boolean;
  voiceRecognized: boolean;
  wakeLockActive: boolean;
  audioLevel: number;
  liveDraftInput: string;
  liveDraftOutput: string;
  transcript: TranscriptMessage[];
  calendarEvents: CalendarEventItem[];
  alarms: AlarmItem[];
  timers: TimerItem[];
  reminders: ReminderTaskItem[];
  pendingDrafts: PendingMessageDraft[];
  isTextSending: boolean;
  error: string | null;
  onDismissError: () => void;
  onStartVoice: () => void;
  onStopVoice: () => void;
  onSleepGwen: () => void;
  onWakeGwen: () => void;
  onInterruptGwen: () => void;
  onToggleMute: () => void;
  onPttStart: () => void;
  onPttEnd: () => void;
  onToggleScreenShare: () => void;
  onToggleCameraVision: () => void;
  onFlipCamera: () => void;
  onAttachScreenshot: (dataUrl: string) => void;
  onClearScreenshot: () => void;
  onToggleOverlay: () => void;
  onToggleAvatarMode: () => void;
  onChangePersona: (personaId: string) => void;
  onChangeVoiceMode: (mode: 'hands-free' | 'push-to-talk') => void;
  onToggleAutoSpeak: () => void;
  onSendText: (text: string) => void;
  onSpeakMessage: (text: string) => void;
  onClearTranscript: () => void;
  onUpdateDeviceState: (patch: Partial<DeviceSystemState>) => void;
  onDeleteCalendarEvent: (id: string) => void;
  onToggleAlarm: (id: string) => void;
  onDeleteAlarm: (id: string) => void;
  onToggleTimer: (id: string) => void;
  onDismissTimer: (id: string) => void;
  onToggleReminder: (id: string) => void;
  onDeleteReminder: (id: string) => void;
  onConfirmDraft: (draft: PendingMessageDraft) => void;
  onCancelDraft: (id: string) => void;
  onRefreshWeather: () => void;
  onLogWater: () => void;
  onUpdateCareState: (patch: Partial<CompanionCareState>) => void;
  onDismissCareNudge: () => void;
  onTriggerWakeUpNow: () => void;
  onSnoozeWakeUp: () => void;
  onDismissWakeUp: () => void;
  onGenerateImage: (prompt: string, aspectRatio: MediaAspectRatio, style: string) => void;
  onGenerateVideo: (prompt: string, aspectRatio: MediaAspectRatio, duration: number) => void;
  onBuildWebsite: (description: string, title?: string) => void;
  onOpenWebsitePreview: (site: GeneratedWebsiteItem) => void;
  onDeleteMedia: (id: string) => void;
  onDeleteWebsite: (id: string) => void;
  onNotify: (msg: string) => void;
}

const QUICK_PROMPTS = [
  'Who created you and why are you named Gwen?',
  "What's the weather like right now?",
  'Generate an image of a neon cyberpunk Tokyo skyline in 16:9',
  'Build a responsive coffee shop website',
];

export const CompanionView: React.FC<CompanionViewProps> = ({
  settings,
  deviceState,
  careState,
  weather,
  weatherLoading,
  activeCareNudge,
  activeWakeUpAlarm,
  latestEmpathySignal,
  mediaCreations,
  websiteCreations,
  isGeneratingMedia,
  generationLabel,
  generationProgress,
  activePersona,
  personas,
  gwenState,
  isConnected,
  isMicMuted,
  isPttPressed,
  isScreenSharing,
  screenPreviewUrl,
  uploadedScreenImage,
  isCameraActive,
  cameraPreviewUrl,
  faceRecognized,
  voiceRecognized,
  wakeLockActive,
  audioLevel,
  liveDraftInput,
  liveDraftOutput,
  transcript,
  calendarEvents,
  alarms,
  timers,
  reminders,
  pendingDrafts,
  isTextSending,
  error,
  onDismissError,
  onStartVoice,
  onStopVoice,
  onSleepGwen,
  onWakeGwen,
  onInterruptGwen,
  onToggleMute,
  onPttStart,
  onPttEnd,
  onToggleScreenShare,
  onToggleCameraVision,
  onFlipCamera,
  onAttachScreenshot,
  onClearScreenshot,
  onToggleOverlay,
  onToggleAvatarMode,
  onChangePersona,
  onChangeVoiceMode,
  onToggleAutoSpeak,
  onSendText,
  onSpeakMessage,
  onClearTranscript,
  onUpdateDeviceState,
  onDeleteCalendarEvent,
  onToggleAlarm,
  onDeleteAlarm,
  onToggleTimer,
  onDismissTimer,
  onToggleReminder,
  onDeleteReminder,
  onConfirmDraft,
  onCancelDraft,
  onRefreshWeather,
  onLogWater,
  onUpdateCareState,
  onDismissCareNudge,
  onTriggerWakeUpNow,
  onSnoozeWakeUp,
  onDismissWakeUp,
  onGenerateImage,
  onGenerateVideo,
  onBuildWebsite,
  onOpenWebsitePreview,
  onDeleteMedia,
  onDeleteWebsite,
  onNotify,
}) => {
  const [inputText, setInputText] = useState('');
  const [rightTab, setRightTab] = useState<'captions' | 'hub' | 'studio'>('captions');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [clockText, setClockText] = useState(() =>
    formatTimeInZone(new Date(), settings.timezone)
  );
  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Live IST clock updater
  useEffect(() => {
    const update = () => setClockText(formatTimeInZone(new Date(), settings.timezone));
    update();
    const id = window.setInterval(update, 15000);
    return () => window.clearInterval(id);
  }, [settings.timezone]);

  // Switch to Studio automatically when media/website rendering starts
  useEffect(() => {
    if (isGeneratingMedia) {
      setRightTab('studio');
    }
  }, [isGeneratingMedia]);

  useEffect(() => {
    if (rightTab === 'captions') {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript, liveDraftInput, liveDraftOutput, rightTab]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = inputText.trim();
    if (!cleaned || isTextSending) return;
    setInputText('');
    onSendText(cleaned);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onAttachScreenshot(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const stateHeadline =
    gwenState === 'dormant'
      ? 'Gwen is asleep'
      : gwenState === 'connecting'
        ? 'Connecting neural link...'
        : gwenState === 'speaking'
          ? 'Gwen is speaking'
          : gwenState === 'thinking'
            ? 'Gwen is thinking...'
            : gwenState === 'listening'
              ? settings.voiceInputMode === 'push-to-talk'
                ? isPttPressed
                  ? 'Listening — release when done'
                  : 'Hold avatar to speak'
                : isMicMuted
                  ? 'Microphone muted'
                  : 'Listening — interrupt anytime'
              : gwenState === 'error'
                ? 'Connection attention needed'
                : 'Tap Gwen to start talking';

  const languageLabel =
    settings.languageMode === 'auto'
      ? 'Auto-Detect (EN · HI · Hinglish)'
      : settings.languageMode === 'en'
        ? 'English'
        : settings.languageMode === 'hi'
          ? 'Hindi'
          : 'Hinglish';

  const activeHubItems =
    timers.length +
    calendarEvents.length +
    alarms.length +
    reminders.filter((r) => !r.completed).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
      {/* Live IST Clock, Greeting, Weather & Empathy Context Bar */}
      <div
        className="mb-4 rounded-2xl px-4 py-2.5 border flex flex-wrap items-center justify-between gap-3 text-xs"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium text-[var(--text-primary)]">
            {getGreetingForZone(settings.timezone)}
            {settings.deviceUserName ? `, ${settings.deviceUserName}` : ''}
          </span>
          <span className="font-mono-tabular text-[var(--accent)] flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            <span>{clockText}</span>
          </span>
          <button
            type="button"
            onClick={onRefreshWeather}
            className="flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            title="Refresh live local weather"
          >
            <CloudSun className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>
              {weatherLoading
                ? 'Checking weather...'
                : weather
                  ? `${weather.city}: ${Math.round(weather.temperatureC)}°C · ${weather.condition}`
                  : 'Tap for local weather'}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {latestEmpathySignal && (isConnected || isCameraActive) && (
            <span className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
              <HeartPulse className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Empathy: {latestEmpathySignal.condition}</span>
            </span>
          )}
          <button
            type="button"
            onClick={onLogWater}
            className="flex items-center gap-1 text-[11px] font-mono-tabular text-[var(--text-secondary)] hover:text-[var(--accent)] cursor-pointer"
            title="Log a glass of water"
          >
            <Droplets className="h-3.5 w-3.5 text-sky-400" />
            <span>
              {careState.waterGlassesToday}/{careState.waterGoalGlasses} water
            </span>
          </button>
        </div>
      </div>

      {/* Escalating Gentle Companion Wake-Up Alarm Banner */}
      {activeWakeUpAlarm && (
        <div
          role="alert"
          className="mb-4 rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--accent-soft)',
            borderColor: 'var(--accent)',
          }}
        >
          <div className="flex items-start gap-3">
            <AlarmClock className="h-5 w-5 text-[var(--accent)] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Time to wake up{settings.deviceUserName ? `, ${settings.deviceUserName}` : ''}! ({activeWakeUpAlarm.time} IST)
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {activeWakeUpAlarm.label} · Gentle escalation level {activeWakeUpAlarm.escalationLevel}/5
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onSnoozeWakeUp}
              className="min-h-[40px] px-3.5 rounded-xl text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] cursor-pointer whitespace-nowrap"
            >
              Snooze 5m
            </button>
            <button
              type="button"
              onClick={onDismissWakeUp}
              className="min-h-[40px] px-4 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              I&apos;m Awake
            </button>
          </div>
        </div>
      )}

      {/* Companion Daily Care Nudge Banner (Water / Rest Break) */}
      {activeCareNudge && (
        <div
          className="mb-4 rounded-2xl p-3.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--accent-ring)',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Droplets className="h-4 w-4 text-[var(--accent)] shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                {activeCareNudge.title}
              </p>
              <p className="text-xs text-[var(--text-secondary)] truncate">
                {activeCareNudge.message}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {activeCareNudge.kind === 'water' && (
              <button
                type="button"
                onClick={onLogWater}
                className="min-h-[36px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
              >
                Drank Water (+1)
              </button>
            )}
            <button
              type="button"
              onClick={onDismissCareNudge}
              className="min-h-[36px] px-3 rounded-xl text-xs font-medium bg-[var(--bg-elevated)] text-[var(--text-secondary)] cursor-pointer whitespace-nowrap"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start justify-between gap-3 rounded-2xl px-4 py-3 text-sm border"
          style={{
            backgroundColor: 'var(--danger-soft)',
            borderColor: 'var(--danger)',
            color: 'var(--text-primary)',
          }}
        >
          <p className="leading-relaxed">{error}</p>
          <button
            type="button"
            onClick={onDismissError}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-black/10 shrink-0 cursor-pointer"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Pending WhatsApp / Messenger Confirmation Banner */}
      {pendingDrafts.length > 0 && (
        <div className="mb-4 space-y-2">
          {pendingDrafts.map((draft) => (
            <div
              key={draft.id}
              className="rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--accent)',
              }}
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--accent)]">
                  Confirm {draft.platform} Message to {draft.recipient}
                </p>
                <p className="mt-1 text-sm text-[var(--text-primary)]">
                  &ldquo;{draft.message}&rdquo;
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onCancelDraft(draft.id)}
                  className="min-h-[40px] px-3.5 rounded-xl text-xs font-medium bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onConfirmDraft(draft)}
                  className="min-h-[40px] px-4 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-contrast)',
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Confirm &amp; Send</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Futuristic 3D Avatar HUD Stage */}
        <section
          aria-label="Futuristic Companion HUD"
          className="lg:col-span-6 flex flex-col justify-between rounded-3xl p-5 sm:p-6 border relative overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-hairline)',
          }}
        >
          {/* Top HUD Bar: Persona, Visual Mode & Voice Input */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <label htmlFor="companion-persona-select" className="sr-only">
                Active Persona
              </label>
              <select
                id="companion-persona-select"
                value={activePersona.id}
                onChange={(e) => onChangePersona(e.target.value)}
                className="h-10 max-w-[195px] rounded-xl px-3 text-xs sm:text-sm font-medium bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)] cursor-pointer truncate"
              >
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={onToggleAvatarMode}
                title="Switch between 3D Talking Avatar and 2D Acoustic Orb"
                className="h-10 px-3 rounded-xl text-xs font-medium bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)] whitespace-nowrap shrink-0 cursor-pointer"
              >
                {settings.avatarMode === '3d' ? '3D Avatar' : '2D Orb'}
              </button>
            </div>

            <div
              className="flex items-center p-1 rounded-xl border"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-hairline)',
              }}
              role="group"
              aria-label="Voice input mode"
            >
              <button
                type="button"
                onClick={() => onChangeVoiceMode('hands-free')}
                className={`h-8 px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  settings.voiceInputMode === 'hands-free'
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Hands-Free
              </button>
              <button
                type="button"
                onClick={() => onChangeVoiceMode('push-to-talk')}
                className={`h-8 px-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  settings.voiceInputMode === 'push-to-talk'
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Push-to-Talk
              </button>
            </div>
          </div>

          {/* Centerpiece: 3D AI Talking Avatar OR 2D Reactive Voice Orb */}
          <div className="my-4 sm:my-5 flex flex-col items-center text-center">
            {settings.avatarMode === '3d' ? (
              <GwenAvatar3D
                state={gwenState}
                audioLevel={audioLevel}
                personaId={activePersona.id}
                themeId={settings.themeId}
                customAccent={settings.customAccent}
                isPushToTalk={settings.voiceInputMode === 'push-to-talk'}
                isPttActive={isPttPressed}
                onPrimaryClick={() => {
                  if (gwenState === 'dormant') {
                    onWakeGwen();
                  } else if (isConnected) {
                    if (gwenState === 'speaking') {
                      onInterruptGwen();
                    } else {
                      onStopVoice();
                    }
                  } else {
                    onStartVoice();
                  }
                }}
                onPttStart={onPttStart}
                onPttEnd={onPttEnd}
              />
            ) : (
              <VoiceOrb
                state={gwenState}
                audioLevel={audioLevel}
                themeId={settings.themeId}
                customAccent={settings.customAccent}
                size={244}
                isPushToTalk={settings.voiceInputMode === 'push-to-talk'}
                isPttActive={isPttPressed}
                onPrimaryClick={() => {
                  if (gwenState === 'dormant') {
                    onWakeGwen();
                  } else if (isConnected) {
                    if (gwenState === 'speaking') {
                      onInterruptGwen();
                    } else {
                      onStopVoice();
                    }
                  } else {
                    onStartVoice();
                  }
                }}
                onPttStart={onPttStart}
                onPttEnd={onPttEnd}
              />
            )}

            <h1 className="mt-3 font-display text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)] text-balance">
              {stateHeadline}
            </h1>

            {/* Clean Unboxed Status Metadata */}
            <div className="mt-1.5 text-xs text-[var(--text-secondary)] flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <span>{settings.voiceName} voice</span>
              <span aria-hidden="true">·</span>
              <span>{languageLabel}</span>
              {wakeLockActive && gwenState !== 'dormant' && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[var(--accent)]">Always-Active Lock</span>
                </>
              )}
              {faceRecognized && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[var(--success)]">Face Recognized</span>
                </>
              )}
              {voiceRecognized && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[var(--success)]">Voice Recognized</span>
                </>
              )}
              {settings.incognitoMode && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-[var(--warning)]">
                    <EyeOff className="h-3.5 w-3.5" />
                    Incognito
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Unified Bottom Control Dock */}
          <div className="space-y-2.5">
            {gwenState === 'dormant' ? (
              <button
                type="button"
                onClick={onWakeGwen}
                className="w-full min-h-[48px] px-4 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-contrast)',
                }}
              >
                <Power className="h-4 w-4" />
                <span>Wake Gwen</span>
              </button>
            ) : (
              <>
                {/* Primary Row: Call / Interrupt / Mute + Sleep */}
                <div className="grid grid-cols-3 gap-2">
                  {!isConnected ? (
                    <button
                      type="button"
                      onClick={onStartVoice}
                      disabled={gwenState === 'connecting'}
                      className="col-span-2 min-h-[46px] px-4 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60 whitespace-nowrap cursor-pointer"
                      style={{
                        backgroundColor: 'var(--accent)',
                        color: 'var(--accent-contrast)',
                      }}
                    >
                      <Mic className="h-4 w-4" />
                      <span>
                        {gwenState === 'connecting' ? 'Connecting...' : 'Start Live Call'}
                      </span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={gwenState === 'speaking' ? onInterruptGwen : onToggleMute}
                        className="min-h-[46px] px-3 rounded-2xl text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 border transition-colors whitespace-nowrap cursor-pointer"
                        style={{
                          backgroundColor:
                            gwenState === 'speaking'
                              ? 'var(--accent-soft)'
                              : isMicMuted
                                ? 'var(--warning-soft)'
                                : 'var(--bg-elevated)',
                          borderColor:
                            gwenState === 'speaking'
                              ? 'var(--accent)'
                              : 'var(--border-hairline)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {gwenState === 'speaking' ? (
                          <>
                            <Hand className="h-4 w-4" />
                            <span>Interrupt</span>
                          </>
                        ) : isMicMuted ? (
                          <>
                            <MicOff className="h-4 w-4" />
                            <span>Unmute</span>
                          </>
                        ) : (
                          <>
                            <Mic className="h-4 w-4" />
                            <span>Mute</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={onStopVoice}
                        className="min-h-[46px] px-3 rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90 whitespace-nowrap cursor-pointer"
                        style={{
                          backgroundColor: 'var(--danger)',
                          color: '#ffffff',
                        }}
                      >
                        <PhoneOff className="h-4 w-4" />
                        <span>End</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={onSleepGwen}
                    title='Sleep & Log Off ("Gwen, go to sleep")'
                    className="min-h-[46px] px-3 rounded-2xl text-xs sm:text-sm font-medium flex items-center justify-center gap-1.5 border bg-[var(--bg-elevated)] border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] whitespace-nowrap cursor-pointer"
                  >
                    <Moon className="h-4 w-4" />
                    <span>Sleep</span>
                  </button>
                </div>

                {/* Secondary Row: Camera Vision, Screen Share, Float Avatar */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={onToggleCameraVision}
                    className="min-h-[44px] px-2.5 rounded-2xl text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors whitespace-nowrap cursor-pointer"
                    style={{
                      backgroundColor: isCameraActive ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                      borderColor: isCameraActive ? 'var(--accent)' : 'var(--border-hairline)',
                      color: isCameraActive ? 'var(--accent)' : 'var(--text-primary)',
                    }}
                  >
                    {isCameraActive ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                    <span>{isCameraActive ? 'Camera On' : 'Camera'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onToggleScreenShare}
                    className="min-h-[44px] px-2.5 rounded-2xl text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors whitespace-nowrap cursor-pointer"
                    style={{
                      backgroundColor: isScreenSharing ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                      borderColor: isScreenSharing ? 'var(--accent)' : 'var(--border-hairline)',
                      color: isScreenSharing ? 'var(--accent)' : 'var(--text-primary)',
                    }}
                  >
                    {isScreenSharing ? (
                      <MonitorOff className="h-4 w-4" />
                    ) : (
                      <Monitor className="h-4 w-4" />
                    )}
                    <span>{isScreenSharing ? 'Screen On' : 'Screen'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onToggleOverlay}
                    className="min-h-[44px] px-2.5 rounded-2xl text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors whitespace-nowrap cursor-pointer"
                    style={{
                      backgroundColor: settings.overlayEnabled
                        ? 'var(--accent-soft)'
                        : 'var(--bg-elevated)',
                      borderColor: settings.overlayEnabled
                        ? 'var(--accent)'
                        : 'var(--border-hairline)',
                      color: settings.overlayEnabled ? 'var(--accent)' : 'var(--text-primary)',
                    }}
                  >
                    <Layers className="h-4 w-4" />
                    <span>{settings.overlayEnabled ? 'Overlay On' : 'Overlay'}</span>
                  </button>
                </div>
              </>
            )}

            <div className="pt-2 flex items-center justify-between text-xs text-[var(--text-muted)] border-t border-[var(--border-hairline)]">
              <span>Gwen · Developed by Syed Farhan</span>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen((v) => !v)}
                className="lg:hidden font-medium text-[var(--accent)] min-h-[36px] px-2 cursor-pointer"
              >
                {mobileDrawerOpen ? 'Hide Panel' : `Captions & Hub (${transcript.length})`}
              </button>
            </div>
          </div>
        </section>

        {/* Right Column: Live Captions & Device Control Hub */}
        <section
          aria-label="Live Captions and Device Hub"
          className={`lg:col-span-6 flex flex-col rounded-3xl border overflow-hidden ${
            mobileDrawerOpen ? 'flex' : 'hidden lg:flex'
          }`}
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-hairline)',
            minHeight: '540px',
            maxHeight: '78vh',
          }}
        >
          {/* Header with Captions | Device Hub Switch */}
          <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-[var(--border-hairline)]">
            <div
              className="flex items-center p-1 rounded-xl border"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--border-hairline)',
              }}
            >
              <button
                type="button"
                onClick={() => setRightTab('captions')}
                className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  rightTab === 'captions'
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Captions
              </button>
              <button
                type="button"
                onClick={() => setRightTab('hub')}
                className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                  rightTab === 'hub'
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>Hub{activeHubItems > 0 ? ` (${activeHubItems})` : ''}</span>
              </button>
              <button
                type="button"
                onClick={() => setRightTab('studio')}
                className={`h-8 px-2.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer ${
                  rightTab === 'studio'
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>
                  Studio
                  {mediaCreations.length + websiteCreations.length > 0
                    ? ` (${mediaCreations.length + websiteCreations.length})`
                    : ''}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleAutoSpeak}
                title={
                  settings.autoSpeakTextReplies
                    ? 'Auto-speak text replies enabled'
                    : 'Auto-speak text replies off'
                }
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border transition-colors cursor-pointer"
                style={{
                  backgroundColor: settings.autoSpeakTextReplies
                    ? 'var(--accent-soft)'
                    : 'var(--bg-elevated)',
                  borderColor: settings.autoSpeakTextReplies
                    ? 'var(--accent)'
                    : 'var(--border-hairline)',
                  color: settings.autoSpeakTextReplies
                    ? 'var(--accent)'
                    : 'var(--text-secondary)',
                }}
                aria-label="Toggle auto speak text replies"
              >
                {settings.autoSpeakTextReplies ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach screenshot for Gwen to inspect"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border bg-[var(--bg-elevated)] border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                aria-label="Attach screenshot"
              >
                <ImagePlus className="h-4 w-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {transcript.length > 0 && rightTab === 'captions' && (
                <button
                  type="button"
                  onClick={onClearTranscript}
                  title="Clear conversation log"
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border bg-[var(--bg-elevated)] border-[var(--border-hairline)] text-[var(--text-secondary)] hover:text-[var(--danger)] transition-colors cursor-pointer"
                  aria-label="Clear captions"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Live Camera Vision & Screen Share Active Previews */}
          {(cameraPreviewUrl || screenPreviewUrl) && (
            <div
              className="px-5 py-3 border-b border-[var(--border-hairline)] space-y-2.5"
              style={{ backgroundColor: 'var(--bg-elevated)' }}
            >
              {cameraPreviewUrl && (
                <div className="flex items-center gap-3">
                  <img
                    src={cameraPreviewUrl}
                    alt="Live camera vision preview"
                    className="h-14 w-20 rounded-lg object-cover border border-[var(--accent)] shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      Camera Vision Active ({settings.cameraFacingMode === 'user' ? 'Front' : 'Rear'})
                    </p>
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      {faceRecognized
                        ? 'Recognized enrolled face profile · Streaming 1 FPS'
                        : 'Streaming 1 FPS visual context to Gwen'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onFlipCamera}
                    title="Switch Front / Rear Camera"
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] hover:border-[var(--accent)] cursor-pointer"
                    aria-label="Switch camera facing mode"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onToggleCameraVision}
                    className="min-h-[36px] px-3 rounded-lg text-xs font-medium bg-[var(--bg-surface)] text-[var(--danger)] border border-[var(--border-hairline)] whitespace-nowrap cursor-pointer"
                  >
                    Off
                  </button>
                </div>
              )}

              {screenPreviewUrl && (
                <div className="flex items-center gap-3">
                  <img
                    src={screenPreviewUrl}
                    alt="Shared screen context preview"
                    className="h-14 w-20 rounded-lg object-cover border border-[var(--border-strong)] shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {isScreenSharing
                        ? 'Live Screen Share Active (1 FPS)'
                        : 'Screenshot Attached to Context'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      Ask Gwen to explain, translate, or draft a reply.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={isScreenSharing ? onToggleScreenShare : onClearScreenshot}
                    className="min-h-[36px] px-3 rounded-lg text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] hover:text-[var(--danger)] whitespace-nowrap cursor-pointer"
                  >
                    {isScreenSharing ? 'Stop' : 'Remove'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab Body: Captions OR Device Hub */}
          {rightTab === 'captions' ? (
            <>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {transcript.length === 0 && !liveDraftInput && !liveDraftOutput ? (
                  <div className="h-full flex flex-col justify-center py-6">
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      Gwen is ready whenever you are.
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed max-w-md">
                      Talk 1-on-1 with the 3D Avatar, enable Camera Vision or Screen Share, control device settings, or try a command below.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {QUICK_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => onSendText(prompt)}
                          className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-medium text-left border transition-colors hover:border-[var(--accent)] cursor-pointer"
                          style={{
                            backgroundColor: 'var(--bg-elevated)',
                            borderColor: 'var(--border-hairline)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {transcript.map((msg) => {
                      const timeStr = formatTimeInZone(msg.timestamp, settings.timezone);

                      if (msg.role === 'action') {
                        return (
                          <div
                            key={msg.id}
                            className="text-xs text-[var(--text-secondary)] py-2 border-y border-[var(--border-hairline)] flex items-center justify-between gap-3"
                          >
                            <span>
                              <strong className="font-medium text-[var(--accent)]">Action</strong> ·{' '}
                              {msg.text}
                            </span>
                            <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] shrink-0">
                              {timeStr}
                            </span>
                          </div>
                        );
                      }

                      const isUser = msg.role === 'user';
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className="max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
                            style={{
                              backgroundColor: isUser ? 'var(--accent)' : 'var(--bg-elevated)',
                              color: isUser ? 'var(--accent-contrast)' : 'var(--text-primary)',
                            }}
                          >
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-muted)] px-1">
                            <span>{isUser ? 'You' : 'Gwen'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-tabular">{timeStr}</span>
                            {msg.hasCameraContext && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Camera vision</span>
                              </>
                            )}
                            {msg.hasScreenContext && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Screen aware</span>
                              </>
                            )}
                            {!isUser && (
                              <button
                                type="button"
                                onClick={() => onSpeakMessage(msg.text)}
                                className="ml-1 text-[var(--accent)] hover:underline cursor-pointer"
                              >
                                Listen
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {liveDraftInput && (
                      <div className="flex flex-col items-end opacity-80">
                        <div
                          className="max-w-[88%] rounded-2xl px-4 py-2.5 text-sm"
                          style={{
                            backgroundColor: 'var(--accent-soft)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {liveDraftInput}
                        </div>
                        <span className="mt-1 text-[11px] text-[var(--text-muted)]">
                          You · Speaking
                        </span>
                      </div>
                    )}

                    {liveDraftOutput && (
                      <div className="flex flex-col items-start">
                        <div
                          className="max-w-[88%] rounded-2xl px-4 py-2.5 text-sm border"
                          style={{
                            backgroundColor: 'var(--bg-elevated)',
                            borderColor: 'var(--accent)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {liveDraftOutput}
                        </div>
                        <span className="mt-1 text-[11px] text-[var(--accent)]">
                          Gwen · Speaking live
                        </span>
                      </div>
                    )}

                    {isTextSending && (
                      <div className="text-xs text-[var(--text-muted)] py-1">
                        Gwen is composing a reply...
                      </div>
                    )}
                  </>
                )}
                <div ref={feedEndRef} />
              </div>

              <form
                onSubmit={handleSubmit}
                className="p-3.5 border-t border-[var(--border-hairline)] flex items-center gap-2"
                style={{ backgroundColor: 'var(--bg-surface)' }}
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    isCameraActive
                      ? 'Ask Gwen what she sees or run a command...'
                      : uploadedScreenImage || isScreenSharing
                        ? 'Ask Gwen about your screen or run a command...'
                        : 'Message Gwen or speak/type a device command...'
                  }
                  className="flex-1 h-12 rounded-2xl px-4 text-sm bg-[var(--bg-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent)]"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim() || isTextSending}
                  className="h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center transition-opacity hover:opacity-90 disabled:opacity-45 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-contrast)',
                  }}
                  aria-label="Send message to Gwen"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </>
          ) : rightTab === 'studio' ? (
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <StudioPanel
                mediaCreations={mediaCreations}
                websiteCreations={websiteCreations}
                isGeneratingMedia={isGeneratingMedia}
                generationLabel={generationLabel}
                generationProgress={generationProgress}
                onGenerateImage={onGenerateImage}
                onGenerateVideo={onGenerateVideo}
                onBuildWebsite={onBuildWebsite}
                onOpenWebsitePreview={onOpenWebsitePreview}
                onDeleteMedia={onDeleteMedia}
                onDeleteWebsite={onDeleteWebsite}
                onNotify={onNotify}
              />
            </div>
          ) : (
            /* Device Control, Weather & Companion Care Hub Tab */
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Live Weather & True Companion Care Engine */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                    Daily Companion Care &amp; Weather (IST)
                  </h3>
                  <button
                    type="button"
                    onClick={onRefreshWeather}
                    className="text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
                  >
                    {weatherLoading ? 'Refreshing...' : 'Refresh Weather'}
                  </button>
                </div>

                {weather && (
                  <div className="rounded-2xl p-3.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-primary)]">
                        {weather.city}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        {weather.condition} · Feels like {Math.round(weather.feelsLikeC)}°C · Rain {weather.rainChance}%
                      </p>
                    </div>
                    <span className="font-mono-tabular text-xl font-bold text-[var(--accent)]">
                      {Math.round(weather.temperatureC)}°C
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Hydration Tracker */}
                  <div className="rounded-2xl p-3.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                        <Droplets className="h-3.5 w-3.5 text-sky-400" />
                        Hydration
                      </span>
                      <span className="font-mono-tabular text-[var(--accent)]">
                        {careState.waterGlassesToday}/{careState.waterGoalGlasses} glasses
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${Math.min(100, (careState.waterGlassesToday / Math.max(1, careState.waterGoalGlasses)) * 100)}%`,
                          backgroundColor: '#38bdf8',
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={onLogWater}
                        className="h-8 px-3 rounded-lg text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                        style={{
                          backgroundColor: 'var(--accent)',
                          color: 'var(--accent-contrast)',
                        }}
                      >
                        +1 Glass
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateCareState({
                            waterReminderEnabled: !careState.waterReminderEnabled,
                          })
                        }
                        className="h-8 px-2.5 rounded-lg border text-[11px] text-[var(--text-secondary)] cursor-pointer whitespace-nowrap"
                        style={{ borderColor: 'var(--border-hairline)' }}
                      >
                        Remind: {careState.waterReminderEnabled ? 'On' : 'Off'}
                      </button>
                    </div>
                  </div>

                  {/* Escalating IST Wake-Up & Rest Card */}
                  <div className="rounded-2xl p-3.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                        <AlarmClock className="h-3.5 w-3.5 text-[var(--accent)]" />
                        IST Wake-Up
                      </span>
                      <input
                        type="time"
                        value={careState.wakeUpTimeIST}
                        onChange={(e) =>
                          onUpdateCareState({
                            wakeUpTimeIST: e.target.value,
                            wakeUpEnabled: true,
                          })
                        }
                        className="h-7 px-2 rounded-lg text-[11px] font-mono-tabular bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)]"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateCareState({ wakeUpEnabled: !careState.wakeUpEnabled })
                        }
                        className="h-8 px-2.5 rounded-lg border text-[11px] font-medium cursor-pointer whitespace-nowrap"
                        style={{
                          borderColor: careState.wakeUpEnabled
                            ? 'var(--accent)'
                            : 'var(--border-hairline)',
                          color: careState.wakeUpEnabled
                            ? 'var(--accent)'
                            : 'var(--text-secondary)',
                        }}
                      >
                        {careState.wakeUpEnabled ? 'Armed (IST)' : 'Off'}
                      </button>
                      <button
                        type="button"
                        onClick={onTriggerWakeUpNow}
                        className="h-8 px-2.5 rounded-lg border text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                        style={{ borderColor: 'var(--border-hairline)' }}
                      >
                        Test Wake-Up
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* System Settings Sliders & Toggles */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                  Hands-Free System Settings
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl p-3.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-[var(--text-primary)] font-medium">
                        <Sun className="h-3.5 w-3.5 text-[var(--accent)]" />
                        Brightness
                      </span>
                      <span className="font-mono-tabular text-[var(--text-secondary)]">
                        {deviceState.brightness}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={deviceState.brightness}
                      onChange={(e) =>
                        onUpdateDeviceState({ brightness: Number(e.target.value) })
                      }
                      className="w-full accent-[var(--accent)] cursor-pointer"
                    />
                  </div>

                  <div className="rounded-2xl p-3.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-[var(--text-primary)] font-medium">
                        <Volume2 className="h-3.5 w-3.5 text-[var(--accent)]" />
                        Media Volume
                      </span>
                      <span className="font-mono-tabular text-[var(--text-secondary)]">
                        {deviceState.mediaVolume}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={deviceState.mediaVolume}
                      onChange={(e) =>
                        onUpdateDeviceState({ mediaVolume: Number(e.target.value) })
                      }
                      className="w-full accent-[var(--accent)] cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    {
                      label: 'DND',
                      active: deviceState.doNotDisturb,
                      icon: deviceState.doNotDisturb ? (
                        <BellOff className="h-3.5 w-3.5" />
                      ) : (
                        <Bell className="h-3.5 w-3.5" />
                      ),
                      toggle: () =>
                        onUpdateDeviceState({ doNotDisturb: !deviceState.doNotDisturb }),
                    },
                    {
                      label: 'Torch',
                      active: deviceState.flashlight,
                      icon: <Flashlight className="h-3.5 w-3.5" />,
                      toggle: () =>
                        onUpdateDeviceState({ flashlight: !deviceState.flashlight }),
                    },
                    {
                      label: 'Wi-Fi',
                      active: deviceState.wifi,
                      icon: <Wifi className="h-3.5 w-3.5" />,
                      toggle: () => onUpdateDeviceState({ wifi: !deviceState.wifi }),
                    },
                    {
                      label: 'BT',
                      active: deviceState.bluetooth,
                      icon: <Bluetooth className="h-3.5 w-3.5" />,
                      toggle: () =>
                        onUpdateDeviceState({ bluetooth: !deviceState.bluetooth }),
                    },
                    {
                      label: 'Saver',
                      active: deviceState.batterySaver,
                      icon: <Zap className="h-3.5 w-3.5" />,
                      toggle: () =>
                        onUpdateDeviceState({ batterySaver: !deviceState.batterySaver }),
                    },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={item.toggle}
                      className="min-h-[42px] px-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors whitespace-nowrap cursor-pointer"
                      style={{
                        backgroundColor: item.active
                          ? 'var(--accent-soft)'
                          : 'var(--bg-elevated)',
                        borderColor: item.active
                          ? 'var(--accent)'
                          : 'var(--border-hairline)',
                        color: item.active ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Timers & Alarms */}
              {(timers.length > 0 || alarms.length > 0) && (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                    Timers &amp; Alarms
                  </h3>
                  {timers.map((timer) => (
                    <div
                      key={timer.id}
                      className="rounded-2xl p-3.5 bg-[var(--bg-elevated)] border flex items-center justify-between gap-3"
                      style={{
                        borderColor: timer.completed
                          ? 'var(--accent)'
                          : 'var(--border-hairline)',
                      }}
                    >
                      <div>
                        <p className="text-xs text-[var(--text-muted)]">{timer.label}</p>
                        <p className="font-mono-tabular text-lg font-semibold text-[var(--text-primary)]">
                          {timer.completed ? 'Done!' : formatCountdown(timer.remainingSeconds)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {!timer.completed && (
                          <button
                            type="button"
                            onClick={() => onToggleTimer(timer.id)}
                            className="h-9 w-9 flex items-center justify-center rounded-xl bg-[var(--bg-surface)] text-[var(--text-primary)] cursor-pointer"
                            aria-label={timer.running ? 'Pause timer' : 'Resume timer'}
                          >
                            {timer.running ? (
                              <Pause className="h-3.5 w-3.5" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDismissTimer(timer.id)}
                          className="h-9 w-9 flex items-center justify-center rounded-xl bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer"
                          aria-label="Dismiss timer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {alarms.map((alarm) => (
                    <div
                      key={alarm.id}
                      className="rounded-2xl p-3.5 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5">
                        <Clock className="h-4 w-4 text-[var(--accent)]" />
                        <div>
                          <p className="font-mono-tabular text-sm font-semibold text-[var(--text-primary)]">
                            {alarm.time}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">{alarm.label}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onToggleAlarm(alarm.id)}
                          className="h-9 px-3 rounded-xl text-xs font-semibold cursor-pointer"
                          style={{
                            backgroundColor: alarm.enabled
                              ? 'var(--accent-soft)'
                              : 'var(--bg-surface)',
                            color: alarm.enabled
                              ? 'var(--accent)'
                              : 'var(--text-muted)',
                          }}
                        >
                          {alarm.enabled ? 'On' : 'Off'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteAlarm(alarm.id)}
                          className="h-9 w-9 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer"
                          aria-label="Delete alarm"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Calendar Events */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                    Calendar Events
                  </h3>
                  <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                    {calendarEvents.length}
                  </span>
                </div>
                {calendarEvents.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    Say &ldquo;Schedule dentist tomorrow at 3 PM&rdquo; to add an event.
                  </p>
                ) : (
                  calendarEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-2xl p-3 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Calendar className="h-4 w-4 text-[var(--accent)] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {ev.title}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] truncate">
                            {ev.dateTime}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteCalendarEvent(ev.id)}
                        className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer"
                        aria-label="Delete event"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Reminders & Tasks */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                    Reminders &amp; Tasks
                  </h3>
                  <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                    {reminders.filter((r) => !r.completed).length} open
                  </span>
                </div>
                {reminders.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    Say &ldquo;Add a reminder to drink water at 6 PM&rdquo; to create tasks.
                  </p>
                ) : (
                  reminders.map((rem) => (
                    <div
                      key={rem.id}
                      className="rounded-2xl p-3 bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-center justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleReminder(rem.id)}
                        className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                      >
                        {rem.completed ? (
                          <CheckSquare className="h-4 w-4 text-[var(--accent)] shrink-0" />
                        ) : (
                          <Square className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p
                            className={`text-sm truncate ${
                              rem.completed
                                ? 'line-through text-[var(--text-muted)]'
                                : 'text-[var(--text-primary)]'
                            }`}
                          >
                            {rem.title}
                          </p>
                          {rem.dueText && (
                            <p className="text-xs text-[var(--text-muted)]">{rem.dueText}</p>
                          )}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteReminder(rem.id)}
                        className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer"
                        aria-label="Delete reminder"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
