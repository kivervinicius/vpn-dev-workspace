# Active Handoff

This file should stay small. Refresh it after substantive work or run `orquestrador-maestro compact-worklog`.

## Snapshot

- Updated: 2026-08-19
- Read order: `INDEX.md` -> `HANDOFF.md` -> `CONTEXT.md` -> `SPECS/ACTIVE.md`
- Active spec: `SPECS/ACTIVE.md`
- Verification source: `VERIFY.md`
- Worklog archive: `HANDOFFS/WORKLOG_ARCHIVE.md`

## Latest Work

- Entry: runbook dos passos práticos (Desktop/Web pela VPN).
- Spec: `SPECS/ACTIVE.md` (status: implemented-and-runtime-validated).
- Changed: `DEV/RUNBOOKS/opencode-desktop-vpn.md` criado; README com seção "Conectar o Desktop App (passo a passo)"; `DEV/INDEX.md` atualizado.
- Verified: `verify-docs`, `bash -n`, `git diff --check`.
- Risks: Desktop do host e servidor do container precisam da mesma versão (tela branca se divergirem); atualização do Desktop é manual via `.deb` (sem apt repo).
- Next context: conectar o Desktop App em `http://127.0.0.1:10001` (`vpn-opencode serve`, login `opencode` + senha de `.secrets/opencode_gui_password`); manter `VPN_SERVER_HOSTNAMES` preenchido se a rotação aleatória reincidir; ShellCheck na CI.

## Recent Entries

- 2026-08-19 — rede interna (LAN/DNS), paridade de home (UID/GID, ssh-agent, /run/user) e `vpn-opencode` implementados; validação de runtime pendente.
- 2026-08-19 — aumento de poderes: IP pós-reconexão, saúde, dashboard, rotação e Gluetun v3.41.3.
- 2026-08-10 — implementação e validação concluídas.