const DB_NAME = "sky-ticket-offline";
const VERSION = 1;
const SNAPSHOTS = "snapshots";
const SESSION = "session";
const OUTBOX = "outbox";

export type OfflineUser = { id: string; name: string; role: string };
export type OfflineSession = { user: OfflineUser; expired: boolean };

export type OutboxOperation = {
  id: string;
  userId: string;
  kind: "DAILY_START" | "DAILY_OUTCOME";
  label: string;
  method: "POST" | "PATCH";
  path: string;
  body: string;
  createdAt: number;
  status?: "pending" | "blocked";
  lastError?: string;
  attempts?: number;
};

type SnapshotRecord = { id: string; userId: string; key: string; data: unknown; savedAt: number };

let database: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (database) return database;
  database = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SESSION)) db.createObjectStore(SESSION, { keyPath: "id" });
      if (!db.objectStoreNames.contains(OUTBOX)) {
        const outbox = db.createObjectStore(OUTBOX, { keyPath: "id" });
        outbox.createIndex("userId", "userId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return database;
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function snapshotId(userId: string, key: string) {
  return `${userId}|${key}`;
}

export async function saveSnapshot(userId: string, key: string, data: unknown) {
  const db = await openDatabase();
  if (!db) return;
  const tx = db.transaction(SNAPSHOTS, "readwrite");
  tx.objectStore(SNAPSHOTS).put({ id: snapshotId(userId, key), userId, key, data, savedAt: Date.now() } satisfies SnapshotRecord);
  await finished(tx);
}

export async function readSnapshot(userId: string, key: string): Promise<unknown> {
  const db = await openDatabase();
  if (!db) return undefined;
  const tx = db.transaction(SNAPSHOTS, "readonly");
  const record = await done<SnapshotRecord | undefined>(tx.objectStore(SNAPSHOTS).get(snapshotId(userId, key)));
  return record?.data;
}

export async function saveSession(user: OfflineUser, expired = false) {
  const db = await openDatabase();
  if (!db) return;
  const tx = db.transaction(SESSION, "readwrite");
  tx.objectStore(SESSION).put({ id: "session", user, expired });
  await finished(tx);
}

export async function readSession(): Promise<OfflineSession | null> {
  const db = await openDatabase();
  if (!db) return null;
  const tx = db.transaction(SESSION, "readonly");
  const record = await done<{ id: string; user: OfflineUser; expired?: boolean } | undefined>(tx.objectStore(SESSION).get("session"));
  return record ? { user: record.user, expired: Boolean(record.expired) } : null;
}

export async function markSessionExpired() {
  const session = await readSession();
  if (session && !session.expired) await saveSession(session.user, true);
}

export async function clearSession() {
  const db = await openDatabase();
  if (!db) return;
  const tx = db.transaction(SESSION, "readwrite");
  tx.objectStore(SESSION).delete("session");
  await finished(tx);
}

export async function enqueueOperation(operation: OutboxOperation) {
  const db = await openDatabase();
  if (!db) throw new Error("No se pudo guardar la operación sin conexión. Libera espacio o habilita el almacenamiento del navegador.");
  const tx = db.transaction(OUTBOX, "readwrite");
  tx.objectStore(OUTBOX).put(operation);
  await finished(tx);
}

export async function listOperations(userId: string): Promise<OutboxOperation[]> {
  const db = await openDatabase();
  if (!db) throw new Error("No se pudo comprobar la cola sin conexión.");
  const tx = db.transaction(OUTBOX, "readonly");
  const records = await done<OutboxOperation[]>(tx.objectStore(OUTBOX).index("userId").getAll(userId));
  return records.sort((left, right) => left.createdAt - right.createdAt);
}

export async function updateOperation(operation: OutboxOperation) {
  const db = await openDatabase();
  if (!db) return;
  const tx = db.transaction(OUTBOX, "readwrite");
  tx.objectStore(OUTBOX).put({ ...operation, status: operation.status ?? "pending" });
  await finished(tx);
}

export async function deleteOperation(id: string) {
  const db = await openDatabase();
  if (!db) return;
  const tx = db.transaction(OUTBOX, "readwrite");
  tx.objectStore(OUTBOX).delete(id);
  await finished(tx);
}

export async function countOperations(userId: string) {
  const db = await openDatabase();
  if (!db) return 0;
  const tx = db.transaction(OUTBOX, "readonly");
  return done<number>(tx.objectStore(OUTBOX).index("userId").count(IDBKeyRange.only(userId)));
}

export function operationId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
