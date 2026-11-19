// Cross-platform per-device Gemini / Google AI Studio API Key Storage & Validation
// Web: localStorage with reversible obfuscation envelope wrapped in try/catch
// Mobile (Android / React Native / Expo WebView bridge): delegates to native secure store if present

export type ApiKeyStatus = 'verified' | 'not_configured' | 'invalid';

export interface StoredApiKeyState {
  hasKey: boolean;
  status: ApiKeyStatus;
  maskedKey: string;
  verifiedAt: string | null;
  lastError: string | null;
  modelCount?: number;
}

export interface ApiKeyValidationResult {
  ok: boolean;
  status: ApiKeyStatus;
  code?: number;
  modelCount?: number;
  message: string;
}

interface NativeSecureStoreBridge {
  saveSecureKey?: (slot: string, value: string) => void;
  getSecureKey?: (slot: string) => string | null;
  clearSecureKey?: (slot: string) => void;
}

const KEY_STORAGE_SLOT = 'gwen.v4.userGeminiApiKey';
const META_STORAGE_SLOT = 'gwen.v4.userGeminiApiKeyMeta';
const OBFUSCATION_SALT = 'Gwen-SyedFarhan-PerDevice-Vault-v4';
const CHANGE_EVENT = 'gwen:api-key-changed';

function getNativeBridge(): NativeSecureStoreBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { GwenNativeBridge?: NativeSecureStoreBridge };
  return w.GwenNativeBridge || null;
}

function encodeKeyEnvelope(plainKey: string): string {
  const bytes = new TextEncoder().encode(plainKey);
  const saltBytes = new TextEncoder().encode(OBFUSCATION_SALT);
  const xored = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    xored[i] = bytes[i] ^ saltBytes[i % saltBytes.length];
  }
  let binary = '';
  for (let i = 0; i < xored.length; i++) {
    binary += String.fromCharCode(xored[i]);
  }
  return `gwv1:${btoa(binary)}`;
}

function decodeKeyEnvelope(encoded: string): string | null {
  if (!encoded) return null;
  if (!encoded.startsWith('gwv1:')) {
    // Support plain string if written by a native bridge
    return encoded.trim() || null;
  }
  try {
    const binary = atob(encoded.slice(5));
    const xored = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      xored[i] = binary.charCodeAt(i);
    }
    const saltBytes = new TextEncoder().encode(OBFUSCATION_SALT);
    const plain = new Uint8Array(xored.length);
    for (let i = 0; i < xored.length; i++) {
      plain[i] = xored[i] ^ saltBytes[i % saltBytes.length];
    }
    return new TextDecoder().decode(plain).trim() || null;
  } catch {
    return null;
  }
}

export function maskApiKey(rawKey: string): string {
  const clean = rawKey.trim();
  if (!clean) return '';
  if (clean.length <= 10) return `${clean.slice(0, 2)}••••${clean.slice(-2)}`;
  return `${clean.slice(0, 6)}••••••••${clean.slice(-4)}`;
}

function notifyKeyChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

export function subscribeApiKeyChanges(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => listener();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function getActiveGeminiApiKey(): string | null {
  try {
    const bridge = getNativeBridge();
    if (bridge?.getSecureKey) {
      const nativeVal = bridge.getSecureKey(KEY_STORAGE_SLOT);
      const trimmedNative = (nativeVal ? decodeKeyEnvelope(nativeVal) || nativeVal : '').trim();
      if (trimmedNative) return trimmedNative;
    }
  } catch {
    // Fall back to web localStorage
  }

  try {
    const raw = localStorage.getItem(KEY_STORAGE_SLOT);
    if (!raw) return null;
    const decoded = decodeKeyEnvelope(raw);
    return decoded ? decoded.trim() || null : null;
  } catch {
    return null;
  }
}

export function getStoredApiKeyState(): StoredApiKeyState {
  const activeKey = getActiveGeminiApiKey();
  let meta: Partial<StoredApiKeyState> = {};
  try {
    const rawMeta = localStorage.getItem(META_STORAGE_SLOT);
    if (rawMeta) meta = JSON.parse(rawMeta) as Partial<StoredApiKeyState>;
  } catch {
    meta = {};
  }

  if (!activeKey) {
    return {
      hasKey: false,
      status: 'not_configured',
      maskedKey: '',
      verifiedAt: null,
      lastError: null,
    };
  }

  return {
    hasKey: true,
    status: meta.status === 'invalid' ? 'invalid' : 'verified',
    maskedKey: maskApiKey(activeKey),
    verifiedAt: meta.verifiedAt || null,
    lastError: meta.lastError || null,
    modelCount: meta.modelCount,
  };
}

export function saveVerifiedGeminiApiKey(
  rawKey: string,
  modelCount?: number
): StoredApiKeyState {
  const cleaned = rawKey.trim();
  const encoded = encodeKeyEnvelope(cleaned);

  try {
    const bridge = getNativeBridge();
    if (bridge?.saveSecureKey) {
      bridge.saveSecureKey(KEY_STORAGE_SLOT, cleaned);
    }
  } catch {
    // Continue to localStorage
  }

  try {
    localStorage.setItem(KEY_STORAGE_SLOT, encoded);
    const meta = {
      status: 'verified' as ApiKeyStatus,
      verifiedAt: new Date().toISOString(),
      lastError: null,
      modelCount,
    };
    localStorage.setItem(META_STORAGE_SLOT, JSON.stringify(meta));
  } catch {
    // Ignore storage quota errors
  }

  notifyKeyChanged();
  return getStoredApiKeyState();
}

export function markGeminiApiKeyInvalid(reason: string): StoredApiKeyState {
  try {
    const current = getStoredApiKeyState();
    if (current.hasKey) {
      localStorage.setItem(
        META_STORAGE_SLOT,
        JSON.stringify({
          status: 'invalid' as ApiKeyStatus,
          verifiedAt: current.verifiedAt,
          lastError: reason,
          modelCount: current.modelCount,
        })
      );
    }
  } catch {
    // ignore
  }
  notifyKeyChanged();
  return getStoredApiKeyState();
}

export function clearStoredGeminiApiKey(): StoredApiKeyState {
  try {
    const bridge = getNativeBridge();
    if (bridge?.clearSecureKey) {
      bridge.clearSecureKey(KEY_STORAGE_SLOT);
    }
  } catch {
    // ignore
  }

  try {
    localStorage.removeItem(KEY_STORAGE_SLOT);
    localStorage.removeItem(META_STORAGE_SLOT);
  } catch {
    // ignore
  }

  notifyKeyChanged();
  return getStoredApiKeyState();
}

export function getGeminiRequestHeaders(
  extra: Record<string, string> = {}
): Record<string, string> {
  const key = (getActiveGeminiApiKey() ?? '').trim();
  if (!key) return { ...extra };
  return {
    ...extra,
    'X-Gemini-Api-Key': key,
  };
}

// Lightweight direct verification against Google's Gemini API from the user's device
export async function validateGeminiApiKey(rawKey: string): Promise<ApiKeyValidationResult> {
  const cleaned = rawKey.trim();
  if (!cleaned) {
    return {
      ok: false,
      status: 'not_configured',
      message: 'Please enter your Google AI Studio Gemini API key first.',
    };
  }
  if (cleaned.length < 20) {
    return {
      ok: false,
      status: 'invalid',
      code: 400,
      message: 'That key looks too short. Gemini API keys usually start with "AIza" and are ~39 characters.',
    };
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleaned)}`,
      { method: 'GET' }
    );
    const rawText = await res.text().catch(() => '');

    if (res.ok) {
      let data: { models?: unknown[] } = {};
      if (rawText.trim()) {
        try {
          data = JSON.parse(rawText) as { models?: unknown[] };
        } catch {
          return {
            ok: false,
            status: 'invalid',
            code: res.status,
            message: `Unexpected non-JSON response from Gemini API (HTTP ${res.status}).`,
          };
        }
      }
      const count = Array.isArray(data.models) ? data.models.length : undefined;
      return {
        ok: true,
        status: 'verified',
        code: 200,
        modelCount: count,
        message: count
          ? `API key verified directly with Google Gemini (${count} models accessible).`
          : 'API key verified directly with Google Gemini.',
      };
    }

    let apiMsg = '';
    if (rawText.trim()) {
      try {
        const errJson = JSON.parse(rawText) as {
          error?: { message?: string; status?: string };
        };
        apiMsg = errJson.error?.message || '';
      } catch {
        apiMsg = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
      }
    }

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return {
        ok: false,
        status: 'invalid',
        code: res.status,
        message:
          apiMsg.includes('API key not valid') || res.status === 400 || res.status === 401
            ? 'Invalid API key. Double-check that you copied the full key from Google AI Studio.'
            : apiMsg || `This API key does not have permission to access the Gemini API (HTTP ${res.status}).`,
      };
    }

    if (res.status === 429) {
      return {
        ok: false,
        status: 'invalid',
        code: 429,
        message:
          'This API key has reached its current Gemini quota limit (429). Wait a moment or use a key with available quota.',
      };
    }

    return {
      ok: false,
      status: 'invalid',
      code: res.status,
      message: apiMsg
        ? `HTTP ${res.status}: ${apiMsg}`
        : `Gemini API verification returned HTTP ${res.status}.`,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Network error';
    return {
      ok: false,
      status: 'invalid',
      message: `Could not reach Google Gemini API (${detail}). Check your internet connection and try again.`,
    };
  }
}
