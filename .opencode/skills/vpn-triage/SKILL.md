---
name: VPN Triage
description: Diagnose falhas do VPN Dev Workspace (túnel, DNS, OpenCode, compose) com runbook, vpn-check, vpn-doctor e bundle sanitizado; use quando o usuário relatar VPN caída, DNS quebrado, OpenCode sem resposta ou precisar preparar uma issue de diagnóstico.
---

## Fluxo

1. Confirmar contexto: `DEV/HANDOFF.md`, `DEV/CONTEXT.md` e
   `DEV/RUNBOOKS/troubleshooting-vpn.md`.
2. Medir antes de agir:
   - `./scripts/vpn-check --json` (túnel, DNS, hosts, rede interna);
   - `./scripts/vpn-status --json` (perfil e IP público);
   - `docker compose ps` (serviços e saúde);
   - `./scripts/vpn-doctor --json` (visão consolidada).
3. Classificar o sintoma: compose parado, túnel unhealthy, DNS, porta/senha do
   OpenCode, cota de provider ou processo OpenCode.
4. Aplicar a menor ação segura do runbook. Reiniciar túnel, trocar servidor ou
   trocar IP exigem autorização explícita do maestro.
5. Reexecutar `vpn-check --json` e registrar o resultado.

## Limites

- Nunca chamar provider real para "testar" (gasta cota do usuário).
- Nenhum restart de VPN ou rotação de IP sem autorização.
- Nenhum segredo, token, IP público ou hostname interno em log, bundle ou
  issue; use `--redact-ips` quando o bundle for compartilhado.
- O fallback de modelo só alterna entre modelos free; não proponha modelo pago.

## Bundle para issue

`./scripts/vpn-doctor --bundle <arquivo>` gera um `.tar.gz` com allowlist
(stricta) de diagnóstico. Antes de anexar em issue pública, confira a lista de
arquivos e confirme a ausência de segredos e de IPs.
