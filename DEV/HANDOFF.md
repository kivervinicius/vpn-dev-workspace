# Active Handoff

Updated: 2026-11-22

## Current state

The Linux-first delivery and audit of the approved OpenCode v1/v2 integration
plan are complete in isolated worktree `/tmp/vpn-v1v2-integration`, branch
`integration/vpn-unified-1.1.0`. The original dirty workspace
`/projetos/vpn-dev-workspace` has not been modified. The existing Docker Compose
project now runs the integration worktree; Windows validation is a future
platform step and does not block initial Linux use.

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
- Runtime deployment through `vpn-switch nordvpn-openvpn` passed: Gluetun and
  `vpn-auto-reconnect` are healthy, `vpn-check` reports 6/6 checks and no
  failures, and the container reports OpenCode v1 1.19.6, v2 2.3.2, Node 22.
- Old images are retained under `vpn-v1v2-integration:rollback-*-before-1.1.0-20261122`.
- Pester is unavailable in this Linux environment.

## Future Windows validation

- When a Windows host is available, run Pester and real SQLite staging checks
  with Docker Desktop. This is required to claim the Windows path validated,
  but is not a prerequisite for the Linux-first initial use.
- The live Desktop App reconnect remains untested.

## Delivery constraints

- The maestro authorized a commit and push of this integration branch after
  local build and runtime verification. Do not merge or publish an image to a
  registry without a separate request. Keep the original dirty workspace files
  unchanged.
- Detailed evidence: `VERIFY.md`; chronological record: `WORKLOG.md`;
  task contract: `SPECS/ACTIVE.md`.
