// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import liturgyLocale from '../../locales/pt-BR'
import LiturgyRichNotesEditor from '../LiturgyRichNotesEditor.vue'

const i18n = createI18n({ legacy: false, locale: 'pt-BR', messages: { 'pt-BR': liturgyLocale } })

const execCommand = vi.fn(() => true)
const queryCommandState = vi.fn((_command: string) => false)

function mountEditor(modelValue = '') {
  return mount(LiturgyRichNotesEditor, {
    props: { modelValue, placeholder: 'Escreva aqui', labelledby: 'rotulo' },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
}

type Wrapper = ReturnType<typeof mountEditor>
const content = (wrapper: Wrapper) => wrapper.get('.rich-notes-editor__content').element as HTMLDivElement
const lastEmitted = (wrapper: Wrapper) => wrapper.emitted('update:modelValue')?.at(-1)?.[0]
const commands = () => execCommand.mock.calls.map(([command, , value]) => [command, value])

function selectInside(node: Node) {
  const range = document.createRange()
  range.selectNodeContents(node)
  const selection = document.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
}

describe('LiturgyRichNotesEditor', () => {
  beforeEach(() => {
    execCommand.mockClear()
    queryCommandState.mockReset()
    queryCommandState.mockReturnValue(false)
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })
    Object.defineProperty(document, 'queryCommandState', { value: queryCommandState, configurable: true })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('mostra o texto inicial limpo; vazio mostra o texto de exemplo', async () => {
    const wrapper = mountEditor('<div><b>Almoço</b><script>x</script></div>')
    await flushPromises()
    expect(content(wrapper).innerHTML).toBe('<div><b>Almoço</b></div>')
    expect(content(wrapper).classList).not.toContain('is-empty')
    expect(content(wrapper).getAttribute('aria-labelledby')).toBe('rotulo')
    expect(content(wrapper).dataset.placeholder).toBe('Escreva aqui')
    const empty = mountEditor('')
    expect(content(empty).classList).toContain('is-empty')
  })

  it('digitar emite o HTML limpo', async () => {
    const wrapper = mountEditor()
    content(wrapper).innerHTML = '<div>Oi <span style="color: #fff; position: fixed">mundo</span></div>'
    await wrapper.get('.rich-notes-editor__content').trigger('input')
    expect(lastEmitted(wrapper)).toBe('<div>Oi <span style="color: #fff;">mundo</span></div>')
    expect(content(wrapper).classList).not.toContain('is-empty')
  })

  it('negrito, itálico, sublinhado, listas, alinhamento e limpar disparam o comando com CSS', async () => {
    const wrapper = mountEditor('<div>Texto</div>')
    for (const command of [
      'bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList',
      'justifyLeft', 'justifyCenter', 'justifyRight', 'removeFormat',
    ]) {
      execCommand.mockClear()
      await wrapper.get(`[data-command="${command}"]`).trigger('click')
      expect(commands()).toEqual([['styleWithCSS', 'true'], [command, undefined]])
    }
    expect(wrapper.emitted('update:modelValue')).toHaveLength(9)
  })

  it('tamanho: abre o menu, aplica e fecha', async () => {
    const wrapper = mountEditor('<div>Texto</div>')
    expect(wrapper.find('[data-size]').exists()).toBe(false)
    await wrapper.get('[data-menu="size"]').trigger('click')
    expect(wrapper.get('[data-menu="size"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('[data-size]').map((button) => button.text())).toEqual(['Pequeno', 'Normal', 'Grande', 'Título'])
    await wrapper.get('[data-size="6"]').trigger('click')
    expect(commands()).toContainEqual(['fontSize', '6'])
    expect(wrapper.find('[data-size]').exists()).toBe(false)
  })

  it('cor do texto e marca-texto (com opção sem marca)', async () => {
    const wrapper = mountEditor('<div>Texto</div>')
    await wrapper.get('[data-menu="color"]').trigger('click')
    await wrapper.get('[data-color="#ff6d00"]').trigger('click')
    expect(commands()).toContainEqual(['foreColor', '#ff6d00'])

    await wrapper.get('[data-menu="highlight"]').trigger('click')
    await wrapper.get('[data-color="rgba(255, 235, 59, 0.35)"]').trigger('click')
    expect(commands()).toContainEqual(['hiliteColor', 'rgba(255, 235, 59, 0.35)'])

    await wrapper.get('[data-menu="highlight"]').trigger('click')
    await wrapper.get('[data-color="transparent"]').trigger('click')
    expect(commands()).toContainEqual(['hiliteColor', 'transparent'])
  })

  it('clicar de novo no menu, fora do editor ou no texto fecha o menu', async () => {
    const wrapper = mountEditor('<div>Texto</div>')
    const menu = wrapper.get('[data-menu="color"]')
    await menu.trigger('click')
    await menu.trigger('click')
    expect(wrapper.find('[data-color]').exists()).toBe(false)

    await menu.trigger('click')
    const inside = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    wrapper.get('[data-color="#ff6d00"]').element.dispatchEvent(inside)
    await flushPromises()
    expect(inside.defaultPrevented).toBe(true)
    expect(wrapper.find('[data-color]').exists()).toBe(true)
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flushPromises()
    expect(wrapper.find('[data-color]').exists()).toBe(false)

    await menu.trigger('click')
    await wrapper.get('.rich-notes-editor__content').trigger('focus')
    expect(wrapper.find('[data-color]').exists()).toBe(false)
  })

  it('colar HTML entra limpo; colar texto entra como texto', async () => {
    const wrapper = mountEditor()
    const paste = (data: Record<string, string> | null) => {
      const event = new Event('paste', { cancelable: true })
      Object.defineProperty(event, 'clipboardData', {
        value: data && { getData: (type: string) => data[type] ?? '' },
      })
      content(wrapper).dispatchEvent(event)
      return event
    }
    expect(paste({ 'text/html': '<p style="font-size: 40px">Oi<img src=x onerror=1></p>' }).defaultPrevented).toBe(true)
    expect(commands()).toContainEqual(['insertHTML', '<p>Oi</p>'])
    paste({ 'text/plain': 'só texto' })
    expect(commands()).toContainEqual(['insertText', 'só texto'])
    execCommand.mockClear()
    expect(paste(null).defaultPrevented).toBe(false)
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('botões acendem conforme a formatação onde está o cursor', async () => {
    const wrapper = mountEditor('<div><b>Negrito</b></div>')
    queryCommandState.mockImplementation((command: string) => {
      if (command === 'italic') throw new Error('não suportado')
      return command === 'bold'
    })
    selectInside(content(wrapper).querySelector('b')!)
    await flushPromises()
    expect(wrapper.get('[data-command="bold"]').classes()).toContain('is-active')
    expect(wrapper.get('[data-command="bold"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-command="italic"]').classes()).not.toContain('is-active')

    queryCommandState.mockReturnValue(false)
    const outside = document.createElement('p')
    outside.textContent = 'fora'
    document.body.appendChild(outside)
    selectInside(outside)
    await flushPromises()
    expect(wrapper.get('[data-command="bold"]').classes()).toContain('is-active')

    document.getSelection()!.removeAllRanges()
    document.dispatchEvent(new Event('selectionchange'))
    await flushPromises()
    expect(wrapper.get('[data-command="bold"]').classes()).toContain('is-active')
  })

  it('valor novo vindo de fora redesenha; o próprio valor emitido não', async () => {
    const wrapper = mountEditor('<div>A</div>')
    content(wrapper).innerHTML = '<div>AB</div>'
    await wrapper.get('.rich-notes-editor__content').trigger('input')
    const node = content(wrapper).firstChild
    await wrapper.setProps({ modelValue: '<div>AB</div>' })
    expect(content(wrapper).firstChild).toBe(node)
    await wrapper.setProps({ modelValue: '<div>Outro</div>' })
    expect(content(wrapper).innerHTML).toBe('<div>Outro</div>')
  })

  it('desmontar remove os ouvintes do documento', () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    mountEditor().unmount()
    expect(remove).toHaveBeenCalledWith('selectionchange', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('mousedown', expect.any(Function))
    remove.mockRestore()
  })
})
