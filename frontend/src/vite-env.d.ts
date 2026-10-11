/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_BOT_USERNAME?: string;
  readonly VITE_MOCK_TELEGRAM?: string;
  readonly VITE_MOCK_API?: string;
  readonly VITE_MOCK_NO_PHONE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
