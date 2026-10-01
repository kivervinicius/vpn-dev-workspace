.DEFAULT_GOAL := help

.PHONY: help doctor setup up down restart logs shell check test verify

help: ## Exibe os comandos disponíveis
	@echo "VPN Dev Workspace - Comandos Rápidos:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
	@echo ""

doctor: ## Diagnostica o ambiente, VPN e credenciais
	@./scripts/vpn-doctor

setup: ## Assistente interativo de configuração inicial
	@./scripts/vpn-setup

up: ## Sobe a stack de containers em background (use vpn-switch <perfil> no primeiro uso)
	docker compose --profile vpn up -d
	@echo "Nota: o primeiro boot exige ./scripts/vpn-switch <perfil> (credenciais + firewall + hosts)."

down: ## Encerra a stack de containers
	docker compose --profile vpn --profile opencode down --remove-orphans

restart: ## Reinicia todos os containers da stack
	docker compose --profile vpn --profile opencode restart

logs: ## Exibe os logs da stack em tempo real
	docker compose --profile vpn --profile opencode logs -f

shell: ## Abre sessão zsh interativa dentro do container terminal (roteado via VPN)
	docker compose --profile vpn exec terminal zsh

check: ## Verifica conectividade e IP público via VPN
	@./scripts/vpn-check

test: ## Executa a suíte de testes automatizados (Linux)
	@./tests/linux/test-scripts.sh

verify: ## Executa todas as verificações do repositório (compose, docs e testes)
	@./scripts/verify-compose
	@./scripts/verify-docs
	@./tests/linux/test-scripts.sh
