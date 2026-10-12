import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const SHA = /^[a-f0-9]{40}$/

export function normalizeVersion(tag) {
  const value = String(tag ?? '')
    .trim()
    .replace(/^refs\/tags\//, '')
  const version = value.replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null
  return version
}

export function decidePublish({
  repo,
  tag,
  commit,
  packageVersion,
  policy,
  policyFromTaggedCommit = false,
  authorizedCommitIsAncestor = false,
}) {
  const version = normalizeVersion(tag)
  if (!version) return blocked('tag semver inválida')
  if (policyFromTaggedCommit && !Array.isArray(policy?.promotions)) {
    return blocked('política tag_only inválida no commit marcado')
  }
  if (!Array.isArray(policy?.promotions)) {
    return publish('sem política de promoção; publicação padrão')
  }

  const entry = policy.promotions.find((item) => item?.version === version) ?? null
  if (!entry) return publish('sem política tag_only para esta versão; publicação padrão')
  if (entry.mode !== 'tag_only') return publish('política desta versão não é tag_only; publicação padrão')
  if (entry.repo !== repo) return blocked(`política tag_only de ${entry.repo} não vale para ${repo}`)
  if (packageVersion !== entry.version) {
    return blocked(`package.json ${packageVersion} difere da versão tag_only ${entry.version}`)
  }
  if (!Number.isInteger(entry.promotionPr) || entry.promotionPr <= 0) {
    return blocked('política tag_only sem a PR de promoção autorizada')
  }
  if (!SHA.test(entry.authorizedCommit ?? '')) return blocked('commit autorizado ausente na política tag_only')
  if (!SHA.test(commit ?? '')) return blocked('commit marcado inválido')

  const exact = commit === entry.authorizedCommit
  const ancestor = authorizedCommitIsAncestor === true
  const contained = entry.authorizeContainingTree === true && policyFromTaggedCommit === true
  if (exact || ancestor || contained) {
    const reason = exact
      ? 'tag_only no commit autorizado'
      : ancestor
        ? 'tag_only; o commit autorizado é ancestral do commit marcado'
        : 'tag_only; a política está no commit marcado'
    return skip(reason)
  }
  return blocked('o commit marcado não é a promoção autorizada')
}

function publish(reason) {
  return { publish: true, fail: false, reason }
}

function skip(reason) {
  return { publish: false, fail: false, reason }
}

function blocked(reason) {
  return { publish: false, fail: true, reason }
}

export function writeDecision(result) {
  const lines = [`publish=${result.publish ? 'true' : 'false'}`, `reason=${result.reason}`]
  const text = `${lines.join('\n')}\n`
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text)
  process.stdout.write(text)
  return result
}

function ghApi(repoArgs) {
  return spawnSync('gh', ['api', ...repoArgs], { encoding: 'utf8' })
}

function isNotFound(result) {
  const text = `${result.stderr ?? ''}\n${result.stdout ?? ''}`
  return result.status !== 0 && /not found|404/i.test(text)
}

export function fetchDecision({ repo, ref }) {
  if (!repo || !ref) return blocked('repositório ou ref ausente')
  const versionFromRef = normalizeVersion(ref)
  let commit = SHA.test(ref) ? ref : ''
  if (!commit) {
    if (!versionFromRef) return blocked('ref sem tag semver nem commit')
    const resolved = ghApi([`repos/${repo}/commits/v${versionFromRef}`, '--jq', '.sha'])
    if (resolved.status !== 0) return blocked('não foi possível resolver o commit da tag')
    commit = resolved.stdout.trim()
    if (!SHA.test(commit)) return blocked('commit da tag inválido')
  }

  const manifest = ghApi([
    `repos/${repo}/contents/package.json?ref=${commit}`,
    '-H',
    'Accept: application/vnd.github.raw',
  ])
  if (manifest.status !== 0) return blocked('não foi possível ler package.json do commit marcado')
  let packageVersion = ''
  try {
    packageVersion = JSON.parse(manifest.stdout).version
  } catch {
    return blocked('package.json do commit marcado é inválido')
  }

  const policyResponse = ghApi([
    `repos/${repo}/contents/.github/tag-only-promotions.json?ref=${commit}`,
    '-H',
    'Accept: application/vnd.github.raw',
  ])
  let policy = { promotions: [] }
  let policyFromTaggedCommit = false
  if (policyResponse.status === 0) {
    try {
      policy = JSON.parse(policyResponse.stdout)
    } catch {
      return blocked('política tag_only inválida no commit marcado')
    }
    policyFromTaggedCommit = true
  } else if (!isNotFound(policyResponse)) {
    return blocked('não foi possível ler a política tag_only')
  }

  const tag = versionFromRef ? `v${versionFromRef}` : `v${packageVersion}`
  const version = normalizeVersion(tag)
  const entry = Array.isArray(policy?.promotions)
    ? policy.promotions.find((item) => item?.version === version && item?.mode === 'tag_only')
    : null
  let authorizedCommitIsAncestor = false
  if (entry && SHA.test(entry.authorizedCommit ?? '')) {
    if (entry.authorizedCommit === commit) {
      authorizedCommitIsAncestor = true
    } else {
      const compared = ghApi([
        `repos/${repo}/compare/${entry.authorizedCommit}...${commit}`,
        '--jq',
        '.status',
      ])
      if (compared.status === 0) {
        const status = compared.stdout.trim()
        authorizedCommitIsAncestor = status === 'ahead' || status === 'identical'
      }
    }
  }

  return decidePublish({
    repo,
    tag,
    commit,
    packageVersion,
    policy,
    policyFromTaggedCommit,
    authorizedCommitIsAncestor,
  })
}

function argValue(name) {
  const index = process.argv.indexOf(name)
  if (index === -1 || index + 1 >= process.argv.length) return ''
  return process.argv[index + 1]
}

function main() {
  if (!process.argv.includes('--fetch')) return
  const result = fetchDecision({ repo: argValue('--repo'), ref: argValue('--ref') })
  writeDecision(result)
  if (result.fail) process.exit(1)
}

const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (executedDirectly) main()
