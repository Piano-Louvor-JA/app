# Sistema visual — PIANO

Status: refinamento da contribuição em rascunho. As metas abaixo são contratos dos tokens e componentes migrados; não constituem certificação WCAG de toda a aplicação.

## Problem / Outcome
Estados definidos por opacidade, filtros e cores literais podem perder contraste quando o usuário troca a paleta. O sistema passa a definir pares opacos para texto/fundo e estados explícitos para ação, seleção, foco e desabilitado. A navegação prioriza a operação do culto e reduz a competição entre controles.

## Direção de identidade
O azul institucional e o amarelo/dourado do repertório visual LouvorJA orientam a paleta padrão. Azul guia a ação e a seleção; dourado é um acento de marca, não uma cor de texto obrigatória. A relação entre azul frio e dourado quente cria contraste de matiz, enquanto a escala tonal fornece a legibilidade. As seis preferências de acento existentes são preservadas.

Superfícies neutras com leve influência azul deixam o conteúdo e o estado operacional em primeiro plano. Use ícones lineares do conjunto local, tipografia existente, controles de cantos moderados e espaçamento consistente. Não acrescente gradientes decorativos, brilho, cartões ou animações sem função. Evite transformar todas as ações em botões primários; uma ação principal por grupo é preferível.

## Tokens e contratos
| Papel | Token | Regra |
| --- | --- | --- |
| Leitura | `--ds-color-on-surface`, `--ds-color-on-surface-variant` | 7:1 sobre as superfícies opacas base de ambos os temas |
| Acento e status | `--ds-color-primary/success/warning/danger/info` | 4,5:1 sobre as superfícies base |
| Ação | `--ds-action-{primary,neutral,danger}-{default,hover,active}` + `-text` | 4,5:1 em cada par |
| Seleção | `--ds-selection-bg/text` | 4,5:1; combinar com marcador, contorno ou estado acessível |
| Foco | `--ds-focus-ring/gap` | Anel de 3px; contraste de ao menos 3:1 com superfícies base e seleção |
| Contorno necessário | `--ds-control-border` | Ao menos 3:1 contra as superfícies base |
| Desabilitado | `--ds-disabled-bg/text` | Meta voluntária de 4,5:1; sem reduzir opacidade |

`interface.ts` deriva tons das paletas existentes e verifica luminância relativa sRGB, sem arredondar a razão para aprovação. Move o tom em direção a preto ou branco até satisfazer os pares previstos. Não escolhe cores aleatórias em cada componente. A preferência salva continua sendo o ID da paleta, não uma cópia de todos os valores calculados.

O texto de ação mantém o mesmo par em hover, active e foco. O anel é separado por um intervalo visível em controles preenchidos. Em navegação com rolagem, o anel interno evita cortes na borda. O modo de alto contraste do sistema mantém a indicação de foco.

## Composição dos componentes
`themes/vuetify-colors.ts` adapta os mesmos tokens aos componentes Vuetify. O shell atualiza essa ponte tanto na troca de modo quanto na troca de acento, preservando outras cores da biblioteca. Não manter uma segunda paleta independente para campos, menus e notificações. Preferências persistidas são validadas por chaves próprias dos catálogos; valores inválidos voltam aos padrões sem impedir a abertura da interface.

Use `.ds-control` e `data-tone="primary"` ou `data-tone="danger"` para ações. O botão neutro é o padrão. Desabilite com semântica real (`disabled` ou comportamento correspondente a `aria-disabled`); CSS sozinho não impede uma ação. Não substitua o texto do botão por um ícone sem nome acessível.

Use superfícies opacas em áreas críticas de operação. Transparência, vídeo de fundo, imagens, overlays e filtros exigem medição adicional no resultado composto. Uma cor aprovada em branco não está automaticamente aprovada sobre outra superfície. A identidade de terceiros e imagens de acervo não devem ser recoloridas pelo tema.

## Navegação e hierarquia
- Desktop: agrupamento lateral por tarefa, preferência de recolhimento preservada e marcador de seção ativa.
- Janela estreita: até quatro destinos prioritários e **Mais**. Opções adicionais mantêm nomes completos; `Esc` fecha e restaura o foco.
- Alvos de toque da navegação têm pelo menos 48px de altura. Rótulos podem quebrar linha; não reduzir para 9px para acomodar sete opções.
- Histórico, páginas minimizadas e controle da projeção são funções distintas e continuam preservados.

## Validation
`interface-states.test.ts` cobre as seis paletas nos dois modos: todas as superfícies base, estados de ação, seleção, bordas, foco e desabilitado. Os testes de navegação verificam acesso às opções adicionais, emissão de rota e recuperação de foco. A persistência do tema continua testada em save→reload.

A revisão visual deve conferir a aplicação efetiva desses tokens, não apenas sua definição. Ainda é necessária auditoria dos componentes legados e ensaio com teclado, leitor de tela, zoom, alto contraste do sistema e dispositivos reais. Não rotular o aplicativo inteiro como AA/AAA com base apenas nos testes de contraste.

## Referências e interpretação
- [W3C — contraste mínimo, 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): AA exige 4,5:1 para texto comum, 3:1 para texto grande; componentes inativos são exceção.
- [W3C — contraste aprimorado, 1.4.6](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html): AAA exige 7:1 para texto comum e 4,5:1 para texto grande.
- [W3C — contraste não textual, 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html): 3:1 para informação visual necessária de controles/estados.
- [W3C — aparência do foco, 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html): tamanho e contraste do indicador são critérios separados do texto.
- [Material — papéis de cor](https://m3.material.io/styles/color/roles): referência de organização semântica; não foi adotado um template visual de componentes.

A escolha de harmonia azul/dourado e hierarquia operacional é uma decisão de design desta contribuição, informada pelos arquivos de referência, e não uma exigência WCAG.
