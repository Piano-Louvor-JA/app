import { resolveDatabaseUrl } from '@shared/services/workspace-api'
import { fetchWithApiFallback } from '@shared/services/api-fallback'

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function fetchRemoteCatalogJson<T = unknown>(
  file: string,
  retries = 5,
  delayMs = 1000,
): Promise<T> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const token = import.meta.env.VITE_API_TOKEN

  try {
    const response = await fetch(`${resolveDatabaseUrl(`/${file}`)}?${date}`, {
      headers: token ? { 'Api-Token': token } : undefined,
    })

    if (response.status === 429 && retries > 0) {
      await delay(delayMs)
      return fetchRemoteCatalogJson(file, retries - 1, delayMs * 1.5)
    }

    if (!response.ok) {
      if (retries > 0 && (response.status === 429 || response.status >= 500)) {
        await delay(delayMs)
        return fetchRemoteCatalogJson(file, retries - 1, delayMs * 1.5)
      }
      // 4xx (exceto 429) = recurso/credencial inválido neste catálogo.
      // Não cascatear: o mesmo arquivo ausente nos fallbacks gera storm/CORS.
      throw new Error(`Servidor retornou erro ${response.status}`)
    }

    return (await response.json()) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.startsWith('Servidor retornou erro 4')) throw error
    if (
      retries > 0 &&
      (message.includes('Failed to fetch') || message.includes('NetworkError'))
    ) {
      await delay(delayMs)
      return fetchRemoteCatalogJson(file, retries - 1, delayMs * 1.5)
    }

    // Só falha transitória esgotada (rede/5xx/429) tenta hosts alternativos.
    const { data } = await fetchWithApiFallback<T>('database', file, { retries, delayMs })
    return data
  }
}
