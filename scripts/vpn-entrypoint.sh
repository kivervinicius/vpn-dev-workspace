#!/usr/bin/env sh
set -eu

read_secret() {
  secret_file="$1"
  if [ ! -r "$secret_file" ]; then
    echo "Erro: segredo ausente ou ilegível: $secret_file" >&2
    exit 1
  fi
  tr -d '\r\n' < "$secret_file"
}

api_key="$(read_secret "${GLUETUN_API_KEY_FILE:-/run/secrets/gluetun_api_key}")"
[ -n "$api_key" ] || { echo "Erro: chave da API do Gluetun vazia." >&2; exit 1; }
export HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE="{\"auth\":\"apikey\",\"apikey\":\"$api_key\"}"

if [ -n "${OPENVPN_USER_FILE:-}" ]; then
  export OPENVPN_USER="$(read_secret "$OPENVPN_USER_FILE")"
fi

if [ -n "${OPENVPN_PASSWORD_FILE:-}" ]; then
  export OPENVPN_PASSWORD="$(read_secret "$OPENVPN_PASSWORD_FILE")"
fi

if [ -n "${WIREGUARD_PRIVATE_KEY_FILE:-}" ]; then
  export WIREGUARD_PRIVATE_KEY="$(read_secret "$WIREGUARD_PRIVATE_KEY_FILE")"
fi

exec /gluetun-entrypoint "$@"
