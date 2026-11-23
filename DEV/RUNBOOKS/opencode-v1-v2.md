# OpenCode v1/v2, session sync, and provider status

## Installed clients

The currently tested CLI versions are OpenCode v1 **1.19.6** and v2 **2.3.2**.
`opencode-vpn-install` requires v1 1.19.6 and v2 >= 2.2.6, with 2.3.2 as its
tested baseline.

```bash
opencode1 --version
opencode2 --version
opencode-session-sync status --client v1
opencode-session-sync status --client v2
```

| | v1 (`opencode1`) | v2 (`opencode2`) |
|---|---|---|
| Binary | `~/.opencode-v1/bin/opencode` | `~/.opencode/bin/opencode` |
| Data | `~/.opencode-v1/.local/share/opencode` | `~/.local/share/opencode` |
| Config | `~/.opencode-v1/.config/opencode` | `~/.config/opencode` |
| State | `~/.opencode-v1/.local/state` | Host state; Compose isolates container state in `~/.local/state-vpn` |

The host launchers delegate to the VPN terminal and inherit its `HOME`/XDG
settings. `opencode1` keeps its separate home and copies v2 `auth.json` only when
v1 has no auth file. `OPENCODE_ALLOW_HOST=1 opencode1|opencode2` is an explicit
opt-in to run the host binary outside the VPN container.

## Cross-version session transfer

Interactive TUI launches through `opencode1` and `opencode2` sync recent
sessions for the current workspace in both directions. The helper uses each
client's native JSON `export` and `import` commands, converts the message
schema, assigns new target IDs, and stores source-to-target mappings in
`~/.local/state/vpn-dev-workspace/session-sync/ledger.json`. It never copies a
v1 database into v2 or a v2 database into v1.

By default the helper examines the five most recently updated sessions for the
workspace (`OPENCODE_SESSION_SYNC_LIMIT` can raise this to 100). An explicit
`--session <id>` is also exported even when it is older than that window; the
launcher maps it to the target client's copy. `--continue` selects the newest
available source or target session and launches that exact mapped ID.

Supported transcript content includes user/assistant text, reasoning, and
completed text-only tool results. Imported tool calls are represented as
completed history and are never executed as a replay. The converter leaves the
source session untouched and verifies the native target export after import.
Repeated launches do not duplicate an unchanged copy. If a conversation
continues on the target, the changed transcript is copied back under a new
linked session rather than overwriting the original. This is copy-based sync;
it does not merge two independently edited histories.

The helper reports a pending transfer instead of dropping content when the
target client is active or the transcript contains attachments, unsettled tool
calls, summaries/reverts/forks, or unsupported message parts. It does not
convert those sessions lossily. Check the launcher stderr for `[session-sync]`
status and continue from the source client if a transfer is pending. The sync
helper protects the local ledger with a lock and stores it with owner-only
permissions.

## Provider limits and network recovery

Provider quota and rate-limit events never change the model or replay the turn
or tool calls. The v1 plugin cancels a recognized retry when possible. The v2
server hook sets `retry: false`. Both TUIs show the structured event and the
numeric `Retry-After` countdown when present, then run `vpn-check --json
--only tunnel`. `opencode-network-recover` calls `vpn-reconnect` only when the
diagnostic explicitly reports `status=stopped`. Healthy or inconclusive status
does not mutate the tunnel. Recovery holds the shared VPN mutation lock from
diagnosis through reconnect, and provider-triggered attempts share a cooldown.
The helper returns a structured result to the TUI and includes the IP reported
by Gluetun. The provider limit can remain active after the tunnel reconnects.
The compatibility command `opencode-limit-recover` remains status-only.

Network recovery is separate. `opencode-supervisor` reacts to confirmed network
disconnection or an unhealthy VPN tunnel, preserves the persistent OpenCode
database, and restarts the service after connectivity returns. It records the
latest session ID, verifies that exact session can still be exported, and prints
a manual resume command such as:

```bash
opencode2 --session ses_example
```

The interrupted prompt and tool calls are never replayed automatically. For a
Desktop/Web connection, select the same session in the UI after reconnecting.

## Windows Docker Desktop

Windows uses two separate paths:

- `vpn-opencode-wrapper` syncs the host's v2 SQLite database with the container
  through `.vpn/sync`; it copies the database, WAL, and SHM files because
  Docker Desktop file sharing does not provide SQLite POSIX locking. The
  wrapper syncs interactive launches automatically.
- The cross-version helper still uses native v1/v2 JSON export/import inside
  the Linux terminal. It does not raw-copy a database between v1 and v2.

Validation status (2026-11-22): the Linux-first integration gate is complete.
Windows Pester and real Docker Desktop SQLite staging remain future validation
for the Windows path; they do not block initial Linux use. Complete them before
claiming the Windows path is validated.

Manual same-version host/container sync:

```powershell
.\scripts\vpn.ps1 sessions-sync          # import host v2 sessions
.\scripts\vpn.ps1 sessions-sync --push   # export container v2 sessions
```

Close the host OpenCode process before pulling its database. If Compose reports
a failed push, PowerShell returns a nonzero status and does not apply any old
staging data. A failed best-effort push during `stop` leaves the VPN shutdown
flow intact and reports that the export is pending.

## Install or update the launchers

```bash
./scripts/opencode-vpn-install
opencode1 --version
opencode2 --version
```

The installer backs up existing launchers, sync helpers, and plugins before
replacing them. Run it after updating the repository's launcher or plugin
files.
