import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import BibleComparison from '../BibleComparison.vue'
import study from '@locales/study'
import { loadChapterVerses } from '../../services/bible-catalog'
vi.mock('../../services/bible-catalog', () => ({ loadChapterVerses: vi.fn() }))
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.resetAllMocks() })
function setup() {
  const wrapper = mount(BibleComparison, { props: { versions: [{ id: 1, name: 'Édition A', abbreviation: 'A', languageId: 'fr' }, { id: 2, name: 'Édition B', abbreviation: 'B', languageId: 'fr' }], versionId: 1, bookId: 43, chapter: 3, verses: [16] }, global: { plugins: [createI18n({ legacy: false, locale: 'fr', messages: study })] } })
  wrappers.push(wrapper)
  return wrapper
}
describe('Comparaison biblique', () => {
  it('affiche les vrais textes sans remplacer un verset absent', async () => {
    vi.mocked(loadChapterVerses).mockImplementation(async version => version === 1 ? { '16': 'Texte A', '17': 'Verset suivant' } : { '16': 'Texte B' })
    const wrapper = setup()
    await flushPromises()
    expect(wrapper.text()).toContain('Texte A')
    expect(wrapper.text()).toContain('Texte B')
    await wrapper.setProps({ verses: [17] })
    await flushPromises()
    expect(wrapper.text()).toContain('Verset suivant')
    expect(wrapper.text()).toContain('Aucun texte dans cette édition')
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
  it('ignore une réponse dépassée après un changement de chapitre', async () => {
    let finishOld: (value: Record<string, string>) => void = () => {}
    vi.mocked(loadChapterVerses).mockImplementation(async (_version, _book, chapter) => chapter === 3 ? await new Promise(resolve => { finishOld = resolve }) : { '16': 'Nouveau chapitre' })
    const wrapper = setup()
    await wrapper.setProps({ chapter: 4 })
    await flushPromises()
    finishOld({ '16': 'Ancien chapitre' })
    await flushPromises()
    expect(wrapper.text()).toContain('Nouveau chapitre')
    expect(wrapper.text()).not.toContain('Ancien chapitre')
  })
})
