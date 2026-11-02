FROM docker.1ms.run/library/node:24.21.0-bookworm-slim AS dependencies
WORKDIR /app
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
RUN npm install --global pnpm@10.30.3
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS production-dependencies
RUN pnpm prune --prod

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM docker.1ms.run/library/node:24.21.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3030 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# The same image runs Web, the shared worker, or an explicit migration command.
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/scripts/migrate.ts ./scripts/migrate.ts
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/tsconfig.json ./tsconfig.json
USER node
EXPOSE 3030
CMD ["node", "server.js"]
