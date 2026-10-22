SHELL := /bin/bash
PY := $(CURDIR)/.venv/bin/python
SITE_IMAGE ?= personal-site:development
SITE_RELEASE ?= $(shell git rev-parse HEAD)
DEV_DATA := $(CURDIR)/.local/data
FINANCE_WEB := $(CURDIR)/apps/finance/frontend/dist/finance-app/browser
PORTFOLIO_WEB := $(CURDIR)/apps/site/dist/personal-website/browser
export PYTHONPATH := $(CURDIR)

.PHONY: help install init-db dev build build-frontends test test-fast test-backend test-frontend test-suite-routes docker-build docker-up docker-down
help:
	@echo 'One site, one SQLite database. See docs/OPERATIONS.md.'
	@echo 'make install; make build-frontends; make dev'
	@echo 'make test; make docker-build; make test-suite-routes'

install:
	python3 -m venv .venv
	$(PY) -m pip install --require-hashes -r apps/server/requirements.lock
	$(PY) -m pip install pytest
	npm ci --prefix apps/finance/frontend
	npm ci --prefix apps/site

init-db:
	@mkdir -p $(DEV_DATA)
	@test -f $(DEV_DATA)/site.db || $(PY) -m apps.server.migrate --output $(DEV_DATA)/site.db

dev: init-db
	SITE_DATABASE_URL=sqlite:///$(DEV_DATA)/site.db SITE_WEB_ROOT=$(FINANCE_WEB) SITE_PORTFOLIO_ROOT=$(PORTFOLIO_WEB) SESSION_COOKIE_SECURE=0 $(PY) -m uvicorn apps.server.main:app --host 127.0.0.1 --port 8000 --reload

build: build-frontends
build-frontends:
	cd apps/finance/frontend && npx ng build --configuration production --base-href /finance/ && node scripts/write-release-manifest.mjs
	cd apps/site && npx ng build --configuration production

test-fast:
	./scripts/check-doc-paths.sh
	python3 scripts/check-shared-boundaries.py

test-backend:
	$(PY) -m pytest -q apps/finance/backend/tests
	$(PY) -m pytest -q apps/travel/backend/tests
	$(PY) -m pytest -q apps/media/backend/tests
	$(PY) -m pytest -q apps/server/tests

test-frontend:
	npm test --prefix apps/finance/frontend -- --watch=false --browsers=ChromeHeadless
	npm test --prefix apps/site -- --watch=false --browsers=ChromeHeadless

test: test-fast test-backend test-frontend
	node --test apps/travel/backend/static/tests/*.test.mjs apps/media/backend/static/tests/*.test.mjs

test-suite-routes:
	docker run --rm --network none --read-only --tmpfs /tmp:rw,size=128m,mode=1777 $(SITE_IMAGE) python -m apps.server.checks

docker-build:
	docker build --build-arg SITE_RELEASE=$(SITE_RELEASE) -t $(SITE_IMAGE) .

docker-up: init-db
	docker network inspect monitoring >/dev/null 2>&1 || docker network create monitoring
	SITE_PORT=8086 SITE_SUBNET=172.30.86.0/28 SESSION_COOKIE_SECURE=0 docker compose -p personal-site-dev build site
	docker compose -p personal-site-dev --profile ops run --rm backup python -m apps.server.migrate --output /data/site.db --if-missing
	SITE_PORT=8086 SITE_SUBNET=172.30.86.0/28 SESSION_COOKIE_SECURE=0 docker compose -p personal-site-dev up -d site

docker-down:
	docker compose -p personal-site-dev down
