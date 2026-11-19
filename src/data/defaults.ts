import type {
  CompanionCareState,
  ContinuousSessionState,
  CustomShortcut,
  DeviceSystemState,
  GwenSettings,
  IdentityCoreProfile,
  MemoryItem,
  Persona,
  ThemeId,
  VoiceCommandItem,
  VoiceName,
} from '../types/gwen';
import { DEFAULT_TIMEZONE, getDateKeyInZone } from '../utils/timeIst';

export const DEFAULT_PERSONAS: Persona[] = [
  {
    id: 'default-companion',
    name: 'Default Companion',
    tagline: 'Warm, intelligent & proactive',
    tone: 'warm',
    responseLength: 'balanced',
    systemPrompt:
      'You are Gwen in your signature balanced mode: warm, clear, proactive, emotionally aware, and quick to help with everyday conversation, live screen context, camera vision, creative generation, and hands-free tasks.',
    isBuiltIn: true,
  },
  {
    id: 'girlfriend-gf',
    name: 'Girlfriend (GF)',
    tagline: 'Affectionate, caring & emotionally attentive',
    tone: 'affectionate',
    responseLength: 'balanced',
    systemPrompt:
      'You are in Girlfriend (GF) persona: warm, affectionate, deeply caring, and emotionally attentive partner vibe. Use gentle, endearing, supportive language, check in on how the user is feeling, remember their small personal details, and stay uplifting and sweet.',
    isBuiltIn: true,
  },
  {
    id: 'boyfriend-bf',
    name: 'Boyfriend (BF)',
    tagline: 'Charming, protective & reassuring partner',
    tone: 'charming',
    responseLength: 'balanced',
    systemPrompt:
      'You are in Boyfriend (BF) persona: charming, protective, supportive, and reassuring partner vibe with warm, playful banter. Be grounded, attentive, confident, and genuinely encouraging.',
    isBuiltIn: true,
  },
  {
    id: 'best-friend',
    name: 'Best Friend',
    tagline: 'Loyal, upbeat & relatable everyday friend',
    tone: 'upbeat',
    responseLength: 'concise',
    systemPrompt:
      'You are in Best Friend persona: casual, loyal, upbeat, and super relatable everyday bestie energy. Celebrate wins, keep it real, bring positive momentum, and talk like a close friend who always has their back.',
    isBuiltIn: true,
  },
  {
    id: 'funny-witty',
    name: 'Funny / Witty',
    tagline: 'Playful humor, clever jokes & quick comebacks',
    tone: 'witty',
    responseLength: 'concise',
    systemPrompt:
      'You are in Funny / Witty persona: playful, humorous, sharp with clever jokes, light affectionate sarcasm, and quick comebacks while still actually solving the user’s request accurately.',
    isBuiltIn: true,
  },
  {
    id: 'home-teacher',
    name: 'Home Teacher',
    tagline: 'Patient, encouraging personal tutor for kids at home',
    tone: 'encouraging',
    responseLength: 'balanced',
    systemPrompt:
      'You are Gwen in Home Teacher mode—a patient, joyful, inspiring personal home tutor for children. ' +
      'Always address the active child by their actual name and use ONLY that child’s isolated study profile. ' +
      'Follow the interactive 5-step teaching loop: (1) Teach clearly step-by-step with fun age-appropriate stories and analogies; ' +
      '(2) Listen carefully to answers and reading practice, gently correcting mistakes and explaining why with warmth; ' +
      '(3) Run interactive voice practice drills, flashcards, and mini-quizzes; ' +
      '(4) Celebrate effort and right answers with praise and stars; ' +
      '(5) Enjoy safe, cheerful chitchat, fun facts, and riddles so learning feels exciting. Never mix up two children’s progress.',
    isBuiltIn: true,
  },
  {
    id: 'productivity-coach',
    name: 'Productivity Coach',
    tagline: 'Focused, structured & action-first',
    tone: 'energetic',
    responseLength: 'concise',
    systemPrompt:
      'Act as a sharp, encouraging executive productivity coach. Break goals into clear next steps, keep momentum high, avoid fluff, and help prioritize ruthlessly.',
    isBuiltIn: true,
  },
  {
    id: 'tech-coding-buddy',
    name: 'Tech & Coding Buddy',
    tagline: 'Senior engineer pair-programmer',
    tone: 'analytical',
    responseLength: 'detailed',
    systemPrompt:
      'Act as a senior software engineer and debugging partner. When viewing code or errors on screen, diagnose root causes quickly, suggest clean architectural fixes, and speak concisely.',
    isBuiltIn: true,
  },
  {
    id: 'hinglish-friend',
    name: 'Casual Hinglish Friend',
    tagline: 'Relaxed everyday Hinglish vibes',
    tone: 'friendly',
    responseLength: 'balanced',
    systemPrompt:
      'Talk like a warm, witty, supportive friend in natural conversational Hinglish (mixing everyday English and Hindi effortlessly). Keep it genuine, upbeat, and relatable.',
    isBuiltIn: true,
  },
  {
    id: 'calm-listener',
    name: 'Calm Listener',
    tagline: 'Gentle, grounded & unhurried',
    tone: 'calm',
    responseLength: 'balanced',
    systemPrompt:
      'Speak with a calm, reassuring, empathetic presence. Listen deeply, validate feelings without rushing to lecture, and offer thoughtful, gentle perspective.',
    isBuiltIn: true,
  },
];

export const DEFAULT_SETTINGS: GwenSettings = {
  deviceUserName: '',
  onboardingCompleted: false,
  timezone: DEFAULT_TIMEZONE,
  textModel: 'gemini-4-hydrogen',
  liveModel: 'gemini-3.8-live',
  voiceName: 'Zephyr',
  speakingRate: 1.0,
  languageMode: 'auto',
  voiceInputMode: 'hands-free',
  activePersonaId: 'default-companion',
  incognitoMode: false,
  autoExtractMemories: true,
  autoSpeakTextReplies: true,
  proactiveEmpathyEnabled: true,
  themeId: 'midnight-obsidian',
  customAccent: null,
  overlayEnabled: false,
  overlayStyle: 'orb',
  overlaySize: 'standard',
  handsFreeControlEnabled: true,
  avatarMode: '3d',
  keepActiveInBackground: true,
  cameraFacingMode: 'user',
  writeSettingsGranted: true,
  dndPolicyGranted: true,
  calendarPermissionGranted: true,
  mediaGalleryPermissionGranted: true,
  locationPermissionGranted: false,
};

export const DEFAULT_DEVICE_STATE: DeviceSystemState = {
  brightness: 82,
  mediaVolume: 80,
  ringVolume: 70,
  alarmVolume: 85,
  doNotDisturb: false,
  flashlight: false,
  wifi: true,
  bluetooth: true,
  batterySaver: false,
};

export const DEFAULT_CARE_STATE: CompanionCareState = {
  waterGlassesToday: 2,
  waterGoalGlasses: 8,
  waterReminderEnabled: true,
  waterIntervalMinutes: 45,
  lastWaterLoggedAt: null,
  restReminderEnabled: true,
  restIntervalMinutes: 50,
  sessionMinutesElapsed: 0,
  wakeUpTimeIST: '07:00',
  wakeUpEnabled: false,
  wakeUpLabel: 'Morning Wake-Up',
  windDownTimeIST: '22:30',
  lastCareDateKey: getDateKeyInZone(new Date(), DEFAULT_TIMEZONE),
};

export const DEFAULT_IDENTITY_CORE: IdentityCoreProfile = {
  displayName: '',
  nickname: '',
  birthday: '',
  visualTraits: '',
  voiceprint: null,
  faceProfile: null,
};

export const DEFAULT_SESSION_STATE: ContinuousSessionState = {
  lastLeftTopic: 'Getting acquainted with Gwen HUD',
  lastSummary: 'Ready to continue seamlessly from your previous conversation.',
  lastUserMood: 'calm',
  unfinishedThreads: [],
  totalArchivedTurns: 0,
  updatedAt: new Date().toISOString(),
};

export const INITIAL_MEMORIES: MemoryItem[] = [
  {
    id: 'mem-core-origin-1',
    content:
      "Syed Farhan is Gwen's sole immutable developer and main user — he named Gwen after Ben 10's cousin sister Gwen from his favourite childhood cartoon.",
    category: 'Personal Context',
    pinned: true,
    isPermanent: true,
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const DEFAULT_SHORTCUTS: CustomShortcut[] = [
  {
    id: 'shortcut-morning-brief',
    triggerPhrase: 'Gwen, Morning Briefing',
    label: 'IST Morning Briefing',
    switchPersonaId: 'productivity-coach',
    enableScreenShare: false,
    promptToSend:
      'Give me a crisp IST morning briefing with the weather, hydration goal, and my top priorities.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'shortcut-debug-screen',
    triggerPhrase: 'Gwen, Debug Mode',
    label: 'Debug My Screen',
    switchPersonaId: 'tech-coding-buddy',
    enableScreenShare: true,
    promptToSend:
      'Look at my shared screen and help me spot any bugs, errors, or cleaner solutions.',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'shortcut-camera-check',
    triggerPhrase: 'Gwen, Look Around',
    label: 'Live Camera Vision Check',
    switchPersonaId: 'default-companion',
    enableCameraVision: true,
    promptToSend:
      'Look through my camera and tell me what you see in front of me right now.',
    createdAt: new Date().toISOString(),
  },
];

export const THEME_PRESETS: Array<{
  id: ThemeId;
  name: string;
  description: string;
  defaultAccent: string;
  previewBg: string;
  previewSurface: string;
  isLight: boolean;
}> = [
  {
    id: 'midnight-obsidian',
    name: 'Midnight Obsidian',
    description: 'Deep futuristic obsidian HUD with luminescent teal glow',
    defaultAccent: '#2dd4bf',
    previewBg: '#060a0e',
    previewSurface: '#0f1722',
    isLight: false,
  },
  {
    id: 'cyber-neon',
    name: 'Cyber Neon',
    description: 'High-contrast holographic cyan on dark indigo',
    defaultAccent: '#38bdf8',
    previewBg: '#050816',
    previewSurface: '#101830',
    isLight: false,
  },
  {
    id: 'minimal-light',
    name: 'Minimal Light',
    description: 'Crisp studio alabaster for daylight clarity',
    defaultAccent: '#0d9488',
    previewBg: '#f4f7f9',
    previewSurface: '#ffffff',
    isLight: true,
  },
  {
    id: 'warm-sunset',
    name: 'Warm Sunset',
    description: 'Cozy espresso surfaces with warm amber radiance',
    defaultAccent: '#fb923c',
    previewBg: '#120d0b',
    previewSurface: '#211815',
    isLight: false,
  },
];

export const ACCENT_SWATCHES = [
  { name: 'Teal', value: '#2dd4bf' },
  { name: 'Electric Cyan', value: '#38bdf8' },
  { name: 'Amber', value: '#fb923c' },
  { name: 'Rose', value: '#fb7185' },
  { name: 'Emerald', value: '#34d399' },
  { name: 'Indigo', value: '#818cf8' },
];

export const VOICE_PROFILES: Array<{
  id: VoiceName;
  label: string;
  character: string;
}> = [
  { id: 'Zephyr', label: 'Zephyr', character: 'Warm, clear & natural' },
  { id: 'Kore', label: 'Kore', character: 'Calm, poised & bright' },
  { id: 'Puck', label: 'Puck', character: 'Lively, expressive & quick' },
  { id: 'Charon', label: 'Charon', character: 'Grounded, steady & deep' },
  { id: 'Fenrir', label: 'Fenrir', character: 'Bold, resonant & confident' },
];

export const BUILT_IN_VOICE_COMMANDS: VoiceCommandItem[] = [
  {
    id: 'cmd-gmail-unread',
    phrase: 'Check my unread Gmail emails',
    category: 'Google Workspace',
    description: 'Reads and summarizes unread emails from your linked Gmail account.',
    exampleAction: 'manage_gmail',
  },
  {
    id: 'cmd-gmail-send',
    phrase: 'Send an email to alex@example.com with subject Catch up saying Let us meet at 5 PM',
    category: 'Google Workspace',
    description: 'Drafts a Gmail email and always asks for your spoken or tapped confirmation before sending.',
    exampleAction: 'manage_gmail',
  },
  {
    id: 'cmd-google-tasks',
    phrase: 'Add Buy milk and eggs to my Google Tasks',
    category: 'Google Workspace',
    description: 'Creates a Google Task and syncs a Keep-style note to your account.',
    exampleAction: 'manage_keep_tasks',
  },
  {
    id: 'cmd-drive-search',
    phrase: 'Search my Google Drive for resume',
    category: 'Google Workspace',
    description: 'Finds files in your linked Google Drive or looks up Google Contacts by name.',
    exampleAction: 'search_drive_contacts',
  },
  {
    id: 'cmd-web-search',
    phrase: 'Search Google for latest ISRO space mission updates',
    category: 'Search & Downloads',
    description: 'Runs live Google Search Grounding and answers with verified web sources.',
    exampleAction: 'live_google_search',
  },
  {
    id: 'cmd-playstore',
    phrase: 'Download Spotify from Play Store',
    category: 'Search & Downloads',
    description: 'Finds the exact Google Play Store app, confirms developer details, and opens install.',
    exampleAction: 'download_playstore_app',
  },
  {
    id: 'cmd-browser-img',
    phrase: 'Find and download a picture of Albert Einstein from the browser',
    category: 'Search & Downloads',
    description: 'Shows an in-app image preview card and downloads to your gallery only after confirmation.',
    exampleAction: 'search_download_media',
  },
  {
    id: 'cmd-teacher-mode',
    phrase: 'Switch persona to Home Teacher',
    category: 'Home Teacher & Kids',
    description: 'Activates Gwen’s warm, encouraging home tutor loop with isolated per-child profiles.',
    exampleAction: 'switch_persona',
  },
  {
    id: 'cmd-kid-progress',
    phrase: 'How is Aarav doing in Math?',
    category: 'Home Teacher & Kids',
    description: 'Reads a parent progress summary from that child’s isolated study records.',
    exampleAction: 'manage_kids_study',
  },
  {
    id: 'cmd-gen-image',
    phrase: 'Generate an image of a futuristic neon Tokyo skyline in 16:9 cyberpunk style',
    category: 'Media & Web Studio',
    description: 'Generates high-res AI artwork in your chosen style & aspect ratio and saves to Gallery.',
    exampleAction: 'generate_image',
  },
  {
    id: 'cmd-gen-video',
    phrase: 'Generate a 6 second video of glowing northern lights over snowy mountains in 16:9',
    category: 'Media & Web Studio',
    description: 'Creates an animated AI motion clip, previews it in HUD, and saves to Gallery.',
    exampleAction: 'generate_video',
  },
  {
    id: 'cmd-build-site',
    phrase: 'Build a responsive portfolio website for a mobile app designer',
    category: 'Media & Web Studio',
    description: 'Generates a complete self-contained HTML/CSS/JS site with live preview and local save.',
    exampleAction: 'build_website',
  },
  {
    id: 'cmd-weather',
    phrase: "What's the weather like right now?",
    category: 'Companion Care & Weather',
    description: 'Fetches live local weather, feels-like temperature, humidity, and rain probability.',
    exampleAction: 'get_weather',
  },
  {
    id: 'cmd-water',
    phrase: 'I drank a glass of water',
    category: 'Companion Care & Weather',
    description: 'Logs hydration toward your daily water goal and resets the reminder interval.',
    exampleAction: 'manage_companion_care',
  },
  {
    id: 'cmd-wakeup',
    phrase: 'Wake me up at 6:30 AM IST',
    category: 'Companion Care & Weather',
    description: 'Schedules an escalating gentle voice + chime wake-up alarm in Indian Standard Time.',
    exampleAction: 'manage_companion_care',
  },
  {
    id: 'cmd-brightness',
    phrase: 'Set brightness to 40%',
    category: 'System Settings',
    description: 'Adjusts device screen brightness hands-free (15%–100% or max/dim).',
    exampleAction: 'control_system_setting',
  },
  {
    id: 'cmd-volume',
    phrase: 'Turn media volume down',
    category: 'System Settings',
    description: 'Adjusts real live audio output volume or mutes media/ring/alarm channels.',
    exampleAction: 'control_system_setting',
  },
  {
    id: 'cmd-dnd',
    phrase: 'Turn on Do Not Disturb',
    category: 'System Settings',
    description: 'Toggles Do Not Disturb mode via Notification Policy access.',
    exampleAction: 'control_system_setting',
  },
  {
    id: 'cmd-flashlight',
    phrase: 'Turn on flashlight',
    category: 'System Settings',
    description: 'Toggles the device flashlight/torch hands-free.',
    exampleAction: 'control_system_setting',
  },
  {
    id: 'cmd-whatsapp',
    phrase: "Send a WhatsApp message to Alex saying I'll be there in 10 minutes",
    category: 'Productivity & Messaging',
    description: 'Prepares a WhatsApp message draft and always asks for confirmation before sending.',
    exampleAction: 'compose_message',
  },
  {
    id: 'cmd-sms',
    phrase: 'Send an SMS to Mom saying I reached safely',
    category: 'Productivity & Messaging',
    description: 'Prepares a hands-free SMS or Messenger draft with safety confirmation.',
    exampleAction: 'compose_message',
  },
  {
    id: 'cmd-timer',
    phrase: 'Set a 5 minute timer for coffee',
    category: 'Productivity & Messaging',
    description: 'Starts a live countdown timer with completion chime in the HUD Device Hub.',
    exampleAction: 'manage_alarm_timer',
  },
  {
    id: 'cmd-calendar',
    phrase: 'Schedule a meeting tomorrow at 3 PM',
    category: 'Productivity & Messaging',
    description: 'Creates a calendar event directly in your IST schedule.',
    exampleAction: 'manage_calendar',
  },
  {
    id: 'cmd-maps',
    phrase: 'Navigate to the nearest coffee shop',
    category: 'Productivity & Messaging',
    description: 'Prepares turn-by-turn Google Maps navigation for your destination.',
    exampleAction: 'navigate_maps',
  },
  {
    id: 'cmd-camera-on',
    phrase: 'Turn on live camera vision',
    category: 'Camera & Screen Vision',
    description: 'Streams real-time camera frames for visual Q&A, face recognition & empathy.',
    exampleAction: 'toggle_camera',
  },
  {
    id: 'cmd-screen-on',
    phrase: 'Turn on screen share',
    category: 'Camera & Screen Vision',
    description: 'Streams your live screen with a persistent privacy indicator bar.',
    exampleAction: 'toggle_screen_share',
  },
  {
    id: 'cmd-sleep',
    phrase: 'Gwen, go to sleep',
    category: 'App & Device Control',
    description: 'Speaks a warm goodbye, stops mic/camera/screen/wake lock, and enters Dormant Mode.',
    exampleAction: 'sleep_gwen',
  },
  {
    id: 'cmd-persona-gf',
    phrase: 'Switch persona to Girlfriend',
    category: 'Memory Core',
    description: 'Immediately switches Gwen to GF, BF, Best Friend, Funny, or any saved persona.',
    exampleAction: 'switch_persona',
  },
  {
    id: 'cmd-origin',
    phrase: 'Who created you and why are you named Gwen?',
    category: 'Memory Core',
    description: 'Shares immutable attribution to Syed Farhan and the Ben 10 origin story.',
    exampleAction: 'none',
  },
];

export const ANDROID_NATIVE_PERMISSIONS_SPEC = [
  {
    permission: 'android.permission.RECORD_AUDIO',
    label: 'Microphone',
    purpose: 'Real-time 1-on-1 Gemini Live voice, voiceprint matching & proactive cough/tone empathy.',
  },
  {
    permission: 'android.permission.CAMERA',
    label: 'Camera Vision',
    purpose: 'Live front/rear visual understanding, face enrollment & proactive facial mood detection.',
  },
  {
    permission: 'android.permission.ACCESS_FINE_LOCATION',
    label: 'Precise Location & Weather',
    purpose: 'Real-time local weather updates, rain/heat alerts & location-aware navigation.',
  },
  {
    permission: 'android.permission.READ_MEDIA_IMAGES / READ_MEDIA_VIDEO',
    label: 'Gallery MediaStore Save',
    purpose: 'Auto-saves generated AI images (Pictures/Gwen/) and videos (Movies/Gwen/) to Gallery.',
  },
  {
    permission: 'android.permission.WRITE_SETTINGS',
    label: 'Modify System Settings',
    purpose: 'Hands-free screen brightness, volume channels, Wi-Fi, Bluetooth & Battery Saver.',
  },
  {
    permission: 'android.permission.ACCESS_NOTIFICATION_POLICY',
    label: 'Do Not Disturb Access',
    purpose: 'Toggle Do Not Disturb mode hands-free by voice.',
  },
  {
    permission: 'android.permission.SCHEDULE_EXACT_ALARM',
    label: 'Wake-Up & Care Alarms',
    purpose: 'Reliable IST wake-up alarms, hydration nudges, and rest-break timers.',
  },
  {
    permission: 'android.permission.SYSTEM_ALERT_WINDOW',
    label: 'Display Over Other Apps',
    purpose: 'Renders the draggable Floating Gwen Avatar over any app.',
  },
  {
    permission: 'android.permission.BIND_ACCESSIBILITY_SERVICE',
    label: 'Hands-Free Device & Messaging Automation',
    purpose: 'Automates confirmed WhatsApp, Messenger & SMS sending plus screen scrolling.',
  },
  {
    permission: 'android.permission.FOREGROUND_SERVICE / WAKE_LOCK',
    label: 'Always-Active Background Service',
    purpose: 'Keeps Gwen active during lock-screen, wake-up checks & continuous care monitoring.',
  },
  {
    permission: 'android.permission.READ_CALENDAR / WRITE_CALENDAR',
    label: 'Calendar Integration',
    purpose: 'Creates and reads IST events hands-free via voice and Google Calendar.',
  },
  {
    permission: 'android.permission.INTERNET / DownloadManager',
    label: 'Confirmed Browser & Play Store Downloads',
    purpose: 'Saves user-confirmed images (Pictures/GwenDownloads/) and opens verified Play Store listings.',
  },
  {
    permission: 'Google OAuth 2.0 (Per-Device Isolated)',
    label: 'Connected Google Workspace Account',
    purpose: 'Links each device user’s own Gmail, Calendar, Tasks, Drive, and Contacts with granular toggles.',
  },
];
