#!/usr/bin/env node
/**
 * Anti-deriva app↔web — gate canônico (S1).
 *
 * Compara os arquivos canônicos deste repo com os do repo irmão
 * (Piano-Louvor-JA/app ↔ Piano-Louvor-JA/web) via `gh api` (raw, branch staging).
 * Falha (exit 1) se qualquer arquivo divergir — deriva de tipos/serviços
 * copiados à mão entre as frentes.
 *
 * Uso:
 *   node scripts/check-paridade.mjs            # gate duro (CI)
 *   node scripts/check-paridade.mjs --report   # só reporta, nunca falha
 *
 * Requisitos: `gh` autenticado (CI usa GH_TOKEN/GITHUB_TOKEN) e rede.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const REPORT_ONLY = process.argv.includes('--report')

// (this repo, other repo) — manter idêntico nos dois repos
const PEER = {
  app: 'web',
  web: 'app',
}
const ORG = 'Piano-Louvor-JA'
const THIS = process.env.PARIDADE_THIS ?? detectThis()
const OTHER = PEER[THIS] ?? 'app'

/**
 * Branch do peer a comparar. Ordem:
 *  1. branch local de mesmo nome (janela de transição: os PRs de paridade
 *     dos DOIS repos coexistem antes de mergear — cada um compara com a
 *     branch espelho do outro);
 *  2. staging (regime permanente).
 */
function peerBranch() {
  if (process.env.PARIDADE_BRANCH) return process.env.PARIDADE_BRANCH
  let current = 'staging'
  try {
    current = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
    }).trim()
  } catch {
    /* HEAD destacado — usa staging */
  }
  if (current !== 'staging' && current !== 'main') {
    try {
      execFileSync('gh', [
        'api',
        `repos/${ORG}/${OTHER}/git/ref/heads/${current}`,
      ], { stdio: 'pipe' })
      return current
    } catch {
      /* branch não existe no peer — cai para staging */
    }
  }
  return 'staging'
}
const BRANCH = peerBranch()

function detectThis() {
  const remotes = execFileSync('git', ['remote', 'get-url', 'origin'], {
    encoding: 'utf8',
  })
  return remotes.includes('/app') ? 'app' : 'web'
}

// Arquivos canônicos — fonte da verdade: app (frente à frente).
// Editou aqui? Editou no outro repo também, no MESMO PR.
const CANONICAL_FILES = [
  'src/modules/bible/types/bible.ts',
  'src/modules/settings/types/stage-settings.ts',
  'src/modules/bible/services/scripture-format.ts',
  'src/modules/bible/services/bible-runtime.ts',
]

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Normaliza EOL e a diferença de plataforma autorizada.
 * O app mantém a caixinha ligada por padrão (`textBox: true`); o web usa
 * `false`. Só esse default entra na exceção — o restante do arquivo segue
 * idêntico.
 */
function normalize(content, file) {
  let text = content.replace(/\r\n/g, '\n')
  if (file !== 'src/modules/settings/types/stage-settings.ts') return text
  const next = text.replace(
    /(shadowIntensity:\s*[\d.]+,\n\s*)textBox:\s*(?:true|false),/,
    '$1textBox: PARITY_PLATFORM,',
  )
  return next
}

function fetchRemote(path) {
  const url = `repos/${ORG}/${OTHER}/contents/${path}?ref=${BRANCH}`
  const out = execFileSync(
    'gh',
    ['api', url, '-H', 'Accept: application/vnd.github.raw+json'],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  )
  return out
}

let diverged = 0
console.log(`paridade: ${ORG}/${THIS} ↔ ${ORG}/${OTHER}@${BRANCH}`)

for (const file of CANONICAL_FILES) {
  let local
  try {
    local = readFileSync(file, 'utf8')
  } catch {
    console.error(`✗ ${file} — AUSENTE no repo local (${THIS})`)
    diverged += 1
    continue
  }

  let remote
  try {
    remote = fetchRemote(file)
  } catch (err) {
    console.error(`✗ ${file} — falha ao buscar no peer: ${err.message}`)
    diverged += 1
    continue
  }

  const localNorm = normalize(local, file)
  const remoteNorm = normalize(remote, file)
  if (
    file === 'src/modules/settings/types/stage-settings.ts' &&
    (!localNorm.includes('textBox: PARITY_PLATFORM,') ||
      !remoteNorm.includes('textBox: PARITY_PLATFORM,'))
  ) {
    console.error(`✗ ${file} — default textBox não encontrado; critério de paridade desatualizado`)
    diverged += 1
    continue
  }
  const same = sha256(localNorm) === sha256(remoteNorm)
  if (same) {
    console.log(`✓ ${file}`)
  } else {
    console.error(`✗ ${file} — DIVERGIU app↔web`)
    const localLines = localNorm.split('\n')
    const remoteLines = remoteNorm.split('\n')
    // diff resumido: primeira linha divergente + totais
    let first = -1
    const max = Math.max(localLines.length, remoteLines.length)
    for (let i = 0; i < max; i += 1) {
      if (localLines[i] !== remoteLines[i]) {
        first = i
        break
      }
    }
    console.error(
      `    1ª divergência na linha ${first + 1}: local=${localLines.length}L peer=${remoteLines.length}L`,
    )
    if (localLines[first] !== undefined)
      console.error(`    local: ${JSON.stringify(localLines[first].trim())}`)
    if (remoteLines[first] !== undefined)
      console.error(`    peer : ${JSON.stringify(remoteLines[first].trim())}`)
    diverged += 1
  }
}

if (diverged > 0) {
  console.error(`\nparidade: ${diverged}/${CANONICAL_FILES.length} arquivo(s) divergente(s).`)
  if (!REPORT_ONLY) {
    console.error(
      'Arquivos canônicos devem ser editados nos DOIS repos no mesmo PR (fonte da verdade: app).',
    )
    process.exit(1)
  }
  console.error('(modo --report: não falha o build)')
} else {
  console.log(`paridade: OK — ${CANONICAL_FILES.length}/${CANONICAL_FILES.length} idênticos.`)
}