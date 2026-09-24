# Testing And Verification

## Commands

- Sintaxe: `bash -n scripts/*`, `sh -n scripts/vpn-entrypoint.sh`
- Docs/perfis: `./scripts/verify-docs`
- Compose (exige Docker): `./scripts/verify-compose`
- Lint (CI): ShellCheck `-S error` via `.github/workflows/validate.yml` (+`bash -n`, `sh -n`, `git diff --check`)
- Whitespace: `git diff --check`
- Build (exige Docker): `docker build --pull=true .`
- Convenção: todo script responde `--help` com exit 0 (matriz no `verify-docs`)
- Windows: `Invoke-Pester -Path tests/windows` no runner Windows; os testes
  simulam Docker e cobrem argumentos, perfis, caminhos com espaços, segredos e
  hosts locais. O teste real de túnel/agent depende de Docker Desktop e de um
  agente OpenSSH autorizado.

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
  `INTERNAL_TEST_PORT`), `vpn-top` (incl. seção OpenCode), `vpn-opencode web` (401 sem senha, 200 com
  basic auth) e `serve` (200), `ssh-add -l` no terminal. Evidência em
  `VERIFY.md`.
- OpenCode sem Docker: `vpn-opencode check --port` com porta fechada (`down`, exit 1),
  responder HTTP com `quota exceeded` (`quota`, exit 1) e corpo neutro (`ok`, exit 0);
  `--json` emite `{status,port,detail}`; `vpn-top --json` inclui `.opencode`.
- Classificador do self-heal roda na CI sem VPN real: `429 Too Many Requests`/`Provider rate limit exceeded` => `rate_limit`; `Go limit reached` +
  mensagem de reset => `account_limit`; `connection lost while streaming` => `disconnect`;
  texto normal => `none`.
- Supervisor runtime: `vpn-opencode supervise --mode serve`; derrubar apenas o processo
  deve reiniciar OpenCode sem rotacionar uma VPN saudável. Injetar evento de desconexão/limite
  deve parar OpenCode, rotacionar/reconectar o Gluetun, confirmar túnel saudável e iniciar
  OpenCode novamente. Validar também a proteção anti-loop por janela/cooldown.
- Hosts locais (runtime): com `LOCAL_HOSTS=gitlab.omega=<ip>`, `getent hosts
  gitlab.omega` no terminal retorna o IP e `vpn-check` marca ok; alcance real
  exige a sub-rede em `FIREWALL_SUBNETS`.
- Vazamento de DNS: `vpn-check` cobre resolv.conf → `127.0.0.1`, resolução via
  túnel e checagem básica de leak; rodar sempre após mudar DNS/firewall.
- Windows runtime: `vpn.ps1 start <perfil>` sem distribuição WSL, `vpn-check`,
  `getent hosts`/`ssh-add -l` no terminal, OpenCode, stop/start e persistência
  de `/home/developer`; repetir o fluxo Bash dentro de WSL2 com
  `FIREWALL_SUBNETS` explícito.
