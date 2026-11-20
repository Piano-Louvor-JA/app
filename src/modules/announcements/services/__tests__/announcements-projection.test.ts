import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Router } from 'vue-router'

const mocks = vi.hoisted(() => ({
  toggle: vi.fn(),
  execute: vi.fn(),
  resolve: vi.fn(),
  openText: vi.fn(),
  stage: {} as Record<string, unknown>,
  bridge: {} as unknown,
}))
vi.mock('@modules/liturgy/services/liturgy-web-projection', () => ({ openLocalTextControl: mocks.openText }))
vi.mock('@modules/settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: (scope: string) => (scope === 'bible' ? { footerRefColor: '#00ff00' } : mocks.stage),
}))
vi.mock('@modules/liturgy/services/annotation-projection', () => ({ toggleAnnotationProjection: mocks.toggle }))
vi.mock('@modules/liturgy/services/liturgy-actions', () => ({ executeLiturgyItem: mocks.execute }))
vi.mock('@shared/services/desktop-bridge', () => ({ getDesktopBridge: () => mocks.bridge }))
vi.mock('../announcements-files', () => ({ resolveAnnouncementFiles: mocks.resolve }))

import {
  announcementAnnotationSource,
  announcementAsLiturgyItem,
  announcementTextPayload,
  isProjectableUrl,
  projectAnnouncement,
  urlAnnouncementAsLiturgyItem,
} from '../announcements-projection'
import type { ImagesAnnouncement, PresentationAnnouncement, TextAnnouncement, VideoAnnouncement } from '../../types/announcements'

const router = {} as Router
const text: TextAnnouncement = { id: 't1', kind: 'text', title: 'Batismo', titleColor: '#fff000', html: '<p>Sábado</p>', plainText: 'Sábado' }
const images: ImagesAnnouncement = { id: 'a1', kind: 'images', title: ' Fotos ', files: [
  { relativePath: 'modulos/avisos/a1/1.png', name: '1.png' },
  { relativePath: 'modulos/avisos/a1/2.png', name: '2.png' },
] }
const video: VideoAnnouncement = { id: 'v1', kind: 'video', title: 'Chamada', file: { relativePath: 'modulos/avisos/v1/1.mp4', name: 'c.mp4' } }
const pptx: PresentationAnnouncement = { id: 'p1', kind: 'presentation', title: 'Relatório', file: { relativePath: 'modulos/avisos/p1/1.pptx', name: 'r.pptx' } }

beforeEach(() => {
  mocks.toggle.mockReset()
  mocks.execute.mockReset().mockResolvedValue({ ok: true })
  mocks.resolve.mockReset()
  mocks.bridge = {}
})

describe('announcementAnnotationSource', () => {
  it('mapeia título, texto e cor para a anotação', () => {
    expect(announcementAnnotationSource(text)).toEqual({
      id: 't1', name: 'Batismo', subtitle: 'Sábado', notesHtml: '<p>Sábado</p>', titleColor: '#fff000',
    })
  })
})

describe('announcementAsLiturgyItem', () => {
  it('imagens viram galeria com os caminhos absolutos', () => {
    expect(announcementAsLiturgyItem(images, ['/m/1.png', '/m/2.png'])).toMatchObject({
      id: 'announcement-a1', type: 'images', name: 'Fotos', filePaths: ['/m/1.png', '/m/2.png'],
    })
  })

  it('vídeo vira item de vídeo que toca só no player do Piano', () => {
    expect(announcementAsLiturgyItem(video, ['/m/1.mp4'])).toMatchObject({ type: 'video', filePath: '/m/1.mp4', playerId: 'associated' })
  })

  it('PowerPoint sempre no modo interno do Piano; PDF vira item de PDF', () => {
    expect(announcementAsLiturgyItem(pptx, ['/m/1.pptx'])).toMatchObject({ type: 'presentation', filePath: '/m/1.pptx', presentationEngine: 'auto' })
    expect(announcementAsLiturgyItem(pptx, ['/m/1.PDF'])).toMatchObject({ type: 'pdf', filePath: '/m/1.PDF' })
    expect(announcementAsLiturgyItem({ ...pptx, file: null }, [])).toMatchObject({ type: 'presentation', filePath: '' })
  })
})

describe('announcementTextPayload', () => {
  it('cor própria do título vence; sem ela usa o Palco da Liturgia, depois a referência da Bíblia', () => {
    mocks.stage = { titleTextColor: '#123456', textColor: '#eeeeee', backgroundColor: '#111111' }
    expect(announcementTextPayload(text)).toEqual({
      title: 'Batismo', html: '<p>Sábado</p>', titleColor: '#fff000', textColor: '#eeeeee', backgroundColor: '#111111',
    })
    expect(announcementTextPayload({ ...text, titleColor: '' }).titleColor).toBe('#123456')
    mocks.stage = { titleTextColor: null, textColor: null, backgroundColor: null }
    expect(announcementTextPayload({ ...text, titleColor: '' })).toMatchObject({ titleColor: '#00ff00', textColor: '#ffffff', backgroundColor: '#000000' })
  })
})

describe('URL', () => {
  it('reconhece links válidos (site, YouTube) e recusa vazio ou inválido', () => {
    expect(isProjectableUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
    expect(isProjectableUrl('adventistas.org')).toBe(true)
    expect(isProjectableUrl('   ')).toBe(false)
    expect(isProjectableUrl('http://exa mple')).toBe(false)
  })

  it('vira item "site" da Liturgia com o link sem espaços', () => {
    expect(urlAnnouncementAsLiturgyItem({ id: 'u', kind: 'url', title: ' Canal ', url: ' https://youtu.be/x ' })).toMatchObject({
      id: 'announcement-u', type: 'site', name: 'Canal', url: 'https://youtu.be/x',
    })
  })
})

describe('projectAnnouncement', () => {
  it('URL abre pelo player web da Liturgia, mesmo fora do desktop', async () => {
    mocks.bridge = null
    const url = { id: 'u', kind: 'url' as const, title: 'Canal', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
    await expect(projectAnnouncement(url, router)).resolves.toEqual({ ok: true })
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ type: 'site', url: url.url }), router)
    mocks.execute.mockResolvedValueOnce({ ok: false, messageKey: 'liturgy.messages.projectionFailed' })
    await expect(projectAnnouncement(url, router)).resolves.toEqual({ ok: false, key: 'liturgy.messages.projectionFailed' })
    await expect(projectAnnouncement({ ...url, url: '' }, router)).resolves.toEqual({ ok: false, key: 'announcements.dialog.invalidUrl' })
    expect(mocks.resolve).not.toHaveBeenCalled()
  })

  it('texto liga/desliga a tela de anotação', async () => {
    await expect(projectAnnouncement(text, router)).resolves.toEqual({ ok: true })
    expect(mocks.toggle).toHaveBeenCalledWith(announcementAnnotationSource(text))
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('desktop: texto abre a janela de controle de texto', async () => {
    mocks.stage = {}
    mocks.bridge = { projection: { openUrl: vi.fn() } }
    mocks.openText.mockResolvedValueOnce(true)
    await expect(projectAnnouncement(text, router)).resolves.toEqual({ ok: true })
    expect(mocks.openText).toHaveBeenCalledWith(expect.objectContaining({ title: 'Batismo', html: '<p>Sábado</p>' }), 'Batismo')
    expect(mocks.toggle).not.toHaveBeenCalled()
    mocks.openText.mockResolvedValueOnce(false)
    await expect(projectAnnouncement(text, router)).resolves.toEqual({ ok: false, key: 'announcements.notices.projectionFailed' })
  })

  it('texto vazio não projeta', async () => {
    await expect(projectAnnouncement({ ...text, title: ' ', plainText: '' }, router)).resolves.toEqual({ ok: false, key: 'announcements.dialog.emptyText' })
    expect(mocks.toggle).not.toHaveBeenCalled()
  })

  it('imagens resolvem os caminhos e abrem o player da Liturgia', async () => {
    mocks.resolve.mockResolvedValue({ absolutePaths: ['/m/1.png', '/m/2.png'], missing: [] })
    await expect(projectAnnouncement(images, router)).resolves.toEqual({ ok: true })
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ type: 'images', filePaths: ['/m/1.png', '/m/2.png'] }), router)
  })

  it('arquivo ausente não projeta e diz qual sumiu', async () => {
    mocks.resolve.mockResolvedValue({ absolutePaths: ['/m/1.png'], missing: ['2.png'] })
    await expect(projectAnnouncement(images, router)).resolves.toEqual({
      ok: false, key: 'announcements.notices.missing', params: { names: '2.png' },
    })
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('aviso sem arquivo pede para escolher um', async () => {
    mocks.resolve.mockResolvedValue({ absolutePaths: [], missing: [] })
    await expect(projectAnnouncement({ ...video, file: null }, router)).resolves.toEqual({ ok: false, key: 'announcements.dialog.emptyFiles' })
  })

  it('fora do desktop é indisponível', async () => {
    mocks.bridge = null
    await expect(projectAnnouncement(video, router)).resolves.toEqual({ ok: false, key: 'announcements.notices.desktopOnly' })
  })

  it('falha do player volta com a mensagem da Liturgia', async () => {
    mocks.resolve.mockResolvedValue({ absolutePaths: ['/m/1.pptx'], missing: [] })
    mocks.execute.mockResolvedValue({ ok: false, messageKey: 'liturgy.messages.presentationOfficeMissing' })
    await expect(projectAnnouncement(pptx, router)).resolves.toEqual({ ok: false, key: 'liturgy.messages.presentationOfficeMissing' })
  })
})
