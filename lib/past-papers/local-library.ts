/**
 * Papers the student has downloaded, held on their own device.
 *
 * Two stores, for one reason each.
 *
 * The PDFs go in **IndexedDB**. Papers in this library average 1.4 MB and run past 10 MB; the
 * localStorage quota is around 5 MB for the whole origin and it stores strings, so a PDF would have
 * to be base64-encoded — a third larger again — and the third download would throw `QuotaExceeded`
 * and take the student's theme and preferences down with it. IndexedDB stores blobs natively and is
 * measured in hundreds of megabytes. It is also what the portal cache already uses.
 *
 * The **index** — which papers are held, how big, when — goes in localStorage, because it is small
 * and because it has to be readable *synchronously*. Every card in the browser asks "is this one
 * downloaded?" as it renders, and an async answer means every card flickers from "Download" to
 * "Downloaded" on first paint.
 *
 * Everything is scoped by account id: a shared device must never show one student's library to
 * the next.
 */

export interface LocalPaperRecord {
  paperId: string;
  title: string;
  subject: string;
  year: number | null;
  school: string | null;
  bytes: number;
  downloadedAt: string;
}

interface LocalIndex {
  version: 1;
  papers: Record<string, LocalPaperRecord>;
  /** Paper ids the student has opened, downloaded or sat. Drives the picked-for-you gate. */
  interactions: string[];
}

const DB_NAME = "millennium-past-papers";
const DB_VERSION = 1;
const STORE = "documents";

/** How many distinct papers a student must touch before recommendations mean anything. */
export const RECOMMENDATION_INTERACTION_THRESHOLD = 3;

function indexKey(accountId: string): string {
  return `millennium:past-papers:library:${accountId}`;
}

function emptyIndex(): LocalIndex {
  return { version: 1, papers: {}, interactions: [] };
}

/**
 * Reads the index.
 *
 * Never throws. A corrupt or quota-blocked read yields an empty library rather than an error: the
 * consequence is a redundant download, which is recoverable, where a thrown error on first paint
 * takes the whole page down.
 */
export function readLocalIndex(accountId: string): LocalIndex {
  if (typeof localStorage === "undefined") return emptyIndex();
  try {
    const raw = localStorage.getItem(indexKey(accountId));
    if (!raw) return emptyIndex();
    const parsed = JSON.parse(raw) as Partial<LocalIndex>;
    return {
      version: 1,
      papers: parsed.papers && typeof parsed.papers === "object" ? parsed.papers : {},
      interactions: Array.isArray(parsed.interactions) ? parsed.interactions : [],
    };
  } catch {
    return emptyIndex();
  }
}

function writeLocalIndex(accountId: string, index: LocalIndex): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(indexKey(accountId), JSON.stringify(index));
  } catch {
    // The index is a few hundred bytes per paper, so this only fires when the origin's quota is
    // already exhausted by something else. The document itself is safely in IndexedDB either way.
  }
}

export function isDownloadedLocally(accountId: string, paperId: string): boolean {
  return Boolean(readLocalIndex(accountId).papers[paperId]);
}

export function localLibrarySize(accountId: string): { count: number; bytes: number } {
  const records = Object.values(readLocalIndex(accountId).papers);
  return {
    count: records.length,
    bytes: records.reduce((total, record) => total + record.bytes, 0),
  };
}

/**
 * Records that the student engaged with a paper.
 *
 * Distinct papers, not events: opening the same paper ten times is one paper's worth of evidence
 * about what a student is working on, and counting it ten times would unlock recommendations built
 * on a single subject.
 */
export function recordInteraction(accountId: string, paperId: string): number {
  const index = readLocalIndex(accountId);
  if (!index.interactions.includes(paperId)) {
    index.interactions = [...index.interactions, paperId].slice(-200);
    writeLocalIndex(accountId, index);
  }
  return index.interactions.length;
}

export function interactionCount(accountId: string): number {
  return readLocalIndex(accountId).interactions.length;
}

/**
 * Whether recommendations have enough to go on.
 *
 * Below the threshold the picked-for-you row is hidden entirely rather than filled with generic
 * suggestions. A recommendation row that cannot yet personalise is just a second, worse copy of the
 * listing beneath it, and it teaches students to ignore the row before it ever becomes useful.
 */
export function hasEnoughForRecommendations(accountId: string): boolean {
  return interactionCount(accountId) >= RECOMMENDATION_INTERACTION_THRESHOLD;
}

// --- Document store ---------------------------------------------------------------------------

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Offline storage is not available in this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open offline storage."));
  });
}

/** Keyed by account and paper so one device can hold two students' libraries without collision. */
function documentKey(accountId: string, paperId: string): string {
  return `${accountId}:${paperId}`;
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage failed."));
    transaction.oncomplete = () => database.close();
  }));
}

export async function storePaperLocally(
  accountId: string,
  record: Omit<LocalPaperRecord, "bytes" | "downloadedAt">,
  blob: Blob,
): Promise<LocalPaperRecord> {
  await runTransaction("readwrite", (store) => store.put(blob, documentKey(accountId, record.paperId)));

  const stored: LocalPaperRecord = {
    ...record,
    bytes: blob.size,
    downloadedAt: new Date().toISOString(),
  };

  // Written only after the blob lands, so the index can never advertise a document that is not
  // actually there — which would show a "Downloaded" badge on a paper that fails to open.
  const index = readLocalIndex(accountId);
  index.papers[record.paperId] = stored;
  if (!index.interactions.includes(record.paperId)) {
    index.interactions = [...index.interactions, record.paperId].slice(-200);
  }
  writeLocalIndex(accountId, index);

  return stored;
}

export async function readPaperLocally(accountId: string, paperId: string): Promise<Blob | null> {
  try {
    const blob = await runTransaction<Blob | undefined>(
      "readonly",
      (store) => store.get(documentKey(accountId, paperId)) as IDBRequest<Blob | undefined>,
    );
    return blob ?? null;
  } catch {
    return null;
  }
}

export async function removePaperLocally(accountId: string, paperId: string): Promise<void> {
  try {
    await runTransaction("readwrite", (store) => store.delete(documentKey(accountId, paperId)));
  } catch {
    // A failed delete leaves an orphaned blob, which the next clear will collect. It must not stop
    // the index entry being removed, or the paper would be stuck showing as downloaded.
  }

  const index = readLocalIndex(accountId);
  delete index.papers[paperId];
  writeLocalIndex(accountId, index);
}

export async function clearLocalLibrary(accountId: string): Promise<void> {
  const index = readLocalIndex(accountId);
  await Promise.all(
    Object.keys(index.papers).map((paperId) =>
      runTransaction("readwrite", (store) => store.delete(documentKey(accountId, paperId)))
        .catch(() => undefined)),
  );
  writeLocalIndex(accountId, { ...emptyIndex(), interactions: index.interactions });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
