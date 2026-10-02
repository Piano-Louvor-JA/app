import {
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router'

import AppShell from '@layouts/AppShell.vue'
import { bibleRoutes } from '@modules/bible/routes'
import { utilitiesRoutes } from '@modules/clock/routes'
import { countdownRoutes } from '@modules/countdown/routes'
import { albumsRoutes } from '@modules/albums/routes'
import { communityRoutes } from '@modules/community/routes'
import { homeRoutes } from '@modules/home/routes'
import { liturgyRoutes } from '@modules/liturgy/routes'
import { mediaRoutes } from '@modules/media/routes'
import { settingsRoutes } from '@modules/settings/routes'
import { randomRoutes } from '@modules/random/routes'
import { timerRoutes } from '@modules/timer/routes'
import ProjectionHost from '@shared/components/ProjectionHost.vue'
import { isElectronShell } from '@shared/services/desktop-bridge'

/** Em Electron (file:// ou shell) history mode quebra; hash funciona em dev e prod. */
const isFileProtocol =
  typeof window !== 'undefined' && window.location.protocol === 'file:'
const useHashRouter = isFileProtocol || isElectronShell()

const router = createRouter({
  history: useHashRouter
    ? createWebHashHistory(import.meta.env.BASE_URL)
    : createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/popup',
      name: 'projection-popup',
      component: ProjectionHost,
      meta: {
        projection: true,
      },
    },
    {
      path: '/',
      component: AppShell,
      children: [
        ...homeRoutes,
        ...albumsRoutes,
        ...communityRoutes,
        ...liturgyRoutes,
        ...mediaRoutes,
        ...bibleRoutes,
        ...utilitiesRoutes,
        ...timerRoutes,
        ...countdownRoutes,
        ...randomRoutes,
        ...settingsRoutes,
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
