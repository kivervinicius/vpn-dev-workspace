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

up: ## Sobe a stack de containers em background
	docker compose up -d

down: ## Encerra a stack de containers
	docker compose down

restart: ## Reinicia todos os containers da stack
	docker compose restart

logs: ## Exibe os logs da stack em tempo real
	docker compose logs -f

shell: ## Abre sessão bash interativa dentro do container terminal (roteado via VPN)
	@./scripts/terminal-shell

check: ## Verifica conectividade e IP público via VPN
	@./scripts/vpn-check

test: ## Executa a suíte de testes automatizados (Linux)
	@./tests/linux/test-scripts.sh

verify: ## Executa todas as verificações do repositório (compose, docs e testes)
	@./scripts/verify-compose
	@./scripts/verify-docs
	@./tests/linux/test-scripts.sh
