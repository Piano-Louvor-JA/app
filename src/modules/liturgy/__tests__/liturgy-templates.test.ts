import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { buildLiturgyTemplate, LITURGY_TEMPLATES } from '../services/liturgy-templates'
import { useLiturgyStore } from '../stores/useLiturgyStore'
import { loadLiturgyState } from '../services/liturgy-preferences'

vi.mock('../services/liturgy-catalog', () => ({ loadLiturgyMusicOptions: async () => [], loadLiturgyBibleBooks: async () => [], filterLiturgyMusicOptions: () => [] }))
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); setActivePinia(createPinia()) })
describe('Modelos de culto', () => {
  it.each(LITURGY_TEMPLATES)('prepara $id com horários, vínculos válidos e músicas a escolher', template => {
    const plan = buildLiturgyTemplate(template.id, key => key, '09:00')!
    expect(plan.items[0]?.startTime).toBe('09:00')
    expect(plan.items[0]?.endTime).toBeTruthy()
    expect(plan.items.slice(1).every(item => item.categoryId === plan.items[0]?.id && item.durationMs > 0)).toBe(true)
    expect(plan.items.filter(item => item.type === 'music').every(item => item.musicId == null && item.subtitle)).toBe(true)
    const another = buildLiturgyTemplate(template.id, key => key, '09:00')!
    expect(plan.items.every(item => another.items.every(other => other.id !== item.id))).toBe(true)
  })
  it('cria um programa avulso sem substituir os programas existentes e restaura após reiniciar', () => {
    const store = useLiturgyStore()
    expect(store.createTemplateLiturgy('worship', key => key, '09:00')).toBe(true)
    expect(store.createTemplateLiturgy('prayer', key => key, '19:00')).toBe(true)
    expect(store.customLiturgies).toHaveLength(2)
    setActivePinia(createPinia())
    const restored = useLiturgyStore()
    expect(restored.customLiturgies[0]?.startTime).toBe('09:00')
    expect(restored.customLiturgies[1]?.startTime).toBe('19:00')
    expect(loadLiturgyState().customLiturgies[0]?.items.length).toBeGreaterThan(5)
  })
  it('recusa horários inválidos', () => { expect(buildLiturgyTemplate('worship', key => key, '25:00')).toBeNull() })
})
