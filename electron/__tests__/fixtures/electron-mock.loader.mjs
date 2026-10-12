// Loader que desvia import de 'electron' para o mock (fora do runtime Electron).
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const mockUrl = pathToFileURL(path.resolve(here, 'electron-mock.mjs')).href

export async function resolve(specifier, context, next) {
  if (specifier === 'electron') {
    return { url: mockUrl, shortCircuit: true }
  }
  return next(specifier, context)
}
