# LouvorJA - PIANO (Desktop)

Aplicativo desktop para gerenciamento de culto — músicas, bíblia, utilitários e projeção.

Este projeto é um fork de recursos em relação ao app Louvor JA ([app.louvorja.com.br](https://app.louvorja.com.br/), [github.com/louvorja/app](https://github.com/louvorja/app)), onde as principais ferramentas são migradas e adaptadas para as tecnologias usadas neste projeto.

O **LouvorJA - PIANO**, além de incluir os recursos do App Louvor JA, vai incorporar ao longo do desenvolvimento outras funcionalidades voltadas ao contexto ministerial e educacional.

Pacote: `louvorja-piano` · Plataformas: Windows, macOS e Linux.

[![Instalar na Snap Store](https://snapcraft.io/louvorja-piano/badge.svg)](https://snapcraft.io/louvorja-piano)
[![Disponível na Microsoft Store](https://img.shields.io/badge/Microsoft%20Store-9N1WPDQKFLR9-0078D4?logo=windows11&logoColor=white)](https://apps.microsoft.com/detail/9N1WPDQKFLR9)

---


## Versões do produto

O LouvorJA - PIANO existe em **duas linhas de entrega**:


| Versão                 | Escopo                                 | Este repositório |
| ---------------------- | -------------------------------------- | ---------------- |
| **Electron (desktop)** | App nativo para Windows, macOS e Linux | **Sim**          |
| **Web**                | Aplicação exclusiva para navegador     | Não              |


Este README cobre apenas a **versão Electron**. A versão web é um projeto separado, pensado para uso no browser, sem o shell desktop.

---



## Roadmap (além do Louvor JA)


| Área                   | Exemplos                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| **Agenda ministerial** | Escalas e gestão de cargos no âmbito distrital — pregação, músicas, eventos, escala pastoral, etc. |
| **Jogos bíblicos**     | Atividades para adultos, crianças, Desbravadores e Aventureiros                                    |
| **Estudos bíblicos**   | Conteúdo e fluxos de estudo                                                                        |
| **Outros**             | Novos recursos conforme a evolução do produto                                                      |


---



## Stack

- Vue 3 (Composition API) + TypeScript
- Electron + Vite
- Pinia · Vue Router · Vue I18n
- Vuetify (componentes ricos) · Tailwind CSS (layout)
- Design system próprio (`src/design-system/`)

---



## Arquitetura

Separação clara entre **shell Electron**, **renderer Vue** e **features modulares**.

```
electron/                 → processo principal (main, preload, ipc)
src/                      → renderer (Vue)
  design-system/          → linguagem visual (tokens, temas, primitivas)
  layouts/                → shell da UI (header + dock + RouterView)
  modules/                → features isoladas por domínio
  shared/                 → código compartilhado NÃO visual
  router/                 → agrega as rotas de cada módulo
  plugins/ locales/ styles/ assets/
```



### Camadas


| Camada           | Responsabilidade                                                     |
| ---------------- | -------------------------------------------------------------------- |
| `electron/`      | Janela, ciclo de vida, IPC, bridge segura (`preload`)                |
| `design-system/` | Tokens, temas, glass, dock, backgrounds — sem regra de negócio       |
| `layouts/`       | Compõe o design system e hospeda as páginas                          |
| `modules/`       | Funcionalidades (home, bible, liturgy, clock, draw, timer, settings) |
| `shared/`        | Utilitários, services e widgets de domínio reutilizáveis             |
| `router/`        | Registra `routes.ts` de cada módulo                                  |




### Contrato de um módulo

Cada feature em `src/modules/<nome>/` segue o mesmo formato:

```
modules/<nome>/
├── components/
├── composables/
├── services/
├── stores/       # Pinia do módulo
├── types/
├── locales/
├── views/
└── routes.ts     # exportado para o router global
```

Fluxo: **módulo exporta rotas** → **router agrega** → **layout renderiza via** `<RouterView />`.

### Design system

- Temas: Ethereal Lumens (escuro) e Luminous Clarity (claro)
- Navegação principal: footer estilo macOS Dock
- Primitivas: `GlassCard`, `DockFooter`, `GradientBackground`, …
- Tailwind **só para layout** · Vuetify **para componentes ricos**
- Alias: `@design-system` — módulos não reimplementam glass/dock/gradient



### Aliases principais

`@` · `@modules` · `@shared` · `@design-system` · `@layouts` · `@plugins` · `@themes` · `@styles` · `@locales` · `@assets`

---



## Começar

Requisito: Node.js `^22.18.0` ou `>=24.12.0`

```bash
npm install
npm run dev              # browser
npm run electron:dev     # janela Electron + hot-reload
```

---



## Scripts


| Comando                    | Descrição                                                                    |
| -------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`              | Desenvolvimento no browser (porta 5173)                                      |
| `npm run host`             | Vite na rede local                                                           |
| `npm run build`            | Type-check + build de produção                                               |
| `npm run preview`          | Preview do build no browser                                                  |
| `npm run electron:dev`     | Electron + Vite                                                              |
| `npm run electron:preview` | Abre o build no Electron                                                     |
| `npm run electron:build`   | Gera instalador (`electron-builder`)                                         |
| `npm run version:patch`    | Sobe patch (`1.0.0` → `1.0.1`), commit + tag `vX.Y.Z`                        |
| `npm run version:minor`    | Sobe minor (`1.0.0` → `1.1.0`), commit + tag                                 |
| `npm run version:major`    | Sobe major (`1.0.0` → `2.0.0`), commit + tag                                 |
| `npm run git:publish`      | Push do branch atual + tags                                                  |
| `npm run git:tag`          | Cria/envia só a tag da versão atual do `package.json` (se ainda não existir) |


```bash
npm run electron:build -- --linux
npm run electron:build -- --win
npm run electron:build -- --mac
```

---



## Aviso do Windows (SmartScreen / Defender)



O instalador `.exe` do Windows **não possui assinatura digital** (code signing custa ~R$ 1.200-2.000/ano e ainda não foi contratado). Por isso o Windows pode exibir:

- **SmartScreen**: "O Windows protegeu o computador" ao executar o instalador;
- **Microsoft Defender**: detecção `PUADIManager:Win32/OnePlatform` (genérica, para instaladores NSIS sem assinatura e sem reputação).



**Isso é um falso positivo.** O app é open source, sem telemetria e sem código malicioso — todo o código e o pipeline de build são públicos neste repositório e nos workflows do GitHub Actions.



### Como instalar mesmo assim

1. Na tela "O Windows protegeu o computador", clique em **Mais informações**;
2. Clique em **Executar assim mesmo**;
3. Se o Defender bloquear: **Proteção contra vírus e ameaças → Histórico de proteção → Ameaça bloqueada → Permitir**.



### Como conferir a integridade do arquivo

Cada release publica os arquivos `SHA256SUMS-*` junto aos instaladores. Compare o hash do arquivo baixado:

```powershell
Get-FileHash .\louvorja-piano-1.22.0-x64.exe -Algorithm SHA256
```



> **Situação atual (set/2026):** o build v1.22.0 foi submetido à Microsoft como falso positivo (submission `b6e692a1-0966-4e3a-9aaa-5873b6e8b910`, 12/09/2026). A correção via whitelist é por hash — **cada nova versão pode voltar a ser sinalizada** até que o projeto assine os instaladores (certificado OV/EV). Acompanhamento: https://www.microsoft.com/en-us/wdsi/filesubmission

---



### Versionamento

```bash
npm run version:patch   # ou :minor / :major
npm run git:publish     # envia commit e tags ao remoto
```

Aliases: `version:bug` → patch · `version:min` → minor · `version:max` → major.

---



## Licença

Licença [MIT](LICENSE.md) — LouvorJA - PIANO.