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
  /** SPEC bundle-sync v1.2.0 ADR-11: origem upstream de /db/* (bundles). */
  readonly VITE_URL_BUNDLES?: string
  readonly VITE_API_TOKEN?: string
  /**
   * Token de parceiro da API Piano (`X-Partner-Key`, formato `plj_…`).
   * Override do build; senão use STG/PROD abaixo conforme o perfil.
   */
  readonly VITE_PARTNER_KEY?: string
  /** Chave gerada na VPS de staging (`partners create "LouvorJA Desktop"`). */
  readonly VITE_PARTNER_KEY_STG?: string
  /** Chave gerada na VPS de produção (secret de release). */
  readonly VITE_PARTNER_KEY_PROD?: string
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
