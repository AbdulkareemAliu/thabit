import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { VitePWA } from "vite-plugin-pwa";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const vocabularyDir = path.join(rootDir, "vocabulary");
const useHttps = process.env.THABIT_HTTPS === "1";

type LanAddress = {
  name: string;
  address: string;
};

const getLanIPv4Candidates = (): LanAddress[] => {
  const candidates: LanAddress[] = [];
  for (const [name, interfaces] of Object.entries(os.networkInterfaces())) {
    if (!interfaces) continue;
    for (const iface of interfaces) {
      if (iface.family !== "IPv4" || iface.internal || iface.address.startsWith("169.254.")) continue;
      candidates.push({ name, address: iface.address });
    }
  }

  return [
    ...candidates.filter((candidate) => /^en\d+$/.test(candidate.name)),
    ...candidates.filter((candidate) => !/^en\d+$/.test(candidate.name)),
  ];
};

const envLanIp = process.env.THABIT_LAN_IP?.trim();
const lanCandidates = getLanIPv4Candidates();
const lanIp = envLanIp || lanCandidates[0]?.address;
const phonePreview = process.env.THABIT_PHONE === "1";
const noStoreHeaders = {
  "Cache-Control": "no-store",
};

const printPhoneUrls = (server: ViteDevServer | PreviewServer, protocol: "http" | "https", context: "dev" | "phone" | "preview") => {
  server.httpServer?.once("listening", () => {
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") return;

    const port = (address as AddressInfo).port;
    const urls = envLanIp
      ? [{ name: "THABIT_LAN_IP", address: envLanIp }]
      : lanCandidates.length > 0
        ? lanCandidates
        : [{ name: "manual", address: "YOUR_LAPTOP_IP" }];

    console.log("\n  📱 Open on your phone (Safari, same WiFi):");
    for (const candidate of urls) {
      console.log(`     ${protocol}://${candidate.address}:${port}/?fresh=${Date.now()}  (${candidate.name})`);
    }
    if (context === "phone") {
      console.log("     If Safari shows FetchEvent / LoadFailed errors, reload once — old service worker is being cleared.");
      console.log("     If it does not connect at all, try the other URL above or set THABIT_LAN_IP=<your Mac WiFi IP>.");
      console.log("     Re-run npm run dev:phone after code changes. Do not use a home-screen icon.");
    } else if (context === "dev") {
      console.log("     Dev mode is for your laptop only — it usually fails on phones.");
      console.log("     For phone testing, run: npm run dev:phone");
    } else if (protocol === "https") {
      console.log("     (Tap Advanced → Continue if Safari warns about the certificate)");
    }
    console.log("");
  });
};

const vocabularyImagePattern = /\.(png|svg)$/i;

const copyVocabularyImages = (destinationRoot: string) => {
  if (!fs.existsSync(vocabularyDir)) return;

  for (const lessonFolder of fs.readdirSync(vocabularyDir)) {
    const lessonSource = path.join(vocabularyDir, lessonFolder);
    if (!fs.statSync(lessonSource).isDirectory()) continue;

    for (const assetFolder of ["noun_images", "verb_images", "phrase_images"]) {
      const imageSource = path.join(lessonSource, assetFolder);
      if (!fs.existsSync(imageSource)) continue;

      const imageDestination = path.join(destinationRoot, "vocabulary", lessonFolder, assetFolder);
      fs.mkdirSync(imageDestination, { recursive: true });

      for (const fileName of fs.readdirSync(imageSource)) {
        if (!vocabularyImagePattern.test(fileName)) continue;
        fs.copyFileSync(path.join(imageSource, fileName), path.join(imageDestination, fileName));
      }
    }
  }
};

const collectVocabularyImageUrls = (vocabularyRoot: string) => {
  const urls: string[] = [];
  if (!fs.existsSync(vocabularyRoot)) return urls;

  const walk = (directory: string, urlPrefix: string) => {
    for (const entry of fs.readdirSync(directory)) {
      const fullPath = path.join(directory, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        walk(fullPath, `${urlPrefix}/${entry}`);
        continue;
      }
      if (vocabularyImagePattern.test(entry)) urls.push(`${urlPrefix}/${entry}`);
    }
  };

  for (const lessonFolder of fs.readdirSync(vocabularyRoot)) {
    const lessonPath = path.join(vocabularyRoot, lessonFolder);
    if (!fs.statSync(lessonPath).isDirectory()) continue;
    walk(lessonPath, `/vocabulary/${lessonFolder}`);
  }

  return urls;
};

const writeOfflineAssetManifest = (distDir: string) => {
  const urls = collectVocabularyImageUrls(path.join(distDir, "vocabulary"));
  fs.writeFileSync(path.join(distDir, "offline-asset-manifest.json"), JSON.stringify(urls));
};

const serveVocabularyImages = (server: ViteDevServer) => {
  server.middlewares.use("/vocabulary", (request, response, next) => {
    if (!request.url || request.method !== "GET") {
      next();
      return;
    }

    const requestPath = decodeURIComponent(request.url.split("?")[0] ?? "");
    // Mounted at /vocabulary, so req.url is e.g. /01_Greetings/noun_images/noun_001.png (no prefix).
    const relativePath = requestPath.replace(/^\/vocabulary\/?/, "").replace(/^\/+/, "");
    const filePath = path.normalize(path.join(vocabularyDir, relativePath));

    if (!filePath.startsWith(vocabularyDir) || !vocabularyImagePattern.test(filePath) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      next();
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.setHeader("Content-Type", extension === ".svg" ? "image/svg+xml" : "image/png");
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    fs.createReadStream(filePath).pipe(response);
  });

  server.middlewares.use("/offline-asset-manifest.json", (request, response, next) => {
    if (request.method !== "GET") {
      next();
      return;
    }

    const urls = collectVocabularyImageUrls(vocabularyDir);
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(urls));
  });
};

const networkUrlsPlugin = (context: "dev" | "phone" | "preview"): Plugin => ({
  name: "network-urls",
  configureServer(server) {
    printPhoneUrls(server, useHttps ? "https" : "http", "dev");
  },
  configurePreviewServer(server) {
    printPhoneUrls(server, useHttps ? "https" : "http", phonePreview ? "phone" : "preview");
  },
});

const phoneRequestLogPlugin = (): Plugin => ({
  name: "phone-request-log",
  configureServer(server) {
    server.middlewares.use("/__thabit_ping", (request, response, next) => {
      if (request.method !== "GET") {
        next();
        return;
      }
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(`thabit ok ${new Date().toISOString()}\n`);
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use("/__thabit_ping", (request, response, next) => {
      if (request.method !== "GET") {
        next();
        return;
      }
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      console.log(`  phone-preview request: ${request.socket.remoteAddress ?? "unknown"} ${request.method} ${request.url}`);
      response.end(`thabit ok ${new Date().toISOString()}\n`);
    });

    if (!phonePreview) return;
    server.middlewares.use((request, _response, next) => {
      if (request.url === "/" || request.url?.startsWith("/?") || request.url?.startsWith("/assets/")) {
        console.log(`  phone-preview request: ${request.socket.remoteAddress ?? "unknown"} ${request.method} ${request.url}`);
      }
      next();
    });
  },
});

const vocabularyStaticPlugin = (): Plugin => ({
  name: "vocabulary-static",
  configureServer(server) {
    serveVocabularyImages(server);
  },
  configurePreviewServer(server) {
    serveVocabularyImages(server);
  },
  closeBundle() {
    const distDir = path.join(rootDir, "dist");
    copyVocabularyImages(distDir);
    writeOfflineAssetManifest(distDir);
  },
});

const clearStaleServiceWorkerScript = `(function(){if(!("serviceWorker"in navigator))return;var p=new URLSearchParams(location.search);if(p.has("sw-cleared"))return;navigator.serviceWorker.getRegistrations().then(function(r){if(!r.length)return;var d=Promise.all(r.map(function(x){return x.unregister()}));if("caches"in window){d=d.then(function(){return caches.keys().then(function(k){return Promise.all(k.map(function(c){return caches.delete(c)}))})})}return d.then(function(){try{navigator.serviceWorker.register("/sw-clear.js")}catch(e){}p.set("sw-cleared","1");location.replace(location.pathname+"?"+p.toString()+location.hash)})})})();`;

const clearStaleServiceWorkerPlugin = (enabled: boolean): Plugin => ({
  name: "clear-stale-service-worker",
  transformIndexHtml(html) {
    if (!enabled) return html;
    return html.replace("<head>", `<head>\n    <script id="thabit-clear-sw">${clearStaleServiceWorkerScript}</script>`);
  },
});

export default defineConfig(({ mode }) => {
  const disableServiceWorker = process.env.VITE_DISABLE_SW === "1" || mode === "development";

  return {
    server: {
      host: "0.0.0.0",
      port: 5173,
      headers: noStoreHeaders,
      ...(lanIp
        ? {
            hmr: {
              host: lanIp,
            },
          }
        : {}),
    },
    preview: {
      host: "0.0.0.0",
      port: 4173,
      strictPort: phonePreview,
      allowedHosts: true,
      headers: noStoreHeaders,
    },
    plugins: [
      ...(useHttps
        ? [
            basicSsl({
              name: "thabit-local",
              domains: lanIp ? [lanIp] : [],
            }),
          ]
        : []),
      networkUrlsPlugin(mode === "development" ? "dev" : phonePreview ? "phone" : "preview"),
      clearStaleServiceWorkerPlugin(disableServiceWorker),
      phoneRequestLogPlugin(),
      vocabularyStaticPlugin(),
      react(),
      tailwindcss(),
      VitePWA({
        disable: disableServiceWorker,
        registerType: "autoUpdate",
        injectRegister: null,
        includeAssets: [
          "offline-asset-manifest.json",
          "icon.svg",
          "icons/thabit-icon-192.png",
          "icons/thabit-icon-512.png",
          "icons/thabit-icon-maskable-192.png",
          "icons/thabit-icon-maskable-512.png",
        ],
        manifest: {
          name: "Thabit",
          short_name: "Thabit",
          description: "Arabic vocabulary learning",
          theme_color: "#07130f",
          background_color: "#07130f",
          display: "standalone",
          orientation: "portrait",
          start_url: "/",
          icons: [
            {
              src: "/icons/thabit-icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icons/thabit-icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icons/thabit-icon-maskable-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "/icons/thabit-icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          // Precache only the app shell. Vocabulary images download to IndexedDB (see offline-storage.ts).
          globPatterns: ["**/*.{js,css,html,ico,svg,woff2,json}", "icons/**/*.png"],
          globIgnores: ["vocabulary/**"],
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/vocabulary\//, /^\/icons\//, /^\/offline-asset-manifest\.json$/],
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /^\/offline-asset-manifest\.json$/i,
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "offline-manifest",
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
  };
});
