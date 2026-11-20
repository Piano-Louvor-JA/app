import { useScheduledStore } from '../useScheduledStore'
import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
vi.mock('@modules/sync/services/sync-outbox-service', () => ({ enqueueOperatorState: vi.fn(), scheduleOutboxFlush: vi.fn() }))
import { enqueueOperatorState } from '@modules/sync/services/sync-outbox-service'
import { useLiturgyStore } from '../useLiturgyStore'
beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); vi.clearAllMocks() })
it.each(['pt', 'en', 'es'])('a escrita de liturgia usa a chave %s que o pull reconhece', (language) => {
  localStorage.setItem('user_data', JSON.stringify({language}))
  const store = useLiturgyStore()
  expect(localStorage.getItem(`sync.modified.v1.liturgy.${language}`)).toBeNull()
  store.currentNotes = 'Equipe'
  expect(localStorage.getItem(`sync.modified.v1.liturgy.${language}`)).toBeTruthy()
  expect(enqueueOperatorState).toHaveBeenLastCalledWith('liturgy', language, expect.objectContaining({dayNotes: expect.any(Object)}))
})

it('edição da agenda registra relógio para exportação e mantém a data canônica',()=>{const store=useScheduledStore();store.upsertItem({id:'e',categoryId:'r',date:'2026-11-14',name:'Episódio'});expect(localStorage.getItem('sync.modified.v1.scheduled')).toBeTruthy();expect(enqueueOperatorState).toHaveBeenLastCalledWith('scheduled','items',expect.objectContaining({items:[expect.objectContaining({date:'2026-11-14'})]}))})
