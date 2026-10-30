#!/usr/bin/env bash
# Shared non-blocking lock for every VPN mutation entry point.

vpn_control_lock_acquire() {
  local lock_file="${VPN_CONTROL_LOCK_FILE:-/var/lib/vpn-control/operation.lock}"
  command -v flock >/dev/null 2>&1 || {
    echo "Erro: dependência ausente: flock (util-linux)." >&2
    return 1
  }
  mkdir -p "$(dirname "$lock_file")" || return 1

  if [[ -e /proc/self/fd/9 ]] && [[ "$(readlink -f /proc/self/fd/9 2>/dev/null || true)" == "$(readlink -f "$lock_file" 2>/dev/null || true)" ]]; then
    # An inherited descriptor is reusable only while the lock remains held.
    flock -n 9 || return 75
    return 0
  fi

  exec 9>"$lock_file" || return 1
  flock -n 9 || return 75
}
