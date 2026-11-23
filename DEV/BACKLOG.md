# Backlog

Pendências triadas (dono + prioridade). Regra: todo "Next/Pending" de
`HANDOFF.md`/`VERIFY.md`/`SPECS/ACTIVE.md` tem entrada aqui ou foi
explicitamente descartado.

## Estado atual OpenCode (2026-11-22)

Cross-client session sync está implementado e coberto por conversores sintéticos
e CLI real em homes temporárias: v1 1.19.6 ↔ v2 2.3.2. Provider quota/auth/
rate-limit são status-only; não mudam VPN/modelo nem repetem turnos/ferramentas.
Pendências: executar Pester no Windows e validar mounts SQLite no Docker
Desktop; conexão real do Desktop App à ponta `serve` continua pendente.

## Histórico: auditoria de segurança e fluxo (2026-11-03)

| Achado | Estado | Evidência / pendência |
|---|---|---|
| Histórico público com IPs/hostnames internos | refs locais reescritas; force-push pendente | Usuário escolheu manter público e reescrever. GitHub ainda contém o histórico antigo até atualizar refs; remote foi removido pela ferramenta de rewrite e deve ser restaurado manualmente antes do force-push. |
| Corrida entre `vpn-switch` e mutações automáticas | implementado | `vpn-switch` e `make up/restart/down` usam o lock compartilhado; teste de contenção espera exit 75. |
| Guardas LAN/proxy e atalho Make | implementado | LAN exige senha do painel e, quando proxy ativo, usuário + senha por arquivo; `verify-docs` impede Make de voltar ao Compose direto. |
| Segredos em argv/env | implementado | API/Basic Auth usam `curl --config -` via stdin; Gluetun auth TOML vai a tmpfs; senha do proxy/painel usa arquivo montado. |
| Estado/cooldown antes de primeira conexão | superseded | A política atual não tem recovery por provider nem grava estado de quota; o supervisor age apenas em falha confirmada de rede. |
| Stop por regex ampla | implementado | Matcher compartilhado encerra apenas OpenCode `web|serve` na porta exata, com teste positivo/negativos. |
| `.env`/PowerShell e configuração de exemplo | implementado | Parsers compartilham regras de aspas/comentários/duplicatas; `.env.example` e checklist Windows incluem os campos necessários, incluindo XKIRO. |
| Docs, CI Gluetun e segredos locais | implementado | polling/help/recovery sincronizados; CI constrói `./gluetun`; `secrets.zip` movido para quarentena local fora do repo. |
| Compose/build/Linux VPN ativo | feito 2026-11-03 | `verify-compose` passou nos 8 perfis; rebuild/recreate local e `vpn-check` healthy 6/6. |
| Pester/Windows e Docker Desktop | pendente no ambiente | Pester/runtime Windows não está disponível neste host Linux; validar a publicação de staging e os mounts no Windows CI/host. |

O watcher `opencode-limit-watch` citado em registros antigos foi removido; todas
as menções restantes são históricas, sem referência ativa em Compose/scripts.

| # | Item | Prioridade | Estado |
|---|---|---|---|
| 1 | Conexão real do Desktop App à ponta `serve` (`vpn-opencode serve` + `http://127.0.0.1:10001`) | alta | pendente (runtime no host) |
| 2 | `verify-compose` + ShellCheck + build rodados na CI/host com Docker | alta | feito 2026-10-30 (CI roda os três em todo push/PR; runs `41109075522`/`41118083098` verdes) |
| 3 | Estreitar `VPN_PORT_RANGE` padrão + exigir senha do painel quando bind ≠ `127.0.0.1` | alta | feito 2026-10-30 (`5cf8ecb`: faixa `10000-10010`, proxy `10002`, `OPENCODE_GUI_PASSWORD_FILE` obrigatório em LAN no vpn-switch e vpn.ps1) |
| 4 | Higiene de segredos: ver item 8 | média | feito 2026-10-30: sem `secrets/` duplicado rastreado (`git ls-files` limpo) e `secrets.zip`/`.secrets/` cobertos por `.gitignore`/`.dockerignore` |
| 5 | Limits/logs/fs imutável por serviço (`mem/cpu/pids`, `logging max-size`, `read_only+tmpfs`, `cap_drop`, `no-new-privileges`) | média | parcial 2026-10-30: limits/logging/cap_drop/no-new-privileges em todos os serviços; `read_only+tmpfs` adiado (exige validação runtime com Docker) |
| 6 | Bumps de toolchain | média | feito: Node `22.23.2`, fallback OpenCode v1 `1.19.6` com checksums oficiais, Ubuntu 24.04 e CI `ubuntu-24.04` |
| 8 | Higiene segredos locais (concluído 2026-10-01): `chmod 600`, remoção de `secrets/` legada duplicada, `.gitignore` e `.dockerignore` protegidos | média | feito |
| 9 | Supply-chain: gitleaks/Trivy na CI, Dependabot/Renovate p/ pins, `read_only+tmpfs` | alta | feito 2026-10-30 (gitleaks + trivy jobs na CI, Dependabot actions ativo e docker com ignore de `ubuntu`; `read_only+tmpfs` movido ao #5) |
| 7 | Exemplo avançado opt-ins (LAN/DNS/GUI) + teste mock de DNS/leak | baixa | feito 2026-10-01 (`examples/cenarios-avancados.md`, runbook troubleshooting) |
| 10 | Política de limites OpenCode v1/v2 | alta | atualizado 2026-11-22: eventos estruturados nunca trocam modelo nem repetem turnos. A TUI pode solicitar rotação VPN opt-out com allowlist, cooldown, janela, timeout e lock compartilhado; hooks de servidor só vetam retry. |
| 11 | CRLF no checkout Windows: `.gitattributes` com `* text=auto eol=lf` | média | feito 2026-10-16 |
| 12 | Robustez 2026-10-16: wait da ponte SSH 5s→30s, teste Pester de `WORKSPACE_DIR`, mascaramento de credenciais no `vpn-top --json` + teste na suíte Linux | média | feito 2026-10-16 |
| 13 | Paridade OpenCode host↔container no modo Windows (skills/config via mounts em `compose.windows.yml`; SQLite/sessoes isolados por limitacao do File Sharing) | média | feito 2026-10-16 |
| 14 | Paridade completa da home Windows: `/mnt/host-home` + `vpn-home-link` (symlinks via `WINDOWS_HOME_LINKS`) + snapshot de sessoes do OpenCode no start/stop | média | feito 2026-10-16 |
| 15 | Suíte Linux frágil no host (env puro, portas fixas 10061-10065, `/proc` do host): corrigido com `/usr/bin/env`, porta livre + `VPN_PORT_RANGE` restrita, stub de `docker` e `VPN_SESSION_SYNC_FORCE=1`; 44/44 no host e em container | média | feito 2026-10-21 |
| 16 | CI vermelha desde o `vpn-title-hook.zsh`: SC2148 (ShellCheck não suporta zsh). Workflow exclui `*.zsh` do ShellCheck/`bash -n`, instala zsh e valida com `zsh -n` | alta | feito 2026-10-21 (run `39611786149` verde) |
| 17 | PRs abertos do Dependabot #4 (`checkout@v7`) e #6 (`ubuntu` 25.10): mudanças equivalentes/superadas já no master (`8585f3a`); fechar na UI | baixa | pendente (o token de automação não tem permissão de fechar PRs) |
| 18 | Recreate da stack para publicar a porta de controle 18000 (`VPN_CONTROL_PORT`) no host — scripts de host dependem dela | alta | feito 2026-11-05: `./scripts/vpn-switch nordvpn-openvpn` autorizado pelo mestre; `vpn-check`/`vpn-status`/`vpn-top` validados no host via `127.0.0.1:18000` (segredo `.secrets`); hostnames `br71..br98` restaurados no runtime do Gluetun; bug latente `{{.Service}}` do `vpn-top` no host corrigido (`{{.Names}}`) |

Descartados: nenhum. "ShellCheck na CI" saiu daqui — já existe em
`.github/workflows/validate.yml:16-19` (era pendência fantasma).
