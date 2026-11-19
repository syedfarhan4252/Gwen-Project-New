// 100% Browser-Direct BYOK Gemini SDK & Public API Service
// Runs directly in the browser with zero required Node/Express /api/* backend routes.
// All Gemini requests use the user's trimmed personal API key from localStorage/Settings.

import {
  FunctionDeclaration,
  GoogleGenAI,
  Type,
} from '@google/genai';
import { getActiveGeminiApiKey } from './apiKeyStorage';
import { buildGwenSystemInstruction } from '../shared/gwenSystemPrompt';
import type {
  BrowserMediaCandidate,
  CompanionCareState,
  ContinuousSessionState,
  EmpathySignal,
  IdentityCoreProfile,
  KidStudyBundle,
  LanguageMode,
  MediaAspectRatio,
  MemoryItem,
  ParsedCommandResult,
  Persona,
  PlayStoreAppResult,
  VoiceName,
  WeatherSnapshot,
  WebSearchSource,
} from '../types/gwen';
import type { VideoStoryboardSpec } from '../utils/mediaRenderer';

const ALLOWED_TEXT_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);
export const ALLOWED_VOICES = new Set<VoiceName>(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);

export type GwenApiErrorCode = 'INVALID_KEY' | 'QUOTA_EXCEEDED' | 'UNAVAILABLE';

export class GwenClientApiError extends Error {
  status: number;
  statusLabel: 'Invalid Key' | 'Quota Exceeded' | 'Unavailable';
  errorCode: GwenApiErrorCode;

  constructor(
    message: string,
    status: number,
    statusLabel: 'Invalid Key' | 'Quota Exceeded' | 'Unavailable',
    errorCode: GwenApiErrorCode
  ) {
    super(message);
    this.name = 'GwenClientApiError';
    this.status = status;
    this.statusLabel = statusLabel;
    this.errorCode = errorCode;
  }
}

export interface SafeFetchResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage?: string;
}

/**
 * Safely executes fetch() and parses JSON only after checking res.ok and wrapping
 * response parsing in try/catch so HTML error pages never throw "is not valid JSON".
 */
export async function safeFetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<SafeFetchResult<T>> {
  try {
    const res = await fetch(url, init);
    const rawText = await res.text().catch(() => '');

    if (!res.ok) {
      let parsedMsg = '';
      if (rawText) {
        try {
          const parsed = JSON.parse(rawText) as {
            error?: { message?: string } | string;
            message?: string;
          };
          if (typeof parsed.error === 'string') parsedMsg = parsed.error;
          else if (parsed.error && typeof parsed.error === 'object' && parsed.error.message) {
            parsedMsg = parsed.error.message;
          } else if (typeof parsed.message === 'string') {
            parsedMsg = parsed.message;
          }
        } catch {
          const snippet = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
          parsedMsg = snippet;
        }
      }
      return {
        ok: false,
        status: res.status,
        data: null,
        errorMessage: parsedMsg
          ? `HTTP ${res.status}: ${parsedMsg}`
          : `Request failed with HTTP ${res.status}`,
      };
    }

    if (!rawText.trim()) {
      return { ok: true, status: res.status, data: {} as T };
    }

    try {
      const data = JSON.parse(rawText) as T;
      return { ok: true, status: res.status, data };
    } catch {
      return {
        ok: false,
        status: res.status,
        data: null,
        errorMessage: `HTTP ${res.status}: Response was not valid JSON.`,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return {
      ok: false,
      status: 0,
      data: null,
      errorMessage: `Network error: ${msg}`,
    };
  }
}

export function extractRawErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message) return obj.message;
    if (obj.error instanceof Error) return obj.error.message;
    if (typeof obj.error === 'string' && obj.error) return obj.error;
    try {
      return JSON.stringify(err);
    } catch {
      return 'Unexpected Gemini API error';
    }
  }
  return String(err);
}

function isTransientHighDemand(err: unknown): boolean {
  const raw = extractRawErrorMessage(err);
  return (
    raw.includes('503') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('high demand') ||
    raw.includes('overloaded')
  );
}

function isQuotaExhausted(err: unknown): boolean {
  const raw = extractRawErrorMessage(err);
  return raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED');
}

function isModelNotFound(err: unknown): boolean {
  const raw = extractRawErrorMessage(err);
  return (
    raw.includes('404') ||
    raw.includes('NOT_FOUND') ||
    raw.toLowerCase().includes('is not found for api version') ||
    raw.toLowerCase().includes('not supported for')
  );
}

export function toFriendlyGeminiError(err: unknown): GwenClientApiError {
  if (err instanceof GwenClientApiError) return err;
  const raw = extractRawErrorMessage(err);

  if (raw.includes('GEMINI_API_KEY')) {
    return new GwenClientApiError(
      'No Gemini API key configured. Open Settings → Gemini API Key to add your personal Google AI Studio key.',
      401,
      'Invalid Key',
      'INVALID_KEY'
    );
  }
  if (
    raw.includes('401') ||
    raw.includes('403') ||
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('API_KEY_INVALID') ||
    raw.toLowerCase().includes('api key not valid')
  ) {
    return new GwenClientApiError(
      'Your Gemini API key was rejected (Invalid or Expired). Open Settings → Gemini API Key to update it.',
      403,
      'Invalid Key',
      'INVALID_KEY'
    );
  }
  if (isQuotaExhausted(err)) {
    return new GwenClientApiError(
      'Your Gemini API key reached its quota limit (429). Wait a moment or update your key in Settings → Gemini API Key.',
      429,
      'Quota Exceeded',
      'QUOTA_EXCEEDED'
    );
  }
  if (isTransientHighDemand(err)) {
    return new GwenClientApiError(
      'Gemini is temporarily experiencing high demand. Please retry in a moment.',
      503,
      'Unavailable',
      'UNAVAILABLE'
    );
  }
  if (isModelNotFound(err)) {
    return new GwenClientApiError(
      'The requested Gemini model is currently unavailable for your key. Try switching models in Settings.',
      404,
      'Unavailable',
      'UNAVAILABLE'
    );
  }
  return new GwenClientApiError(
    raw || 'Unable to reach Gemini right now. Please retry.',
    500,
    'Unavailable',
    'UNAVAILABLE'
  );
}

export function createBrowserGeminiClient(overrideApiKey?: string | null): {
  ai: GoogleGenAI;
  apiKey: string;
} {
  const apiKey = (
    (typeof overrideApiKey === 'string' ? overrideApiKey : getActiveGeminiApiKey()) ?? ''
  ).trim();
  if (!apiKey) {
    throw new GwenClientApiError(
      'GEMINI_API_KEY_MISSING: No Gemini API key is configured. Open Settings → Gemini API Key to add your free Google AI Studio key.',
      401,
      'Invalid Key',
      'INVALID_KEY'
    );
  }
  const ai = new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
  });
  return { ai, apiKey };
}

async function generateWithFallback(
  ai: GoogleGenAI,
  primaryModel: string,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>
) {
  const fallbackConfig = params.config
    ? { ...params.config, thinkingConfig: undefined }
    : undefined;
  const candidateModels = Array.from(
    new Set([
      primaryModel,
      primaryModel !== 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen',
      'gemini-2.5-flash',
    ])
  );

  let lastErr: unknown;
  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i];
    try {
      const response = await ai.models.generateContent({
        model,
        ...params,
        config: i === 0 ? params.config : fallbackConfig,
      });
      return { response, usedModel: model };
    } catch (err) {
      lastErr = err;
      const canRetryNext =
        isTransientHighDemand(err) || isQuotaExhausted(err) || isModelNotFound(err);
      if (!canRetryNext) {
        throw toFriendlyGeminiError(err);
      }
      if (isTransientHighDemand(err) && i === candidateModels.length - 1) {
        await new Promise((r) => setTimeout(r, 850));
        const response = await ai.models.generateContent({
          model,
          ...params,
          config: fallbackConfig,
        });
        return { response, usedModel: model };
      }
    }
  }
  throw toFriendlyGeminiError(lastErr);
}

// ---------------------------------------------------------------------------
// Live API Model Discovery & Function Declarations (Direct Browser WSS)
// ---------------------------------------------------------------------------

interface DiscoveredModelsCache {
  bidiModels: string[];
  expiresAt: number;
}

const bidiModelCache = new Map<string, DiscoveredModelsCache>();

const PREFERRED_LIVE_MODELS = [
  'gemini-3.8-live',
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-2.5-flash-native-audio-preview-09-2025',
  'gemini-2.5-flash-native-audio-latest',
];

function isDeprecatedModelName(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return (
    lower.includes('gemini-1.5') ||
    lower.includes('gemini-1.0') ||
    lower.includes('gemini-2.0') ||
    lower === 'gemini-pro'
  );
}

export async function discoverBidiModels(rawApiKey: string): Promise<string[]> {
  const apiKey = rawApiKey.trim();
  const cacheKey = `${apiKey.slice(0, 8)}:${apiKey.slice(-6)}:${apiKey.length}`;
  const cached = bidiModelCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.bidiModels;
  }

  const discovered: string[] = [];
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4500);
    const result = await safeFetchJson<{
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    }>(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`,
      { signal: controller.signal }
    );
    window.clearTimeout(timer);

    if (result.ok && result.data?.models) {
      for (const m of result.data.models) {
        const methods = m.supportedGenerationMethods ?? [];
        if (!methods.includes('bidiGenerateContent')) continue;
        const cleanName = (m.name || '').replace(/^models\//, '').trim();
        if (!cleanName || isDeprecatedModelName(cleanName)) continue;
        discovered.push(cleanName);
      }
    }
  } catch {
    // Non-fatal: fall through to curated candidate list
  }

  const ordered: string[] = [];
  const pushUnique = (id: string) => {
    if (id && !ordered.includes(id) && !isDeprecatedModelName(id)) {
      ordered.push(id);
    }
  };

  for (const pref of PREFERRED_LIVE_MODELS) {
    if (discovered.includes(pref)) pushUnique(pref);
  }
  for (const d of discovered) {
    if (d.includes('native-audio') || d.includes('live')) pushUnique(d);
  }
  for (const d of discovered) {
    pushUnique(d);
  }
  for (const pref of PREFERRED_LIVE_MODELS) {
    pushUnique(pref);
  }

  bidiModelCache.set(cacheKey, {
    bidiModels: ordered,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });

  return ordered;
}

export const LIVE_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'saveMemory',
    description:
      'Saves a permanent or enduring user fact, preference, routine, project detail, or personal detail into the Permanent Memory Core.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        content: { type: Type.STRING, description: 'Clear, concise fact to remember about the user.' },
        category: {
          type: Type.STRING,
          description: 'One of: Preferences, Personal Context, Routines, Projects, Custom Notes',
        },
        pinned: { type: Type.BOOLEAN, description: 'True if important.' },
        isPermanent: { type: Type.BOOLEAN, description: 'True for enduring identity or permanent facts.' },
      },
      required: ['content', 'category'],
    },
  },
  {
    name: 'forgetMemory',
    description: 'Removes a matching memory from the Neural Memory Core.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Keyword or phrase describing the memory to forget.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'switchPersona',
    description:
      'Switches Gwen to another persona such as Home Teacher, Girlfriend (GF), Boyfriend (BF), Best Friend, Funny / Witty, Productivity Coach, Tech & Coding Buddy, Casual Hinglish Friend, Calm Listener, or Default Companion.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        personaName: { type: Type.STRING, description: 'Name of the persona to activate.' },
      },
      required: ['personaName'],
    },
  },
  {
    name: 'controlSystemSetting',
    description:
      'Controls phone system settings hands-free: screen brightness (0-100), media/ring/alarm volume (0-100 or up/down/mute), Do Not Disturb, Flashlight, Wi-Fi, Bluetooth, or Battery Saver.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        setting: {
          type: Type.STRING,
          description:
            'One of: brightness, media_volume, ring_volume, alarm_volume, do_not_disturb, flashlight, wifi, bluetooth, battery_saver',
        },
        value: {
          type: Type.STRING,
          description: 'Percentage number (e.g. "40", "100"), relative ("up", "down", "mute", "max"), or boolean ("on", "off", "toggle").',
        },
      },
      required: ['setting', 'value'],
    },
  },
  {
    name: 'manageCalendar',
    description: 'Creates, lists, or updates calendar events.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        operation: { type: Type.STRING, description: 'One of: create, list' },
        title: { type: Type.STRING, description: 'Event title when creating.' },
        dateTime: { type: Type.STRING, description: 'Human-readable date and time, e.g. "Tomorrow at 3:00 PM".' },
        notes: { type: Type.STRING, description: 'Optional notes.' },
      },
      required: ['operation'],
    },
  },
  {
    name: 'navigateMaps',
    description: 'Searches a location and opens turn-by-turn navigation via Google Maps.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        destination: { type: Type.STRING, description: 'Destination address, landmark, or search query.' },
      },
      required: ['destination'],
    },
  },
  {
    name: 'composeMessage',
    description:
      'Prepares a WhatsApp, Facebook Messenger, or SMS message draft for a contact. ALWAYS ask the user aloud to confirm the recipient and message text before sending.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        platform: { type: Type.STRING, description: 'One of: "WhatsApp", "Messenger", or "SMS".' },
        recipient: { type: Type.STRING, description: 'Contact name or phone number.' },
        message: { type: Type.STRING, description: 'Exact message text to send.' },
      },
      required: ['platform', 'recipient', 'message'],
    },
  },
  {
    name: 'generateImage',
    description:
      'Generates an AI image matching the user description, artistic style, and aspect ratio (1:1, 16:9, 9:16, 4:3), previews it in Gwen HUD, and saves it to the Gallery.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: { type: Type.STRING, description: 'Rich visual description of the image to generate.' },
        aspectRatio: { type: Type.STRING, description: 'One of: "1:1", "16:9", "9:16", "4:3". Defaults to "1:1".' },
        style: { type: Type.STRING, description: 'Visual style such as cinematic, cyberpunk, minimalist, watercolor, sci-fi, or illustration.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generateVideo',
    description:
      'Generates an animated AI motion video clip matching the user description, aspect ratio, and duration (3-10 seconds), plays it in HUD, and saves it to Gallery.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: { type: Type.STRING, description: 'Visual scene and motion description for the video.' },
        aspectRatio: { type: Type.STRING, description: 'Either "16:9" or "9:16" or "1:1". Defaults to "16:9".' },
        duration: { type: Type.NUMBER, description: 'Duration in seconds (3 to 10). Defaults to 6.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'buildWebsite',
    description:
      'Designs and generates a complete responsive HTML/CSS/JS webpage from the user description, opens an interactive live preview, and saves locally.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Short webpage title.' },
        description: { type: Type.STRING, description: 'Detailed layout, sections, theme, and features requested by the user.' },
      },
      required: ['description'],
    },
  },
  {
    name: 'getWeather',
    description: 'Fetches real-time local weather conditions, temperature, humidity, and rain forecast.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        city: { type: Type.STRING, description: 'Optional city name; omit to use the user’s current device location.' },
      },
    },
  },
  {
    name: 'manageCompanionCare',
    description:
      'Manages daily wellness and care routines: log drinking water, set water goal, trigger/schedule rest breaks, or schedule an IST wake-up alarm.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'One of: log_water, set_water_goal, set_wakeup, toggle_rest_reminders, trigger_wakeup_now',
        },
        value: { type: Type.STRING, description: 'Optional value such as wake-up time (e.g. "06:30"), glass count, or interval.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'changeTimezone',
    description:
      'Changes Gwen’s active timezone ONLY when the user explicitly requests switching away from permanent Indian Standard Time (Asia/Kolkata).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        timezone: { type: Type.STRING, description: 'IANA timezone identifier such as "Asia/Kolkata", "UTC", "America/New_York".' },
      },
      required: ['timezone'],
    },
  },
  {
    name: 'manageAlarmTimer',
    description: 'Sets an alarm or starts a countdown timer.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        kind: { type: Type.STRING, description: 'Either "alarm" or "timer".' },
        timeOrDuration: { type: Type.STRING, description: 'Alarm time (e.g. "7:30 AM") or timer duration (e.g. "5 minutes").' },
        label: { type: Type.STRING, description: 'Short label for the alarm or timer.' },
      },
      required: ['kind', 'timeOrDuration'],
    },
  },
  {
    name: 'manageGmail',
    description:
      'Reads unread Gmail emails, searches emails by sender/subject, or drafts an email to send via the linked Google Account. ALWAYS read recipient, subject, and body aloud for confirmation before sending.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        operation: { type: Type.STRING, description: 'One of: list_unread, search, draft_send' },
        query: { type: Type.STRING, description: 'Search query when operation is search.' },
        to: { type: Type.STRING, description: 'Recipient email address or contact name when operation is draft_send.' },
        subject: { type: Type.STRING, description: 'Email subject line when operation is draft_send.' },
        body: { type: Type.STRING, description: 'Email message body when operation is draft_send.' },
      },
      required: ['operation'],
    },
  },
  {
    name: 'manageGoogleCalendar',
    description:
      'Checks upcoming Google Calendar events, schedules a new event (IST Asia/Kolkata default), or requests deleting an event (always confirmed first).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        operation: { type: Type.STRING, description: 'One of: list, create, delete' },
        summary: { type: Type.STRING, description: 'Event title/summary.' },
        startIso: { type: Type.STRING, description: 'ISO 8601 start date-time in IST.' },
        endIso: { type: Type.STRING, description: 'ISO 8601 end date-time in IST.' },
        description: { type: Type.STRING, description: 'Optional event notes.' },
      },
      required: ['operation'],
    },
  },
  {
    name: 'manageKeepAndTasks',
    description: 'Lists, creates, or completes Google Tasks and local-synced Keep-style notes/checklists.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        operation: { type: Type.STRING, description: 'One of: list, create_task, complete_task, create_note' },
        title: { type: Type.STRING, description: 'Task or note title.' },
        content: { type: Type.STRING, description: 'Optional note body or task details.' },
      },
      required: ['operation'],
    },
  },
  {
    name: 'searchDriveAndContacts',
    description: 'Searches Google Contacts by name, searches Google Drive files, or backs up a note/creation to Drive.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        operation: { type: Type.STRING, description: 'One of: search_contacts, search_drive, backup_note' },
        query: { type: Type.STRING, description: 'Contact name, file search keyword, or backup title.' },
        content: { type: Type.STRING, description: 'Optional text content when operation is backup_note.' },
      },
      required: ['operation', 'query'],
    },
  },
  {
    name: 'liveGoogleSearch',
    description: 'Performs a live Google Search with real-time web grounding for current news, facts, apps, people, or verified web links.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Search query to look up live on Google.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'downloadPlayStoreApp',
    description:
      'Searches Google Play Store for an Android app, shows the app name & developer confirmation sheet, and opens Play Store only after explicit user confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        appName: { type: Type.STRING, description: 'Name of the app to find on Google Play Store.' },
      },
      required: ['appName'],
    },
  },
  {
    name: 'searchAndDownloadMedia',
    description:
      'Searches the browser for a high-resolution picture of a person/subject or downloadable file, shows an in-app Preview Card, and downloads only after user confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Subject of the picture or file to find online.' },
        kind: { type: Type.STRING, description: 'Either "image" or "file". Defaults to "image".' },
      },
      required: ['query'],
    },
  },
  {
    name: 'manageKidsStudy',
    description:
      'Manages isolated per-child Home Teacher study profiles: switches active child when a kid says their name, records a lesson, practice log, or quiz score strictly under that child’s ID, or gives parents a progress report.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        operation: { type: Type.STRING, description: 'One of: switch_child, log_lesson, log_practice, record_quiz, parent_report' },
        kidName: { type: Type.STRING, description: 'Actual name of the child.' },
        subject: { type: Type.STRING, description: 'Subject name such as Math, English, Science, Reading.' },
        topic: { type: Type.STRING, description: 'Lesson or quiz topic.' },
        summary: { type: Type.STRING, description: 'Brief summary, corrections, or feedback.' },
        score: { type: Type.NUMBER, description: 'Quiz score achieved.' },
        total: { type: Type.NUMBER, description: 'Quiz total questions.' },
        stars: { type: Type.NUMBER, description: 'Bonus stars earned (1 to 5).' },
      },
      required: ['operation'],
    },
  },
  {
    name: 'manageReminderTask',
    description: 'Creates, lists, or completes a reminder or task.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        operation: { type: Type.STRING, description: 'One of: create, complete, list' },
        title: { type: Type.STRING, description: 'Task or reminder title.' },
        dueText: { type: Type.STRING, description: 'Optional due time text.' },
      },
      required: ['operation'],
    },
  },
  {
    name: 'runDeviceAction',
    description:
      'Executes hands-free app or HUD commands: open app, toggle screen share, toggle live camera vision, toggle floating avatar, scroll, go back, or navigate Gwen tabs.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'One of: open_app, navigate_tab, toggle_screen_share, toggle_camera, toggle_overlay, scroll_down, scroll_up, go_back, go_home',
        },
        target: { type: Type.STRING, description: 'Target app name, tab name, or on/off state.' },
      },
      required: ['action'],
    },
  },
  {
    name: 'sleepGwen',
    description: 'Invoked when the user says "Gwen, go to sleep", "Sleep", or "Log off".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        farewell: { type: Type.STRING, description: 'Short warm goodbye phrase.' },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// 1. Direct Health Check
// ---------------------------------------------------------------------------
export interface GwenHealthResult {
  ok: boolean;
  statusLabel: string;
  latencyMs: number;
  models: Array<{ id: string; label: string; role: string; status: string }>;
  error?: string;
  errorCode?: GwenApiErrorCode;
}

export async function runGwenHealthCheck(): Promise<GwenHealthResult> {
  const start = Date.now();
  try {
    const { ai } = createBrowserGeminiClient();
    await generateWithFallback(ai, 'gemini-3.1-flash-lite', {
      contents: 'Respond with OK.',
    });
    return {
      ok: true,
      statusLabel: 'Verified',
      latencyMs: Date.now() - start,
      models: [
        {
          id: 'gemini-3.8-live',
          label: 'Gemini Live Voice & Vision',
          role: 'Direct Browser 1-on-1 Audio, Camera Vision, Screen Share & Tools',
          status: 'active',
        },
        {
          id: 'gemini-4-hydrogen',
          label: 'Gemini Flash (Hydrogen)',
          role: 'Multimodal Chat, Memory Core & Command Parsing',
          status: 'active',
        },
        {
          id: 'gemini-3.1-flash-lite',
          label: 'Gemini Flash Lite',
          role: 'Ultra-Low-Latency Quick Responses & High-Demand Fallback',
          status: 'active',
        },
        {
          id: 'gemini-3.8-flash-lite-tts',
          label: 'Gemini Natural TTS',
          role: 'High-Clarity Text-to-Speech Replies',
          status: 'active',
        },
      ],
    };
  } catch (err) {
    const friendly = toFriendlyGeminiError(err);
    return {
      ok: false,
      statusLabel: friendly.statusLabel,
      errorCode: friendly.errorCode,
      latencyMs: Date.now() - start,
      models: [],
      error: friendly.message,
    };
  }
}

// ---------------------------------------------------------------------------
// 2. Direct Multimodal Chat
// ---------------------------------------------------------------------------
export interface GwenChatParams {
  message: string;
  history?: Array<{ role: 'user' | 'gwen'; text: string }>;
  persona?: Persona;
  languageMode?: LanguageMode;
  memories?: MemoryItem[];
  identityCore?: IdentityCoreProfile;
  deviceUserName?: string;
  timezone?: string;
  weather?: WeatherSnapshot | null;
  careState?: CompanionCareState;
  sessionState?: ContinuousSessionState | null;
  googleAccountEmail?: string | null;
  activeKidStudy?: KidStudyBundle | null;
  allKidNames?: string[];
  proactiveEmpathyEnabled?: boolean;
  incognitoMode?: boolean;
  model?: string;
  screenFrameBase64?: string;
  cameraFrameBase64?: string;
  faceRecognized?: boolean;
  voiceRecognized?: boolean;
}

export async function sendGwenChat(
  params: GwenChatParams
): Promise<{ text: string; model: string }> {
  const { ai } = createBrowserGeminiClient();
  const selectedModel =
    params.model && ALLOWED_TEXT_MODELS.has(params.model)
      ? params.model
      : 'gemini-4-hydrogen';

  const systemInstruction = buildGwenSystemInstruction({
    persona: params.persona,
    languageMode: params.languageMode ?? 'auto',
    memories: params.memories ?? [],
    identityCore: params.identityCore,
    deviceUserName: params.deviceUserName,
    timezone: params.timezone,
    weather: params.weather,
    careState: params.careState,
    sessionState: params.sessionState,
    googleAccountEmail: params.googleAccountEmail,
    activeKidStudy: params.activeKidStudy,
    allKidNames: params.allKidNames,
    proactiveEmpathyEnabled: params.proactiveEmpathyEnabled !== false,
    incognitoMode: Boolean(params.incognitoMode),
    isLiveVoice: false,
    hasScreenShare: Boolean(params.screenFrameBase64),
    hasCameraVision: Boolean(params.cameraFrameBase64),
    faceRecognized: Boolean(params.faceRecognized),
    voiceRecognized: Boolean(params.voiceRecognized),
  });

  const recentHistory = (params.history ?? []).slice(-12).map((item) => ({
    role: item.role === 'user' ? 'user' : 'model',
    parts: [{ text: item.text }],
  }));

  const currentParts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (params.screenFrameBase64) {
    const cleaned = params.screenFrameBase64.replace(/^data:image\/\w+;base64,/, '');
    currentParts.push({ inlineData: { mimeType: 'image/jpeg', data: cleaned } });
  }
  if (params.cameraFrameBase64) {
    const cleaned = params.cameraFrameBase64.replace(/^data:image\/\w+;base64,/, '');
    currentParts.push({ inlineData: { mimeType: 'image/jpeg', data: cleaned } });
  }
  currentParts.push({ text: params.message });

  const { response, usedModel } = await generateWithFallback(ai, selectedModel, {
    contents: [...recentHistory, { role: 'user', parts: currentParts }],
    config: { systemInstruction },
  });

  return {
    text: (response.text ?? '').trim(),
    model: usedModel,
  };
}

// ---------------------------------------------------------------------------
// 3. Direct Gemini TTS
// ---------------------------------------------------------------------------
export async function generateGwenTts(params: {
  text: string;
  voiceName?: VoiceName;
  style?: string;
}): Promise<{ audioBase64: string; mimeType: string }> {
  const trimmed = params.text.trim().slice(0, 900);
  if (!trimmed) {
    throw new GwenClientApiError('Text is required for speech generation.', 400, 'Unavailable', 'UNAVAILABLE');
  }

  const { ai } = createBrowserGeminiClient();
  const safeVoice: VoiceName =
    params.voiceName && ALLOWED_VOICES.has(params.voiceName) ? params.voiceName : 'Zephyr';

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: trimmed,
              speechMetadata: {
                style: params.style || 'Warm, natural conversational AI companion',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: safeVoice },
          },
        },
      },
    });

    const audioBase64 =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioBase64) {
      throw new GwenClientApiError(
        'Speech synthesis returned empty audio.',
        502,
        'Unavailable',
        'UNAVAILABLE'
      );
    }
    return { audioBase64, mimeType: 'audio/wav' };
  } catch (err) {
    throw toFriendlyGeminiError(err);
  }
}

// ---------------------------------------------------------------------------
// 4. Direct Audio Transcription (Standard Voice MediaRecorder Fallback)
// ---------------------------------------------------------------------------
export async function transcribeGwenAudio(params: {
  audioBase64: string;
  mimeType?: string;
  languageHint?: string;
}): Promise<{ transcript: string }> {
  const { ai } = createBrowserGeminiClient();
  const cleaned = params.audioBase64.replace(/^data:audio\/[^;]+;base64,/, '');
  const prompt = params.languageHint
    ? `Transcribe the user's speech accurately (likely ${params.languageHint}). Return ONLY the exact spoken words, with no labels or commentary. If silent or unintelligible, return an empty string.`
    : 'Transcribe the user speech accurately. Return ONLY the exact spoken words, with no labels or commentary. If silent or unintelligible, return an empty string.';

  const { response } = await generateWithFallback(ai, 'gemini-3.5-transcribe', {
    contents: {
      parts: [
        { inlineData: { mimeType: params.mimeType || 'audio/webm', data: cleaned } },
        { text: prompt },
      ],
    },
  });
  return { transcript: (response.text ?? '').trim() };
}

// ---------------------------------------------------------------------------
// 5. Direct Automatic Permanent Memory & Continuity Extraction
// ---------------------------------------------------------------------------
export interface ExtractedMemoriesPayload {
  memories: Array<{
    content: string;
    category: string;
    pinned: boolean;
    isPermanent?: boolean;
  }>;
  sessionContinuity: {
    lastLeftTopic?: string;
    lastSummary?: string;
    lastUserMood?: string;
    unfinishedThreads?: string[];
  } | null;
}

export async function extractGwenMemories(params: {
  userMessage: string;
  assistantReply?: string;
  existingMemories?: string[];
}): Promise<ExtractedMemoriesPayload> {
  if (!params.userMessage?.trim()) {
    return { memories: [], sessionContinuity: null };
  }
  const { ai } = createBrowserGeminiClient();
  const existing = params.existingMemories ?? [];

  const prompt = `Analyze the following conversation turn with Gwen. Extract:
1. Enduring major facts AND subtle micro-details (small preferences, ongoing stories, moods, promises, tasks) worth saving permanently. Ignore facts already in Existing Memories.
2. Exact session continuity metadata: lastLeftTopic (short phrase), lastSummary (1 concise sentence), lastUserMood (one word like happy/calm/tired/stressed/excited/curious), and unfinishedThreads (up to 3 short strings of open topics or promises).

Existing Memories:
${existing.length > 0 ? existing.map((m) => `- ${m}`).join('\n') : '(none)'}

User said: "${params.userMessage}"
${params.assistantReply ? `Gwen replied: "${params.assistantReply}"` : ''}`;

  const { response } = await generateWithFallback(ai, 'gemini-3.1-flash-lite', {
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          memories: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                content: { type: Type.STRING, description: 'Concise factual or micro-detail statement.' },
                category: {
                  type: Type.STRING,
                  description:
                    'Must be one of: Preferences, Personal Context, Routines, Projects, Custom Notes, Micro-Detail',
                },
                pinned: { type: Type.BOOLEAN },
                isPermanent: { type: Type.BOOLEAN },
              },
              required: ['content', 'category', 'pinned', 'isPermanent'],
            },
          },
          sessionContinuity: {
            type: Type.OBJECT,
            properties: {
              lastLeftTopic: { type: Type.STRING },
              lastSummary: { type: Type.STRING },
              lastUserMood: { type: Type.STRING },
              unfinishedThreads: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['lastLeftTopic', 'lastSummary', 'lastUserMood', 'unfinishedThreads'],
          },
        },
        required: ['memories', 'sessionContinuity'],
      },
    },
  });

  try {
    const parsed = JSON.parse((response.text ?? '{"memories":[]}').trim()) as Partial<ExtractedMemoriesPayload>;
    return {
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
      sessionContinuity: parsed.sessionContinuity ?? null,
    };
  } catch {
    return { memories: [], sessionContinuity: null };
  }
}

// ---------------------------------------------------------------------------
// 6. Direct Face Enrollment Appearance Traits
// ---------------------------------------------------------------------------
export async function describeGwenAppearance(imageBase64: string): Promise<string> {
  const { ai } = createBrowserGeminiClient();
  const cleaned = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const { response } = await generateWithFallback(ai, 'gemini-4-hydrogen', {
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: cleaned } },
        {
          text: 'Briefly summarize 3-4 friendly, respectful, non-sensitive visual appearance traits to help a personal AI companion remember the user visually (e.g. glasses/no glasses, hairstyle, clothing style vibe). Keep it under 22 words in one concise sentence.',
        },
      ],
    },
  });
  return (response.text ?? '').trim();
}

// ---------------------------------------------------------------------------
// 7. Direct Proactive Camera Empathy Cue Check
// ---------------------------------------------------------------------------
export async function checkGwenEmpathyCue(
  cameraFrameBase64: string,
  userName?: string
): Promise<{
  condition?: EmpathySignal['condition'];
  confidence?: number;
  summary?: string;
  suggestedResponse?: string;
} | null> {
  const { ai } = createBrowserGeminiClient();
  const cleaned = cameraFrameBase64.replace(/^data:image\/\w+;base64,/, '');
  const { response } = await generateWithFallback(ai, 'gemini-3.1-flash-lite', {
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: cleaned } },
        {
          text: `Observe the person in this live webcam frame gently and empathetically as Gwen, their caring AI companion${userName ? ` (their name is ${userName})` : ''}.
Classify their visible state into ONE of: "calm", "happy", "tired", "stressed", "sad", "cough".
Only choose "tired", "stressed", "sad", or "cough" if there is a clear visual sign (slumped tired posture, rubbing eyes/forehead, visibly downcast/sad expression, holding throat/coughing). Otherwise return "calm" or "happy".
Return JSON with condition, confidence (0..1), summary (under 12 words), and suggestedResponse (a short, warm caring 1-sentence check-in if distressed, or empty string if calm/happy).`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          condition: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          summary: { type: Type.STRING },
          suggestedResponse: { type: Type.STRING },
        },
        required: ['condition', 'confidence', 'summary', 'suggestedResponse'],
      },
    },
  });

  try {
    return JSON.parse((response.text ?? '{}').trim()) as {
      condition?: EmpathySignal['condition'];
      confidence?: number;
      summary?: string;
      suggestedResponse?: string;
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 8. Direct AI Image Generator (SVG -> Client PNG Export)
// ---------------------------------------------------------------------------
export async function generateGwenImageSvg(
  prompt: string,
  aspectRatio: MediaAspectRatio = '1:1',
  style = 'cinematic digital illustration'
): Promise<{ svg: string; aspectRatio: MediaAspectRatio; style: string; prompt: string }> {
  const { ai } = createBrowserGeminiClient();
  const cleanPrompt = prompt.trim();
  const viewBox =
    aspectRatio === '16:9'
      ? '0 0 1280 720'
      : aspectRatio === '9:16'
        ? '0 0 720 1280'
        : aspectRatio === '4:3'
          ? '0 0 1024 768'
          : '0 0 1024 1024';

  const svgPrompt = `Create a stunning, richly layered, publication-grade SVG artwork illustrating: "${cleanPrompt}".
Artistic style: ${style}.
Canvas viewBox MUST be exactly "${viewBox}".
Requirements:
- Return ONLY raw valid <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">...</svg> with zero markdown fences and zero commentary.
- Use rich <defs> with multi-stop linearGradient, radialGradient, and subtle glow <filter> (feGaussianBlur) for atmospheric lighting, depth, foreground/midground/background layers, and crisp geometric/organic vector illustration details.
- Never include <script>, external image URLs, or text watermarks.`;

  const { response } = await generateWithFallback(ai, 'gemini-3.1-flash-lite', {
    contents: svgPrompt,
  });

  const raw = (response.text ?? '').trim();
  const svgMatch = raw.match(/<svg[\s\S]*<\/svg>/i);
  if (!svgMatch) {
    throw new GwenClientApiError(
      'Could not compose SVG artwork. Please retry with a clearer visual description.',
      502,
      'Unavailable',
      'UNAVAILABLE'
    );
  }
  return { svg: svgMatch[0], aspectRatio, style, prompt: cleanPrompt };
}

// ---------------------------------------------------------------------------
// 9. Direct AI Video Motion Storyboard Generator
// ---------------------------------------------------------------------------
export async function generateGwenVideoStoryboard(
  prompt: string,
  aspectRatio: MediaAspectRatio = '16:9',
  duration = 6
): Promise<{ storyboard: VideoStoryboardSpec; aspectRatio: MediaAspectRatio; duration: number }> {
  const { ai } = createBrowserGeminiClient();
  const safeDur = Math.max(3, Math.min(10, Number(duration) || 6));

  const { response } = await generateWithFallback(ai, 'gemini-3.1-flash-lite', {
    contents: `Design a 3-scene cinematic motion storyboard for a ${safeDur}-second animated video about: "${prompt.trim()}".
Pick vivid hex color palettes, atmospheric motifs from ["stars","mountains","city","waves","aurora","orb","grid","particles"], smooth camera motions from ["zoom_in","zoom_out","pan_right","pan_left"], and poetic short captions.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          mood: { type: Type.STRING },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                caption: { type: Type.STRING },
                palette: { type: Type.ARRAY, items: { type: Type.STRING } },
                accentColor: { type: Type.STRING },
                motifs: { type: Type.ARRAY, items: { type: Type.STRING } },
                cameraMotion: { type: Type.STRING },
              },
              required: ['title', 'caption', 'palette', 'accentColor', 'motifs', 'cameraMotion'],
            },
          },
        },
        required: ['title', 'mood', 'scenes'],
      },
    },
  });

  try {
    const storyboard = JSON.parse((response.text ?? '{}').trim()) as VideoStoryboardSpec;
    if (!storyboard?.scenes?.length) {
      throw new Error('Empty storyboard returned.');
    }
    return { storyboard, aspectRatio, duration: safeDur };
  } catch {
    throw new GwenClientApiError(
      'Video storyboard could not be parsed. Please retry.',
      502,
      'Unavailable',
      'UNAVAILABLE'
    );
  }
}

// ---------------------------------------------------------------------------
// 10. Direct Responsive Website Builder
// ---------------------------------------------------------------------------
export async function buildGwenWebsite(
  description: string,
  title?: string
): Promise<{ title: string; html: string }> {
  const { ai } = createBrowserGeminiClient();
  const sitePrompt = `Build a complete, polished, responsive, self-contained single-file HTML5 website with embedded <style> CSS and interactive <script> JavaScript.
Title: ${title || 'Gwen Generated Website'}
User Description: ${description.trim()}

Requirements:
- Return ONLY complete valid HTML starting with <!doctype html> and ending with </html> (no markdown fences or explanation).
- Modern, clean, responsive layout with strong typography, balanced whitespace, working interactive buttons/tabs/forms inside the page, and zero external broken asset URLs.
- Include a subtle footer credit: "Crafted with Gwen AI (created by Syed Farhan)".`;

  const { response } = await generateWithFallback(ai, 'gemini-4-hydrogen', {
    contents: sitePrompt,
  });

  let html = (response.text ?? '').trim();
  html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  const docIdx = html.toLowerCase().indexOf('<!doctype html');
  if (docIdx > 0) html = html.slice(docIdx);

  if (!html.toLowerCase().includes('<html')) {
    throw new GwenClientApiError(
      'Website generation returned incomplete HTML. Please try again.',
      502,
      'Unavailable',
      'UNAVAILABLE'
    );
  }

  const resolvedTitle =
    title?.trim() ||
    html.match(/<title>(.*?)<\/title>/i)?.[1]?.trim() ||
    description.trim().slice(0, 42);

  return { title: resolvedTitle, html };
}

// ---------------------------------------------------------------------------
// 11. Direct Live Google Search Grounding (with CORS Wikipedia Fallback)
// ---------------------------------------------------------------------------
export async function runGwenWebSearch(
  query: string,
  timezone = 'Asia/Kolkata'
): Promise<{ query: string; answer: string; sources: WebSearchSource[] }> {
  const { ai } = createBrowserGeminiClient();
  const cleanQ = query.trim();
  let answer = '';
  const sources: WebSearchSource[] = [];

  try {
    const { response } = await generateWithFallback(ai, 'gemini-4-hydrogen', {
      contents: `Answer this live web query concisely, accurately, and naturally as Gwen (in ${timezone} context when dates/times matter): "${cleanQ}"`,
      config: { tools: [{ googleSearch: {} }] },
    });

    answer = (response.text ?? '').trim();
    const rawChunks =
      (response as unknown as {
        candidates?: Array<{
          groundingMetadata?: {
            groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
          };
        }>;
      }).candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

    const seen = new Set<string>();
    for (const ch of rawChunks) {
      const uri = ch.web?.uri;
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);
      let domain = 'web';
      try {
        domain = new URL(uri).hostname.replace(/^www\./, '');
      } catch {
        domain = 'web';
      }
      sources.push({ title: ch.web?.title || domain, url: uri, domain });
      if (sources.length >= 5) break;
    }
  } catch (err) {
    // Re-throw auth errors immediately so user gets invalid key feedback
    const friendly = toFriendlyGeminiError(err);
    if (friendly.errorCode === 'INVALID_KEY') throw friendly;

    // Fallback: Live CORS-friendly Wikipedia OpenSearch snippets + Gemini synthesis
    const wikiSources: Array<{ title: string; url: string; domain: string; snippet?: string }> = [];
    const wikiRes = await safeFetchJson<{
      query?: { search?: Array<{ title?: string; snippet?: string }> };
    }>(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        cleanQ
      )}&srlimit=4&format=json&origin=*`
    );

    if (wikiRes.ok && wikiRes.data?.query?.search) {
      for (const item of wikiRes.data.query.search) {
        if (!item.title) continue;
        const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(
          item.title.replace(/\s+/g, '_')
        )}`;
        wikiSources.push({
          title: item.title,
          url,
          domain: 'en.wikipedia.org',
          snippet: (item.snippet || '').replace(/<[^>]+>/g, ''),
        });
      }
    }

    const contextBlock =
      wikiSources.length > 0
        ? `\nLive web search snippets:\n${wikiSources
            .map((s) => `- ${s.title}: ${s.snippet || ''}`)
            .join('\n')}`
        : '';

    const { response } = await generateWithFallback(ai, 'gemini-3.1-flash-lite', {
      contents: `Answer this web query concisely, accurately, and naturally as Gwen (using ${timezone} context if dates/times matter): "${cleanQ}"${contextBlock}`,
    });
    answer = (response.text ?? '').trim();
    for (const s of wikiSources) {
      sources.push({ title: s.title, url: s.url, domain: s.domain });
    }
  }

  return {
    query: cleanQ,
    answer: answer || 'I found results, please check the sources below.',
    sources,
  };
}

// ---------------------------------------------------------------------------
// 12. Direct Play Store App Lookup
// ---------------------------------------------------------------------------
export async function lookupPlayStoreApp(appName: string): Promise<PlayStoreAppResult> {
  const cleanName = appName.trim();
  const knownApps: Record<
    string,
    { appName: string; developer: string; packageId: string; summary: string }
  > = {
    spotify: {
      appName: 'Spotify: Music and Podcasts',
      developer: 'Spotify AB',
      packageId: 'com.spotify.music',
      summary: 'Stream music, playlists, and podcasts worldwide.',
    },
    telegram: {
      appName: 'Telegram',
      developer: 'Telegram FZ-LLC',
      packageId: 'org.telegram.messenger',
      summary: 'Fast, cloud-based secure messaging app.',
    },
    whatsapp: {
      appName: 'WhatsApp Messenger',
      developer: 'WhatsApp LLC',
      packageId: 'com.whatsapp',
      summary: 'Simple, reliable messaging and calling.',
    },
    instagram: {
      appName: 'Instagram',
      developer: 'Instagram',
      packageId: 'com.instagram.android',
      summary: 'Photos, Reels, and stories with friends.',
    },
    youtube: {
      appName: 'YouTube',
      developer: 'Google LLC',
      packageId: 'com.google.android.youtube',
      summary: 'Watch videos, music, and live streams.',
    },
    duolingo: {
      appName: 'Duolingo: Language Lessons',
      developer: 'Duolingo',
      packageId: 'com.duolingo',
      summary: 'Learn languages with bite-sized lessons.',
    },
    notion: {
      appName: 'Notion: Notes, Tasks, AI',
      developer: 'Notion Labs, Inc.',
      packageId: 'notion.id',
      summary: 'All-in-one notes, docs, and project workspace.',
    },
    netflix: {
      appName: 'Netflix',
      developer: 'Netflix, Inc.',
      packageId: 'com.netflix.mediaclient',
      summary: 'Watch TV shows, movies, and originals.',
    },
  };

  const key = cleanName.toLowerCase();
  const direct = Object.entries(knownApps).find(([k]) => key.includes(k))?.[1];
  if (direct) {
    return {
      ...direct,
      playStoreUrl: `https://play.google.com/store/apps/details?id=${direct.packageId}`,
      marketUri: `market://details?id=${direct.packageId}`,
    };
  }

  const { ai } = createBrowserGeminiClient();
  const { response } = await generateWithFallback(ai, 'gemini-3.1-flash-lite', {
    contents: `Identify the official Google Play Store Android app details for "${cleanName}".
Return JSON with: appName (official store title), developer (publisher name), packageId (exact Android package id like com.example.app, or empty string if uncertain), and summary (1 short sentence).`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          appName: { type: Type.STRING },
          developer: { type: Type.STRING },
          packageId: { type: Type.STRING },
          summary: { type: Type.STRING },
        },
        required: ['appName', 'developer', 'packageId', 'summary'],
      },
    },
  });

  let parsed: { appName?: string; developer?: string; packageId?: string; summary?: string } = {};
  try {
    parsed = JSON.parse((response.text ?? '{}').trim()) as typeof parsed;
  } catch {
    parsed = {};
  }

  const pkg = (parsed.packageId || '').trim();
  const playStoreUrl = pkg
    ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}`
    : `https://play.google.com/store/search?q=${encodeURIComponent(cleanName)}&c=apps`;
  const marketUri = pkg
    ? `market://details?id=${encodeURIComponent(pkg)}`
    : `market://search?q=${encodeURIComponent(cleanName)}`;

  return {
    appName: parsed.appName || cleanName,
    developer: parsed.developer || 'Google Play Store',
    packageId: pkg || 'search',
    summary: parsed.summary || `Official Google Play Store listing for ${cleanName}.`,
    playStoreUrl,
    marketUri,
  };
}

// ---------------------------------------------------------------------------
// 13. Direct Browser Media Search & Download (CORS-Friendly Wikimedia / Wiki)
// ---------------------------------------------------------------------------
export async function searchBrowserMediaClient(
  query: string,
  kind: 'image' | 'file' = 'image'
): Promise<{ query: string; candidate: BrowserMediaCandidate | null; candidates: BrowserMediaCandidate[] }> {
  const cleanQ = query.trim();
  const candidates: BrowserMediaCandidate[] = [];

  const wikiUrl =
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanQ)}` +
    `&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url|mime|thumbmime&iiurlwidth=720&format=json&origin=*`;

  const wikiRes = await safeFetchJson<{
    query?: {
      pages?: Record<
        string,
        {
          title?: string;
          imageinfo?: Array<{ url?: string; thumburl?: string; mime?: string }>;
        }
      >;
    };
  }>(wikiUrl);

  if (wikiRes.ok && wikiRes.data?.query?.pages) {
    for (const page of Object.values(wikiRes.data.query.pages)) {
      const info = page.imageinfo?.[0];
      if (!info?.url) continue;
      const mime = info.mime || 'image/jpeg';
      if (kind === 'image' && !mime.startsWith('image/')) continue;
      const cleanTitle = (page.title || cleanQ)
        .replace(/^File:/i, '')
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(/_/g, ' ');
      const ext = mime.includes('png')
        ? 'png'
        : mime.includes('webp')
          ? 'webp'
          : mime.includes('pdf')
            ? 'pdf'
            : 'jpg';
      const slug = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || 'download';
      candidates.push({
        title: cleanTitle,
        sourceDomain: 'commons.wikimedia.org',
        imageUrl: info.thumburl || info.url,
        downloadUrl: info.url,
        kind: mime.startsWith('image/') ? 'image' : 'file',
        mimeType: mime,
        suggestedFilename: `gwen-${slug}.${ext}`,
      });
      if (candidates.length >= 4) break;
    }
  }

  if (candidates.length === 0) {
    const summaryRes = await safeFetchJson<{
      title?: string;
      originalimage?: { source?: string };
      thumbnail?: { source?: string };
    }>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        cleanQ.replace(/\s+/g, '_')
      )}`
    );
    if (summaryRes.ok && summaryRes.data) {
      const url = summaryRes.data.originalimage?.source || summaryRes.data.thumbnail?.source;
      if (url) {
        const slug = (summaryRes.data.title || cleanQ)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .slice(0, 32);
        candidates.push({
          title: summaryRes.data.title || cleanQ,
          sourceDomain: 'en.wikipedia.org',
          imageUrl: summaryRes.data.thumbnail?.source || url,
          downloadUrl: url,
          kind: 'image',
          mimeType: 'image/jpeg',
          suggestedFilename: `gwen-${slug}.jpg`,
        });
      }
    }
  }

  return { query: cleanQ, candidate: candidates[0] || null, candidates };
}

export async function downloadBrowserMediaClient(
  downloadUrl: string,
  filename: string
): Promise<void> {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'gwen-download';
  try {
    const res = await fetch(downloadUrl);
    if (res.ok) {
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = safeFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      return;
    }
  } catch {
    // Fall back to direct anchor download if cross-origin CORS blocks blob fetch
  }

  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = safeFilename;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ---------------------------------------------------------------------------
// 14. Direct Live Weather Fetch (Open-Meteo + BigDataCloud, zero backend)
// ---------------------------------------------------------------------------
export async function fetchLiveWeatherClient(opts: {
  city?: string;
  lat?: number;
  lon?: number;
}): Promise<WeatherSnapshot | null> {
  let lat = typeof opts.lat === 'number' ? opts.lat : NaN;
  let lon = typeof opts.lon === 'number' ? opts.lon : NaN;
  let cityName = (opts.city || '').trim();

  if (cityName && (Number.isNaN(lat) || Number.isNaN(lon))) {
    const geo = await safeFetchJson<{
      results?: Array<{ latitude: number; longitude: number; name: string; admin1?: string }>;
    }>(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`
    );
    if (geo.ok && geo.data?.results?.[0]) {
      const hit = geo.data.results[0];
      lat = hit.latitude;
      lon = hit.longitude;
      cityName = hit.admin1 ? `${hit.name}, ${hit.admin1}` : hit.name;
    }
  }

  // Default to New Delhi (IST hub) if location permission was not granted yet
  if (Number.isNaN(lat) || Number.isNaN(lon) || (lat === 0 && lon === 0)) {
    lat = 28.6139;
    lon = 77.209;
    if (!cityName) cityName = 'New Delhi, India';
  }

  if (!cityName) {
    const rev = await safeFetchJson<{
      city?: string;
      locality?: string;
      principalSubdivision?: string;
    }>(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
    );
    if (rev.ok && rev.data) {
      cityName =
        [rev.data.city || rev.data.locality, rev.data.principalSubdivision]
          .filter(Boolean)
          .join(', ') || 'Your Location';
    } else {
      cityName = 'Your Location';
    }
  }

  const weatherRes = await safeFetchJson<{
    current?: {
      temperature_2m: number;
      relative_humidity_2m: number;
      apparent_temperature: number;
      is_day: number;
      weather_code: number;
      wind_speed_10m: number;
    };
    hourly?: { precipitation_probability?: number[] };
  }>(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&hourly=precipitation_probability&forecast_days=1&timezone=Asia%2FKolkata`
  );

  if (!weatherRes.ok || !weatherRes.data) return null;
  const w = weatherRes.data;
  const code = w.current?.weather_code ?? 0;
  const codeMap: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Foggy',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Light rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Light snow',
    80: 'Rain showers',
    81: 'Heavy rain showers',
    95: 'Thunderstorm',
  };

  const rainProbs = w.hourly?.precipitation_probability ?? [];
  const maxRain = rainProbs.length > 0 ? Math.max(...rainProbs.slice(0, 8)) : 0;

  return {
    city: cityName || 'New Delhi, India',
    latitude: lat,
    longitude: lon,
    temperatureC: w.current?.temperature_2m ?? 26,
    feelsLikeC: w.current?.apparent_temperature ?? 26,
    humidity: w.current?.relative_humidity_2m ?? 50,
    windKmh: w.current?.wind_speed_10m ?? 8,
    condition: codeMap[code] || 'Clear & pleasant',
    weatherCode: code,
    rainChance: maxRain,
    isDay: w.current?.is_day !== 0,
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 15. Direct Voice Command Intent Parser (Deterministic Fast-Path + Gemini)
// ---------------------------------------------------------------------------
export async function parseGwenCommand(
  utterance: string,
  personaNames: string[] = []
): Promise<ParsedCommandResult> {
  const rawText = utterance.trim();
  if (!rawText) return { isCommand: false, action: 'none' };
  const lower = rawText.toLowerCase();

  // Instant deterministic fast-path for high-precision hands-free device commands
  if (/\b(go to sleep|sleep mode|log off|log out|goodnight gwen)\b/i.test(lower) || lower === 'sleep') {
    return {
      isCommand: true,
      action: 'sleep_gwen',
      confirmationText: 'Going to sleep now. Tap Wake Gwen whenever you want to talk again.',
    };
  }

  const brightMatch = lower.match(/\bbrightness\b.*?(\d{1,3}|max|full|min|up|down|higher|lower|dim)/i);
  if (brightMatch) {
    return {
      isCommand: true,
      action: 'control_system_setting',
      target: 'brightness',
      value: brightMatch[1],
      confirmationText: `Updating screen brightness (${brightMatch[1]}).`,
    };
  }

  const volMatch = lower.match(
    /\b(media|ring|alarm)?\s*volume\b.*?(\d{1,3}|max|mute|silent|up|down|higher|lower)|\bmute\s+(media|volume|sound)\b/i
  );
  if (volMatch) {
    const channel = volMatch[1] ? `${volMatch[1]}_volume` : 'media_volume';
    const val = volMatch[2] || 'mute';
    return {
      isCommand: true,
      action: 'control_system_setting',
      target: channel,
      value: val,
      confirmationText: `Adjusting ${channel.replace('_', ' ')} (${val}).`,
    };
  }

  const toggleMatch = lower.match(
    /\b(turn on|turn off|enable|disable|toggle)\s+(do not disturb|dnd|flashlight|torch|wi-?fi|bluetooth|battery saver)\b/i
  );
  if (toggleMatch) {
    const verb = toggleMatch[1].toLowerCase();
    const val =
      verb.includes('on') || verb.includes('enable')
        ? 'on'
        : verb.includes('off') || verb.includes('disable')
          ? 'off'
          : 'toggle';
    const setting = toggleMatch[2].toLowerCase().replace(/[\s-]+/g, '_');
    return {
      isCommand: true,
      action: 'control_system_setting',
      target: setting === 'dnd' ? 'do_not_disturb' : setting === 'torch' ? 'flashlight' : setting,
      value: val,
      confirmationText: `Updated ${toggleMatch[2]}.`,
    };
  }

  const imgMatch = rawText.match(
    /\b(?:generate|create|draw|make|paint)\s+(?:me\s+)?(?:an?\s+)?(?:ai\s+)?(?:image|picture|artwork|wallpaper|photo|illustration)\s+(?:of\s+)?(.+)/i
  );
  if (imgMatch) {
    const desc = imgMatch[1].trim();
    const ratio = (desc.match(/\b(16:9|9:16|4:3|1:1)\b/)?.[1] || '1:1') as MediaAspectRatio;
    return {
      isCommand: true,
      action: 'generate_image',
      payload: desc,
      aspectRatio: ratio,
      style: desc.includes('cyber')
        ? 'cyberpunk neon'
        : desc.includes('minimal')
          ? 'minimalist vector'
          : 'cinematic illustration',
      confirmationText: `Creating your ${ratio} artwork right now — I will preview it and save it to your gallery!`,
    };
  }

  const vidMatch = rawText.match(
    /\b(?:generate|create|make|render)\s+(?:me\s+)?(?:a\s+)?(?:(\d+)\s*(?:s|sec|second|seconds)\s+)?(?:ai\s+)?video\s+(?:of\s+)?(.+)/i
  );
  if (vidMatch) {
    const dur = vidMatch[1] || '6';
    const desc = vidMatch[2].trim();
    const ratio = (desc.match(/\b(16:9|9:16|1:1)\b/)?.[1] || '16:9') as MediaAspectRatio;
    return {
      isCommand: true,
      action: 'generate_video',
      payload: desc,
      value: dur,
      aspectRatio: ratio,
      confirmationText: `Rendering your ${dur}-second ${ratio} AI motion video now — I will preview it and save it to your gallery!`,
    };
  }

  const webMatch = rawText.match(
    /\b(?:build|create|design|make|generate)\s+(?:me\s+)?(?:a\s+)?(?:responsive\s+)?(?:website|webpage|web page|landing page|portfolio site)\s*(?:for|about|with|:)?\s*(.+)/i
  );
  if (webMatch) {
    return {
      isCommand: true,
      action: 'build_website',
      payload: webMatch[1].trim(),
      target: webMatch[1].trim().slice(0, 42),
      confirmationText: 'Building your responsive website now — I will open the live preview and save it locally!',
    };
  }

  if (/\b(weather|temperature|forecast|is it going to rain|will it rain|how hot|how cold)\b/i.test(lower)) {
    const cityMatch = rawText.match(/\bin\s+([a-z\s]{2,30})\b/i);
    return {
      isCommand: true,
      action: 'get_weather',
      target: cityMatch ? cityMatch[1].trim() : undefined,
      confirmationText: '',
    };
  }

  if (/\b(i drank|logged|had a glass of|drink)\s*(?:some\s+)?water\b/i.test(lower)) {
    return {
      isCommand: true,
      action: 'manage_companion_care',
      target: 'log_water',
      confirmationText: 'Awesome job staying hydrated! I logged a glass of water for you.',
    };
  }

  const wakeMatch = rawText.match(/\bwake\s+me\s+up\s+(?:at|for)\s+([0-9: ]+(?:am|pm)?)/i);
  if (wakeMatch) {
    return {
      isCommand: true,
      action: 'manage_companion_care',
      target: 'set_wakeup',
      value: wakeMatch[1].trim(),
      confirmationText: `Got it — I scheduled your escalating gentle wake-up alarm for ${wakeMatch[1].trim()} IST.`,
    };
  }

  const msgMatch =
    rawText.match(
      /(?:send\s+(?:an?\s+)?)?(whatsapp|messenger|sms)\s+(?:message\s+)?to\s+([a-z0-9\s]+?)\s+(?:saying|that|:)\s+(.+)/i
    ) ||
    rawText.match(
      /(?:message|text)\s+([a-z0-9\s]+?)\s+on\s+(whatsapp|messenger|sms)\s+(?:saying|that|:)?\s*(.+)/i
    );
  if (msgMatch) {
    const isFirstPattern = /whatsapp|messenger|sms/i.test(msgMatch[1]);
    const rawPlat = (isFirstPattern ? msgMatch[1] : msgMatch[2]).toLowerCase();
    const platform = rawPlat.includes('mess')
      ? 'Messenger'
      : rawPlat.includes('sms')
        ? 'SMS'
        : 'WhatsApp';
    const recipient = (isFirstPattern ? msgMatch[2] : msgMatch[1]).trim();
    const body = msgMatch[3].trim();
    return {
      isCommand: true,
      action: 'compose_message',
      platform,
      target: recipient,
      payload: body,
      confirmationText: `I drafted a ${platform} message to ${recipient}: "${body}". Please confirm before I send it.`,
    };
  }

  const timerMatch = rawText.match(
    /\bset\s+(?:a\s+)?(\d+\s*(?:seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h))\s+timer(?:\s+for\s+(.+))?/i
  );
  if (timerMatch) {
    return {
      isCommand: true,
      action: 'manage_alarm_timer',
      target: 'timer',
      value: timerMatch[1].trim(),
      payload: (timerMatch[2] || 'Timer').trim(),
      confirmationText: `Started your ${timerMatch[1].trim()} timer${timerMatch[2] ? ` for ${timerMatch[2].trim()}` : ''}.`,
    };
  }

  const alarmMatch = rawText.match(
    /\bset\s+(?:an?\s+)?alarm\s+(?:for|at)\s+([0-9: ]+(?:am|pm)?)(?:\s+(?:for|labeled)\s+(.+))?/i
  );
  if (alarmMatch) {
    return {
      isCommand: true,
      action: 'manage_alarm_timer',
      target: 'alarm',
      value: alarmMatch[1].trim(),
      payload: (alarmMatch[2] || 'Gwen Alarm').trim(),
      confirmationText: `Alarm set for ${alarmMatch[1].trim()} IST.`,
    };
  }

  const navMatch = rawText.match(/\b(?:navigate|directions|route)\s+to\s+(.+)/i);
  if (navMatch) {
    return {
      isCommand: true,
      action: 'navigate_maps',
      target: navMatch[1].trim(),
      confirmationText: `Prepared Google Maps navigation to ${navMatch[1].trim()}.`,
    };
  }

  const personaMatch = rawText.match(/\b(?:switch|change)\s+(?:persona|mode)\s+to\s+(.+)/i);
  if (personaMatch) {
    return {
      isCommand: true,
      action: 'switch_persona',
      target: personaMatch[1].trim(),
      confirmationText: `Switching active persona to ${personaMatch[1].trim()}.`,
    };
  }

  const camMatch = lower.match(
    /\b(turn on|start|enable|open|turn off|stop|close|switch|flip)\s+(?:live\s+)?camera(?:\s+vision)?\b/i
  );
  if (camMatch) {
    const v = camMatch[1];
    const target =
      v.includes('flip') || v.includes('switch')
        ? 'flip'
        : v.includes('off') || v.includes('stop') || v.includes('close')
          ? 'off'
          : 'on';
    return {
      isCommand: true,
      action: 'toggle_camera',
      target,
      confirmationText:
        target === 'flip'
          ? 'Switching camera lens.'
          : target === 'on'
            ? 'Turning on Live Camera Vision.'
            : 'Turning off Live Camera Vision.',
    };
  }

  const playMatch = rawText.match(
    /\b(?:download|install|get)\s+(.+?)\s+(?:from|on)\s+(?:the\s+)?(?:google\s+)?play\s*store\b/i
  );
  if (playMatch) {
    return {
      isCommand: true,
      action: 'download_playstore_app',
      target: playMatch[1].trim(),
      confirmationText: '',
    };
  }

  const mediaDownloadMatch = rawText.match(
    /\b(?:find\s+and\s+download|download|search\s+and\s+download)\s+(?:an?\s+)?(picture|photo|image|pic|file|pdf|document)\s+(?:of\s+)?(.+?)(?:\s+from\s+(?:the\s+)?browser|\s+online)?$/i
  );
  if (mediaDownloadMatch) {
    const kind = /file|pdf|document/i.test(mediaDownloadMatch[1]) ? 'file' : 'image';
    return {
      isCommand: true,
      action: 'search_download_media',
      target: mediaDownloadMatch[2].trim(),
      value: kind,
      confirmationText: '',
    };
  }

  const searchMatch = rawText.match(
    /\b(?:search\s+google\s+for|google\s+search|look\s+up|search\s+the\s+web\s+for|latest\s+news\s+(?:on|about))\s+(.+)/i
  );
  if (searchMatch) {
    return {
      isCommand: true,
      action: 'live_google_search',
      target: searchMatch[1].trim(),
      confirmationText: '',
    };
  }

  if (/\b(check|read|summarize|show)\s+(?:my\s+)?(?:unread\s+)?(?:gmail|emails?|inbox)\b/i.test(lower)) {
    return { isCommand: true, action: 'manage_gmail', target: 'list_unread', confirmationText: '' };
  }

  const sendEmailMatch = rawText.match(
    /\bsend\s+(?:an?\s+)?(?:gmail|email)\s+to\s+([^\s,]+)\s+(?:with\s+subject\s+(.+?)\s+)?(?:saying|body|:)\s+(.+)/i
  );
  if (sendEmailMatch) {
    return {
      isCommand: true,
      action: 'manage_gmail',
      target: 'draft_send',
      platform: sendEmailMatch[1].trim(),
      value: (sendEmailMatch[2] || 'Message from Gwen').trim(),
      payload: sendEmailMatch[3].trim(),
      confirmationText: '',
    };
  }

  const addTaskMatch = rawText.match(
    /\b(?:add|create)\s+(.+?)\s+(?:to\s+my\s+)?(?:google\s+)?(?:tasks?|keep\s+notes?|to-?do)\b/i
  );
  if (addTaskMatch) {
    return {
      isCommand: true,
      action: 'manage_keep_tasks',
      target: 'create_task',
      payload: addTaskMatch[1].trim(),
      confirmationText: '',
    };
  }

  if (/\b(?:list|check|show)\s+(?:my\s+)?(?:google\s+)?(?:tasks?|keep\s+notes?)\b/i.test(lower)) {
    return { isCommand: true, action: 'manage_keep_tasks', target: 'list', confirmationText: '' };
  }

  const driveMatch = rawText.match(/\b(?:search|find|check)\s+(?:my\s+)?(?:google\s+)?drive\s+(?:for\s+)?(.+)/i);
  if (driveMatch) {
    return {
      isCommand: true,
      action: 'search_drive_contacts',
      target: 'search_drive',
      payload: driveMatch[1].trim(),
      confirmationText: '',
    };
  }

  const contactMatch = rawText.match(
    /\b(?:find|look\s+up|search)\s+(?:my\s+)?(?:google\s+)?contact(?:s)?\s+(?:for\s+)?(.+)/i
  );
  if (contactMatch) {
    return {
      isCommand: true,
      action: 'search_drive_contacts',
      target: 'search_contacts',
      payload: contactMatch[1].trim(),
      confirmationText: '',
    };
  }

  const parentReportMatch = rawText.match(/\bhow\s+is\s+([a-z]+)\s+doing(?:\s+in\s+([a-z\s]+))?/i);
  if (parentReportMatch) {
    return {
      isCommand: true,
      action: 'manage_kids_study',
      target: 'parent_report',
      payload: parentReportMatch[1].trim(),
      value: parentReportMatch[2]?.trim(),
      confirmationText: '',
    };
  }

  // Fallback to Gemini structured intent detection directly from browser
  try {
    const { ai } = createBrowserGeminiClient();
    const prompt = `Determine if the user's message is a direct app, phone settings, Google Workspace (Gmail/Calendar/Tasks/Drive/Contacts), live Google search, Play Store/browser download, Home Teacher/kids study, media/website creation, weather, companion care, organizer, messaging, vision, sleep, memory, or persona command for Gwen.
Available Personas: ${personaNames.join(', ')}

Command actions:
- manage_gmail, manage_keep_tasks, search_drive_contacts, live_google_search, download_playstore_app, search_download_media, manage_kids_study
- generate_image, generate_video, build_website, get_weather, manage_companion_care, change_timezone
- sleep_gwen: "Gwen, go to sleep", "Sleep", "Log off"
- control_system_setting: brightness, media_volume, ring_volume, alarm_volume, do_not_disturb, flashlight, wifi, bluetooth, battery_saver
- manage_calendar, navigate_maps, compose_message (WhatsApp/Messenger/SMS), manage_alarm_timer, manage_reminder_task
- toggle_camera, toggle_screen_share, toggle_overlay, switch_persona, save_memory, forget_memory, open_app, navigate_tab, scroll_page, go_back, summarize_screen, translate_screen, none

User message: "${rawText}"`;

    const { response } = await generateWithFallback(ai, 'gemini-3.1-flash-lite', {
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isCommand: { type: Type.BOOLEAN },
            action: { type: Type.STRING },
            target: { type: Type.STRING },
            payload: { type: Type.STRING },
            value: { type: Type.STRING },
            platform: { type: Type.STRING },
            confirmationText: { type: Type.STRING },
          },
          required: ['isCommand', 'action'],
        },
      },
    });

    const parsed = JSON.parse(
      (response.text ?? '{"isCommand":false,"action":"none"}').trim()
    ) as ParsedCommandResult;
    return parsed;
  } catch {
    return { isCommand: false, action: 'none' };
  }
}
