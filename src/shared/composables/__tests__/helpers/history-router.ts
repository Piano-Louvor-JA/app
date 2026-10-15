/**
 * Router de teste com history HASH real (jsdom), para testar o histórico de
 * navegação. A `createMemoryHistory` não grava `position`/`replaced` no state,
 * então não serve para distinguir push × replace × pop.
 *
 * Não altere `window.location.hash` direto nos testes: o jsdom dispara um
 * popstate assíncrono que o router entrega como pop com `delta: 0`.
 */
import type { Component } from 'vue'
import {
  createRouter,
  createWebHashHistory,
  type Router,
  type RouteRecordRaw,
} from 'vue-router'

/** Nunca é montado (não há RouterView nos testes de histórico). */
const Empty: Component = {}

export function createTestHashRouter(routes?: RouteRecordRaw[]): Router {
  return createRouter({
    history: createWebHashHistory(),
    routes: routes ?? ['/', '/a', '/b', '/c', '/d'].map((path) => ({ path, component: Empty })),
  })
}

/** Resolve no próximo afterEach (pops do jsdom são assíncronos). */
export function waitForNavigation(router: Router): Promise<void> {
  return new Promise((resolve) => {
    const off = router.afterEach(() => {
      off()
      resolve()
    })
  })
}

/** Dispara um pop (`router.go`) e espera ele terminar. */
export async function goAndWait(router: Router, delta: number): Promise<void> {
  const done = waitForNavigation(router)
  router.go(delta)
  await done
}

export function historyPosition(router: Router): number {
  return (router.options.history.state as { position: number }).position
}
