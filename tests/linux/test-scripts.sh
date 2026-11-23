#!/usr/bin/env bash
# Suíte de testes automatizados para scripts Linux do vpn-dev-workspace.
set -Eeuo pipefail

readonly TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly ROOT_DIR="$(cd "${TEST_DIR}/../.." && pwd)"
readonly SCRIPTS_DIR="${ROOT_DIR}/scripts"

total=0
passed=0
failed=0

run_test() {
  local desc="$1"
  shift
  total=$((total + 1))
  printf "Teste %d: %s ... " "$total" "$desc"
  local output
  if output="$("$@" 2>&1)"; then
    printf "PASS\n"
    passed=$((passed + 1))
  else
    printf "FAIL\n"
    printf '  Falha ao executar: %s\n%s\n' "$*" "$output" >&2
    failed=$((failed + 1))
  fi
}

expect_code() {
  local expected="$1"
  shift
  total=$((total + 1))
  printf "Teste %d: [Exit %s] %s ... " "$total" "$expected" "$*"
  
  local code=0
  "$@" >/dev/null 2>&1 || code=$?

  if [[ "$code" -eq "$expected" ]]; then
    printf "PASS\n"
    passed=$((passed + 1))
  else
    printf "FAIL (esperado %s, obtido %s)\n" "$expected" "$code"
    failed=$((failed + 1))
  fi
}

echo "=== Iniciando Suíte de Testes Linux ==="

# 1. Checagem de --help em todos os scripts
for s in vpn vpn-switch vpn-check vpn-status vpn-top vpn-server-rotate vpn-auto-reconnect vpn-opencode vpn-hosts-import vpn-hosts-apply vpn-hosts-gen opencode-supervisor opencode-vpn-install opencode-limit-recover opencode-network-recover opencode-session-sync opencode-session-sync.mjs vpn-doctor vpn-setup vpn-shell vpn-history verify-compose verify-docs verify-syntax; do
  if [[ -f "${SCRIPTS_DIR}/${s}" ]]; then
    if [[ "$s" == *.mjs ]]; then
      run_test "Script ${s} responde a --help com exit 0" node "${SCRIPTS_DIR}/${s}" --help
    else
      run_test "Script ${s} responde a --help com exit 0" bash "${SCRIPTS_DIR}/${s}" --help
    fi
  fi
done
test_opencode_vpn_install() {
  local tmp home v1 v2 rc=0
  tmp="$(mktemp -d)"
  home="${tmp}/home"
  mkdir -p "$home" "${tmp}/bin"
  v1="${tmp}/bin/opencode-v1"
  v2="${tmp}/bin/opencode-v2"
  cat > "$v1" <<'STUB'
#!/usr/bin/env bash
[[ "${1:-}" == --version ]] && { echo 'OpenCode 1.19.6'; exit 0; }
exit 0
STUB
  cat > "$v2" <<'STUB'
#!/usr/bin/env bash
[[ "${1:-}" == --version ]] && { echo 'OpenCode 2.3.2'; exit 0; }
exit 0
STUB
  chmod +x "$v1" "$v2"
  mkdir -p "$home/.opencode-v1/.config/opencode/plugins" "$home/.config/opencode/plugins/provider-limit-notify"
  printf 'old-v1\n' > "$home/.opencode-v1/.config/opencode/plugins/provider-limit-notify.js"
  printf '{}\n' > "$home/.config/opencode/plugins/provider-limit-notify/package.json"
  cat > "${tmp}/bin/opencode-v1-wrong" <<'STUB'
#!/usr/bin/env bash
echo 'OpenCode 1.19.4'
STUB
  chmod +x "${tmp}/bin/opencode-v1-wrong"
  if HOME="${tmp}/bad-home" OPENCODE_V1_HOME="${tmp}/bad-home/.opencode-v1" \
    XDG_CONFIG_HOME="${tmp}/bad-home/.config" \
    OPENCODE_V1_BIN="${tmp}/bin/opencode-v1-wrong" OPENCODE_V2_BIN="$v2" \
    bash "${SCRIPTS_DIR}/opencode-vpn-install" >/dev/null 2>&1; then
    rc=1
  fi
  [[ ! -e "${tmp}/bad-home" ]] || rc=1
  HOME="$home" OPENCODE_V1_HOME="$home/.opencode-v1" XDG_CONFIG_HOME="$home/.config" \
    OPENCODE_V1_BIN="$v1" OPENCODE_V2_BIN="$v2" \
    bash "${SCRIPTS_DIR}/opencode-vpn-install" >/dev/null || rc=$?
  if ((rc == 0)); then
    HOME="$home" OPENCODE_V1_HOME="$home/.opencode-v1" XDG_CONFIG_HOME="$home/.config" \
      OPENCODE_V1_BIN="$v1" OPENCODE_V2_BIN="$v2" \
      bash "${SCRIPTS_DIR}/opencode-vpn-install" >/dev/null || rc=$?
  fi
  if ((rc == 0)); then
    [[ -x "$home/.local/bin/opencode1" && -x "$home/.local/bin/opencode2" ]] || rc=1
    [[ -x "$home/.local/bin/opencode-session-sync" && -f "$home/.local/bin/opencode-session-sync.mjs" ]] || rc=1
    [[ -f "$home/.opencode-v1/.config/opencode/plugins/vpn-recovery.js" ]] || rc=1
    [[ -f "$home/.config/opencode/plugins/vpn-recovery/package.json" ]] || rc=1
    [[ ! -e "$home/.opencode-v1/.config/opencode/plugins/provider-limit-notify.js" ]] || rc=1
    [[ ! -e "$home/.config/opencode/plugins/provider-limit-notify" ]] || rc=1
    compgen -G "$home/.local/bin/opencode1.backup.*" >/dev/null || rc=1
    compgen -G "$home/.local/bin/opencode2.backup.*" >/dev/null || rc=1
    compgen -G "$home/.local/bin/opencode-session-sync.backup.*" >/dev/null || rc=1
    compgen -G "$home/.local/bin/opencode-session-sync.mjs.backup.*" >/dev/null || rc=1
    compgen -G "$home/.opencode-v1/.config/opencode/plugin-backups/*/provider-limit-notify.js" >/dev/null || rc=1
    compgen -G "$home/.config/opencode/plugin-backups/*/provider-limit-notify" >/dev/null || rc=1
    compgen -G "$home/.opencode-v1/.config/opencode/plugin-backups/*/vpn-recovery.js" >/dev/null || rc=1
    compgen -G "$home/.config/opencode/plugin-backups/*/vpn-recovery" >/dev/null || rc=1
    ! compgen -G "$home/.opencode-v1/.config/opencode/plugins/*.backup.*" >/dev/null || rc=1
    ! compgen -G "$home/.config/opencode/plugins/*.backup.*" >/dev/null || rc=1
  fi
  rm -rf "$tmp"
  return "$rc"
}
run_test "installer deploys recovery plugins, backs up and removes legacy targets" test_opencode_vpn_install

test_install_v2_baseline() {
  local tmp home v1 version stub output rc=0
  tmp="$(mktemp -d)"
  home="${tmp}/home"
  mkdir -p "$home/.opencode-v1/.config/opencode/plugins" "$home/.config/opencode/plugins/provider-limit-notify" "${tmp}/bin"
  printf 'old-v1\n' > "$home/.opencode-v1/.config/opencode/plugins/provider-limit-notify.js"
  printf '{}\n' > "$home/.config/opencode/plugins/provider-limit-notify/package.json"
  v1="${tmp}/bin/opencode-v1"
  printf '#!/usr/bin/env bash\necho "OpenCode 1.19.6"\n' > "$v1"
  chmod +x "$v1"
  for version in 2.2.5 2.2.6 2.4.0; do
    stub="${tmp}/bin/opencode-v2-${version}"
    printf '#!/usr/bin/env bash\necho "OpenCode %s"\n' "$version" > "$stub"
    chmod +x "$stub"
  done
  # Abaixo do mínimo: falha sem criar arquivos (guarda de baseline viva).
  if HOME="${tmp}/bad" OPENCODE_V1_HOME="${tmp}/bad/.opencode-v1" XDG_CONFIG_HOME="${tmp}/bad/.config" \
    OPENCODE_V1_BIN="$v1" OPENCODE_V2_BIN="${tmp}/bin/opencode-v2-2.2.5" \
    bash "${SCRIPTS_DIR}/opencode-vpn-install" >/dev/null 2>&1; then rc=1; fi
  [[ ! -e "${tmp}/bad/.local/bin" ]] || rc=1
  # No mínimo exato: instala sem warning.
  HOME="$home" OPENCODE_V1_HOME="$home/.opencode-v1" XDG_CONFIG_HOME="$home/.config" \
    OPENCODE_V1_BIN="$v1" OPENCODE_V2_BIN="${tmp}/bin/opencode-v2-2.2.6" \
    bash "${SCRIPTS_DIR}/opencode-vpn-install" >/dev/null 2>&1 || rc=1
  # Acima do mínimo: instala e emite warning de versão não testada.
  output="$(HOME="$home" OPENCODE_V1_HOME="$home/.opencode-v1" XDG_CONFIG_HOME="$home/.config" \
    OPENCODE_V1_BIN="$v1" OPENCODE_V2_BIN="${tmp}/bin/opencode-v2-2.4.0" \
    bash "${SCRIPTS_DIR}/opencode-vpn-install" 2>&1)" || rc=1
  grep -q "WARNING" <<<"$output" || rc=1
  rm -rf "$tmp"
  return "$rc"
}
run_test "installer v2 baseline: abaixo falha, no mínimo e acima instalam" test_install_v2_baseline
test_opencode_launchers_require_vpn() {
  local tmp home profile_home v1_home call_log host_state container_state output rc=0
  tmp="$(mktemp -d)"
  home="${tmp}/home"
  profile_home="${tmp}/codex-profile-home"
  v1_home="${home}/.opencode-v1"
  call_log="${tmp}/opencode.calls"
  host_state="${home}/.local/state"
  container_state="${home}/.local/state-vpn"
  mkdir -p "${tmp}/bin" "$home/.local/bin" "$home/.opencode/bin" "$v1_home/bin" \
    "$home/.local/share/opencode" "$profile_home"
  ln -s "${SCRIPTS_DIR}/opencode1" "$home/.local/bin/opencode1"
  ln -s "${SCRIPTS_DIR}/opencode2" "$home/.local/bin/opencode2"
  printf 'auth-data\n' > "$home/.local/share/opencode/auth.json"
  cat > "${tmp}/bin/vpn-check" <<'STUB'
#!/usr/bin/env bash
[[ "$*" == "--only tunnel -q" && "${VPN_CHECK_OK:-0}" == 1 ]]
STUB
  cat > "$v1_home/bin/opencode" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$OPENCODE_CALL_LOG"
echo 'OpenCode 1.19.6'
STUB
  cat > "$home/.opencode/bin/opencode" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$OPENCODE_CALL_LOG"
printf 'state=%s\n' "${XDG_STATE_HOME:-}" >> "$OPENCODE_CALL_LOG"
printf 'home=%s\n' "${HOME:-}" >> "$OPENCODE_CALL_LOG"
printf 'config=%s\n' "${XDG_CONFIG_HOME:-}" >> "$OPENCODE_CALL_LOG"
printf 'data=%s\n' "${XDG_DATA_HOME:-}" >> "$OPENCODE_CALL_LOG"
echo 'OpenCode 2.3.2'
STUB
  chmod +x "${tmp}/bin/vpn-check" "$v1_home/bin/opencode" "$home/.opencode/bin/opencode"
  cat > "${tmp}/bin/docker" <<'STUB'
#!/usr/bin/env bash
if [[ "$1" == inspect ]]; then printf 'true\n'; exit 0; fi
[[ "$1" == exec ]] || exit 2
shift
export HOME="${CONTAINER_HOME:-/container/home}"
export PATH="${CONTAINER_PATH:-$PATH}"
export XDG_CONFIG_HOME="${CONTAINER_XDG_CONFIG_HOME:-${HOME}/.config}"
export XDG_DATA_HOME="${CONTAINER_XDG_DATA_HOME:-${HOME}/.local/share}"
export XDG_STATE_HOME="${CONTAINER_XDG_STATE_HOME:-${HOME}/.local/state-vpn}"
while (($#)); do
  case "$1" in
    -i|-t) shift ;;
    -e) export "$2"; shift 2 ;;
    -w) cd "$2"; shift 2 ;;
    *) break ;;
  esac
done
shift
exec "$@"
STUB
  chmod +x "${tmp}/bin/docker"
  output="$(HOME="$home" OPENCODE_V1_HOME="$v1_home" OPENCODE_HOST_HOME="$home" \
    VPN_WORKSPACE_CONTAINER=1 VPN_CHECK_OK=1 OPENCODE_CALL_LOG="$call_log" PATH="${tmp}/bin:${PATH}" \
    bash "${SCRIPTS_DIR}/opencode1" --version)" || rc=$?
  if ((rc == 0)); then
    [[ "$output" == 'OpenCode 1.19.6' && "$(<"$v1_home/.local/share/opencode/auth.json")" == auth-data ]] &&
      [[ "$(stat -c '%a' "$v1_home/.local/share/opencode/auth.json")" == 600 ]] || rc=$?
  fi
  if ((rc == 0)); then
    output="$(HOME="$home" VPN_WORKSPACE_CONTAINER=1 VPN_CHECK_OK=1 \
      OPENCODE_CALL_LOG="$call_log" PATH="${tmp}/bin:${PATH}" bash "${SCRIPTS_DIR}/opencode2" --version)" || rc=$?
    [[ "$output" == 'OpenCode 2.3.2' ]] || rc=$?
  fi
  if ((rc == 0)); then
    # VPN_WORKSPACE_CONTAINER vazio de propósito: o host-branch não pode ser
    # confundido com vazamento da variável do ambiente externo (ex: rodar a
    # suíte de dentro do container VPN).
    output="$(HOME="$profile_home" XDG_CONFIG_HOME="$profile_home/.config" XDG_DATA_HOME="$profile_home/.local/share" \
      VPN_WORKSPACE_CONTAINER= OPENCODE_V1_HOME="$v1_home" CONTAINER_HOME="$home" \
      CONTAINER_PATH="$home/.local/bin:${tmp}/bin:${PATH}" \
      CONTAINER_XDG_STATE_HOME="$container_state" CONTAINER_XDG_CONFIG_HOME="$home/.config" \
      CONTAINER_XDG_DATA_HOME="$home/.local/share" OPENCODE_TERMINAL_CONTAINER=test VPN_CHECK_OK=1 \
      OPENCODE_CALL_LOG="$call_log" PATH="${tmp}/bin:${PATH}" \
      bash "${SCRIPTS_DIR}/opencode1" --version)" || rc=$?
    [[ "$output" == 'OpenCode 1.19.6' ]] || rc=$?
  fi
  if ((rc == 0)); then
    output="$(HOME="$profile_home" XDG_STATE_HOME="$host_state" XDG_CONFIG_HOME="$profile_home/.config" \
      XDG_DATA_HOME="$profile_home/.local/share" VPN_WORKSPACE_CONTAINER= CONTAINER_HOME="$home" \
      CONTAINER_PATH="$home/.local/bin:${tmp}/bin:${PATH}" \
      CONTAINER_XDG_STATE_HOME="$container_state" CONTAINER_XDG_CONFIG_HOME="$home/.config" \
      CONTAINER_XDG_DATA_HOME="$home/.local/share" OPENCODE_TERMINAL_CONTAINER=test VPN_CHECK_OK=1 \
      OPENCODE_CALL_LOG="$call_log" \
      PATH="${tmp}/bin:${PATH}" bash "${SCRIPTS_DIR}/opencode2" --version)" || rc=$?
    [[ "$output" == 'OpenCode 2.3.2' ]] || rc=$?
    mapfile -t launcher_env < <(tail -n 4 "$call_log")
    [[ "${launcher_env[0]:-}" == "state=$container_state" &&
      "${launcher_env[1]:-}" == "home=$home" &&
      "${launcher_env[2]:-}" == "config=$home/.config" &&
      "${launcher_env[3]:-}" == "data=$home/.local/share" ]] || rc=$?
  fi
  : > "$call_log"
  if ((rc == 0)) && HOME="$home" OPENCODE_V1_HOME="$v1_home" VPN_WORKSPACE_CONTAINER=1 \
    VPN_CHECK_OK=0 OPENCODE_CALL_LOG="$call_log" PATH="${tmp}/bin:${PATH}" \
    bash "${SCRIPTS_DIR}/opencode1" --version >/dev/null 2>&1; then
    rc=1
  fi
  [[ ! -s "$call_log" ]] || rc=1
  if ((rc == 0)) && HOME="$home" VPN_WORKSPACE_CONTAINER=1 VPN_CHECK_OK=0 \
    OPENCODE_CALL_LOG="$call_log" PATH="${tmp}/bin:${PATH}" \
    bash "${SCRIPTS_DIR}/opencode2" --version >/dev/null 2>&1; then
    rc=1
  fi
  rm -rf "$tmp"
  return "$rc"
}
run_test "OpenCode v1/v2 launchers use container home/XDG and refuse unhealthy VPN" test_opencode_launchers_require_vpn

test_opencode_host_escape() {
  local tmp output rc=0
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/bin"
  cat > "$tmp/bin/opencode" <<'STUB'
#!/usr/bin/env bash
printf 'host-v2-bin\n'
STUB
  cat > "$tmp/bin/opencode-v1" <<'STUB'
#!/usr/bin/env bash
printf 'host-v1-bin\n'
STUB
  chmod +x "$tmp/bin/opencode" "$tmp/bin/opencode-v1"
  output="$(VPN_WORKSPACE_CONTAINER= OPENCODE_ALLOW_HOST=1 PATH="${tmp}/bin:/usr/bin:/bin" \
    bash "${SCRIPTS_DIR}/opencode2" --version 2>&1)" || rc=$?
  [[ "$output" == *"EXECUTANDO NO HOST"* && "$output" == *"host-v2-bin"* ]] || rc=1
  output="$(VPN_WORKSPACE_CONTAINER= OPENCODE_ALLOW_HOST=1 OPENCODE_HOST_V1_BIN="${tmp}/bin/opencode-v1" \
    PATH="${tmp}/bin:/usr/bin:/bin" bash "${SCRIPTS_DIR}/opencode1" --version 2>&1)" || rc=$?
  [[ "$output" == *"EXECUTANDO NO HOST"* && "$output" == *"host-v1-bin"* ]] || rc=1
  # Sem o opt-in, segue recusando rodar no host (PATH sem docker: o launcher
  # não pode delegar ao container).
  if VPN_WORKSPACE_CONTAINER= PATH="${tmp}/bin" \
    bash "${SCRIPTS_DIR}/opencode2" --version >/dev/null 2>&1; then
    rc=1
  fi
  rm -rf "$tmp"
  return "$rc"
}
run_test "launchers: OPENCODE_ALLOW_HOST=1 executa no host; sem opt-in recusa" test_opencode_host_escape

test_opencode_limit_recover() {
  local tmp rc=0 event output code
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/bin" "$tmp/state"
  local -x PATH="$tmp/bin:$PATH"
  local -x ROTATE_LOG="$tmp/rotate.log"
  local -x PROBE_LOG="$tmp/probe.log"
  local -x OPENCODE_LIMIT_RECOVERY_STATE_FILE="$tmp/state/recovery.json"

  cat > "$tmp/bin/vpn-server-rotate" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$ROTATE_LOG"
STUB
  cat > "$tmp/bin/vpn-provider-probe" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PROBE_LOG"
STUB
  chmod +x "$tmp/bin/"*

  for event in free_tier_limit rate_limit account_limit credit_limit auth_limit; do
    output="$(bash "${SCRIPTS_DIR}/opencode-limit-recover" --event "$event" --retry-after 300 2>"$tmp/stderr")" || { rc=1; break; }
    jq -e --arg event "$event" \
      '.status == "skipped" and .reason == "quota_status_only" and .event == $event and .retry_after == 300 and .vpn_ready == false and .current_ip == ""' \
      <<<"$output" >/dev/null || rc=1
  done
  [[ ! -s "$ROTATE_LOG" && ! -s "$PROBE_LOG" ]] || rc=1
  [[ ! -e "$OPENCODE_LIMIT_RECOVERY_STATE_FILE" ]] || rc=1

  code=0
  bash "${SCRIPTS_DIR}/opencode-limit-recover" --event bogus >/dev/null 2>&1 || code=$?
  [[ "$code" == 2 ]] || rc=1
  code=0
  bash "${SCRIPTS_DIR}/opencode-limit-recover" --event rate_limit --retry-after abc >/dev/null 2>&1 || code=$?
  [[ "$code" == 2 ]] || rc=1
  code=0
  bash "${SCRIPTS_DIR}/opencode-limit-recover" --event rate_limit --model provider/model >/dev/null 2>&1 || code=$?
  [[ "$code" == 2 ]] || rc=1

  rm -rf "$tmp"
  return "$rc"
}
run_test "provider quota helper is status-only and never rotates or probes" test_opencode_limit_recover

test_supervisor_classification() {
  local output
  for pair in \
    'connection lost while streaming|disconnect' \
    'network connection lost; retrying|disconnect' \
    'normal request completed|none' \
    '429 Too Many Requests|none' \
    'Provider rate limit exceeded|none' \
    'FreeUsageLimitError: Free usage limit reached|none' \
    'Go limit reached: usage limit reached|none' \
    'CreditLimitExceeded: credit limit exceeded|none'; do
    output="$(bash "$SCRIPTS_DIR/opencode-supervisor" --classify "${pair%%|*}")" || return 1
    [[ "$output" == "${pair#*|}" ]] || return 1
  done
}
run_test "supervisor classifies connectivity and ignores provider limits" test_supervisor_classification

test_verify_syntax_checks_each_script() {
  local fixture output rc=0
  fixture="$(mktemp -d)"
  mkdir -p "$fixture/bin" "$fixture/scripts" "$fixture/apps" "$fixture/opencode" "$fixture/tests"
  # The host wrapper may run ShellCheck in Docker with a fixed repository
  # mount. Stub lint here so this fixture specifically exercises per-file
  # bash -n handling against its temporary tree.
  printf '#!/usr/bin/env bash\nexit 0\n' > "$fixture/bin/shellcheck"
  chmod 755 "$fixture/bin/shellcheck"
  printf '#!/usr/bin/env bash\ntrue\n' > "$fixture/scripts/01-good.sh"
  printf '#!/usr/bin/env bash\nif then\n' > "$fixture/scripts/02-bad.sh"
  printf '#!/bin/sh\ntrue\n' > "$fixture/scripts/vpn-entrypoint.sh"
  for script in vpn-state vpn-events vpn-observer vpn-backup vpn-control-ui vpn-provider-probe opencode-compat; do
    printf 'process.exitCode = 0\n' > "$fixture/scripts/$script"
  done
  chmod 755 "$fixture/scripts/01-good.sh" "$fixture/scripts/02-bad.sh" "$fixture/scripts/vpn-entrypoint.sh"

  output="$(PATH="$fixture/bin:$PATH" VERIFY_SYNTAX_ROOT="$fixture" bash "$SCRIPTS_DIR/verify-syntax" 2>&1)" && rc=1
  [[ "$rc" == 0 ]] || return 1
  grep -Fq '02-bad.sh' <<<"$output" || return 1
  rm -rf "$fixture"
}
run_test "verify-syntax catches a bad second script in a fixture" test_verify_syntax_checks_each_script

test_opencode_network_recover() {
  local tmp output rc=0
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/bin"
  local -x PATH="$tmp/bin:$PATH"
  local -x ACTION_LOG="$tmp/action.log"
  local -x OPENCODE_NETWORK_RECOVERY_STATE_FILE="$tmp/recovery.state"
  local -x VPN_WORKSPACE_CONTAINER=1
  local -x VPN_CONTROL_LOCK_FILE="$tmp/shared-operation.lock"
  local -x VPN_CONTROL_LOCK_LIB="$SCRIPTS_DIR/vpn-control-lock.sh"
  local -x OPENCODE_NETWORK_RECOVERY_COOLDOWN_SECONDS=300
  local -x STUB_RELEASE_FILE=""
  local -x STUB_RECONNECT_FAIL=""
  local -x VPN_CHECK_MODE=healthy

  cat > "$tmp/bin/vpn-check" <<'STUB'
#!/usr/bin/env bash
case "$VPN_CHECK_MODE" in
  healthy)
    printf '%s\n' '{"healthy":true,"fails":0,"checks":[{"name":"túnel VPN ativo","ok":true,"detail":""},{"name":"IP público obtido (203.0.113.10)","ok":true,"detail":""}]}'
    ;;
  stopped)
    printf '%s\n' '{"healthy":false,"fails":2,"checks":[{"name":"túnel VPN ativo","ok":false,"detail":"status=stopped"},{"name":"IP público obtido","ok":false,"detail":"vazio ou inacessível"}]}'
    exit 1
    ;;
  unknown)
    echo invalid-json
    exit 1
    ;;
  failed|error)
    printf '{"healthy":false,"fails":1,"checks":[{"name":"túnel VPN ativo","ok":false,"detail":"status=%s"},{"name":"IP público obtido","ok":false,"detail":"vazio ou inacessível"}]}\n' "$VPN_CHECK_MODE"
    exit 1
    ;;
esac
STUB
  cat > "$tmp/bin/vpn-reconnect" <<'STUB'
#!/usr/bin/env bash
source "$VPN_CONTROL_LOCK_LIB"
vpn_control_lock_acquire || exit $?
[[ -z "$STUB_RECONNECT_FAIL" ]] || exit 1
printf 'reconnect\n' >> "$ACTION_LOG"
if [[ -n "$STUB_RELEASE_FILE" ]]; then
  while [[ ! -e "$STUB_RELEASE_FILE" ]]; do sleep 0.05; done
fi
echo 'VPN reconectada. IP público: 198.51.100.9'
STUB
  chmod +x "$tmp/bin/"*

  output="$(bash "$SCRIPTS_DIR/opencode-network-recover" --event rate_limit --session s1 --quiet)" || rc=1
  jq -e '.status == "healthy" and .reason == "tunnel_healthy"' <<<"$output" >/dev/null || { echo "healthy tunnel response mismatch: $output" >&2; rc=1; }
  [[ ! -e "$ACTION_LOG" ]] || { echo "healthy tunnel unexpectedly reconnected" >&2; rc=1; }

  local -x VPN_CHECK_MODE=stopped
  output="$(bash "$SCRIPTS_DIR/opencode-network-recover" --event rate_limit --session s2 --quiet)" || rc=1
  jq -e '.status == "reconnected" and .ip == "198.51.100.9"' <<<"$output" >/dev/null || { echo "stopped tunnel response mismatch: $output" >&2; rc=1; }
  [[ "$(wc -l < "$ACTION_LOG")" == 1 ]] || { echo "expected one reconnect after stopped tunnel" >&2; rc=1; }

  output="$(bash "$SCRIPTS_DIR/opencode-network-recover" --event rate_limit --session s3 --quiet)" || rc=1
  jq -e '.status == "skipped" and .reason == "cooldown_active"' <<<"$output" >/dev/null || { echo "cooldown response mismatch: $output" >&2; rc=1; }
  [[ "$(wc -l < "$ACTION_LOG")" == 1 ]] || { echo "cooldown allowed another reconnect" >&2; rc=1; }

  local -x VPN_CHECK_MODE=unknown
  rm -f "$OPENCODE_NETWORK_RECOVERY_STATE_FILE"
  output="$(bash "$SCRIPTS_DIR/opencode-network-recover" --event rate_limit --session s4 --quiet)" || rc=1
  jq -e '.status == "skipped" and .reason == "tunnel_state_unknown"' <<<"$output" >/dev/null || { echo "unknown tunnel response mismatch: $output" >&2; rc=1; }
  [[ "$(wc -l < "$ACTION_LOG")" == 1 ]] || { echo "unknown tunnel state triggered reconnect" >&2; rc=1; }

  for state in failed error; do
    local -x VPN_CHECK_MODE="$state"
    rm -f "$OPENCODE_NETWORK_RECOVERY_STATE_FILE"
    output="$(bash "$SCRIPTS_DIR/opencode-network-recover" --event rate_limit --session "s-$state" --quiet)" || rc=1
    jq -e '.status == "skipped" and .reason == "tunnel_state_unknown"' <<<"$output" >/dev/null || { echo "unconfirmed $state tunnel response mismatch: $output" >&2; rc=1; }
    [[ "$(wc -l < "$ACTION_LOG")" == 1 ]] || { echo "unconfirmed $state tunnel triggered reconnect" >&2; rc=1; }
  done

  local lock_ready="$tmp/shared-lock-ready" lock_release="$tmp/shared-lock-release"
  flock "$VPN_CONTROL_LOCK_FILE" bash -c 'touch "$1"; while [[ ! -e "$2" ]]; do sleep 0.05; done' _ "$lock_ready" "$lock_release" &
  local lock_holder=$!
  for _ in {1..100}; do
    [[ -e "$lock_ready" ]] && break
    sleep 0.05
  done
  output="$(bash "$SCRIPTS_DIR/opencode-network-recover" --event rate_limit --session s-lock --quiet)" || rc=1
  jq -e '.status == "lock_busy" and .reason == "mutation_in_progress"' <<<"$output" >/dev/null || { echo "shared mutation lock response mismatch: $output" >&2; rc=1; }
  [[ "$(wc -l < "$ACTION_LOG")" == 1 ]] || { echo "recovery ran while the shared VPN mutation lock was held" >&2; rc=1; }
  touch "$lock_release"
  wait "$lock_holder" || { echo "shared mutation lock holder returned failure" >&2; rc=1; }

  local -x VPN_CHECK_MODE=stopped
  rm -f "$OPENCODE_NETWORK_RECOVERY_STATE_FILE"
  : > "$ACTION_LOG"
  local -x STUB_RELEASE_FILE="$tmp/release-recovery"
  bash "$SCRIPTS_DIR/opencode-network-recover" --event rate_limit --session s5 --quiet >"$tmp/first.json" &
  local worker=$!
  for _ in {1..100}; do
    [[ -s "$ACTION_LOG" ]] && break
    sleep 0.1
  done
  output="$(bash "$SCRIPTS_DIR/opencode-network-recover" --event rate_limit --session s6 --quiet)" || rc=1
  jq -e '.status == "lock_busy" and .reason == "recovery_in_progress"' <<<"$output" >/dev/null || { echo "concurrent recovery response mismatch: $output" >&2; rc=1; }
  touch "$STUB_RELEASE_FILE"
  wait "$worker" || { echo "background recovery returned failure" >&2; rc=1; }
  jq -e '.status == "reconnected"' "$tmp/first.json" >/dev/null || { echo "background recovery response mismatch: $(<"$tmp/first.json")" >&2; rc=1; }
  [[ "$(wc -l < "$ACTION_LOG")" == 1 ]] || { echo "unexpected number of reconnect attempts after lock test" >&2; rc=1; }

  # A structured 429 restarts the current profile even when the tunnel reports
  # healthy, the diagnostic is unavailable, or the ordinary cooldown is active.
  # Estado envelhecido (> piso de 60s do force) para isolar o piso anti-loop.
  : > "$ACTION_LOG"
  printf '%s\n' "$(( $(date +%s) - 120 ))" > "$OPENCODE_NETWORK_RECOVERY_STATE_FILE"
  local -x VPN_CHECK_MODE=healthy
  output="$(bash "$SCRIPTS_DIR/opencode-network-recover" --event rate_limit --session s429 --force-restart --quiet)" || rc=1
  jq -e '.status == "reconnected" and .reason == "http_429_tunnel_restarted" and .ip == "198.51.100.9"' <<<"$output" >/dev/null || { echo "healthy-tunnel 429 restart mismatch: $output" >&2; rc=1; }
  [[ "$(wc -l < "$ACTION_LOG")" == 1 ]] || { echo "HTTP 429 did not restart a healthy tunnel" >&2; rc=1; }

  local -x VPN_CHECK_MODE=unknown
  printf '%s\n' "$(( $(date +%s) - 120 ))" > "$OPENCODE_NETWORK_RECOVERY_STATE_FILE"
  output="$(bash "$SCRIPTS_DIR/opencode-network-recover" --event account_limit --session s429-unknown --force-restart --quiet)" || rc=1
  jq -e '.status == "reconnected" and .reason == "http_429_tunnel_restarted"' <<<"$output" >/dev/null || { echo "undetected-tunnel 429 restart mismatch: $output" >&2; rc=1; }
  [[ "$(wc -l < "$ACTION_LOG")" == 2 ]] || { echo "HTTP 429 restart did not bypass unavailable tunnel diagnostics" >&2; rc=1; }

  # Piso do force: restart recente bloqueia outro force (anti-loop entre sessões).
  date +%s > "$OPENCODE_NETWORK_RECOVERY_STATE_FILE"
  output="$(bash "$SCRIPTS_DIR/opencode-network-recover" --event rate_limit --session s429-floor --force-restart --quiet)" || rc=1
  jq -e '.status == "skipped" and .reason == "force_cooldown_active"' <<<"$output" >/dev/null || { echo "force floor mismatch: $output" >&2; rc=1; }

  # Mais velho que o piso (60s) e dentro do cooldown normal (300s): force passa.
  printf '%s\n' "$(( $(date +%s) - 120 ))" > "$OPENCODE_NETWORK_RECOVERY_STATE_FILE"
  output="$(bash "$SCRIPTS_DIR/opencode-network-recover" --event rate_limit --session s429-bypass --force-restart --quiet)" || rc=1
  jq -e '.status == "reconnected" and .reason == "http_429_tunnel_restarted"' <<<"$output" >/dev/null || { echo "force normal-cooldown bypass mismatch: $output" >&2; rc=1; }

  # Tentativa falha não grava estado: não envenena o cooldown da recuperação seguinte.
  rm -f "$OPENCODE_NETWORK_RECOVERY_STATE_FILE"
  local -x VPN_CHECK_MODE=stopped
  local -x STUB_RECONNECT_FAIL=1
  output="$(bash "$SCRIPTS_DIR/opencode-network-recover" --event rate_limit --session s429-fail --quiet)" || true
  jq -e '.status == "failed" and .reason == "reconnect_failed"' <<<"$output" >/dev/null || { echo "failed attempt mismatch: $output" >&2; rc=1; }
  [[ ! -e "$OPENCODE_NETWORK_RECOVERY_STATE_FILE" ]] || { echo "failed attempt wrote cooldown state" >&2; rc=1; }
  local -x STUB_RECONNECT_FAIL=""

  rm -rf "$tmp"
  return "$rc"
}
run_test "opencode-network-recover: confirmed tunnel failure, lock and cooldown" test_opencode_network_recover

test_dotenv_parser() {
  local tmp result rc=0
  tmp="$(mktemp -d)"
  cat > "$tmp/env" <<'ENV'
 export QUOTED="value # kept" # comentário
PLAIN= first value   # comentário
DUPLICATE=old
DUPLICATE='new value'
ESCAPED="line\nnext \"quoted\""
ENV
  source "$SCRIPTS_DIR/dotenv-read.sh"
  result="$(dotenv_read "$tmp/env" QUOTED)" || rc=1
  [[ "$result" == 'value # kept' ]] || rc=1
  result="$(dotenv_read "$tmp/env" PLAIN)" || rc=1
  [[ "$result" == 'first value' ]] || rc=1
  result="$(dotenv_read "$tmp/env" DUPLICATE)" || rc=1
  [[ "$result" == 'new value' ]] || rc=1
  result="$(dotenv_read "$tmp/env" ESCAPED)" || rc=1
  [[ "$result" == $'line\nnext "quoted"' ]] || rc=1
  printf 'BROKEN="unterminated\n' > "$tmp/broken"
  dotenv_read "$tmp/broken" BROKEN >/dev/null 2>&1 && rc=1
  rm -rf "$tmp"
  return "$rc"
}
run_test "dotenv parser handles quotes, comments, duplicates and malformed values" test_dotenv_parser

test_auth_stays_off_argv() {
  local tmp rc=0
  tmp="$(mktemp -d)"
  printf 'api-key-fixture' > "$tmp/api-key"
  cat > "$tmp/curl" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" > "$CURL_ARGS"
cat > "$CURL_CONFIG"
STUB
  chmod +x "$tmp/curl"
  CURL_ARGS="$tmp/args" CURL_CONFIG="$tmp/config" GLUETUN_API_KEY_FILE="$tmp/api-key" \
    PATH="$tmp:$PATH" bash -c 'source "$1"; vpn_api_curl --silent http://stub' _ "$SCRIPTS_DIR/vpn-control-api.sh" || rc=1
  ! grep -q 'api-key-fixture' "$tmp/args" || rc=1
  grep -q 'X-API-Key: api-key-fixture' "$tmp/config" || rc=1
  CURL_ARGS="$tmp/args" CURL_CONFIG="$tmp/config" PATH="$tmp:$PATH" \
    bash -c 'source "$1"; vpn_basic_auth_curl fixture-user fixture-password --silent http://stub' _ \
    "$SCRIPTS_DIR/vpn-control-api.sh" || rc=1
  ! grep -Eq 'fixture-user|fixture-password' "$tmp/args" || rc=1
  grep -q 'fixture-user:fixture-password' "$tmp/config" || rc=1
  rm -rf "$tmp"
  return "$rc"
}
run_test "curl control auth is passed via stdin config, not process arguments" test_auth_stays_off_argv

test_stop_matches_only_exact_server_port() {
  local tmp rc=0
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/proc/101" "$tmp/proc/102" "$tmp/proc/103" "$tmp/proc/104" "$tmp/bin"
  printf '%s\0' node /app/opencode web --port 10001 > "$tmp/proc/101/cmdline"
  printf '%s\0' node /app/opencode run --port 10001 > "$tmp/proc/102/cmdline"
  printf '%s\0' node /app/opencode serve --port 10002 > "$tmp/proc/103/cmdline"
  printf '%s\0' node /app/other web --port 10001 > "$tmp/proc/104/cmdline"
  cat > "$tmp/bin/kill" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$1" >> "$KILL_LOG"
STUB
  chmod +x "$tmp/bin/kill"
  local stopped
  stopped="$(VPN_PROC_ROOT="$tmp/proc" VPN_KILL_BIN="$tmp/bin/kill" KILL_LOG="$tmp/KILL_LOG" \
    bash "$SCRIPTS_DIR/vpn-opencode-processes" 10001)" || rc=1
  [[ "$stopped" == 1 && "$(<"$tmp/KILL_LOG")" == 101 ]] || rc=1
  rm -rf "$tmp"
  return "$rc"
}
run_test "vpn-opencode stop kills only matching OpenCode web/serve port" test_stop_matches_only_exact_server_port


# 2. Validação de argumentos e códigos de erro de vpn-switch
expect_code 2 bash "${SCRIPTS_DIR}/vpn-switch"
expect_code 2 bash "${SCRIPTS_DIR}/vpn-switch" perfil-invalido

# 3. Validação de vpn-hosts-import
expect_code 2 bash "${SCRIPTS_DIR}/vpn-hosts-import"
expect_code 2 bash "${SCRIPTS_DIR}/vpn-hosts-import" --domain "*.invalido"

# 4. Validação de vpn-hosts-gen
expect_code 2 /usr/bin/env LOCAL_HOSTS="host_invalido_sem_ip" bash "${SCRIPTS_DIR}/vpn-hosts-gen"

# 5. Validação de vpn-opencode
expect_code 2 bash "${SCRIPTS_DIR}/vpn-opencode" modo-invalido
expect_code 2 bash "${SCRIPTS_DIR}/vpn-opencode" web --port 99999

# 6. vpn-server-rotate --countries
test_rotate_countries() {
  local tmp cap rc
  tmp="$(mktemp -d)"
  cap="${tmp}/capture"
  printf 'chave-de-teste' > "${tmp}/api_key"
  cat > "${tmp}/curl" <<'STUB'
#!/usr/bin/env bash
cat >/dev/null # consume curl's stdin config so pipefail does not turn a stub race into a false request failure
printf '%s\n' "$*" >> "${CAPTURE_FILE}"
printf '{}'
exit 0
STUB
  printf '#!/usr/bin/env bash\nexit 0\n' > "${tmp}/vpn-reconnect"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${tmp}/vpn-check"
  chmod +x "${tmp}/curl" "${tmp}/vpn-reconnect" "${tmp}/vpn-check"
  CAPTURE_FILE="$cap" PATH="${tmp}:${PATH}" \
    GLUETUN_API_KEY_FILE="${tmp}/api_key" GLUETUN_API_URL="http://stub" \
    VPN_CONTROL_LOCK_FILE="${tmp}/operation.lock" \
    VPN_ROTATE_STATE_FILE="${tmp}/rotate.index" \
    VPN_SERVER_HOSTNAMES="" \
    bash "${SCRIPTS_DIR}/vpn-server-rotate" --countries "Brazil, Argentina" >/dev/null 2>&1 || { rm -rf "$tmp"; return 1; }
  grep -q '"countries":\["Brazil","Argentina"\]' "$cap" && grep -q '"hostnames":\[\]' "$cap"
  rc=$?
  rm -rf "$tmp"
  return $rc
}
run_test "rotate --countries envia países e limpa hostnames" test_rotate_countries

test_rotate_random_keeps_hostnames() {
  local tmp cap rc
  tmp="$(mktemp -d)"
  cap="${tmp}/capture"
  printf 'chave-de-teste' > "${tmp}/api_key"
  cat > "${tmp}/curl" <<'STUB'
#!/usr/bin/env bash
cat >/dev/null
if [[ "$*" == *"http://stub/v1/vpn/settings" && "$*" != *"-X PUT"* ]]; then
  printf '%s' '{"provider":{"server_selection":{"hostnames":["a.example"],"countries":["brazil"]}}}'
  exit 0
fi
printf '%s\n' "$*" >> "${CAPTURE_FILE}"
printf '{}'
exit 0
STUB
  printf '#!/usr/bin/env bash\nexit 0\n' > "${tmp}/vpn-reconnect"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${tmp}/vpn-check"
  chmod +x "${tmp}/curl" "${tmp}/vpn-reconnect" "${tmp}/vpn-check"
  CAPTURE_FILE="$cap" PATH="${tmp}:${PATH}" \
    GLUETUN_API_KEY_FILE="${tmp}/api_key" GLUETUN_API_URL="http://stub" \
    VPN_CONTROL_LOCK_FILE="${tmp}/operation.lock" \
    VPN_ROTATE_STATE_FILE="${tmp}/rotate.index" \
    VPN_SERVER_HOSTNAMES="a.example,b.example" \
    bash "${SCRIPTS_DIR}/vpn-server-rotate" --random >/dev/null 2>&1 || { rm -rf "$tmp"; return 1; }
  # --random escolhe DENTRO da lista: o patch mantém hostnames (não os limpa).
  grep -q '"hostnames":\["a.example"\]' "$cap" || grep -q '"hostnames":\["b.example"\]' "$cap"
  rc=$?
  rm -rf "$tmp"
  return $rc
}
run_test "rotate --random preserva a lista de hostnames" test_rotate_random_keeps_hostnames

test_rotate_reverts_on_reconnect_failure() {
  local tmp cap rc=0
  tmp="$(mktemp -d)"
  cap="${tmp}/capture"
  printf 'chave-de-teste' > "${tmp}/api_key"
  cat > "${tmp}/curl" <<'STUB'
#!/usr/bin/env bash
cat >/dev/null
if [[ "$*" == *"http://stub/v1/vpn/settings" && "$*" != *"-X PUT"* ]]; then
  printf '%s' '{"provider":{"server_selection":{"hostnames":["a.example"],"countries":["brazil"]}}}'
  exit 0
fi
printf '%s\n' "$*" >> "${CAPTURE_FILE}"
printf '{}'
exit 0
STUB
  printf '#!/usr/bin/env bash\nexit 1\n' > "${tmp}/vpn-reconnect"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${tmp}/vpn-check"
  chmod +x "${tmp}/curl" "${tmp}/vpn-reconnect" "${tmp}/vpn-check"
  printf '0\n' > "${tmp}/rotate.index"
  CAPTURE_FILE="$cap" PATH="${tmp}:${PATH}" \
    GLUETUN_API_KEY_FILE="${tmp}/api_key" GLUETUN_API_URL="http://stub" \
    VPN_CONTROL_LOCK_FILE="${tmp}/operation.lock" \
    VPN_ROTATE_STATE_FILE="${tmp}/rotate.index" \
    VPN_SERVER_HOSTNAMES="a.example,b.example" \
    bash "${SCRIPTS_DIR}/vpn-server-rotate" >/dev/null 2>&1 && { rm -rf "$tmp"; return 1; }
  # Falha na reconexão reverte para o servidor anterior (dois PUTs: troca + revert).
  grep -q '"hostnames":\["b.example"\]' "$cap" || rc=1
  grep -q '"hostnames":\["a.example"\],"countries":\["brazil"\]' "$cap" || rc=1
  rm -rf "$tmp"
  return $rc
}
run_test "rotate reverte o servidor quando a reconexão falha" test_rotate_reverts_on_reconnect_failure

test_rotate_reverts_on_unhealthy_tunnel() {
  local tmp cap rc=0
  tmp="$(mktemp -d)"
  cap="${tmp}/capture"
  printf 'chave-de-teste' > "${tmp}/api_key"
  cat > "${tmp}/curl" <<'STUB'
#!/usr/bin/env bash
cat >/dev/null
if [[ "$*" == *"http://stub/v1/vpn/settings" && "$*" != *"-X PUT"* ]]; then
  printf '%s' '{"provider":{"server_selection":{"hostnames":["a.example"],"countries":["brazil"]}}}'
  exit 0
fi
printf '%s\n' "$*" >> "${CAPTURE_FILE}"
printf '{}'
exit 0
STUB
  printf '#!/usr/bin/env bash\nexit 0\n' > "${tmp}/vpn-reconnect"
  printf '#!/usr/bin/env bash\nexit 1\n' > "${tmp}/vpn-check"
  chmod +x "${tmp}/curl" "${tmp}/vpn-reconnect" "${tmp}/vpn-check"
  printf '0\n' > "${tmp}/rotate.index"
  CAPTURE_FILE="$cap" PATH="${tmp}:${PATH}" \
    GLUETUN_API_KEY_FILE="${tmp}/api_key" GLUETUN_API_URL="http://stub" \
    VPN_CONTROL_LOCK_FILE="${tmp}/operation.lock" \
    VPN_ROTATE_STATE_FILE="${tmp}/rotate.index" \
    VPN_SERVER_HOSTNAMES="a.example,b.example" \
    bash "${SCRIPTS_DIR}/vpn-server-rotate" >/dev/null 2>&1 && { rm -rf "$tmp"; return 1; }
  grep -q '"hostnames":\["a.example"\],"countries":\["brazil"\]' "$cap" || rc=1
  rm -rf "$tmp"
  return $rc
}
run_test "rotate reverte o servidor quando o túnel fica insaudável" test_rotate_reverts_on_unhealthy_tunnel

test_rotate_single_server_noop() {
  local tmp rc=0
  tmp="$(mktemp -d)"
  printf 'chave-de-teste' > "${tmp}/api_key"
  cat > "${tmp}/curl" <<'STUB'
#!/usr/bin/env bash
cat >/dev/null
printf '{"provider":{"server_selection":{"hostnames":["br1.nordvpn.com"],"countries":[]}}}'
exit 0
STUB
  chmod +x "${tmp}/curl"
  PATH="${tmp}:${PATH}" GLUETUN_API_KEY_FILE="${tmp}/api_key" GLUETUN_API_URL="http://stub" \
    VPN_CONTROL_LOCK_FILE="${tmp}/operation.lock" VPN_ROTATE_STATE_FILE="${tmp}/rotate.index" \
    VPN_SERVER_HOSTNAMES="br1.nordvpn.com" \
    bash "${SCRIPTS_DIR}/vpn-server-rotate" >/dev/null 2>&1
  rc=$?
  rm -rf "$tmp"
  # rc 3 (no-op), nunca 0: o túnel não foi alterado e o auto-reconnect não
  # pode declarar saúde falsa a partir deste retorno.
  [[ "$rc" == 3 ]]
}
run_test "rotate com 1 servidor é no-op e retorna 3 (não 0)" test_rotate_single_server_noop

test_auto_reconnect_noop_not_healthy() {
  local tmp state rc=0
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/bin"
  printf '#!/usr/bin/env bash\nexit 1\n' > "$tmp/bin/vpn-check"
  printf '#!/usr/bin/env bash\nexit 1\n' > "$tmp/bin/vpn-reconnect"
  printf '#!/usr/bin/env bash\nexit 3\n' > "$tmp/bin/vpn-server-rotate"
  chmod +x "$tmp/bin/"*
  PATH="$tmp/bin:$PATH" \
    VPN_AUTO_RECONNECT_STATE_FILE="$tmp/state" \
    VPN_AUTO_RECONNECT_COUNT_FILE="$tmp/count" \
    VPN_AUTO_RECONNECT_ROTATE_LAST_FILE="$tmp/rotate.last" \
    VPN_RECONNECT_INTERVAL_SECONDS=1 VPN_RECONNECT_RETRY_SECONDS=1 \
    VPN_ROTATE_SERVERS=true VPN_RECONNECT_ATTEMPTS_BEFORE_ROTATE=1 \
    timeout 6 bash "${SCRIPTS_DIR}/vpn-auto-reconnect" >/dev/null 2>&1 || true
  state="$(cat "$tmp/state" 2>/dev/null || echo missing)"
  [[ "$state" != healthy ]] || { echo "auto-reconnect declarou healthy com rotate no-op e túnel morto: $state" >&2; rc=1; }
  rm -rf "$tmp"
  return "$rc"
}
run_test "auto-reconnect não declara healthy quando rotate é no-op" test_auto_reconnect_noop_not_healthy

test_auto_reconnect_invalid_rotate_interval() {
  local rc=0
  VPN_AUTO_RECONNECT_STATE_FILE=/tmp/vpn-ar-invalid.state \
    VPN_ROTATE_INTERVAL_SECONDS=abc \
    bash "${SCRIPTS_DIR}/vpn-auto-reconnect" >/dev/null 2>&1
  rc=$?
  rm -f /tmp/vpn-ar-invalid.state
  [[ "$rc" == 2 ]]
}
run_test "auto-reconnect rejeita VPN_ROTATE_INTERVAL_SECONDS não numérico" test_auto_reconnect_invalid_rotate_interval

test_host_control_defaults() {
  local out url key
  out="$(VPN_WORKSPACE_CONTAINER= VPN_CONTROL_FORCE_HOST=1 bash -c "
    source '${SCRIPTS_DIR}/vpn-control-api.sh'
    vpn_control_default_url
    vpn_control_default_key_file '${SCRIPTS_DIR}'
  ")" || return 1
  url="$(sed -n '1p' <<<"$out")"
  key="$(sed -n '2p' <<<"$out")"
  [[ "$url" == "http://127.0.0.1:18000" ]] || { echo "URL padrão do host inesperada: $url" >&2; return 1; }
  [[ "$key" == "${ROOT_DIR}/.secrets/gluetun_api_key" ]] || { echo "segredo padrão do host inesperado: $key" >&2; return 1; }
  out="$(VPN_WORKSPACE_CONTAINER=1 bash -c "
    source '${SCRIPTS_DIR}/vpn-control-api.sh'
    vpn_control_default_url
  ")" || return 1
  url="$(sed -n '1p' <<<"$out")"
  [[ "$url" == "http://127.0.0.1:8000" ]] || { echo "URL padrão do container inesperada: $url" >&2; return 1; }
  return 0
}
run_test "defaults de API: host usa porta de controle publicada; container usa 8000" test_host_control_defaults

test_lock_dir_is_honored() {
  local tmp out rc=0
  tmp="$(mktemp -d)"
  # unset interno: FILE ambiente (exportado no workspace) tem precedência
  # documentada sobre DIR e tornava o teste não hermético (falha fora do CI).
  out="$(VPN_CONTROL_LOCK_DIR="${tmp}/lock" bash -c "
    unset VPN_CONTROL_LOCK_FILE
    source '${SCRIPTS_DIR}/vpn-control-lock.sh'
    vpn_control_lock_acquire && printf acquired
  ")" || rc=1
  [[ "$out" == acquired ]] || rc=1
  [[ -e "${tmp}/lock/operation.lock" ]] || rc=1
  # Caminho explicitamente pedido e não gravável falha alto (sem fallback silencioso).
  out="$(VPN_CONTROL_LOCK_FILE="/proc/vpn-lock-forbidden/operation.lock" bash -c "
    source '${SCRIPTS_DIR}/vpn-control-lock.sh'
    vpn_control_lock_acquire && printf acquired
  " 2>/dev/null)" && rc=1
  rm -rf "$tmp"
  return "$rc"
}
run_test "lock respeita VPN_CONTROL_LOCK_DIR e falha alto em caminho explícito inválido" test_lock_dir_is_honored
expect_code 2 bash "${SCRIPTS_DIR}/vpn-server-rotate" --countries ""
expect_code 2 bash "${SCRIPTS_DIR}/vpn-server-rotate" --countries "Brazil" --to br71.nordvpn.com


# 7. Testes do vpn-doctor
run_test "vpn-doctor emite JSON válido com jq" bash -c "${SCRIPTS_DIR}/vpn-doctor --json | jq empty"

# 8. vpn-top --json mascara credenciais do Gluetun (curl simulado no PATH)
test_vpn_top_redact() {
  local tmp out
  tmp="$(mktemp -d)"
  printf 'chave-de-teste' > "${tmp}/api_key"
  cat > "${tmp}/curl" <<'STUB'
#!/usr/bin/env bash
cat >/dev/null
case "$*" in
  *"/v1/vpn/status") printf '{"status":"running"}' ;;
  *"/v1/vpn/settings") printf '{"type":"openvpn","openvpn":{"user":"SECRETO-user","password":"SECRETO-pass","key":"SECRETO-key","key_passphrase":"SECRETO-passphrase","encrypted_key":"SECRETO-enc"},"provider":{"port_forwarding":{"username":"SECRETO-pfu","password":"SECRETO-pfp"}},"wireguard":{"private_key":"SECRETO-wg","pre_shared_key":"SECRETO-psk"}}' ;;
  *"/v1/publicip/ip") printf '{"public_ip":"203.0.113.10"}' ;;
  *"/v1/dns/status") printf '{"status":"running"}' ;;
  *) printf '{}' ;;
esac
exit 0
STUB
  chmod +x "${tmp}/curl"
  if ! out="$(PATH="${tmp}:${PATH}" GLUETUN_API_KEY_FILE="${tmp}/api_key" bash "${SCRIPTS_DIR}/vpn-top" --json 2>/dev/null)"; then
    rm -rf "${tmp}"
    return 1
  fi
  rm -rf "${tmp}"
  [[ -n "$out" ]] || return 1
  printf '%s' "$out" | jq -e '
    .settings.openvpn.user == "***" and
    .settings.openvpn.password == "***" and
    .settings.openvpn.key == "***" and
    .settings.openvpn.key_passphrase == "***" and
    .settings.openvpn.encrypted_key == "***" and
    .settings.provider.port_forwarding.username == "***" and
    .settings.provider.port_forwarding.password == "***" and
    .settings.wireguard.private_key == "***" and
    .settings.wireguard.pre_shared_key == "***"
  ' >/dev/null 2>&1 || return 1
  ! printf '%s' "$out" | grep -q 'SECRETO-'
}
run_test "vpn-top --json mascara credenciais do Gluetun" test_vpn_top_redact

# 9. Paridade da home no modo Windows: vpn-home-link em sandbox (sem Docker).
test_home_link() {
  local sandbox host_home cont_home
  sandbox="$(mktemp -d)"
  host_home="${sandbox}/host-home"
  cont_home="${sandbox}/container-home"
  mkdir -p "${host_home}/.opencode/skills" "${host_home}/.config/opencode" "${cont_home}"
  echo cfg > "${host_home}/.config/opencode/opencode.json"
  echo tui > "${host_home}/.config/opencode/tui.json"
  mkdir -p "${host_home}/.config/opencode/agents" "${host_home}/.config/opencode/node_modules" "${host_home}/.local/share/opencode"
  echo agent > "${host_home}/.config/opencode/agents/reviewer.md"
  echo nm > "${host_home}/.config/opencode/node_modules/pkg.js"
  echo auth > "${host_home}/.local/share/opencode/auth.json"
  echo git > "${host_home}/.gitconfig"
  local env_prefix=(/usr/bin/env "HOME=${cont_home}" "HOST_HOME_MOUNT=${host_home}" "WINDOWS_HOME_LINKS=.opencode/skills .config/opencode/opencode.json .gitconfig")
  "${env_prefix[@]}" bash "${SCRIPTS_DIR}/vpn-home-link" >/dev/null 2>&1 || { rm -rf "${sandbox}"; return 1; }
  [[ "$(readlink "${cont_home}/.config/opencode/opencode.json")" == "${host_home}/.config/opencode/opencode.json" ]] || { rm -rf "${sandbox}"; return 1; }
  [[ -L "${cont_home}/.opencode/skills" ]] || { rm -rf "${sandbox}"; return 1; }
  # Paridade completa do config do OpenCode (default): tui.json/agents/auth.json
  # linkados; node_modules permanece local ao container.
  /usr/bin/env -u WINDOWS_HOME_LINKS "HOME=${cont_home}" "HOST_HOME_MOUNT=${host_home}" \
    bash "${SCRIPTS_DIR}/vpn-home-link" >/dev/null 2>&1 || { rm -rf "${sandbox}"; return 1; }
  [[ -L "${cont_home}/.config/opencode/tui.json" ]] || { rm -rf "${sandbox}"; return 1; }
  [[ -L "${cont_home}/.config/opencode/agents" ]] || { rm -rf "${sandbox}"; return 1; }
  [[ -L "${cont_home}/.local/share/opencode/auth.json" ]] || { rm -rf "${sandbox}"; return 1; }
  [[ ! -e "${cont_home}/.config/opencode/node_modules" ]] || { rm -rf "${sandbox}"; return 1; }
  # Idempotencia: segundo run nao falha nem gera backup duplicado.
  "${env_prefix[@]}" bash "${SCRIPTS_DIR}/vpn-home-link" >/dev/null 2>&1 || { rm -rf "${sandbox}"; return 1; }
  # Alvo real existente no volume vira backup antes do link.
  rm -f "${cont_home}/.gitconfig"
  echo local > "${cont_home}/.gitconfig"
  /usr/bin/env "HOME=${cont_home}" "HOST_HOME_MOUNT=${host_home}" "WINDOWS_HOME_LINKS=.gitconfig" \
    bash "${SCRIPTS_DIR}/vpn-home-link" >/dev/null 2>&1 || { rm -rf "${sandbox}"; return 1; }
  [[ -L "${cont_home}/.gitconfig" && -f "${cont_home}/.gitconfig.volume-backup" ]] || { rm -rf "${sandbox}"; return 1; }
  rm -rf "${sandbox}"
}
run_test "vpn-home-link cria symlinks idempotentes com backup" test_home_link

# 10. Snapshot de sessoes do OpenCode: round-trip pull/push do vpn-session-sync.
test_session_sync() {
  local sandbox share staging
  sandbox="$(mktemp -d)"
  share="${sandbox}/home/.local/share/opencode"
  staging="${sandbox}/staging"
  mkdir -p "${share}" "${staging}/opencode"
  printf 'db-host' > "${staging}/opencode/opencode.db"
  printf 'wal-host' > "${staging}/opencode/opencode.db-wal"
  # pull: staging -> home do container (FORCE: ignora opencode serve do host).
  /usr/bin/env "HOME=${sandbox}/home" "VPN_SESSION_SYNC_DIR=${staging}" "VPN_SESSION_VALIDATE=off" "VPN_SESSION_SYNC_FORCE=1" \
    bash "${SCRIPTS_DIR}/vpn-session-sync" pull >/dev/null 2>&1 || { rm -rf "${sandbox}"; return 1; }
  [[ "$(cat "${share}/opencode.db")" == "db-host" ]] || { rm -rf "${sandbox}"; return 1; }
  # push: home -> staging/out (somente arquivos existentes)
  printf 'db-container' > "${share}/opencode.db"
  rm -f "${share}/opencode.db-wal"
  /usr/bin/env "HOME=${sandbox}/home" "VPN_SESSION_SYNC_DIR=${staging}" "VPN_SESSION_VALIDATE=off" "VPN_SESSION_SYNC_FORCE=1" \
    bash "${SCRIPTS_DIR}/vpn-session-sync" push >/dev/null 2>&1 || { rm -rf "${sandbox}"; return 1; }
  [[ "$(cat "${staging}/out/opencode.db")" == "db-container" ]] || { rm -rf "${sandbox}"; return 1; }
  [[ ! -f "${staging}/out/opencode.db-wal" ]] || { rm -rf "${sandbox}"; return 1; }
  rm -rf "${sandbox}"
}
run_test "vpn-session-sync faz round-trip pull/push do banco" test_session_sync

test_session_sync_failed_push_keeps_previous_staging() {
  local sandbox share staging rc=0 code=0
  sandbox="$(mktemp -d)"
  share="${sandbox}/home/.local/share/opencode"
  staging="${sandbox}/staging"
  mkdir -p "$share" "$staging/out" "${sandbox}/bin"
  printf 'broken-new-db' > "$share/opencode.db"
  printf 'valid-previous-staging' > "$staging/out/opencode.db"
  cat > "${sandbox}/bin/node" <<'STUB'
#!/usr/bin/env bash
[[ "${1:-}" == "-e" ]] && exit 3
exit 0
STUB
  chmod +x "${sandbox}/bin/node"
  /usr/bin/env "PATH=${sandbox}/bin:${PATH}" "HOME=${sandbox}/home" "VPN_SESSION_SYNC_DIR=${staging}" "VPN_SESSION_SYNC_FORCE=1" \
    bash "${SCRIPTS_DIR}/vpn-session-sync" push >/dev/null 2>&1 || code=$?
  [[ "$code" -eq 1 ]] || rc=1
  [[ "$(cat "$staging/out/opencode.db")" == "valid-previous-staging" ]] || rc=1
  rm -rf "$sandbox"
  return "$rc"
}
run_test "vpn-session-sync reports failed push and preserves old staging" test_session_sync_failed_push_keeps_previous_staging

# 11. vpn-session-sync autopull/autopush (wrapper do opencode): respeitam mtime.
test_session_sync_auto() {
  local sandbox share host_share staging
  sandbox="$(mktemp -d)"
  share="${sandbox}/home/.local/share/opencode"
  host_share="${sandbox}/host/.local/share/opencode"
  staging="${sandbox}/staging"
  mkdir -p "$share" "$host_share" "$staging"
  # Host mais novo -> autopull importa (e guarda backup do banco anterior).
  printf 'db-host' > "${host_share}/opencode.db"
  printf 'db-antigo' > "${share}/opencode.db"
  touch -d '2020-01-01 00:00:00' "${share}/opencode.db"
  /usr/bin/env "HOME=${sandbox}/home" "VPN_SESSION_SYNC_DIR=${staging}" "VPN_HOST_SHARE_DIR=${host_share}" "VPN_SESSION_VALIDATE=off" "VPN_SESSION_SYNC_FORCE=1" \
    bash "${SCRIPTS_DIR}/vpn-session-sync" autopull >/dev/null 2>&1 || { rm -rf "${sandbox}"; return 1; }
  [[ "$(cat "${share}/opencode.db")" == "db-host" ]] || { rm -rf "${sandbox}"; return 1; }
  [[ -f "${share}/opencode.db.bak" ]] || { rm -rf "${sandbox}"; return 1; }
  # Container mais novo -> autopush publica no staging.
  printf 'db-container' > "${share}/opencode.db"
  /usr/bin/env "HOME=${sandbox}/home" "VPN_SESSION_SYNC_DIR=${staging}" "VPN_HOST_SHARE_DIR=${host_share}" "VPN_SESSION_VALIDATE=off" "VPN_SESSION_SYNC_FORCE=1" \
    bash "${SCRIPTS_DIR}/vpn-session-sync" autopush >/dev/null 2>&1 || { rm -rf "${sandbox}"; return 1; }
  [[ "$(cat "${staging}/out/opencode.db")" == "db-container" ]] || { rm -rf "${sandbox}"; return 1; }
  # Host mais antigo -> autopull NAO sobrescreve o container.
  touch -d '2020-01-01 00:00:00' "${host_share}/opencode.db"
  /usr/bin/env "HOME=${sandbox}/home" "VPN_SESSION_SYNC_DIR=${staging}" "VPN_HOST_SHARE_DIR=${host_share}" "VPN_SESSION_VALIDATE=off" "VPN_SESSION_SYNC_FORCE=1" \
    bash "${SCRIPTS_DIR}/vpn-session-sync" autopull >/dev/null 2>&1 || { rm -rf "${sandbox}"; return 1; }
  [[ "$(cat "${share}/opencode.db")" == "db-container" ]] || { rm -rf "${sandbox}"; return 1; }
  rm -rf "${sandbox}"
}
run_test "vpn-session-sync autopull/autopush respeitam mtime" test_session_sync_auto

# 12. Config ALSA nula: sem placa de som no container, o device default vai para
# o plugin null (o cli.json do host tem attention.sound=true; sem isso o TUI
# imprime "ALSA lib ... Unknown PCM default").
test_alsa_null_conf() {
  local conf="${ROOT_DIR}/config/alsa-null.conf"
  [[ -f "$conf" ]] || return 1
  grep -q 'pcm.!default' "$conf" || return 1
  grep -q 'type null' "$conf" || return 1
}
run_test "alsa-null.conf redireciona o device default para null" test_alsa_null_conf

# 13. Wrapper carrega XKIRO_API_KEY do arquivo de segredo (o container nao herda
# o ambiente do host; vale para TUI, run e serve).
test_wrapper_xkiro_key() {
  local sandbox fake_bin keyfile out
  sandbox="$(mktemp -d)"
  fake_bin="${sandbox}/opencode-real"
  keyfile="${sandbox}/xkiro_key"
  printf '#!/usr/bin/env bash\necho "KEY=${XKIRO_API_KEY:-}"\n' > "$fake_bin"
  chmod +x "$fake_bin"
  printf 'chave-de-teste\n' > "$keyfile"
  out="$(/usr/bin/env -u XKIRO_API_KEY "VPN_OPENCODE_REAL=${fake_bin}" "VPN_XKIRO_KEY_FILE=${keyfile}" \
    bash "${SCRIPTS_DIR}/vpn-opencode-wrapper" foo 2>/dev/null)"
  rm -rf "${sandbox}"
  [[ "$out" == "KEY=chave-de-teste" ]]
}
run_test "wrapper carrega XKIRO_API_KEY do arquivo de segredo" test_wrapper_xkiro_key

# 14. Classificação HTTP do vpn-opencode check. Precisa de socat para servir
# respostas; sem ele o bloco é pulado em vez de reprovar a suíte.
if command -v socat >/dev/null 2>&1; then
  # A stack no ar publica 10000-10010; portas fixas nessa faixa falhavam no
  # host. Escolhe uma porta livre e restringe VPN_PORT_RANGE a ela no check.
  # O probe usa timeout: socat que consegue bind fica escutando (exit 124);
  # porta ocupada falha antes (exit != 124).
  free_port() {
    local p rc
    for p in $(seq "${1:-20000}" "${2:-20100}"); do
      timeout 0.4 socat /dev/null "TCP-LISTEN:${p},reuseaddr,bind=127.0.0.1" >/dev/null 2>&1
      rc=$?
      [[ "$rc" -eq 124 ]] && { printf '%s\n' "$p"; return 0; }
    done
    return 1
  }
  # O check abre a conexão uma vez para o teste de TCP e outra para o HTTP,
  # então cada conexão precisa receber uma resposta própria. Compartilhar a
  # stdin entre filhos `fork` de socat permite que o probe TCP consuma a
  # resposta que deveria chegar ao curl.
  check_http_detail() {
    local code="$1" body="$2" expected="$3"
    local port response_file got docker_stub server_pid
    port="$(free_port 20000 20100)" || { echo "sem porta TCP livre em 20000-20100." >&2; return 1; }
    # Stub de docker: com a stack no ar o check leria logs do terminal
    # (quota-pattern-in-logs) e o resultado deixaria de ser determinístico.
    docker_stub="$(mktemp -d)"
    printf '#!/usr/bin/env bash\nexit 0\n' > "${docker_stub}/docker"
    chmod +x "${docker_stub}/docker"
    response_file="${docker_stub}/response.http"
    printf 'HTTP/1.1 %s X\r\nContent-Type: text/plain\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s' \
      "$code" "${#body}" "$body" > "$response_file"
    socat "TCP-LISTEN:${port},fork,reuseaddr" "SYSTEM:cat '${response_file}'" \
      >/dev/null 2>&1 &
    server_pid=$!
    sleep 0.5
    got="$(PATH="${docker_stub}:${PATH}" VPN_PORT_RANGE="${port}-${port}" \
      bash "${SCRIPTS_DIR}/vpn-opencode" check --port "$port" --json 2>/dev/null \
      | jq -r '.detail // "sem-json"')" || true
    kill "$server_pid" >/dev/null 2>&1 || true
    wait "$server_pid" 2>/dev/null || true
    rm -rf "${docker_stub}"
    sleep 0.3
    [[ "$got" == "$expected" ]] || {
      echo "vpn-opencode check detail mismatch: expected=$expected actual=${got:-<empty>}" >&2
      return 1
    }
  }
  run_test "check: HTTP 200 neutro -> ouvindo" check_http_detail 200 "OK" "ouvindo"
  run_test "check: HTTP 402 -> credit-exhausted" check_http_detail 402 "CreditLimitExceeded" "credit-exhausted"
  run_test "check: HTTP 429 Zen -> zen-usage-limit" check_http_detail 429 "FreeUsageLimitError" "zen-usage-limit"
  run_test "check: HTTP 429 genérico -> rate-limit" check_http_detail 429 "too many requests" "rate-limit"
  run_test "check: HTTP 200 com padrão de quota" check_http_detail 200 "quota exceeded" "quota-pattern-in-http"
else
  echo "socat ausente: testes de classificação HTTP do check pulados."
fi

# 15. Bind em LAN exige senha do painel (OPENCODE_GUI_PASSWORD_FILE), com
# paridade no vpn.ps1. Stubs de docker/ss mantêm o teste hermético (não
# depende do Docker, do ss do host nem de um .env preenchido).
test_switch_lan_bind_requires_gui_password() {
  local stub out rc
  stub="$(mktemp -d)"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${stub}/docker"
  chmod +x "${stub}/docker"
  rc=0
  out="$(PATH="${stub}:${PATH}" HOST_BIND_ADDRESS=192.168.50.10 OPENCODE_GUI_PASSWORD_FILE= \
    VPN_HOSTS_SNIPPET_FILE="${stub}/hosts.gen" LOCAL_HOSTS= VPN_SERVER_HOSTNAMES= INTERNAL_DNS= \
    bash "${SCRIPTS_DIR}/vpn-switch" nordvpn-openvpn 2>&1)" || rc=$?
  rm -rf "${stub}"
  [[ "$rc" -eq 2 ]] || { printf '%s\n' "$out" >&2; return 1; }
  grep -q 'OPENCODE_GUI_PASSWORD_FILE' <<<"$out" || { printf '%s\n' "$out" >&2; return 1; }
}
run_test "vpn-switch: bind LAN sem senha do painel falha antes do up" test_switch_lan_bind_requires_gui_password

test_switch_lan_bind_with_gui_password_passes() {
  local stub pwfile out rc
  stub="$(mktemp -d)"
  pwfile="${stub}/gui_password"
  printf 'senha-de-teste\n' > "$pwfile"
  printf '#!/usr/bin/env bash\nexit 0\n' > "${stub}/ss"
  cat > "${stub}/docker" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  *"ps -q vpn"*) echo stub-container; exit 0 ;;
  inspect*) echo healthy; exit 0 ;;
esac
exit 0
STUB
  chmod +x "${stub}/ss" "${stub}/docker"
  rc=0
  out="$(PATH="${stub}:${PATH}" HOST_BIND_ADDRESS=192.168.50.10 OPENCODE_GUI_PASSWORD_FILE="$pwfile" \
    VPN_PORT_RANGE=21000 FIREWALL_SUBNETS=192.168.240.10 HOST_HOME_MODE=rw \
    VPN_HOSTS_SNIPPET_FILE="${stub}/hosts.gen" LOCAL_HOSTS= VPN_SERVER_HOSTNAMES= INTERNAL_DNS= \
    VPN_HTTP_PROXY=off \
    bash "${SCRIPTS_DIR}/vpn-switch" nordvpn-openvpn 2>&1)" || rc=$?
  rm -rf "${stub}"
  [[ "$rc" -eq 0 ]] || { printf '%s\n' "$out" >&2; return 1; }
  grep -q 'conectado' <<<"$out" || { printf '%s\n' "$out" >&2; return 1; }
}
run_test "vpn-switch: bind LAN com senha do painel valida e completa o up (stub)" test_switch_lan_bind_with_gui_password_passes

test_switch_lan_proxy_requires_auth() {
  local stub gui_pw out rc=0
  stub="$(mktemp -d)"
  gui_pw="${stub}/gui_password"
  printf 'gui-password-fixture\n' > "$gui_pw"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$stub/docker"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$stub/ss"
  chmod +x "$stub/docker" "$stub/ss"
  out="$(PATH="$stub:$PATH" HOST_BIND_ADDRESS=192.168.50.10 \
    OPENCODE_GUI_PASSWORD_FILE="$gui_pw" VPN_PORT_RANGE=21000 \
    VPN_HTTP_PROXY=on VPN_HTTP_PROXY_PORT=21000 VPN_HTTP_PROXY_USER= \
    VPN_HTTP_PROXY_PASSWORD_FILE= VPN_CONTROL_LOCK_DIR="$stub/lock" \
    FIREWALL_SUBNETS=192.168.240.0/24 VPN_HOSTS_SNIPPET_FILE="$stub/hosts.gen" \
    LOCAL_HOSTS= VPN_SERVER_HOSTNAMES= INTERNAL_DNS= \
    bash "${SCRIPTS_DIR}/vpn-switch" nordvpn-openvpn 2>&1)" || rc=$?
  [[ "$rc" -eq 2 ]] && grep -q 'proxy HTTP exposto na LAN exige' <<<"$out"
  local result=$?
  rm -rf "$stub"
  return "$result"
}
run_test "vpn-switch: proxy em bind LAN exige usuário e senha em arquivo" test_switch_lan_proxy_requires_auth

test_switch_lock_is_nonblocking() {
  local tmp holder rc=0 output
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/bin" "$tmp/lock"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$tmp/bin/docker"
  chmod +x "$tmp/bin/docker"
  ( exec 9>"$tmp/lock/operation.lock"; flock -n 9; : > "$tmp/held"; sleep 5 ) &
  holder=$!
  for _ in {1..50}; do [[ -e "$tmp/held" ]] && break; sleep 0.1; done
  output="$(PATH="$tmp/bin:$PATH" VPN_CONTROL_LOCK_DIR="$tmp/lock" \
    bash "${SCRIPTS_DIR}/vpn-switch" nordvpn-openvpn 2>&1)" || rc=$?
  kill "$holder" 2>/dev/null || true
  wait "$holder" 2>/dev/null || true
  [[ "$rc" -eq 75 ]] && grep -q 'VPN já está sendo alterada' <<<"$output"
  local result=$?
  rm -rf "$tmp"
  return "$result"
}
run_test "vpn-switch: concorrência com outra mutação retorna lock busy" test_switch_lock_is_nonblocking

test_switch_rejects_invalid_port_range() {
  local stub output rc=0
  stub="$(mktemp -d)"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$stub/docker"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$stub/ss"
  chmod +x "$stub/docker" "$stub/ss"
  output="$(PATH="$stub:$PATH" HOST_BIND_ADDRESS=127.0.0.1 VPN_PORT_RANGE=65536 \
    VPN_HTTP_PROXY=off VPN_CONTROL_LOCK_DIR="$stub/lock" \
    FIREWALL_SUBNETS=192.168.240.0/24 VPN_HOSTS_SNIPPET_FILE="$stub/hosts.gen" \
    LOCAL_HOSTS= VPN_SERVER_HOSTNAMES= INTERNAL_DNS= \
    bash "${SCRIPTS_DIR}/vpn-switch" nordvpn-openvpn 2>&1)" || rc=$?
  [[ "$rc" -eq 2 ]] && grep -q 'VPN_PORT_RANGE está fora do intervalo válido' <<<"$output"
  local result=$?
  rm -rf "$stub"
  return "$result"
}
run_test "vpn-switch: rejeita VPN_PORT_RANGE acima de 65535" test_switch_rejects_invalid_port_range

test_rotate_revert_failure_exits_4() {
  local tmp out code=0
  tmp="$(mktemp -d)"
  printf 'chave-de-teste' > "${tmp}/api_key"
  cat > "${tmp}/curl" <<'STUB'
#!/usr/bin/env bash
cat >/dev/null
if [[ "$*" == *"http://stub/v1/vpn/settings" && "$*" != *"-X PUT"* ]]; then
  printf '%s' '{"provider":{"server_selection":{"hostnames":["a.example"],"countries":["brazil"]}}}'
  exit 0
fi
if [[ "$*" == *"-X PUT"* ]]; then
  n=0
  [[ -f "${PUT_COUNT}" ]] && n="$(<"${PUT_COUNT}")"
  n=$((n + 1))
  printf '%s\n' "$n" > "${PUT_COUNT}"
  if ((n == 1)); then printf '{}'; exit 0; fi
  exit 22
fi
printf '{}'
exit 0
STUB
  printf '#!/usr/bin/env bash\nexit 0\n' > "${tmp}/vpn-reconnect"
  printf '#!/usr/bin/env bash\nexit 1\n' > "${tmp}/vpn-check"
  chmod +x "${tmp}/curl" "${tmp}/vpn-reconnect" "${tmp}/vpn-check"
  printf '0\n' > "${tmp}/rotate.index"
  out="$(PUT_COUNT="${tmp}/puts" PATH="${tmp}:${PATH}" \
    GLUETUN_API_KEY_FILE="${tmp}/api_key" GLUETUN_API_URL="http://stub" \
    VPN_CONTROL_LOCK_FILE="${tmp}/operation.lock" \
    VPN_ROTATE_STATE_FILE="${tmp}/rotate.index" \
    VPN_SERVER_HOSTNAMES="a.example,b.example" \
    bash "${SCRIPTS_DIR}/vpn-server-rotate" 2>&1)" || code=$?
  rm -rf "$tmp"
  [[ "$code" -eq 4 ]] || { echo "revert falhou mas exit foi ${code}: ${out}" >&2; return 1; }
  grep -q 'revert falhou' <<<"$out" && grep -q 'a.example' <<<"$out"
}
run_test "rotate: falha no revert retorna 4 e nomeia o servidor anterior" test_rotate_revert_failure_exits_4

test_reconnect_waits_for_stopped() {
  local tmp out code=0
  tmp="$(mktemp -d)"
  printf 'chave-de-teste' > "${tmp}/api_key"
  cat > "${tmp}/curl" <<'STUB'
#!/usr/bin/env bash
cat >/dev/null
case "$*" in
  *'"status":"stopped"'*)
    printf 'put:stopped\n' >> "${SEQ}"; printf '{}'; exit 0 ;;
  *'"status":"running"'*)
    printf 'put:running\n' >> "${SEQ}"; printf '{}'; exit 0 ;;
esac
if [[ "$*" == *"/v1/vpn/status" ]]; then
  n=0
  [[ -f "${STATUS_COUNT}" ]] && n="$(<"${STATUS_COUNT}")"
  n=$((n + 1))
  printf '%s\n' "$n" > "${STATUS_COUNT}"
  if ((n == 1)); then
    printf 'status:running\n' >> "${SEQ}"; printf '{"status":"running"}'
  else
    printf 'status:stopped\n' >> "${SEQ}"; printf '{"status":"stopped"}'
  fi
  exit 0
fi
if [[ "$*" == *"/v1/publicip/ip" ]]; then printf '{"public_ip":"198.51.100.10"}'; exit 0; fi
printf '{}'
exit 0
STUB
  chmod +x "${tmp}/curl"
  out="$(SEQ="${tmp}/seq" STATUS_COUNT="${tmp}/status.count" PATH="${tmp}:${PATH}" \
    GLUETUN_API_KEY_FILE="${tmp}/api_key" GLUETUN_API_URL="http://stub" \
    VPN_CONTROL_LOCK_FILE="${tmp}/operation.lock" \
    VPN_STOP_ATTEMPTS=3 VPN_STOP_DELAY_SECONDS=0 VPN_IP_ATTEMPTS=1 \
    bash "${SCRIPTS_DIR}/vpn-reconnect" 2>&1)" || code=$?
  local result=0
  [[ "$code" -eq 0 ]] || { echo "vpn-reconnect falhou (${code}): ${out}" >&2; result=1; }
  diff -u <(printf 'put:stopped\nstatus:running\nstatus:stopped\nput:running\n') "${tmp}/seq" >/dev/null 2>&1 || {
    echo "sequência inesperada: $(tr '\n' ' ' < "${tmp}/seq" 2>/dev/null)" >&2; result=1;
  }
  rm -rf "$tmp"
  return "$result"
}
run_test "reconnect aguarda Gluetun confirmar stopped antes de subir" test_reconnect_waits_for_stopped

test_auto_reconnect_state_uses_xdg() {
  local tmp state rc=0
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/bin"
  printf '#!/usr/bin/env bash\nexit 1\n' > "$tmp/bin/vpn-check"
  printf '#!/usr/bin/env bash\nexit 1\n' > "$tmp/bin/vpn-reconnect"
  printf '#!/usr/bin/env bash\nexit 3\n' > "$tmp/bin/vpn-server-rotate"
  chmod +x "$tmp/bin/"*
  PATH="$tmp/bin:$PATH" XDG_STATE_HOME="$tmp/state" \
    /usr/bin/env -u VPN_AUTO_RECONNECT_STATE_FILE -u VPN_AUTO_RECONNECT_COUNT_FILE \
      -u VPN_AUTO_RECONNECT_ROTATE_LAST_FILE -u VPN_AUTO_RECONNECT_STATE_DIR \
    VPN_RECONNECT_INTERVAL_SECONDS=1 VPN_RECONNECT_RETRY_SECONDS=1 \
    timeout 4 bash "${SCRIPTS_DIR}/vpn-auto-reconnect" >/dev/null 2>&1 || true
  state="$tmp/state/vpn-dev-workspace/vpn-auto-reconnect.state"
  [[ -f "$state" ]] || { echo "estado não criado em XDG_STATE_HOME: $state" >&2; rc=1; }
  rm -rf "$tmp"
  return "$rc"
}
run_test "auto-reconnect grava estado em XDG_STATE_HOME por padrão" test_auto_reconnect_state_uses_xdg

test_auto_reconnect_mirrors_legacy_state() {
  local tmp legacy state rc=0
  tmp="$(mktemp -d)"
  legacy="${tmp}/legacy.state"
  mkdir -p "$tmp/bin"
  printf '#!/usr/bin/env bash\nexit 1\n' > "$tmp/bin/vpn-check"
  printf '#!/usr/bin/env bash\nexit 1\n' > "$tmp/bin/vpn-reconnect"
  chmod +x "$tmp/bin/"*
  PATH="$tmp/bin:$PATH" \
    VPN_AUTO_RECONNECT_STATE_FILE="${tmp}/new.state" \
    VPN_AUTO_RECONNECT_COUNT_FILE="${tmp}/count" \
    VPN_AUTO_RECONNECT_ROTATE_LAST_FILE="${tmp}/rotate.last" \
    VPN_AUTO_RECONNECT_LEGACY_STATE_FILE="$legacy" \
    VPN_RECONNECT_INTERVAL_SECONDS=1 VPN_RECONNECT_RETRY_SECONDS=1 \
    timeout 3 bash "${SCRIPTS_DIR}/vpn-auto-reconnect" >/dev/null 2>&1 || true
  [[ -f "$legacy" ]] || { echo "estado legado não foi espelhado" >&2; rc=1; }
  state="$(cat "$legacy" 2>/dev/null || true)"
  [[ "$state" =~ ^(recovering|degraded|healthy)$ ]] || { echo "estado legado inválido: $state" >&2; rc=1; }
  rm -rf "$tmp"
  return "$rc"
}
run_test "auto-reconnect espelha estado legado para healthcheck antigo" test_auto_reconnect_mirrors_legacy_state

test_compose_auto_reconnect_healthcheck_path() {
  local compose="${ROOT_DIR}/docker-compose.yml"
  grep -q 'VPN_AUTO_RECONNECT_STATE_DIR: /var/lib/vpn-control/auto-reconnect' "$compose" || return 1
  grep -q '/var/lib/vpn-control/auto-reconnect/vpn-auto-reconnect.state' "$compose" || return 1
  ! grep -q '/tmp/vpn-auto-reconnect.state' "$compose"
}
run_test "healthcheck do Compose lê o estado fora de /tmp" test_compose_auto_reconnect_healthcheck_path

test_vpn_history_records_and_filters() {
  local tmp history rc=0 out
  tmp="$(mktemp -d)"
  history="${tmp}/history.jsonl"
  record() {
    VPN_HISTORY_FILE="$history" GLUETUN_API_KEY_FILE="${tmp}/sem-chave" \
      VPN_LATENCY_TARGET=127.0.0.1:1 bash "${SCRIPTS_DIR}/vpn-history" --record >/dev/null
  }
  record || rc=1
  record || rc=1
  [[ "$(wc -l < "$history")" -eq 2 ]] || { echo "esperado 2 linhas JSONL" >&2; rc=1; }
  out="$(VPN_HISTORY_FILE="$history" bash "${SCRIPTS_DIR}/vpn-history" --json --since 24h)" || rc=1
  [[ "$(jq 'length' <<<"$out")" -eq 2 ]] || { echo "since 24h deveria manter 2" >&2; rc=1; }
  out="$(VPN_HISTORY_FILE="$history" bash "${SCRIPTS_DIR}/vpn-history" --json --limit 1)" || rc=1
  [[ "$(jq 'length' <<<"$out")" -eq 1 ]] || { echo "limit 1 deveria reduzir para 1" >&2; rc=1; }
  jq -e 'all(has("timestamp") and has("public_ip") and has("latency_ms"))' <<<"$out" >/dev/null || rc=1
  VPN_HISTORY_FILE="$history" bash "${SCRIPTS_DIR}/vpn-history" --since bogus >/dev/null 2>&1 && {
    echo "since inválido deveria falhar" >&2; rc=1; }
  rm -rf "$tmp"
  return "$rc"
}
run_test "vpn-history grava JSONL, filtra --since e limita --limit" test_vpn_history_records_and_filters

test_vpn_history_rotates() {
  local tmp history rc=0
  tmp="$(mktemp -d)"
  history="${tmp}/history.jsonl"
  for _ in 1 2 3 4 5; do
    VPN_HISTORY_FILE="$history" VPN_HISTORY_MAX_LINES=2 \
      GLUETUN_API_KEY_FILE="${tmp}/sem-chave" VPN_LATENCY_TARGET=127.0.0.1:1 \
      bash "${SCRIPTS_DIR}/vpn-history" --record >/dev/null || rc=1
  done
  [[ "$(wc -l < "$history")" -eq 2 ]] || { echo "rotação deveria manter 2 linhas" >&2; rc=1; }
  rm -rf "$tmp"
  return "$rc"
}
run_test "vpn-history rotaciona respeitando VPN_HISTORY_MAX_LINES" test_vpn_history_rotates

test_vpn_dispatcher() {
  local rc=0
  bash "${SCRIPTS_DIR}/vpn" help >/dev/null 2>&1 || { echo "help deveria sair 0" >&2; rc=1; }
  local code=0
  bash "${SCRIPTS_DIR}/vpn" comando-inexistente >/dev/null 2>&1 || code=$?
  [[ "$code" -eq 2 ]] || { echo "comando desconhecido deveria sair 2 (obtido $code)" >&2; rc=1; }
  local out
  out="$(VPN_HISTORY_FILE="/tmp/vazio-$$.jsonl" bash "${SCRIPTS_DIR}/vpn" history --json)" || rc=1
  [[ "$out" == "[]" ]] || { echo "vpn history deveria delegar ao vpn-history: $out" >&2; rc=1; }
  return "$rc"
}
run_test "dispatcher vpn responde help e rejeita comando desconhecido" test_vpn_dispatcher

test_vpn_resolve_workdir() {
  local tmp out rc=0
  tmp="$(mktemp -d)"
  # shellcheck source=scripts/vpn-workdir.sh
  source "${SCRIPTS_DIR}/vpn-workdir.sh"
  out="$(VPN_WORKSPACE_ROOTS="$tmp" vpn_resolve_workdir "$tmp")" || rc=1
  [[ "$out" == "$(cd "$tmp" && pwd -P)" ]] || { echo "raiz válida não resolvida: $out" >&2; rc=1; }
  VPN_WORKSPACE_ROOTS="$tmp" vpn_resolve_workdir "/" >/dev/null 2>&1 && {
    echo "diretório fora da raiz deveria falhar" >&2; rc=1; }
  VPN_WORKSPACE_ROOTS="$tmp" vpn_resolve_workdir "${tmp}/inexistente" >/dev/null 2>&1 && {
    echo "diretório inexistente deveria falhar" >&2; rc=1; }
  rm -rf "$tmp"
  return "$rc"
}
run_test "vpn_resolve_workdir valida raiz, existência e limites montados" test_vpn_resolve_workdir

test_gluetun_patch_applies() {
  local rc=0 code=0
  code=0
  bash "${SCRIPTS_DIR}/verify-gluetun-patch" --tag v3.41.3 --patch gluetun/publicip-recovery.patch >/dev/null 2>&1 || code=$?
  if [[ "$code" -eq 2 ]]; then
    echo "rede indisponível: verificação do patch ignorada." >&2
    return 0
  fi
  [[ "$code" -eq 0 ]] || { echo "patch atual não aplica em v3.41.3 (rc=$code)" >&2; rc=1; }
  code=0
  bash "${SCRIPTS_DIR}/verify-gluetun-patch" --tag v3.41.4-rc2 --patch gluetun/publicip-recovery-rc2.patch >/dev/null 2>&1 || code=$?
  if [[ "$code" -eq 2 ]]; then
    echo "rede indisponível: verificação do patch RC ignorada." >&2
    return "$rc"
  fi
  [[ "$code" -eq 0 ]] || { echo "patch RC não aplica em v3.41.4-rc2 (rc=$code)" >&2; rc=1; }
  return "$rc"
}
run_test "patches do Gluetun aplicam no upstream correspondente" test_gluetun_patch_applies

echo "======================================"
printf "Resultado: %d testes executados, %d passaram, %d falharam.\n" "$total" "$passed" "$failed"

if (( failed > 0 )); then
  exit 1
fi
exit 0
