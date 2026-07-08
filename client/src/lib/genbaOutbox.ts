/**
 * 現場ビジョン: オフライン・アウトボックス (IndexedDB)。
 * 進捗登録・問題報告をオフライン時にキューへ退避し、オンライン復帰で自動送信する。
 * 送信順序ロジックは shared/genba/outbox.ts の processOutbox に委譲 (テスト対象)。
 */
import { processOutbox, type OutboxItem } from "@shared/genba/outbox";

const DB_NAME = "genba-outbox";
const STORE = "queue";
const DB_VERSION = 1;

function hasIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

let seq = 0;
function newId(): string {
  seq = (seq + 1) % 1000;
  return `ob_${Date.now().toString(36)}_${seq.toString(36)}`;
}

/** setStatus をキューへ積む (オフライン時) */
export async function enqueueStatus(payload: any): Promise<void> {
  if (!hasIdb()) throw new Error("offline queue unavailable");
  const item: OutboxItem = { id: newId(), kind: "setStatus", payload, createdAt: Date.now(), tries: 0 };
  await tx("readwrite", (s) => s.add(item));
}

export async function getPending(): Promise<OutboxItem[]> {
  if (!hasIdb()) return [];
  try {
    return (await tx<OutboxItem[]>("readonly", (s) => s.getAll() as IDBRequest<OutboxItem[]>)) || [];
  } catch {
    return [];
  }
}

export async function outboxCount(): Promise<number> {
  if (!hasIdb()) return 0;
  try {
    return (await tx<number>("readonly", (s) => s.count())) || 0;
  } catch {
    return 0;
  }
}

async function remove(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

async function bumpTries(item: OutboxItem): Promise<void> {
  await tx("readwrite", (s) => s.put({ ...item, tries: item.tries + 1 }));
}

/**
 * キューを送信する。runner は tRPC の setStatus 呼び出し。
 * 失敗した先頭アイテムは tries を進め、順序保持のためそこで停止する。
 */
export async function flushOutbox(runner: (payload: any) => Promise<void>): Promise<{ sent: number; remaining: number; failed: boolean }> {
  if (!hasIdb()) return { sent: 0, remaining: 0, failed: false };
  const items = await getPending();
  if (items.length === 0) return { sent: 0, remaining: 0, failed: false };
  let failedItem: OutboxItem | null = null;
  const ordered = [...items].sort((a, b) => a.createdAt - b.createdAt);
  const result = await processOutbox(
    ordered,
    async (item) => {
      try {
        await runner(item.payload);
      } catch (e) {
        failedItem = item;
        throw e;
      }
    },
    (id) => remove(id),
  );
  if (failedItem) await bumpTries(failedItem);
  return result;
}

/** ネットワーク起因の失敗か (サーバーが返した業務エラーはキューしない) */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = (e as any)?.message ? String((e as any).message).toLowerCase() : "";
  return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed") || msg.includes("network request failed");
}
