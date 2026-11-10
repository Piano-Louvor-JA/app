import type { RouteRecordRaw } from 'vue-router'

import AnnouncementsView from './views/AnnouncementsView.vue'

export const announcementsRoutes: RouteRecordRaw[] = [
  {
    path: 'utilities/announcements',
    name: 'utilities-announcements',
    component: AnnouncementsView,
    meta: {
      navKey: 'utilities',
    },
  },
]
