ARG CONTAINER_REGISTRY_ENDPOINT

# Development
FROM ${CONTAINER_REGISTRY_ENDPOINT}repro-base AS dev
EXPOSE 8080
CMD ["pnpm", "dotenvx", "run", "-f", "apps/api-server/.env.development", "--", "moon", "run", "repro/api-server:dev-watch"]

# Production
FROM ${CONTAINER_REGISTRY_ENDPOINT}repro-base AS prod
EXPOSE 8080
CMD ["pnpm", "dotenvx", "run", "-f", "apps/api-server/.env.production", "--", "moon", "run", "repro/api-server:start"]
