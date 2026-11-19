import type {
  KidLessonRecord,
  KidPracticeLog,
  KidProfile,
  KidQuizResult,
  KidStudyBundle,
} from '../types/gwen';

const DB_NAME = 'gwen_kids_study_v1';
const DB_VERSION = 1;

const STORES = {
  profiles: 'kid_profiles',
  lessons: 'kid_lessons',
  practice: 'kid_practice_logs',
  quizzes: 'kid_quiz_results',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openKidsDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.profiles)) {
        db.createObjectStore(STORES.profiles, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.lessons)) {
        const s = db.createObjectStore(STORES.lessons, { keyPath: 'id' });
        s.createIndex('by_kid', 'kidId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.practice)) {
        const s = db.createObjectStore(STORES.practice, { keyPath: 'id' });
        s.createIndex('by_kid', 'kidId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.quizzes)) {
        const s = db.createObjectStore(STORES.quizzes, { keyPath: 'id' });
        s.createIndex('by_kid', 'kidId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open Kids Study DB'));
  });

  return dbPromise;
}

async function putRecord<T>(storeName: string, record: T): Promise<void> {
  const db = await openKidsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllRecords<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openKidsDb();
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function getByKidId<T>(storeName: string, kidId: string): Promise<T[]> {
  try {
    const db = await openKidsDb();
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const index = tx.objectStore(storeName).index('by_kid');
      const req = index.getAll(IDBKeyRange.only(kidId));
      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function deleteByKidId(storeName: string, kidId: string): Promise<void> {
  const db = await openKidsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const index = store.index('by_kid');
    const req = index.openCursor(IDBKeyRange.only(kidId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const KidsStudyStorage = {
  async listProfiles(): Promise<KidProfile[]> {
    const all = await getAllRecords<KidProfile>(STORES.profiles);
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async saveProfile(profile: KidProfile): Promise<void> {
    await putRecord(STORES.profiles, profile);
  },

  async deleteProfileCascade(kidId: string): Promise<void> {
    try {
      const db = await openKidsDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.profiles, 'readwrite');
        tx.objectStore(STORES.profiles).delete(kidId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      await Promise.all([
        deleteByKidId(STORES.lessons, kidId),
        deleteByKidId(STORES.practice, kidId),
        deleteByKidId(STORES.quizzes, kidId),
      ]);
    } catch {
      // ignore
    }
  },

  async addLesson(record: KidLessonRecord): Promise<void> {
    await putRecord(STORES.lessons, record);
  },

  async addPracticeLog(log: KidPracticeLog): Promise<void> {
    await putRecord(STORES.practice, log);
  },

  async addQuizResult(result: KidQuizResult): Promise<void> {
    await putRecord(STORES.quizzes, result);
  },

  async loadIsolatedBundle(kidId: string): Promise<KidStudyBundle | null> {
    const profiles = await this.listProfiles();
    const profile = profiles.find((p) => p.id === kidId);
    if (!profile) return null;

    const [lessons, practiceLogs, quizResults] = await Promise.all([
      getByKidId<KidLessonRecord>(STORES.lessons, kidId),
      getByKidId<KidPracticeLog>(STORES.practice, kidId),
      getByKidId<KidQuizResult>(STORES.quizzes, kidId),
    ]);

    return {
      profile,
      lessons: lessons.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      practiceLogs: practiceLogs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      quizResults: quizResults.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  },

  async loadAllIsolatedBundles(): Promise<KidStudyBundle[]> {
    const profiles = await this.listProfiles();
    const bundles = await Promise.all(profiles.map((p) => this.loadIsolatedBundle(p.id)));
    return bundles.filter((b): b is KidStudyBundle => b !== null);
  },
};
