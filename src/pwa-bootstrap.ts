import { registerSW } from "virtual:pwa-register";
import { warmVocabularyCache } from "./offline-cache";

const shouldUseServiceWorker = import.meta.env.PROD && import.meta.env.VITE_DISABLE_SW !== "1";

const startOfflineWarm = () => {
  void warmVocabularyCache();
};

export const purgeAppServiceWorker = async () => {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
};

export const bootstrapPwa = () => {
  if (shouldUseServiceWorker) {
    registerSW({
      immediate: true,
      onRegisteredSW() {
        startOfflineWarm();
      },
      onOfflineReady() {
        startOfflineWarm();
      },
    });
    return;
  }

  void purgeAppServiceWorker().finally(startOfflineWarm);
};
