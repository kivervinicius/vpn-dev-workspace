# Current Context

## State

- Project: `vpn-dev-workspace`
- Active handoff: `HANDOFF.md`
- Active spec: `SPECS/ACTIVE.md`
- Update this file when commands, architecture, environment, risks, or active decisions change.

## Commands

- Development Linux/WSL2: `./scripts/vpn-switch <profile>` (ou `./scripts/vpn-switch stop`) e `docker compose -f docker-compose.yml -f profiles/<profile>.yml exec terminal zsh`. Não use `docker compose up` sem perfil. O terminal monta `HOST_HOME_DIR` (padrão: `$HOME` do host) e `WORKSPACE_DIR` nos mesmos caminhos, herda `HOST_UID`/`HOST_GID` e, quando definidos, `SSH_AUTH_SOCK` e `RUN_USER_DIR`.
- Development Windows sem distro WSL: `powershell -ExecutionPolicy Bypass -File .\scripts\vpn.ps1 start <profile>`; use `vpn.ps1 terminal|status|check|top|reconnect|rotate|opencode|hosts-apply|stop`. O override exige Compose >= 2.24.4, monta o projeto em `/workspace`, mantém a home em `vpn_windows_home` e usa a ponte `openssh-ssh-agent`.
- OpenCode GUI: `./scripts/vpn-opencode web|serve` (porta `OPENCODE_GUI_PORT`, padrão `10001`, na `VPN_PORT_RANGE`). Desktop App do host conecta em `http://127.0.0.1:10001` (login `opencode`; senha em `.secrets/opencode_gui_password`). Passo a passo: `RUNBOOKS/opencode-desktop-vpn.md`.
- Tests: `./scripts/verify-docs`, `./scripts/verify-compose`, ShellCheck (CI em `.github/workflows/validate.yml`), `bash -n scripts/*`, `sh -n scripts/vpn-entrypoint.sh`. `verify-docs` também trava drifts (versões, `SERVER_HOSTNAMES`, `PATH` host-first, `INTERNAL_TEST_PORT`).
- Build: `docker build --pull=false .` (com `--build-arg HOST_UID=...`/`HOST_GID=...` se a home do host usa IDs diferentes de 1000)

## Constraints And Risks

- O Gluetun é a única superfície de rede publicada. A faixa TCP padrão é `10000-10100` e o bind padrão é local.
- A recuperação automática usa a API autenticada do Gluetun e não recebe o socket Docker.
- Todos os serviços possuem o perfil Compose interno `vpn`, selecionado pelo `vpn-switch`; isso impede a inicialização do Gluetun sem os segredos do provedor.
- A home integral do host é montada no terminal, em leitura e escrita, para que ele seja uma extensão direta do ambiente local; não selecione uma home de outro usuário.
- Acesso à rede interna é opt-in: `FIREWALL_SUBNETS` (o `vpn-switch` injeta a sub-rede da rota padrão do host somente no Linux nativo; PowerShell e WSL2 exigem valor explícito; inclua a sub-rede do DNS interno se ele apontar fora da LAN), `INTERNAL_DNS` + `INTERNAL_DNS_EXEMPT_HOSTNAMES` (nomes explícitos, sem curingas; deixe `INTERNAL_DNS_RESOLVERS` vazio nesse modo), `INTERNAL_TEST_HOST`/`INTERNAL_TEST_PORT` no `vpn-check`. Não incluir a faixa privada do túnel em `FIREWALL_SUBNETS`.
- Com `SSH_AUTH_SOCK`/`RUN_USER_DIR` definidos, o container lê o agente SSH e a sessão do usuário do host; inicie apenas o seu próprio ambiente.
- O `PATH` do terminal prioriza `${HOST_HOME_DIR}/.opencode/bin` (binário do host reflete de imediato); `OPENCODE_VERSION` no Dockerfile é o fallback.
- `SERVER_HOSTNAMES` (`VPN_SERVER_HOSTNAMES`) vale para todos os perfis de provedor (incl. `protonvpn-wireguard`); `custom-*` usam config própria. Perfis `*-openvpn` aceitam `OPENVPN_PROTOCOL` (udp/tcp).
- O serviço `terminal` usa `init: true` (colhe zumbis de shells/processos filhos).

## Next Context

- Atualizar versões e checksums do Dockerfile somente junto com a respectiva verificação oficial e o build da imagem.
- Rodar na CI ou no host com Docker: `verify-compose`, ShellCheck e build da imagem (Docker indisponível no ambiente de edição em 2026-09-17).
- Validar em Windows real: `vpn.ps1 start` sem distribuição WSL, `ssh-add -l` via ponte, OpenCode, stop/start e home persistente; repetir em WSL2 com `FIREWALL_SUBNETS` explícito.
