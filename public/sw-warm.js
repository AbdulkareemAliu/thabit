const VOCABULARY_CACHE = "vocabulary-images-v4";
const VOCABULARY_PATH_PATTERN = /^\/vocabulary\/.+\.(?:png|svg)$/i;
const networkFetches = new Set();

const getPathname = (url) => new URL(url, self.location.origin).pathname;

const isVocabularyImagePath = (pathname) => VOCABULARY_PATH_PATTERN.test(pathname);

const getCachedResponse = async (cache, url) => cache.match(getPathname(url), { ignoreVary: true });

const putCachedResponse = async (cache, url, response) => {
  await cache.put(getPathname(url), response.clone());
};

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("vocabulary-images-") && key !== VOCABULARY_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const pathname = new URL(request.url).pathname;
  if (!isVocabularyImagePath(pathname)) return;

  if (networkFetches.has(request.url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(VOCABULARY_CACHE);
      const cached = await getCachedResponse(cache, request.url);
      if (cached) return cached;

      networkFetches.add(request.url);
      try {
        const response = await fetch(request);
        if (response.ok) await putCachedResponse(cache, request.url, response);
        return response;
      } catch {
        return cached ?? new Response("", { status: 504, statusText: "Image unavailable offline" });
      } finally {
        networkFetches.delete(request.url);
      }
    })(),
  );
});
