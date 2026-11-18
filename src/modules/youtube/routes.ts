import type { RouteRecordRaw } from 'vue-router'

import YoutubeView from './views/YoutubeView.vue'

export const youtubeRoutes: RouteRecordRaw[] = [
  {
    path: 'albums/youtube',
    name: 'albums-youtube',
    component: YoutubeView,
    meta: {
      navKey: 'albums',
    },
  },
]
