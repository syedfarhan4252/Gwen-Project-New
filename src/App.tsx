import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Brain,
  Command,
  Mic,
  MonitorOff,
  PhoneOff,
  Radio,
  SlidersHorizontal,
  VideoOff,
} from 'lucide-react';
import { ApiKeyOnboardingModal } from './components/ApiKeyOnboardingModal';
import { CompanionView } from './components/CompanionView';
import { CommandsCatalogView } from './components/CommandsCatalogView';
import { ConfirmationBottomSheet } from './components/ConfirmationBottomSheet';
import { FirstLaunchModal } from './components/FirstLaunchModal';
import { FloatingOverlayAvatar } from './components/FloatingOverlayAvatar';
import {
  InstallAppBanner,
  InstallAppButton,
  OfflineIndicator,
} from './components/InstallAppBanner';
import { MemoryBankView } from './components/MemoryBankView';
import { SettingsView } from './components/SettingsView';
import { WebsitePreviewModal } from './components/WebsitePreviewModal';
import { useGwenLive, type LiveToolCall } from './hooks/useGwenLive';
import { useGwenStore } from './hooks/useGwenStore';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import {
  getGeminiRequestHeaders,
  getStoredApiKeyState,
  markGeminiApiKeyInvalid,
  subscribeApiKeyChanges,
  type StoredApiKeyState,
} from './services/apiKeyStorage';
import {
  DriveAndContactsService,
  GmailService,
  GoogleCalendarService,
  KeepAndTasksService,
} from './services/googleWorkspace';
import { IMMUTABLE_DEVELOPER_NAME } from './shared/gwenSystemPrompt';
import type {
  AppTab,
  BrowserMediaCandidate,
  CustomShortcut,
  DeviceSystemState,
  EmpathySignal,
  GeneratedMediaItem,
  GeneratedWebsiteItem,
  GwenSettings,
  MediaAspectRatio,
  MemoryCategory,
  MessagePlatform,
  ParsedCommandResult,
  PendingConfirmationAction,
  PendingMessageDraft,
  PlayStoreAppResult,
  WebSearchSource,
} from './types/gwen';
import { formatCountdown, parseDurationSeconds } from './utils/biometrics';
import {
  downloadDataUrlToDevice,
  renderSvgToPngDataUrl,
  renderVideoStoryboardToWebM,
  slugifyFilename,
  type VideoStoryboardSpec,
} from './utils/mediaRenderer';

const VALID_MEMORY_CATEGORIES: MemoryCategory[] = [
  'Preferences',
  'Personal Context',
  'Routines',
  'Projects',
  'Micro-Detail',
  'Custom Notes',
];

function normalizeCategory(raw: unknown): MemoryCategory {
  if (typeof raw === 'string') {
    const found = VALID_MEMORY_CATEGORIES.find(
      (c) => c.toLowerCase() === raw.trim().toLowerCase()
    );
    if (found) return found;
  }
  return 'Custom Notes';
}

function normalizeAspectRatio(raw: unknown, fallback: MediaAspectRatio = '1:1'): MediaAspectRatio {
  if (raw === '1:1' || raw === '16:9' || raw === '9:16' || raw === '4:3') return raw;
  return fallback;
}

function normalizeTimeTo24h(raw: string): string {
  const cleaned = raw.trim().toLowerCase();
  const match = cleaned.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return '07:00';
  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3];
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  hour = Math.max(0, Math.min(23, hour));
  const safeMin = Math.max(0, Math.min(59, minute));
  return `${String(hour).padStart(2, '0')}:${String(safeMin).padStart(2, '0')}`;
}

function parseNumericSetting(raw: string, current: number, min: number, max: number): number {
  const lower = raw.trim().toLowerCase();
  if (lower.includes('max') || lower.includes('full')) return max;
  if (lower.includes('mute') || lower.includes('silent') || lower === 'min') return min;
  if (lower.includes('up') || lower.includes('increase') || lower.includes('higher') || lower.includes('brighter')) {
    return Math.min(max, current + 20);
  }
  if (lower.includes('down') || lower.includes('decrease') || lower.includes('lower') || lower.includes('dim')) {
    return Math.max(min, current - 20);
  }
  const match = lower.match(/\d+/);
  if (match) {
    return Math.max(min, Math.min(max, parseInt(match[0], 10)));
  }
  return current;
}

function parseBooleanSetting(raw: string, current: boolean): boolean {
  const lower = raw.trim().toLowerCase();
  if (lower === 'on' || lower === 'true' || lower === 'enable' || lower === 'enabled') return true;
  if (lower === 'off' || lower === 'false' || lower === 'disable' || lower === 'disabled') return false;
  return !current;
}

export default function App() {
  const store = useGwenStore();
  const installPrompt = useInstallPrompt();
  const [activeTab, setActiveTab] = useState<AppTab>('companion');
  const [isTextSending, setIsTextSending] = useState(false);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [generationLabel, setGenerationLabel] = useState('');
  const [generationProgress, setGenerationProgress] = useState(0);
  const [previewWebsite, setPreviewWebsite] = useState<GeneratedWebsiteItem | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmationAction | null>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const [apiKeyState, setApiKeyState] = useState<StoredApiKeyState>(() => getStoredApiKeyState());
  const [apiKeyModal, setApiKeyModal] = useState<{
    visible: boolean;
    reason: 'launch' | 'mic';
  }>({ visible: false, reason: 'launch' });
  const launchKeyPromptShownRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const speakReplyRef = useRef<(text: string) => Promise<void>>(async () => {});
  const fallbackSpeechTurnRef = useRef<(spokenText: string) => Promise<string | null>>(
    async () => null
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  // Sync per-device personal Gemini API key state across storage changes
  useEffect(() => {
    return subscribeApiKeyChanges(() => {
      setApiKeyState(getStoredApiKeyState());
    });
  }, []);

  // First-time launch prompt when no personal Gemini API key is configured yet
  useEffect(() => {
    if (
      store.settings.onboardingCompleted &&
      !apiKeyState.hasKey &&
      !launchKeyPromptShownRef.current
    ) {
      launchKeyPromptShownRef.current = true;
      setApiKeyModal({ visible: true, reason: 'launch' });
    }
  }, [store.settings.onboardingCompleted, apiKeyState.hasKey]);

  const handleOpenApiKeySettings = useCallback(() => {
    setApiKeyModal((prev) => ({ ...prev, visible: false }));
    setActiveTab('settings');
    window.setTimeout(() => {
      document.getElementById('sec-apikey')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 120);
  }, []);

  const handleGeminiApiError = useCallback(
    (status: number, errorCode?: string, message?: string) => {
      if (status === 401 || status === 403 || errorCode === 'INVALID_KEY') {
        const next = markGeminiApiKeyInvalid(
          message || 'Your Gemini API key was rejected (401/403). Please update it in Settings.'
        );
        setApiKeyState(next);
        showToast('Invalid or expired Gemini API key — update it in Settings.');
      } else if (status === 429 || errorCode === 'QUOTA_EXCEEDED') {
        showToast('Gemini API quota reached (429) — wait briefly or switch keys in Settings.');
      }
    },
    [showToast]
  );

  // Execute user-confirmed action from ConfirmationBottomSheet
  const handleConfirmPendingAction = useCallback(
    async (action: PendingConfirmationAction) => {
      setIsConfirmingAction(true);
      try {
        if (action.kind === 'gmail_send') {
          await GmailService.sendEmail(action.to, action.subject, action.body);
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Sent Gmail to ${action.to} — Subject: "${action.subject}"`,
          });
          showToast(`Email sent to ${action.to}`);
        } else if (action.kind === 'calendar_create') {
          await GoogleCalendarService.createEvent(
            action.summary,
            action.startIso,
            action.endIso,
            store.settings.timezone,
            action.description
          );
          store.addCalendarEvent(action.summary, action.startIso, action.description);
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Added Google Calendar event "${action.summary}" (${action.startIso})`,
          });
          showToast(`Added to Google Calendar: ${action.summary}`);
        } else if (action.kind === 'calendar_delete') {
          await GoogleCalendarService.deleteEvent(action.eventId);
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Deleted Google Calendar event "${action.summary}"`,
          });
          showToast(`Deleted event: ${action.summary}`);
        } else if (action.kind === 'playstore_install') {
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Opened Google Play Store listing for ${action.app.appName} (${action.app.packageId})`,
          });
          showToast(`Opening Play Store for ${action.app.appName}`);
        } else if (action.kind === 'browser_download') {
          const proxyUrl = `/api/gwen/proxy-download?url=${encodeURIComponent(
            action.media.downloadUrl
          )}&filename=${encodeURIComponent(action.media.suggestedFilename)}`;
          const a = document.createElement('a');
          a.href = proxyUrl;
          a.download = action.media.suggestedFilename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Downloaded "${action.media.title}" from ${action.media.sourceDomain} → Pictures/GwenDownloads/${action.media.suggestedFilename}`,
          });
          showToast(`Downloading ${action.media.suggestedFilename}...`);
        }
        setPendingConfirmation(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Action could not be completed.';
        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: `Action failed: ${msg}`,
        });
        showToast(msg);
      } finally {
        setIsConfirmingAction(false);
      }
    },
    [showToast, store]
  );

  // Background automatic memory & Zero-Forgetfulness session continuity extraction
  const runAutoMemoryExtraction = useCallback(
    async (userMessage: string, assistantReply?: string) => {
      if (store.settings.incognitoMode || !store.settings.autoExtractMemories) return;
      if (userMessage.trim().length < 8) return;
      try {
        const res = await fetch('/api/gwen/extract-memories', {
          method: 'POST',
          headers: getGeminiRequestHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            userMessage,
            assistantReply,
            existingMemories: store.memories.map((m) => m.content),
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          memories?: Array<{
            content: string;
            category: string;
            pinned: boolean;
            isPermanent?: boolean;
          }>;
          sessionContinuity?: {
            lastLeftTopic?: string;
            lastSummary?: string;
            lastUserMood?: string;
            unfinishedThreads?: string[];
          } | null;
        };

        if (data.sessionContinuity) {
          store.updateSessionState({
            lastLeftTopic: data.sessionContinuity.lastLeftTopic || store.sessionState.lastLeftTopic,
            lastSummary: data.sessionContinuity.lastSummary || store.sessionState.lastSummary,
            lastUserMood: data.sessionContinuity.lastUserMood || store.sessionState.lastUserMood,
            unfinishedThreads: Array.isArray(data.sessionContinuity.unfinishedThreads)
              ? data.sessionContinuity.unfinishedThreads.slice(0, 4)
              : store.sessionState.unfinishedThreads,
          });
        }

        if (data.memories && data.memories.length > 0) {
          let added = 0;
          for (const item of data.memories) {
            const saved = store.addMemory(
              item.content,
              normalizeCategory(item.category),
              'auto',
              Boolean(item.pinned),
              item.isPermanent !== false
            );
            if (saved) added += 1;
          }
          if (added > 0) {
            showToast(
              added === 1
                ? 'Saved 1 new fact to Permanent Memory Core'
                : `Saved ${added} new facts to Permanent Memory Core`
            );
          }
        }
      } catch {
        // Silent background extraction failure
      }
    },
    [showToast, store]
  );

  // Studio: AI Image Generator (Free-tier Gemini SVG -> High-Res PNG + Auto-Save to Gallery)
  const handleGenerateImage = useCallback(
    async (prompt: string, aspectRatio: MediaAspectRatio = '1:1', style = 'cinematic illustration') => {
      if (!prompt.trim() || isGeneratingMedia) return;
      setIsGeneratingMedia(true);
      setGenerationLabel(`Creating ${aspectRatio} AI artwork...`);
      setGenerationProgress(18);
      try {
        const res = await fetch('/api/gwen/generate-image', {
          method: 'POST',
          headers: getGeminiRequestHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ prompt: prompt.trim(), aspectRatio, style }),
        });
        const data = (await res.json()) as { svg?: string; error?: string; errorCode?: string };
        if (!res.ok || !data.svg) {
          handleGeminiApiError(res.status, data.errorCode, data.error);
          throw new Error(data.error || 'Could not generate image right now.');
        }

        setGenerationLabel('Rendering high-res PNG for Gallery...');
        setGenerationProgress(72);
        const { dataUrl, filename } = await renderSvgToPngDataUrl(data.svg, aspectRatio, prompt);
        setGenerationProgress(100);

        const item: GeneratedMediaItem = {
          id: `img-${Date.now()}`,
          kind: 'image',
          prompt: prompt.trim(),
          style,
          aspectRatio,
          dataUrl,
          mimeType: 'image/png',
          filename,
          savedToGallery: true,
          createdAt: new Date().toISOString(),
        };
        store.addMediaCreation(item);
        downloadDataUrlToDevice(dataUrl, filename);

        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: `Saved to your gallery! Created ${aspectRatio} image: "${prompt.trim()}" (Pictures/Gwen/${filename})`,
          mediaPreviewId: item.id,
        });
        showToast('Saved to your gallery! Open Studio tab to view.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Image generation failed.';
        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: `Image generation error: ${msg}`,
        });
        showToast(msg);
      } finally {
        setIsGeneratingMedia(false);
        setGenerationLabel('');
        setGenerationProgress(0);
      }
    },
    [isGeneratingMedia, showToast, store]
  );

  // Studio: AI Motion Video Generator (Free-tier Gemini Storyboard -> 24fps WebM + Auto-Save)
  const handleGenerateVideo = useCallback(
    async (prompt: string, aspectRatio: MediaAspectRatio = '16:9', duration = 6) => {
      if (!prompt.trim() || isGeneratingMedia) return;
      const safeDur = Math.max(3, Math.min(10, Math.round(duration || 6)));
      setIsGeneratingMedia(true);
      setGenerationLabel(`Directing ${safeDur}s ${aspectRatio} AI storyboard...`);
      setGenerationProgress(15);
      try {
        const res = await fetch('/api/gwen/generate-video', {
          method: 'POST',
          headers: getGeminiRequestHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ prompt: prompt.trim(), aspectRatio, duration: safeDur }),
        });
        const data = (await res.json()) as {
          storyboard?: VideoStoryboardSpec;
          error?: string;
          errorCode?: string;
        };
        if (!res.ok || !data.storyboard) {
          handleGeminiApiError(res.status, data.errorCode, data.error);
          throw new Error(data.error || 'Could not generate video storyboard right now.');
        }

        setGenerationLabel(`Encoding ${safeDur}s ${aspectRatio} WebM motion video...`);
        const { dataUrl, mimeType, filename } = await renderVideoStoryboardToWebM(
          data.storyboard,
          aspectRatio,
          safeDur,
          (pct) => setGenerationProgress(Math.max(20, pct))
        );

        const item: GeneratedMediaItem = {
          id: `vid-${Date.now()}`,
          kind: 'video',
          prompt: prompt.trim(),
          style: data.storyboard.mood || 'cinematic motion',
          aspectRatio,
          durationSec: safeDur,
          dataUrl,
          mimeType,
          filename,
          savedToGallery: true,
          createdAt: new Date().toISOString(),
        };
        store.addMediaCreation(item);
        downloadDataUrlToDevice(dataUrl, filename);

        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: `Saved to your gallery! Rendered ${safeDur}s ${aspectRatio} video: "${prompt.trim()}" (Movies/Gwen/${filename})`,
          mediaPreviewId: item.id,
        });
        showToast('Video saved to your gallery! Open Studio tab to play.');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Video generation failed.';
        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: `Video generation error: ${msg}`,
        });
        showToast(msg);
      } finally {
        setIsGeneratingMedia(false);
        setGenerationLabel('');
        setGenerationProgress(0);
      }
    },
    [isGeneratingMedia, showToast, store]
  );

  // Studio: Voice-Driven Responsive Webpage & Website Builder
  const handleBuildWebsite = useCallback(
    async (description: string, title?: string) => {
      if (!description.trim() || isGeneratingMedia) return;
      setIsGeneratingMedia(true);
      setGenerationLabel('Generating responsive HTML5 / CSS / JS website...');
      setGenerationProgress(32);
      try {
        const res = await fetch('/api/gwen/build-website', {
          method: 'POST',
          headers: getGeminiRequestHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ description: description.trim(), title }),
        });
        const data = (await res.json()) as {
          title?: string;
          html?: string;
          error?: string;
          errorCode?: string;
        };
        if (!res.ok || !data.html) {
          handleGeminiApiError(res.status, data.errorCode, data.error);
          throw new Error(data.error || 'Could not generate website right now.');
        }

        setGenerationProgress(95);
        const resolvedTitle = data.title || title || description.trim().slice(0, 42);
        const slug = slugifyFilename(resolvedTitle);
        const site: GeneratedWebsiteItem = {
          id: `site-${Date.now()}`,
          title: resolvedTitle,
          slug,
          description: description.trim(),
          html: data.html,
          storagePath: `Documents/GwenWebsites/${slug}/index.html`,
          createdAt: new Date().toISOString(),
        };
        store.addWebsiteCreation(site);
        setPreviewWebsite(site);

        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: `Built responsive website "${resolvedTitle}" and saved to ${site.storagePath}. Live preview opened!`,
          websitePreviewId: site.id,
        });
        showToast(`Website ready: ${resolvedTitle}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Website builder failed.';
        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: `Website builder error: ${msg}`,
        });
        showToast(msg);
      } finally {
        setIsGeneratingMedia(false);
        setGenerationLabel('');
        setGenerationProgress(0);
      }
    },
    [isGeneratingMedia, showToast, store]
  );

  // Ref bridge so tool handlers can invoke live controls without circular deps
  const liveControlRef = useRef<{
    startScreen: () => Promise<boolean>;
    stopScreen: () => void;
    isSharing: boolean;
    startCamera: (facing?: 'user' | 'environment') => Promise<boolean>;
    stopCamera: () => void;
    isCameraActive: boolean;
    isConnected: boolean;
    sendLiveText: (text: string) => boolean;
    enterSleepMode: () => void;
  }>({
    startScreen: async () => false,
    stopScreen: () => {},
    isSharing: false,
    startCamera: async () => false,
    stopCamera: () => {},
    isCameraActive: false,
    isConnected: false,
    sendLiveText: () => false,
    enterSleepMode: () => {},
  });

  const applyPersonaSwitch = useCallback(
    (personaId: string) => {
      const match = store.personas.find((p) => p.id === personaId);
      if (!match) return;
      store.updateSettings({ activePersonaId: match.id });
      if (liveControlRef.current.isConnected) {
        liveControlRef.current.sendLiveText(
          `[System Update] Immediately switch your active AI persona to "${match.name}" (${match.tagline}). Adopt this behavioral tone right now: ${match.systemPrompt}. Continue preserving Syed Farhan as your developer and creator.`
        );
      }
      showToast(`Active persona: ${match.name}`);
    },
    [showToast, store]
  );

  const handleUpdateSettings = useCallback(
    (patch: Partial<GwenSettings>) => {
      if (patch.activePersonaId && patch.activePersonaId !== store.settings.activePersonaId) {
        const match = store.personas.find((p) => p.id === patch.activePersonaId);
        store.updateSettings(patch);
        if (match && liveControlRef.current.isConnected) {
          liveControlRef.current.sendLiveText(
            `[System Update] Immediately switch your active AI persona to "${match.name}" (${match.tagline}). Adopt this behavioral tone right now: ${match.systemPrompt}.`
          );
        }
        if (match) showToast(`Active persona: ${match.name}`);
        return;
      }
      store.updateSettings(patch);
    },
    [showToast, store]
  );

  const handleSleepGwen = useCallback(
    (farewellText?: string, delayMs = 0) => {
      const performSleep = () => {
        if (ttsAudioRef.current) {
          ttsAudioRef.current.pause();
          ttsAudioRef.current = null;
        }
        liveControlRef.current.enterSleepMode();
        store.updateSettings({ overlayEnabled: false });
        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: 'Gwen entered Dormant Sleep Mode — mic, camera, screen share, and wake lock released.',
        });
        showToast('Gwen is now sleeping. Tap Wake Gwen anytime.');
      };

      if (farewellText) {
        store.appendMessage({
          role: 'gwen',
          mode: 'command',
          text: farewellText,
        });
      }

      if (delayMs > 0) {
        window.setTimeout(performSleep, delayMs);
      } else {
        performSleep();
      }
    },
    [showToast, store]
  );

  const applySystemSetting = useCallback(
    (settingRaw: string, valueRaw: string) => {
      const setting = settingRaw.trim().toLowerCase().replace(/[\s-]+/g, '_');
      const val = (valueRaw || 'toggle').trim();
      const cur = store.deviceState;
      const patch: Partial<DeviceSystemState> = {};
      let summary = '';

      if (setting.includes('bright')) {
        const next = parseNumericSetting(val, cur.brightness, 15, 100);
        patch.brightness = next;
        summary = `Screen brightness set to ${next}%`;
      } else if (setting.includes('ring')) {
        const next = parseNumericSetting(val, cur.ringVolume, 0, 100);
        patch.ringVolume = next;
        summary = `Ring volume set to ${next}%`;
      } else if (setting.includes('alarm')) {
        const next = parseNumericSetting(val, cur.alarmVolume, 0, 100);
        patch.alarmVolume = next;
        summary = `Alarm volume set to ${next}%`;
      } else if (setting.includes('vol') || setting.includes('media') || setting.includes('sound')) {
        const next = parseNumericSetting(val, cur.mediaVolume, 0, 100);
        patch.mediaVolume = next;
        summary = next === 0 ? 'Media volume muted (0%)' : `Media volume set to ${next}%`;
      } else if (setting.includes('dnd') || setting.includes('disturb')) {
        const next = parseBooleanSetting(val, cur.doNotDisturb);
        patch.doNotDisturb = next;
        summary = next ? 'Do Not Disturb enabled' : 'Do Not Disturb disabled';
      } else if (setting.includes('flash') || setting.includes('torch')) {
        const next = parseBooleanSetting(val, cur.flashlight);
        patch.flashlight = next;
        summary = next ? 'Flashlight turned ON' : 'Flashlight turned OFF';
      } else if (setting.includes('wifi') || setting.includes('wi_fi')) {
        const next = parseBooleanSetting(val, cur.wifi);
        patch.wifi = next;
        summary = next ? 'Wi-Fi panel enabled' : 'Wi-Fi disabled';
      } else if (setting.includes('blue')) {
        const next = parseBooleanSetting(val, cur.bluetooth);
        patch.bluetooth = next;
        summary = next ? 'Bluetooth enabled' : 'Bluetooth disabled';
      } else if (setting.includes('battery') || setting.includes('saver')) {
        const next = parseBooleanSetting(val, cur.batterySaver);
        patch.batterySaver = next;
        summary = next ? 'Battery Saver enabled' : 'Battery Saver disabled';
      }

      if (Object.keys(patch).length > 0) {
        store.updateDeviceState(patch);
        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: summary,
        });
        showToast(summary);
      }
    },
    [showToast, store]
  );

  // Execute a device/app/system/productivity/studio/care/weather/memory/persona action
  const executeDeviceAction = useCallback(
    async (
      action: string,
      target?: string,
      payload?: string,
      value?: string,
      platform?: string,
      aspectRatio?: MediaAspectRatio,
      style?: string
    ) => {
      const normalizedAction = action.toLowerCase();

      if (normalizedAction === 'sleep_gwen' || normalizedAction === 'sleepgwen') {
        handleSleepGwen(payload || 'Goodnight! Going to sleep now. Tap Wake Gwen whenever you need me.');
        return;
      }

      if (normalizedAction === 'generate_image' || normalizedAction === 'generateimage') {
        await handleGenerateImage(
          payload || target || 'Futuristic glowing teal landscape',
          normalizeAspectRatio(aspectRatio, '1:1'),
          style || 'cinematic illustration'
        );
        return;
      }

      if (normalizedAction === 'generate_video' || normalizedAction === 'generatevideo') {
        const dur = Number(value) || 6;
        await handleGenerateVideo(
          payload || target || 'Dreamy aurora sky over glowing mountains',
          normalizeAspectRatio(aspectRatio, '16:9'),
          dur
        );
        return;
      }

      if (normalizedAction === 'build_website' || normalizedAction === 'buildwebsite') {
        await handleBuildWebsite(
          payload || target || 'Modern responsive personal portfolio website',
          target && target !== payload ? target : undefined
        );
        return;
      }

      if (normalizedAction === 'get_weather' || normalizedAction === 'getweather') {
        const w = await store.refreshWeather(target || undefined);
        if (w) {
          const rainHint =
            w.rainChance >= 35
              ? ` There's a ${w.rainChance}% chance of rain, so keep an umbrella handy!`
              : '';
          const reply = `Right now in ${w.city}, it's ${Math.round(w.temperatureC)}°C (feels like ${Math.round(w.feelsLikeC)}°C) with ${w.condition.toLowerCase()}, ${w.humidity}% humidity, and ${Math.round(w.windKmh)} km/h wind.${rainHint}`;
          store.appendMessage({
            role: 'gwen',
            mode: 'command',
            text: reply,
          });
          showToast(`${w.city}: ${Math.round(w.temperatureC)}°C · ${w.condition}`);
          if (store.settings.autoSpeakTextReplies && !liveControlRef.current.isConnected) {
            void speakReplyRef.current(reply);
          }
        } else {
          showToast('Could not fetch live weather right now');
        }
        return;
      }

      if (normalizedAction === 'manage_companion_care' || normalizedAction === 'managecompanioncare') {
        const op = (target || 'log_water').toLowerCase();
        if (op === 'log_water') {
          store.logWaterGlass();
          const nextCount = store.careState.waterGlassesToday + 1;
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Logged water intake: ${nextCount}/${store.careState.waterGoalGlasses} glasses today`,
          });
          showToast(`Hydration: ${nextCount}/${store.careState.waterGoalGlasses} glasses`);
        } else if (op === 'set_water_goal') {
          const parsedGoal = Math.max(4, Math.min(16, parseInt(value || '8', 10) || 8));
          store.updateCareState({ waterGoalGlasses: parsedGoal });
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Updated daily hydration goal to ${parsedGoal} glasses`,
          });
          showToast(`Water goal set to ${parsedGoal} glasses`);
        } else if (op === 'set_wakeup') {
          const normalizedTime = normalizeTimeTo24h(value || payload || '07:00');
          store.updateCareState({
            wakeUpTimeIST: normalizedTime,
            wakeUpEnabled: true,
          });
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Scheduled escalating Wake-Up Alarm for ${normalizedTime} (${store.settings.timezone})`,
          });
          showToast(`Wake-up alarm set for ${normalizedTime}`);
        } else if (op === 'trigger_wakeup_now') {
          store.triggerWakeUpAlarmNow();
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: 'Triggered escalating Wake-Up Alarm test',
          });
        } else if (op === 'toggle_rest_reminders') {
          const nextRest = !store.careState.restReminderEnabled;
          store.updateCareState({ restReminderEnabled: nextRest });
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: nextRest ? 'Rest break reminders enabled' : 'Rest break reminders paused',
          });
          showToast(nextRest ? 'Rest reminders ON' : 'Rest reminders paused');
        }
        return;
      }

      if (normalizedAction === 'change_timezone' || normalizedAction === 'changetimezone') {
        const tz = (target || value || 'Asia/Kolkata').trim();
        store.updateSettings({ timezone: tz });
        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: `Updated active system timezone to ${tz}`,
        });
        showToast(`Timezone updated: ${tz}`);
        return;
      }

      if (normalizedAction === 'control_system_setting' || normalizedAction === 'controlsystemsetting') {
        applySystemSetting(target || 'brightness', value || payload || 'toggle');
        return;
      }

      if (
        normalizedAction === 'manage_calendar' ||
        normalizedAction === 'managecalendar' ||
        normalizedAction === 'manage_google_calendar' ||
        normalizedAction === 'managegooglecalendar'
      ) {
        const op = (target || 'create').toLowerCase();
        const useGoogleCal = store.googleTokenReady && store.workspaceScopes.calendar;
        if (op === 'list') {
          if (useGoogleCal) {
            try {
              const events = await GoogleCalendarService.listUpcomingEvents(6);
              const reply =
                events.length === 0
                  ? 'Your Google Calendar is clear — no upcoming events scheduled.'
                  : `Upcoming Google Calendar events: ${events
                      .map((e) => `${e.summary} (${e.start})`)
                      .join('; ')}.`;
              store.appendMessage({ role: 'gwen', mode: 'command', text: reply });
              showToast(`Synced ${events.length} Google Calendar events`);
              if (store.settings.autoSpeakTextReplies && !liveControlRef.current.isConnected) {
                void speakReplyRef.current(reply);
              }
              return;
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Google Calendar error';
              showToast(msg);
            }
          }
          const summary =
            store.calendarEvents.length === 0
              ? 'No upcoming calendar events scheduled yet.'
              : `Upcoming events: ${store.calendarEvents
                  .slice(0, 4)
                  .map((e) => `${e.title} (${e.dateTime})`)
                  .join('; ')}`;
          store.appendMessage({ role: 'action', mode: 'command', text: summary });
          showToast(`Found ${store.calendarEvents.length} calendar events`);
        } else if (op === 'delete' && useGoogleCal) {
          try {
            const events = await GoogleCalendarService.listUpcomingEvents(10);
            const q = (payload || value || '').toLowerCase();
            const match = events.find((e) => e.summary.toLowerCase().includes(q)) || events[0];
            if (!match) {
              showToast('No matching Google Calendar event found');
              return;
            }
            setPendingConfirmation({
              id: `cal-del-${Date.now()}`,
              kind: 'calendar_delete',
              title: 'Delete Google Calendar Event',
              eventId: match.id,
              summary: match.summary,
            });
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'Could not fetch Google Calendar events');
          }
        } else {
          const title = payload || target || 'Scheduled Event';
          const dateTime = value || 'Today';
          if (useGoogleCal) {
            const parsedStart = new Date(dateTime);
            const startDate = Number.isNaN(parsedStart.getTime())
              ? new Date(Date.now() + 60 * 60 * 1000)
              : parsedStart;
            const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
            setPendingConfirmation({
              id: `cal-add-${Date.now()}`,
              kind: 'calendar_create',
              title: 'Add Event to Google Calendar',
              summary: title,
              startIso: startDate.toISOString(),
              endIso: endDate.toISOString(),
              description: `Scheduled via Gwen (${store.settings.timezone})`,
            });
            store.appendMessage({
              role: 'action',
              mode: 'command',
              text: `Prepared Google Calendar event "${title}" — awaiting your confirmation.`,
            });
            showToast(`Confirm calendar event: ${title}`);
            return;
          }
          store.addCalendarEvent(title, dateTime);
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Added calendar event: "${title}" — ${dateTime}`,
          });
          showToast(`Calendar event added: ${title}`);
        }
        return;
      }

      if (normalizedAction === 'manage_gmail' || normalizedAction === 'managegmail') {
        if (!store.googleTokenReady) {
          const promptMsg =
            'Please link or reconnect your Google Account in Settings → Connected Google Account first so I can access your Gmail securely.';
          store.appendMessage({ role: 'gwen', mode: 'command', text: promptMsg });
          showToast('Link Google Account in Settings first');
          return;
        }
        const op = (target || 'list_unread').toLowerCase();
        if (op === 'draft_send' || op === 'send') {
          let recipient = payload || '';
          const parts = (value || '').split('||');
          const subject = parts[0]?.trim() || 'Message from Gwen';
          const body = parts[1]?.trim() || value || 'Hi! Sending a quick update.';
          // Try resolving contact email via People API if recipient isn't an email
          if (recipient && !recipient.includes('@') && store.workspaceScopes.contacts) {
            try {
              const matches = await DriveAndContactsService.searchContacts(recipient);
              if (matches[0]?.email) recipient = matches[0].email;
            } catch {
              // Keep provided recipient string
            }
          }
          setPendingConfirmation({
            id: `gmail-${Date.now()}`,
            kind: 'gmail_send',
            title: 'Send Gmail Message',
            to: recipient || 'recipient@example.com',
            subject,
            body,
          });
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Drafted email to ${recipient || 'recipient'} ("${subject}") — awaiting your confirmation before sending.`,
          });
          showToast('Review & confirm email before sending');
          return;
        }
        try {
          const query = op === 'search' && payload ? payload : 'is:unread';
          const msgs = await GmailService.listMessages(query, 5);
          const reply =
            msgs.length === 0
              ? op === 'search'
                ? `I didn't find any Gmail messages matching "${payload}".`
                : 'You have no unread Gmail messages right now!'
              : `Here are your latest Gmail messages:\n${msgs
                  .map((m, i) => `${i + 1}. From ${m.from}: "${m.subject}" — ${m.snippet.slice(0, 90)}`)
                  .join('\n')}`;
          store.appendMessage({ role: 'gwen', mode: 'command', text: reply });
          showToast(`Fetched ${msgs.length} Gmail message(s)`);
          if (store.settings.autoSpeakTextReplies && !liveControlRef.current.isConnected) {
            void speakReplyRef.current(reply);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unable to read Gmail right now.';
          store.appendMessage({ role: 'gwen', mode: 'command', text: msg });
          showToast(msg);
        }
        return;
      }

      if (normalizedAction === 'manage_keep_tasks' || normalizedAction === 'managekeepandtasks') {
        const op = (target || 'list').toLowerCase();
        if (op === 'create_note') {
          const title = payload || 'Quick Note';
          const body = value || payload || '';
          let googleTaskId: string | undefined;
          if (store.googleTokenReady && store.workspaceScopes.tasksAndNotes) {
            try {
              const t = await KeepAndTasksService.createGoogleTask(title, body);
              googleTaskId = t.id;
            } catch {
              // Still persist locally
            }
          }
          store.addKeepNote(title, body, googleTaskId);
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Saved Keep-style note "${title}"${googleTaskId ? ' and synced with Google Tasks' : ' locally'}.`,
          });
          showToast(`Note saved: ${title}`);
          return;
        }
        if (op === 'create_task') {
          const title = payload || value || 'New Task';
          store.addReminder(title, value);
          if (store.googleTokenReady && store.workspaceScopes.tasksAndNotes) {
            try {
              await KeepAndTasksService.createGoogleTask(title, value);
              store.appendMessage({
                role: 'action',
                mode: 'command',
                text: `Added Google Task: "${title}"`,
              });
              showToast(`Added Google Task: ${title}`);
              return;
            } catch (err) {
              showToast(err instanceof Error ? err.message : 'Saved locally; Google Tasks sync failed');
              return;
            }
          }
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Added task: "${title}"`,
          });
          showToast(`Task saved: ${title}`);
          return;
        }
        if (op === 'complete_task') {
          const query = (payload || '').trim();
          store.completeReminderByQuery(query);
          if (store.googleTokenReady && store.workspaceScopes.tasksAndNotes) {
            try {
              const tasks = await KeepAndTasksService.listGoogleTasks(15);
              const match = tasks.find((t) =>
                t.title.toLowerCase().includes(query.toLowerCase())
              );
              if (match) {
                await KeepAndTasksService.completeGoogleTask(match.id);
              }
            } catch {
              // Local already updated
            }
          }
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Marked task "${query}" as completed.`,
          });
          showToast(`Completed task: ${query}`);
          return;
        }
        // list
        let googleTaskLines: string[] = [];
        if (store.googleTokenReady && store.workspaceScopes.tasksAndNotes) {
          try {
            const gTasks = await KeepAndTasksService.listGoogleTasks(10);
            googleTaskLines = gTasks.map((t) => `• ${t.title}`);
          } catch {
            // Fall back to local notes
          }
        }
        const localNoteLines = store.keepNotes.slice(0, 6).map((n) => `• ${n.title}${n.content ? `: ${n.content}` : ''}`);
        const combined = [...googleTaskLines, ...localNoteLines];
        const reply =
          combined.length === 0
            ? 'You have no pending Google Tasks or Keep-style notes right now.'
            : `Your tasks & notes:\n${combined.join('\n')}`;
        store.appendMessage({ role: 'gwen', mode: 'command', text: reply });
        showToast(`Loaded ${combined.length} task/note item(s)`);
        return;
      }

      if (normalizedAction === 'search_drive_contacts' || normalizedAction === 'searchdriveandcontacts') {
        if (!store.googleTokenReady) {
          const promptMsg =
            'Link or reconnect your Google Account in Settings → Connected Google Account to search Google Drive or Contacts.';
          store.appendMessage({ role: 'gwen', mode: 'command', text: promptMsg });
          showToast('Link Google Account in Settings first');
          return;
        }
        const op = (target || 'search_drive').toLowerCase();
        try {
          if (op === 'search_contacts') {
            const matches = await DriveAndContactsService.searchContacts(payload || '');
            const reply =
              matches.length === 0
                ? `No Google Contacts matched "${payload}".`
                : `Contacts found:\n${matches
                    .map((c) => `• ${c.name}${c.email ? ` — ${c.email}` : ''}${c.phone ? ` (${c.phone})` : ''}`)
                    .join('\n')}`;
            store.appendMessage({ role: 'gwen', mode: 'command', text: reply });
            showToast(`Found ${matches.length} contact(s)`);
          } else if (op === 'backup_note') {
            const fname = `${slugifyFilename(payload || 'gwen-note')}.txt`;
            const file = await DriveAndContactsService.backupTextToDrive(
              fname,
              value || payload || 'Saved from Gwen'
            );
            store.appendMessage({
              role: 'action',
              mode: 'command',
              text: `Backed up "${file.name}" to your Google Drive.`,
            });
            showToast(`Backed up to Drive: ${file.name}`);
          } else {
            const files = await DriveAndContactsService.searchDriveFiles(payload || '', 6);
            const reply =
              files.length === 0
                ? `No Google Drive files matched "${payload}".`
                : `Google Drive files found:\n${files
                    .map((f) => `• ${f.name}${f.webViewLink ? ` — ${f.webViewLink}` : ''}`)
                    .join('\n')}`;
            store.appendMessage({ role: 'gwen', mode: 'command', text: reply });
            showToast(`Found ${files.length} Drive file(s)`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Google Drive/Contacts lookup failed.';
          store.appendMessage({ role: 'gwen', mode: 'command', text: msg });
          showToast(msg);
        }
        return;
      }

      if (normalizedAction === 'live_google_search' || normalizedAction === 'livegooglesearch') {
        const query = payload || target || '';
        if (!query.trim()) return;
        showToast(`Searching Google for "${query}"...`);
        try {
          const res = await fetch('/api/gwen/web-search', {
            method: 'POST',
            headers: getGeminiRequestHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ query: query.trim(), timezone: store.settings.timezone }),
          });
          const data = (await res.json()) as {
            answer?: string;
            sources?: WebSearchSource[];
            error?: string;
            errorCode?: string;
          };
          if (!res.ok || !data.answer) {
            handleGeminiApiError(res.status, data.errorCode, data.error);
            throw new Error(data.error || 'Live Google Search is temporarily unavailable.');
          }
          const sourceLines =
            data.sources && data.sources.length > 0
              ? `\n\nSources:\n${data.sources.slice(0, 4).map((s) => `• ${s.title} (${s.domain}) — ${s.url}`).join('\n')}`
              : '';
          const fullReply = `${data.answer}${sourceLines}`;
          store.appendMessage({
            role: 'gwen',
            mode: 'command',
            text: fullReply,
          });
          if (store.settings.autoSpeakTextReplies && !liveControlRef.current.isConnected) {
            void speakReplyRef.current(data.answer);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Live Google Search failed.';
          store.appendMessage({ role: 'gwen', mode: 'command', text: msg });
          showToast(msg);
        }
        return;
      }

      if (normalizedAction === 'download_playstore_app' || normalizedAction === 'downloadplaystoreapp') {
        const appQuery = payload || target || '';
        if (!appQuery.trim()) return;
        showToast(`Finding ${appQuery} on Google Play Store...`);
        try {
          const res = await fetch('/api/gwen/search-playstore', {
            method: 'POST',
            headers: getGeminiRequestHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ appName: appQuery.trim() }),
          });
          const data = (await res.json()) as {
            app?: PlayStoreAppResult;
            error?: string;
            errorCode?: string;
          };
          if (!res.ok || !data.app) {
            handleGeminiApiError(res.status, data.errorCode, data.error);
            throw new Error(data.error || 'Could not find that app on Google Play Store.');
          }
          setPendingConfirmation({
            id: `play-${Date.now()}`,
            kind: 'playstore_install',
            title: `Install ${data.app.appName}`,
            app: data.app,
          });
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Found "${data.app.appName}" by ${data.app.developer} on Google Play Store — confirm to open Play Store.`,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Play Store lookup failed.';
          showToast(msg);
        }
        return;
      }

      if (normalizedAction === 'search_download_media' || normalizedAction === 'searchanddownloadmedia') {
        const query = payload || target || '';
        if (!query.trim()) return;
        const kind = value === 'file' ? 'file' : 'image';
        showToast(`Searching browser ${kind}s for "${query}"...`);
        try {
          const res = await fetch('/api/gwen/search-browser-media', {
            method: 'POST',
            headers: getGeminiRequestHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ query: query.trim(), kind }),
          });
          const data = (await res.json()) as {
            candidate?: BrowserMediaCandidate | null;
            candidates?: BrowserMediaCandidate[];
            error?: string;
            errorCode?: string;
          };
          const chosen = data.candidate || data.candidates?.[0];
          if (!res.ok || !chosen) {
            handleGeminiApiError(res.status, data.errorCode, data.error);
            throw new Error(data.error || `Could not find a downloadable ${kind} for "${query}".`);
          }
          setPendingConfirmation({
            id: `dl-${Date.now()}`,
            kind: 'browser_download',
            title: `Download ${kind === 'image' ? 'Image' : 'File'}`,
            media: chosen,
          });
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Found "${chosen.title}" from ${chosen.sourceDomain} — confirm preview to save to your device.`,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Browser media search failed.';
          store.appendMessage({ role: 'gwen', mode: 'command', text: msg });
          showToast(msg);
        }
        return;
      }

      if (normalizedAction === 'manage_kids_study' || normalizedAction === 'managekidsstudy') {
        const op = (target || 'switch_child').toLowerCase();
        const kidName = (payload || '').trim();

        if (op === 'parent_report') {
          const report = store.getParentProgressReport(
            kidName || store.activeKidBundle?.profile.name || 'your child',
            value
          );
          store.appendMessage({ role: 'gwen', mode: 'command', text: report });
          showToast('Generated isolated child progress report');
          if (store.settings.autoSpeakTextReplies && !liveControlRef.current.isConnected) {
            void speakReplyRef.current(report);
          }
          return;
        }

        if (op === 'switch_child') {
          if (!kidName) return;
          let matched = store.switchKidByName(kidName);
          if (!matched) {
            const created = await store.addKidProfile(kidName, 8, 'Grade 3', [
              'Math',
              'English',
              'Science',
            ]);
            matched = { profile: created, lessons: [], practiceLogs: [], quizResults: [] };
          }
          if (store.settings.activePersonaId !== 'home-teacher') {
            applyPersonaSwitch('home-teacher');
          }
          const greet = `Hi ${matched.profile.name}! I've opened your own private study notebook (${matched.profile.stars} stars so far). What fun subject would you like to learn or practice today?`;
          store.appendMessage({ role: 'gwen', mode: 'command', text: greet });
          showToast(`Home Teacher active for ${matched.profile.name}`);
          if (store.settings.autoSpeakTextReplies && !liveControlRef.current.isConnected) {
            void speakReplyRef.current(greet);
          }
          return;
        }

        // Resolve target child for logging lesson / practice / quiz
        const targetBundle =
          (kidName ? store.switchKidByName(kidName) : null) || store.activeKidBundle;
        if (!targetBundle) {
          showToast('Add or select a child profile in Settings → Kids Study Hub first');
          return;
        }
        const kidId = targetBundle.profile.id;
        if (op === 'log_lesson') {
          await store.addKidLesson(
            kidId,
            platform || 'General',
            value || 'Daily Lesson',
            `Completed interactive lesson with Gwen`,
            'practicing'
          );
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Saved lesson to ${targetBundle.profile.name}'s isolated study vault (+2 ★)`,
          });
          showToast(`Saved lesson for ${targetBundle.profile.name}`);
        } else if (op === 'log_practice') {
          await store.addKidPracticeLog(
            kidId,
            platform || 'Practice',
            value || 'Guided practice',
            '',
            'Wonderful effort!',
            2
          );
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Logged practice & stars for ${targetBundle.profile.name} (+2 ★)`,
          });
          showToast(`Logged practice for ${targetBundle.profile.name}`);
        } else if (op === 'record_quiz') {
          const [scStr, totStr] = (value || '5/5').split('/');
          await store.addKidQuizResult(
            kidId,
            platform || 'General',
            'Mini Quiz',
            Number(scStr) || 5,
            Number(totStr) || 5
          );
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Recorded quiz score (${value || '5/5'}) in ${targetBundle.profile.name}'s isolated profile!`,
          });
          showToast(`Saved quiz score for ${targetBundle.profile.name}`);
        }
        return;
      }

      if (normalizedAction === 'navigate_maps' || normalizedAction === 'navigatemaps') {
        const dest = target || payload || 'requested destination';
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dest)}`;
        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: `Google Maps route prepared for "${dest}" (${mapsUrl})`,
        });
        showToast(`Navigation ready: ${dest}`);
        return;
      }

      if (normalizedAction === 'compose_message' || normalizedAction === 'composemessage') {
        const rawPlat = (platform || '').toLowerCase();
        const plat: MessagePlatform = rawPlat.includes('sms') || rawPlat.includes('text')
          ? 'SMS'
          : rawPlat.includes('mess')
            ? 'Messenger'
            : 'WhatsApp';
        const recipient = target || 'Contact';
        const msgText = payload || value || 'Hey!';
        store.queueMessageDraft(plat, recipient, msgText);
        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: `Prepared ${plat} draft to ${recipient} — awaiting your confirmation before sending.`,
        });
        showToast(`Confirm ${plat} draft to ${recipient}`);
        return;
      }

      if (normalizedAction === 'manage_alarm_timer' || normalizedAction === 'managealarmtimer') {
        const isAlarm =
          (target || '').toLowerCase().includes('alarm') ||
          /\d{1,2}:\d{2}|\b(am|pm)\b/i.test(value || '');
        if (isAlarm) {
          const timeText = value || target || '7:00 AM';
          const label = payload || 'Gwen Alarm';
          store.addAlarm(timeText, label);
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Alarm set for ${timeText} (${label})`,
          });
          showToast(`Alarm set: ${timeText}`);
        } else {
          const seconds = parseDurationSeconds(value || payload || '5 minutes');
          const label = payload || 'Timer';
          store.addTimer(seconds, label);
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Started ${formatCountdown(seconds)} timer (${label})`,
          });
          showToast(`Timer started: ${formatCountdown(seconds)}`);
        }
        return;
      }

      if (normalizedAction === 'manage_reminder_task' || normalizedAction === 'manageremindertask') {
        const op = (target || 'create').toLowerCase();
        if (op === 'complete') {
          const done = store.completeReminderByQuery(payload || '');
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: done
              ? `Marked reminder "${payload}" as complete`
              : `No matching reminder found for "${payload}"`,
          });
          showToast(done ? 'Reminder completed' : 'Reminder not found');
        } else if (op === 'list') {
          const active = store.reminders.filter((r) => !r.completed);
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text:
              active.length === 0
                ? 'You have no pending reminders.'
                : `Pending reminders: ${active.map((r) => r.title).join(', ')}`,
          });
        } else {
          const title = payload || target || 'Reminder';
          store.addReminder(title, value);
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Created reminder: "${title}"${value ? ` (${value})` : ''}`,
          });
          showToast(`Reminder saved: ${title}`);
        }
        return;
      }

      if (normalizedAction === 'save_memory' || normalizedAction === 'savememory') {
        if (store.settings.incognitoMode) {
          showToast('Incognito Mode is active — memory not saved');
          return;
        }
        const fact = payload || target || '';
        if (fact.trim()) {
          store.addMemory(fact.trim(), 'Custom Notes', 'voice', true, true);
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Saved permanently to Memory Core: "${fact.trim()}"`,
          });
          showToast('Saved permanently to Memory Core');
        }
        return;
      }

      if (normalizedAction === 'forget_memory' || normalizedAction === 'forgetmemory') {
        const query = payload || target || '';
        const count = store.forgetMemoryByQuery(query);
        store.appendMessage({
          role: 'action',
          mode: 'command',
          text:
            count > 0
              ? `Removed ${count} memory matching "${query}"`
              : `No saved memory matched "${query}"`,
        });
        showToast(count > 0 ? `Forgot ${count} memory` : 'No matching memory found');
        return;
      }

      if (normalizedAction === 'switch_persona' || normalizedAction === 'switchpersona') {
        const query = (target || payload || '').toLowerCase();
        const match = store.personas.find(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            query.includes(p.name.toLowerCase()) ||
            p.id.toLowerCase().includes(query) ||
            p.tagline.toLowerCase().includes(query) ||
            (query.includes('gf') && p.id === 'girlfriend-gf') ||
            (query.includes('bf') && p.id === 'boyfriend-bf') ||
            (query.includes('funny') && p.id === 'funny-witty') ||
            (query.includes('best') && p.id === 'best-friend')
        );
        if (match) {
          applyPersonaSwitch(match.id);
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Switched persona to ${match.name}`,
          });
        }
        return;
      }

      if (normalizedAction === 'toggle_camera') {
        const t = (target || '').toLowerCase();
        if (t === 'flip') {
          const nextFacing = store.settings.cameraFacingMode === 'user' ? 'environment' : 'user';
          store.updateSettings({ cameraFacingMode: nextFacing });
          if (liveControlRef.current.isCameraActive) {
            await liveControlRef.current.startCamera(nextFacing);
          }
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: `Switched camera to ${nextFacing === 'user' ? 'Front' : 'Rear'} lens`,
          });
          showToast(`Camera lens: ${nextFacing === 'user' ? 'Front' : 'Rear'}`);
          return;
        }
        const wantOff = t === 'off' || (t !== 'on' && liveControlRef.current.isCameraActive);
        if (wantOff) {
          liveControlRef.current.stopCamera();
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: 'Turned off Live Camera Vision',
          });
          showToast('Live Camera Vision turned off');
        } else {
          const ok = await liveControlRef.current.startCamera(store.settings.cameraFacingMode);
          if (ok) {
            store.appendMessage({
              role: 'action',
              mode: 'command',
              text: 'Live Camera Vision active — Gwen can see your surroundings',
            });
            showToast('Live Camera Vision active');
          }
        }
        return;
      }

      if (normalizedAction === 'toggle_screen_share') {
        const wantOff = target === 'off' || (target !== 'on' && liveControlRef.current.isSharing);
        if (wantOff) {
          liveControlRef.current.stopScreen();
          store.appendMessage({
            role: 'action',
            mode: 'command',
            text: 'Stopped live screen sharing',
          });
          showToast('Screen sharing stopped');
        } else {
          const started = await liveControlRef.current.startScreen();
          if (started) {
            store.appendMessage({
              role: 'action',
              mode: 'command',
              text: 'Started live screen sharing',
            });
            showToast('Live screen sharing active');
          }
        }
        return;
      }

      if (normalizedAction === 'toggle_overlay') {
        const nextVal =
          target === 'on' ? true : target === 'off' ? false : !store.settings.overlayEnabled;
        store.updateSettings({ overlayEnabled: nextVal });
        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: nextVal ? 'Enabled Floating Overlay Avatar' : 'Hidden Floating Overlay Avatar',
        });
        showToast(nextVal ? 'Floating Gwen avatar enabled' : 'Floating avatar hidden');
        return;
      }

      if (normalizedAction === 'navigate_tab') {
        const t = (target || '').toLowerCase();
        if (t.includes('mem')) setActiveTab('memory');
        else if (t.includes('com')) setActiveTab('commands');
        else if (t.includes('set')) setActiveTab('settings');
        else setActiveTab('companion');
        showToast(`Opened ${t || 'companion'}`);
        return;
      }

      if (normalizedAction === 'scroll_page' || normalizedAction === 'scroll_down' || normalizedAction === 'scroll_up') {
        const dir = normalizedAction === 'scroll_up' || target === 'up' ? -360 : 360;
        const container = mainScrollRef.current;
        if (container) {
          container.scrollBy({ top: dir, behavior: 'smooth' });
        } else {
          window.scrollBy({ top: dir, behavior: 'smooth' });
        }
        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: dir > 0 ? 'Scrolled down' : 'Scrolled up',
        });
        return;
      }

      if (normalizedAction === 'go_back' || normalizedAction === 'go_home') {
        setActiveTab('companion');
        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: 'Navigated back to Gwen Companion HUD',
        });
        return;
      }

      if (normalizedAction === 'open_app') {
        const appName = target || payload || 'requested app';
        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: `Hands-free launch command dispatched for ${appName}`,
        });
        showToast(`Hands-free command: Open ${appName}`);
      }
    },
    [
      applyPersonaSwitch,
      applySystemSetting,
      handleBuildWebsite,
      handleGenerateImage,
      handleGenerateVideo,
      handleSleepGwen,
      showToast,
      store,
    ]
  );

  // Proactive Multimodal Empathy Signal handler (Acoustic cough or Camera mood cue)
  const handleEmpathySignal = useCallback(
    (signal: EmpathySignal) => {
      if (!store.settings.proactiveEmpathyEnabled) return;
      const userLabel =
        store.settings.deviceUserName || store.identityCore.nickname || 'friend';
      const checkIn =
        signal.suggestedResponse ||
        (signal.condition === 'cough'
          ? `Hey ${userLabel}, I heard you cough — are you okay? Please grab some warm water and take a quick breather.`
          : `Hey ${userLabel}, you seem a bit ${signal.condition} right now. Everything alright? I'm here if you want to talk or take a short break.`);

      if (liveControlRef.current.isConnected) {
        liveControlRef.current.sendLiveText(
          `[Proactive Empathy Alert from ${signal.source} sensor: ${signal.summary}] Gently check in on ${userLabel} right now in 1-2 warm, caring sentences.`
        );
      } else {
        store.appendMessage({
          role: 'gwen',
          mode: 'command',
          text: checkIn,
        });
        if (store.settings.autoSpeakTextReplies) {
          void speakReplyRef.current(checkIn);
        }
      }
      showToast(`Empathy check-in: ${signal.summary}`);
    },
    [
      showToast,
      store,
    ]
  );

  // Handle all 17 real Gemini Live API function calls
  const handleLiveToolCall = useCallback(
    (call: LiveToolCall) => {
      const a = call.args || {};
      if (call.name === 'saveMemory') {
        const content = String(a.content || '');
        const category = normalizeCategory(a.category);
        const pinned = Boolean(a.pinned);
        const isPermanent = a.isPermanent !== false;
        if (!store.settings.incognitoMode && content.trim()) {
          store.addMemory(content.trim(), category, 'voice', pinned, isPermanent);
          store.appendMessage({
            role: 'action',
            mode: 'live',
            text: `Saved to Memory Core (${category}): "${content.trim()}"`,
          });
          showToast('Gwen saved a permanent memory');
        }
      } else if (call.name === 'forgetMemory') {
        void executeDeviceAction('forget_memory', String(a.query || ''));
      } else if (call.name === 'switchPersona') {
        void executeDeviceAction('switch_persona', String(a.personaName || ''));
      } else if (call.name === 'controlSystemSetting') {
        applySystemSetting(String(a.setting || 'brightness'), String(a.value || 'toggle'));
      } else if (call.name === 'manageCalendar') {
        void executeDeviceAction(
          'manage_calendar',
          String(a.operation || 'create'),
          a.title ? String(a.title) : undefined,
          a.dateTime ? String(a.dateTime) : undefined
        );
      } else if (call.name === 'navigateMaps') {
        void executeDeviceAction('navigate_maps', String(a.destination || ''));
      } else if (call.name === 'composeMessage') {
        void executeDeviceAction(
          'compose_message',
          String(a.recipient || 'Contact'),
          String(a.message || ''),
          undefined,
          String(a.platform || 'WhatsApp')
        );
      } else if (call.name === 'generateImage') {
        void executeDeviceAction(
          'generate_image',
          undefined,
          String(a.prompt || ''),
          undefined,
          undefined,
          normalizeAspectRatio(a.aspectRatio, '1:1'),
          a.style ? String(a.style) : undefined
        );
      } else if (call.name === 'generateVideo') {
        void executeDeviceAction(
          'generate_video',
          undefined,
          String(a.prompt || ''),
          a.duration !== undefined ? String(a.duration) : '6',
          undefined,
          normalizeAspectRatio(a.aspectRatio, '16:9')
        );
      } else if (call.name === 'buildWebsite') {
        void executeDeviceAction(
          'build_website',
          a.title ? String(a.title) : undefined,
          String(a.description || '')
        );
      } else if (call.name === 'getWeather') {
        void executeDeviceAction(
          'get_weather',
          a.city ? String(a.city) : undefined
        );
      } else if (call.name === 'manageCompanionCare') {
        void executeDeviceAction(
          'manage_companion_care',
          String(a.action || 'log_water'),
          undefined,
          a.value ? String(a.value) : undefined
        );
      } else if (call.name === 'changeTimezone') {
        void executeDeviceAction(
          'change_timezone',
          String(a.timezone || 'Asia/Kolkata')
        );
      } else if (call.name === 'manageAlarmTimer') {
        void executeDeviceAction(
          'manage_alarm_timer',
          String(a.kind || 'timer'),
          a.label ? String(a.label) : undefined,
          String(a.timeOrDuration || '5 minutes')
        );
      } else if (call.name === 'manageReminderTask') {
        void executeDeviceAction(
          'manage_reminder_task',
          String(a.operation || 'create'),
          a.title ? String(a.title) : undefined,
          a.dueText ? String(a.dueText) : undefined
        );
      } else if (call.name === 'runDeviceAction') {
        void executeDeviceAction(
          String(a.action || ''),
          a.target ? String(a.target) : undefined
        );
      } else if (call.name === 'sleepGwen') {
        const farewell = a.farewell ? String(a.farewell) : undefined;
        // Let Gwen finish voicing her warm goodbye before shutting down audio/camera/WS
        handleSleepGwen(farewell, 2400);
      } else if (call.name === 'manageGmail') {
        void executeDeviceAction(
          'manage_gmail',
          String(a.action || 'list_unread'),
          a.to ? String(a.to) : a.query ? String(a.query) : undefined,
          a.subject || a.body ? `${String(a.subject || '')}||${String(a.body || '')}` : undefined
        );
      } else if (call.name === 'manageGoogleCalendar') {
        void executeDeviceAction(
          'manage_google_calendar',
          String(a.action || 'list'),
          a.summary ? String(a.summary) : undefined,
          a.startTime ? String(a.startTime) : undefined
        );
      } else if (call.name === 'manageKeepAndTasks') {
        void executeDeviceAction(
          'manage_keep_tasks',
          String(a.action || 'list'),
          a.title ? String(a.title) : undefined,
          a.notes ? String(a.notes) : undefined
        );
      } else if (call.name === 'searchDriveAndContacts') {
        void executeDeviceAction(
          'search_drive_contacts',
          String(a.action || 'search_drive'),
          a.query ? String(a.query) : undefined,
          a.content ? String(a.content) : undefined
        );
      } else if (call.name === 'liveGoogleSearch') {
        void executeDeviceAction('live_google_search', undefined, String(a.query || ''));
      } else if (call.name === 'downloadPlayStoreApp') {
        void executeDeviceAction('download_playstore_app', undefined, String(a.appName || ''));
      } else if (call.name === 'searchAndDownloadMedia') {
        void executeDeviceAction(
          'search_download_media',
          undefined,
          String(a.query || ''),
          a.kind ? String(a.kind) : 'image'
        );
      } else if (call.name === 'manageKidsStudy') {
        const scoreStr =
          a.score !== undefined
            ? `${Number(a.score)}/${Number(a.total || 5)}`
            : a.topic
              ? String(a.topic)
              : a.notes
                ? String(a.notes)
                : undefined;
        void executeDeviceAction(
          'manage_kids_study',
          String(a.action || 'switch_child'),
          a.kidName ? String(a.kidName) : undefined,
          scoreStr,
          a.subject ? String(a.subject) : undefined
        );
      }
    },
    [applySystemSetting, executeDeviceAction, handleSleepGwen, showToast, store]
  );

  const lastUserLiveTextRef = useRef('');

  const live = useGwenLive({
    settings: store.settings,
    deviceState: store.deviceState,
    activePersona: store.activePersona,
    memories: store.memories,
    identityCore: store.identityCore,
    weather: store.weather,
    careState: store.careState,
    sessionState: store.sessionState,
    googleAccountEmail: store.googleAccount?.email || null,
    activeKidStudy: store.activeKidBundle,
    allKidNames: store.kidBundles.map((b) => b.profile.name),
    recentTurns: store.transcript.slice(-12),
    onInputTranscript: (text) => {
      lastUserLiveTextRef.current = text;
      store.appendMessage({
        role: 'user',
        mode: 'live',
        text,
        hasScreenContext: liveControlRef.current.isSharing,
        hasCameraContext: liveControlRef.current.isCameraActive,
      });
    },
    onOutputTranscript: (text) => {
      store.appendMessage({
        role: 'gwen',
        mode: 'live',
        text,
      });
      if (lastUserLiveTextRef.current) {
        void runAutoMemoryExtraction(lastUserLiveTextRef.current, text);
        lastUserLiveTextRef.current = '';
      }
    },
    onToolCall: handleLiveToolCall,
    onEmpathySignal: handleEmpathySignal,
    onApiKeyError: (errorCode, message) => {
      handleGeminiApiError(errorCode === 'QUOTA_EXCEEDED' ? 429 : 403, errorCode, message);
    },
    onFallbackSpeechTurn: (spokenText) => fallbackSpeechTurnRef.current(spokenText),
    onVoiceNotice: (message) => showToast(message),
  });

  const handleStartVoiceGuarded = useCallback(() => {
    if (!getStoredApiKeyState().hasKey) {
      setApiKeyModal({ visible: true, reason: 'mic' });
      return;
    }
    if (live.gwenState === 'dormant') {
      live.wakeFromSleep();
    }
    void live.startSession();
  }, [live]);

  liveControlRef.current = {
    startScreen: live.startScreenShare,
    stopScreen: live.stopScreenShare,
    isSharing: live.isScreenSharing,
    startCamera: live.startCameraVision,
    stopCamera: live.stopCameraVision,
    isCameraActive: live.isCameraActive,
    isConnected: live.isConnected,
    sendLiveText: live.sendLiveText,
    enterSleepMode: live.enterSleepMode,
  };

  // Speak any text reply via Gemini TTS (gemini-3.8-flash-lite-tts) with live media volume
  const speakTextReply = useCallback(
    async (text: string) => {
      try {
        if (ttsAudioRef.current) {
          ttsAudioRef.current.pause();
          ttsAudioRef.current = null;
        }
        const res = await fetch('/api/gwen/tts', {
          method: 'POST',
          headers: getGeminiRequestHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            text,
            voiceName: store.settings.voiceName,
            style: `${store.activePersona.tone}, natural AI voice companion`,
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
            errorCode?: string;
          };
          handleGeminiApiError(res.status, err.errorCode, err.error);
          showToast(err.error || 'Could not generate speech right now.');
          return;
        }
        const data = (await res.json()) as { audioBase64?: string };
        if (!data.audioBase64) return;

        const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
        audio.playbackRate = store.settings.speakingRate || 1.0;
        audio.volume = Math.max(0, Math.min(1, store.deviceState.mediaVolume / 100));
        ttsAudioRef.current = audio;
        live.setGwenState('speaking');
        audio.onended = () => {
          live.setGwenState(live.isConnected ? 'listening' : 'idle');
        };
        await audio.play();
      } catch {
        live.setGwenState(live.isConnected ? 'listening' : 'idle');
      }
    },
    [
      live,
      showToast,
      store.activePersona.tone,
      store.deviceState.mediaVolume,
      store.settings.speakingRate,
      store.settings.voiceName,
    ]
  );

  speakReplyRef.current = speakTextReply;

  // Send text message or execute voice command/shortcut
  const handleSendTextOrCommand = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;

      if (live.gwenState === 'dormant') {
        live.wakeFromSleep();
      }

      // 1. Check Custom Voice Shortcuts first
      const matchedShortcut = store.shortcuts.find(
        (s) => s.triggerPhrase.trim().toLowerCase() === text.toLowerCase()
      );
      if (matchedShortcut) {
        if (matchedShortcut.switchPersonaId) {
          applyPersonaSwitch(matchedShortcut.switchPersonaId);
        }
        if (matchedShortcut.enableScreenShare && !live.isScreenSharing) {
          await live.startScreenShare();
        }
        if (matchedShortcut.enableCameraVision && !live.isCameraActive) {
          await live.startCameraVision(store.settings.cameraFacingMode);
        }
        store.appendMessage({
          role: 'action',
          mode: 'command',
          text: `Triggered shortcut "${matchedShortcut.label}"`,
        });
        await handleSendTextOrCommand(matchedShortcut.promptToSend);
        return;
      }

      // If Live Voice WebSocket session is connected and user sends text, route directly into Live session!
      if (live.isConnected && live.voiceTransportMode === 'live') {
        store.appendMessage({
          role: 'user',
          mode: 'live',
          text,
          hasScreenContext: live.isScreenSharing || Boolean(live.uploadedScreenImage),
          hasCameraContext: live.isCameraActive,
        });
        live.sendLiveText(text);
        return;
      }

      setIsTextSending(true);
      live.setError(null);
      live.setGwenState('thinking');

      const screenFrame = live.getLatestScreenFrame();
      const cameraFrame = live.getLatestCameraFrame();

      // Auto-detect child introducing themselves ("Hi Gwen, I'm Aarav" / "I am Zara") to isolate study profile
      const introMatch = text.match(/\b(?:i'?m|i am|this is)\s+([a-zA-Z]{2,20})\b/i);
      if (introMatch && store.kidBundles.length > 0) {
        const candidateName = introMatch[1];
        const matchedKid = store.switchKidByName(candidateName);
        if (matchedKid) {
          if (store.settings.activePersonaId !== 'home-teacher') {
            applyPersonaSwitch('home-teacher');
          }
          showToast(`Switched study profile to ${matchedKid.profile.name}`);
        }
      }

      store.appendMessage({
        role: 'user',
        mode: 'text',
        text,
        hasScreenContext: Boolean(screenFrame),
        hasCameraContext: Boolean(cameraFrame),
      });

      try {
        // 2. Check Hands-Free Command Intent Parser if enabled
        if (store.settings.handsFreeControlEnabled) {
          const parseRes = await fetch('/api/gwen/parse-command', {
            method: 'POST',
            headers: getGeminiRequestHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              utterance: text,
              personaNames: store.personas.map((p) => p.name),
            }),
          });
          if (parseRes.ok) {
            const parsed = (await parseRes.json()) as ParsedCommandResult;
            if (
              parsed.isCommand &&
              parsed.action !== 'none' &&
              parsed.action !== 'summarize_screen' &&
              parsed.action !== 'translate_screen'
            ) {
              if (parsed.action === 'sleep_gwen') {
                const bye =
                  parsed.confirmationText ||
                  'Going to sleep now. Tap Wake Gwen whenever you want to talk again.';
                if (store.settings.autoSpeakTextReplies) {
                  void speakTextReply(bye);
                  handleSleepGwen(bye, 2600);
                } else {
                  handleSleepGwen(bye, 0);
                }
                setIsTextSending(false);
                return;
              }

              await executeDeviceAction(
                parsed.action,
                parsed.target,
                parsed.payload,
                parsed.value,
                parsed.platform,
                parsed.aspectRatio,
                parsed.style
              );
              if (parsed.confirmationText) {
                store.appendMessage({
                  role: 'gwen',
                  mode: 'command',
                  text: parsed.confirmationText,
                });
                if (store.settings.autoSpeakTextReplies) {
                  void speakTextReply(parsed.confirmationText);
                }
              }
              live.setGwenState('idle');
              setIsTextSending(false);
              return;
            }
          }
        }

        // 3. Call Gemini Multimodal Chat endpoint (with Screen + Camera + Identity Core + IST + Weather + Care + Zero-Forgetfulness Continuity)
        const historyPayload = store.transcript
          .filter((m) => m.role === 'user' || m.role === 'gwen')
          .slice(-14)
          .map((m) => ({
            role: m.role as 'user' | 'gwen',
            text: m.text,
          }));

        const res = await fetch('/api/gwen/chat', {
          method: 'POST',
          headers: getGeminiRequestHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            message: text,
            history: historyPayload,
            persona: store.activePersona,
            languageMode: store.settings.languageMode,
            memories: store.settings.incognitoMode ? [] : store.memories,
            identityCore: store.settings.incognitoMode ? undefined : store.identityCore,
            deviceUserName: store.settings.deviceUserName,
            timezone: store.settings.timezone,
            weather: store.weather,
            careState: store.careState,
            sessionState: store.settings.incognitoMode ? undefined : store.sessionState,
            googleAccountEmail: store.googleAccount?.email || null,
            activeKidStudy: store.activeKidBundle,
            allKidNames: store.kidBundles.map((b) => b.profile.name),
            proactiveEmpathyEnabled: store.settings.proactiveEmpathyEnabled,
            incognitoMode: store.settings.incognitoMode,
            model: store.settings.textModel,
            screenFrameBase64: screenFrame || undefined,
            cameraFrameBase64: cameraFrame || undefined,
            faceRecognized: live.faceRecognized,
            voiceRecognized: live.voiceRecognized,
          }),
        });

        const data = (await res.json()) as { text?: string; error?: string; errorCode?: string };
        if (!res.ok) {
          handleGeminiApiError(res.status, data.errorCode, data.error);
          throw new Error(data.error || 'Gwen could not complete this request.');
        }

        const replyText =
          data.text?.trim() || 'I heard you — could you try asking that once more?';
        store.appendMessage({
          role: 'gwen',
          mode: 'text',
          text: replyText,
        });

        void runAutoMemoryExtraction(text, replyText);

        if (store.settings.autoSpeakTextReplies) {
          void speakTextReply(replyText);
        } else {
          live.setGwenState('idle');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to reach Gemini right now.';
        live.setError(msg);
        live.setGwenState('error');
      } finally {
        setIsTextSending(false);
      }
    },
    [
      applyPersonaSwitch,
      executeDeviceAction,
      handleSleepGwen,
      live,
      runAutoMemoryExtraction,
      speakTextReply,
      store,
    ]
  );

  // Automatic Standard Voice Fallback turn: SpeechRecognition/MediaRecorder -> generateContent -> speechSynthesis + 3D lip-sync
  fallbackSpeechTurnRef.current = async (spokenText: string): Promise<string | null> => {
    const text = spokenText.trim();
    if (!text) return null;

    const screenFrame = live.getLatestScreenFrame();
    const cameraFrame = live.getLatestCameraFrame();

    store.appendMessage({
      role: 'user',
      mode: 'live',
      text,
      hasScreenContext: Boolean(screenFrame),
      hasCameraContext: Boolean(cameraFrame),
    });

    // Check Hands-Free commands in Standard Voice Mode too
    if (store.settings.handsFreeControlEnabled) {
      try {
        const parseRes = await fetch('/api/gwen/parse-command', {
          method: 'POST',
          headers: getGeminiRequestHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            utterance: text,
            personaNames: store.personas.map((p) => p.name),
          }),
        });
        if (parseRes.ok) {
          const parsed = (await parseRes.json()) as ParsedCommandResult;
          if (
            parsed.isCommand &&
            parsed.action !== 'none' &&
            parsed.action !== 'summarize_screen' &&
            parsed.action !== 'translate_screen'
          ) {
            if (parsed.action === 'sleep_gwen') {
              const bye =
                parsed.confirmationText ||
                'Going to sleep now. Tap Wake Gwen whenever you want to talk again.';
              handleSleepGwen(bye, 1800);
              return bye;
            }
            await executeDeviceAction(
              parsed.action,
              parsed.target,
              parsed.payload,
              parsed.value,
              parsed.platform,
              parsed.aspectRatio,
              parsed.style
            );
            const confirmMsg = parsed.confirmationText || 'Done!';
            store.appendMessage({ role: 'gwen', mode: 'command', text: confirmMsg });
            return confirmMsg;
          }
        }
      } catch {
        // Fall through to normal Gemini chat
      }
    }

    const historyPayload = store.transcript
      .filter((m) => m.role === 'user' || m.role === 'gwen')
      .slice(-14)
      .map((m) => ({
        role: m.role as 'user' | 'gwen',
        text: m.text,
      }));

    const res = await fetch('/api/gwen/chat', {
      method: 'POST',
      headers: getGeminiRequestHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        message: text,
        history: historyPayload,
        persona: store.activePersona,
        languageMode: store.settings.languageMode,
        memories: store.settings.incognitoMode ? [] : store.memories,
        identityCore: store.settings.incognitoMode ? undefined : store.identityCore,
        deviceUserName: store.settings.deviceUserName,
        timezone: store.settings.timezone,
        weather: store.weather,
        careState: store.careState,
        sessionState: store.settings.incognitoMode ? undefined : store.sessionState,
        googleAccountEmail: store.googleAccount?.email || null,
        activeKidStudy: store.activeKidBundle,
        allKidNames: store.kidBundles.map((b) => b.profile.name),
        proactiveEmpathyEnabled: store.settings.proactiveEmpathyEnabled,
        incognitoMode: store.settings.incognitoMode,
        model: store.settings.textModel,
        screenFrameBase64: screenFrame || undefined,
        cameraFrameBase64: cameraFrame || undefined,
        faceRecognized: live.faceRecognized,
        voiceRecognized: live.voiceRecognized,
      }),
    });

    const data = (await res.json()) as { text?: string; error?: string; errorCode?: string };
    if (!res.ok) {
      handleGeminiApiError(res.status, data.errorCode, data.error);
      throw new Error(data.error || `Gemini chat returned HTTP ${res.status}`);
    }

    const replyText =
      data.text?.trim() || 'I heard you — could you try asking that once more?';
    store.appendMessage({
      role: 'gwen',
      mode: 'live',
      text: replyText,
    });
    void runAutoMemoryExtraction(text, replyText);
    return replyText;
  };

  const handleRunShortcut = useCallback(
    async (shortcut: CustomShortcut) => {
      setActiveTab('companion');
      if (shortcut.switchPersonaId) {
        applyPersonaSwitch(shortcut.switchPersonaId);
      }
      if (shortcut.enableScreenShare && !live.isScreenSharing) {
        await live.startScreenShare();
      }
      if (shortcut.enableCameraVision && !live.isCameraActive) {
        await live.startCameraVision(store.settings.cameraFacingMode);
      }
      store.appendMessage({
        role: 'action',
        mode: 'command',
        text: `Running shortcut "${shortcut.label}"`,
      });
      await handleSendTextOrCommand(shortcut.promptToSend);
    },
    [applyPersonaSwitch, handleSendTextOrCommand, live, store]
  );

  const handleRunCatalogCommand = useCallback(
    (phrase: string) => {
      setActiveTab('companion');
      void handleSendTextOrCommand(phrase);
    },
    [handleSendTextOrCommand]
  );

  const handleToggleScreenShare = useCallback(() => {
    if (live.isScreenSharing) {
      live.stopScreenShare();
      showToast('Screen sharing stopped');
    } else {
      void live.startScreenShare().then((ok) => {
        if (ok) showToast('Screen sharing active — Gwen can see your screen');
      });
    }
  }, [live, showToast]);

  const handleToggleCameraVision = useCallback(() => {
    if (live.isCameraActive) {
      live.stopCameraVision();
      showToast('Live Camera Vision turned off');
    } else {
      void live.startCameraVision(store.settings.cameraFacingMode).then((ok) => {
        if (ok) showToast('Live Camera Vision active — Gwen can see through your camera');
      });
    }
  }, [live, showToast, store.settings.cameraFacingMode]);

  const handleFlipCamera = useCallback(() => {
    const nextFacing = store.settings.cameraFacingMode === 'user' ? 'environment' : 'user';
    store.updateSettings({ cameraFacingMode: nextFacing });
    if (live.isCameraActive) {
      void live.startCameraVision(nextFacing);
    }
    showToast(`Camera lens switched to ${nextFacing === 'user' ? 'Front' : 'Rear'}`);
  }, [live, showToast, store]);

  const handleConfirmDraft = useCallback(
    (draft: PendingMessageDraft) => {
      store.removeMessageDraft(draft.id);
      store.appendMessage({
        role: 'action',
        mode: 'command',
        text: `Confirmed & dispatched ${draft.platform} message to ${draft.recipient}: "${draft.message}"`,
      });
      showToast(`Sent ${draft.platform} message to ${draft.recipient}`);
    },
    [showToast, store]
  );

  const handleCancelDraft = useCallback(
    (id: string) => {
      store.removeMessageDraft(id);
      store.appendMessage({
        role: 'action',
        mode: 'command',
        text: 'Cancelled pending message draft.',
      });
      showToast('Message draft cancelled');
    },
    [showToast, store]
  );

  const navItems: Array<{ id: AppTab; label: string; icon: React.ReactNode }> = [
    { id: 'companion', label: 'HUD', icon: <Radio className="h-5 w-5" /> },
    { id: 'memory', label: 'Memory', icon: <Brain className="h-5 w-5" /> },
    { id: 'commands', label: 'Commands', icon: <Command className="h-5 w-5" /> },
    { id: 'settings', label: 'Settings', icon: <SlidersHorizontal className="h-5 w-5" /> },
  ];

  // Dynamic top offset for active persistent privacy indicators (Screen Share + Camera Vision)
  const activePrivacyBarCount = (live.isScreenSharing ? 1 : 0) + (live.isCameraActive ? 1 : 0);
  const topOffsetClass =
    activePrivacyBarCount === 2 ? 'pt-22' : activePrivacyBarCount === 1 ? 'pt-11' : '';
  const mobileHeaderTopClass =
    activePrivacyBarCount === 2 ? 'top-22' : activePrivacyBarCount === 1 ? 'top-11' : 'top-0';

  // Subtle software brightness dimmer driven by System Settings Brightness slider
  const brightnessDimOpacity = Math.max(0, Math.min(0.62, (100 - store.deviceState.brightness) / 145));

  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row relative"
      style={{
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Live Brightness Dimmer Overlay (controlled via Voice or Device Hub) */}
      {brightnessDimOpacity > 0.01 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[45] bg-black transition-opacity duration-300"
          style={{ opacity: brightnessDimOpacity }}
        />
      )}

      {/* Subtle Ambient Torch Glow when Flashlight is ON */}
      {store.deviceState.flashlight && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed top-0 left-0 right-0 h-2 z-[46]"
          style={{
            background: 'linear-gradient(90deg, transparent, #fef08a, #ffffff, #fef08a, transparent)',
            boxShadow: '0 0 28px 6px rgba(254, 240, 138, 0.55)',
          }}
        />
      )}

      {/* Persistent Privacy Indicators Stack (Screen Share + Live Camera Vision) */}
      {activePrivacyBarCount > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 flex flex-col shadow-md">
          {live.isScreenSharing && (
            <div
              role="status"
              className="h-11 px-4 flex items-center justify-between gap-3 text-xs font-semibold"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-contrast)',
              }}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="h-2 w-2 rounded-full bg-current shrink-0" aria-hidden="true" />
                <span className="truncate">Screen Active — Gwen is viewing your shared screen</span>
              </div>
              <button
                type="button"
                onClick={live.stopScreenShare}
                className="h-8 px-3 rounded-lg bg-black/20 hover:bg-black/30 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <MonitorOff className="h-3.5 w-3.5" />
                <span>Stop Sharing</span>
              </button>
            </div>
          )}

          {live.isCameraActive && (
            <div
              role="status"
              className="h-11 px-4 flex items-center justify-between gap-3 text-xs font-semibold border-t border-black/15"
              style={{
                backgroundColor: '#059669',
                color: '#ffffff',
              }}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="h-2 w-2 rounded-full bg-white shrink-0" aria-hidden="true" />
                <span className="truncate">
                  Camera Active ({store.settings.cameraFacingMode === 'user' ? 'Front' : 'Rear'}) — Live Vision Streaming
                  {live.faceRecognized && store.identityCore.displayName
                    ? ` · Recognized ${store.identityCore.nickname || store.identityCore.displayName}`
                    : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={live.stopCameraVision}
                className="h-8 px-3 rounded-lg bg-black/25 hover:bg-black/40 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <VideoOff className="h-3.5 w-3.5" />
                <span>Turn Off Camera</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Desktop Left Navigation Rail */}
      <aside
        className={`hidden lg:flex lg:flex-col lg:w-64 shrink-0 border-r justify-between px-4 py-6 ${
          activePrivacyBarCount === 2 ? 'pt-28' : activePrivacyBarCount === 1 ? 'pt-16' : ''
        }`}
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        <div className="space-y-8">
          <div className="px-3">
            <span className="font-display text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              Gwen
            </span>
          </div>

          <nav aria-label="Primary navigation" className="space-y-1.5">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className="w-full min-h-[46px] px-3.5 rounded-2xl flex items-center gap-3 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
                  style={{
                    backgroundColor: active ? 'var(--accent-soft)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.id === 'memory' && store.memories.length > 0 && (
                    <span className="ml-auto font-mono-tabular text-xs text-[var(--text-muted)]">
                      {store.memories.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="px-3 pt-4 border-t border-[var(--border-hairline)] space-y-2.5">
          {!installPrompt.isInstalled && (
            <InstallAppButton
              compact
              className="w-full"
              isInstallable={installPrompt.isInstallable}
              isInstalled={installPrompt.isInstalled}
              isIOS={installPrompt.isIOS}
              isAndroid={installPrompt.isAndroid}
              onPromptInstall={installPrompt.promptInstall}
              onNotify={showToast}
            />
          )}
          <div className="space-y-1">
            <p className="text-xs font-medium text-[var(--text-secondary)] truncate">
              {store.settings.deviceUserName
                ? `User: ${store.settings.deviceUserName}`
                : store.activePersona.name}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Created by {IMMUTABLE_DEVELOPER_NAME}
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Compact Top App Bar (56px) */}
      <header
        className={`lg:hidden sticky z-30 h-14 px-4 flex items-center justify-between gap-2 border-b ${mobileHeaderTopClass}`}
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        <span className="font-display text-xl font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap shrink-0">
          Gwen
        </span>

        <div className="flex items-center gap-2 shrink-0">
          <InstallAppButton
            compact
            isInstallable={installPrompt.isInstallable}
            isInstalled={installPrompt.isInstalled}
            isIOS={installPrompt.isIOS}
            isAndroid={installPrompt.isAndroid}
            onPromptInstall={installPrompt.promptInstall}
            onNotify={showToast}
          />
          <button
            type="button"
            onClick={() => {
              if (live.isConnected) {
                live.stopSession();
              } else {
                handleStartVoiceGuarded();
              }
            }}
            className="min-h-[38px] px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            style={{
              backgroundColor: live.isConnected ? 'var(--danger)' : 'var(--accent)',
              color: live.isConnected ? '#ffffff' : 'var(--accent-contrast)',
            }}
          >
            {live.isConnected ? <PhoneOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            <span>
              {live.gwenState === 'dormant'
                ? 'Wake'
                : live.isConnected
                  ? 'End Call'
                  : 'Talk Live'}
            </span>
          </button>
        </div>
      </header>

      {/* Main Scrollable Content Canvas */}
      <main
        ref={mainScrollRef}
        className={`flex-1 overflow-y-auto pb-24 lg:pb-8 ${topOffsetClass}`}
      >
        <InstallAppBanner
          isInstallable={installPrompt.isInstallable}
          isInstalled={installPrompt.isInstalled}
          isIOS={installPrompt.isIOS}
          isAndroid={installPrompt.isAndroid}
          bannerDismissed={installPrompt.bannerDismissed}
          onDismissBanner={installPrompt.dismissBanner}
          onPromptInstall={installPrompt.promptInstall}
          onNotify={showToast}
        />
        {activeTab === 'companion' && (
          <CompanionView
            settings={store.settings}
            deviceState={store.deviceState}
            careState={store.careState}
            weather={store.weather}
            weatherLoading={store.weatherLoading}
            activeCareNudge={store.activeCareNudge}
            activeWakeUpAlarm={store.activeWakeUpAlarm}
            latestEmpathySignal={live.latestEmpathySignal}
            mediaCreations={store.mediaCreations}
            websiteCreations={store.websiteCreations}
            isGeneratingMedia={isGeneratingMedia}
            generationLabel={generationLabel}
            generationProgress={generationProgress}
            activePersona={store.activePersona}
            personas={store.personas}
            gwenState={live.gwenState}
            isConnected={live.isConnected}
            voiceTransportMode={live.voiceTransportMode}
            activeLiveModel={live.activeLiveModel}
            isMicMuted={live.isMicMuted}
            isPttPressed={live.isPttPressed}
            isScreenSharing={live.isScreenSharing}
            screenPreviewUrl={live.screenPreviewUrl}
            uploadedScreenImage={live.uploadedScreenImage}
            isCameraActive={live.isCameraActive}
            cameraPreviewUrl={live.cameraPreviewUrl}
            faceRecognized={live.faceRecognized}
            voiceRecognized={live.voiceRecognized}
            wakeLockActive={live.wakeLockActive}
            audioLevel={live.audioLevel}
            liveDraftInput={live.liveDraftInput}
            liveDraftOutput={live.liveDraftOutput}
            transcript={store.transcript}
            calendarEvents={store.calendarEvents}
            alarms={store.alarms}
            timers={store.timers}
            reminders={store.reminders}
            pendingDrafts={store.pendingDrafts}
            isTextSending={isTextSending}
            error={live.error}
            onDismissError={() => live.setError(null)}
            onOpenApiKeySettings={handleOpenApiKeySettings}
            onRetryLiveVoice={() => void live.retryLiveSession()}
            onStartVoice={handleStartVoiceGuarded}
            onStopVoice={live.stopSession}
            onSleepGwen={() =>
              handleSleepGwen(
                'Goodnight! Going into dormant sleep mode now. Tap Wake Gwen whenever you need me.'
              )
            }
            onWakeGwen={() => {
              live.wakeFromSleep();
              showToast('Gwen is awake and ready');
            }}
            onInterruptGwen={live.stopPlaybackQueue}
            onToggleMute={() => live.setIsMicMuted((m) => !m)}
            onPttStart={() => live.setIsPttPressed(true)}
            onPttEnd={() => live.setIsPttPressed(false)}
            onToggleScreenShare={handleToggleScreenShare}
            onToggleCameraVision={handleToggleCameraVision}
            onFlipCamera={handleFlipCamera}
            onAttachScreenshot={(dataUrl) => {
              live.attachScreenshotFallback(dataUrl);
              showToast('Screenshot attached to Gwen’s visual context');
            }}
            onClearScreenshot={live.clearAttachedScreenshot}
            onToggleOverlay={() =>
              store.updateSettings({ overlayEnabled: !store.settings.overlayEnabled })
            }
            onToggleAvatarMode={() =>
              store.updateSettings({
                avatarMode: store.settings.avatarMode === '3d' ? 'orb' : '3d',
              })
            }
            onChangePersona={applyPersonaSwitch}
            onChangeVoiceMode={(voiceInputMode) =>
              store.updateSettings({ voiceInputMode })
            }
            onToggleAutoSpeak={() =>
              store.updateSettings({
                autoSpeakTextReplies: !store.settings.autoSpeakTextReplies,
              })
            }
            onSendText={(text) => void handleSendTextOrCommand(text)}
            onSpeakMessage={(text) => void speakTextReply(text)}
            onClearTranscript={store.clearTranscript}
            onUpdateDeviceState={store.updateDeviceState}
            onDeleteCalendarEvent={store.deleteCalendarEvent}
            onToggleAlarm={store.toggleAlarm}
            onDeleteAlarm={store.deleteAlarm}
            onToggleTimer={store.toggleTimer}
            onDismissTimer={store.dismissTimer}
            onToggleReminder={store.toggleReminder}
            onDeleteReminder={store.deleteReminder}
            onConfirmDraft={handleConfirmDraft}
            onCancelDraft={handleCancelDraft}
            onRefreshWeather={() => {
              void store.refreshWeather().then((w) => {
                if (w) showToast(`Weather updated: ${w.city} (${Math.round(w.temperatureC)}°C)`);
              });
            }}
            onLogWater={() => {
              store.logWaterGlass();
              showToast(
                `Hydration logged (${store.careState.waterGlassesToday + 1}/${store.careState.waterGoalGlasses})`
              );
            }}
            onUpdateCareState={store.updateCareState}
            onDismissCareNudge={store.dismissCareNudge}
            onTriggerWakeUpNow={store.triggerWakeUpAlarmNow}
            onSnoozeWakeUp={() => {
              store.snoozeWakeUpAlarm();
              showToast('Wake-up alarm snoozed for 5 minutes');
            }}
            onDismissWakeUp={() => {
              store.dismissWakeUpAlarm();
              showToast('Good morning! Wake-up alarm dismissed.');
            }}
            onGenerateImage={(prompt, ratio, style) =>
              void handleGenerateImage(prompt, ratio, style)
            }
            onGenerateVideo={(prompt, ratio, dur) =>
              void handleGenerateVideo(prompt, ratio, dur)
            }
            onBuildWebsite={(desc, title) => void handleBuildWebsite(desc, title)}
            onOpenWebsitePreview={setPreviewWebsite}
            onDeleteMedia={(id) => {
              store.removeMediaCreation(id);
              showToast('Removed creation from Gallery');
            }}
            onDeleteWebsite={(id) => {
              store.removeWebsiteCreation(id);
              showToast('Removed website from local archive');
            }}
            onNotify={showToast}
          />
        )}

        {activeTab === 'memory' && (
          <MemoryBankView
            memories={store.memories}
            identityCore={store.identityCore}
            sessionState={store.sessionState}
            settings={store.settings}
            onUpdateSettings={handleUpdateSettings}
            onUpdateIdentityCore={store.updateIdentityCore}
            onSetVoiceprint={(profile) => {
              store.setVoiceprint(profile);
              showToast(profile ? 'Voiceprint enrolled on-device' : 'Voiceprint cleared');
            }}
            onSetFaceProfile={(profile) => {
              store.setFaceProfile(profile);
              showToast(profile ? 'Face profile enrolled on-device' : 'Face profile cleared');
            }}
            onAddMemory={(content, category, source, pinned, isPermanent) => {
              const saved = store.addMemory(content, category, source, pinned, isPermanent ?? true);
              if (saved) showToast('Saved to Permanent Memory Core');
            }}
            onUpdateMemory={store.updateMemory}
            onDeleteMemory={(id) => {
              store.deleteMemory(id);
              showToast('Memory removed');
            }}
          />
        )}

        {activeTab === 'commands' && (
          <CommandsCatalogView
            personas={store.personas}
            shortcuts={store.shortcuts}
            onRunCommandPhrase={handleRunCatalogCommand}
            onRunShortcut={(sc) => void handleRunShortcut(sc)}
            onAddShortcut={(sc) => {
              store.addShortcut(sc);
              showToast(`Saved shortcut "${sc.label}"`);
            }}
            onDeleteShortcut={(id) => {
              store.deleteShortcut(id);
              showToast('Shortcut deleted');
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={store.settings}
            personas={store.personas}
            memoriesCount={store.memories.length}
            apiKeyState={apiKeyState}
            onApiKeyStateChange={setApiKeyState}
            isScreenSharing={live.isScreenSharing}
            isCameraActive={live.isCameraActive}
            wakeLockActive={live.wakeLockActive}
            googleAccount={store.googleAccount}
            googleTokenReady={store.googleTokenReady}
            workspaceScopes={store.workspaceScopes}
            keepNotes={store.keepNotes}
            onUpdateWorkspaceScopes={store.updateWorkspaceScopes}
            onConnectGoogle={async (forceSelect) => {
              const profile = await store.connectGoogleAccount(Boolean(forceSelect));
              showToast(`Linked Google Account: ${profile.email}`);
            }}
            onDisconnectGoogle={async () => {
              await store.disconnectGoogleAccount();
              showToast('Disconnected Google Account');
            }}
            onAddKeepNote={(title, content) => {
              store.addKeepNote(title, content);
              showToast(`Note saved: ${title}`);
            }}
            onDeleteKeepNote={(id) => {
              store.deleteKeepNote(id);
              showToast('Note deleted');
            }}
            onQuickWorkspaceAction={(phrase) => {
              setActiveTab('companion');
              void handleSendTextOrCommand(phrase);
            }}
            kidBundles={store.kidBundles}
            activeKidId={store.activeKidId}
            onSelectKid={store.setActiveKidId}
            onAddKidProfile={async (name, age, grade, subjects) => {
              await store.addKidProfile(name, age, grade, subjects);
              showToast(`Created isolated study profile for ${name}`);
            }}
            onDeleteKidProfile={async (kidId) => {
              await store.deleteKidProfile(kidId);
              showToast('Removed child study profile');
            }}
            onStartLessonWithKid={(kidName, subject) => {
              applyPersonaSwitch('home-teacher');
              setActiveTab('companion');
              void handleSendTextOrCommand(
                `Hi Gwen, I'm ${kidName}! Let's do a fun ${subject || 'study'} lesson together.`
              );
            }}
            onAskParentReport={(kidName) => {
              setActiveTab('companion');
              void handleSendTextOrCommand(`How is ${kidName} doing in school studies?`);
            }}
            isInstallable={installPrompt.isInstallable}
            isInstalled={installPrompt.isInstalled}
            isIOS={installPrompt.isIOS}
            isAndroid={installPrompt.isAndroid}
            onPromptInstall={installPrompt.promptInstall}
            onNotify={showToast}
            onUpdateSettings={handleUpdateSettings}
            onSaveCustomPersona={(p) => {
              const id = store.saveCustomPersona(p);
              showToast(`Created persona "${p.name}"`);
              return id;
            }}
            onDeleteCustomPersona={(id) => {
              store.deleteCustomPersona(id);
              showToast('Custom persona removed');
            }}
            onToggleScreenShare={handleToggleScreenShare}
            onToggleCameraVision={handleToggleCameraVision}
            onSleepGwen={() => {
              setActiveTab('companion');
              handleSleepGwen(
                'Goodnight! Going into dormant sleep mode now. Tap Wake Gwen whenever you need me.'
              );
            }}
            onAskGwenAboutCreator={() => {
              setActiveTab('companion');
              void handleSendTextOrCommand('Who created you and why are you named Gwen?');
            }}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Tab Bar (64px) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 h-16 pb-safe border-t"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-hairline)',
        }}
      >
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className="flex flex-col items-center justify-center gap-1 min-h-[48px] transition-colors cursor-pointer"
              style={{
                color: active ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {item.icon}
              <span className="text-[11px] font-medium tracking-tight whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Draggable Floating Overlay Avatar */}
      <FloatingOverlayAvatar
        visible={store.settings.overlayEnabled}
        state={live.gwenState}
        styleVariant={store.settings.overlayStyle}
        sizeVariant={store.settings.overlaySize}
        isConnected={live.isConnected}
        isScreenSharing={live.isScreenSharing}
        onWakeOrToggleVoice={() => {
          if (live.isConnected) {
            live.stopSession();
          } else {
            handleStartVoiceGuarded();
          }
        }}
        onQuickCommand={(text) => {
          setActiveTab('companion');
          void handleSendTextOrCommand(text);
        }}
        onToggleScreenShare={handleToggleScreenShare}
        onDismiss={() => {
          store.updateSettings({ overlayEnabled: false });
          showToast('Floating Gwen avatar hidden');
        }}
      />

      {/* First-Launch Multi-Device User Personalization Modal */}
      <FirstLaunchModal
        visible={!store.settings.onboardingCompleted}
        onComplete={(name) => {
          store.updateSettings({
            deviceUserName: name,
            onboardingCompleted: true,
          });
          if (!store.identityCore.displayName) {
            store.updateIdentityCore({ displayName: name });
          }
          showToast(`Welcome, ${name}! Gwen is ready.`);
        }}
      />

      {/* First-Time / Mic-Guard Personal Gemini API Key Onboarding Modal */}
      <ApiKeyOnboardingModal
        visible={store.settings.onboardingCompleted && apiKeyModal.visible}
        reason={apiKeyModal.reason}
        onVerified={(nextState) => {
          const wasMicTrigger = apiKeyModal.reason === 'mic';
          setApiKeyState(nextState);
          setApiKeyModal((prev) => ({ ...prev, visible: false }));
          live.setError(null);
          showToast('Gemini API Key verified & saved! Gwen is ready.');
          if (wasMicTrigger) {
            if (live.gwenState === 'dormant') {
              live.wakeFromSleep();
            }
            void live.startSession();
          }
        }}
        onOpenSettings={handleOpenApiKeySettings}
        onDismiss={() => setApiKeyModal((prev) => ({ ...prev, visible: false }))}
      />

      {/* Interactive Sandboxed Live Website Preview Modal */}
      <WebsitePreviewModal
        website={previewWebsite}
        onClose={() => setPreviewWebsite(null)}
        onNotify={showToast}
      />

      {/* Unified Confirmation Bottom Sheet (Gmail Send, Calendar Changes, Play Store, Browser Downloads) */}
      <ConfirmationBottomSheet
        action={pendingConfirmation}
        busy={isConfirmingAction}
        isAndroid={installPrompt.isAndroid}
        onConfirm={(act) => void handleConfirmPendingAction(act)}
        onCancel={() => {
          setPendingConfirmation(null);
          showToast('Action cancelled');
        }}
      />

      {/* Offline Status Toast */}
      <OfflineIndicator isOnline={installPrompt.isOnline} />

      {/* Subtle Action Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-xs font-medium shadow-xl border whitespace-nowrap max-w-[92vw] truncate"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-strong)',
            color: 'var(--text-primary)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
