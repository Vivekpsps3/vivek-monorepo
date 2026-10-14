# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY --from=packages . /packages
COPY . .
# The image is the suite host. Local `npm run build` and `ng serve` stay at /.
RUN npx ng build --configuration production --base-href /finance/ && node scripts/write-release-manifest.mjs

FROM nginx:1.27-alpine

COPY nginx.suite.conf /etc/nginx/conf.d/default.conf
COPY suite-index.html /usr/share/nginx/html/index.html
COPY --from=build /app/dist/finance-app/browser /usr/share/nginx/html/finance

EXPOSE 80
