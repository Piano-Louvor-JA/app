// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BIBLE_INDEPENDENT_CHANNEL,
  BIBLE_INDEPENDENT_STORAGE_KEY,
  publishBibleIndependentSelection,
  readBibleIndependentFromStorage,
} from '../services/bible-independent-runtime'
import { BIBLE_RUNTIME_STORAGE_KEY } from '../services/bible-runtime'

const SELECTION = {
  versionId: 1,
  bookId: 43,
  versionAbbreviation: 'ARA',
  bookName: 'João',
  chapter: 3,
  verses: [16],
  scripturalReference: 'João 3:16 (ARA)',
  text: 'Porque Deus amou o mundo de tal maneira',
}

describe('bible-independent-runtime', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('publica em chave e canal próprios, sem tocar no runtime principal', () => {
    const posted: unknown[] = []
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor(public name: string) {}
        postMessage(data: unknown) {
          posted.push([this.name, data])
        }
        close() {}
      },
    )
    publishBibleIndependentSelection(SELECTION)

    expect(localStorage.getItem(BIBLE_RUNTIME_STORAGE_KEY)).toBeNull()
    expect(readBibleIndependentFromStorage()).toEqual({
      active: true,
      text: SELECTION.text,
      reference: SELECTION.scripturalReference,
      projecting: true,
    })
    expect(posted).toEqual([[BIBLE_INDEPENDENT_CHANNEL, expect.objectContaining({ active: true })]])
  })

  it('sem seleção publica vazio (tela preta)', () => {
    publishBibleIndependentSelection()
    expect(readBibleIndependentFromStorage().active).toBe(false)
  })

  it('storage vazio ou corrompido volta ao padrão', () => {
    expect(readBibleIndependentFromStorage().active).toBe(false)
    localStorage.setItem(BIBLE_INDEPENDENT_STORAGE_KEY, '{nope')
    expect(readBibleIndependentFromStorage()).toEqual({
      active: false,
      text: '',
      reference: '',
      projecting: false,
    })
  })

  it('falhas de storage e BroadcastChannel não propagam', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => publishBibleIndependentSelection(SELECTION)).not.toThrow()
    setItem.mockRestore()
  })
})
