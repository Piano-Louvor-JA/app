// @vitest-environment jsdom
// Cobertura AlbumLyricDialog: teleporte, estados (loading/sem letra/linhas) e
// emissão de close (gaps_map3: brs de estado).
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: { value: 'pt-BR' } }),
}))

import AlbumLyricDialog from '../AlbumLyricDialog.vue'
import type { AlbumLyricDocument } from '../../types/albums'

const doc: AlbumLyricDocument = {
  musicId: 1,
  title: 'Hino Sagrado',
  lines: [
    { order: 1, text: 'Primeira linha' },
    { order: 2, text: 'Segunda linha' },
  ],
}

async function mountDialog(over: Partial<{ open: boolean; loading: boolean; document: AlbumLyricDocument | null }> = {}) {
  const w = mount(AlbumLyricDialog, {
    props: {
      open: true,
      loading: false,
      document: null,
      ...over,
    },
    attachTo: document.body,
  })
  await Promise.resolve()
  return w
}

const panel = (w: ReturnType<typeof mount>) =>
  document.body.querySelector('.album-lyric-dialog')

describe('AlbumLyricDialog', () => {
  it('não renderiza nada quando fechado', async () => {
    const w = await mountDialog({ open: false })
    expect(panel(w)).toBeNull()
    w.unmount()
  })

  it('aberto sem documento mostra estado de letra ausente', async () => {
    const w = await mountDialog()
    expect(panel(w)).not.toBeNull()
    expect(document.body.querySelector('.album-lyric-dialog__state')!.textContent).toContain('albums.messages.lyricMissing')
    expect(w.emitted('close')).toBeUndefined()
    w.unmount()
  })

  it('loading tem prioridade sobre documento', async () => {
    const w = await mountDialog({ loading: true, document: doc })
    expect(document.body.querySelector('.album-lyric-dialog__state')!.textContent).toContain('albums.loading')
    expect(document.body.querySelector('.album-lyric-dialog__lines')).toBeNull()
    w.unmount()
  })

  it('com documento: título e linhas renderizadas', async () => {
    const w = await mountDialog({ document: doc })
    expect(document.body.querySelector('.album-lyric-dialog__title')!.textContent).toContain('Hino Sagrado')
    const lines = document.body.querySelectorAll('.album-lyric-dialog__line')
    expect(lines).toHaveLength(2)
    expect(lines[0]!.textContent).toContain('Primeira linha')
    w.unmount()
  })

  it('documento com lines vazio mostra estado vazio', async () => {
    const w = await mountDialog({ document: { ...doc, lines: [] } })
    expect(document.body.querySelector('.album-lyric-dialog__state')!.textContent).toContain('albums.messages.lyricMissing')
    w.unmount()
  })

  it('documento sem título usa chave i18n', async () => {
    const w = await mountDialog({ document: { musicId: 2, title: '', lines: doc.lines } })
    expect(document.body.querySelector('.album-lyric-dialog__title')!.textContent).toContain('albums.lyric.title')
    w.unmount()
  })

  it('botão fechar emite close', async () => {
    const w = await mountDialog({ document: doc })
    const wrapperClose = document.body.querySelector('.album-lyric-dialog__close')!
    wrapperClose.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
    expect(w.emitted('close')).toHaveLength(1)
    w.unmount()
  })
})
