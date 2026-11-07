import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ bridge: null as unknown }))
vi.mock('@shared/services/desktop-bridge', () => ({
  getDesktopBridge: vi.fn(() => mocks.bridge),
}))

import {
  announcementFiles,
  duplicateAnnouncementWithFiles,
  pickAnnouncementFiles,
  removeAnnouncementFolder,
  removeAnnouncementFiles,
  resolveAnnouncementFiles,
} from '../announcements-files'
import type { ImagesAnnouncement, TextAnnouncement } from '../../types/announcements'

const api = {
  pickAndImport: vi.fn(),
  copyFolder: vi.fn(),
  removeFolder: vi.fn(),
  removeFiles: vi.fn(),
  resolvePaths: vi.fn(),
}

const images: ImagesAnnouncement = {
  id: 'a1',
  kind: 'images',
  title: 'Fotos',
  files: [
    { relativePath: 'modulos/avisos/a1/1.png', name: 'um.png' },
    { relativePath: 'modulos/avisos/a1/2.png', name: 'dois.png' },
  ],
}

const text: TextAnnouncement = { id: 't1', kind: 'text', title: 'T', titleColor: '', html: '<p>x</p>', plainText: 'x' }

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  mocks.bridge = { announcements: api }
})

describe('announcementFiles', () => {
  it('lista os arquivos de cada tipo', () => {
    expect(announcementFiles(images).map((f) => f.name)).toEqual(['um.png', 'dois.png'])
    expect(announcementFiles(text)).toEqual([])
    expect(announcementFiles({ id: 'v', kind: 'video', title: '', file: null })).toEqual([])
    const file = { relativePath: 'modulos/avisos/v/1.mp4', name: 'v.mp4' }
    expect(announcementFiles({ id: 'v', kind: 'video', title: '', file })).toEqual([file])
  })
})

describe('pickAnnouncementFiles', () => {
  it('devolve arquivos copiados e recusados', async () => {
    api.pickAndImport.mockResolvedValue({
      ok: true,
      files: [{ relativePath: 'modulos/avisos/a1/9.png', name: 'n.png' }],
      rejected: [{ name: 'x.txt', reason: 'unsupported_format' }],
    })
    await expect(pickAnnouncementFiles('a1', 'images')).resolves.toEqual({
      ok: true,
      files: [{ relativePath: 'modulos/avisos/a1/9.png', name: 'n.png' }],
      rejected: [{ name: 'x.txt', reason: 'unsupported_format' }],
    })
    expect(api.pickAndImport).toHaveBeenCalledWith('a1', 'images')
  })

  it('resposta sem listas vira listas vazias; falha sem motivo vira "error"', async () => {
    api.pickAndImport.mockResolvedValueOnce({ ok: true })
    await expect(pickAnnouncementFiles('a1', 'video')).resolves.toEqual({ ok: true, files: [], rejected: [] })
    api.pickAndImport.mockResolvedValueOnce({ ok: false })
    await expect(pickAnnouncementFiles('a1', 'video')).resolves.toEqual({ ok: false, reason: 'error' })
  })

  it('cancelado ou erro vira ok:false com o motivo', async () => {
    api.pickAndImport.mockResolvedValue({ ok: false, reason: 'cancelled' })
    await expect(pickAnnouncementFiles('a1', 'video')).resolves.toEqual({ ok: false, reason: 'cancelled' })
    api.pickAndImport.mockRejectedValue(new Error('ipc'))
    await expect(pickAnnouncementFiles('a1', 'video')).resolves.toEqual({ ok: false, reason: 'error' })
  })

  it('sem app desktop é indisponível', async () => {
    mocks.bridge = null
    await expect(pickAnnouncementFiles('a1', 'images')).resolves.toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('duplicateAnnouncementWithFiles', () => {
  it('copia a pasta e reescreve os caminhos com o novo id', async () => {
    api.copyFolder.mockResolvedValue({
      ok: true,
      paths: {
        'modulos/avisos/a1/1.png': 'modulos/avisos/novo/1.png',
        'modulos/avisos/a1/2.png': 'modulos/avisos/novo/2.png',
      },
    })
    const copy = await duplicateAnnouncementWithFiles(images, 'novo')
    expect(api.copyFolder).toHaveBeenCalledWith('a1', 'novo')
    expect(copy).toEqual({
      ...images,
      id: 'novo',
      files: [
        { relativePath: 'modulos/avisos/novo/1.png', name: 'um.png' },
        { relativePath: 'modulos/avisos/novo/2.png', name: 'dois.png' },
      ],
    })
  })

  it('texto não tem arquivo: só troca o id, sem chamar o main', async () => {
    await expect(duplicateAnnouncementWithFiles(text, 'novo')).resolves.toEqual({ ...text, id: 'novo' })
    expect(api.copyFolder).not.toHaveBeenCalled()
  })

  it('vídeo e apresentação têm o arquivo reescrito', async () => {
    api.copyFolder.mockResolvedValue({ ok: true, paths: { 'modulos/avisos/p/1.pdf': 'modulos/avisos/q/1.pdf' } })
    const copy = await duplicateAnnouncementWithFiles(
      { id: 'p', kind: 'presentation', title: '', file: { relativePath: 'modulos/avisos/p/1.pdf', name: 'r.pdf' } },
      'q',
    )
    expect(copy).toMatchObject({ file: { relativePath: 'modulos/avisos/q/1.pdf', name: 'r.pdf' } })
  })

  it('erro no IPC devolve null; caminho fora do mapa é deduzido pelo id', async () => {
    api.copyFolder.mockRejectedValueOnce(new Error('ipc'))
    await expect(duplicateAnnouncementWithFiles(images, 'novo')).resolves.toBeNull()
    api.copyFolder.mockResolvedValueOnce({ ok: true })
    const copy = await duplicateAnnouncementWithFiles(images, 'novo')
    expect(copy).toMatchObject({ files: [{ relativePath: 'modulos/avisos/novo/1.png' }, { relativePath: 'modulos/avisos/novo/2.png' }] })
  })

  it('falha na cópia devolve null', async () => {
    api.copyFolder.mockResolvedValue({ ok: false, reason: 'copy_failed' })
    await expect(duplicateAnnouncementWithFiles(images, 'novo')).resolves.toBeNull()
    mocks.bridge = null
    await expect(duplicateAnnouncementWithFiles(images, 'novo')).resolves.toBeNull()
  })
})

describe('remoção', () => {
  it('removeAnnouncementFolder só chama o main para avisos com arquivo', async () => {
    api.removeFolder.mockResolvedValue({ ok: true })
    await removeAnnouncementFolder(images)
    await removeAnnouncementFolder(text)
    await removeAnnouncementFolder({ id: 'u', kind: 'url', title: '', url: 'https://x.org' })
    expect(api.removeFolder).toHaveBeenCalledTimes(1)
    expect(api.removeFolder).toHaveBeenCalledWith('a1')
  })

  it('removeAnnouncementFiles ignora lista vazia e erros', async () => {
    await removeAnnouncementFiles([])
    expect(api.removeFiles).not.toHaveBeenCalled()
    api.removeFiles.mockRejectedValue(new Error('ipc'))
    await expect(removeAnnouncementFiles(['modulos/avisos/a1/1.png'])).resolves.toBeUndefined()
  })
})

describe('resolveAnnouncementFiles', () => {
  it('separa caminhos absolutos dos arquivos que sumiram', async () => {
    api.resolvePaths.mockResolvedValue([
      { relativePath: 'modulos/avisos/a1/1.png', absolutePath: '/m/modulos/avisos/a1/1.png', exists: true },
      { relativePath: 'modulos/avisos/a1/2.png', absolutePath: '/m/modulos/avisos/a1/2.png', exists: false },
    ])
    await expect(resolveAnnouncementFiles(images)).resolves.toEqual({
      absolutePaths: ['/m/modulos/avisos/a1/1.png'],
      missing: ['dois.png'],
    })
  })

  it('sem bridge, tudo conta como ausente', async () => {
    mocks.bridge = null
    await expect(resolveAnnouncementFiles(images)).resolves.toEqual({ absolutePaths: [], missing: ['um.png', 'dois.png'] })
  })
})
