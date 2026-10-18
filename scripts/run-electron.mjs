#!/usr/bin/env node
// Keep Electron launch commands portable across cmd.exe, Linux and macOS shells.
import { spawn } from 'node:child_process'
import { openSync, closeSync, writeSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

export function electronOptions({ env = process.env, platform = process.platform, args = [] } = {}) {
  const childEnv = { ...env }
  // Windows environment names are case-insensitive.
  for (const key of Object.keys(childEnv)) {
    if (key.toUpperCase() === 'ELECTRON_RUN_AS_NODE') delete childEnv[key]
  }
  return {
    executable: require('electron'),
    args: ['.', ...(platform === 'linux' ? ['--class=louvorja-piano'] : []), ...args],
    env: childEnv,
    shell: false,
  }
}

export async function runElectron({ executable, args, env, logPath } = {}) {
  const options = electronOptions({ env })
  let log
  try {
    if (logPath) log = openSync(logPath, 'w')
  } catch (error) {
    console.error(`[electron] ${error.message}`)
    return 1
  }
  return new Promise(resolveExit => {
    const child = spawn(executable ?? options.executable, args ?? options.args, {
      env: options.env,
      shell: false,
      stdio: log === undefined ? 'inherit' : ['inherit', 'pipe', 'pipe'],
    })
    let failed = false
    const interrupt = () => child.kill('SIGINT')
    const terminate = () => child.kill('SIGTERM')
    process.once('SIGINT', interrupt)
    process.once('SIGTERM', terminate)
    if (log !== undefined) {
      for (const [source, destination] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
        source.on('data', chunk => {
          destination.write(chunk)
          try { writeSync(log, chunk) } catch (error) {
            if (!failed) console.error(`[electron] ${error.message}`)
            failed = true
            child.kill('SIGTERM')
          }
        })
      }
    }
    child.once('error', error => {
      failed = true
      console.error(`[electron] ${error.message}`)
    })
    child.once('close', (code, signal) => {
      process.removeListener('SIGINT', interrupt)
      process.removeListener('SIGTERM', terminate)
      if (log !== undefined) closeSync(log)
      resolveExit(failed ? 1 : (code ?? (signal === 'SIGINT' ? 130 : 143)))
    })
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.some(arg => arg !== '--log') || args.length > 1) throw new Error('Unknown option. Usage: node scripts/run-electron.mjs [--log]')
    const logPath = args.includes('--log') ? join(tmpdir(), 'louvorja-dev.log') : undefined
    if (logPath) console.log(`[electron] Log: ${logPath}`)
    process.exitCode = await runElectron({ logPath })
  } catch (error) {
    console.error(`[electron] ${error.message}`)
    process.exitCode = 1
  }
}
