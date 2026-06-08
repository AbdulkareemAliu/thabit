import { useEffect, useState } from "react";
import { downloadOfflinePack, getManifestUrls, getOfflinePackStatus } from "./offline-storage";

export type OfflineWarmStatus = "idle" | "running" | "complete" | "skipped";

export type OfflineWarmState = {
  status: OfflineWarmStatus;
  done: number;
  total: number;
  failed: number;
};

type ProgressListener = (state: OfflineWarmState) => void;

let state: OfflineWarmState = { status: "idle", done: 0, total: 0, failed: 0 };
const listeners = new Set<ProgressListener>();
let warmPromise: Promise<OfflineWarmState> | null = null;

const emit = () => {
  for (const listener of listeners) listener(state);
};

const setState = (next: OfflineWarmState) => {
  state = next;
  emit();
};

export const subscribeOfflineWarmProgress = (listener: ProgressListener) => {
  listener(state);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const runWarm = async (): Promise<OfflineWarmState> => {
  if (!("indexedDB" in window)) {
    const skipped: OfflineWarmState = { status: "skipped", done: 0, total: 0, failed: 0 };
    setState(skipped);
    return skipped;
  }

  const packStatus = await getOfflinePackStatus();
  if (packStatus.ready) {
    const complete: OfflineWarmState = {
      status: "complete",
      done: packStatus.done,
      total: packStatus.total,
      failed: 0,
    };
    setState(complete);
    return complete;
  }

  if (!navigator.onLine) {
    const partial: OfflineWarmState = {
      status: "complete",
      done: packStatus.done,
      total: packStatus.total,
      failed: Math.max(0, packStatus.total - packStatus.done),
    };
    setState(partial);
    return partial;
  }

  try {
    let total = packStatus.total;
    let done = packStatus.done;
    if (total === 0) {
      const urls = await getManifestUrls();
      total = urls.length;
      done = 0;
    }

    setState({
      status: "running",
      done,
      total,
      failed: Math.max(0, total - done),
    });

    const result = await downloadOfflinePack((progressDone, progressTotal, failed) => {
      setState({ status: "running", done: progressDone, total: progressTotal, failed });
    });

    const next: OfflineWarmState = {
      status: "complete",
      done: result.done,
      total: result.total,
      failed: result.failed.length,
    };
    setState(next);
    return next;
  } catch {
    const skipped: OfflineWarmState = { status: "skipped", done: 0, total: 0, failed: 0 };
    setState(skipped);
    return skipped;
  }
};

/** Downloads vocabulary images into on-device storage for offline use. */
export const warmVocabularyCache = (): Promise<OfflineWarmState> => {
  if (warmPromise) return warmPromise;

  warmPromise = runWarm().finally(() => {
    warmPromise = null;
  });
  return warmPromise;
};

/** Subscribe to download progress (does not start a download). */
export const useOfflineWarmProgress = () => {
  const [warmState, setWarmState] = useState<OfflineWarmState>(state);

  useEffect(() => {
    return subscribeOfflineWarmProgress(setWarmState);
  }, []);

  return warmState;
};
