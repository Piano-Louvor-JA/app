// @vitest-environment jsdom
// Popup independente da Bíblia lê canal próprio: o takeover da principal
// (runtime principal desligado) não apaga o versículo dela.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

vi.mock('@shared/services/projection-window-location', () => ({
  isIndependentProjectionLocation: () => true,
}))

vi.mock('../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: vi.fn(() => ({
    backgroundColor: null,
    backgroundImage: null,
    bibleFontSize: 48,
    bibleTextColor: '#fff',
    bibleFontWeight: 600,
    textAlign: 'center',
    textShadow: false,
    shadowBlur: 0,
    shadowIntensity: 0,
    showBibleVersion: true,
    footerRefColor: '#ccc',
    footerRefWeight: 500,
    textBox: false,
    boxOpacity: 0,
    boxBorder: false,
  })),
  subscribeStageSettings: vi.fn(() => vi.fn()),
}))

vi.mock('@design-system/index', () => ({
  ProjectionBackground: { name: 'ProjectionBackground', template: '<div><slot /></div>' },
}))

import BibleProjectionView from '../views/BibleProjectionView.vue'
import { BIBLE_RUNTIME_STORAGE_KEY } from '../services/bible-runtime'
import { BIBLE_INDEPENDENT_STORAGE_KEY } from '../services/bible-independent-runtime'

function writeState(key: string, text: string) {
  localStorage.setItem(
    key,
    JSON.stringify({ active: Boolean(text), text, reference: 'Jo 3:16 (ARA)', projecting: Boolean(text) }),
  )
}

describe('BibleProjectionView (independente)', () => {
  beforeEach(() => localStorage.clear())

  it('mostra o canal independente e ignora o runtime principal', async () => {
    writeState(BIBLE_RUNTIME_STORAGE_KEY, 'Texto da principal')
    writeState(BIBLE_INDEPENDENT_STORAGE_KEY, 'Porque Deus amou o mundo')
    const wrapper = mount(BibleProjectionView)
    await flushPromises()
    expect(wrapper.find('.bible-projection__text').text()).toBe('Porque Deus amou o mundo')

    // Takeover desliga a principal: a independente continua
    writeState(BIBLE_RUNTIME_STORAGE_KEY, '')
    window.dispatchEvent(new StorageEvent('storage', { key: BIBLE_RUNTIME_STORAGE_KEY }))
    await flushPromises()
    expect(wrapper.find('.bible-projection__text').text()).toBe('Porque Deus amou o mundo')

    writeState(BIBLE_INDEPENDENT_STORAGE_KEY, 'Deu o seu Filho unigênito')
    window.dispatchEvent(new StorageEvent('storage', { key: BIBLE_INDEPENDENT_STORAGE_KEY }))
    await flushPromises()
    expect(wrapper.find('.bible-projection__text').text()).toBe('Deu o seu Filho unigênito')
    wrapper.unmount()
  })
})
