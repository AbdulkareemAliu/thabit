/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_DISABLE_SW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
