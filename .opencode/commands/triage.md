---
description: Triage completo da VPN com bundle sanitizado
---

Faça o triage do ambiente VPN deste projeto e produza um resumo acionável.
Não altere arquivos do projeto, não reinicie o túnel e não chame provider real.

Diagnóstico do ambiente:

!`./scripts/vpn-doctor --json 2>&1 || true`

Bundle sanitizado (sem segredos nem IP público):

!`./scripts/vpn-doctor --bundle /tmp/vpn-doctor-bundle.tar.gz 2>&1 || true`

Fluxo:

1. Leia `DEV/RUNBOOKS/troubleshooting-vpn.md` e siga o procedimento do sintoma.
2. Resuma estado do Docker, serviços Compose, saúde do túnel/DNS e OpenCode.
3. Se o bundle foi gerado, liste os arquivos incluídos e confirme que não há
   `.secrets/`, `auth.json`, banco de sessão ou valor de `.env`.
4. Proponha a próxima ação e o comando exato; pare antes de qualquer ação que
   derrube a VPN.
