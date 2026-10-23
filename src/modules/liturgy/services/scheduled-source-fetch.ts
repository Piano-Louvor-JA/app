import { getDesktopBridge } from '@shared/services/desktop-bridge'

/**
 * HTML/texto de fonte externa: main process (sem CORS) no Electron,
 * fetch direto na web e, se o site não manda Access-Control-Allow-Origin
 * (ex. daniellocutor), proxy de leitura r.jina.ai (reflete qualquer origin).
 */
export const READ_PROXY = 'https://r.jina.ai/'

export async function fetchSourceText(url: string): Promise<string | null> {
  const bridge = getDesktopBridge()
  if (bridge?.workspace?.fetchText) return bridge.workspace.fetchText(url)
  try {
    const resp = await fetch(url)
    if (resp.ok) return await resp.text()
  } catch {
    // CORS/bloqueio: cai no proxy abaixo
  }
  try {
    const resp = await fetch(`${READ_PROXY}${url}`)
    return resp.ok ? await resp.text() : null
  } catch {
    return null
  }
}
