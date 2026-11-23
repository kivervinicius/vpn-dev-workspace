# OpenCode v2 compatibility and regression runbook

## Current baseline

The tested OpenCode baseline is v1 **1.19.6** and v2 **2.3.2**. The v2
installer accepts releases from 2.2.6 onward, but versions other than 2.3.2
are reported as unverified. `docs/compatibility.md` records the evidence by
client and platform.

Managed `serve`, `web`, and `supervise` commands require exactly v2 2.3.2.
Set `OPENCODE_V2_ALLOW_UNVERIFIED=true` only for an isolated canary; never use
that exception to silently update a live Desktop service.

Only a model-scoped free quota can switch models in v2. The server selects
explicitly zero-cost, input/tool-compatible alternatives from the live catalog
and uses the native retry for the same turn, up to three distinct models
including the original. Other quotas and generic rate limits do not switch
models or force a VPN/IP restart. Network recovery is separate and requires a
confirmed stopped tunnel; the supervisor verifies the exact saved session and
prints a manual resume command.

## Automated gates

```bash
node --test tests/opencode/*.test.mjs tests/control/*.test.cjs
bash tests/linux/test-scripts.sh
./scripts/verify-docs
./scripts/verify-compose   # needs Docker
```

Session transfer tests use synthetic exports. For CLI-level transfer, use
temporary v1/v2 data homes and workspaces. Do not point the helper at an active
user database for a test. Windows Pester tests cover the Compose staging
failure path; actual Docker Desktop mounts still need Windows runtime coverage.

## Runtime checks

These checks inspect installed binaries and local plugin state; they do not
send a provider request:

```bash
opencode1 --version
opencode2 --version
opencode-session-sync status --client v1
opencode-session-sync status --client v2
opencode-compat --json
vpn-check --only tunnel
```

If a native transfer is pending, read the `[session-sync]` message and resume
from the source client. The helper refuses attachments, active tool calls,
summaries, forks, reverts, and unknown message parts instead of converting
them lossily.

## Explicitly opt-in provider probe

`vpn-provider-probe --model <model> --confirm` consumes a real request. Run it
only when the user explicitly requests a provider acceptance check. It is not
needed for quota notification tests, session transfer validation, or the
network recovery path.

## Historical records

Older entries in `DEV/VERIFY.md` and `DEV/WORKLOG.md` include experiments where
429 responses triggered VPN rotation. Those records describe prior behavior
and are superseded by the current model-scoped fallback policy.
