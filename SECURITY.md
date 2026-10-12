# Security Policy

## Versões suportadas

| Versão | Suportada |
|--------|-----------|
| 1.x    | sim       |

## Reportando uma vulnerabilidade

Se você descobrir uma vulnerabilidade, não abra uma issue pública.

Reporte em privado para rafael.zendron22@gmail.com com:

1. Descrição
2. Passos para reproduzir
3. Impacto possível
4. Sugestão de correção, se houver

### Tempo de resposta

- Confirmação de recebimento: até 48h
- Avaliação inicial: até 7 dias
- Correção ou mitigação: depende da severidade (crítico: 7 dias, alto: 30 dias, médio: 90 dias)

### Escopo

Este repositório é o aplicativo desktop Electron.

- Ponte preload/IPC (`contextBridge`) entre a interface e o processo principal
- Atualização automática (`electron-updater`) e artefatos de release
- Arquivos locais do workspace e da mídia
- Servidores locais de controle remoto e do palco

### Fora de escopo

- Vulnerabilidades em dependências de terceiros sem demonstração neste app
- Relatórios de scanner sem análise manual

## Práticas

- Não commitar secrets, tokens ou credenciais
- Usar variáveis de ambiente para configuração sensível
