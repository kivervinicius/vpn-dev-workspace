#!/usr/bin/env bash
# Normalização do diretório de trabalho compartilhada entre host e container.
#
# O container terminal monta a home e o workspace do host nos mesmos caminhos,
# então a maior parte dos diretórios é válida dos dois lados. Este helper
# centraliza a regra para `vpn-shell`, `vpn run` e `opencode2`.
#
# Uso: source scripts/vpn-workdir.sh && vpn_resolve_workdir [caminho]
# Raiz montada: VPN_WORKSPACE_ROOTS (default /projetos:/home:/tmp).
vpn_resolve_workdir() {
  local requested="${1:-}"
  local roots="${VPN_WORKSPACE_ROOTS:-/projetos:/home:/tmp}"
  local workdir="" root=""
  local -a root_list=()

  IFS=':' read -r -a root_list <<< "$roots"

  if [[ -n "$requested" ]]; then
    if [[ ! -d "$requested" ]]; then
      echo "vpn: diretório inexistente: ${requested}" >&2
      return 2
    fi
    workdir="$(cd -- "$requested" && pwd -P)" || {
      echo "vpn: não foi possível resolver o diretório: ${requested}" >&2
      return 2
    }
    for root in "${root_list[@]}"; do
      [[ -n "$root" ]] || continue
      case "$workdir" in
        "$root"|"$root"/*)
          printf '%s\n' "$workdir"
          return 0
          ;;
      esac
    done
    echo "vpn: diretório fora das raízes montadas (${roots}): ${workdir}" >&2
    return 2
  fi

  workdir="$(pwd -P 2>/dev/null || printf '/projetos')" || workdir="/projetos"
  for root in "${root_list[@]}"; do
    [[ -n "$root" ]] || continue
    case "$workdir" in
      "$root"|"$root"/*)
        printf '%s\n' "$workdir"
        return 0
        ;;
    esac
  done
  printf '/projetos\n'
}
