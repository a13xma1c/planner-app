# Developer entry points. Requires: uv (https://docs.astral.sh/uv/), Node 20+.
.DEFAULT_GOAL := help
SHELL := /bin/bash

BACKEND := backend
FRONTEND := frontend

.PHONY: help install dev backend frontend build serve test test-backend test-frontend test-e2e lint format typecheck clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Install backend (uv) and frontend (npm) dependencies
	cd $(BACKEND) && uv sync --extra dev
	cd $(FRONTEND) && npm ci

dev: ## Run backend (:8000) and frontend dev server (:5173) together
	@trap 'kill 0' INT TERM; \
	(cd $(BACKEND) && uv run planner serve --reload) & \
	(cd $(FRONTEND) && npm run dev) & \
	wait

backend: ## Run the API only (with auto-reload)
	cd $(BACKEND) && uv run planner serve --reload

frontend: ## Run the Vite dev server only
	cd $(FRONTEND) && npm run dev

build: ## Production build of the frontend (served by the backend)
	cd $(FRONTEND) && npm run build

serve: build ## Build the frontend and serve the whole app from the backend on :8000
	cd $(BACKEND) && uv run planner serve

test: test-backend test-frontend ## Run backend + frontend unit/integration tests

test-backend: ## Backend tests with coverage
	cd $(BACKEND) && uv run pytest -n auto --cov --cov-report=term-missing

test-frontend: ## Frontend unit/component tests
	cd $(FRONTEND) && npm test

test-e2e: ## Browser end-to-end tests (builds the frontend, starts the backend)
	cd $(FRONTEND) && npx playwright install --with-deps chromium && npm run test:e2e

lint: ## Lint everything (ruff, mypy, oxlint, prettier)
	cd $(BACKEND) && uv run ruff check . && uv run ruff format --check . && uv run mypy planner
	cd $(FRONTEND) && npm run lint && npm run typecheck

format: ## Auto-format everything
	cd $(BACKEND) && uv run ruff check --fix . && uv run ruff format .
	cd $(FRONTEND) && npm run format

typecheck: ## Type-check backend (mypy) and frontend (tsc)
	cd $(BACKEND) && uv run mypy planner
	cd $(FRONTEND) && npm run typecheck

clean: ## Remove build artefacts and caches
	rm -rf $(FRONTEND)/dist $(FRONTEND)/coverage $(FRONTEND)/playwright-report $(FRONTEND)/test-results
	find . -name __pycache__ -type d -prune -exec rm -rf {} + 2>/dev/null || true
	rm -rf $(BACKEND)/.pytest_cache $(BACKEND)/.mypy_cache $(BACKEND)/.ruff_cache $(BACKEND)/.coverage

password-list: ## Regenerate the frontend copy of the common-password blocklist from the backend file
	python3 scripts/sync_password_list.py
