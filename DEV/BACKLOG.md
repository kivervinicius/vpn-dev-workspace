# Backlog

Pendências triadas (dono + prioridade). Regra: todo "Next/Pending" de
`HANDOFF.md`/`VERIFY.md`/`SPECS/ACTIVE.md` tem entrada aqui ou foi
explicitamente descartado.

| # | Item | Prioridade | Estado |
|---|---|---|---|
| 1 | Conexão real do Desktop App à ponta `serve` (`vpn-opencode serve` + `http://127.0.0.1:10001`) | alta | pendente (runtime no host) |
| 2 | `verify-compose` + ShellCheck + build rodados na CI/host com Docker (indisponível no ambiente de edição em 2026-09-17) | alta | pendente |
| 3 | Estreitar `VPN_PORT_RANGE` padrão (hoje 101 portas) + exigir senha do painel quando bind ≠ `127.0.0.1` | média | proposto (fase 2 segurança) |
| 4 | Higiene de segredos: `chmod 600 .secrets/* .env`, remover `secrets/` duplicado, decidir destino de `secrets.zip`, `.dockerignore` += `secrets*` | média | proposto (fase 2 segurança) |
| 5 | Limits/logs/fs imutável por serviço (`mem/cpu/pids`, `logging max-size`, `read_only+tmpfs`, `cap_drop`, `no-new-privileges`) | média | proposto (fase 2 segurança) |
| 6 | Bumps: Node `22.17.1` → `22.22+/22.23.x`, OpenCode `1.18.25` → `1.18.27+`, CI `ubuntu-22.04` → `24.04`, `docker build --pull` | média | proposto (fase 2 versionamento) |
| 7 | Exemplo avançado opt-ins (LAN/DNS/GUI) + teste mock de DNS/leak | baixa | proposto |

Descartados: nenhum. "ShellCheck na CI" saiu daqui — já existe em
`.github/workflows/validate.yml:16-19` (era pendência fantasma).
