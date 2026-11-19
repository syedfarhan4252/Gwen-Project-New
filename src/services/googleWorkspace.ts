import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  GoogleAccountProfile,
  GoogleWorkspaceScopesConfig,
  KeepStyleNote,
} from '../types/gwen';

export const WORKSPACE_SCOPES = {
  gmail: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.send',
  ],
  calendar: ['https://www.googleapis.com/auth/calendar.events'],
  tasksAndNotes: ['https://www.googleapis.com/auth/tasks'],
  drive: [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.file',
  ],
  contacts: ['https://www.googleapis.com/auth/contacts.readonly'],
} as const;

export const DEFAULT_WORKSPACE_SCOPES_CONFIG: GoogleWorkspaceScopesConfig = {
  gmail: true,
  calendar: true,
  tasksAndNotes: true,
  drive: true,
  contacts: true,
};

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Strictly in-memory OAuth access token cache (never persisted to localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

function toProfile(user: User): GoogleAccountProfile {
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email || 'Google User',
    photoURL: user.photoURL || null,
    connectedAt: new Date().toISOString(),
  };
}

function buildProvider(
  scopeConfig: GoogleWorkspaceScopesConfig,
  forceAccountSelect = false
): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  if (scopeConfig.gmail) {
    WORKSPACE_SCOPES.gmail.forEach((s) => provider.addScope(s));
  }
  if (scopeConfig.calendar) {
    WORKSPACE_SCOPES.calendar.forEach((s) => provider.addScope(s));
  }
  if (scopeConfig.tasksAndNotes) {
    WORKSPACE_SCOPES.tasksAndNotes.forEach((s) => provider.addScope(s));
  }
  if (scopeConfig.drive) {
    WORKSPACE_SCOPES.drive.forEach((s) => provider.addScope(s));
  }
  if (scopeConfig.contacts) {
    WORKSPACE_SCOPES.contacts.forEach((s) => provider.addScope(s));
  }
  if (forceAccountSelect) {
    provider.setCustomParameters({ prompt: 'select_account' });
  }
  return provider;
}

export const GoogleAuthService = {
  initAuth(
    onAuthenticated: (profile: GoogleAccountProfile, hasLiveToken: boolean) => void,
    onSignedOut: () => void
  ) {
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        if (cachedAccessToken) {
          onAuthenticated(toProfile(user), true);
        } else if (!isSigningIn) {
          // Signed into Firebase session, but OAuth access token needs fresh sign-in click
          onAuthenticated(toProfile(user), false);
        }
      } else {
        cachedAccessToken = null;
        onSignedOut();
      }
    });
  },

  async signIn(
    scopeConfig: GoogleWorkspaceScopesConfig,
    forceAccountSelect = false
  ): Promise<{ profile: GoogleAccountProfile; accessToken: string }> {
    isSigningIn = true;
    try {
      const provider = buildProvider(scopeConfig, forceAccountSelect);
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Google sign-in completed, but no Workspace access token was returned.');
      }
      cachedAccessToken = credential.accessToken;
      return {
        profile: toProfile(result.user),
        accessToken: cachedAccessToken,
      };
    } finally {
      isSigningIn = false;
    }
  },

  getAccessToken(): string | null {
    return cachedAccessToken;
  },

  async disconnect(): Promise<void> {
    cachedAccessToken = null;
    await auth.signOut();
  },
};

async function googleApiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = GoogleAuthService.getAccessToken();
  if (!token) {
    throw new Error('Google Account session is not linked or expired. Open Settings → Connected Google Account to sign in.');
  }
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (res.status === 401) {
    cachedAccessToken = null;
    throw new Error('Your Google session expired. Please tap "Reconnect" in Settings → Connected Google Account.');
  }
  const rawText = await res.text().catch(() => '');
  if (!res.ok) {
    let errMsg = '';
    if (rawText.trim()) {
      try {
        const errBody = JSON.parse(rawText) as { error?: { message?: string } };
        errMsg = errBody.error?.message || '';
      } catch {
        errMsg = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
      }
    }
    throw new Error(errMsg ? `HTTP ${res.status}: ${errMsg}` : `Google API request failed (HTTP ${res.status})`);
  }
  if (res.status === 204 || !rawText.trim()) return {} as T;
  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new Error(`Google API returned non-JSON response (HTTP ${res.status}).`);
  }
}

// ---------------------------------------------------------------------------
// 1. Gmail Service (Read, Search, Send after explicit confirmation)
// ---------------------------------------------------------------------------
export interface GmailMessageSummary {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
}

export const GmailService = {
  async listMessages(query = 'is:unread', maxResults = 5): Promise<GmailMessageSummary[]> {
    const list = await googleApiFetch<{ messages?: Array<{ id: string }> }>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`
    );
    const ids = (list.messages || []).slice(0, maxResults);
    if (ids.length === 0) return [];

    const details = await Promise.all(
      ids.map((m) =>
        googleApiFetch<{
          id: string;
          snippet?: string;
          labelIds?: string[];
          payload?: { headers?: Array<{ name: string; value: string }> };
        }>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
        )
      )
    );

    return details.map((d) => {
      const headers = d.payload?.headers || [];
      const getH = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      return {
        id: d.id,
        from: getH('From') || 'Unknown sender',
        subject: getH('Subject') || '(No Subject)',
        date: getH('Date') || '',
        snippet: d.snippet || '',
        unread: (d.labelIds || []).includes('UNREAD'),
      };
    });
  },

  async sendEmail(to: string, subject: string, body: string): Promise<{ id: string }> {
    const rawLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body,
    ].join('\r\n');
    const base64Url = btoa(unescape(encodeURIComponent(rawLines)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return googleApiFetch<{ id: string }>(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: base64Url }),
      }
    );
  },
};

// ---------------------------------------------------------------------------
// 2. Google Calendar Service (IST default Asia/Kolkata)
// ---------------------------------------------------------------------------
export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  description?: string;
  htmlLink?: string;
}

export const GoogleCalendarService = {
  async listUpcomingEvents(maxResults = 8): Promise<GoogleCalendarEvent[]> {
    const nowIso = new Date().toISOString();
    const data = await googleApiFetch<{
      items?: Array<{
        id: string;
        summary?: string;
        description?: string;
        htmlLink?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
    }>(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(nowIso)}&singleEvents=true&orderBy=startTime&maxResults=${maxResults}`
    );

    return (data.items || []).map((item) => ({
      id: item.id,
      summary: item.summary || 'Untitled Event',
      start: item.start?.dateTime || item.start?.date || '',
      end: item.end?.dateTime || item.end?.date || '',
      description: item.description,
      htmlLink: item.htmlLink,
    }));
  },

  async createEvent(
    summary: string,
    startIso: string,
    endIso: string,
    timeZone = 'Asia/Kolkata',
    description?: string
  ): Promise<GoogleCalendarEvent> {
    const created = await googleApiFetch<{
      id: string;
      summary: string;
      htmlLink?: string;
      start?: { dateTime?: string };
      end?: { dateTime?: string };
    }>('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary,
        description,
        start: { dateTime: startIso, timeZone },
        end: { dateTime: endIso, timeZone },
      }),
    });

    return {
      id: created.id,
      summary: created.summary,
      start: created.start?.dateTime || startIso,
      end: created.end?.dateTime || endIso,
      htmlLink: created.htmlLink,
    };
  },

  async deleteEvent(eventId: string): Promise<void> {
    await googleApiFetch<void>(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' }
    );
  },
};

// ---------------------------------------------------------------------------
// 3. Google Tasks + Seamless Keep-Style Local-Synced Notes Service
// ---------------------------------------------------------------------------
export interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string;
}

const LOCAL_NOTES_KEY = 'gwen.v4.keepNotes';

export const KeepAndTasksService = {
  getLocalNotes(): KeepStyleNote[] {
    try {
      const raw = localStorage.getItem(LOCAL_NOTES_KEY);
      return raw ? (JSON.parse(raw) as KeepStyleNote[]) : [];
    } catch {
      return [];
    }
  },

  saveLocalNotes(notes: KeepStyleNote[]): void {
    localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(notes));
  },

  async listGoogleTasks(maxResults = 15): Promise<GoogleTaskItem[]> {
    const data = await googleApiFetch<{ items?: GoogleTaskItem[] }>(
      `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=false&maxResults=${maxResults}`
    );
    return data.items || [];
  },

  async createGoogleTask(title: string, notes?: string): Promise<GoogleTaskItem> {
    return googleApiFetch<GoogleTaskItem>(
      'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, notes }),
      }
    );
  },

  async completeGoogleTask(taskId: string): Promise<GoogleTaskItem> {
    return googleApiFetch<GoogleTaskItem>(
      `https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${encodeURIComponent(taskId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      }
    );
  },
};

// ---------------------------------------------------------------------------
// 4. Google Drive & Google Contacts (People API) Service
// ---------------------------------------------------------------------------
export interface GoogleContactMatch {
  name: string;
  email?: string;
  phone?: string;
}

export interface GoogleDriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
}

export const DriveAndContactsService = {
  async searchContacts(query: string): Promise<GoogleContactMatch[]> {
    const data = await googleApiFetch<{
      results?: Array<{
        person?: {
          names?: Array<{ displayName?: string }>;
          emailAddresses?: Array<{ value?: string }>;
          phoneNumbers?: Array<{ value?: string }>;
        };
      }>;
    }>(
      `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(query)}&readMask=names,emailAddresses,phoneNumbers&pageSize=8`
    );

    return (data.results || [])
      .map((r) => ({
        name: r.person?.names?.[0]?.displayName || 'Contact',
        email: r.person?.emailAddresses?.[0]?.value,
        phone: r.person?.phoneNumbers?.[0]?.value,
      }))
      .filter((c) => c.email || c.phone);
  },

  async searchDriveFiles(query: string, pageSize = 8): Promise<GoogleDriveFileItem[]> {
    const escaped = query.replace(/'/g, "\\'");
    const q = query.trim()
      ? `name contains '${escaped}' and trashed = false`
      : 'trashed = false';
    const data = await googleApiFetch<{ files?: GoogleDriveFileItem[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,webViewLink,modifiedTime)&pageSize=${pageSize}`
    );
    return data.files || [];
  },

  async backupTextToDrive(filename: string, content: string, mimeType = 'text/plain'): Promise<GoogleDriveFileItem> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) {
      throw new Error('Link your Google Account in Settings to back up files to Google Drive.');
    }
    const boundary = 'gwen_drive_boundary_v4';
    const metadata = JSON.stringify({ name: filename, mimeType });
    const multipart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n--${boundary}--`;

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipart,
      }
    );
    const rawText = await res.text().catch(() => '');
    if (!res.ok) {
      let errMsg = '';
      if (rawText.trim()) {
        try {
          const errBody = JSON.parse(rawText) as { error?: { message?: string } };
          errMsg = errBody.error?.message || '';
        } catch {
          errMsg = rawText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
        }
      }
      throw new Error(errMsg ? `Google Drive backup failed (${res.status}): ${errMsg}` : `Google Drive backup failed (HTTP ${res.status})`);
    }
    try {
      return JSON.parse(rawText) as GoogleDriveFileItem;
    } catch {
      throw new Error(`Google Drive backup returned non-JSON response (HTTP ${res.status}).`);
    }
  },
};
