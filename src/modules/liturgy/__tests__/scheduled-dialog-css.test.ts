import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// import.meta.url pode vir como /@fs/ no vitest — deriva do cwd (raiz do repo)
const sfc = readFileSync(
  join(process.cwd(), 'src/modules/liturgy/components/LiturgyScheduledDialog.vue'),
  'utf-8',
)
const style = sfc.split('<style scoped>')[1] ?? ''

describe('LiturgyScheduledDialog — CSS do overlay', () => {
  it('define .liturgy-dialog-backdrop com position fixed (dialog visível ao abrir)', () => {
    expect(style).toMatch(/\.liturgy-dialog-backdrop\s*\{[^}]*position:\s*fixed/)
  })

  it('backdrop cobre a tela e fica acima do conteúdo (z-index ≥ 80)', () => {
    expect(style).toMatch(/\.liturgy-dialog-backdrop\s*\{[^}]*inset:\s*0/)
    expect(style).toMatch(/\.liturgy-dialog-backdrop\s*\{[^}]*z-index:\s*(8\d|9\d|\d{3})/)
  })
})
