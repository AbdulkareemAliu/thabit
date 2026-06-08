const DB_NAME = "thabit-offline";
const DB_VERSION = 1;
const IMAGE_STORE = "images";
const META_STORE = "meta";
const PACK_VERSION_KEY = "pack-version";
const PACK_COUNT_KEY = "pack-count";
const BATCH_SIZE = 8;
const MAX_RETRY_ROUNDS = 3;

const blobUrlCache = new Map<string, string>();

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IMAGE_STORE)) db.createObjectStore(IMAGE_STORE);
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
  });

export const normalizeImagePath = (url: string) => {
  try {
    return new URL(url, location.origin).pathname;
  } catch {
    return url;
  }
};

const runTransaction = async <T>(mode: "readonly" | "readwrite", storeName: string, run: (store: IDBObjectStore) => IDBRequest<T>) => {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = run(transaction.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
};

const getStoredKeys = () => runTransaction("readonly", IMAGE_STORE, (store) => store.getAllKeys()).then((keys) => keys as string[]);

const getMeta = (key: string) => runTransaction("readonly", META_STORE, (store) => store.get(key)).then((value) => value as string | undefined);

const setMeta = (key: string, value: string) => runTransaction("readwrite", META_STORE, (store) => store.put(value, key));

export const getManifestUrls = async () => {
  const response = await fetch("/offline-asset-manifest.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("Could not load offline asset manifest.");
  const urls = (await response.json()) as string[];
  if (!Array.isArray(urls) || urls.length === 0) throw new Error("Offline asset manifest is empty.");
  await setMeta(PACK_COUNT_KEY, String(urls.length));
  return urls;
};

const countStoredUrls = async (urls: string[]) => {
  const storedKeys = new Set(await getStoredKeys());
  return urls.filter((url) => storedKeys.has(normalizeImagePath(url))).length;
};

const storeImageBlob = async (url: string, blob: Blob) => {
  const key = normalizeImagePath(url);
  await runTransaction("readwrite", IMAGE_STORE, (store) => store.put(blob, key));

  const existingBlobUrl = blobUrlCache.get(key);
  if (existingBlobUrl) URL.revokeObjectURL(existingBlobUrl);
  blobUrlCache.delete(key);
};

const downloadImage = async (url: string) => {
  const response = await fetch(new URL(url, location.href).href);
  if (!response.ok) throw new Error(`Failed to download ${url}`);
  await storeImageBlob(url, await response.blob());
};

export const getStoredImageBlobUrl = async (url: string) => {
  const key = normalizeImagePath(url);
  if (blobUrlCache.has(key)) return blobUrlCache.get(key)!;

  const blob = await runTransaction<Blob | undefined>("readonly", IMAGE_STORE, (store) => store.get(key));
  if (!blob) return null;

  const blobUrl = URL.createObjectURL(blob);
  blobUrlCache.set(key, blobUrl);
  return blobUrl;
};

export const resolveVocabularyImageSrc = async (networkUrl: string) => {
  const stored = await getStoredImageBlobUrl(networkUrl);
  if (stored) return stored;
  return networkUrl;
};

export type OfflinePackStatus = {
  done: number;
  total: number;
  ready: boolean;
};

/** Works offline — uses IndexedDB + saved metadata, no network required. */
export const getOfflinePackStatus = async (): Promise<OfflinePackStatus> => {
  const storedKeys = await getStoredKeys();
  const done = storedKeys.length;
  const savedTotal = Number(await getMeta(PACK_COUNT_KEY)) || Number(await getMeta(PACK_VERSION_KEY)) || 0;

  if (!navigator.onLine) {
    const total = savedTotal || done;
    return { done, total, ready: savedTotal > 0 && done >= savedTotal };
  }

  try {
    const urls = await getManifestUrls();
    const matched = await countStoredUrls(urls);
    const ready = matched >= urls.length;
    return { done: matched, total: urls.length, ready };
  } catch {
    const total = savedTotal || done;
    return { done, total, ready: savedTotal > 0 && done >= savedTotal };
  }
};

export const isOfflinePackReady = async () => (await getOfflinePackStatus()).ready;

export const downloadOfflinePack = async (onProgress: (done: number, total: number, failed: number) => void) => {
  if (!navigator.onLine) {
    const status = await getOfflinePackStatus();
    onProgress(status.done, status.total, Math.max(0, status.total - status.done));
    return { done: status.done, total: status.total, failed: [] as string[] };
  }

  const urls = await getManifestUrls();
  const storedKeys = new Set(await getStoredKeys());
  let missing = urls.filter((url) => !storedKeys.has(normalizeImagePath(url)));

  let done = urls.length - missing.length;
  onProgress(done, urls.length, missing.length);

  const failed = new Set<string>();

  const downloadMissing = async () => {
    for (let index = 0; index < missing.length; index += BATCH_SIZE) {
      const batch = missing.slice(index, index + BATCH_SIZE);
      await Promise.all(
        batch.map(async (url) => {
          try {
            await downloadImage(url);
            storedKeys.add(normalizeImagePath(url));
          } catch {
            failed.add(url);
          }
        }),
      );
      done = urls.filter((url) => storedKeys.has(normalizeImagePath(url))).length;
      onProgress(done, urls.length, urls.length - done);
    }
  };

  await downloadMissing();

  for (let round = 0; round < MAX_RETRY_ROUNDS && failed.size > 0; round += 1) {
    missing = [...failed];
    failed.clear();
    await downloadMissing();
    for (const url of missing) {
      if (!storedKeys.has(normalizeImagePath(url))) failed.add(url);
    }
  }

  done = urls.filter((url) => storedKeys.has(normalizeImagePath(url))).length;
  await setMeta(PACK_VERSION_KEY, String(urls.length));
  await setMeta(PACK_COUNT_KEY, String(urls.length));
  onProgress(done, urls.length, urls.length - done);

  return { done, total: urls.length, failed: [...failed] };
};
