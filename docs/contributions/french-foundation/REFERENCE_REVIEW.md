# Referências inspecionadas — 18/10/2026

## Scope
Arquivos fornecidos pelo usuário como inspiração de identidade, organização e manuais. Foram inspecionados metadados e conteúdo de arquivos, sem instalar ou executar os aplicativos de referência.

| Artefato | SHA-256 |
| --- | --- |
| `louvorja-violin_2.0.0-beta.17_arm64.deb` | `a8710dc41ac3f59455cd1462a16b99356c0c30d5a28d47d10b838d4d067c2969` |
| `LouvorJA-Violin-2.0.0-beta.17-x86_64.AppImage` | `e625c6b20afa798623c793902b1146d1a5f16b7ae3559ddc488182fbd856b0c7` |
| `louvorja-violin_2.0.0-beta.17_amd64.deb` | `ba54c08b011e535dcd5eb741e735c814cc853e3f0bab0e18a6fac44e8c3f9857` |
| `LouvorJA-PIANO-1.31.2-arm64.deb` | `5785a3c7c9f864863557df2f14c2878065600ab36ffd5dcce5943de48257ed49` |

## Evidência
Do DEB Violin amd64 foram extraídos, para leitura, o ASAR, os metadados de integração desktop e documentação do pacote. `package.json` identifica `2.0.0-beta.17`. O arquivo `src/assets/styles/tokens.css` documenta uma identidade azul/laranja-dourado e separa paleta, superfícies, texto, ribbon, subabas, status, player e diálogos. A listagem de assets mostra áreas de acessibilidade, integrações, transmissão, monitor, Bíblia e liturgia. A existência de um asset não prova seu comportamento em execução.

Do DEB PIANO arm64 foi lido o ASAR, cujo `package.json` identifica `1.31.2`, e a estrutura de empacotamento. Os arquivos de documentação encontrados no ASAR não constituem um manual completo do usuário. O AppImage foi identificado como ELF x86-64 e teve o hash registrado; não foi executado. O DEB Violin arm64 foi identificado e teve o hash registrado; não houve ensaio ARM.

## Aplicação à contribuição
Adotados como princípios: separar funções por área de operação; manter o conteúdo projetado distinto dos controles; centralizar tokens; reservar destaque de cor para seleção/ação/status; documentar o fluxo do operador por tarefas.

O código e os textos dos manuais desta contribuição foram escritos sobre a base PIANO já integrada. Não foram incorporados executáveis, acervos, contratos, assets proprietários ou código do Violin. O campo de licença do pacote Violin informa `unknown`; a referência não foi tratada como autorização de redistribuição.

## Documentos relacionados
- [SPEC](SPEC.md): problema, resultado e escopo.
- [PLAN](PLAN.md): etapas, validação e rollback.
- [Manual do operador](USER_MANUAL.md): procedimentos e solução de problemas.
- [Integração](INTEGRATION.md): arquitetura, desenvolvimento e matriz desktop.
- [Sistema visual](DESIGN_SYSTEM.md): identidade, tokens e contratos de contraste.
