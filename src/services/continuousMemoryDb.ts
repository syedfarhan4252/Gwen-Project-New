import type {
  ContinuousSessionState,
  GeneratedMediaItem,
  GeneratedWebsiteItem,
  MemoryItem,
  TranscriptMessage,
} from '../types/gwen';

const DB_NAME = 'gwen_continuous_memory_v1';
const DB_VERSION = 1;

const STORES = {
  conversations: 'conversations',
  memories: 'memories',
  sessionState: 'session_state',
  media: 'media_creations',
  websites: 'website_creations',
} as const;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.conversations)) {
          const convStore = db.createObjectStore(STORES.conversations, { keyPath: 'id' });
          convStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.memories)) {
          const memStore = db.createObjectStore(STORES.memories, { keyPath: 'id' });
          memStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.sessionState)) {
          db.createObjectStore(STORES.sessionState, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORES.media)) {
          const mediaStore = db.createObjectStore(STORES.media, { keyPath: 'id' });
          mediaStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.websites)) {
          const webStore = db.createObjectStore(STORES.websites, { keyPath: 'id' });
          webStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

function runTx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = executor(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

export const ContinuousMemoryService = {
  async saveTurn(turn: TranscriptMessage): Promise<void> {
    await runTx(STORES.conversations, 'readwrite', (s) => s.put(turn));
  },

  async getAllTurns(): Promise<TranscriptMessage[]> {
    const res = await runTx<TranscriptMessage[]>(STORES.conversations, 'readonly', (s) =>
      s.getAll()
    );
    if (!res) return [];
    return res.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  },

  async getRecentTurns(limit = 30): Promise<TranscriptMessage[]> {
    const all = await this.getAllTurns();
    return all.slice(-limit);
  },

  async getTotalTurnCount(): Promise<number> {
    const res = await runTx<number>(STORES.conversations, 'readonly', (s) => s.count());
    return res ?? 0;
  },

  async clearConversations(): Promise<void> {
    await runTx(STORES.conversations, 'readwrite', (s) => s.clear());
  },

  async syncMemories(memories: MemoryItem[]): Promise<void> {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORES.memories, 'readwrite');
        const store = tx.objectStore(STORES.memories);
        store.clear();
        for (const mem of memories) {
          store.put(mem);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  },

  async getAllMemories(): Promise<MemoryItem[]> {
    const res = await runTx<MemoryItem[]>(STORES.memories, 'readonly', (s) => s.getAll());
    if (!res) return [];
    return res.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },

  async saveSessionState(state: ContinuousSessionState): Promise<void> {
    await runTx(STORES.sessionState, 'readwrite', (s) =>
      s.put({ key: 'active_session', ...state })
    );
  },

  async loadSessionState(): Promise<ContinuousSessionState | null> {
    const res = await runTx<ContinuousSessionState & { key: string }>(
      STORES.sessionState,
      'readonly',
      (s) => s.get('active_session')
    );
    if (!res) return null;
    const { key: _k, ...clean } = res;
    return clean;
  },

  async saveMediaCreation(item: GeneratedMediaItem): Promise<void> {
    await runTx(STORES.media, 'readwrite', (s) => s.put(item));
  },

  async getMediaCreations(): Promise<GeneratedMediaItem[]> {
    const res = await runTx<GeneratedMediaItem[]>(STORES.media, 'readonly', (s) =>
      s.getAll()
    );
    if (!res) return [];
    return res.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  async deleteMediaCreation(id: string): Promise<void> {
    await runTx(STORES.media, 'readwrite', (s) => s.delete(id));
  },

  async saveWebsiteCreation(item: GeneratedWebsiteItem): Promise<void> {
    await runTx(STORES.websites, 'readwrite', (s) => s.put(item));
  },

  async getWebsiteCreations(): Promise<GeneratedWebsiteItem[]> {
    const res = await runTx<GeneratedWebsiteItem[]>(STORES.websites, 'readonly', (s) =>
      s.getAll()
    );
    if (!res) return [];
    return res.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  async deleteWebsiteCreation(id: string): Promise<void> {
    await runTx(STORES.websites, 'readwrite', (s) => s.delete(id));
  },
};
