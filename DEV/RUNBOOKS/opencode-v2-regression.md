# Runbook de regressão OpenCode v2 / VPN

Baseline observada: `master` commit `8fcace906e2f` em 30/10/2026. Código experimental: PR #7 (Draft).

## O que já foi comprovado

- `DEV/VERIFY.md` (30/10): OpenCode v1.19.5 e v2.1.3, plugin v2 descoberto, 429 sintético gerou troca real de IP e `vpn-check` 6/6.
- `DEV/VERIFY.md` (23/10): teste real de modelos gratuitos, 9/9 bloqueados no IP residencial e 9/9 aceitos sob a VPN.
- `DEV/VERIFY.md` (22/10): o watcher antigo reagiu a limite real, rotacionou e a sessão voltou a responder. Esse watcher foi substituído por plugins estruturados.
- Evidências são históricas. Não comprovam versão 2.3.0 nem reabertura universal de quotas.

## Matriz por canal

| Canal | Recuperação v2.1.3 | Risco principal |
|---|---|---|
| TUI | Sim em `session.execution.failed` estruturado | Evento deixa de chegar ou plugin não carrega |
| CLI headless | Não pelo listener TUI | 429 observado sem rotação |
| `serve`/Desktop | Hook server veta retry; não executa recovery do TUI | Endpoint vivo, mas sem recuperação |
| `vpn-opencode check` | Apenas diagnóstico | Resposta HTTP não demonstra uso do provedor |
| `vpn-provider-probe` | Somente quando CLI possui `--archived` (v2.2.6+) | v2.1.3 rejeitado antes de criar sessão |

## Gates automatizados (não consomem franquia)

```bash
node --test tests/opencode/*.test.mjs tests/control/*.test.cjs
bash tests/linux/test-scripts.sh
./scripts/verify-docs
./scripts/verify-compose   # precisa de Docker
```

## Gates reais no terminal VPN

```bash
opencode2 --version
vpn-state --json
opencode-compat --json
vpn-check --only tunnel
```

Confirme binário, versão, hash do plugin instalado e descoberta/carregamento real. Se `plugin.loaded=unverified`, a prova de runtime ainda falta.

## E2E sintético sem provedor remoto

Usar provider local com resposta HTTP 429 no terminal Linux/Windows, conforme procedimento registrado em `DEV/VERIFY.md` de 30/10/2026. Verificar evento estruturado, callback, uma única solicitação ao helper, lock, IP alterado, túnel saudável, cooldown e ausência de prompt replay. Repetir para `account_limit` e `credit_limit` (não podem rotacionar); repetir para Desktop/serve e headless (não presumir hook TUI).

## A/B real e opt-in

Executar somente quando o ambiente tiver OpenCode v2.2.6+ com `--archived`, `--standalone`, `--format` e `--model` disponíveis. O teste consome uma requisição e nunca executa rotação automaticamente:

```bash
vpn-provider-probe --model opencode/SEU_MODELO_FREE --confirm
vpn-events list --limit 20
```

Comparar antes/depois só se mesma versão, modelo, credenciais autorizadas e configuração. IP diferente e resposta aceita = `E2E_CONFIRMED` na amostra. IP diferente e resposta recusada = `EGRESS_ONLY`. Sem evento ou sem IP confirmado = `INCONCLUSIVE`. Não enviar requests em loop para buscar uma saída não limitada.

## Campos mínimos por evidência

`version`, `channel`, `pluginInstalled`, `pluginLoaded`, `hookInvoked`, `errorClass`, `ipBefore`, `ipAfter`, `vpnHealthy`, `requestAccepted`, `timestampUtc`, `elapsedMs`, `sessionPreserved`, `replayPerformed` (false). Não gravar tokens, prompts, respostas ou IDs de sessão.

## Critérios de aceitação

- Sem regressão em v2.1.3; testar a v2.3.0 num ambiente isolado antes de alterar o instalador/pin.
- CI verde não equivale a extensão realmente carregada no cliente instalado.
- TUI, Desktop, `serve`, CLI headless e Windows são canais distintos, com resultado próprio.
- Nenhum modelo é testado sem consentimento; nenhuma prova inclui re-ID, reset de auth ou replay.
- Primeiro comprovar o callback; depois a VPN; só então uma requisição autorizada.

## Referências

- `DEV/VERIFY.md`, `DEV/SPECS/ACTIVE.md`, `opencode/v2/vpn-recovery`
- https://opencode.ai/docs/plugins/
- https://opencode.ai/changelog/v2.2.6
- https://opencode.ai/changelog/v2.3.0

## Política de 429 genérico (P0)

HTTP 429 por si só não comprova limitação baseada em IP. A TUI só solicita
recuperação automática em `free_tier_limit` estruturado ou `rate_limit`
com `providerID=opencode` e `modelID` terminando em `-free`, quando
esses metadados constarem do evento. Na ausência deles, registra/notifica
sem alterar a VPN. Limites de crédito e conta jamais acionam rotação.
A classificação precisa ser verificada em v2.1.3 e 2.3.0, pois eventos
reais podem trazer os metadados em outros campos.
