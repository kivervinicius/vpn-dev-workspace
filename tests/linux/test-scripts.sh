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
for s in vpn-switch vpn-check vpn-status vpn-top vpn-server-rotate vpn-auto-reconnect vpn-opencode vpn-hosts-import vpn-hosts-apply vpn-hosts-gen opencode-supervisor vpn-doctor vpn-setup verify-compose verify-docs; do
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

# 8. Classificação HTTP do vpn-opencode check. Precisa de socat para servir
# respostas; sem ele o bloco é pulado em vez de reprovar a suíte.
if command -v socat >/dev/null 2>&1; then
  # O check abre a conexão uma vez para o teste de TCP e outra para o HTTP,
  # então o servidor precisa aceitar várias conexões (fork).
  check_http_detail() {
    local code="$1" body="$2" port="$3" expected="$4"
    local resp got
    resp="$(printf 'HTTP/1.1 %s X\r\nContent-Type: text/plain\r\nContent-Length: %d\r\nConnection: close\r\n\r\n%s' \
      "$code" "${#body}" "$body")"
    ( for _ in $(seq 1 40); do printf '%s\n' "$resp"; sleep 0.15; done ) \
      | timeout 10 socat - "TCP-LISTEN:${port},fork,reuseaddr" >/dev/null 2>&1 &
    sleep 0.5
    got="$(bash "${SCRIPTS_DIR}/vpn-opencode" check --port "$port" --json 2>/dev/null \
      | jq -r '.detail // "sem-json"')" || true
    pkill -f "TCP-LISTEN:${port}" >/dev/null 2>&1 || true
    sleep 0.3
    [[ "$got" == "$expected" ]]
  }
  run_test "check: HTTP 200 neutro -> ouvindo" check_http_detail 200 "OK" 10061 "ouvindo"
  run_test "check: HTTP 402 -> credit-exhausted" check_http_detail 402 "CreditLimitExceeded" 10062 "credit-exhausted"
  run_test "check: HTTP 429 Zen -> zen-usage-limit" check_http_detail 429 "FreeUsageLimitError" 10063 "zen-usage-limit"
  run_test "check: HTTP 429 genérico -> rate-limit" check_http_detail 429 "too many requests" 10064 "rate-limit"
  run_test "check: HTTP 200 com padrão de quota" check_http_detail 200 "quota exceeded" 10065 "quota-pattern-in-http"
else
  echo "socat ausente: testes de classificação HTTP do check pulados."
fi

echo "======================================"
printf "Resultado: %d testes executados, %d passaram, %d falharam.\n" "$total" "$passed" "$failed"

if (( failed > 0 )); then
  exit 1
fi
exit 0
