// SDK opcional da telemetria do renderer (src/shared/services/telemetry.ts).
// Na dev-tudo o pacote @sentry/electron não é dependência: o import dinâmico
// só roda com VITE_TELEMETRIA_DSN e, se falhar, a telemetria fica desligada.
declare module '@sentry/electron/renderer' {
  export function init(options: Record<string, unknown>): void
  export function captureException(
    error: unknown,
    hint?: Record<string, unknown>,
  ): string
}
