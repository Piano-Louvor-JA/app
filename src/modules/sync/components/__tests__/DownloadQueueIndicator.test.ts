import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import Indicator from '../DownloadQueueIndicator.vue'
import type { DownloadQueueItem } from '../../services/download-queue-service'
const mocks = vi.hoisted(() => ({ subscribe: vi.fn(), unsubscribe: vi.fn(), retry: vi.fn(), cancel: vi.fn(), clear: vi.fn() }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../../services/download-queue-service', () => ({ subscribeDownloadQueue: mocks.subscribe, retryDownload: mocks.retry, cancelDownload: mocks.cancel, clearFinishedDownloads: mocks.clear }))
let wrapper: VueWrapper
let publish: (items: DownloadQueueItem[]) => void
const item = (id: string, status: string) => ({ id, label: id, status }) as DownloadQueueItem
beforeEach(() => {
  mocks.subscribe.mockImplementation(callback => { publish = callback; callback([]); return mocks.unsubscribe })
  wrapper = mount(Indicator)
})
afterEach(() => { wrapper.unmount(); vi.clearAllMocks() })
describe('indicador da fila de downloads', () => {
  it('não ocupa espaço sem itens e cancela a assinatura ao desmontar', () => {
    expect(wrapper.find('.download-queue-indicator').exists()).toBe(false)
    wrapper.unmount()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  })
  it('conta ativos, ordena execução antes de pendências/falhas/concluídos e delega ações', async () => {
    publish([item('done', 'done'), item('failed', 'failed'), item('pending', 'pending'), item('running', 'running')])
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.download-queue-indicator__badge').text()).toBe('2')
    await wrapper.get('[data-testid=download-queue-button]').trigger('click')
    expect(wrapper.findAll('.download-queue-indicator__label').map(label => label.text())).toEqual(['running','pending','failed','done'])
    await wrapper.get('[data-status=failed] button').trigger('click')
    await wrapper.get('[data-status=pending] button').trigger('click')
    await wrapper.get('.download-queue-indicator__clear').trigger('click')
    expect(mocks.retry).toHaveBeenCalledWith('failed')
    expect(mocks.cancel).toHaveBeenCalledWith('pending')
    expect(mocks.clear).toHaveBeenCalledOnce()
    await wrapper.get('[data-testid=download-queue-button]').trigger('click')
    expect(wrapper.find('.download-queue-indicator__panel').exists()).toBe(false)
  })
  it('mostra alerta sem contador quando só restam falhas e remove destaque após sucesso', async () => {
    publish([item('failed', 'failed')])
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.download-queue-indicator__badge').exists()).toBe(false)
    expect(wrapper.get('[data-testid=download-queue-button]').classes()).toContain('download-queue-indicator__button--has-failed')
    expect(wrapper.find('.ti-alert-triangle').exists()).toBe(true)
    publish([item('done', 'done')])
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ti-alert-triangle').exists()).toBe(false)
    expect(wrapper.get('[data-testid=download-queue-button]').classes()).not.toContain('download-queue-indicator__button--has-failed')
  })
  it('limita o painel aos 20 primeiros itens sem alterar a fila recebida', async () => {
    const items = Array.from({ length: 25 }, (_, i) => item(`download-${i}`, 'pending'))
    publish(items)
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-testid=download-queue-button]').trigger('click')
    expect(wrapper.findAll('li')).toHaveLength(20)
    expect(items).toHaveLength(25)
    expect(wrapper.get('.download-queue-indicator__badge').text()).toBe('25')
  })
})
