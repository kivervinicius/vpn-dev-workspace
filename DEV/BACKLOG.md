# Backlog

Pendências triadas (dono + prioridade). Regra: todo "Next/Pending" de
`HANDOFF.md`/`VERIFY.md`/`SPECS/ACTIVE.md` tem entrada aqui ou foi
explicitamente descartado.

| # | Item | Prioridade | Estado |
|---|---|---|---|
| 1 | Conexão real do Desktop App à ponta `serve` (`vpn-opencode serve` + `http://127.0.0.1:10001`) | alta | pendente (runtime no host) |
| 2 | `verify-compose` + ShellCheck + build rodados na CI/host com Docker (indisponível no ambiente de edição em 2026-09-17) | alta | pendente |
| 3 | Estreitar `VPN_PORT_RANGE` padrão (hoje 101 portas) + exigir senha do painel quando bind ≠ `127.0.0.1` | média | proposto (fase 2 segurança) |
| 4 | Higiene de segredos: ver item 8 (parcial; falta remover `secrets/` dup e decidir `secrets.zip`) | média | ver 8 |
| 5 | Limits/logs/fs imutável por serviço (`mem/cpu/pids`, `logging max-size`, `read_only+tmpfs`, `cap_drop`, `no-new-privileges`) | média | proposto (fase 2 segurança) |
| 6 | Bumps (feito 2026-09-17): Node `22.17.1` → `22.23.2`, OpenCode `1.18.25` → `1.18.31`, digest jammy refresh, CI `ubuntu-24.04` + `checkout@v6` + `build --pull` | média | feito |
| 8 | Higiene segredos locais (feito 2026-09-17): `chmod 600`, `.gitignore` += `secrets/`, `.dockerignore` += `secrets* .hosts.local.gen *.deb`; FALTA decidir: remover `secrets/` duplicado e destino de `secrets.zip` | média | parcial |
| 9 | Supply-chain restante: gitleaks/Trivy na CI, Dependabot/Renovate p/ pins, `read_only+tmpfs` (adiado: exige validação runtime), estreitar `VPN_PORT_RANGE` | média | proposto |
| 7 | Exemplo avançado opt-ins (LAN/DNS/GUI) + teste mock de DNS/leak | baixa | proposto |

Descartados: nenhum. "ShellCheck na CI" saiu daqui — já existe em
`.github/workflows/validate.yml:16-19` (era pendência fantasma).
