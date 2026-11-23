# OpenCode compatibility and regression status

Last checked: 2026-11-23. This document separates CLI version checks, native
session-transfer coverage, plugin unit tests, and platform runtime coverage.

| Client | Current tested version | Evidence | Status |
| --- | --- | --- | --- |
| v1 TUI | 1.19.6 | Native export/import exercised with isolated synthetic sessions; provider policy covered by unit tests | Transfer tested; live provider event not induced |
| v2 TUI | 2.3.2 | Native export/import and fallback TUI notification covered by isolated tests | Live provider event and visual toast not induced |
| v2 server/Desktop | 2.3.2 | Isolated Docker E2E runs the real CLI with a local mock: two model-scoped 429s, catalog-based switches, native retry, then success | Live provider and Desktop reconnect not exercised |
| Windows Docker Desktop | Compose Windows override | PowerShell tests simulate Compose; staging failure is checked | Windows runtime requires Windows CI/host |

The installer requires v1 1.19.6 and accepts v2 >= 2.2.6; v2.3.2 is its
tested baseline. Managed `serve`, `web`, and `supervise` services require the
exact tested version unless `OPENCODE_V2_ALLOW_UNVERIFIED=true` is explicitly
set for an isolated canary. `opencode2-service --check` reports the installed
version, tested version, and homologation state. `opencode-compat --json`
compares binary versions and plugin source hashes, but static compatibility is
not proof that a plugin registered at runtime or that a provider accepts a
request.

The v2 plugin package pins `@opencode/plugin` 2.3.2. A model-scoped free quota
can switch to a compatible zero-cost model from the live catalog and continue
the same native retry, up to three distinct models including the original.
Other quotas and generic rate limits do not switch models or force a VPN/IP
restart. Network recovery handles confirmed connectivity failures separately
and prints an exact session resume command after verifying the saved session.
The E2E uses a loopback mock provider and does not consume real quota; it does
not validate the visual TUI toast or a live provider response.

## Validation gates

1. Run Node/OpenCode policy and session converter tests.
2. Run native v1↔v2 transfer using isolated temporary homes and databases.
3. Run Linux shell tests, syntax checks, `verify-docs`, and Compose validation.
4. Run the PowerShell/Pester suite on Windows CI; verify real Docker Desktop
   mounts and SQLite staging on a Windows host when available.
5. Keep real provider requests opt-in and separate from synthetic validation.
