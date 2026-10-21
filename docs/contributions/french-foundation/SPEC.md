# Interface francesa e operação de culto

Status: draft — proposta comunitária para revisão da equipe PIANO.

## Problem
Operadores francófonos precisam de interface, leitura bíblica e organização do culto em francês. O fluxo de configurações e a navegação também precisam permitir a operação em diferentes tamanhos de janela.

## Outcome
Francês selecionável nas configurações, preferência persistente e idioma inicial português preservado. Navegação desktop agrupada, seis paletas claras/escuras, ícones locais e ferramentas de Bíblia e programação do culto integradas à base oficial.

## Scope
- Dicionários franceses, incluindo histórico, diagnóstico, mídia e liturgia da base 1.31.2.
- Duas edições bíblicas francesas locais, busca por termos/referência e comparação. Fontes, hashes e condições declaradas pelo fornecedor em `src/modules/bible/data/manifest.json`.
- Responsáveis, modelos, duração e exportação do cronograma da liturgia.
- Detecção de monitores conforme a capacidade real do ambiente.
- Controle pelo navegador do celular, preservando o protocolo existente e o token limitado do pregador.
- Perfil opcional de dados isolados para desenvolvimento desktop.

## Constraints
Offline-first; preservar dados e preferências existentes. Sem presumir catálogo musical francês ou novo endpoint de API. Preservar créditos e licenças. A identidade visual proposta permanece experimental e depende da decisão dos mantenedores.

## Validation
Baseline em `1f65f098`: 8.536 testes aprovados de 8.537, zero falhas; tipos e build aprovados. Comparação integrada: 8.638 aprovados de 8.639, zero falhas; tipos e build aprovados. Um teste ignorado em ambas as execuções. Correções do idioma inicial da Bíblia também verificadas em grupo direcionado: 25 testes aprovados.

Atualização posterior de staging `a295c247` preservada: apenas arquivos de CI/release e exclusão do teste Node no Vitest; oito testes Node de release aprovados. Não representa uma nova execução completa da suíte sobre essa atualização.

## Risks and remaining work
Este é um PR em rascunho para discussão da implementação conjunta. Revisão humana do francês, navegação em janela estreita, seleção de telas e ensaio físico com projetor e telefone continuam pendentes. A leitura de arquivos do servidor remoto ainda precisa de inspeção em um pacote Electron/ASAR; nenhum instalador foi entregue. A autorização de músicas e de outras traduções bíblicas não está incluída.

O histórico de navegação, páginas minimizadas, atualização de catálogos, diagnósticos, restauração de backup e papéis operador/pregador da staging foram mantidos durante a resolução dos conflitos. Os testes não substituem a revisão humana desses contratos.
