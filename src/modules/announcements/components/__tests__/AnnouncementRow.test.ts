// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, arg?: unknown) => (arg === undefined ? key : `${key}:${JSON.stringify(arg)}`) }),
}))

import AnnouncementRow from '../AnnouncementRow.vue'
import AnnouncementListBar from '../AnnouncementListBar.vue'
import type { Announcement } from '../../types/announcements'

function row(item: Announcement, extra: Record<string, unknown> = {}) {
  return mount(AnnouncementRow, { props: { item, index: 1, total: 3, ...extra } })
}

const text: Announcement = { id: 't', kind: 'text', title: 'Batismo', titleColor: '', html: '', plainText: '\n Sábado às 9h\nmais' }

describe('AnnouncementRow', () => {
  it('mostra título, tipo e a primeira linha do texto', () => {
    const w = row(text)
    expect(w.text()).toContain('Batismo')
    expect(w.text()).toContain('announcements.kinds.text')
    expect(w.find('[data-test="row-subtitle"]').text()).toBe('·  Sábado às 9h')
  })

  it('sem título mostra "Sem título"; texto vazio não mostra subtítulo', () => {
    const w = row({ ...text, title: '', plainText: '' })
    expect(w.text()).toContain('announcements.untitled')
    expect(w.find('[data-test="row-subtitle"]').exists()).toBe(false)
  })

  it('imagens mostram a contagem; vídeo mostra o arquivo ou "nenhum arquivo"', () => {
    expect(row({ id: 'a', kind: 'images', title: '', files: [{ relativePath: 'x', name: 'x' }] }).text()).toContain('announcements.imagesCount:1')
    expect(row({ id: 'v', kind: 'video', title: '', file: { relativePath: 'x', name: 'chamada.mp4' } }).text()).toContain('chamada.mp4')
    expect(row({ id: 'p', kind: 'presentation', title: '', file: null }).text()).toContain('announcements.noFile')
    const url = row({ id: 'u', kind: 'url', title: 'Canal', url: 'https://youtu.be/abc' })
    expect(url.text()).toContain('https://youtu.be/abc')
    expect(url.find('.ti-link').exists()).toBe(true)
  })

  it('emite as ações dos botões e do duplo clique', async () => {
    const w = row(text)
    await w.find('[data-test="row-project"]').trigger('click')
    await w.find('[data-test="row-edit"]').trigger('click')
    await w.find('[data-test="row-duplicate"]').trigger('click')
    await w.find('[data-test="row-remove"]').trigger('click')
    await w.trigger('dblclick')
    expect(Object.keys(w.emitted())).toEqual(expect.arrayContaining(['project', 'edit', 'duplicate', 'remove']))
    expect(w.emitted('edit')).toHaveLength(2)
  })

  it('botão do carrossel: só em texto e imagens, ligado por padrão, e alterna', async () => {
    const w = row(text)
    const btn = w.get('[data-test="row-carousel"]')
    expect(btn.attributes('aria-pressed')).toBe('true')
    expect(btn.classes()).toContain('is-on')
    expect(btn.attributes('title')).toBe('announcements.actions.carouselOn')
    await btn.trigger('click')
    expect(w.emitted('toggle-carousel')).toEqual([[false]])

    const off = row({ ...text, inCarousel: false } as Announcement)
    expect(off.get('[data-test="row-carousel"]').attributes('aria-pressed')).toBe('false')
    expect(off.get('[data-test="row-carousel"]').attributes('title')).toBe('announcements.actions.carouselOff')
    await off.get('[data-test="row-carousel"]').trigger('click')
    expect(off.emitted('toggle-carousel')).toEqual([[true]])

    expect(row({ id: 'a', kind: 'images', title: '', files: [] }).find('[data-test="row-carousel"]').exists()).toBe(true)
    expect(row({ id: 'v', kind: 'video', title: '', file: null }).find('[data-test="row-carousel"]').exists()).toBe(false)
    expect(row({ id: 'u', kind: 'url', title: '', url: 'https://x.org' }).find('[data-test="row-carousel"]').exists()).toBe(false)
  })

  it('projetando: botão vira "parar" e a linha fica marcada', () => {
    const w = row(text, { projecting: true })
    expect(w.classes()).toContain('announcement-row--projecting')
    expect(w.find('[data-test="row-project"]').attributes('aria-label')).toBe('announcements.actions.stop')
  })

  it('arquivo ausente mostra o selo', () => {
    expect(row(text, { missing: true }).find('[data-test="missing-badge"]').exists()).toBe(true)
  })

  it('Alt+↑/↓ reordena dentro dos limites', async () => {
    const w = row(text)
    await w.trigger('keydown', { key: 'ArrowUp', altKey: true })
    await w.trigger('keydown', { key: 'ArrowDown', altKey: true })
    await w.trigger('keydown', { key: 'ArrowDown' })
    expect(w.emitted('move')).toEqual([[1, 0], [1, 2]])
    const first = row(text, { index: 0, total: 1 })
    await first.trigger('keydown', { key: 'ArrowUp', altKey: true })
    await first.trigger('keydown', { key: 'ArrowDown', altKey: true })
    expect(first.emitted('move')).toBeUndefined()
  })

  it('arrastar e soltar emite de onde para onde', async () => {
    const data = new Map<string, string>()
    const dataTransfer = {
      types: [] as string[],
      effectAllowed: '',
      setData: (type: string, value: string) => { data.set(type, value); dataTransfer.types.push(type) },
      getData: (type: string) => data.get(type) ?? '',
    }
    const source = row(text, { index: 0 })
    await source.trigger('dragstart', { dataTransfer })
    expect(dataTransfer.effectAllowed).toBe('move')

    const target = row(text, { index: 2 })
    await target.trigger('dragover', { dataTransfer })
    expect(target.classes()).toContain('announcement-row--drag-over')
    await target.trigger('drop', { dataTransfer })
    expect(target.emitted('move')).toEqual([[0, 2]])
    expect(target.classes()).not.toContain('announcement-row--drag-over')

    // arrasto de outra coisa (arquivo do sistema) é ignorado
    const other = row(text)
    await other.trigger('dragover', { dataTransfer: { types: ['Files'] } })
    expect(other.classes()).not.toContain('announcement-row--drag-over')
    await other.trigger('dragleave')
    await other.trigger('drop', { dataTransfer: { getData: () => '1' } })
    expect(other.emitted('move')).toBeUndefined()
  })
})

describe('AnnouncementListBar', () => {
  const lists = [
    { id: 'l1', name: 'Sábado', items: [] },
    { id: 'l2', name: 'Jovens', items: [text] },
  ]

  it('marca a lista ativa, mostra a contagem e emite as ações', async () => {
    const w = mount(AnnouncementListBar, { props: { lists, activeListId: 'l2' } })
    const chips = w.findAll('[data-test="list-chip"]')
    expect(chips.map((c) => c.attributes('aria-selected'))).toEqual(['false', 'true'])
    expect(chips[1]!.text()).toContain('1')
    await chips[0]!.trigger('click')
    for (const action of ['create', 'rename', 'duplicate', 'remove']) {
      await w.find(`[data-test="list-${action}"]`).trigger('click')
    }
    expect(w.emitted('select')).toEqual([['l1']])
    expect(Object.keys(w.emitted())).toEqual(expect.arrayContaining(['create', 'rename', 'duplicate', 'remove']))
  })
})
