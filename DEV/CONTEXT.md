# Current Context

## State

- Project: `vpn-dev-workspace`
- Active handoff: `HANDOFF.md`
- Active spec: `SPECS/ACTIVE.md`
- Update this file when commands, architecture, environment, risks, or active decisions change.

## Commands

- Development: `./scripts/vpn-switch <profile>` e `docker compose -f docker-compose.yml -f profiles/<profile>.yml exec terminal zsh`. Não use `docker compose up` sem perfil. O terminal monta `HOST_HOME_DIR` (padrão: `$HOME` do host) e `WORKSPACE_DIR` nos mesmos caminhos.
- Tests: `./scripts/verify-docs`, `./scripts/verify-compose`, ShellCheck
- Build: `docker build --pull=false .`

## Constraints And Risks

- O Gluetun é a única superfície de rede publicada. A faixa TCP padrão é `10000-10100` e o bind padrão é local.
- A recuperação automática usa a API autenticada do Gluetun e não recebe o socket Docker.
- Todos os serviços possuem o perfil Compose interno `vpn`, selecionado pelo `vpn-switch`; isso impede a inicialização do Gluetun sem os segredos do provedor.
- A home integral do host é montada no terminal, em leitura e escrita, para que ele seja uma extensão direta do ambiente local; não selecione uma home de outro usuário.

## Next Context

- Atualizar versões e checksums do Dockerfile somente junto com a respectiva verificação oficial e o build da imagem.
