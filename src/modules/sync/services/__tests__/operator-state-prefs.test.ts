import { beforeEach, describe, expect, it, vi } from 'vitest'
import { USER_PREFERENCE_KEYS as keys } from '@shared/constants/storage-keys'
const values = new Map<string, unknown>()
vi.mock('@shared/services/user-preferences', () => ({ setUserPreference: (key: string, value: unknown) => values.set(key, value), getUserPreference: (key: string, fallback: unknown) => values.get(key) ?? fallback }))
import { applyOperatorState, markLocalPrefsPushed, markLocalScheduledPushed, markLocalLiturgyPushed, currentScheduledOperatorItem, currentLiturgyOperatorItem } from '../operator-state-apply'
const item = (namespace: string, key: string, value: unknown, at=2000) => ({ namespace,key,value_json:JSON.stringify(value),updated_at_ms:at,deleted_at:null,client_uuid:'test' })
beforeEach(() => { values.clear(); localStorage.clear() })
describe('sincronização de preferências e agendados', () => {
  it('aplica somente preferências permitidas e respeita versão local ou empatada', () => {
    markLocalPrefsPushed(1000)
    expect(applyOperatorState([item('prefs','values',{ [keys.theme]:'dark', 'louvorja.custom.auth':'secret' })])).toBe(true)
    expect(values.get(keys.theme)).toBe('dark')
    expect(values.has('louvorja.custom.auth')).toBe(false)
    expect(applyOperatorState([item('prefs','values',{ [keys.theme]:'light' },2000)])).toBe(false)
    expect(values.get(keys.theme)).toBe('dark')
    expect(applyOperatorState([item('prefs','values',{ [keys.theme]:'light' },1000)])).toBe(false)
  })
  it('ignora preferências inválidas ou inteiramente fora da lista sem avançar a versão', () => {
    for(const value of [null,'invalid',42,{}, { 'unknown':'ignored' }]) expect(applyOperatorState([item('prefs','values',value)])).toBe(false)
    expect(values.size).toBe(0)
    expect(localStorage.getItem('pianolouvorja:sync:prefs:updatedAt')).toBeNull()
  })
  it('aplica agendados mais recentes, protege os locais e monta payload para o próximo push', () => {
    const state = { categories:[{ id:'rotation' }],items:[{ id:'entry' }] }
    expect(currentScheduledOperatorItem()).toBeNull()
    markLocalScheduledPushed(1000)
    expect(applyOperatorState([item('scheduled','items',state)])).toBe(true)
    expect(values.get(keys.scheduledState)).toEqual(state)
    expect(currentScheduledOperatorItem()).toMatchObject({ namespace:'scheduled',key:'items',value_json:JSON.stringify(state),deleted_at:null })
    expect(applyOperatorState([item('scheduled','items',{ categories:[],items:[] },1000)])).toBe(false)
    for(const invalid of [null, {}, { categories:[] }, { items:[] }]) expect(applyOperatorState([item('scheduled','items',invalid,3000)])).toBe(false)
  })
  it('prepara liturgia válida e registra instantes padrão dos três namespaces', () => {
    expect(currentLiturgyOperatorItem()).toBeNull()
    values.set(keys.liturgyState,{ weekdays:{} })
    expect(currentLiturgyOperatorItem()).toMatchObject({ namespace:'liturgy',key:'week',value_json:'{"weekdays":{}}' })
    const now = Date.now()
    markLocalLiturgyPushed();markLocalScheduledPushed();markLocalPrefsPushed()
    for(const key of ['liturgy:week','scheduled:items','prefs']) expect(Number(localStorage.getItem(`pianolouvorja:sync:${key}:updatedAt`))).toBeGreaterThanOrEqual(now)
  })
})
