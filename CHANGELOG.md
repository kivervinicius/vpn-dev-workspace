# Changelog

## 1.3.1 — 2026-11-23

- Restart the current VPN tunnel after structured HTTP 429/rate-limit events, even when Gluetun reports it healthy; retain shared locking and never replay work.

## 1.1.0 — 2026-11-22

- Integrate the OpenCode v1/v2 session transfer and status-only provider recovery work.
- Add the local control plane, event journal, backup and compatibility handling.
- Harden Linux and Windows launchers, VPN recovery, Docker Compose profiles and secret handling.
- Validate the Linux and Windows command-line paths in CI, including Docker image builds and security scans.

## 1.2.0 — 2026-11-22

- Preserve interactive input through OpenCode v1/v2 session synchronization.
- Add manual model alternatives to v2 limit notifications.
- Mount observer dependencies individually and validate the control profile in every Compose configuration.
- Complete Linux E2E verification for VPN checks and authenticated OpenCode Desktop/Web access.

## 1.3.0 — 2026-11-23

- Preserve the v2 home and custom XDG paths when `opencode1` starts session sync, and stop before import when canonical v1/v2 SQLite paths collide.
- Diagnose tunnel health after structured provider events and reconnect the current profile only after Gluetun confirms the tunnel is stopped; share the VPN mutation lock, preserve `Retry-After` guidance, and never replay work.
- Align `make verify` with Linux CI coverage for every script's syntax, OpenCode and control-plane tests, Compose profiles, documentation, and both Docker image builds.
- Require the exact tested OpenCode v2 baseline for managed services unless an isolated canary is explicitly enabled.
- Replace quota-triggered IP rotation with a network-only recovery path that requires Gluetun to confirm a stopped tunnel.
