# Testing And Verification

## Commands

- Syntax: `bash -n scripts/*`, `sh -n scripts/vpn-entrypoint.sh`
- Behavior: `./tests/linux/test-scripts.sh` and `node --test tests/opencode/*.test.mjs`
- Docs/profiles: `./scripts/verify-docs`
- Compose (requires Docker): `./scripts/verify-compose`
- Lint (CI): ShellCheck `-S error` via `.github/workflows/validate.yml` (+`bash -n`, `sh -n`, `git diff --check`)
- Build (requires Docker): `docker build --pull=true .`
- Convention: every script responds to `--help` with exit 0 (matrix in `verify-docs`)
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
- Suíte host-safe: roda com a stack no ar — `/usr/bin/env` (não o `env` do
  PATH), bloco HTTP em porta livre (20000-20100, probe via `timeout socat`) com
  `VPN_PORT_RANGE` restrita à porta e stub de `docker` (evita `docker compose
  logs` do terminal real); `VPN_SESSION_SYNC_FORCE=1` é o opt-out do
  `container_busy` do `vpn-session-sync` (só nos testes).
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
  HTTP 402 → `quota` (`credit-exhausted`), HTTP 429 com padrão Zen → `quota` (`zen-usage-limit`),
  HTTP 429 genérico → `quota` (`rate-limit`), HTTP 200 com `quota exceeded` → `quota`
  (`quota-pattern-in-http`) e corpo neutro → `ok` (`ouvindo`, exit 0);
  `--json` emite `{status,port,detail}`; `vpn-top --json` inclui `.opencode`.
- Supervisor classifier: only actual network-disconnect/tunnel-health evidence may trigger VPN recovery; provider-limit messages/log text are never triggers. `vpn-opencode check` remains observational.
- OpenCode recovery contract: structured free-tier and HTTP 429/rate-limit invoke recovery automatically. Account/credit never mutate VPN. Do not classify arbitrary provider prose or logs.
- Recovery helper coverage (`tests/linux/test-scripts.sh`): changed only with running VPN, valid different before/after IP and healthy tunnel; equal/missing IP, VPN down, no candidates/alternative, cooldown, lock busy and invalid event are covered with fake API/rotate/check scripts. The rotate stub also verifies the inherited lock descriptor.
- Plugins (`tests/opencode/vpn-recovery.test.mjs`): v1 retry recovery requires abort result `data === true`; abort false/error does not invoke the helper. Structured terminal `session.error` needs no abort. v2 server hook vetoes only structured provider-limit retries; only one deduplicated in-flight `session.execution.failed` TUI event invokes recovery. Account/credit notify but never invoke VPN mutation. Neither version replays a prompt.
- These are local tests with synthetic events; real provider limits, a live tunnel outage, and an interactive toast remain runtime checks (recorded in `VERIFY.md`).
- Hosts locais (runtime): com `LOCAL_HOSTS=gitlab.omega=<ip>`, `getent hosts
  gitlab.omega` no terminal retorna o IP e `vpn-check` marca ok; alcance real
  exige a sub-rede em `FIREWALL_SUBNETS`.
- Vazamento de DNS: `vpn-check` cobre resolv.conf → `127.0.0.1`, resolução via
  túnel e checagem básica de leak; rodar sempre após mudar DNS/firewall.
- Windows runtime: `vpn.ps1 start <perfil>` sem distribuição WSL, `vpn-check`,
  `getent hosts`/`ssh-add -l` no terminal, OpenCode, stop/start e persistência
  de `/home/developer`; repetir o fluxo Bash dentro de WSL2 com
  `FIREWALL_SUBNETS` explícito.
