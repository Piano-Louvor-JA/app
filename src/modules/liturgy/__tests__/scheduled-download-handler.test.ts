import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const mainIpc = readFileSync(
  join(process.cwd(), 'electron/ipc/register.mjs'),
  'utf8',
)

describe('P&V download handler', () => {
  it('usa writeFile de node:fs/promises; handler async não pode chamar API callback', () => {
    expect(mainIpc).toContain("from 'node:fs/promises'")
    expect(mainIpc).not.toContain("{ existsSync, mkdirSync, writeFile } from 'node:fs'")
  })
})
