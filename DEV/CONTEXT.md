# Current Context

## State

- Project: `vpn-dev-workspace`
- Active handoff: `HANDOFF.md`
- Active spec: `SPECS/ACTIVE.md`
- Update this file when commands, architecture, environment, risks, or active decisions change.

## Commands

- Development: `./scripts/vpn-switch <profile>` e `docker compose -f docker-compose.yml -f profiles/<profile>.yml exec terminal zsh`. Não use `docker compose up` sem perfil. O terminal monta `HOST_HOME_DIR` (padrão: `$HOME` do host) e `WORKSPACE_DIR` nos mesmos caminhos, herda `HOST_UID`/`HOST_GID` e, quando definidos, `SSH_AUTH_SOCK` e `RUN_USER_DIR`.
- OpenCode GUI: `./scripts/vpn-opencode web|serve` (porta `OPENCODE_GUI_PORT`, padrão `10001`, na `VPN_PORT_RANGE`). Desktop App do host conecta em `http://127.0.0.1:10001` (login `opencode`; senha em `.secrets/opencode_gui_password`). Passo a passo: `RUNBOOKS/opencode-desktop-vpn.md`.
- Tests: `./scripts/verify-docs`, `./scripts/verify-compose`, ShellCheck (CI), `bash -n scripts/*`, `sh -n scripts/vpn-entrypoint.sh`
- Build: `docker build --pull=false .` (com `--build-arg HOST_UID=...`/`HOST_GID=...` se a home do host usa IDs diferentes de 1000)

## Constraints And Risks

- O Gluetun é a única superfície de rede publicada. A faixa TCP padrão é `10000-10100` e o bind padrão é local.
- A recuperação automática usa a API autenticada do Gluetun e não recebe o socket Docker.
- Todos os serviços possuem o perfil Compose interno `vpn`, selecionado pelo `vpn-switch`; isso impede a inicialização do Gluetun sem os segredos do provedor.
- A home integral do host é montada no terminal, em leitura e escrita, para que ele seja uma extensão direta do ambiente local; não selecione uma home de outro usuário.
- Acesso à rede interna é opt-in: `FIREWALL_SUBNETS` (o `vpn-switch` injeta a sub-rede da rota padrão do host quando vazio; inclua a sub-rede do DNS interno se ele apontar fora da LAN), `INTERNAL_DNS` + `INTERNAL_DNS_EXEMPT_HOSTNAMES` (nomes explícitos, sem curingas; deixe `INTERNAL_DNS_RESOLVERS` vazio nesse modo), `INTERNAL_TEST_HOST`/`INTERNAL_TEST_PORT` no `vpn-check`. Não incluir a faixa privada do túnel em `FIREWALL_SUBNETS`.
- Com `SSH_AUTH_SOCK`/`RUN_USER_DIR` definidos, o container lê o agente SSH e a sessão do usuário do host; inicie apenas o seu próprio ambiente.

## Next Context

- Atualizar versões e checksums do Dockerfile somente junto com a respectiva verificação oficial e o build da imagem.
- Validar o runtime no host com Docker (túnel real, `.omega`, painel/Desktop do OpenCode) e então concluir `VERIFY.md` e `verify-compose`/ShellCheck da CI.