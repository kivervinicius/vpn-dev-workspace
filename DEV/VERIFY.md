# Verify

## Latest Verification

- Date: 2026-08-10
- Scope: objetivo do terminal VPN como extensão direta do host, alinhamento do OpenCode e compartilhamento integral da home.

## Commands

- `bash -n scripts/*` e `sh -n scripts/vpn-entrypoint.sh` — passou.
- `./scripts/verify-docs` — passou.
- `./scripts/verify-compose` — passou para os oito perfis com placeholders seguros.
- `docker compose config --quiet` — passou.
- `HOST_BIND_ADDRESS=0.0.0.0 VPN_PORT_RANGE=10000-10100 ./scripts/vpn-switch nordvpn-openvpn` — bloqueou o bind público antes de executar `down`.
- `docker build --pull=false --quiet -t vpn-dev-workspace:opencode-1.18.16-verify .` — passou.
- Execução isolada da imagem com a home e o workspace do host montados nos mesmos caminhos — passou: `HOME=/home/desenvolvedor`, diretórios do OpenCode visíveis e OpenCode `1.18.16`.
- `bash -n scripts/verify-docs` — passou.
- `./scripts/verify-docs` — passou com validações do objetivo, da montagem da home e da rede do terminal pela VPN.

## Outcome

- Passed: verificações acima.
- Failed: nenhuma.
- Pending: ShellCheck será executado pela CI; a ferramenta não está instalada localmente. O Gluetun v3.40 emite avisos sobre duas rotas locais de controle estarem sem autenticação explícita.
