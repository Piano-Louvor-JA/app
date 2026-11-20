#!/usr/bin/env node
/**
 * O NSIS do electron-builder faz `!include "extractAppPackage.nsh"` a partir de
 * templates/nsis/include/. Esse diretório é resolvido ANTES de build/, então
 * o override em build/extractAppPackage.nsh nunca entra no instalador.
 *
 * Este script copia o override por cima do template e remove o MessageBox de
 * fechamento do app (NSIS trata warning de label não usada como erro).
 */
import { copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const appBuilderRoot = path.dirname(require.resolve('app-builder-lib/package.json'))
const nsisInclude = path.join(appBuilderRoot, 'templates', 'nsis', 'include')

const extractSrc = path.join(here, 'extractAppPackage.nsh')
const extractDest = path.join(nsisInclude, 'extractAppPackage.nsh')
const installUtilDest = path.join(nsisInclude, 'installUtil.nsh')
const checkRunningDest = path.join(nsisInclude, 'allowOnlyOneInstallerInstance.nsh')

/**
 * `$0` carrega os argumentos do desinstalador antigo (`/allusers --keep-shortcuts
 * --updated`). O retorno do taskkill vai para `$R0`, que o ExecWait seguinte
 * sobrescreve; em `$0` o desinstalador rodaria como remoção completa e
 * desafixaria o app da barra de tarefas (WinShell::UninstAppUserModelId).
 * @param {string} source
 */
export function patchInstallUtilSource(source) {
  source = source.replace(
    /MessageBox MB_RETRYCANCEL\|MB_ICONEXCLAMATION "\$\(appCannotBeClosed\)"[^\n]*\n\s*Return\n/g,
    'DetailPrint "Desinstalação anterior não concluiu — seguindo com a instalação."\n      Return\n',
  )
  source = source.replace(/^\s*OneMoreAttempt:\s*\n/m, '')

  if (source.includes('taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T')) {
    source = source.replace(
      /(nsExec::Exec `taskkill \/F \/IM "\$\{APP_EXECUTABLE_FILENAME\}" \/T`\n\s*)Pop \$0(\n\s*Sleep 400\n\s*ExecWait '"\$uninstallerFileNameTemp")/,
      '$1Pop $$R0$2',
    )
  } else {
    source = source.replace(
      /ExecWait '"\$uninstallerFileNameTemp" \/S \/KEEP_APP_DATA \$0 _\?=\$installationDir' \$R0/,
      `nsExec::Exec \`taskkill /F /IM "\${APP_EXECUTABLE_FILENAME}" /T\`
    Pop $$R0
    Sleep 400
    ExecWait '"$$uninstallerFileNameTemp" /S /KEEP_APP_DATA $$0 _?=$$installationDir' $$R0`,
    )
  }

  return source.replace(/\$R5 > 5/, '$R5 > 20')
}

function patchInstallUtil() {
  const before = readFileSync(installUtilDest, 'utf8')
  const source = patchInstallUtilSource(before)

  if (source !== before) {
    writeFileSync(installUtilDest, source)
    console.log('[nsis] installUtil.nsh atualizado')
  } else {
    console.log('[nsis] installUtil.nsh já ok')
  }
}

function patchCheckAppRunning() {
  if (!existsSync(checkRunningDest)) return
  let source = readFileSync(checkRunningDest, 'utf8')
  const before = source

  source = source.replace(
    /# App likely running with elevated permissions\.[\s\S]*?\$\{if\} \$R1 > \d+[\s\S]*?\$\{else\}\n\s*Goto loop\n\s*\$\{endIf\}/,
    `# App likely running with elevated permissions.
        # Fecha o processo e tenta de novo; depois segue a instalação.
        \${if} $R1 > 8
          DetailPrint "Aplicativo ainda em execução — seguindo com a instalação."
          Goto not_running
        \${else}
          nsExec::Exec \`taskkill /F /IM "\${APP_EXECUTABLE_FILENAME}" /T\`
          Pop $0
          Sleep 500
          Goto loop
        \${endIf}`,
  )

  if (source !== before) {
    writeFileSync(checkRunningDest, source)
    console.log('[nsis] allowOnlyOneInstallerInstance.nsh atualizado')
  } else {
    console.log('[nsis] allowOnlyOneInstallerInstance.nsh já ok')
  }
}

function main() {
  if (!existsSync(extractSrc)) {
    throw new Error(`NSIS override ausente: ${extractSrc}`)
  }
  if (!existsSync(extractDest)) {
    throw new Error(`Template NSIS ausente: ${extractDest}`)
  }

  copyFileSync(extractSrc, extractDest)
  console.log(`[nsis] extractAppPackage.nsh → ${extractDest}`)

  patchInstallUtil()
  patchCheckAppRunning()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
