# Community roadmap

Status: planning document. Items are not promises or published releases.
New issues and PRs should reference measurable problems.

## P0 — Stability and data safety
- [x] Detect failed tunnel checks in aggregate state (Draft PR #8).
- [x] Managed OpenCode v2 strict executable (Draft PR #8).
- [x] Isolate provider probe configuration/session state in tmpfs (Draft PR #8).
- [x] Block unsafe session restore in public CLI (Draft PR #8).
- [ ] Re-enable restore only after verified Linux/Windows quiescence,
  SQLite WAL/storage consistency and crash-injection recovery.

## P1 — Supported OpenCode runtime compatibility
- [ ] Runtime canary tests with official v2.1.3 and v2.3.0 binaries.
- [ ] Distinguish TUI, Desktop/serve and headless event delivery.
- [ ] Confirm registered plugin hooks from runtime, not just file hashes.
- [ ] Preserve OpenCode session data during plugin upgrades/rollback.
- [ ] Document one reproducible synthetic HTTP 429 E2E fixture.

## P2 — Operational intelligence
- [ ] Egress health and latency history for configured Gluetun routes.
- [ ] Typed event policy, cooldown and idempotency; no unnecessary rotation.
- [ ] Local dashboard with sanitized diagnostics export.
- [ ] Accessible setup for Windows and Linux.
- [ ] Optional model/provider fallback with an explicit user choice.

## Out of scope
- Claims of unlimited free-tier usage or undocumented server quota overrides.
- Public proxy scraping, account/device fingerprint resets and session re-ID.
- Downloading or embedding the GPL-licensed OpenCode Infinite fork.
- Automatic approval of tools or replay of user prompts after network change.

See [CONTRIBUTING.md](../CONTRIBUTING.md) before proposing changes.
