/**
 * 現場ビジョン: 作業ファイルのオフライン保存 (IndexedDB)。
 * R2署名URLはクロスオリジン+失効するため、サーバの files.getBytes 経由で取得した実体(Blob)を
 * 端末に保存し、圏外でも開けるようにする。メタ情報(taskId/表示名/種別)も一緒に持つ。
 */

export type CachedFileMeta = {
  id: string;
  taskId: string;
  title: string | null;
  fileName: string | null;
  mimeType: string;
  sizeBytes: number;
  savedAt: number;
};
type CachedFileRecord = CachedFileMeta & { blob: Blob };

const DB_NAME = "genba-files";
const STORE = "files";
const DB_VERSION = 1;

function hasIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("taskId", "taskId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqToPromise<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        t.oncomplete = () => db.close();
      }),
  );
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/** files.getBytes の戻り値(base64)を Blob 化して保存 */
export async function saveFileOffline(
  meta: { id: string; taskId: string; title: string | null; fileName: string | null },
  bytes: { base64: string; mimeType: string; fileName: string },
): Promise<void> {
  if (!hasIdb()) throw new Error("この端末はオフライン保存に対応していません");
  const blob = base64ToBlob(bytes.base64, bytes.mimeType);
  const rec: CachedFileRecord = {
    id: meta.id,
    taskId: meta.taskId,
    title: meta.title,
    fileName: meta.fileName || bytes.fileName,
    mimeType: bytes.mimeType,
    sizeBytes: blob.size,
    savedAt: Date.now(),
    blob,
  };
  await reqToPromise("readwrite", (s) => s.put(rec));
}

/** 保存済みファイルの Blob を取得 (無ければ null) */
export async function getOfflineFile(id: string): Promise<CachedFileRecord | null> {
  if (!hasIdb()) return null;
  try {
    const rec = await reqToPromise<CachedFileRecord | undefined>("readonly", (s) => s.get(id));
    return rec ?? null;
  } catch {
    return null;
  }
}

/** 作業に紐づく保存済みファイルの一覧 (メタのみ) */
export async function listOfflineFilesByTask(taskId: string): Promise<CachedFileMeta[]> {
  if (!hasIdb()) return [];
  try {
    return await openDb().then(
      (db) =>
        new Promise<CachedFileMeta[]>((resolve) => {
          const t = db.transaction(STORE, "readonly");
          const idx = t.objectStore(STORE).index("taskId");
          const out: CachedFileMeta[] = [];
          const cursorReq = idx.openCursor(IDBKeyRange.only(taskId));
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              const { blob, ...meta } = cursor.value as CachedFileRecord;
              void blob;
              out.push(meta);
              cursor.continue();
            } else {
              resolve(out);
            }
          };
          cursorReq.onerror = () => resolve(out);
          t.oncomplete = () => db.close();
        }),
    );
  } catch {
    return [];
  }
}

/** 保存済みidの集合 (バッジ表示用) */
export async function offlineFileIds(taskId: string): Promise<Set<string>> {
  return new Set((await listOfflineFilesByTask(taskId)).map((m) => m.id));
}

/** 端末に保存済みの全ファイルidの集合 (スコープ横断の「保存済み」バッジ用) */
export async function allOfflineFileIds(): Promise<Set<string>> {
  if (!hasIdb()) return new Set();
  try {
    const keys = await reqToPromise<IDBValidKey[]>("readonly", (s) => s.getAllKeys());
    return new Set(keys.map((k) => String(k)));
  } catch {
    return new Set();
  }
}

export async function removeOfflineFile(id: string): Promise<void> {
  if (!hasIdb()) return;
  await reqToPromise("readwrite", (s) => s.delete(id));
}
