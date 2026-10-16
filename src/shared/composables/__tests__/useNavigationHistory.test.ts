import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { BROWSER_STORAGE_KEYS } from '@shared/constants/storage-keys'
import { loadNavigationHistory } from '@shared/services/navigation-history-storage'
import { useNavigationHistoryStore } from '@shared/stores/useNavigationHistoryStore'

import { installNavigationHistory, useNavigationHistory } from '../useNavigationHistory'
import {
  createTestHashRouter,
  goAndWait,
  waitForNavigation,
} from './helpers/history-router'

const Empty = {}

let router: Router
let uninstall: () => void

function paths(): string[] {
  return useNavigationHistoryStore().entries.map((e) => e.fullPath)
}

function index(): number {
  return useNavigationHistoryStore().index
}

async function visit(...targets: string[]) {
  for (const target of targets) await router.push(target)
}

const ROUTES = [
    { path: '/', component: Empty, meta: { navKey: 'home' } },
    { path: '/a', name: 'a', component: Empty, meta: { navKey: 'albums' } },
    { path: '/b', name: 'b', component: Empty, meta: { navKey: 'bible' } },
    { path: '/c', name: 'c', component: Empty },
    { path: '/d', name: 'd', component: Empty },
    { path: '/settings', redirect: '/settings/appearance' },
    { path: '/settings/appearance', name: 'settings-appearance', component: Empty, meta: { navKey: 'settings' } },
    { path: '/popup', name: 'projection-popup', component: Empty, meta: { projection: true } },
]

beforeEach(() => {
  sessionStorage.clear()
  setActivePinia(createPinia())
  router = createTestHashRouter(ROUTES)
  uninstall = installNavigationHistory({ router })
})

/**
 * Simula recarregar a página: Pinia e router novos sobre o MESMO
 * window.history (como o Electron/navegador faz no reload).
 */
async function reload() {
  uninstall()
  router.options.history.destroy()
  setActivePinia(createPinia())
  router = createTestHashRouter(ROUTES)
  uninstall = installNavigationHistory({ router })
  await router.push(router.options.history.location)
}

afterEach(() => {
  uninstall()
  router.options.history.destroy()
})

describe('installNavigationHistory', () => {
  it('a navegação inicial vira a primeira entrada, com nome e navKey da rota', async () => {
    await visit('/a')
    expect(useNavigationHistoryStore().entries).toEqual([
      { fullPath: '/a', name: 'a', navKey: 'albums' },
    ])
    expect(index()).toBe(0)
  })

  it('rota sem nome nem navKey usa null e "home"', async () => {
    await visit('/')
    expect(useNavigationHistoryStore().current).toEqual({ fullPath: '/', name: null, navKey: 'home' })
    await visit('/c')
    expect(useNavigationHistoryStore().current).toEqual({ fullPath: '/c', name: 'c', navKey: 'home' })
  })

  it('push registra; voltar e avançar só movem o índice', async () => {
    await visit('/', '/a', '/b')
    expect(paths()).toEqual(['/', '/a', '/b'])

    await goAndWait(router, -1)
    expect(index()).toBe(1)
    await goAndWait(router, -1)
    expect(index()).toBe(0)
    await goAndWait(router, 1)
    expect(index()).toBe(1)
    expect(paths()).toEqual(['/', '/a', '/b'])
  })

  it('go(-2) move dois passos', async () => {
    await visit('/', '/a', '/b')
    await goAndWait(router, -2)
    expect(index()).toBe(0)
    expect(router.currentRoute.value.fullPath).toBe('/')
  })

  it('push depois de voltar descarta as entradas da frente', async () => {
    await visit('/', '/a', '/b')
    await goAndWait(router, -2)
    await visit('/d')
    expect(paths()).toEqual(['/', '/d'])
    expect(useNavigationHistoryStore().canGoForward).toBe(false)
  })

  it('router.replace troca a entrada atual sem criar outra', async () => {
    await visit('/', '/a')
    await router.replace('/b')
    expect(paths()).toEqual(['/', '/b'])
    expect(index()).toBe(1)
  })

  it('redirect registra só a rota final', async () => {
    await visit('/', '/settings')
    expect(paths()).toEqual(['/', '/settings/appearance'])
  })

  it('guard que cancela um push não altera o registro', async () => {
    await visit('/', '/a')
    router.beforeEach((to) => to.path !== '/d')
    await visit('/d')
    expect(paths()).toEqual(['/', '/a'])
    expect(index()).toBe(1)
  })

  it('guard que cancela um voltar não move o índice', async () => {
    await visit('/', '/a', '/b')
    router.beforeEach((to) => to.path !== '/a')
    await goAndWait(router, -1)
    expect(index()).toBe(2)
    expect(router.currentRoute.value.fullPath).toBe('/b')
  })

  it('router.back() chamado por uma view (ex.: MediaView) atualiza o índice', async () => {
    await visit('/', '/a')
    const done = waitForNavigation(router)
    router.back()
    await done
    expect(index()).toBe(0)
  })

  it('ignora rotas de projeção', async () => {
    await visit('/', '/popup')
    expect(paths()).toEqual(['/'])
  })

  it('pop "fantasma" (hash alterado por fora) troca a atual em vez de criar entrada', async () => {
    await visit('/', '/a')
    const done = waitForNavigation(router)
    window.location.hash = '#/d'
    await done
    expect(paths()).toEqual(['/', '/d'])
    expect(index()).toBe(1)
  })

  it('instalar duas vezes no mesmo router não duplica entradas', async () => {
    const again = installNavigationHistory({ router })
    expect(again).toBe(uninstall)
    await visit('/', '/a')
    expect(paths()).toEqual(['/', '/a'])
  })

  it('instalar em outro router desliga o anterior', async () => {
    await visit('/')
    const other = createTestHashRouter()
    const uninstallOther = installNavigationHistory({ router: other })
    await router.push('/a')
    expect(paths()).toEqual(['/'])
    uninstallOther()
    other.options.history.destroy()
  })

  it('depois de desinstalar não registra mais', async () => {
    await visit('/')
    uninstall()
    await visit('/a')
    expect(paths()).toEqual(['/'])
  })

  it('sem position no state (memory history) usa o delta do pop', async () => {
    uninstall()
    router.options.history.destroy()
    setActivePinia(createPinia())
    router = createRouter({
      history: createMemoryHistory(),
      routes: ['/', '/a', '/b'].map((path) => ({ path, component: Empty })),
    })
    uninstall = installNavigationHistory({ router })
    await visit('/', '/a', '/b')
    await goAndWait(router, -1)
    expect(index()).toBe(1)
    expect(paths()).toEqual(['/', '/a', '/b'])
  })
})

describe('useNavigationHistory', () => {
  it('expõe o estado da store', async () => {
    const history = useNavigationHistory()
    await visit('/', '/a')
    expect(history.canGoBack.value).toBe(true)
    expect(history.canGoForward.value).toBe(false)
    expect(history.dots.value).toEqual([
      { index: 0, current: false, edge: false },
      { index: 1, current: true, edge: false },
    ])
    expect(history.entries.value.map((e) => e.fullPath)).toEqual(['/', '/a'])
  })

  it('back e forward navegam um passo', async () => {
    const history = useNavigationHistory()
    await visit('/', '/a', '/b')

    let done = waitForNavigation(router)
    history.back()
    await done
    expect(router.currentRoute.value.fullPath).toBe('/a')

    done = waitForNavigation(router)
    history.forward()
    await done
    expect(router.currentRoute.value.fullPath).toBe('/b')
  })

  it('goTo salta direto para a entrada escolhida', async () => {
    const history = useNavigationHistory()
    await visit('/', '/a', '/b', '/d')
    const done = waitForNavigation(router)
    history.goTo(0)
    await done
    expect(router.currentRoute.value.fullPath).toBe('/')
    expect(index()).toBe(0)
  })

  it('não chama router.go fora do registro nem para a própria entrada', async () => {
    const history = useNavigationHistory()
    await visit('/')
    const go = vi.spyOn(router, 'go')
    history.back()
    history.forward()
    history.goTo(0)
    history.goTo(5)
    history.goTo(-1)
    expect(go).not.toHaveBeenCalled()
  })

  it('sem install, as ações não fazem nada', async () => {
    uninstall()
    const go = vi.spyOn(router, 'go')
    const history = useNavigationHistory()
    useNavigationHistoryStore().push({ fullPath: '/', name: null, navKey: 'home' })
    useNavigationHistoryStore().push({ fullPath: '/a', name: 'a', navKey: 'albums' })
    history.back()
    expect(go).not.toHaveBeenCalled()
  })
})

describe('installNavigationHistory — sobrevive a recarregar a página', () => {
  it('salva o histórico a cada navegação', async () => {
    await visit('/', '/a')
    expect(loadNavigationHistory()?.state).toEqual({
      entries: [
        { fullPath: '/', name: null, navKey: 'home' },
        { fullPath: '/a', name: 'a', navKey: 'albums' },
      ],
      index: 1,
    })
  })

  it('depois do reload volta com as mesmas telas e a mesma posição', async () => {
    await visit('/', '/a', '/b')
    await goAndWait(router, -1)

    await reload()

    expect(paths()).toEqual(['/', '/a', '/b'])
    expect(index()).toBe(1)
    expect(router.currentRoute.value.fullPath).toBe('/a')
    expect(useNavigationHistoryStore().canGoForward).toBe(true)

    await goAndWait(router, 1)
    expect(index()).toBe(2)
    expect(router.currentRoute.value.fullPath).toBe('/b')
  })

  it('depois do reload, navegar para tela nova continua descartando o que está à frente', async () => {
    await visit('/', '/a', '/b')
    await goAndWait(router, -2)
    await reload()
    await visit('/d')
    expect(paths()).toEqual(['/', '/d'])
  })

  it('dado salvo inválido: começa um histórico novo', async () => {
    uninstall()
    sessionStorage.setItem(BROWSER_STORAGE_KEYS.navigationHistory, '{"state":{"entries":"x"}}')
    setActivePinia(createPinia())
    uninstall = installNavigationHistory({ router })
    await visit('/', '/a')
    expect(paths()).toEqual(['/', '/a'])
  })
})
