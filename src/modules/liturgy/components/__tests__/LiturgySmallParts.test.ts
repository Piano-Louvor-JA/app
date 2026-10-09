// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import ptBR from '../../locales/pt-BR'

vi.mock('@design-system/index', () => ({ GlassCard: { template: '<div><slot /></div>' } }))

import LiturgyCloneDialog from '../../components/LiturgyCloneDialog.vue'
import LiturgyCustomBar from '../../components/LiturgyCustomBar.vue'
import LiturgyCustomDialog from '../../components/LiturgyCustomDialog.vue'
import LiturgyDayTabs from '../../components/LiturgyDayTabs.vue'
import LiturgyNotesPanel from '../../components/LiturgyNotesPanel.vue'

const i18n = createI18n({ legacy: false, locale: 'pt', messages: { pt: ptBR } })
const mountOpts = { global: { plugins: [i18n] } }

describe('LiturgyCloneDialog', () => {
  const sources = [
    { kind: 'weekday', day: 'sunday', labelKey: 'liturgy.days.sunday', itemCount: 3 },
    { kind: 'custom', id: 'c1', name: 'Culto Extra', itemCount: 2 },
  ] as never[]

  function mountClone(props: Record<string, unknown>) {
    return mount(LiturgyCloneDialog, { ...mountOpts, props, attachTo: document.body })
  }

  it('não renderiza backdrop quando open=false', () => {
    const w = mountClone({ open: false, sources, sourceKey: '' })
    expect(document.querySelector('.liturgy-dialog-backdrop')).toBeNull()
    w.unmount()
  })

  it('renderiza backdrop quando open=true', () => {
    const w = mountClone({ open: true, sources, sourceKey: '' })
    expect(document.querySelector('.liturgy-dialog-backdrop')).toBeTruthy()
    w.unmount()
  })

  it('confirm desabilitado sem sourceKey', () => {
    const w = mountClone({ open: true, sources, sourceKey: '' })
    const confirm = [...document.querySelectorAll('button')].find(b => b.classList.contains('liturgy-dialog__btn') && !b.classList.contains('liturgy-dialog__btn--ghost'))
    expect(confirm?.hasAttribute('disabled')).toBe(true)
    w.unmount()
  })

  it('confirm habilitado com sourceKey emite confirm', async () => {
    const w = mountClone({ open: true, sources, sourceKey: 'weekday:sunday' })
    const confirm = [...document.querySelectorAll('button')].find(b => b.classList.contains('liturgy-dialog__btn') && !b.classList.contains('liturgy-dialog__btn--ghost'))
    expect(confirm?.hasAttribute('disabled')).toBe(false)
    confirm?.click()
    await w.vm.$nextTick()
    expect(w.emitted('confirm')).toBeTruthy()
    w.unmount()
  })

  it('mudar select emite update:sourceKey', async () => {
    const w = mountClone({ open: true, sources, sourceKey: '' })
    const select = document.querySelector('select') as HTMLSelectElement
    if (select) {
      select.value = 'weekday:sunday'
      select.dispatchEvent(new Event('change'))
      await w.vm.$nextTick()
      expect(w.emitted('update:sourceKey')?.[0]).toEqual(['weekday:sunday'])
    }
    w.unmount()
  })

  it('clique no cancel emite close', async () => {
    const w = mountClone({ open: true, sources, sourceKey: '' })
    const cancel = [...document.querySelectorAll('button')].find(b => b.classList.contains('liturgy-dialog__btn--ghost'))
    cancel?.click()
    await w.vm.$nextTick()
    expect(w.emitted('close')).toBeTruthy()
    w.unmount()
  })

  it('renderiza fonte customizada', () => {
    const w = mountClone({ open: true, sources: [sources[1]], sourceKey: 'custom:c1' })
    expect(document.querySelector('option')?.value).toBe('custom:c1')
    expect(document.querySelector('option')?.textContent).toContain('Culto Extra')
    w.unmount()
  })

  it('renderiza estado sem fontes', () => {
    const w = mountClone({ open: true, sources: [], sourceKey: '' })
    const option = document.querySelector('option')
    expect(option?.disabled).toBe(true)
    expect(option?.value).toBe('')
    w.unmount()
  })
})

describe('LiturgyCustomBar', () => {
  const liturgies = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ] as never[]

  it('mostra empty quando sem liturgias', () => {
    const w = mount(LiturgyCustomBar, { ...mountOpts, props: { liturgies: [], selectedIndex: 0 } })
    expect(w.find('.liturgy-custom-bar__empty').exists()).toBe(true)
  })

  it('renderiza chips quando tem liturgias', () => {
    const w = mount(LiturgyCustomBar, { ...mountOpts, props: { liturgies, selectedIndex: 0 } })
    expect(w.find('.liturgy-custom-bar__empty').exists()).toBe(false)
    expect(w.findAll('button').length).toBeGreaterThan(0)
  })

  it('clique no chip emite select com index', async () => {
    const w = mount(LiturgyCustomBar, { ...mountOpts, props: { liturgies, selectedIndex: 0 } })
    const chips = w.findAll('button')
    await chips[1].trigger('click')
    expect(w.emitted('select')?.[0]).toEqual([1])
  })
})

describe('LiturgyCustomDialog', () => {
  it('não renderiza backdrop quando open=false', () => {
    const w = mount(LiturgyCustomDialog, { ...mountOpts, props: { open: false, name: '' }, attachTo: document.body })
    expect(w.find('.liturgy-dialog-backdrop').exists()).toBe(false)
  })

  it('renderiza backdrop quando open=true', async () => {
    const w = mount(LiturgyCustomDialog, { ...mountOpts, props: { open: true, name: '' }, attachTo: document.body })
    await w.vm.$nextTick()
    expect(document.querySelector('.liturgy-dialog-backdrop')).toBeTruthy()
    w.unmount()
  })

  it('digitar nome emite update:name', async () => {
    const w = mount(LiturgyCustomDialog, { ...mountOpts, props: { open: true, name: '' }, attachTo: document.body })
    await w.vm.$nextTick()
    const input = document.querySelector('.liturgy-dialog input') as HTMLInputElement
    if (input) {
      input.value = 'Novo nome'
      input.dispatchEvent(new Event('input'))
      await w.vm.$nextTick()
      expect(w.emitted('update:name')?.[0]).toEqual(['Novo nome'])
    }
    w.unmount()
  })
})

describe('LiturgyDayTabs', () => {
  it('renderiza chips na ordem dos dias', () => {
    const w = mount(LiturgyDayTabs, { ...mountOpts, props: { selectedDay: 'sunday' } })
    expect(w.findAll('.liturgy-day-tabs__chip').length).toBeGreaterThan(0)
  })

  it('chip ativo corresponde ao selectedDay', () => {
    const w = mount(LiturgyDayTabs, { ...mountOpts, props: { selectedDay: 'sunday' } })
    expect(w.find('.liturgy-day-tabs__chip--active').exists()).toBe(true)
  })

  it('clique em chip emite select com o dia', async () => {
    const w = mount(LiturgyDayTabs, { ...mountOpts, props: { selectedDay: 'sunday' } })
    const chips = w.findAll('.liturgy-day-tabs__chip')
    await chips[1].trigger('click')
    expect(w.emitted('select')).toBeTruthy()
    expect(w.emitted('select')![0][0]).toBe('monday')
  })
})

describe('LiturgyNotesPanel', () => {
  it('renderiza textarea com valor', () => {
    const w = mount(LiturgyNotesPanel, { ...mountOpts, props: { modelValue: 'anotação' } })
    const ta = w.find('textarea')
    expect((ta.element as HTMLTextAreaElement).value).toBe('anotação')
  })

  it('digitar emite update:modelValue', async () => {
    const w = mount(LiturgyNotesPanel, { ...mountOpts, props: { modelValue: '' } })
    const ta = w.find('textarea')
    ;(ta.element as HTMLTextAreaElement).value = 'x'
    await ta.trigger('input')
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['x'])
  })
})
