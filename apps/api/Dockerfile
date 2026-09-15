# SPDX-FileCopyrightText: © 2026 Sillon contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @sillon/api --workspace @sillon/core --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/api apps/api
RUN npm run build -w @sillon/core && npm run build -w @sillon/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/core/package.json packages/core/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/prisma apps/api/prisma
WORKDIR /app/apps/api
EXPOSE 3000
# Les migrations sont appliquées au démarrage : un déploiement suffit à mettre la base à jour.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
