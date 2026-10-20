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
MEDIA_DIR := apps/media/backend
MEDIA_VENV := $(MEDIA_DIR)/.venv
MEDIA_PORT ?= 8091
SITE_FLASK_DIR := apps/site/flask
SITE_VENV := $(SITE_FLASK_DIR)/.venv
SITE_FRONTEND_DIR := apps/site
# WEB_HOST 0.0.0.0 exposes the dev UI on your LAN (SEC-011); API stays on API_HOST by default.
WEB_HOST ?= 0.0.0.0
WEB_PORT ?= 4200

.PHONY: help install install-backend install-frontend dev backend frontend \
        travel-install travel-dev travel-test media-install media-dev media-test site-install site-test \
        test test-backend test-frontend test-fast test-finance test-security test-full test-doc-paths test-shared-boundaries \
        test-site-frontend test-release-manifest test-release-cache test-suite-routes \
        build-site-frontend build build-frontend clean reset-db check \
        docker-up docker-down docker-build docker-rebuild docker-logs docker-ps docker-config reset-docker-db

help:
	@echo "Finance Tracker"
	@echo ""
	@echo "  make install          Install Finance, Travel, site backend + frontend dependencies"
	@echo "  make dev              Finance API + UI + Media. LOCAL_DEV_AUTH=1 skips local login."
	@echo "  make backend          API only  → http://$(API_HOST):$(API_PORT)"
	@echo "  make frontend         UI only   → http://localhost:$(WEB_PORT) (proxy → API)"
	@echo "  make test             Backend + frontend unit tests"
	@echo "  make test-fast        Doc path and shared-boundary checks"
	@echo "  make test-finance     Finance invariants + migration matrix"
	@echo "  make test-security    Vault/auth/openapi + client-finance/evidence-label specs"
	@echo "  make test-full        All app tests + builds + Docker and suite-route checks"
	@echo "  make test-release-manifest  Finance release manifest fixtures"
	@echo "  make test-release-cache     Finance Nginx/browser cache rollover (Docker + Chromium)"
	@echo "  make test-suite-routes      Suite Nginx route integration (Docker)"
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
	@echo "  make media-install    Python venv for the private media journal"
	@echo "  make media-dev        Media UI at / on :$(MEDIA_PORT). Shared sign-in is the suite at /media/."
	@echo "  make media-test       Media pytest"
	@echo "  make site-install     Python venv for site Flask Socket.IO backend"
	@echo "  make site-test        Site Flask/Socket.IO pytest suite"
	@echo "  make test-site-frontend Site Angular unit tests"
	@echo "  make build-site-frontend Site Angular development build"
	@echo ""
	@echo "First time: make install && make dev"
	@echo "Open: http://127.0.0.1:$(WEB_PORT)/hub"
	@echo "Real login: make dev LOCAL_DEV_AUTH=0"

install: install-backend travel-install media-install site-install install-frontend
	@echo "Install complete."

install-backend:
	@test -d $(VENV) || python3 -m venv $(VENV)
	$(PIP) install -q -U pip
	$(PIP) install -r $(BACKEND_DIR)/requirements.txt
	@echo "Backend venv: $(VENV)"

install-frontend:
	cd $(FRONTEND_DIR) && npm install
	cd $(SITE_FRONTEND_DIR) && npm install
	@echo "Frontend deps: $(FRONTEND_DIR)/node_modules and $(SITE_FRONTEND_DIR)/node_modules"

# Finance API, Finance UI, and Media. Ctrl+C stops all of them.
# LOCAL_DEV_AUTH defaults on for this target only. The API still ignores it unless the
# request host is loopback or apps/finance/backend/.env.development enables it.
# The repo .env is the Docker/production file (Secure cookies, DATABASE_URL under /data).
# This target pins a local http session and the backend finance.db unless overridden.
dev:
	@echo "Starting Finance API (:$(API_PORT)), Finance UI (:$(WEB_PORT)), and Media (:$(MEDIA_PORT))…"
	@echo "LOCAL_DEV_AUTH=$(if $(LOCAL_DEV_AUTH),$(LOCAL_DEV_AUTH),1)"
	@echo "Hub:     http://127.0.0.1:$(WEB_PORT)/hub"
	@echo "Finance: http://127.0.0.1:$(WEB_PORT)/"
	@echo "Media:   http://127.0.0.1:$(MEDIA_PORT)/"
	@echo "API:     http://127.0.0.1:$(API_PORT)/docs"
	@echo "(Restart required after proxy.conf.js changes.)"
	@trap 'kill 0' EXIT INT TERM; \
	LOCAL_DEV_AUTH="$(if $(LOCAL_DEV_AUTH),$(LOCAL_DEV_AUTH),1)" \
	DATABASE_URL="$(if $(DATABASE_URL),$(DATABASE_URL),sqlite:///./finance.db)" \
	SESSION_COOKIE_SECURE="$(if $(SESSION_COOKIE_SECURE),$(SESSION_COOKIE_SECURE),0)" \
	SESSION_COOKIE_SAMESITE="$(if $(SESSION_COOKIE_SAMESITE),$(SESSION_COOKIE_SAMESITE),lax)" \
	$(MAKE) backend & \
	API_PROXY_TARGET="http://127.0.0.1:$(API_PORT)" \
	MEDIA_PROXY_TARGET="http://127.0.0.1:$(MEDIA_PORT)" \
	$(MAKE) frontend & \
	FINANCE_API_URL="http://127.0.0.1:$(API_PORT)" \
	$(MAKE) media-dev & \
	wait

backend:
	@if [ -x $(PY) ]; then \
		cd $(BACKEND_DIR) && .venv/bin/python -m uvicorn main:app --reload --host $(API_HOST) --port $(API_PORT); \
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

test-shared-boundaries:
	python3 ./scripts/check-shared-boundaries.py

test-fast: test-doc-paths test-shared-boundaries

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

test-full: test-fast test-backend travel-test media-test site-test test-frontend test-site-frontend \
	test-release-manifest build-frontend build-site-frontend docker-build
	$(MAKE) test-suite-routes
	@echo "test-full OK"

build: build-frontend

build-frontend:
	cd $(FRONTEND_DIR) && npm run build

test-site-frontend:
	@if [ "$(SKIP_FRONTEND_TESTS)" = "1" ]; then \
		echo "Skipping site frontend tests because SKIP_FRONTEND_TESTS=1"; \
	else \
		cd $(SITE_FRONTEND_DIR) && npm test -- --watch=false --browsers=ChromeHeadless; \
	fi

build-site-frontend:
	cd $(SITE_FRONTEND_DIR) && npx ng build --configuration development

test-release-manifest:
	cd $(FRONTEND_DIR) && npm run test:release-manifest

# Requires Docker and a Playwright Chromium installation; intentionally excluded from test-full/CI.
test-release-cache:
	cd $(FRONTEND_DIR) && npm run test:release-cache

test-suite-routes:
	node apps/finance/frontend/scripts/test-suite-routes.mjs

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
	node --test apps/travel/backend/static/tests/*.test.mjs

media-install:
	@test -d $(MEDIA_VENV) || python3 -m venv $(MEDIA_VENV)
	$(MEDIA_VENV)/bin/pip install -q -U pip
	$(MEDIA_VENV)/bin/pip install -q -r $(MEDIA_DIR)/requirements-dev.txt
	@echo "Media venv: $(MEDIA_VENV)"

media-dev:
	@test -x $(MEDIA_VENV)/bin/uvicorn || (echo "Run: make media-install" && exit 1)
	cd $(MEDIA_DIR) && .venv/bin/uvicorn main:app --host $(TRAVEL_HOST) --port $(MEDIA_PORT)

media-test:
	@test -x $(MEDIA_VENV)/bin/python || (echo "Run: make media-install" && exit 1)
	cd $(MEDIA_DIR) && .venv/bin/python -m pytest -q
	node --test apps/media/backend/static/tests/*.test.mjs

site-install:
	@test -d $(SITE_VENV) || python3 -m venv $(SITE_VENV)
	$(SITE_VENV)/bin/pip install -q -U pip
	$(SITE_VENV)/bin/pip install -q -r $(SITE_FLASK_DIR)/requirements-dev.txt
	@echo "Site Flask venv: $(SITE_VENV)"

site-test:
	@test -x $(SITE_VENV)/bin/python || (echo "Run: make site-install" && exit 1)
	cd $(SITE_FLASK_DIR) && .venv/bin/python -m pytest -q
