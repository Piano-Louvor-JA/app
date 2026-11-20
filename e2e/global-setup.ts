// Valida o ambiente efetivo antes de executar as specs; sem defaults de
// produção em canais ausentes e sem bypass para suítes mockadas.
import { assertNoProdApiUrl, resolveViteApiUrls } from './helpers/prod-url-guard'

export default function globalSetup(): void {
  const effective = resolveViteApiUrls()
  for (const { key, url, source } of effective) {
    assertNoProdApiUrl([url], `${source} (${key})`)
  }
  // Cada canal precisa de configuração explícita: um só não elimina os
  // defaults de produção dos demais. PIANO deriva de FILES no Electron.
  for (const key of ['VITE_URL_DATABASE', 'VITE_URL_FILES', 'VITE_PALCO_API_URL']) {
    if (!effective.some(item => item.key === key && item.url.trim())) {
      throw new Error(`E2E sem env de API explícita para ${key} — o default aponta para PRODUÇÃO. Configure database, files e Palco com staging ou localhost.`)
    }
  }
}
