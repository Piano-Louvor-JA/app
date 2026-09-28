import type { RouteRecordRaw } from 'vue-router'

import MediaView from './views/MediaView.vue'
import MediaEditorView from './views/MediaEditorView.vue'

export const mediaRoutes: RouteRecordRaw[] = [
  {
    path: 'media',
    name: 'media',
    component: MediaView,
    meta: {
      navKey: 'albums',
    },
  },
  // Rota do editor sempre registrada (a preferência de visibilidade é da
  // UI de catálogo; o editor acessível por URL interna do módulo mídia).
  {
    path: 'media/editor',
    name: 'media-editor',
    component: MediaEditorView,
    meta: {
      navKey: 'albums',
    },
  },
]
