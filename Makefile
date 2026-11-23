.DEFAULT_GOAL := help

.PHONY: help doctor setup up down restart logs shell check status ai lint test test-windows verify verify-fast gluetun-patch

help: ## Exibe os comandos disponíveis
	@echo "VPN Dev Workspace - Comandos Rápidos:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
	@echo ""

doctor: ## Diagnostica o ambiente, VPN e credenciais
	@./scripts/vpn-doctor

setup: ## Assistente interativo de configuração inicial
	@./scripts/vpn-setup

up: ## Sobe a stack de containers (VPN_PROFILE=<perfil> ou último perfil ativo)
	@profile="$(VPN_PROFILE)"; if [ -z "$$profile" ] && [ -r .vpn-control-state/active-profile ]; then profile="$$(cat .vpn-control-state/active-profile)"; fi; test -n "$$profile" || { echo "Defina VPN_PROFILE=<perfil>." >&2; exit 2; }; ./scripts/vpn-switch "$$profile"

down: ## Encerra a stack de containers
	@./scripts/vpn-switch down

restart: ## Reinicia todos os containers da stack
	@profile="$(VPN_PROFILE)"; test -n "$$profile" || { echo "Defina VPN_PROFILE=<perfil>." >&2; exit 2; }; ./scripts/vpn-switch "$$profile"

logs: ## Exibe os logs da stack em tempo real
	docker compose --profile vpn --profile opencode logs -f

shell: ## Abre sessão zsh interativa no container terminal (DIR=/caminho)
	@if [ -n "$(DIR)" ]; then ./scripts/vpn-shell --workdir "$(DIR)"; else ./scripts/vpn-shell; fi

check: ## Verifica conectividade e IP público via VPN
	@./scripts/vpn-check

status: ## Mostra perfil e IP público da VPN
	@./scripts/vpn-status

ai: ## Abre o OpenCode dentro da VPN (MODE=1|2 ARGS="--yolo")
	@mode="$(MODE)"; case "$$mode" in 1|2) ;; *) mode=2 ;; esac; ./scripts/opencode$$mode $(ARGS)

lint: ## Lint local: sintaxe de scripts e ShellCheck
	@./scripts/vpn-lint

test: ## Executa a suíte de testes automatizados (Linux)
	@./tests/linux/test-scripts.sh

test-windows: ## Executa a suíte Pester da interface Windows (requer pwsh + Pester 5+)
	@pwsh -NoProfile -Command "Invoke-Pester -Path tests/windows -CI"

gluetun-patch: ## Confere se os patches do Gluetun aplicam no upstream correspondente
	@./scripts/verify-gluetun-patch --tag v3.41.3 --patch gluetun/publicip-recovery.patch
	@./scripts/verify-gluetun-patch --tag v3.41.4-rc2 --patch gluetun/publicip-recovery-rc2.patch

verify-fast: ## Executa as verificações sem build das imagens Docker
	@./scripts/verify-syntax
	@./scripts/verify-compose
	@./scripts/verify-docs
	@./tests/linux/test-scripts.sh
	@node --test tests/opencode/*.test.mjs tests/control/*.test.cjs

verify: ## Executa todas as verificações do repositório (compose, docs e testes)
	@./scripts/verify-syntax
	@./scripts/verify-compose
	@./scripts/verify-docs
	@./tests/linux/test-scripts.sh
	@node --test tests/opencode/*.test.mjs tests/control/*.test.cjs
	@docker build --pull=true .
	@docker build --pull=true ./gluetun
