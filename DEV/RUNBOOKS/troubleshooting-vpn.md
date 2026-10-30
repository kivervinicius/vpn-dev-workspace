# Runbook: Solução de Problemas e Diagnóstico da VPN (Troubleshooting)

Este runbook reúne os cenários reais de falhas, causas raízes técnicas e procedimentos rápidos de resolução para o `vpn-dev-workspace`.

---

## Diagnóstico Rápido Inicial

Antes de alterar configurações, execute o diagnóstico unificado no host:

```bash
./scripts/vpn-doctor
```

Ou dentro do terminal Zsh:

```bash
vpn-check
vpn-status
```

---

## 1. Loop Perpétuo de Conexão na NordVPN (`Connection reset, restarting [0]`)

### Sintoma
Os contêineres ficam como `unhealthy`, os logs do Gluetun mostram ciclos repetidos de `TCP connection established ... Connection reset, restarting [0]` e o serviço `vpn-auto-reconnect` fica tentando reconectar a cada 30 segundos sem conseguir obter IP.

### Causa Raiz
1. O arquivo `.env` está configurado com `OPENVPN_PROTOCOL=tcp` sem porta explícita. O Gluetun tenta conectar na porta `443` TCP por padrão, mas a NordVPN descontinuou OpenVPN na porta `443` TCP (remanejada para HTTPS/NordWhisper), enviando TCP RST imediato.
2. Servidores antigos listados em `VPN_SERVER_HOSTNAMES` foram desativados pela NordVPN.

### Solução
1. Em `.env`, utilize o protocolo estável UDP (padrão):
   ```ini
   OPENVPN_PROTOCOL=udp
   ```
2. Caso o tráfego TCP seja obrigatório em sua rede local (ex.: bloqueio corporativo de UDP), declare a porta alternativa oficial da NordVPN:
   ```ini
   OPENVPN_PROTOCOL=tcp
   OPENVPN_ENDPOINT_PORT=1231
   ```
3. Mantenha em `VPN_SERVER_HOSTNAMES` apenas servidores ativos no Brasil (ex: `br71.nordvpn.com,br72.nordvpn.com,br73.nordvpn.com,br97.nordvpn.com,br98.nordvpn.com`) ou deixe a variável comentada para o Gluetun escolher automaticamente.
4. Reinicie o perfil:
   ```bash
   ./scripts/vpn-switch nordvpn-openvpn
   ```

---

## 2. Erro de Permissão de Segredos (`Permission denied` / `user is empty`)

### Sintoma
O contêiner falha na inicialização ou o log do Gluetun registra `OpenVPN settings: user is empty` ou `openvpn_user: Permission denied`.

### Causa Raiz
Os arquivos dentro de `.secrets/` não possuem permissão de leitura restrita ou foram criados por outro UID. O Gluetun roda com permissões restritas e requer modo `0600`.

### Solução
Execute a correção automática com `vpn-doctor`:
```bash
./scripts/vpn-doctor --fix
```
Ou ajuste manualmente no host:
```bash
chmod 700 .secrets
chmod 600 .secrets/*
```

---

## 3. Conflito de Portas no Host (`Bind for 0.0.0.0:10001 failed`)

### Sintoma
Ao iniciar o perfil ou abrir a porta do OpenCode, o Docker informa que a porta já está em uso (`port is already allocated` ou `address already in use`).

### Causa Raiz
Outro processo na máquina host (ex.: outra instância do OpenCode, servidor local ou container prévio) está escutando na porta.

### Solução
1. Identifique o processo em conflito:
   ```bash
   ss -tulpn | grep 10001
   ```
2. Altere a porta no `.env` para outro valor dentro da faixa `VPN_PORT_RANGE` (padrão `10000-10010`):
   ```ini
   OPENCODE_GUI_PORT=10020
   ```
3. Reabra o serviço:
   ```bash
   ./scripts/vpn-opencode supervise --port 10020
   ```

---

## 4. Queda de Quota vs Queda de Rede no OpenCode

### Diagnóstico
Quando o OpenCode interrompe chamadas aos modelos, consulte o status com o classificador:

```bash
./scripts/vpn-opencode check --json
```

- **`status: ok`**: Conexão e API do OpenCode operacionais.
- **`status: quota`**: resposta de limite do provider (free-tier, conta, crédito ou 429), não evidência de falha do túnel; o `check` é observacional e nunca rotaciona sozinho. Free-tier e 429 estruturados podem acionar a troca automática de servidor/IP pelos plugins v1/v2 (melhor esforço, sem reenvio de prompt e sem garantia de reset de quota); conta e crédito nunca alteram a VPN. Aguarde o reset ou use plano/provider autorizado.
- **Rede restritiva / troca de país não conecta**: servidores sorteados ou de outros países podem não completar o handshake (timeout em UDP 1194; TCP 443 também pode pendurar). Fixe hostnames alcançáveis em `VPN_SERVER_HOSTNAMES` e use `vpn-server-rotate --to <host>`/round-robin; `--countries` só ajuda quando os servidores sorteados do país são alcançáveis. Nesta instalação, apenas o range `189.1.168.x` (br71/72/73/97/98) respondeu.
- **`status: down`**: falha de rota ou da VPN. Confirme `vpn-check --only tunnel`, `vpn-status --json` e o log do `opencode-supervisor`; ele só reconecta/rotaciona após detectar desconexão ou túnel unhealthy e confirma saúde antes de reiniciar o processo. HTTP 429 não é evento de reconnect.

---

## 5. Falha de Acesso à Intranet Corporativa / Servidores `.omega`

### Sintoma
O túnel VPN funciona para a internet, mas servidores locais como `http://192.168.30.20` ou `gitlab.omega` não respondem.

### Solução
1. **Sub-rede no Firewall:** Verifique se a sub-rede do servidor está em `FIREWALL_SUBNETS` no `.env`:
   ```ini
   FIREWALL_SUBNETS=192.168.30.0/24,192.168.105.0/24
   ```
2. **Resolução de Nomes:** Se o host utiliza IP estático declarado apenas no hosts da máquina host, adicione ao `.env`:
   ```ini
   LOCAL_HOSTS=gitlab.omega=192.168.105.10
   ```
3. Re-aplique as configurações:
   ```bash
   ./scripts/vpn-switch nordvpn-openvpn
   ```
4. Valide dentro do terminal:
   ```bash
   vpn-check --only internal
   vpn-check --only hosts
   ```

---

## 6. Ponte SSH do Windows não sobe (`Tempo limite iniciando a ponte SSH`)

### Sintoma
`.\scripts\vpn.ps1 start <perfil>` falha com
`Tempo limite iniciando a ponte SSH do Windows.` mesmo com o Docker Desktop
saudável e o agente `ssh-agent` em execução.

### Causa Raiz
Cold start: logo após rebuild/`--pull` ou reinício do Docker Desktop, o
processo `pwsh` que publica a ponte demora mais que o timeout para abrir a
porta TCP. O limite era 5s e foi ampliado para 30s em 2026-10-16.

### Solução
1. Confirme o agente e a chave carregada:
   ```powershell
   Get-Service ssh-agent
   ssh-add -l
   ```
2. Com a máquina ociosa, repita o start (idempotente):
   ```powershell
   .\scripts\vpn.ps1 start <perfil>
   ```
3. Se persistir, inspecione estado e processos órfãos:
   ```powershell
   Get-Content .vpn\windows-ssh-agent.json -ErrorAction SilentlyContinue
   Get-Process pwsh | Select-Object Id,StartTime
   ```
