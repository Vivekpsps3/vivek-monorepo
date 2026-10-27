# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS web
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY angular.json tsconfig.json ./
COPY packages ./packages
COPY apps/web ./apps/web
COPY apps/site/src ./apps/site/src
COPY apps/site/public ./apps/site/public
COPY apps/finance/frontend/src ./apps/finance/frontend/src
COPY apps/finance/frontend/public ./apps/finance/frontend/public
COPY apps/travel/frontend ./apps/travel/frontend
COPY apps/media/frontend ./apps/media/frontend
COPY scripts/write-release-manifest.mjs ./scripts/write-release-manifest.mjs
RUN npm run build && node scripts/write-release-manifest.mjs

FROM python:3.12-slim@sha256:cb33f7f771ecec2ef1225cf39b159591a040391bd73e4c01f00fdfc4c47611d2 AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY apps/server/requirements.lock /tmp/requirements.lock
RUN pip install --no-cache-dir --require-hashes -r /tmp/requirements.lock \
 && groupadd --gid 10001 site && useradd --uid 10001 --gid site --no-create-home site \
 && install -d -o 10001 -g 10001 -m 700 /data /backups
COPY apps/finance/backend /app/apps/finance/backend
COPY apps/travel/backend /app/apps/travel/backend
COPY apps/media/backend /app/apps/media/backend
COPY apps/server /app/apps/server
COPY scripts/backup-site.py /app/backup-site.py
COPY compose.yml /app/compose.yml
COPY packages/time /app/packages/time
COPY apps/web/routes.json /app/apps/web/routes.json
COPY --from=web /src/dist/web/browser /app/web
ARG SITE_RELEASE=development
ENV SITE_RELEASE=$SITE_RELEASE
LABEL org.opencontainers.image.revision=$SITE_RELEASE
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "apps.server.main:production_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
