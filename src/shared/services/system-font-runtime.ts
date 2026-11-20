import { DEFAULT_FONT_FAMILY } from '@modules/settings/data/font-catalog'
import { loadLocalFont } from './font-loader'
import { resolveFontId, subscribeFontPreferences } from './font-preferences'

export function installSystemFontRuntime() {
  let generation = 0
  async function update() {
    const request = ++generation
    let family = DEFAULT_FONT_FAMILY
    try { family = await loadLocalFont(resolveFontId('system')) } catch { /* missing files fall back without network */ }
    if (request === generation) document.documentElement.style.setProperty('--ds-font-family', family)
  }
  const stop = subscribeFontPreferences(() => { void update() })
  void update()
  return () => { generation++; stop() }
}
