import type { RouteRecordRaw } from 'vue-router'

import SabbathSchoolView from './views/SabbathSchoolView.vue'

export const sabbathSchoolRoutes: RouteRecordRaw[] = [
  {
    path: 'utilities/sabbath-school',
    name: 'utilities-sabbath-school',
    component: SabbathSchoolView,
    meta: {
      navKey: 'utilities',
    },
  },
]
