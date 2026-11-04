/**
 * Fila de anexos guardada neste aparelho (IndexedDB). Se a internet cair durante o envio
 * (ou a página for recarregada), o arquivo fica aqui e é enviado quando a conexão voltar
 * ou quando o card do lead for aberto de novo. Só arquivos escolhidos pela própria pessoa.
 */
export type QueuedFile = { id: string; leadId: string; name: string; type: string; size: number; blob: Blob; at: number };

const DB = "core-uploads";
const STORE = "lead-files";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }).createIndex("leadId", "leadId");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const t = db.transaction(STORE, mode);
          const r = fn(t.objectStore(STORE));
          t.oncomplete = () => resolve(r ? (r.result as T) : null);
          t.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export async function enqueueLeadFile(leadId: string, file: File): Promise<boolean> {
  const item: QueuedFile = { id: crypto.randomUUID(), leadId, name: file.name, type: file.type, size: file.size, blob: file, at: Date.now() };
  const ok = await tx("readwrite", (s) => s.put(item));
  return ok !== null;
}

export async function queuedLeadFiles(leadId: string): Promise<QueuedFile[]> {
  const all = await tx<QueuedFile[]>("readonly", (s) => s.index("leadId").getAll(leadId));
  return (all ?? []).sort((a, b) => a.at - b.at);
}

export async function dropQueuedFile(id: string) {
  await tx("readwrite", (s) => s.delete(id));
}

/** Falha de conexão (e não erro do servidor, como "tipo não aceito"). */
export function isNetworkError(e: unknown) {
  const msg = String((e as any)?.message ?? e ?? "");
  return (typeof navigator !== "undefined" && navigator.onLine === false) || /failed to fetch|networkerror|load failed|network request failed|fetch failed|err_internet|err_network/i.test(msg);
}
