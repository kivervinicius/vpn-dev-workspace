# VPN Dev Workspace

Um ambiente local de desenvolvimento baseado em Docker que roteia todo o tráfego do seu terminal (onde rodam os seus projetos) por um provedor de VPN (NordVPN, ProtonVPN, etc.) usando o [Gluetun](https://github.com/qdm12/gluetun).

---

## ⚡ TL;DR (Resumo Rápido)

1. **Configuração**: Copie o arquivo de exemplo `cp .env.example .env`.
2. **Credenciais**: Grave o seu usuário e senha de serviço da VPN nos arquivos `.secrets/nordvpn_user` e `.secrets/nordvpn_password` (crie a pasta se não existir).
3. **Iniciando a VPN**: 
   ```bash
   ./scripts/vpn-switch nordvpn-openvpn
   ```
4. **Abrindo o Terminal**:
   ```bash
   docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml exec terminal bash
   ```
5. **Comandos Úteis (Dentro do Terminal)**:
   - `vpn-status` → Verifica se a VPN está conectada e mostra o IP público.
   - `vpn-reconnect` → Reinicia a conexão para trocar de servidor/IP (Substitui o antigo `mudarip`).

---

## Recursos e Diferenciais
- **Zero Vazamentos (Kill Switch)**: O firewall do Gluetun bloqueia automaticamente o acesso caso o túnel caia.
- **Isolamento de Áudio**: O contêiner é configurado com `ALSA_CONFIG_PATH=/dev/null`, evitando que ferramentas baseadas em Node/Electron spamem erros de placa de som no seu terminal.
- **Portas Dinâmicas**: Portas (3000, 4200, 5173, etc.) ficam disponíveis localmente e não entram em conflito com a VPN.
- **Estado do OpenCode**: A instalação do `opencode` não é apagada. O cache, configurações e dados são preservados porque a sua pasta `~/.config/opencode` e afins são montadas para dentro do Docker.

## Estrutura Segura de Secrets
Nenhuma credencial fica solta no código! Em vez disso, a arquitetura utiliza a pasta `.secrets/` (que é ignorada pelo git). 

- `.secrets/gluetun_api_key`: Uma chave gerada por você (pode usar `head -c 32 /dev/urandom | base64 | tr -dc A-Za-z0-9 > .secrets/gluetun_api_key`). Ela blinda a API local da sua VPN.
- `.secrets/nordvpn_user`: Apenas o seu usuário da aba "Service Credentials" da NordVPN.
- `.secrets/nordvpn_password`: Apenas a sua senha de serviço.

## Troubleshoot (Solução de Problemas Comuns)

### 1. `Bind for 0.0.0.0:8000 failed` (Conflito de Portas)
Se a subida do contêiner falhar avisando que uma porta já está em uso, significa que você já tem aplicativos como Nginx (`80`), Portainer (`8000`) ou aplicações Spring Boot (`8080`) rodando na máquina real.
**Solução:** 
Basta abrir o arquivo `docker-compose.yml` base e remover ou alterar o mapeamento da porta conflituosa na sessão de `ports` do serviço `vpn`.

### 2. `TLS Error: TLS key negotiation failed to occur within 20 seconds`
O log do Gluetun apresentou esse erro? Isso geralmente ocorre quando a sua rede local/provedor bloqueia a porta padrão (UDP) do OpenVPN. 
**Solução:**
Abra o seu arquivo `.env` e force a VPN a se comunicar via TCP incluindo:
```ini
OPENVPN_PROTOCOL=tcp
```
Reinicie a conexão (`./scripts/vpn-switch nordvpn-openvpn`) e o handshake ocorrerá com sucesso.

### 3. A VPN parou de responder do nada
Basta acessar o terminal principal e mandar o sinal de reconexão. Não é necessário reiniciar o Docker:
```bash
vpn-reconnect
```

---

## Estrutura do Docker

```text
host
├── serviço vpn (Gluetun + NET_ADMIN)
│   └── Portas mapeadas de desenvolvimento web.
└── serviço terminal (Ubuntu + Node.js + OpenCode)
    └── Executa em network_mode: "service:vpn"
        (Todo o tráfego do terminal passa obrigatoriamente pelo Gluetun)
```

## Como fechar tudo e limpar o ambiente?
Ao terminar o trabalho do dia, você pode desligar o ambiente e apagar as redes temporárias com:
```bash
docker compose -f docker-compose.yml -f profiles/nordvpn-openvpn.yml down --remove-orphans
```
