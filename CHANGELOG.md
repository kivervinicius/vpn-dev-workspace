# Changelog

## Unreleased — community hardening (draft stacked PR)
- Prevent false healthy aggregate when the tunnel or a critical check failed.
- Require explicit tested OpenCode v2 binary in managed Linux/Windows services.
- Isolate opt-in provider probes from the user's session data in private tmpfs.
- Disable unsafe production session restore/recover until cross-process locking.
- Do not rotate VPN for an ambiguous HTTP 429 without free-model evidence.
- Publish contribution, security and OpenCode compatibility documentation.

These changes are not released on `master` until review and merge.
