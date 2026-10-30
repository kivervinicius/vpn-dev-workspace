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
for s in vpn-switch vpn-check vpn-status vpn-top vpn-server-rotate vpn-auto-reconnect vpn-opencode vpn-hosts-import vpn-hosts-apply vpn-hosts-gen opencode-supervisor opencode-vpn-install opencode-limit-recover vpn-doctor vpn-setup vpn-shell verify-compose verify-docs; do
  if [[ -f "${SCRIPTS_DIR}/${s}" ]]; then
    run_test "Script ${s} responde a --help com exit 0" bash "${SCRIPTS_DIR}/${s}" --help
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
[[ "${1:-}" == --version ]] && { echo 'OpenCode 1.19.5'; exit 0; }
exit 0
STUB
  cat > "$v2" <<'STUB'
#!/usr/bin/env bash
[[ "${1:-}" == --version ]] && { echo 'OpenCode 2.1.3'; exit 0; }
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
    [[ -f "$home/.opencode-v1/.config/opencode/plugins/vpn-recovery.js" ]] || rc=1
    [[ -f "$home/.config/opencode/plugins/vpn-recovery/package.json" ]] || rc=1
    [[ ! -e "$home/.opencode-v1/.config/opencode/plugins/provider-limit-notify.js" ]] || rc=1
    [[ ! -e "$home/.config/opencode/plugins/provider-limit-notify" ]] || rc=1
    compgen -G "$home/.local/bin/opencode1.backup.*" >/dev/null || rc=1
    compgen -G "$home/.local/bin/opencode2.backup.*" >/dev/null || rc=1
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
test_opencode_launchers_require_vpn() {
  local tmp home v1_home call_log output rc=0
  tmp="$(mktemp -d)"
  home="${tmp}/home"
  v1_home="${home}/.opencode-v1"
  call_log="${tmp}/opencode.calls"
  mkdir -p "${tmp}/bin" "$home/.opencode/bin" "$v1_home/bin" "$home/.local/share/opencode"
  printf 'auth-data\n' > "$home/.local/share/opencode/auth.json"
  cat > "${tmp}/bin/vpn-check" <<'STUB'
#!/usr/bin/env bash
[[ "$*" == "--only tunnel -q" && "${VPN_CHECK_OK:-0}" == 1 ]]
STUB
  cat > "$v1_home/bin/opencode" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$OPENCODE_CALL_LOG"
echo 'OpenCode 1.19.5'
STUB
  cat > "$home/.opencode/bin/opencode" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$OPENCODE_CALL_LOG"
echo 'OpenCode 2.1.3'
STUB
  chmod +x "${tmp}/bin/vpn-check" "$v1_home/bin/opencode" "$home/.opencode/bin/opencode"
  cat > "${tmp}/bin/docker" <<'STUB'
#!/usr/bin/env bash
if [[ "$1" == inspect ]]; then printf 'true\n'; exit 0; fi
[[ "$1" == exec ]] || exit 2
shift
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
    [[ "$output" == 'OpenCode 1.19.5' && "$(<"$v1_home/.local/share/opencode/auth.json")" == auth-data ]] &&
      [[ "$(stat -c '%a' "$v1_home/.local/share/opencode/auth.json")" == 600 ]] || rc=$?
  fi
  if ((rc == 0)); then
    output="$(HOME="$home" VPN_WORKSPACE_CONTAINER=1 VPN_CHECK_OK=1 \
      OPENCODE_CALL_LOG="$call_log" PATH="${tmp}/bin:${PATH}" bash "${SCRIPTS_DIR}/opencode2" --version)" || rc=$?
    [[ "$output" == 'OpenCode 2.1.3' ]] || rc=$?
  fi
  if ((rc == 0)); then
    output="$(HOME="$home" OPENCODE_V1_HOME="$v1_home" OPENCODE_TERMINAL_CONTAINER=test VPN_CHECK_OK=1 \
      OPENCODE_CALL_LOG="$call_log" PATH="${tmp}/bin:${PATH}" \
      bash "${SCRIPTS_DIR}/opencode1" --version)" || rc=$?
    [[ "$output" == 'OpenCode 1.19.5' ]] || rc=$?
  fi
  if ((rc == 0)); then
    output="$(HOME="$home" OPENCODE_TERMINAL_CONTAINER=test VPN_CHECK_OK=1 OPENCODE_CALL_LOG="$call_log" \
      PATH="${tmp}/bin:${PATH}" bash "${SCRIPTS_DIR}/opencode2" --version)" || rc=$?
    [[ "$output" == 'OpenCode 2.1.3' ]] || rc=$?
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
run_test "OpenCode v1/v2 launchers refuse unhealthy VPN and preserve v1 auth" test_opencode_launchers_require_vpn

test_opencode_limit_recover() {
  local tmp rc=0 holder first_pid
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/bin" "$tmp/state"
  local -x PATH="$tmp/bin:$PATH"
  local -x STATUS_FILE="$tmp/status.json"
  local -x ROTATE_LOG="$tmp/rotate.log"
  local -x VPN_CONTROL_LOCK_FILE="$tmp/operation.lock"
  local -x OPENCODE_LIMIT_RECOVERY_STATE_FILE="$tmp/state/recovery.json"
  local -x VPN_SERVER_HOSTNAMES="a.example,b.example"
  local -x OPENCODE_LIMIT_ROTATE_ATTEMPTS=1
  local -x VPN_CHECK_OK=1
  local -x ROTATE_DELAY=0
  local -x ROTATE_MODE=changed

  cat > "$tmp/bin/vpn-status" <<'STUB'
#!/usr/bin/env bash
cat "$STATUS_FILE"
STUB
  cat > "$tmp/bin/vpn-check" <<'STUB'
#!/usr/bin/env bash
[[ "${VPN_CHECK_OK:-1}" == 1 ]]
STUB
  cat > "$tmp/bin/vpn-server-rotate" <<'STUB'
#!/usr/bin/env bash
if [[ -e /proc/self/fd/9 ]]; then flock -n 9 || exit 9; else exit 8; fi
printf '%s\n' "$*" >> "$ROTATE_LOG"
sleep "${ROTATE_DELAY:-0}"
case "${ROTATE_MODE:-changed}" in
  reject) exit 1 ;;
  same) printf '%s\n' '{"vpn":"running","public_ip":"203.0.113.10"}' > "$STATUS_FILE" ;;
  down) printf '%s\n' '{"vpn":"stopped","public_ip":""}' > "$STATUS_FILE" ;;
  empty) printf '%s\n' '{"vpn":"running","public_ip":""}' > "$STATUS_FILE" ;;
  *) printf '%s\n' '{"vpn":"running","public_ip":"203.0.113.20"}' > "$STATUS_FILE" ;;
esac
exit 0
STUB
  chmod +x "$tmp/bin/"*

  reset_case() {
    printf '%s\n' '{"vpn":"running","public_ip":"203.0.113.10"}' > "$STATUS_FILE"
    : > "$ROTATE_LOG"
    rm -f "$OPENCODE_LIMIT_RECOVERY_STATE_FILE"
    VPN_SERVER_HOSTNAMES="a.example,b.example"
    VPN_CHECK_OK=1
    ROTATE_DELAY=0
    ROTATE_MODE=changed
  }
  run_case() {
    local event="$1" want_rc="$2" want_status="$3" want_reason="$4" code=0 json
    json="$(bash "${SCRIPTS_DIR}/opencode-limit-recover" --event "$event" 2>"$tmp/stderr")" || code=$?
    [[ "$code" == "$want_rc" ]] || { printf 'event=%s expected_rc=%s rc=%s mode=%s check=%s json=%s stderr=%s\n' "$event" "$want_rc" "$code" "$ROTATE_MODE" "$VPN_CHECK_OK" "$json" "$(<"$tmp/stderr")" >&2; return 1; }
    jq -e --arg status "$want_status" --arg reason "$want_reason" \
      '.status == $status and .reason == $reason' <<<"$json" >/dev/null || return 1
    printf '%s' "$json"
  }

  reset_case
  run_case free_tier_limit 0 changed ip_changed > "$tmp/last.json" || rc=1
  jq -e '.after_ip == "203.0.113.20" and .target == "a.example"' "$tmp/last.json" >/dev/null || rc=1
  [[ "$(wc -l < "$ROTATE_LOG")" -eq 1 && "$(<"$ROTATE_LOG")" == "--to a.example" ]] || rc=1
  [[ "$(stat -c '%a' "$OPENCODE_LIMIT_RECOVERY_STATE_FILE")" == 600 ]] || rc=1
  jq -e '.confirmed_target == "a.example"' "$OPENCODE_LIMIT_RECOVERY_STATE_FILE" >/dev/null || rc=1

  reset_case
  printf '%s\n' '{"vpn":"running","public_ip":"203.0.113.10","hostnames":["a.example"]}' > "$STATUS_FILE"
  run_case rate_limit 0 changed ip_changed > "$tmp/last.json" || rc=1
  jq -e '.target == "b.example"' "$tmp/last.json" >/dev/null || rc=1


  reset_case
  run_case free_tier_limit 0 changed ip_changed >/dev/null || rc=1
  [[ -s "$ROTATE_LOG" ]] || rc=1

  reset_case
  run_case rate_limit 0 changed ip_changed >/dev/null || rc=1
  [[ -s "$ROTATE_LOG" ]] || rc=1

  reset_case
  run_case account_limit 0 skipped account_limit >/dev/null || rc=1
  [[ ! -s "$ROTATE_LOG" ]] || rc=1

  reset_case
  ROTATE_MODE=same
  run_case rate_limit 1 failed no_verified_change >/dev/null || rc=1
  reset_case
  printf '%s\n' '{"vpn":"running","public_ip":""}' > "$STATUS_FILE"
  run_case rate_limit 1 failed invalid_before_ip >/dev/null || rc=1
  [[ ! -s "$ROTATE_LOG" ]] || rc=1

  reset_case
  ROTATE_MODE=empty
  run_case rate_limit 1 failed no_verified_change >/dev/null || rc=1

  reset_case
  VPN_CHECK_OK=0
  run_case rate_limit 1 failed no_verified_change >/dev/null || rc=1

  reset_case
  ROTATE_MODE=reject
  run_case rate_limit 1 failed no_verified_change >/dev/null || rc=1


  reset_case
  printf '%s\n' '{"vpn":"stopped","public_ip":""}' > "$STATUS_FILE"
  run_case rate_limit 1 failed vpn_not_running >/dev/null || rc=1
  [[ ! -s "$ROTATE_LOG" ]] || rc=1

  reset_case
  VPN_SERVER_HOSTNAMES=""
  run_case rate_limit 1 failed no_candidates >/dev/null || rc=1
  [[ ! -s "$ROTATE_LOG" ]] || rc=1

  reset_case
  VPN_SERVER_HOSTNAMES="only.example"
  printf '%s\n' '{"vpn":"running","public_ip":"203.0.113.10","hostnames":["only.example"]}' > "$STATUS_FILE"
  run_case rate_limit 1 failed no_alternative >/dev/null || rc=1
  [[ ! -s "$ROTATE_LOG" ]] || rc=1


  reset_case
  now="$(date +%s)"
  printf '{"last_event":%s,"events":[%s]}\n' "$now" "$now" > "$OPENCODE_LIMIT_RECOVERY_STATE_FILE"
  run_case rate_limit 0 skipped cooldown >/dev/null || rc=1
  [[ ! -s "$ROTATE_LOG" ]] || rc=1

  reset_case
  printf '{"last_event":%s,"events":[%s,%s,%s,%s,%s,%s]}\n' \
    "$((now - 400))" "$((now - 20))" "$((now - 40))" "$((now - 60))" \
    "$((now - 80))" "$((now - 100))" "$((now - 120))" > "$OPENCODE_LIMIT_RECOVERY_STATE_FILE"
  run_case rate_limit 0 skipped event_limit >/dev/null || rc=1
  [[ ! -s "$ROTATE_LOG" ]] || rc=1

  reset_case
  ROTATE_DELAY=1
  ( bash "${SCRIPTS_DIR}/opencode-limit-recover" --event rate_limit >"$tmp/first.json" 2>"$tmp/first.stderr" ) &
  first_pid=$!
  for _ in {1..50}; do [[ -s "$ROTATE_LOG" ]] && break; sleep 0.1; done
  run_case rate_limit 75 skipped lock_busy > "$tmp/second.json" || rc=1
  wait "$first_pid" || rc=1
  jq -e '.status == "changed"' "$tmp/first.json" >/dev/null || rc=1
  [[ "$(wc -l < "$ROTATE_LOG")" -eq 1 ]] || rc=1

  reset_case
  ( exec 9>"$VPN_CONTROL_LOCK_FILE"; flock -n 9; : > "$tmp/locked"; sleep 5 ) &
  holder=$!
  for _ in {1..50}; do [[ -e "$tmp/locked" ]] && break; sleep 0.1; done
  run_case rate_limit 75 skipped lock_busy >/dev/null || rc=1
  kill "$holder" 2>/dev/null || true
  wait "$holder" 2>/dev/null || true

  reset_case
  code=0
  bash "${SCRIPTS_DIR}/opencode-limit-recover" --event bogus >/dev/null 2>&1 || code=$?
  [[ "$code" == 2 ]] || rc=1

  rm -rf "$tmp"
  return "$rc"
}
run_test "recovery helper changes only on verified new IP and honors limits/lock" test_opencode_limit_recover


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
printf '%s\n' "$*" >> "${CAPTURE_FILE}"
printf '{}'
exit 0
STUB
  printf '#!/usr/bin/env bash\nexit 0\n' > "${tmp}/vpn-reconnect"
  chmod +x "${tmp}/curl" "${tmp}/vpn-reconnect"
  CAPTURE_FILE="$cap" PATH="${tmp}:${PATH}" \
    GLUETUN_API_KEY_FILE="${tmp}/api_key" GLUETUN_API_URL="http://stub" \
    VPN_CONTROL_LOCK_FILE="${tmp}/operation.lock" \
    VPN_SERVER_HOSTNAMES="" \
    bash "${SCRIPTS_DIR}/vpn-server-rotate" --countries "Brazil, Argentina" >/dev/null 2>&1 || { rm -rf "$tmp"; return 1; }
  grep -q '"countries":\["Brazil","Argentina"\]' "$cap" && grep -q '"hostnames":\[\]' "$cap"
  rc=$?
  rm -rf "$tmp"
  return $rc
}
run_test "rotate --countries envia países e limpa hostnames" test_rotate_countries
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
  /usr/bin/env "HOME=${sandbox}/home" "VPN_SESSION_SYNC_DIR=${staging}" "VPN_SESSION_SYNC_FORCE=1" \
    bash "${SCRIPTS_DIR}/vpn-session-sync" pull >/dev/null 2>&1 || { rm -rf "${sandbox}"; return 1; }
  [[ "$(cat "${share}/opencode.db")" == "db-host" ]] || { rm -rf "${sandbox}"; return 1; }
  # push: home -> staging/out (somente arquivos existentes)
  printf 'db-container' > "${share}/opencode.db"
  rm -f "${share}/opencode.db-wal"
  /usr/bin/env "HOME=${sandbox}/home" "VPN_SESSION_SYNC_DIR=${staging}" "VPN_SESSION_SYNC_FORCE=1" \
    bash "${SCRIPTS_DIR}/vpn-session-sync" push >/dev/null 2>&1 || { rm -rf "${sandbox}"; return 1; }
  [[ "$(cat "${staging}/out/opencode.db")" == "db-container" ]] || { rm -rf "${sandbox}"; return 1; }
  [[ ! -f "${staging}/out/opencode.db-wal" ]] || { rm -rf "${sandbox}"; return 1; }
  rm -rf "${sandbox}"
}
run_test "vpn-session-sync faz round-trip pull/push do banco" test_session_sync

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
  # então o servidor precisa aceitar várias conexões (fork).
  check_http_detail() {
    local code="$1" body="$2" expected="$3"
    local port resp got docker_stub
    port="$(free_port 20000 20100)" || { echo "sem porta TCP livre em 20000-20100." >&2; return 1; }
    # Stub de docker: com a stack no ar o check leria logs do terminal
    # (quota-pattern-in-logs) e o resultado deixaria de ser determinístico.
    docker_stub="$(mktemp -d)"
    printf '#!/usr/bin/env bash\nexit 0\n' > "${docker_stub}/docker"
    chmod +x "${docker_stub}/docker"
    resp="$(printf 'HTTP/1.1 %s X\r\nContent-Type: text/plain\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s' \
      "$code" "${#body}" "$body")"
    ( for _ in $(seq 1 40); do printf '%s\n' "$resp"; sleep 0.15; done ) \
      | timeout 10 socat - "TCP-LISTEN:${port},fork,reuseaddr" >/dev/null 2>&1 &
    sleep 0.5
    got="$(PATH="${docker_stub}:${PATH}" VPN_PORT_RANGE="${port}-${port}" \
      bash "${SCRIPTS_DIR}/vpn-opencode" check --port "$port" --json 2>/dev/null \
      | jq -r '.detail // "sem-json"')" || true
    rm -rf "${docker_stub}"
    pkill -f "TCP-LISTEN:${port}" >/dev/null 2>&1 || true
    sleep 0.3
    [[ "$got" == "$expected" ]]
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
    VPN_PORT_RANGE=21000 FIREWALL_SUBNETS=192.168.50.0/24 HOST_HOME_MODE=rw \
    VPN_HOSTS_SNIPPET_FILE="${stub}/hosts.gen" LOCAL_HOSTS= VPN_SERVER_HOSTNAMES= INTERNAL_DNS= \
    VPN_HTTP_PROXY=off \
    bash "${SCRIPTS_DIR}/vpn-switch" nordvpn-openvpn 2>&1)" || rc=$?
  rm -rf "${stub}"
  [[ "$rc" -eq 0 ]] || { printf '%s\n' "$out" >&2; return 1; }
  grep -q 'conectado' <<<"$out" || { printf '%s\n' "$out" >&2; return 1; }
}
run_test "vpn-switch: bind LAN com senha do painel valida e completa o up (stub)" test_switch_lan_bind_with_gui_password_passes

echo "======================================"
printf "Resultado: %d testes executados, %d passaram, %d falharam.\n" "$total" "$passed" "$failed"

if (( failed > 0 )); then
  exit 1
fi
exit 0
