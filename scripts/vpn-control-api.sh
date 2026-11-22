#!/usr/bin/env bash

# Defaults sensíveis ao ambiente para a API de controle do Gluetun.
# Dentro do container a API responde em 127.0.0.1:8000 (mesmo namespace de rede
# do serviço vpn) e o segredo fica em /run/secrets. No host, a porta de controle
# é publicada pelo Compose em VPN_CONTROL_PORT (default 18000) e o segredo fica
# em <repo>/.secrets/gluetun_api_key.
vpn_control_is_container() {
  [[ "${VPN_CONTROL_FORCE_HOST:-0}" == "1" ]] && return 1
  [[ "${VPN_WORKSPACE_CONTAINER:-}" == "1" || -f /.dockerenv ]]
}

vpn_control_default_url() {
  if vpn_control_is_container; then
    printf 'http://127.0.0.1:8000\n'
  else
    printf 'http://127.0.0.1:%s\n' "${VPN_CONTROL_PORT:-18000}"
  fi
}

vpn_control_default_key_file() {
  # $1 = diretório do script chamador; permite achar <repo>/.secrets no host.
  local caller_dir="${1:-}" root=""
  if vpn_control_is_container && [[ -r /run/secrets/gluetun_api_key ]]; then
    printf '/run/secrets/gluetun_api_key\n'
    return 0
  fi
  if [[ -n "$caller_dir" ]]; then
    root="$(cd "$caller_dir/.." 2>/dev/null && pwd)" || root=""
  fi
  if [[ -n "$root" && -f "$root/docker-compose.yml" ]]; then
    printf '%s/.secrets/gluetun_api_key\n' "$root"
  else
    printf '/run/secrets/gluetun_api_key\n'
  fi
}

vpn_curl_config_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

vpn_api_curl() {
  # O script chamador define API_KEY_FILE com os defaults sensíveis ao ambiente
  # (vpn_control_default_key_file); GLUETUN_API_KEY_FILE explícito tem precedência.
  local key_file="${GLUETUN_API_KEY_FILE:-${API_KEY_FILE:-/run/secrets/gluetun_api_key}}"
  local api_key
  [[ -r "$key_file" ]] || { echo "Erro: chave da API do Gluetun ausente ou ilegível." >&2; return 1; }
  api_key="$(tr -d '\r\n' < "$key_file")"
  [[ -n "$api_key" ]] || { echo "Erro: chave da API do Gluetun vazia." >&2; return 1; }
  printf 'header = "X-API-Key: %s"\n' "$(vpn_curl_config_escape "$api_key")" | curl --config - "$@"
}

vpn_basic_auth_curl() {
  local user="$1" password="$2"
  shift 2
  printf 'user = "%s:%s"\n' "$(vpn_curl_config_escape "$user")" \
    "$(vpn_curl_config_escape "$password")" | curl --config - "$@"
}
