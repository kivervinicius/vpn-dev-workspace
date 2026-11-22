# Plano de reintegração do trabalho VPN e OpenCode

A próxima entrega parte do master atual e usa a release 1.1.0 como referência de comportamento. O objetivo é recuperar melhorias de diagnóstico, continuidade de sessão e operação da VPN. Cada mudança preservada deve ter um destino registrado.

## Evidência inicial

- Fontes locais: branch `feat/vpn-unified-ia` em `3dc5f5d`, stash `377397b` e stash `0dce40d`. Os stashes têm bases diferentes e mudanças sobrepostas. Comparar cada um com seu primeiro pai e revisar também os arquivos guardados no terceiro pai.
- Três arquivos antes sem rastreamento já são idênticos na 1.1.0: `dotenv-read.sh`, `dotenv-read.ps1` e `vpn-opencode-processes`. O `vpn-control-api.sh` está presente, com diferenças a revisar.
- O plano anterior, guardado no terceiro pai de `377397b`, vinculava HTTP 429 a mudanças de IP ou de modelo e à retomada automática. A especificação atual separa limites do provedor de falhas confirmadas do túnel e usa retomada manual da sessão verificada.

## Ordem de execução

1. **Inventário e primeiro lote.** Abrir uma árvore de trabalho isolada a partir do master. Registrar a origem e o destino de cada mudança: já integrada, portar, adaptar ou arquivar com motivo. Começar por `vpn-control-api.sh`, locks, diagnóstico e testes de compatibilidade. Conferir as diferenças da antiga correção do plano de controle antes de portar qualquer trecho.
2. **Continuidade de sessão.** Portar melhorias que faltarem nos launchers, classificação de falhas, mensagens de retomada e testes. Preservar exportação/importação JSON entre versões, verificação da sessão de destino e bloqueio de snapshot SQLite antigo após falha. Validar que queda confirmada da rede recupera o túnel e que 429, quota, crédito e autenticação geram apenas status. Exibir o prazo de espera quando informado.
3. **Escolha de modelo.** Reaproveitar a descoberta de modelos do catálogo local para sugerir alternativas, com seleção explícita pelo usuário. A rotação de IP para contornar quota e o reenvio automático de prompts ou ferramentas ficam arquivados como decisões do plano anterior. A recuperação de falha real da VPN segue independente.
4. **Entrega Linux.** Revisar o diff local em `work/reintegracao`, conferir os 226 registros e executar os critérios de aceite da [especificação ativa](ACTIVE.md). Preservar o patch completo original em `/projetos/vpn-dev-workspace-reintegracao-review.patch`, inclusive o mock portátil do Pester.
5. **Etapa Windows futura.** Executar Pester para esta revisão em Windows e validar separadamente o staging SQLite real no Docker Desktop.

A entrega atual termina com o diff local e a evidência em [VERIFY.md](../VERIFY.md). Commit, push, release, implantação e alterações na CI ficam fora do escopo.
