# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS finance
WORKDIR /src/apps/finance/frontend
COPY apps/finance/frontend/package*.json ./
RUN npm ci
COPY packages /src/packages
COPY apps/finance/frontend ./
RUN npx ng build --configuration production --base-href /finance/ && node scripts/write-release-manifest.mjs

FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS portfolio
WORKDIR /src/apps/site
COPY apps/site/package*.json ./
RUN npm ci
COPY packages /src/packages
COPY apps/site ./
RUN npx ng build --configuration production

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
COPY packages/browser/runtime /app/packages/browser/runtime
COPY packages/time /app/packages/time
COPY packages/ui/*.css /app/packages/ui/
COPY --from=finance /src/apps/finance/frontend/dist/finance-app/browser /app/web/finance
COPY --from=portfolio /src/apps/site/dist/personal-website/browser /app/web/portfolio
ARG SITE_RELEASE=development
ENV SITE_RELEASE=$SITE_RELEASE
LABEL org.opencontainers.image.revision=$SITE_RELEASE
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "apps.server.main:app", "--host", "0.0.0.0", "--port", "8000"]
