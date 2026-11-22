#!/usr/bin/env bash
# Shared non-blocking lock for every VPN mutation entry point.
#
# O arquivo de lock é resolvido do primeiro candidato gravável, nesta ordem:
#   1. $VPN_CONTROL_LOCK_FILE (explícito; o Compose define nos containers)
#   2. $VPN_CONTROL_LOCK_DIR/operation.lock (vpn-switch exporta)
#   3. <repo>/.vpn-control-lock/operation.lock (host; é o MESMO bind mount que
#      os containers veem em /run/vpn-control-lock, então host e containers
#      disputam o mesmo lock)
#   4. /run/vpn-control-lock/operation.lock (container sem env explícita)
#   5. /var/lib/vpn-control/operation.lock (legado; só quando gravável)
#   6. $HOME/.vpn-control-lock/operation.lock (último recurso no host)

vpn_control_lock_candidates() {
  local root=""
  if [[ -n "${VPN_CONTROL_LOCK_FILE:-}" ]]; then
    printf '%s\n' "$VPN_CONTROL_LOCK_FILE"
    return 0
  fi
  if [[ -n "${VPN_CONTROL_LOCK_DIR:-}" ]]; then
    printf '%s/operation.lock\n' "$VPN_CONTROL_LOCK_DIR"
  fi
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)" || root=""
  if [[ -n "$root" && -f "$root/docker-compose.yml" ]]; then
    printf '%s/.vpn-control-lock/operation.lock\n' "$root"
  fi
  printf '%s\n' \
    "/run/vpn-control-lock/operation.lock" \
    "/var/lib/vpn-control/operation.lock" \
    "${HOME:-/tmp}/.vpn-control-lock/operation.lock"
}

# $1 = nome do arquivo de estado (ex.: vpn-rotate.index). Imprime o caminho do
# primeiro local gravável, preferindo o volume compartilhado dos containers.
vpn_control_state_file() {
  local name="$1" root=""
  if [[ -d /var/lib/vpn-control && -w /var/lib/vpn-control ]]; then
    printf '/var/lib/vpn-control/%s' "$name"
    return 0
  fi
  root="$(cd "$(dirname "${BASH_SOURCE[1]}")/.." 2>/dev/null && pwd)" || root=""
  if [[ -n "$root" && -f "$root/docker-compose.yml" ]]; then
    mkdir -p "$root/.vpn-control-state" 2>/dev/null || true
    if [[ -w "$root/.vpn-control-state" ]]; then
      printf '%s/.vpn-control-state/%s' "$root" "$name"
      return 0
    fi
  fi
  mkdir -p "${HOME:-/tmp}/.vpn-control-state" 2>/dev/null || true
  printf '%s/.vpn-control-state/%s' "${HOME:-/tmp}" "$name"
}

vpn_control_lock_acquire() {
  local lock_file="" candidate dir
  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] || continue
    dir="$(dirname "$candidate")"
    if mkdir -p "$dir" 2>/dev/null && [[ -w "$dir" ]]; then
      lock_file="$candidate"
      break
    fi
    # Um caminho explicitamente pedido pelo operador não pode ser silenciosamente
    # trocado: falha alto para expor o erro de permissão/valor.
    if [[ -n "${VPN_CONTROL_LOCK_FILE:-}" && "$candidate" == "$VPN_CONTROL_LOCK_FILE" ]]; then
      echo "Erro: diretório do lock de controle VPN não é gravável: $dir" >&2
      return 1
    fi
  done < <(vpn_control_lock_candidates)
  [[ -n "$lock_file" ]] || {
    echo "Erro: nenhum diretório gravável para o lock de controle VPN." >&2
    return 1
  }

  command -v flock >/dev/null 2>&1 || {
    echo "Erro: dependência ausente: flock (util-linux)." >&2
    return 1
  }

  if [[ -e /proc/self/fd/9 ]] && [[ "$(readlink -f /proc/self/fd/9 2>/dev/null || true)" == "$(readlink -f "$lock_file" 2>/dev/null || true)" ]]; then
    # An inherited descriptor is reusable only while the lock remains held.
    flock -n 9 || return 75
    return 0
  fi

  exec 9>"$lock_file" || return 1
  flock -n 9 || return 75
}
