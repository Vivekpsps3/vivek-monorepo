# Finance Tracker — local development
# Usage: make help | make install | make dev

SHELL := /bin/bash
BACKEND_DIR := apps/finance/backend
FRONTEND_DIR := apps/finance/frontend
VENV := $(BACKEND_DIR)/.venv
PY := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
UVICORN := $(VENV)/bin/uvicorn

API_HOST ?= 127.0.0.1
API_PORT ?= 8000
TRAVEL_DIR := apps/travel/backend
TRAVEL_VENV := $(TRAVEL_DIR)/.venv
TRAVEL_HOST ?= 0.0.0.0
TRAVEL_PORT ?= 8090
# WEB_HOST 0.0.0.0 exposes the dev UI on your LAN (SEC-011); API stays on API_HOST by default.
WEB_HOST ?= 0.0.0.0
WEB_PORT ?= 4200

.PHONY: help install install-backend install-frontend dev backend frontend \
        travel-install travel-dev travel-test \
        test test-backend test-frontend test-fast test-finance test-security test-full test-doc-paths \
        build build-frontend clean reset-db check \
        docker-up docker-down docker-build docker-rebuild docker-logs docker-ps docker-config reset-docker-db

help:
	@echo "Finance Tracker"
	@echo ""
	@echo "  make install          Create venv, pip + npm dependencies"
	@echo "  make dev              Run API + Angular dev server (parallel)"
	@echo "  make backend          API only  → http://$(API_HOST):$(API_PORT)"
	@echo "  make frontend         UI only   → http://localhost:$(WEB_PORT) (proxy → API)"
	@echo "  make test             Backend + frontend unit tests"
	@echo "  make test-fast        Doc path checks (OPS-002)"
	@echo "  make test-finance     Finance invariants + migration matrix"
	@echo "  make test-security    Vault/auth/openapi + client-finance/evidence-label specs"
	@echo "  make test-full        Full unit tests + frontend build + docker build"
	@echo "  make build            Production Angular build"
	@echo "  make docker-up        Build/start suite → http://127.0.0.1:8080/finance/ and /travel/"
	@echo "  make docker-down      Stop Docker stack"
	@echo "  make docker-logs      Follow Docker logs"
	@echo "  make docker-rebuild   Rebuild images without cache and start"
	@echo "  make clean            Remove caches, dist, __pycache__, *.bak"
	@echo "  make reset-db         Delete backend/finance.db (fresh schema on next API start)"
	@echo "  make reset-docker-db  Delete data/finance.db for Docker stack"
	@echo ""
	@echo "Travel (suite path /travel/, same finance session cookie):"
	@echo "  make travel-install   Python venv for apps/travel"
	@echo "  make travel-dev       Direct UI at / on :$(TRAVEL_PORT). Shared sign-in is the suite at /travel/."
	@echo "  make travel-test      Travel pytest"
	@echo ""
	@echo "First time: make install && make dev"
	@echo "Open: http://localhost:$(WEB_PORT)"

install: install-backend install-frontend
	@echo "Install complete."

install-backend:
	@test -d $(VENV) || python3 -m venv $(VENV)
	$(PIP) install -q -U pip
	$(PIP) install -r $(BACKEND_DIR)/requirements.txt
	@echo "Backend venv: $(VENV)"

install-frontend:
	cd $(FRONTEND_DIR) && npm install
	@echo "Frontend deps: $(FRONTEND_DIR)/node_modules"

# Run both; Ctrl+C stops both job groups
dev:
	@echo "Starting backend (:$(API_PORT)) and frontend (:$(WEB_PORT))…"
	@echo "(Restart required after proxy.conf.js changes.)"
	@trap 'kill 0' EXIT INT TERM; \
	$(MAKE) backend & \
	$(MAKE) frontend & \
	wait

backend:
	@if [ -x $(UVICORN) ]; then \
		cd $(BACKEND_DIR) && .venv/bin/uvicorn main:app --reload --host $(API_HOST) --port $(API_PORT); \
	elif command -v uvicorn >/dev/null 2>&1; then \
		cd $(BACKEND_DIR) && uvicorn main:app --reload --host $(API_HOST) --port $(API_PORT); \
	else echo "Run: make install-backend"; exit 1; fi

frontend:
	@test -d $(FRONTEND_DIR)/node_modules || (echo "Run: make install-frontend" && exit 1)
	cd $(FRONTEND_DIR) && npx ng serve --configuration development --host $(WEB_HOST) --port $(WEB_PORT)

test: test-backend test-frontend

test-backend:
	@if [ -x $(PY) ]; then cd $(BACKEND_DIR) && .venv/bin/python -m pytest -q; \
	else cd $(BACKEND_DIR) && python3 -m pytest -q; fi

test-frontend:
	@if [ "$(SKIP_FRONTEND_TESTS)" = "1" ]; then \
		echo "Skipping frontend tests because SKIP_FRONTEND_TESTS=1"; \
	else \
		cd $(FRONTEND_DIR) && npm test -- --watch=false --browsers=ChromeHeadless; \
	fi

test-doc-paths:
	./scripts/check-doc-paths.sh

test-fast: test-doc-paths

test-finance:
	@if [ -x $(PY) ]; then \
		cd $(BACKEND_DIR) && .venv/bin/python -m pytest -q tests/test_migrations.py; \
	else \
		cd $(BACKEND_DIR) && python3 -m pytest -q tests/test_migrations.py; \
	fi
	@if [ "$(SKIP_FRONTEND_TESTS)" = "1" ]; then echo "Skipping frontend finance tests"; \
	else cd $(FRONTEND_DIR) && npx ng test --no-watch --browsers=ChromeHeadless \
		--include='**/client-finance.spec.ts' --include='**/planning.service.spec.ts' --include='**/format.util.spec.ts'; fi

test-security:
	@if [ -x $(PY) ]; then \
		cd $(BACKEND_DIR) && .venv/bin/python -m pytest -q tests/test_vault_encryption.py tests/test_openapi.py tests/test_auth_challenge.py tests/test_api_auth.py; \
	else \
		cd $(BACKEND_DIR) && python3 -m pytest -q tests/test_vault_encryption.py tests/test_openapi.py tests/test_auth_challenge.py tests/test_api_auth.py; \
	fi
	@if [ "$(SKIP_FRONTEND_TESTS)" = "1" ]; then echo "Skipping frontend security tests"; \
	else cd $(FRONTEND_DIR) && npx ng test --no-watch --browsers=ChromeHeadless \
		--include='**/client-finance.spec.ts' \
		--include='**/evidence-labels.util.spec.ts'; fi

test-full: test-fast test-backend test-frontend build-frontend docker-build
	@echo "test-full OK"

build: build-frontend

build-frontend:
	cd $(FRONTEND_DIR) && npm run build

docker-up:
	docker compose up --build

docker-down:
	docker compose down

docker-build:
	docker compose build

docker-rebuild:
	docker compose build --no-cache
	docker compose up

docker-logs:
	docker compose logs -f

docker-ps:
	docker compose ps

docker-config:
	docker compose config

reset-db:
	rm -f $(BACKEND_DIR)/finance.db $(BACKEND_DIR)/finance.db-journal \
		$(BACKEND_DIR)/finance.db-wal $(BACKEND_DIR)/finance.db-shm
	@echo "Removed $(BACKEND_DIR)/finance.db. Restart the API to recreate an empty database."

reset-docker-db:
	rm -f data/finance.db data/finance.db-journal data/finance.db-wal data/finance.db-shm
	@echo "Removed data/finance.db. Restart Docker stack to recreate an empty database."

clean:
	find $(BACKEND_DIR) -type d -name '__pycache__' -prune -exec rm -rf {} +
	rm -rf .pytest_cache \
		$(BACKEND_DIR)/.pytest_cache \
		$(FRONTEND_DIR)/dist \
		$(FRONTEND_DIR)/.angular/cache \
		$(FRONTEND_DIR)/coverage \
		$(FRONTEND_DIR)/playwright-report \
		$(FRONTEND_DIR)/test-results
	@echo "Cleaned build artifacts and caches (kept finance.db and node_modules)."

check: test-backend test-frontend build-frontend
	@echo "check OK"

travel-install:
	@test -d $(TRAVEL_VENV) || python3 -m venv $(TRAVEL_VENV)
	$(TRAVEL_VENV)/bin/pip install -q -U pip
	$(TRAVEL_VENV)/bin/pip install -q -r $(TRAVEL_DIR)/requirements-dev.txt
	@echo "Travel venv: $(TRAVEL_VENV)"

travel-dev:
	@test -x $(TRAVEL_VENV)/bin/uvicorn || (echo "Run: make travel-install" && exit 1)
	cd $(TRAVEL_DIR) && .venv/bin/uvicorn main:app --host $(TRAVEL_HOST) --port $(TRAVEL_PORT)

travel-test:
	@test -x $(TRAVEL_VENV)/bin/python || (echo "Run: make travel-install" && exit 1)
	cd $(TRAVEL_DIR) && .venv/bin/python -m pytest -q
