# Testing And Verification

## Linux-first delivery gate

The Linux/Node suites, documentation and Compose checks, syntax checks,
`git diff --check`, and Docker image build form the initial Linux validation
gate. Windows-specific checks are additional platform validation: they do not
block initial Linux use and must pass before the Windows path is claimed as
validated.

## Commands

- Syntax: `bash -n` for shell scripts, `sh -n scripts/vpn-entrypoint.sh`, and `node --check scripts/opencode-session-sync.mjs`
- Behavior: `./tests/linux/test-scripts.sh` and `node --test tests/opencode/*.test.mjs tests/control/*.test.cjs`
- Docs/profiles: `./scripts/verify-docs`
- Compose (requires Docker): `./scripts/verify-compose`
- Lint (CI): ShellCheck `-S error` via `.github/workflows/validate.yml` (+`bash -n`, `sh -n`, `git diff --check`)
- Build (requires Docker): `docker build --pull=true .`
- Convention: every script responds to `--help` with exit 0 (matrix in `verify-docs`)
- Windows: run `Invoke-Pester -Path tests/windows` on a Windows host. The tests
  simulate Docker and cover arguments, profiles, paths with spaces, secrets,
  and local hosts. Real SQLite staging and tunnel/agent behavior require
  Docker Desktop and an authorized OpenSSH agent.

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
- OpenCode provider policy: recognized events never change model or replay a turn. TUI events may trigger opt-out VPN reconnection through the shared-lock helper. Tests cover class allowlists, cooldown/window limits, timeout, lock contention, failures, and the opt-out path. Server hooks only veto retries.
- Session transfer (`tests/opencode/session-sync.test.mjs`): synthetic v1/v2 export fixtures cover schema conversion, new IDs, completed tool history, rejection of attachments/active tools/unknown parts, idempotency, divergent continuation, and avoidance of sync ping-pong. Actual CLI round trips must use isolated temporary data homes; never point the test at a user's active database.
- Network recovery is separate: the supervisor handles confirmed disconnection or unhealthy tunnel only, verifies the exact persisted session, and gives the user a manual resume command. It does not replay the interrupted request.
- Windows session staging (`tests/windows/vpn.Tests.ps1`): failed container push must return failure and cannot publish older staged content; run Pester on Windows and verify real Docker Desktop SQLite staging before claiming the Windows path validated.
- Helpers and guards (`tests/linux/test-scripts.sh`): `.env` parsing covers quoted values, comments, duplicate keys, escapes and malformed input; curl auth is absent from process arguments; stop matches only OpenCode `web|serve` on the exact port; invalid port range is rejected; bind LAN requires GUI/proxy authentication; `vpn-switch` lock contention is exit 75.
- Plugin tests (`tests/opencode/vpn-recovery.test.mjs`): v1 recognized errors cancel retries when the API permits and notify; v2 server hook sets `retry: false` for all recognized limit classes; the TUI only notifies. No plugin invokes a recovery helper.
- These are local tests with synthetic events. Real provider requests and live tunnel outages are not required to validate status-only behavior; Windows Docker Desktop mounts remain a Windows-host runtime check (recorded in `VERIFY.md`).
- Hosts locais (runtime): com `LOCAL_HOSTS=gitlab.internal.example=<ip>`, `getent hosts
  gitlab.internal.example` no terminal retorna o IP e `vpn-check` marca ok; alcance real
  exige a sub-rede em `FIREWALL_SUBNETS`.
- Vazamento de DNS: `vpn-check` cobre resolv.conf → `127.0.0.1`, resolução via
  túnel e checagem básica de leak; rodar sempre após mudar DNS/firewall.
- Windows runtime: `vpn.ps1 start <perfil>` sem distribuição WSL, `vpn-check`,
  `getent hosts`/`ssh-add -l` no terminal, OpenCode, stop/start e persistência
  de `/home/developer`; repetir o fluxo Bash dentro de WSL2 com
  `FIREWALL_SUBNETS` explícito.

## Control Plane opt-in

- Node 22+: `node --test tests/control/*.test.cjs` testa estado, eventos, protecao HTTP e snapshots SQLite.
- A CI valida sintaxe das ferramentas Node separadamente de ShellCheck/bash -n.
- Dev local: criar password no arquivo protegido e iniciar o perfil Compose `control` apenas com o perfil VPN ativo.
- Gate manual: snapshot/restore com OpenCode parado (host e container), queda de energia simulada, leitura de IP e DNS, redaction, binding exclusivo loopback.
- OpenCode 1.x nao deve ser tratado como compatibilidade com modelos gratuitos atuais; o comando `opencode-compat` mede apenas executavel e plugin, nao elegibilidade do provedor.
