// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createI18n } from 'vue-i18n'

import liturgyLocale from '../../locales/pt-BR'

vi.mock('@shared/services/desktop-bridge', () => ({
  isElectronShell: vi.fn(() => false),
  getDesktopBridge: vi.fn(() => null),
}))

vi.mock('../../composables/useExternalPlayerChoices', async () => {
  const { ref: vueRef } = await import('vue')
  return {
    useExternalPlayerChoices: () => ({
      globalPlayer: vueRef('associated'),
      playerOptions: vueRef([]),
      loadPlayerChoices: vi.fn(async () => {}),
      selectedPlayerId: vi.fn((id?: string) => id ?? 'associated'),
    }),
  }
})

vi.mock('@shared/components/MusicTrackActions.vue', () => ({
  default: { name: 'MusicTrackActions', template: '<div />' },
}))

vi.mock('@shared/components/IndependentProjectionButton.vue', () => ({
  default: {
    name: 'IndependentProjectionButton',
    props: { moduleId: String, beforeProject: Function, obs: Boolean, claimed: Boolean, compact: Boolean },
    template: '<button data-testid="independent-stub" @click="beforeProject()" />',
  },
}))

const annotation = vi.hoisted(() => ({
  prepareAnnotationIndependent: vi.fn(() => true),
  refreshAnnotationProjection: vi.fn(),
}))
const projectingItemId = ref<string | null>(null)
const independentItemId = ref<string | null>(null)

vi.mock('../../services/annotation-projection', () => ({
  ANNOTATION_PROJECTION_MODULE: 'annotation',
  prepareAnnotationIndependent: annotation.prepareAnnotationIndependent,
  refreshAnnotationProjection: annotation.refreshAnnotationProjection,
  useAnnotationProjection: () => ({ projectingItemId, independentItemId }),
}))

import LiturgyTimelineItem from '../LiturgyTimelineItem.vue'
const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': liturgyLocale } })

const music = {
  id: 'm-1',
  type: 'music',
  name: 'Digno',
  subtitle: 'Adoradores 5',
  durationMs: 0,
  accentColor: '#00E676',
  done: false,
  musicId: 42,
}

function mountItem(item: Record<string, unknown>) {
  return mount(LiturgyTimelineItem, {
    props: { item, index: 0, selected: false, startLabel: '10:00', durationLabel: '0:00' },
    global: { plugins: [i18n] },
  })
}

describe('LiturgyTimelineItem — clicar na linha abre como o ícone', () => {
  beforeEach(() => {
    projectingItemId.value = null
    independentItemId.value = null
  })

  it('clicar em qualquer parte da linha toca a música (como o play)', async () => {
    const wrapper = mountItem(music)
    expect(wrapper.classes()).toContain('liturgy-item--row-play')
    await wrapper.get('.liturgy-item__name').trigger('click')
    expect(wrapper.emitted('musicSung')).toHaveLength(1)
    await wrapper.get('.liturgy-item__card').trigger('click')
    expect(wrapper.emitted('musicSung')).toHaveLength(2)
  })

  it('botões da linha continuam fazendo só o que fazem', async () => {
    const wrapper = mountItem(music)
    const edit = wrapper.findAll('button').find((b) => b.attributes('title') === 'Editar')
    await edit!.trigger('click')
    expect(wrapper.emitted('edit')).toHaveLength(1)
    expect(wrapper.emitted('musicSung')).toBeUndefined()
  })

  it('site e YouTube: clicar na linha abre o controle do player, como o ícone', async () => {
    const site = mountItem({ id: 's-1', type: 'site', name: 'Site', subtitle: 'Site para testar', durationMs: 0, accentColor: '#AEEA00', done: false, url: 'https://example.com' })
    expect(site.classes()).toContain('liturgy-item--row-play')
    await site.get('.liturgy-item__name').trigger('click')
    expect(site.emitted('select')).toHaveLength(1)

    const youtube = mountItem({ id: 'y-1', type: 'online_video', name: 'Arautos do Rei', subtitle: '', durationMs: 0, accentColor: '#2979FF', done: false, url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' })
    await youtube.get('.liturgy-item__card').trigger('click')
    expect(youtube.emitted('select')).toHaveLength(1)

    // Concluído: nada pela linha.
    const done = mountItem({ id: 's-2', type: 'site', name: 'Site', subtitle: '', durationMs: 0, accentColor: '#AEEA00', done: true, url: 'https://example.com' })
    await done.get('.liturgy-item__card').trigger('click')
    expect(done.emitted('select')).toBeUndefined()
  })

  it('categoria não abre nada pela linha', async () => {
    const category = mountItem({ id: 'c-1', type: 'category', name: 'Escola Sabatina', subtitle: '', durationMs: 0, accentColor: '#FFD600', done: false })
    await category.get('.liturgy-item__card').trigger('click')
    expect(category.emitted('select')).toBeUndefined()
    expect(category.emitted('playScreens')).toBeUndefined()
  })

  it('anotação: clicar na linha projeta, como o ícone; concluída não', async () => {
    const note = mountItem({ id: 'n-1', type: 'annotation', name: 'Aviso', subtitle: 'Aviso', durationMs: 0, accentColor: '#FF6D00', done: false })
    expect(note.classes()).toContain('liturgy-item--row-play')
    await note.get('.liturgy-item__name').trigger('click')
    expect(note.emitted('playScreens')).toHaveLength(1)
    expect(note.emitted('select')).toBeUndefined()

    const done = mountItem({ id: 'n-2', type: 'annotation', name: 'Aviso', subtitle: '', durationMs: 0, accentColor: '#FF6D00', done: true })
    await done.get('.liturgy-item__card').trigger('click')
    expect(done.emitted('playScreens')).toBeUndefined()
  })

  it('música concluída não toca pela linha', async () => {
    const done = mountItem({ ...music, done: true })
    await done.get('.liturgy-item__card').trigger('click')
    expect(done.emitted('musicSung')).toBeUndefined()
    expect(done.classes()).not.toContain('liturgy-item--row-play')
  })

  it('áudio: a linha abre como o play dele (não como música)', async () => {
    const audio = mountItem({ ...music, id: 'a-1', type: 'audio', musicId: undefined })
    const play = audio.findAll('button').find((b) => b.find('.ti-player-play').exists())
    expect(play).toBeTruthy()
    await audio.get('.liturgy-item__card').trigger('click')
    expect(audio.emitted('musicSung')).toBeUndefined()
    expect(audio.emitted('select')).toHaveLength(1)
  })

  it('música sem hino do catálogo abre pela linha como no play dela', async () => {
    const wrapper = mountItem({ ...music, musicId: undefined, filePath: '/m/digno.mp3' })
    await wrapper.get('.liturgy-item__card').trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
  })

  it('vídeo sem anotação não mostra o nome do arquivo; com anotação, mostra', () => {
    const base = { id: 'v-1', type: 'video', name: '8 HABITA EM MIM ADORADORES 4', durationMs: 0, accentColor: '#00B8D4', done: false, filePath: '/v/8 HABITA EM MIM ADORADORES 4_h8OcOlhlL00.mp4' }
    const auto = mountItem({ ...base, subtitle: '8 HABITA EM MIM ADORADORES 4_h8OcOlhlL00.mp4' })
    expect(auto.text()).not.toContain('h8OcOlhlL00')
    const note = mountItem({ ...base, subtitle: 'Passar só até 3:00' })
    expect(note.text()).toContain('Passar só até 3:00')
  })

  it('música: a lista mostra só o título complementar (sem repetir o do catálogo)', () => {
    const w = mountItem({ ...music, name: '571 - Tu És Digno', complementaryTitle: '571 - Tu És Digno' })
    expect(w.get('.liturgy-item__name').text()).toBe('571 - Tu És Digno')
    expect(w.find('.liturgy-item__complementary').exists()).toBe(false)
    const custom = mountItem({ ...music, name: '571 - Tu És Digno', complementaryTitle: 'Louvor da abertura' })
    expect(custom.get('.liturgy-item__name').text()).toBe('Louvor da abertura')
    const plain = mountItem({ ...music, name: '571 - Tu És Digno' })
    expect(plain.get('.liturgy-item__name').text()).toBe('571 - Tu És Digno')
  })

  it('áudio, imagens e PDF sem anotação não mostram o nome do arquivo (itens já salvos)', () => {
    const audio = mountItem({ id: 'a-9', type: 'audio', name: 'sorteio-efeito SORTEIO', durationMs: 0, accentColor: '#D500F9', done: false, filePath: '/m/sorteio-efeito.mp3', subtitle: 'sorteio-efeito.mp3' })
    expect(audio.text()).not.toContain('sorteio-efeito.mp3')
    const images = mountItem({ id: 'i-9', type: 'images', name: '2 imagens selecionadas', durationMs: 0, accentColor: '#6D4C41', done: false, filePaths: ['/a.png', '/b.png'], subtitle: '2 imagens' })
    expect(images.find('.liturgy-item__subtitle').exists()).toBe(false)
    const pdf = mountItem({ id: 'p-9', type: 'pdf', name: 'CNH', durationMs: 0, accentColor: '#1A237E', done: false, filePath: '/d/CNH - Habilitação Atualizada.pdf', subtitle: 'CNH - Habilitação Atualizada.pdf' })
    expect(pdf.text()).not.toContain('.pdf')
    const noted = mountItem({ id: 'p-10', type: 'pdf', name: 'CNH', durationMs: 0, accentColor: '#1A237E', done: false, filePath: '/d/x.pdf', subtitle: 'Mostrar página 2' })
    expect(noted.text()).toContain('Mostrar página 2')
  })

  it('YouTube/vídeo online sem anotação não mostra a URL', () => {
    const url = 'https://www.youtube.com/watch?v=B4kXnads4eU&list=RDB4kXnads4eU&start_radio=1'
    const yt = mountItem({ id: 'y-9', type: 'online_video', name: 'INSTRUMENTAL Acoustic Worship', durationMs: 0, accentColor: '#2979FF', done: false, url, subtitle: url })
    expect(yt.text()).not.toContain('youtube.com')
  })

  it('site sem anotação não mostra o endereço', () => {
    const url = 'https://vejariviera.com.br'
    const site = mountItem({ id: 's-9', type: 'site', name: 'Veja Consultoria Imobiliaria', durationMs: 0, accentColor: '#AEEA00', done: false, url, subtitle: url })
    expect(site.text()).not.toContain('vejariviera')
  })
})

