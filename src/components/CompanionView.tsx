import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  Bell,
  BellOff,
  Bluetooth,
  Calendar,
  Camera,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  Droplets,
  Flashlight,
  Hand,
  ImagePlus,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Moon,
  Pause,
  PhoneOff,
  Play,
  Radio,
  RefreshCw,
  Send,
  Sliders,
  Sparkles,
  Square,
  Sun,
  Trash2,
  VideoOff,
  Volume2,
  VolumeX,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import type { VoiceTransportMode } from '../hooks/useGwenLive';
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
  VoiceInputMode,
  WeatherSnapshot,
} from '../types/gwen';
import { formatTimeInZone } from '../utils/timeIst';
import { GwenAvatar3D } from './GwenAvatar3D';
import { InstallAppButton } from './InstallAppBanner';
import { StudioPanel } from './StudioPanel';
import { VoiceOrb } from './VoiceOrb';

interface CompanionViewProps {
  settings: GwenSettings;
  deviceState: DeviceSystemState;
  careState: CompanionCareState;
  weather: WeatherSnapshot | null;
  weatherLoading: boolean;
  activeCareNudge: ActiveCareNudge | null;
  activeWakeUpAlarm: {
    time: string;
    label: string;
    escalationLevel: number;
  } | null;
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
  voiceTransportMode: VoiceTransportMode;
  activeLiveModel: string | null;
  isMicTesting: boolean;
  micTestTranscript: string;
  isMicMuted: boolean;
  isPttPressed: boolean;
  isScreenSharing: boolean;
  screenPreviewUrl: string | null;
  uploadedScreenImage: string | null;
  isCameraActive: boolean;
  cameraPreviewUrl: string | null;
  faceRecognized: boolean;
  voiceRecognized?: boolean;
  wakeLockActive?: boolean;
  audioLevel: number;
  transcript: TranscriptMessage[];
  liveDraftInput: string;
  liveDraftOutput: string;
  error: string | null;
  isTextSending: boolean;
  timers: TimerItem[];
  alarms: AlarmItem[];
  calendarEvents: CalendarEventItem[];
  reminders: ReminderTaskItem[];
  pendingDrafts: PendingMessageDraft[];
  activeStudentName?: string | null;
  // PWA install props for slim 48px mobile top bar
  isInstallable?: boolean;
  isInstalled?: boolean;
  isIOS?: boolean;
  isAndroid?: boolean;
  onPromptInstall?: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  onStartVoice: () => void;
  onRetryLiveVoice: () => void;
  onToggleMicTest: () => void;
  onStopVoice: () => void;
  onToggleMute: () => void;
  onInterruptGwen: () => void;
  onPttStart: () => void;
  onPttEnd: () => void;
  onToggleScreenShare: () => void;
  onToggleCameraVision: () => void;
  onFlipCamera: () => void;
  onAttachScreenshot: (dataUrl: string) => void;
  onClearScreenshot: () => void;
  onToggleOverlay: () => void;
  onToggleAvatarMode: () => void;
  onChangePersona: (id: string) => void;
  onChangeVoiceMode: (mode: VoiceInputMode) => void;
  onToggleAutoSpeak: () => void;
  onSendText: (text: string) => void;
  onSpeakMessage: (text: string) => void;
  onClearTranscript: () => void;
  onSleepGwen: () => void;
  onWakeGwen: () => void;
  onUpdateDeviceState: (patch: Partial<DeviceSystemState>) => void;
  onUpdateCareState: (patch: Partial<CompanionCareState>) => void;
  onLogWater: () => void;
  onRefreshWeather: () => void;
  onDismissCareNudge: () => void;
  onSnoozeWakeUp: () => void;
  onDismissWakeUp: () => void;
  onTriggerWakeUpNow: () => void;
  onGenerateImage: (prompt: string, aspectRatio: MediaAspectRatio, style: string) => void;
  onGenerateVideo: (prompt: string, aspectRatio: MediaAspectRatio, duration: number) => void;
  onBuildWebsite: (description: string, title?: string) => void;
  onOpenWebsitePreview: (site: GeneratedWebsiteItem) => void;
  onDeleteMedia: (id: string) => void;
  onDeleteWebsite: (id: string) => void;
  onNotify: (msg: string) => void;
  onToggleTimer: (id: string) => void;
  onDismissTimer: (id: string) => void;
  onToggleAlarm: (id: string) => void;
  onDeleteAlarm: (id: string) => void;
  onDeleteCalendarEvent: (id: string) => void;
  onToggleReminder: (id: string) => void;
  onDeleteReminder: (id: string) => void;
  onConfirmDraft: (draft: PendingMessageDraft) => void;
  onCancelDraft: (id: string) => void;
  onDismissError: () => void;
  onOpenApiKeySettings: () => void;
}

const QUICK_PROMPTS = [
  'Check my unread Gmail messages',
  "What's on my Google Calendar?",
  'Switch to Home Teacher mode',
  'Search Google for latest AI news',
  'Generate a glowing cyber-forest wallpaper',
  'Remind me to drink water at 6 PM',
];

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

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
  voiceTransportMode,
  isMicTesting,
  micTestTranscript,
  isMicMuted,
  isPttPressed,
  isScreenSharing,
  screenPreviewUrl,
  uploadedScreenImage,
  isCameraActive,
  cameraPreviewUrl,
  faceRecognized,
  audioLevel,
  transcript,
  liveDraftInput,
  liveDraftOutput,
  error,
  isTextSending,
  timers,
  alarms,
  calendarEvents,
  reminders,
  pendingDrafts,
  activeStudentName,
  isInstallable = false,
  isInstalled = false,
  isIOS = false,
  isAndroid = false,
  onPromptInstall,
  onStartVoice,
  onRetryLiveVoice,
  onToggleMicTest,
  onStopVoice,
  onToggleMute,
  onInterruptGwen,
  onPttStart,
  onPttEnd,
  onToggleScreenShare,
  onToggleCameraVision,
  onFlipCamera,
  onAttachScreenshot,
  onClearScreenshot,
  onToggleAvatarMode,
  onChangePersona,
  onChangeVoiceMode,
  onToggleAutoSpeak,
  onSendText,
  onSpeakMessage,
  onClearTranscript,
  onSleepGwen,
  onWakeGwen,
  onUpdateDeviceState,
  onUpdateCareState,
  onLogWater,
  onRefreshWeather,
  onDismissCareNudge,
  onSnoozeWakeUp,
  onDismissWakeUp,
  onTriggerWakeUpNow,
  onGenerateImage,
  onGenerateVideo,
  onBuildWebsite,
  onOpenWebsitePreview,
  onDeleteMedia,
  onDeleteWebsite,
  onNotify,
  onToggleTimer,
  onDismissTimer,
  onToggleAlarm,
  onDeleteAlarm,
  onDeleteCalendarEvent,
  onToggleReminder,
  onDeleteReminder,
  onConfirmDraft,
  onCancelDraft,
  onDismissError,
  onOpenApiKeySettings,
}) => {
  const [inputText, setInputText] = useState('');
  const [rightTab, setRightTab] = useState<'captions' | 'hub' | 'studio'>('captions');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [personaSheetOpen, setPersonaSheetOpen] = useState(false);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  const [clockLabel, setClockLabel] = useState(() =>
    formatTimeInZone(new Date(), settings.timezone)
  );
  const feedEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setClockLabel(formatTimeInZone(new Date(), settings.timezone));
    const timer = window.setInterval(() => {
      setClockLabel(formatTimeInZone(new Date(), settings.timezone));
    }, 30000);
    return () => window.clearInterval(timer);
  }, [settings.timezone]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [transcript, liveDraftInput, liveDraftOutput, isTextSending, rightTab, drawerOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = inputText.trim();
    if (!cleaned || isTextSending) return;
    onSendText(cleaned);
    setInputText('');
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

  const handlePrimaryAvatarTap = () => {
    if (gwenState === 'dormant') {
      onWakeGwen();
    } else if (!isConnected) {
      onStartVoice();
    } else if (gwenState === 'speaking') {
      onInterruptGwen();
    } else {
      onToggleMute();
    }
  };

  const openDrawerToTab = (tab: 'captions' | 'hub' | 'studio') => {
    setRightTab(tab);
    setDrawerOpen(true);
  };

  const shortUserName = useMemo(() => {
    const raw = (settings.deviceUserName || 'Syed').trim();
    return raw.split(/\s+/)[0] || 'Syed';
  }, [settings.deviceUserName]);

  const isDormant = gwenState === 'dormant';
  const isStandardVoice = voiceTransportMode === 'standard-fallback';
  const isPtt = settings.voiceInputMode === 'push-to-talk';

  // Status dot color & label for slim top bar
  const statusInfo = useMemo(() => {
    if (isDormant) return { label: 'Sleep', dot: '#68738b', pulse: false };
    if (gwenState === 'speaking') return { label: 'Speaking', dot: '#22d3ee', pulse: true };
    if (gwenState === 'listening') return { label: 'Listening', dot: '#34d399', pulse: true };
    if (gwenState === 'thinking' || gwenState === 'connecting')
      return { label: gwenState === 'connecting' ? 'Connecting' : 'Thinking', dot: '#8b5cf6', pulse: true };
    if (isConnected) return { label: isStandardVoice ? 'Standard' : 'Live', dot: '#22d3ee', pulse: true };
    return { label: 'Ready', dot: '#34d399', pulse: false };
  }, [gwenState, isConnected, isDormant, isStandardVoice]);

  // 2-line live caption preview text for mobile floating caption bar
  const latestCaption = useMemo(() => {
    if (liveDraftOutput) return { speaker: 'Gwen · Live', text: liveDraftOutput, live: true };
    if (liveDraftInput) return { speaker: 'You · Speaking', text: liveDraftInput, live: true };
    if (isMicTesting && micTestTranscript)
      return { speaker: 'Mic Test', text: micTestTranscript, live: true };
    for (let i = transcript.length - 1; i >= 0; i--) {
      const m = transcript[i];
      if (m.role !== 'action' && m.text.trim()) {
        return {
          speaker: m.role === 'user' ? 'You' : 'Gwen',
          text: m.text,
          live: false,
        };
      }
    }
    return {
      speaker: activePersona.name,
      text: isConnected
        ? 'Listening live — tap here for full chat, Studio & Device Hub.'
        : 'Tap the Mic to talk, or tap here to chat, create media & control your device.',
      live: false,
    };
  }, [
    liveDraftOutput,
    liveDraftInput,
    isMicTesting,
    micTestTranscript,
    transcript,
    activePersona.name,
    isConnected,
  ]);

  const activeHubBadgeCount =
    timers.filter((t) => !t.completed).length +
    reminders.filter((r) => !r.completed).length +
    alarms.filter((a) => a.enabled).length;

  // Shared inner content for Captions / Device Hub / AI Studio (used in both Desktop Right Panel & Mobile Bottom Sheet)
  const renderAssistantPanelContent = (isSheet: boolean) => (
    <div className="flex flex-col h-full min-h-0">
      {/* Header Switcher */}
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 p-1 rounded-full bg-white/[0.04] border border-white/[0.07]">
          {(
            [
              { id: 'captions', label: 'Chat', icon: <MessageSquare className="h-3.5 w-3.5" /> },
              { id: 'studio', label: 'Studio', icon: <Sparkles className="h-3.5 w-3.5" /> },
              {
                id: 'hub',
                label: activeHubBadgeCount > 0 ? `Hub (${activeHubBadgeCount})` : 'Hub',
                icon: <Sliders className="h-3.5 w-3.5" />,
              },
            ] as const
          ).map((tab) => {
            const active = rightTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setRightTab(tab.id)}
                className={`h-8 px-3 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer outline-none ${
                  active
                    ? 'bg-white/[0.12] text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className={active ? 'text-[var(--accent)]' : ''}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleAutoSpeak}
            title={settings.autoSpeakTextReplies ? 'Auto-speak replies on' : 'Auto-speak replies off'}
            aria-label="Toggle auto speak text replies"
            className={`h-8 w-8 rounded-full flex items-center justify-center border transition-colors cursor-pointer ${
              settings.autoSpeakTextReplies
                ? 'bg-cyan-400/15 border-cyan-400/30 text-[var(--accent)]'
                : 'bg-white/[0.05] border-white/[0.08] text-[var(--text-secondary)]'
            }`}
          >
            {settings.autoSpeakTextReplies ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image or screenshot"
            aria-label="Attach screenshot"
            className="h-8 w-8 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <ImagePlus className="h-3.5 w-3.5" />
          </button>

          {transcript.length > 0 && rightTab === 'captions' && (
            <button
              type="button"
              onClick={onClearTranscript}
              title="Clear conversation"
              aria-label="Clear captions"
              className="h-8 w-8 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--danger)] transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          {isSheet && (
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close drawer"
              className="h-8 w-8 rounded-full bg-white/[0.07] border border-white/[0.08] flex items-center justify-center text-[var(--text-primary)] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Live Camera / Screen Preview Strip */}
      {(cameraPreviewUrl || screenPreviewUrl) && (
        <div className="px-4 py-2.5 border-b border-white/[0.08] bg-white/[0.02] space-y-2 shrink-0">
          {cameraPreviewUrl && (
            <div className="flex items-center gap-2.5">
              <img
                src={cameraPreviewUrl}
                alt="Live camera vision"
                className="h-11 w-16 rounded-xl object-cover border border-cyan-400/40 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                  Camera Vision ({settings.cameraFacingMode === 'user' ? 'Front' : 'Rear'})
                </p>
                <p className="text-[11px] text-[var(--text-muted)] truncate">
                  {faceRecognized ? 'Enrolled face recognized · 1 FPS' : 'Streaming 1 FPS to Gwen'}
                </p>
              </div>
              <button
                type="button"
                onClick={onFlipCamera}
                aria-label="Flip camera"
                className="h-8 w-8 rounded-full glass-pill flex items-center justify-center text-[var(--text-primary)] cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onToggleCameraVision}
                className="h-8 px-2.5 rounded-full bg-rose-500/15 border border-rose-400/30 text-[11px] font-semibold text-rose-300 cursor-pointer"
              >
                Off
              </button>
            </div>
          )}

          {screenPreviewUrl && (
            <div className="flex items-center gap-2.5">
              <img
                src={screenPreviewUrl}
                alt="Shared screen context"
                className="h-11 w-16 rounded-xl object-cover border border-violet-400/40 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                  {isScreenSharing ? 'Live Screen Share (1 FPS)' : 'Attached Screenshot'}
                </p>
                <p className="text-[11px] text-[var(--text-muted)] truncate">
                  Ask Gwen to explain, translate, or draft a reply.
                </p>
              </div>
              <button
                type="button"
                onClick={isScreenSharing ? onToggleScreenShare : onClearScreenshot}
                className="h-8 px-2.5 rounded-full glass-pill text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--danger)] cursor-pointer"
              >
                {isScreenSharing ? 'Stop' : 'Remove'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Body Content */}
      {rightTab === 'captions' ? (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-3 min-h-0">
            {transcript.length === 0 && !liveDraftInput && !liveDraftOutput ? (
              <div className="py-4 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    Gwen is ready, {shortUserName}.
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">
                    Talk live, share your camera or screen, manage Google Workspace, or tap a quick command below.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => onSendText(prompt)}
                      className="px-3 py-2 rounded-xl glass-pill text-xs text-[var(--text-primary)] hover:bg-white/[0.11] text-left transition-colors cursor-pointer"
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
                        className="text-[11px] text-[var(--text-secondary)] py-1.5 px-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between gap-2"
                      >
                        <span className="truncate">
                          <strong className="font-semibold text-[var(--accent)]">Action</strong> ·{' '}
                          {msg.text}
                        </span>
                        <span className="font-mono-tabular text-[10px] text-[var(--text-muted)] shrink-0">
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
                        className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                          isUser
                            ? 'bg-gradient-to-br from-cyan-400/20 to-violet-500/20 border border-cyan-400/25 text-[var(--text-primary)]'
                            : 'bg-white/[0.05] border border-white/[0.08] text-[var(--text-primary)]'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] px-1">
                        <span>{isUser ? 'You' : 'Gwen'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-tabular">{timeStr}</span>
                        {msg.hasCameraContext && <span>· Camera</span>}
                        {msg.hasScreenContext && <span>· Screen</span>}
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
                  <div className="flex flex-col items-end opacity-85">
                    <div className="max-w-[86%] rounded-2xl px-3.5 py-2 text-[13px] bg-cyan-400/15 border border-cyan-400/25 text-[var(--text-primary)]">
                      {liveDraftInput}
                    </div>
                    <span className="mt-1 text-[10px] text-[var(--text-muted)]">You · Speaking</span>
                  </div>
                )}

                {liveDraftOutput && (
                  <div className="flex flex-col items-start">
                    <div className="max-w-[86%] rounded-2xl px-3.5 py-2 text-[13px] bg-white/[0.06] border border-cyan-400/35 text-[var(--text-primary)]">
                      {liveDraftOutput}
                    </div>
                    <span className="mt-1 text-[10px] text-[var(--accent)]">Gwen · Live</span>
                  </div>
                )}

                {isTextSending && (
                  <div className="text-xs text-[var(--text-muted)] flex items-center gap-2 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span>Gwen is thinking...</span>
                  </div>
                )}

                {pendingDrafts.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {pendingDrafts.map((draft) => (
                      <div
                        key={draft.id}
                        className="rounded-2xl p-3 glass-card border-cyan-400/30 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-[var(--accent)] uppercase tracking-wide text-[10px]">
                            Confirm {draft.platform}
                          </span>
                          <span className="text-[11px] text-[var(--text-primary)] font-medium truncate">
                            {draft.recipient}
                          </span>
                        </div>
                        {draft.message && (
                          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                            {draft.message}
                          </p>
                        )}
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onCancelDraft(draft.id)}
                            className="h-7 px-3 rounded-full glass-pill text-[11px] text-[var(--text-secondary)] cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => onConfirmDraft(draft)}
                            className="h-7 px-3 rounded-full cta-aurora text-[11px] font-semibold cursor-pointer"
                          >
                            Confirm
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <div ref={feedEndRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="p-3 border-t border-white/[0.08] flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                isCameraActive
                  ? 'Ask Gwen what she sees...'
                  : uploadedScreenImage || isScreenSharing
                    ? 'Ask about your screen...'
                    : 'Message Gwen or type a command...'
              }
              className="flex-1 h-10 rounded-full px-4 text-xs sm:text-sm bg-white/[0.06] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-white/[0.09] focus:outline-none focus:border-cyan-400/50"
            />
            <button
              type="submit"
              disabled={!inputText.trim() || isTextSending}
              aria-label="Send message to Gwen"
              className="h-10 w-10 shrink-0 rounded-full cta-aurora flex items-center justify-center transition-all disabled:opacity-40 cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </>
      ) : rightTab === 'studio' ? (
        <div className="flex-1 overflow-y-auto px-4 py-3.5 min-h-0">
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
        /* Device Control, Weather & Companion Care Hub */
        <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-4 min-h-0">
          {/* Weather & Companion Care */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                Companion Care &amp; Weather (IST)
              </h3>
              <button
                type="button"
                onClick={onRefreshWeather}
                className="text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
              >
                {weatherLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {weather && (
              <div className="rounded-2xl p-3.5 glass-card flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {weather.city}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 truncate">
                    {weather.condition} · Feels {Math.round(weather.feelsLikeC)}°C · Rain {weather.rainChance}%
                  </p>
                </div>
                <span className="font-mono-tabular text-lg font-bold text-[var(--accent)] shrink-0">
                  {Math.round(weather.temperatureC)}°C
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Hydration */}
              <div className="rounded-2xl p-3.5 glass-card space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                    <Droplets className="h-3.5 w-3.5 text-cyan-400" />
                    Hydration
                  </span>
                  <span className="font-mono-tabular text-[11px] text-[var(--accent)]">
                    {careState.waterGlassesToday}/{careState.waterGoalGlasses}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-all"
                    style={{
                      width: `${Math.min(100, (careState.waterGlassesToday / Math.max(1, careState.waterGoalGlasses)) * 100)}%`,
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onLogWater}
                    className="h-8 px-3 rounded-full bg-cyan-400/15 border border-cyan-400/30 text-[11px] font-semibold text-[var(--accent)] hover:bg-cyan-400/25 cursor-pointer"
                  >
                    +1 Glass
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateCareState({ waterReminderEnabled: !careState.waterReminderEnabled })
                    }
                    className="h-8 px-2.5 rounded-full glass-pill text-[11px] text-[var(--text-secondary)] cursor-pointer"
                  >
                    Remind: {careState.waterReminderEnabled ? 'On' : 'Off'}
                  </button>
                </div>
              </div>

              {/* IST Wake-Up */}
              <div className="rounded-2xl p-3.5 glass-card space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                    <AlarmClock className="h-3.5 w-3.5 text-violet-400" />
                    IST Wake-Up
                  </span>
                  <input
                    type="time"
                    value={careState.wakeUpTimeIST}
                    onChange={(e) =>
                      onUpdateCareState({ wakeUpTimeIST: e.target.value, wakeUpEnabled: true })
                    }
                    className="h-7 px-2 rounded-lg text-[11px] font-mono-tabular bg-white/[0.06] text-[var(--text-primary)] border border-white/[0.09]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateCareState({ wakeUpEnabled: !careState.wakeUpEnabled })
                    }
                    className={`h-8 px-2.5 rounded-full text-[11px] font-medium border cursor-pointer ${
                      careState.wakeUpEnabled
                        ? 'bg-cyan-400/15 border-cyan-400/30 text-[var(--accent)]'
                        : 'glass-pill text-[var(--text-secondary)]'
                    }`}
                  >
                    {careState.wakeUpEnabled ? 'Armed (IST)' : 'Off'}
                  </button>
                  <button
                    type="button"
                    onClick={onTriggerWakeUpNow}
                    className="h-8 px-2.5 rounded-full glass-pill text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    Test
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* System Settings */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
              Device Controls
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="rounded-2xl p-3.5 glass-card space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-[var(--text-primary)] font-medium">
                    <Sun className="h-3.5 w-3.5 text-[var(--accent)]" />
                    Brightness
                  </span>
                  <span className="font-mono-tabular text-[11px] text-[var(--text-secondary)]">
                    {deviceState.brightness}%
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={deviceState.brightness}
                  onChange={(e) => onUpdateDeviceState({ brightness: Number(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div className="rounded-2xl p-3.5 glass-card space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-[var(--text-primary)] font-medium">
                    <Volume2 className="h-3.5 w-3.5 text-violet-400" />
                    Volume
                  </span>
                  <span className="font-mono-tabular text-[11px] text-[var(--text-secondary)]">
                    {deviceState.mediaVolume}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={deviceState.mediaVolume}
                  onChange={(e) => onUpdateDeviceState({ mediaVolume: Number(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {[
                {
                  label: 'DND',
                  active: deviceState.doNotDisturb,
                  icon: deviceState.doNotDisturb ? (
                    <BellOff className="h-3.5 w-3.5" />
                  ) : (
                    <Bell className="h-3.5 w-3.5" />
                  ),
                  toggle: () => onUpdateDeviceState({ doNotDisturb: !deviceState.doNotDisturb }),
                },
                {
                  label: 'Torch',
                  active: deviceState.flashlight,
                  icon: <Flashlight className="h-3.5 w-3.5" />,
                  toggle: () => onUpdateDeviceState({ flashlight: !deviceState.flashlight }),
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
                  toggle: () => onUpdateDeviceState({ bluetooth: !deviceState.bluetooth }),
                },
                {
                  label: 'Saver',
                  active: deviceState.batterySaver,
                  icon: <Zap className="h-3.5 w-3.5" />,
                  toggle: () => onUpdateDeviceState({ batterySaver: !deviceState.batterySaver }),
                },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.toggle}
                  className={`h-12 rounded-xl text-[11px] font-medium flex flex-col items-center justify-center gap-1 border transition-colors cursor-pointer ${
                    item.active
                      ? 'bg-cyan-400/15 border-cyan-400/35 text-[var(--accent)]'
                      : 'glass-card text-[var(--text-secondary)]'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Active Timers & Alarms */}
          {(timers.length > 0 || alarms.length > 0) && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-[var(--text-secondary)]">
                Timers &amp; Alarms
              </h3>
              {timers.map((timer) => (
                <div
                  key={timer.id}
                  className="rounded-2xl p-3 glass-card flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-[11px] text-[var(--text-muted)]">{timer.label}</p>
                    <p className="font-mono-tabular text-base font-semibold text-[var(--text-primary)]">
                      {timer.completed ? 'Done!' : formatCountdown(timer.remainingSeconds)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {!timer.completed && (
                      <button
                        type="button"
                        onClick={() => onToggleTimer(timer.id)}
                        className="h-8 w-8 rounded-full glass-pill flex items-center justify-center text-[var(--text-primary)] cursor-pointer"
                        aria-label={timer.running ? 'Pause timer' : 'Resume timer'}
                      >
                        {timer.running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDismissTimer(timer.id)}
                      className="h-8 w-8 rounded-full glass-pill flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer"
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
                  className="rounded-2xl p-3 glass-card flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5">
                    <Clock className="h-4 w-4 text-[var(--accent)]" />
                    <div>
                      <p className="font-mono-tabular text-xs font-semibold text-[var(--text-primary)]">
                        {alarm.time}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)]">{alarm.label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onToggleAlarm(alarm.id)}
                      className={`h-7 px-2.5 rounded-full text-[11px] font-semibold cursor-pointer ${
                        alarm.enabled
                          ? 'bg-cyan-400/15 text-[var(--accent)] border border-cyan-400/30'
                          : 'glass-pill text-[var(--text-muted)]'
                      }`}
                    >
                      {alarm.enabled ? 'On' : 'Off'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteAlarm(alarm.id)}
                      className="h-7 w-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer"
                      aria-label="Delete alarm"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Calendar & Reminders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[var(--text-secondary)]">Calendar</h3>
                <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                  {calendarEvents.length}
                </span>
              </div>
              {calendarEvents.length === 0 ? (
                <p className="text-[11px] text-[var(--text-muted)]">
                  Say &ldquo;Schedule meeting at 3 PM&rdquo;.
                </p>
              ) : (
                calendarEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="rounded-xl p-2.5 glass-card flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                          {ev.title}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] truncate">
                          {ev.dateTime}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteCalendarEvent(ev.id)}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer shrink-0"
                      aria-label="Delete event"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-[var(--text-secondary)]">Reminders</h3>
                <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                  {reminders.filter((r) => !r.completed).length} open
                </span>
              </div>
              {reminders.length === 0 ? (
                <p className="text-[11px] text-[var(--text-muted)]">
                  Say &ldquo;Remind me to call mom at 6 PM&rdquo;.
                </p>
              ) : (
                reminders.map((rem) => (
                  <div
                    key={rem.id}
                    className="rounded-xl p-2.5 glass-card flex items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleReminder(rem.id)}
                      className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer"
                    >
                      {rem.completed ? (
                        <CheckSquare className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                      ) : (
                        <Square className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p
                          className={`text-xs truncate ${
                            rem.completed
                              ? 'line-through text-[var(--text-muted)]'
                              : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {rem.title}
                        </p>
                        {rem.dueText && (
                          <p className="text-[10px] text-[var(--text-muted)] truncate">
                            {rem.dueText}
                          </p>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteReminder(rem.id)}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--danger)] cursor-pointer shrink-0"
                      aria-label="Delete reminder"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative h-[calc(100dvh-64px)] lg:h-full w-full overflow-hidden lg:overflow-visible flex flex-col">
      {/* Hidden shared file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Slim Mobile HUD Top Bar — Glowing G Logo + Gwen | Install + Chat icons */}
      <header className="lg:hidden h-12 px-4 flex items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-8 w-8 rounded-xl aurora-badge font-display text-sm font-bold flex items-center justify-center shrink-0">
            G
          </span>
          <span className="font-display text-[17px] font-semibold tracking-tight text-[var(--text-primary)] whitespace-nowrap">
            Gwen
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isInstalled && onPromptInstall && (
            <InstallAppButton
              iconOnly
              isInstallable={isInstallable}
              isInstalled={isInstalled}
              isIOS={isIOS}
              isAndroid={isAndroid}
              onPromptInstall={onPromptInstall}
              onNotify={onNotify}
            />
          )}
          <button
            type="button"
            onClick={() => openDrawerToTab('captions')}
            aria-label="Open Chat and AI Studio"
            title="Chat & AI Studio"
            className="h-9 w-9 rounded-full glass-pill text-[var(--text-primary)] hover:bg-white/[0.12] flex items-center justify-center transition-colors cursor-pointer"
          >
            <MessageSquare className="h-4 w-4 text-[var(--accent)]" />
          </button>
        </div>
      </header>

      {/* Main Responsive Stage: 1-Screen Mobile HUD + 2-Column Desktop Layout */}
      <div className="flex-1 min-h-0 w-full max-w-7xl mx-auto px-4 sm:px-5 lg:px-7 lg:py-5 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
        {/* LEFT / CENTERPIECE: Open Avatar Stage + Telemetry Capsule + Floating Glass Dock */}
        <section className="lg:col-span-5 flex flex-col justify-between items-center min-h-0 pb-3 lg:pb-0 relative">
          {/* Top Floating Telemetry Capsule: User · Time IST · Weather (tap to refresh) · Water (tap to increment) */}
          <div className="relative z-20 flex flex-col items-center gap-1.5 pt-0.5 lg:pt-0 w-full">
            <div className="h-8 px-3 rounded-full glass-pill text-[11px] font-mono-tabular text-[var(--text-secondary)] flex items-center gap-1.5 max-w-full">
              <span className="font-sans font-medium text-[var(--text-primary)] truncate max-w-[78px]">
                {shortUserName}
              </span>
              <span className="opacity-35" aria-hidden="true">·</span>
              <span className="whitespace-nowrap">{clockLabel} IST</span>
              <span className="opacity-35" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onRefreshWeather}
                title="Tap to refresh local weather"
                className="inline-flex items-center gap-1 text-[var(--accent)] hover:brightness-110 whitespace-nowrap cursor-pointer"
              >
                <span>{weather ? `${Math.round(weather.temperatureC)}°C` : 'Weather'}</span>
                {weatherLoading && <RefreshCw className="h-2.5 w-2.5 animate-spin" />}
              </button>
              <span className="opacity-35" aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onLogWater}
                title="Tap to log +1 glass of water"
                className="inline-flex items-center gap-0.5 text-[var(--text-primary)] hover:text-[var(--accent)] whitespace-nowrap cursor-pointer"
              >
                <span>
                  {careState.waterGlassesToday}/{careState.waterGoalGlasses} 💧
                </span>
              </button>
            </div>

            {/* Urgent / Active Care Nudge or Escalating Wake-Up Alarm (Compact Glass Strip) */}
            {activeWakeUpAlarm && (
              <div className="w-full max-w-sm rounded-2xl px-3.5 py-2 glass-dock border-cyan-400/40 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <AlarmClock className="h-4 w-4 text-[var(--accent)] animate-bounce shrink-0" />
                  <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {activeWakeUpAlarm.label || 'Wake-Up Alarm'} · Level {activeWakeUpAlarm.escalationLevel}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={onSnoozeWakeUp}
                    className="h-7 px-2.5 rounded-full glass-pill text-[11px] font-medium text-[var(--text-primary)] cursor-pointer"
                  >
                    Snooze
                  </button>
                  <button
                    type="button"
                    onClick={onDismissWakeUp}
                    className="h-7 px-2.5 rounded-full cta-aurora text-[11px] font-semibold cursor-pointer"
                  >
                    Awake
                  </button>
                </div>
              </div>
            )}

            {!activeWakeUpAlarm && activeCareNudge && (
              <div className="w-full max-w-sm rounded-2xl px-3.5 py-2 glass-card flex items-center justify-between gap-2">
                <p className="text-[11px] text-[var(--text-primary)] truncate">
                  {activeCareNudge.message}
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  {activeCareNudge.kind === 'water' && (
                    <button
                      type="button"
                      onClick={() => {
                        onLogWater();
                        onDismissCareNudge();
                      }}
                      className="h-6 px-2 rounded-full bg-cyan-400/15 text-[10px] font-semibold text-[var(--accent)] cursor-pointer"
                    >
                      Logged
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onDismissCareNudge}
                    aria-label="Dismiss nudge"
                    className="h-6 w-6 rounded-full flex items-center justify-center text-[var(--text-muted)] cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* CENTER: Open Borderless Avatar Stage over Aurora Mesh */}
          <div className="flex-1 w-full flex flex-col items-center justify-center relative min-h-0 py-1">
            {/* Ambient Radial Glow behind Avatar */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 sm:w-80 sm:h-80 rounded-full blur-3xl opacity-75 transition-opacity duration-500"
              style={{
                background:
                  gwenState === 'speaking' || gwenState === 'listening'
                    ? 'radial-gradient(circle, rgba(34,211,238,0.22) 0%, rgba(139,92,246,0.18) 52%, transparent 75%)'
                    : 'radial-gradient(circle, rgba(6,182,212,0.14) 0%, rgba(139,92,246,0.12) 52%, transparent 75%)',
              }}
            />

            {/* Top Pills: Left Persona Picker + Right 3D | Orb Segmented Toggle */}
            <div className="relative z-20 w-full max-w-sm flex items-center justify-between gap-2 mb-1">
              <button
                type="button"
                onClick={() => setPersonaSheetOpen(true)}
                aria-label="Choose Gwen persona"
                className="h-8 pl-3 pr-2.5 rounded-full glass-pill text-xs font-medium text-[var(--text-primary)] hover:bg-white/[0.12] flex items-center gap-1.5 transition-colors cursor-pointer max-w-[205px]"
              >
                <span className="truncate">{activePersona.name}</span>
                <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
              </button>

              <div className="h-8 p-0.5 rounded-full glass-pill flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (settings.avatarMode !== '3d') onToggleAvatarMode();
                  }}
                  className={`h-7 px-3 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
                    settings.avatarMode === '3d'
                      ? 'bg-white/[0.16] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  3D
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (settings.avatarMode === '3d') onToggleAvatarMode();
                  }}
                  className={`h-7 px-3 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
                    settings.avatarMode !== '3d'
                      ? 'bg-white/[0.16] text-[var(--text-primary)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Orb
                </button>
              </div>
            </div>

            {/* Active Student / Empathy subtle pill (only when present) */}
            {(activeStudentName || latestEmpathySignal) && (
              <div className="relative z-20 mb-0.5 flex items-center gap-1.5">
                {activeStudentName && (
                  <span className="px-2.5 py-0.5 rounded-full bg-violet-500/15 border border-violet-400/25 text-[10px] font-medium text-violet-200">
                    Teaching {activeStudentName}
                  </span>
                )}
                {latestEmpathySignal && (
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-400/12 border border-cyan-400/25 text-[10px] font-medium text-cyan-200">
                    {latestEmpathySignal.summary || latestEmpathySignal.condition}
                  </span>
                )}
              </div>
            )}

            {/* Open 3D Anime Avatar or Animated Voice Orb — Zero Container Box */}
            <div className="relative z-10 w-full flex items-center justify-center">
              {settings.avatarMode === '3d' ? (
                <GwenAvatar3D
                  state={gwenState}
                  audioLevel={audioLevel}
                  personaId={activePersona.id}
                  themeId={settings.themeId}
                  customAccent={settings.customAccent}
                  isPushToTalk={isPtt}
                  isPttActive={isPttPressed}
                  onPrimaryClick={handlePrimaryAvatarTap}
                  onPttStart={onPttStart}
                  onPttEnd={onPttEnd}
                />
              ) : (
                <div className="py-2 flex items-center justify-center">
                  <VoiceOrb
                    state={gwenState}
                    audioLevel={audioLevel}
                    themeId={settings.themeId}
                    customAccent={settings.customAccent}
                    size={224}
                    isPushToTalk={isPtt}
                    isPttActive={isPttPressed}
                    onPrimaryClick={handlePrimaryAvatarTap}
                    onPttStart={onPttStart}
                    onPttEnd={onPttEnd}
                  />
                </div>
              )}
            </div>

            {/* Calm Standard Voice Mode Pill + Mic Test (NO red error banner on 1006 fallback) */}
            {isStandardVoice && (
              <div className="relative z-20 mt-1 flex flex-wrap items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/12 border border-teal-400/25 text-[11px] text-teal-200">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
                <span className="font-medium">Standard Voice Active</span>
                <button
                  type="button"
                  onClick={onToggleMicTest}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors cursor-pointer ${
                    isMicTesting
                      ? 'bg-teal-400 text-[#05070e]'
                      : 'bg-white/[0.08] text-teal-100 hover:bg-white/[0.14]'
                  }`}
                >
                  {isMicTesting ? 'Stop Mic Test' : 'Mic Test'}
                </button>
                <button
                  type="button"
                  onClick={onRetryLiveVoice}
                  className="px-2 py-0.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-[10px] font-semibold text-[var(--text-primary)] cursor-pointer"
                >
                  Retry Live WS
                </button>
              </div>
            )}

            {/* Non-fallback Error Banner (only when truly an error and not in calm Standard Voice) */}
            {error && !isStandardVoice && (
              <div className="relative z-20 mt-1 max-w-xs w-full rounded-2xl px-3 py-2 bg-rose-500/15 border border-rose-400/30 text-[11px] text-rose-100 flex items-center justify-between gap-2">
                <span className="line-clamp-2 flex-1">{error}</span>
                {error.toLowerCase().includes('api key') && (
                  <button
                    type="button"
                    onClick={onOpenApiKeySettings}
                    className="px-2 py-0.5 rounded-full bg-white/15 text-[10px] font-semibold text-white whitespace-nowrap cursor-pointer"
                  >
                    Fix Key
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDismissError}
                  aria-label="Dismiss error"
                  className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-white/10 shrink-0 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* BOTTOM ZONE: Floating 2-Line Live Subtitle Card (Mobile) + Floating Glass Control Dock */}
          <div className="w-full flex flex-col items-center gap-3 z-20">
            {/* Mobile Live Subtitle Card (2-line) — Tap to slide up Chat & AI Studio Sheet */}
            <button
              type="button"
              onClick={() => openDrawerToTab('captions')}
              className="lg:hidden w-full max-w-sm rounded-2xl px-4 py-2.5 glass-card hover:bg-white/[0.08] text-left transition-colors cursor-pointer group"
            >
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-[11px] font-semibold text-[var(--accent)] flex items-center gap-1.5">
                  {latestCaption.live && (
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  )}
                  <span>{latestCaption.speaker}</span>
                  <span className="text-[var(--text-muted)] font-normal">· {statusInfo.label}</span>
                </span>
                <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-0.5 group-hover:text-[var(--text-primary)]">
                  <span>Chat &amp; Studio</span>
                  <ChevronUp className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="text-[12.5px] text-[var(--text-primary)] leading-snug line-clamp-2">
                {latestCaption.text}
              </p>
            </button>

            {/* Floating Glass Control Dock: Camera · Screen · Central Glowing Mic · Hands-Free/PTT · Sleep */}
            <div className="glass-dock rounded-full px-3 py-1.5 flex items-center justify-center gap-2.5 max-w-full">
              {/* Camera Vision */}
              <button
                type="button"
                onClick={onToggleCameraVision}
                aria-label={isCameraActive ? 'Turn off camera vision' : 'Turn on camera vision'}
                title={isCameraActive ? 'Camera Vision On' : 'Camera Vision'}
                className={`h-10 w-10 rounded-full flex items-center justify-center transition-all cursor-pointer outline-none ${
                  isCameraActive
                    ? 'bg-cyan-400/20 border border-cyan-400/40 text-cyan-300'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {isCameraActive ? <VideoOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              </button>

              {/* Screen Share */}
              <button
                type="button"
                onClick={onToggleScreenShare}
                aria-label={isScreenSharing ? 'Stop screen share' : 'Share screen with Gwen'}
                title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
                className={`h-10 w-10 rounded-full flex items-center justify-center transition-all cursor-pointer outline-none ${
                  isScreenSharing
                    ? 'bg-violet-500/25 border border-violet-400/45 text-violet-200'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {isScreenSharing ? <MonitorOff className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
              </button>

              {/* Central Glowing Circular Gradient Microphone Button */}
              {isDormant ? (
                <button
                  type="button"
                  onClick={onWakeGwen}
                  aria-label="Wake Gwen"
                  title="Wake Gwen"
                  className="h-[52px] w-[52px] rounded-full cta-aurora flex items-center justify-center cursor-pointer transition-transform active:scale-95"
                >
                  <Sparkles className="h-5 w-5" />
                </button>
              ) : !isConnected ? (
                <button
                  type="button"
                  onClick={onStartVoice}
                  aria-label="Start voice chat with Gwen"
                  title="Tap to Talk"
                  className="h-[52px] w-[52px] rounded-full cta-aurora flex items-center justify-center cursor-pointer transition-transform active:scale-95"
                >
                  <Mic className="h-5 w-5" />
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {isPtt ? (
                    <button
                      type="button"
                      onPointerDown={onPttStart}
                      onPointerUp={onPttEnd}
                      onPointerLeave={() => {
                        if (isPttPressed) onPttEnd();
                      }}
                      aria-label={isPttPressed ? 'Listening' : 'Hold to speak'}
                      title={isPttPressed ? 'Listening...' : 'Hold to speak'}
                      className={`h-[52px] w-[52px] rounded-full flex items-center justify-center cursor-pointer touch-none transition-all ${
                        isPttPressed
                          ? 'cta-aurora scale-95'
                          : 'bg-cyan-400/20 border border-cyan-400/45 text-[var(--text-primary)]'
                      }`}
                    >
                      <Mic className="h-5 w-5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={gwenState === 'speaking' ? onInterruptGwen : onToggleMute}
                      aria-label={
                        gwenState === 'speaking'
                          ? 'Interrupt Gwen'
                          : isMicMuted
                            ? 'Unmute microphone'
                            : 'Mute microphone'
                      }
                      title={
                        gwenState === 'speaking'
                          ? 'Tap to Interrupt Gwen'
                          : isMicMuted
                            ? 'Unmute Mic'
                            : 'Live Mic (Tap to Mute)'
                      }
                      className={`h-[52px] w-[52px] rounded-full flex items-center justify-center cursor-pointer transition-all ${
                        isMicMuted
                          ? 'bg-amber-400/20 border border-amber-400/45 text-amber-200'
                          : 'cta-aurora'
                      }`}
                    >
                      {isMicMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onStopVoice}
                    aria-label="End voice session"
                    title="End Voice Session"
                    className="h-10 w-10 rounded-full bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/35 text-rose-300 flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <PhoneOff className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Hands-Free / Push-to-Talk Toggle */}
              <button
                type="button"
                onClick={() => onChangeVoiceMode(isPtt ? 'hands-free' : 'push-to-talk')}
                aria-label={isPtt ? 'Switch to Hands-Free mode' : 'Switch to Push-to-Talk mode'}
                title={isPtt ? 'Push-to-Talk (tap for Hands-Free)' : 'Hands-Free (tap for PTT)'}
                className={`h-10 w-10 rounded-full flex items-center justify-center transition-all cursor-pointer outline-none ${
                  isPtt
                    ? 'bg-violet-500/25 border border-violet-400/40 text-violet-200'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {isPtt ? <Hand className="h-4 w-4" /> : <Radio className="h-4 w-4" />}
              </button>

              {/* Sleep / Wake Toggle */}
              <button
                type="button"
                onClick={isDormant ? onWakeGwen : onSleepGwen}
                aria-label={isDormant ? 'Wake Gwen' : 'Put Gwen to sleep'}
                title={isDormant ? 'Wake Gwen' : 'Sleep Mode'}
                className={`h-10 w-10 rounded-full flex items-center justify-center transition-all cursor-pointer outline-none ${
                  isDormant
                    ? 'bg-cyan-400/20 border border-cyan-400/40 text-cyan-300'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Moon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN (Desktop >= lg): Frosted Glass Chat / AI Studio / Device Hub Panel */}
        <section className="hidden lg:flex lg:col-span-7 flex-col h-[calc(100dvh-44px)] max-h-[840px] glass-card rounded-3xl overflow-hidden">
          {renderAssistantPanelContent(false)}
        </section>
      </div>

      {/* MOBILE BOTTOM SHEET: Chat, AI Studio & Device Hub */}
      {drawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Chat, Studio and Device Hub"
          className="lg:hidden fixed inset-0 z-[65] bg-black/65 backdrop-blur-sm flex items-end"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="w-full h-[84dvh] rounded-t-3xl glass-sheet flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2.5 pb-1 shrink-0">
              <span className="h-1 w-9 rounded-full bg-white/20" />
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              {renderAssistantPanelContent(true)}
            </div>
          </div>
        </div>
      )}

      {/* SMOOTH BOTTOM SHEET PERSONA PICKER (Replaces Native <select>) */}
      {personaSheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Select Gwen Persona"
          className="fixed inset-0 z-[70] bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setPersonaSheetOpen(false)}
        >
          <div
            className="w-full sm:max-w-md max-h-[78dvh] rounded-t-3xl sm:rounded-3xl glass-sheet sm:border sm:border-white/[0.12] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
              <span className="h-1 w-9 rounded-full bg-white/20" />
            </div>

            <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-[var(--text-primary)]">
                  Switch Persona
                </h2>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Choose Gwen&rsquo;s voice tone &amp; personality
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPersonaSheetOpen(false)}
                aria-label="Close persona picker"
                className="h-8 w-8 rounded-full glass-pill flex items-center justify-center text-[var(--text-secondary)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
              {personas.map((persona) => {
                const active = persona.id === activePersona.id;
                return (
                  <button
                    key={persona.id}
                    type="button"
                    onClick={() => {
                      onChangePersona(persona.id);
                      setPersonaSheetOpen(false);
                    }}
                    className={`w-full p-3.5 rounded-2xl text-left border transition-all flex items-center justify-between gap-3 cursor-pointer ${
                      active
                        ? 'bg-gradient-to-r from-cyan-400/15 to-violet-500/15 border-cyan-400/35'
                        : 'glass-card hover:bg-white/[0.07]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                        <span className="truncate">{persona.name}</span>
                        {active && (
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                        {persona.tagline}
                      </p>
                    </div>
                    {active && (
                      <span className="h-6 w-6 rounded-full aurora-badge flex items-center justify-center shrink-0">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
