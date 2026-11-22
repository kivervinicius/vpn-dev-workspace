# Inventário de reintegração

Destinos registrados após comparação com o master e análise dos deltas preservados.

| Origem | Caminho | Destino |
|---|---|---|
| `3dc5f5d` | `.dockerignore` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `.env.example` | Superado. Mantidos baseline atual, estado da rotação voluntária e limites do provedor como status. |
| `3dc5f5d` | `.gitattributes` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `.github/ISSUE_TEMPLATE/bug_report.yml` | Superado. Exemplos atualizados para as duas versões testadas. |
| `3dc5f5d` | `.github/ISSUE_TEMPLATE/feature_request.yml` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `.github/PULL_REQUEST_TEMPLATE.md` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `.github/dependabot.yml` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `.github/workflows/validate.yml` | Superado. CI atual valida o helper JSON com Node, o baseline atual e o build Gluetun. |
| `3dc5f5d` | `.gitignore` | Superado. Mantida a exclusão do diretório de lock criado em operação. |
| `3dc5f5d` | `CHANGELOG.md` | Superado. A release 1.1.0 já tem registro publicado. |
| `3dc5f5d` | `CONTRIBUTING.md` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `DEV/ARCHITECTURE.md` | Superado. Mantida a separação entre recuperação de rede e eventos de provedor. |
| `3dc5f5d` | `DEV/BACKLOG.md` | Superado. Retomada manual, validação Windows e triagem seguem no plano atual. A porta de controle já foi publicada na 1.1.0. |
| `3dc5f5d` | `DEV/CONTEXT.md` | Histórico preservado na origem. O contexto atual descreve a instalação e o contrato da 1.1.0. |
| `3dc5f5d` | `DEV/DECISIONS.md` | Histórico preservado na origem. A política atual reserva reconexão para falhas reais de rede. |
| `3dc5f5d` | `DEV/HANDOFF.md` | Histórico preservado na origem. O handoff atual registra corte e estado da reintegração. |
| `3dc5f5d` | `DEV/INDEX.md` | Adaptado. O índice atual aponta para a documentação de sessões e para o inventário da reintegração. |
| `3dc5f5d` | `DEV/ROADMAP.md` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `DEV/RUNBOOKS/opencode-desktop-vpn.md` | Superado. Mantidos baseline atual e recuperação separada de limites do provedor. |
| `3dc5f5d` | `DEV/RUNBOOKS/opencode-v1-v2.md` | Adaptado. O runbook atual mantém sync JSON e documenta sugestões com escolha manual. |
| `3dc5f5d` | `DEV/RUNBOOKS/opencode-v2-regression.md` | Superado. Evidências antigas já aparecem como históricas no runbook atual. |
| `3dc5f5d` | `DEV/RUNBOOKS/troubleshooting-vpn.md` | Superado. Quota permanece diagnóstico observacional separado de falhas de túnel. |
| `3dc5f5d` | `DEV/SPECS/ACTIVE.md` | Superado. Os critérios atuais cobrem sync JSON, recuperação de rede e status de quota. |
| `3dc5f5d` | `DEV/TESTING.md` | Superado. A cobertura atual substitui critérios de rotação por quota por testes de status, proteção contra replay e sync JSON. |
| `3dc5f5d` | `DEV/VERIFY.md` | Histórico preservado na origem. As evidências antigas têm versões e políticas distintas dos gates atuais. |
| `3dc5f5d` | `DEV/WORKLOG.md` | Histórico preservado na origem. Mantido o worklog atual como registro da integração e do release. |
| `3dc5f5d` | `Dockerfile` | Superado. O fallback 1.19.6 usa checksums próprios para amd64 e arm64. |
| `3dc5f5d` | `Makefile` | Superado. Uso do vpn-switch garante seleção e validação do perfil. |
| `3dc5f5d` | `README.md` | Superado. Mantidos o baseline atual, sync JSON e retomada manual, com detalhes de escolha de modelo no runbook. |
| `3dc5f5d` | `SECURITY.md` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `apps/control-plane/lib/backup.cjs` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `apps/control-plane/lib/compat.cjs` | Superado. Diagnóstico atual distingue versão mínima da versão testada. |
| `3dc5f5d` | `apps/control-plane/lib/events.cjs` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `apps/control-plane/lib/observer.cjs` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `apps/control-plane/lib/probe.cjs` | Superado. O probe atual verifica o retorno da CLI e exige a versão mínima com suporte a sessão arquivada. |
| `3dc5f5d` | `apps/control-plane/lib/server.cjs` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `apps/control-plane/lib/state.cjs` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `apps/control-plane/lib/util.cjs` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `apps/control-plane/public/app.css` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `apps/control-plane/public/app.js` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `apps/control-plane/public/index.html` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `compose.windows.yml` | Superado. Mantidos os mounts compartilhados e o helper de sync JSON da versão atual. |
| `3dc5f5d` | `config/alsa-null.conf` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `docker-compose.yml` | Adaptado. Mantidos o sync JSON e o serviço v2. Acrescentados ao observador os helpers comuns de configuração e API. |
| `3dc5f5d` | `docs/COMMUNITY_ROADMAP.md` | Superado. O próximo teste de runtime documentado é o staging Windows nas versões atuais. |
| `3dc5f5d` | `docs/TLDR.md` | Superado. Mantidos exemplos de configuração utilizáveis no guia atual. |
| `3dc5f5d` | `docs/compatibility.md` | Superado. Mantida a matriz atual de baselines e a pendência de Docker Desktop Windows. |
| `3dc5f5d` | `examples/cenarios-avancados.md` | Superado. Exemplos atuais seguem a separação entre quota e recuperação de rede. |
| `3dc5f5d` | `examples/uso-basico.md` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `gluetun/Dockerfile` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `gluetun/publicip-recovery.patch` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `opencode/v1/vpn-recovery.js` | Superado. Mantidos avisos estruturados e prazo informado, com rotação e reenvio fora da política atual. |
| `3dc5f5d` | `opencode/v2/vpn-recovery/classify.js` | Já integrado. O mapa atual classifica provider.free-limit de forma estruturada. |
| `3dc5f5d` | `opencode/v2/vpn-recovery/package.json` | Superado. A TUI usa o contrato do pacote 2.3.2. |
| `3dc5f5d` | `opencode/v2/vpn-recovery/server-core.js` | Adaptado. O servidor mantém veto de retry. A descoberta de modelos foi reaproveitada como escolha explícita na TUI. |
| `3dc5f5d` | `opencode/v2/vpn-recovery/server.js` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `opencode/v2/vpn-recovery/tui-core.js` | Adaptado. Notifica o prazo de espera e sugere modelos para escolha manual. |
| `3dc5f5d` | `opencode/v2/vpn-recovery/tui.js` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `profiles/custom-wireguard.yml` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `profiles/mullvad-wireguard.yml` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `profiles/nordvpn-openvpn.yml` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `profiles/nordvpn-wireguard.yml` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `profiles/protonvpn-openvpn.yml` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `profiles/protonvpn-wireguard.yml` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `profiles/surfshark-openvpn.yml` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/opencode-compat` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/opencode-limit-recover` | Superado. O comando mantém a interface de status com Retry-After, sem troca de IP ou consulta ao provedor. |
| `3dc5f5d` | `scripts/opencode-supervisor` | Superado. O supervisor atual verifica por exportação da sessão exata. |
| `3dc5f5d` | `scripts/opencode-vpn-install` | Superado. O instalador atual mantém o baseline e instala o sync JSON. |
| `3dc5f5d` | `scripts/opencode1` | Adaptado. Preservada a entrada do cliente durante o sync JSON. |
| `3dc5f5d` | `scripts/opencode2` | Adaptado. Preservada a entrada do cliente durante o sync JSON. |
| `3dc5f5d` | `scripts/opencode2-service` | Superado. O launcher atual aplica o mínimo 2.2.6 e informa desvios do baseline testado. |
| `3dc5f5d` | `scripts/verify-compose` | Adaptado. Mantida a verificação da porta de controle e incluído o perfil control nos checks. |
| `3dc5f5d` | `scripts/verify-docs` | Superado. A validação atual exige o comando concreto de retomada e o baseline Gluetun atual. |
| `3dc5f5d` | `scripts/vpn-auto-reconnect` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/vpn-backup` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/vpn-check` | Superado. O helper atual seleciona porta e credencial por ambiente e passa a chave pelo stdin do curl. |
| `3dc5f5d` | `scripts/vpn-control-lock.sh` | Superado. O lock atual compartilha o caminho entre host e container, e falha quando o caminho explícito é ilegível para escrita. |
| `3dc5f5d` | `scripts/vpn-control-ui` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/vpn-doctor` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/vpn-entrypoint.sh` | Superado. O Gluetun recebe a credencial em arquivo temporário restrito, com rotas permitidas explícitas. |
| `3dc5f5d` | `scripts/vpn-events` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/vpn-home-link` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/vpn-hosts-apply` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/vpn-hosts-gen` | Já integrado. As diferenças são exemplos de endereços nos comentários. |
| `3dc5f5d` | `scripts/vpn-hosts-import` | Já integrado. A diferença é um exemplo de endereço no comentário. |
| `3dc5f5d` | `scripts/vpn-observer` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/vpn-opencode` | Superado. Mantidos parser compartilhado, helper de autenticação e controle de processos por porta. |
| `3dc5f5d` | `scripts/vpn-opencode-wrapper` | Superado. A versão atual informa falhas de importação e exportação. |
| `3dc5f5d` | `scripts/vpn-provider-probe` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/vpn-reconnect` | Superado. O helper atual seleciona porta e credencial por ambiente e passa a chave pelo stdin do curl. |
| `3dc5f5d` | `scripts/vpn-server-rotate` | Superado. Mantidos lock compartilhado, validação de saúde e reversão quando falha. |
| `3dc5f5d` | `scripts/vpn-session-sync` | Superado. O staging atual propaga falhas e preserva o snapshot anterior. |
| `3dc5f5d` | `scripts/vpn-setup` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/vpn-shell` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/vpn-ssh-agent-bridge.ps1` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/vpn-ssh-agent-relay` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/vpn-state` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/vpn-status` | Superado. O helper atual seleciona porta e credencial por ambiente e passa a chave pelo stdin do curl. |
| `3dc5f5d` | `scripts/vpn-switch` | Superado. Mantidos parser compartilhado, validação de proxy e lock na operação. |
| `3dc5f5d` | `scripts/vpn-title-hook.zsh` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `scripts/vpn-top` | Superado. O helper atual seleciona porta e credencial por ambiente e passa a chave pelo stdin do curl. |
| `3dc5f5d` | `scripts/vpn.ps1` | Superado. A versão atual propaga falhas do sync e aplica staging somente depois de um push bem-sucedido. |
| `3dc5f5d` | `tests/control/backup.test.cjs` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `tests/control/compat.test.cjs` | Superado. Cobertura do mínimo seguro e distinção do baseline testado. |
| `3dc5f5d` | `tests/control/events.test.cjs` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `tests/control/launcher.test.cjs` | Superado. Cobertos mínimo, canário, versão mais nova e túnel indisponível. |
| `3dc5f5d` | `tests/control/probe.test.cjs` | Já integrado. As fixtures usam as versões atuais. |
| `3dc5f5d` | `tests/control/server.test.cjs` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `tests/control/state.test.cjs` | Já integrado (mesmo conteúdo) |
| `3dc5f5d` | `tests/linux/test-scripts.sh` | Adaptado. A suíte atual conserva testes de operação, lock e diagnóstico, e verifica que limites só informam status. |
| `3dc5f5d` | `tests/opencode/vpn-recovery.test.mjs` | Adaptado. Preservados classificação e prazo de espera. Teste atual cobre sugestões e ausência de rotação, troca de modelo ou replay. |
| `3dc5f5d` | `tests/windows/vpn.Tests.ps1` | Superado. O teste atual inclui a recusa de aplicar staging antigo após falha do push e conserva as verificações do fluxo Windows. |
| `377397b` | `.env.example` | Superado. Mantidos baseline atual, estado da rotação voluntária e limites do provedor como status. |
| `377397b` | `.github/workflows/validate.yml` | Superado. CI atual valida o helper JSON com Node, o baseline atual e o build Gluetun. |
| `377397b` | `.gitignore` | Já integrado (mesmo conteúdo) |
| `377397b` | `DEV/ARCHITECTURE.md` | Superado. Mantida a separação entre recuperação de rede e eventos de provedor. |
| `377397b` | `DEV/BACKLOG.md` | Superado. Retomada manual, validação Windows e triagem seguem no plano atual. A porta de controle já foi publicada na 1.1.0. |
| `377397b` | `DEV/CONTEXT.md` | Histórico preservado na origem. O contexto atual descreve a instalação e o contrato da 1.1.0. |
| `377397b` | `DEV/DECISIONS.md` | Histórico preservado na origem. A política atual reserva reconexão para falhas reais de rede. |
| `377397b` | `DEV/HANDOFF.md` | Histórico preservado na origem. O handoff atual registra corte e estado da reintegração. |
| `377397b` | `DEV/HANDOFFS/WORKLOG_ARCHIVE.md` | Já integrado (mesmo conteúdo) |
| `377397b` | `DEV/INDEX.md` | Adaptado. O índice atual aponta para a documentação de sessões e para o inventário da reintegração. |
| `377397b` | `DEV/RUNBOOKS/opencode-desktop-vpn.md` | Superado. Mantidos baseline atual e recuperação separada de limites do provedor. |
| `377397b` | `DEV/RUNBOOKS/opencode-v1-v2.md` | Adaptado. O runbook atual mantém sync JSON e documenta sugestões com escolha manual. |
| `377397b` | `DEV/RUNBOOKS/troubleshooting-vpn.md` | Superado. Quota permanece diagnóstico observacional separado de falhas de túnel. |
| `377397b` | `DEV/SPECS/ACTIVE.md` | Superado. Os critérios atuais cobrem sync JSON, recuperação de rede e status de quota. |
| `377397b` | `DEV/SPECS/PLAN-AUTONOMOUS-RELEASE.md` | Arquivado. O plano revisado substitui rotação por quota e reenvio automático por aviso e escolha manual. |
| `377397b` | `DEV/TESTING.md` | Superado. A cobertura atual substitui critérios de rotação por quota por testes de status, proteção contra replay e sync JSON. |
| `377397b` | `DEV/VERIFY.md` | Histórico preservado na origem. As evidências antigas têm versões e políticas distintas dos gates atuais. |
| `377397b` | `DEV/WORKLOG.md` | Histórico preservado na origem. Mantido o worklog atual como registro da integração e do release. |
| `377397b` | `Makefile` | Já integrado (mesmo conteúdo) |
| `377397b` | `README.md` | Superado. Mantidos o baseline atual, sync JSON e retomada manual, com detalhes de escolha de modelo no runbook. |
| `377397b` | `apps/control-plane/lib/compat.cjs` | Arquivado. A única diferença é o baseline antigo 1.19.5. |
| `377397b` | `apps/control-plane/lib/probe.cjs` | Já integrado (mesmo conteúdo) |
| `377397b` | `compose.windows.yml` | Superado. Mantidos os mounts compartilhados e o helper de sync JSON da versão atual. |
| `377397b` | `docker-compose.yml` | Adaptado. Mantidos o sync JSON e o serviço v2. Acrescentados ao observador os helpers comuns de configuração e API. |
| `377397b` | `docs/TLDR.md` | Já integrado (mesmo conteúdo) |
| `377397b` | `examples/cenarios-avancados.md` | Superado. Exemplos atuais seguem a separação entre quota e recuperação de rede. |
| `377397b` | `opencode/v1/vpn-recovery.js` | Superado. Mantidos avisos estruturados e prazo informado, com rotação e reenvio fora da política atual. |
| `377397b` | `opencode/v2/vpn-recovery/classify.js` | Já integrado. O delta contém apenas comentários sobre política antiga. |
| `377397b` | `opencode/v2/vpn-recovery/ladder.js` | Adaptado na TUI para sugerir opções do catálogo. Contrato publicado de 2.3.2 conferido e fluxo coberto por teste com fixture. |
| `377397b` | `opencode/v2/vpn-recovery/policy.js` | Arquivado. A política anterior alterava VPN ou modelo e autorizava retry. |
| `377397b` | `opencode/v2/vpn-recovery/server-core.js` | Adaptado. O servidor mantém veto de retry. A descoberta de modelos foi reaproveitada como escolha explícita na TUI. |
| `377397b` | `opencode/v2/vpn-recovery/tui-core.js` | Adaptado. Notifica o prazo de espera e sugere modelos para escolha manual. |
| `377397b` | `scripts/dotenv-read.ps1` | Já integrado (mesmo conteúdo) |
| `377397b` | `scripts/dotenv-read.sh` | Já integrado (mesmo conteúdo) |
| `377397b` | `scripts/opencode-limit-recover` | Superado. O comando mantém a interface de status com Retry-After, sem troca de IP ou consulta ao provedor. |
| `377397b` | `scripts/opencode-supervisor` | Superado. A exportação pelo ID exato evita depender das 50 sessões mais recentes. |
| `377397b` | `scripts/opencode-vpn-install` | Superado. Mantidos o baseline atual e a instalação do helper de sync. |
| `377397b` | `scripts/opencode1` | Superado. O launcher atual preserva a home v1 e sincroniza sessões JSON nos fluxos interativos. |
| `377397b` | `scripts/opencode2` | Superado. A versão atual mantém o sync JSON antes e depois da sessão interativa. |
| `377397b` | `scripts/opencode2-service` | Já integrado (mesmo conteúdo) |
| `377397b` | `scripts/verify-compose` | Já integrado (mesmo conteúdo) |
| `377397b` | `scripts/verify-docs` | Superado. A checagem atual exige documentar o comando concreto para retomar pelo ID. |
| `377397b` | `scripts/vpn-check` | Já integrado (mesmo conteúdo) |
| `377397b` | `scripts/vpn-control-api.sh` | Arquivado. Mantida a escolha da chave por ambiente, junto da porta correspondente. |
| `377397b` | `scripts/vpn-control-lock.sh` | Já integrado (mesmo conteúdo) |
| `377397b` | `scripts/vpn-entrypoint.sh` | Já integrado (mesmo conteúdo) |
| `377397b` | `scripts/vpn-hosts-gen` | Já integrado (mesmo conteúdo) |
| `377397b` | `scripts/vpn-hosts-import` | Já integrado (mesmo conteúdo) |
| `377397b` | `scripts/vpn-opencode` | Já integrado (mesmo conteúdo) |
| `377397b` | `scripts/vpn-opencode-processes` | Já integrado (mesmo conteúdo) |
| `377397b` | `scripts/vpn-reconnect` | Já integrado (mesmo conteúdo) |
| `377397b` | `scripts/vpn-server-rotate` | Já integrado. Diferença apenas de espaço no fim da linha. |
| `377397b` | `scripts/vpn-status` | Já integrado (mesmo conteúdo) |
| `377397b` | `scripts/vpn-switch` | Já integrado (mesmo conteúdo) |
| `377397b` | `scripts/vpn-top` | Já integrado (mesmo conteúdo) |
| `377397b` | `scripts/vpn.ps1` | Superado. A versão atual valida loopback pela API estática e impede aplicar staging antigo após falha do push. |
| `377397b` | `tests/control/compat.test.cjs` | Já integrado com fixtures atualizadas para os baselines atuais. |
| `377397b` | `tests/control/launcher.test.cjs` | Já integrado (mesmo conteúdo) |
| `377397b` | `tests/linux/test-scripts.sh` | Adaptado. A suíte atual conserva testes de operação, lock e diagnóstico, e verifica que limites só informam status. |
| `377397b` | `tests/opencode/vpn-recovery.test.mjs` | Adaptado. Preservados classificação e prazo de espera. Teste atual cobre sugestões e ausência de rotação, troca de modelo ou replay. |
| `377397b` | `tests/windows/vpn.Tests.ps1` | Superado. O teste atual inclui a recusa de aplicar staging antigo após falha do push e conserva as verificações do fluxo Windows. |
| `0dce40d` | `.env.example` | Superado. Mantidos baseline atual, estado da rotação voluntária e limites do provedor como status. |
| `0dce40d` | `.github/workflows/validate.yml` | Superado. CI atual valida o helper JSON com Node, o baseline atual e o build Gluetun. |
| `0dce40d` | `.gitignore` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `DEV/ARCHITECTURE.md` | Superado. Mantida a separação entre recuperação de rede e eventos de provedor. |
| `0dce40d` | `DEV/BACKLOG.md` | Superado. Retomada manual, validação Windows e triagem seguem no plano atual. A porta de controle já foi publicada na 1.1.0. |
| `0dce40d` | `DEV/CONTEXT.md` | Histórico preservado na origem. O contexto atual descreve a instalação e o contrato da 1.1.0. |
| `0dce40d` | `DEV/DECISIONS.md` | Histórico preservado na origem. A política atual reserva reconexão para falhas reais de rede. |
| `0dce40d` | `DEV/HANDOFF.md` | Histórico preservado na origem. O handoff atual registra corte e estado da reintegração. |
| `0dce40d` | `DEV/HANDOFFS/WORKLOG_ARCHIVE.md` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `DEV/INDEX.md` | Adaptado. O índice atual aponta para a documentação de sessões e para o inventário da reintegração. |
| `0dce40d` | `DEV/RUNBOOKS/opencode-desktop-vpn.md` | Superado. Mantidos baseline atual e recuperação separada de limites do provedor. |
| `0dce40d` | `DEV/RUNBOOKS/opencode-v1-v2.md` | Adaptado. O runbook atual mantém sync JSON e documenta sugestões com escolha manual. |
| `0dce40d` | `DEV/RUNBOOKS/troubleshooting-vpn.md` | Superado. Quota permanece diagnóstico observacional separado de falhas de túnel. |
| `0dce40d` | `DEV/SPECS/ACTIVE.md` | Superado. Os critérios atuais cobrem sync JSON, recuperação de rede e status de quota. |
| `0dce40d` | `DEV/TESTING.md` | Superado. A cobertura atual substitui critérios de rotação por quota por testes de status, proteção contra replay e sync JSON. |
| `0dce40d` | `DEV/VERIFY.md` | Histórico preservado na origem. As evidências antigas têm versões e políticas distintas dos gates atuais. |
| `0dce40d` | `DEV/WORKLOG.md` | Histórico preservado na origem. Mantido o worklog atual como registro da integração e do release. |
| `0dce40d` | `Makefile` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `README.md` | Superado. Mantidos o baseline atual, sync JSON e retomada manual, com detalhes de escolha de modelo no runbook. |
| `0dce40d` | `compose.windows.yml` | Superado. Mantidos os mounts compartilhados e o helper de sync JSON da versão atual. |
| `0dce40d` | `docker-compose.yml` | Adaptado. Mantidos o sync JSON e o serviço v2. Acrescentados ao observador os helpers comuns de configuração e API. |
| `0dce40d` | `docs/TLDR.md` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `examples/cenarios-avancados.md` | Superado. Exemplos atuais seguem a separação entre quota e recuperação de rede. |
| `0dce40d` | `opencode/v1/vpn-recovery.js` | Superado. Mantidos avisos estruturados e prazo informado, com rotação e reenvio fora da política atual. |
| `0dce40d` | `opencode/v2/vpn-recovery/classify.js` | Já integrado. O mapa atual classifica provider.free-limit de forma estruturada. |
| `0dce40d` | `opencode/v2/vpn-recovery/server-core.js` | Adaptado. O servidor mantém veto de retry. A descoberta de modelos foi reaproveitada como escolha explícita na TUI. |
| `0dce40d` | `opencode/v2/vpn-recovery/tui-core.js` | Adaptado. Notifica o prazo de espera e sugere modelos para escolha manual. |
| `0dce40d` | `scripts/dotenv-read.ps1` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `scripts/dotenv-read.sh` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `scripts/opencode-limit-recover` | Superado. O comando mantém a interface de status com Retry-After, sem troca de IP ou consulta ao provedor. |
| `0dce40d` | `scripts/opencode-supervisor` | Superado. O supervisor atual verifica por exportação da sessão exata. |
| `0dce40d` | `scripts/opencode1` | Adaptado. Preservada a entrada do cliente durante o sync JSON. |
| `0dce40d` | `scripts/opencode2` | Adaptado. Preservada a entrada do cliente durante o sync JSON. |
| `0dce40d` | `scripts/verify-compose` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `scripts/verify-docs` | Superado. A checagem atual exige documentar o comando concreto para retomar pelo ID. |
| `0dce40d` | `scripts/vpn-check` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `scripts/vpn-control-api.sh` | Arquivado. Mesmo conteúdo que o helper de 377397b. |
| `0dce40d` | `scripts/vpn-control-lock.sh` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `scripts/vpn-entrypoint.sh` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `scripts/vpn-hosts-gen` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `scripts/vpn-hosts-import` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `scripts/vpn-opencode` | Superado. O serviço atual exige o launcher gerenciado de v2 em web e serve. |
| `0dce40d` | `scripts/vpn-opencode-processes` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `scripts/vpn-reconnect` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `scripts/vpn-server-rotate` | Já integrado. Diferença apenas de espaço no fim da linha. |
| `0dce40d` | `scripts/vpn-status` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `scripts/vpn-switch` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `scripts/vpn-top` | Já integrado (mesmo conteúdo) |
| `0dce40d` | `scripts/vpn.ps1` | Superado. A versão atual propaga falhas do sync e aplica staging somente depois de um push bem-sucedido. |
| `0dce40d` | `tests/linux/test-scripts.sh` | Adaptado. A suíte atual conserva testes de operação, lock e diagnóstico, e verifica que limites só informam status. |
| `0dce40d` | `tests/opencode/vpn-recovery.test.mjs` | Adaptado. Preservados classificação e prazo de espera. Teste atual cobre sugestões e ausência de rotação, troca de modelo ou replay. |
| `0dce40d` | `tests/windows/vpn.Tests.ps1` | Superado. O teste atual inclui a recusa de aplicar staging antigo após falha do push e conserva as verificações do fluxo Windows. |
