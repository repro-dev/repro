# Build stage for both dev and prod
FROM node:20-slim as base
WORKDIR /app
RUN corepack enable

# Development stage
FROM base-dev-deps as dev
COPY . .
EXPOSE 3000
CMD ["pnpm", "dotenvx", "run", "-f", "apps/admin/.env.development", "--", "moon", "run", "repro/admin:dev-serve"]

# Production build stage
FROM base-prod-deps as build
COPY . .
RUN pnpm dotenvx run -f apps/admin/.env.production -- moon run repro/admin:build

# Production serve stage
FROM nginx:alpine as prod
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"] 
