import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LITURGY_ITEM_DRAFT,
  type LiturgyItemDraft,
} from '../../types/liturgy'
import { isLiturgyItemDraftValid } from '../liturgy-item-helpers'

/**
 * Paridade web ff8b481: categoria é OPCIONAL para itens não-category.
 * Quem porta a liturgia do classic não tem categoria obrigatória — sem
 * isso o item não salvava/editava (feedback Ezequias/Rafael 02/10).
 */
function draftWith(partial: Partial<LiturgyItemDraft>): LiturgyItemDraft {
  return { ...DEFAULT_LITURGY_ITEM_DRAFT, ...partial }
}

describe('isLiturgyItemDraftValid — categoria opcional', () => {
  it('item de música SEM categoryId é válido (fica na raiz da timeline)', () => {
    const draft = draftWith({
      type: 'music',
      name: 'Missão para todos',
      musicId: 123,
      categoryId: null,
    })
    expect(isLiturgyItemDraftValid(draft)).toBe(true)
  })

  it('item de texto SEM categoryId é válido', () => {
    const draft = draftWith({
      type: 'text',
      name: 'Bem-vindo',
      categoryId: null,
    })
    expect(isLiturgyItemDraftValid(draft)).toBe(true)
  })

  it('category continua exigindo horário início/fim', () => {
    const draft = draftWith({
      type: 'category',
      name: 'Louvor',
      startTime: '',
      endTime: '',
    })
    expect(isLiturgyItemDraftValid(draft)).toBe(false)
  })

  it('música sem musicId continua inválida', () => {
    const draft = draftWith({
      type: 'music',
      name: 'X',
      musicId: null,
      categoryId: null,
    })
    expect(isLiturgyItemDraftValid(draft)).toBe(false)
  })

  it('sem nome continua inválido', () => {
    const draft = draftWith({
      type: 'text',
      name: '',
      categoryId: null,
    })
    expect(isLiturgyItemDraftValid(draft)).toBe(false)
  })
})
