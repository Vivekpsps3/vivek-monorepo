SHELL := /bin/bash
SITE_IMAGE ?= personal-site:development
SITE_RELEASE ?= $(shell git rev-parse HEAD)
DEV_DATA := $(CURDIR)/.local/data
FINANCE_WEB := $(CURDIR)/apps/finance/frontend/dist/finance-app/browser
PORTFOLIO_WEB := $(CURDIR)/apps/site/dist/personal-website/browser
export PYTHONPATH := $(CURDIR)

.PHONY: help install init-db dev build build-frontends test test-fast test-backend test-frontend test-suite-routes docker-build docker-up docker-down lint lint-python lint-web typecheck typecheck-python typecheck-web e2e lint-baseline coverage-pin db-upgrade db-revision db-check db-seed-dev db-validate-seeded
PYTHON ?= python3
PY := $(CURDIR)/.venv/bin/python
help:
	@echo 'One site, one SQLite database. See docs/OPERATIONS.md and docs/MIGRATIONS.md.'
	@echo 'make install; make build-frontends; make dev'
	@echo 'make test; make lint; make typecheck; make e2e'
	@echo 'make docker-build; make test-suite-routes'
	@echo 'make db-revision MESSAGE="describe the change"; make db-upgrade; make db-check'
	@echo 'make db-seed-dev; make db-validate-seeded'
	@echo 'Quality gates: docs/QUALITY.md'

install:
	python3 -m venv .venv
	$(PY) -m pip install --require-hashes -r apps/server/requirements.lock
	$(PY) -m pip install --require-hashes -r requirements-dev.txt
	npm ci --prefix apps/finance/frontend
	npm ci --prefix apps/site

init-db:
	@mkdir -p $(DEV_DATA)
	SITE_DATABASE_URL=sqlite:///$(DEV_DATA)/site.db $(PY) -m apps.server.migrations

db-upgrade: init-db

db-revision:
	@test -n "$(MESSAGE)" || { echo 'Usage: make db-revision MESSAGE="describe the change"' >&2; exit 1; }
	@mkdir -p $(DEV_DATA)
	SITE_DATABASE_URL=sqlite:///$(DEV_DATA)/site.db $(PY) -m apps.server.migrations revision --autogenerate -m "$(MESSAGE)"

db-check:
	$(PY) -m apps.server.migrations --check

db-seed-dev:
	$(PY) scripts/seed_dev_db.py --ensure-dev

db-validate-seeded:
	bash scripts/validate-seeded-adoption.sh

dev: init-db
	SITE_DATABASE_URL=sqlite:///$(DEV_DATA)/site.db SITE_WEB_ROOT=$(FINANCE_WEB) SITE_PORTFOLIO_ROOT=$(PORTFOLIO_WEB) SESSION_COOKIE_SECURE=0 $(PY) -m uvicorn apps.server.main:app --host 127.0.0.1 --port 8000 --reload

build: build-frontends
build-frontends:
	cd apps/finance/frontend && npx ng build --configuration production --base-href /finance/ && node scripts/write-release-manifest.mjs
	cd apps/site && npx ng build --configuration production

test-fast:
	./scripts/check-doc-paths.sh
	./scripts/check-blame-ignore-revs.sh
	python3 scripts/check-shared-boundaries.py
	python3 scripts/check-finance-ux-f1.py
	python3 -m unittest scripts/test_quality_ratchet.py
	node --test scripts/serve-spa.test.mjs

test-backend:
	./scripts/coverage-gate.sh finance
	./scripts/coverage-gate.sh travel
	./scripts/coverage-gate.sh media
	./scripts/coverage-gate.sh server

test-frontend:
	npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadlessCI
	npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadlessCI

lint: lint-python lint-web

lint-python:
	@py='$(PY)'; [ -x "$$py" ] || py='$(PYTHON)'; \
	 "$$py" -m ruff format --check apps scripts && \
	 "$$py" scripts/quality_ratchet.py check ruff && \
	 "$$py" scripts/quality_ratchet.py check suppressions

lint-web:
	$(PYTHON) scripts/quality_ratchet.py check eslint-finance
	$(PYTHON) scripts/quality_ratchet.py check eslint-site
	$(PYTHON) scripts/quality_ratchet.py check eslint-packages

typecheck: typecheck-python typecheck-web

typecheck-python:
	@py='$(PY)'; [ -x "$$py" ] || py='$(PYTHON)'; \
	 "$$py" scripts/quality_ratchet.py check mypy

typecheck-web:
	npx --prefix apps/finance/frontend tsc -p apps/finance/frontend/tsconfig.app.json --noEmit --pretty false
	npx --prefix apps/finance/frontend tsc -p apps/finance/frontend/tsconfig.spec.json --noEmit --pretty false
	npx --prefix apps/finance/frontend tsc -p packages/tsconfig.json --noEmit --pretty false
	npx --prefix apps/site tsc -p apps/site/tsconfig.app.json --noEmit --pretty false
	npx --prefix apps/site tsc -p apps/site/tsconfig.spec.json --noEmit --pretty false

e2e:
	cd apps/finance/frontend && npx ng build --configuration production --base-href /finance/ && node scripts/write-release-manifest.mjs
	cd apps/finance/frontend && E2E_DIST=dist/finance-app/browser npx playwright test

lint-baseline:
	@py='$(PY)'; [ -x "$$py" ] || py='$(PYTHON)'; \
	 "$$py" scripts/quality_ratchet.py update ruff && \
	 "$$py" scripts/quality_ratchet.py update mypy && \
	 $(PYTHON) scripts/quality_ratchet.py update eslint-finance && \
	 $(PYTHON) scripts/quality_ratchet.py update eslint-site && \
	 $(PYTHON) scripts/quality_ratchet.py update eslint-packages && \
	 $(PYTHON) scripts/quality_ratchet.py update suppressions

coverage-pin:
	./scripts/coverage-pin.sh

test: test-fast test-backend test-frontend
	node --test apps/travel/backend/static/tests/*.test.mjs apps/media/backend/static/tests/*.test.mjs packages/browser/runtime/*.test.mjs packages/ui/*.test.mjs

test-suite-routes:
	docker run --rm --network none --read-only --tmpfs /tmp:rw,size=128m,mode=1777 $(SITE_IMAGE) python -m apps.server.checks

docker-build:
	docker build --build-arg SITE_RELEASE=$(SITE_RELEASE) -t $(SITE_IMAGE) .

docker-up: init-db
	docker network inspect monitoring >/dev/null 2>&1 || docker network create monitoring
	SITE_PORT=8086 SITE_SUBNET=10.86.0.0/28 SESSION_COOKIE_SECURE=0 docker compose -p personal-site-dev build site
	docker compose -p personal-site-dev --profile ops run --rm backup python -m apps.server.migrate --output /data/site.db --if-missing
	SITE_PORT=8086 SITE_SUBNET=10.86.0.0/28 SESSION_COOKIE_SECURE=0 docker compose -p personal-site-dev up -d site

docker-down:
	docker compose -p personal-site-dev down
