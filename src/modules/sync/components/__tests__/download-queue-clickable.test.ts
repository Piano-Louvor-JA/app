import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * app#423 regression: o widget da fila vive na titlebar, que é drag region
 * (-webkit-app-region: drag). O contêiner do widget precisa de no-drag,
 * senão o clique no gadget cai no drag da janela e o painel não abre.
 */
const repoRoot = process.cwd()

describe('DownloadQueueIndicator clicável na titlebar', () => {
  it('contêiner do widget tem -webkit-app-region: no-drag', () => {
    const src = readFileSync(resolve(repoRoot, 'src/layouts/AppTitlebar.vue'), 'utf8')
    const block = src.match(/\.app-titlebar__queue \{[\s\S]*?\}/)
    expect(block).toBeTruthy()
    expect(block![0]).toContain('no-drag')
  })

  it('botão do widget alterna expanded no @click (guard de interação)', () => {
    const src = readFileSync(
      resolve(repoRoot, 'src/modules/sync/components/DownloadQueueIndicator.vue'),
      'utf8',
    )
    expect(src).toMatch(/@click="expanded = !expanded"/)
  })
})
