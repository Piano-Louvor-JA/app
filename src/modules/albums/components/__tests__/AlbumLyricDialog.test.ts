// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

import AlbumLyricDialog from '../AlbumLyricDialog.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'pt-BR',
  messages: { 'pt-BR': { albums: { lyric: { title: 'Letra', close: 'Fechar', empty: 'Sem letra' } } } },
})

function createWrapper(props: Record<string, unknown> = {}) {
  return mount(AlbumLyricDialog, {
    props: { open: true, loading: false, document: null, ...props },
    global: { plugins: [i18n] },
  })
}

describe('AlbumLyricDialog.vue', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('fechado: nada renderiza', () => {
    createWrapper({ open: false })
    expect(document.querySelector('.album-lyric-dialog')).toBeNull()
  })

  it('aberto: título do documento', () => {
    createWrapper({ document: { title: 'Hino Maravilhoso', lines: [] } as any })
    expect(document.querySelector('.album-lyric-dialog__title')!.textContent).toContain('Hino Maravilhoso')
  })

  it('loading: estado de carregamento', () => {
    createWrapper({ loading: true })
    expect(document.querySelector('.album-lyric-dialog__state')).not.toBeNull()
  })

  it('documento null: título default', () => {
    createWrapper()
    expect(document.querySelector('.album-lyric-dialog__title')!.textContent).toContain('Letra')
  })

  it('close: emite close', async () => {
    const wrapper = createWrapper()
    const btn = document.querySelector('.album-lyric-dialog__close') as HTMLButtonElement
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(wrapper.emitted('close')).toBeTruthy()
  })
  it('documento com linhas: renderiza cada linha', () => {
    createWrapper({
      document: {
        title: 'Com Linhas',
        lines: [
          { order: 1, text: 'Primeira linha' },
          { order: 2, text: 'Segunda linha' },
        ],
      } as any,
    })
    const lines = document.querySelectorAll('.album-lyric-dialog__line')
    expect(lines.length).toBe(2)
    expect(lines[0].textContent).toContain('Primeira linha')
  })

  it('documento com lines vazio: estado vazio', () => {
    createWrapper({ document: { title: 'Vazio', lines: [] } as any })
    expect(document.querySelector('.album-lyric-dialog__state')).not.toBeNull()
  })

})