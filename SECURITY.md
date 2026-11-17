# Security policy

This project handles VPN routes, mounted development workspaces, OpenCode
credentials and conversation state. Treat all of these as sensitive.

## Supported baseline (2026-11-16)
- v2.1.3: historical synthetic HTTP 429 + real Gluetun IP-change E2E.
- v2.3.0: canary only; runtime plugins not yet homologated.
- v1.19.5: legacy historical baseline.
- Windows Docker Desktop: simulated CI is not a live SQLite/mount test.

## Reporting
Do not publish vulnerabilities with exploitable details or credentials in
ordinary issues. Prefer GitHub private vulnerability reporting if enabled
or a private channel through the maintainer's GitHub profile.

## Safeguards
- VPN networking is routed through Gluetun; do not bypass its kill switch.
- The Control UI is read-only, loopback-only and password-protected.
- Real provider checks are opt-in and consume usage.
- A provider probe isolates config/data and may copy `auth.json` into a
  private RAM-backed tmpfs, then removes it at normal completion. A SIGKILL
  can leave the temporary copy until cleanup/container shutdown.
- Backup creation checks SQLite integrity and hashes but cannot certify
  atomic consistency with concurrent changes in `storage/`.
- Production `vpn-backup restore` and `recover` are disabled until writer
  exclusion across Linux/Windows/session sync is proven.
- Never post authentication files, databases, prompts or unsanitized logs.

A green CI run does not prove plugin runtime loading, real-provider
acceptance, DNS-leak resistance or safe restoration of a live database.
