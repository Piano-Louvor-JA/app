// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import type { OnlineVideoItemStatus } from '@/shared/types/desktop-bridge'
import LiturgyTimelineItem from '../LiturgyTimelineItem.vue'
import liturgyLocale from '../../locales/pt-BR'
import type { LiturgyItem } from '../../types/liturgy'

vi.mock('@shared/services/desktop-bridge', () => ({
  isElectronShell: vi.fn(() => false),
  isDesktopApp: vi.fn(() => false),
  getDesktopBridge: vi.fn(() => null),
}))
vi.mock('../../composables/useExternalPlayerChoices', async () => {
  const { ref } = await import('vue')
  return {
    useExternalPlayerChoices: () => ({
      globalPlayer: ref('associated'),
      playerOptions: ref([]),
      loadPlayerChoices: vi.fn(),
      selectedPlayerId: () => 'associated',
    }),
  }
})
vi.mock('@shared/components/MusicTrackActions.vue', () => ({
  default: { name: 'MusicTrackActions', template: '<div />' },
}))

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': liturgyLocale } })

const item: LiturgyItem = {
  id: 'video-1',
  type: 'online_video',
  name: 'Hino',
  subtitle: '',
  done: false,
  durationMs: 0,
  categoryId: null,
  filePath: '',
  filePaths: [],
  url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
  accentColor: '#ff9800',
  startTime: '10:00',
  endTime: '10:05',
}

function mountItem(offlineStatus?: OnlineVideoItemStatus | null) {
  return mount(LiturgyTimelineItem, {
    props: { item, index: 0, selected: false, startLabel: '10:00', durationLabel: '0:00', offlineStatus },
    global: { plugins: [i18n] },
  })
}

const badge = '[data-test="liturgy-offline-badge"]'

describe('selo da cópia baixada no item da liturgia', () => {
  it('sem status ou sem cópia: sem selo', () => {
    expect(mountItem().find(badge).exists()).toBe(false)
    expect(mountItem(null).find(badge).exists()).toBe(false)
    expect(mountItem({ state: 'none' }).find(badge).exists()).toBe(false)
  })

  it.each([
    [{ state: 'queued' }, 'Na fila para baixar', 'ti-clock'],
    [{ state: 'resolving' }, 'Preparando download', 'ti-loader-2'],
    [{ state: 'downloading', progress: 0.456 }, 'Baixando 46%', 'ti-download'],
    [{ state: 'downloading' }, 'Baixando 0%', 'ti-download'],
    [{ state: 'muxing' }, 'Finalizando download', 'ti-loader-2'],
    [{ state: 'ready' }, 'Pronto sem internet', 'ti-circle-check'],
  ] as const)('%o mostra "%s"', (status, label, icon) => {
    const found = mountItem(status as OnlineVideoItemStatus).find(badge)
    expect(found.text()).toBe(label)
    expect(found.attributes('title')).toBe(label)
    expect(found.classes()).toContain(`liturgy-item__offline--${status.state}`)
    expect(found.find('i').classes()).toContain(icon)
  })

  it('falha mostra o motivo na dica', () => {
    const found = mountItem({ state: 'error', code: 'unavailable', message: 'Vídeo privado' }).find(badge)
    expect(found.text()).toBe('Não foi possível baixar')
    expect(found.attributes('title')).toBe('Não foi possível baixar: Vídeo privado')
    expect(mountItem({ state: 'error' }).find(badge).attributes('title')).toBe('Não foi possível baixar')
  })
})
