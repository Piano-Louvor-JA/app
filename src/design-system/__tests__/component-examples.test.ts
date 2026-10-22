import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref, type Component } from 'vue'

vi.mock('vue-i18n', async importOriginal => ({ ...await importOriginal<typeof import('vue-i18n')>(), useI18n: () => ({ t: (key: string) => key, locale: ref('pt-BR') }) }))

const modules = import.meta.glob([
  '../components/GlassCard.stories.ts',
  '../components/BlurContainer.stories.ts',
  '../../modules/countdown/components/CountdownDurationInput.stories.ts',
  '../../modules/countdown/components/CountdownPreview.stories.ts',
  '../../modules/countdown/components/CountdownSavedList.stories.ts',
  '../../modules/media/components/MediaPlayerControls.stories.ts',
  '../../modules/media/components/MediaStatusPreview.stories.ts',
  '../../modules/liturgy/components/LiturgyTimelineItem.stories.ts',
], { eager:true }) as Record<string, Record<string, any>>

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })

describe('exemplos publicados dos componentes', () => {
  for(const [path, module] of Object.entries(modules)) {
    const meta = module.default
    for(const [name, story] of Object.entries(module)) {
      if(name === 'default') continue
      it(`${meta.title}: ${name} monta o componente documentado`, () => {
        const component = story.render ? story.render(story.args ?? {}) : meta.component
        const wrapper = mount(component as Component, { props:story.render ? {} : story.args, global:{ stubs:{ teleport:true } } })
        try {
          expect(wrapper.exists(), path).toBe(true)
          if(story.render) expect(wrapper.findComponent(meta.component).exists()).toBe(true)
          else expect(wrapper.html().length).toBeGreaterThan(0)
          if(story.args?.snippet) expect(wrapper.text()).toContain(story.args.snippet)
          if(story.args?.reference) expect(wrapper.text()).toContain(story.args.reference)
        } finally { wrapper.unmount() }
      })
    }
  }
})
