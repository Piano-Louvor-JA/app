#!/usr/bin/env node
// CLI do build guard (RF-03): roda antes de vite build / electron-builder.
// Uso: node electron/guard/cli.mjs [--renderer-config <path.json>]
// Exit 1 com erro claro se o perfil/ambiente violar o contrato.
// Opcionalmente lê um JSON com as variáveis renderer efetivas para validar
// além do env do processo.

import { readFileSync } from 'node:fs'

import { checkBuildGuard, guardError } from './build-guard.mjs'

function loadRendererConfig(argIndex) {
  const flag = process.argv[argIndex]
  if (flag !== '--renderer-config') return {}
  const filePath = process.argv[argIndex + 1]
  if (!filePath) {
    console.error('--renderer-config exige um caminho de arquivo JSON')
    process.exit(1)
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    console.error(`Falha ao ler renderer config ${filePath}: ${error.message}`)
    process.exit(1)
  }
}

const rendererConfig = loadRendererConfig(2)
const { ok, errors, profile } = checkBuildGuard({ env: process.env, rendererConfig })
if (!ok) {
  console.error(guardError(errors, profile))
  process.exit(1)
}
console.log(`[guard] perfil OK: ${profile} — configuração de API válida para empacotar.`)
