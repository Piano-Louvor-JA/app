import { emptySelection } from './scripture-format'
import type { BibleSelection } from '../types/bible'

/**
 * Hook de pós-publicação, injetado pela frente (anti-deriva sem acoplamento):
 * o web registra o espelho do relay cloud (WT-5) em bootstrap; o app não
 * registra nada. Nenhum dos dois lados importa módulo próprio daqui dentro.
 */
type BibleRuntimeSink = (state: BibleProjectionRuntime) => void
const sinks: BibleRuntimeSink[] = []

/** Registro o uso no bootstrap da frente (uma vez). Idempotente. */
export function registerBibleRuntimeSink(sink: BibleRuntimeSink): void {
  if (!sinks.includes(sink)) sinks.push(sink)
}

export const BIBLE_RUNTIME_CHANNEL = 'louvorja-bible-runtime'
export const BIBLE_RUNTIME_STORAGE_KEY = 'louvorja-bible-runtime-state'

export type BibleProjectionRuntime = {
  active: boolean
  text: string
  reference: string
  /** Projeção ativa (intenção) — independe de haver versículo. */
  projecting: boolean
}

export const DEFAULT_BIBLE_RUNTIME: BibleProjectionRuntime = {
  active: false,
  text: '',
  reference: '',
  projecting: false,
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

export function selectionToRuntime(selection: BibleSelection): BibleProjectionRuntime {
  const text = selection.text.trim()
  const reference = selection.scripturalReference.trim()
  return {
    active: text.length > 0 && selection.verses.length > 0,
    text,
    reference,
    projecting: true,
  }
}

export function normalizeBibleRuntime(raw: unknown): BibleProjectionRuntime {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_BIBLE_RUNTIME }
  }

  const source = raw as Record<string, unknown>
  const text = asString(source.text, '')
  const reference = asString(source.reference, '')

  return {
    active: source.active === true && text.length > 0,
    text,
    reference,
    // storage LEGADO (sem a chave) = NAO projetando: quem projeta publica
    // runtime novo. Default true ressuscitava biblia de sessao morta (27/08).
    projecting: source.projecting === true,
  }
}

export function readBibleRuntimeFromStorage(): BibleProjectionRuntime {
  try {
    const raw = localStorage.getItem(BIBLE_RUNTIME_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_BIBLE_RUNTIME }
    return normalizeBibleRuntime(JSON.parse(raw) as unknown)
  } catch {
    return { ...DEFAULT_BIBLE_RUNTIME }
  }
}

export function writeBibleRuntimeToStorage(state: BibleProjectionRuntime): void {
  try {
    localStorage.setItem(BIBLE_RUNTIME_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage pode falhar em contextos restritos
  }
}

export function publishBibleRuntime(state: BibleProjectionRuntime): void {
  writeBibleRuntimeToStorage(state)

  try {
    const channel = new BroadcastChannel(BIBLE_RUNTIME_CHANNEL)
    channel.postMessage(state)
    channel.close()
  } catch {
    // BroadcastChannel pode não existir em ambientes antigos
  }

  for (const sink of sinks) {
    try {
      sink(state)
    } catch {
      // sink da frente falhou — publicação local permanece válida
    }
  }
}

export function publishBibleSelection(selection: BibleSelection = emptySelection()): void {
  publishBibleRuntime(selectionToRuntime(selection))
}

/**
 * Publica runtime "desligado" (spec takeover 27/08): usado quando a projeção
 * termina por caminho que não passa pelo clearProjectionWindow (watch de
 * 400ms) — sem isto o restore mantinha a bíblia na TV com projeção off.
 */
export function publishBibleRuntimeOff(): void {
  publishBibleRuntime({ ...DEFAULT_BIBLE_RUNTIME })
}
