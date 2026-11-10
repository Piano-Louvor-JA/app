import { readonly, ref } from 'vue'

import { isIndependentProjectionActive } from '@shared/composables/useIndependentProjection'
import {
  closeProjectionModule,
  hasSelectedExtendedProjectionTargets,
  isProjectionModuleOpen,
  openProjectionModule,
} from '@shared/composables/useProjectionWindow'

import type { LiturgyItem } from '../types/liturgy'
import {
  DEFAULT_ANNOTATION_RUNTIME,
  annotationRuntimeFromItem,
  publishAnnotationRuntime,
} from './annotation-projection-runtime'

export const ANNOTATION_PROJECTION_MODULE = 'annotation'

type AnnotationSource = Pick<LiturgyItem, 'id' | 'name' | 'subtitle' | 'notesHtml' | 'titleColor'>

/** Anotação na projeção principal (monitores marcados ou prévia no app). */
const projectingItemId = ref<string | null>(null)
/** Sem monitor estendido marcado: a projeção vira uma prévia por cima do app. */
const inAppPreview = ref(false)
/** Anotação na projeção independente (sobrepor/compartilhar). */
const independentItemId = ref<string | null>(null)

let watchTimer: ReturnType<typeof setInterval> | null = null

function stopWatch() {
  if (watchTimer) clearInterval(watchTimer)
  watchTimer = null
}

/** Outro módulo assumiu os monitores (ou a janela fechou): a anotação sai do ar. */
function startWatch() {
  stopWatch()
  watchTimer = setInterval(() => {
    if (!isProjectionModuleOpen(ANNOTATION_PROJECTION_MODULE)) resetMain()
  }, 400)
}

function resetMain() {
  stopWatch()
  projectingItemId.value = null
  inAppPreview.value = false
  publishAnnotationRuntime({ ...DEFAULT_ANNOTATION_RUNTIME }, false)
}

export async function projectAnnotation(item: AnnotationSource): Promise<boolean> {
  publishAnnotationRuntime(annotationRuntimeFromItem(item), false)
  if (!(await hasSelectedExtendedProjectionTargets())) {
    if (isProjectionModuleOpen()) closeProjectionModule()
    projectingItemId.value = item.id
    inAppPreview.value = true
    stopWatch()
    return true
  }
  inAppPreview.value = false
  const opened = await openProjectionModule(ANNOTATION_PROJECTION_MODULE)
  if (!opened) {
    resetMain()
    return false
  }
  projectingItemId.value = item.id
  startWatch()
  return true
}

export function stopAnnotationProjection(): void {
  if (isProjectionModuleOpen(ANNOTATION_PROJECTION_MODULE)) closeProjectionModule()
  resetMain()
}

/** Play da linha: liga nesta anotação ou desliga se ela já está no ar. Retorna se ficou projetando. */
export async function toggleAnnotationProjection(item: AnnotationSource): Promise<boolean> {
  if (projectingItemId.value === item.id) {
    stopAnnotationProjection()
    return false
  }
  return projectAnnotation(item)
}

/** Antes de abrir a independente: publica esta anotação no canal dela. */
export function prepareAnnotationIndependent(item: AnnotationSource): boolean {
  publishAnnotationRuntime(annotationRuntimeFromItem(item), true)
  independentItemId.value = item.id
  return true
}

/** Anotação editada enquanto está no ar: as telas acompanham. */
export function refreshAnnotationProjection(item: AnnotationSource): void {
  if (projectingItemId.value === item.id) {
    publishAnnotationRuntime(annotationRuntimeFromItem(item), false)
  }
  if (
    independentItemId.value === item.id &&
    isIndependentProjectionActive(ANNOTATION_PROJECTION_MODULE)
  ) {
    publishAnnotationRuntime(annotationRuntimeFromItem(item), true)
  }
}

export function useAnnotationProjection() {
  return {
    projectingItemId: readonly(projectingItemId),
    independentItemId: readonly(independentItemId),
    inAppPreview: readonly(inAppPreview),
  }
}
