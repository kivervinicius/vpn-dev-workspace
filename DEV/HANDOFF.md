# Active Handoff

This file should stay small. Refresh it after substantive work or run `orquestrador-maestro compact-worklog`.

## Snapshot

- Updated: 2026-09-19
- Read order: `INDEX.md` -> `HANDOFF.md` -> `CONTEXT.md` -> `SPECS/ACTIVE.md`
- Active spec: `SPECS/ACTIVE.md`
- Verification source: `VERIFY.md`
- Worklog archive: `HANDOFFS/WORKLOG_ARCHIVE.md`

## Latest Work

- Current: falha recorrente de secrets/hardening corrigida; `vpn-switch` agora
  recria o ambiente e oferece `stop|down`. Runtime Linux passou com os três
  serviços saudáveis, IP público, DNS e hosts locais; Windows/WSL2 continuam
  pendentes. Consulte `VERIFY.md`.

- Entry: correção das capabilities necessárias ao Gluetun e lifecycle pelo script.
- Spec: `SPECS/ACTIVE.md` (status: reviewed-and-upgraded; runtime pendente no host/CI).
- Changed: `vpn` mantém `cap_drop: ALL` e adiciona somente as capabilities mínimas observadas (`DAC_READ_SEARCH`, `DAC_OVERRIDE`, `CHOWN`, `SETUID`, `SETGID`); `vpn-switch`/`vpn.ps1` forçam recreate; `vpn-switch stop|down` encerra o projeto; `verify-compose` valida o conjunto.
- Verified: checks estáticos e oito perfis passaram; `vpn-switch nordvpn-openvpn`, `vpn-status --json` e `vpn-check --json` passaram no Linux.
- Risks: ShellCheck local indisponível; Windows/WSL2 e demais smoke tests continuam pendentes.
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
