# Active Handoff

This file should stay small. Refresh it after substantive work or run `orquestrador-maestro compact-worklog`.

## Snapshot

- Updated: 2026-09-17
- Read order: `INDEX.md` -> `HANDOFF.md` -> `CONTEXT.md` -> `SPECS/ACTIVE.md`
- Active spec: `SPECS/ACTIVE.md`
- Verification source: `VERIFY.md`
- Worklog archive: `HANDOFFS/WORKLOG_ARCHIVE.md`

## Latest Work

- Entry: hosts locais via LOCAL_HOSTS (extra_hosts no túnel).
- Spec: `SPECS/ACTIVE.md` (status: +local-hosts-mapping; runtime com túnel real pendente no host).
- Changed: `vpn-hosts-gen` valida + gera snippet `.hosts.local.gen`; novo `vpn-hosts-apply` injeta no `/etc/hosts` via `docker exec -u 0` pós-up (rev. 2: `extra_hosts` rejeitado pelo daemon com `network_mode`); `vpn-switch` gera + aplica; `vpn-hosts-import --domain`; `vpn-check` valida cada `nome=ip`; `LOCAL_HOSTS` no Compose; `.env.example` + README; travas `verify-docs`; `verify-compose` valida snippet + dry-run.
- Verified: `bash -n`, `./scripts/verify-docs`, `git diff --check` + fixtures (gen/import/check); sem Docker local — `verify-compose`/build/ShellCheck na CI.
- Risks: IP da LAN muda → mapeamento stale (re-sync via import); nome resolve mas alcance exige `FIREWALL_SUBNETS`.
- Next context: no host — `LOCAL_HOSTS=gitlab.omega=<ip>` no `.env`, `vpn-switch`, `getent hosts gitlab.omega` no terminal + `vpn-check`; Desktop App real; `verify-compose` + ShellCheck na CI.

## Recent Entries

- 2026-09-17 — hosts locais via LOCAL_HOSTS (gen + import + check + travas).
- 2026-09-17 — robustez dos scripts + fechamento dos drifts 29/08 (docs, TESTING, BACKLOG, trava de drift no verify-docs).
- 2026-08-29 — OpenCode 1.18.25 + PATH host-first; SERVER_HOSTNAMES nos perfis de provedor.
- 2026-08-19 — rede interna (LAN/DNS), paridade de home (UID/GID, ssh-agent, /run/user) e `vpn-opencode` implementados; validação de runtime pendente.
- 2026-08-19 — aumento de poderes: IP pós-reconexão, saúde, dashboard, rotação e Gluetun v3.41.3.
- 2026-08-10 — implementação e validação concluídas.