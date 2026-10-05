import { downloadIcon } from './download';
import { ICON_UPDATED, siteOrigin } from './protocol';

const DATABASE = 'total-bookmarks-site-icons';
const STORE = 'icons';
const DAY = 24 * 60 * 60 * 1000;
const MAX_DOWNLOADS = 4;
const DOWNLOAD_VERSION = 2;

type IconRecord = {
  origin: string;
  icon: string | null;
  updatedAt: number | null;
  nextRefreshAt: number;
  lastAccessedAt: number;
  downloadVersion?: number;
};

let database: Promise<IDBDatabase> | undefined;
let maintenance: Promise<void> | undefined;
const downloads = new Map<string, Promise<void>>();
const waiting: (() => void)[] = [];
let activeDownloads = 0;

function openDatabase(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'origin' });
        store.createIndex('lastAccessedAt', 'lastAccessedAt');
        store.createIndex('nextRefreshAt', 'nextRefreshAt');
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Хранилище иконок заблокировано'));
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          database = undefined;
        };
        resolve(request.result);
      };
    }).catch((cause) => { database = undefined; throw cause; });
  }
  return database;
}

// All read/modify/write operations stay in a single IndexedDB transaction.
// A background refresh must never overwrite a newer access timestamp.
async function changeRecord(
  origin: string,
  change: (record: IconRecord | undefined) => IconRecord | undefined
): Promise<IconRecord | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const request = store.get(origin);
    let result: IconRecord | undefined;
    request.onsuccess = () => {
      result = change(request.result as IconRecord | undefined);
      if (result) store.put(result);
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function monthsFrom(timestamp: number, months: number): number {
  const date = new Date(timestamp);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
}

function refresh(origin: string): Promise<void> {
  const existing = downloads.get(origin);
  if (existing) return existing;
  const task = (async () => {
    // MV3 host permissions added in an update aren't necessarily granted.
    // Leave the entry due until the user grants access, without caching a failure.
    if (!await browser.permissions.contains({ origins: [`${origin}/*`] })) return;
    if (activeDownloads >= MAX_DOWNLOADS) await new Promise<void>((resolve) => waiting.push(resolve));
    else activeDownloads++;
    try {
      const now = Date.now();
      let due = false;
      const record = await changeRecord(origin, (current) => {
        if (!current || current.nextRefreshAt > now) return current;
        due = true;
        // Persist a retry date before starting fetch, in case Firefox unloads
        // the event page or exits while the request is in flight.
        return { ...current, nextRefreshAt: now + DAY, downloadVersion: DOWNLOAD_VERSION };
      });
      if (!record || !due) return;
      const icon = await downloadIcon(origin);
      const updated = await changeRecord(origin, (current) => {
        if (!current) return undefined; // Cleanup may have removed this origin.
        const finished = Date.now();
        return {
          ...current,
          icon: icon ?? current.icon,
          updatedAt: icon ? finished : current.updatedAt,
          nextRefreshAt: icon ? monthsFrom(finished, 1) : finished + DAY
        };
      });
      if (updated && icon) {
        await browser.runtime.sendMessage({ type: ICON_UPDATED, origin, icon }).catch(() => {
          // No manager tab is open. The icon is already saved in IndexedDB.
        });
      }
    } finally {
      const next = waiting.shift();
      if (next) next();
      else activeDownloads--;
    }
  })().finally(() => downloads.delete(origin));
  downloads.set(origin, task);
  return task;
}

export async function getSiteIcon(url: string): Promise<string | null> {
  const origin = siteOrigin(url);
  if (!origin) return null;
  const now = Date.now();
  const record = await changeRecord(origin, (current) => {
    const record: IconRecord = {
      origin,
      icon: null,
      updatedAt: null,
      nextRefreshAt: 0,
      ...current,
      lastAccessedAt: Math.max(now, current?.lastAccessedAt ?? 0)
    };
    // Revalidate legacy records once: the old downloader could store a corrupt
    // image or postpone its first successful download for a day.
    if (record.downloadVersion !== DOWNLOAD_VERSION) record.nextRefreshAt = 0;
    return record;
  });
  if (record && record.nextRefreshAt <= now) {
    void refresh(origin).catch((cause) => console.error('Не удалось обновить иконку', cause));
  }
  return record?.icon ?? null;
}

export function maintainSiteIcons(): Promise<void> {
  if (maintenance) return maintenance;
  maintenance = (async () => {
    const db = await openDatabase();
    const now = Date.now();
    const due = await new Promise<string[]>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const expired = store.index('lastAccessedAt').openCursor(IDBKeyRange.upperBound(monthsFrom(now, -12), true));
      const origins: string[] = [];
      expired.onsuccess = () => {
        const cursor = expired.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
        else {
          const request = store.index('nextRefreshAt').openKeyCursor(IDBKeyRange.upperBound(now));
          request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) { origins.push(cursor.primaryKey as string); cursor.continue(); }
          };
        }
      };
      transaction.oncomplete = () => resolve(origins);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
    // Don't enqueue the entire database: keep at most four workers alive.
    const pending = due.values();
    await Promise.all(Array.from({ length: MAX_DOWNLOADS }, async () => {
      for (const origin of pending) await refresh(origin);
    }));
  })().finally(() => { maintenance = undefined; });
  return maintenance;
}

export async function retryMissingSiteIcons(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const request = transaction.objectStore(STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value as IconRecord;
      if (!record.icon) cursor.update({ ...record, nextRefreshAt: 0 });
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
  await maintainSiteIcons();
}
