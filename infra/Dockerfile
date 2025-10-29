FROM node:22-slim AS base
WORKDIR /app

RUN npm add --global @moonrepo/cli

FROM base as scaffold

COPY . .
RUN moon docker scaffold \
  repro/api-server \
  repro/workspace \
  repro/admin

FROM base AS prepare

COPY --from=scaffold /app/.moon/docker/workspace .
COPY --from=scaffold /app/patches ./patches
RUN moon docker setup

COPY --from=scaffold  /app/.moon/docker/sources .
RUN moon run :build

FROM prepare AS api-server-dev
CMD ["moon", "run", "repro/api-server:dev"]

FROM prepare AS api-server-prod
CMD ["moon", "run", "repro/api-server:serve"]

FROM prepare AS workspace-dev
CMD ["moon", "run", "repro/workspace:dev"]

FROM prepare AS admin-dev
CMD ["moon", "run", "repro/admin:dev"]
