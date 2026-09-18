# Testing And Verification

## Commands

- Sintaxe: `bash -n scripts/*`, `sh -n scripts/vpn-entrypoint.sh`
- Docs/perfis: `./scripts/verify-docs`
- Compose (exige Docker): `./scripts/verify-compose`
- Lint (CI): ShellCheck `-S error` via `.github/workflows/validate.yml` (+`bash -n`, `sh -n`, `git diff --check`)
- Whitespace: `git diff --check`
- Build (exige Docker): `docker build --pull=true .`
- Convenção: todo script responde `--help` com exit 0 (matriz no `verify-docs`)

## Strategy

- Estático primeiro: sintaxe + `verify-docs` (trava de drift: versões,
  `SERVER_HOSTNAMES` por perfil, `PATH` host-first, `INTERNAL_TEST_PORT`,
  `LOCAL_HOSTS`) rodam sem Docker e devem passar em toda alteração.
- Compose/build/ShellCheck: rodam na CI (`validate.yml`) e no host com Docker;
  `verify-compose` valida interpolação dos 8 perfis com segredos `/dev/null`
  e o snippet do `vpn-hosts-gen` + dry-run do `vpn-hosts-apply`.
- Fixtures sem Docker: `vpn-hosts-gen` com entradas válidas/inválidas
  (exit 2 + mensagem) e `VPN_HOSTS_OVERRIDE_FILE` temporário;
  `vpn-hosts-import --domain` contra fixture de hosts; `vpn-check` com
  `LOCAL_HOSTS` cobrindo resolve/mismatch/não-resolve/inválido.
- Runtime (manual, com túnel real): `vpn-switch nordvpn-openvpn`,
  `vpn-reconnect` ×2 (imprime IP), `vpn-check` (incl. `INTERNAL_TEST_HOST`/
  `INTERNAL_TEST_PORT`), `vpn-top`, `vpn-opencode web` (401 sem senha, 200 com
  basic auth) e `serve` (200), `ssh-add -l` no terminal. Evidência em
  `VERIFY.md`.
- Hosts locais (runtime): com `LOCAL_HOSTS=gitlab.omega=<ip>`, `getent hosts
  gitlab.omega` no terminal retorna o IP e `vpn-check` marca ok; alcance real
  exige a sub-rede em `FIREWALL_SUBNETS`.
- Vazamento de DNS: `vpn-check` cobre resolv.conf → `127.0.0.1`, resolução via
  túnel e checagem básica de leak; rodar sempre após mudar DNS/firewall.
