# Changelog

## 1.1.0 — 2026-11-22

- Integrate the OpenCode v1/v2 session transfer and status-only provider recovery work.
- Add the local control plane, event journal, backup and compatibility handling.
- Harden Linux and Windows launchers, VPN recovery, Docker Compose profiles and secret handling.
- Validate the Linux and Windows command-line paths in CI, including Docker image builds and security scans.

## Unreleased

- Prevent false healthy aggregate when the tunnel or a critical check failed.
- Require explicit tested OpenCode v2 binary in managed Linux/Windows services.
- Isolate opt-in provider probes from the user's session data in private tmpfs.
- Disable unsafe production session restore/recover until cross-process locking.
- Do not rotate VPN for an ambiguous HTTP 429 without free-model evidence.
- Publish contribution, security and OpenCode compatibility documentation.
