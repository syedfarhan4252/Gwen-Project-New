export type AppTab = 'companion' | 'memory' | 'commands' | 'settings';

export type MemoryCategory =
  | 'Preferences'
  | 'Personal Context'
  | 'Routines'
  | 'Projects'
  | 'Custom Notes'
  | 'Micro-Detail';

export interface MemoryItem {
  id: string;
  content: string;
  category: MemoryCategory;
  pinned: boolean;
  isPermanent: boolean;
  source: 'auto' | 'manual' | 'voice';
  createdAt: string;
  updatedAt: string;
}

export interface ContinuousSessionState {
  lastLeftTopic: string;
  lastSummary: string;
  lastUserMood: string;
  unfinishedThreads: string[];
  totalArchivedTurns: number;
  updatedAt: string;
}

export interface VoiceprintProfile {
  enrolled: boolean;
  enrolledAt: string;
  spectralVector: number[];
  samplePhrase: string;
}

export interface FaceBiometricProfile {
  enrolled: boolean;
  enrolledAt: string;
  thumbnailDataUrl: string;
  histogramVector: number[];
  visualSummary: string;
}

export interface IdentityCoreProfile {
  displayName: string;
  nickname: string;
  birthday: string;
  visualTraits: string;
  voiceprint: VoiceprintProfile | null;
  faceProfile: FaceBiometricProfile | null;
}

export type ResponseLength = 'concise' | 'balanced' | 'detailed';

export interface Persona {
  id: string;
  name: string;
  tagline: string;
  tone: string;
  systemPrompt: string;
  responseLength: ResponseLength;
  isBuiltIn: boolean;
}

export type VoiceName = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';

export type LanguageMode = 'auto' | 'en' | 'hi' | 'hinglish';

export type VoiceInputMode = 'hands-free' | 'push-to-talk';

export type AvatarMode = '3d' | 'orb';

export type ThemeId =
  | 'midnight-obsidian'
  | 'cyber-neon'
  | 'minimal-light'
  | 'warm-sunset';

export type OverlayStyle = 'orb' | 'ring' | 'halo';
export type OverlaySize = 'compact' | 'standard' | 'large';

export type GwenState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'dormant'
  | 'error';

export type TextModelId = 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
export type LiveModelId = 'gemini-3.8-live';

export interface GwenSettings {
  deviceUserName: string;
  onboardingCompleted: boolean;
  timezone: string; // Permanent default: 'Asia/Kolkata' (IST, UTC+05:30)
  textModel: TextModelId;
  liveModel: LiveModelId;
  voiceName: VoiceName;
  speakingRate: number;
  languageMode: LanguageMode;
  voiceInputMode: VoiceInputMode;
  activePersonaId: string;
  incognitoMode: boolean;
  autoExtractMemories: boolean;
  autoSpeakTextReplies: boolean;
  proactiveEmpathyEnabled: boolean;
  themeId: ThemeId;
  customAccent: string | null;
  overlayEnabled: boolean;
  overlayStyle: OverlayStyle;
  overlaySize: OverlaySize;
  handsFreeControlEnabled: boolean;
  avatarMode: AvatarMode;
  keepActiveInBackground: boolean;
  cameraFacingMode: 'user' | 'environment';
  writeSettingsGranted: boolean;
  dndPolicyGranted: boolean;
  calendarPermissionGranted: boolean;
  mediaGalleryPermissionGranted: boolean;
  locationPermissionGranted: boolean;
}

export interface DeviceSystemState {
  brightness: number; // 15 - 100
  mediaVolume: number; // 0 - 100
  ringVolume: number; // 0 - 100
  alarmVolume: number; // 0 - 100
  doNotDisturb: boolean;
  flashlight: boolean;
  wifi: boolean;
  bluetooth: boolean;
  batterySaver: boolean;
}

export interface WeatherSnapshot {
  city: string;
  latitude: number;
  longitude: number;
  temperatureC: number;
  feelsLikeC: number;
  humidity: number;
  windKmh: number;
  condition: string;
  weatherCode: number;
  rainChance: number;
  isDay: boolean;
  fetchedAt: string;
}

export interface CompanionCareState {
  waterGlassesToday: number;
  waterGoalGlasses: number;
  waterReminderEnabled: boolean;
  waterIntervalMinutes: number;
  lastWaterLoggedAt: string | null;
  restReminderEnabled: boolean;
  restIntervalMinutes: number;
  sessionMinutesElapsed: number;
  wakeUpTimeIST: string; // e.g., "07:00"
  wakeUpEnabled: boolean;
  wakeUpLabel: string;
  windDownTimeIST: string; // e.g., "22:30"
  lastCareDateKey: string; // YYYY-MM-DD in active timezone
}

export type MediaAspectRatio = '1:1' | '16:9' | '9:16' | '4:3';

export interface GeneratedMediaItem {
  id: string;
  kind: 'image' | 'video';
  prompt: string;
  style: string;
  aspectRatio: MediaAspectRatio;
  durationSec?: number;
  dataUrl: string;
  mimeType: string;
  filename: string;
  savedToGallery: boolean;
  createdAt: string;
}

export interface GeneratedWebsiteItem {
  id: string;
  title: string;
  slug: string;
  description: string;
  html: string;
  storagePath: string; // e.g., Documents/GwenWebsites/<slug>/index.html
  createdAt: string;
}

export interface EmpathySignal {
  source: 'audio' | 'camera';
  condition: 'cough' | 'tired' | 'sad' | 'stressed' | 'happy' | 'calm';
  confidence: number;
  summary: string;
  suggestedResponse: string;
  detectedAt: string;
}

export interface CalendarEventItem {
  id: string;
  title: string;
  dateTime: string;
  notes?: string;
  createdAt: string;
}

export interface AlarmItem {
  id: string;
  time: string;
  label: string;
  enabled: boolean;
}

export interface TimerItem {
  id: string;
  label: string;
  totalSeconds: number;
  remainingSeconds: number;
  running: boolean;
  completed: boolean;
}

export interface ReminderTaskItem {
  id: string;
  title: string;
  dueText?: string;
  completed: boolean;
  createdAt: string;
}

export type MessagePlatform = 'WhatsApp' | 'Messenger' | 'SMS';

export interface PendingMessageDraft {
  id: string;
  platform: MessagePlatform;
  recipient: string;
  message: string;
  createdAt: string;
}

export interface TranscriptMessage {
  id: string;
  role: 'user' | 'gwen' | 'action';
  text: string;
  timestamp: string;
  mode: 'live' | 'text' | 'command';
  hasScreenContext?: boolean;
  hasCameraContext?: boolean;
  mediaPreviewId?: string;
  websitePreviewId?: string;
  actionMeta?: {
    type: string;
    detail: string;
  };
}

export type CommandCategory =
  | 'App & Device Control'
  | 'System Settings'
  | 'Camera & Screen Vision'
  | 'Media & Web Studio'
  | 'Companion Care & Weather'
  | 'Google Workspace'
  | 'Search & Downloads'
  | 'Home Teacher & Kids'
  | 'Memory Core'
  | 'Productivity & Messaging';

export interface GoogleWorkspaceScopesConfig {
  gmail: boolean;
  calendar: boolean;
  tasksAndNotes: boolean;
  drive: boolean;
  contacts: boolean;
}

export interface GoogleAccountProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  connectedAt: string;
}

export interface KeepStyleNote {
  id: string;
  title: string;
  content: string;
  checklist?: Array<{ id: string; text: string; done: boolean }>;
  syncedToTasks?: boolean;
  googleTaskId?: string;
  updatedAt: string;
}

export interface KidProfile {
  id: string;
  name: string;
  age: number;
  grade: string;
  subjects: string[];
  avatarColor: string;
  stars: number;
  streakDays: number;
  lastActiveAt: string;
  createdAt: string;
}

export interface KidLessonRecord {
  id: string;
  kidId: string;
  subject: string;
  topic: string;
  summary: string;
  masteryLevel: 'intro' | 'practicing' | 'confident' | 'mastered';
  weakAreas: string[];
  createdAt: string;
}

export interface KidPracticeLog {
  id: string;
  kidId: string;
  subject: string;
  activity: string;
  correctionsNoted: string;
  praiseGiven: string;
  starsEarned: number;
  createdAt: string;
}

export interface KidQuizResult {
  id: string;
  kidId: string;
  subject: string;
  topic: string;
  score: number;
  total: number;
  weakTopics: string[];
  feedback: string;
  createdAt: string;
}

export interface KidStudyBundle {
  profile: KidProfile;
  lessons: KidLessonRecord[];
  practiceLogs: KidPracticeLog[];
  quizResults: KidQuizResult[];
}

export interface WebSearchSource {
  title: string;
  url: string;
  domain: string;
}

export interface PlayStoreAppResult {
  appName: string;
  developer: string;
  packageId: string;
  summary: string;
  playStoreUrl: string;
  marketUri: string;
}

export interface BrowserMediaCandidate {
  title: string;
  sourceDomain: string;
  imageUrl: string;
  downloadUrl: string;
  kind: 'image' | 'file';
  mimeType: string;
  suggestedFilename: string;
}

export type PendingConfirmationAction =
  | {
      id: string;
      kind: 'gmail_send';
      title: string;
      to: string;
      subject: string;
      body: string;
    }
  | {
      id: string;
      kind: 'calendar_create';
      title: string;
      summary: string;
      startIso: string;
      endIso: string;
      description?: string;
    }
  | {
      id: string;
      kind: 'calendar_delete';
      title: string;
      eventId: string;
      summary: string;
    }
  | {
      id: string;
      kind: 'playstore_install';
      title: string;
      app: PlayStoreAppResult;
    }
  | {
      id: string;
      kind: 'browser_download';
      title: string;
      media: BrowserMediaCandidate;
    };

export interface VoiceCommandItem {
  id: string;
  phrase: string;
  category: CommandCategory;
  description: string;
  exampleAction: string;
}

export interface CustomShortcut {
  id: string;
  triggerPhrase: string;
  label: string;
  switchPersonaId?: string;
  enableScreenShare?: boolean;
  enableCameraVision?: boolean;
  promptToSend: string;
  createdAt: string;
}

export interface ParsedCommandResult {
  isCommand: boolean;
  action:
    | 'none'
    | 'open_app'
    | 'navigate_tab'
    | 'toggle_screen_share'
    | 'toggle_camera'
    | 'toggle_overlay'
    | 'switch_persona'
    | 'save_memory'
    | 'forget_memory'
    | 'scroll_page'
    | 'go_back'
    | 'summarize_screen'
    | 'translate_screen'
    | 'control_system_setting'
    | 'manage_calendar'
    | 'navigate_maps'
    | 'compose_message'
    | 'manage_alarm_timer'
    | 'manage_reminder_task'
    | 'generate_image'
    | 'generate_video'
    | 'build_website'
    | 'get_weather'
    | 'manage_companion_care'
    | 'change_timezone'
    | 'manage_gmail'
    | 'manage_keep_tasks'
    | 'search_drive_contacts'
    | 'live_google_search'
    | 'download_playstore_app'
    | 'search_download_media'
    | 'manage_kids_study'
    | 'sleep_gwen';
  target?: string;
  payload?: string;
  value?: string;
  platform?: string;
  aspectRatio?: MediaAspectRatio;
  style?: string;
  confirmationText?: string;
}

export interface HealthCheckResult {
  ok: boolean;
  statusLabel?: 'Verified' | 'Invalid Key' | 'Quota Exceeded' | 'Unavailable';
  latencyMs: number;
  models: {
    id: string;
    label: string;
    role: string;
    status: 'active' | 'unavailable';
  }[];
  error?: string;
}
