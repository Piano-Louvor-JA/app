// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ pick: vi.fn(), removeFiles: vi.fn(), removeFolder: vi.fn() }))
vi.mock('../../services/announcements-files', () => ({
  pickAnnouncementFiles: mocks.pick,
  removeAnnouncementFiles: mocks.removeFiles,
  removeAnnouncementFolder: mocks.removeFolder,
}))

import type { ImagesAnnouncement, TextAnnouncement, VideoAnnouncement } from '../../types/announcements'
import { useAnnouncementDraft } from '../useAnnouncementDraft'

const f = (n: string, id = 'a1') => ({ relativePath: `modulos/avisos/${id}/${n}`, name: n })
const images: ImagesAnnouncement = { id: 'a1', kind: 'images', title: 'Fotos', files: [f('1.png'), f('2.png')] }
const video: VideoAnnouncement = { id: 'v1', kind: 'video', title: 'V', file: f('old.mp4', 'v1') }
const text: TextAnnouncement = { id: 't1', kind: 'text', title: '', titleColor: '', html: '', plainText: '' }

beforeEach(() => {
  mocks.pick.mockReset()
  mocks.removeFiles.mockReset()
  mocks.removeFolder.mockReset()
})

describe('useAnnouncementDraft', () => {
  it('não altera o aviso original enquanto edita', () => {
    const d = useAnnouncementDraft(images, false)
    d.removeImage(0)
    expect(images.files).toHaveLength(2)
  })

  it('adicionar imagens soma ao fim e devolve as recusadas', async () => {
    mocks.pick.mockResolvedValue({ ok: true, files: [f('3.png')], rejected: [{ name: 'x.txt', reason: 'unsupported_format' }] })
    const d = useAnnouncementDraft(images, false)
    await expect(d.pickFiles()).resolves.toEqual({ ok: true, rejected: [{ name: 'x.txt', reason: 'unsupported_format' }] })
    expect(mocks.pick).toHaveBeenCalledWith('a1', 'images')
    expect(d.draft.value.kind === 'images' && d.draft.value.files.map((x) => x.name)).toEqual(['1.png', '2.png', '3.png'])
    expect(d.busy.value).toBe(false)
  })

  it('cancelado no diálogo não muda nada', async () => {
    mocks.pick.mockResolvedValue({ ok: false, reason: 'cancelled' })
    const d = useAnnouncementDraft(images, false)
    await expect(d.pickFiles()).resolves.toEqual({ ok: false, reason: 'cancelled' })
    await expect(useAnnouncementDraft(text, true).pickFiles()).resolves.toEqual({ ok: false, reason: 'invalid_kind' })
  })

  it('remover e reordenar imagens; salvar apaga do disco só as que já existiam', async () => {
    mocks.pick.mockResolvedValue({ ok: true, files: [f('3.png')], rejected: [] })
    const d = useAnnouncementDraft(images, false)
    await d.pickFiles()
    d.moveImage(2, 0)
    d.moveImage(9, 0)
    expect(d.draft.value.kind === 'images' && d.draft.value.files.map((x) => x.name)).toEqual(['3.png', '1.png', '2.png'])
    d.removeImage(0) // nova: não vai para "removidas"
    d.removeImage(0) // 1.png já existia
    d.removeImage(7)
    const saved = await d.commit()
    expect(saved).toMatchObject({ files: [f('2.png')] })
    expect(mocks.removeFiles).toHaveBeenCalledWith([f('1.png').relativePath])
  })

  it('cancelar edição apaga só o que foi copiado nesta edição', async () => {
    mocks.pick.mockResolvedValue({ ok: true, files: [f('3.png')], rejected: [] })
    const d = useAnnouncementDraft(images, false)
    await d.pickFiles()
    d.removeImage(0)
    await d.discard()
    expect(mocks.removeFiles).toHaveBeenCalledWith([f('3.png').relativePath])
    expect(mocks.removeFolder).not.toHaveBeenCalled()
  })

  it('cancelar aviso novo apaga a pasta dele', async () => {
    const d = useAnnouncementDraft({ ...images, files: [] }, true)
    await d.discard()
    expect(mocks.removeFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }))
  })

  it('trocar o vídeo marca o antigo para apagar ao salvar', async () => {
    mocks.pick.mockResolvedValue({ ok: true, files: [f('new.mp4', 'v1')], rejected: [] })
    const d = useAnnouncementDraft(video, false)
    await d.pickFiles()
    expect(d.draft.value).toMatchObject({ file: f('new.mp4', 'v1') })
    await d.commit()
    expect(mocks.removeFiles).toHaveBeenCalledWith([f('old.mp4', 'v1').relativePath])
  })

  it('trocar duas vezes na mesma edição apaga a cópia intermediária na hora', async () => {
    const d = useAnnouncementDraft(video, false)
    mocks.pick.mockResolvedValueOnce({ ok: true, files: [f('a.mp4', 'v1')], rejected: [] })
    await d.pickFiles()
    mocks.pick.mockResolvedValueOnce({ ok: true, files: [f('b.mp4', 'v1')], rejected: [] })
    await d.pickFiles()
    expect(mocks.removeFiles).toHaveBeenCalledWith([f('a.mp4', 'v1').relativePath])
    await d.discard()
    expect(mocks.removeFiles).toHaveBeenLastCalledWith([f('b.mp4', 'v1').relativePath])
  })

  it('URL: valida o link, salva sem espaços e não abre diálogo de arquivo', async () => {
    const d = useAnnouncementDraft({ id: 'u', kind: 'url', title: '', url: '' }, true)
    expect(d.isValid.value).toBe(false)
    await expect(d.pickFiles()).resolves.toEqual({ ok: false, reason: 'invalid_kind' })
    if (d.draft.value.kind === 'url') d.draft.value.url = '  https://youtu.be/abc  '
    expect(d.isValid.value).toBe(true)
    await expect(d.commit()).resolves.toMatchObject({ url: 'https://youtu.be/abc' })
    await d.discard()
    expect(mocks.removeFolder).toHaveBeenCalled()
  })

  it('validação por tipo', async () => {
    expect(useAnnouncementDraft(text, true).isValid.value).toBe(false)
    expect(useAnnouncementDraft({ ...text, title: 'Oi' }, true).isValid.value).toBe(true)
    const withText = useAnnouncementDraft(text, true)
    withText.setText('<p>Ceia</p>')
    expect(withText.isValid.value).toBe(true)
    expect(useAnnouncementDraft({ ...images, files: [] }, true).isValid.value).toBe(false)
    expect(useAnnouncementDraft(images, false).isValid.value).toBe(true)
    expect(useAnnouncementDraft({ ...video, file: null }, true).isValid.value).toBe(false)
    expect(useAnnouncementDraft(video, false).isValid.value).toBe(true)
  })

  it('commit de texto limpa o HTML e gera o texto puro', async () => {
    const d = useAnnouncementDraft({ ...text, title: '  Ceia  ' }, true)
    d.setText('<p>Sábado <script>x</script>às 9h</p>')
    const saved = await d.commit()
    expect(saved).toMatchObject({ title: 'Ceia', plainText: 'Sábado às 9h' })
    expect(saved.kind === 'text' && saved.html).not.toContain('script')
  })

  it('ações de outro tipo não fazem nada', () => {
    useAnnouncementDraft(images, false).setText('x')
    useAnnouncementDraft(video, false).removeImage(0)
    useAnnouncementDraft(video, false).moveImage(0, 1)
  })
})
