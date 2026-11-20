import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dialog = readFileSync(
  join(process.cwd(), 'src/modules/liturgy/components/LiturgyScheduledDialog.vue'),
  'utf8',
)

describe('Itens Agendados — vídeo salvo no disco', () => {
  it('oferece vídeo local e grava conteúdo filePath', () => {
    expect(dialog).toContain('value="file"')
    expect(dialog).toContain("kind: 'file'")
    expect(dialog).toContain('bridge.dialog.openFile')
  })
})
