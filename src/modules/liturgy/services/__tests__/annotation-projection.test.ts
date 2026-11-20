// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const projection = vi.hoisted(() => ({
  hasExternal: true,
  openResult: true,
  open: new Set<string>(),
  independentActive: false,
}))

const openProjectionModule = vi.fn(async (moduleId: string) => {
  if (projection.openResult) projection.open = new Set([moduleId])
  return projection.openResult
})
const closeProjectionModule = vi.fn(() => {
  projection.open = new Set()
})

vi.mock('@shared/composables/useProjectionWindow', () => ({
  hasSelectedExtendedProjectionTargets: vi.fn(async () => projection.hasExternal),
  isProjectionModuleOpen: (moduleId?: string) =>
    moduleId ? projection.open.has(moduleId) : projection.open.size > 0,
  openProjectionModule: (moduleId: string) => openProjectionModule(moduleId),
  closeProjectionModule: () => closeProjectionModule(),
}))

vi.mock('@shared/composables/useIndependentProjection', () => ({
  isIndependentProjectionActive: () => projection.independentActive,
}))

import {
  ANNOTATION_INDEPENDENT_STORAGE_KEY,
  ANNOTATION_RUNTIME_STORAGE_KEY,
} from '../annotation-projection-runtime'
import {
  prepareAnnotationIndependent,
  projectAnnotation,
  refreshAnnotationProjection,
  stopAnnotationProjection,
  toggleAnnotationProjection,
  useAnnotationProjection,
} from '../annotation-projection'

const item = { id: 'a1', name: 'Almoço', subtitle: 'Sábado às 12h', notesHtml: '' }
const other = { id: 'a2', name: 'Avisos', subtitle: 'Reunião', notesHtml: '<b>Reunião</b>', titleColor: '#ffee58' }

function stored(key: string) {
  return JSON.parse(localStorage.getItem(key) ?? 'null')
}

describe('annotation-projection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    projection.hasExternal = true
    projection.openResult = true
    projection.open = new Set()
    projection.independentActive = false
    openProjectionModule.mockClear()
    closeProjectionModule.mockClear()
  })

  afterEach(() => {
    stopAnnotationProjection()
    vi.useRealTimers()
  })

  it('com monitor estendido: publica a anotação e abre o módulo nos monitores', async () => {
    const state = useAnnotationProjection()
    expect(await projectAnnotation(item)).toBe(true)
    expect(openProjectionModule).toHaveBeenCalledWith('annotation')
    expect(state.projectingItemId.value).toBe('a1')
    expect(state.inAppPreview.value).toBe(false)
    expect(stored(ANNOTATION_RUNTIME_STORAGE_KEY)).toEqual({
      active: true,
      title: 'Almoço',
      html: '<div>Sábado às 12h</div>',
      titleColor: '',
    })
  })

  it('sem monitor estendido: vira prévia no app e fecha outra projeção aberta', async () => {
    projection.hasExternal = false
    projection.open = new Set(['bible'])
    const state = useAnnotationProjection()
    expect(await projectAnnotation(item)).toBe(true)
    expect(closeProjectionModule).toHaveBeenCalledTimes(1)
    expect(openProjectionModule).not.toHaveBeenCalled()
    expect(state.inAppPreview.value).toBe(true)
    expect(state.projectingItemId.value).toBe('a1')
    vi.advanceTimersByTime(1000)
    expect(state.projectingItemId.value).toBe('a1')
  })

  it('prévia sem nada aberto não chama fechar', async () => {
    projection.hasExternal = false
    await projectAnnotation(item)
    expect(closeProjectionModule).not.toHaveBeenCalled()
  })

  it('falha ao abrir: desliga e devolve false', async () => {
    projection.openResult = false
    const state = useAnnotationProjection()
    expect(await projectAnnotation(item)).toBe(false)
    expect(state.projectingItemId.value).toBeNull()
    expect(stored(ANNOTATION_RUNTIME_STORAGE_KEY).active).toBe(false)
  })

  it('outro módulo assumiu os monitores: a anotação sai do ar', async () => {
    const state = useAnnotationProjection()
    await projectAnnotation(item)
    vi.advanceTimersByTime(400)
    expect(state.projectingItemId.value).toBe('a1')
    projection.open = new Set(['bible'])
    vi.advanceTimersByTime(400)
    expect(state.projectingItemId.value).toBeNull()
    expect(stored(ANNOTATION_RUNTIME_STORAGE_KEY).active).toBe(false)
  })

  it('alternar: liga, troca de anotação e desliga a mesma', async () => {
    const state = useAnnotationProjection()
    expect(await toggleAnnotationProjection(item)).toBe(true)
    expect(await toggleAnnotationProjection(other)).toBe(true)
    expect(state.projectingItemId.value).toBe('a2')
    expect(await toggleAnnotationProjection(other)).toBe(false)
    expect(closeProjectionModule).toHaveBeenCalled()
    expect(state.projectingItemId.value).toBeNull()
  })

  it('parar sem a anotação no ar não fecha a projeção de outro módulo', () => {
    projection.open = new Set(['bible'])
    stopAnnotationProjection()
    expect(closeProjectionModule).not.toHaveBeenCalled()
  })

  it('independente: publica no canal próprio e guarda o dono', () => {
    const state = useAnnotationProjection()
    expect(prepareAnnotationIndependent(other)).toBe(true)
    expect(state.independentItemId.value).toBe('a2')
    expect(stored(ANNOTATION_INDEPENDENT_STORAGE_KEY)).toEqual({
      active: true,
      title: 'Avisos',
      html: '<b>Reunião</b>',
      titleColor: '#ffee58',
    })
  })

  it('anotação editada no ar: atualiza só as projeções em que ela está', async () => {
    await projectAnnotation(item)
    prepareAnnotationIndependent(item)
    refreshAnnotationProjection({ ...item, name: 'Almoço especial' })
    expect(stored(ANNOTATION_RUNTIME_STORAGE_KEY).title).toBe('Almoço especial')
    expect(stored(ANNOTATION_INDEPENDENT_STORAGE_KEY).title).toBe('Almoço')

    projection.independentActive = true
    refreshAnnotationProjection({ ...item, name: 'Almoço de sábado' })
    expect(stored(ANNOTATION_INDEPENDENT_STORAGE_KEY).title).toBe('Almoço de sábado')

    refreshAnnotationProjection({ ...other, name: 'Outra' })
    expect(stored(ANNOTATION_RUNTIME_STORAGE_KEY).title).toBe('Almoço de sábado')
    expect(stored(ANNOTATION_INDEPENDENT_STORAGE_KEY).title).toBe('Almoço de sábado')
  })
})
