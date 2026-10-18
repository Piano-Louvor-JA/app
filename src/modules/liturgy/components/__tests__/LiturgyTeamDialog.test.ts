import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import LiturgyTeamDialog from '../LiturgyTeamDialog.vue'
import fr from '../../locales/fr'
import type { LiturgyItem } from '../../types/liturgy'

const item: LiturgyItem = { id: 'reading', type: 'annotation', name: 'Lecture biblique', subtitle: '', done: false, durationMs: 60000, accentColor: '#fff', responsible: 'Marie' }
const wrappers: ReturnType<typeof mount>[] = []
// jsdom não implementa os métodos nativos de <dialog>.
const dialogDescriptors = Object.getOwnPropertyDescriptors(HTMLDialogElement.prototype)
beforeAll(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', '') } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open') } },
  })
})
afterAll(() => {
  for (const key of ['showModal', 'close']) {
    const descriptor = dialogDescriptors[key]
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, key, descriptor)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key)
  }
})
function setup(items = [item]) {
  const wrapper = mount(LiturgyTeamDialog, {
    props: { open: true, items },
    global: { stubs: { teleport: true }, plugins: [createI18n({ legacy: false, locale: 'fr', messages: { fr } })] },
  })
  wrappers.push(wrapper)
  return wrapper
}
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.restoreAllMocks() })

describe('LiturgyTeamDialog', () => {
  it('edita um rascunho e só entrega a atribuição ao salvar', async () => {
    const wrapper = setup()
    await flushPromises()
    expect(wrapper.find('input').element.value).toBe('Marie')
    await wrapper.find('input').setValue('Jean')
    expect(item.responsible).toBe('Marie')
    expect(wrapper.emitted('save')).toBeUndefined()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('save')).toEqual([[{ reading: 'Jean' }]])
  })
  it('descarta alterações ao cancelar e reabrir', async () => {
    const wrapper = setup()
    await flushPromises()
    await wrapper.find('input').setValue('Jean')
    await wrapper.find('dialog').trigger('cancel')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('save')).toBeUndefined()
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    await flushPromises()
    expect(wrapper.find('input').element.value).toBe('Marie')
  })
  it('orienta o culto vazio e não oferece atribuição a categorias', async () => {
    const wrapper = setup([{ ...item, type: 'category' }])
    await flushPromises()
    expect(wrapper.findAll('input')).toHaveLength(0)
    expect(wrapper.find('[role="status"]').text()).toContain('Ajoutez des moments')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })
})
