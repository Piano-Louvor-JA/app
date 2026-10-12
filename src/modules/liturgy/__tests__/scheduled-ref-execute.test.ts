import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useScheduledStore } from '../stores/useScheduledStore'
import { executeLiturgyItem } from '../services/liturgy-actions'
import type { LiturgyItem } from '../types/liturgy'

const prefs: Record<string, unknown> = {}
vi.mock('@shared/services/browser-storage', () => ({
  getBrowserItem: vi.fn((key: string, fallback: unknown) => {
    return (globalThis.__TEST_PREFS__ as Record<string, unknown>)?.[key] ?? fallback
  }),
  setBrowserItem: vi.fn((key: string, value: unknown) => {
    const store = (globalThis.__TEST_PREFS__ ??= {}) as Record<string, unknown>
    store[key] = value
  }),
}))
declare global {
  // eslint-disable-next-line no-var
  var __TEST_PREFS__: Record<string, unknown> | undefined
}

vi.mock('@modules/media/stores/useMediaStore', () => ({
  useMediaStore: () => ({ open: vi.fn().mockResolvedValue({ ok: true }) }),
}))
vi.mock('../../media/stores', () => ({ useMediaStore: () => ({ open: vi.fn().mockResolvedValue({ ok: true }) }) }))
vi.mock('../../albums/stores/useAlbumsStore', () => ({
  useAlbumsStore: () => ({ playMusicFromLiturgy: vi.fn().mockResolvedValue({ ok: true }) }),
}))

// Delegação de projeção (exige Electron bridge): mock registra a chamada.
const projectionCalls: Array<{ fn: string; args: unknown[] }> = []
vi.mock('../services/liturgy-web-projection', () => ({
  playLiturgyLocalVideoOnScreens: vi.fn(async (filePath: string, title: string) => {
    projectionCalls.push({ fn: 'video', args: [filePath, title] })
    return true
  }),
  playLiturgyLocalVideoControl: vi.fn(async () => true),
  playLiturgyLocalImageOnScreens: vi.fn(async (filePaths: string[], title: string) => {
    projectionCalls.push({ fn: 'image', args: [filePaths, title] })
    return true
  }),
  playLiturgyLocalPdfOnScreens: vi.fn(async (filePath: string, title: string) => {
    projectionCalls.push({ fn: 'pdf', args: [filePath, title] })
    return true
  }),
  playLiturgyLocalPresentationOnScreens: vi.fn(async (filePath: string, title: string) => {
    projectionCalls.push({ fn: 'presentation', args: [filePath, title] })
    return true
  }),
  openLiturgyVideoControl: vi.fn(async () => true),
  openLiturgySiteControl: vi.fn(async () => true),
  playLiturgyWebOnConfiguredScreens: vi.fn(async () => true),
  publishLiturgyWebRuntime: vi.fn(),
  closeProjectionModule: vi.fn(),
  resolveTargetMonitorIds: vi.fn(async () => []),
  openProjectionModule: vi.fn(async () => true),
}))

vi.mock('@modules/media/services/open-music-player', () => ({
  openMusicPlayer: vi.fn(async (input: { musicId: number }) => {
    projectionCalls.push({ fn: 'music', args: [input] })
    return { ok: true }
  }),
}))

const router = {
  push: vi.fn().mockResolvedValue(undefined),
} as unknown as import('vue-router').Router

/** Item scheduled apontando pra categoria c1, usado num dia qualquer. */
function scheduledRef(id: string, categoryId: string): LiturgyItem {
  return {
    id,
    type: 'scheduled',
    name: 'Provai e Vede',
    subtitle: '',
    done: false,
    durationMs: 0,
    accentColor: '#00E676',
    categoryId,
  } as LiturgyItem
}

describe('scheduledRef — placeholder resolve a entrada da data e executa como o tipo dela', () => {
  beforeEach(() => {
    globalThis.__TEST_PREFS__ = {}
    setActivePinia(createPinia())
  })

  it('RED: conteúdo música da data executa como música (delega musicId/ modo)', async () => {
    const store = useScheduledStore()
    store.upsertCategory({ id: 'c1', name: 'Provai e Vede' })
    store.upsertItem({
      id: 's1',
      categoryId: 'c1',
      date: '2026-10-03',
      name: 'Provai 03/10',
      content: { kind: 'music', musicId: 1660, musicMode: 'audio' },
    })

    const item = scheduledRef('lit-1', 'c1')
    const result = await executeLiturgyItem(item, router, { dateISO: '2026-10-03' })

    expect(result.ok).toBe(true)
    expect(result.resolved?.kind).toBe('music')
    expect(result.resolved?.musicId).toBe(1660)
  })

  it('RED: sem entrada na data → resultado amigável (ok=false, messageKey)', async () => {
    const store = useScheduledStore()
    store.upsertCategory({ id: 'c1', name: 'Provai e Vede' })

    const item = scheduledRef('lit-2', 'c1')
    const result = await executeLiturgyItem(item, router)

    expect(result.ok).toBe(false)
    expect(result.messageKey).toBe('liturgy.messages.scheduledEmpty')
  })

  it('RED: data de referência vem do dia ativo (weekday) — resolve contra a data informada', async () => {
    const store = useScheduledStore()
    store.upsertCategory({ id: 'c1', name: 'Provai e Vede' })
    store.upsertItem({
      id: 's2',
      categoryId: 'c1',
      date: '2026-10-10',
      name: 'Provai 10/10',
      content: { kind: 'music', musicId: 1700 },
    })

    const item = scheduledRef('lit-3', 'c1')
    const result = await executeLiturgyItem(item, router, { dateISO: '2026-10-10' })

    expect(result.ok).toBe(true)
    expect(result.resolved?.kind).toBe('music')
  })

  it('RED: conteúdo filePath executa como vídeo/áudio (delega filePath)', async () => {
    const store = useScheduledStore()
    store.upsertCategory({ id: 'c1', name: 'Provai e Vede' })
    store.upsertItem({
      id: 's3',
      categoryId: 'c1',
      date: '2026-10-03',
      name: 'Clipe',
      content: { kind: 'file', filePath: 'C:/videos/clipe.mp4' },
    })

    const item = scheduledRef('lit-4', 'c1')
    const result = await executeLiturgyItem(item, router, { dateISO: '2026-10-03' })

    expect(result.ok).toBe(true)
    expect(result.resolved?.kind).toBe('file')
  })

  it('B1 regressão: import Delphi (filePath legado) continua funcionando e resolve como file', async () => {
    const store = useScheduledStore()
    const catsXml =
      '<DATAPACKET><ROWDATA><ROW ID="c1" NOME="Provai e Vede"/></ROWDATA></DATAPACKET>'
    const itemsXml =
      '<DATAPACKET><ROWDATA>' +
      '<ROW ID="i1" CATEGORIA="c1" DATA="12/10/2026" NOME="Sermão" ARQUIVO="C:\\sermao.pptx" ARQUIVO_INFO=""/>' +
      '</ROWDATA></DATAPACKET>'
    store.importFromDelphi(catsXml, itemsXml)
    // item legado SEM content: resolve como file (filePath) — compat com comportamento atual
    const item = scheduledRef('lit-5', 'c1')
    const result = await executeLiturgyItem(item, router, { dateISO: '2026-10-12' })
    expect(result.ok).toBe(true)
    expect(result.resolved?.kind).toBe('file')
  })
})


describe('activeDateISO — data do culto a partir do dia selecionado (modelo trimestre)', () => {
  beforeEach(() => {
    globalThis.__TEST_PREFS__ = {}
    setActivePinia(createPinia())
  })

  it('RED: dia saturday selecionado → data do sábado da semana corrente (ISO local)', async () => {
    const { activeDateISO } = await import('../services/liturgy-preferences')
    const { LITURGY_WEEKDAYS } = await import('../types/liturgy')
    const iso = activeDateISO('saturday')
    // sábado ISO sempre termina em '6' (dia de semana 6), e é local
    const d = new Date(iso + 'T12:00:00')
    expect(d.getDay()).toBe(6)
    expect(LITURGY_WEEKDAYS[d.getDay()]).toBe('saturday')
  })

  it('RED: dia custom (avulsa) → hoje', async () => {
    const { activeDateISO } = await import('../services/liturgy-preferences')
    const { todayISO } = await import('../services/liturgy-actions')
    expect(activeDateISO('custom')).toBe(todayISO())
  })

  it('RED: executeLiturgyItem sem dateISO usa o dia ATIVO da liturgia, não sempre hoje', async () => {
    const { activeDateISO } = await import('../services/liturgy-preferences')
    const store = useScheduledStore()
    store.upsertCategory({ id: 'c1', name: 'Provai e Vede' })
    store.upsertItem({
      id: 's9',
      categoryId: 'c1',
      date: activeDateISO('saturday'),
      name: 'Provai do sábado',
      content: { kind: 'music', musicId: 1717 },
    })
    const item = scheduledRef('lit-9', 'c1')
    // sem options: o execute tem que resolver contra o sábado da semana (data ativa)
    const result = await executeLiturgyItem(item, router, { day: 'saturday' })
    expect(result.ok).toBe(true)
    expect(result.resolved?.kind).toBe('music')
  })
})
