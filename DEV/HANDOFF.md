# Active Handoff

This file should stay small. Refresh it after substantive work or run `orquestrador-maestro compact-worklog`.

## Snapshot

- Updated: 2026-09-17
- Read order: `INDEX.md` -> `HANDOFF.md` -> `CONTEXT.md` -> `SPECS/ACTIVE.md`
- Active spec: `SPECS/ACTIVE.md`
- Verification source: `VERIFY.md`
- Worklog archive: `HANDOFFS/WORKLOG_ARCHIVE.md`

## Latest Work

- Entry: revisão completa lote D (bugfixes + CLI máquina + bumps + hardening).
- Spec: `SPECS/ACTIVE.md` (status: reviewed-and-upgraded; runtime pendente no host/CI).
- Changed: (A) `vpn-top` invertido, `INTERNAL_DNS_RESOLVERS` vazio + modo plain auto, README/stale limpos. (B) `--json`/`-q` em status/check/top, `check` exit 0/1, `opencode stop/status/logs/--detach` + faixa, `--help` ×14, rotate (`--to/--list`, off-by-one, periódica), health leve no auto-reconnect. (C) Node `22.23.2` + OpenCode `1.18.31` + digest jammy (SHAs verificados), CI `24.04`/`checkout@v6`/strict, hardening Compose, `HTTPPROXY` opt-in, higiene local `600` + ignores.
- Verified: estático + fixtures (ver VERIFY.md); sem Docker — runtime e build na CI/host.
- Risks: hardening/limits e bumps exigem `vpn-switch` + build reais; `read_only` adiado; `secrets/` dup + `secrets.zip` a decidir.
- Next context: `vpn-switch` no host (valida plain-DNS nos logs do Gluetun + proxy + hosts + rotate); Desktop App real; supply-chain restante no BACKLOG.

## Recent Entries

- 2026-09-17 — revisão lote D (bugfixes, CLI máquina, bumps, hardening, proxy).
- 2026-09-17 — hosts locais via LOCAL_HOSTS (gen + import + check + travas).
- 2026-09-17 — robustez dos scripts + fechamento dos drifts 29/08 (docs, TESTING, BACKLOG, trava de drift no verify-docs).
- 2026-08-29 — OpenCode 1.18.25 + PATH host-first; SERVER_HOSTNAMES nos perfis de provedor.
- 2026-08-19 — rede interna (LAN/DNS), paridade de home (UID/GID, ssh-agent, /run/user) e `vpn-opencode` implementados; validação de runtime pendente.
- 2026-08-19 — aumento de poderes: IP pós-reconexão, saúde, dashboard, rotação e Gluetun v3.41.3.
- 2026-08-10 — implementação e validação concluídas.