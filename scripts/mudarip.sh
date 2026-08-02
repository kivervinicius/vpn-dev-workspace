#!/usr/bin/env bash
set -Eeuo pipefail

readonly API_URL="http://127.0.0.1:8000"

if [[ -z "${GLUETUN_API_KEY:-}" ]]; then
  echo "Erro: defina GLUETUN_API_KEY antes de executar mudarip." >&2
  exit 1
fi

api_request() {
  curl --fail --silent --show-error --retry 3 \
    -H "X-API-Key: ${GLUETUN_API_KEY}" \
    "$@"
}

echo "Parando VPN..."
api_request -X PUT -H "Content-Type: application/json" \
  -d '{"status":"stopped"}' "${API_URL}/v1/openvpn/status"

echo "Aguardando 3 segundos..."
sleep 3

echo "Religando VPN em um novo servidor..."
api_request -X PUT -H "Content-Type: application/json" \
  -d '{"status":"running"}' "${API_URL}/v1/openvpn/status"

echo "VPN renovada. IP público atual:"
api_request "${API_URL}/v1/publicip/ip"
echo
