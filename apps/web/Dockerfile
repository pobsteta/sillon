# SPDX-FileCopyrightText: © 2026 Sillon contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @sillon/web --workspace @sillon/core --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/web apps/web
RUN npm run build -w @sillon/core && npm run build -w @sillon/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
