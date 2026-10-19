# Integração técnica — desktop, interface e documentação

Status: proposta em rascunho para `staging`, atualizada à base PIANO 1.32.1. O protótipo e os pacotes de referência não substituem a base oficial.

## Goal
Manter a experiência de preparação e operação em Linux, Windows e macOS, preservando dados locais, contratos de projeção e preferências existentes.

## Arquitetura
| Camada | Responsabilidade | Local |
| --- | --- | --- |
| Tokens base | Superfícies e paletas | `src/design-system/tokens/colors.ts`, `themes/accents.ts` |
| Tokens semânticos | Pares legíveis, estados e foco | `src/design-system/tokens/interface.ts` |
| Preferências | Aplicar e persistir tema/cor/movimento | `src/design-system/composables/useThemeManager.ts` |
| Controles | Estados compartilhados sem opacidade destrutiva | `src/styles/controls.css` |
| Navegação | Barra lateral e navegação compacta com Mais | `AppSidebar.vue`, `DockFooter.vue` |
| Desktop | Resolver executável, limpar modo Node, propagar saída e registrar logs | `scripts/run-electron.mjs` |
| Conteúdo | Edições bíblicas, fontes e hashes | `src/modules/bible/data/manifest.json` |

Os renderers Electron são contextos separados. Use os mecanismos de sincronização existentes; não compartilhe estado apenas por memória Pinia. Projeção e controle remoto continuam com os papéis e códigos de acesso existentes.

## Desenvolvimento local
Use a versão Node declarada em `package.json` e `npm ci`. A instalação pode executar o postinstall oficial do projeto.

```sh
npm run dev -- --host localhost
npm run electron:dev
npm run electron:dev-log
npm run electron:preview
```

Os comandos Electron usam `cross-env` e Node, sem depender de `env -u`, `tee` ou atribuição POSIX. O pacote `electron` fornece o caminho correto do binário. `--class` é passado somente no Linux. O log é `louvorja-dev.log` no diretório temporário do sistema; o caminho é mostrado no terminal. O código de saída do filho é preservado e falhas de abertura retornam erro.

O perfil de desenvolvimento aceita `PIANO_DEV_DATA_DIR` absoluto para separar dados de teste. O launcher preserva essa variável. Não reutilize o diretório de produção para ensaios destrutivos. A porta usada pelos comandos padrão é 5173; encerre servidores antigos antes de testar outro checkout na mesma porta.

## Plataformas
| Plataforma | Alvos configurados | Validação necessária |
| --- | --- | --- |
| Linux | AppImage, deb, rpm, pacman; x64/arm64 | Execução nativa, integração desktop, dados, mídia e monitores |
| Windows | NSIS, portable, APPX; x64 | Build/ensaio nativo Windows; não cross-compilar portable |
| macOS | DMG universal | Intel e Apple Silicon; assinatura/notarização conforme distribuição |

As configurações de empacotamento não comprovam que o instalador foi produzido ou executado. Os idiomas NSIS/APPX e documentos legais precisam de revisão própria. Não disparar publicação ou merge como parte da validação local.

## Validation
1. Executar testes direcionados de launcher, tokens, navegação e persistência.
2. Executar `npm run build` e `npm run test` antes do commit/push, conforme `AGENTS.md`.
3. Conferir visualmente claro/escuro e navegação em janela estreita, com teclado e zoom.
4. Medir cores computadas dos estados reais. Testes de tokens não validam um componente que substitui o par por um valor literal, transparência ou filtro.
5. Empacotar no host apropriado e inspecionar os arquivos usados em runtime dentro do ASAR. Abrir o pacote sem depender do checkout.
6. Ensaiar duas telas, conexão/desconexão, escala/DPI, tela cheia, saída de áudio e telefone. Registrar sistema, arquitetura, versão e resultado real.

## Documentação e manutenção
O [manual do operador](USER_MANUAL.md) descreve tarefas. O [sistema visual](DESIGN_SYSTEM.md) define regras de implementação. A [revisão das referências](REFERENCE_REVIEW.md) registra procedência e limites. Atualize esses documentos junto de mudanças no comportamento; preserve a terminologia dos módulos e a distinção entre controle do operador e projeção.

## Risks / rollback
Não resetar preferências para aplicar o visual. Os IDs das seis paletas continuam válidos. Reverter um componente ao estilo anterior não deve remover dados de culto ou mídia. A contribuição continua em branch própria e PR em rascunho, sem release automático.
