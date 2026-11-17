# OpenCode compatibility and regression matrix

Last review: 2026-11-16. This matrix distinguishes demonstrated runtime
behavior from local unit tests and version parsing.

| Version | Channel | Evidence | Status |
| --- | --- | --- | --- |
| v1.19.5 | TUI legacy | 2026-10-30 synthetic 429 with Gluetun egress change | Historical |
| v2.1.3 | TUI + vpn-recovery | 2026-10-30 plugin discovered; 429 synthetic, real egress changed | Historical baseline |
| v2.1.3 | Desktop/serve | Server retry hook only; TUI listener does not apply | Recovery unverified |
| v2.1.3 | CLI headless | TUI listener not guaranteed | Recovery unverified |
| v2.3.0 | TUI/Desktop/serve/headless | No actual binary+plugin E2E conducted in this review | Canary: unverified |
| Windows Docker Desktop | v1/v2 | Pester simulates Docker; SQLite/mount runtime still needs verification | Pending |

The managed `opencode2-service` rejects the Docker image's legacy v1 fallback.
It requires v2.1.3 by default. Setting `OPENCODE_V2_ALLOW_UNVERIFIED=true`
permits a newer v2 **in an isolated canary** but does NOT homologate its
plugin hooks. The actual version is reported by:

```bash
opencode2-service --check
opencode-compat --json
vpn-state --json
vpn-check --only tunnel
```

The repo's CI contains **simulated** contracts for 2.1.3 and 2.3.0. These
tests do not download and exercise the released executables.

## Runtime validation gates
1. Confirm executable, plugin discovery and actual hook registration.
2. Run a local synthetic HTTP 429 provider with disposable OpenCode home.
3. Check safety policy for structured free-tier, generic 429, credit and account.
4. Confirm tunnel health and changed public egress without prompt replay.
5. Test TUI, Desktop/serve and headless independently on Linux and Windows.
6. Only after a human opts in, verify provider response with one isolated probe.

```bash
vpn-provider-probe --model opencode/YOUR_FREE_MODEL --confirm
```

The probe requires a private tmpfs and v2.2.6+ flags including `--archived`.
Its result is acceptance for one request, not permission for unlimited use.
It may stage a temporary auth copy in RAM. Provider terms still apply.

See [the detailed runbook](../DEV/RUNBOOKS/opencode-v2-regression.md).
