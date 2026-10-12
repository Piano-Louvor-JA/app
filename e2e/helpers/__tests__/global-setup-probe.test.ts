// Teste de integração do globalSetup (P1-2): sem NENHUMA env de API, aborta
// (defaults hardcoded dos services apontam produção); com staging, passa.
import { expect, test } from 'vitest'
import globalSetup from '../../global-setup'
import { APP_API_ENV_KEYS } from '../prod-url-guard'

const API_KEYS = [...APP_API_ENV_KEYS, 'VITE_API_FALLBACK_URLS'] as const

function snapshotEnv(): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {}
  for (const k of API_KEYS) snap[k] = process.env[k]
  return snap
}

function restoreEnv(snap: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(snap)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

test('P1-2: globalSetup ABORTA quando nenhuma env de API está definida', () => {
  const snap = snapshotEnv()
  const envBackup: Record<string, string | undefined> = { ...snap }
  const origCwdLayers = process.cwd
  try {
    for (const k of API_KEYS) delete process.env[k]
    // executa em cwd sem .env/.env.local (scratch) para simular worktree sem envs
    process.chdir('/tmp')
    process.cwd = origCwdLayers
    expect(() => globalSetup()).toThrowError(/E2E sem env de API explícita/)
  } finally {
    restoreEnv(envBackup)
    process.cwd = origCwdLayers
  }
})

test('P1-2: globalSetup PASSA com env de staging explícita', () => {
  const snap = snapshotEnv()
  try {
    process.env.VITE_URL_DATABASE = 'https://api-stg.pianolouvorja.com.br/json_db'
    delete process.env.VITE_PALCO_API_URL
    delete process.env.PIANO_API_BASE_URL
    delete process.env.VITE_URL_FILES
    delete process.env.VITE_API_FALLBACK_URLS
    expect(() => globalSetup()).not.toThrow()
  } finally {
    restoreEnv(snap)
  }
})

test('P1-2: globalSetup PASSA com env de localhost explícita', () => {
  const snap = snapshotEnv()
  try {
    process.env.VITE_PALCO_API_URL = 'http://localhost:3100'
    delete process.env.VITE_URL_DATABASE
    delete process.env.PIANO_API_BASE_URL
    delete process.env.VITE_URL_FILES
    delete process.env.VITE_API_FALLBACK_URLS
    expect(() => globalSetup()).not.toThrow()
  } finally {
    restoreEnv(snap)
  }
})

test('globalSetup ABORTA com env de produção em process.env', () => {
  const snap = snapshotEnv()
  try {
    process.env.VITE_URL_DATABASE = 'https://api.pianolouvorja.com.br/json_db'
    expect(() => globalSetup()).toThrowError(/PRODUÇÃO/)
  } finally {
    restoreEnv(snap)
  }
})
