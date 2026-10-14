/**
 * Telemetria do renderer (Vue) — captura erros de UI e falhas de download.
 *
 * - DSN via `VITE_TELEMETRIA_DSN` (define do build). Sem DSN, tudo vira no-op:
 *   nenhum request sai, nenhum console.warn polui.
 * - O SDK (@sentry/electron/renderer) é carregado por import dinâmico apenas
 *   quando há DSN; falha de carga = telemetria silenciosamente desligada.
 */

import { RendererErrorBuffer } from './renderer-error-buffer'

type CaptureFn = (err: unknown, ctx?: Record<string, unknown>) => void;

type ConsoleError = typeof console.error

let captureError: CaptureFn | null = null;
let started = false;
let rendererErrorsStarted = false;
const rendererErrors = new RendererErrorBuffer()

function reportRendererErrors(): void {
  try { window.louvorja?.diagnostics?.reportRendererErrors?.(rendererErrors.snapshot()) } catch { /* best effort */ }
}

function errorDetails(value: unknown): { message: string; stack: string | null } {
  if (value instanceof Error) return { message: value.message, stack: value.stack ?? null }
  try { return { message: String(value ?? ''), stack: null } } catch { return { message: '[unserializable]', stack: null } }
}

export function startRendererErrorBuffer(): void {
  if (rendererErrorsStarted || typeof window === 'undefined') return
  rendererErrorsStarted = true
  const originalConsoleError: ConsoleError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    const details = errorDetails(args[0])
    rendererErrors.add({ kind: 'console.error', message: details.message, stack: details.stack, url: window.location.href })
    reportRendererErrors()
    originalConsoleError(...args)
  }
  window.addEventListener('error', (event) => {
    rendererErrors.add({ kind: 'onerror', message: event.message, stack: event.error?.stack, url: event.filename })
    reportRendererErrors()
  })
  window.addEventListener('unhandledrejection', (event) => {
    const details = errorDetails(event.reason)
    rendererErrors.add({ kind: 'unhandledrejection', message: details.message, stack: details.stack, url: window.location.href })
    reportRendererErrors()
  })
  reportRendererErrors()
}

export async function startRendererTelemetry(): Promise<void> {
  startRendererErrorBuffer()
  if (started) return;
  const dsn = import.meta.env.VITE_TELEMETRIA_DSN as string | undefined;
  if (!dsn) return;
  started = true;
  try {
    const sentry = (await import("@sentry/electron/renderer")) as {
      init: (opts: Record<string, unknown>) => void;
      captureException: (err: unknown, hint?: Record<string, unknown>) => void;
    };
    const beforeSend = (event: { level?: string } & Record<string, unknown>) => {
      if (!event.level || event.level === "info" || event.level === "debug") return null;
      return event;
    };
    sentry.init({
      dsn,
      environment: import.meta.env.DEV ? "development" : "production",
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend,
    });
    captureError = (err, ctx) => sentry.captureException(err, { extra: ctx });
  } catch {
    // sem telemetria — app segue normal
  }
}

/** Captura um erro de UI/download se a telemetria estiver ativa; nunca lança. */
export function reportError(err: unknown, context: Record<string, unknown> = {}): void {
  try {
    captureError?.(err, context);
  } catch {
    // telemetria nunca é motivo de quebra
  }
}

/** Registro manual p/ testes e bootstrap explícito (main.ts chama o start). */
export function setTelemetryCapture(fn: CaptureFn | null): void {
  captureError = fn;
}
