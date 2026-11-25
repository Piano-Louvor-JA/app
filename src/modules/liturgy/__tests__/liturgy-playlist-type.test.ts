import { describe, expect, it } from 'vitest'

import {
  EXECUTABLE_ITEM_TYPES,
  LITURGY_ITEM_TYPES,
  LITURGY_ITEM_TYPE_META,
  LITURGY_TYPE_GROUPS,
  TYPES_WITHOUT_DURATION,
  getTypeDotColor,
} from '../types/liturgy'
import {
  getItemTypeIcon,
  isLiturgyItemDraftValid,
  isLiturgyMediaPlayType,
  buildLiturgyItemFromDraft,
  draftFromLiturgyItem,
} from '../services/liturgy-item-helpers'
import { DEFAULT_LITURGY_ITEM_DRAFT } from '../types/liturgy'

describe('liturgy item type: playlist', () => {
  it('playlist é um tipo válido', () => {
    expect(LITURGY_ITEM_TYPES).toContain('playlist')
  })

  it('playlist fica no grupo Default, entre música e itens agendados', () => {
    const defaults = LITURGY_TYPE_GROUPS.find((g) => g.id === 'default')
    expect(defaults).toBeDefined()
    const values = defaults!.types.map((chip) => chip.value)
    expect(values).toContain('playlist')
    expect(values.indexOf('playlist')).toBe(values.indexOf('music') + 1)
    expect(values.indexOf('scheduled')).toBe(values.indexOf('playlist') + 1)
  })

  it('playlist tem cor teal e ícone de playlist', () => {
    expect(getTypeDotColor('playlist')).toBe('#26A69A')
    const meta = LITURGY_ITEM_TYPE_META.find((m) => m.value === 'playlist')
    expect(meta).toMatchObject({ icon: 'ti-playlist' })
    expect(getItemTypeIcon('playlist')).toBe('ti-playlist')
  })

  it('playlist é executável, marca done ao tocar e não soma duração', () => {
    expect(EXECUTABLE_ITEM_TYPES).toContain('playlist')
    expect(isLiturgyMediaPlayType('playlist')).toBe(true)
    expect(TYPES_WITHOUT_DURATION).toContain('playlist')
  })

  it('draft de playlist exige playlistId', () => {
    const base = {
      ...DEFAULT_LITURGY_ITEM_DRAFT,
      type: 'playlist' as const,
      name: 'Louvor',
      playlistId: null,
    }
    expect(isLiturgyItemDraftValid(base)).toBe(false)
    expect(isLiturgyItemDraftValid({ ...base, playlistId: 'pl-1' })).toBe(true)
  })

  it('build/draft round-trip preserva playlistId', () => {
    const item = buildLiturgyItemFromDraft(
      {
        ...DEFAULT_LITURGY_ITEM_DRAFT,
        type: 'playlist',
        name: 'Abertura',
        subtitle: '3 músicas',
        playlistId: 'pl-abc',
      },
      { musicList: [], bibleBooks: [] },
    )
    expect(item.type).toBe('playlist')
    expect(item.playlistId).toBe('pl-abc')
    expect(item.name).toBe('Abertura')
    expect(item.durationMs).toBe(0)

    const draft = draftFromLiturgyItem(item)
    expect(draft.type).toBe('playlist')
    expect(draft.playlistId).toBe('pl-abc')
  })
})
