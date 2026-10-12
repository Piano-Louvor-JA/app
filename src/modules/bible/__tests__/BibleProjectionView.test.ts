// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// runtime de storage controlado por teste
let storageRuntime: unknown = { active: true, text: 'No princípio', reference: 'Gn 1:1 (ARA)' }

vi.mock('../services/bible-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/bible-runtime')>()
  return {
    ...actual,
    readBibleRuntimeFromStorage: vi.fn(() => storageRuntime),
  }
})

const stageSettings = {
  backgroundColor: '#0b0b0b',
  backgroundImage: 'img:bg.png',
  bibleFontSize: 48,
  bibleTextColor: '#fff',
  bibleFontWeight: 600,
  textAlign: 'center',
  textShadow: true,
  shadowBlur: 54,
  shadowIntensity: 0.5,
  showBibleVersion: true,
  footerRefColor: '#ccc',
  footerRefWeight: 500,
  textBox: true,
  boxOpacity: 0.4,
  boxBorder: true,
}

vi.mock('../../settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: vi.fn(() => ({ ...stageSettings })),
  subscribeStageSettings: vi.fn(() => vi.fn()),
}))

vi.mock('../../settings/types/stage-settings', () => ({
  resolveBackgroundImage: vi.fn(() => 'http://localhost/bg.png'),
  stageFlexAlign: vi.fn(() => ({ justifyContent: 'center' })),
}))

vi.mock('@design-system/index', () => ({
  ProjectionBackground: { name: 'ProjectionBackground', template: '<div class="pb-stub"><slot /></div>' },
}))

import BibleProjectionView from '../views/BibleProjectionView.vue'
import { BIBLE_RUNTIME_STORAGE_KEY, readBibleRuntimeFromStorage } from '../services/bible-runtime'
import { flushPromises } from '@vue/test-utils'

const mountView = async (props?: Record<string, unknown>) => {
  const wrapper = mount(BibleProjectionView, props ? { props } : undefined)
  // onMounted lê o runtime (refreshRuntime) após o 1º render
  await flushPromises()
  return wrapper
}

describe('BibleProjectionView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    storageRuntime = { active: true, text: 'No princípio', reference: 'Gn 1:1 (ARA)' }
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('conteúdo ativo: mostra texto e referência; estilo do palco aplicado', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('.bible-projection__content').exists()).toBe(true)
    expect(wrapper.find('.bible-projection__text').text()).toBe('No princípio')
    // showBibleVersion=true → referência com (ARA)
    expect(wrapper.find('.bible-projection__reference').text()).toBe('Gn 1:1 (ARA)')
    const style = wrapper.find('.bible-projection').attributes('style') ?? ''
    expect(style).toContain('bg.png')
    // caixa: backgroundColor rgba + border
    const verseStyle = wrapper.find('.bible-projection__text').attributes('style') ?? ''
    expect(verseStyle).toContain('rgba(0, 0, 0, 0.4)')
    expect(verseStyle).toContain('text-shadow')
  })

  it('inativo ou sem texto: estado vazio', async () => {
    storageRuntime = { active: false, text: 'x', reference: 'y' }
    const w1 = await mountView()
    expect(w1.find('.bible-projection__content').exists()).toBe(false)
    w1.unmount()

    storageRuntime = { active: true, text: '', reference: '' }
    const w2 = await mountView()
    expect(w2.find('.bible-projection__content').exists()).toBe(false)
    w2.unmount()
  })

  it('showBibleVersion off: remove sufixo (versão) da referência', async () => {
    stageSettings.showBibleVersion = false
    const wrapper = await mountView()
    expect(wrapper.find('.bible-projection__reference').text()).toBe('Gn 1:1')
    stageSettings.showBibleVersion = true
  })

  it('textBox off: sem caixa no versículo', async () => {
    stageSettings.textBox = false
    const wrapper = await mountView()
    const verseStyle = wrapper.find('.bible-projection__text').attributes('style') ?? ''
    expect(verseStyle).not.toContain('background-color')
    stageSettings.textBox = true
  })

  it('fonte adaptativa: ramos de escala para textos longos/curtos', async () => {
    // jsdom descarta font-size com unidade cqw na serialização do style;
    // os ramos do adaptiveBibleFontScale são exercitados e o pipeline cqw
    // é verificado via text-shadow (0 0 50cqw).
    const casos = [
      { len: 400, ramo: '>360' },
      { len: 300, ramo: '>260' },
      { len: 200, ramo: '>170' },
      { len: 50, ramo: 'base' },
    ]
    for (const c of casos) {
      storageRuntime = { active: true, text: 'p'.repeat(c.len), reference: 'ref' }
      const w = await mountView()
      const st = w.find('.bible-projection__text').attributes('style') ?? ''
      expect(st).toContain('50cqw') // pipeline de unidades do Palco intacto
      w.unmount()
    }
  })

  it('storage event com a chave certa atualiza o runtime', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('.bible-projection__text').text()).toBe('No princípio')

    storageRuntime = { active: true, text: 'Novo texto', reference: 'Jo 3:16' }
    window.dispatchEvent(new StorageEvent('storage', { key: BIBLE_RUNTIME_STORAGE_KEY }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.bible-projection__text').text()).toBe('Novo texto')

    // chave diferente: ignora
    storageRuntime = { active: true, text: 'Outro', reference: '' }
    window.dispatchEvent(new StorageEvent('storage', { key: 'outra-chave' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.bible-projection__text').text()).toBe('Novo texto')
    wrapper.unmount()
  })

  it('BroadcastChannel: mensagem normalizada atualiza o runtime', async () => {
    const wrapper = await mountView()
    // canal real criado no mount; envia mensagem direto
    const event = new MessageEvent('message', { data: { active: true, text: 'Via canal', reference: 'Sl 23' } })
    // encontra o canal: cria um igual e despacha pelo listener registrado
    // (BroadcastChannel do jsdom não roteia entre instâncias; usamos storage como
    // ponte real: o canal recebe de outra aba — simulamos com evento no canal)
    const channel = new BroadcastChannel((await import('../services/bible-runtime')).BIBLE_RUNTIME_CHANNEL)
    channel.postMessage({ active: true, text: 'Via canal', reference: 'Sl 23' })
    await new Promise((r) => setTimeout(r, 20))
    expect(wrapper.find('.bible-projection__text').text()).toBe('Via canal')
    channel.close()
    wrapper.unmount()
  })

  it('unmount: remove listeners e fecha canal sem erro', async () => {
    const wrapper = await mountView()
    expect(() => wrapper.unmount()).not.toThrow()
  })

  it('ramos de personalização: sem bg, sem sombra, sem border, ref vazia e só-referência', async () => {
    // sem imagem de fundo → backgroundImage undefined
    const { resolveBackgroundImage } = await import('../../settings/types/stage-settings')
    ;(resolveBackgroundImage as ReturnType<typeof vi.fn>).mockReturnValueOnce(null)
    const w1 = await mountView()
    expect(w1.find('.bible-projection').attributes('style') ?? '').not.toContain('url(')
    w1.unmount()

    // textShadow off → 'none'
    stageSettings.textShadow = false
    const w2 = await mountView()
    expect(w2.find('.bible-projection__text').attributes('style') ?? '').toContain('text-shadow: none')
    stageSettings.textShadow = true
    w2.unmount()

    // boxBorder off → border none
    stageSettings.boxBorder = false
    const w3 = await mountView()
    // jsdom descarta border:'none'? o style simplesmente omite a propriedade
    expect(w3.find('.bible-projection__text').attributes('style') ?? '').not.toContain('border:')
    stageSettings.boxBorder = true
    w3.unmount()

    // reference vazia → displayReference '' e <p> some; texto mantém
    storageRuntime = { active: true, text: 'Só texto', reference: '   ' }
    const w4 = await mountView()
    expect(w4.find('.bible-projection__reference').exists()).toBe(false)
    w4.unmount()

    // texto vazio mas reference presente: showContent ativo só com referência
    storageRuntime = { active: true, text: '', reference: 'Gn 1:1' }
    const w5 = await mountView()
    expect(w5.find('.bible-projection__content').exists()).toBe(true)
    expect(w5.find('.bible-projection__text').exists()).toBe(false)
    expect(w5.find('.bible-projection__reference').text()).toBe('Gn 1:1')
    w5.unmount()
  })

  it('callback de stage settings atualiza o palco; BroadcastChannel indisponível cai no catch', async () => {
    const { subscribeStageSettings, readEffectiveStageSettings } = await import(
      '../../settings/services/stage-settings-runtime'
    )
    let cb: (() => void) | undefined
    ;(subscribeStageSettings as ReturnType<typeof vi.fn>).mockImplementation((fn: () => void) => {
      cb = fn
      return vi.fn()
    })

    // BroadcastChannel que lança no construtor → catch do onMounted
    const OriginalBC = window.BroadcastChannel
    class BrokenBC {
      constructor() {
        throw new Error('sem canal')
      }
    }
    // @ts-expect-error stub de teste
    window.BroadcastChannel = BrokenBC
    const w1 = await mountView()
    expect(w1.find('.bible-projection__content').exists()).toBe(true)
    w1.unmount()
    window.BroadcastChannel = OriginalBC

    // callback do subscribe: muda settings e dispara
    ;(readEffectiveStageSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      ...stageSettings,
      backgroundColor: '#222222',
    })
    const w2 = await mountView()
    cb?.()
    await w2.vm.$nextTick()
    expect(w2.find('.bible-projection').attributes('style') ?? '').toContain('rgb(34, 34, 34)')
    w2.unmount()
  })

  it('embedded: aplica classe de preview embutido', async () => {
    const wrapper = await mountView({ embedded: true })
    expect(wrapper.find('.bible-projection--embedded').exists()).toBe(true)
  })
})
