import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const METRICS = ['statements', 'branches', 'functions', 'lines']

const STAGING_REF = 'refs/heads/staging'

/**
 * Caminho da staging usa 50%: PR cuja base é staging, ou push/dispatch cujo ref
 * do evento é refs/heads/staging. Main, tags, release e qualquer outro destino
 * permanecem em 100%. Em PR só a base decide (o ref é refs/pull/N/merge); a
 * branch de origem nunca entra na decisão.
 */
export function coverageMinimumPercent({ eventName, baseRef, ref } = {}) {
  if (eventName === 'pull_request') return baseRef === 'staging' ? 50 : 100
  if ((eventName === 'push' || eventName === 'workflow_dispatch') && ref === STAGING_REF) {
    return 50
  }
  return 100
}

export function evaluateCoverage(summary, minimum) {
  const total = summary?.total ?? {}
  const failures = []
  for (const metric of METRICS) {
    const pct = total[metric]?.pct
    if (typeof pct !== 'number' || pct < minimum) {
      failures.push({ metric, pct: typeof pct === 'number' ? pct : null })
    }
  }

  const fileGaps = []
  for (const [file, value] of Object.entries(summary ?? {})) {
    if (file === 'total' || !value || typeof value !== 'object') continue
    const low = METRICS.some((metric) => {
      const pct = value[metric]?.pct
      return typeof pct !== 'number' || pct < minimum
    })
    if (low) fileGaps.push(file)
  }

  return { minimum, failures, fileGaps }
}

function main() {
  const summaryPath = process.argv[2]
  if (!summaryPath) {
    console.error('Uso: node scripts/coverage-gate-limit.mjs <summary.json>')
    process.exit(2)
  }

  const eventName = process.env.GITHUB_EVENT_NAME ?? ''
  const baseRef = process.env.PR_BASE_REF ?? ''
  const ref = process.env.EVENT_REF ?? ''
  const minimum = coverageMinimumPercent({ eventName, baseRef, ref })
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
  const result = evaluateCoverage(summary, minimum)
  console.log(
    `Limite de cobertura: ${minimum}% (evento=${eventName || 'local'} base=${baseRef || 'n/a'} ref=${ref || 'n/a'})`,
  )

  if (result.failures.length) {
    for (const file of result.fileGaps.slice(0, 250)) {
      const value = summary[file]
      const parts = METRICS.map(
        (metric) => `${metric[0]}=${Number(value?.[metric]?.pct ?? 0).toFixed(1)}`,
      ).join(' ')
      console.error(`GAP: ${file} ${parts}`)
    }
    console.error(
      `COBERTURA < ${minimum}: ${result.failures
        .map((item) => `${item.metric}=${item.pct ?? 'ausente'}`)
        .join(', ')}`,
    )
    process.exit(1)
  }

  console.log(`${METRICS.map(() => minimum).join('/')} OK`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
