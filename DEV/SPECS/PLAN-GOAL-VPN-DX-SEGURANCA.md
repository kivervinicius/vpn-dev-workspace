# Goal — Endurecer e acelerar o VPN Dev Workspace

Status: **planejado, não implementado** (2026-11-23). Nenhum item deste plano foi
implementado ainda; o worktree continua com as alterações pré-existentes do
trabalho de fallback de modelo.

Este arquivo substitui a issue pública do GitHub até haver credencial disponível
para publicação (`gh` não está instalado no host e não há `GITHUB_TOKEN` no
ambiente). O corpo abaixo já está no formato de issue e pode ser publicado sem
reescrita.

## Título sugerido

`[Goal] VPN Dev Workspace: atalhos vpn, fallback OpenCode estritamente free e Gluetun 3.41.4-rc2 preparado (sem cutover)`

Labels sugeridos: `security`, `dx`, `observability`.

---

## Contexto

O runtime já é estável (Gluetun com kill switch, terminal com home/workspace
montados, auto-reconnect, OpenCode v1/v2, control-plane local, CI com
gitleaks/Trivy e suíte Linux + Node). Restam lacunas de segurança, atrito
diário e garantia do fallback.

Achados verificados no repositório e na pesquisa:

- Gluetun está em `v3.41.3`; o upstream `v3.41.4-rc2` (2026-11-20) corrige
  vazamento transitório de tráfego em WireGuard quando o túnel cai e impede a
  escolha automática de servidores NordVPN "dedicated IP" (origem de `AUTH_FAILED`
  intermitente).
- O patch local `gluetun/publicip-recovery.patch` tem um hunk
  (`internal/publicip/api/resilient.go`) que o upstream já corrigiu em
  `v3.41.4`; o upgrade pode **reduzir** o patch local em vez de ampliá-lo.
- Estado verificado em 2026-11-23: **não existe `v3.41.4` stable** — a API do
  upstream lista apenas `v3.41.4-rc1` e `v3.41.4-rc2` (prerelease) acima de
  `v3.41.3`. O runtime continua em `v3.41.3`; o RC foi preparado e testado sem
  cutover (patch `gluetun/publicip-recovery-rc2.patch`, `go test` verde).
- A CI usa `actions/checkout@v7` por tag, não por SHA, enquanto o resto do
  projeto pina imagens por digest.
- Não existe `AGENTS.md` na raiz; `.opencode/` está inteiro no `.gitignore`.
- `vpn-shell` sempre abre em `/projetos`, mesmo quando o usuário está em outro
  projeto; não há dispatcher único (`vpn ...`).
- ShellCheck não está instalado no host; a checagem estrita só roda na CI.
- Não há lint de links/Markdown nem verificação de workflow.
- Não há histórico de latência/IP nem bundle sanitizado de diagnóstico.
- O fallback do OpenCode v2 **já rejeita modelo pago no destino**:
  `opencode/v2/vpn-recovery/model-fallback.js` exige provider `opencode`,
  `enabled !== false`, `tools === true`, entradas compatíveis e custo
  explicitamente `0` em `input`, `output`, `cacheRead` e `cacheWrite`; custo
  ausente/incompleto/desconhecido é inelegível; favoritos são aplicados só
  depois do filtro; só `provider.free-limit` dispara a troca. Falta garantir que
  a **origem** também seja free e cobrir regressão com testes negativos.

## Goal

Entregar, em sequência:

1. **DX:** contexto para IA, dispatcher `vpn`, `vpn sh [dir]`, `vpn run`,
   `make lint` e `make verify-fast`.
2. **Fallback estritamente free → free** no OpenCode v2, com testes negativos e
   evidência reproducible.
3. **Segurança/confiabilidade:** Gluetun `v3.41.4` stable com patch rebaseado,
   actions pinadas por SHA, `vpn-check --deep`.
4. **Suporte/observabilidade:** `vpn-doctor --bundle`, `vpn-history` com
   latência/IP e visualização no `vpn-top`/control-plane.
5. **Fechamento:** docs, Windows e evidências.

**Definição de pronto:** `make verify` verde, CI verde, `vpn-check --json` 6/6,
bundle sem segredos, fallback comprovadamente free → free, docs atualizadas e
nenhuma chamada real a provider.

## Regra do fallback (inegociável)

- Só troca quando o erro é `provider.free-limit` (classe `free_tier_limit`).
- Origem e destino devem ser modelos **free**: provider `opencode`,
  `enabled !== false`, `tools === true`, entradas compatíveis e custo
  explicitamente `0` em `input`, `output`, `cacheRead` e `cacheWrite` (todas as
  faixas).
- Custo ausente, incompleto, desconhecido ou maior que zero é inelegível.
  Nunca assumir "grátis" por omissão.
- `OPENCODE_MODEL_FALLBACK_FAVORITES` não pode introduzir modelo pago.
- Sem free elegível, não troca: a execução falha com o `Retry-After` conhecido.
  Nunca cair para modelo pago.
- 429 genérico, limite de conta, crédito ou autenticação não trocam modelo.
- Máximo de três modelos por turno (original + duas trocas).

Implementação prevista:

- [ ] Exportar helper de preço em `model-fallback.js` (ex.: `isFreeModel`) e
      reaproveitar em `isEligibleFreeModel`, sem mudar o comportamento atual.
- [ ] Em `server-core.js`, resolver o modelo de origem no catálogo e exigir a
      mesma checagem antes de selecionar o candidato; origem paga, de custo
      desconhecido ou ausente do catálogo **não** troca.
- [ ] Bloquear o modelo de origem só depois da validação de gratuidade, para não
      marcar como esgotado um modelo que nem era elegível.
- [ ] Testes unitários: origem paga não troca; origem com custo desconhecido não
      troca; catálogo só com modelos pagos retorna `undefined`; favorito pago é
      ignorado; helper de preço rejeita custo ausente.
- [ ] E2E: incluir um modelo pago no catálogo fake e afirmar que ele nunca é
      chamado.
- [ ] `vpn-doctor` compara o hash de `opencode/v2/vpn-recovery/` com a cópia
      instalada em `~/.config/opencode/plugins/vpn-recovery/`, para detectar
      plugin velho em uso.

## O que foi triado fora do goal

| Item | Decisão | Motivo |
|---|---|---|
| Gluetun `v3.41.4` | Mantido — P0 | Segurança e estabilidade reais no WireGuard/NordVPN |
| Pin de actions por SHA + `zizmor`/`actionlint` | Mantido — P0 | Fecha inconsistência de supply-chain do projeto |
| `AGENTS.md` + comandos/skills OpenCode | Mantido — P0 | Reduz redescoberta e erro da IA |
| Dispatcher `vpn` + `vpn sh` + `vpn run` | Mantido — P0 | Maior atrito diário |
| `make lint` + `make verify-fast` | Mantido — P0 | Loop local lento e sem ShellCheck |
| `vpn-check --deep` (IPv6/DNS) | Mantido — P1 | Fecha lacuna real de vazamento |
| `vpn-doctor --bundle` | Mantido — P1 | Diagnóstico seguro para issue pública |
| `vpn-history` + latência/IP | Mantido — P1 | Diagnóstico de oscilação de provider |
| Link/Markdown lint | Mantido — P1 | Docs públicas, baixo risco |
| Windows bootstrap + completion | Mantido — P2 | Onboarding; host Windows confirmado |
| Extras de shell (fzf, zoxide, eza, bat) | Descartado | Home do host já é montada; inflar imagem não é prioridade |
| Preset de keybinds / cheat sheet OpenCode | Descartado | Polimento; entra como issue própria |
| `vpn proxy run` | Descartado | Credenciais no ambiente do filho; `vpn run` cobre o caso |
| `vpn-status --prompt` | Descartado | Cosmético |
| Cache de build / verify paralelo | Descartado | Performance, não correção |
| `vhs`, docs site, devcontainer | Descartado | Polimento/onboarding |
| Release automation / SBOM | Descartado | Estratégico; goal separado |
| Rotação por latência / benchmark | Descartado | Pode desestabilizar a rotação atual |
| `read_only+tmpfs` | Descartado | Exige teste de runtime próprio; já está no backlog |
| WSL mirrored networking | Descartado | Conflitos conhecidos com Docker Desktop; apenas nota no troubleshooting |
| Migração da suíte para bats-core | Descartado | Custo alto; usar só em testes novos |
| Compose Watch / Atuin sync / MCPs | Descartado | Sem ganho real; sync externo contraria a política de egress |

## Para que serve a janela de manutenção

"Manutenção" aqui é a **janela de cutover do runtime**, não manutenção de código:

- O Gluetun é o provedor de rede de toda a stack. Trocar a imagem exige recriar
  o container `vpn`.
- `terminal` e `vpn-auto-reconnect` usam `network_mode: service:vpn`; precisam
  ser recriados junto.
- Processos dentro do terminal (OpenCode, shells, supervisor) param. As sessões
  ficam em disco, mas o trabalho em andamento é interrompido.
- Todo o restante do plano não exige downtime: scripts de host, docs, testes e
  CI rodam fora da stack; `vpn sh`/`vpn run` são host-side.
- Para minimizar risco: validar a imagem nova em projeto Compose isolado (outro
  nome, outra faixa de portas), rodar `go test` e os perfis, e só então fazer o
  cutover em janela curta.
- Sem downtime possível, o upgrade fica preparado e testado, sem cutover. A
  correção de segurança só vale depois do cutover.

## Não-objetivos

- Novos provedores VPN, port forwarding, exposição pública ou evasão.
- Trocar para qualquer modelo com custo maior que zero ou desconhecido.
- Mudar a política de recovery de rede (só atua com túnel confirmado parado).
- Mudar a política de fallback de provider/cota existente.
- Extras de shell, docs site, devcontainer, release automation, `read_only+tmpfs`.
- Commits ou push sem autorização explícita do maestro.

## Premissas

- Host Windows disponível para validação final.
- `v3.41.4` stable será lançado; se não, preparar/testar contra o RC em branch
  separada e **não** fazer cutover.
- Nenhuma chamada real a provider durante a validação.
- Trabalho não commitado atual preservado (stash nomeado ou branch); sem commit
  ou push automático.

---

## Milestone 1 — DX e fallback free → free (sem downtime)

- [x] Criar `AGENTS.md` na raiz com propósito, limites, ordem de leitura de
      `DEV/`, comandos (`make verify`, `vpn-check --json`, `vpn-doctor`), mapa de
      arquivos e a regra "sem commit/push automático".
- [x] Criar `DEV/AGENTS.md` curto apontando para `DEV/INDEX.md`, `HANDOFF.md`,
      `CONTEXT.md` e `SPECS/ACTIVE.md`.
- [x] Ajustar `.gitignore` para permitir `.opencode/commands/`,
      `.opencode/skills/` e `.opencode/opencode.jsonc`, mantendo `node_modules`
      ignorado.
- [x] Criar comandos `/vpn-check`, `/verify`, `/release-check`, `/triage` e a
      skill `vpn-triage`.
- [x] Criar `scripts/vpn` (dispatcher), `scripts/_vpn` (completion) e
      `scripts/vpn-workdir.sh` (normalização de caminho compartilhada com
      `opencode2`).
- [x] Ajustar `scripts/vpn-shell` para aceitar `-w`/diretório atual e criar
      `vpn run`.
- [x] Adicionar ao `Makefile`: `status`, `ai`, `lint`, `verify-fast`,
      `shell DIR=` e `up` usando o último perfil ativo.
- [x] Criar `.githooks/pre-commit` opcional com gitleaks + sintaxe.
- [x] Implementar a regra free → free do fallback (seção acima).
- [x] Testes em `tests/linux/test-scripts.sh` para dispatcher, caminho e
      completion.
- [x] Atualizar `README.md` e `docs/TLDR.md`.
- [x] Runbook novo em `DEV/RUNBOOKS/dx-diagnostics-history.md` para
      `vpn-history`/`--deep`/`--bundle`/patches do Gluetun.

**Aceite:** `cd /projetos/qualquer-projeto && vpn sh` abre no diretório certo;
`vpn run <cmd>` executa pela VPN; `make lint` e `make verify-fast` passam; o
fallback não troca quando a origem é paga; nenhum container é recriado.

## Milestone 2 — Segurança/confiabilidade (cutover curto)

- [x] Preparar o RC sem cutover: `v3.41.4` stable **não existe** (só rc1/rc2);
      patch `gluetun/publicip-recovery-rc2.patch` pronto (hunk de
      `resilient.go` já coberto pelo upstream), `go test` verde no fonte do RC
      e `scripts/verify-gluetun-patch` conferindo aplicação por tag.
- [ ] Atualizar SHA do source e digest da base quando sair a stable; cutover
      com tags de rollback preservadas.
- [ ] Build das duas imagens (exige daemon Docker; indisponível neste host).
- [ ] Validar em Compose isolado: OpenVPN, WireGuard, NordVPN com
      `SERVER_COUNTRIES` e cenário de queda/retorno do WireGuard.
- [x] CI: pinar `actions/*` por SHA; adicionar `actionlint` e `zizmor`.
- [ ] CI: `hadolint`, `lychee` e `markdownlint` com baseline.
- [x] Implementar `vpn-check --deep` para IPv6/DNS.

**Aceite:** `vpn-check --json` 6/6; CI verde; sem vazamento IPv6/DNS; rollback
documentado e testado.

## Milestone 3 — Suporte/observabilidade

- [x] `vpn-history` em JSONL com `flock`, rotação e `--since/--json`; gravar
      apenas via auto-reconnect ou check explícito.
- [x] Latência e IP no `vpn-top`; gráfico de latência no control-plane
      (`/api/v1/history` + sparkline SVG).
- [x] `vpn-doctor --bundle` com allowlist e `--redact-ips`.
- [x] Testes e docs de operação.

**Aceite:** bundle inspecionado sem segredos/IPs; histórico sobrevive a restart;
`vpn-top` renderiza.

## Milestone 4 — Fechamento

- [x] Bootstrap Windows (`winget`) e completion PowerShell.
- [x] Atualizar `DEV/WORKLOG.md`, `DEV/VERIFY.md`, `DEV/HANDOFF.md` e
      `DEV/SPECS/ACTIVE.md`.
- [x] Rodar a suíte Pester no Linux (19/19) com stub POSIX de `docker`.
- [ ] `make verify` final com builds Docker (daemon indisponível aqui).

**Aceite:** documentação atualizada, CI Windows verde, issue fechada com
evidências.

---

## Verificação

```bash
make verify
make verify-fast
make lint
./tests/linux/test-scripts.sh
node --test tests/opencode/*.test.mjs tests/control/*.test.cjs
./scripts/verify-docs
./scripts/verify-compose
docker build --pull=true .
docker build --pull=true ./gluetun
vpn-check --json
```

Evidência específica do fallback:

```bash
node --test tests/opencode/vpn-recovery.test.mjs
docker exec -w /projetos/vpn-dev-workspace vpn-dev-workspace-terminal-1 \
  node tests/opencode/model-fallback-e2e.mjs
```

## Riscos e rollback

- **Gluetun:** manter a tag anterior e executar `vpn-switch` com rollback em
  caso de regressão.
- **Dispatcher:** é aditivo; os scripts atuais continuam funcionando.
- **`vpn run`:** não cobre DBus/GPU/hardware do host; documentar.
- **Actions por SHA:** configurar Dependabot para manter os pins.
- **Segredos:** bundle e logs sempre redigidos; nunca incluir `.secrets/`,
  `auth.json` ou bancos de sessão.
- **Worktree:** preservar alterações existentes; sem commit sem autorização.

## Condições de parada

- `v3.41.4` stable não saiu: parar após preparar/testar o RC; não fazer cutover.
- Host Windows indisponível: parar após Linux/CI e marcar Windows como
  pendente.
- Necessidade de chamada real a provider: parar e pedir autorização.
- Exposição de segredo: parar, redigir e rotacionar.
- `make verify` falhar duas vezes pela mesma causa: parar e reportar.
- Qualquer tentativa de trocar para modelo pago: falha de teste bloqueante.

## Fontes da pesquisa

- Gluetun `v3.41.4-rc2`: https://github.com/passteque/gluetun/releases/tag/v3.41.4-rc2
- OpenCode keybinds: https://opencode.ai/docs/cli/keybinds
- OpenCode plugins: https://opencode.ai/docs/plugins
- Docker Compose Watch (avaliado e descartado): https://docs.docker.com/compose/how-tos/file-watch/
- zizmor: https://docs.zizmor.sh/
- actionlint: https://github.com/rhysd/actionlint
- bats-core: https://bats-core.readthedocs.io/
- WSL networking: https://learn.microsoft.com/en-us/windows/wsl/networking
- lychee: https://github.com/lycheeverse/lychee
- vhs: https://github.com/charmbracelet/vhs
- git-cliff: https://git-cliff.org/
