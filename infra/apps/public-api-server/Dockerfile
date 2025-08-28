# Development
FROM repro-base AS dev
EXPOSE 8080
CMD ["pnpm", "dotenvx", "run", "-f", "apps/api-server/.env-public.development", "--", "moon", "run", "repro/api-server:dev-watch:public"]

# Production
FROM repro-base AS prod
EXPOSE 8080
CMD ["pnpm", "dotenvx", "run", "-f", "apps/api-server/.env-public.production", "--", "moon", "run", "repro/api-server:start:public"]
