# Active Handoff

This file should stay small. Refresh it after substantive work or run `orquestrador-maestro compact-worklog`.

## Snapshot

- Updated: 2026-10-01
- Read order: `INDEX.md` -> `HANDOFF.md` -> `CONTEXT.md` -> `SPECS/ACTIVE.md`
- Active spec: `SPECS/ACTIVE.md`
- Verification source: `VERIFY.md`
- Worklog archive: `HANDOFFS/WORKLOG_ARCHIVE.md`

## Latest Work

- Current: implementação das melhorias gerais aprovadas no plano de evolução do workspace:
  1. Hardening de código: fallback dinâmico de `PATH` no `docker-compose.yml`, eliminação de `secrets/` legado (item #8 do backlog).
  2. Testes e diagnóstico: ferramenta unificada `scripts/vpn-doctor` com `--json` e `--fix`; suíte automatizada `tests/linux/test-scripts.sh` (30 testes) e inclusão no CI GitHub Actions.
  3. Documentação & DX: runbook `DEV/RUNBOOKS/troubleshooting-vpn.md`, guia `examples/cenarios-avancados.md`, assistente `scripts/vpn-setup`, `Makefile` na raiz e diagrama Mermaid na arquitetura.
  Toda a suíte de verificação (`make verify`: compose, docs, testes linux) passou com 100% de sucesso.

- Previous: diagnóstico e resolução de loop de reconexão na VPN (NordVPN OpenVPN)
  e melhorias preventivas. O protocolo TCP com porta 443 padrão causava `Connection reset`
  imediato na NordVPN, somado a hostnames antigos na lista de servidores. Adicionado
  repasse de `OPENVPN_ENDPOINT_PORT` nos perfis OpenVPN, validação preventiva de DNS
  de servidores e aviso de porta TCP no `vpn-switch`. Com `OPENVPN_PROTOCOL=udp`, a
  VPN conecta de imediato e passa 100% nas validações (`vpn-status`, `vpn-check`, `vpn-reconnect`).

- Entry: adição de `KILL` capability ao Gluetun para sinalizar e parar OpenVPN na reconexão.
- Spec: `SPECS/ACTIVE.md` (status: reviewed-and-upgraded; runtime Linux validado; Windows/WSL2 pendentes).
- Changed: `vpn` adiciona capability `KILL` ao `cap_add` em `docker-compose.yml`; `scripts/verify-compose` trava a presença de `KILL` em todos os perfis.
- Verified: `verify-compose` e `verify-docs` passaram; `vpn-switch nordvpn-openvpn` recriou contêineres saudáveis; `vpn-reconnect` executado duas vezes com sucesso e novo IP atribuído em ~9s; `vpn-status` e `vpn-check` aprovados.
- Risks: ShellCheck local indisponível; Windows/WSL2 continuam pendentes de validação real.
- Next context: validar Windows/WSL2 e executar os smoke tests restantes.

## Recent Entries

- Current implementation: `compose.windows.yml` + `scripts/vpn.ps1` provide the
  Docker Desktop path without a WSL distribution; the SSH bridge uses the
  Windows named pipe and a temporary token, while WSL2 explicitly requires
  `FIREWALL_SUBNETS` for LAN access.
- 2026-09-18 — suporte Windows PowerShell/WSL2 implementado; runtime Windows pendente.

- 2026-09-17 — revisão lote D (bugfixes, CLI máquina, bumps, hardening, proxy).
- 2026-09-17 — hosts locais via LOCAL_HOSTS (gen + import + check + travas).
- 2026-09-17 — robustez dos scripts + fechamento dos drifts 29/08 (docs, TESTING, BACKLOG, trava de drift no verify-docs).
- 2026-08-29 — OpenCode 1.18.25 + PATH host-first; SERVER_HOSTNAMES nos perfis de provedor.
- 2026-08-19 — rede interna (LAN/DNS), paridade de home (UID/GID, ssh-agent, /run/user) e `vpn-opencode` implementados; validação de runtime pendente.
- 2026-08-19 — aumento de poderes: IP pós-reconexão, saúde, dashboard, rotação e Gluetun v3.41.3.
- 2026-08-10 — implementação e validação concluídas.
