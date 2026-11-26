import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import SignPlayer from '../components/SignPlayer.vue'
import { signPackStore } from '../sign-pack-store'

vi.mock('@shared/services/user-preferences', () => ({
  getUserPreference: () => null,
  setUserPreference: () => ({}),
}))

const rawPack = {
  locale: 'lsb',
  version: '1.0.0',
  license: 'CC-BY-4.0',
  attribution: 'Comunidade PIANO',
  glossary: {
    DEUS: { signs: ['DEUS'], fingerspelling: false, video: { url: 'deus.webm', size: 1000 } },
  },
}

describe('F1.3 — SignPlayer', () => {
  it('renderiza aviso de tradução automática + termo atual quando pack ativo', () => {
    signPackStore.import(rawPack)
    const w = mount(SignPlayer, { props: { terms: ['DEUS', 'AMOR'] } })
    expect(w.find('[data-testid="sign-player"]').exists()).toBe(true)
    expect(w.find('[data-testid="sign-auto-notice"]').text()).toContain('Tradução automática')
  })

  it('termo sem vídeo → fingerspelling visível (fallback transparente)', async () => {
    signPackStore.import(rawPack)
    const w = mount(SignPlayer, { props: { terms: ['CASA'] } })
    expect(w.find('[data-testid="sign-fingerspelling"]').exists()).toBe(true)
  })

  it('sem terms → não renderiza nada (degradação silenciosa)', () => {
    signPackStore.clear()
    const w = mount(SignPlayer, { props: { terms: [] } })
    expect(w.find('[data-testid="sign-player"]').exists()).toBe(false)
  })
})
