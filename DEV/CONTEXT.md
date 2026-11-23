# Current Context

A reintegração Linux foi consolidada na preparação da release 1.2.0. Consulte o [handoff](HANDOFF.md) e o [plano](SPECS/PLAN-REINTEGRACAO.md).

## State

- Project: `vpn-dev-workspace`
- Active handoff: `HANDOFF.md`
- Active spec: `SPECS/ACTIVE.md`
- Local corrections for 1.3.0 are validated on Linux; exact evidence and
  release/cutover constraints are in `VERIFY.md` and `HANDOFF.md`.
- Release 1.2.0 is published from commit `2210100`; all four GitHub Actions jobs passed. The active Docker runtime is the existing installation and was not redeployed. See `HANDOFF.md` for release and
  recovery state.
- The `vpn-dev-workspace` Compose project runs from this main checkout at
  `/projetos/vpn-dev-workspace`; Gluetun and auto-reconnect are healthy, and
  host and container `vpn-check` passed. Local image aliases use `:1.1.0`;
  rollback tags and preserved workspace changes are recorded in `HANDOFF.md`.
- Windows Pester passed in CI. Real Docker Desktop SQLite staging still
  requires a Windows host before claiming that runtime path validated.
- `/tmp/vpn-v1v2-integration` remains an inactive checkout because it has
  ignored local generated host data and a lock file; the Compose runtime uses
  the main checkout.
- Update this file when commands, architecture, environment, risks, or active decisions change.

## Commands

- Development Linux/WSL2: `./scripts/vpn-switch <profile>` (ou `./scripts/vpn-switch stop`) e `docker compose -f docker-compose.yml -f profiles/<profile>.yml exec terminal zsh`. Não use `docker compose up` sem perfil. O terminal monta `HOST_HOME_DIR` (padrão: `$HOME` do host) e `WORKSPACE_DIR` nos mesmos caminhos, herda `HOST_UID`/`HOST_GID` e, quando definidos, `SSH_AUTH_SOCK` e `RUN_USER_DIR`.
- Development Windows sem distro WSL: `powershell -ExecutionPolicy Bypass -File .\scripts\vpn.ps1 start <profile>`; use `vpn.ps1 terminal|status|check|top|reconnect|rotate|opencode|hosts-apply|stop`. O override exige Compose >= 2.24.4, monta o projeto em `/workspace`, mantém a home em `vpn_windows_home` e usa a ponte `openssh-ssh-agent`. A paridade do OpenCode linka todo o `~/.config/opencode` (exceto `node_modules`) + `auth.json` via `WINDOWS_OPENCODE_FULL_LINKS=true` (padrão).
- OpenCode GUI: `./scripts/vpn-opencode web|serve|check|watch` (porta `OPENCODE_GUI_PORT`, padrão `10001`, na `VPN_PORT_RANGE`; `check`=ok|down|quota e é observacional; `watch` inicia o supervisor persistente). Desktop App do host conecta em `http://127.0.0.1:10001` (login `opencode`; senha em `.secrets/opencode_gui_password`). Passo a passo: `RUNBOOKS/opencode-desktop-vpn.md`.
- Rotação de servidor: `vpn-server-rotate [--to <host>|--random|--countries "Brazil,Argentina,Chile"|--list]`; `--countries` limpa os hostnames e deixa o Gluetun escolher entre os países. Para rotação entre países via `.env`, use `VPN_COUNTRY` com vírgulas e `VPN_SERVER_HOSTNAMES=` vazio.
- OpenCode v1/v2: baseline testado v1 **1.19.6** e v2 **2.3.2**. `opencode1` mantém dados isolados em `~/.opencode-v1`; `opencode2` usa a home compartilhada. Launchers interativos sincronizam sessões recentes da workspace usando export/import JSON nativo e IDs vinculados; conteúdo não suportado fica pendente sem perda. Ver `RUNBOOKS/opencode-v1-v2.md`.
- Atualizações: `opencode-update --check|--apply` (v1 = GitHub 1.x; v2 = npm `@opencode/cli`); timer systemd do usuário `opencode-update.timer` roda diariamente; log em `~/.local/state/opencode-update.log`.
- `opencode1`/`opencode2` executam no container pela VPN. `scripts/opencode-vpn-install` instala launchers, o helper `opencode-session-sync` e plugins de status do provider.
- Limites do provider não alteram modelo nem repetem prompt/ferramenta. A TUI reinicia o perfil VPN atual ao receber erro estruturado `rate_limit`/HTTP 429; outros limites só reconectam se Gluetun confirmar `status=stopped`. `Retry-After` continua informativo.
- Windows usa sincronização separada do SQLite v2 host/container via staging;
  falhas de push retornam status não-zero e não aplicam staging anterior. Pester
  e staging SQLite real no Docker Desktop ainda exigem um host Windows; isso não
  bloqueia o uso inicial Linux-first.
- Tests: `./scripts/verify-docs`, `./scripts/verify-compose`, ShellCheck (CI em `.github/workflows/validate.yml`), `bash -n scripts/*`, `sh -n scripts/vpn-entrypoint.sh`, `tests/linux/test-scripts.sh`, `node --test tests/opencode/*.test.mjs tests/control/*.test.cjs` e `pwsh`/Pester em Windows.
- Build: `docker build --pull=false .` (com `--build-arg HOST_UID=...`/`HOST_GID=...` se a home do host usa IDs diferentes de 1000)

## Constraints And Risks

- O remote `origin` aponta para `https://github.com/kivervinicius/vpn-dev-workspace.git` (repo público). A promoção autorizada da 1.1.0 foi fast-forward para `master`; o antigo `master` local e as alterações de trabalho permanecem preservados conforme registrado em `HANDOFF.md`.
- O Gluetun é a única superfície de rede publicada. A faixa TCP padrão é `10000-10010` (estreita; `10001` painel, `10002` proxy) e o bind padrão é local; bind em LAN exige `OPENCODE_GUI_PASSWORD_FILE`.
- A recuperação automática usa a API autenticada do Gluetun e não recebe o socket Docker.
- Todos os serviços possuem o perfil Compose interno `vpn`, selecionado pelo `vpn-switch`; isso impede a inicialização do Gluetun sem os segredos do provedor.
- A home integral do host é montada no terminal, em leitura e escrita, para que ele seja uma extensão direta do ambiente local; não selecione uma home de outro usuário.
- Acesso à rede interna é opt-in: `FIREWALL_SUBNETS` (o `vpn-switch` injeta a sub-rede da rota padrão do host somente no Linux nativo; PowerShell e WSL2 exigem valor explícito; inclua a sub-rede do DNS interno se ele apontar fora da LAN), `INTERNAL_DNS` + `INTERNAL_DNS_EXEMPT_HOSTNAMES` (nomes explícitos, sem curingas; deixe `INTERNAL_DNS_RESOLVERS` vazio nesse modo), `INTERNAL_TEST_HOST`/`INTERNAL_TEST_PORT` no `vpn-check`. Não incluir a faixa privada do túnel em `FIREWALL_SUBNETS`.
- Com `SSH_AUTH_SOCK`/`RUN_USER_DIR` definidos, o container lê o agente SSH e a sessão do usuário do host; inicie apenas o seu próprio ambiente.
- O `PATH` do terminal prioriza `${HOST_HOME_DIR}/.opencode/bin` (binário do host reflete de imediato); `OPENCODE_VERSION=1.19.6` no Dockerfile é o fallback verificado.
- `SERVER_HOSTNAMES` (`VPN_SERVER_HOSTNAMES`) vale para todos os perfis de provedor (incl. `protonvpn-wireguard`); `custom-*` usam config própria. Perfis `*-openvpn` aceitam `OPENVPN_PROTOCOL` (udp/tcp).
- O serviço `terminal` usa `init: true` (colhe zumbis de shells/processos filhos).

## Historical Context (2026-10-16 snapshot; not current verification)

- The following verification/remaining-work notes are historical handoff records from that date; they are not evidence for the current OpenCode recovery change.
- OpenCode: adapter tests, Linux suite, `verify-docs`, `verify-compose`, changed shell syntax, Docker build, VPN health and launcher/plugin smoke passed. ShellCheck remains CI-only; no live provider limit or VPN outage was induced, and no toast was viewed interactively.
- Remaining at that time: validate Windows/WSL2 launchers and observe a notification in a real TUI without generating a live quota event.
