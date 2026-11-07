import { beforeEach, describe, expect, it } from 'vitest'

const values = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
})

import {
  loadAnnouncementsState,
  newAnnouncementsId,
  normalizeAnnouncementsState,
  saveAnnouncementsState,
} from '../announcements-preferences'
import {
  ANNOUNCEMENTS_MEDIA_DIR,
  CAROUSEL_SLIDE_MS_DEFAULT,
  CAROUSEL_SLIDE_MS_MAX,
  CAROUSEL_SLIDE_MS_MIN,
  type AnnouncementsState,
} from '../../types/announcements'

function userData(): Record<string, unknown> {
  return JSON.parse(values.get('user_data') ?? '{}')
}

const imagePath = `${ANNOUNCEMENTS_MEDIA_DIR}/a1/foto-1.jpg`

function sampleState(): AnnouncementsState {
  return {
    version: 1,
    activeListId: 'l2',
    carousel: { slideMs: 5_000, loop: false },
    lists: [
      { id: 'l1', name: 'Sábado manhã', items: [] },
      {
        id: 'l2',
        name: 'Culto jovem',
        items: [
          { id: 't1', kind: 'text', title: 'Batismo', titleColor: '#ff0000', html: '<p>Dia <b>20</b></p>', plainText: 'Dia 20' },
          { id: 'a1', kind: 'images', title: 'Fotos', files: [{ relativePath: imagePath, name: 'foto.jpg' }] },
          { id: 'v1', kind: 'video', title: 'Chamada', file: null },
          { id: 'p1', kind: 'presentation', title: 'Relatório', file: null },
          { id: 'u1', kind: 'url', title: 'Canal', url: 'https://youtu.be/abc' },
        ],
      },
    ],
  }
}

describe('normalizeAnnouncementsState', () => {
  it('sem nada cria uma lista vazia com o nome padrão e ativa', () => {
    const state = normalizeAnnouncementsState(null, 'Avisos')
    expect(state.lists).toHaveLength(1)
    expect(state.lists[0]).toMatchObject({ name: 'Avisos', items: [] })
    expect(state.lists[0]!.id).toBeTruthy()
    expect(state.activeListId).toBe(state.lists[0]!.id)
    expect(state.carousel).toEqual({ slideMs: CAROUSEL_SLIDE_MS_DEFAULT, loop: true })
  })

  it('mantém um estado válido como está', () => {
    expect(normalizeAnnouncementsState(sampleState(), 'Avisos')).toEqual(sampleState())
  })

  it('lista ativa inexistente cai na primeira lista', () => {
    const raw = { ...sampleState(), activeListId: 'sumiu' }
    expect(normalizeAnnouncementsState(raw, 'Avisos').activeListId).toBe('l1')
  })

  it('descarta listas e avisos inválidos sem perder os válidos', () => {
    const raw = {
      lists: [
        null,
        { id: '', name: 'sem id', items: [] },
        { id: 'l1', name: 'Ok', items: [
          { id: 'x', kind: 'desconhecido', title: 'x' },
          { kind: 'text', title: 'sem id' },
          { id: 't1', kind: 'text', title: 'Bom', html: '<p>a</p>' },
        ] },
      ],
    }
    const state = normalizeAnnouncementsState(raw, 'Avisos')
    expect(state.lists.map((l) => l.id)).toEqual(['l1'])
    expect(state.lists[0]!.items).toEqual([
      { id: 't1', kind: 'text', title: 'Bom', titleColor: '', html: '<p>a</p>', plainText: 'a' },
    ])
  })

  it('remove HTML perigoso do texto', () => {
    const raw = { lists: [{ id: 'l1', name: 'L', items: [
      { id: 't1', kind: 'text', title: 'T', html: '<p onclick="x()">oi<script>alert(1)</script></p>' },
    ] }] }
    const item = normalizeAnnouncementsState(raw, 'Avisos').lists[0]!.items[0]!
    expect(item.kind === 'text' && item.html).not.toMatch(/script|onclick/)
  })

  it('recusa arquivos fora da pasta de avisos ou com ..', () => {
    const raw = { lists: [{ id: 'l1', name: 'L', items: [
      { id: 'a1', kind: 'images', title: 'I', files: [
        { relativePath: `${ANNOUNCEMENTS_MEDIA_DIR}/a1/ok.png`, name: 'ok.png' },
        { relativePath: 'C:/Users/fotos/x.png', name: 'x.png' },
        { relativePath: `${ANNOUNCEMENTS_MEDIA_DIR}/../segredo.txt`, name: 's' },
      ] },
      { id: 'v1', kind: 'video', title: 'V', file: { relativePath: '/etc/passwd', name: 'p' } },
    ] }] }
    const [images, video] = normalizeAnnouncementsState(raw, 'Avisos').lists[0]!.items
    expect(images).toMatchObject({ files: [{ name: 'ok.png' }] })
    expect(video).toMatchObject({ file: null })
  })

  it('"fora do carrossel" só é guardado quando é false (texto e imagens)', () => {
    const raw = { lists: [{ id: 'l1', name: 'L', items: [
      { id: 't1', kind: 'text', title: 'T', html: '<p>a</p>', inCarousel: false },
      { id: 't2', kind: 'text', title: 'T', html: '<p>a</p>', inCarousel: true },
      { id: 'a1', kind: 'images', title: 'I', files: [], inCarousel: false },
      { id: 'a2', kind: 'images', title: 'I', files: [], inCarousel: 'não' },
    ] }] }
    const [t1, t2, a1, a2] = normalizeAnnouncementsState(raw, 'Avisos').lists[0]!.items
    expect(t1).toMatchObject({ inCarousel: false })
    expect(t2).not.toHaveProperty('inCarousel')
    expect(a1).toMatchObject({ inCarousel: false })
    expect(a2).not.toHaveProperty('inCarousel')
  })

  it('URL é guardada sem espaços; sem URL fica vazia', () => {
    const raw = { lists: [{ id: 'l1', name: 'L', items: [
      { id: 'u1', kind: 'url', title: 'Site', url: '  https://adventistas.org  ' },
      { id: 'u2', kind: 'url', title: 'Sem' },
    ] }] }
    const [first, second] = normalizeAnnouncementsState(raw, 'Avisos').lists[0]!.items
    expect(first).toEqual({ id: 'u1', kind: 'url', title: 'Site', url: 'https://adventistas.org' })
    expect(second).toEqual({ id: 'u2', kind: 'url', title: 'Sem', url: '' })
  })

  it('engine salvo por versões antigas some (o módulo usa só o modo interno)', () => {
    const raw = { lists: [{ id: 'l1', name: 'L', items: [
      { id: 'p1', kind: 'presentation', title: 'P', file: null, presentationEngine: 'powerpoint' },
    ] }] }
    const item = normalizeAnnouncementsState(raw, 'Avisos').lists[0]!.items[0]!
    expect(item).not.toHaveProperty('presentationEngine')
  })

  it.each([
    [500, CAROUSEL_SLIDE_MS_MIN],
    [99_999_999, CAROUSEL_SLIDE_MS_MAX],
    ['10', CAROUSEL_SLIDE_MS_DEFAULT],
    [Number.NaN, CAROUSEL_SLIDE_MS_DEFAULT],
  ])('tempo do carrossel %s vira %s', (slideMs, expected) => {
    const state = normalizeAnnouncementsState({ carousel: { slideMs, loop: 'sim' } }, 'Avisos')
    expect(state.carousel).toEqual({ slideMs: expected, loop: true })
  })
})

describe('newAnnouncementsId', () => {
  it('usa randomUUID quando existe e um id próprio quando não', () => {
    expect(newAnnouncementsId()).toMatch(/^[0-9a-f-]{36}$/)
    const original = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined })
    try {
      const id = newAnnouncementsId()
      expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/)
      expect(newAnnouncementsId()).not.toBe(id)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: original })
    }
  })
})

describe('load/save', () => {
  beforeEach(() => values.clear())

  it('roundtrip: o que foi salvo volta igual depois de recarregar', () => {
    saveAnnouncementsState(sampleState())
    expect(userData()).toHaveProperty(['announcements.state'])
    expect(loadAnnouncementsState('Avisos')).toEqual(sampleState())
  })

  it('não mexe nas outras preferências', () => {
    values.set('user_data', JSON.stringify({ theme: 'dark' }))
    saveAnnouncementsState(sampleState())
    expect(userData().theme).toBe('dark')
  })

  it('primeira abertura devolve a lista padrão', () => {
    expect(loadAnnouncementsState('Avisos').lists[0]!.name).toBe('Avisos')
  })
})
