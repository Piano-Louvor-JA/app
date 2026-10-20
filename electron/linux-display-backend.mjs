/**
 * Backend gráfico no Linux: força XWayland em sessões Wayland.
 *
 * Desde o Electron 38 o Chromium usa Wayland nativo quando há
 * WAYLAND_DISPLAY. No Wayland o compositor ignora `x/y` e `setBounds`:
 * todas as janelas de projeção abrem no mesmo monitor, uma por cima da
 * outra, e `screen` chega a reportar o primário errado. Via XWayland o
 * posicionamento por monitor volta a funcionar.
 *
 * `app.commandLine.appendSwitch('ozone-platform', 'x11')` no main NÃO
 * basta: a plataforma ozone é escolhida antes do JS rodar (testado no
 * Electron 43, GNOME, 4 monitores). Por isso o app se relança com a flag
 * na linha de comando, antes de abrir qualquer janela.
 */

/** Variável que marca o processo relançado (evita loop). */
export const X11_RELAUNCH_MARKER = 'LOUVORJA_X11_RELAUNCHED'

const X11_FLAG = '--ozone-platform=x11'

/**
 * @param {{ platform: string, env: Record<string, string | undefined>, argv: string[] }} args
 * @returns {boolean}
 */
export function shouldRelaunchWithX11({ platform, env, argv }) {
  if (platform !== 'linux') return false
  if (env[X11_RELAUNCH_MARKER] === '1') return false
  if (argv.some((arg) => arg === '--ozone-platform' || arg.startsWith('--ozone-platform='))) return false

  const isWayland = env.XDG_SESSION_TYPE === 'wayland' || Boolean(env.WAYLAND_DISPLAY)
  // Sem DISPLAY não há XWayland: forçar X11 faria o app não abrir.
  return isWayland && Boolean(env.DISPLAY)
}

/**
 * Comando para reabrir o app via XWayland (spawn desanexado).
 * Não usa `app.relaunch`: o helper dele roda de dentro do mount do AppImage,
 * que é desmontado quando este processo sai, e o app não reabre.
 * @param {{ argv: string[], env: Record<string, string | undefined>, execPath: string }} args
 * @returns {{ command: string, args: string[] }}
 */
export function buildX11Relaunch({ argv, env, execPath }) {
  const args = [...argv.slice(1), X11_FLAG]
  // AppImage: execPath fica no mount temporário. Reabre pelo arquivo .AppImage.
  return { command: env.APPIMAGE || execPath, args }
}

/**
 * Lê e remove a marca de relaunch do ambiente. Sem remover, processos
 * filhos herdariam a marca (ex.: a versão nova aberta pelo auto-update) e
 * pulariam o relaunch, voltando ao Wayland nativo.
 * @param {Record<string, string | undefined>} env
 * @returns {boolean} true se este processo é o relançado
 */
export function consumeX11RelaunchMarker(env) {
  const relaunched = env[X11_RELAUNCH_MARKER] === '1'
  delete env[X11_RELAUNCH_MARKER]
  return relaunched
}
