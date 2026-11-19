import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GoogleGenAI,
  Modality,
  type LiveServerMessage,
} from '@google/genai';
import type {
  CompanionCareState,
  ContinuousSessionState,
  DeviceSystemState,
  EmpathySignal,
  GwenSettings,
  GwenState,
  IdentityCoreProfile,
  KidStudyBundle,
  MemoryItem,
  Persona,
  TranscriptMessage,
  VoiceName,
  WeatherSnapshot,
} from '../types/gwen';
import {
  getActiveGeminiApiKey,
  subscribeApiKeyChanges,
} from '../services/apiKeyStorage';
import {
  ALLOWED_VOICES,
  GwenClientApiError,
  LIVE_FUNCTION_DECLARATIONS,
  checkGwenEmpathyCue,
  discoverBidiModels,
  extractRawErrorMessage,
  generateGwenTts,
  toFriendlyGeminiError,
  transcribeGwenAudio,
} from '../services/gwenClientApi';
import { buildGwenSystemInstruction } from '../shared/gwenSystemPrompt';
import {
  computeSpectralSignature,
  cosineSimilarity,
  extractFaceHistogram,
} from '../utils/biometrics';

export interface LiveToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type VoiceTransportMode = 'live' | 'standard-fallback';

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [altIndex: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface UseGwenLiveOptions {
  settings: GwenSettings;
  deviceState: DeviceSystemState;
  activePersona: Persona;
  memories: MemoryItem[];
  identityCore: IdentityCoreProfile;
  weather: WeatherSnapshot | null;
  careState: CompanionCareState;
  sessionState: ContinuousSessionState;
  recentTurns: TranscriptMessage[];
  googleAccountEmail?: string | null;
  activeKidStudy?: KidStudyBundle | null;
  allKidNames?: string[];
  onInputTranscript: (text: string) => void;
  onOutputTranscript: (text: string) => void;
  onToolCall: (call: LiveToolCall) => void;
  onEmpathySignal?: (signal: EmpathySignal) => void;
  onApiKeyError?: (errorCode: 'INVALID_KEY' | 'QUOTA_EXCEEDED', message: string) => void;
  onFallbackSpeechTurn?: (spokenText: string) => Promise<string | null>;
  onVoiceNotice?: (message: string) => void;
}

// Inline AudioWorklet processor loaded via Blob URL so it never 404s when hosted
const PCM_CAPTURE_WORKLET_CODE = `
class GwenPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 2048;
    this._buffer = new Float32Array(this._bufferSize);
    this._offset = 0;
  }
  process(inputs) {
    const input = inputs && inputs[0];
    const channel = input && input[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._offset++] = channel[i];
      if (this._offset >= this._bufferSize) {
        const chunk = this._buffer.slice(0);
        this.port.postMessage(chunk, [chunk.buffer]);
        this._offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('gwen-pcm-capture', GwenPcmCaptureProcessor);
`;

function describeWsClose(code: number, reason?: string): string {
  const cleanReason = (reason || '').trim();
  const codeHintMap: Record<number, string> = {
    1000: 'Normal closure',
    1001: 'Endpoint going away',
    1002: 'Protocol error',
    1003: 'Unsupported data',
    1006: 'Abnormal closure (network drop or proxy rejected WebSocket)',
    1007: 'Invalid setup payload or tool schema',
    1008: 'Policy violation or model unsupported for bidiGenerateContent',
    1009: 'Message too large',
    1011: 'Upstream server error',
    1015: 'TLS handshake failure',
  };
  const hint = codeHintMap[code] || 'Unexpected close';
  return cleanReason
    ? `WebSocket closed (code ${code}: ${cleanReason})`
    : `WebSocket closed (code ${code}: ${hint})`;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function floatTo16BitPCMBase64(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64PCMToFloat32(base64: string): Float32Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const floats = new Float32Array(new ArrayBuffer(sampleCount * 4));
  for (let i = 0; i < sampleCount; i++) {
    floats[i] = view.getInt16(i * 2, true) / 32768;
  }
  return floats;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to encode recorded audio chunk.'));
    reader.readAsDataURL(blob);
  });
}

export function useGwenLive({
  settings,
  deviceState,
  activePersona,
  memories,
  identityCore,
  weather,
  careState,
  sessionState,
  recentTurns,
  googleAccountEmail,
  activeKidStudy,
  allKidNames,
  onInputTranscript,
  onOutputTranscript,
  onToolCall,
  onEmpathySignal,
  onApiKeyError,
  onFallbackSpeechTurn,
  onVoiceNotice,
}: UseGwenLiveOptions) {
  const googleEmailRef = useRef(googleAccountEmail);
  googleEmailRef.current = googleAccountEmail;
  const activeKidRef = useRef(activeKidStudy);
  activeKidRef.current = activeKidStudy;
  const allKidNamesRef = useRef(allKidNames);
  allKidNamesRef.current = allKidNames;

  const [gwenState, setGwenState] = useState<GwenState>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [voiceTransportMode, setVoiceTransportMode] = useState<VoiceTransportMode>('live');
  const [activeLiveModel, setActiveLiveModel] = useState<string | null>(null);
  const [liveDiagnostics, setLiveDiagnostics] = useState<string | null>(null);
  const [isMicTesting, setIsMicTesting] = useState(false);
  const [micTestTranscript, setMicTestTranscript] = useState('');
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isPttPressed, setIsPttPressed] = useState(false);

  // Screen Share state
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenPreviewUrl, setScreenPreviewUrl] = useState<string | null>(null);
  const [uploadedScreenImage, setUploadedScreenImage] = useState<string | null>(null);

  // Live Camera Vision state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraPreviewUrl, setCameraPreviewUrl] = useState<string | null>(null);
  const [faceRecognized, setFaceRecognized] = useState(false);
  const [voiceRecognized, setVoiceRecognized] = useState(false);

  // Proactive Multimodal Empathy live readout
  const [latestEmpathySignal, setLatestEmpathySignal] = useState<EmpathySignal | null>(null);

  // Wake Lock state (Background / Lock-Screen Active Mode)
  const [wakeLockActive, setWakeLockActive] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [liveDraftInput, setLiveDraftInput] = useState('');
  const [liveDraftOutput, setLiveDraftOutput] = useState('');

  const liveSessionRef = useRef<Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null>(null);
  const liveSessionOpenRef = useRef<boolean>(false);
  const userInitiatedStopRef = useRef<boolean>(false);
  const receivedServerErrorRef = useRef<boolean>(false);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const workletSinkRef = useRef<GainNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);

  // Standard Voice Fallback Mode refs
  const fallbackActiveRef = useRef<boolean>(false);
  const fallbackBusyRef = useRef<boolean>(false);
  const isMicTestingRef = useRef<boolean>(false);
  const micTestTimeoutRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionRestartTimerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const fallbackMeterRafRef = useRef<number | null>(null);
  const lipSyncRafRef = useRef<number | null>(null);
  const lipSyncPulseRef = useRef<number>(0);
  const fallbackTtsAudioRef = useRef<HTMLAudioElement | null>(null);

  // Screen capture refs
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenIntervalRef = useRef<number | null>(null);
  const latestScreenFrameRef = useRef<string | null>(null);

  // Camera vision refs
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraIntervalRef = useRef<number | null>(null);
  const latestCameraFrameRef = useRef<string | null>(null);

  // Proactive Empathy cooldown & acoustic burst tracking refs
  const lastAudioEmpathyAtRef = useRef<number>(0);
  const lastCameraEmpathyAtRef = useRef<number>(0);
  const prevRmsRef = useRef<number>(0);
  const coughBurstCountRef = useRef<number>(0);
  const lastBurstAtRef = useRef<number>(0);

  // Wake lock ref
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const draftInputRef = useRef('');
  const draftOutputRef = useRef('');

  // Mutable refs to prevent stale closures in audio/ws callbacks
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const deviceStateRef = useRef(deviceState);
  deviceStateRef.current = deviceState;
  const identityCoreRef = useRef(identityCore);
  identityCoreRef.current = identityCore;
  const weatherRef = useRef(weather);
  weatherRef.current = weather;
  const careStateRef = useRef(careState);
  careStateRef.current = careState;
  const sessionStateRef = useRef(sessionState);
  sessionStateRef.current = sessionState;
  const recentTurnsRef = useRef(recentTurns);
  recentTurnsRef.current = recentTurns;
  const isMicMutedRef = useRef(isMicMuted);
  isMicMutedRef.current = isMicMuted;
  const isPttPressedRef = useRef(isPttPressed);
  isPttPressedRef.current = isPttPressed;
  const isScreenSharingRef = useRef(isScreenSharing);
  isScreenSharingRef.current = isScreenSharing;
  const isCameraActiveRef = useRef(isCameraActive);
  isCameraActiveRef.current = isCameraActive;
  const faceRecognizedRef = useRef(faceRecognized);
  faceRecognizedRef.current = faceRecognized;
  const voiceRecognizedRef = useRef(voiceRecognized);
  voiceRecognizedRef.current = voiceRecognized;

  const callbacksRef = useRef({
    onInputTranscript,
    onOutputTranscript,
    onToolCall,
    onEmpathySignal,
    onApiKeyError,
    onFallbackSpeechTurn,
    onVoiceNotice,
  });
  callbacksRef.current = {
    onInputTranscript,
    onOutputTranscript,
    onToolCall,
    onEmpathySignal,
    onApiKeyError,
    onFallbackSpeechTurn,
    onVoiceNotice,
  };

  // Sync real output GainNode with deviceState.mediaVolume
  useEffect(() => {
    if (outputGainRef.current && outputCtxRef.current) {
      const targetGain = Math.max(0, Math.min(1, deviceState.mediaVolume / 100));
      outputGainRef.current.gain.setTargetAtTime(
        targetGain,
        outputCtxRef.current.currentTime,
        0.04
      );
    }
  }, [deviceState.mediaVolume]);

  // Wake Lock management for Always-Active Background & Lock-Screen Mode
  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // Ignore already released
      }
      wakeLockRef.current = null;
    }
    setWakeLockActive(false);
  }, []);

  const acquireWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
      };
      if (nav.wakeLock?.request) {
        const sentinel = await nav.wakeLock.request('screen');
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
      }
    } catch {
      setWakeLockActive(false);
    }
  }, []);

  useEffect(() => {
    if (settings.keepActiveInBackground && gwenState !== 'dormant') {
      void acquireWakeLock();
    } else {
      void releaseWakeLock();
    }
  }, [settings.keepActiveInBackground, gwenState, acquireWakeLock, releaseWakeLock]);

  // Proactive Camera Vision Empathy Loop
  useEffect(() => {
    if (!isCameraActive || !settings.proactiveEmpathyEnabled || gwenState === 'dormant') {
      return;
    }

    const interval = window.setInterval(async () => {
      const frame = latestCameraFrameRef.current;
      if (!frame) return;
      if (Date.now() - lastCameraEmpathyAtRef.current < 26000) return;

      try {
        const data = await checkGwenEmpathyCue(
          frame,
          settingsRef.current.deviceUserName ||
            identityCoreRef.current.nickname ||
            identityCoreRef.current.displayName
        );
        if (!data?.condition) return;

        const signal: EmpathySignal = {
          source: 'camera',
          condition: data.condition,
          confidence: Number(data.confidence ?? 0.5),
          summary: data.summary || `Observed ${data.condition}`,
          suggestedResponse: data.suggestedResponse || '',
          detectedAt: new Date().toISOString(),
        };
        setLatestEmpathySignal(signal);

        const isDistressed =
          signal.condition === 'tired' ||
          signal.condition === 'sad' ||
          signal.condition === 'stressed' ||
          signal.condition === 'cough';

        if (isDistressed && signal.confidence >= 0.72) {
          lastCameraEmpathyAtRef.current = Date.now();
          callbacksRef.current.onEmpathySignal?.(signal);
        }
      } catch {
        // Silent background check
      }
    }, 24000);

    return () => window.clearInterval(interval);
  }, [isCameraActive, settings.proactiveEmpathyEnabled, gwenState]);

  const stopLipSyncLoop = useCallback(() => {
    if (lipSyncRafRef.current) {
      window.cancelAnimationFrame(lipSyncRafRef.current);
      lipSyncRafRef.current = null;
    }
    lipSyncPulseRef.current = 0;
  }, []);

  const stopPlaybackQueue = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already stopped source
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
    if (fallbackTtsAudioRef.current) {
      try {
        fallbackTtsAudioRef.current.pause();
        fallbackTtsAudioRef.current = null;
      } catch {
        // Ignore
      }
    }
    stopLipSyncLoop();
  }, [stopLipSyncLoop]);

  const schedulePcmPlayback = useCallback((base64Pcm: string) => {
    if (!outputCtxRef.current) {
      outputCtxRef.current = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = outputCtxRef.current;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    if (!outputGainRef.current) {
      const gain = ctx.createGain();
      gain.gain.value = Math.max(0, Math.min(1, deviceStateRef.current.mediaVolume / 100));
      gain.connect(ctx.destination);
      outputGainRef.current = gain;
    }

    const floats = base64PCMToFloat32(base64Pcm);
    if (floats.length === 0) return;

    let sum = 0;
    for (let i = 0; i < floats.length; i += 4) {
      sum += floats[i] * floats[i];
    }
    const rms = Math.sqrt(sum / (floats.length / 4));
    setAudioLevel(Math.min(1, rms * 4.2));
    setGwenState('speaking');

    const audioBuffer = ctx.createBuffer(1, floats.length, 24000);
    audioBuffer.copyToChannel(floats, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = settingsRef.current.speakingRate || 1.0;
    source.connect(outputGainRef.current);

    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.015, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + audioBuffer.duration / source.playbackRate.value;

    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0 && liveSessionOpenRef.current) {
        setGwenState('listening');
        setAudioLevel(0.04);
      }
    };
  }, []);

  const flushDraftTranscripts = useCallback(() => {
    if (draftInputRef.current.trim()) {
      callbacksRef.current.onInputTranscript(draftInputRef.current.trim());
      draftInputRef.current = '';
      setLiveDraftInput('');
    }
    if (draftOutputRef.current.trim()) {
      callbacksRef.current.onOutputTranscript(draftOutputRef.current.trim());
      draftOutputRef.current = '';
      setLiveDraftOutput('');
    }
  }, []);

  const teardownLiveAudioGraph = useCallback(() => {
    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.port.onmessage = null;
        workletNodeRef.current.disconnect();
      } catch {
        // Ignore
      }
      workletNodeRef.current = null;
    }
    if (workletSinkRef.current) {
      try {
        workletSinkRef.current.disconnect();
      } catch {
        // Ignore
      }
      workletSinkRef.current = null;
    }
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
      } catch {
        // Ignore
      }
      processorRef.current = null;
    }
    if (micAnalyserRef.current) {
      try {
        micAnalyserRef.current.disconnect();
      } catch {
        // Ignore
      }
      micAnalyserRef.current = null;
    }
    if (inputCtxRef.current) {
      void inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
  }, []);

  const teardownStandardFallback = useCallback(() => {
    fallbackActiveRef.current = false;
    fallbackBusyRef.current = false;
    isMicTestingRef.current = false;
    setIsMicTesting(false);
    setMicTestTranscript('');
    if (micTestTimeoutRef.current) {
      window.clearTimeout(micTestTimeoutRef.current);
      micTestTimeoutRef.current = null;
    }
    if (recognitionRestartTimerRef.current) {
      window.clearTimeout(recognitionRestartTimerRef.current);
      recognitionRestartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // Ignore
      }
      mediaRecorderRef.current = null;
    }
    recorderChunksRef.current = [];
    if (fallbackMeterRafRef.current) {
      window.cancelAnimationFrame(fallbackMeterRafRef.current);
      fallbackMeterRafRef.current = null;
    }
    stopLipSyncLoop();
  }, [stopLipSyncLoop]);

  const stopSession = useCallback(
    (targetState: GwenState = 'idle') => {
      userInitiatedStopRef.current = true;
      flushDraftTranscripts();
      stopPlaybackQueue();
      teardownStandardFallback();
      teardownLiveAudioGraph();

      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (liveSessionRef.current) {
        liveSessionOpenRef.current = false;
        try {
          liveSessionRef.current.close();
        } catch {
          // Ignore close errors
        }
        liveSessionRef.current = null;
      }

      setIsConnected(false);
      setVoiceTransportMode('live');
      setActiveLiveModel(null);
      setGwenState(targetState);
      setAudioLevel(0);
    },
    [flushDraftTranscripts, stopPlaybackQueue, teardownLiveAudioGraph, teardownStandardFallback]
  );

  // Speak reply in Standard Voice Fallback Mode with real-time 3D avatar lip-sync
  const speakFallbackWithLipSync = useCallback(
    async (text: string): Promise<void> => {
      const cleaned = text.trim();
      if (!cleaned) return;

      const startSyntheticLipSync = () => {
        stopLipSyncLoop();
        const startedAt = performance.now();
        const tick = (now: number) => {
          const t = (now - startedAt) / 1000;
          lipSyncPulseRef.current *= 0.86;
          const baseCadence =
            0.26 +
            Math.abs(Math.sin(t * 11.5)) * 0.28 +
            Math.abs(Math.sin(t * 23.0 + 0.7)) * 0.16;
          setAudioLevel(Math.min(0.95, Math.max(0.08, baseCadence + lipSyncPulseRef.current)));
          lipSyncRafRef.current = window.requestAnimationFrame(tick);
        };
        lipSyncRafRef.current = window.requestAnimationFrame(tick);
      };

      // Primary: Instant browser SpeechSynthesis + boundary-driven 3D lip-sync
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          await new Promise<void>((resolve) => {
            const utterance = new SpeechSynthesisUtterance(cleaned);
            const langMode = settingsRef.current.languageMode;
            utterance.lang = langMode === 'hi' ? 'hi-IN' : 'en-IN';
            utterance.rate = Math.max(0.75, Math.min(1.4, settingsRef.current.speakingRate || 1.0));
            utterance.volume = Math.max(0, Math.min(1, deviceStateRef.current.mediaVolume / 100));

            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
              const targetLang = langMode === 'hi' ? 'hi' : 'en';
              const preferred =
                voices.find(
                  (v) =>
                    v.lang.toLowerCase().startsWith(targetLang) &&
                    /google|natural|neural|samantha|aria|female|zira/i.test(v.name)
                ) || voices.find((v) => v.lang.toLowerCase().startsWith(targetLang));
              if (preferred) utterance.voice = preferred;
            }

            let finished = false;
            const done = () => {
              if (finished) return;
              finished = true;
              stopLipSyncLoop();
              setAudioLevel(0.04);
              resolve();
            };

            utterance.onstart = () => {
              setGwenState('speaking');
              startSyntheticLipSync();
            };
            utterance.onboundary = () => {
              lipSyncPulseRef.current = 0.34;
            };
            utterance.onend = done;
            utterance.onerror = done;

            setGwenState('speaking');
            startSyntheticLipSync();
            window.speechSynthesis.speak(utterance);

            // Safety timeout in case a mobile browser drops onend
            const maxMs = Math.max(8000, Math.min(45000, cleaned.length * 115));
            window.setTimeout(done, maxMs);
          });
          return;
        } catch {
          stopLipSyncLoop();
        }
      }

      // Secondary: Direct Browser Gemini TTS WAV if speechSynthesis is unavailable
      try {
        const data = await generateGwenTts({
          text: cleaned,
          voiceName: settingsRef.current.voiceName,
          style: 'Warm, expressive natural voice',
        });
        if (!data.audioBase64) return;
        await new Promise<void>((resolve) => {
          const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
          audio.playbackRate = settingsRef.current.speakingRate || 1.0;
          audio.volume = Math.max(0, Math.min(1, deviceStateRef.current.mediaVolume / 100));
          fallbackTtsAudioRef.current = audio;
          setGwenState('speaking');
          startSyntheticLipSync();
          const finish = () => {
            stopLipSyncLoop();
            fallbackTtsAudioRef.current = null;
            setAudioLevel(0.04);
            resolve();
          };
          audio.onended = finish;
          audio.onerror = finish;
          void audio.play().catch(finish);
        });
      } catch {
        stopLipSyncLoop();
      }
    },
    [stopLipSyncLoop]
  );

  // Automatic Standard Voice Fallback Mode: SpeechRecognition (or MediaRecorder -> direct Gemini transcribe) -> generateContent -> speechSynthesis + 3D lip-sync
  const activateStandardVoiceFallback = useCallback(
    async (liveFailureReason: string, closeCode?: number) => {
      if (userInitiatedStopRef.current) return;

      // Close broken Live session cleanly without killing the mic stream
      liveSessionOpenRef.current = false;
      if (liveSessionRef.current) {
        try {
          liveSessionRef.current.close();
        } catch {
          // Ignore
        }
        liveSessionRef.current = null;
      }
      teardownLiveAudioGraph();
      teardownStandardFallback();

      fallbackActiveRef.current = true;
      setVoiceTransportMode('standard-fallback');
      setActiveLiveModel('Standard Voice Mode');
      setLiveDiagnostics(liveFailureReason);
      setIsConnected(true);
      setGwenState('listening');

      // On code 1006 (proxy/host blocked), keep the UI calm: no red error banner, only the green/teal Standard Voice Mode bar
      const isProxyBlocked1006 =
        closeCode === 1006 || /\bcode\s*1006\b/i.test(liveFailureReason);
      if (isProxyBlocked1006) {
        setError(null);
      } else {
        const notice = `${liveFailureReason} — Switched automatically to Standard Voice Mode.`;
        setError(notice);
        callbacksRef.current.onVoiceNotice?.(notice);
      }

      // Ensure microphone stream is active for visual meter + MediaRecorder fallback
      if (!micStreamRef.current) {
        try {
          micStreamRef.current = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } catch (micErr) {
          const micDetail =
            micErr instanceof Error
              ? `Microphone error (${micErr.name}): ${micErr.message}`
              : 'Microphone access failed.';
          setError(micDetail);
          callbacksRef.current.onVoiceNotice?.(micDetail);
          stopSession('error');
          return;
        }
      }

      // Live mic audio meter for 3D orb/avatar responsiveness while user speaks
      try {
        const meterCtx = new AudioContext();
        inputCtxRef.current = meterCtx;
        if (meterCtx.state === 'suspended') {
          await meterCtx.resume();
        }
        const source = meterCtx.createMediaStreamSource(micStreamRef.current);
        const analyser = meterCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        micAnalyserRef.current = analyser;
        const timeData = new Uint8Array(analyser.fftSize);

        const meterLoop = () => {
          if (!fallbackActiveRef.current) return;
          if (!fallbackBusyRef.current && !isMicMutedRef.current && micAnalyserRef.current) {
            const mode = settingsRef.current.voiceInputMode;
            const active = mode === 'hands-free' || isPttPressedRef.current;
            if (active) {
              micAnalyserRef.current.getByteTimeDomainData(timeData);
              let sum = 0;
              for (let i = 0; i < timeData.length; i += 2) {
                const v = (timeData[i] - 128) / 128;
                sum += v * v;
              }
              const rms = Math.sqrt(sum / (timeData.length / 2));
              setAudioLevel(Math.min(1, rms * 4.5));
            } else {
              setAudioLevel(0);
            }
          }
          fallbackMeterRafRef.current = window.requestAnimationFrame(meterLoop);
        };
        fallbackMeterRafRef.current = window.requestAnimationFrame(meterLoop);
      } catch {
        // Non-fatal if AudioContext meter fails
      }

      const processSpokenTurn = async (spokenText: string) => {
        const trimmed = spokenText.trim();
        if (!trimmed || !fallbackActiveRef.current || fallbackBusyRef.current) return;

        fallbackBusyRef.current = true;
        setLiveDraftInput('');
        setGwenState('thinking');
        setAudioLevel(0.08);

        // Pause recognition while thinking & speaking so Gwen doesn't hear herself
        try {
          recognitionRef.current?.stop();
        } catch {
          // Ignore
        }

        try {
          const reply = await callbacksRef.current.onFallbackSpeechTurn?.(trimmed);
          if (reply && fallbackActiveRef.current) {
            await speakFallbackWithLipSync(reply);
          }
        } catch (turnErr) {
          const msg =
            turnErr instanceof Error ? turnErr.message : 'Standard Voice turn failed.';
          setError(msg);
          callbacksRef.current.onVoiceNotice?.(msg);
        } finally {
          fallbackBusyRef.current = false;
          if (fallbackActiveRef.current) {
            setGwenState('listening');
            setAudioLevel(0.04);
            scheduleRecognitionStart();
          }
        }
      };

      const SpeechRecCtor = getSpeechRecognitionCtor();

      const scheduleRecognitionStart = () => {
        if (!fallbackActiveRef.current || fallbackBusyRef.current) return;
        if (recognitionRestartTimerRef.current) {
          window.clearTimeout(recognitionRestartTimerRef.current);
        }
        recognitionRestartTimerRef.current = window.setTimeout(() => {
          if (!fallbackActiveRef.current || fallbackBusyRef.current) return;
          if (isMicMutedRef.current) {
            scheduleRecognitionStart();
            return;
          }
          if (
            settingsRef.current.voiceInputMode === 'push-to-talk' &&
            !isPttPressedRef.current
          ) {
            scheduleRecognitionStart();
            return;
          }
          if (SpeechRecCtor) {
            startSpeechRecognitionCycle();
          } else {
            startMediaRecorderCycle();
          }
        }, 260);
      };

      const startSpeechRecognitionCycle = () => {
        if (!SpeechRecCtor || !fallbackActiveRef.current || fallbackBusyRef.current) return;
        try {
          const rec = new SpeechRecCtor();
          rec.lang = settingsRef.current.languageMode === 'hi' ? 'hi-IN' : 'en-IN';
          rec.continuous = false;
          rec.interimResults = true;
          rec.maxAlternatives = 1;
          recognitionRef.current = rec;

          let finalTranscript = '';

          rec.onresult = (event) => {
            if (!fallbackActiveRef.current || isMicMutedRef.current) return;
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const res = event.results[i];
              const chunk = res[0]?.transcript || '';
              if (res.isFinal) {
                finalTranscript += chunk;
              } else {
                interim += chunk;
              }
            }
            const combined = (finalTranscript + interim).trim();
            if (isMicTestingRef.current) {
              if (combined) {
                setMicTestTranscript(combined);
                setLiveDraftInput(combined);
              }
              return;
            }
            if (combined) setLiveDraftInput(combined);
            if (finalTranscript.trim()) {
              const toSend = finalTranscript.trim();
              finalTranscript = '';
              void processSpokenTurn(toSend);
            }
          };

          rec.onerror = (ev) => {
            if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
              const detail = `SpeechRecognition error (${ev.error}): Microphone speech recognition was blocked.`;
              setError(detail);
              callbacksRef.current.onVoiceNotice?.(detail);
              stopSession('error');
              return;
            }
            // 'no-speech' / 'aborted' / 'network' -> seamlessly retry or fall back to MediaRecorder
            if (ev.error === 'network' && fallbackActiveRef.current && !fallbackBusyRef.current) {
              startMediaRecorderCycle();
            }
          };

          rec.onend = () => {
            if (fallbackActiveRef.current && !fallbackBusyRef.current) {
              scheduleRecognitionStart();
            }
          };

          rec.start();
        } catch {
          startMediaRecorderCycle();
        }
      };

      // Secondary capture when browser lacks Web SpeechRecognition: MediaRecorder + silence VAD -> direct browser Gemini transcribe
      const startMediaRecorderCycle = () => {
        if (
          !fallbackActiveRef.current ||
          fallbackBusyRef.current ||
          !micStreamRef.current ||
          typeof MediaRecorder === 'undefined'
        ) {
          return;
        }
        try {
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/webm')
              ? 'audio/webm'
              : 'audio/mp4';
          const recorder = new MediaRecorder(micStreamRef.current, { mimeType });
          mediaRecorderRef.current = recorder;
          recorderChunksRef.current = [];

          let heardSpeech = false;
          let lastSpeechAt = Date.now();
          const startedAt = Date.now();

          recorder.ondataavailable = (evt) => {
            if (evt.data && evt.data.size > 0) {
              recorderChunksRef.current.push(evt.data);
            }
          };

          recorder.onstop = async () => {
            const chunks = recorderChunksRef.current;
            recorderChunksRef.current = [];
            if (!fallbackActiveRef.current) return;
            if (!heardSpeech || chunks.length === 0) {
              scheduleRecognitionStart();
              return;
            }
            try {
              setLiveDraftInput('Transcribing speech...');
              const audioBlob = new Blob(chunks, { type: mimeType });
              const base64 = await blobToBase64(audioBlob);
              const data = await transcribeGwenAudio({
                audioBase64: base64,
                mimeType: mimeType.split(';')[0],
                languageHint: settingsRef.current.languageMode,
              });
              const spoken = (data.transcript || '').trim();
              if (isMicTestingRef.current) {
                if (spoken) {
                  setMicTestTranscript(spoken);
                  setLiveDraftInput(spoken);
                }
                scheduleRecognitionStart();
                return;
              }
              if (spoken) {
                await processSpokenTurn(spoken);
              } else {
                setLiveDraftInput('');
                scheduleRecognitionStart();
              }
            } catch (err) {
              if (
                err instanceof GwenClientApiError &&
                (err.errorCode === 'INVALID_KEY' || err.errorCode === 'QUOTA_EXCEEDED')
              ) {
                callbacksRef.current.onApiKeyError?.(err.errorCode, err.message);
              }
              setLiveDraftInput('');
              scheduleRecognitionStart();
            }
          };

          recorder.start(250);

          const vadTimer = window.setInterval(() => {
            if (!fallbackActiveRef.current || recorder.state !== 'recording') {
              window.clearInterval(vadTimer);
              return;
            }
            let rms = 0;
            if (micAnalyserRef.current) {
              const buf = new Uint8Array(micAnalyserRef.current.fftSize);
              micAnalyserRef.current.getByteTimeDomainData(buf);
              let sum = 0;
              for (let i = 0; i < buf.length; i += 2) {
                const v = (buf[i] - 128) / 128;
                sum += v * v;
              }
              rms = Math.sqrt(sum / (buf.length / 2));
            }
            if (rms > 0.04 && !isMicMutedRef.current) {
              heardSpeech = true;
              lastSpeechAt = Date.now();
              setLiveDraftInput('Listening...');
            }
            const elapsed = Date.now() - startedAt;
            const silenceMs = Date.now() - lastSpeechAt;
            if ((heardSpeech && silenceMs > 1350) || elapsed > 9500) {
              window.clearInterval(vadTimer);
              try {
                recorder.stop();
              } catch {
                // Ignore
              }
            }
          }, 150);
        } catch {
          // MediaRecorder unavailable
        }
      };

      scheduleRecognitionStart();
    },
    [speakFallbackWithLipSync, stopSession, teardownLiveAudioGraph, teardownStandardFallback]
  );

  // Quick interactive Mic Test in Standard Voice Mode to verify live speech-to-text immediately
  const toggleMicTest = useCallback(() => {
    if (!fallbackActiveRef.current) return;
    if (isMicTestingRef.current) {
      isMicTestingRef.current = false;
      setIsMicTesting(false);
      setLiveDraftInput('');
      if (micTestTimeoutRef.current) {
        window.clearTimeout(micTestTimeoutRef.current);
        micTestTimeoutRef.current = null;
      }
      return;
    }

    stopPlaybackQueue();
    isMicTestingRef.current = true;
    setIsMicTesting(true);
    setMicTestTranscript('');
    setLiveDraftInput('');
    setGwenState('listening');

    // Auto-finish Mic Test after 12 seconds and seamlessly return to normal Gwen voice turns
    if (micTestTimeoutRef.current) {
      window.clearTimeout(micTestTimeoutRef.current);
    }
    micTestTimeoutRef.current = window.setTimeout(() => {
      isMicTestingRef.current = false;
      setIsMicTesting(false);
      setLiveDraftInput('');
      micTestTimeoutRef.current = null;
    }, 12000);
  }, [stopPlaybackQueue]);

  // Shared PCM chunk handler for both Inline Blob AudioWorklet and ScriptProcessor fallback
  const handleMicPcmChunk = useCallback((channelData: Float32Array) => {
    if (!liveSessionRef.current || !liveSessionOpenRef.current) return;
    const mode = settingsRef.current.voiceInputMode;
    const shouldTransmit =
      !isMicMutedRef.current && (mode === 'hands-free' || isPttPressedRef.current);

    if (!shouldTransmit) {
      if (activeSourcesRef.current.size === 0) {
        setAudioLevel(0);
      }
      return;
    }

    let sum = 0;
    for (let i = 0; i < channelData.length; i += 4) {
      sum += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sum / Math.max(1, channelData.length / 4));
    if (activeSourcesRef.current.size === 0) {
      setAudioLevel(Math.min(1, rms * 5.2));
    }

    if (micAnalyserRef.current) {
      const freqData = new Float32Array(micAnalyserRef.current.frequencyBinCount);
      micAnalyserRef.current.getFloatFrequencyData(freqData);

      // Local Voiceprint check
      const enrolledVec = identityCoreRef.current.voiceprint?.spectralVector;
      if (enrolledVec && enrolledVec.length > 0 && rms > 0.035) {
        const liveVec = computeSpectralSignature(freqData, enrolledVec.length);
        const sim = cosineSimilarity(liveVec, enrolledVec);
        if (sim >= 0.86) {
          setVoiceRecognized(true);
        }
      }

      // Real-time Acoustic Cough Burst Detector
      if (settingsRef.current.proactiveEmpathyEnabled && activeSourcesRef.current.size === 0) {
        const nowMs = Date.now();
        const delta = rms - prevRmsRef.current;
        let highBandEnergy = 0;
        const half = Math.floor(freqData.length / 2);
        for (let k = Math.floor(half * 0.45); k < half; k++) {
          highBandEnergy += Math.max(0, freqData[k] + 95);
        }
        const avgHigh = highBandEnergy / Math.max(1, half * 0.55);

        if (rms > 0.22 && delta > 0.14 && avgHigh > 24) {
          if (nowMs - lastBurstAtRef.current < 2600) {
            coughBurstCountRef.current += 1;
          } else {
            coughBurstCountRef.current = 1;
          }
          lastBurstAtRef.current = nowMs;

          if (
            coughBurstCountRef.current >= 2 &&
            nowMs - lastAudioEmpathyAtRef.current > 45000
          ) {
            coughBurstCountRef.current = 0;
            lastAudioEmpathyAtRef.current = nowMs;
            const who = settingsRef.current.deviceUserName || 'there';
            const coughSignal: EmpathySignal = {
              source: 'audio',
              condition: 'cough',
              confidence: 0.84,
              summary: 'Detected coughing acoustic pattern on microphone',
              suggestedResponse: `Hey ${who}, I heard you coughing — are you feeling okay? Should I remind you to drink some warm water or take a quick rest?`,
              detectedAt: new Date().toISOString(),
            };
            setLatestEmpathySignal(coughSignal);
            callbacksRef.current.onEmpathySignal?.(coughSignal);
          }
        }
        prevRmsRef.current = rms;
      }
    }

    const base64 = floatTo16BitPCMBase64(channelData);
    try {
      liveSessionRef.current.sendRealtimeInput({
        audio: { data: base64, mimeType: 'audio/pcm;rate=16000' },
      });
    } catch {
      // Ignore send race during teardown
    }
  }, []);

  const attachMicPipeline = useCallback(
    async (inputCtx: AudioContext, micStream: MediaStream) => {
      const source = inputCtx.createMediaStreamSource(micStream);
      const analyser = inputCtx.createAnalyser();
      analyser.fftSize = 256;
      micAnalyserRef.current = analyser;
      source.connect(analyser);

      // Prefer inline Blob URL AudioWorkletNode (zero external file path -> never 404s when hosted)
      if (inputCtx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        let blobUrl: string | null = null;
        try {
          const blob = new Blob([PCM_CAPTURE_WORKLET_CODE], {
            type: 'application/javascript',
          });
          blobUrl = URL.createObjectURL(blob);
          await inputCtx.audioWorklet.addModule(blobUrl);
          URL.revokeObjectURL(blobUrl);
          blobUrl = null;

          const workletNode = new AudioWorkletNode(inputCtx, 'gwen-pcm-capture', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            channelCount: 1,
          });
          workletNode.port.onmessage = (evt: MessageEvent<Float32Array>) => {
            if (evt.data instanceof Float32Array) {
              handleMicPcmChunk(evt.data);
            }
          };

          // Silent zero-gain sink keeps graph active without audible mic feedback
          const silentSink = inputCtx.createGain();
          silentSink.gain.value = 0;
          analyser.connect(workletNode);
          workletNode.connect(silentSink);
          silentSink.connect(inputCtx.destination);

          workletNodeRef.current = workletNode;
          workletSinkRef.current = silentSink;
          return;
        } catch {
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          // Fall through cleanly to ScriptProcessorNode below
        }
      }

      // Legacy fallback only for browsers without AudioWorklet
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (audioEvt) => {
        handleMicPcmChunk(audioEvt.inputBuffer.getChannelData(0));
      };
      analyser.connect(processor);
      processor.connect(inputCtx.destination);
    },
    [handleMicPcmChunk]
  );

  const startSession = useCallback(async () => {
    // Cleanly reset any previous fallback or live state
    teardownStandardFallback();
    teardownLiveAudioGraph();
    userInitiatedStopRef.current = false;
    receivedServerErrorRef.current = false;
    setError(null);
    setLiveDiagnostics(null);
    setVoiceTransportMode('live');
    setGwenState('connecting');

    // Read & trim the latest personal Gemini API key dynamically from localStorage / Settings
    const latestApiKey = (getActiveGeminiApiKey() ?? '').trim();
    if (!latestApiKey) {
      const msg =
        'No Gemini API key configured. Open Settings → Gemini API Key to add your personal Google AI Studio key.';
      setError(msg);
      setLiveDiagnostics(msg);
      callbacksRef.current.onApiKeyError?.('INVALID_KEY', msg);
      callbacksRef.current.onVoiceNotice?.(msg);
      setGwenState('error');
      return;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        const msg =
          'Microphone error (UnsupportedContext): navigator.mediaDevices.getUserMedia is unavailable in this browser/origin (HTTPS required).';
        setError(msg);
        setLiveDiagnostics(msg);
        callbacksRef.current.onVoiceNotice?.(msg);
        setGwenState('error');
        return;
      }

      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = micStream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      inputCtxRef.current = inputCtx;
      if (inputCtx.state === 'suspended') {
        await inputCtx.resume();
      }

      if (!outputCtxRef.current) {
        outputCtxRef.current = new AudioContext({ sampleRate: 24000 });
      }
      if (outputCtxRef.current.state === 'suspended') {
        await outputCtxRef.current.resume();
      }
      nextStartTimeRef.current = outputCtxRef.current.currentTime;

      // Direct browser connection to Google Gemini Live WSS using the user's trimmed personal API key
      const ai = new GoogleGenAI({
        apiKey: latestApiKey,
        apiVersion: 'v1beta',
      });

      const voiceName: VoiceName =
        settingsRef.current.voiceName && ALLOWED_VOICES.has(settingsRef.current.voiceName)
          ? settingsRef.current.voiceName
          : 'Zephyr';

      const systemInstruction = buildGwenSystemInstruction({
        persona: activePersona,
        languageMode: settingsRef.current.languageMode,
        memories: settingsRef.current.incognitoMode ? [] : memories,
        identityCore: settingsRef.current.incognitoMode
          ? undefined
          : identityCoreRef.current,
        deviceUserName: settingsRef.current.deviceUserName,
        timezone: settingsRef.current.timezone,
        weather: weatherRef.current,
        careState: careStateRef.current,
        sessionState: settingsRef.current.incognitoMode ? null : sessionStateRef.current,
        recentTurns: settingsRef.current.incognitoMode
          ? []
          : recentTurnsRef.current.slice(-10),
        googleAccountEmail: googleEmailRef.current || null,
        activeKidStudy: activeKidRef.current || null,
        allKidNames: allKidNamesRef.current || [],
        proactiveEmpathyEnabled: settingsRef.current.proactiveEmpathyEnabled,
        incognitoMode: settingsRef.current.incognitoMode,
        isLiveVoice: true,
        hasScreenShare:
          isScreenSharingRef.current || Boolean(latestScreenFrameRef.current),
        hasCameraVision: isCameraActiveRef.current,
        faceRecognized: faceRecognizedRef.current,
        voiceRecognized: voiceRecognizedRef.current,
      });

      const candidateModels = await discoverBidiModels(latestApiKey);
      const primaryLiveModel = candidateModels[0] || 'gemini-3.8-live';

      interface LiveAttemptSpec {
        model: string;
        label: string;
        toolsEnabled: boolean;
        config: Record<string, unknown>;
      }

      const attempts: LiveAttemptSpec[] = [
        {
          model: primaryLiveModel,
          label: 'full',
          toolsEnabled: true,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
            systemInstruction,
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            tools: [{ functionDeclarations: LIVE_FUNCTION_DECLARATIONS }],
          },
        },
        {
          model: primaryLiveModel,
          label: 'minimal-no-tools',
          toolsEnabled: false,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
            systemInstruction,
          },
        },
        ...candidateModels.slice(1, 4).map((altModel) => ({
          model: altModel,
          label: 'fallback-model-minimal',
          toolsEnabled: false,
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
            systemInstruction,
          },
        })),
      ];

      const tryConnectAttempt = (
        spec: LiveAttemptSpec
      ): Promise<{
        session: Awaited<ReturnType<GoogleGenAI['live']['connect']>>;
        model: string;
        toolsEnabled: boolean;
      }> => {
        return new Promise((resolve, reject) => {
          let settled = false;
          let handshakeTimer: number | null = null;
          let sessionRef: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;

          const finishReady = () => {
            if (settled || !sessionRef) return;
            settled = true;
            if (handshakeTimer) window.clearTimeout(handshakeTimer);
            resolve({
              session: sessionRef,
              model: spec.model,
              toolsEnabled: spec.toolsEnabled,
            });
          };

          const failHandshake = (code: number, reason: string) => {
            if (settled) return;
            settled = true;
            if (handshakeTimer) window.clearTimeout(handshakeTimer);
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
                  handshakeTimer = window.setTimeout(() => {
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
                    stopPlaybackQueue();
                    flushDraftTranscripts();
                    setGwenState('listening');
                  }
                  if (sc?.inputTranscription?.text) {
                    draftInputRef.current += sc.inputTranscription.text;
                    setLiveDraftInput(draftInputRef.current);
                  }
                  if (sc?.outputTranscription?.text) {
                    if (draftInputRef.current.trim()) {
                      callbacksRef.current.onInputTranscript(draftInputRef.current.trim());
                      draftInputRef.current = '';
                      setLiveDraftInput('');
                    }
                    draftOutputRef.current += sc.outputTranscription.text;
                    setLiveDraftOutput(draftOutputRef.current);
                  }
                  for (const part of sc?.modelTurn?.parts ?? []) {
                    if (part.inlineData?.data) {
                      schedulePcmPlayback(part.inlineData.data);
                    }
                  }
                  if (sc?.turnComplete) {
                    flushDraftTranscripts();
                    if (activeSourcesRef.current.size === 0) {
                      setGwenState('listening');
                    }
                  }
                  if (liveMsg.toolCall?.functionCalls?.length) {
                    const calls: LiveToolCall[] = liveMsg.toolCall.functionCalls.map((call) => ({
                      id: call.id || `call-${Date.now()}`,
                      name: call.name || '',
                      args: (call.args ?? {}) as Record<string, unknown>,
                    }));
                    for (const call of calls) {
                      callbacksRef.current.onToolCall(call);
                    }
                    if (liveSessionRef.current && liveSessionOpenRef.current) {
                      try {
                        liveSessionRef.current.sendToolResponse({
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
                      } catch {
                        // Ignore response race
                      }
                    }
                  }
                },
                onerror: (e: unknown) => {
                  const raw = extractRawErrorMessage(e);
                  if (!settled) {
                    failHandshake(1006, raw || 'Direct Gemini Live WebSocket error');
                    return;
                  }
                  if (userInitiatedStopRef.current || fallbackActiveRef.current) return;
                  receivedServerErrorRef.current = true;
                  liveSessionOpenRef.current = false;
                  const friendly = toFriendlyGeminiError(e);
                  const fullErr = `${friendly.message}${raw && !friendly.message.includes(raw) ? ` (${raw})` : ''}`;
                  setLiveDiagnostics(fullErr);
                  if (
                    friendly.errorCode === 'INVALID_KEY' ||
                    friendly.errorCode === 'QUOTA_EXCEEDED'
                  ) {
                    callbacksRef.current.onApiKeyError?.(friendly.errorCode, fullErr);
                  }
                  if (friendly.errorCode === 'INVALID_KEY') {
                    setError(fullErr);
                    callbacksRef.current.onVoiceNotice?.(fullErr);
                    setGwenState('error');
                    setIsConnected(false);
                  } else {
                    void activateStandardVoiceFallback(fullErr, 1006);
                  }
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
                  liveSessionOpenRef.current = false;
                  if (userInitiatedStopRef.current || fallbackActiveRef.current) {
                    return;
                  }
                  if (receivedServerErrorRef.current) {
                    setIsConnected(false);
                    return;
                  }
                  if (code === 1000) {
                    setIsConnected(false);
                    setGwenState((prev) =>
                      prev === 'error' || prev === 'dormant' ? prev : 'idle'
                    );
                    return;
                  }
                  const exactClose = describeWsClose(code, reason);
                  void activateStandardVoiceFallback(exactClose, code);
                },
              },
            })
            .then((sess) => {
              sessionRef = sess;
              if (settled) {
                try {
                  sess.close();
                } catch {
                  // Ignore
                }
              }
            })
            .catch((err) => {
              const raw = extractRawErrorMessage(err);
              failHandshake(1006, raw);
            });
        });
      };

      let connected: {
        session: Awaited<ReturnType<GoogleGenAI['live']['connect']>>;
        model: string;
        toolsEnabled: boolean;
      } | null = null;
      let lastFailure: { code: number; reason: string; model: string; label: string } | null = null;

      for (const spec of attempts) {
        if (userInitiatedStopRef.current) return;
        try {
          connected = await tryConnectAttempt(spec);
          break;
        } catch (err) {
          const fail = err as { code?: number; reason?: string; model?: string; label?: string };
          const code = typeof fail.code === 'number' ? fail.code : 1006;
          const reason = fail.reason || extractRawErrorMessage(err);
          lastFailure = {
            code,
            reason,
            model: fail.model || spec.model,
            label: fail.label || spec.label,
          };
          const friendly = toFriendlyGeminiError(reason);
          if (friendly.errorCode === 'INVALID_KEY') {
            setError(friendly.message);
            setLiveDiagnostics(friendly.message);
            callbacksRef.current.onApiKeyError?.('INVALID_KEY', friendly.message);
            callbacksRef.current.onVoiceNotice?.(friendly.message);
            setGwenState('error');
            setIsConnected(false);
            return;
          }
        }
      }

      if (userInitiatedStopRef.current) {
        connected?.session.close();
        return;
      }

      if (!connected) {
        const finalCode = lastFailure?.code ?? 1006;
        const finalReason = lastFailure?.reason ?? 'Unable to open Gemini Live WebSocket.';
        const exactClose = describeWsClose(finalCode, finalReason);
        void activateStandardVoiceFallback(exactClose, finalCode);
        return;
      }

      liveSessionRef.current = connected.session;
      liveSessionOpenRef.current = true;
      setVoiceTransportMode('live');
      setActiveLiveModel(connected.model);
      setIsConnected(true);
      setGwenState('listening');
      setError(null);
      if (connected.model && connected.toolsEnabled === false) {
        callbacksRef.current.onVoiceNotice?.(
          `Connected Live Voice on ${connected.model} (minimal audio mode).`
        );
      }
      void attachMicPipeline(inputCtx, micStream);
    } catch (err) {
      const errName = err instanceof Error ? err.name : 'UnknownError';
      const errMsg = err instanceof Error ? err.message : String(err);
      const exactMessage =
        errName === 'NotAllowedError' || errName === 'PermissionDeniedError'
          ? `Microphone error (${errName}): ${errMsg || 'Permission denied. Please grant Microphone access in browser settings.'}`
          : errName === 'NotFoundError' || errName === 'DevicesNotFoundError'
            ? `Microphone error (${errName}): No microphone device found (${errMsg}).`
            : `Microphone error (${errName}): ${errMsg || 'Failed to start audio capture.'}`;
      setError(exactMessage);
      setLiveDiagnostics(exactMessage);
      callbacksRef.current.onVoiceNotice?.(exactMessage);
      setGwenState('error');
      stopSession('error');
    }
  }, [
    activateStandardVoiceFallback,
    activePersona,
    attachMicPipeline,
    flushDraftTranscripts,
    memories,
    schedulePcmPlayback,
    stopPlaybackQueue,
    stopSession,
    teardownLiveAudioGraph,
    teardownStandardFallback,
  ]);

  const sendLiveText = useCallback((text: string) => {
    if (liveSessionRef.current && liveSessionOpenRef.current) {
      try {
        liveSessionRef.current.sendClientContent({
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true,
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }, []);

  // Screen Sharing (1 FPS JPEG)
  const stopScreenShare = useCallback(() => {
    if (screenIntervalRef.current) {
      window.clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    screenVideoRef.current = null;
    setIsScreenSharing(false);
    if (!uploadedScreenImage) {
      latestScreenFrameRef.current = null;
      setScreenPreviewUrl(null);
    }
  }, [uploadedScreenImage]);

  const startScreenShare = useCallback(async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        setError(
          'Live screen capture is unavailable in this browser context. You can attach a screenshot instead.'
        );
        return false;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 2, max: 5 } },
        audio: false,
      });

      screenStreamRef.current = stream;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      screenVideoRef.current = video;

      if (!screenCanvasRef.current) {
        screenCanvasRef.current = document.createElement('canvas');
      }

      const captureFrame = () => {
        const vid = screenVideoRef.current;
        const canvas = screenCanvasRef.current;
        if (!vid || !canvas || vid.videoWidth === 0 || vid.videoHeight === 0) return;

        const maxW = 768;
        const scale = Math.min(1, maxW / vid.videoWidth);
        canvas.width = Math.round(vid.videoWidth * scale);
        canvas.height = Math.round(vid.videoHeight * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.68);
        const base64 = dataUrl.split(',')[1];
        latestScreenFrameRef.current = base64;
        setScreenPreviewUrl(dataUrl);

        if (liveSessionRef.current && liveSessionOpenRef.current && base64) {
          try {
            liveSessionRef.current.sendRealtimeInput({
              video: { data: base64, mimeType: 'image/jpeg' },
            });
          } catch {
            // Ignore frame race
          }
        }
      };

      captureFrame();
      screenIntervalRef.current = window.setInterval(captureFrame, 1000);
      setIsScreenSharing(true);
      setUploadedScreenImage(null);

      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        stopScreenShare();
      });

      return true;
    } catch (err) {
      const msg =
        err instanceof Error
          ? `Screen share error (${err.name}): ${err.message}`
          : 'Could not start live screen sharing. Try attaching a screenshot instead.';
      setError(msg);
      return false;
    }
  }, [stopScreenShare]);

  // Live Camera Vision (Front / Rear, 1 FPS JPEG + Face Profile check)
  const stopCameraVision = useCallback(() => {
    if (cameraIntervalRef.current) {
      window.clearInterval(cameraIntervalRef.current);
      cameraIntervalRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    cameraVideoRef.current = null;
    latestCameraFrameRef.current = null;
    setIsCameraActive(false);
    setCameraPreviewUrl(null);
    setFaceRecognized(false);
  }, []);

  const startCameraVision = useCallback(
    async (facingMode: 'user' | 'environment' = settingsRef.current.cameraFacingMode) => {
      setError(null);
      stopCameraVision();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        cameraStreamRef.current = stream;
        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        cameraVideoRef.current = video;

        if (!cameraCanvasRef.current) {
          cameraCanvasRef.current = document.createElement('canvas');
        }

        const captureCameraFrame = () => {
          const vid = cameraVideoRef.current;
          const canvas = cameraCanvasRef.current;
          if (!vid || !canvas || vid.videoWidth === 0 || vid.videoHeight === 0) return;

          const maxW = 640;
          const scale = Math.min(1, maxW / vid.videoWidth);
          canvas.width = Math.round(vid.videoWidth * scale);
          canvas.height = Math.round(vid.videoHeight * scale);

          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
          const base64 = dataUrl.split(',')[1];
          latestCameraFrameRef.current = base64;
          setCameraPreviewUrl(dataUrl);

          const enrolledFace = identityCoreRef.current.faceProfile;
          if (enrolledFace?.enrolled && enrolledFace.histogramVector.length > 0) {
            const liveHist = extractFaceHistogram(canvas);
            const sim = cosineSimilarity(liveHist, enrolledFace.histogramVector);
            setFaceRecognized(sim >= 0.78);
          }

          if (liveSessionRef.current && liveSessionOpenRef.current && base64) {
            try {
              liveSessionRef.current.sendRealtimeInput({
                video: { data: base64, mimeType: 'image/jpeg' },
              });
            } catch {
              // Ignore frame race
            }
          }
        };

        captureCameraFrame();
        cameraIntervalRef.current = window.setInterval(captureCameraFrame, 1000);
        setIsCameraActive(true);

        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
          stopCameraVision();
        });

        return true;
      } catch (err) {
        const msg =
          err instanceof Error
            ? `Camera error (${err.name}): ${err.message}`
            : 'Unable to open device camera right now.';
        setError(msg);
        return false;
      }
    },
    [stopCameraVision]
  );

  // Voice "Sleep / Log Off" full graceful shutdown
  const enterSleepMode = useCallback(() => {
    stopSession('dormant');
    stopScreenShare();
    stopCameraVision();
    void releaseWakeLock();
    setVoiceRecognized(false);
    setFaceRecognized(false);
  }, [releaseWakeLock, stopCameraVision, stopScreenShare, stopSession]);

  const wakeFromSleep = useCallback(() => {
    setGwenState('idle');
    if (settingsRef.current.keepActiveInBackground) {
      void acquireWakeLock();
    }
  }, [acquireWakeLock]);

  const attachScreenshotFallback = useCallback((dataUrl: string) => {
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    latestScreenFrameRef.current = base64;
    setUploadedScreenImage(dataUrl);
    setScreenPreviewUrl(dataUrl);
    if (liveSessionRef.current && liveSessionOpenRef.current && base64) {
      try {
        liveSessionRef.current.sendRealtimeInput({
          video: { data: base64, mimeType: 'image/jpeg' },
        });
      } catch {
        // Ignore frame race
      }
    }
  }, []);

  const clearAttachedScreenshot = useCallback(() => {
    setUploadedScreenImage(null);
    if (!isScreenSharingRef.current) {
      latestScreenFrameRef.current = null;
      setScreenPreviewUrl(null);
    }
  }, []);

  const getLatestScreenFrame = useCallback(() => latestScreenFrameRef.current, []);
  const getLatestCameraFrame = useCallback(() => latestCameraFrameRef.current, []);

  // Immediately reinitialize an active Voice session when the user saves/changes their API key
  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;
  const startSessionRef = useRef(startSession);
  startSessionRef.current = startSession;
  const stopSessionRef = useRef(stopSession);
  stopSessionRef.current = stopSession;

  useEffect(() => {
    let lastKey = getActiveGeminiApiKey();
    return subscribeApiKeyChanges(() => {
      const nextKey = getActiveGeminiApiKey();
      if (nextKey === lastKey) return;
      lastKey = nextKey;
      setError(null);
      if (isConnectedRef.current) {
        stopSessionRef.current('idle');
        if (nextKey) {
          window.setTimeout(() => {
            void startSessionRef.current();
          }, 180);
        }
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      stopSession('idle');
      stopScreenShare();
      stopCameraVision();
      void releaseWakeLock();
    };
  }, [releaseWakeLock, stopCameraVision, stopScreenShare, stopSession]);

  return {
    gwenState,
    setGwenState,
    isConnected,
    voiceTransportMode,
    activeLiveModel,
    liveDiagnostics,
    isMicTesting,
    micTestTranscript,
    toggleMicTest,
    isMicMuted,
    setIsMicMuted,
    isPttPressed,
    setIsPttPressed,
    isScreenSharing,
    screenPreviewUrl,
    uploadedScreenImage,
    isCameraActive,
    cameraPreviewUrl,
    faceRecognized,
    voiceRecognized,
    latestEmpathySignal,
    setLatestEmpathySignal,
    wakeLockActive,
    error,
    setError,
    audioLevel,
    liveDraftInput,
    liveDraftOutput,
    startSession,
    retryLiveSession: startSession,
    stopSession: () => stopSession('idle'),
    enterSleepMode,
    wakeFromSleep,
    stopPlaybackQueue,
    sendLiveText,
    startScreenShare,
    stopScreenShare,
    startCameraVision,
    stopCameraVision,
    attachScreenshotFallback,
    clearAttachedScreenshot,
    getLatestScreenFrame,
    getLatestCameraFrame,
  };
}
