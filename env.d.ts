/// <reference types="vite/client" />

import type { LouvorJaBridge } from './src/shared/types/desktop-bridge'

declare global {
  const __APP_VERSION__: string

  interface Window {
    louvorja?: LouvorJaBridge
  }
}

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: string
  readonly VITE_URL_FILES?: string
  readonly VITE_URL_DATABASE?: string
  readonly VITE_API_TOKEN?: string
  /** Build de campanha (SrCaldeira/Ezequias): expõe rota+card do diagnóstico. */
  readonly VITE_DIAGNOSTICS_CAMPAIGN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.svg' {
  const src: string
  export default src
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.jpeg' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

export {}
