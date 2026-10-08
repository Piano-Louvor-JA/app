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
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const BASELINE_FILE = resolve(REPO_ROOT, '.regression-baseline.json')

function run(cmd, { silent = false } = {}) {
  try {
    const out = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' })
    return { ok: true, out: out.trim() }
  } catch (e) {
    return { ok: false, out: e.stdout?.toString()?.trim() ?? e.message }
  }
}

function parseTestOutput(output) {
  // vitest: "Test Files  123 passed (123) | 456 tests passed (456)"
  const m = output.match(/(\d+)\s+tests?\s+passed/i)
  const passed = m ? parseInt(m[1], 10) : null
  const m2 = output.match(/(\d+)\s+tests?\s+failed/i)
  const failed = m2 ? parseInt(m2[1], 10) : null
  return { passed, failed }
}

function cmdBaseline() {
  console.log('=== BASELINE: rodando suite completa ===')
  const test = run('npm run test -- --reporter=verbose', { silent: true })
  const typecheck = run('npm run type-check', { silent: true })
  const build = run('npm run build', { silent: true })

  const { passed, failed } = parseTestOutput(test.out)
  const baseline = {
    timestamp: new Date().toISOString(),
    gitSha: run('git rev-parse HEAD', { silent: true }).out,
    tests: { passed, failed, total: passed != null && failed != null ? passed + failed : null },
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
  console.log('=== COMPARAÇÃO: baseline salvo ===')
  console.log(JSON.stringify(baseline, null, 2))

  console.log('\n=== Rodando suite atual ===')
  const test = run('npm run test -- --reporter=verbose', { silent: true })
  const typecheck = run('npm run type-check', { silent: true })
  const build = run('npm run build', { silent: true })

  const { passed, failed } = parseTestOutput(test.out)
  const current = {
    tests: { passed, failed, total: passed != null && failed != null ? passed + failed : null },
    typecheck: typecheck.ok,
    build: build.ok,
  }

  console.log('\n=== Resultado atual ===')
  console.log(JSON.stringify(current, null, 2))

  // Verificações de regressão
  let regressao = false
  let msgs = []

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