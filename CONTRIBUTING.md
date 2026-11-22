# Contributing to VPN Dev Workspace

This is a community-maintained VPN development workspace. Contributions should
favor security, predictability and compatibility over additional routing options.

## Scope
- Gluetun networking, health checks, provider profiles and VPN kill switch.
- OpenCode compatibility, plugins, safe session tools, diagnostics and local UX.
- Original implementations only. The compared OpenCode Infinite project uses
  GPLv3 and OpenCode Unlimited had no identifiable license in its root tree.
  Do not paste source code from either project without reviewing permissions.
- No guarantees about free-tier quota resets; providers own their rate limits.
- Do not add session re-ID, token clearing, unapproved account modifications,
  automatic tool permission grants or unattended replay of prompts.

## Run locally (no provider traffic)

```bash
node --test tests/control/*.test.cjs tests/opencode/*.test.mjs
bash tests/linux/test-scripts.sh
./scripts/verify-docs
./scripts/verify-compose
```

Requires Node 22, Bash, and for the full suite Docker Compose, jq, ShellCheck
and zsh. Windows CLI regression tests run with Pester in GitHub Actions.

## Pull request checklist
1. Describe the problem, expected behavior and a safe reproducer.
2. Keep PRs small: separate routing, sessions, compatibility and UI.
3. Preserve documented CLI outputs and exit codes or offer a migration path.
4. Test success, failure, timeout, concurrency and rollback when applicable.
5. Distinguish simulated hooks, a real Gluetun test, and an actual provider request.
6. Never call a static check an end-to-end verification of plugin loading.
7. Add or update documentation and cite external design inspiration.

## Bug reports
Include OS, OpenCode version, client channel (TUI, Desktop, headless or
`serve`), Docker/Compose version, VPN profile and steps to reproduce.
Redact public IPs, internal domains, usernames, session IDs, home paths,
tokens, provider response bodies and prompts from any report. Never publish
`auth.json` or `opencode.db`. See [SECURITY.md](SECURITY.md).

## Community direction
Prioritize stability, docs and actual regressions before new tunnel backends.
A PR should be useful to other developers without depending on one computer.
