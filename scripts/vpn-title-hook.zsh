# vpn-title-hook.zsh — status de IA na aba do terminal (opt-in).
#
# Por que existe: as IAs de terminal não atualizam o título enquanto trabalham
# (medido: `opencode` nunca emite OSC 0/1/2; `claude` emite `Claude Code` uma
# vez na abertura). O pipeline container→aba funciona (títulos do zsh chegam
# intactos), então este hook anuncia explicitamente início e fim de cada
# execução via `vpn-ai`.
#
# Ativação (uma vez, no host — a home é a mesma dentro do container):
#   echo 'source /projetos/vpn-dev-workspace/scripts/vpn-title-hook.zsh' >> ~/.zshrc
# (ajuste o caminho se o workspace estiver em outro lugar)
#
# Uso dentro do container:
#   vpn-ai opencode run "faça X"     # aba: 🤖 … → ✅/❌ ao concluir
#   vpn-ai claude "revise Y"
#
# O título de conclusão é "grudento": sobrevive ao redesenho do prompt e só
# sai quando o próximo comando começa (via preexec normal do oh-my-zsh).

# Arquivo de passagem wrapper -> hook precmd (mesma shell, mesmo $HOME).
: "${VPN_AI_STICKY_FILE:=${XDG_CACHE_HOME:-$HOME/.cache}/vpn-ai-sticky-title}"

# Emite título de janela+aba (OSC 0). Soa em qualquer TERM que o
# oh-my-zsh também atenderia; sem TTY, vira no-op silencioso.
_vpn_ai_set_title() {
  [[ -t 1 || -t 2 ]] || return 0
  printf '\033]0;%s\007' "$1" >&2 || true
}

#‹wrapper principal: anuncia, executa, anuncia o resultado.
vpn-ai() {
  if (($# == 0)); then
    echo "Uso: vpn-ai <comando> [args...]" >&2
    return 2
  fi
  local cmd="$1" code sticky
  _vpn_ai_set_title "🤖 ${cmd} — trabalhando…"
  command "$@"
  code=$?
  if ((code == 0)); then
    sticky="✅ ${cmd} — concluído"
  else
    sticky="❌ ${cmd} — exit ${code}"
  fi
  # O hook precmd abaixo consome este arquivo antes do próximo prompt,
  # então o resultado permanece visível até o próximo comando.
  printf '%s' "$sticky" >| "$VPN_AI_STICKY_FILE" 2>/dev/null || true
  _vpn_ai_set_title "$sticky"
  printf '\a' >&2 || true
  return $code
}

# Consome o título grudento no próximo prompt (roda DEPOIS do precmd do
# oh-my-zsh, que foi registrado antes — por isso reza o título por último).
_vpn_ai_sticky_precmd() {
  local sticky
  [[ -f "$VPN_AI_STICKY_FILE" ]] || return 0
  sticky="$(<"$VPN_AI_STICKY_FILE")" 2>/dev/null || return 0
  rm -f "$VPN_AI_STICKY_FILE" 2>/dev/null || true
  [[ -n "$sticky" ]] || return 0
  _vpn_ai_set_title "$sticky"
}

# Registra sem duplicar em re-sources do .zshrc.
if autoload -Uz add-zsh-hook 2>/dev/null; then
  add-zsh-hook -D precmd _vpn_ai_sticky_precmd 2>/dev/null || true
  add-zsh-hook precmd _vpn_ai_sticky_precmd
fi
