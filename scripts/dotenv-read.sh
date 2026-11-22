#!/usr/bin/env bash

dotenv_read() {
  local file="$1" name="$2" line key raw value quote rest result="" found=false
  local char escaped closed i
  [[ -r "$file" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    [[ -n "$line" && "$line" != \#* ]] || continue
    if [[ "$line" == export[[:space:]]* ]]; then line="${line#export}"; fi
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    [[ "$key" == "$name" ]] || continue
    raw="${line#*=}"
    raw="${raw#"${raw%%[![:space:]]*}"}"
    value=""
    case "${raw:0:1}" in
      '"'|"'")
        quote="${raw:0:1}"
        escaped=false
        closed=false
        for ((i=1; i<${#raw}; i++)); do
          char="${raw:i:1}"
          if [[ "$quote" == '"' && "$escaped" == true ]]; then
            case "$char" in n) value+=$'\n' ;; r) value+=$'\r' ;; t) value+=$'\t' ;; *) value+="$char" ;; esac
            escaped=false
          elif [[ "$quote" == '"' && "$char" == "\\" ]]; then
            escaped=true
          elif [[ "$char" == "$quote" ]]; then
            closed=true
            rest="${raw:i+1}"
            break
          else
            value+="$char"
          fi
        done
        [[ "$closed" == true && "$escaped" == false ]] || return 2
        rest="${rest#"${rest%%[![:space:]]*}"}"
        [[ -z "$rest" || "$rest" == \#* ]] || return 2
        ;;
      *)
        value="$raw"
        if [[ "$value" =~ ^(.*[^[:space:]])[[:space:]]+# ]]; then value="${BASH_REMATCH[1]}"; fi
        value="${value%"${value##*[![:space:]]}"}"
        ;;
    esac
    result="$value"
    found=true
  done < "$file"
  [[ "$found" == true ]] || return 1
  printf '%s\n' "$result"
}
