/**
 * SPIKE (Fase 0 do PLAN navegacao-historico) — temporário, apagado na Task 3.
 * Prova que no jsdom, com createWebHashHistory, conseguimos distinguir
 * push / replace / pop pela `history.state` (position/replaced) e pelo
 * `info.delta` do `history.listen`.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type { Router } from 'vue-router'

import { createTestHashRouter, goAndWait, historyPosition } from './helpers/history-router'

type Seen =
  | { kind: 'after'; path: string; position: unknown; replaced: unknown }
  | { kind: 'pop'; delta: number; direction: string }

let current: Router | null = null

function setup() {
  const router = createTestHashRouter()
  current = router
  const seen: Seen[] = []
  router.options.history.listen((_to, _from, info) => {
    seen.push({ kind: 'pop', delta: info.delta, direction: info.direction })
  })
  router.afterEach((to) => {
    const state = router.options.history.state as Record<string, unknown>
    seen.push({ kind: 'after', path: to.fullPath, position: state.position, replaced: state.replaced })
  })
  return { router, seen }
}

afterEach(() => {
  current?.options.history.destroy()
  current = null
})

describe('spike: router hash history no jsdom', () => {
  it('push incrementa position e replace mantém com replaced=true', async () => {
    const { router, seen } = setup()
    await router.push('/')
    const p0 = historyPosition(router)
    await router.push('/a')
    await router.replace('/b')
    expect(seen.slice(-2)).toEqual([
      { kind: 'after', path: '/a', position: p0 + 1, replaced: false },
      { kind: 'after', path: '/b', position: p0 + 1, replaced: true },
    ])
  })

  it('back, go(-2) e forward disparam listen com delta antes do afterEach', async () => {
    const { router, seen } = setup()
    await router.push('/')
    await router.push('/a')
    await router.push('/b')
    await router.push('/c')
    const base = historyPosition(router)

    await goAndWait(router, -1)
    await goAndWait(router, -2)
    await goAndWait(router, 1)

    expect(seen.slice(-6)).toEqual([
      { kind: 'pop', delta: -1, direction: 'back' },
      { kind: 'after', path: '/b', position: base - 1, replaced: false },
      { kind: 'pop', delta: -2, direction: 'back' },
      { kind: 'after', path: '/', position: base - 3, replaced: expect.anything() },
      { kind: 'pop', delta: 1, direction: 'forward' },
      { kind: 'after', path: '/a', position: base - 2, replaced: false },
    ])
  })
})
