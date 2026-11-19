import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  FunctionDeclaration,
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
  Type,
} from '@google/genai';
import { buildGwenSystemInstruction } from './src/shared/gwenSystemPrompt.ts';
import type {
  CompanionCareState,
  ContinuousSessionState,
  IdentityCoreProfile,
  KidStudyBundle,
  LanguageMode,
  MemoryItem,
  Persona,
  TranscriptMessage,
  VoiceName,
  WeatherSnapshot,
} from './src/types/gwen.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const ALLOWED_TEXT_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);
const ALLOWED_VOICES = new Set<VoiceName>(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);

function getAiClient(overrideApiKey?: string | null): GoogleGenAI {
  const userKey = typeof overrideApiKey === 'string' ? overrideApiKey.trim() : '';
  const apiKey = (userKey || process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY_MISSING: No Gemini API key is configured. Add your free Google AI Studio key in Settings → Gemini API Key.'
    );
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getRequestAiClient(req: express.Request): GoogleGenAI {
  const headerKey = req.header('x-gemini-api-key');
  return getAiClient(headerKey);
}

function extractRawErrorMessage(err: unknown): string {
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

function getFriendlyApiError(err: unknown): {
  status: number;
  statusLabel: 'Invalid Key' | 'Quota Exceeded' | 'Unavailable';
  errorCode: 'INVALID_KEY' | 'QUOTA_EXCEEDED' | 'UNAVAILABLE';
  message: string;
} {
  const raw = extractRawErrorMessage(err);
  if (raw.includes('GEMINI_API_KEY')) {
    return {
      status: 401,
      statusLabel: 'Invalid Key',
      errorCode: 'INVALID_KEY',
      message: 'No Gemini API key configured. Open Settings → Gemini API Key to add your personal Google AI Studio key.',
    };
  }
  if (
    raw.includes('401') ||
    raw.includes('403') ||
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('API_KEY_INVALID') ||
    raw.toLowerCase().includes('api key not valid')
  ) {
    return {
      status: 403,
      statusLabel: 'Invalid Key',
      errorCode: 'INVALID_KEY',
      message: 'Your Gemini API key was rejected (Invalid or Expired). Open Settings → Gemini API Key to update it.',
    };
  }
  if (isQuotaExhausted(err)) {
    return {
      status: 429,
      statusLabel: 'Quota Exceeded',
      errorCode: 'QUOTA_EXCEEDED',
      message: 'Your Gemini API key reached its quota limit (429). Wait a moment or update your key in Settings → Gemini API Key.',
    };
  }
  if (isTransientHighDemand(err)) {
    return {
      status: 503,
      statusLabel: 'Unavailable',
      errorCode: 'UNAVAILABLE',
      message: 'Gemini is temporarily experiencing high demand. Please retry in a moment.',
    };
  }
  if (raw.includes('404') || raw.includes('NOT_FOUND')) {
    return {
      status: 404,
      statusLabel: 'Unavailable',
      errorCode: 'UNAVAILABLE',
      message: 'The requested Gemini model is currently unavailable. Try switching models in Settings.',
    };
  }
  return {
    status: 500,
    statusLabel: 'Unavailable',
    errorCode: 'UNAVAILABLE',
    message: raw || 'Unable to reach Gemini right now. Please retry.',
  };
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

async function discoverBidiModels(apiKey: string): Promise<string[]> {
  const cacheKey = `${apiKey.slice(0, 8)}:${apiKey.slice(-6)}:${apiKey.length}`;
  const cached = bidiModelCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.bidiModels;
  }

  const discovered: string[] = [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`,
      { signal: controller.signal }
    );
    clearTimeout(timer);

    if (res.ok) {
      const json = (await res.json()) as {
        models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
      };
      for (const m of json.models ?? []) {
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

  // Order: discovered preferred models first, then other discovered bidi models, then curated fallbacks
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
        throw err;
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
  throw lastErr;
}

const LIVE_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'saveMemory',
    description:
      'Saves a permanent or enduring user fact, preference, routine, project detail, or personal detail into the Permanent Memory Core.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        content: {
          type: Type.STRING,
          description: 'Clear, concise fact to remember about the user.',
        },
        category: {
          type: Type.STRING,
          description:
            'One of: Preferences, Personal Context, Routines, Projects, Custom Notes',
        },
        pinned: {
          type: Type.BOOLEAN,
          description: 'True if important.',
        },
        isPermanent: {
          type: Type.BOOLEAN,
          description: 'True for enduring identity or permanent facts.',
        },
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
        query: {
          type: Type.STRING,
          description: 'Keyword or phrase describing the memory to forget.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'switchPersona',
    description:
      'Switches Gwen to another persona such as Girlfriend (GF), Boyfriend (BF), Best Friend, Funny / Witty, Productivity Coach, Tech & Coding Buddy, Casual Hinglish Friend, Calm Listener, or Default Companion.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        personaName: {
          type: Type.STRING,
          description: 'Name of the persona to activate.',
        },
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
          description:
            'Percentage number (e.g. "40", "100"), relative ("up", "down", "mute", "max"), or boolean ("on", "off", "toggle").',
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
        operation: {
          type: Type.STRING,
          description: 'One of: create, list',
        },
        title: {
          type: Type.STRING,
          description: 'Event title when creating.',
        },
        dateTime: {
          type: Type.STRING,
          description: 'Human-readable date and time, e.g. "Tomorrow at 3:00 PM".',
        },
        notes: {
          type: Type.STRING,
          description: 'Optional notes.',
        },
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
        destination: {
          type: Type.STRING,
          description: 'Destination address, landmark, or search query.',
        },
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
        platform: {
          type: Type.STRING,
          description: 'One of: "WhatsApp", "Messenger", or "SMS".',
        },
        recipient: {
          type: Type.STRING,
          description: 'Contact name or phone number.',
        },
        message: {
          type: Type.STRING,
          description: 'Exact message text to send.',
        },
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
        prompt: {
          type: Type.STRING,
          description: 'Rich visual description of the image to generate.',
        },
        aspectRatio: {
          type: Type.STRING,
          description: 'One of: "1:1", "16:9", "9:16", "4:3". Defaults to "1:1".',
        },
        style: {
          type: Type.STRING,
          description: 'Visual style such as cinematic, cyberpunk, minimalist, watercolor, sci-fi, or illustration.',
        },
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
        prompt: {
          type: Type.STRING,
          description: 'Visual scene and motion description for the video.',
        },
        aspectRatio: {
          type: Type.STRING,
          description: 'Either "16:9" or "9:16" or "1:1". Defaults to "16:9".',
        },
        duration: {
          type: Type.NUMBER,
          description: 'Duration in seconds (3 to 10). Defaults to 6.',
        },
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
        title: {
          type: Type.STRING,
          description: 'Short webpage title.',
        },
        description: {
          type: Type.STRING,
          description: 'Detailed layout, sections, theme, and features requested by the user.',
        },
      },
      required: ['description'],
    },
  },
  {
    name: 'getWeather',
    description:
      'Fetches real-time local weather conditions, temperature, humidity, and rain forecast.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        city: {
          type: Type.STRING,
          description: 'Optional city name; omit to use the user’s current device location.',
        },
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
        value: {
          type: Type.STRING,
          description: 'Optional value such as wake-up time (e.g. "06:30"), glass count, or interval.',
        },
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
        timezone: {
          type: Type.STRING,
          description: 'IANA timezone identifier such as "Asia/Kolkata", "UTC", "America/New_York", "Europe/London", "Asia/Dubai".',
        },
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
        kind: {
          type: Type.STRING,
          description: 'Either "alarm" or "timer".',
        },
        timeOrDuration: {
          type: Type.STRING,
          description: 'Alarm time (e.g. "7:30 AM") or timer duration in seconds/minutes (e.g. "5 minutes" or "300").',
        },
        label: {
          type: Type.STRING,
          description: 'Short label for the alarm or timer.',
        },
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
        operation: {
          type: Type.STRING,
          description: 'One of: list_unread, search, draft_send',
        },
        query: {
          type: Type.STRING,
          description: 'Search query (e.g. sender name or subject) when operation is search.',
        },
        to: {
          type: Type.STRING,
          description: 'Recipient email address or contact name when operation is draft_send.',
        },
        subject: {
          type: Type.STRING,
          description: 'Email subject line when operation is draft_send.',
        },
        body: {
          type: Type.STRING,
          description: 'Email message body when operation is draft_send.',
        },
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
        operation: {
          type: Type.STRING,
          description: 'One of: list, create, delete',
        },
        summary: {
          type: Type.STRING,
          description: 'Event title/summary.',
        },
        startIso: {
          type: Type.STRING,
          description: 'ISO 8601 start date-time in IST (e.g. 2026-11-20T15:00:00+05:30).',
        },
        endIso: {
          type: Type.STRING,
          description: 'ISO 8601 end date-time in IST.',
        },
        description: {
          type: Type.STRING,
          description: 'Optional event notes.',
        },
      },
      required: ['operation'],
    },
  },
  {
    name: 'manageKeepAndTasks',
    description:
      'Lists, creates, or completes Google Tasks and local-synced Keep-style notes/checklists.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        operation: {
          type: Type.STRING,
          description: 'One of: list, create_task, complete_task, create_note',
        },
        title: {
          type: Type.STRING,
          description: 'Task or note title.',
        },
        content: {
          type: Type.STRING,
          description: 'Optional note body or task details.',
        },
      },
      required: ['operation'],
    },
  },
  {
    name: 'searchDriveAndContacts',
    description:
      'Searches Google Contacts by name (to look up emails/phone numbers), searches Google Drive files, or backs up a note/creation to Drive.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        operation: {
          type: Type.STRING,
          description: 'One of: search_contacts, search_drive, backup_note',
        },
        query: {
          type: Type.STRING,
          description: 'Contact name, file search keyword, or backup title.',
        },
        content: {
          type: Type.STRING,
          description: 'Optional text content when operation is backup_note.',
        },
      },
      required: ['operation', 'query'],
    },
  },
  {
    name: 'liveGoogleSearch',
    description:
      'Performs a live Google Search with real-time web grounding for current news, facts, apps, people, or verified web links.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search query to look up live on Google.',
        },
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
        appName: {
          type: Type.STRING,
          description: 'Name of the app to find on Google Play Store (e.g. Spotify, Telegram).',
        },
      },
      required: ['appName'],
    },
  },
  {
    name: 'searchAndDownloadMedia',
    description:
      'Searches the browser for a high-resolution picture of a person/subject or downloadable file, shows an in-app Preview Card, and downloads to Gallery/Downloads only after user confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Subject of the picture or file to find online.',
        },
        kind: {
          type: Type.STRING,
          description: 'Either "image" or "file". Defaults to "image".',
        },
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
        operation: {
          type: Type.STRING,
          description: 'One of: switch_child, log_lesson, log_practice, record_quiz, parent_report',
        },
        kidName: {
          type: Type.STRING,
          description: 'Actual name of the child (e.g. Aarav, Sara).',
        },
        subject: {
          type: Type.STRING,
          description: 'Subject name such as Math, English, Science, Reading.',
        },
        topic: {
          type: Type.STRING,
          description: 'Lesson or quiz topic.',
        },
        summary: {
          type: Type.STRING,
          description: 'Brief summary, corrections, or feedback.',
        },
        score: {
          type: Type.NUMBER,
          description: 'Quiz score achieved.',
        },
        total: {
          type: Type.NUMBER,
          description: 'Quiz total questions.',
        },
        stars: {
          type: Type.NUMBER,
          description: 'Bonus stars earned (1 to 5).',
        },
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
        operation: {
          type: Type.STRING,
          description: 'One of: create, complete, list',
        },
        title: {
          type: Type.STRING,
          description: 'Task or reminder title.',
        },
        dueText: {
          type: Type.STRING,
          description: 'Optional due time text, e.g. "6:00 PM".',
        },
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
          description:
            'One of: open_app, navigate_tab, toggle_screen_share, toggle_camera, toggle_overlay, scroll_down, scroll_up, go_back, go_home',
        },
        target: {
          type: Type.STRING,
          description: 'Target app name, tab name, or on/off state.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'sleepGwen',
    description:
      'Invoked when the user says "Gwen, go to sleep", "Sleep", or "Log off". Speak a warm goodbye and gracefully enter dormant mode, closing active audio/camera/screen streams and releasing wake locks.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        farewell: {
          type: Type.STRING,
          description: 'Short warm goodbye phrase.',
        },
      },
    },
  },
];

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '18mb' }));

  // Health & Live Engine Verification endpoint
  app.get('/api/gwen/health', async (req, res) => {
    const start = Date.now();
    try {
      const ai = getRequestAiClient(req);
      await generateWithFallback(ai, 'gemini-3.1-flash-lite', {
        contents: 'Respond with OK.',
      });
      const latencyMs = Date.now() - start;
      res.json({
        ok: true,
        statusLabel: 'Verified',
        latencyMs,
        models: [
          {
            id: 'gemini-3.8-live',
            label: 'Gemini Live Voice & Vision',
            role: '1-on-1 Audio, Camera Vision, Screen Share & Live Tools',
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
      });
    } catch (err) {
      const { status, statusLabel, errorCode, message } = getFriendlyApiError(err);
      res.status(status).json({
        ok: false,
        statusLabel,
        errorCode,
        latencyMs: Date.now() - start,
        models: [],
        error: message,
      });
    }
  });

  // Multimodal Chat (supports Text + Screen Frame + Camera Frame + Identity Core)
  app.post('/api/gwen/chat', async (req, res) => {
    try {
      const ai = getRequestAiClient(req);
      const {
        message,
        history = [],
        persona,
        languageMode = 'auto',
        memories = [],
        identityCore,
        deviceUserName,
        timezone,
        weather,
        careState,
        sessionState,
        googleAccountEmail,
        activeKidStudy,
        allKidNames,
        proactiveEmpathyEnabled = true,
        incognitoMode = false,
        model = 'gemini-4-hydrogen',
        screenFrameBase64,
        cameraFrameBase64,
        faceRecognized = false,
        voiceRecognized = false,
      } = req.body as {
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
      };

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message text is required.' });
        return;
      }

      const selectedModel = ALLOWED_TEXT_MODELS.has(model) ? model : 'gemini-4-hydrogen';
      const systemInstruction = buildGwenSystemInstruction({
        persona,
        languageMode,
        memories,
        identityCore,
        deviceUserName,
        timezone,
        weather,
        careState,
        sessionState,
        googleAccountEmail,
        activeKidStudy,
        allKidNames,
        proactiveEmpathyEnabled,
        incognitoMode,
        isLiveVoice: false,
        hasScreenShare: Boolean(screenFrameBase64),
        hasCameraVision: Boolean(cameraFrameBase64),
        faceRecognized,
        voiceRecognized,
      });

      const recentHistory = history.slice(-12).map((item) => ({
        role: item.role === 'user' ? 'user' : 'model',
        parts: [{ text: item.text }],
      }));

      const currentParts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (screenFrameBase64) {
        const cleaned = screenFrameBase64.replace(/^data:image\/\w+;base64,/, '');
        currentParts.push({
          inlineData: { mimeType: 'image/jpeg', data: cleaned },
        });
      }

      if (cameraFrameBase64) {
        const cleaned = cameraFrameBase64.replace(/^data:image\/\w+;base64,/, '');
        currentParts.push({
          inlineData: { mimeType: 'image/jpeg', data: cleaned },
        });
      }

      currentParts.push({ text: message });

      const { response, usedModel } = await generateWithFallback(ai, selectedModel, {
        contents: [...recentHistory, { role: 'user', parts: currentParts }],
        config: {
          systemInstruction,
        },
      });

      res.json({
        text: response.text ?? '',
        model: usedModel,
      });
    } catch (err) {
      const { status, errorCode, message } = getFriendlyApiError(err);
      res.status(status).json({ error: message, errorCode });
    }
  });

  // Extract structured visual appearance descriptors for local Face Enrollment
  app.post('/api/gwen/describe-appearance', async (req, res) => {
    try {
      const ai = getRequestAiClient(req);
      const { imageBase64 } = req.body as { imageBase64?: string };
      if (!imageBase64) {
        res.status(400).json({ error: 'Image snapshot is required.' });
        return;
      }
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
      res.json({ visualSummary: (response.text ?? '').trim() });
    } catch (err) {
      const { status, message } = getFriendlyApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Server-side Gemini TTS endpoint
  app.post('/api/gwen/tts', async (req, res) => {
    try {
      const ai = getRequestAiClient(req);
      const { text, voiceName = 'Zephyr', style } = req.body as {
        text: string;
        voiceName?: VoiceName;
        style?: string;
      };

      if (!text?.trim()) {
        res.status(400).json({ error: 'Text is required for speech generation.' });
        return;
      }

      const safeVoice: VoiceName = ALLOWED_VOICES.has(voiceName) ? voiceName : 'Zephyr';
      const trimmed = text.slice(0, 900);

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: trimmed,
                speechMetadata: {
                  style: style || 'Warm, natural conversational AI companion',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: safeVoice,
              },
            },
          },
        },
      });

      const audioBase64 =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!audioBase64) {
        res.status(502).json({ error: 'Speech synthesis returned empty audio.' });
        return;
      }

      res.json({ audioBase64, mimeType: 'audio/wav' });
    } catch (err) {
      const { status, errorCode, message } = getFriendlyApiError(err);
      res.status(status).json({ error: message, errorCode });
    }
  });

  // Audio Transcription endpoint (used by Standard Voice Fallback Mode when SpeechRecognition is unavailable)
  app.post('/api/gwen/transcribe', async (req, res) => {
    try {
      const ai = getRequestAiClient(req);
      const { audioBase64, mimeType = 'audio/webm', languageHint } = req.body as {
        audioBase64?: string;
        mimeType?: string;
        languageHint?: string;
      };
      if (!audioBase64) {
        res.status(400).json({ error: 'Audio data is required for transcription.' });
        return;
      }
      const cleaned = audioBase64.replace(/^data:audio\/[^;]+;base64,/, '');
      const prompt = languageHint
        ? `Transcribe the user's speech accurately (likely ${languageHint}). Return ONLY the exact spoken words, with no labels or commentary. If silent or unintelligible, return an empty string.`
        : 'Transcribe the user speech accurately. Return ONLY the exact spoken words, with no labels or commentary. If silent or unintelligible, return an empty string.';

      const { response } = await generateWithFallback(ai, 'gemini-3.5-transcribe', {
        contents: {
          parts: [
            { inlineData: { mimeType, data: cleaned } },
            { text: prompt },
          ],
        },
      });
      res.json({ transcript: (response.text ?? '').trim() });
    } catch (err) {
      const { status, errorCode, message } = getFriendlyApiError(err);
      res.status(status).json({ error: message, errorCode });
    }
  });

  // Automatic Permanent Memory Extraction endpoint
  app.post('/api/gwen/extract-memories', async (req, res) => {
    try {
      const ai = getRequestAiClient(req);
      const { userMessage, assistantReply, existingMemories = [] } = req.body as {
        userMessage: string;
        assistantReply?: string;
        existingMemories?: string[];
      };

      if (!userMessage?.trim()) {
        res.json({ memories: [] });
        return;
      }

      const prompt = `Analyze the following conversation turn with Gwen. Extract:
1. Enduring major facts AND subtle micro-details (small preferences, ongoing stories, moods, promises, tasks) worth saving permanently. Ignore facts already in Existing Memories.
2. Exact session continuity metadata: lastLeftTopic (short phrase), lastSummary (1 concise sentence), lastUserMood (one word like happy/calm/tired/stressed/excited/curious), and unfinishedThreads (up to 3 short strings of open topics or promises).

Existing Memories:
${existingMemories.length > 0 ? existingMemories.map((m) => `- ${m}`).join('\n') : '(none)'}

User said: "${userMessage}"
${assistantReply ? `Gwen replied: "${assistantReply}"` : ''}`;

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
                    content: {
                      type: Type.STRING,
                      description: 'Concise factual or micro-detail statement.',
                    },
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
                  unfinishedThreads: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['lastLeftTopic', 'lastSummary', 'lastUserMood', 'unfinishedThreads'],
              },
            },
            required: ['memories', 'sessionContinuity'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{"memories":[]}').trim()) as {
        memories?: Array<{
          content: string;
          category: string;
          pinned: boolean;
          isPermanent?: boolean;
        }>;
        sessionContinuity?: {
          lastLeftTopic: string;
          lastSummary: string;
          lastUserMood: string;
          unfinishedThreads: string[];
        };
      };

      res.json({
        memories: parsed.memories ?? [],
        sessionContinuity: parsed.sessionContinuity ?? null,
      });
    } catch (err) {
      const { status, message } = getFriendlyApiError(err);
      res.status(status).json({ error: message, memories: [], sessionContinuity: null });
    }
  });

  // Free-tier Gemini AI Artwork Image Generator (High-Detail Layered SVG -> Client PNG Export)
  app.post('/api/gwen/generate-image', async (req, res) => {
    try {
      const ai = getRequestAiClient(req);
      const {
        prompt,
        aspectRatio = '1:1',
        style = 'cinematic digital illustration',
      } = req.body as {
        prompt?: string;
        aspectRatio?: string;
        style?: string;
      };

      if (!prompt?.trim()) {
        res.status(400).json({ error: 'Image description prompt is required.' });
        return;
      }

      const viewBox =
        aspectRatio === '16:9'
          ? '0 0 1280 720'
          : aspectRatio === '9:16'
            ? '0 0 720 1280'
            : aspectRatio === '4:3'
              ? '0 0 1024 768'
              : '0 0 1024 1024';

      const svgPrompt = `Create a stunning, richly layered, publication-grade SVG artwork illustrating: "${prompt.trim()}".
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
        res.status(502).json({ error: 'Could not compose SVG artwork. Please retry with a clearer visual description.' });
        return;
      }

      res.json({
        svg: svgMatch[0],
        aspectRatio,
        style,
        prompt: prompt.trim(),
      });
    } catch (err) {
      const { status, message } = getFriendlyApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Free-tier Gemini AI Motion Video Storyboard Generator (Rendered to WebM via Client Canvas+MediaRecorder)
  app.post('/api/gwen/generate-video', async (req, res) => {
    try {
      const ai = getRequestAiClient(req);
      const {
        prompt,
        aspectRatio = '16:9',
        duration = 6,
      } = req.body as {
        prompt?: string;
        aspectRatio?: string;
        duration?: number;
      };

      if (!prompt?.trim()) {
        res.status(400).json({ error: 'Video prompt is required.' });
        return;
      }

      const { response } = await generateWithFallback(ai, 'gemini-3.1-flash-lite', {
        contents: `Design a 3-scene cinematic motion storyboard for a ${duration}-second animated video about: "${prompt.trim()}".
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
                    palette: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    accentColor: { type: Type.STRING },
                    motifs: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
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

      const storyboard = JSON.parse((response.text ?? '{}').trim());
      res.json({
        storyboard,
        aspectRatio,
        duration: Math.max(3, Math.min(10, Number(duration) || 6)),
      });
    } catch (err) {
      const { status, message } = getFriendlyApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Voice-Driven Webpage & Website Builder (Self-Contained Responsive HTML/CSS/JS)
  app.post('/api/gwen/build-website', async (req, res) => {
    try {
      const ai = getRequestAiClient(req);
      const { description, title } = req.body as {
        description?: string;
        title?: string;
      };

      if (!description?.trim()) {
        res.status(400).json({ error: 'Website description is required.' });
        return;
      }

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
        res.status(502).json({ error: 'Website generation returned incomplete HTML. Please try again.' });
        return;
      }

      const resolvedTitle =
        title?.trim() ||
        html.match(/<title>(.*?)<\/title>/i)?.[1]?.trim() ||
        description.trim().slice(0, 42);

      res.json({
        title: resolvedTitle,
        html,
      });
    } catch (err) {
      const { status, message } = getFriendlyApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Real-Time Location & Weather Endpoint (Open-Meteo live data — zero extra API keys)
  app.get('/api/gwen/weather', async (req, res) => {
    try {
      let lat = Number(req.query.lat);
      let lon = Number(req.query.lon);
      let cityName = typeof req.query.city === 'string' ? req.query.city.trim() : '';

      // If city query is provided without coords, geocode via Open-Meteo Geocoding API
      if (cityName && (Number.isNaN(lat) || Number.isNaN(lon))) {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`
        );
        if (geoRes.ok) {
          const geo = (await geoRes.json()) as {
            results?: Array<{ latitude: number; longitude: number; name: string; admin1?: string }>;
          };
          if (geo.results && geo.results[0]) {
            lat = geo.results[0].latitude;
            lon = geo.results[0].longitude;
            cityName = geo.results[0].admin1
              ? `${geo.results[0].name}, ${geo.results[0].admin1}`
              : geo.results[0].name;
          }
        }
      }

      // Default to New Delhi (IST hub) if location permission was not granted yet
      if (Number.isNaN(lat) || Number.isNaN(lon) || (lat === 0 && lon === 0)) {
        lat = 28.6139;
        lon = 77.209;
        if (!cityName) cityName = 'New Delhi, India';
      }

      if (!cityName) {
        try {
          const revRes = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
          );
          if (revRes.ok) {
            const rev = (await revRes.json()) as { city?: string; locality?: string; principalSubdivision?: string };
            cityName =
              [rev.city || rev.locality, rev.principalSubdivision].filter(Boolean).join(', ') ||
              'Your Location';
          }
        } catch {
          cityName = 'Your Location';
        }
      }

      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m&hourly=precipitation_probability&forecast_days=1&timezone=Asia%2FKolkata`
      );
      if (!weatherRes.ok) {
        res.status(502).json({ error: 'Weather service temporarily unavailable.' });
        return;
      }

      const w = (await weatherRes.json()) as {
        current?: {
          temperature_2m: number;
          relative_humidity_2m: number;
          apparent_temperature: number;
          is_day: number;
          weather_code: number;
          wind_speed_10m: number;
        };
        hourly?: { precipitation_probability?: number[] };
      };

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

      res.json({
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
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unable to fetch live weather.',
      });
    }
  });

  // Proactive Multimodal Empathy Visual Cue Analyzer (Camera Frame)
  app.post('/api/gwen/empathy-check', async (req, res) => {
    try {
      const ai = getRequestAiClient(req);
      const { cameraFrameBase64, userName } = req.body as {
        cameraFrameBase64?: string;
        userName?: string;
      };
      if (!cameraFrameBase64) {
        res.status(400).json({ error: 'Camera frame required.' });
        return;
      }

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

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const { status, errorCode, message } = getFriendlyApiError(err);
      res.status(status).json({ error: message, errorCode });
    }
  });

  // Live Google Search Grounding Endpoint (Real-time web facts & citations)
  app.post('/api/gwen/web-search', async (req, res) => {
    try {
      const ai = getRequestAiClient(req);
      const { query, timezone = 'Asia/Kolkata' } = req.body as {
        query?: string;
        timezone?: string;
      };
      if (!query?.trim()) {
        res.status(400).json({ error: 'Search query is required.' });
        return;
      }

      let answer = '';
      const sources: Array<{ title: string; url: string; domain: string }> = [];

      try {
        const { response } = await generateWithFallback(ai, 'gemini-4-hydrogen', {
          contents: `Answer this live web query concisely, accurately, and naturally as Gwen (in ${timezone} context when dates/times matter): "${query.trim()}"`,
          config: {
            tools: [{ googleSearch: {} }],
          },
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
          sources.push({
            title: ch.web?.title || domain,
            url: uri,
            domain,
          });
          if (sources.length >= 5) break;
        }
      } catch {
        // Free-tier Google Search Grounding quota fallback: fetch live Wikipedia OpenSearch snippets & synthesize with Gemini
        const wikiSources: Array<{ title: string; url: string; domain: string; snippet?: string }> = [];
        try {
          const wikiSearchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
            query.trim()
          )}&srlimit=4&format=json&origin=*`;
          const wRes = await fetch(wikiSearchUrl, {
            headers: { 'User-Agent': 'GwenCompanionApp/4.0 (Syed Farhan)' },
          });
          if (wRes.ok) {
            const wData = (await wRes.json()) as {
              query?: { search?: Array<{ title?: string; snippet?: string }> };
            };
            for (const item of wData.query?.search || []) {
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
        } catch {
          // Proceed with direct synthesis
        }

        const contextBlock =
          wikiSources.length > 0
            ? `\nLive web search snippets:\n${wikiSources
                .map((s) => `- ${s.title}: ${s.snippet || ''}`)
                .join('\n')}`
            : '';

        const { response } = await generateWithFallback(ai, 'gemini-3.1-flash-lite', {
          contents: `Answer this web query concisely, accurately, and naturally as Gwen (using ${timezone} context if dates/times matter): "${query.trim()}"${contextBlock}`,
        });
        answer = (response.text ?? '').trim();
        for (const s of wikiSources) {
          sources.push({ title: s.title, url: s.url, domain: s.domain });
        }
      }

      res.json({
        query: query.trim(),
        answer: answer || 'I found results, please check the sources below.',
        sources,
      });
    } catch (err) {
      const { status, message } = getFriendlyApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Play Store App Lookup (Confirmation-gated install via market:// & play.google.com)
  app.post('/api/gwen/search-playstore', async (req, res) => {
    try {
      const ai = getRequestAiClient(req);
      const { appName } = req.body as { appName?: string };
      if (!appName?.trim()) {
        res.status(400).json({ error: 'App name is required.' });
        return;
      }

      const knownApps: Record<string, { appName: string; developer: string; packageId: string; summary: string }> = {
        spotify: { appName: 'Spotify: Music and Podcasts', developer: 'Spotify AB', packageId: 'com.spotify.music', summary: 'Stream music, playlists, and podcasts worldwide.' },
        telegram: { appName: 'Telegram', developer: 'Telegram FZ-LLC', packageId: 'org.telegram.messenger', summary: 'Fast, cloud-based secure messaging app.' },
        whatsapp: { appName: 'WhatsApp Messenger', developer: 'WhatsApp LLC', packageId: 'com.whatsapp', summary: 'Simple, reliable messaging and calling.' },
        instagram: { appName: 'Instagram', developer: 'Instagram', packageId: 'com.instagram.android', summary: 'Photos, Reels, and stories with friends.' },
        youtube: { appName: 'YouTube', developer: 'Google LLC', packageId: 'com.google.android.youtube', summary: 'Watch videos, music, and live streams.' },
        duolingo: { appName: 'Duolingo: Language Lessons', developer: 'Duolingo', packageId: 'com.duolingo', summary: 'Learn languages with bite-sized lessons.' },
        notion: { appName: 'Notion: Notes, Tasks, AI', developer: 'Notion Labs, Inc.', packageId: 'notion.id', summary: 'All-in-one notes, docs, and project workspace.' },
        netflix: { appName: 'Netflix', developer: 'Netflix, Inc.', packageId: 'com.netflix.mediaclient', summary: 'Watch TV shows, movies, and originals.' },
      };

      const key = appName.trim().toLowerCase();
      const direct = Object.entries(knownApps).find(([k]) => key.includes(k))?.[1];
      if (direct) {
        const appResult = {
          ...direct,
          playStoreUrl: `https://play.google.com/store/apps/details?id=${direct.packageId}`,
          marketUri: `market://details?id=${direct.packageId}`,
        };
        res.json({ app: appResult, ...appResult });
        return;
      }

      const { response } = await generateWithFallback(ai, 'gemini-3.1-flash-lite', {
        contents: `Identify the official Google Play Store Android app details for "${appName.trim()}".
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

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        appName?: string;
        developer?: string;
        packageId?: string;
        summary?: string;
      };
      const pkg = (parsed.packageId || '').trim();
      const playStoreUrl = pkg
        ? `https://play.google.com/store/apps/details?id=${encodeURIComponent(pkg)}`
        : `https://play.google.com/store/search?q=${encodeURIComponent(appName.trim())}&c=apps`;
      const marketUri = pkg
        ? `market://details?id=${encodeURIComponent(pkg)}`
        : `market://search?q=${encodeURIComponent(appName.trim())}`;

      const appResult = {
        appName: parsed.appName || appName.trim(),
        developer: parsed.developer || 'Google Play Store',
        packageId: pkg || 'search',
        summary: parsed.summary || `Official Google Play Store listing for ${appName.trim()}.`,
        playStoreUrl,
        marketUri,
      };
      res.json({ app: appResult, ...appResult });
    } catch (err) {
      const { status, message } = getFriendlyApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Browser Image & File Search (Returns preview candidates for explicit confirmation before download)
  app.post('/api/gwen/search-browser-media', async (req, res) => {
    try {
      const { query, kind = 'image' } = req.body as {
        query?: string;
        kind?: 'image' | 'file';
      };
      if (!query?.trim()) {
        res.status(400).json({ error: 'Search query is required.' });
        return;
      }

      const cleanQ = query.trim();
      const candidates: Array<{
        title: string;
        sourceDomain: string;
        imageUrl: string;
        downloadUrl: string;
        kind: 'image' | 'file';
        mimeType: string;
        suggestedFilename: string;
      }> = [];

      // Query Wikimedia Commons live open-license media search for genuine high-res images of people/subjects
      try {
        const wikiUrl =
          `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanQ)}` +
          `&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url|mime|thumbmime&iiurlwidth=720&format=json&origin=*`;
        const wikiRes = await fetch(wikiUrl, {
          headers: { 'User-Agent': 'GwenCompanionApp/4.0 (Syed Farhan)' },
        });
        if (wikiRes.ok) {
          const wJson = (await wikiRes.json()) as {
            query?: {
              pages?: Record<
                string,
                {
                  title?: string;
                  imageinfo?: Array<{
                    url?: string;
                    thumburl?: string;
                    mime?: string;
                  }>;
                }
              >;
            };
          };
          const pages = Object.values(wJson.query?.pages || {});
          for (const page of pages) {
            const info = page.imageinfo?.[0];
            if (!info?.url) continue;
            const mime = info.mime || 'image/jpeg';
            if (kind === 'image' && !mime.startsWith('image/')) continue;
            const cleanTitle = (page.title || cleanQ)
              .replace(/^File:/i, '')
              .replace(/\.[a-z0-9]+$/i, '')
              .replace(/_/g, ' ');
            const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('pdf') ? 'pdf' : 'jpg';
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
      } catch {
        // Fallback below if Wikimedia unreachable
      }

      // Secondary Wikipedia page thumbnail lookup (especially strong for portraits of people/places)
      if (candidates.length === 0) {
        try {
          const summaryRes = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQ.replace(/\s+/g, '_'))}`,
            { headers: { 'User-Agent': 'GwenCompanionApp/4.0 (Syed Farhan)' } }
          );
          if (summaryRes.ok) {
            const sJson = (await summaryRes.json()) as {
              title?: string;
              originalimage?: { source?: string };
              thumbnail?: { source?: string };
            };
            const url = sJson.originalimage?.source || sJson.thumbnail?.source;
            if (url) {
              const slug = (sJson.title || cleanQ).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32);
              candidates.push({
                title: sJson.title || cleanQ,
                sourceDomain: 'en.wikipedia.org',
                imageUrl: sJson.thumbnail?.source || url,
                downloadUrl: url,
                kind: 'image',
                mimeType: 'image/jpeg',
                suggestedFilename: `gwen-${slug}.jpg`,
              });
            }
          }
        } catch {
          // ignore
        }
      }

      res.json({ query: cleanQ, candidate: candidates[0] || null, candidates });
    } catch (err) {
      const { status, message } = getFriendlyApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Safe CORS-friendly download proxy for confirmed browser image/file downloads
  app.get('/api/gwen/proxy-download', async (req, res) => {
    try {
      const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
      const rawName = typeof req.query.filename === 'string' ? req.query.filename : 'gwen-download';
      if (!rawUrl) {
        res.status(400).json({ error: 'Download URL required.' });
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        res.status(400).json({ error: 'Invalid download URL.' });
        return;
      }

      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        res.status(400).json({ error: 'Only HTTP/HTTPS downloads are allowed.' });
        return;
      }
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('169.254.') ||
        host.endsWith('.internal')
      ) {
        res.status(403).json({ error: 'Blocked private network target.' });
        return;
      }

      const upstream = await fetch(parsed.toString(), {
        headers: { 'User-Agent': 'GwenCompanionApp/4.0 (Syed Farhan)' },
      });
      if (!upstream.ok) {
        res.status(502).json({ error: `Download failed upstream (${upstream.status})` });
        return;
      }

      const safeFilename = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'gwen-download';
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Download proxy failed.' });
    }
  });

  // Upgraded Voice Command Intent Parser endpoint
  app.post('/api/gwen/parse-command', async (req, res) => {
    try {
      const ai = getRequestAiClient(req);
      const { utterance, personaNames = [] } = req.body as {
        utterance: string;
        personaNames?: string[];
      };

      if (!utterance?.trim()) {
        res.json({ isCommand: false, action: 'none' });
        return;
      }

      const rawText = utterance.trim();
      const lower = rawText.toLowerCase();

      // Instant deterministic fast-path for high-precision hands-free device commands
      if (/\b(go to sleep|sleep mode|log off|log out|goodnight gwen)\b/i.test(lower) || lower === 'sleep') {
        res.json({
          isCommand: true,
          action: 'sleep_gwen',
          confirmationText: 'Going to sleep now. Tap Wake Gwen whenever you want to talk again.',
        });
        return;
      }

      const brightMatch = lower.match(/\bbrightness\b.*?(\d{1,3}|max|full|min|up|down|higher|lower|dim)/i);
      if (brightMatch) {
        res.json({
          isCommand: true,
          action: 'control_system_setting',
          target: 'brightness',
          value: brightMatch[1],
          confirmationText: `Updating screen brightness (${brightMatch[1]}).`,
        });
        return;
      }

      const volMatch = lower.match(/\b(media|ring|alarm)?\s*volume\b.*?(\d{1,3}|max|mute|silent|up|down|higher|lower)|\bmute\s+(media|volume|sound)\b/i);
      if (volMatch) {
        const channel = volMatch[1] ? `${volMatch[1]}_volume` : 'media_volume';
        const val = volMatch[2] || 'mute';
        res.json({
          isCommand: true,
          action: 'control_system_setting',
          target: channel,
          value: val,
          confirmationText: `Adjusting ${channel.replace('_', ' ')} (${val}).`,
        });
        return;
      }

      const toggleMatch = lower.match(/\b(turn on|turn off|enable|disable|toggle)\s+(do not disturb|dnd|flashlight|torch|wi-?fi|bluetooth|battery saver)\b/i);
      if (toggleMatch) {
        const verb = toggleMatch[1].toLowerCase();
        const val = verb.includes('on') || verb.includes('enable') ? 'on' : verb.includes('off') || verb.includes('disable') ? 'off' : 'toggle';
        const setting = toggleMatch[2].toLowerCase().replace(/[\s-]+/g, '_');
        res.json({
          isCommand: true,
          action: 'control_system_setting',
          target: setting === 'dnd' ? 'do_not_disturb' : setting === 'torch' ? 'flashlight' : setting,
          value: val,
          confirmationText: `Updated ${toggleMatch[2]}.`,
        });
        return;
      }

      // AI Image Generation fast-path
      const imgMatch = rawText.match(/\b(?:generate|create|draw|make|paint)\s+(?:me\s+)?(?:an?\s+)?(?:ai\s+)?(?:image|picture|artwork|wallpaper|photo|illustration)\s+(?:of\s+)?(.+)/i);
      if (imgMatch) {
        const desc = imgMatch[1].trim();
        const ratio = (desc.match(/\b(16:9|9:16|4:3|1:1)\b/)?.[1] || '1:1') as '1:1' | '16:9' | '9:16' | '4:3';
        res.json({
          isCommand: true,
          action: 'generate_image',
          payload: desc,
          aspectRatio: ratio,
          style: desc.includes('cyber') ? 'cyberpunk neon' : desc.includes('minimal') ? 'minimalist vector' : 'cinematic illustration',
          confirmationText: `Creating your ${ratio} artwork right now — I will preview it and save it to your gallery!`,
        });
        return;
      }

      // AI Video Generation fast-path
      const vidMatch = rawText.match(/\b(?:generate|create|make|render)\s+(?:me\s+)?(?:a\s+)?(?:(\d+)\s*(?:s|sec|second|seconds)\s+)?(?:ai\s+)?video\s+(?:of\s+)?(.+)/i);
      if (vidMatch) {
        const dur = vidMatch[1] || '6';
        const desc = vidMatch[2].trim();
        const ratio = (desc.match(/\b(16:9|9:16|1:1)\b/)?.[1] || '16:9') as '16:9' | '9:16' | '1:1';
        res.json({
          isCommand: true,
          action: 'generate_video',
          payload: desc,
          value: dur,
          aspectRatio: ratio,
          confirmationText: `Rendering your ${dur}-second ${ratio} AI motion video now — I will preview it and save it to your gallery!`,
        });
        return;
      }

      // Website Builder fast-path
      const webMatch = rawText.match(/\b(?:build|create|design|make|generate)\s+(?:me\s+)?(?:a\s+)?(?:responsive\s+)?(?:website|webpage|web page|landing page|portfolio site)\s*(?:for|about|with|:)?\s*(.+)/i);
      if (webMatch) {
        res.json({
          isCommand: true,
          action: 'build_website',
          payload: webMatch[1].trim(),
          target: webMatch[1].trim().slice(0, 42),
          confirmationText: `Building your responsive website now — I will open the live preview and save it locally!`,
        });
        return;
      }

      // Weather fast-path
      if (/\b(weather|temperature|forecast|is it going to rain|will it rain|how hot|how cold)\b/i.test(lower)) {
        const cityMatch = rawText.match(/\bin\s+([a-z\s]{2,30})\b/i);
        res.json({
          isCommand: true,
          action: 'get_weather',
          target: cityMatch ? cityMatch[1].trim() : undefined,
          confirmationText: '',
        });
        return;
      }

      // Companion Care fast-path (Water / Wake-Up / Rest)
      if (/\b(i drank|logged|had a glass of|drink)\s*(?:some\s+)?water\b/i.test(lower)) {
        res.json({
          isCommand: true,
          action: 'manage_companion_care',
          target: 'log_water',
          confirmationText: 'Awesome job staying hydrated! I logged a glass of water for you.',
        });
        return;
      }

      const wakeMatch = rawText.match(/\bwake\s+me\s+up\s+(?:at|for)\s+([0-9: ]+(?:am|pm)?)/i);
      if (wakeMatch) {
        res.json({
          isCommand: true,
          action: 'manage_companion_care',
          target: 'set_wakeup',
          value: wakeMatch[1].trim(),
          confirmationText: `Got it — I scheduled your escalating gentle wake-up alarm for ${wakeMatch[1].trim()} IST.`,
        });
        return;
      }

      const msgMatch =
        rawText.match(/(?:send\s+(?:an?\s+)?)?(whatsapp|messenger|sms)\s+(?:message\s+)?to\s+([a-z0-9\s]+?)\s+(?:saying|that|:)\s+(.+)/i) ||
        rawText.match(/(?:message|text)\s+([a-z0-9\s]+?)\s+on\s+(whatsapp|messenger|sms)\s+(?:saying|that|:)?\s*(.+)/i);
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
        res.json({
          isCommand: true,
          action: 'compose_message',
          platform,
          target: recipient,
          payload: body,
          confirmationText: `I drafted a ${platform} message to ${recipient}: "${body}". Please confirm before I send it.`,
        });
        return;
      }

      const timerMatch = rawText.match(/\bset\s+(?:a\s+)?(\d+\s*(?:seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h))\s+timer(?:\s+for\s+(.+))?/i);
      if (timerMatch) {
        res.json({
          isCommand: true,
          action: 'manage_alarm_timer',
          target: 'timer',
          value: timerMatch[1].trim(),
          payload: (timerMatch[2] || 'Timer').trim(),
          confirmationText: `Started your ${timerMatch[1].trim()} timer${timerMatch[2] ? ` for ${timerMatch[2].trim()}` : ''}.`,
        });
        return;
      }

      const alarmMatch = rawText.match(/\bset\s+(?:an?\s+)?alarm\s+(?:for|at)\s+([0-9: ]+(?:am|pm)?)(?:\s+(?:for|labeled)\s+(.+))?/i);
      if (alarmMatch) {
        res.json({
          isCommand: true,
          action: 'manage_alarm_timer',
          target: 'alarm',
          value: alarmMatch[1].trim(),
          payload: (alarmMatch[2] || 'Gwen Alarm').trim(),
          confirmationText: `Alarm set for ${alarmMatch[1].trim()} IST.`,
        });
        return;
      }

      const navMatch = rawText.match(/\b(?:navigate|directions|route)\s+to\s+(.+)/i);
      if (navMatch) {
        res.json({
          isCommand: true,
          action: 'navigate_maps',
          target: navMatch[1].trim(),
          confirmationText: `Prepared Google Maps navigation to ${navMatch[1].trim()}.`,
        });
        return;
      }

      const personaMatch = rawText.match(/\b(?:switch|change)\s+(?:persona|mode)\s+to\s+(.+)/i);
      if (personaMatch) {
        res.json({
          isCommand: true,
          action: 'switch_persona',
          target: personaMatch[1].trim(),
          confirmationText: `Switching active persona to ${personaMatch[1].trim()}.`,
        });
        return;
      }

      const camMatch = lower.match(/\b(turn on|start|enable|open|turn off|stop|close|switch|flip)\s+(?:live\s+)?camera(?:\s+vision)?\b/i);
      if (camMatch) {
        const v = camMatch[1];
        const target = v.includes('flip') || v.includes('switch') ? 'flip' : v.includes('off') || v.includes('stop') || v.includes('close') ? 'off' : 'on';
        res.json({
          isCommand: true,
          action: 'toggle_camera',
          target,
          confirmationText: target === 'flip' ? 'Switching camera lens.' : target === 'on' ? 'Turning on Live Camera Vision.' : 'Turning off Live Camera Vision.',
        });
        return;
      }

      // Google Play Store App Download fast-path
      const playMatch = rawText.match(/\b(?:download|install|get)\s+(.+?)\s+(?:from|on)\s+(?:the\s+)?(?:google\s+)?play\s*store\b/i);
      if (playMatch) {
        res.json({
          isCommand: true,
          action: 'download_playstore_app',
          target: playMatch[1].trim(),
          confirmationText: '',
        });
        return;
      }

      // Browser Image / File Search & Confirmed Download fast-path
      const mediaDownloadMatch =
        rawText.match(/\b(?:find\s+and\s+download|download|search\s+and\s+download)\s+(?:an?\s+)?(picture|photo|image|pic|file|pdf|document)\s+(?:of\s+)?(.+?)(?:\s+from\s+(?:the\s+)?browser|\s+online)?$/i);
      if (mediaDownloadMatch) {
        const kind = /file|pdf|document/i.test(mediaDownloadMatch[1]) ? 'file' : 'image';
        res.json({
          isCommand: true,
          action: 'search_download_media',
          target: mediaDownloadMatch[2].trim(),
          value: kind,
          confirmationText: '',
        });
        return;
      }

      // Live Google Search Grounding fast-path
      const searchMatch = rawText.match(/\b(?:search\s+google\s+for|google\s+search|look\s+up|search\s+the\s+web\s+for|latest\s+news\s+(?:on|about))\s+(.+)/i);
      if (searchMatch) {
        res.json({
          isCommand: true,
          action: 'live_google_search',
          target: searchMatch[1].trim(),
          confirmationText: '',
        });
        return;
      }

      // Gmail fast-path (Check unread / search / send draft)
      if (/\b(check|read|summarize|show)\s+(?:my\s+)?(?:unread\s+)?(?:gmail|emails?|inbox)\b/i.test(lower)) {
        res.json({
          isCommand: true,
          action: 'manage_gmail',
          target: 'list_unread',
          confirmationText: '',
        });
        return;
      }
      const sendEmailMatch = rawText.match(
        /\bsend\s+(?:an?\s+)?(?:gmail|email)\s+to\s+([^\s,]+)\s+(?:with\s+subject\s+(.+?)\s+)?(?:saying|body|:)\s+(.+)/i
      );
      if (sendEmailMatch) {
        res.json({
          isCommand: true,
          action: 'manage_gmail',
          target: 'draft_send',
          platform: sendEmailMatch[1].trim(),
          value: (sendEmailMatch[2] || 'Message from Gwen').trim(),
          payload: sendEmailMatch[3].trim(),
          confirmationText: '',
        });
        return;
      }

      // Google Tasks / Keep Notes fast-path
      const addTaskMatch = rawText.match(/\b(?:add|create)\s+(.+?)\s+(?:to\s+my\s+)?(?:google\s+)?(?:tasks?|keep\s+notes?|to-?do)\b/i);
      if (addTaskMatch) {
        res.json({
          isCommand: true,
          action: 'manage_keep_tasks',
          target: 'create_task',
          payload: addTaskMatch[1].trim(),
          confirmationText: '',
        });
        return;
      }
      if (/\b(?:list|check|show)\s+(?:my\s+)?(?:google\s+)?(?:tasks?|keep\s+notes?)\b/i.test(lower)) {
        res.json({
          isCommand: true,
          action: 'manage_keep_tasks',
          target: 'list',
          confirmationText: '',
        });
        return;
      }

      // Google Drive & Contacts fast-path
      const driveMatch = rawText.match(/\b(?:search|find|check)\s+(?:my\s+)?(?:google\s+)?drive\s+(?:for\s+)?(.+)/i);
      if (driveMatch) {
        res.json({
          isCommand: true,
          action: 'search_drive_contacts',
          target: 'search_drive',
          payload: driveMatch[1].trim(),
          confirmationText: '',
        });
        return;
      }
      const contactMatch = rawText.match(/\b(?:find|look\s+up|search)\s+(?:my\s+)?(?:google\s+)?contact(?:s)?\s+(?:for\s+)?(.+)/i);
      if (contactMatch) {
        res.json({
          isCommand: true,
          action: 'search_drive_contacts',
          target: 'search_contacts',
          payload: contactMatch[1].trim(),
          confirmationText: '',
        });
        return;
      }

      // Home Teacher & Parent Kids Progress fast-path
      const parentReportMatch = rawText.match(/\bhow\s+is\s+([a-z]+)\s+doing(?:\s+in\s+([a-z\s]+))?/i);
      if (parentReportMatch) {
        res.json({
          isCommand: true,
          action: 'manage_kids_study',
          target: 'parent_report',
          payload: parentReportMatch[1].trim(),
          value: parentReportMatch[2]?.trim(),
          confirmationText: '',
        });
        return;
      }

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

      const parsed = JSON.parse((response.text ?? '{"isCommand":false,"action":"none"}').trim());
      res.json(parsed);
    } catch (err) {
      const { status, message } = getFriendlyApiError(err);
      res.status(status).json({ error: message, isCommand: false, action: 'none' });
    }
  });

  const server = http.createServer(app);

  // WebSocket server bridging Gemini Live API (gemini-3.8-live)
  const wss = new WebSocketServer({ server, path: '/ws/live' });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let isClosing = false;

    const sendToClient = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const closeLiveSession = () => {
      if (isClosing) return;
      isClosing = true;
      try {
        liveSession?.close();
      } catch {
        // Ignore close race
      }
      liveSession = null;
    };

    clientWs.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString()) as {
          type: string;
          voiceName?: VoiceName;
          persona?: Persona;
          languageMode?: LanguageMode;
          memories?: MemoryItem[];
          identityCore?: IdentityCoreProfile;
          deviceUserName?: string;
          timezone?: string;
          weather?: WeatherSnapshot | null;
          careState?: CompanionCareState;
          sessionState?: ContinuousSessionState | null;
          recentTurns?: TranscriptMessage[];
          googleAccountEmail?: string | null;
          activeKidStudy?: KidStudyBundle | null;
          allKidNames?: string[];
          proactiveEmpathyEnabled?: boolean;
          incognitoMode?: boolean;
          hasScreenShare?: boolean;
          hasCameraVision?: boolean;
          faceRecognized?: boolean;
          voiceRecognized?: boolean;
          apiKey?: string;
          audio?: string;
          video?: string;
          text?: string;
        };

        if (msg.type === 'init') {
          closeLiveSession();
          isClosing = false;

          const resolvedKey = (
            (typeof msg.apiKey === 'string' ? msg.apiKey.trim() : '') ||
            (process.env.GEMINI_API_KEY || '').trim()
          ).trim();
          if (!resolvedKey) {
            sendToClient({
              type: 'error',
              code: 4001,
              reason: 'API key missing',
              errorCode: 'INVALID_KEY',
              fallbackRecommended: false,
              message:
                'No Gemini API key configured. Open Settings → Gemini API Key to add your personal Google AI Studio key.',
            });
            return;
          }

          // Always instantiate a fresh GoogleGenAI client dynamically using the trimmed active user key
          const ai = new GoogleGenAI({
            apiKey: resolvedKey.trim(),
            apiVersion: 'v1beta',
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          const voiceName: VoiceName =
            msg.voiceName && ALLOWED_VOICES.has(msg.voiceName) ? msg.voiceName : 'Zephyr';

          const systemInstruction = buildGwenSystemInstruction({
            persona: msg.persona ?? {
              id: 'default-companion',
              name: 'Default Companion',
              tagline: 'Warm & Helpful',
              tone: 'Warm, empathetic, natural',
              systemPrompt: 'Be a warm, attentive, intelligent 1-on-1 companion.',
              responseLength: 'balanced',
              isBuiltIn: true,
            },
            languageMode: msg.languageMode ?? 'auto',
            memories: msg.memories ?? [],
            identityCore: msg.identityCore,
            deviceUserName: msg.deviceUserName,
            timezone: msg.timezone,
            weather: msg.weather,
            careState: msg.careState,
            sessionState: msg.sessionState,
            recentTurns: msg.recentTurns,
            googleAccountEmail: msg.googleAccountEmail,
            activeKidStudy: msg.activeKidStudy,
            allKidNames: msg.allKidNames,
            proactiveEmpathyEnabled: msg.proactiveEmpathyEnabled !== false,
            incognitoMode: Boolean(msg.incognitoMode),
            isLiveVoice: true,
            hasScreenShare: Boolean(msg.hasScreenShare),
            hasCameraVision: Boolean(msg.hasCameraVision),
            faceRecognized: Boolean(msg.faceRecognized),
            voiceRecognized: Boolean(msg.voiceRecognized),
          });

          const candidateModels = await discoverBidiModels(resolvedKey);

          interface LiveAttemptSpec {
            model: string;
            label: string;
            toolsEnabled: boolean;
            config: Record<string, unknown>;
          }

          const attempts: LiveAttemptSpec[] = [];
          const primaryLiveModel = candidateModels[0] || 'gemini-3.8-live';

          // Attempt 1: Primary discovered bidi model with full audio + transcription + tools
          attempts.push({
            model: primaryLiveModel,
            label: 'full',
            toolsEnabled: true,
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
              systemInstruction,
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              tools: [{ functionDeclarations: LIVE_FUNCTION_DECLARATIONS }],
            },
          });

          // Attempt 2: Same primary model with minimal valid setup (no tools) in case tools trigger 1007/1008
          attempts.push({
            model: primaryLiveModel,
            label: 'minimal-no-tools',
            toolsEnabled: false,
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
              systemInstruction,
            },
          });

          // Subsequent attempts: Alternate discovered bidiGenerateContent models with minimal valid setup
          for (const altModel of candidateModels.slice(1, 4)) {
            attempts.push({
              model: altModel,
              label: 'fallback-model-minimal',
              toolsEnabled: false,
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName },
                  },
                },
                systemInstruction,
              },
            });
          }

          const tryConnectAttempt = (
            spec: LiveAttemptSpec
          ): Promise<{
            session: Awaited<ReturnType<GoogleGenAI['live']['connect']>>;
            model: string;
            toolsEnabled: boolean;
          }> => {
            return new Promise((resolve, reject) => {
              let settled = false;
              let handshakeTimer: ReturnType<typeof setTimeout> | null = null;
              let sessionRef: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;

              const finishReady = () => {
                if (settled || !sessionRef) return;
                settled = true;
                if (handshakeTimer) clearTimeout(handshakeTimer);
                resolve({
                  session: sessionRef,
                  model: spec.model,
                  toolsEnabled: spec.toolsEnabled,
                });
              };

              const failHandshake = (code: number, reason: string) => {
                if (settled) return;
                settled = true;
                if (handshakeTimer) clearTimeout(handshakeTimer);
                try {
                  sessionRef?.close();
                } catch {
                  // Ignore close race
                }
                reject({ code, reason, model: spec.model, label: spec.label });
              };

              ai.live
                .connect({
                  model: spec.model,
                  config: spec.config as Parameters<GoogleGenAI['live']['connect']>[0]['config'],
                  callbacks: {
                    onopen: () => {
                      // Wait briefly for setupComplete or early 1007/1008 close before marking ready
                      handshakeTimer = setTimeout(() => {
                        finishReady();
                      }, 650);
                    },
                    onmessage: (liveMsg: LiveServerMessage) => {
                      const rawMsg = liveMsg as LiveServerMessage & { setupComplete?: unknown };
                      if (rawMsg.setupComplete) {
                        finishReady();
                      }
                      const sc = liveMsg.serverContent;
                      if (sc?.interrupted) {
                        sendToClient({ type: 'interrupted' });
                      }
                      if (sc?.inputTranscription?.text) {
                        sendToClient({
                          type: 'input_transcript',
                          text: sc.inputTranscription.text,
                        });
                      }
                      if (sc?.outputTranscription?.text) {
                        sendToClient({
                          type: 'output_transcript',
                          text: sc.outputTranscription.text,
                        });
                      }
                      for (const part of sc?.modelTurn?.parts ?? []) {
                        if (part.inlineData?.data) {
                          sendToClient({
                            type: 'audio',
                            data: part.inlineData.data,
                          });
                        }
                      }
                      if (sc?.turnComplete) {
                        sendToClient({ type: 'turn_complete' });
                      }
                      if (liveMsg.toolCall?.functionCalls?.length) {
                        const calls = liveMsg.toolCall.functionCalls.map((call) => ({
                          id: call.id,
                          name: call.name,
                          args: call.args ?? {},
                        }));
                        sendToClient({ type: 'tool_call', calls });

                        if (liveSession) {
                          liveSession.sendToolResponse({
                            functionResponses: calls.map((c) => ({
                              id: c.id,
                              name: c.name,
                              response: {
                                ok: true,
                                status:
                                  c.name === 'composeMessage'
                                    ? 'draft_queued_awaiting_user_confirmation'
                                    : 'executed_on_device',
                              },
                            })),
                          });
                        }
                      }
                    },
                    onerror: (e: unknown) => {
                      const raw = extractRawErrorMessage(e);
                      if (!settled) {
                        failHandshake(1006, raw || 'Upstream Gemini Live error');
                        return;
                      }
                      const { message, errorCode } = getFriendlyApiError(e);
                      sendToClient({
                        type: 'error',
                        code: 1006,
                        reason: raw,
                        message: `${message}${raw && !message.includes(raw) ? ` (${raw})` : ''}`,
                        errorCode,
                        model: spec.model,
                        fallbackRecommended: errorCode !== 'INVALID_KEY',
                      });
                    },
                    onclose: (closeEvt?: unknown) => {
                      const ev = (closeEvt || {}) as {
                        code?: number;
                        reason?: string;
                        wasClean?: boolean;
                      };
                      const code = typeof ev.code === 'number' ? ev.code : 1006;
                      const reason = typeof ev.reason === 'string' ? ev.reason : '';

                      if (!settled) {
                        failHandshake(code, reason || `Closed with code ${code}`);
                        return;
                      }

                      if (!isClosing && code !== 1000) {
                        const friendly = getFriendlyApiError(reason || `Code ${code}`);
                        sendToClient({
                          type: 'error',
                          code,
                          reason,
                          model: spec.model,
                          errorCode: friendly.errorCode,
                          fallbackRecommended: friendly.errorCode !== 'INVALID_KEY',
                          message: `Gemini Live closed (code ${code}${reason ? `: ${reason}` : ''}) on ${spec.model}.`,
                        });
                      }
                      sendToClient({
                        type: 'closed',
                        code,
                        reason,
                        wasClean: Boolean(ev.wasClean),
                        model: spec.model,
                      });
                    },
                  },
                })
                .then((sess) => {
                  sessionRef = sess;
                  if (settled) {
                    try {
                      sess.close();
                    } catch {
                      // ignore
                    }
                  }
                })
                .catch((err) => {
                  const raw = extractRawErrorMessage(err);
                  failHandshake(1006, raw);
                });
            });
          };

          let lastFailure: { code: number; reason: string; model: string; label: string } | null =
            null;

          for (const attempt of attempts) {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            try {
              const connected = await tryConnectAttempt(attempt);
              liveSession = connected.session;
              sendToClient({
                type: 'ready',
                model: connected.model,
                toolsEnabled: connected.toolsEnabled,
              });
              return;
            } catch (failObj) {
              const fail = failObj as {
                code?: number;
                reason?: string;
                model?: string;
                label?: string;
              };
              const code = typeof fail.code === 'number' ? fail.code : 1006;
              const reason = fail.reason || extractRawErrorMessage(failObj);
              lastFailure = {
                code,
                reason,
                model: fail.model || attempt.model,
                label: fail.label || attempt.label,
              };
              console.warn(
                `[Gwen Live] Attempt (${attempt.model} / ${attempt.label}) closed: code=${code} reason=${reason}`
              );

              // Do not keep retrying if the API key itself is invalid/unauthorized
              const lowerReason = reason.toLowerCase();
              if (
                lowerReason.includes('api key not valid') ||
                lowerReason.includes('api_key_invalid') ||
                lowerReason.includes('permission_denied') ||
                lowerReason.includes('unauthenticated')
              ) {
                break;
              }
            }
          }

          const finalCode = lastFailure?.code ?? 1006;
          const finalReason = lastFailure?.reason || 'Upstream Live handshake closed';
          const finalModel = lastFailure?.model || primaryLiveModel;
          const { errorCode } = getFriendlyApiError(finalReason);

          sendToClient({
            type: 'error',
            code: finalCode,
            reason: finalReason,
            model: finalModel,
            errorCode,
            fallbackRecommended: errorCode !== 'INVALID_KEY',
            message: `Live Voice WebSocket failed (code ${finalCode}${finalReason ? `: ${finalReason}` : ''}) on ${finalModel}.`,
          });
          return;
        }

        if (!liveSession) return;

        if (msg.type === 'audio' && msg.audio) {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (msg.type === 'video' && msg.video) {
          liveSession.sendRealtimeInput({
            video: {
              data: msg.video,
              mimeType: 'image/jpeg',
            },
          });
        } else if (msg.type === 'text' && msg.text) {
          liveSession.sendRealtimeInput({ text: msg.text });
        } else if (msg.type === 'stop') {
          closeLiveSession();
        }
      } catch (err) {
        const raw = extractRawErrorMessage(err);
        const { message, errorCode } = getFriendlyApiError(err);
        sendToClient({
          type: 'error',
          code: 1011,
          reason: raw,
          message: `${message}${raw && !message.includes(raw) ? ` (${raw})` : ''}`,
          errorCode,
          fallbackRecommended: errorCode !== 'INVALID_KEY',
        });
      }
    });

    clientWs.on('close', () => {
      closeLiveSession();
    });

    clientWs.on('error', () => {
      closeLiveSession();
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Gwen server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
