# Build stage for both dev and prod
FROM node:20-slim as base
WORKDIR /app
RUN corepack enable

# Development stage
FROM base-dev-deps as dev
COPY . .
EXPOSE 3003
CMD ["pnpm", "dotenvx", "run", "-f", "apps/api-server/.env-admin.development", "--", "moon", "run", "repro/api-server:dev-admin"]

# Production build stage
FROM base-prod-deps as build
COPY . .
RUN pnpm dotenvx run -f apps/api-server/.env-admin.production -- moon run repro/api-server:build-admin

# Production serve stage
FROM node:20-slim as prod
WORKDIR /app
COPY --from=build /app/apps/api-server/dist ./dist
EXPOSE 3003
CMD ["node", "dist/admin.js"] 
