# Current Context

## State

- Project: `vpn-dev-workspace`
- Active handoff: `HANDOFF.md`
- Active spec: `SPECS/ACTIVE.md`
- Update this file when commands, architecture, environment, risks, or active decisions change.

## Commands

- Development Linux/WSL2: `./scripts/vpn-switch <profile>` (ou `./scripts/vpn-switch stop`) e `docker compose -f docker-compose.yml -f profiles/<profile>.yml exec terminal zsh`. Não use `docker compose up` sem perfil. O terminal monta `HOST_HOME_DIR` (padrão: `$HOME` do host) e `WORKSPACE_DIR` nos mesmos caminhos, herda `HOST_UID`/`HOST_GID` e, quando definidos, `SSH_AUTH_SOCK` e `RUN_USER_DIR`.
- Development Windows sem distro WSL: `powershell -ExecutionPolicy Bypass -File .\scripts\vpn.ps1 start <profile>`; use `vpn.ps1 terminal|status|check|top|reconnect|rotate|opencode|hosts-apply|stop`. O override exige Compose >= 2.24.4, monta o projeto em `/workspace`, mantém a home em `vpn_windows_home` e usa a ponte `openssh-ssh-agent`. A paridade do OpenCode linka todo o `~/.config/opencode` (exceto `node_modules`) + `auth.json` via `WINDOWS_OPENCODE_FULL_LINKS=true` (padrão).
- OpenCode GUI: `./scripts/vpn-opencode web|serve|check|watch` (porta `OPENCODE_GUI_PORT`, padrão `10001`, na `VPN_PORT_RANGE`; `check`=ok|down|quota e é observacional; `watch` inicia o supervisor persistente). Desktop App do host conecta em `http://127.0.0.1:10001` (login `opencode`; senha em `.secrets/opencode_gui_password`). Passo a passo: `RUNBOOKS/opencode-desktop-vpn.md`.
- Rotação de servidor: `vpn-server-rotate [--to <host>|--random|--countries "Brazil,Argentina,Chile"|--list]`; `--countries` limpa os hostnames e deixa o Gluetun escolher entre os países. Para rotação entre países via `.env`, use `VPN_COUNTRY` com vírgulas e `VPN_SERVER_HOSTNAMES=` vazio.
- OpenCode v1/v2: `opencode2` (v2.1.3, home compartilhada) e `opencode1` (v1.19.5, dados isolados em `~/.opencode-v1`; auth copiado uma vez). Launchers do host executam no terminal pela VPN e recusam iniciar se o túnel estiver unhealthy; sessões **não** são sincronizáveis (export/import v2→v1 falha por schema). Ver `RUNBOOKS/opencode-v1-v2.md`.
- Atualizações: `opencode-update --check|--apply` (v1 = GitHub 1.x; v2 = npm `@opencode/cli`); timer systemd do usuário `opencode-update.timer` roda diariamente; log em `~/.local/state/opencode-update.log`.
- Histórico v2→v1: `opencode1-import-v2` copia um snapshot consistente (`VACUUM INTO`) do banco do v2 para o home do v1 (o v1.19.5 lê o schema do v2). É unidirecional: rode de novo para trazer sessões novas; o que fizer no v1 não volta ao v2.
- OpenCode v1/v2: `opencode1`/`opencode2` executam no container pela VPN. `scripts/opencode-vpn-install` instala os launchers e o plugin `vpn-recovery` nos diretórios globais das versões.
- Recuperação por limite considera somente eventos/campos estruturados: free-tier e HTTP 429/rate-limit trocam servidor/IP automaticamente; conta e crédito nunca alteram VPN. Texto arbitrário e logs nunca são gatilhos.
- A tentativa requer túnel running, IP público válido diferente, e lock compartilhado. Política: cooldown 300 s, máximo 6 eventos em janela móvel de 3600 s e até 3 alvos por evento; timeout de helper 600 s. É best effort e não garante reset da quota. Nenhum prompt é reenviado.
- Em v1, retry só recupera após abort confirmado; erro terminal estruturado não precisa abort. Em v2, o hook do servidor veta retry classificado e somente um gatilho `session.execution.failed` da TUI recupera; headless não tem recuperação TUI. `vpn-opencode check` é observacional; supervisor recupera somente falha real de rede/túnel.
- Tests: `./scripts/verify-docs`, `./scripts/verify-compose`, ShellCheck (CI em `.github/workflows/validate.yml`), `bash -n scripts/*`, `sh -n scripts/vpn-entrypoint.sh`, suite `tests/linux/test-scripts.sh` (45 testes; host-safe — `/usr/bin/env`, portas TCP livres 20000-20100 com `VPN_PORT_RANGE` restrita e stub de `docker`; bloco HTTP exige `socat`, pulado com aviso sem ele) e `node --test tests/opencode/*.test.mjs` (8 testes).
- Build: `docker build --pull=false .` (com `--build-arg HOST_UID=...`/`HOST_GID=...` se a home do host usa IDs diferentes de 1000)

## Constraints And Risks

- O Gluetun é a única superfície de rede publicada. A faixa TCP padrão é `10000-10010` (estreita; `10001` painel, `10002` proxy) e o bind padrão é local; bind em LAN exige `OPENCODE_GUI_PASSWORD_FILE`.
- A recuperação automática usa a API autenticada do Gluetun e não recebe o socket Docker.
- Todos os serviços possuem o perfil Compose interno `vpn`, selecionado pelo `vpn-switch`; isso impede a inicialização do Gluetun sem os segredos do provedor.
- A home integral do host é montada no terminal, em leitura e escrita, para que ele seja uma extensão direta do ambiente local; não selecione uma home de outro usuário.
- Acesso à rede interna é opt-in: `FIREWALL_SUBNETS` (o `vpn-switch` injeta a sub-rede da rota padrão do host somente no Linux nativo; PowerShell e WSL2 exigem valor explícito; inclua a sub-rede do DNS interno se ele apontar fora da LAN), `INTERNAL_DNS` + `INTERNAL_DNS_EXEMPT_HOSTNAMES` (nomes explícitos, sem curingas; deixe `INTERNAL_DNS_RESOLVERS` vazio nesse modo), `INTERNAL_TEST_HOST`/`INTERNAL_TEST_PORT` no `vpn-check`. Não incluir a faixa privada do túnel em `FIREWALL_SUBNETS`.
- Com `SSH_AUTH_SOCK`/`RUN_USER_DIR` definidos, o container lê o agente SSH e a sessão do usuário do host; inicie apenas o seu próprio ambiente.
- O `PATH` do terminal prioriza `${HOST_HOME_DIR}/.opencode/bin` (binário do host reflete de imediato); `OPENCODE_VERSION` no Dockerfile é o fallback.
- `SERVER_HOSTNAMES` (`VPN_SERVER_HOSTNAMES`) vale para todos os perfis de provedor (incl. `protonvpn-wireguard`); `custom-*` usam config própria. Perfis `*-openvpn` aceitam `OPENVPN_PROTOCOL` (udp/tcp).
- O serviço `terminal` usa `init: true` (colhe zumbis de shells/processos filhos).

## Historical Context (2026-10-16 snapshot; not current verification)

- The following verification/remaining-work notes are historical handoff records from that date; they are not evidence for the current OpenCode recovery change.
- OpenCode: adapter tests, Linux suite, `verify-docs`, `verify-compose`, changed shell syntax, Docker build, VPN health and launcher/plugin smoke passed. ShellCheck remains CI-only; no live provider limit or VPN outage was induced, and no toast was viewed interactively.
- Remaining at that time: validate Windows/WSL2 launchers and observe a notification in a real TUI without generating a live quota event.
