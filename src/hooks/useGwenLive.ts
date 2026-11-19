import { useCallback, useEffect, useRef, useState } from 'react';
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
  WeatherSnapshot,
} from '../types/gwen';
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
}: UseGwenLiveOptions) {
  const googleEmailRef = useRef(googleAccountEmail);
  googleEmailRef.current = googleAccountEmail;
  const activeKidRef = useRef(activeKidStudy);
  activeKidRef.current = activeKidStudy;
  const allKidNamesRef = useRef(allKidNames);
  allKidNamesRef.current = allKidNames;
  const [gwenState, setGwenState] = useState<GwenState>('idle');
  const [isConnected, setIsConnected] = useState(false);
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

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);

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
  });
  callbacksRef.current = {
    onInputTranscript,
    onOutputTranscript,
    onToolCall,
    onEmpathySignal,
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

  // Proactive Camera Vision Empathy Loop (when camera is active & empathy enabled)
  useEffect(() => {
    if (!isCameraActive || !settings.proactiveEmpathyEnabled || gwenState === 'dormant') {
      return;
    }

    const interval = window.setInterval(async () => {
      const frame = latestCameraFrameRef.current;
      if (!frame) return;
      if (Date.now() - lastCameraEmpathyAtRef.current < 26000) return;

      try {
        const res = await fetch('/api/gwen/empathy-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cameraFrameBase64: frame,
            userName:
              settingsRef.current.deviceUserName ||
              identityCoreRef.current.nickname ||
              identityCoreRef.current.displayName,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          condition?: EmpathySignal['condition'];
          confidence?: number;
          summary?: string;
          suggestedResponse?: string;
        };
        if (!data.condition) return;

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
  }, []);

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
      if (activeSourcesRef.current.size === 0 && wsRef.current?.readyState === WebSocket.OPEN) {
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

  const stopSession = useCallback(
    (targetState: GwenState = 'idle') => {
      flushDraftTranscripts();
      stopPlaybackQueue();

      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
        processorRef.current = null;
      }
      if (micAnalyserRef.current) {
        micAnalyserRef.current.disconnect();
        micAnalyserRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (inputCtxRef.current) {
        void inputCtxRef.current.close();
        inputCtxRef.current = null;
      }
      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'stop' }));
          }
          wsRef.current.close();
        } catch {
          // Ignore close errors
        }
        wsRef.current = null;
      }

      setIsConnected(false);
      setGwenState(targetState);
      setAudioLevel(0);
    },
    [flushDraftTranscripts, stopPlaybackQueue]
  );

  const startSession = useCallback(async () => {
    setError(null);
    setGwenState('connecting');

    try {
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

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'init',
            voiceName: settingsRef.current.voiceName,
            persona: activePersona,
            languageMode: settingsRef.current.languageMode,
            memories: settingsRef.current.incognitoMode ? [] : memories,
            identityCore: settingsRef.current.incognitoMode ? undefined : identityCoreRef.current,
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
            hasScreenShare: isScreenSharingRef.current || Boolean(latestScreenFrameRef.current),
            hasCameraVision: isCameraActiveRef.current,
            faceRecognized: faceRecognizedRef.current,
            voiceRecognized: voiceRecognizedRef.current,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            data?: string;
            text?: string;
            message?: string;
            calls?: LiveToolCall[];
          };

          if (msg.type === 'ready') {
            setIsConnected(true);
            setGwenState('listening');

            const source = inputCtx.createMediaStreamSource(micStream);
            const analyser = inputCtx.createAnalyser();
            analyser.fftSize = 256;
            micAnalyserRef.current = analyser;
            const freqData = new Float32Array(analyser.frequencyBinCount);

            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (audioEvt) => {
              if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
              const mode = settingsRef.current.voiceInputMode;
              const shouldTransmit =
                !isMicMutedRef.current &&
                (mode === 'hands-free' || isPttPressedRef.current);

              const channelData = audioEvt.inputBuffer.getChannelData(0);

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
              const rms = Math.sqrt(sum / (channelData.length / 4));
              if (activeSourcesRef.current.size === 0) {
                setAudioLevel(Math.min(1, rms * 5.2));
              }

              if (micAnalyserRef.current) {
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

                // Real-time Acoustic Cough Burst Detector (broadband sharp percussive impulse)
                if (
                  settingsRef.current.proactiveEmpathyEnabled &&
                  activeSourcesRef.current.size === 0
                ) {
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
              wsRef.current.send(JSON.stringify({ type: 'audio', audio: base64 }));
            };

            source.connect(analyser);
            analyser.connect(processor);
            processor.connect(inputCtx.destination);
          } else if (msg.type === 'audio' && msg.data) {
            schedulePcmPlayback(msg.data);
          } else if (msg.type === 'interrupted') {
            stopPlaybackQueue();
            flushDraftTranscripts();
            setGwenState('listening');
          } else if (msg.type === 'input_transcript' && msg.text) {
            draftInputRef.current += msg.text;
            setLiveDraftInput(draftInputRef.current);
          } else if (msg.type === 'output_transcript' && msg.text) {
            if (draftInputRef.current.trim()) {
              callbacksRef.current.onInputTranscript(draftInputRef.current.trim());
              draftInputRef.current = '';
              setLiveDraftInput('');
            }
            draftOutputRef.current += msg.text;
            setLiveDraftOutput(draftOutputRef.current);
          } else if (msg.type === 'turn_complete') {
            flushDraftTranscripts();
            if (activeSourcesRef.current.size === 0) {
              setGwenState('listening');
            }
          } else if (msg.type === 'tool_call' && msg.calls) {
            for (const call of msg.calls) {
              callbacksRef.current.onToolCall(call);
            }
          } else if (msg.type === 'error') {
            setError(msg.message || 'Live voice session encountered an error.');
            setGwenState('error');
          } else if (msg.type === 'closed') {
            setIsConnected(false);
            setGwenState((prev) => (prev === 'error' || prev === 'dormant' ? prev : 'idle'));
          }
        } catch {
          // Ignore malformed ws message
        }
      };

      ws.onerror = () => {
        setError('Unable to maintain Live Voice WebSocket connection.');
        setGwenState('error');
      };

      ws.onclose = () => {
        setIsConnected(false);
        setGwenState((prev) => (prev === 'error' || prev === 'dormant' ? prev : 'idle'));
      };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.name === 'NotAllowedError'
            ? 'Microphone permission was denied. Please grant Microphone access to talk with Gwen.'
            : err.message
          : 'Failed to start microphone session.';
      setError(message);
      setGwenState('error');
      stopSession('error');
    }
  }, [activePersona, flushDraftTranscripts, memories, schedulePcmPlayback, stopPlaybackQueue, stopSession]);

  const sendLiveText = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'text', text }));
      return true;
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

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && base64) {
          wsRef.current.send(JSON.stringify({ type: 'video', video: base64 }));
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
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Screen share permission was cancelled or blocked. You can still attach a screenshot.'
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

          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && base64) {
            wsRef.current.send(JSON.stringify({ type: 'video', video: base64 }));
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
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Camera permission was denied. Grant Camera access to let Gwen see you and your world.'
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
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && base64) {
      wsRef.current.send(JSON.stringify({ type: 'video', video: base64 }));
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
