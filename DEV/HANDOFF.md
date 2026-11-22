# Active Handoff

Updated: 2026-11-22

## Current state

Release 1.1.0 is published: annotated Git tag `1.1.0` and GitHub Release
[VPN Dev Workspace 1.1.0](https://github.com/kivervinicius/vpn-dev-workspace/releases/tag/1.1.0)
both point to commit `3671a78506ee826ba84dbd72d98b697e3ce81862`
(`docs(release): prepare 1.1.0 changelog`) on local and remote `master`.
GitHub Actions run
[`45024958928`](https://github.com/kivervinicius/vpn-dev-workspace/actions/runs/45024958928)
passed all four jobs for this exact commit.

The existing Compose project has been recreated from the main checkout
`/projetos/vpn-dev-workspace`, not the temporary integration worktree. The
terminal, VPN and auto-reconnect services are up; Gluetun and auto-reconnect
are healthy; `vpn-check` passed 6/6 in the terminal and 5/5 on the host. The
container bind-mounts the main checkout, and the persistent state volume was
retained.

Previous local work is recoverable: stash
`377397b7f6731230749e3d806bcdeecd40d0f825` contains the dirty and untracked
`feat/vpn-unified-ia` work; `archive/master-before-1.1.0-357a33d` preserves the
old local master. Three old Docker images remain tagged
`vpn-v1v2-integration:rollback-*-before-1.1.0-20261122`. Current local images
also have `:1.1.0` tags; no image was published to a registry.

The old `/tmp/vpn-v1v2-integration` worktree remains on the pushed integration
branch because it contains ignored `.hosts.local.gen` and
`.vpn-control-lock/operation.lock` files. It is inactive; the running Compose
project mounts the main checkout.

## Implemented

- Cross-version sessions use native JSON export/import, schema conversion,
  linked target IDs, an owner-only ledger, locking, verification by target
  re-export, and pending states for unsupported content. No database file is
  copied between v1 and v2.
- Provider quota, rate-limit, auth, account, and credit events are status-only.
  They never change VPN/model or replay prompts/tools. Network recovery is
  separate and requires a confirmed connectivity failure; session resume is
  manual after exact-session verification.
- Windows SQLite staging reports push failures and does not publish or apply
  stale snapshots. Compose mounts the cross-version helper separately.
- Tested baseline is v1 1.19.6 and v2 2.3.2. The Docker fallback pin and
  release hashes now match v1 1.19.6.

## Verification

- Node suites: 37/37 passed (`tests/opencode` + `tests/control`).
- Linux shell suite: 60/60 passed in three consecutive runs after hardening the
  per-connection HTTP fixture against `socat` forked-stdin races.
- `verify-docs`, `verify-compose`, shell/Node syntax, `git diff --check`, and
  PowerShell parser checks passed.
- ShellCheck `-S error` passed in an ephemeral Ubuntu 24.04 container.
- Terminal and local Gluetun image builds passed; the Gluetun build ran both Go
  test packages. Gitleaks scanned 232 commits and the worktree with no findings.
- Actual v1/v2 native CLI transfer was exercised earlier in this task with
  synthetic sessions and isolated temporary data homes; no active user DB or
  real provider request was used.
- Runtime deployment through `vpn-switch nordvpn-openvpn` passed from the main
  checkout: Gluetun and `vpn-auto-reconnect` are healthy, `vpn-check` reports
  6/6 checks in the terminal and 5/5 on the host, and the container reports
  OpenCode v1 1.19.6, v2 2.3.2, Node 22.17.0. Compose project working
  directory and workspace mount both point to `/projetos/vpn-dev-workspace`.
- Previous images are retained under
  `vpn-v1v2-integration:rollback-*-before-1.1.0-20261122`; current images have
  local `vpn-dev-workspace-*:1.1.0` aliases.
- GitHub Actions run `45024958928` for exact commit `3671a785` passed
  `validate`, `validate-windows-cli`, `supply-chain`, and `secret-scan`.
- Pester is unavailable in this Linux environment; Windows tests ran on the
  hosted Windows runner. The live Docker Desktop SQLite staging path remains
  unverified.

## Future Windows validation

- When a Windows host is available, run real SQLite staging checks with Docker
  Desktop. This is required to claim the Windows path validated, but is not a
  prerequisite for the Linux-first initial use.
- The live Desktop App reconnect remains untested.

## Delivery constraints

- The maestro authorized the 1.1.0 GitHub release and local runtime cutover.
  Do not publish a container image to a registry; none is part of this release.
- Detailed evidence: `VERIFY.md`; chronological record: `WORKLOG.md`;
  task contract: `SPECS/ACTIVE.md`.
