import type { RouteRecordRaw } from 'vue-router'

import ClockView from './views/ClockView.vue'
import ObsView from './views/ObsView.vue'
import TemporizadorView from './views/TemporizadorView.vue'
import UtilitiesView from './views/UtilitiesView.vue'

export const utilitiesRoutes: RouteRecordRaw[] = [
  {
    path: 'utilities',
    name: 'utilities',
    component: UtilitiesView,
    meta: {
      navKey: 'utilities',
    },
  },
  {
    path: 'utilities/temporizador',
    name: 'utilities-temporizador',
    component: TemporizadorView,
    meta: {
      navKey: 'utilities',
    },
  },
  {
    path: 'utilities/clock',
    name: 'utilities-clock',
    component: ClockView,
    meta: {
      navKey: 'utilities',
    },
  },
  {
    path: 'utilities/obs',
    name: 'utilities-obs',
    component: ObsView,
    meta: {
      navKey: 'utilities',
    },
  },
]
