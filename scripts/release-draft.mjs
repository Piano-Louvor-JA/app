#!/usr/bin/env node
/**
 * Garante UMA GitHub Release por tag.
 *
 * Na v1.31.2 os builds Windows/macOS publicavam com electron-builder
 * (--publish always) em paralelo ao release.yml; dois publishers viram
 * "release doesn't exist" no mesmo instante e criaram duas releases para a
 * mesma tag. Agora só um job cria o draft (mode=create, no release.yml); os
 * demais esperam por ele (mode=wait) e só anexam assets com gh release upload.
 *
 * Uso:
 *   node scripts/release-draft.mjs --repo OWNER/REPO --tag vX.Y.Z --mode create|wait|check
 *     [--timeout-seconds 900] [--interval-seconds 15]
 */
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const TAG = /^v\d+\.\d+\.\d+$/
const MODES = new Set(['create', 'wait', 'check'])

export function releasesForTag(releases, tag) {
  return releases.filter((release) => release?.tag_name === tag)
}

function duplicateError(tag, found) {
  const ids = found.map((release) => release.id).join(', ')
  return new Error(
    `${found.length} GitHub Releases para ${tag} (${ids}); resolva manualmente antes de publicar assets`,
  )
}

export async function ensureRelease({
  repo,
  tag,
  mode,
  api = ghApi,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = 900_000,
  intervalMs = 15_000,
}) {
  if (!TAG.test(tag ?? '')) throw new Error(`tag inválida: ${tag}`)
  if (!MODES.has(mode)) throw new Error(`modo inválido: ${mode}`)

  for (let waited = 0; ; waited += intervalMs) {
    const found = releasesForTag(api.list(repo), tag)
    if (found.length > 1) throw duplicateError(tag, found)
    if (found.length === 1) return { release: found[0], created: false }
    if (mode === 'create') return { release: api.create(repo, tag), created: true }
    if (mode === 'check' || waited >= timeoutMs) {
      throw new Error(`nenhuma GitHub Release para ${tag} em ${repo}`)
    }
    await sleep(intervalMs)
  }
}

function gh(args) {
  const result = spawnSync('gh', ['api', ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`gh api ${args[0]} falhou: ${result.stderr.trim()}`)
  return result.stdout
}

// A listagem inclui drafts (a busca por tag do GitHub não os encontra).
export const ghApi = {
  list(repo) {
    return gh([`repos/${repo}/releases?per_page=100`, '--paginate', '--jq', '.[] | {id, tag_name, draft}'])
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  },
  create(repo, tag) {
    const out = gh([
      '-X',
      'POST',
      `repos/${repo}/releases`,
      '-f',
      `tag_name=${tag}`,
      '-f',
      `name=${tag}`,
      '-F',
      'draft=true',
      '-F',
      'generate_release_notes=true',
      '--jq',
      '{id, tag_name, draft}',
    ])
    return JSON.parse(out)
  },
}

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name)
  if (index === -1 || index + 1 >= process.argv.length) return fallback
  return process.argv[index + 1]
}

async function main() {
  const result = await ensureRelease({
    repo: argValue('--repo'),
    tag: argValue('--tag'),
    mode: argValue('--mode'),
    timeoutMs: Number(argValue('--timeout-seconds', '900')) * 1000,
    intervalMs: Number(argValue('--interval-seconds', '15')) * 1000,
  })
  const state = result.release.draft ? 'draft' : 'publicada'
  const action = result.created ? 'criada' : 'encontrada'
  console.log(`Release ${result.release.tag_name} ${action} (id ${result.release.id}, ${state}).`)
}

const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
if (executedDirectly) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
