import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_CARE_STATE,
  DEFAULT_DEVICE_STATE,
  DEFAULT_IDENTITY_CORE,
  DEFAULT_PERSONAS,
  DEFAULT_SESSION_STATE,
  DEFAULT_SETTINGS,
  DEFAULT_SHORTCUTS,
  INITIAL_MEMORIES,
  THEME_PRESETS,
} from '../data/defaults';
import { ContinuousMemoryService } from '../services/continuousMemoryDb';
import {
  DEFAULT_WORKSPACE_SCOPES_CONFIG,
  GoogleAuthService,
  KeepAndTasksService,
} from '../services/googleWorkspace';
import { KidsStudyStorage } from '../services/kidsStudyDb';
import type {
  AlarmItem,
  CalendarEventItem,
  CompanionCareState,
  ContinuousSessionState,
  CustomShortcut,
  DeviceSystemState,
  FaceBiometricProfile,
  GeneratedMediaItem,
  GeneratedWebsiteItem,
  GoogleAccountProfile,
  GoogleWorkspaceScopesConfig,
  GwenSettings,
  IdentityCoreProfile,
  KeepStyleNote,
  KidLessonRecord,
  KidPracticeLog,
  KidProfile,
  KidQuizResult,
  KidStudyBundle,
  MemoryCategory,
  MemoryItem,
  MessagePlatform,
  PendingMessageDraft,
  Persona,
  ReminderTaskItem,
  TimerItem,
  TranscriptMessage,
  VoiceprintProfile,
  WeatherSnapshot,
} from '../types/gwen';
import { playTimerChime } from '../utils/biometrics';
import { getDateKeyInZone, getHourMinute24 } from '../utils/timeIst';

const STORAGE_KEYS = {
  settings: 'gwen.v3.settings',
  memories: 'gwen.v3.memories',
  identityCore: 'gwen.v3.identityCore',
  personas: 'gwen.v3.personas',
  shortcuts: 'gwen.v3.shortcuts',
  transcript: 'gwen.v3.transcript',
  deviceState: 'gwen.v3.deviceState',
  careState: 'gwen.v3.careState',
  weather: 'gwen.v3.weather',
  sessionState: 'gwen.v3.sessionState',
  calendar: 'gwen.v3.calendar',
  alarms: 'gwen.v3.alarms',
  reminders: 'gwen.v3.reminders',
  workspaceScopes: 'gwen.v4.workspaceScopes',
  activeKidId: 'gwen.v4.activeKidId',
};

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(45, 212, 191, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getContrastColor(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#041b17';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.56 ? '#091118' : '#ffffff';
}

export interface ActiveCareNudge {
  kind: 'water' | 'rest' | 'winddown';
  title: string;
  message: string;
}

export function useGwenStore() {
  const [settings, setSettingsState] = useState<GwenSettings>(() => {
    const v3 = readLocal<Partial<GwenSettings>>(STORAGE_KEYS.settings, {});
    const v2 = readLocal<Partial<GwenSettings>>('gwen.v2.settings', {});
    return { ...DEFAULT_SETTINGS, ...v2, ...v3 };
  });

  const [memories, setMemories] = useState<MemoryItem[]>(() => {
    const saved = readLocal<MemoryItem[]>(
      STORAGE_KEYS.memories,
      readLocal<MemoryItem[]>('gwen.v2.memories', INITIAL_MEMORIES)
    );
    const merged = saved.length > 0 ? saved : INITIAL_MEMORIES;
    return merged.map((m) => ({ ...m, isPermanent: m.isPermanent ?? true }));
  });

  const [identityCore, setIdentityCore] = useState<IdentityCoreProfile>(() => ({
    ...DEFAULT_IDENTITY_CORE,
    ...readLocal<Partial<IdentityCoreProfile>>(
      STORAGE_KEYS.identityCore,
      readLocal<Partial<IdentityCoreProfile>>('gwen.v2.identityCore', {})
    ),
  }));

  const [personas, setPersonas] = useState<Persona[]>(() => {
    const saved = readLocal<Persona[]>(STORAGE_KEYS.personas, []);
    const customOnly = saved.filter((p) => !p.isBuiltIn);
    return [...DEFAULT_PERSONAS, ...customOnly];
  });

  const [shortcuts, setShortcuts] = useState<CustomShortcut[]>(() =>
    readLocal<CustomShortcut[]>(STORAGE_KEYS.shortcuts, DEFAULT_SHORTCUTS)
  );

  const [transcript, setTranscript] = useState<TranscriptMessage[]>(() =>
    readLocal<TranscriptMessage[]>(STORAGE_KEYS.transcript, [])
  );

  const [sessionState, setSessionState] = useState<ContinuousSessionState>(() => ({
    ...DEFAULT_SESSION_STATE,
    ...readLocal<Partial<ContinuousSessionState>>(STORAGE_KEYS.sessionState, {}),
  }));

  const [deviceState, setDeviceState] = useState<DeviceSystemState>(() => ({
    ...DEFAULT_DEVICE_STATE,
    ...readLocal<Partial<DeviceSystemState>>(STORAGE_KEYS.deviceState, {}),
  }));

  const [careState, setCareState] = useState<CompanionCareState>(() => ({
    ...DEFAULT_CARE_STATE,
    ...readLocal<Partial<CompanionCareState>>(STORAGE_KEYS.careState, {}),
  }));

  const [weather, setWeather] = useState<WeatherSnapshot | null>(() =>
    readLocal<WeatherSnapshot | null>(STORAGE_KEYS.weather, null)
  );
  const [weatherLoading, setWeatherLoading] = useState(false);

  const [mediaCreations, setMediaCreations] = useState<GeneratedMediaItem[]>([]);
  const [websiteCreations, setWebsiteCreations] = useState<GeneratedWebsiteItem[]>([]);

  const [activeCareNudge, setActiveCareNudge] = useState<ActiveCareNudge | null>(null);
  const [activeWakeUpAlarm, setActiveWakeUpAlarm] = useState<{
    time: string;
    label: string;
    escalationLevel: number;
  } | null>(null);

  const [calendarEvents, setCalendarEvents] = useState<CalendarEventItem[]>(() =>
    readLocal<CalendarEventItem[]>(STORAGE_KEYS.calendar, [])
  );

  const [alarms, setAlarms] = useState<AlarmItem[]>(() =>
    readLocal<AlarmItem[]>(STORAGE_KEYS.alarms, [])
  );

  const [timers, setTimers] = useState<TimerItem[]>([]);

  const [reminders, setReminders] = useState<ReminderTaskItem[]>(() =>
    readLocal<ReminderTaskItem[]>(STORAGE_KEYS.reminders, [])
  );

  const [pendingDrafts, setPendingDrafts] = useState<PendingMessageDraft[]>([]);

  // Google Workspace Account (per-device isolated, token kept strictly in memory)
  const [googleAccount, setGoogleAccount] = useState<GoogleAccountProfile | null>(null);
  const [googleTokenReady, setGoogleTokenReady] = useState(false);
  const [workspaceScopes, setWorkspaceScopes] = useState<GoogleWorkspaceScopesConfig>(() => ({
    ...DEFAULT_WORKSPACE_SCOPES_CONFIG,
    ...readLocal<Partial<GoogleWorkspaceScopesConfig>>(STORAGE_KEYS.workspaceScopes, {}),
  }));
  const [keepNotes, setKeepNotes] = useState<KeepStyleNote[]>(() =>
    KeepAndTasksService.getLocalNotes()
  );

  // Isolated Multi-Kid Home Teacher Study State
  const [kidBundles, setKidBundles] = useState<KidStudyBundle[]>([]);
  const [activeKidId, setActiveKidId] = useState<string | null>(() =>
    readLocal<string | null>(STORAGE_KEYS.activeKidId, null)
  );

  const lastTriggeredWakeMinuteRef = useRef<string>('');
  const minutesSinceWaterNudgeRef = useRef<number>(0);
  const minutesSinceRestNudgeRef = useRef<number>(0);

  // Subscribe to Firebase Google Auth state (clears in-memory token automatically on sign-out)
  useEffect(() => {
    const unsubscribe = GoogleAuthService.initAuth(
      (profile, hasLiveToken) => {
        setGoogleAccount(profile);
        setGoogleTokenReady(hasLiveToken);
      },
      () => {
        setGoogleAccount(null);
        setGoogleTokenReady(false);
      }
    );
    return unsubscribe;
  }, []);

  // Hydrate full local IndexedDB (Zero-Forgetfulness Continuous Memory + Creations + Isolated Kids Study DB)
  useEffect(() => {
    let active = true;
    void (async () => {
      const [dbTurns, dbSession, dbMedia, dbSites, totalCount, allKids] = await Promise.all([
        ContinuousMemoryService.getRecentTurns(120),
        ContinuousMemoryService.loadSessionState(),
        ContinuousMemoryService.getMediaCreations(),
        ContinuousMemoryService.getWebsiteCreations(),
        ContinuousMemoryService.getTotalTurnCount(),
        KidsStudyStorage.loadAllIsolatedBundles(),
      ]);
      if (!active) return;
      if (dbTurns.length > 0) {
        setTranscript(dbTurns);
      }
      if (dbSession) {
        setSessionState((prev) => ({
          ...prev,
          ...dbSession,
          totalArchivedTurns: Math.max(totalCount, dbSession.totalArchivedTurns || 0),
        }));
      }
      setMediaCreations(dbMedia);
      setWebsiteCreations(dbSites);
      setKidBundles(allKids);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.workspaceScopes, JSON.stringify(workspaceScopes));
  }, [workspaceScopes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.activeKidId, JSON.stringify(activeKidId));
  }, [activeKidId]);

  useEffect(() => {
    KeepAndTasksService.saveLocalNotes(keepNotes);
  }, [keepNotes]);

  // Persist to localStorage & IndexedDB
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.memories, JSON.stringify(memories));
    void ContinuousMemoryService.syncMemories(memories);
  }, [memories]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.identityCore, JSON.stringify(identityCore));
  }, [identityCore]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.personas, JSON.stringify(personas));
  }, [personas]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.shortcuts, JSON.stringify(shortcuts));
  }, [shortcuts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.transcript, JSON.stringify(transcript.slice(-100)));
  }, [transcript]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.sessionState, JSON.stringify(sessionState));
    void ContinuousMemoryService.saveSessionState(sessionState);
  }, [sessionState]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.deviceState, JSON.stringify(deviceState));
  }, [deviceState]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.careState, JSON.stringify(careState));
  }, [careState]);

  useEffect(() => {
    if (weather) {
      localStorage.setItem(STORAGE_KEYS.weather, JSON.stringify(weather));
    }
  }, [weather]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.calendar, JSON.stringify(calendarEvents));
  }, [calendarEvents]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.alarms, JSON.stringify(alarms));
  }, [alarms]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.reminders, JSON.stringify(reminders));
  }, [reminders]);

  // Real-time Companion Care & IST Wake-Up Alarm Scheduler (ticks every 30s)
  useEffect(() => {
    const tickCare = () => {
      const now = new Date();
      const todayKey = getDateKeyInZone(now, settings.timezone);
      const { hhmm } = getHourMinute24(now, settings.timezone);

      // Daily rollover reset in active timezone (IST default)
      setCareState((prev) => {
        if (prev.lastCareDateKey !== todayKey) {
          return {
            ...prev,
            waterGlassesToday: 0,
            sessionMinutesElapsed: 0,
            lastCareDateKey: todayKey,
          };
        }
        return {
          ...prev,
          sessionMinutesElapsed: prev.sessionMinutesElapsed + 0.5,
        };
      });

      minutesSinceWaterNudgeRef.current += 0.5;
      minutesSinceRestNudgeRef.current += 0.5;

      if (
        careState.waterReminderEnabled &&
        careState.waterGlassesToday < careState.waterGoalGlasses &&
        minutesSinceWaterNudgeRef.current >= careState.waterIntervalMinutes
      ) {
        minutesSinceWaterNudgeRef.current = 0;
        setActiveCareNudge({
          kind: 'water',
          title: 'Hydration Check-In',
          message: `Time for a refreshing glass of water (${careState.waterGlassesToday}/${careState.waterGoalGlasses} today).`,
        });
      } else if (
        careState.restReminderEnabled &&
        minutesSinceRestNudgeRef.current >= careState.restIntervalMinutes
      ) {
        minutesSinceRestNudgeRef.current = 0;
        setActiveCareNudge({
          kind: 'rest',
          title: 'Take a Short Rest Break',
          message: 'You have been active for a while — stretch your shoulders and rest your eyes for 2 minutes.',
        });
      }

      // Trigger IST Wake-Up Alarm if enabled & minute matches
      if (
        careState.wakeUpEnabled &&
        careState.wakeUpTimeIST === hhmm &&
        lastTriggeredWakeMinuteRef.current !== `${todayKey}-${hhmm}`
      ) {
        lastTriggeredWakeMinuteRef.current = `${todayKey}-${hhmm}`;
        playTimerChime();
        setActiveWakeUpAlarm({
          time: careState.wakeUpTimeIST,
          label: careState.wakeUpLabel || 'Morning Wake-Up',
          escalationLevel: 1,
        });
      }
    };

    const id = window.setInterval(tickCare, 30000);
    return () => window.clearInterval(id);
  }, [
    careState.restIntervalMinutes,
    careState.restReminderEnabled,
    careState.wakeUpEnabled,
    careState.wakeUpLabel,
    careState.wakeUpTimeIST,
    careState.waterGlassesToday,
    careState.waterGoalGlasses,
    careState.waterIntervalMinutes,
    careState.waterReminderEnabled,
    settings.timezone,
  ]);

  // Escalating Wake-Up Alarm chime pulse while active
  useEffect(() => {
    if (!activeWakeUpAlarm) return;
    const id = window.setInterval(() => {
      playTimerChime();
      setActiveWakeUpAlarm((prev) =>
        prev ? { ...prev, escalationLevel: Math.min(5, prev.escalationLevel + 1) } : null
      );
    }, 5500);
    return () => window.clearInterval(id);
  }, [activeWakeUpAlarm]);

  // Live 1-second timer countdown tick
  useEffect(() => {
    const hasRunning = timers.some((t) => t.running && !t.completed);
    if (!hasRunning) return;
    const id = window.setInterval(() => {
      setTimers((prev) =>
        prev.map((t) => {
          if (!t.running || t.completed) return t;
          const next = t.remainingSeconds - 1;
          if (next <= 0) {
            playTimerChime();
            return { ...t, remainingSeconds: 0, running: false, completed: true };
          }
          return { ...t, remainingSeconds: next };
        })
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, [timers]);

  // Apply Theme Engine & Custom Accent to document root immediately
  useEffect(() => {
    const root = document.documentElement;
    const preset = THEME_PRESETS.find((t) => t.id === settings.themeId) ?? THEME_PRESETS[0];

    root.setAttribute('data-theme', preset.id);
    if (preset.isLight) {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }

    const activeAccent = settings.customAccent || preset.defaultAccent;
    root.style.setProperty('--accent', activeAccent);
    root.style.setProperty('--accent-soft', hexToRgba(activeAccent, preset.isLight ? 0.12 : 0.15));
    root.style.setProperty('--accent-ring', hexToRgba(activeAccent, 0.36));
    root.style.setProperty('--accent-contrast', getContrastColor(activeAccent));
  }, [settings.themeId, settings.customAccent]);

  const updateSettings = useCallback((patch: Partial<GwenSettings>) => {
    setSettingsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateDeviceState = useCallback((patch: Partial<DeviceSystemState>) => {
    setDeviceState((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateCareState = useCallback((patch: Partial<CompanionCareState>) => {
    setCareState((prev) => ({ ...prev, ...patch }));
  }, []);

  const logWaterGlass = useCallback((count = 1) => {
    minutesSinceWaterNudgeRef.current = 0;
    setActiveCareNudge((prev) => (prev?.kind === 'water' ? null : prev));
    setCareState((prev) => ({
      ...prev,
      waterGlassesToday: Math.max(0, prev.waterGlassesToday + count),
      lastWaterLoggedAt: new Date().toISOString(),
    }));
  }, []);

  const dismissCareNudge = useCallback(() => {
    setActiveCareNudge(null);
  }, []);

  const triggerWakeUpAlarmNow = useCallback((label = 'Gentle Companion Wake-Up') => {
    playTimerChime();
    setActiveWakeUpAlarm({
      time: getHourMinute24(new Date(), settings.timezone).hhmm,
      label,
      escalationLevel: 1,
    });
  }, [settings.timezone]);

  const snoozeWakeUpAlarm = useCallback(() => {
    setActiveWakeUpAlarm(null);
    window.setTimeout(() => {
      playTimerChime();
      setActiveWakeUpAlarm({
        time: getHourMinute24(new Date(), settings.timezone).hhmm,
        label: 'Snoozed Wake-Up Check',
        escalationLevel: 2,
      });
    }, 5 * 60 * 1000);
  }, [settings.timezone]);

  const dismissWakeUpAlarm = useCallback(() => {
    setActiveWakeUpAlarm(null);
  }, []);

  // Fetch real live Weather (using browser geolocation when available or optional city)
  const refreshWeather = useCallback(
    async (city?: string): Promise<WeatherSnapshot | null> => {
      setWeatherLoading(true);
      try {
        let query = '';
        if (city?.trim()) {
          query = `?city=${encodeURIComponent(city.trim())}`;
        } else if (typeof navigator !== 'undefined' && navigator.geolocation) {
          const coords = await new Promise<{ lat: number; lon: number } | null>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setSettingsState((prev) => ({ ...prev, locationPermissionGranted: true }));
                resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
              },
              () => resolve(null),
              { timeout: 4500, maximumAge: 180000 }
            );
          });
          if (coords) {
            query = `?lat=${coords.lat}&lon=${coords.lon}`;
          }
        }

        const res = await fetch(`/api/gwen/weather${query}`);
        if (!res.ok) return null;
        const data = (await res.json()) as WeatherSnapshot;
        setWeather(data);
        return data;
      } catch {
        return null;
      } finally {
        setWeatherLoading(false);
      }
    },
    []
  );

  // Auto-fetch live IST weather once on mount if stale (>20 min) or missing
  useEffect(() => {
    const stale =
      !weather ||
      Date.now() - new Date(weather.fetchedAt).getTime() > 20 * 60 * 1000;
    if (stale) {
      void refreshWeather();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateIdentityCore = useCallback((patch: Partial<IdentityCoreProfile>) => {
    setIdentityCore((prev) => ({ ...prev, ...patch }));
  }, []);

  const setVoiceprint = useCallback((profile: VoiceprintProfile | null) => {
    setIdentityCore((prev) => ({ ...prev, voiceprint: profile }));
  }, []);

  const setFaceProfile = useCallback((profile: FaceBiometricProfile | null) => {
    setIdentityCore((prev) => ({ ...prev, faceProfile: profile }));
  }, []);

  const activePersona =
    personas.find((p) => p.id === settings.activePersonaId) ?? DEFAULT_PERSONAS[0];

  // Memory CRUD
  const addMemory = useCallback(
    (
      content: string,
      category: MemoryCategory = 'Custom Notes',
      source: MemoryItem['source'] = 'manual',
      pinned = false,
      isPermanent = true
    ): MemoryItem | null => {
      const cleaned = content.trim();
      if (!cleaned) return null;

      let created: MemoryItem | null = null;
      setMemories((prev) => {
        const duplicate = prev.some(
          (m) => m.content.toLowerCase() === cleaned.toLowerCase()
        );
        if (duplicate) return prev;
        const now = new Date().toISOString();
        created = {
          id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          content: cleaned,
          category,
          pinned,
          isPermanent,
          source,
          createdAt: now,
          updatedAt: now,
        };
        return [created, ...prev];
      });
      return created;
    },
    []
  );

  const updateMemory = useCallback(
    (
      id: string,
      patch: Partial<Pick<MemoryItem, 'content' | 'category' | 'pinned' | 'isPermanent'>>
    ) => {
      setMemories((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m
        )
      );
    },
    []
  );

  const deleteMemory = useCallback((id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const forgetMemoryByQuery = useCallback((query: string): number => {
    const q = query.trim().toLowerCase();
    if (!q || q.includes('syed farhan') || q.includes('developer') || q.includes('ben 10')) {
      return 0; // Protect immutable developer identity & origin story
    }
    let removedCount = 0;
    setMemories((prev) => {
      const next = prev.filter((m) => {
        if (m.id === 'mem-core-origin-1') return true;
        const match = m.content.toLowerCase().includes(q);
        if (match) removedCount += 1;
        return !match;
      });
      return next;
    });
    return removedCount;
  }, []);

  const updateSessionState = useCallback((patch: Partial<ContinuousSessionState>) => {
    setSessionState((prev) => ({
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  // Creations (Images, Videos, Websites) saved locally in IndexedDB
  const addMediaCreation = useCallback((item: GeneratedMediaItem) => {
    setMediaCreations((prev) => [item, ...prev]);
    void ContinuousMemoryService.saveMediaCreation(item);
  }, []);

  const removeMediaCreation = useCallback((id: string) => {
    setMediaCreations((prev) => prev.filter((m) => m.id !== id));
    void ContinuousMemoryService.deleteMediaCreation(id);
  }, []);

  const addWebsiteCreation = useCallback((item: GeneratedWebsiteItem) => {
    setWebsiteCreations((prev) => [item, ...prev]);
    void ContinuousMemoryService.saveWebsiteCreation(item);
  }, []);

  const removeWebsiteCreation = useCallback((id: string) => {
    setWebsiteCreations((prev) => prev.filter((w) => w.id !== id));
    void ContinuousMemoryService.deleteWebsiteCreation(id);
  }, []);

  // Personas CRUD
  const saveCustomPersona = useCallback(
    (persona: Omit<Persona, 'id' | 'isBuiltIn'> & { id?: string }) => {
      const id = persona.id || `persona-${Date.now()}`;
      setPersonas((prev) => {
        const exists = prev.some((p) => p.id === id);
        if (exists) {
          return prev.map((p) =>
            p.id === id ? { ...p, ...persona, id, isBuiltIn: false } : p
          );
        }
        return [...prev, { ...persona, id, isBuiltIn: false }];
      });
      return id;
    },
    []
  );

  const deleteCustomPersona = useCallback((id: string) => {
    setPersonas((prev) => prev.filter((p) => p.isBuiltIn || p.id !== id));
    setSettingsState((prev) =>
      prev.activePersonaId === id
        ? { ...prev, activePersonaId: DEFAULT_PERSONAS[0].id }
        : prev
    );
  }, []);

  // Shortcuts CRUD
  const addShortcut = useCallback(
    (shortcut: Omit<CustomShortcut, 'id' | 'createdAt'>) => {
      const created: CustomShortcut = {
        ...shortcut,
        id: `shortcut-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      setShortcuts((prev) => [created, ...prev]);
      return created;
    },
    []
  );

  const deleteShortcut = useCallback((id: string) => {
    setShortcuts((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Calendar, Alarms, Timers, Reminders, Pending Message Drafts
  const addCalendarEvent = useCallback((title: string, dateTime: string, notes?: string) => {
    const item: CalendarEventItem = {
      id: `cal-${Date.now()}`,
      title,
      dateTime,
      notes,
      createdAt: new Date().toISOString(),
    };
    setCalendarEvents((prev) => [item, ...prev]);
    return item;
  }, []);

  const deleteCalendarEvent = useCallback((id: string) => {
    setCalendarEvents((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const addAlarm = useCallback((time: string, label: string) => {
    const item: AlarmItem = {
      id: `alarm-${Date.now()}`,
      time,
      label: label || 'Gwen Alarm',
      enabled: true,
    };
    setAlarms((prev) => [item, ...prev]);
    return item;
  }, []);

  const toggleAlarm = useCallback((id: string) => {
    setAlarms((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))
    );
  }, []);

  const deleteAlarm = useCallback((id: string) => {
    setAlarms((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const addTimer = useCallback((totalSeconds: number, label: string) => {
    const item: TimerItem = {
      id: `timer-${Date.now()}`,
      label: label || 'Timer',
      totalSeconds,
      remainingSeconds: totalSeconds,
      running: true,
      completed: false,
    };
    setTimers((prev) => [item, ...prev]);
    return item;
  }, []);

  const toggleTimer = useCallback((id: string) => {
    setTimers((prev) =>
      prev.map((t) => (t.id === id && !t.completed ? { ...t, running: !t.running } : t))
    );
  }, []);

  const dismissTimer = useCallback((id: string) => {
    setTimers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addReminder = useCallback((title: string, dueText?: string) => {
    const item: ReminderTaskItem = {
      id: `rem-${Date.now()}`,
      title,
      dueText,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    setReminders((prev) => [item, ...prev]);
    return item;
  }, []);

  const toggleReminder = useCallback((id: string) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, completed: !r.completed } : r))
    );
  }, []);

  const completeReminderByQuery = useCallback((query: string): boolean => {
    const q = query.trim().toLowerCase();
    let matched = false;
    setReminders((prev) =>
      prev.map((r) => {
        if (!matched && r.title.toLowerCase().includes(q)) {
          matched = true;
          return { ...r, completed: true };
        }
        return r;
      })
    );
    return matched;
  }, []);

  const deleteReminder = useCallback((id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const queueMessageDraft = useCallback(
    (platform: MessagePlatform, recipient: string, message: string) => {
      const draft: PendingMessageDraft = {
        id: `draft-${Date.now()}`,
        platform,
        recipient,
        message,
        createdAt: new Date().toISOString(),
      };
      setPendingDrafts((prev) => [draft, ...prev]);
      return draft;
    },
    []
  );

  const removeMessageDraft = useCallback((id: string) => {
    setPendingDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  // Zero-Forgetfulness Transcript append (persists every turn to IndexedDB!)
  const appendMessage = useCallback(
    (msg: Omit<TranscriptMessage, 'id' | 'timestamp'>) => {
      const item: TranscriptMessage = {
        ...msg,
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
      };
      setTranscript((prev) => [...prev.slice(-119), item]);
      void ContinuousMemoryService.saveTurn(item);
      if (msg.role === 'user' || msg.role === 'gwen') {
        setSessionState((prev) => ({
          ...prev,
          totalArchivedTurns: prev.totalArchivedTurns + 1,
          updatedAt: item.timestamp,
        }));
      }
      return item;
    },
    []
  );

  const clearTranscript = useCallback(() => {
    setTranscript([]);
  }, []);

  // Google Workspace Account actions
  const updateWorkspaceScopes = useCallback((patch: Partial<GoogleWorkspaceScopesConfig>) => {
    setWorkspaceScopes((prev) => ({ ...prev, ...patch }));
  }, []);

  const connectGoogleAccount = useCallback(
    async (forceAccountSelect = false): Promise<GoogleAccountProfile> => {
      const { profile } = await GoogleAuthService.signIn(workspaceScopes, forceAccountSelect);
      setGoogleAccount(profile);
      setGoogleTokenReady(true);
      return profile;
    },
    [workspaceScopes]
  );

  const disconnectGoogleAccount = useCallback(async () => {
    await GoogleAuthService.disconnect();
    setGoogleAccount(null);
    setGoogleTokenReady(false);
  }, []);

  const addKeepNote = useCallback(
    (title: string, content: string, googleTaskId?: string) => {
      const note: KeepStyleNote = {
        id: `note-${Date.now()}`,
        title: title.trim() || 'Quick Note',
        content: content.trim(),
        syncedToTasks: Boolean(googleTaskId),
        googleTaskId,
        updatedAt: new Date().toISOString(),
      };
      setKeepNotes((prev) => [note, ...prev]);
      return note;
    },
    []
  );

  const deleteKeepNote = useCallback((id: string) => {
    setKeepNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Isolated Multi-Kid Study CRUD (strictly keyed per kidId)
  const KID_COLORS = ['#2dd4bf', '#38bdf8', '#a78bfa', '#fb923c', '#34d399', '#fb7185'];

  const addKidProfile = useCallback(
    async (name: string, age: number, grade: string, subjects: string[]): Promise<KidProfile> => {
      const now = new Date().toISOString();
      const profile: KidProfile = {
        id: `kid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim(),
        age: Math.max(3, Math.min(18, Math.round(age) || 8)),
        grade: grade.trim() || 'Grade 3',
        subjects: subjects.length > 0 ? subjects : ['Math', 'English', 'Science'],
        avatarColor: KID_COLORS[kidBundles.length % KID_COLORS.length],
        stars: 0,
        streakDays: 1,
        lastActiveAt: now,
        createdAt: now,
      };
      await KidsStudyStorage.saveProfile(profile);
      const bundle: KidStudyBundle = {
        profile,
        lessons: [],
        practiceLogs: [],
        quizResults: [],
      };
      setKidBundles((prev) => [...prev, bundle]);
      setActiveKidId(profile.id);
      return profile;
    },
    [kidBundles.length]
  );

  const deleteKidProfile = useCallback(async (kidId: string) => {
    await KidsStudyStorage.deleteProfileCascade(kidId);
    setKidBundles((prev) => prev.filter((b) => b.profile.id !== kidId));
    setActiveKidId((cur) => (cur === kidId ? null : cur));
  }, []);

  const switchKidByName = useCallback(
    (nameQuery: string): KidStudyBundle | null => {
      const q = nameQuery.trim().toLowerCase();
      if (!q) return null;
      const match = kidBundles.find(
        (b) =>
          b.profile.name.toLowerCase() === q ||
          b.profile.name.toLowerCase().includes(q) ||
          q.includes(b.profile.name.toLowerCase())
      );
      if (match) {
        setActiveKidId(match.profile.id);
        return match;
      }
      return null;
    },
    [kidBundles]
  );

  const addKidLesson = useCallback(
    async (
      kidId: string,
      subject: string,
      topic: string,
      summary: string,
      masteryLevel: KidLessonRecord['masteryLevel'] = 'practicing',
      weakAreas: string[] = []
    ) => {
      const now = new Date().toISOString();
      const record: KidLessonRecord = {
        id: `lesson-${Date.now()}`,
        kidId,
        subject: subject || 'General',
        topic: topic || 'Daily Study',
        summary,
        masteryLevel,
        weakAreas,
        createdAt: now,
      };
      await KidsStudyStorage.addLesson(record);
      setKidBundles((prev) =>
        prev.map((b) => {
          if (b.profile.id !== kidId) return b;
          const updatedProfile: KidProfile = {
            ...b.profile,
            stars: b.profile.stars + 2,
            lastActiveAt: now,
          };
          void KidsStudyStorage.saveProfile(updatedProfile);
          return {
            ...b,
            profile: updatedProfile,
            lessons: [record, ...b.lessons],
          };
        })
      );
    },
    []
  );

  const addKidPracticeLog = useCallback(
    async (
      kidId: string,
      subject: string,
      activity: string,
      correctionsNoted: string,
      praiseGiven: string,
      starsEarned = 2
    ) => {
      const now = new Date().toISOString();
      const log: KidPracticeLog = {
        id: `prac-${Date.now()}`,
        kidId,
        subject: subject || 'Practice',
        activity,
        correctionsNoted,
        praiseGiven,
        starsEarned,
        createdAt: now,
      };
      await KidsStudyStorage.addPracticeLog(log);
      setKidBundles((prev) =>
        prev.map((b) => {
          if (b.profile.id !== kidId) return b;
          const updatedProfile: KidProfile = {
            ...b.profile,
            stars: b.profile.stars + starsEarned,
            lastActiveAt: now,
          };
          void KidsStudyStorage.saveProfile(updatedProfile);
          return {
            ...b,
            profile: updatedProfile,
            practiceLogs: [log, ...b.practiceLogs],
          };
        })
      );
    },
    []
  );

  const addKidQuizResult = useCallback(
    async (
      kidId: string,
      subject: string,
      topic: string,
      score: number,
      total: number,
      weakTopics: string[] = [],
      feedback = 'Great effort!'
    ) => {
      const now = new Date().toISOString();
      const safeTotal = Math.max(1, total);
      const safeScore = Math.max(0, Math.min(safeTotal, score));
      const starsAwarded = Math.max(1, Math.round((safeScore / safeTotal) * 5));
      const quiz: KidQuizResult = {
        id: `quiz-${Date.now()}`,
        kidId,
        subject: subject || 'General',
        topic: topic || 'Mini Quiz',
        score: safeScore,
        total: safeTotal,
        weakTopics,
        feedback,
        createdAt: now,
      };
      await KidsStudyStorage.addQuizResult(quiz);
      setKidBundles((prev) =>
        prev.map((b) => {
          if (b.profile.id !== kidId) return b;
          const updatedProfile: KidProfile = {
            ...b.profile,
            stars: b.profile.stars + starsAwarded,
            lastActiveAt: now,
          };
          void KidsStudyStorage.saveProfile(updatedProfile);
          return {
            ...b,
            profile: updatedProfile,
            quizResults: [quiz, ...b.quizResults],
          };
        })
      );
    },
    []
  );

  const getParentProgressReport = useCallback(
    (kidName: string, subjectFilter?: string): string => {
      const q = kidName.trim().toLowerCase();
      const bundle = kidBundles.find(
        (b) =>
          b.profile.name.toLowerCase() === q ||
          b.profile.name.toLowerCase().includes(q)
      );
      if (!bundle) {
        return kidBundles.length === 0
          ? `I don't have any child profiles set up yet. Open Settings → Kids Study Hub to add ${kidName}'s separate profile.`
          : `I couldn't find a study profile named "${kidName}". Currently saved children: ${kidBundles.map((b) => b.profile.name).join(', ')}.`;
      }
      const subj = subjectFilter?.trim().toLowerCase();
      const lessons = subj
        ? bundle.lessons.filter((l) => l.subject.toLowerCase().includes(subj))
        : bundle.lessons;
      const quizzes = subj
        ? bundle.quizResults.filter((qz) => qz.subject.toLowerCase().includes(subj))
        : bundle.quizResults;
      const avgPct =
        quizzes.length > 0
          ? Math.round(
              (quizzes.reduce((acc, qz) => acc + qz.score / Math.max(1, qz.total), 0) /
                quizzes.length) *
                100
            )
          : null;
      const latestLesson = lessons[0];
      const weakAreas = Array.from(
        new Set([
          ...lessons.flatMap((l) => l.weakAreas),
          ...quizzes.flatMap((qz) => qz.weakTopics),
        ])
      ).slice(0, 3);

      return (
        `${bundle.profile.name} (${bundle.profile.grade}) has earned ${bundle.profile.stars} stars with a ${bundle.profile.streakDays}-day streak` +
        `${subjectFilter ? ` in ${subjectFilter}` : ''}. ` +
        `Completed ${lessons.length} lesson(s) and ${quizzes.length} quiz(zes)` +
        `${avgPct !== null ? ` (average score ${avgPct}%)` : ''}. ` +
        `${latestLesson ? `Latest topic: ${latestLesson.topic} (${latestLesson.masteryLevel}). ` : ''}` +
        `${weakAreas.length > 0 ? `Areas to practice next: ${weakAreas.join(', ')}.` : 'Doing wonderfully so far!'}`
      );
    },
    [kidBundles]
  );

  const activeKidBundle =
    kidBundles.find((b) => b.profile.id === activeKidId) || null;

  return {
    settings,
    updateSettings,
    memories,
    addMemory,
    updateMemory,
    deleteMemory,
    forgetMemoryByQuery,
    identityCore,
    updateIdentityCore,
    setVoiceprint,
    setFaceProfile,
    sessionState,
    updateSessionState,
    personas,
    activePersona,
    saveCustomPersona,
    deleteCustomPersona,
    shortcuts,
    addShortcut,
    deleteShortcut,
    deviceState,
    updateDeviceState,
    careState,
    updateCareState,
    logWaterGlass,
    activeCareNudge,
    dismissCareNudge,
    activeWakeUpAlarm,
    triggerWakeUpAlarmNow,
    snoozeWakeUpAlarm,
    dismissWakeUpAlarm,
    weather,
    weatherLoading,
    refreshWeather,
    mediaCreations,
    addMediaCreation,
    removeMediaCreation,
    websiteCreations,
    addWebsiteCreation,
    removeWebsiteCreation,
    calendarEvents,
    addCalendarEvent,
    deleteCalendarEvent,
    alarms,
    addAlarm,
    toggleAlarm,
    deleteAlarm,
    timers,
    addTimer,
    toggleTimer,
    dismissTimer,
    reminders,
    addReminder,
    toggleReminder,
    completeReminderByQuery,
    deleteReminder,
    pendingDrafts,
    queueMessageDraft,
    removeMessageDraft,
    googleAccount,
    googleTokenReady,
    workspaceScopes,
    updateWorkspaceScopes,
    connectGoogleAccount,
    disconnectGoogleAccount,
    keepNotes,
    addKeepNote,
    deleteKeepNote,
    kidBundles,
    activeKidId,
    activeKidBundle,
    setActiveKidId,
    addKidProfile,
    deleteKidProfile,
    switchKidByName,
    addKidLesson,
    addKidPracticeLog,
    addKidQuizResult,
    getParentProgressReport,
    transcript,
    appendMessage,
    clearTranscript,
  };
}
