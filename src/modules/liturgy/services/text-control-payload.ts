import { readEffectiveStageSettings } from '@modules/settings/services/stage-settings-runtime'

/** Cor do título sem escolha própria: a mesma da anotação (Palco da Liturgia → referência da Bíblia). */
const DEFAULT_TITLE_COLOR = '#fb8c00'

/** Conteúdo e cores do Palco da Liturgia para o player de texto (avisos e anotações). */
export function stageTextPayload(source: { title: string; html: string; titleColor?: string | null }) {
  const stage = readEffectiveStageSettings('liturgy')
  return {
    title: source.title.trim(),
    html: source.html,
    titleColor:
      source.titleColor ||
      stage.titleTextColor ||
      readEffectiveStageSettings('bible').footerRefColor ||
      DEFAULT_TITLE_COLOR,
    textColor: stage.textColor ?? '#ffffff',
    backgroundColor: stage.backgroundColor ?? '#000000',
  }
}
