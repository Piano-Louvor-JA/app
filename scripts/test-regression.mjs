#!/usr/bin/env node
/**
 * Script de Regressão — PIANO Desktop
 *
 * Uso:
 *   npm run test:regression           # roda suite completa + type-check + build
 *   npm run test:regression -- --baseline  # só grava baseline (antes da 1a edicao)
 *   npm run test:regression -- --compare   # compara com baseline salvo
 *
 * Guarda baseline em .regression-baseline.json na raiz do repo.
 * O gate CI falha se:
 *   - total de testes passing diminuiu
 *   - type-check falhou
 *   - build falhou
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const BASELINE_FILE = resolve(REPO_ROOT, '.regression-baseline.json')

function run(cmd, { silent = false } = {}) {
  try {
    const out = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit', maxBuffer: 16 * 1024 * 1024 })
    return { ok: true, out: out?.trim() ?? '' }
  } catch (e) {
    const out = [e.stdout?.toString(), e.stderr?.toString(), e.message].filter(Boolean).join('\n')
    console.error(`Falha em ${cmd}:\n${out}`)
    return { ok: false, out }
  }
}

function runTests() {
  // JSON evita depender do formato e das cores do resumo textual do Vitest.
  const directory = mkdtempSync(resolve(tmpdir(), 'piano-regression-'))
  const report = resolve(directory, 'tests.json')
  const quotedReport = "'" + report.replaceAll("'", "'\\''") + "'"
  try {
    const result = run(`npm run test -- --reporter=json --outputFile=${quotedReport}`, { silent: true })
    const data = existsSync(report) ? JSON.parse(readFileSync(report, 'utf8')) : null
    const passed = data?.numPassedTests
    const failed = data?.numFailedTests
    const total = data?.numTotalTests
    const valid = [passed, failed, total].every(value => Number.isInteger(value) && value >= 0)
      && total > 0 && passed + failed <= total
    if (!valid) console.error('Relatório de testes ausente ou inválido; a regressão não pode ser aprovada.')
    return {
      ok: result.ok && valid && data.success === true && failed === 0,
      tests: valid ? { passed, failed, total } : { passed: null, failed: null, total: null },
    }
  } catch (error) {
    console.error(`Falha ao ler relatório de testes: ${error.message}`)
    return { ok: false, tests: { passed: null, failed: null, total: null } }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function cmdBaseline() {
  console.log('=== BASELINE: rodando suite completa ===')
  const test = runTests()
  const typecheck = run('npm run type-check', { silent: true })
  const build = run('npm run build-only', { silent: true })

  const baseline = {
    timestamp: new Date().toISOString(),
    gitSha: process.env.REGRESSION_GIT_SHA || run('git rev-parse HEAD', { silent: true }).out,
    tests: test.tests,
    typecheck: typecheck.ok,
    build: build.ok,
  }

  writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2))
  console.log('Baseline salvo:', JSON.stringify(baseline, null, 2))
  if (!test.ok || !typecheck.ok || !build.ok) {
    console.error('⚠ Baseline tem falhas — corrigir antes de editar!')
    process.exit(1)
  }
}

function cmdCompare() {
  if (!existsSync(BASELINE_FILE)) {
    console.error('❌ Baseline não existe. Rode com --baseline primeiro.')
    process.exit(1)
  }

  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
  if (!Number.isInteger(baseline.tests?.passed) || baseline.tests.passed < 0
      || baseline.tests.failed !== 0 || !Number.isInteger(baseline.tests.total)
      || baseline.tests.total <= 0 || baseline.tests.passed > baseline.tests.total
      || baseline.typecheck !== true || baseline.build !== true) {
    console.error('Baseline inválido ou com falhas. Gere novamente com --baseline.')
    process.exit(1)
  }
  console.log('=== COMPARAÇÃO: baseline salvo ===')
  console.log(JSON.stringify(baseline, null, 2))

  console.log('\n=== Rodando suite atual ===')
  const test = runTests()
  const typecheck = run('npm run type-check', { silent: true })
  const build = run('npm run build-only', { silent: true })

  const current = {
    tests: test.tests,
    typecheck: typecheck.ok,
    build: build.ok,
  }

  console.log('\n=== Resultado atual ===')
  console.log(JSON.stringify(current, null, 2))

  // Verificações de regressão
  let regressao = !test.ok || !current.typecheck || !current.build
  let msgs = []
  if (!test.ok) msgs.push('REGRESSÃO: testes falharam ou não produziram um relatório válido')

  if (baseline.tests.passed != null && current.tests.passed != null) {
    if (current.tests.passed < baseline.tests.passed) {
      regressao = true
      msgs.push(`REGRESSÃO: testes passing caíram de ${baseline.tests.passed} → ${current.tests.passed}`)
    } else {
      msgs.push(`OK: testes passing ${baseline.tests.passed} → ${current.tests.passed}`)
    }
  }

  if (!current.typecheck && baseline.typecheck) {
    regressao = true
    msgs.push('REGRESSÃO: type-check quebrava OK, agora FALHA')
  } else if (current.typecheck) {
    msgs.push('OK: type-check passa')
  }

  if (!current.build && baseline.build) {
    regressao = true
    msgs.push('REGRESSÃO: build quebrava OK, agora FALHA')
  } else if (current.build) {
    msgs.push('OK: build passa')
  }

  console.log('\n=== Veredito ===')
  msgs.forEach(m => console.log(m))

  if (regressao) {
    console.error('\n❌ REGRESSÃO DETECTADA — gate CI deve falhar')
    process.exit(1)
  } else {
    console.log('\n✅ SEM REGRESSÃO — gate CI passa')
    process.exit(0)
  }
}

function cmdFull() {
  console.log('=== REGRESSÃO COMPLETA (baseline + compare) ===')
  cmdBaseline()
  cmdCompare()
}

// CLI
const args = process.argv.slice(2)
if (args.includes('--baseline')) cmdBaseline()
else if (args.includes('--compare')) cmdCompare()
else cmdFull()
