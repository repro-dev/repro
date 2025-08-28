# Development
FROM repro-base AS dev
EXPOSE 8080
CMD ["pnpm", "moon", "run", "repro/workspace:dev-serve"]

# Production
FROM repro-base AS prod
EXPOSE 8080
CMD ["pnpm", "dotenvx", "run", "-f", "apps/workspace/.env.production", "--", "moon", "run", "repro/workspace:serve"]
