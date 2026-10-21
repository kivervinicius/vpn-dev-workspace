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
  
  if "$@" >/dev/null 2>&1; then
    printf "PASS\n"
    passed=$((passed + 1))
  else
    printf "FAIL\n"
    failed=$((failed + 1))
    echo "  Falha ao executar: $*" >&2
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
for s in vpn-switch vpn-check vpn-status vpn-top vpn-server-rotate vpn-auto-reconnect vpn-opencode vpn-hosts-import vpn-hosts-apply vpn-hosts-gen opencode-supervisor vpn-doctor vpn-setup vpn-shell verify-compose verify-docs; do
  if [[ -f "${SCRIPTS_DIR}/${s}" ]]; then
    run_test "Script ${s} responde a --help com exit 0" bash "${SCRIPTS_DIR}/${s}" --help
  fi
done

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

# 6. Testes do classificador do supervisor do OpenCode
test_classify() {
  local input="$1" expected="$2"
  test "$(bash "${SCRIPTS_DIR}/opencode-supervisor" --classify "$input")" = "$expected"
}
run_test "Supervisor classifica 429 como rate_limit" test_classify "429 Too Many Requests" "rate_limit"
run_test "Supervisor classifica Provider rate limit como rate_limit" test_classify "Provider rate limit exceeded" "rate_limit"
run_test "Supervisor classifica FreeUsageLimitError como free_tier_limit" test_classify "FreeUsageLimitError: Free usage exceeded, subscribe to Go" "free_tier_limit"
run_test "Supervisor classifica Free limit reached como free_tier_limit" test_classify "Free limit reached" "free_tier_limit"
run_test "Supervisor classifica Go limit reached como account_limit" test_classify "Go limit reached: weekly limit reset in 4 days" "account_limit"
run_test "Supervisor classifica CreditLimitExceeded como credit_limit" test_classify "CreditLimitExceeded: credit limit exceeded" "credit_limit"
run_test "Supervisor classifica InsufficientFunds como credit_limit" test_classify "InsufficientFunds: payment required" "credit_limit"
run_test "Supervisor classifica connection lost como disconnect" test_classify "network connection lost during streaming" "disconnect"
run_test "Supervisor classifica normal text como none" test_classify "agent completed successfully" "none"

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
  echo git > "${host_home}/.gitconfig"
  local env_prefix=(/usr/bin/env "HOME=${cont_home}" "HOST_HOME_MOUNT=${host_home}" "WINDOWS_HOME_LINKS=.opencode/skills .config/opencode/opencode.json .gitconfig")
  "${env_prefix[@]}" bash "${SCRIPTS_DIR}/vpn-home-link" >/dev/null 2>&1 || { rm -rf "${sandbox}"; return 1; }
  [[ "$(readlink "${cont_home}/.config/opencode/opencode.json")" == "${host_home}/.config/opencode/opencode.json" ]] || { rm -rf "${sandbox}"; return 1; }
  [[ -L "${cont_home}/.opencode/skills" ]] || { rm -rf "${sandbox}"; return 1; }
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
  # A stack no ar publica 10000-10100; portas fixas nessa faixa falhavam no
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

echo "======================================"
printf "Resultado: %d testes executados, %d passaram, %d falharam.\n" "$total" "$passed" "$failed"

if (( failed > 0 )); then
  exit 1
fi
exit 0
