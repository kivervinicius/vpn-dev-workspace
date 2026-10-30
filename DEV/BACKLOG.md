# Backlog

Pendências triadas (dono + prioridade). Regra: todo "Next/Pending" de
`HANDOFF.md`/`VERIFY.md`/`SPECS/ACTIVE.md` tem entrada aqui ou foi
explicitamente descartado.

| # | Item | Prioridade | Estado |
|---|---|---|---|
| 1 | Conexão real do Desktop App à ponta `serve` (`vpn-opencode serve` + `http://127.0.0.1:10001`) | alta | pendente (runtime no host) |
| 2 | `verify-compose` + ShellCheck + build rodados na CI/host com Docker | alta | feito 2026-10-30 (CI roda os três em todo push/PR; runs `41109075522`/`41118083098` verdes) |
| 3 | Estreitar `VPN_PORT_RANGE` padrão + exigir senha do painel quando bind ≠ `127.0.0.1` | alta | feito 2026-10-30 (`5cf8ecb`: faixa `10000-10010`, proxy `10002`, `OPENCODE_GUI_PASSWORD_FILE` obrigatório em LAN no vpn-switch e vpn.ps1) |
| 4 | Higiene de segredos: ver item 8 | média | feito 2026-10-30: sem `secrets/` duplicado rastreado (`git ls-files` limpo) e `secrets.zip`/`.secrets/` cobertos por `.gitignore`/`.dockerignore` |
| 5 | Limits/logs/fs imutável por serviço (`mem/cpu/pids`, `logging max-size`, `read_only+tmpfs`, `cap_drop`, `no-new-privileges`) | média | parcial 2026-10-30: limits/logging/cap_drop/no-new-privileges em todos os serviços; `read_only+tmpfs` adiado (exige validação runtime com Docker) |
| 6 | Bumps (feito 2026-09-17): Node `22.17.1` → `22.23.2`, OpenCode `1.18.25` → `1.18.31`, digest jammy refresh, CI `ubuntu-24.04` + `checkout@v6` + `build --pull` | média | feito |
| 8 | Higiene segredos locais (concluído 2026-10-01): `chmod 600`, remoção de `secrets/` legada duplicada, `.gitignore` e `.dockerignore` protegidos | média | feito |
| 9 | Supply-chain: gitleaks/Trivy na CI, Dependabot/Renovate p/ pins, `read_only+tmpfs` | alta | feito 2026-10-30 (gitleaks + trivy jobs na CI, Dependabot actions ativo e docker com ignore de `ubuntu`; `read_only+tmpfs` movido ao #5) |
| 7 | Exemplo avançado opt-ins (LAN/DNS/GUI) + teste mock de DNS/leak | baixa | feito 2026-10-01 (`examples/cenarios-avancados.md`, runbook troubleshooting) |
| 10 | OpenCode usage limits + `OPENCODE_LIMIT_HOOK` | média | superseded: structured v1/v2 notifications; quota/429 never mutate VPN |
| 11 | CRLF no checkout Windows: `.gitattributes` com `* text=auto eol=lf` | média | feito 2026-10-16 |
| 12 | Robustez 2026-10-16: wait da ponte SSH 5s→30s, teste Pester de `WORKSPACE_DIR`, mascaramento de credenciais no `vpn-top --json` + teste na suíte Linux | média | feito 2026-10-16 |
| 13 | Paridade OpenCode host↔container no modo Windows (skills/config via mounts em `compose.windows.yml`; SQLite/sessoes isolados por limitacao do File Sharing) | média | feito 2026-10-16 |
| 14 | Paridade completa da home Windows: `/mnt/host-home` + `vpn-home-link` (symlinks via `WINDOWS_HOME_LINKS`) + snapshot de sessoes do OpenCode no start/stop | média | feito 2026-10-16 |
| 15 | Suíte Linux frágil no host (env puro, portas fixas 10061-10065, `/proc` do host): corrigido com `/usr/bin/env`, porta livre + `VPN_PORT_RANGE` restrita, stub de `docker` e `VPN_SESSION_SYNC_FORCE=1`; 44/44 no host e em container | média | feito 2026-10-21 |
| 16 | CI vermelha desde o `vpn-title-hook.zsh`: SC2148 (ShellCheck não suporta zsh). Workflow exclui `*.zsh` do ShellCheck/`bash -n`, instala zsh e valida com `zsh -n` | alta | feito 2026-10-21 (run `39611786149` verde) |
| 17 | PRs abertos do Dependabot #4 (`checkout@v7`) e #6 (`ubuntu` 25.10): mudanças equivalentes/superadas já no master (`8585f3a`); fechar na UI | baixa | pendente (o token de automação não tem permissão de fechar PRs) |

Descartados: nenhum. "ShellCheck na CI" saiu daqui — já existe em
`.github/workflows/validate.yml:16-19` (era pendência fantasma).
