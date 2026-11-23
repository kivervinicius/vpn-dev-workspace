---
description: Verifica a saúde da VPN e resume o próximo passo
---

Diagnostique a VPN deste projeto e proponha o próximo passo. Não altere
arquivos, não reinicie o túnel e não troque IP sem autorização explícita.

Saída de `vpn-check --json`:

!`./scripts/vpn-check --json 2>&1 || true`

Como interpretar:

- `healthy: true` → diga que a VPN está saudável e liste os checks em uma linha.
- `fails` não vazio → aponte o check que falhou e cite
  `DEV/RUNBOOKS/troubleshooting-vpn.md` como procedimento.
- `healthy: false` sem `fails` → rode `./scripts/vpn-status --json` e
  `docker compose ps` antes de concluir.

Regras: sem chamada real a provider, sem troca de servidor, sem segredo em log.
